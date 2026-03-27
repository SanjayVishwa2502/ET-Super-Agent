import { ProductItem } from "../mockDb/types.js";

type RiskLevel = "low" | "medium" | "high";

export type EligibilityProfile = {
  incomeBand?: string;
  riskAppetite?: RiskLevel;
  hasDebt: boolean;
  goalHint?: string;
  topicHint?: string;
};

export type ProductEligibilityResult = {
  product: ProductItem;
  eligibilityStatus: "eligible" | "ineligible";
  reason: string;
  matchScore: number;
};

const INCOME_BAND_ORDER: Record<string, number> = {
  "below-5LPA": 1,
  "5-10LPA": 2,
  "10-15LPA": 3,
  "15-25LPA": 4,
  "25LPA+": 5,
  "30LPA+": 6,
};

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeRisk(raw?: string): RiskLevel {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("low") || value.includes("conservative")) return "low";
  if (value.includes("high") || value.includes("aggressive")) return "high";
  return "medium";
}

function normalizeIncomeBand(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const compact = raw.toLowerCase().replace(/\s+/g, "");

  if (compact.includes("below") && compact.includes("5")) return "below-5LPA";
  if ((compact.includes("5") && compact.includes("10")) || compact.includes("5-10lpa")) return "5-10LPA";
  if ((compact.includes("10") && compact.includes("15")) || compact.includes("10-15lpa")) return "10-15LPA";
  if ((compact.includes("15") && compact.includes("25")) || compact.includes("15-25lpa")) return "15-25LPA";
  if (compact.includes("30")) return "30LPA+";
  if (compact.includes("25")) return "25LPA+";

  return raw;
}

function productTagGoalBonus(tags: string[], goalHint?: string, topicHint?: string): number {
  const goal = (goalHint ?? "").toLowerCase();
  const topic = (topicHint ?? "").toLowerCase();
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  if ((goal.includes("tax") || topic.includes("tax")) && normalizedTags.some((tag) => tag.includes("tax"))) {
    return 8;
  }
  if ((goal.includes("debt") || topic.includes("loan")) && normalizedTags.some((tag) => tag.includes("debt") || tag.includes("low-interest"))) {
    return 8;
  }
  if ((goal.includes("invest") || topic.includes("invest")) && normalizedTags.some((tag) => tag.includes("wealth") || tag.includes("returns"))) {
    return 8;
  }
  if ((goal.includes("save") || topic.includes("save")) && normalizedTags.some((tag) => tag.includes("zero-fee") || tag.includes("safe"))) {
    return 8;
  }

  return 0;
}

function assessEligibility(input: {
  profile: EligibilityProfile;
  product: ProductItem;
}): ProductEligibilityResult {
  const product = input.product;
  const rules = product.eligibilityRules;

  const normalizedIncome = normalizeIncomeBand(input.profile.incomeBand);
  const normalizedRisk = normalizeRisk(input.profile.riskAppetite);

  const productIncomeRank = rules.minIncomeBand ? INCOME_BAND_ORDER[rules.minIncomeBand] : undefined;
  const userIncomeRank = normalizedIncome ? INCOME_BAND_ORDER[normalizedIncome] : undefined;

  const productRiskRank = RISK_ORDER[rules.riskLevel];
  const userRiskRank = RISK_ORDER[normalizedRisk];

  const reasons: string[] = [];
  let eligible = true;

  if (typeof productIncomeRank === "number" && typeof userIncomeRank === "number" && userIncomeRank < productIncomeRank) {
    eligible = false;
    reasons.push(`Income band ${normalizedIncome} is below minimum ${rules.minIncomeBand}.`);
  }

  if (userRiskRank < productRiskRank) {
    eligible = false;
    reasons.push(`Risk profile ${normalizedRisk} does not meet ${rules.riskLevel} product requirement.`);
  }

  if (rules.requiresNoDebt && input.profile.hasDebt) {
    eligible = false;
    reasons.push("Requires no active debt, but your profile indicates ongoing debt obligations.");
  }

  if (reasons.length === 0) {
    reasons.push("Meets income, risk, and debt eligibility checks.");
  }

  const incomeHeadroom =
    typeof productIncomeRank === "number" && typeof userIncomeRank === "number"
      ? Math.max(0, userIncomeRank - productIncomeRank)
      : 1;

  const riskHeadroom = Math.max(0, userRiskRank - productRiskRank);
  const score = Math.min(
    100,
    55 + incomeHeadroom * 10 + riskHeadroom * 12 + productTagGoalBonus(product.benefitTags, input.profile.goalHint, input.profile.topicHint),
  );

  return {
    product,
    eligibilityStatus: eligible ? "eligible" : "ineligible",
    reason: reasons.join(" "),
    matchScore: eligible ? score : Math.max(5, score - 45),
  };
}

export function evaluateProductEligibility(input: {
  profile: EligibilityProfile;
  products: ProductItem[];
}): ProductEligibilityResult[] {
  const evaluated = input.products.map((product) => assessEligibility({
    profile: input.profile,
    product,
  }));

  return evaluated.sort((a, b) => {
    if (a.eligibilityStatus !== b.eligibilityStatus) {
      return a.eligibilityStatus === "eligible" ? -1 : 1;
    }
    return b.matchScore - a.matchScore;
  });
}

export function getEligibleProducts(input: {
  profile: EligibilityProfile;
  products: ProductItem[];
}): ProductEligibilityResult[] {
  return evaluateProductEligibility(input).filter((entry) => entry.eligibilityStatus === "eligible");
}