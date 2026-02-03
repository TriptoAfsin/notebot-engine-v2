import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = new Redis(redisUrl || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) {
      console.error("🔴 Redis connection failed after 3 retries");
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on("connect", () => {
  console.log("🟢 Connected to Redis");
});

redis.on("error", (err) => {
  console.error("🔴 Redis error:", err.message);
});

export async function connectRedis() {
  if (redis.status === "ready") return;
  await redis.ping();
}
