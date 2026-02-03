import { getDb } from "db/index";
import { questionBanks } from "db/schema";
import { eq, asc } from "drizzle-orm";
import { cacheService } from "./cache.service";

export const questionBankService = {
  async getByLevel(levelId: number) {
    const cacheKey = `qbs:${levelId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const result = await db
      .select()
      .from(questionBanks)
      .where(eq(questionBanks.levelId, levelId))
      .orderBy(asc(questionBanks.sortOrder));

    await cacheService.set(cacheKey, result);
    return result;
  },
};
