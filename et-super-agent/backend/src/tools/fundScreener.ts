import { ProductItem } from "../mockDb/types.js";

export type FundScreenerInput = {
  userRiskProfile: "low" | "medium" | "high";
  funds: ProductItem[];
  focusTags?: string[];
  limit?: number;
};

export type ScreenedFund = {
  productId: string;
  title: string;
  riskLevel: "low" | "medium" | "high";
  interestOrFee: string;
  benefitTags: string[];
  matchScore: number;
  eligibilityStatus: "eligible" | "borderline" | "ineligible";
  eligibilityNote: string;
};

export type FundScreenerResult = {
  userRiskProfile: "low" | "medium" | "high";
  totalFundsConsidered: number;
  totalFilteredFunds: number;
  results: ScreenedFund[];
  scoringModel: {
    riskFitWeight: number;
    tagFitWeight: number;
    feeWeight: number;
    riskBonusWeight: number;
  };
};

function riskRank(level: "low" | "medium" | "high"): number {
  if (level === "low") return 1;
  if (level === "medium") return 2;
  return 3;
}

function getEligibilityStatus(input: {
  userRisk: "low" | "medium" | "high";
  fundRisk: "low" | "medium" | "high";
}): { status: "eligible" | "borderline" | "ineligible"; note: string; riskFitScore: number } {
  const userRank = riskRank(input.userRisk);
  const fundRank = riskRank(input.fundRisk);

  if (fundRank === userRank) {
    return {
      status: "eligible",
      note: `Direct risk match: your ${input.userRisk} profile aligns with a ${input.fundRisk} risk fund.`,
      riskFitScore: 70,
    };
  }

  if (Math.abs(fundRank - userRank) === 1) {
    return {
      status: "borderline",
      note: `Near match: this ${input.fundRisk} risk fund is one level away from your ${input.userRisk} profile.`,
      riskFitScore: 45,
    };
  }

  return {
    status: "ineligible",
    note: `Risk mismatch: this ${input.fundRisk} risk fund is not suitable for your ${input.userRisk} profile.`,
    riskFitScore: 10,
  };
}

function calculateTagFitScore(benefitTags: string[], focusTags?: string[]): number {
  if (!focusTags || focusTags.length === 0) {
    return 15;
  }

  const normalizedBenefits = benefitTags.map((tag) => tag.toLowerCase());
  const normalizedFocus = focusTags.map((tag) => tag.toLowerCase());
  const overlap = normalizedFocus.filter((tag) => normalizedBenefits.includes(tag)).length;

  if (overlap === 0) {
    return 0;
  }

  return Math.min(30, overlap * 10);
}

function calculateFeeScore(interestOrFee: string): number {
  const normalized = interestOrFee.toLowerCase();
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return 5;

  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return 5;

  if (normalized.includes("expense") || normalized.includes("fee")) {
    if (numeric <= 0.5) return 15;
    if (numeric <= 1.0) return 12;
    if (numeric <= 1.5) return 8;
    return 4;
  }

  // If value represents return/yield style wording, reward moderately.
  if (numeric >= 15) return 12;
  if (numeric >= 10) return 9;
  if (numeric >= 6) return 6;
  return 4;
}

function calculateDiversificationBonus(tags: string[]): number {
  const normalized = tags.map((tag) => tag.toLowerCase());
  const hasDiversifiedTag = normalized.some((tag) =>
    ["diversified", "index", "large-cap", "large cap", "multi-asset", "balanced"].some((needle) => tag.includes(needle)),
  );
  return hasDiversifiedTag ? 5 : 0;
}

function addRiskPreferenceBonus(input: {
  userRisk: "low" | "medium" | "high";
  fundRisk: "low" | "medium" | "high";
}): number {
  // Prefer a slight conservative tilt for low/medium users.
  if (input.userRisk === "low" && input.fundRisk === "low") return 10;
  if (input.userRisk === "medium" && input.fundRisk === "low") return 5;
  if (input.userRisk === "high" && input.fundRisk === "high") return 10;
  return 0;
}

export function runFundScreener(input: FundScreenerInput): FundScreenerResult {
  const mutualFunds = input.funds.filter((product) => product.category === "mutual-funds");

  const scored = mutualFunds.map((fund) => {
    const fundRisk = fund.eligibilityRules.riskLevel;
    const riskAssessment = getEligibilityStatus({
      userRisk: input.userRiskProfile,
      fundRisk,
    });

    const tagFitScore = calculateTagFitScore(fund.benefitTags, input.focusTags);
    const feeScore = calculateFeeScore(fund.interestOrFee);
    const diversificationBonus = calculateDiversificationBonus(fund.benefitTags);
    const riskBonus = addRiskPreferenceBonus({
      userRisk: input.userRiskProfile,
      fundRisk,
    });

    const matchScore = Math.min(
      100,
      riskAssessment.riskFitScore + tagFitScore + feeScore + diversificationBonus + riskBonus,
    );

    return {
      productId: fund.productId,
      title: fund.title,
      riskLevel: fundRisk,
      interestOrFee: fund.interestOrFee,
      benefitTags: fund.benefitTags,
      matchScore,
      eligibilityStatus: riskAssessment.status,
      eligibilityNote: riskAssessment.note,
    } satisfies ScreenedFund;
  });

  const sorted = scored
    .sort((a, b) => {
      if (a.eligibilityStatus !== b.eligibilityStatus) {
        const weight = { eligible: 3, borderline: 2, ineligible: 1 };
        return weight[b.eligibilityStatus] - weight[a.eligibilityStatus];
      }
      return b.matchScore - a.matchScore;
    })
    .slice(0, input.limit ?? 5);

  return {
    userRiskProfile: input.userRiskProfile,
    totalFundsConsidered: mutualFunds.length,
    totalFilteredFunds: sorted.length,
    results: sorted,
    scoringModel: {
      riskFitWeight: 70,
      tagFitWeight: 30,
      feeWeight: 15,
      riskBonusWeight: 10,
    },
  };
}
