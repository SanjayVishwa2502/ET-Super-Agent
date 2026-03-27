import { Router } from "express";
import { z } from "zod";
import { runConversationGraph } from "../orchestration/graph.js";
import { sessionStore } from "../store/sessionStore.js";
import { RecommendationCardResponse } from "../types.js";

export const chatRouter = Router();

const chatSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

chatRouter.post("/chat/message", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  session.history.push({ role: "user", content: parsed.data.message });

  const result = await runConversationGraph({
    session,
    message: parsed.data.message,
  });

  const responseCards: RecommendationCardResponse[] = result.recommendations.map((card) => ({
    title: card.title,
    type: card.type,
    why: card.why,
    cta: card.cta,
    url: card.url,
    toolId: card.toolId,
    toolAction: card.toolAction,
  }));

  result.updatedSession.history.push({ role: "assistant", content: result.assistantMessage });
  sessionStore.set(result.updatedSession);

  res.json({
    assistantMessage: result.assistantMessage,
    recommendations: responseCards,
    nextQuestion: result.nextQuestion,
    orchestration: {
      visitedNodes: result.visitedNodes,
      fallbackUsed: result.fallbackUsed,
      scenarioAssessment: result.scenarioAssessment,
      gapDetection: {
        label: result.gapLabel,
        strategy: result.gapStrategy,
      },
      crossSell: {
        triggered: result.crossSellTriggered,
        reason: result.crossSellReason,
        template: result.crossSellTemplate,
      },
    },
  });
});
