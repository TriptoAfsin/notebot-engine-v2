import { getDb } from "db/index";
import { labReports } from "db/schema";
import { eq, and, asc } from "drizzle-orm";
import { cacheService } from "./cache.service";

type LabSubject = { subjectSlug: string };
type LabTopic = { topicName: string };

/**
 * One entry on a lab subject's page.
 *
 * `url` present = a direct web button (one tap to the file). Absent = a drill-down group. v1 shows
 * both, and collapsing them into one kind is what added a tap to 196 links.
 */
type LabTopicEntry = { topicName: string; display: string; url?: string };

export const labService = {
  async getLabSubjectsByLevel(levelId: number) {
    const cacheKey = `labs:${levelId}`;
    const cached = await cacheService.get<LabSubject[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    // Get distinct subject slugs for this level
    const allLabs = await db
      .select()
      .from(labReports)
      .where(eq(labReports.levelId, levelId))
      .orderBy(asc(labReports.sortOrder));

    // Get unique subjects
    const seen = new Set<string>();
    const subjects = allLabs
      .filter((lab) => {
        if (seen.has(lab.subjectSlug)) return false;
        seen.add(lab.subjectSlug);
        return true;
      })
      .map((lab) => ({
        subjectSlug: lab.subjectSlug,
      }));

    await cacheService.set(cacheKey, subjects);
    return subjects;
  },

  /**
   * A lab subject's page, in the shape v1 emits.
   *
   * v1 shows two kinds of entry and the difference is visible to students: a direct web button (one
   * tap to the file) and a drill-down into a group. Returning everything as a drill-down - which
   * this used to do - silently added a tap to 196 links and showed internal keys (`phy2LabE1`)
   * where v1 shows `E1`.
   *
   * `metadata.v1Display` / `v1Kind` carry v1's label and entry kind, imported from the frozen lab
   * blobs by scripts/import-lab-blobs.ts. Rows added later (CMS, apply-ingest) have neither, so they
   * fall back to v1's own convention: a group of one reads as a direct link under a pin header,
   * which is how v1 renders a web button.
   */
  async getLabTopicsBySubject(levelId: number, subjectSlug: string) {
    const cacheKey = `labs:${levelId}:${subjectSlug}`;
    const cached = await cacheService.get<LabTopicEntry[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const allLabs = await db
      .select()
      .from(labReports)
      .where(
        and(
          eq(labReports.levelId, levelId),
          eq(labReports.subjectSlug, subjectSlug)
        )
      )
      .orderBy(asc(labReports.sortOrder));

    // Counted over UNLABELLED rows only. The blob importer buckets its links under a derived
    // topic_name ("All Lab Reports"), so counting every row would let an imported link flip an
    // unlabelled single row into a drill-down - which is exactly what hid a freshly ingested report.
    const unlabelledInGroup = new Map<string, number>();
    for (const lab of allLabs) {
      const m = (lab.metadata ?? {}) as Record<string, unknown>;
      if (typeof m.v1Kind === "string") continue;
      unlabelledInGroup.set(lab.topicName, (unlabelledInGroup.get(lab.topicName) ?? 0) + 1);
    }

    const entries: LabTopicEntry[] = [];
    const seen = new Set<string>();

    for (const lab of allLabs) {
      const meta = (lab.metadata ?? {}) as Record<string, unknown>;
      const kind = typeof meta.v1Kind === "string" ? meta.v1Kind : null;
      const display = typeof meta.v1Display === "string" ? meta.v1Display : null;

      // A direct link is its own entry, never deduplicated by topic: several links can share one
      // bucket, the way "All Lab Reports -2022" and "-Tahin(2025)" sit under a single header.
      if (kind === "link") {
        entries.push({ topicName: lab.topicName, display: display ?? lab.title, url: lab.url });
        continue;
      }

      if (seen.has(lab.topicName)) continue;
      seen.add(lab.topicName);

      if (kind === "topic") {
        entries.push({ topicName: lab.topicName, display: display ?? lab.topicName });
        continue;
      }

      // No imported metadata: a group of one behaves like a web button, more than one like a
      // drill-down.
      if ((unlabelledInGroup.get(lab.topicName) ?? 0) === 1) {
        entries.push({
          topicName: lab.topicName,
          display: `\u{1F4CC} ${lab.topicName} -${lab.title}`,
          url: lab.url,
        });
      } else {
        entries.push({ topicName: lab.topicName, display: lab.topicName });
      }
    }

    await cacheService.set(cacheKey, entries);
    return entries;
  },

  async getLabItems(levelId: number, subjectSlug: string, topicName: string) {
    const db = getDb();
    return db
      .select()
      .from(labReports)
      .where(
        and(
          eq(labReports.levelId, levelId),
          eq(labReports.subjectSlug, subjectSlug),
          eq(labReports.topicName, topicName)
        )
      )
      .orderBy(asc(labReports.sortOrder));
  },

  async getAllLabsByLevel(levelId: number) {
    const db = getDb();
    return db
      .select()
      .from(labReports)
      .where(eq(labReports.levelId, levelId))
      .orderBy(asc(labReports.sortOrder));
  },
};
