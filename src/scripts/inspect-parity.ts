/**
 * Read-only reconnaissance for the v1→v2 parity repair.
 *
 * The compat layer answers /app/* from pre-synced v1 snapshots held in jsonb
 * (subjects.metadata.v1Topics / v1Leaves, levels.metadata.v1LabTopics /
 * v1LabLeaves) and only falls back to topics/notes rows when a snapshot is
 * absent. A label therefore has to be fixed in whichever of those two places
 * actually serves it — this script reports which, and writes nothing.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

type Row = Record<string, any>;

async function main() {
  const db = getDb();

  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);

  const report: Row = {
    counts: {
      levels: allLevels.length,
      subjects: allSubjects.length,
      topics: allTopics.length,
      notes: allNotes.length,
    },
    levels: allLevels.map((l) => {
      const m = (l.metadata ?? {}) as Row;
      return {
        id: l.id,
        slug: l.slug,
        displayName: l.displayName,
        metaKeys: Object.keys(m),
        labSubjects: (m.labSubjects ?? []).length,
        v1LabTopicKeys: Object.keys(m.v1LabTopics ?? {}),
        v1LabLeafSubjects: Object.keys(m.v1LabLeaves ?? {}),
      };
    }),
    subjectsByLevel: {} as Row,
  };

  for (const l of allLevels) {
    const subs = allSubjects.filter((s) => s.levelId === l.id);
    report.subjectsByLevel[l.slug] = subs.map((s) => {
      const m = (s.metadata ?? {}) as Row;
      return {
        id: s.id,
        slug: s.slug,
        displayName: s.displayName,
        sortOrder: s.sortOrder,
        hasDirectUrl: !!m.directUrl,
        directUrl: m.directUrl,
        v1RouteOverride: m.v1RouteOverride,
        v1TopicCount: (m.v1Topics ?? []).length,
        v1LeafKeys: Object.keys(m.v1Leaves ?? {}).length,
        dbTopics: allTopics.filter((t) => t.subjectId === s.id).length,
      };
    });
  }

  // Which serving path does each subject actually use?
  const served = { snapshot: 0, dbFallback: 0, empty: 0 };
  for (const s of allSubjects) {
    const m = (s.metadata ?? {}) as Row;
    if ((m.v1Topics ?? []).length > 0) served.snapshot++;
    else if (allTopics.filter((t) => t.subjectId === s.id).length > 0) served.dbFallback++;
    else served.empty++;
  }
  report.servingPath = served;

  fs.writeFileSync("parity-inspect.json", JSON.stringify(report, null, 1));

  console.log("counts:", report.counts);
  console.log("serving path:", served);
  console.log("\nlevels:");
  for (const l of report.levels) {
    console.log(
      `  ${l.slug} id=${l.id} meta=[${l.metaKeys.join(",")}] labSubjects=${l.labSubjects} v1LabTopics=${l.v1LabTopicKeys.length} v1LabLeaves=${l.v1LabLeafSubjects.length}`
    );
  }
  console.log("\nwrote parity-inspect.json");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
