import express, { Request, Response } from "express";
import { noteService } from "services/app/note.service";
import { labService } from "services/app/lab.service";
import { scrapeResultsService } from "services/app/scrape-results.service";
import { syllabusService } from "services/app/syllabus.service";

const router = express.Router();

/**
 * Backward compatibility layer.
 * Maps old v1 URL shapes to v2 DB queries and transforms responses
 * to match the exact v1 JSON format.
 *
 * Where possible, pre-synced v1 response data is stored in entity metadata
 * (via sync-v1-compat.ts) and returned directly for exact format matching.
 */

// --- Note compat routes ---

/**
 * @swagger
 * /app/notes:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get note levels"
 *     description: Returns list of academic levels with navigation routes (v1 format)
 *     responses:
 *       200:
 *         description: Note levels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 noteLevels:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       noteLevel:
 *                         type: integer
 *                       route:
 *                         type: string
 */
router.get("/app/notes", async (req: Request, res: Response) => {
  try {
    const levels = await noteService.getAllLevels();
    const protocol = req.protocol;
    const host = req.get("host");

    res.json({
      noteLevels: levels.map((l) => ({
        noteLevel: parseInt(l.slug),
        route: `${protocol}://${host}/app/notes/${l.slug}`,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /app/notes/{level}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get subjects for a level"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *         description: Level slug (1, 2, 3, or 4)
 *     responses:
 *       200:
 *         description: Array of subjects (mix of route and direct url items)
 */
router.get("/app/notes/:level", async (req: Request, res: Response) => {
  try {
    const levelSlug = req.params.level;
    const level = await noteService.getLevelBySlug(levelSlug);
    if (!level) {
      res.status(404).json({ error: "Level not found" });
      return;
    }

    const subjects = await noteService.getSubjectsByLevel(level.id);

    const result = subjects.map((s) => {
      const meta = s.metadata as any;
      if (meta?.directUrl) {
        return { subName: s.displayName, url: meta.directUrl as string };
      }
      // Support cross-level route overrides (e.g. HRM in level 3 points to level 4)
      const route = meta?.v1RouteOverride || `app/notes/${levelSlug}/${s.slug}`;
      return { subName: s.displayName, route };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /app/notes/{level}/{subject}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get topics for a subject"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of topics (mix of route and direct url items)
 */
router.get(
  "/app/notes/:level/:subject",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const subjectSlug = req.params.subject;

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      const subject = await noteService.getSubjectBySlug(level.id, subjectSlug);
      if (!subject) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }

      // Use pre-synced v1 topic list if available (exact v1 format)
      const meta = subject.metadata as Record<string, unknown> | null;
      const v1Topics = meta?.v1Topics as Array<{
        topic: string;
        route?: string;
        url?: string;
      }> | undefined;

      if (v1Topics && v1Topics.length > 0) {
        res.json(v1Topics);
        return;
      }

      // Fallback: build from DB topics
      const topics = await noteService.getTopicsBySubject(subject.id);
      const result = topics.map((t) => {
        const tMeta = t.metadata as Record<string, unknown> | null;
        if (tMeta?.directUrl) {
          return { topic: t.displayName, url: tMeta.directUrl as string };
        }
        return {
          topic: t.displayName,
          route: `app/notes/${levelSlug}/${subjectSlug}/${t.slug}`,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /app/notes/{level}/{subject}/{topic}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get notes (leaf level)"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: topic
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of notes with title and url
 */
router.get(
  "/app/notes/:level/:subject/:topic",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const subjectSlug = req.params.subject;
      const topicSlug = req.params.topic; // e.g. "math1_books_flow"

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      const subject = await noteService.getSubjectBySlug(level.id, subjectSlug);
      if (!subject) {
        res.status(404).json({ error: "Subject not found" });
        return;
      }

      // Use pre-synced v1 leaf data if available (exact v1 format)
      const meta = subject.metadata as Record<string, unknown> | null;
      const v1Leaves = meta?.v1Leaves as Record<
        string,
        Array<{ title: string; url: string }>
      > | undefined;

      if (v1Leaves && v1Leaves[topicSlug]) {
        res.json(v1Leaves[topicSlug]);
        return;
      }

      // Fallback: look up topic in DB and return its notes
      // Try matching by v1RouteSlug metadata, then by name conversion
      const allTopics = await noteService.getTopicsBySubject(subject.id);
      const topic =
        allTopics.find((t) => {
          const tMeta = t.metadata as Record<string, unknown> | null;
          return tMeta?.v1RouteSlug === topicSlug;
        }) ||
        allTopics.find((t) => t.slug === topicSlug || t.name === topicSlug);

      if (!topic) {
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      const noteItems = await noteService.getNotesByTopic(topic.id);

      res.json(
        noteItems.map((n) => ({
          title: n.title,
          url: n.url,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- Lab compat routes ---

/**
 * @swagger
 * /app/labs:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get lab levels"
 *     responses:
 *       200:
 *         description: Lab levels with navigation routes
 */
router.get("/app/labs", async (req: Request, res: Response) => {
  try {
    const levels = await noteService.getAllLevels();
    const protocol = req.protocol;
    const host = req.get("host");

    res.json({
      labLevels: levels.map((l) => ({
        labLevel: parseInt(l.slug),
        route: `${protocol}://${host}/app/labs/${l.slug}`,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /app/labs/{level}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get lab subjects for a level"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lab subjects with display names
 */
router.get("/app/labs/:level", async (req: Request, res: Response) => {
  try {
    const levelSlug = req.params.level;
    const level = await noteService.getLevelBySlug(levelSlug);
    if (!level) {
      res.status(404).json({ error: "Level not found" });
      return;
    }

    // Use lab subject config from level metadata if available
    const levelMeta = level.metadata as Record<string, unknown> | null;
    const labSubjectConfig = (levelMeta?.labSubjects as Array<{
      dbSlug: string;
      displayName: string;
      v1RouteSlug: string;
    }>) || null;

    if (labSubjectConfig) {
      res.json(
        labSubjectConfig.map((s) => ({
          subName: s.displayName,
          route: `app/labs/${levelSlug}/${s.v1RouteSlug}`,
        }))
      );
    } else {
      // Fallback: query from lab_reports
      const labSubjects = await labService.getLabSubjectsByLevel(level.id);
      res.json(
        labSubjects.map((s) => ({
          subName: s.subjectSlug,
          route: `app/labs/${levelSlug}/${s.subjectSlug}`,
        }))
      );
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /app/labs/{level}/{subject}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get lab topics for a subject"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lab topics
 */
router.get(
  "/app/labs/:level/:subject",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const v1SubjectSlug = req.params.subject;

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      // Use pre-synced v1 lab topic list if available
      const levelMeta = level.metadata as Record<string, unknown> | null;
      const v1LabTopics = levelMeta?.v1LabTopics as Record<
        string,
        Array<{ topic: string; route?: string; url?: string }>
      > | undefined;

      if (v1LabTopics && v1LabTopics[v1SubjectSlug]) {
        res.json(v1LabTopics[v1SubjectSlug]);
        return;
      }

      // Fallback: map v1 route slug to DB slug and query
      const labSubjectConfig = (levelMeta?.labSubjects as Array<{
        dbSlug: string;
        displayName: string;
        v1RouteSlug: string;
      }>) || null;

      let dbSlug = v1SubjectSlug;
      if (labSubjectConfig) {
        const match = labSubjectConfig.find((s) => s.v1RouteSlug === v1SubjectSlug);
        if (match) dbSlug = match.dbSlug;
      }

      const labTopics = await labService.getLabTopicsBySubject(level.id, dbSlug);

      res.json(
        labTopics.map((t) => ({
          topic: t.topicName,
          route: `app/labs/${levelSlug}/${v1SubjectSlug}/${t.topicName}`,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /app/labs/{level}/{subject}/{topic}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get lab items (leaf level)"
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: subject
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: topic
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lab items with title and url
 */
router.get(
  "/app/labs/:level/:subject/:topic",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const v1SubjectSlug = req.params.subject;
      const topicSlug = req.params.topic;

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      // Use pre-synced v1 lab leaf data if available
      const levelMeta = level.metadata as Record<string, unknown> | null;
      const v1LabLeaves = levelMeta?.v1LabLeaves as Record<
        string,
        Record<string, Array<{ title: string; url: string }>>
      > | undefined;

      if (v1LabLeaves && v1LabLeaves[v1SubjectSlug]?.[topicSlug]) {
        res.json(v1LabLeaves[v1SubjectSlug][topicSlug]);
        return;
      }

      // Fallback: map v1 route slug to DB slug and query
      const labSubjectConfig = (levelMeta?.labSubjects as Array<{
        dbSlug: string;
        displayName: string;
        v1RouteSlug: string;
      }>) || null;

      let dbSlug = v1SubjectSlug;
      if (labSubjectConfig) {
        const match = labSubjectConfig.find((s) => s.v1RouteSlug === v1SubjectSlug);
        if (match) dbSlug = match.dbSlug;
      }

      const items = await labService.getLabItems(level.id, dbSlug, topicSlug);

      res.json(
        items.map((item) => ({
          title: item.title,
          url: item.url,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- Results compat route ---

/**
 * @swagger
 * /results:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get latest BUTEX results"
 *     description: Scrapes BUTEX results page and returns latest results
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Results with href, content, date
 */
router.get("/results", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const results = await scrapeResultsService.getResults(limit);

    if (!results || results.length === 0) {
      res.status(404).json({ msg: "No results found or error while getting results" });
      return;
    }

    res.json({
      msg: `Here are the last ${results.length} results`,
      data: results,
    });
  } catch (err: any) {
    res.status(500).json({ msg: "Internal server error while processing results" });
  }
});

// --- Syllabus compat routes ---

/**
 * @swagger
 * /app/syllabus:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get syllabus batches"
 *     responses:
 *       200:
 *         description: Array of batches
 */
router.get("/app/syllabus", (_req: Request, res: Response) => {
  res.json(syllabusService.getBatches());
});

/**
 * @swagger
 * /app/syllabus/{batch}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get departments for a batch"
 *     parameters:
 *       - in: path
 *         name: batch
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of departments
 *       404:
 *         description: Batch not found
 */
router.get("/app/syllabus/:batch", (req: Request, res: Response) => {
  const depts = syllabusService.getDepts(req.params.batch);
  if (!depts) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  res.json(depts);
});

/**
 * @swagger
 * /app/syllabus/{batch}/{dept}:
 *   get:
 *     tags: [Compat]
 *     summary: "[V1] Get syllabus topics for a department"
 *     parameters:
 *       - in: path
 *         name: batch
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dept
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of topics with URLs (or single object for batch 46/all)
 *       404:
 *         description: Not found
 */
router.get("/app/syllabus/:batch/:dept", (req: Request, res: Response) => {
  const topics = syllabusService.getTopics(req.params.batch, req.params.dept);
  if (!topics) {
    res.status(404).json({ error: "Syllabus not found" });
    return;
  }
  res.json(topics);
});

export default router;
