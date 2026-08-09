import express, { Request, Response } from "express";

import { requireApiKey } from "middlewares/require-api-key";
import { cacheService } from "services/app/cache.service";

const router = express.Router();

/**
 * Admin surface. Everything here is behind requireApiKey.
 *
 * Mounted BEFORE compatRoutes in server.ts — the compat router owns wildcard paths under
 * /app/*, so an admin path placed after it can be swallowed.
 */

/**
 * @swagger
 * /admin/cache/flush:
 *   post:
 *     tags: [Admin]
 *     summary: Invalidate cached content
 *     description: >
 *       Clears the Redis entries the read endpoints populate. Content written directly to the
 *       database (migrations, scripts, the reconciler) does not invalidate anything on its own,
 *       so it stays stale for up to the 1h TTL without this.
 *       NOTE: this reaches the server cache only. notebot-web-v2 persists its React Query cache
 *       to localStorage for 24h with refetchOnMount disabled, so existing visitors keep their
 *       copy until CACHE_VERSION is bumped in that app.
 *     parameters:
 *       - in: header
 *         name: x-api-key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scope:
 *                 type: string
 *                 enum: [all, level, subject, topic, labs, syllabus, routines, results]
 *               id:
 *                 type: integer
 *                 description: required for level | subject | topic | labs
 *     responses:
 *       200: { description: Keys cleared }
 *       400: { description: Missing id for a scope that needs one }
 *       401: { description: Invalid or missing API key }
 */
router.post("/admin/cache/flush", requireApiKey, async (req: Request, res: Response) => {
  try {
    const scope = String(req.body?.scope || "all");
    const id = req.body?.id;
    const needsId = ["level", "subject", "topic", "labs"];
    if (needsId.includes(scope) && (id === undefined || id === null || isNaN(Number(id)))) {
      res.status(400).json({ error: `scope "${scope}" requires a numeric id` });
      return;
    }

    // Keys are passed WITHOUT the notebot: prefix — cacheService adds it.
    const cleared: string[] = [];
    const del = async (key: string) => { await cacheService.del(key); cleared.push(key); };
    const delPattern = async (pattern: string) => { await cacheService.delPattern(pattern); cleared.push(pattern); };

    switch (scope) {
      case "all":
        // every key this service owns; scraped-results is derived from an external scrape but
        // is cheap to refill, so it goes too
        await delPattern("*");
        break;
      case "level":
        // the level's subject list, its labs and its question banks
        await del(`subjects:${Number(id)}`);
        await delPattern(`labs:${Number(id)}*`);
        await del(`qbs:${Number(id)}`);
        await del("levels");
        break;
      case "subject":
        await del(`topics:${Number(id)}`);
        break;
      case "topic":
        await del(`notes:${Number(id)}`);
        break;
      case "labs":
        await delPattern(`labs:${Number(id)}*`);
        break;
      case "syllabus":
        await delPattern("syllabus:*");
        break;
      case "routines":
        await del("routines");
        break;
      case "results":
        await del("results");
        await delPattern("scraped-results:*");
        break;
      default:
        res.status(400).json({ error: `unknown scope "${scope}"` });
        return;
    }

    res.json({ ok: true, scope, id: id ?? null, cleared });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
