import { MY_VERIFY_TOKEN, PAGE_ACCESS_TOKEN, GRAPH_API_URL } from "constants/secrets";
import { Request, Response } from "express";
import { chatBotIntroService } from "services/chatbot/chatbot.service";

export const testMsg = async (req: Request, res: Response) => {
    const introRes = await chatBotIntroService(req);

    return res.send(introRes);
};

export const getWebhook = (req: Request, res: Response) => {
    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = MY_VERIFY_TOKEN;

    // Parse the query params
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
      // Checks the mode and token sent is correct
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        // Responds with the challenge token from the request
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);
      }
    }
};

export const postWebhook = async (req: Request, res: Response) => {
    const body = req.body;

    if (body.object === "page") {
        for (const entry of body.entry) {
            const webhookEvent = entry.messaging?.[0];
            if (!webhookEvent) continue;

            const senderPsid = webhookEvent.sender.id;

            if (webhookEvent.message) {
                await handleMessage(senderPsid, webhookEvent.message);
            } else if (webhookEvent.postback) {
                await handlePostback(senderPsid, webhookEvent.postback);
            }
        }

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
};

async function handleMessage(senderPsid: string, receivedMessage: any) {
    let response: any;

    if (receivedMessage.quick_reply) {
        // Handle quick reply
        const payload = receivedMessage.quick_reply.payload;
        response = { text: `Quick reply received: ${payload}` };
    } else if (receivedMessage.text) {
        // Echo the message back
        response = { text: `You said: "${receivedMessage.text}"` };
    }

    if (response) {
        await callSendAPI(senderPsid, response);
    }
}

async function handlePostback(senderPsid: string, receivedPostback: any) {
    const payload = receivedPostback.payload;
    let response: any;

    switch (payload) {
        case "GET_STARTED":
            response = { text: "Welcome to NoteBot! How can I help you today?" };
            break;
        case "help_payload":
            response = { text: "NoteBot helps you find study materials for Textile Education (BUTEX)." };
            break;
        case "donation_payload":
            response = { text: "Thank you for considering a donation! Visit our page to learn more." };
            break;
        default:
            response = { text: `Postback received: ${payload}` };
    }

    await callSendAPI(senderPsid, response);
}

async function callSendAPI(senderPsid: string, response: any) {
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
            console.error(`Send API error: ${result.status} ${result.statusText}`);
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
