import { UserSession } from "../types.js";
import { llm } from "../services/llmService.js";
import { NAVIGATOR_SYSTEM_PROMPT, fillPromptTemplate } from "../services/llmPrompts.js";

export type GapLabel =
  | "TAX_CONFUSION"
  | "FD_INFLATION_GAP"
  | "DEBT_STRESS"
  | "INSURANCE_GAP"
  | "INVESTMENT_CONFUSION"
  | "GENERAL_INQUIRY";

export type GapStrategy = {
  label: GapLabel;
  strategy: string;
  recommendationFocus: Array<"product" | "tool" | "event" | "service">;
};

const GAP_STRATEGY_MAP: Record<GapLabel, GapStrategy> = {
  TAX_CONFUSION: {
    label: "TAX_CONFUSION",
    strategy:
      "Prioritize tax education first, then tax-saving tools, then relevant masterclass/event enrollment.",
    recommendationFocus: ["product", "tool", "event"],
  },
  FD_INFLATION_GAP: {
    label: "FD_INFLATION_GAP",
    strategy:
      "Prioritize inflation awareness and diversification guidance, followed by portfolio planning tools.",
    recommendationFocus: ["product", "tool", "event"],
  },
  DEBT_STRESS: {
    label: "DEBT_STRESS",
    strategy:
      "Prioritize debt reduction guidance first, then consolidation/comparison service options with clear rationale.",
    recommendationFocus: ["product", "service", "tool"],
  },
  INSURANCE_GAP: {
    label: "INSURANCE_GAP",
    strategy:
      "Prioritize protection fundamentals first, then insurance planning tools and suitable product options.",
    recommendationFocus: ["product", "tool", "service"],
  },
  INVESTMENT_CONFUSION: {
    label: "INVESTMENT_CONFUSION",
    strategy:
      "Prioritize clarity on asset allocation and risk alignment, then provide guided screening and planning tools.",
    recommendationFocus: ["tool", "product", "event"],
  },
  GENERAL_INQUIRY: {
    label: "GENERAL_INQUIRY",
    strategy:
      "Provide broad financial orientation first, then offer the most relevant next-step tools and educational products.",
    recommendationFocus: ["product", "tool", "event"],
  },
};

type RecommendationFocus = Array<"product" | "tool" | "event" | "service">;

type GapDecision = {
  label: GapLabel;
  confidence: number;
  reasoning?: string;
  source: "llm" | "rules";
  recommendationFocus?: RecommendationFocus;
};

function normalized(text: string): string {
  return text.toLowerCase();
}

export function detectGapLabel(input: { message: string; session: UserSession }): GapLabel {
  const msg = normalized(input.message);
  const topic = normalized(input.session.pageContext.topic);
  const intent = normalized(input.session.intents[0] ?? "");
  const hasActiveLoans = (input.session.enrichedContext?.user?.activeLoans?.length ?? 0) > 0;
  const hasInsuranceHints =
    msg.includes("insurance") ||
    msg.includes("cover") ||
    msg.includes("term plan") ||
    msg.includes("health plan") ||
    topic.includes("insurance") ||
    intent.includes("insurance");
  if (hasInsuranceHints) {
    return "INSURANCE_GAP";
  }

  const hasInvestmentConfusion =
    msg.includes("where to invest") ||
    msg.includes("which fund") ||
    msg.includes("confused") ||
    msg.includes("allocation") ||
    msg.includes("mutual fund") ||
    topic.includes("investment") ||
    intent.includes("portfolio");
  if (hasInvestmentConfusion) {
    return "INVESTMENT_CONFUSION";
  }

  const messageHasDebt =
    msg.includes("debt") || msg.includes("credit card") || msg.includes("loan");
  if (messageHasDebt) {
    return "DEBT_STRESS";
  }

  const messageHasFdInflation =
    (msg.includes("fd") || msg.includes("fixed deposit")) && msg.includes("inflation");
  if (messageHasFdInflation) {
    return "FD_INFLATION_GAP";
  }

  const messageHasTax = msg.includes("tax");
  if (messageHasTax) {
    return "TAX_CONFUSION";
  }

  const hasTax = msg.includes("tax") || topic.includes("tax") || intent.includes("tax");
  if (hasTax) {
    return "TAX_CONFUSION";
  }

  const hasFdInflation =
    ((msg.includes("fd") || msg.includes("fixed deposit")) && msg.includes("inflation")) ||
    topic.includes("inflation") ||
    intent.includes("inflation");
  if (hasFdInflation) {
    return "FD_INFLATION_GAP";
  }

  const hasDebtStress =
    msg.includes("debt") ||
    msg.includes("credit card") ||
    msg.includes("loan") ||
    topic.includes("debt") ||
    intent.includes("debt") ||
    hasActiveLoans;
  if (hasDebtStress) {
    return "DEBT_STRESS";
  }

  return "GENERAL_INQUIRY";
}

function normalizeGapLabel(label: string): GapLabel | undefined {
  if (
    label === "TAX_CONFUSION" ||
    label === "FD_INFLATION_GAP" ||
    label === "DEBT_STRESS" ||
    label === "INSURANCE_GAP" ||
    label === "INVESTMENT_CONFUSION" ||
    label === "GENERAL_INQUIRY"
  ) {
    return label;
  }
  return undefined;
}

function normalizeFocusOrder(value: unknown): RecommendationFocus | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowed = new Set(["product", "tool", "event", "service"]);
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase())
    .filter((item): item is "product" | "tool" | "event" | "service" => allowed.has(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

export async function detectGapDecision(input: {
  message: string;
  session: UserSession;
}): Promise<GapDecision> {
  const userContext = {
    profileAnswers: input.session.profileAnswers,
    persona: input.session.persona,
    intents: input.session.intents,
    latestGoal: input.session.latestGoal,
    enrichedUser: input.session.enrichedContext?.user ?? null,
  };

  const articleContext = {
    pageContext: input.session.pageContext,
    enrichedArticle: input.session.enrichedContext?.article ?? null,
  };

  const navigatorPrompt = fillPromptTemplate(NAVIGATOR_SYSTEM_PROMPT, {
    USER_CONTEXT: JSON.stringify(userContext),
    ARTICLE_CONTEXT: JSON.stringify(articleContext),
  });

  const llmResponse = await llm.complete(
    navigatorPrompt,
    `Latest user message: ${input.message}`,
    { temperature: 0.2, maxTokens: 220, jsonMode: true },
  );

  if (!llmResponse.fallback && llmResponse.content) {
    try {
      const parsed = JSON.parse(llmResponse.content) as {
        gapLabel?: string;
        confidence?: number;
        reasoning?: string;
        recommendationFocus?: unknown;
      };

      const label = parsed.gapLabel ? normalizeGapLabel(parsed.gapLabel) : undefined;
      if (label) {
        return {
          label,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
          reasoning: parsed.reasoning,
          source: "llm",
          recommendationFocus: normalizeFocusOrder(parsed.recommendationFocus),
        };
      }
    } catch {
      // Intentional no-op: fallback to deterministic rules below.
    }
  }

  const fallbackLabel = detectGapLabel(input);
  return {
    label: fallbackLabel,
    confidence: 0.7,
    source: "rules",
  };
}

export function getGapStrategy(label: GapLabel | undefined, focusOverride?: RecommendationFocus): GapStrategy | undefined {
  if (!label) {
    return undefined;
  }

  const base = GAP_STRATEGY_MAP[label];
  if (!focusOverride || focusOverride.length === 0) {
    return base;
  }

  return {
    ...base,
    recommendationFocus: focusOverride,
  };
}
