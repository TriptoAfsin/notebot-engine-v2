import "dotenv/config";
import bodyParser from "body-parser";
import cors from "cors";
import express, { Application } from "express";
import swaggerUi from "swagger-ui-express";
import adminRoutes from "routes/admin.routes";
import appRoutes from "routes/app.routes";
import compatRoutes from "routes/compat.routes";
import chatBotRoutes from "routes/chatbot.routes";
import homePageRoutes from "routes/homepage.routes";
import { connectDb } from "config/db";
import { connectRedis } from "config/redis";
import { errorHandler } from "middlewares/error-handler";
import { swaggerSpec } from "config/swagger";

const setupMiddlewares = async (app: Application) => {
  // Meta signs the raw bytes of a webhook delivery, and a parsed-then-re-serialised object will not
  // reproduce that digest (key order and whitespace differ). Keep the raw buffer so
  // verifyWebhookSignature can HMAC exactly what Meta signed.
  app.use(
    bodyParser.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
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
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use("", homePageRoutes);
  app.use("", chatBotRoutes);
  // before compatRoutes: that router owns wildcard paths and would swallow later matches
  app.use("", adminRoutes);
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
