import express from "express";
import chatbotController from "controllers/chatbot/chatbot.controller";

const router = express.Router();


router.get("/", chatbotController.testMsg);

router.get("/webhook", chatbotController.getWebhook);
 
// router.post("/webhook", chatbotController.postWebhook);

export default router

