/**
 * Builds `src/config/static-flows.json` and reports v1↔v2 payload parity.
 *
 * For every payload v1 answers:
 *   - ask v2's resolver
 *   - if v2 answers, compare the set of URLs both sides expose (the actual resources a student can
 *     reach — the metric that matters, and one that survives cosmetic differences in wording)
 *   - if v2 cannot answer, keep v1's blocks verbatim as a bespoke flow
 *
 * The residual shrinks on its own as content moves into the database; nothing has to be pruned by
 * hand, and a flow can never be served twice from two places.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/build-static-flows.ts
 *      [--golden <path>] [--dry]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { resolveLabPayload, resolvePayload } from "services/chatbot/flow.service";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const GOLDEN = arg("--golden", "T:/Bots/bots/notebot-engine-v1/.ingest/payload-blocks.json");
const OUT = path.join(__dirname, "..", "db", "seed", "bespoke-flows.seed.json");
const DRY = process.argv.includes("--dry");

type Golden = Record<string, { blockCount: number; blocks: any[]; senderActions?: string[] }>;

/** Every URL a block exposes, wherever it hides: text bodies, buttons, cards, attachments. */
function urlsOf(blocks: any[]): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/https?:\/\/[^\s"'<>)]+/g)) found.add(normaliseUrl(m[0]));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk(blocks);
  return [...found];
}

/** Drive links are the same file with or without ?usp=sharing, /view, or a trailing slash. */
function normaliseUrl(u: string): string {
  let s = u.replace(/[.,;)]+$/, "");
  const drive = s.match(/\/d\/([\w-]{10,})/) ?? s.match(/\/folders\/([\w-]{10,})/);
  if (drive) return `drive:${drive[1]}`;
  return s.replace(/\/+$/, "").replace(/\?usp=sharing$/, "");
}

/**
 * Asks v2 using the database only.
 *
 * `skipBespoke` is essential: this script's own previous output is v1's blocks verbatim, so letting
 * the resolver read it would grade v1 against itself, report 100% parity and wipe the residual.
 */
async function ask(payload: string) {
  const direct = await resolvePayload(payload, { skipBespoke: true });
  if (direct) return direct;
  return resolveLabPayload(payload);
}

/** Postback payloads a block set offers, so reachability can be followed one tap further. */
function postbacksOf(blocks: any[]): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "postback" && typeof o.payload === "string") out.add(o.payload);
      if (o.content_type === "text" && typeof o.payload === "string") out.add(o.payload);
      return Object.values(o).forEach(walk);
    }
  };
  walk(blocks);
  return [...out];
}

/**
 * URLs reachable from a payload, following postbacks up to `depth` taps.
 *
 * v1 inlines a subject's note links directly on the subject page as web_url buttons. v2 lists the
 * subject's *topics* as postbacks, with the links one tap deeper — the same content, one level down.
 * Comparing only the first block set would score that as a total loss, so reachability is what gets
 * compared. Two taps is enough for level -> subject -> topic.
 */
async function reachableUrls(blocks: any[], depth: number, seen = new Set<string>()): Promise<Set<string>> {
  const urls = new Set(urlsOf(blocks));
  if (depth <= 0) return urls;

  for (const payload of postbacksOf(blocks)) {
    const key = payload.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const next = await ask(payload);
    if (!next?.length) continue;
    for (const u of await reachableUrls(next as any[], depth - 1, seen)) urls.add(u);
  }
  return urls;
}

async function main() {
  const golden: Golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  const payloads = Object.keys(golden);

  const residual: Record<string, any[]> = {};
  const stats = { total: 0, v1Empty: 0, v2Answered: 0, urlsMatch: 0, urlsPartial: 0, urlsMiss: 0, residual: 0 };
  const partials: Array<{ payload: string; v1: number; v2: number; missing: string[] }> = [];

  for (const payload of payloads) {
    stats.total++;
    const g = golden[payload];

    // v1 answers nothing here: 11 dead onlineClass_* buttons, restart_bot, and two rows that pass a
    // URL where a payload belongs. Nothing to port and nothing to match.
    if (!g.blockCount) { stats.v1Empty++; continue; }

    const mine = await ask(payload);
    if (!mine || mine.length === 0) {
      residual[payload.toLowerCase()] = g.blocks;
      stats.residual++;
      continue;
    }

    // v1 is compared at depth 0: its blocks already inline everything. v2 is followed two taps,
    // because its subject pages delegate to topic postbacks.
    const v1Urls = new Set(urlsOf(g.blocks));
    const v2Urls = await reachableUrls(mine as any[], 2);

    if (v1Urls.size === 0) { stats.v2Answered++; stats.urlsMatch++; continue; } // menu-only

    const missing = [...v1Urls].filter((u) => !v2Urls.has(u));

    if (missing.length === 0) {
      // v2 reaches everything v1 does — serve it live, so CMS edits flow through.
      stats.v2Answered++;
      stats.urlsMatch++;
      continue;
    }

    // v2 would show a student *less* than v1 does. Whatever the cause — a level page whose extra
    // links live nowhere in the content tables, a duplicate subject, an unmigrated lab — the bot
    // must not regress, so v1's blocks are kept and the payload is recorded as owing a fix.
    residual[payload.toLowerCase()] = g.blocks;
    stats.residual++;
    if (missing.length < v1Urls.size) stats.urlsPartial++;
    else stats.urlsMiss++;
    partials.push({ payload, v1: v1Urls.size, v2: v2Urls.size, missing: missing.slice(0, 4) });
  }

  console.log(`payloads in golden file      : ${stats.total}`);
  console.log(`  v1 answers nothing (dead)  : ${stats.v1Empty}`);
  console.log(`  v2 resolved from the DB    : ${stats.v2Answered}`);
  console.log(`      every v1 URL present   : ${stats.urlsMatch}`);
  console.log(`  kept as a bespoke flow     : ${stats.residual}`);
  console.log(`      v2 answered but partial: ${stats.urlsPartial}`);
  console.log(`      v2 answered but missed : ${stats.urlsMiss}`);
  console.log(`      v2 could not resolve   : ${stats.residual - stats.urlsPartial - stats.urlsMiss}`);

  const covered = stats.v2Answered + stats.residual;
  const live = stats.total - stats.v1Empty;
  console.log(`\ncoverage: ${covered}/${live} live payloads answered (${Math.round((covered / live) * 100)}%)`);

  if (partials.length) {
    console.log(`\nworst URL gaps (${partials.length} payloads):`);
    for (const p of partials.sort((a, b) => b.missing.length - a.missing.length).slice(0, 12)) {
      console.log(`  ${p.payload.padEnd(32)} v1:${p.v1} v2:${p.v2}  missing e.g. ${p.missing.join(", ")}`);
    }
  }

  fs.writeFileSync("payload-parity.json", JSON.stringify({ stats, partials }, null, 1));

  if (DRY) {
    console.log("\n--dry: static-flows.json not written");
  } else {
    fs.writeFileSync(OUT, JSON.stringify(residual, null, 1));
    console.log(`\nbespoke flows -> ${OUT} (${Object.keys(residual).length} payloads)`);
  }
  console.log("parity detail -> payload-parity.json");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
