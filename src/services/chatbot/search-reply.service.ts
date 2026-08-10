import { searchService, type SearchHit } from "services/app/search.service";
import { buttonGroups, textBlock, webButton, type Button } from "utils/messenger-blocks";

/**
 * Turns a free-text Messenger message into blocks to send back.
 *
 * On a miss it returns v1's "I didn't understand you" reply rather than an empty search result,
 * because that is the behaviour students already know — a bare "no results" from a bot that used
 * to offer suggestions reads as broken.
 */

/** Ported from v1 keywords/replies/defaultReply.js, including the Bangla variants. */
const DEFAULT_REPLIES: { text: string }[] = [
  { text: "🔴 Sorry I didn't get what you meant\n Here are some suggestions - " },
  { text: "🔴 সরি বুঝলাম না কি বললেন 😓" },
  { text: "🔴 বুঝি নাই 😶, দেখেন তো নিচের কিছু খুজছেন কিনা -" },
  { text: "🔴 Sorry I didn't understand you, here are some suggestions -" },
];

const SUGGESTIONS: Button[] = [
  { type: "postback", title: "Notes📗", payload: "notes_flow" },
  { type: "postback", title: "Lab Reports📋", payload: "reports_flow" },
  { type: "postback", title: "Help😥", payload: "help_flow" },
];

export function defaultReplyBlocks() {
  const header = DEFAULT_REPLIES[Math.floor(Math.random() * DEFAULT_REPLIES.length)].text;
  return buttonGroups(header, SUGGESTIONS);
}

/** A hit's button label: the title, prefixed so a lab is distinguishable from a note. */
const labelFor = (h: SearchHit) => (h.kind === "lab" ? `🧪 ${h.title}` : h.title);

export function searchResultBlocks(query: string, hits: SearchHit[]) {
  const header = `🔍 Top ${hits.length} result${hits.length === 1 ? "" : "s"} for “${query}”`;
  // buttonGroups splits across blocks rather than letting Messenger discard the 4th button,
  // so 5 hits arrive as 3 + 2 instead of silently becoming 3
  return buttonGroups(header, hits.map((h) => webButton(labelFor(h), h.url)));
}

/**
 * The single entry point the webhook uses. Returns the blocks to send, in order.
 */
export async function replyForQuery(text: string) {
  const query = String(text ?? "").trim();
  if (query.length < 2) return defaultReplyBlocks();

  try {
    const hits = await searchService.search(query, 5);
    if (hits.length === 0) return defaultReplyBlocks();

    // A summary above the buttons carries the context a 20-character button title cannot.
    // Topic first, then subject: a hit usually matches on its topic ("Polymer Degradation"),
    // and the note's own title ("Rashed Sir Sheet") means nothing without it.
    const summary = hits
      .map((h, i) => {
        const where = [h.topic, h.subject].filter(Boolean).join(" · ");
        return `${i + 1}. ${h.title}${where ? `\n     ${where}` : ""}`;
      })
      .join("\n");

    return [textBlock(summary), ...searchResultBlocks(query, hits)];
  } catch (err) {
    console.error("[search] failed for query", JSON.stringify(query), err);
    // never leave the user with silence
    return defaultReplyBlocks();
  }
}
