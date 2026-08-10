/**
 * Why is each bespoke flow still bespoke?
 *
 * A flow lands in `bespoke-flows.json` when the database cannot reach every URL v1 shows. That has
 * two very different causes and only one of them is fixable by wiring:
 *
 *   - **absent**  — the URL exists nowhere in v2. Content that was never migrated; needs importing.
 *   - **misfiled** — the URL is in v2, but under something the payload does not resolve to. A
 *     wiring problem, fixable without touching content.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/audit-bespoke-gap.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { sql } from "drizzle-orm";

import { getDb } from "db/index";
import { resolveLabPayload, resolvePayload } from "services/chatbot/flow.service";

const BESPOKE = path.join(__dirname, "..", "db", "seed", "bespoke-flows.seed.json");

const driveId = (u: string) => {
  const m = u.match(/\/d\/([\w-]{10,})/) ?? u.match(/\/folders\/([\w-]{10,})/) ?? u.match(/[?&]id=([\w-]{10,})/);
  return m ? `drive:${m[1]}` : u.replace(/\/+$/, "").replace(/\?usp=sharing$/, "");
};

function urlsOf(blocks: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/https?:\/\/[^\s"'<>)]+/g)) out.add(driveId(m[0].replace(/[.,;)]+$/, "")));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk(blocks);
  return [...out];
}

async function main() {
  const db = getDb();
  const bespoke: Record<string, unknown[]> = JSON.parse(fs.readFileSync(BESPOKE, "utf8"));

  // Every URL v2 holds anywhere, and where it lives, so a miss can be explained.
  const { rows } = await db.execute<{ url: string; kind: string; where: string }>(sql`
    SELECT n.url, 'note' AS kind, s.slug || ' / ' || t.slug AS "where"
      FROM notes n JOIN topics t ON t.id = n.topic_id JOIN subjects s ON s.id = t.subject_id
    UNION ALL
    SELECT t.metadata->>'directUrl', 'directUrl', s.slug || ' / ' || t.slug
      FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.metadata->>'directUrl' IS NOT NULL
    UNION ALL SELECT url, 'lab', subject_slug || ' / ' || topic_name FROM lab_reports
    UNION ALL SELECT url, 'qb', subject_slug FROM question_banks
    UNION ALL SELECT url, 'routine', COALESCE(term,'') FROM routines
    UNION ALL SELECT url, 'syllabus', batch || ' ' || department FROM syllabuses
  `);

  const index = new Map<string, string>();
  for (const r of rows) if (r.url) index.set(driveId(r.url), `${r.kind}: ${r.where}`);
  console.log(`v2 holds ${index.size} distinct URLs\n`);

  let absentTotal = 0, misfiledTotal = 0;
  const report: Array<{ payload: string; absent: string[]; misfiled: Array<[string, string]> }> = [];

  for (const [payload, blocks] of Object.entries(bespoke)) {
    const v1Urls = urlsOf(blocks);
    if (!v1Urls.length) continue;

    const mine = (await resolvePayload(payload, { skipBespoke: true })) ?? (await resolveLabPayload(payload));
    const reached = new Set(urlsOf(mine ?? []));

    const absent: string[] = [];
    const misfiled: Array<[string, string]> = [];
    for (const u of v1Urls) {
      if (reached.has(u)) continue;
      const found = index.get(u);
      if (found) misfiled.push([u, found]);
      else absent.push(u);
    }
    if (!absent.length && !misfiled.length) continue;

    absentTotal += absent.length;
    misfiledTotal += misfiled.length;
    report.push({ payload, absent, misfiled });
  }

  console.log(`flows still short of parity : ${report.length}`);
  console.log(`  URLs absent from v2 entirely : ${absentTotal}  <- needs content import`);
  console.log(`  URLs present but not reached : ${misfiledTotal}  <- needs wiring only\n`);

  const byWhere: Record<string, number> = {};
  for (const r of report) for (const [, w] of r.misfiled) {
    const kind = w.split(":")[0];
    byWhere[kind] = (byWhere[kind] ?? 0) + 1;
  }
  console.log("misfiled URLs, by where they actually live:");
  for (const [k, n] of Object.entries(byWhere).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${n}`);

  console.log("\nworst offenders:");
  for (const r of report.sort((a, b) => (b.absent.length + b.misfiled.length) - (a.absent.length + a.misfiled.length)).slice(0, 12)) {
    console.log(`  ${r.payload.padEnd(26)} absent:${String(r.absent.length).padStart(3)} misfiled:${String(r.misfiled.length).padStart(3)}` +
      (r.misfiled[0] ? `   e.g. ${r.misfiled[0][1]}` : ""));
  }

  fs.writeFileSync("bespoke-gap.json", JSON.stringify({ absentTotal, misfiledTotal, report }, null, 1));
  console.log("\nfull detail -> bespoke-gap.json");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
