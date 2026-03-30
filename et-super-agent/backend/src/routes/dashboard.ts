import { Router } from "express";
import { articleRepository, userRepository } from "../mockDb/repository.js";
import { getLiveNewsSnapshot } from "../services/liveNewsService.js";
import { LiveNewsCard } from "../types.js";

export const dashboardRouter = Router();

function isTruthyQueryFlag(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

dashboardRouter.get("/dashboard/live-news", async (req, res) => {
  const forceRefresh = isTruthyQueryFlag(req.query.force);

  try {
    const snapshot = await getLiveNewsSnapshot({ forceRefresh });
    res.json({
      liveNews: snapshot.cards,
      liveNewsMeta: {
        lastFetchedAt: snapshot.lastFetchedAt,
        cacheTtlSeconds: snapshot.cacheTtlSeconds,
        nextRefreshInSeconds: snapshot.nextRefreshInSeconds,
        sourceCount: snapshot.sourceCount,
        stale: snapshot.stale,
      },
    });
  } catch {
    res.json({
      liveNews: [],
      liveNewsMeta: {
        lastFetchedAt: undefined,
        cacheTtlSeconds: 0,
        nextRefreshInSeconds: 0,
        sourceCount: 0,
        stale: true,
      },
    });
  }
});

dashboardRouter.get("/dashboard/news", async (req, res) => {
  const articles = articleRepository.getAll();
  const users = userRepository.getAll();
  const forceRefresh = isTruthyQueryFlag(req.query.force);

  let liveNews: LiveNewsCard[] = [];
  let liveNewsMeta: {
    lastFetchedAt?: string;
    cacheTtlSeconds: number;
    nextRefreshInSeconds: number;
    sourceCount: number;
    stale: boolean;
  } = {
    lastFetchedAt: undefined,
    cacheTtlSeconds: 0,
    nextRefreshInSeconds: 0,
    sourceCount: 0,
    stale: true,
  };

  try {
    const snapshot = await getLiveNewsSnapshot({ forceRefresh });
    liveNews = snapshot.cards;
    liveNewsMeta = {
      lastFetchedAt: snapshot.lastFetchedAt,
      cacheTtlSeconds: snapshot.cacheTtlSeconds,
      nextRefreshInSeconds: snapshot.nextRefreshInSeconds,
      sourceCount: snapshot.sourceCount,
      stale: snapshot.stale,
    };
  } catch {
    liveNews = [];
  }

  // Return just what the dashboard needs to render the list of news
  const newsCards = articles.map(art => ({
    articleId: art.articleId,
    headline: art.headline,
    section: art.section,
    topicTags: art.topicTags,
    riskSignals: art.riskSignals
  }));

  const userPersonas = users.map(u => ({
    userId: u.userId,
    name: u.name,
    riskAppetite: u.riskAppetite,
    incomeBand: u.incomeBand,
    activeLoans: u.activeLoans,
  }));

  res.json({ newsCards, userPersonas, liveNews, liveNewsMeta });
});
