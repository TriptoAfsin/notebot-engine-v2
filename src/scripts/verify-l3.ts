/** Ground truth for what level 3/2 actually hold after the repair. Read-only. */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects } from "db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDb();
  const allLevels = await db.select().from(levels);
  for (const slug of ["2", "3"]) {
    const lvl = allLevels.find((l) => l.slug === slug)!;
    const subs = await db.select().from(subjects).where(eq(subjects.levelId, lvl.id));
    console.log(`\n### level ${slug} (id=${lvl.id}) — ${subs.length} subjects in DB`);
    for (const s of subs.filter((x) =>
      /^(scm|um|ietex|spe)$/i.test(x.slug)
    )) {
      console.log(
        `   slug=${s.slug} name=${JSON.stringify(s.displayName)} sort=${s.sortOrder} meta=${JSON.stringify(s.metadata)}`
      );
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
