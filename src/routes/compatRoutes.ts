import express, { Request, Response } from "express";
import { noteService } from "services/app/noteService";
import { labService } from "services/app/labService";

const router = express.Router();

/**
 * Backward compatibility layer.
 * Maps old v1 URL shapes to v2 DB queries and transforms responses
 * to match the exact v1 JSON format.
 */

// GET /app/notes -> { noteLevels: [{ noteLevel: N, route: "..." }] }
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

// GET /app/notes/:level -> [{ subName: "...", route: "..." }]
router.get("/app/notes/:level", async (req: Request, res: Response) => {
  try {
    const levelSlug = req.params.level;
    const level = await noteService.getLevelBySlug(levelSlug);
    if (!level) {
      res.status(404).json({ error: "Level not found" });
      return;
    }

    const subjects = await noteService.getSubjectsByLevel(level.id);

    res.json(
      subjects.map((s) => ({
        subName: s.displayName,
        route: `app/notes/${levelSlug}/${s.slug}`,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /app/notes/:level/:subject -> topic list in v1 messenger block format
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

      const topics = await noteService.getTopicsBySubject(subject.id);

      res.json(
        topics.map((t) => ({
          topic: t.displayName,
          route: `app/notes/${levelSlug}/${subjectSlug}/${t.name}`,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /app/notes/:level/:subject/:topic -> [{ text: "title\n\nurl" }]
router.get(
  "/app/notes/:level/:subject/:topic",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const subjectSlug = req.params.subject;
      const topicSlug = req.params.topic;

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

      const topic = await noteService.getTopicBySlug(subject.id, topicSlug);
      if (!topic) {
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      const noteItems = await noteService.getNotesByTopic(topic.id);

      // Return in v1 text block format
      res.json(
        noteItems.map((n) => ({
          text: `🔷 ${n.title} -\n\n${n.url}`,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- Lab compat routes ---

// GET /app/labs -> { labLevels: [{ labLevel: N, route: "..." }] }
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

// GET /app/labs/:level -> [{ subName: "...", route: "..." }]
router.get("/app/labs/:level", async (req: Request, res: Response) => {
  try {
    const levelSlug = req.params.level;
    const level = await noteService.getLevelBySlug(levelSlug);
    if (!level) {
      res.status(404).json({ error: "Level not found" });
      return;
    }

    const labSubjects = await labService.getLabSubjectsByLevel(level.id);

    res.json(
      labSubjects.map((s) => ({
        subName: s.subjectSlug,
        route: `app/labs/${levelSlug}/${s.subjectSlug}`,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /app/labs/:level/:subject -> lab topics
router.get(
  "/app/labs/:level/:subject",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const subjectSlug = req.params.subject;

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      const labTopics = await labService.getLabTopicsBySubject(level.id, subjectSlug);

      res.json(
        labTopics.map((t) => ({
          topic: t.topicName,
          route: `app/labs/${levelSlug}/${subjectSlug}/${t.topicName}`,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /app/labs/:level/:subject/:topic -> [{ text: "title\n\nurl" }]
router.get(
  "/app/labs/:level/:subject/:topic",
  async (req: Request, res: Response) => {
    try {
      const levelSlug = req.params.level;
      const subjectSlug = req.params.subject;
      const topicName = req.params.topic;

      const level = await noteService.getLevelBySlug(levelSlug);
      if (!level) {
        res.status(404).json({ error: "Level not found" });
        return;
      }

      const items = await labService.getLabItems(level.id, subjectSlug, topicName);

      res.json(
        items.map((item) => ({
          text: `🔷 ${item.title} -\n\n${item.url}`,
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
