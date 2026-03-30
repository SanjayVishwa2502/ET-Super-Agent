import { Router } from "express";
import { z } from "zod";
import { sessionStore } from "../store/sessionStore.js";
import { profileStore } from "../store/profileStore.js";
import { runRiskProfiler } from "../tools/riskProfiler.js";
import { runGoalPlanner } from "../tools/goalPlanner.js";
import { runFundScreener } from "../tools/fundScreener.js";
import { productRepository } from "../mockDb/repository.js";
import { runSpendAnalyzer } from "../tools/spendAnalyzer.js";

export const toolsRouter = Router();

const riskProfilerSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.object({
    investmentHorizon: z.enum(["lt_3y", "3_5y", "5_10y", "gt_10y"]),
    lossTolerance: z.enum(["none", "small", "moderate", "high"]),
    incomeStability: z.enum(["unstable", "variable", "stable", "very_stable"]),
    savingsRatePercent: z.number().min(0).max(100),
    ageBracket: z.enum(["18_25", "26_35", "36_50", "51_plus"]),
  }),
  notes: z.string().trim().max(500).optional(),
  persistToProfile: z.boolean().default(true),
});

const goalPlannerSchema = z.object({
  sessionId: z.string().min(1),
  input: z.object({
    targetGoal: z.string().min(2),
    targetAmount: z.number().positive(),
    timeHorizonMonths: z.number().int().min(6).max(600),
    currentSavings: z.number().min(0),
  }),
  notes: z.string().trim().max(500).optional(),
  persistToProfile: z.boolean().default(true),
});

const fundScreenerSchema = z.object({
  sessionId: z.string().min(1),
  input: z.object({
    riskProfile: z.enum(["low", "medium", "high"]).optional(),
    focusTags: z.array(z.string()).default([]),
    limit: z.number().int().min(1).max(20).default(5),
  }).default({ focusTags: [], limit: 5 }),
  notes: z.string().trim().max(500).optional(),
  persistToProfile: z.boolean().default(true),
});

const spendAnalyzerSchema = z.object({
  sessionId: z.string().min(1),
  input: z.object({
    monthlyIncome: z.number().positive(),
    rent: z.number().min(0),
    emis: z.number().min(0),
    discretionarySpend: z.number().min(0),
  }),
  notes: z.string().trim().max(500).optional(),
  persistToProfile: z.boolean().default(true),
});

function enrichRiskAnswersWithNotes(
  answers: {
    investmentHorizon: "lt_3y" | "3_5y" | "5_10y" | "gt_10y";
    lossTolerance: "none" | "small" | "moderate" | "high";
    incomeStability: "unstable" | "variable" | "stable" | "very_stable";
    savingsRatePercent: number;
    ageBracket: "18_25" | "26_35" | "36_50" | "51_plus";
  },
  notes?: string,
) {
  if (!notes) return answers;

  const normalized = notes.toLowerCase();
  const updated = { ...answers };

  if (normalized.includes("final year") || normalized.includes("student") || normalized.includes("first job")) {
    updated.ageBracket = "18_25";
  }

  if (
    normalized.includes("freelance") ||
    normalized.includes("unstable income") ||
    normalized.includes("irregular income")
  ) {
    updated.incomeStability = "unstable";
  } else if (normalized.includes("stable salary") || normalized.includes("fixed salary")) {
    updated.incomeStability = "stable";
  }

  if (normalized.includes("cannot tolerate loss") || normalized.includes("can't tolerate loss")) {
    updated.lossTolerance = "none";
  } else if (
    normalized.includes("high risk") ||
    normalized.includes("aggressive") ||
    normalized.includes("ok with volatility")
  ) {
    updated.lossTolerance = "high";
  }

  const savingsMatch = normalized.match(/save\s*(\d{1,2})\s*%/);
  if (savingsMatch) {
    const parsed = Number(savingsMatch[1]);
    if (Number.isFinite(parsed)) {
      updated.savingsRatePercent = Math.max(0, Math.min(100, parsed));
    }
  }

  return updated;
}

toolsRouter.post("/tools/risk-profiler", async (req, res) => {
  const parsed = riskProfilerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, answers, notes, persistToProfile } = parsed.data;
  const session = await sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const effectiveAnswers = enrichRiskAnswersWithNotes(answers, notes);
  const result = runRiskProfiler(effectiveAnswers);

  session.profileAnswers = {
    ...session.profileAnswers,
    riskProfilerScore: String(result.riskScore),
    riskProfilerLabel: result.riskLabel,
    riskPreference: result.riskLabel,
    riskProfilerInvestmentHorizon: effectiveAnswers.investmentHorizon,
    riskProfilerLossTolerance: effectiveAnswers.lossTolerance,
    riskProfilerIncomeStability: effectiveAnswers.incomeStability,
    riskProfilerSavingsRatePercent: String(effectiveAnswers.savingsRatePercent),
    riskProfilerAgeBracket: effectiveAnswers.ageBracket,
    riskProfilerNotes: notes ?? "",
  };

  session.updatedAt = new Date().toISOString();

  let savedProfileId = session.profileId;
  if (persistToProfile) {
    const savedProfile = await profileStore.save({
      profileId: session.profileId,
      profileAnswers: session.profileAnswers,
    });
    session.profileId = savedProfile.profileId;
    session.profileAnswers = savedProfile.profileAnswers;
    session.profileComplete = savedProfile.profileComplete;
    savedProfileId = savedProfile.profileId;
  }

  await sessionStore.set(session);

  res.json({
    ...result,
    savedToSession: true,
    savedToProfile: persistToProfile,
    profileId: savedProfileId,
  });
});

toolsRouter.post("/tools/goal-planner", async (req, res) => {
  const parsed = goalPlannerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, input, notes, persistToProfile } = parsed.data;
  const session = await sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const plannerResult = runGoalPlanner({
    ...input,
    riskPreference:
      session.profileAnswers.riskPreference === "low" ||
      session.profileAnswers.riskPreference === "medium" ||
      session.profileAnswers.riskPreference === "high"
        ? session.profileAnswers.riskPreference
        : undefined,
  });

  session.profileAnswers = {
    ...session.profileAnswers,
    topGoal: input.targetGoal,
    goalPlannerTargetGoal: input.targetGoal,
    goalPlannerTargetAmount: String(input.targetAmount),
    goalPlannerTimeHorizonMonths: String(input.timeHorizonMonths),
    goalPlannerCurrentSavings: String(input.currentSavings),
    goalPlannerMonthlyTarget: String(plannerResult.monthlyTarget),
    goalPlannerExpectedAnnualReturn: String(plannerResult.timeline.expectedAnnualReturn),
    goalPlannerAllocation: `${plannerResult.allocation.equity}/${plannerResult.allocation.debt}/${plannerResult.allocation.cash}`,
    goalPlannerNotes: notes ?? "",
  };

  session.updatedAt = new Date().toISOString();

  let savedProfileId = session.profileId;
  if (persistToProfile) {
    const savedProfile = await profileStore.save({
      profileId: session.profileId,
      profileAnswers: session.profileAnswers,
    });
    session.profileId = savedProfile.profileId;
    session.profileAnswers = savedProfile.profileAnswers;
    session.profileComplete = savedProfile.profileComplete;
    savedProfileId = savedProfile.profileId;
  }

  await sessionStore.set(session);

  res.json({
    ...plannerResult,
    savedToSession: true,
    savedToProfile: persistToProfile,
    profileId: savedProfileId,
  });
});

toolsRouter.post("/tools/fund-screener", async (req, res) => {
  const parsed = fundScreenerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, input, notes, persistToProfile } = parsed.data;
  const session = await sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const inferredRisk =
    input.riskProfile ??
    (session.profileAnswers.riskPreference === "low" ||
    session.profileAnswers.riskPreference === "medium" ||
    session.profileAnswers.riskPreference === "high"
      ? session.profileAnswers.riskPreference
      : undefined) ??
    (session.enrichedContext?.user?.riskAppetite ?? "medium");

  const screenerResult = runFundScreener({
    userRiskProfile: inferredRisk,
    funds: productRepository.getAll(),
    focusTags: input.focusTags,
    limit: input.limit,
  });

  session.profileAnswers = {
    ...session.profileAnswers,
    riskPreference: inferredRisk,
    fundScreenerRiskProfile: inferredRisk,
    fundScreenerFocusTags: input.focusTags.join(","),
    fundScreenerTopIds: screenerResult.results.map((item) => item.productId).join(","),
    fundScreenerTopCount: String(screenerResult.results.length),
    fundScreenerNotes: notes ?? "",
  };
  session.updatedAt = new Date().toISOString();

  let savedProfileId = session.profileId;
  if (persistToProfile) {
    const savedProfile = await profileStore.save({
      profileId: session.profileId,
      profileAnswers: session.profileAnswers,
    });
    session.profileId = savedProfile.profileId;
    session.profileAnswers = savedProfile.profileAnswers;
    session.profileComplete = savedProfile.profileComplete;
    savedProfileId = savedProfile.profileId;
  }

  await sessionStore.set(session);

  res.json({
    ...screenerResult,
    savedToSession: true,
    savedToProfile: persistToProfile,
    profileId: savedProfileId,
  });
});

toolsRouter.post("/tools/spend-analyzer", async (req, res) => {
  const parsed = spendAnalyzerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, input, notes, persistToProfile } = parsed.data;
  const session = await sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const analyzerResult = runSpendAnalyzer(input);

  session.profileAnswers = {
    ...session.profileAnswers,
    spendAnalyzerMonthlyIncome: String(input.monthlyIncome),
    spendAnalyzerRent: String(input.rent),
    spendAnalyzerEmis: String(input.emis),
    spendAnalyzerDiscretionarySpend: String(input.discretionarySpend),
    spendAnalyzerSavingsRate: String(analyzerResult.savingsRate),
    spendAnalyzerDebtRatio: String(analyzerResult.debtRatio),
    spendAnalyzerHealthScore: String(analyzerResult.healthScore),
    spendAnalyzerNotes: notes ?? "",
  };
  session.updatedAt = new Date().toISOString();

  let savedProfileId = session.profileId;
  if (persistToProfile) {
    const savedProfile = await profileStore.save({
      profileId: session.profileId,
      profileAnswers: session.profileAnswers,
    });
    session.profileId = savedProfile.profileId;
    session.profileAnswers = savedProfile.profileAnswers;
    session.profileComplete = savedProfile.profileComplete;
    savedProfileId = savedProfile.profileId;
  }

  await sessionStore.set(session);

  res.json({
    ...analyzerResult,
    savedToSession: true,
    savedToProfile: persistToProfile,
    profileId: savedProfileId,
  });
});
