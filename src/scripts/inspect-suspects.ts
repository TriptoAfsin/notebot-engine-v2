/**
 * Dumps the contents of the subjects the audit flagged as duplicates or
 * badly-named buckets, plus the level-3/4 "Other" catch-alls, so the repair can
 * tell genuinely-new content apart from a re-import of an existing subject.
 * Read-only.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import { eq } from "drizzle-orm";

const SUSPECTS = ["econo", "om", "weaving2", "l3misc", "l4misc", "economics", "weave2", "ie"];

async function main() {
  const db = getDb();
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);
  const allLevels = await db.select().from(levels);
  const levelOf = (id: number) => allLevels.find((l) => l.id === id)?.slug;

  // url -> "level/subject/topic" so overlap between suspects is visible
  const placesOfUrl = new Map<string, string[]>();
  for (const n of allNotes) {
    const t = allTopics.find((x) => x.id === n.topicId);
    if (!t) continue;
    const s = allSubjects.find((x) => x.id === t.subjectId);
    if (!s) continue;
    const key = n.url.trim();
    if (!placesOfUrl.has(key)) placesOfUrl.set(key, []);
    placesOfUrl.get(key)!.push(`L${levelOf(s.levelId)}/${s.slug}/${t.slug}`);
  }

  for (const slug of SUSPECTS) {
    const subs = allSubjects.filter((s) => s.slug === slug);
    for (const s of subs) {
      const ts = allTopics.filter((t) => t.subjectId === s.id);
      const nCount = ts.reduce(
        (a, t) => a + allNotes.filter((n) => n.topicId === t.id).length,
        0
      );
      console.log(
        `\n##### L${levelOf(s.levelId)} ${s.slug} (id=${s.id}) "${s.displayName}" — ${ts.length} topics, ${nCount} notes`
      );
      const meta = (s.metadata ?? {}) as any;
      if (Object.keys(meta).length) console.log("   meta:", JSON.stringify(meta).slice(0, 200));
      for (const t of ts) {
        const ns = allNotes.filter((n) => n.topicId === t.id);
        console.log(`   topic "${t.displayName}" (slug=${t.slug}) — ${ns.length} notes`);
        for (const n of ns.slice(0, 40)) {
          const dupes = (placesOfUrl.get(n.url.trim()) ?? []).filter(
            (p) => !p.startsWith(`L${levelOf(s.levelId)}/${s.slug}/`)
          );
          console.log(
            `      "${n.title}"${dupes.length ? `   ALSO IN: ${[...new Set(dupes)].join(", ")}` : "   [unique]"}`
          );
        }
        if (ns.length > 40) console.log(`      ... +${ns.length - 40} more`);
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
