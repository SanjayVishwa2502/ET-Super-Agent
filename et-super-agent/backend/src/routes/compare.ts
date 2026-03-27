import { Router } from "express";
import { z } from "zod";
import { seedProducts } from "../mockDb/products.js";
import { ProductItem } from "../mockDb/types.js";
import { evaluateProductEligibility } from "../services/eligibilityEngine.js";
import { sessionStore } from "../store/sessionStore.js";

export const compareRouter = Router();

const compareSchema = z.object({
  sessionId: z.string().min(1),
  category: z.enum(["credit-cards", "personal-loans"]).default("credit-cards"),
});

function humanizeTag(tag: string): string {
  return tag
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeRiskForEligibility(raw?: string): "low" | "medium" | "high" {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("low") || value.includes("conservative")) return "low";
  if (value.includes("high") || value.includes("aggressive")) return "high";
  return "medium";
}

function deriveHasDebt(session: ReturnType<typeof sessionStore.get>): boolean {
  if (!session) {
    return false;
  }

  const loanStatus = session.profileAnswers.loanStatus?.toLowerCase();
  if (loanStatus === "has_loans") {
    return true;
  }
  if (loanStatus === "no_loans") {
    return false;
  }

  if ((session.enrichedContext?.user?.activeLoans.length ?? 0) > 0) {
    return true;
  }

  const topicText = `${session.pageContext.topic} ${(session.latestGoal ?? "")}`.toLowerCase();
  return topicText.includes("debt") || topicText.includes("loan") || topicText.includes("credit card due");
}

function buildProductPros(input: {
  product: ProductItem;
  topGoal?: string;
  riskPreference?: string;
}): string[] {
  const basePros = input.product.benefitTags.slice(0, 2).map((tag) => humanizeTag(tag));
  const pros = [...basePros];

  if (input.product.interestOrFee.toLowerCase().includes("lifetime free")) {
    pros.push("No annual fee burden");
  } else if (input.product.category === "personal-loans") {
    pros.push(`Transparent pricing: ${input.product.interestOrFee}`);
  } else {
    pros.push(`Pricing: ${input.product.interestOrFee}`);
  }

  const goal = (input.topGoal ?? "").toLowerCase();
  if (goal.includes("debt") && input.product.category === "personal-loans") {
    pros.push("Aligned with your debt reduction intent");
  }
  if (goal.includes("tax") && input.product.benefitTags.some((tag) => tag.includes("tax"))) {
    pros.push("Carries tax-benefit features");
  }

  const risk = (input.riskPreference ?? "").toLowerCase();
  if (risk === "low" && input.product.eligibilityRules.riskLevel === "low") {
    pros.push("Matches your conservative risk preference");
  }

  return Array.from(new Set(pros)).slice(0, 4);
}

function buildProductCons(input: {
  product: ProductItem;
  eligibilityReason: string;
  isEligible: boolean;
  hasDebt: boolean;
}): string[] {
  const cons: string[] = [];

  if (!input.isEligible) {
    cons.push(input.eligibilityReason);
  }

  if (input.product.eligibilityRules.requiresNoDebt && input.hasDebt) {
    cons.push("Not ideal while active debt is outstanding");
  }

  if (input.product.interestOrFee.toLowerCase().includes("year")) {
    cons.push(`Annual fee applies (${input.product.interestOrFee})`);
  }

  if (input.product.category === "personal-loans") {
    cons.push("Rate and tenure can vary after lender credit checks");
  }

  if (cons.length === 0) {
    cons.push("Review final terms and credit assessment before applying");
  }

  return Array.from(new Set(cons)).slice(0, 3);
}

compareRouter.post("/recommendations/compare", async (req, res) => {
  const parsed = compareSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { sessionId, category } = parsed.data;
  const session = sessionStore.get(sessionId);
  
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const profileIncome = session.profileAnswers.incomeRange ?? session.enrichedContext?.user?.incomeBand;
  const profileRisk = session.profileAnswers.riskPreference ?? session.enrichedContext?.user?.riskAppetite;
  const normalizedRisk = normalizeRiskForEligibility(profileRisk);
  const topGoal = session.profileAnswers.topGoal ?? session.latestGoal;
  const hasDebt = deriveHasDebt(session);

  const baseProducts = seedProducts.filter((product) => product.category === category);
  const evaluated = evaluateProductEligibility({
    profile: {
      incomeBand: profileIncome,
      riskAppetite: normalizedRisk,
      hasDebt,
      goalHint: topGoal,
      topicHint: session.pageContext.topic,
    },
    products: baseProducts,
  });

  const eligible = evaluated.filter((entry) => entry.eligibilityStatus === "eligible");
  const toDisplay = (eligible.length > 0 ? eligible : evaluated).slice(0, 3);

  const results = toDisplay.map((entry) => {
    const product = entry.product;
    const eligibilityPrefix = entry.eligibilityStatus === "eligible"
      ? "Eligible for your current profile."
      : "Currently ineligible for your profile.";

    return {
      productId: product.productId,
      title: product.title,
      pros: buildProductPros({
        product,
        topGoal,
        riskPreference: profileRisk,
      }),
      cons: buildProductCons({
        product,
        eligibilityReason: entry.reason,
        isEligible: entry.eligibilityStatus === "eligible",
        hasDebt,
      }),
      reason: `${eligibilityPrefix} ${entry.reason}`,
      eligibilityStatus: entry.eligibilityStatus,
      matchScore: entry.matchScore,
    };
  });

  res.json({
    category,
    recommendations: results,
  });
});
