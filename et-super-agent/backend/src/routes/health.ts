import { Router } from "express";
import { llm } from "../services/llmService.js";
import { profileStoreMeta } from "../store/profileStore.js";
import { sessionStoreMeta } from "../store/sessionStore.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const llmHealthy = await llm.checkHealth();

  res.json({
    ok: true,
    service: "et-super-agent-backend",
    profileStore: {
      mode: profileStoreMeta.mode,
    },
    sessionStore: {
      mode: sessionStoreMeta.mode,
    },
    llm: {
      enabled: llm.isEnabled,
      available: llmHealthy,
      provider: llm.providerName,
      model: llm.modelName,
    },
  });
});
