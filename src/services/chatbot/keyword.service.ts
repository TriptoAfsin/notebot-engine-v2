import fs from "fs";
import path from "path";

/**
 * Free-text routing, ported from v1's ordered branch chain.
 *
 * v1 answers a typed message with 162 `else if` branches over keyword arrays. Three things about
 * that are load-bearing and easy to lose in a rewrite:
 *
 *   1. **Order.** The first matching branch wins, so a broad keyword declared early shadows a
 *      specific one declared later. Reordering changes answers even with identical keywords.
 *   2. **Unanchored substring matching.** `wordIncludes` matches "note" inside "notebook", which is
 *      deliberate — students type sentences, not commands.
 *   3. **Which matcher.** `wordIs` is exact-equality on the whole message, `wordIncludes` is
 *      substring, `wordIncludesWhole` is a word-boundary regex.
 *
 * Rather than retype 162 branches, the table is extracted from v1's source and its live replies by
 * `notebot-engine-v1/.ingest/extract-keyword-rules.js`, preserving source order. This module only
 * re-implements the three matchers and walks the table in order.
 */

export type Block = Record<string, unknown>;

type Variant = { keywords: string[]; blocks: Block[] };
type Rule = {
  order: number;
  matcher: "wordIs" | "wordIncludes" | "wordIncludesWhole";
  arrayName: string;
  keywordCount: number;
  uniform: boolean;
  variants: Variant[];
};

const DATA_FILE = path.join(__dirname, "..", "..", "config", "keyword-rules.json");

let rules: Rule[] | null = null;

function load(): Rule[] {
  if (rules) return rules;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as { rules: Rule[] };
    // Sort defensively: the file is written in source order, and that order is the contract.
    rules = [...parsed.rules].sort((a, b) => a.order - b.order);
  } catch {
    console.warn(`keyword rules unavailable at ${DATA_FILE} — free text will go straight to search`);
    rules = [];
  }
  return rules;
}

/** `keywordArray.includes(text.toLowerCase())` — the whole message must equal a keyword. */
const wordIs = (keywords: string[], text: string) => keywords.includes(text.toLowerCase());

/** `text.toLowerCase().includes(word)` — unanchored substring, in v1's direction. */
const wordIncludes = (keywords: string[], text: string) => {
  const lower = text.toLowerCase();
  return keywords.some((w) => lower.includes(w));
};

/**
 * Word-boundary match. v1 escapes the *text* rather than the keyword and builds
 * `new RegExp("\\b" + keyword + "\\b", "i")`, so a keyword containing regex metacharacters is
 * interpreted as a pattern. That is reproduced rather than corrected: fixing it here would change
 * which messages match, which is exactly the silent behaviour drift a port has to avoid.
 */
const wordIncludesWhole = (keywords: string[], text: string) => {
  const escaped = text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  for (const kw of keywords) {
    try {
      if (new RegExp(`\\b${kw}\\b`, "i").test(escaped)) return true;
    } catch {
      // an unparseable keyword-as-pattern simply does not match, as in v1 (its try/catch returns false)
      return false;
    }
  }
  return false;
};

const MATCHERS = { wordIs, wordIncludes, wordIncludesWhole } as const;

export type KeywordMatch = {
  blocks: Block[];
  rule: { order: number; matcher: string; arrayName: string };
};

/**
 * First matching rule in v1's declaration order, or null.
 *
 * For a rule whose keywords do not all answer identically — an academic-word array that routes to
 * different subjects — the matched keyword decides which variant is served.
 */
export function matchKeywords(text: string): KeywordMatch | null {
  const message = String(text ?? "");
  if (!message.trim()) return null;

  for (const rule of load()) {
    const matcher = MATCHERS[rule.matcher];
    if (!matcher) continue;

    if (rule.uniform) {
      const all = rule.variants[0];
      if (all && matcher(all.keywords, message)) {
        return { blocks: all.blocks, rule: { order: rule.order, matcher: rule.matcher, arrayName: rule.arrayName } };
      }
      continue;
    }

    // Non-uniform: find the variant whose own keywords matched, so the reply follows the keyword.
    for (const variant of rule.variants) {
      if (matcher(variant.keywords, message)) {
        return { blocks: variant.blocks, rule: { order: rule.order, matcher: rule.matcher, arrayName: rule.arrayName } };
      }
    }
  }

  return null;
}

/** Diagnostics for the bot status endpoint. */
export const keywordStats = () => {
  const all = load();
  return {
    rules: all.length,
    keywords: all.reduce((n, r) => n + r.keywordCount, 0),
  };
};
