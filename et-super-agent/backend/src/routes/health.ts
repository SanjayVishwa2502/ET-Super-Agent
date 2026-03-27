import { Router } from "express";
import { llm } from "../services/llmService.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const llmHealthy = await llm.checkHealth();

  res.json({
    ok: true,
    service: "et-super-agent-backend",
    llm: {
      enabled: llm.isEnabled,
      available: llmHealthy,
      provider: llm.providerName,
      model: llm.modelName,
    },
  });
});
