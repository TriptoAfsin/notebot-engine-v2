import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import { eq, asc, type InferSelectModel } from "drizzle-orm";
import { cacheService } from "./cache.service";

type Level = InferSelectModel<typeof levels>;
type Subject = InferSelectModel<typeof subjects>;
type Topic = InferSelectModel<typeof topics>;
type Note = InferSelectModel<typeof notes>;

export const noteService = {
  async getAllLevels() {
    const cacheKey = "levels";
    const cached = await cacheService.get<Level[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(levels)
      .orderBy(asc(levels.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },

  async getSubjectsByLevel(levelId: number) {
    const cacheKey = `subjects:${levelId}`;
    const cached = await cacheService.get<Subject[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(subjects)
      .where(eq(subjects.levelId, levelId))
      .orderBy(asc(subjects.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },

  async getTopicsBySubject(subjectId: number) {
    const cacheKey = `topics:${subjectId}`;
    const cached = await cacheService.get<Topic[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, subjectId))
      .orderBy(asc(topics.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },

  async getNotesByTopic(topicId: number) {
    const cacheKey = `notes:${topicId}`;
    const cached = await cacheService.get<Note[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(notes)
      .where(eq(notes.topicId, topicId))
      .orderBy(asc(notes.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },

  async getLevelBySlug(slug: string) {
    const db = getDb();
    const [result] = await db
      .select()
      .from(levels)
      .where(eq(levels.slug, slug));
    return result || null;
  },

  /**
   * Slug matching is case-insensitive.
   *
   * Some subjects were stored with an upper-case slug ("IAE") while v1 links to them in lower
   * case, so an exact compare made `/app/notes/1/iae` a 404 against a subject that exists — and
   * the same exact-compare in the reconciler is what created a duplicate `iae` subject alongside
   * `IAE`. An exact match still wins over a case-insensitive one, so a hypothetical pair of
   * subjects differing only in case keeps resolving deterministically.
   */
  async getSubjectBySlug(levelId: number, slug: string) {
    const db = getDb();
    const allSubs = await db
      .select()
      .from(subjects)
      .where(eq(subjects.levelId, levelId));

    const wanted = slug.toLowerCase();
    return (
      allSubs.find((s) => s.slug === slug) ||
      allSubs.find((s) => s.slug.toLowerCase() === wanted) ||
      null
    );
  },

  async getTopicBySlug(subjectId: number, slug: string) {
    const db = getDb();
    const allTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, subjectId));

    const wanted = slug.toLowerCase();
    return (
      allTopics.find((t) => t.slug === slug || t.name === slug) ||
      allTopics.find(
        (t) => t.slug.toLowerCase() === wanted || t.name.toLowerCase() === wanted
      ) ||
      null
    );
  },
};
