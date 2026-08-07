/**
 * Syllabus data, served from the `syllabuses` table and managed in the CMS.
 * Previously this file held the v1 links as hardcoded arrays; the shapes returned here are
 * unchanged so the /app/syllabus compat routes keep their existing response contract.
 */
import { getDb } from "db/index";
import { syllabuses } from "db/schema";
import { and, eq, asc } from "drizzle-orm";
import { cacheService } from "./cache.service";

type SyllabusBatch = { batch: string; route: string };
type SyllabusDept = { dept: string; route: string };
type SyllabusTopic = { topic: string; url: string };

export const syllabusService = {
  async getBatches(): Promise<SyllabusBatch[]> {
    const cacheKey = "syllabus:batches";
    const cached = await cacheService.get<SyllabusBatch[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const rows = await db
      .selectDistinct({ batch: syllabuses.batch })
      .from(syllabuses)
      .orderBy(asc(syllabuses.batch));

    const result = rows.map((r) => ({ batch: r.batch, route: `app/syllabus/${r.batch}` }));
    await cacheService.set(cacheKey, result);
    return result;
  },

  async getDepts(batch: string): Promise<SyllabusDept[] | null> {
    const cacheKey = `syllabus:depts:${batch}`;
    const cached = await cacheService.get<SyllabusDept[]>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const rows = await db
      .selectDistinct({
        departmentSort: syllabuses.departmentSort,
        department: syllabuses.department,
        departmentName: syllabuses.departmentName,
      })
      .from(syllabuses)
      .where(eq(syllabuses.batch, batch))
      // curriculum order first (AE, YE, FE, …), name only as a tie-break
      .orderBy(asc(syllabuses.departmentSort), asc(syllabuses.department));

    if (rows.length === 0) return null;

    const result = rows.map((r) => ({
      dept: r.departmentName,
      route: `app/syllabus/${batch}/${r.department}`,
    }));
    await cacheService.set(cacheKey, result);
    return result;
  },

  async getTopics(batch: string, dept: string): Promise<SyllabusTopic[] | SyllabusTopic | null> {
    const key = dept.toLowerCase();
    const cacheKey = `syllabus:topics:${batch}:${key}`;
    const cached = await cacheService.get<SyllabusTopic[] | SyllabusTopic>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const rows = await db
      .select({ topic: syllabuses.topic, url: syllabuses.url })
      .from(syllabuses)
      .where(and(eq(syllabuses.batch, batch), eq(syllabuses.department, key)))
      .orderBy(asc(syllabuses.sortOrder), asc(syllabuses.id));

    if (rows.length === 0) return null;

    // Batch 46/all returned a bare object rather than an array in v1. These are [V1] compat
    // routes, so the quirk is reproduced literally instead of generalised to "any single row"
    // — that would silently change the response shape for future one-entry departments.
    const result: SyllabusTopic[] | SyllabusTopic =
      batch === "46" && key === "all" && rows.length === 1 ? rows[0] : rows;
    await cacheService.set(cacheKey, result);
    return result;
  },
};
