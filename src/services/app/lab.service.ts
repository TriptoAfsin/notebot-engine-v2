import { getDb } from "db/index";
import { labReports } from "db/schema";
import { eq, and, asc } from "drizzle-orm";
import { cacheService } from "./cache.service";

type LabSubject = { subjectSlug: string };
type LabTopic = { topicName: string };

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

  async getLabTopicsBySubject(levelId: number, subjectSlug: string) {
    const cacheKey = `labs:${levelId}:${subjectSlug}`;
    const cached = await cacheService.get<LabTopic[]>(cacheKey);
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

    // Get unique topic names
    const seen = new Set<string>();
    const topics = allLabs
      .filter((lab) => {
        if (seen.has(lab.topicName)) return false;
        seen.add(lab.topicName);
        return true;
      })
      .map((lab) => ({
        topicName: lab.topicName,
      }));

    await cacheService.set(cacheKey, topics);
    return topics;
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
