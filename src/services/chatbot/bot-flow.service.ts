import { sql } from "drizzle-orm";

import { getDb } from "db/index";
import { cacheService } from "services/app/cache.service";

/**
 * Reads bespoke Messenger flows from the `bot_flows` table.
 *
 * These replace the committed `bespoke-flows.json`. Content the bot sends must be editable without
 * a deploy — that is the whole point of the v2 migration — so the help text, menus, donation details
 * and partner cards live in the database alongside the notes.
 *
 * The whole table is small (a few hundred rows, a few hundred KB) and every postback consults it, so
 * it is loaded once and cached rather than queried per message. A CMS edit calls
 * `invalidateBotFlows()`, and the 1-hour TTL is the backstop if something writes directly to SQL.
 */

export type Block = Record<string, unknown>;

const CACHE_KEY = "botflows:all";
/** Process-local memo on top of Redis: a postback should not pay a network hop to answer. */
let memo: { at: number; map: Map<string, Block[]> } | null = null;
const MEMO_MS = 60_000;

type Row = { payload: string; blocks: Block[] };

async function loadAll(): Promise<Map<string, Block[]>> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.map;

  let rows = await cacheService.get<Row[]>(CACHE_KEY);
  if (!rows) {
    const db = getDb();
    const result = await db.execute<Row>(sql`
      SELECT lower(payload) AS payload, blocks FROM bot_flows WHERE enabled = true
    `);
    rows = result.rows.map((r) => ({ payload: r.payload, blocks: r.blocks }));
    await cacheService.set(CACHE_KEY, rows);
  }

  const map = new Map<string, Block[]>();
  for (const r of rows) {
    if (Array.isArray(r.blocks) && r.blocks.length) map.set(r.payload, r.blocks);
  }
  memo = { at: Date.now(), map };
  return map;
}

/** Blocks for a payload, or null. Never throws: a database blip must not silence the bot. */
export async function getBotFlow(payload: string): Promise<Block[] | null> {
  try {
    const map = await loadAll();
    return map.get(String(payload ?? "").toLowerCase()) ?? null;
  } catch (err) {
    console.error("[bot-flows] lookup failed", err);
    return null;
  }
}

export async function invalidateBotFlows(): Promise<void> {
  memo = null;
  await cacheService.del(CACHE_KEY);
}

/** Diagnostics for the bot status endpoint. */
export async function botFlowCount(): Promise<number> {
  try {
    return (await loadAll()).size;
  } catch {
    return 0;
  }
}
