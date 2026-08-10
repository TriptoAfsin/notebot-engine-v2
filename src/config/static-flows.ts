import fs from "fs";
import path from "path";

/**
 * Bespoke flows that are not rows in the content tables.
 *
 * Everything the database can address — topics, subjects, levels, labs, routines, syllabuses — is
 * resolved live by `flow.service.ts`, so a CMS edit shows up in the bot immediately. What is left
 * over is genuinely editorial: the usage instructions, donation details, top-level menus, partner
 * cards, the human-handoff line. Those are config, and they live here.
 *
 * The file is **generated** from v1's own output by
 * `src/scripts/build-static-flows.ts`, which asks the resolver about every one of v1's payloads and
 * keeps only the ones it cannot answer. That keeps the set honest: it shrinks automatically as more
 * content moves into the database, and it cannot silently duplicate something the DB already serves.
 *
 * Regenerate with:
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/build-static-flows.ts
 */

export type Block = Record<string, unknown>;

// Named distinctly from this module: a sibling `static-flows.json` shadows `config/static-flows`
// in module resolution, and the import silently returns the JSON instead of these functions.
const DATA_FILE = path.join(__dirname, "bespoke-flows.json");

type StaticData = Record<string, Block[]>;

let cache: StaticData | null = null;

function load(): StaticData {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as StaticData;
  } catch {
    // Missing or unreadable is not fatal: the DB resolver still answers every content payload, and
    // an unmatched payload falls through to search rather than erroring.
    console.warn(`static flows unavailable at ${DATA_FILE} — bespoke flows will fall back to search`);
    cache = {};
  }
  return cache;
}

/** Looks up a bespoke flow by lowercased payload. Returns null when there is none. */
export function getStaticFlow(payload: string): Block[] | null {
  const blocks = load()[payload];
  return blocks && blocks.length ? blocks : null;
}

/** Number of bespoke flows currently loaded — surfaced by the bot's status endpoint. */
export const staticFlowCount = () => Object.keys(load()).length;
