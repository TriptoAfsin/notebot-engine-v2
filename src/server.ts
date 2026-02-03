import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application } from "express";
import appRoutes from "routes/app.routes";
import compatRoutes from "routes/compat.routes";
import chatBotRoutes from "routes/chatbot.routes";
import homePageRoutes from "routes/homepage.routes";
import { connectDb } from "config/db";
import { connectRedis } from "config/redis";
import { errorHandler } from "middlewares/error-handler";

//For env File
dotenv.config();

const setupMiddlewares = async (app: Application) => {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(
    cors({
      origin: "*",
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    })
  );
};

const setupViewEngine = async (app: Application) => {
  app.use(express.static("./src/public")); //static folder
  app.set("view engine", "ejs");
  app.set("views", "./src/views");
};

const setupRoutes = (app: Application) => {
  app.use("", homePageRoutes);
  app.use("", chatBotRoutes);
  app.use("", appRoutes);
  app.use("", compatRoutes);
  app.use(errorHandler);
};

const initServer = async () => {
  const app: Application = express();

  await setupMiddlewares(app);

  try {
    await connectDb();
  } catch {
    console.error("🔴 Failed to connect to database, continuing anyway...");
  }

  try {
    await connectRedis();
  } catch {
    console.error("🔴 Failed to connect to Redis, continuing anyway...");
  }

  await setupViewEngine(app);
  await setupRoutes(app);
  const port = process.env.PORT || 8000;

  app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
  });
};

initServer();
