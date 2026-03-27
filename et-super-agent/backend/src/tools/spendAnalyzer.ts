export type SpendAnalyzerInput = {
  monthlyIncome: number;
  rent: number;
  emis: number;
  discretionarySpend: number;
};

export type SpendAnalyzerResult = {
  savingsRate: number;
  debtRatio: number;
  healthScore: number;
  budgetModel: "stability" | "growth" | "defensive";
  recommendations: string[];
  recommendedBudgets: {
    needsBudget: number;
    wantsBudget: number;
    savingsBudget: number;
  };
};

function clampPercent(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function clampMoney(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function calculateHealthScore(input: {
  savingsRate: number;
  debtRatio: number;
  discretionaryRatio: number;
}): number {
  // Weighted score: savings quality (45), debt pressure (35), spend discipline (20)
  const savingsScore = Math.min(45, (input.savingsRate / 30) * 45);
  const debtScore = Math.max(0, 35 - (input.debtRatio / 50) * 35);
  const spendScore = Math.max(0, 20 - (Math.max(0, input.discretionaryRatio - 20) / 30) * 20);
  const total = savingsScore + debtScore + spendScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

function buildRecommendations(input: {
  savingsRate: number;
  debtRatio: number;
  discretionaryRatio: number;
  monthlyIncome: number;
  needsSpend: number;
  budgetModel: "stability" | "growth" | "defensive";
}): string[] {
  const recommendations: string[] = [];

  if (input.savingsRate < 15) {
    recommendations.push("Increase monthly savings to at least 15% by reducing non-essential spends and auto-transferring savings on salary day.");
  } else if (input.savingsRate < 25) {
    recommendations.push("Your savings habit is reasonable; target 25% savings to build stronger long-term resilience.");
  } else {
    recommendations.push("Strong savings discipline. Keep this level and route surplus into goal-linked investments.");
  }

  if (input.debtRatio > 40) {
    recommendations.push("Debt pressure is high. Prioritize EMI optimization and debt consolidation to bring debt-to-income below 30%.");
  } else if (input.debtRatio > 25) {
    recommendations.push("Debt is manageable but elevated. Avoid taking fresh high-cost debt until current obligations reduce.");
  } else {
    recommendations.push("Debt load is healthy. Maintain this range and avoid EMI creep.");
  }

  if (input.discretionaryRatio > 35) {
    recommendations.push("Discretionary spend is heavy. Set category caps and weekly spend alerts to protect savings targets.");
  } else {
    recommendations.push("Discretionary spending is in a manageable band. Continue tracking with a monthly cap.");
  }

  if (input.budgetModel === "defensive") {
    recommendations.push("Use a defensive budget mode for the next 90 days: pause non-essential subscriptions and redirect surplus to debt reduction.");
  } else if (input.budgetModel === "growth") {
    recommendations.push("You can shift to a growth budget mode: maintain a strong savings floor and deploy incremental surplus into long-term wealth goals.");
  } else {
    recommendations.push("Stay in stability mode: keep needs controlled while gradually stepping up savings by 1-2% every quarter.");
  }

  const emergencyMonths = input.needsSpend > 0
    ? Math.max(0, Math.floor((input.monthlyIncome * (input.savingsRate / 100) * 6) / input.needsSpend))
    : 0;
  recommendations.push(`Build an emergency corpus covering at least 6 months of essential expenses (current projected coverage pace: ${emergencyMonths} month-equivalents in 6 months).`);

  return recommendations;
}

function chooseBudgetModel(input: { savingsRate: number; debtRatio: number }): "stability" | "growth" | "defensive" {
  if (input.debtRatio >= 35 || input.savingsRate < 10) return "defensive";
  if (input.savingsRate >= 25 && input.debtRatio <= 20) return "growth";
  return "stability";
}

function targetBudgetSplit(model: "stability" | "growth" | "defensive"): {
  needs: number;
  wants: number;
  savings: number;
} {
  if (model === "defensive") {
    return { needs: 0.55, wants: 0.15, savings: 0.3 };
  }
  if (model === "growth") {
    return { needs: 0.5, wants: 0.2, savings: 0.3 };
  }
  return { needs: 0.5, wants: 0.25, savings: 0.25 };
}

export function runSpendAnalyzer(input: SpendAnalyzerInput): SpendAnalyzerResult {
  const monthlyIncome = clampMoney(input.monthlyIncome);
  const rent = clampMoney(input.rent);
  const emis = clampMoney(input.emis);
  const discretionarySpend = clampMoney(input.discretionarySpend);

  const needsSpend = rent + emis;
  const totalSpend = needsSpend + discretionarySpend;
  const savings = Math.max(0, monthlyIncome - totalSpend);

  const savingsRate = monthlyIncome > 0 ? clampPercent((savings / monthlyIncome) * 100) : 0;
  const debtRatio = monthlyIncome > 0 ? clampPercent((emis / monthlyIncome) * 100) : 0;
  const discretionaryRatio = monthlyIncome > 0 ? clampPercent((discretionarySpend / monthlyIncome) * 100) : 0;

  const healthScore = calculateHealthScore({
    savingsRate,
    debtRatio,
    discretionaryRatio,
  });

  const budgetModel = chooseBudgetModel({ savingsRate, debtRatio });
  const split = targetBudgetSplit(budgetModel);

  const recommendedBudgets = {
    needsBudget: clampMoney(monthlyIncome * split.needs),
    wantsBudget: clampMoney(monthlyIncome * split.wants),
    savingsBudget: clampMoney(monthlyIncome * split.savings),
  };

  return {
    savingsRate,
    debtRatio,
    healthScore,
    budgetModel,
    recommendations: buildRecommendations({
      savingsRate,
      debtRatio,
      discretionaryRatio,
      monthlyIncome,
      needsSpend,
      budgetModel,
    }),
    recommendedBudgets,
  };
}
