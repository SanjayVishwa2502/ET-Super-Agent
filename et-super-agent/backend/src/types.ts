import { UserProfile, NewsArticle } from "./mockDb/types.js";

export type PageContext = {
  topic: string;
  tags: string[];
  articleId?: string;
};

export type EnrichedContext = {
  user: UserProfile | null;
  article: NewsArticle | null;
  lastUpdatedAt: string;
};

export type UserSession = {
  sessionId: string;
  profileId?: string;
  createdAt: string;
  updatedAt: string;
  pageContext: PageContext;
  enrichedContext?: EnrichedContext;
  profileAnswers: Record<string, string>;
  profileComplete: boolean;
  persona: string;
  intents: string[];
  latestGoal?: string;
  recommendationHistory: string[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

export type PersistedProfile = {
  profileId: string;
  profileAnswers: Record<string, string>;
  email?: string;
  passwordHash?: string;
  profileComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LiveNewsCard = {
  headline: string;
  url: string;
  source: string;
  publishedAt?: string;
  section: "Tax" | "Loans" | "Investments" | "Insurance";
};

export type RecommendationCard = {
  id: string;
  title: string;
  type: "product" | "tool" | "event" | "service";
  why: string;
  cta: string;
  url: string;
  score: number;
  toolId?: string;
  toolAction?: "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";
};

export type RecommendationCardResponse = {
  title: string;
  type: "product" | "tool" | "event" | "service";
  why: string;
  cta: string;
  url: string;
  toolId?: string;
  toolAction?: "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";
};
