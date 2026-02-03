import { Request, Response } from "express";
import { noteService } from "services/app/note.service";
import { labService } from "services/app/lab.service";
import { routineService } from "services/app/routine.service";
import { resultService } from "services/app/result.service";
import { questionBankService } from "services/app/question-bank.service";
import { AUTO_RAG_TOKEN } from "constants/secrets";

const appController = {
  appIntro: async (_req: Request, res: Response) => {
    res.json({
      msg: "Welcome to notebot app engine v2",
      version: "2.0.0",
    });
  },

  // --- REST API v1 Endpoints ---

  getLevels: async (_req: Request, res: Response) => {
    try {
      const data = await noteService.getAllLevels();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getSubjectsByLevel: async (req: Request, res: Response) => {
    try {
      const levelId = parseInt(req.params.levelId);
      if (isNaN(levelId)) {
        res.status(400).json({ error: "Invalid levelId" });
        return;
      }
      const data = await noteService.getSubjectsByLevel(levelId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getTopicsBySubject: async (req: Request, res: Response) => {
    try {
      const subjectId = parseInt(req.params.subjectId);
      if (isNaN(subjectId)) {
        res.status(400).json({ error: "Invalid subjectId" });
        return;
      }
      const data = await noteService.getTopicsBySubject(subjectId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getNotesByTopic: async (req: Request, res: Response) => {
    try {
      const topicId = parseInt(req.params.topicId);
      if (isNaN(topicId)) {
        res.status(400).json({ error: "Invalid topicId" });
        return;
      }
      const data = await noteService.getNotesByTopic(topicId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getLabSubjectsByLevel: async (req: Request, res: Response) => {
    try {
      const levelId = parseInt(req.params.levelId);
      if (isNaN(levelId)) {
        res.status(400).json({ error: "Invalid levelId" });
        return;
      }
      const data = await labService.getLabSubjectsByLevel(levelId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getLabTopics: async (req: Request, res: Response) => {
    try {
      const levelId = parseInt(req.params.levelId);
      const { subjectSlug } = req.params;
      if (isNaN(levelId)) {
        res.status(400).json({ error: "Invalid levelId" });
        return;
      }
      const data = await labService.getLabTopicsBySubject(levelId, subjectSlug);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getLabItems: async (req: Request, res: Response) => {
    try {
      const levelId = parseInt(req.params.levelId);
      const { subjectSlug, topicSlug } = req.params;
      if (isNaN(levelId)) {
        res.status(400).json({ error: "Invalid levelId" });
        return;
      }
      const data = await labService.getLabItems(levelId, subjectSlug, topicSlug);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getRoutines: async (_req: Request, res: Response) => {
    try {
      const data = await routineService.getAllRoutines();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getResults: async (_req: Request, res: Response) => {
    try {
      const data = await resultService.getAllResults();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  getQuestionBanksByLevel: async (req: Request, res: Response) => {
    try {
      const levelId = parseInt(req.params.levelId);
      if (isNaN(levelId)) {
        res.status(400).json({ error: "Invalid levelId" });
        return;
      }
      const data = await questionBankService.getByLevel(levelId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
  // --- Auto RAG (tex-gpt) ---
  texGptSearch: async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        res.status(400).json({ success: false, error: "Query is required" });
        return;
      }

      if (!AUTO_RAG_TOKEN) {
        res.status(500).json({ success: false, error: "AUTO_RAG_TOKEN not configured" });
        return;
      }

      const response = await fetch(
        "https://api.cloudflare.com/client/v4/accounts/4e38392b49ae108574f34eed09e2427b/autorag/rags/tex-gpt-new/ai-search",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${AUTO_RAG_TOKEN}`,
          },
          body: JSON.stringify({ query }),
        }
      );

      const data = await response.json();
      res.json({ success: true, result: data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  },
};

export default appController;
