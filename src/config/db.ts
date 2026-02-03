import { getPool } from "db/index";

export async function connectDb() {
  try {
    const pool = getPool();
    const client = await pool.connect();
    client.release();
    console.log("🟢 Connected to Postgres");
  } catch (err) {
    console.error("🔴 Error connecting to Postgres", err);
    throw err;
  }
}
