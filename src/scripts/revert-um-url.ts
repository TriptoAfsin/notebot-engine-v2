/**
 * Restores the Level-3 UM link to the URL v2 already had.
 *
 * repair-parity.ts initially treated v1's UM folder as "missing content" and
 * overwrote v2's with it. v1 and v2 point at two different Drive folders and
 * nothing in either engine says which is current, so the correct behaviour is
 * to leave v2's alone and report the conflict. The guard now in repair-parity
 * prevents a repeat; this undoes the one row it already changed.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects } from "db/schema";
import { eq } from "drizzle-orm";

const V2_ORIGINAL = "https://drive.google.com/drive/folders/1JtOZ552EnvWUX8RZ-5XA1WaQliujL-TV?usp=sharing";

async function main() {
  const db = getDb();
  const allLevels = await db.select().from(levels);
  const l3 = allLevels.find((l) => l.slug === "3")!;
  const subs = await db.select().from(subjects).where(eq(subjects.levelId, l3.id));
  const um = subs.find((s) => s.slug.toLowerCase() === "um");
  if (!um) {
    console.error("no UM subject on level 3");
    process.exit(1);
  }
  const meta = (um.metadata ?? {}) as any;
  console.log("current:", meta.directUrl);
  if (meta.directUrl === V2_ORIGINAL) {
    console.log("already the v2 URL — nothing to do");
    process.exit(0);
  }
  await db
    .update(subjects)
    .set({ metadata: { ...meta, directUrl: V2_ORIGINAL } })
    .where(eq(subjects.id, um.id));
  console.log("restored:", V2_ORIGINAL);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
