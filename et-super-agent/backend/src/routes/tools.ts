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
  persistToProfile: z.boolean().default(true),
});

const fundScreenerSchema = z.object({
  sessionId: z.string().min(1),
  input: z.object({
    riskProfile: z.enum(["low", "medium", "high"]).optional(),
    focusTags: z.array(z.string()).default([]),
    limit: z.number().int().min(1).max(20).default(5),
  }).default({ focusTags: [], limit: 5 }),
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
  persistToProfile: z.boolean().default(true),
});

toolsRouter.post("/tools/risk-profiler", async (req, res) => {
  const parsed = riskProfilerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, answers, persistToProfile } = parsed.data;
  const session = sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = runRiskProfiler(answers);

  session.profileAnswers = {
    ...session.profileAnswers,
    riskProfilerScore: String(result.riskScore),
    riskProfilerLabel: result.riskLabel,
    riskPreference: result.riskLabel,
    riskProfilerInvestmentHorizon: answers.investmentHorizon,
    riskProfilerLossTolerance: answers.lossTolerance,
    riskProfilerIncomeStability: answers.incomeStability,
    riskProfilerSavingsRatePercent: String(answers.savingsRatePercent),
    riskProfilerAgeBracket: answers.ageBracket,
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

  sessionStore.set(session);

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

  const { sessionId, input, persistToProfile } = parsed.data;
  const session = sessionStore.get(sessionId);
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

  sessionStore.set(session);

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

  const { sessionId, input, persistToProfile } = parsed.data;
  const session = sessionStore.get(sessionId);
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

  sessionStore.set(session);

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

  const { sessionId, input, persistToProfile } = parsed.data;
  const session = sessionStore.get(sessionId);
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

  sessionStore.set(session);

  res.json({
    ...analyzerResult,
    savedToSession: true,
    savedToProfile: persistToProfile,
    profileId: savedProfileId,
  });
});
