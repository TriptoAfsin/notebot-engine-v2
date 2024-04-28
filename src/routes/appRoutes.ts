import express from "express";
import appController from "controllers/app/appController";

const router = express.Router();
 

router.get("/app", appController.appIntro);

export default router

