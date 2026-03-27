import { Router } from "express";
import { articleRepository, userRepository } from "../mockDb/repository.js";
import { getLiveNewsCards } from "../services/liveNewsService.js";
import { LiveNewsCard } from "../types.js";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard/news", async (req, res) => {
  const articles = articleRepository.getAll();
  const users = userRepository.getAll();
  let liveNews: LiveNewsCard[] = [];
  try {
    liveNews = await getLiveNewsCards();
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

  res.json({ newsCards, userPersonas, liveNews });
});
