/**
 * Proves the database can replace the frozen lab blobs, before any blob is dropped.
 *
 * `compat.routes.ts` returns `levels.metadata.v1LabTopics[subject]` verbatim and returns early, so
 * the 46 lab subjects are served from a snapshot and no lab added since is visible. Dropping the
 * snapshots is only safe once the DB path renders the same thing — this compares them:
 *
 *   blob  = what v2 serves today
 *   db    = what it would serve with the blob gone (same code path the route uses)
 *
 * A subject passes when every URL the blob exposes is still reachable and the direct-link/drill-down
 * split matches. Labels are reported separately: a label difference is cosmetic, a missing URL is not.
 *
 * Run: bun src/scripts/verify-lab-parity.ts
 */
import "dotenv/config";
import fs from "fs";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";
import { labService } from "services/app/lab.service";

type Entry = { topic: string; url?: string; route?: string };

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

  let pass = 0, urlGap = 0, labelDiff = 0, shapeDiff = 0, gained = 0;
  const problems: string[] = [];

  for (const level of levels) {
    const meta = level.metadata ?? {};
    const topics = meta.v1LabTopics as Record<string, Entry[]> | undefined;
    const leaves = meta.v1LabLeaves as Record<string, Record<string, Array<{ title: string; url: string }>>> | undefined;
    const config = (meta.labSubjects as Array<{ dbSlug: string; v1RouteSlug: string }>) ?? [];
    if (!topics) continue;

    for (const [v1Subject, entries] of Object.entries(topics)) {
      const dbSlug = config.find((s) => s.v1RouteSlug === v1Subject)?.dbSlug ?? v1Subject;

      // Every URL the blob can reach: its direct links plus everything inside its drill-downs.
      const blobUrls = new Set<string>();
      let blobLinks = 0, blobRoutes = 0;
      for (const e of entries) {
        if (e.url) { blobUrls.add(driveId(e.url)); blobLinks++; continue; }
        if (!e.route) continue;
        blobRoutes++;
        const key = e.route.split("/").filter(Boolean).pop() as string;
        for (const item of leaves?.[v1Subject]?.[key] ?? []) blobUrls.add(driveId(item.url));
      }

      // The same, through the code path the route uses once the blob is gone.
      const dbEntries = await labService.getLabTopicsBySubject(level.id, dbSlug);
      const dbUrls = new Set<string>();
      let dbLinks = 0, dbRoutes = 0;
      for (const e of dbEntries) {
        if (e.url) { dbUrls.add(driveId(e.url)); dbLinks++; continue; }
        dbRoutes++;
        for (const item of await labService.getLabItems(level.id, dbSlug, e.topicName)) {
          dbUrls.add(driveId(item.url));
        }
      }

      const missing = [...blobUrls].filter((u) => !dbUrls.has(u));
      // URLs the DB exposes that the blob was hiding. These are the point of dropping the blob, so
      // a shape difference caused only by additions is a gain, not a regression.
      const added = [...dbUrls].filter((u) => !blobUrls.has(u));
      const blobLabels = entries.map((e) => e.topic);
      const dbLabels = dbEntries.map((e) => e.display);
      const sameLabels = JSON.stringify(blobLabels) === JSON.stringify(dbLabels);
      const sameShape = blobLinks === dbLinks && blobRoutes === dbRoutes;

      const tag = `L${level.slug}/${v1Subject}`;
      if (missing.length) {
        urlGap++;
        problems.push(`${tag}: ${missing.length} of ${blobUrls.size} URLs unreachable from the DB`);
      } else if (!sameShape) {
        shapeDiff++;
        gained += added.length;
        problems.push(
          `${tag}: links ${blobLinks}->${dbLinks}, drill-downs ${blobRoutes}->${dbRoutes}` +
          (added.length ? `  (+${added.length} URL(s) the blob was hiding)` : "  (no new URLs - reshuffle only)")
        );
      } else if (!sameLabels) {
        labelDiff++;
        const first = blobLabels.findIndex((l, i) => l !== dbLabels[i]);
        problems.push(`${tag}: label ${first} "${blobLabels[first]}" -> "${dbLabels[first]}"`);
      } else pass++;
    }
  }

  const total = pass + urlGap + shapeDiff + labelDiff;
  console.log(`lab subjects checked        : ${total}`);
  console.log(`  identical (safe to drop)  : ${pass}`);
  console.log(`  label-only difference     : ${labelDiff}`);
  console.log(`  link/drill-down shape diff: ${shapeDiff}`);
  console.log(`  URLs UNREACHABLE          : ${urlGap}   <- blocks dropping the blob`);
  console.log(`  URLs the blob was hiding  : ${gained}   <- revealed by dropping it`);
  if (problems.length) {
    console.log("\nfirst 15:");
    for (const p of problems.slice(0, 15)) console.log(`  ${p}`);
  }
  fs.writeFileSync("lab-parity.json", JSON.stringify({ pass, labelDiff, shapeDiff, urlGap, problems }, null, 1));
  console.log("\ndetail -> lab-parity.json");
  process.exit(urlGap === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
