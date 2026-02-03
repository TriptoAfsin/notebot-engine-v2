import * as cheerio from "cheerio";
import { cacheService } from "./cache.service";

type ScrapedResult = {
  href: string;
  content: string;
  date: string;
};

const BUTEX_RESULTS_URL = "https://www.butex.edu.bd/results-published/";

async function scrapeResults(limit: number = 10): Promise<ScrapedResult[]> {
  const response = await fetch(BUTEX_RESULTS_URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const results: ScrapedResult[] = [];

  $(".large-9.columns h3").each((_i, el) => {
    const aTag = $(el).find("a");
    const dateEl = $(el).parent().find("time");

    if (aTag.length > 0) {
      results.push({
        href: aTag.attr("href") || "",
        content: aTag.text().trim(),
        date: dateEl.text().trim(),
      });
    }
  });

  return results.slice(0, limit);
}

export const scrapeResultsService = {
  async getResults(limit: number = 10): Promise<ScrapedResult[]> {
    const cacheKey = `scraped-results:${limit}`;
    const cached = await cacheService.get<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    const results = await scrapeResults(limit);
    if (results.length > 0) {
      await cacheService.set(cacheKey, results, 1800); // 30 min cache
    }
    return results;
  },
};
