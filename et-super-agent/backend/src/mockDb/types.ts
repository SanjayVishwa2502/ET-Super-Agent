export interface UserProfile {
  userId: string;
  name: string;
  incomeBand: string;
  riskAppetite: "low" | "medium" | "high";
  activeLoans: string[];
  portfolioMix: {
    equity: number;
    debt: number;
    cash: number;
  };
  goals: string[];
}

export interface NewsArticle {
  articleId: string;
  headline: string;
  section: "Tax" | "Loans" | "Investments" | "Insurance";
  topicTags: string[];
  riskSignals: string[];
  productAffinityHints: string[];
  source?: string;
  sourceUrl?: string;
  publishedAt?: string;
}

export interface ProductItem {
  productId: string;
  title: string;
  category: "personal-loans" | "credit-cards" | "mutual-funds" | "insurance";
  eligibilityRules: {
    minIncomeBand?: string;
    riskLevel: "low" | "medium" | "high";
    requiresNoDebt?: boolean;
  };
  interestOrFee: string;
  benefitTags: string[];
}

