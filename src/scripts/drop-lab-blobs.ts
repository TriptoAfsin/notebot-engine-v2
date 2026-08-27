/**
 * Removes the frozen v1 lab snapshots so the compat route serves labs from the database.
 *
 * MUST run only after the renderer that replaces them is deployed. `compat.routes.ts` reads
 * `levels.metadata.v1LabTopics` at request time, so dropping the blob against an old build makes the
 * live API fall back to the previous DB rendering — raw `topic_name` labels and no direct links.
 *
 * Gate: `verify-lab-parity.ts` must report 0 unreachable URLs. It does (all 46 subjects), and
 * dropping additionally reveals 111 URLs the snapshots were hiding.
 *
 * `labSubjects` is kept: compat still maps a v1 route slug to a DB slug through it.
 * The removed blobs are written to lab-blobs-backup.json first.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/drop-lab-blobs.ts [--apply]
 */
import "dotenv/config";
import fs from "fs";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  const { rows } = await db.execute<{ id: number; slug: string; metadata: Record<string, unknown> | null }>(
    sql`SELECT id, slug, metadata FROM levels ORDER BY slug`
  );

  const backup: Record<string, unknown> = {};
  let willDrop = 0;
  for (const r of rows) {
    const meta = r.metadata ?? {};
    const has = "v1LabTopics" in meta || "v1LabLeaves" in meta;
    const subjects = Object.keys((meta.v1LabTopics as Record<string, unknown>) ?? {}).length;
    console.log(`level ${r.slug}: ${has ? `${subjects} frozen lab subject(s)` : "already clean"}`);
    if (!has) continue;
    backup[r.slug] = { v1LabTopics: meta.v1LabTopics, v1LabLeaves: meta.v1LabLeaves };
    willDrop++;
  }

  if (!willDrop) { console.log("nothing to drop"); process.exit(0); }

  fs.writeFileSync("lab-blobs-backup.json", JSON.stringify(backup, null, 1));
  console.log(`\nbackup -> lab-blobs-backup.json (${willDrop} level(s))`);

  if (!APPLY) { console.log("dry run — pass --apply to drop"); process.exit(0); }

  for (const r of rows) {
    await db.execute(sql`
      UPDATE levels SET metadata = (metadata - 'v1LabTopics') - 'v1LabLeaves' WHERE id = ${r.id}
    `);
  }
  console.log("blobs dropped; labs now served from lab_reports");

  const { rows: after } = await db.execute<{ slug: string; left: number }>(sql`
    SELECT slug,
      (CASE WHEN metadata ? 'v1LabTopics' OR metadata ? 'v1LabLeaves' THEN 1 ELSE 0 END)::int AS "left"
    FROM levels ORDER BY slug
  `);
  console.log("remaining blobs per level:", after.map((a) => `${a.slug}:${a.left}`).join(" "));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
