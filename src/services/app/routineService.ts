import { getDb } from "db/index";
import { routines } from "db/schema";
import { asc } from "drizzle-orm";
import { cacheService } from "./cacheService";

export const routineService = {
  async getAllRoutines() {
    const cacheKey = "routines";
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(routines)
      .orderBy(asc(routines.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },
};
