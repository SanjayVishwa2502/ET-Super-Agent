export type PageContext = {
  topic: string;
  tags: string[];
};

export type RecommendationCard = {
  title: string;
  type: "product" | "tool" | "event" | "service";
  why: string;
  cta: string;
  url: string;
  toolId?: string;
  toolAction?: "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";
};

export type ChatResponse = {
  assistantMessage: string;
  nextQuestion?: string;
  recommendations: RecommendationCard[];
  orchestration: {
    visitedNodes: string[];
    fallbackUsed: boolean;
    gapDetection: {
      label?: string;
      strategy?: any;
    };
    crossSell: {
      triggered: boolean;
      reason?: string;
    };
  };
};

export type RecommendationItem = {
  productId?: string;
  title: string;
  pros: string[];
  cons: string[];
  reason: string;
  eligibilityStatus?: "eligible" | "ineligible";
  matchScore?: number;
};

export type CompareResponse = {
  category: string;
  recommendations: RecommendationItem[];
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: RecommendationCard[];
  orchestrationData?: any;
  compareData?: CompareResponse;
};

// --- Mock DB Dashboard Types ---

export type NewsCard = {
  articleId: string;
  headline: string;
  section: "Tax" | "Loans" | "Investments" | "Insurance";
  topicTags: string[];
  riskSignals: string[];
  source?: string;
  url?: string;
  publishedAt?: string;
  summary?: string;
  category?: LiveNewsCategory;
  fromLiveFeed?: boolean;
};

export type UserPersona = {
  userId: string;
  name: string;
  riskAppetite: "low" | "medium" | "high";
  incomeBand: string;
  activeLoans: string[];
};

export type ActiveContextSummary = {
  userId: string;
  userName: string;
  articleId: string;
  articleHeadline: string;
};

export type DashboardData = {
  newsCards: NewsCard[];
  userPersonas: UserPersona[];
  liveNews?: LiveNewsCard[];
  liveNewsMeta?: LiveNewsMeta;
};

export type LiveNewsCategory = "Home" | "Wealth" | "Markets" | "News";

export type LiveNewsCard = {
  headline: string;
  url: string;
  source: string;
  publishedAt?: string;
  section: "Tax" | "Loans" | "Investments" | "Insurance";
  category: LiveNewsCategory;
  summary?: string;
};

export type LiveNewsMeta = {
  lastFetchedAt?: string;
  cacheTtlSeconds: number;
  nextRefreshInSeconds: number;
  sourceCount: number;
  stale: boolean;
};

export type SubProfile = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  extractedContext?: string;
  createdAt: string;
};

export type SavedProfile = {
  profileId: string;
  name: string;
  profileComplete: boolean;
  updatedAt: string;
  profileAnswers: Record<string, string>;
  subProfiles?: SubProfile[];
};
