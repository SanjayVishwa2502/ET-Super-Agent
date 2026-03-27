import { Router } from "express";
import { z } from "zod";
import { sessionStore } from "../store/sessionStore.js";
import { userRepository, articleRepository } from "../mockDb/repository.js";
import { EnrichedContext } from "../types.js";

export const contextRouter = Router();

const selectArticleSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  articleId: z.string().min(1),
});

contextRouter.post("/context/select-article", (req, res) => {
  const parsed = selectArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, userId, articleId } = parsed.data;

  const session = sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // 1. Fetch from mock DB repos
  const user = userRepository.getById(userId);
  const article = articleRepository.getById(articleId);

  // 2. Aggregate an EnrichedContext snapshot
  const enrichedContext: EnrichedContext = {
    user,
    article,
    lastUpdatedAt: new Date().toISOString()
  };

  // 3. Update the session store memory
  session.enrichedContext = enrichedContext;

  // Backwards compatibility for exact prompt strings: if article is available, update standard pageContext
  if (article) {
    session.pageContext = {
      topic: article.section.toLowerCase(),
      tags: article.topicTags,
      articleId: article.articleId
    };
  }

  sessionStore.set(session);

  const contextMissing = !user || !article;
  const warnings: string[] = [];
  if (!user) warnings.push(`User '${userId}' not found in mock DB`);
  if (!article) warnings.push(`Article '${articleId}' not found in mock DB`);

  res.json({
    success: true,
    contextMissing,
    warnings: warnings.length > 0 ? warnings : undefined,
    activeContextSummary: {
      userId: user?.userId || "unknown",
      userName: user?.name || "Unknown User",
      articleId: article?.articleId || articleId,
      articleHeadline: article?.headline || "Article not found — fallback mode active",
    }
  });
});
