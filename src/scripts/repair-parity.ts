/**
 * Repairs the v1→v2 content-parity defects found by the parity audit.
 *
 * Runs read-only by default and prints the full diff; pass --apply to write.
 * Every write is idempotent — a second run reports zero changes — and every row
 * it touches is dumped to parity-backup-<ts>.json first.
 *
 *   npx tsx src/scripts/build-v1-title-map.ts <v1-repo>   # produces v1-title-map.json
 *   npx tsx src/scripts/repair-parity.ts                  # dry run
 *   npx tsx src/scripts/repair-parity.ts --apply
 *
 * Where each defect lives, and therefore how it is fixed:
 *   /app/notes/* is served from topics+notes rows  -> UPDATE/INSERT/DELETE rows
 *   /app/labs/*  is served from levels.metadata    -> rewrite the jsonb snapshot
 * Getting this backwards silently no-ops, which is why the two halves are
 * handled separately below.
 */
import "dotenv/config";
import { getDb } from "db/index";
import { levels, subjects, topics, notes } from "db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

const APPLY = process.argv.includes("--apply");
const TITLE_MAP = "v1-title-map.json";
const PAYLOAD_MAP = "v1-payload-map.json";
const V1_CRAWL = "v1-crawl.json";

// ---------- helpers ----------

function keyOf(url: string): string {
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

/** v1 glues a group header on: "📌 QB Solve- Arjan(2021)". Only the tail travels. */
const titleSegment = (s: string) => {
  const p = String(s ?? "").split(/ ?-{1,2} ?/);
  return p[p.length - 1].trim();
};

/** v2's house style has no decorative lead emoji on leaf labels. */
const stripLeadEmoji = (s: string) =>
  String(s ?? "")
    .replace(/^[\p{Extended_Pictographic}\p{So}️‍\s]+/u, "")
    .trim();

const isSlugLabel = (s: string) => {
  const t = String(s ?? "").trim();
  return t.length > 3 && !/\s/.test(t) && /^[a-z][A-Za-z0-9]*$/.test(t) && /[a-z][A-Z0-9]/.test(t);
};
const hasMojibake = (s: string) => /�/.test(String(s ?? ""));
const humanize = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

type Change = { kind: string; target: string; from: string; to: string; reason: string };
const changes: Change[] = [];
const backup: any = { takenAt: new Date().toISOString(), topics: [], notes: [], levels: [], subjects: [] };

async function main() {
  for (const f of [TITLE_MAP, V1_CRAWL]) {
    if (!fs.existsSync(f)) {
      console.error(`missing ${f} — run build-v1-title-map.ts first`);
      process.exit(1);
    }
  }
  const titleMap: Record<string, { title: string; file: string }> = JSON.parse(
    fs.readFileSync(TITLE_MAP, "utf8")
  );
  const payloadMap: Record<string, string> = fs.existsSync(PAYLOAD_MAP)
    ? JSON.parse(fs.readFileSync(PAYLOAD_MAP, "utf8"))
    : {};
  const v1 = JSON.parse(fs.readFileSync(V1_CRAWL, "utf8"));

  /**
   * What v1 called this topic's button. A v2 topic slug is the v1 payload with
   * punctuation stripped, so try the slug, the v1RouteSlug metadata, and the
   * name — beats humanising "imMunir" into "Im Munir".
   */
  const payloadKeys = Object.keys(payloadMap);
  const topicTitleFromV1 = (t: any): string | null => {
    const meta = (t.metadata ?? {}) as any;
    const cands = [meta.v1RouteSlug, t.slug, t.name, String(t.displayName ?? "")].filter(Boolean);
    for (const c of cands) {
      const norm = String(c).toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = payloadMap[c] ?? payloadMap[norm] ?? payloadMap[norm.replace(/flow$/, "")];
      if (hit) return stripLeadEmoji(hit);
    }
    // v2 sometimes slugged the v1 *variable* name ("chem1Dilu") rather than the
    // payload ("chem1_dilute_flow"), leaving the slug a prefix of the real key.
    for (const c of cands) {
      const norm = String(c).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm.length < 5) continue;
      const near = payloadKeys.filter((k) => k.startsWith(norm) && k.length <= norm.length + 8);
      const titles = new Set(near.map((k) => payloadMap[k]));
      if (titles.size === 1) return stripLeadEmoji([...titles][0]);
    }
    return null;
  };

  /**
   * "immunir" under subject "im" humanises to the nonsense "Im Munir"; the slug
   * repeats its subject. Drop the repeat when what's left still says something.
   */
  const humanizeTopic = (slugOrLabel: string, subjectSlug: string): string => {
    // "ch1OmFlow" carries v1's internal "Flow" suffix; readers never wanted it
    let base = slugOrLabel.replace(/[_-]?[Ff]low$/, "");
    const norm = base.toLowerCase().replace(/[^a-z0-9]/g, "");
    const sub = subjectSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (sub.length >= 2 && norm.startsWith(sub) && norm.length - sub.length >= 4) {
      base = base.slice(subjectSlug.length);
    }
    return humanize(base);
  };

  /** Best known v1 title for a resource: flow-file title first, crawl label as backup. */
  const v1CrawlLabel = new Map<string, string>();
  for (const body of Object.values<any>(v1.pages)) {
    if (!Array.isArray(body)) continue;
    for (const i of body) {
      if (!i?.url) continue;
      const k = keyOf(i.url);
      const lbl = titleSegment(i.topic ?? i.subName ?? i.title ?? "");
      const prev = v1CrawlLabel.get(k);
      if (lbl && (!prev || lbl.length > prev.length)) v1CrawlLabel.set(k, lbl);
    }
  }
  /**
   * Flow-file titles are the raw button label, so they must NOT go through
   * titleSegment — "Sheet(Lecture - 1)" would collapse to "1". Only the crawl
   * label carries v1's "<header> - <title>" glue and needs splitting.
   */
  const bestTitle = (url: string): string | null => {
    const k = keyOf(url);
    const fromFile = titleMap[k]?.title;
    if (fromFile) {
      const cleaned = stripLeadEmoji(fromFile).replace(/\s{2,}/g, " ").trim();
      if (cleaned) return cleaned;
    }
    const fromCrawl = v1CrawlLabel.get(k);
    if (fromCrawl) {
      const cleaned = stripLeadEmoji(titleSegment(fromCrawl)).replace(/\s{2,}/g, " ").trim();
      if (cleaned) return cleaned;
    }
    return null;
  };

  const db = getDb();
  const allLevels = await db.select().from(levels);
  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);
  const allNotes = await db.select().from(notes);
  const levelSlug = (id: number) => allLevels.find((l) => l.id === id)?.slug ?? "?";
  const subjOf = (t: any) => allSubjects.find((s) => s.id === t.subjectId);

  // =====================================================================
  // A. topics.displayName — the buttons on a subject page
  // =====================================================================
  const topicUpdates: { id: number; to: string }[] = [];
  for (const t of allTopics) {
    const s = subjOf(t);
    if (!s) continue;
    const meta = (t.metadata ?? {}) as any;
    const cur = String(t.displayName ?? "");
    const v1t = meta.directUrl ? bestTitle(meta.directUrl) : null;
    const where = `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`;
    let to: string | null = null;
    let reason = "";

    if (hasMojibake(cur)) {
      to = v1t ?? stripLeadEmoji(cur.replace(/�/g, ""));
      reason = "mojibake";
    } else if (/^english songs$/i.test(cur) && v1t && !/^english songs$/i.test(v1t)) {
      to = v1t;
      reason = "english-songs-mislabel";
    } else if (isSlugLabel(cur)) {
      const fromPayload = topicTitleFromV1(t);
      if (fromPayload && !isSlugLabel(fromPayload)) {
        to = fromPayload;
        reason = "slug->v1-button";
      } else if (v1t && !isSlugLabel(v1t)) {
        to = v1t;
        reason = "slug->v1-title";
      } else {
        to = humanizeTopic(cur, s.slug);
        reason = "slug->humanized";
      }
    } else if (v1t && v1t.length > cur.length && v1t.startsWith(cur)) {
      to = v1t;
      reason = "truncated";
    }

    if (to && to !== cur) {
      topicUpdates.push({ id: t.id, to });
      backup.topics.push(t);
      changes.push({ kind: "topic.displayName", target: `#${t.id} ${where}`, from: cur, to, reason });
    }
  }

  // =====================================================================
  // B. notes.title — leaf items, incl. the duplicate "Full Notes" walls
  // =====================================================================
  const noteUpdates: { id: number; to: string }[] = [];
  const notesByTopic = new Map<number, any[]>();
  for (const n of allNotes) {
    if (!notesByTopic.has(n.topicId)) notesByTopic.set(n.topicId, []);
    notesByTopic.get(n.topicId)!.push(n);
  }

  for (const [topicId, group] of notesByTopic) {
    const t = allTopics.find((x) => x.id === topicId);
    const s = t ? subjOf(t) : null;
    if (!t || !s) continue;
    const where = `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`;

    // titles duplicated inside this topic can't be told apart by a reader
    const titleCount = new Map<string, number>();
    for (const n of group) {
      const k = String(n.title ?? "").trim().toLowerCase();
      titleCount.set(k, (titleCount.get(k) ?? 0) + 1);
    }

    for (const n of group) {
      const cur = String(n.title ?? "");
      const v1t = bestTitle(n.url);
      const dup = (titleCount.get(cur.trim().toLowerCase()) ?? 0) > 1;
      let to: string | null = null;
      let reason = "";

      if (hasMojibake(cur)) {
        to = v1t ?? stripLeadEmoji(cur.replace(/�/g, ""));
        reason = "mojibake";
      } else if (/^english songs$/i.test(cur) && v1t && !/^english songs$/i.test(v1t)) {
        to = v1t;
        reason = "english-songs-mislabel";
      } else if (isSlugLabel(cur)) {
        to = v1t && !isSlugLabel(v1t) ? v1t : humanize(cur);
        reason = v1t && !isSlugLabel(v1t) ? "slug->v1-title" : "slug->humanized";
      } else if (dup && v1t && v1t.toLowerCase() !== cur.trim().toLowerCase()) {
        to = v1t;
        reason = "duplicate-placeholder";
      } else if (v1t && v1t.length > cur.length && v1t.startsWith(cur)) {
        to = v1t;
        reason = "truncated";
      }

      if (to && to !== cur) {
        noteUpdates.push({ id: n.id, to });
        backup.notes.push(n);
        changes.push({ kind: "note.title", target: `#${n.id} ${where}`, from: cur, to, reason });
      }
    }
  }

  // =====================================================================
  // C. labs live in levels.metadata jsonb, not in rows
  // =====================================================================
  const levelMetaUpdates: { id: number; meta: any }[] = [];
  for (const l of allLevels) {
    const meta = JSON.parse(JSON.stringify(l.metadata ?? {}));
    let touched = false;
    const fixLabel = (obj: any, field: string, ctx: string) => {
      const cur = String(obj[field] ?? "");
      if (!obj.url) return;
      const v1t = bestTitle(obj.url);
      let to: string | null = null;
      let reason = "";
      if (hasMojibake(cur)) {
        to = v1t ?? stripLeadEmoji(cur.replace(/�/g, ""));
        reason = "mojibake";
      } else if (isSlugLabel(cur)) {
        to = v1t && !isSlugLabel(v1t) ? v1t : humanize(cur);
        reason = "slug";
      } else if (v1t) {
        // header-prefixed labels only get their tail replaced
        const seg = titleSegment(cur);
        if (v1t.length > seg.length && v1t.startsWith(seg) && seg.length > 0) {
          to = cur.slice(0, cur.length - seg.length) + v1t;
          reason = "truncated";
        }
      }
      if (to && to !== cur) {
        obj[field] = to;
        touched = true;
        changes.push({ kind: "level.metadata", target: `L${l.slug} ${ctx}`, from: cur, to, reason });
      }
    };

    for (const [subj, arr] of Object.entries<any>(meta.v1LabTopics ?? {}))
      for (const item of arr as any[]) fixLabel(item, "topic", `v1LabTopics/${subj}`);
    for (const [subj, byTopic] of Object.entries<any>(meta.v1LabLeaves ?? {}))
      for (const [tp, arr] of Object.entries<any>(byTopic as any))
        for (const item of arr as any[]) fixLabel(item, "title", `v1LabLeaves/${subj}/${tp}`);

    if (touched) {
      backup.levels.push(l);
      levelMetaUpdates.push({ id: l.id, meta });
    }
  }

  // =====================================================================
  // D. topics that render a button but serve nothing
  // =====================================================================
  const topicDeletes: { id: number; where: string; name: string }[] = [];
  for (const t of allTopics) {
    const meta = (t.metadata ?? {}) as any;
    if (meta.directUrl) continue;
    if ((notesByTopic.get(t.id) ?? []).length > 0) continue;
    const s = subjOf(t);
    if (!s) continue;
    const where = `/app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`;
    topicDeletes.push({ id: t.id, where, name: String(t.displayName) });
    backup.topics.push(t);
    changes.push({
      kind: "topic.delete",
      target: `#${t.id} ${where}`,
      from: String(t.displayName),
      to: "(removed — dead end)",
      reason: "empty-topic",
    });
  }

  // =====================================================================
  // E/F. content v1 serves that v2 has nowhere
  // =====================================================================
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
  for (const l of allLevels) {
    const m = (l.metadata ?? {}) as any;
    for (const arr of Object.values<any>(m.v1LabTopics ?? {}))
      for (const i of arr as any[]) if (i.url) v2Keys.add(keyOf(i.url));
    for (const byT of Object.values<any>(m.v1LabLeaves ?? {}))
      for (const arr of Object.values<any>(byT as any))
        for (const i of arr as any[]) if (i.url) v2Keys.add(keyOf(i.url));
  }

  type Ins = { v1Path: string; label: string; url: string };
  const missing: Ins[] = [];
  for (const [p, body] of Object.entries<any>(v1.pages)) {
    if (!Array.isArray(body)) continue;
    for (const i of body) {
      if (!i?.url || v2Keys.has(keyOf(i.url))) continue;
      missing.push({ v1Path: p, label: i.topic ?? i.subName ?? i.title ?? "", url: i.url });
    }
  }

  // labs half -> patch the jsonb snapshot in place
  const labInserts: { levelId: number; path: string; label: string; url: string }[] = [];
  // notes half -> new topic rows carrying a directUrl
  const noteInserts: { subjectSlug: string; levelSlug: string; label: string; url: string }[] = [];
  // whole subjects v2 never imported
  const subjectInserts: {
    levelSlug: string;
    slug: string;
    displayName: string;
    label: string;
    url: string;
    direct: boolean;
  }[] = [];

  for (const m of missing) {
    const lab = m.v1Path.match(/^\/app\/labs\/(\d)\/([^/]+)(?:\/([^/]+))?$/);
    if (lab) {
      const lvl = allLevels.find((l) => l.slug === lab[1]);
      if (lvl) labInserts.push({ levelId: lvl.id, path: m.v1Path, label: m.label, url: m.url });
      continue;
    }
    const noteLeaf = m.v1Path.match(/^\/app\/notes\/(\d)\/([^/]+)$/);
    if (noteLeaf) {
      noteInserts.push({
        levelSlug: noteLeaf[1],
        subjectSlug: noteLeaf[2],
        label: m.label,
        url: m.url,
      });
      continue;
    }
    const levelRoot = m.v1Path.match(/^\/app\/notes\/(\d)$/);
    if (levelRoot) {
      subjectInserts.push({
        levelSlug: levelRoot[1],
        slug: m.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        displayName: m.label,
        label: m.label,
        url: m.url,
        direct: true,
      });
    }
  }

  // subjects whose whole page is missing (SPE, IE Textiles-I): create subject + one topic
  const missingSubjects = noteInserts.filter(
    (n) => !allSubjects.some(
      (s) => s.slug.toLowerCase() === n.subjectSlug.toLowerCase() && levelSlug(s.levelId) === n.levelSlug
    )
  );
  const V1_SUBJECT_NAMES: Record<string, string> = { spe: "SPE", ietex: "IE Textiles-I" };

  for (const ins of noteInserts) {
    const known = allSubjects.some(
      (s) => s.slug.toLowerCase() === ins.subjectSlug.toLowerCase() && levelSlug(s.levelId) === ins.levelSlug
    );
    changes.push({
      kind: known ? "topic.insert" : "subject.insert",
      target: `/app/notes/${ins.levelSlug}/${ins.subjectSlug}`,
      from: "(absent)",
      to: `${stripLeadEmoji(ins.label).replace(/\s*-\s*/, " — ").replace(/\s{2,}/g, " ").trim()} -> ${ins.url}`,
      reason: known ? "missing-resource" : "missing-subject",
    });
  }
  for (const ins of subjectInserts)
    changes.push({
      kind: "subject.insert",
      target: `/app/notes/${ins.levelSlug} :: ${ins.displayName}`,
      from: "(absent)",
      to: ins.url,
      reason: "missing-subject-link",
    });
  for (const ins of labInserts)
    changes.push({
      kind: "level.metadata.insert",
      target: ins.path,
      from: "(absent)",
      to: `${ins.label} -> ${ins.url}`,
      reason: "missing-resource",
    });

  // =====================================================================
  // safety: the repair must not swap one wall of identical buttons for another
  // =====================================================================
  const noteNewTitle = new Map(noteUpdates.map((u) => [u.id, u.to]));
  const residualDupes: string[] = [];
  for (const [topicId, group] of notesByTopic) {
    const t = allTopics.find((x) => x.id === topicId);
    const s = t ? subjOf(t) : null;
    if (!t || !s) continue;
    const seen = new Map<string, number>();
    for (const n of group) {
      const title = (noteNewTitle.get(n.id) ?? String(n.title ?? "")).trim().toLowerCase();
      seen.set(title, (seen.get(title) ?? 0) + 1);
    }
    for (const [title, count] of seen) {
      if (count < 2) continue;
      residualDupes.push(
        `${count}x ${JSON.stringify(title)} @ /app/notes/${levelSlug(s.levelId)}/${s.slug}/${t.slug}`
      );
    }
  }

  // =====================================================================
  // report
  // =====================================================================
  const byKind: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  for (const c of changes) {
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;
  }
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY RUN (pass --apply to write) ===");
  console.log("\nby kind:", byKind);
  console.log("by reason:", byReason);
  console.log(`\ntotal changes: ${changes.length}`);
  console.log(
    `duplicate-title groups remaining after repair: ${residualDupes.length}` +
      (residualDupes.length ? ` (unrecoverable — no v1 title exists)` : "")
  );
  for (const d of residualDupes.slice(0, 15)) console.log(`    ${d}`);
  if (residualDupes.length > 15) console.log(`    ... +${residualDupes.length - 15} more`);
  console.log();
  fs.writeFileSync("parity-changes.json", JSON.stringify(changes, null, 1));
  fs.writeFileSync("parity-residual-dupes.json", JSON.stringify(residualDupes, null, 1));
  console.log("full diff -> parity-changes.json");
  for (const c of changes.slice(0, 40))
    console.log(`  [${c.reason}] ${c.target}\n      ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
  if (changes.length > 40) console.log(`  ... +${changes.length - 40} more (see parity-changes.json)`);

  if (!APPLY) {
    console.log("\nnothing written.");
    process.exit(0);
  }

  // =====================================================================
  // apply
  // =====================================================================
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(`parity-backup-${stamp}.json`, JSON.stringify(backup, null, 1));
  console.log(`\nbackup -> parity-backup-${stamp}.json`);

  for (const u of topicUpdates)
    await db.update(topics).set({ displayName: u.to }).where(eq(topics.id, u.id));
  console.log(`updated ${topicUpdates.length} topic display names`);

  for (const u of noteUpdates)
    await db.update(notes).set({ title: u.to }).where(eq(notes.id, u.id));
  console.log(`updated ${noteUpdates.length} note titles`);

  // lab inserts patch the same jsonb object the relabels did
  for (const ins of labInserts) {
    const lvl = allLevels.find((l) => l.id === ins.levelId)!;
    const pending = levelMetaUpdates.find((m) => m.id === lvl.id);
    const meta = pending?.meta ?? JSON.parse(JSON.stringify(lvl.metadata ?? {}));
    const parts = ins.path.match(/^\/app\/labs\/\d\/([^/]+)(?:\/([^/]+))?$/)!;
    const subj = parts[1];
    const leaf = parts[2];
    if (leaf) {
      meta.v1LabLeaves ??= {};
      meta.v1LabLeaves[subj] ??= {};
      meta.v1LabLeaves[subj][leaf] ??= [];
      if (!meta.v1LabLeaves[subj][leaf].some((x: any) => keyOf(x.url ?? "") === keyOf(ins.url)))
        meta.v1LabLeaves[subj][leaf].push({ title: ins.label, url: ins.url });
    } else {
      meta.v1LabTopics ??= {};
      meta.v1LabTopics[subj] ??= [];
      if (!meta.v1LabTopics[subj].some((x: any) => keyOf(x.url ?? "") === keyOf(ins.url)))
        meta.v1LabTopics[subj].push({ topic: ins.label, url: ins.url });
    }
    if (pending) pending.meta = meta;
    else levelMetaUpdates.push({ id: lvl.id, meta });
    if (!backup.levels.some((b: any) => b.id === lvl.id)) backup.levels.push(lvl);
  }

  for (const u of levelMetaUpdates)
    await db.update(levels).set({ metadata: u.meta }).where(eq(levels.id, u.id));
  console.log(`rewrote ${levelMetaUpdates.length} level metadata snapshots`);

  for (const d of topicDeletes) await db.delete(topics).where(eq(topics.id, d.id));
  console.log(`deleted ${topicDeletes.length} dead-end topics`);

  // subject-level direct links (UM, SCM) and whole new subjects (SPE, IE Textiles-I)
  for (const ins of subjectInserts) {
    const lvl = allLevels.find((l) => l.slug === ins.levelSlug);
    if (!lvl) continue;
    const exists = allSubjects.find(
      (s) => s.levelId === lvl.id && s.slug.toLowerCase() === ins.slug.toLowerCase()
    );
    if (exists) {
      const existingUrl = ((exists.metadata ?? {}) as any).directUrl;
      // Never clobber a link v2 already has. Where v1 and v2 point somewhere
      // different (UM), which one is current is an editorial call, not one this
      // script can make — leave v2's and let the report surface the conflict.
      if (existingUrl && keyOf(existingUrl) !== keyOf(ins.url)) {
        console.log(
          `  SKIP ${ins.displayName}: v2 already links ${existingUrl}, v1 has ${ins.url} — needs a human decision`
        );
        continue;
      }
      const meta = { ...((exists.metadata ?? {}) as any), directUrl: ins.url };
      await db.update(subjects).set({ metadata: meta }).where(eq(subjects.id, exists.id));
    } else {
      const maxSort = Math.max(0, ...allSubjects.filter((s) => s.levelId === lvl.id).map((s) => s.sortOrder ?? 0));
      await db.insert(subjects).values({
        levelId: lvl.id,
        name: ins.displayName,
        displayName: ins.displayName,
        slug: ins.slug,
        sortOrder: maxSort + 1,
        metadata: { directUrl: ins.url, source: "parity-repair" },
      } as any);
    }
  }
  console.log(`upserted ${subjectInserts.length} subject-level direct links`);

  for (const ins of noteInserts) {
    const lvl = allLevels.find((l) => l.slug === ins.levelSlug);
    if (!lvl) continue;
    let subject = allSubjects.find(
      (s) => s.levelId === lvl.id && s.slug.toLowerCase() === ins.subjectSlug.toLowerCase()
    );
    if (!subject) {
      const displayName = V1_SUBJECT_NAMES[ins.subjectSlug] ?? ins.subjectSlug.toUpperCase();
      const maxSort = Math.max(0, ...allSubjects.filter((s) => s.levelId === lvl.id).map((s) => s.sortOrder ?? 0));
      const [created] = await db
        .insert(subjects)
        .values({
          levelId: lvl.id,
          name: displayName,
          displayName,
          slug: ins.subjectSlug,
          sortOrder: maxSort + 1,
          metadata: { source: "parity-repair" },
        } as any)
        .returning();
      subject = created;
      allSubjects.push(created);
    }
    const existingTopics = await db.select().from(topics).where(eq(topics.subjectId, subject.id));
    if (existingTopics.some((t) => keyOf(((t.metadata ?? {}) as any).directUrl ?? "") === keyOf(ins.url)))
      continue;
    // keep v1's group header — a bare "Fardin(AE,26)" button says nothing about
    // what it opens, whereas "Full Notes — Fardin(AE,26)" does
    const title =
      stripLeadEmoji(ins.label)
        .replace(/\s*-\s*/, " — ")
        .replace(/\s{2,}/g, " ")
        .trim() || "Full Notes";
    const maxSort = Math.max(0, ...existingTopics.map((t) => t.sortOrder ?? 0));
    await db.insert(topics).values({
      subjectId: subject.id,
      name: title,
      displayName: title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "fullnotes",
      sortOrder: maxSort + 1,
      metadata: { directUrl: ins.url, source: "parity-repair" },
    } as any);
  }
  console.log(`inserted ${noteInserts.length} note-side resources`);

  console.log("\ndone. Flush the Redis cache before reading.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
