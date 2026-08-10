/**
 * How many of v1's postback payloads can v2 resolve from the database alone?
 *
 * v1 answers each payload with a hand-written branch. v2 cannot carry 884 branches, so the plan is
 * one generic resolver: payload -> (level | subject | topic) -> rendered blocks. That only works if
 * the payloads are already addressable in the DB, which is what this measures before any code is
 * written against the assumption.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/audit-payload-coverage.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";

const V1_ROOT = "T:/Bots/bots/notebot-engine-v1";

/** Payloads v1 actually handles, read from its handlePostback branches. */
function v1HandledPayloads(): string[] {
  const src = fs.readFileSync(
    path.join(V1_ROOT, "src/controllers/chatbotController.js"),
    "utf8"
  );
  const out = new Set<string>();
  // payload === "x" / payload == 'x' / case "x":
  for (const m of src.matchAll(/payload\s*===?\s*["'`]([^"'`]+)["'`]/g)) out.add(m[1]);
  for (const m of src.matchAll(/case\s+["'`]([^"'`]+)["'`]\s*:/g)) out.add(m[1]);
  return [...out];
}

/** Payloads v1 emits on buttons, across every flow file. */
function v1EmittedPayloads(): string[] {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(
          /(?:payloadBtnGen|quickReplyBtn)\s*\(\s*["'`][^"'`]*["'`]\s*,\s*["'`]([^"'`]+)["'`]/g
        ))
          out.add(m[1]);
      }
    }
  };
  walk(path.join(V1_ROOT, "src/controllers/flows"));
  return [...out];
}

async function main() {
  const db = getDb();
  const handled = v1HandledPayloads();
  const emitted = v1EmittedPayloads();
  const all = [...new Set([...handled, ...emitted])];

  console.log(`v1 payloads handled by a branch : ${handled.length}`);
  console.log(`v1 payloads emitted on buttons  : ${emitted.length}`);
  console.log(`union                           : ${all.length}`);

  // Everything v2 can address, lowercased for a case-insensitive match.
  const { rows: topicRows } = await db.execute<{
    slug: string; v1: string | null; direct: string | null;
  }>(sql`
    SELECT lower(slug) AS slug,
           lower(metadata->>'v1RouteSlug') AS v1,
           metadata->>'directUrl' AS direct
    FROM topics
  `);
  const { rows: subjRows } = await db.execute<{ slug: string; v1: string | null }>(sql`
    SELECT lower(slug) AS slug, lower(metadata->>'v1RouteSlug') AS v1 FROM subjects
  `);
  const { rows: levelRows } = await db.execute<{ slug: string }>(sql`
    SELECT lower(slug) AS slug FROM levels
  `);

  const topicKeys = new Set<string>();
  for (const r of topicRows) {
    topicKeys.add(r.slug);
    if (r.v1) topicKeys.add(r.v1);
  }
  const subjKeys = new Set<string>();
  for (const r of subjRows) {
    subjKeys.add(r.slug);
    if (r.v1) subjKeys.add(r.v1);
  }
  const levelKeys = new Set(levelRows.map((r) => r.slug));

  const buckets: Record<string, string[]> = {
    topic: [], subject: [], level: [], labLevel: [], routine: [], syllabus: [], static: [], unresolved: [],
  };

  // v1 payload conventions, discovered by measuring rather than assumed. `<subject>_flow` is by far
  // the biggest family: v1 names a subject's own page `bce_flow`, so stripping the suffix lands on
  // the subject slug.
  const STATIC = new Set([
    "get_started", "getstarted", "help_payload", "help_flow", "donation_payload",
    "bkash_donation", "bkashdonation", "nagad_donation", "roket_donation", "rocket_donation",
    "surecash_donation", "talk_to_human", "restart_bot", "manza_contact",
  ]);

  for (const p of all) {
    const k = p.toLowerCase();
    const noFlow = k.replace(/_flow$/, "");

    let m: RegExpMatchArray | null;
    if (STATIC.has(k)) buckets.static.push(p);
    else if (topicKeys.has(k)) buckets.topic.push(p);
    else if (subjKeys.has(k)) buckets.subject.push(p);
    // strip the _flow suffix and try again, topic first: some leaves are named <x>_flow too
    else if (k !== noFlow && topicKeys.has(noFlow)) buckets.topic.push(p);
    else if (k !== noFlow && subjKeys.has(noFlow)) buckets.subject.push(p);
    else if ((m = k.match(/^level[_-]?(\d)[_-]?lab$/))) buckets.labLevel.push(p);
    else if ((m = k.match(/^routine[_-]?level[_-]?(\d)$/))) buckets.routine.push(p);
    else if ((m = k.match(/^syllabus[_-]?(\d+)$/))) buckets.syllabus.push(p);
    else if ((m = k.match(/^level[_-]?(\d)$/)) && levelKeys.has(m[1])) buckets.level.push(p);
    else if (levelKeys.has(k)) buckets.level.push(p);
    else buckets.unresolved.push(p);
  }

  const resolved = all.length - buckets.unresolved.length;
  console.log(`\nresolvable from the DB : ${resolved} / ${all.length} (${Math.round((resolved / all.length) * 100)}%)`);
  for (const [k, v] of Object.entries(buckets)) {
    if (k !== "unresolved") console.log(`  ${k.padEnd(12)}: ${v.length}`);
  }
  console.log(`  unresolved  : ${buckets.unresolved.length}`);

  // The unresolved set is what still needs explicit handling. Group it so the shape is obvious
  // rather than being a flat list of 700 strings.
  const groups: Record<string, string[]> = {};
  for (const p of buckets.unresolved) {
    const g = /_flow$/.test(p) ? "ends _flow"
      : /^(get_started|GET_STARTED)/.test(p) ? "get started"
      : /donat|bkash|nagad|roket|rocket/i.test(p) ? "donation"
      : /joke|quote|song|game|dino|fun/i.test(p) ? "entertainment"
      : /help|usage|about|contact|feedback/i.test(p) ? "meta / help"
      : /lab|report/i.test(p) ? "labs"
      : /routine|result|syllab|qb|question/i.test(p) ? "other content"
      : "misc";
    (groups[g] ??= []).push(p);
  }
  console.log("\nunresolved, grouped:");
  for (const [g, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${g.padEnd(16)} ${String(list.length).padStart(4)}   e.g. ${list.slice(0, 4).join(", ")}`);
  }

  fs.writeFileSync(
    "payload-coverage.json",
    JSON.stringify({ counts: { all: all.length, resolved, ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) }, buckets, groups }, null, 1)
  );
  console.log("\nfull breakdown -> payload-coverage.json");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
