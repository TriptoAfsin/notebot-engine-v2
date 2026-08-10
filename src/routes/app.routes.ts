import express, { Request, Response } from "express";
import appController from "controllers/app/app.controller";
import jokesController from "controllers/app/jokes.controller";
import { searchService } from "services/app/search.service";

const router = express.Router();

/**
 * @swagger
 * /app:
 *   get:
 *     tags: [App]
 *     summary: API intro
 *     description: Returns welcome message and API version
 *     responses:
 *       200:
 *         description: Welcome message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: "Welcome to notebot app engine v2"
 *                 version:
 *                   type: string
 *                   example: "2.0.0"
 */
router.get("/app", appController.appIntro);

// --- New REST API ---

/**
 * @swagger
 * /api/v1/levels:
 *   get:
 *     tags: [Levels]
 *     summary: Get all levels
 *     description: Returns all academic levels ordered by sort_order
 *     responses:
 *       200:
 *         description: Array of levels
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   displayName:
 *                     type: string
 *                   slug:
 *                     type: string
 *                   sortOrder:
 *                     type: integer
 */
router.get("/api/v1/levels", appController.getLevels);

/**
 * @swagger
 * /api/v1/levels/{levelId}/subjects:
 *   get:
 *     tags: [Subjects]
 *     summary: Get subjects by level
 *     parameters:
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Level ID
 *     responses:
 *       200:
 *         description: Array of subjects
 *       400:
 *         description: Invalid levelId
 */
router.get("/api/v1/levels/:levelId/subjects", appController.getSubjectsByLevel);

/**
 * @swagger
 * /api/v1/subjects/{subjectId}/topics:
 *   get:
 *     tags: [Topics]
 *     summary: Get topics by subject
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Subject ID
 *     responses:
 *       200:
 *         description: Array of topics
 *       400:
 *         description: Invalid subjectId
 */
router.get("/api/v1/subjects/:subjectId/topics", appController.getTopicsBySubject);

/**
 * @swagger
 * /api/v1/topics/{topicId}/notes:
 *   get:
 *     tags: [Notes]
 *     summary: Get notes by topic
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Topic ID
 *     responses:
 *       200:
 *         description: Array of notes with title and URL
 *       400:
 *         description: Invalid topicId
 */
router.get("/api/v1/topics/:topicId/notes", appController.getNotesByTopic);

/**
 * @swagger
 * /api/v1/labs/{levelId}:
 *   get:
 *     tags: [Labs]
 *     summary: Get lab subjects by level
 *     parameters:
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Level ID
 *     responses:
 *       200:
 *         description: Array of lab subjects
 *       400:
 *         description: Invalid levelId
 */
router.get("/api/v1/labs/:levelId", appController.getLabSubjectsByLevel);

/**
 * @swagger
 * /api/v1/labs/{levelId}/{subjectSlug}:
 *   get:
 *     tags: [Labs]
 *     summary: Get lab topics by subject
 *     parameters:
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: subjectSlug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lab topics
 */
router.get("/api/v1/labs/:levelId/:subjectSlug", appController.getLabTopics);

/**
 * @swagger
 * /api/v1/labs/{levelId}/{subjectSlug}/{topicSlug}:
 *   get:
 *     tags: [Labs]
 *     summary: Get lab items
 *     parameters:
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: subjectSlug
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: topicSlug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lab report items
 */
router.get("/api/v1/labs/:levelId/:subjectSlug/:topicSlug", appController.getLabItems);

/**
 * @swagger
 * /api/v1/routines:
 *   get:
 *     tags: [Routines]
 *     summary: Get all routines
 *     responses:
 *       200:
 *         description: Array of routines with title and URL
 */
router.get("/api/v1/routines", appController.getRoutines);

/**
 * @swagger
 * /api/v1/results:
 *   get:
 *     tags: [Results]
 *     summary: Get all results
 *     responses:
 *       200:
 *         description: Array of results with title and URL
 */
router.get("/api/v1/results", appController.getResults);

/**
 * @swagger
 * /api/v1/question-banks/{levelId}:
 *   get:
 *     tags: [Question Banks]
 *     summary: Get question banks by level
 *     parameters:
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Array of question banks
 *       400:
 *         description: Invalid levelId
 */
router.get("/api/v1/question-banks/:levelId", appController.getQuestionBanksByLevel);

/**
 * @swagger
 * /app/jokes:
 *   get:
 *     tags: [Entertainment]
 *     summary: Get a random joke
 *     description: Returns a random joke as plain text
 *     responses:
 *       200:
 *         description: A random joke string
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "I can't believe I forgot to go to the gym today. That's 7 years in a row now."
 */
router.get("/app/jokes", jokesController.getRandomJoke);

/**
 * @swagger
 * /app/tex-gpt:
 *   post:
 *     tags: [AI]
 *     summary: Auto RAG search
 *     description: Search through NoteBot content using AI-powered RAG
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: "math integration notes"
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Query is required
 */
router.post("/app/tex-gpt", appController.texGptSearch);

/**
 * @swagger
 * /app/search:
 *   get:
 *     tags: [App]
 *     summary: Search notes and lab reports
 *     description: >
 *       Ranked free-text search across note titles, lab report titles and their topic/subject
 *       names. Returns at most `limit` hits (default 5). Responds 404 with
 *       `{ "error": "Not found" }` when nothing matches, so a client can show its own empty
 *       state rather than an empty list that looks like a loading bug.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search text; needs at least 2 characters
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, maximum: 20 }
 *     responses:
 *       200:
 *         description: Ranked hits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query: { type: string }
 *                 count: { type: integer }
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       kind: { type: string, enum: [note, lab] }
 *                       title: { type: string }
 *                       url: { type: string }
 *                       subject: { type: string }
 *                       topic: { type: string }
 *                       level: { type: string }
 *                       route: { type: string, nullable: true }
 *       400: { description: Missing or too-short query }
 *       404: { description: Nothing matched }
 */
router.get("/app/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.status(400).json({ error: "Query must be at least 2 characters" });
      return;
    }
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "5"), 10) || 5));
    const results = await searchService.search(q, limit);

    if (results.length === 0) {
      res.status(404).json({ error: "Not found", query: q, results: [] });
      return;
    }
    res.json({ query: q, count: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
