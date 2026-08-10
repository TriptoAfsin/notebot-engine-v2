/**
 * Second pass: the three defect shapes the main repair could not express.
 *
 *  1. BELE / Sociology — v1 lists these twice on level 4, once as a direct Drive
 *     link and once as a route to a page. v2 kept only the direct link, so the
 *     page behind it was unreachable and its folder counted as missing content.
 *     v2 already models this split for TAM as `tam_url` (direct) + `tam` (route),
 *     so we reshape these two the same way rather than inventing a new pattern.
 *
 *  2. A lab topic that is a dead end in v1 too (404 there, empty list here).
 *
 *  3. Truncated lab labels whose *name* contains a hyphen ("Jabbar(IPE-47,2023)"),
 *     which the main pass's "<header> - <title>" split mis-parsed. Matched and
 *     replaced whole-label instead of segment-wise.
 *
 * Dry-run by default; pass --apply.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics } from "db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

const APPLY = process.argv.includes("--apply");
const V1_CRAWL = "v1-crawl.json";

function keyOf(url: string): string {
  const u = String(url ?? "").trim();
  let m;
  if ((m = u.match(/drive\.google\.com\/file\/d\/([-\w]{10,})/))) return "f:" + m[1];
  if ((m = u.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([-\w]{10,})/)))
    return "d:" + m[1];
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/playlist\?list=)([-\w]+)/)))
    return "y:" + m[1];
  return u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}
const stripLeadEmoji = (s: string) =>
  String(s ?? "").replace(/^[\p{Extended_Pictographic}\p{So}️‍\s]+/u, "").trim();

const SPLIT_SUBJECTS = [
  { levelSlug: "4", slug: "bele", display: "BELE", v1Page: "/app/notes/4/bele" },
  { levelSlug: "4", slug: "sociology", display: "Sociology", v1Page: "/app/notes/4/sociology" },
];
const DEAD_LAB_TOPICS = [{ levelSlug: "2", subject: "sss1", topic: "sss1_lab_layoutPlan_flow" }];

async function main() {
  const v1 = JSON.parse(fs.readFileSync(V1_CRAWL, "utf8"));
  const v1Label = new Map<string, string>();
  for (const body of Object.values<any>(v1.pages)) {
    if (!Array.isArray(body)) continue;
    for (const i of body) {
      if (!i?.url) continue;
      const k = keyOf(i.url);
      const lbl = String(i.topic ?? i.subName ?? i.title ?? "");
      const prev = v1Label.get(k);
      if (lbl && (!prev || lbl.length > prev.length)) v1Label.set(k, lbl);
    }
  }

  const db = getDb();
  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const plan: string[] = [];

  // ---- 1. split direct-link subjects that also need a page ----
  const splitOps: any[] = [];
  for (const cfg of SPLIT_SUBJECTS) {
    const lvl = allLevels.find((l) => l.slug === cfg.levelSlug);
    if (!lvl) continue;
    const existing = allSubjects.find(
      (s) => s.levelId === lvl.id && s.slug.toLowerCase() === cfg.slug
    );
    if (!existing) continue;
    const meta = (existing.metadata ?? {}) as any;
    if (!meta.directUrl) {
      plan.push(`SKIP ${cfg.display}: already a route subject`);
      continue;
    }
    const v1Items = (v1.pages[cfg.v1Page] ?? []) as any[];
    if (!v1Items.length) {
      plan.push(`SKIP ${cfg.display}: v1 page empty`);
      continue;
    }
    plan.push(
      `SPLIT ${cfg.display}: "${cfg.slug}" -> "${cfg.slug}_url" (keeps ${meta.directUrl}), ` +
        `new route subject "${cfg.slug}" with ${v1Items.length} item(s)`
    );
    for (const it of v1Items)
      plan.push(`     + topic "${stripLeadEmoji(it.topic ?? "").replace(/\s*-\s*/, " — ")}" -> ${it.url}`);
    splitOps.push({ cfg, lvl, existing, meta, v1Items });
  }

  // ---- 2. dead lab topics ----
  const labTopicOps: any[] = [];
  for (const d of DEAD_LAB_TOPICS) {
    const lvl = allLevels.find((l) => l.slug === d.levelSlug);
    if (!lvl) continue;
    const meta = JSON.parse(JSON.stringify(lvl.metadata ?? {}));
    const arr = meta?.v1LabTopics?.[d.subject];
    if (!Array.isArray(arr)) continue;
    const before = arr.length;
    meta.v1LabTopics[d.subject] = arr.filter(
      (x: any) => !(x.route && String(x.route).endsWith(d.topic))
    );
    if (meta.v1LabLeaves?.[d.subject]) delete meta.v1LabLeaves[d.subject][d.topic];
    if (meta.v1LabTopics[d.subject].length !== before) {
      plan.push(`REMOVE dead lab topic /app/labs/${d.levelSlug}/${d.subject}/${d.topic}`);
      labTopicOps.push({ levelId: lvl.id, meta });
    }
  }

  // ---- 3. whole-label truncation fixes in the lab snapshots ----
  const labelOps: any[] = [];
  for (const l of allLevels) {
    const pending = labTopicOps.find((o) => o.levelId === l.id);
    const meta = pending?.meta ?? JSON.parse(JSON.stringify(l.metadata ?? {}));
    let touched = false;
    const fix = (obj: any, field: string, ctx: string) => {
      if (!obj?.url) return;
      const cur = String(obj[field] ?? "");
      const full = v1Label.get(keyOf(obj.url));
      if (!full || full.length <= cur.length || !full.startsWith(cur)) return;
      obj[field] = full;
      touched = true;
      plan.push(`RELABEL L${l.slug} ${ctx}: ${JSON.stringify(cur)} -> ${JSON.stringify(full)}`);
    };
    for (const [s, arr] of Object.entries<any>(meta.v1LabTopics ?? {}))
      for (const it of arr as any[]) fix(it, "topic", `v1LabTopics/${s}`);
    for (const [s, byT] of Object.entries<any>(meta.v1LabLeaves ?? {}))
      for (const [t, arr] of Object.entries<any>(byT as any))
        for (const it of arr as any[]) fix(it, "title", `v1LabLeaves/${s}/${t}`);
    if (touched || pending) labelOps.push({ levelId: l.id, meta });
  }

  console.log(APPLY ? "=== APPLYING ===" : "=== DRY RUN (pass --apply) ===\n");
  plan.forEach((p) => console.log("  " + p));
  console.log(`\n${plan.length} operations`);
  if (!APPLY) {
    console.log("nothing written.");
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(
    `parity-followup-backup-${stamp}.json`,
    JSON.stringify({ levels: allLevels, subjects: allSubjects.filter((s) => SPLIT_SUBJECTS.some((c) => c.slug === s.slug.toLowerCase())) }, null, 1)
  );

  for (const op of splitOps) {
    const { cfg, lvl, existing, meta, v1Items } = op;
    // keep the direct link under a _url slug, exactly as v2 already does for TAM
    await db
      .update(subjects)
      .set({ slug: `${cfg.slug}_url` })
      .where(eq(subjects.id, existing.id));
    const maxSort = Math.max(0, ...allSubjects.filter((s) => s.levelId === lvl.id).map((s) => s.sortOrder ?? 0));
    const [created] = await db
      .insert(subjects)
      .values({
        levelId: lvl.id,
        name: cfg.display,
        displayName: cfg.display,
        slug: cfg.slug,
        sortOrder: (existing.sortOrder ?? maxSort) + 1,
        metadata: { source: "parity-repair" },
      } as any)
      .returning();
    let sort = 0;
    for (const it of v1Items) {
      const title =
        stripLeadEmoji(String(it.topic ?? "")).replace(/\s*-\s*/, " — ").replace(/\s{2,}/g, " ").trim() ||
        "Full Notes";
      await db.insert(topics).values({
        subjectId: created.id,
        name: title,
        displayName: title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "fullnotes",
        sortOrder: sort++,
        metadata: { directUrl: it.url, source: "parity-repair" },
      } as any);
    }
    console.log(`split ${cfg.display}`);
  }

  for (const op of labelOps)
    await db.update(levels).set({ metadata: op.meta }).where(eq(levels.id, op.levelId));
  console.log(`rewrote ${labelOps.length} level metadata snapshots`);

  console.log("\ndone — flush the cache.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
