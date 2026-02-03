import { redis } from "config/redis";

const DEFAULT_TTL = 3600; // 1 hour in seconds
const KEY_PREFIX = "notebot:";

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(KEY_PREFIX + key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, data: unknown, ttl = DEFAULT_TTL): Promise<void> {
    try {
      await redis.set(KEY_PREFIX + key, JSON.stringify(data), "EX", ttl);
    } catch {
      // Silently fail - cache is optional
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(KEY_PREFIX + key);
    } catch {
      // Silently fail
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(KEY_PREFIX + pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Silently fail
    }
  },
};
