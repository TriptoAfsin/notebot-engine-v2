import { sql } from "drizzle-orm";

import { getDb } from "db/index";
import { getBotFlow } from "services/chatbot/bot-flow.service";
import {
  Button, buttonGroups, postbackButton, textBlock, webButton,
} from "utils/messenger-blocks";

/**
 * Resolves a Messenger postback payload to reply blocks, from the database.
 *
 * v1 answers each of its 884 payloads with a hand-written branch — 22,000 lines of flow files that
 * have to be edited and redeployed to change a link. This does it with one resolver, because v1's
 * payloads are already addresses: `math1_books_flow` is a topic, `math1_flow` is a subject,
 * `level_1` is a level. Content therefore comes from the same rows the app API and CMS use, so a
 * note added in the CMS appears in the bot without a deploy.
 *
 * Order matters: a payload is checked against the static table first (help, donation, menus), then
 * as a topic, then as a subject, then as a level/lab/routine. `null` means "not a known address",
 * and the caller falls back to search — which is already better than v1, where an unrouted payload
 * produced silence.
 */

export type Block = Record<string, unknown>;

/** How v1 renders a leaf: one text bubble per note, title and URL together. */
const noteText = (title: string, url: string) => textBlock(`${title} - \n${url}`);

const norm = (s: string) => s.toLowerCase().trim();
/** `math1_books_flow` and `math1_books` address the same thing in v1. */
const stripFlow = (s: string) => s.replace(/_flow$/, "");

export type ResolveOptions = {
  /**
   * Skip the bespoke-flow table and answer only from the database.
   *
   * Used by `build-static-flows.ts`, which decides what belongs in that table. Without this the
   * measurement feeds on its own output: the previous run's bespoke entries are v1's blocks
   * verbatim, so grading them against v1 reports perfect parity and the residual collapses to zero.
   */
  skipBespoke?: boolean;
};

export async function resolvePayload(
  payload: string,
  opts: ResolveOptions = {}
): Promise<Block[] | null> {
  const raw = String(payload ?? "").trim();
  if (!raw) return null;

  const key = norm(raw);

  // 1. Bespoke flows from the `bot_flows` table: help text, donation details, top-level menus,
  //    partner cards. Read from the database so the CMS can edit them without a deploy.
  if (!opts.skipBespoke) {
    const botFlow = (await getBotFlow(key)) ?? (await getBotFlow(stripFlow(key)));
    if (botFlow) return botFlow;
  }

  // 2. A topic — the single largest family.
  const topic = await findTopic(key);
  if (topic) return renderTopic(topic);

  // 3. A subject page.
  const subject = await findSubject(stripFlow(key));
  if (subject) return renderSubject(subject);

  // 4. Levels, labs and routines, whose payloads carry the level in the string.
  const structural = await resolveStructural(key);
  if (structural) return structural;

  // 5. The lab tree, keyed by strings rather than ids so it cannot join through subjects.
  const lab = await resolveLabPayload(key);
  if (lab) return lab;

  return null;
}

/* --------------------------------------------------------------------- topics */

type TopicRow = {
  id: number;
  display_name: string;
  subject_display: string;
  direct_url: string | null;
};

async function findTopic(key: string): Promise<TopicRow | null> {
  const db = getDb();
  const bare = stripFlow(key);
  // Match the slug, the v1 route slug recorded during the backfill, or either with `_flow` removed.
  // Ordered so an exact slug hit wins over a v1RouteSlug hit on a different row.
  const { rows } = await db.execute<TopicRow>(sql`
    SELECT t.id, t.display_name, s.display_name AS subject_display,
           t.metadata->>'directUrl' AS direct_url
    FROM topics t
    JOIN subjects s ON s.id = t.subject_id
    WHERE lower(t.slug) IN (${key}, ${bare})
       OR lower(t.metadata->>'v1RouteSlug') IN (${key}, ${bare})
    ORDER BY (lower(t.slug) = ${key}) DESC, t.id
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function renderTopic(topic: TopicRow): Promise<Block[]> {
  // A topic carrying directUrl is a link, not a container — v1 renders it as the link itself.
  if (topic.direct_url) return [noteText(topic.display_name, topic.direct_url)];

  const db = getDb();
  const { rows } = await db.execute<{ title: string; url: string }>(sql`
    SELECT title, url FROM notes WHERE topic_id = ${topic.id}
    ORDER BY sort_order, id
  `);

  if (rows.length === 0) {
    return [textBlock(`No file is filed under “${topic.display_name}” yet 😔`)];
  }
  return rows.map((n) => noteText(n.title, n.url));
}

/* ------------------------------------------------------------------- subjects */

type SubjectRow = { id: number; display_name: string; slug: string };

async function findSubject(key: string): Promise<SubjectRow | null> {
  const db = getDb();
  // Duplicate subjects still exist by decision — `econo`/`economics`, `iae`/`IAE`,
  // `weaving2`/`weave2` — and only one of each pair carries the content. Prefer the populated row,
  // otherwise the bot answers a real payload with an empty page.
  const { rows } = await db.execute<SubjectRow>(sql`
    SELECT s.id, s.display_name, s.slug,
           (SELECT COUNT(*) FROM topics t WHERE t.subject_id = s.id) AS topic_count
    FROM subjects s
    WHERE lower(s.slug) = ${key} OR lower(s.metadata->>'v1RouteSlug') = ${key}
    ORDER BY topic_count DESC, (lower(s.slug) = ${key}) DESC, s.id
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function renderSubject(subject: SubjectRow): Promise<Block[]> {
  const db = getDb();
  const { rows } = await db.execute<{
    slug: string; display_name: string; direct_url: string | null; note_count: number;
  }>(sql`
    SELECT t.slug, t.display_name,
           t.metadata->>'directUrl' AS direct_url,
           (SELECT COUNT(*) FROM notes n WHERE n.topic_id = t.id)::int AS note_count
    FROM topics t WHERE t.subject_id = ${subject.id}
    ORDER BY t.sort_order, t.display_name
  `);

  if (rows.length === 0) {
    return [textBlock(`Nothing is filed under ${subject.display_name} yet 😔`)];
  }

  const blocks: Block[] = [];

  // Direct links first, the way v1 puts its 📌 groups above the topic picker.
  const links: Button[] = rows
    .filter((r) => r.direct_url)
    .map((r) => webButton(r.display_name, r.direct_url as string));
  if (links.length) blocks.push(...buttonGroups(`📌 ${subject.display_name} -`, links));

  // Then the topics themselves, as postbacks that come back through this resolver.
  const topics: Button[] = rows
    .filter((r) => !r.direct_url && r.note_count > 0)
    .map((r) => postbackButton(r.display_name, r.slug));
  if (topics.length) {
    blocks.push(...buttonGroups(`🔰 Select Topic for ${subject.display_name} -`, topics));
  }

  if (blocks.length === 0) {
    return [textBlock(`Nothing is filed under ${subject.display_name} yet 😔`)];
  }
  return blocks;
}

/* ----------------------------------------------------- levels, labs, routines */

async function resolveStructural(key: string): Promise<Block[] | null> {
  const db = getDb();

  // level_3_lab / level3lab -> that level's lab subjects
  const lab = key.match(/^level[_-]?(\d)[_-]?lab$/);
  if (lab) return renderLabLevel(lab[1]);

  // routine_level_2 -> that level's routines
  const routine = key.match(/^routine[_-]?level[_-]?(\d)$/);
  if (routine) {
    const { rows } = await db.execute<{ title: string; url: string }>(sql`
      SELECT r.title, r.url FROM routines r
      JOIN levels l ON l.id = r.level_id
      WHERE lower(l.slug) = ${routine[1]}
      ORDER BY r.sort_order, r.id
    `);
    if (!rows.length) return [textBlock(`No routine is filed for Level ${routine[1]} yet 😔`)];
    return rows.map((r) => noteText(r.title, r.url));
  }

  // l1t2routine -> level 1, "Term 2". v1 encodes level and term in the payload; the routines table
  // stores the term as free text ("Term 2"), so match on the trailing digit rather than the label.
  const levelTerm = key.match(/^l(\d)[_-]?t(\d)[_-]?routine$/);
  if (levelTerm) {
    const { rows } = await db.execute<{ title: string; url: string }>(sql`
      SELECT r.title, r.url FROM routines r
      JOIN levels l ON l.id = r.level_id
      WHERE lower(l.slug) = ${levelTerm[1]}
        AND regexp_replace(COALESCE(r.term, ''), '\\D', '', 'g') = ${levelTerm[2]}
      ORDER BY r.sort_order, r.id
    `);
    if (rows.length) return rows.map((r) => noteText(r.title, r.url));
  }

  // syllabus_ipe45 -> batch 45, department ipe. v1 packs department and batch into one token.
  const deptBatch = key.match(/^syllabus[_-]?([a-z]+)(\d{2})$/);
  if (deptBatch) {
    const { rows } = await db.execute<{ topic: string; url: string }>(sql`
      SELECT topic, url FROM syllabuses
      WHERE batch = ${deptBatch[2]} AND lower(department) = ${deptBatch[1]}
      ORDER BY department_sort, id
    `);
    if (rows.length) return rows.map((r) => noteText(r.topic, r.url));
  }

  // level_1 / 1 -> that level's subjects
  const level = key.match(/^level[_-]?(\d)$/) ?? key.match(/^(\d)$/);
  if (level) return renderLevel(level[1]);

  // qb_level_2 / qb_2 -> that level's question banks
  const qbLevel = key.match(/^qb[_-]?(?:level[_-]?)?(\d)$/);
  if (qbLevel) {
    const { rows } = await db.execute<{ title: string; url: string }>(sql`
      SELECT q.title, q.url FROM question_banks q
      JOIN levels l ON l.id = q.level_id
      WHERE lower(l.slug) = ${qbLevel[1]}
      ORDER BY q.sort_order, q.id
    `);
    if (rows.length) return rows.map((r) => noteText(r.title, r.url));
  }

  // syllabus_46 -> that batch's syllabus
  const syllabus = key.match(/^syllabus[_-]?(\d+)$/);
  if (syllabus) {
    const { rows } = await db.execute<{ topic: string; url: string }>(sql`
      SELECT topic, url FROM syllabuses WHERE batch = ${syllabus[1]}
      ORDER BY department_sort, id
    `);
    if (!rows.length) return [textBlock(`No syllabus is filed for batch ${syllabus[1]} yet 😔`)];
    return rows.map((r) => noteText(r.topic, r.url));
  }

  return null;
}

async function renderLevel(levelSlug: string): Promise<Block[] | null> {
  const db = getDb();
  const { rows } = await db.execute<{ slug: string; display_name: string }>(sql`
    SELECT s.slug, s.display_name FROM subjects s
    JOIN levels l ON l.id = s.level_id
    WHERE lower(l.slug) = ${levelSlug}
    ORDER BY s.sort_order, s.display_name
  `);
  if (!rows.length) return null;

  const blocks: Block[] = buttonGroups(
    `🔰 Select subject — Level ${levelSlug} -`,
    rows.map((s) => postbackButton(s.display_name, `${s.slug}_flow`))
  );

  // v1's level page also carries that level's question-bank folders. They are their own table, so
  // without this they were only reachable from the separate QB menu.
  const { rows: qb } = await db.execute<{ title: string; url: string }>(sql`
    SELECT q.title, q.url FROM question_banks q
    JOIN levels l ON l.id = q.level_id
    WHERE lower(l.slug) = ${levelSlug}
    ORDER BY q.sort_order, q.id
  `);
  if (qb.length) {
    blocks.push(...buttonGroups(`🟪 Question banks — Level ${levelSlug} -`, qb.map((q) => webButton(q.title, q.url))));
  }

  return blocks;
}

async function renderLabLevel(levelSlug: string): Promise<Block[] | null> {
  const db = getDb();
  // Lab subjects are configured on the level, because lab_reports keys them by a bare slug string
  // rather than a foreign key.
  const { rows: levelRows } = await db.execute<{ meta: Record<string, unknown> | null }>(sql`
    SELECT metadata AS meta FROM levels WHERE lower(slug) = ${levelSlug}
  `);
  const labSubjects = levelRows[0]?.meta?.labSubjects as
    | Array<{ dbSlug: string; displayName: string; v1RouteSlug: string }>
    | undefined;

  if (labSubjects?.length) {
    const buttons = labSubjects.map((s) => postbackButton(s.displayName, `${s.v1RouteSlug}_lab`));
    return buttonGroups(`🧪 Lab reports — Level ${levelSlug} -`, buttons);
  }

  // Fall back to whatever subject slugs the lab rows themselves carry.
  const { rows } = await db.execute<{ subject_slug: string }>(sql`
    SELECT DISTINCT lr.subject_slug FROM lab_reports lr
    JOIN levels l ON l.id = lr.level_id
    WHERE lower(l.slug) = ${levelSlug}
    ORDER BY lr.subject_slug
  `);
  if (!rows.length) return null;
  const buttons = rows.map((r) => postbackButton(r.subject_slug.toUpperCase(), `${r.subject_slug}_lab`));
  return buttonGroups(`🧪 Lab reports — Level ${levelSlug} -`, buttons);
}

/* ----------------------------------------------------------------------- labs */

/**
 * Lab payloads look like `che1_procedureSheet_flow` (subject + topic) or `che1_lab`.
 * Exported separately because the lab tree is keyed by strings, not ids, so it cannot join through
 * subjects the way notes do.
 */
export async function resolveLabPayload(payload: string): Promise<Block[] | null> {
  const db = getDb();
  const key = stripFlow(norm(payload));

  // `<subject>_lab` -> every lab report for that subject.
  //
  // Matched on the slug with punctuation removed, because v1's payload and the lab row disagree on
  // it: `wp2_lab_flow` against a `subject_slug` of `wp_2`, `am2` against `am_2`. Returning the
  // reports directly rather than another menu also saves a tap — v1 made you pick a topic first.
  const subjectOnly = key.match(/^(.+?)[_-]lab$/);
  if (subjectOnly) {
    const bare = subjectOnly[1].replace(/[^a-z0-9]/g, "");
    const { rows } = await db.execute<{ topic_name: string; title: string; url: string }>(sql`
      SELECT topic_name, title, url FROM lab_reports
      WHERE regexp_replace(lower(subject_slug), '[^a-z0-9]', '', 'g') = ${bare}
      ORDER BY topic_name, sort_order, id
    `);
    if (rows.length) return rows.map((r) => noteText(r.title, r.url));
  }

  // `<subject>_<topic>` — split on the first underscore and match the remainder as the topic,
  // case-insensitively, because v1 route slugs are camelCase (`procedureSheet`) and lab rows are not.
  const parts = key.split("_");
  for (let i = 1; i < parts.length; i++) {
    const subj = parts.slice(0, i).join("_");
    const topic = parts.slice(i).join("_");
    const { rows } = await db.execute<{ title: string; url: string }>(sql`
      SELECT title, url FROM lab_reports
      WHERE lower(subject_slug) = ${subj}
        AND lower(replace(topic_name, ' ', '_')) = ${topic}
      ORDER BY sort_order, id
    `);
    if (rows.length) return rows.map((r) => noteText(r.title, r.url));
  }

  return null;
}
