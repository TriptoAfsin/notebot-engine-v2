import dotenv from "dotenv";
dotenv.config();
import { redis } from "config/redis";

async function flush() {
  const keys = await redis.keys("notebot:*");
  console.log(`Found ${keys.length} notebot cache keys`);
  if (keys.length > 0) {
    for (const key of keys) console.log(`  ${key}`);
    await redis.del(...keys);
    console.log("Flushed all");
  }
  await redis.quit();
}
flush();
