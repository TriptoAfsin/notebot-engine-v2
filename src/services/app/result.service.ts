import { getDb } from "db/index";
import { results } from "db/schema";
import { asc } from "drizzle-orm";
import { cacheService } from "./cache.service";

export const resultService = {
  async getAllResults() {
    const cacheKey = "results";
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(results)
      .orderBy(asc(results.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },
};
