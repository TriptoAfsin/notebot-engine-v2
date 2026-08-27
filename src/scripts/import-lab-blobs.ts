/**
 * Imports the frozen v1 lab snapshots into `lab_reports`, so the compat route can be served from the
 * database instead of the blob.
 *
 * `levels.metadata.v1LabTopics` / `.v1LabLeaves` are returned verbatim by compat.routes.ts before the
 * database is ever consulted (line ~400). That is the lab twin of the `v1Topics`/`v1Leaves`
 * short-circuit resolved for notes — except it lives on `levels`, so that work never touched it. All
 * 46 lab subjects across the four levels are frozen, which is why a lab report added by the CMS or by
 * apply-ingest is invisible on the route v2 actually advertises.
 *
 * The blob is authoritative for three things the DB has no column for, so they are imported rather
 * than guessed:
 *   - `metadata.v1Display`  the label v1 shows ("E1", "📌 All Lab Reports -Tahin(2025)")
 *   - `metadata.v1Kind`     "link" (a direct web button) or "topic" (a drill-down)
 *   - `topic_name`          for drill-downs, the v1 route key ("phy2_lab_e1_flow")
 *   - `sort_order`          v1's flow order, which is editorial
 *
 * Writes nothing without --apply.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/import-lab-blobs.ts [--apply]
 */
import "dotenv/config";
import fs from "fs";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";

const APPLY = process.argv.includes("--apply");

type Entry = { topic: string; url?: string; route?: string };
type Leaf = { title: string; url: string };

const driveId = (u: string) => {
  const s = String(u || "");
  const m = s.match(/\/d\/([\w-]{10,})/) || s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? `drive:${m[1]}` : s.split("?")[0].replace(/\/+$/, "").toLowerCase();
};

async function main() {
  const db = getDb();

  const { rows: levels } = await db.execute<{
    id: number; slug: string; metadata: Record<string, unknown> | null;
  }>(sql`SELECT id, slug, metadata FROM levels ORDER BY slug`);

  const plan: Array<{
    levelId: number; levelSlug: string; v1Subject: string; dbSlug: string;
    topicName: string; title: string; url: string; display: string; kind: string; sort: number;
    action: "update" | "insert"; rowId: number | null;
  }> = [];
  const missingSubjects: string[] = [];
  let blobRows = 0;

  for (const level of levels) {
    const meta = level.metadata ?? {};
    const topics = meta.v1LabTopics as Record<string, Entry[]> | undefined;
    const leaves = meta.v1LabLeaves as Record<string, Record<string, Leaf[]>> | undefined;
    const config = (meta.labSubjects as Array<{ dbSlug: string; displayName: string; v1RouteSlug: string }>) ?? [];
    if (!topics) continue;

    for (const [v1Subject, entries] of Object.entries(topics)) {
      const dbSlug = config.find((s) => s.v1RouteSlug === v1Subject)?.dbSlug ?? v1Subject;

      // What the DB already holds for this subject, keyed by file identity.
      const { rows: existing } = await db.execute<{
        id: number; topic_name: string; title: string; url: string; metadata: Record<string, unknown> | null;
      }>(sql`
        SELECT id, topic_name, title, url, metadata FROM lab_reports
         WHERE level_id = ${level.id} AND subject_slug = ${dbSlug}
      `);
      // Several rows can share a file, and one file can play two roles: v1 often lists a report as a
      // direct button on the subject page AND inside a drill-down group. Keying by url alone made the
      // second role overwrite the first (ap1 lost 3 links that way), so rows are pooled per file and
      // claimed at most once.
      const pool = new Map<string, typeof existing>();
      for (const r of existing) {
        const k = driveId(r.url);
        if (!pool.has(k)) pool.set(k, []);
        (pool.get(k) as typeof existing).push(r);
      }
      const claimed = new Set<number>();
      const claim = (fileKey: string, wantKind: string, wantTopic?: string) => {
        const candidates = (pool.get(fileKey) ?? []).filter((r) => !claimed.has(r.id));
        if (!candidates.length) return null;
        const score = (r: (typeof existing)[number]) => {
          const k = (r.metadata as Record<string, unknown> | null)?.v1Kind;
          let n = 0;
          if (k === wantKind) n += 2;          // already this role
          if (k === undefined || k === null) n += 1; // unclaimed role
          if (wantTopic && r.topic_name === wantTopic) n += 2;
          return n;
        };
        const best = candidates.sort((a, b) => score(b) - score(a))[0];
        claimed.add(best.id);
        return best;
      };
      if (existing.length === 0) missingSubjects.push(`${level.slug}/${v1Subject} (db slug ${dbSlug})`);

      let sort = 0;
      for (const entry of entries) {
        if (entry.url) {
          // A direct web button. Its own label is the whole display string.
          blobRows++;
          sort++;
          const hit = claim(driveId(entry.url), "link");
          plan.push({
            levelId: level.id, levelSlug: level.slug, v1Subject, dbSlug,
            // No route key exists for a link; keep whatever the DB already called it so the leaf
            // route stays reachable, else derive a stable bucket.
            topicName: hit?.topic_name ?? (entry.topic.replace(/^📌\s*/, "").split(" -")[0] || "Links"),
            title: hit?.title ?? (entry.topic.split(" -").slice(1).join(" -") || entry.topic),
            url: entry.url, display: entry.topic, kind: "link", sort,
            action: hit ? "update" : "insert", rowId: hit?.id ?? null,
          });
          continue;
        }
        if (!entry.route) continue;

        // A drill-down: the route's last segment is v1's key, and the leaf holds its items.
        const routeKey = entry.route.split("/").filter(Boolean).pop() as string;
        const items = leaves?.[v1Subject]?.[routeKey] ?? [];
        sort++;
        const groupSort = sort;
        let i = 0;
        for (const item of items) {
          blobRows++;
          i++;
          const hit = claim(driveId(item.url), "topic", routeKey);
          plan.push({
            levelId: level.id, levelSlug: level.slug, v1Subject, dbSlug,
            topicName: routeKey, title: item.title, url: item.url,
            display: entry.topic, kind: "topic", rowId: hit?.id ?? null,
            // Keep the group contiguous: group index dominates, item index orders within it.
            sort: groupSort * 100 + i,
            action: hit ? "update" : "insert",
          });
        }
      }
    }
  }

  const inserts = plan.filter((p) => p.action === "insert");
  const updates = plan.filter((p) => p.action === "update");
  console.log(`lab subjects frozen in blobs : ${new Set(plan.map((p) => `${p.levelSlug}/${p.v1Subject}`)).size}`);
  console.log(`rows described by the blobs   : ${blobRows}`);
  console.log(`  already in the DB (relabel) : ${updates.length}`);
  console.log(`  MISSING from the DB (insert): ${inserts.length}`);
  console.log(`  subjects with no DB rows at all: ${missingSubjects.length}`);
  if (missingSubjects.length) console.log(`    ${missingSubjects.slice(0, 8).join(", ")}`);

  const byKind: Record<string, number> = {};
  for (const p of plan) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  console.log(`  by kind: ${JSON.stringify(byKind)}`);

  if (inserts.length) {
    console.log("\nsample of what is missing from the DB:");
    for (const p of inserts.slice(0, 8)) {
      console.log(`  L${p.levelSlug} ${p.v1Subject}/${p.topicName} "${p.title.slice(0, 28)}" (${p.kind})`);
    }
  }

  fs.writeFileSync("lab-blob-plan.json", JSON.stringify({ plan, missingSubjects }, null, 1));
  console.log("\nplan -> lab-blob-plan.json");

  if (!APPLY) { console.log("dry run — pass --apply to write"); process.exit(0); }

  let updated = 0, inserted = 0;
  for (const p of plan) {
    const patch = JSON.stringify({ v1Display: p.display, v1Kind: p.kind, source: "lab-blob-import" });
    if (p.action === "update") {
      // By id, not by url: the match was made on the drive file id because the blob and the DB
      // disagree on query params (?usp=sharing vs ?usp=drivesdk).
      await db.execute(sql`
        UPDATE lab_reports
           SET topic_name = ${p.topicName}, title = ${p.title}, sort_order = ${p.sort},
               metadata = COALESCE(metadata, '{}'::jsonb) || ${patch}::jsonb
         WHERE id = ${p.rowId}
      `);
      updated++;
    } else {
      await db.execute(sql`
        INSERT INTO lab_reports (level_id, subject_slug, topic_name, title, url, sort_order, metadata)
        VALUES (${p.levelId}, ${p.dbSlug}, ${p.topicName}, ${p.title}, ${p.url}, ${p.sort}, ${patch}::jsonb)
      `);
      inserted++;
    }
  }
  console.log(`updated ${updated}, inserted ${inserted}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
