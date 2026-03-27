export type GoalPlannerInput = {
  targetGoal: string;
  targetAmount: number;
  timeHorizonMonths: number;
  currentSavings: number;
  riskPreference?: "low" | "medium" | "high";
};

export type GoalPlannerResult = {
  monthlyTarget: number;
  recommendedAnnualSipStepUpPercent: number;
  allocation: {
    equity: number;
    debt: number;
    cash: number;
  };
  timeline: {
    targetGoal: string;
    targetAmount: number;
    currentSavings: number;
    months: number;
    years: number;
    expectedAnnualReturn: number;
    inflationAssumption: number;
    inflationAdjustedTargetAmount: number;
    expectedMaturityValue: number;
    shortfallAtCurrentSavingsOnly: number;
  };
  recommendations: string[];
};

function clampCurrency(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function getExpectedAnnualReturn(input: GoalPlannerInput): number {
  if (input.riskPreference === "low") {
    return 0.08;
  }
  if (input.riskPreference === "high") {
    return 0.13;
  }

  if (input.timeHorizonMonths >= 120) {
    return 0.12;
  }
  if (input.timeHorizonMonths >= 60) {
    return 0.11;
  }
  return 0.09;
}

function getInflationAssumption(input: GoalPlannerInput): number {
  if (input.timeHorizonMonths >= 120) return 0.06;
  if (input.timeHorizonMonths >= 60) return 0.055;
  return 0.05;
}

function getAllocation(input: GoalPlannerInput): GoalPlannerResult["allocation"] {
  if (input.riskPreference === "low" || input.timeHorizonMonths < 36) {
    return { equity: 25, debt: 60, cash: 15 };
  }
  if (input.riskPreference === "high" || input.timeHorizonMonths >= 120) {
    return { equity: 75, debt: 20, cash: 5 };
  }
  return { equity: 55, debt: 35, cash: 10 };
}

function futureValueOfLumpsum(principal: number, monthlyRate: number, months: number): number {
  return principal * Math.pow(1 + monthlyRate, months);
}

function requiredSipForTarget(
  targetAmount: number,
  futureValueOfCurrentSavings: number,
  monthlyRate: number,
  months: number,
): number {
  const targetFromSip = Math.max(0, targetAmount - futureValueOfCurrentSavings);
  if (targetFromSip === 0) {
    return 0;
  }

  if (monthlyRate <= 0) {
    return targetFromSip / months;
  }

  const annuityFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  if (annuityFactor <= 0) {
    return targetFromSip / months;
  }

  return targetFromSip / annuityFactor;
}

function buildRecommendations(input: {
  monthlyTarget: number;
  timelineYears: number;
  shortfallAtCurrentSavingsOnly: number;
  allocation: GoalPlannerResult["allocation"];
}): string[] {
  const recommendations: string[] = [];

  recommendations.push(
    `Start an automated monthly SIP of about Rs ${Math.round(input.monthlyTarget).toLocaleString("en-IN")} to stay on track.`,
  );

  if (input.timelineYears < 3) {
    recommendations.push("Since your timeline is short, prioritize debt-heavy instruments and keep an emergency buffer.");
  } else if (input.timelineYears >= 8) {
    recommendations.push("With a long timeline, disciplined equity exposure can improve long-term compounding.");
  }

  recommendations.push(
    `Suggested allocation: ${input.allocation.equity}% equity, ${input.allocation.debt}% debt, ${input.allocation.cash}% cash.`,
  );

  if (input.shortfallAtCurrentSavingsOnly > 0) {
    recommendations.push("Review this plan every 6 months and increase SIP by 8-10% annually to absorb inflation.");
  } else {
    recommendations.push("You are already close to target; focus on consistency and risk control.");
  }

  return recommendations;
}

export function runGoalPlanner(input: GoalPlannerInput): GoalPlannerResult {
  const annualReturn = getExpectedAnnualReturn(input);
  const inflationAssumption = getInflationAssumption(input);
  const monthlyRate = annualReturn / 12;
  const inflationMonthlyRate = inflationAssumption / 12;

  const inflationAdjustedTargetAmount = clampCurrency(
    input.targetAmount * Math.pow(1 + inflationMonthlyRate, input.timeHorizonMonths),
  );

  const fvCurrentSavings = futureValueOfLumpsum(
    input.currentSavings,
    monthlyRate,
    input.timeHorizonMonths,
  );

  const monthlyTarget = requiredSipForTarget(
    inflationAdjustedTargetAmount,
    fvCurrentSavings,
    monthlyRate,
    input.timeHorizonMonths,
  );

  const fvWithZeroSip = fvCurrentSavings;
  const shortfallAtCurrentSavingsOnly = Math.max(0, inflationAdjustedTargetAmount - fvWithZeroSip);
  const allocation = getAllocation(input);
  const years = Number((input.timeHorizonMonths / 12).toFixed(1));
  const recommendedAnnualSipStepUpPercent = years >= 8 ? 10 : years >= 4 ? 8 : 6;

  const expectedMaturityValue = clampCurrency(
    fvCurrentSavings +
      (monthlyRate > 0
        ? monthlyTarget * ((Math.pow(1 + monthlyRate, input.timeHorizonMonths) - 1) / monthlyRate)
        : monthlyTarget * input.timeHorizonMonths),
  );

  return {
    monthlyTarget: clampCurrency(monthlyTarget),
    recommendedAnnualSipStepUpPercent,
    allocation,
    timeline: {
      targetGoal: input.targetGoal,
      targetAmount: clampCurrency(input.targetAmount),
      currentSavings: clampCurrency(input.currentSavings),
      months: input.timeHorizonMonths,
      years,
      expectedAnnualReturn: Number((annualReturn * 100).toFixed(2)),
      inflationAssumption: Number((inflationAssumption * 100).toFixed(2)),
      inflationAdjustedTargetAmount,
      expectedMaturityValue,
      shortfallAtCurrentSavingsOnly: clampCurrency(shortfallAtCurrentSavingsOnly),
    },
    recommendations: buildRecommendations({
      monthlyTarget,
      timelineYears: years,
      shortfallAtCurrentSavingsOnly,
      allocation,
    }),
  };
}
