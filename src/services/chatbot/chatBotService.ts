import { Request } from "express";

export const chatBotIntroService = async (req: Request) => {
    const serverStatus = {
        isServerRunning: true,
        url: req.protocol + "s://" + req.get("host") + req.originalUrl,
        paths: ["/profile", "/homepage", "/app"],
        botStatus: true,
        msg: "All serveices are running as expected 🟢",
      };

      return serverStatus
}