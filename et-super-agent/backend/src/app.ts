import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { sessionRouter } from "./routes/session.js";
import { compareRouter } from "./routes/compare.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { contextRouter } from "./routes/context.js";
import { validationRouter } from "./routes/validation.js";
import { profileRouter } from "./routes/profile.js";
import { toolsRouter } from "./routes/tools.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", sessionRouter);
  app.use("/api", chatRouter);
  app.use("/api", compareRouter);
  app.use("/api", dashboardRouter);
  app.use("/api", contextRouter);
  app.use("/api", validationRouter);
  app.use("/api", profileRouter);
  app.use("/api", toolsRouter);

  return app;
}
