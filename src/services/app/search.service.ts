import { getPool } from "db/index";

import { cacheService } from "./cache.service";

/**
 * Free-text search over content, for both the Messenger bot and the app API.
 *
 * Lab reports are included alongside notes: a student searching "wet processing lab" does not
 * know which table the answer lives in, and a search that silently omits half the library reads
 * as broken.
 *
 * Raw SQL rather than Drizzle because the ranking is the whole point and expressing a scored
 * UNION through the query builder obscures it. Values are parameterised.
 */

export type SearchHit = {
  kind: "note" | "lab";
  title: string;
  url: string;
  subject: string;
  topic: string;
  level: string;
  /** where this lives in the app, so a client can deep-link instead of only opening the file */
  route: string | null;
  score: number;
};

const MIN_QUERY = 2;
const MAX_TERMS = 6;

/** Splits into terms and drops the noise words that would match half the corpus. */
const STOPWORDS = new Set(["note", "notes", "the", "of", "for", "and", "pdf", "please", "give", "want", "need"]);

export function parseQuery(raw: string) {
  const cleaned = String(raw ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
  const all = cleaned.split(/\s+/).filter(Boolean);
  const terms = all.filter((t) => t.length >= 2 && !STOPWORDS.has(t)).slice(0, MAX_TERMS);
  // if the query was entirely stopwords, fall back to them rather than searching for nothing
  return { cleaned, terms: terms.length ? terms : all.slice(0, MAX_TERMS) };
}

export const searchService = {
  async search(rawQuery: string, limit = 5): Promise<SearchHit[]> {
    const { cleaned, terms } = parseQuery(rawQuery);
    if (cleaned.length < MIN_QUERY || terms.length === 0) return [];

    const cacheKey = `search:${limit}:${terms.join("+")}`;
    const cached = await cacheService.get<SearchHit[]>(cacheKey);
    if (cached) return cached;

    // every term must appear somewhere in the row's searchable text (AND), which keeps
    // "polymer degradation" from returning every note mentioning polymer
    const conds: string[] = [];
    const params: unknown[] = [];
    terms.forEach((t) => {
      params.push(`%${t}%`);
      conds.push(`haystack ILIKE $${params.length}`);
    });
    const where = conds.join(" AND ");

    // exact title beats prefix beats contains; subject/topic matches rank below title matches
    params.push(cleaned);       // $exact
    const pExact = params.length;
    params.push(`${cleaned}%`); // $prefix
    const pPrefix = params.length;
    params.push(`%${cleaned}%`);// $contains
    const pContains = params.length;
    params.push(limit);
    const pLimit = params.length;

    const sql = `
      WITH content AS (
        SELECT 'note'::text AS kind, n.title, n.url,
               s.display_name AS subject, t.display_name AS topic, l.slug AS level,
               'app/notes/' || l.slug || '/' || s.slug || '/' || t.slug AS route,
               n.title || ' ' || t.display_name || ' ' || s.display_name AS haystack
        FROM notes n
        JOIN topics t ON t.id = n.topic_id
        JOIN subjects s ON s.id = t.subject_id
        JOIN levels l ON l.id = s.level_id
        UNION ALL
        SELECT 'lab'::text, lr.title, lr.url,
               lr.subject_slug, lr.topic_name, l.slug,
               'app/labs/' || l.slug || '/' || lr.subject_slug,
               lr.title || ' ' || lr.topic_name || ' ' || lr.subject_slug
        FROM lab_reports lr
        JOIN levels l ON l.id = lr.level_id
      )
      SELECT kind, title, url, subject, topic, level, route,
             ( CASE WHEN lower(title) = $${pExact} THEN 100 ELSE 0 END
             + CASE WHEN lower(title) LIKE $${pPrefix} THEN 45 ELSE 0 END
             + CASE WHEN lower(title) LIKE $${pContains} THEN 30 ELSE 0 END
             + CASE WHEN lower(topic) LIKE $${pContains} THEN 20 ELSE 0 END
             + CASE WHEN lower(subject) LIKE $${pContains} THEN 12 ELSE 0 END
             + GREATEST(0, 20 - length(title) / 10) ) AS score
      FROM content
      WHERE ${where}
      ORDER BY score DESC, length(title) ASC, title ASC
      LIMIT $${pLimit}
    `;

    const { rows } = await getPool().query(sql, params);
    const hits: SearchHit[] = rows.map((r: Record<string, unknown>) => ({
      kind: r.kind as SearchHit["kind"],
      title: String(r.title),
      url: String(r.url),
      subject: String(r.subject ?? ""),
      topic: String(r.topic ?? ""),
      level: String(r.level ?? ""),
      route: (r.route as string) ?? null,
      score: Number(r.score),
    }));

    // short TTL: search results follow content, and content now changes through the CMS
    await cacheService.set(cacheKey, hits, 300);
    return hits;
  },
};
