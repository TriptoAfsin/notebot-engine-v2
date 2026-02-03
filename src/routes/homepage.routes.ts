import express from "express";
import homePageController from "controllers/chatbot/home-page.controller";

const router = express.Router();


router.get("/homepage", homePageController.getHomepage);

router.get("/profile", homePageController.getFacebookUserProfile);
 

export default router