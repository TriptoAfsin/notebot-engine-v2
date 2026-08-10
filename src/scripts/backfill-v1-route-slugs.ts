/**
 * Teaches the database which v1 payload addresses each topic and subject.
 *
 * `flow.service.ts` resolves a payload by `slug` or `metadata.v1RouteSlug`. Where neither matches,
 * the flow falls back to a frozen snapshot of v1's blocks, so a CMS edit never reaches it. The
 * mismatches are real but arbitrary — v1's `che1_flow` against v2's `chem1`,
 * `phy2_electric_notes_flow` against `phy2_electricity_flow`, `math2_diffeqn_note_flow` against
 * `math2_dif_eqn_flow`. No naming rule covers them.
 *
 * So the mapping is derived from **content** instead of from names: for each unresolved payload, the
 * URLs v1 shows are compared against every topic's URLs, and the payload is recorded on the topic
 * that owns them. A Drive file id is a strong identifier, which makes this far safer than fuzzy
 * slug matching.
 *
 * Writes `metadata.v1RouteSlug` only, and only when the match is unambiguous. Dry by default.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register \
 *        src/scripts/backfill-v1-route-slugs.ts [--apply]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";
import { resolveLabPayload, resolvePayload } from "services/chatbot/flow.service";

const APPLY = process.argv.includes("--apply");
const BESPOKE = path.join(__dirname, "..", "db", "seed", "bespoke-flows.seed.json");

/**
 * How confident a match must be before it is written.
 *
 * A single-URL payload is still identifiable — a Drive file id is unique — but only if the topic
 * holding it is itself small. Pointing a one-link payload at a 20-note topic would make the bot show
 * far more than v1 did, which is a behaviour change rather than a wiring fix, so those are skipped.
 */
const MIN_OVERLAP = 0.6;
const SINGLE_URL_MAX_TOPIC_SIZE = 3;

const driveId = (u: string) => {
  const m = u.match(/\/d\/([\w-]{10,})/) ?? u.match(/\/folders\/([\w-]{10,})/) ?? u.match(/[?&]id=([\w-]{10,})/);
  return m ? `drive:${m[1]}` : u.replace(/\/+$/, "").replace(/\?usp=sharing$/, "");
};

function urlsOf(blocks: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/https?:\/\/[^\s"'<>)]+/g)) out.add(driveId(m[0].replace(/[.,;)]+$/, "")));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk(blocks);
  return out;
}

async function main() {
  const db = getDb();
  const bespoke: Record<string, unknown[]> = JSON.parse(fs.readFileSync(BESPOKE, "utf8"));

  // Topic -> its URLs (notes plus its own direct link).
  const { rows: topicUrls } = await db.execute<{
    topic_id: number; slug: string; v1: string | null; subject_slug: string; url: string;
  }>(sql`
    SELECT t.id AS topic_id, t.slug, t.metadata->>'v1RouteSlug' AS v1, s.slug AS subject_slug, n.url
      FROM topics t JOIN subjects s ON s.id = t.subject_id JOIN notes n ON n.topic_id = t.id
    UNION ALL
    SELECT t.id, t.slug, t.metadata->>'v1RouteSlug', s.slug, t.metadata->>'directUrl'
      FROM topics t JOIN subjects s ON s.id = t.subject_id
     WHERE t.metadata->>'directUrl' IS NOT NULL
  `);

  const byTopic = new Map<number, { slug: string; v1: string | null; subject: string; urls: Set<string> }>();
  for (const r of topicUrls) {
    if (!r.url) continue;
    let e = byTopic.get(r.topic_id);
    if (!e) {
      e = { slug: r.slug, v1: r.v1, subject: r.subject_slug, urls: new Set() };
      byTopic.set(r.topic_id, e);
    }
    e.urls.add(driveId(r.url));
  }
  console.log(`topics carrying at least one URL: ${byTopic.size}`);

  type Plan = { payload: string; topicId: number; slug: string; subject: string; overlap: number; shared: number };
  const plan: Plan[] = [];
  const skipped: Array<{ payload: string; why: string }> = [];

  for (const [payload, blocks] of Object.entries(bespoke)) {
    // Only consider payloads the DB cannot already answer, so nothing working is disturbed.
    const already = (await resolvePayload(payload, { skipBespoke: true })) ?? (await resolveLabPayload(payload));
    if (already?.length) continue;

    const want = urlsOf(blocks);
    if (want.size === 0) { skipped.push({ payload, why: "no URLs at all" }); continue; }

    // Score every topic by how much of v1's URL set it holds.
    let best: Plan | null = null;
    let runnerUp = 0;
    for (const [topicId, t] of byTopic) {
      let shared = 0;
      for (const u of want) if (t.urls.has(u)) shared++;
      if (!shared) continue;
      const overlap = shared / want.size;
      // Guard the single-URL case: only a small topic is plausibly "the same leaf".
      if (want.size === 1 && t.urls.size > SINGLE_URL_MAX_TOPIC_SIZE) continue;
      if (!best || overlap > best.overlap) {
        if (best) runnerUp = best.overlap;
        best = { payload, topicId, slug: t.slug, subject: t.subject, overlap, shared };
      } else if (overlap > runnerUp) runnerUp = overlap;
    }

    if (!best) { skipped.push({ payload, why: "no topic shares a URL" }); continue; }
    if (best.overlap < MIN_OVERLAP) { skipped.push({ payload, why: `best overlap ${(best.overlap * 100) | 0}%` }); continue; }
    // A near-tie means the payload's URLs are spread across topics; naming one would be a guess.
    if (runnerUp >= best.overlap - 0.01) { skipped.push({ payload, why: "tied between topics" }); continue; }
    plan.push(best);
  }

  console.log(`\nunambiguous matches : ${plan.length}`);
  console.log(`skipped             : ${skipped.length}`);
  for (const p of plan.slice(0, 12)) {
    console.log(`  ${p.payload.padEnd(30)} -> ${p.subject}/${p.slug}  (${p.shared}/${Math.round(p.shared / p.overlap)} URLs, ${(p.overlap * 100) | 0}%)`);
  }
  const reasons: Record<string, number> = {};
  for (const s of skipped) reasons[s.why.replace(/\d+/g, "N")] = (reasons[s.why.replace(/\d+/g, "N")] ?? 0) + 1;
  console.log("\nskip reasons:");
  for (const [w, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${w}`);

  if (!APPLY) {
    fs.writeFileSync("v1-route-slug-plan.json", JSON.stringify({ plan, skipped }, null, 1));
    console.log("\ndry run — pass --apply to write. plan -> v1-route-slug-plan.json");
    process.exit(0);
  }

  // One payload per topic: if two payloads both claim a topic, keep the stronger overlap, because
  // v1RouteSlug is a single value.
  const byTopicId = new Map<number, Plan>();
  for (const p of plan) {
    const cur = byTopicId.get(p.topicId);
    if (!cur || p.overlap > cur.overlap) byTopicId.set(p.topicId, p);
  }

  let written = 0;
  for (const p of byTopicId.values()) {
    await db.execute(sql`
      UPDATE topics
         SET metadata = COALESCE(metadata, '{}'::jsonb)
              -- explicit ::text casts: jsonb_build_object cannot infer a bare parameter's type
              || jsonb_build_object('v1RouteSlug', ${p.payload}::text, 'v1SlugSource', 'url-overlap-backfill'::text)
       WHERE id = ${p.topicId}
    `);
    written++;
  }
  console.log(`\nwrote v1RouteSlug on ${written} topics (${plan.length - written} dropped as duplicate claims)`);
  console.log("now re-run: npm run bot:build-flows && npm run bot:verify");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
