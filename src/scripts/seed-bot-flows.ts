/**
 * Creates `bot_flows` and moves the bespoke flows out of the committed JSON into it.
 *
 * After this runs, nothing the bot sends is hardcoded: content comes from the content tables, and the
 * editorial flows come from `bot_flows`, which the CMS can edit.
 *
 * Idempotent — re-running upserts by payload, so it can be used to refresh after regenerating the
 * residual with `bot:build-flows`.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/seed-bot-flows.ts [--prune]
 *   --prune  also deletes rows whose payload is no longer in the JSON (i.e. now DB-resolvable)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";

// Seed data, not a runtime path: the bot reads bot_flows, never this file.
const SOURCE = path.join(__dirname, "..", "db", "seed", "bespoke-flows.seed.json");
const PRUNE = process.argv.includes("--prune");

/** Grouping for the CMS list, derived from the payload's shape. */
function classify(payload: string): { kind: string; label: string } {
  const p = payload.toLowerCase();
  const titled = payload.replace(/_flow$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (/^(get_started|getstarted)$/.test(p)) return { kind: "menu", label: "Get started" };
  if (/^(notes|qb|reports|help|result|routine|syllabus)_flow$/.test(p)) return { kind: "menu", label: `${titled} menu` };
  if (/donat|bkash|nagad|roket|rocket|surecash/.test(p)) return { kind: "donation", label: titled };
  if (/manza/.test(p)) return { kind: "partner", label: titled };
  if (/joke|quote|song|game|dino|toss/.test(p)) return { kind: "entertainment", label: titled };
  if (/^level_\d(_lab)?$/.test(p)) return { kind: "level", label: titled };
  if (/_lab(_flow)?$/.test(p)) return { kind: "lab", label: titled };
  if (/^(academic|affli)_res|^result_/.test(p)) return { kind: "results", label: titled };
  if (/^syllabus/.test(p)) return { kind: "syllabus", label: titled };
  if (/_flow$/.test(p)) return { kind: "subject", label: titled };
  return { kind: "other", label: titled };
}

async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bot_flows (
      id          serial PRIMARY KEY,
      payload     varchar(200) NOT NULL UNIQUE,
      label       varchar(200),
      kind        varchar(40)  NOT NULL DEFAULT 'other',
      blocks      jsonb        NOT NULL,
      enabled     boolean      NOT NULL DEFAULT true,
      metadata    jsonb,
      created_at  timestamp    NOT NULL DEFAULT now(),
      updated_at  timestamp    NOT NULL DEFAULT now()
    )
  `);
  // The bot looks these up by lowercased payload on every postback.
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bot_flows_payload_lower_idx ON bot_flows (lower(payload))`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bot_flows_kind_idx ON bot_flows (kind)`);
  console.log("bot_flows ready");

  const source: Record<string, Record<string, unknown>[]> = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const payloads = Object.keys(source);
  console.log(`seeding ${payloads.length} flows from ${path.basename(SOURCE)}`);

  let inserted = 0, updated = 0;
  for (const payload of payloads) {
    const blocks = source[payload];
    if (!Array.isArray(blocks) || !blocks.length) continue;
    const { kind, label } = classify(payload);

    const { rows } = await db.execute<{ existed: boolean }>(sql`
      INSERT INTO bot_flows (payload, label, kind, blocks, metadata)
      VALUES (${payload.toLowerCase()}, ${label}, ${kind}, ${JSON.stringify(blocks)}::jsonb,
              ${JSON.stringify({ source: "v1-extract" })}::jsonb)
      ON CONFLICT (payload) DO UPDATE
        SET blocks = EXCLUDED.blocks, label = COALESCE(bot_flows.label, EXCLUDED.label),
            kind = EXCLUDED.kind, updated_at = now()
      RETURNING (xmax <> 0) AS existed
    `);
    if (rows[0]?.existed) updated++; else inserted++;
  }

  console.log(`  inserted ${inserted}, updated ${updated}`);

  if (PRUNE) {
    const keep = payloads.map((p) => p.toLowerCase());
    const { rows } = await db.execute<{ payload: string }>(sql`
      DELETE FROM bot_flows
       WHERE metadata->>'source' = 'v1-extract'
         AND lower(payload) <> ALL(${sql`ARRAY[${sql.join(keep.map((k) => sql`${k}`), sql`, `)}]::text[]`})
      RETURNING payload
    `);
    console.log(`  pruned ${rows.length} flows now served from the content tables`);
    if (rows.length) console.log(`    ${rows.slice(0, 8).map((r) => r.payload).join(", ")}`);
  }

  const { rows: total } = await db.execute<{ n: number; kinds: number }>(sql`
    SELECT COUNT(*)::int AS n, COUNT(DISTINCT kind)::int AS kinds FROM bot_flows WHERE enabled = true
  `);
  console.log(`bot_flows now holds ${total[0].n} enabled flows across ${total[0].kinds} kinds`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
