import { cacheService } from "./cache.service";

/**
 * Class routines and exam schedules published on the BUTEX site.
 *
 * Unlike `scrape-results.service.ts` this does **not** parse HTML. butex.edu.bd
 * runs WordPress with its REST API open, which returns structured JSON — so
 * there is no `.large-9.columns h3` selector to silently break the day they
 * restyle the site.
 *
 * There is no "routine" category on the site (routines are filed under Academic
 * Notices, mixed with everything else), so the only way to isolate them is a
 * search. Two terms cover it: "routine" (~110 posts) and "schedule" (~370, which
 * already subsumes "class schedule" and "exam schedule").
 *
 * The output shape matches the results endpoint exactly, so clients reuse one
 * model for both.
 */

export type ScheduleItem = {
  href: string;
  content: string;
  date: string;
};

type WpPost = {
  id: number;
  date: string;
  link: string;
  title?: { rendered?: string };
};

const WP_POSTS = "https://www.butex.edu.bd/wp-json/wp/v2/posts";
const SEARCH_TERMS = ["routine", "schedule"];

/** WordPress hands back HTML-encoded titles. */
function decode(input = ""): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Match the "August 4, 2026" format the results endpoint already returns. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function fetchTerm(term: string, perPage: number): Promise<WpPost[]> {
  const url =
    `${WP_POSTS}?search=${encodeURIComponent(term)}` +
    `&per_page=${perPage}&orderby=date&order=desc&_fields=id,date,link,title`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as WpPost[];
  } catch (err) {
    console.error(`schedule fetch failed for "${term}":`, err);
    return [];
  }
}

async function fetchSchedules(limit: number): Promise<ScheduleItem[]> {
  // Ask for more than `limit` per term: the two sets overlap heavily, and the
  // merged list is re-sorted by date before trimming.
  const perTerm = Math.min(Math.max(limit * 3, 30), 100);

  const pages = await Promise.all(
    SEARCH_TERMS.map((term) => fetchTerm(term, perTerm))
  );

  const byId = new Map<number, WpPost>();
  for (const page of pages) {
    for (const post of page) {
      if (!byId.has(post.id)) byId.set(post.id, post);
    }
  }

  return [...byId.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
    .map((post) => ({
      href: post.link || "",
      content: decode(post.title?.rendered),
      date: formatDate(post.date),
    }));
}

export const scheduleService = {
  async getSchedules(limit: number = 10): Promise<ScheduleItem[]> {
    const cacheKey = `schedules:${limit}`;
    const cached = await cacheService.get<ScheduleItem[]>(cacheKey);
    if (cached) return cached;

    const schedules = await fetchSchedules(limit);
    // Same 30 min window the results scrape uses — the site publishes a handful
    // of these a week, so anything shorter is just load on BUTEX.
    if (schedules.length > 0) {
      await cacheService.set(cacheKey, schedules, 1800);
    }
    return schedules;
  },
};
