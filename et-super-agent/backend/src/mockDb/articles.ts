import { NewsArticle } from "./types.js";

export const seedArticles: NewsArticle[] = [
  {
    articleId: "art_tax_01",
    headline: "New Tax Regime vs Old: What millennials must know before March",
    section: "Tax",
    topicTags: ["income-tax", "regime-change", "millennials"],
    riskSignals: ["low-risk", "compliance-heavy"],
    productAffinityHints: ["tax_saving_mutual_funds", "health_insurance"],
  },
  {
    articleId: "art_tax_02",
    headline: "Section 80C is fading: How to save tax without ELSS",
    section: "Tax",
    topicTags: ["80c", "tax-planning", "nps"],
    riskSignals: ["low-risk"],
    productAffinityHints: ["nps", "ppf", "tax_free_bonds"],
  },
  {
    articleId: "art_loans_01",
    headline: "RBI holds repo rate: Personal loan EMIs to remain stable",
    section: "Loans",
    topicTags: ["rbi", "personal-loans", "interest-rates"],
    riskSignals: ["debt-stress", "macro-economy"],
    productAffinityHints: ["personal_loan", "balance_transfer"],
  },
  {
    articleId: "art_loans_02",
    headline: "Credit Card traps: Are you paying 40% interest silently?",
    section: "Loans",
    topicTags: ["credit-cards", "debt-trap", "financial-literacy"],
    riskSignals: ["high-debt-stress", "urgent-action"],
    productAffinityHints: ["debt_consolidation_loan", "low_interest_credit_card"],
  },
  {
    articleId: "art_invest_01",
    headline: "Nifty hits record high: Should you book profits or hold?",
    section: "Investments",
    topicTags: ["stock-market", "nifty", "equity"],
    riskSignals: ["high-volatility", "high-risk"],
    productAffinityHints: ["equity_mutual_funds", "portfolio_management_services"],
  },
  {
    articleId: "art_invest_02",
    headline: "Safe Haven: Why FD rates at 8% are attractive for retirees",
    section: "Investments",
    topicTags: ["fixed-deposits", "safe-returns", "retirees"],
    riskSignals: ["low-risk", "capital-preservation"],
    productAffinityHints: ["fixed_deposits", "senior_citizen_savings_scheme"],
  },
  {
    articleId: "art_ins_01",
    headline: "Term life premiums rise 10%: Lock your rates now",
    section: "Insurance",
    topicTags: ["term-insurance", "premiums", "life-cover"],
    riskSignals: ["protection-gap", "family-liability"],
    productAffinityHints: ["term_insurance"],
  },
  {
    articleId: "art_ins_02",
    headline: "Health Insurance for parents: Don't rely solely on corporate policies",
    section: "Insurance",
    topicTags: ["health-insurance", "parents", "mediclaim"],
    riskSignals: ["health-emergency-risk", "medical-inflation"],
    productAffinityHints: ["senior_citizen_health_insurance", "top_up_health_cover"],
  }
];
