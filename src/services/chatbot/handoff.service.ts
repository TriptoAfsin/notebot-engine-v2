import {
  FACEBOOK_APP_ID, GRAPH_API_URL, PAGE_ACCESS_TOKEN, SECONDARY_RECEIVER_ID,
} from "constants/secrets";

/**
 * Handing a conversation to a human and taking it back.
 *
 * Messenger's handover protocol gives one app control of a thread at a time. While the Page Inbox
 * holds it, the bot stops receiving `messaging` events for that user and instead receives `standby`
 * events — so a bot that ignores `standby` looks dead to anyone waiting on a human, with no way back.
 *
 * v1 implements this in `chatBotService.js`; v2 had nothing, which is why it was the last real gap
 * in the port.
 */

const api = async (path: string, body: unknown): Promise<boolean> => {
  if (!PAGE_ACCESS_TOKEN) {
    console.error(`[handoff] ${path} skipped — PAGE_ACCESS_TOKEN is unset`);
    return false;
  }
  try {
    const res = await fetch(`${GRAPH_API_URL}/me/${path}?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Meta names the offending field; without the body a 400 here is indistinguishable from a
      // missing handover subscription on the Page.
      const detail = await res.text().catch(() => "");
      console.error(`[handoff] ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[handoff] ${path} threw`, err);
    return false;
  }
};

/**
 * Give the thread to the Page Inbox so a person can reply.
 *
 * Returns false when `SECONDARY_RECEIVER_ID` is unset rather than calling Meta with an empty target,
 * which would silently succeed at the API level and leave the thread with nobody holding it.
 */
export async function passToHuman(senderPsid: string): Promise<boolean> {
  if (!SECONDARY_RECEIVER_ID) {
    console.error("[handoff] SECONDARY_RECEIVER_ID is unset — cannot pass to the page inbox");
    return false;
  }
  return api("pass_thread_control", {
    recipient: { id: senderPsid },
    target_app_id: SECONDARY_RECEIVER_ID,
    metadata: "Pass control to human",
  });
}

/** Hand the thread back to this app. */
export async function takeBackFromHuman(senderPsid: string): Promise<boolean> {
  return api("take_thread_control", {
    recipient: { id: senderPsid },
    metadata: "Pass control to bot",
  });
}

/** Explicitly return control to the primary receiver — used when the bot is the secondary. */
export async function passToBot(senderPsid: string): Promise<boolean> {
  if (!FACEBOOK_APP_ID) return takeBackFromHuman(senderPsid);
  return api("pass_thread_control", {
    recipient: { id: senderPsid },
    target_app_id: FACEBOOK_APP_ID,
    metadata: "Pass control to bot",
  });
}

/** The words that pull a user out of a human conversation, as in v1. */
export const RESTART_WORDS = ["restart", "restart bot", "bot"];

export function wantsBotBack(text: string | undefined): boolean {
  if (!text) return false;
  const escaped = text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return RESTART_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(escaped));
}
