import express from "express";
import chatbotController from "controllers/chatbot/chatbot.controller";
import { verifyWebhookSignature } from "middlewares/verify-webhook-signature";

const router = express.Router();


router.get("/", chatbotController.testMsg);

router.get("/webhook", chatbotController.getWebhook);

// Signature check first: without it this endpoint accepts hand-written events from anyone who
// knows the URL and will send messages to whatever PSID they name.
router.post("/webhook", verifyWebhookSignature, chatbotController.postWebhook);

export default router

