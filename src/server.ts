import bodyParser from "body-parser";
import { db } from "config/db";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application } from "express";
import appRoutes from "routes/appRoutes";
import chatBotRoutes from "routes/chatbotRoutes";
import homePageRoutes from "routes/homepageRoutes";

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
  // app.use('/api/v1', appRoute);
  app.use("", homePageRoutes);
  app.use("", chatBotRoutes);
  app.use("", appRoutes);
};

const setupDb = async () => {
  db.connect(err => {
    let dbConnection;
    if (err) {
      dbConnection = false;
      return console.error("🔴 Error occurred while connecting to DB", err);
    }
    dbConnection = true;
    console.log("🟢 Connected to DB");
  });
};

const initServer = async () => {
  const app: Application = express();

  await setupMiddlewares(app);
  await setupDb();
  await setupViewEngine(app);
  await setupRoutes(app);
  const port = process.env.PORT || 8000;

  app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
  });
};

initServer();
