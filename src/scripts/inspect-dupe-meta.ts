/**
 * Shows what metadata the duplicate-titled notes carry, to judge whether a
 * distinct title can be synthesised from it. Read-only.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { notes } from "db/schema";
import { inArray } from "drizzle-orm";
import * as fs from "fs";

async function main() {
  const dupes = JSON.parse(fs.readFileSync("dupe-titles.json", "utf8"));
  const ids: number[] = dupes.slice(0, 6).flatMap((r: any) => r.noteIds);
  const db = getDb();
  const rows = await db.select().from(notes).where(inArray(notes.id, ids));

  let withMeta = 0;
  for (const r of rows) {
    const m = (r.metadata ?? {}) as any;
    const keys = Object.keys(m);
    if (keys.some((k) => m[k] != null && m[k] !== "")) withMeta++;
    console.log(`${r.id} ${JSON.stringify(r.title)} meta=${JSON.stringify(m)}`);
  }
  console.log(`\n${withMeta}/${rows.length} of the sampled duplicates carry usable metadata`);

  // whole-table view
  const all = await db.select().from(notes);
  const tally: Record<string, number> = {};
  for (const n of all) {
    for (const [k, v] of Object.entries((n.metadata ?? {}) as any)) {
      if (v != null && v !== "") tally[k] = (tally[k] ?? 0) + 1;
    }
  }
  console.log(`\nmetadata key coverage across all ${all.length} notes:`, tally);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
