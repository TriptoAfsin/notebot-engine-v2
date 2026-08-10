/**
 * Proves the bot answers everything v1 answers, through the real runtime path.
 *
 * Unlike `build-static-flows.ts` this does **not** bypass the bespoke table — it asks exactly what
 * the webhook handler asks, so a payload that only the bespoke table can serve still counts as
 * answered. Any payload reaching zero blocks here is a button that would visibly do nothing.
 *
 * Also checks the free-text side: every keyword v1 recognises must still route somewhere.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/verify-bot-parity.ts
 */
import "dotenv/config";
import fs from "fs";

import { resolvePayload } from "services/chatbot/flow.service";
import { matchKeywords } from "services/chatbot/keyword.service";
import { LIMITS } from "utils/messenger-blocks";

const GOLDEN = "T:/Bots/bots/notebot-engine-v1/.ingest/payload-blocks.json";
const RULES = "src/config/keyword-rules.json";

type Golden = Record<string, { blockCount: number; blocks: any[] }>;

/** Every Messenger limit that can be violated by data rather than by code. */
function limitViolations(blocks: any[]) {
  const bad: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, any>;

    if (typeof o.template_type === "string" && Array.isArray(o.buttons)) {
      if (o.buttons.length > LIMITS.buttonsPerGroup) bad.push(`${o.buttons.length} buttons in one template`);
      if (typeof o.text === "string" && o.text.length > LIMITS.templateText) bad.push(`template text ${o.text.length}`);
    }
    if ((o.type === "postback" || o.type === "web_url") && typeof o.title === "string") {
      if (o.title.length > LIMITS.buttonTitle) bad.push(`button title ${o.title.length}: ${o.title}`);
    }
    if (o.type === "postback" && typeof o.payload === "string" && o.payload.length > LIMITS.payload) {
      bad.push(`payload ${o.payload.length}`);
    }
    if (Array.isArray(o.quick_replies)) {
      if (o.quick_replies.length > LIMITS.quickReplies) bad.push(`${o.quick_replies.length} quick replies`);
      for (const q of o.quick_replies) {
        if (typeof q?.title === "string" && q.title.length > LIMITS.quickReplyTitle) {
          bad.push(`quick reply title ${q.title.length}: ${q.title}`);
        }
      }
    }
    if (typeof o.text === "string" && !o.template_type && o.text.length > LIMITS.text) {
      bad.push(`message text ${o.text.length}`);
    }
    Object.values(o).forEach(walk);
  };
  walk(blocks);
  return bad;
}

async function main() {
  const golden: Golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  const payloads = Object.keys(golden);

  let live = 0, answered = 0, silent = 0, deadInV1 = 0;
  const silentList: string[] = [];
  const violations: Array<{ payload: string; issues: string[] }> = [];

  for (const payload of payloads) {
    if (!golden[payload].blockCount) { deadInV1++; continue; }
    live++;

    const blocks = await resolvePayload(payload);
    if (!blocks?.length) { silent++; silentList.push(payload); continue; }
    answered++;

    const issues = limitViolations(blocks);
    if (issues.length) violations.push({ payload, issues: [...new Set(issues)].slice(0, 3) });
  }

  console.log("── postbacks ─────────────────────────────────");
  console.log(`  v1 answers nothing (dead buttons) : ${deadInV1}`);
  console.log(`  live payloads                     : ${live}`);
  console.log(`  answered by v2                    : ${answered}`);
  console.log(`  ANSWERED BY NOTHING              : ${silent}`);
  if (silentList.length) console.log(`    ${silentList.slice(0, 10).join(", ")}`);

  console.log(`\n  payloads breaching a Messenger limit: ${violations.length}`);
  for (const v of violations.slice(0, 8)) console.log(`    ${v.payload}: ${v.issues.join(" | ")}`);

  // ---- free text ----
  const rules = JSON.parse(fs.readFileSync(RULES, "utf8")) as {
    rules: Array<{ variants: Array<{ keywords: string[]; blocks: any[] }> }>;
  };

  /**
   * v1's own default reply, recognised by its 🔴 header.
   *
   * A keyword can appear in a v1 array and still not be reachable by v1's matcher — `\b…\b` does
   * not bind to Bangla graphemes, and `wordIncludes` compares a lowercased message against a
   * capitalised keyword ("darling".includes("Darling") is false). v1 answers those with the default
   * reply, so v2 falling through is parity, not a regression. Only a keyword v1 genuinely routes
   * and v2 does not is a failure.
   */
  const isDefaultReply = (blocks: any[]) => {
    const first = blocks?.[0];
    const text = first?.text ?? first?.attachment?.payload?.text;
    return typeof text === "string" && text.trimStart().startsWith("🔴");
  };

  const expected = new Map<string, boolean>(); // keyword -> v1 actually routes it
  for (const rule of rules.rules) {
    for (const variant of rule.variants) {
      const routes = !isDefaultReply(variant.blocks);
      for (const kw of variant.keywords) {
        expected.set(kw, (expected.get(kw) ?? false) || routes);
      }
    }
  }

  let routed = 0, agreedFallthrough = 0;
  const regressions: string[] = [];
  for (const [kw, v1Routes] of expected) {
    const matched = Boolean(matchKeywords(kw));
    if (matched) routed++;
    else if (!v1Routes) agreedFallthrough++;
    else regressions.push(kw);
  }

  console.log("\n── free text ─────────────────────────────────");
  console.log(`  keywords in v1's arrays        : ${expected.size}`);
  console.log(`  routed by v2                   : ${routed}`);
  console.log(`  v1 also falls through (parity) : ${agreedFallthrough}`);
  console.log(`  REGRESSIONS (v1 routes, v2 not): ${regressions.length}`);
  if (regressions.length) console.log(`    ${regressions.slice(0, 12).join(", ")}`);
  console.log(`  (a fall-through now runs search before the default reply)`);

  const ok = silent === 0 && regressions.length === 0 && violations.length === 0;
  console.log(`\n${ok ? "PASS" : "FAIL"} — every live payload and keyword answers, within Meta's limits`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
