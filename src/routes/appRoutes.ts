import express from "express";
import appController from "controllers/app/appController";

const router = express.Router();

// Intro
router.get("/app", appController.appIntro);

// --- New REST API ---
router.get("/api/v1/levels", appController.getLevels);
router.get("/api/v1/levels/:levelId/subjects", appController.getSubjectsByLevel);
router.get("/api/v1/subjects/:subjectId/topics", appController.getTopicsBySubject);
router.get("/api/v1/topics/:topicId/notes", appController.getNotesByTopic);

router.get("/api/v1/labs/:levelId", appController.getLabSubjectsByLevel);
router.get("/api/v1/labs/:levelId/:subjectSlug", appController.getLabTopics);
router.get("/api/v1/labs/:levelId/:subjectSlug/:topicSlug", appController.getLabItems);

router.get("/api/v1/routines", appController.getRoutines);
router.get("/api/v1/results", appController.getResults);
router.get("/api/v1/question-banks/:levelId", appController.getQuestionBanksByLevel);

export default router;
