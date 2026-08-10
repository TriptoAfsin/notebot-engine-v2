import { searchService, type SearchHit } from "services/app/search.service";
import { buttonGroups, noteBlock, textBlock, type Button } from "utils/messenger-blocks";

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

/**
 * Search results as note bubbles — one per hit, the same shape a topic page uses.
 *
 * The earlier version returned button templates, which capped every title at 20 characters and so
 * showed "Knitting Technology " for two different books. A text bubble carries the full title, the
 * subject and topic it came from, and a tappable link.
 */
export function searchResultBlocks(query: string, hits: SearchHit[]) {
  const header = textBlock(
    `🔍 Top ${hits.length} result${hits.length === 1 ? "" : "s"} for “${query}”`
  );
  return [
    header,
    ...hits.map((h) => {
      const where = [h.topic, h.subject].filter(Boolean).join(" · ");
      const title = h.kind === "lab" ? `🧪 ${h.title}` : h.title;
      return noteBlock(title, h.url, where || undefined);
    }),
  ];
}

/**
 * The single entry point the webhook uses.
 *
 * v1 stopped at its keyword table: anything it did not recognise got the default suggestion reply,
 * which is why 10,294 searches were logged as misses. Here an unmatched message is searched first,
 * and only a genuinely empty result falls through to that default — so the dead end is the last
 * resort rather than the first answer.
 */
export async function replyForQuery(text: string) {
  const query = String(text ?? "").trim();
  if (query.length < 2) return defaultReplyBlocks();

  try {
    const hits = await searchService.search(query, 5);
    if (hits.length === 0) return defaultReplyBlocks();
    return searchResultBlocks(query, hits);
  } catch (err) {
    console.error("[search] failed for query", JSON.stringify(query), err);
    // never leave the user with silence
    return defaultReplyBlocks();
  }
}
