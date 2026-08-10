/**
 * Finds notes that share a title with a sibling under the same topic. The user
 * sees N identical buttons and cannot tell them apart — the reconciler fell back
 * to the topic name when a submission carried no title of its own. Read-only.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import * as fs from "fs";

async function main() {
  const db = getDb();
  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);
  const levelSlug = (id: number) => allLevels.find((l) => l.id === id)?.slug ?? "?";

  const out: any[] = [];
  for (const t of allTopics) {
    const s = allSubjects.find((x) => x.id === t.subjectId);
    if (!s) continue;
    const ns = allNotes.filter((n) => n.topicId === t.id);
    const byTitle = new Map<string, typeof ns>();
    for (const n of ns) {
      const k = String(n.title ?? "").trim().toLowerCase();
      if (!byTitle.has(k)) byTitle.set(k, [] as any);
      byTitle.get(k)!.push(n);
    }
    for (const [title, group] of byTitle) {
      if (group.length < 2) continue;
      out.push({
        where: `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`,
        topicId: t.id,
        topicName: t.displayName,
        title: group[0].title,
        count: group.length,
        noteIds: group.map((n) => n.id),
        urls: group.map((n) => n.url),
      });
    }
  }
  out.sort((a, b) => b.count - a.count);
  fs.writeFileSync("dupe-titles.json", JSON.stringify(out, null, 1));
  console.log(`topics with duplicate note titles: ${out.length}`);
  console.log(`total affected notes: ${out.reduce((a, r) => a + r.count, 0)}`);
  for (const r of out.slice(0, 20))
    console.log(`  ${r.count}x ${JSON.stringify(r.title)}  @ ${r.where}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
