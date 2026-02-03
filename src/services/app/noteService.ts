import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import { eq, asc, type InferSelectModel } from "drizzle-orm";
import { cacheService } from "./cacheService";

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

  async getSubjectBySlug(levelId: number, slug: string) {
    const db = getDb();
    const allSubs = await db
      .select()
      .from(subjects)
      .where(eq(subjects.levelId, levelId));

    return allSubs.find((s) => s.slug === slug) || null;
  },

  async getTopicBySlug(subjectId: number, slug: string) {
    const db = getDb();
    const allTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, subjectId));

    return allTopics.find((t) => t.slug === slug || t.name === slug) || null;
  },
};
