import { Router } from "express";
import { llm } from "../services/llmService.js";
import { profileStoreMeta } from "../store/profileStore.js";
import { sessionStoreMeta } from "../store/sessionStore.js";
import { checkSqlDatabaseConnection } from "../store/sqlDatabase.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const llmHealthy = await llm.checkHealth();
  const dbHealth = await checkSqlDatabaseConnection();

  res.json({
    ok: true,
    service: "et-super-agent-backend",
    profileStore: {
      mode: profileStoreMeta.mode,
    },
    sessionStore: {
      mode: sessionStoreMeta.mode,
    },
    database: {
      connected: dbHealth.ok,
      error: dbHealth.error,
    },
    llm: {
      enabled: llm.isEnabled,
      available: llmHealthy,
      provider: llm.providerName,
      model: llm.modelName,
    },
  });
});
