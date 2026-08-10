/**
 * For notes the repair can only humanise (no v1 title found), show what the row
 * actually knows — v1File especially — to judge whether a real title is
 * recoverable from somewhere else. Read-only.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";

const SLUGS = ["imMunir", "electricSlides", "diffeqnBook", "woolSlides", "linearSolve", "ch1OmFlow"];

async function main() {
  const db = getDb();
  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);
  const levelSlug = (id: number) => allLevels.find((l) => l.id === id)?.slug ?? "?";

  for (const slug of SLUGS) {
    const rows = allNotes.filter((n) => String(n.title ?? "").trim() === slug);
    if (!rows.length) continue;
    const t = allTopics.find((x) => x.id === rows[0].topicId);
    const s = t ? allSubjects.find((x) => x.id === t.subjectId) : null;
    console.log(
      `\n##### "${slug}" — ${rows.length} notes @ /app/notes/${s ? levelSlug(s.levelId) : "?"}/${s?.slug}/${t?.slug}`
    );
    for (const n of rows) {
      console.log(`   id=${n.id} url=${n.url}`);
      console.log(`      meta=${JSON.stringify(n.metadata)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
