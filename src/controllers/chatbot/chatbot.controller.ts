import { MY_VERIFY_TOKEN } from "constants/secrets";
import { Request, Response } from "express";
import { chatBotIntroService } from "services/chatbot/chatbot.service";

export const testMsg = async (req: Request, res: Response) => {
    const introRes = await chatBotIntroService(req);

    return res.send(introRes);
};

export const getWebhook = (req: Request, res: Response) => {
    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = MY_VERIFY_TOKEN;
  
    // Parse the query params
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];
  
    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
      // Checks the mode and token sent is correct
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        // Responds with the challenge token from the request
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);
      }
    }
};







export default {
    testMsg,
    getWebhook
};



