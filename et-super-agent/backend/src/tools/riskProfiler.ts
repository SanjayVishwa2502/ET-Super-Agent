export type RiskProfilerInput = {
  investmentHorizon: "lt_3y" | "3_5y" | "5_10y" | "gt_10y";
  lossTolerance: "none" | "small" | "moderate" | "high";
  incomeStability: "unstable" | "variable" | "stable" | "very_stable";
  savingsRatePercent: number;
  ageBracket: "18_25" | "26_35" | "36_50" | "51_plus";
};

export type RiskProfilerResult = {
  riskScore: number;
  riskLabel: "low" | "medium" | "high";
  explanation: string;
  suggestedAllocation: {
    equity: number;
    debt: number;
    cash: number;
  };
  componentScores: {
    investmentHorizon: number;
    lossTolerance: number;
    incomeStability: number;
    savingsRate: number;
    ageBracket: number;
  };
};

export const RISK_PROFILER_QUESTIONS = [
  {
    id: "investmentHorizon",
    label: "What is your investment horizon?",
    options: [
      { value: "lt_3y", label: "Less than 3 years" },
      { value: "3_5y", label: "3 to 5 years" },
      { value: "5_10y", label: "5 to 10 years" },
      { value: "gt_10y", label: "More than 10 years" },
    ],
  },
  {
    id: "lossTolerance",
    label: "How much short-term loss can you tolerate?",
    options: [
      { value: "none", label: "I cannot tolerate losses" },
      { value: "small", label: "Small temporary losses" },
      { value: "moderate", label: "Moderate volatility is okay" },
      { value: "high", label: "High volatility is acceptable" },
    ],
  },
  {
    id: "incomeStability",
    label: "How stable is your monthly income?",
    options: [
      { value: "unstable", label: "Unstable" },
      { value: "variable", label: "Variable" },
      { value: "stable", label: "Stable" },
      { value: "very_stable", label: "Very stable" },
    ],
  },
  {
    id: "savingsRatePercent",
    label: "What percentage of your income do you save monthly?",
    type: "number",
  },
  {
    id: "ageBracket",
    label: "Which age bracket are you in?",
    options: [
      { value: "18_25", label: "18 to 25" },
      { value: "26_35", label: "26 to 35" },
      { value: "36_50", label: "36 to 50" },
      { value: "51_plus", label: "51+" },
    ],
  },
] as const;

function mapHorizonScore(value: RiskProfilerInput["investmentHorizon"]): number {
  if (value === "lt_3y") return 1;
  if (value === "3_5y") return 2;
  if (value === "5_10y") return 3;
  return 4;
}

function mapLossToleranceScore(value: RiskProfilerInput["lossTolerance"]): number {
  if (value === "none") return 1;
  if (value === "small") return 2;
  if (value === "moderate") return 3;
  return 4;
}

function mapIncomeStabilityScore(value: RiskProfilerInput["incomeStability"]): number {
  if (value === "unstable") return 1;
  if (value === "variable") return 2;
  if (value === "stable") return 3;
  return 4;
}

function mapSavingsRateScore(savingsRatePercent: number): number {
  if (savingsRatePercent <= 10) return 1;
  if (savingsRatePercent <= 20) return 2;
  if (savingsRatePercent <= 35) return 3;
  return 4;
}

function mapAgeScore(value: RiskProfilerInput["ageBracket"]): number {
  if (value === "18_25") return 4;
  if (value === "26_35") return 3;
  if (value === "36_50") return 2;
  return 1;
}

function normalizeToRiskScore(total: number): number {
  // component total range: 5..20 -> normalize to 1..10
  const normalized = 1 + ((total - 5) / 15) * 9;
  return Math.max(1, Math.min(10, Math.round(normalized)));
}

function toRiskLabel(score: number): RiskProfilerResult["riskLabel"] {
  if (score <= 3) return "low";
  if (score <= 7) return "medium";
  return "high";
}

function toSuggestedAllocation(label: RiskProfilerResult["riskLabel"]): RiskProfilerResult["suggestedAllocation"] {
  if (label === "low") {
    return { equity: 25, debt: 60, cash: 15 };
  }
  if (label === "medium") {
    return { equity: 55, debt: 35, cash: 10 };
  }
  return { equity: 75, debt: 20, cash: 5 };
}

function buildExplanation(input: {
  label: RiskProfilerResult["riskLabel"];
  score: number;
  horizon: RiskProfilerInput["investmentHorizon"];
  savingsRatePercent: number;
}): string {
  const horizonText = input.horizon === "gt_10y"
    ? "a long investment horizon"
    : input.horizon === "5_10y"
      ? "a medium-to-long investment horizon"
      : input.horizon === "3_5y"
        ? "a medium investment horizon"
        : "a short investment horizon";

  const labelText = input.label === "high"
    ? "high growth-oriented"
    : input.label === "medium"
      ? "balanced growth"
      : "capital-preservation focused";

  return `Your risk profile is ${input.label.toUpperCase()} (${input.score}/10), indicating a ${labelText} approach based on ${horizonText} and a monthly savings rate of ${input.savingsRatePercent}%.`;
}

export function runRiskProfiler(input: RiskProfilerInput): RiskProfilerResult {
  const componentScores = {
    investmentHorizon: mapHorizonScore(input.investmentHorizon),
    lossTolerance: mapLossToleranceScore(input.lossTolerance),
    incomeStability: mapIncomeStabilityScore(input.incomeStability),
    savingsRate: mapSavingsRateScore(input.savingsRatePercent),
    ageBracket: mapAgeScore(input.ageBracket),
  };

  const total =
    componentScores.investmentHorizon +
    componentScores.lossTolerance +
    componentScores.incomeStability +
    componentScores.savingsRate +
    componentScores.ageBracket;

  const riskScore = normalizeToRiskScore(total);
  const riskLabel = toRiskLabel(riskScore);
  const suggestedAllocation = toSuggestedAllocation(riskLabel);

  return {
    riskScore,
    riskLabel,
    explanation: buildExplanation({
      label: riskLabel,
      score: riskScore,
      horizon: input.investmentHorizon,
      savingsRatePercent: input.savingsRatePercent,
    }),
    suggestedAllocation,
    componentScores,
  };
}
