import { MY_VERIFY_TOKEN, PAGE_ACCESS_TOKEN, GRAPH_API_URL } from "constants/secrets";
import { Request, Response } from "express";
import { chatBotIntroService } from "services/chatbot/chatbot.service";
import { replyForQuery } from "services/chatbot/search-reply.service";
import { resolvePayload } from "services/chatbot/flow.service";
import { keywordStats, matchKeywords } from "services/chatbot/keyword.service";
import { botFlowCount } from "services/chatbot/bot-flow.service";
import { passToHuman, takeBackFromHuman, wantsBotBack } from "services/chatbot/handoff.service";
import type { SenderAction } from "utils/messenger-blocks";

export const testMsg = async (req: Request, res: Response) => {
    const introRes = await chatBotIntroService(req);
    // Surface what the bot can actually answer, so a deploy that lost its rule tables is visible
    // here rather than only when a student taps something.
    return res.send({ ...introRes, flows: { bespoke: await botFlowCount(), ...keywordStats() } });
};

export const getWebhook = (req: Request, res: Response) => {
    let VERIFY_TOKEN = MY_VERIFY_TOKEN;

    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      // Without this a malformed handshake hangs until the client times out.
      res.sendStatus(400);
    }
};

export const postWebhook = async (req: Request, res: Response) => {
    const body = req.body;

    if (body.object === "page") {
        // Acknowledge before doing the work. Meta retries on anything slower than ~20s or
        // non-200, and a slow Send API call would otherwise turn one message into duplicates.
        res.status(200).send("EVENT_RECEIVED");

        for (const entry of body.entry ?? []) {
            // While the Page Inbox holds a thread, this app receives `standby` instead of
            // `messaging` and must not reply — only watch for the user asking for the bot back.
            // Without this the bot appears dead to anyone waiting on a human, with no way out.
            if (entry.standby) {
                for (const standbyEvent of entry.standby) {
                    const psid = standbyEvent.sender?.id;
                    if (!psid) continue;
                    if (wantsBotBack(standbyEvent.message?.text)) {
                        try {
                            await takeBackFromHuman(psid);
                            const welcome = await resolvePayload("GET_STARTED");
                            if (welcome?.length) await sendAll(psid, welcome);
                        } catch (err) {
                            console.error("standby handover failed", err);
                        }
                    }
                }
                continue;
            }

            // Every event, not just messaging[0]. Meta batches events into this array, so reading
            // only the first silently drops the rest — v1 has the same bug at
            // chatbotController.js:1761, which is why bursts of messages go unanswered there.
            for (const webhookEvent of entry.messaging ?? []) {
                const senderPsid = webhookEvent.sender?.id;
                if (!senderPsid) continue;

                try {
                    if (webhookEvent.message) {
                        await handleMessage(senderPsid, webhookEvent.message);
                    } else if (webhookEvent.postback) {
                        await handlePostback(senderPsid, webhookEvent.postback);
                    }
                } catch (err) {
                    // One bad event must not abandon the others in the same batch.
                    console.error("webhook event failed", err);
                }
            }
        }

        return;
    } else {
        res.sendStatus(404);
    }
};

/**
 * A typed message.
 *
 * Order matters and mirrors v1: a quick reply carries a payload and is routed like a postback, then
 * the keyword table gets first refusal on free text, and only then does search run. v1 stops at the
 * keyword table — an unmatched message got a generic suggestion reply — so search is strictly extra.
 */
async function handleMessage(senderPsid: string, receivedMessage: any) {
    // A quick reply is a postback wearing a message's clothes: it carries the payload, and v1 routes
    // it through the same branch table. Answering it as free text would search for the button label.
    const quickReplyPayload = receivedMessage.quick_reply?.payload;
    if (quickReplyPayload) return handlePostback(senderPsid, { payload: quickReplyPayload });

    const text: string | undefined = receivedMessage.text;
    if (!text) {
        // Stickers, images and audio have no text to act on. v1 ignores them silently; saying so is
        // friendlier than appearing to have crashed.
        return sendAll(senderPsid, [
            { text: "I can only read text for now 🙈 — try typing what you are looking for." },
        ]);
    }

    await mark(senderPsid, "mark_seen");
    await mark(senderPsid, "typing_on");

    // 1. v1's keyword table, in v1's order.
    const keyword = matchKeywords(text);
    if (keyword) return sendAll(senderPsid, keyword.blocks);

    // 2. No keyword matched. v1 stopped here and showed the default suggestion reply — the reason
    //    10,294 searches are logged as misses. Search instead, re-arming the typing indicator first
    //    so the thread shows the bot working rather than going quiet while the query runs.
    await mark(senderPsid, "typing_on");
    const blocks = await replyForQuery(text);

    // 3. replyForQuery already falls through to the default reply when the search finds nothing, so
    //    the dead end is the last resort instead of the first answer.
    return sendAll(senderPsid, blocks as Record<string, unknown>[]);
}

/** A button tap. Every payload goes through one resolver — see flow.service.ts. */
async function handlePostback(senderPsid: string, receivedPostback: any) {
    const payload = String(receivedPostback?.payload ?? "");

    await mark(senderPsid, "mark_seen");
    await mark(senderPsid, "typing_on");

    // Handover is an API call, not a block of text, so it cannot come from the flow table. Reply
    // first, then pass control — after the handover this app stops receiving the user's messages.
    if (/^talk[_-]?to[_-]?human$/i.test(payload)) {
        const blocks = (await resolvePayload(payload)) ?? [
            { text: "A person will get in touch with you 😁" },
        ];
        await sendAll(senderPsid, blocks);
        const passed = await passToHuman(senderPsid);
        if (!passed) {
            await sendAll(senderPsid, [
                { text: "I could not reach a person just now 😔 — please try again in a little while." },
            ]);
        }
        return;
    }

    const blocks = await resolvePayload(payload);
    if (blocks?.length) return sendAll(senderPsid, blocks);

    // An unrouted payload used to answer "Postback received: <payload>". Searching the payload text
    // at least offers something relevant; v1 answered nothing at all for its 13 dead buttons.
    const fallback = await replyForQuery(payload.replace(/_/g, " "));
    return sendAll(senderPsid, fallback as Record<string, unknown>[]);
}

/* ------------------------------------------------------------------- sending */

async function sendAll(senderPsid: string, blocks: Record<string, unknown>[]) {
    for (const block of blocks) {
        await callSendAPI(senderPsid, block);
    }
}

/**
 * A sender action (typing indicator / read receipt).
 *
 * Typing expires by itself after 20 seconds or the moment a message is sent, so unlike v1 there is
 * no `typing_off` after every block — that tripled v1's Send API traffic for no visible effect.
 * Failures are swallowed: a missing typing indicator must never stop the actual reply.
 */
async function mark(senderPsid: string, action: SenderAction) {
    const url = `${GRAPH_API_URL}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: senderPsid }, sender_action: action }),
        });
    } catch {
        /* indicators are cosmetic */
    }
}

async function callSendAPI(senderPsid: string, response: unknown) {
    const url = `${GRAPH_API_URL}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

    const requestBody = {
        recipient: { id: senderPsid },
        message: response,
        messaging_type: "RESPONSE",
    };

    try {
        const result = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!result.ok) {
            // Include the body: Meta explains *which* field it rejected, and without it a 400 is
            // indistinguishable from a bad token.
            const detail = await result.text().catch(() => "");
            console.error(`Send API error: ${result.status} ${result.statusText} ${detail.slice(0, 300)}`);
        }
    } catch (err) {
        console.error("Send API error:", err);
    }
}

export default {
    testMsg,
    getWebhook,
    postWebhook,
};
