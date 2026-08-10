/**
 * Builds the v1→v2 parity repair plan from live v1 crawl data. Read-only:
 * writes plan JSON, touches no rows.
 *
 * v1 is the source of truth for labels. Matching is by resource identity
 * (Drive file/folder id, YouTube playlist id), never by route name, because the
 * two engines slug their routes differently.
 *
 * v1 glues a group header onto every button ("📌 QB Solve- Arjan(2021)"), so
 * only the trailing *title segment* is ever copied across — restoring the whole
 * v1 string would re-introduce the header duplication that v2 deliberately
 * dropped.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import * as fs from "fs";

const V1_CRAWL = process.env.V1_CRAWL ?? "v1-crawl.json";

export function keyOf(url: string): string {
  const u = String(url ?? "").trim();
  let m;
  if ((m = u.match(/drive\.google\.com\/file\/d\/([-\w]{10,})/))) return "f:" + m[1];
  if ((m = u.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([-\w]{10,})/)))
    return "d:" + m[1];
  if ((m = u.match(/drive\.google\.com\/open\?id=([-\w]{10,})/))) return "f:" + m[1];
  if ((m = u.match(/docs\.google\.com\/\w+\/d\/([-\w]{10,})/))) return "g:" + m[1];
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/playlist\?list=)([-\w]+)/)))
    return "y:" + m[1];
  return u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/** v1 labels are "<header> - <title>"; only the title travels. */
export function titleSegment(s: string): string {
  const parts = String(s ?? "").split(/ ?-{1,2} ?/);
  return parts[parts.length - 1].trim();
}

const isSlugLabel = (s: string) => {
  const t = String(s ?? "").trim();
  return t.length > 3 && !/\s/.test(t) && /^[a-z][A-Za-z0-9]*$/.test(t) && /[a-z][A-Z0-9]/.test(t);
};
const hasMojibake = (s: string) => /�/.test(String(s ?? ""));

/** "econoClassLec" -> "Econo Class Lec" — last-resort when v1 has no counterpart. */
const humanize = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

async function main() {
  if (!fs.existsSync(V1_CRAWL)) {
    console.error(`missing ${V1_CRAWL} — set V1_CRAWL to the v1 crawl dump`);
    process.exit(1);
  }
  const v1 = JSON.parse(fs.readFileSync(V1_CRAWL, "utf8"));

  // v1 resource key -> best label (prefer one that isn't itself truncated)
  const v1Label = new Map<string, string>();
  const v1Pages = new Map<string, any[]>();
  for (const [p, body] of Object.entries<any>(v1.pages)) {
    const arr = Array.isArray(body) ? body : null;
    if (!arr) continue;
    v1Pages.set(p, arr);
    for (const i of arr) {
      if (!i || typeof i !== "object" || !i.url) continue;
      const k = keyOf(i.url);
      const label = titleSegment(i.topic ?? i.subName ?? i.title ?? "");
      const prev = v1Label.get(k);
      if (!prev || label.length > prev.length) v1Label.set(k, label);
    }
  }

  const db = getDb();
  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);
  const levelSlug = (id: number) => allLevels.find((l) => l.id === id)?.slug ?? "?";
  const subjOf = (t: any) => allSubjects.find((s) => s.id === t.subjectId);

  const plan: any = {
    generatedFrom: V1_CRAWL,
    topicRelabel: [],
    noteRelabel: [],
    emptyTopics: [],
    duplicateTopics: [],
    missingResources: [],
    stats: {},
  };

  // ---- 1. topic display names (these are the subject-page buttons) ----
  for (const t of allTopics) {
    const s = subjOf(t);
    if (!s) continue;
    const meta = (t.metadata ?? {}) as any;
    const cur = String(t.displayName ?? "");
    const where = `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`;
    const v1 = meta.directUrl ? v1Label.get(keyOf(meta.directUrl)) : undefined;

    let next: string | null = null;
    let reason = "";

    if (hasMojibake(cur)) {
      next = v1 ?? cur.replace(/�\s*/g, "").trim();
      reason = "mojibake";
    } else if (/^english songs$/i.test(cur) && meta.directUrl && v1 && !/^english songs$/i.test(v1)) {
      next = v1;
      reason = "english-songs-mislabel";
    } else if (isSlugLabel(cur)) {
      next = v1 && !isSlugLabel(v1) ? v1 : humanize(cur);
      reason = v1 && !isSlugLabel(v1) ? "slug->v1" : "slug->humanized";
    } else if (titleSegment(cur).length === 15 && v1 && v1.startsWith(titleSegment(cur)) && v1.length > 15) {
      next = cur.slice(0, cur.length - titleSegment(cur).length) + v1;
      reason = "truncated-15";
    }

    if (next && next !== cur) {
      plan.topicRelabel.push({ id: t.id, where, from: cur, to: next, reason });
    }
  }

  // ---- 2. note titles (leaf items) ----
  for (const n of allNotes) {
    const t = allTopics.find((x) => x.id === n.topicId);
    if (!t) continue;
    const s = subjOf(t);
    if (!s) continue;
    const cur = String(n.title ?? "");
    const v1 = v1Label.get(keyOf(n.url));
    const where = `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`;

    let next: string | null = null;
    let reason = "";

    if (hasMojibake(cur)) {
      next = v1 ?? cur.replace(/�\s*/g, "").trim();
      reason = "mojibake";
    } else if (/^english songs$/i.test(cur) && v1 && !/^english songs$/i.test(v1)) {
      next = v1;
      reason = "english-songs-mislabel";
    } else if (isSlugLabel(cur)) {
      next = v1 && !isSlugLabel(v1) ? v1 : humanize(cur);
      reason = v1 && !isSlugLabel(v1) ? "slug->v1" : "slug->humanized";
    } else if (titleSegment(cur).length === 15 && v1 && v1.startsWith(titleSegment(cur)) && v1.length > 15) {
      next = cur.slice(0, cur.length - titleSegment(cur).length) + v1;
      reason = "truncated-15";
    }

    if (next && next !== cur) {
      plan.noteRelabel.push({ id: n.id, where, from: cur, to: next, reason });
    }
  }

  // ---- 3. topics that render a button but serve nothing ----
  for (const t of allTopics) {
    const meta = (t.metadata ?? {}) as any;
    if (meta.directUrl) continue;
    const childCount = allNotes.filter((n) => n.topicId === t.id).length;
    if (childCount > 0) continue;
    const s = subjOf(t);
    if (!s) continue;
    plan.emptyTopics.push({
      id: t.id,
      where: `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`,
      displayName: t.displayName,
    });
  }

  // ---- 4. resources v1 serves that v2 has nowhere ----
  const v2Keys = new Set<string>();
  for (const n of allNotes) v2Keys.add(keyOf(n.url));
  for (const t of allTopics) {
    const m = (t.metadata ?? {}) as any;
    if (m.directUrl) v2Keys.add(keyOf(m.directUrl));
  }
  for (const s of allSubjects) {
    const m = (s.metadata ?? {}) as any;
    if (m.directUrl) v2Keys.add(keyOf(m.directUrl));
  }
  // lab jsonb snapshots too
  for (const l of allLevels) {
    const m = (l.metadata ?? {}) as any;
    for (const arr of Object.values<any>(m.v1LabTopics ?? {}))
      for (const i of arr as any[]) if (i.url) v2Keys.add(keyOf(i.url));
    for (const subj of Object.values<any>(m.v1LabLeaves ?? {}))
      for (const arr of Object.values<any>(subj as any))
        for (const i of arr as any[]) if (i.url) v2Keys.add(keyOf(i.url));
  }

  for (const [p, arr] of v1Pages) {
    for (const i of arr) {
      if (!i || !i.url) continue;
      const k = keyOf(i.url);
      if (v2Keys.has(k)) continue;
      plan.missingResources.push({
        v1Path: p,
        label: i.topic ?? i.subName ?? i.title ?? "",
        url: i.url,
        key: k,
      });
    }
  }

  plan.stats = {
    topicRelabel: plan.topicRelabel.length,
    noteRelabel: plan.noteRelabel.length,
    emptyTopics: plan.emptyTopics.length,
    missingResources: plan.missingResources.length,
  };
  const byReason: Record<string, number> = {};
  for (const r of [...plan.topicRelabel, ...plan.noteRelabel])
    byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  plan.stats.byReason = byReason;

  fs.writeFileSync("parity-plan.json", JSON.stringify(plan, null, 1));
  console.log(JSON.stringify(plan.stats, null, 1));
  console.log("\nwrote parity-plan.json");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
