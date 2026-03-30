import { Router } from "express";
import { z } from "zod";
import { sessionStore } from "../store/sessionStore.js";
import { userRepository, articleRepository } from "../mockDb/repository.js";
import { EnrichedContext } from "../types.js";
import { summarizeCurrentNews } from "../services/newsSummaryService.js";

export const contextRouter = Router();

const selectArticleSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  articleId: z.string().min(1),
});

const selectLiveNewsSchema = z.object({
  sessionId: z.string().min(1),
  headline: z.string().min(1),
  section: z.enum(["Tax", "Loans", "Investments", "Insurance"]),
  source: z.string().min(1),
  url: z.string().url(),
});

const summarizeCurrentSchema = z.object({
  sessionId: z.string().min(1),
});

contextRouter.post("/context/select-article", async (req, res) => {
  const parsed = selectArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, userId, articleId } = parsed.data;

  const session = await sessionStore.get(sessionId);
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

  await sessionStore.set(session);

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

contextRouter.post("/context/select-live-news", async (req, res) => {
  const parsed = selectLiveNewsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, headline, section, source, url } = parsed.data;

  const session = await sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const articleId = `live-${Date.now()}`;
  session.pageContext = {
    topic: section.toLowerCase(),
    tags: [section.toLowerCase(), source.toLowerCase(), "live-news"],
    articleId,
  };

  session.enrichedContext = {
    user: session.enrichedContext?.user ?? null,
    article: {
      articleId,
      headline,
      section,
      topicTags: [section.toLowerCase(), source.toLowerCase(), "live-news"],
      riskSignals: ["live-market-update"],
      productAffinityHints: ["contextual"],
      source,
      sourceUrl: url,
    },
    lastUpdatedAt: new Date().toISOString(),
  };

  await sessionStore.set(session);

  res.json({
    success: true,
    activeContextSummary: {
      userId: session.enrichedContext.user?.userId ?? "guest",
      userName: session.enrichedContext.user?.name ?? (session.profileAnswers.name || "Guest"),
      articleId,
      articleHeadline: headline,
      source,
      sourceUrl: url,
    },
  });
});

contextRouter.post("/context/summarize-current", async (req, res) => {
  const parsed = summarizeCurrentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const session = await sessionStore.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const summary = await summarizeCurrentNews(session);
  const articleHeadline = session.enrichedContext?.article?.headline ?? "selected news";

  const insightsMarkdown = summary.insights.map((item) => `- ${item}`).join("\n");
  const watchoutsMarkdown = summary.watchouts.length > 0
    ? `\n\nWatchouts:\n${summary.watchouts.map((item) => `- ${item}`).join("\n")}`
    : "";

  const composedMessage = `News summary for **${articleHeadline}**:\n\n${summary.summary}\n\nKey insights:\n${insightsMarkdown}${watchoutsMarkdown}`;

  session.history.push({ role: "user", content: "Summarize this news" });
  session.history.push({ role: "assistant", content: composedMessage });
  await sessionStore.set(session);

  res.json({
    assistantMessage: composedMessage,
    fallbackUsed: summary.fallbackUsed,
    sourceHeadline: articleHeadline,
  });
});
