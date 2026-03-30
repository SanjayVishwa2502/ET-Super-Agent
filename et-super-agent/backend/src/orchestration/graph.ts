import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { KGRepository } from "../data/kgRepository.js";
import { rankItems } from "../data/scoring.js";
import { detectGapDecision, GapLabel, GapStrategy, getGapStrategy, isEducationalQuery } from "./navigator.js";
import { CrossSellTemplate, getCrossSellTemplate } from "./crossSellTemplates.js";
import { assessScenario, ScenarioAssessment } from "../scenarios/scenarioGuard.js";
import { llm } from "../services/llmService.js";
import { CONCIERGE_SYSTEM_PROMPT, PROFILE_EXTRACTION_PROMPT, RESPONSE_COMPOSER_PROMPT, fillPromptTemplate } from "../services/llmPrompts.js";
import { RecommendationCard, UserSession } from "../types.js";

type Route = "concierge_agent" | "navigator_agent" | "recommendation_agent" | "response_composer";
type PostRecommendationRoute = "cross_sell_agent" | "response_composer";
type ToolAction = "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";

const kgRepository = KGRepository.fromFile();

const TOOL_CARD_ID_BY_ACTION: Record<ToolAction, string> = {
  "risk-profiler": "tool-risk-profiler",
  "goal-planner": "tool-markets-diversification-check",
  "fund-screener": "tool-markets-tax-saving-funds",
  "spend-analyzer": "tool-cards-spend-analyzer",
};

function detectRequestedToolAction(message: string): ToolAction | undefined {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("risk profiler") ||
    normalized.includes("risk profile") ||
    normalized.includes("risk assessment")
  ) {
    return "risk-profiler";
  }

  if (normalized.includes("goal planner") || normalized.includes("goal planning")) {
    return "goal-planner";
  }

  if (
    normalized.includes("fund screener") ||
    normalized.includes("tax saving fund") ||
    normalized.includes("mutual fund screener")
  ) {
    return "fund-screener";
  }

  if (
    normalized.includes("spend analyzer") ||
    normalized.includes("expense analyzer") ||
    normalized.includes("spending analyzer")
  ) {
    return "spend-analyzer";
  }

  return undefined;
}

function prioritizeRequestedToolRecommendation(
  recommendations: RecommendationCard[],
  requestedToolAction: ToolAction | undefined,
): RecommendationCard[] {
  if (!requestedToolAction) {
    return recommendations;
  }

  const targetCardId = TOOL_CARD_ID_BY_ACTION[requestedToolAction];
  const existingIndex = recommendations.findIndex(
    (item) => item.id === targetCardId || item.toolAction === requestedToolAction,
  );

  if (existingIndex >= 0) {
    const target = recommendations[existingIndex];
    return [
      target,
      ...recommendations.filter((_, idx) => idx !== existingIndex),
    ];
  }

  const fallbackTool = kgRepository.all().find((item) => item.id === targetCardId);
  if (!fallbackTool) {
    return recommendations;
  }

  const forcedCard: RecommendationCard = {
    ...(fallbackTool.type === "tool" ? deriveToolMetadataFromCardId(fallbackTool.id) : undefined),
    id: fallbackTool.id,
    title: fallbackTool.title,
    type: fallbackTool.type,
    why: "",
    cta: fallbackTool.ctaLabel,
    url: fallbackTool.ctaUrl,
    score: 0.91,
  };

  return [forcedCard, ...recommendations];
}

function applyStrategyTypePreference(
  recommendations: RecommendationCard[],
  focusOrder?: Array<"product" | "tool" | "event" | "service">,
): RecommendationCard[] {
  if (!focusOrder || focusOrder.length === 0) {
    return recommendations;
  }

  const selected: RecommendationCard[] = [];
  const used = new Set<string>();

  for (const preferredType of focusOrder) {
    const candidate = recommendations.find(
      (item) => item.type === preferredType && !used.has(item.id),
    );
    if (candidate) {
      selected.push(candidate);
      used.add(candidate.id);
    }
  }

  for (const item of recommendations) {
    if (selected.length >= 3) {
      break;
    }
    if (!used.has(item.id)) {
      selected.push(item);
      used.add(item.id);
    }
  }

  return selected.slice(0, 3);
}

function inferLatestGoal(input: { message: string; pageTopic: string; fallbackIntent?: string }): string {
  const messageText = input.message.toLowerCase();
  const pageTopicText = input.pageTopic.toLowerCase();

  if (detectRequestedToolAction(input.message) === "risk-profiler") {
    return "portfolio diversification";
  }

  if (isEducationalQuery(input.message)) {
    return "learn basics";
  }

  if (messageText.includes("debt") || messageText.includes("credit card") || messageText.includes("loan")) {
    return "debt reduction";
  }
  if (messageText.includes("inflation") || messageText.includes("fd") || messageText.includes("fixed deposit")) {
    return "beat inflation";
  }
  if (messageText.includes("tax")) {
    return "tax planning";
  }
  if (messageText.includes("invest") || messageText.includes("portfolio")) {
    return "portfolio diversification";
  }

  if (pageTopicText.includes("debt") || pageTopicText.includes("credit") || pageTopicText.includes("loan")) {
    return "debt reduction";
  }
  if (pageTopicText.includes("inflation") || pageTopicText.includes("fd") || pageTopicText.includes("fixed deposit")) {
    return "beat inflation";
  }
  if (pageTopicText.includes("tax")) {
    return "tax planning";
  }
  if (pageTopicText.includes("invest") || pageTopicText.includes("portfolio")) {
    return "portfolio diversification";
  }

  return input.fallbackIntent ?? "guided discovery";
}

function deriveTopicFromGoal(goal: string, fallbackTopic: string): string {
  const normalized = goal.toLowerCase();
  if (normalized.includes("tax")) {
    return "tax";
  }
  if (normalized.includes("debt") || normalized.includes("loan") || normalized.includes("credit card")) {
    return "debt";
  }
  if (normalized.includes("inflation")) {
    return "inflation";
  }
  if (normalized.includes("portfolio") || normalized.includes("invest")) {
    return "portfolio";
  }
  return fallbackTopic;
}

function applySessionHistoryRefinement(
  recommendations: RecommendationCard[],
  previouslyRecommendedIds: string[],
): RecommendationCard[] {
  const seen = new Set(previouslyRecommendedIds);
  const orderIndex = new Map<string, number>(recommendations.map((item, index) => [item.id, index]));

  return [...recommendations].sort((a, b) => {
    const aSeen = seen.has(a.id) ? 1 : 0;
    const bSeen = seen.has(b.id) ? 1 : 0;
    if (aSeen !== bSeen) {
      return aSeen - bSeen;
    }
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
  });
}

function shouldBypassProfilingForDirectChat(message: string): boolean {
  if (detectRequestedToolAction(message)) {
    return true;
  }

  if (isEducationalQuery(message)) {
    return true;
  }

  const normalized = message.toLowerCase();
  const financeSignals = [
    "tax",
    "loan",
    "debt",
    "sip",
    "mutual fund",
    "portfolio",
    "insurance",
    "emi",
    "invest",
    "fd",
    "inflation",
    "risk",
    "planner",
    "screener",
    "analyzer",
  ];

  return financeSignals.some((signal) => normalized.includes(signal));
}

function buildTransparentWhy(input: {
  cardType: RecommendationCard["type"];
  latestGoal: string;
  topicHint: string;
  strategyFocus?: Array<"product" | "tool" | "event" | "service">;
  previouslyRecommended: boolean;
}): string {
  const focusText = input.strategyFocus && input.strategyFocus.length > 0
    ? input.strategyFocus.join(" > ")
    : "score-based";

  const freshnessText = input.previouslyRecommended
    ? "Shown earlier in this session and retained due to high relevance."
    : "New for this session to improve follow-up variety.";

  return `Aligned to your ${input.latestGoal} goal in ${input.topicHint} context; selected as ${input.cardType} under strategy ${focusText}. ${freshnessText}`;
}

  function composeDeterministicAssistantMessage(input: {
    userMessage: string;
    topic: string;
    intent: string;
    gapLabel?: GapLabel;
    recommendations: RecommendationCard[];
    profileAnswers: Record<string, string>;
    activeContextHeadline?: string;
    activeContextUserName?: string;
  }): string {
    const msg = input.userMessage.toLowerCase();
    const name = input.activeContextUserName || input.profileAnswers.name;
    const opener = name ? `${name}, here is the quick take.` : "Here is the quick take.";

    const isDefinitionQuery = /\b(what is|what's|define|explain|how does .* work)\b/.test(msg);
    const intentText = input.intent || "financial planning";
    const topicText = input.topic || "personal finance";
    const contextPrefix = input.activeContextHeadline
      ? `Using your active context` + (input.activeContextUserName ? ` for ${input.activeContextUserName}` : "") + `: ${input.activeContextHeadline}. `
      : "";

  if (isDefinitionQuery) {
    const recHint = input.recommendations[0]?.title
      ? `If you want, I can also connect this to ${input.recommendations[0].title}.`
      : "If you want, I can connect this to a practical next step.";
    return `${opener} ${contextPrefix}You asked a concept question, so I am focusing on clarity first, then action. In simple terms, this topic fits within ${topicText} and should be evaluated against your risk comfort, time horizon, and liquidity needs. ${recHint}`;
  }

  const gapHint = input.gapLabel
    ? `The current priority appears to be ${input.gapLabel.replace(/_/g, " ").toLowerCase()}.`
    : "I am prioritizing the strongest signal from your latest message.";

  const recTypes = Array.from(new Set(input.recommendations.map((r) => r.type))).join(", ");
  const recHint = input.recommendations.length > 0
    ? `I selected ${input.recommendations.length} options across ${recTypes || "tools and products"} to keep the next step practical.`
    : "I can provide practical options once you share a bit more detail on your objective and timeline.";

  return `${opener} ${contextPrefix}Based on your ${intentText} goal in ${topicText} context, ${gapHint} ${recHint}`;
}

function composeDeterministicNextQuestion(input: { gapLabel?: GapLabel; topic: string }): string {
  if (input.gapLabel === "TAX_CONFUSION") {
    return "Would you like a quick tax action checklist for this year, or a deeper comparison of available options?";
  }
  if (input.gapLabel === "DEBT_STRESS") {
    return "Should we focus first on EMI reduction, debt prioritization order, or consolidation options?";
  }
  if (input.gapLabel === "INVESTMENT_CONFUSION") {
    return "Do you want a starter allocation view first, or should I screen options by your risk profile?";
  }
  return `Do you want a quick checklist for ${input.topic}, or a personalized next-step recommendation?`;
}

function shouldSurfaceRecommendations(input: {
  message: string;
  gapLabel?: GapLabel;
  profileComplete: boolean;
  hasArticleContext: boolean;
  lastAssistantMessage?: string;
}): boolean {
  const normalized = input.message.toLowerCase().trim();

  const isAffirmative = ["yes", "yes please", "yep", "sure", "yeah", "ok", "okay", "please do", "do it", "show me"].includes(normalized);
  const wasAsking = input.lastAssistantMessage && input.lastAssistantMessage.toLowerCase().includes("would you like me to suggest");

  const recommendationIntent = [
    "recommend",
    "suggest",
    "best option",
    "which one",
    "compare",
    "comparison",
    "next step",
    "what should i do",
    "help me choose",
    "planner",
    "tool",
    "product",
    "event",
    "show options",
    "give me options",
    "risk profiler",
    "risk profile",
    "risk assessment",
    "goal planner",
    "fund screener",
    "spend analyzer",
  ].some((keyword) => normalized.includes(keyword));

  const urgentGap = input.gapLabel === "DEBT_STRESS";
  
  if ((isAffirmative && wasAsking) || recommendationIntent || urgentGap) {
    return true;
  }
  
  const lowSignalPrompt = ["hi", "hello", "hey", "ok", "thanks"].includes(normalized);

  if (lowSignalPrompt) {
    return false;
  }

  return false;
}

function deriveToolMetadataFromCardId(cardId: string): Pick<RecommendationCard, "toolId" | "toolAction"> | undefined {
  if (cardId === "tool-risk-profiler") {
    return { toolId: cardId, toolAction: "risk-profiler" };
  }
  if (cardId === "tool-markets-diversification-check") {
    return { toolId: cardId, toolAction: "goal-planner" };
  }
  if (cardId === "tool-markets-tax-saving-funds") {
    return { toolId: cardId, toolAction: "fund-screener" };
  }
  if (cardId === "tool-cards-spend-analyzer") {
    return { toolId: cardId, toolAction: "spend-analyzer" };
  }
  return undefined;
}

export function buildEmptyCandidateFallbackRecommendations(input: {
  topic: string;
  intent?: string;
}): RecommendationCard[] {
  const intent = input.intent ?? "guided discovery";
  const topic = input.topic;

  return [
    {
      id: "fallback-prime-finance-basics",
      title: "ET Prime: Personal Finance Basics",
      type: "product",
      why: `No exact matches were found for ${topic}, so this is a reliable starting point for ${intent}.`,
      cta: "Open Finance Basics",
      url: "https://example.et/prime/personal-finance-basics",
      score: 0.35,
    },
    {
      id: "fallback-markets-get-started",
      title: "ET Markets: Getting Started Toolkit",
      type: "tool",
      why: "Provides beginner-safe market exploration while we refine your preferences.",
      cta: "Open Markets Toolkit",
      url: "https://example.et/markets/getting-started",
      score: 0.34,
    },
    {
      id: "fallback-masterclass-finance-foundations",
      title: "ET Masterclass: Finance Foundations",
      type: "event",
      why: "Helps establish core decision frameworks before deeper recommendations.",
      cta: "Register for Foundations Session",
      url: "https://example.et/events/finance-foundations",
      score: 0.33,
    },
  ];
}

type ProfileField = "name" | "incomeRange" | "riskPreference" | "topGoal" | "loanStatus";

const REQUIRED_PROFILE_FIELDS: ProfileField[] = ["name", "incomeRange", "riskPreference", "topGoal"];
const PROFILE_QUESTION_FLOW: ProfileField[] = ["incomeRange", "riskPreference", "topGoal", "loanStatus", "name"];
const PROFILE_QUESTIONS: Record<ProfileField, string> = {
  name: "Before we continue, what should I call you?",
  incomeRange: "To personalize this well, which income or age bracket best describes you right now?",
  riskPreference: "How would you describe your risk comfort: low, medium, or high?",
  topGoal: "What is your top goal at the moment: tax planning, investing, debt reduction, savings, or wealth creation?",
  loanStatus: "Do you currently have active loans or credit card dues?",
};

const PROFILE_FIELD_EXAMPLES: Partial<Record<ProfileField, string>> = {
  incomeRange: "for example: 5-10LPA, 10-15LPA, 15-25LPA, or 25LPA+",
  riskPreference: "for example: low, medium, or high",
  topGoal: "for example: tax planning, investing, debt reduction, savings, or wealth creation",
  loanStatus: "for example: has loans / no loans",
};

function sanitizeName(name: string): string {
  return name.trim().replace(/[^a-zA-Z\s]/g, "").split(" ")[0] ?? "";
}

function normalizeIncomeRange(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("below") && value.includes("5")) return "below-5LPA";
  if (value.includes("5") && value.includes("10")) return "5-10LPA";
  if (value.includes("10") && value.includes("15")) return "10-15LPA";
  if (value.includes("15") && value.includes("25")) return "15-25LPA";
  if (value.includes("30")) return "30LPA+";
  if (value.includes("25")) return "25LPA+";
  return raw.trim();
}

function normalizeRiskPreference(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("low") || value.includes("conservative")) return "low";
  if (value.includes("high") || value.includes("aggressive")) return "high";
  if (value.includes("medium") || value.includes("moderate")) return "medium";
  return raw.trim();
}

function normalizeTopGoal(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes("tax")) return "tax_planning";
  if (value.includes("debt") || value.includes("loan")) return "debt_reduction";
  if (value.includes("invest") || value.includes("portfolio")) return "investing";
  if (value.includes("insurance")) return "insurance";
  if (value.includes("retirement")) return "retirement_planning";
  if (value.includes("wealth")) return "wealth_creation";
  if (value.includes("saving")) return "savings";
  return raw.trim();
}

function mapGoalToIntent(goal: string): string {
  const value = goal.toLowerCase();
  if (value.includes("tax")) return "tax planning";
  if (value.includes("debt") || value.includes("loan")) return "debt reduction";
  if (value.includes("invest")) return "portfolio diversification";
  if (value.includes("insurance")) return "insurance planning";
  return "guided discovery";
}

function heuristicExtractProfileAnswers(message: string): Partial<Record<ProfileField, string>> {
  const lower = message.toLowerCase();
  const extracted: Partial<Record<ProfileField, string>> = {};

  const nameMatch = message.match(/(?:my name is|i am|i'm)\s+([a-zA-Z][a-zA-Z\s]*)/i);
  if (nameMatch?.[1]) {
    const parsedName = sanitizeName(nameMatch[1]);
    if (parsedName) {
      extracted.name = parsedName;
    }
  }

  if (/(\b5\s*[-to]{1,3}\s*10\b|5\s*lpa|10\s*lpa)/i.test(message)) extracted.incomeRange = "5-10LPA";
  else if (/(\b10\s*[-to]{1,3}\s*15\b|12\s*lakh|12\s*lpa)/i.test(message)) extracted.incomeRange = "10-15LPA";
  else if (/(\b15\s*[-to]{1,3}\s*25\b|20\s*lakh|20\s*lpa)/i.test(message)) extracted.incomeRange = "15-25LPA";
  else if (/(30\s*lakh|30\s*lpa|high income)/i.test(message)) extracted.incomeRange = "30LPA+";

  if (lower.includes("conservative") || lower.includes("low risk")) extracted.riskPreference = "low";
  else if (lower.includes("moderate") || lower.includes("medium risk")) extracted.riskPreference = "medium";
  else if (lower.includes("aggressive") || lower.includes("high risk")) extracted.riskPreference = "high";

  if (lower.includes("tax")) extracted.topGoal = "tax_planning";
  else if (lower.includes("debt") || lower.includes("loan")) extracted.topGoal = "debt_reduction";
  else if (lower.includes("invest") || lower.includes("portfolio")) extracted.topGoal = "investing";
  else if (lower.includes("insurance")) extracted.topGoal = "insurance";
  else if (lower.includes("retirement")) extracted.topGoal = "retirement_planning";
  else if (lower.includes("save")) extracted.topGoal = "savings";

  if (lower.includes("loan") || lower.includes("emi") || lower.includes("credit card due") || lower.includes("debt")) {
    extracted.loanStatus = "has_loans";
  } else if (lower.includes("no loan") || lower.includes("no debt")) {
    extracted.loanStatus = "no_loans";
  }

  return extracted;
}

async function llmExtractProfileAnswers(input: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<Partial<Record<ProfileField, string>>> {
  const prompt = fillPromptTemplate(PROFILE_EXTRACTION_PROMPT, {
    MESSAGE: input.message,
    CONTEXT: JSON.stringify(input.history.slice(-6)),
  });

  const response = await llm.complete(
    "Extract profile fields from user text and return only JSON.",
    prompt,
    { temperature: 0.1, maxTokens: 220 },
  );

  if (response.fallback || !response.content) {
    return {};
  }

  try {
    const start = response.content.indexOf("{");
    const end = response.content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return {};
    }

    const payload = JSON.parse(response.content.slice(start, end + 1)) as Record<string, unknown>;
    const mapped: Partial<Record<ProfileField, string>> = {};

    if (typeof payload.name === "string" && payload.name.trim()) {
      mapped.name = sanitizeName(payload.name);
    }
    if (typeof payload.incomeRange === "string" && payload.incomeRange.trim()) {
      mapped.incomeRange = normalizeIncomeRange(payload.incomeRange);
    }
    if (typeof payload.riskPreference === "string" && payload.riskPreference.trim()) {
      mapped.riskPreference = normalizeRiskPreference(payload.riskPreference);
    }
    if (typeof payload.topGoal === "string" && payload.topGoal.trim()) {
      mapped.topGoal = normalizeTopGoal(payload.topGoal);
    }
    if (typeof payload.hasLoans === "boolean") {
      mapped.loanStatus = payload.hasLoans ? "has_loans" : "no_loans";
    }

    return mapped;
  } catch {
    return {};
  }
}

function getFirstMissingField(answers: Record<string, string>): ProfileField | undefined {
  return PROFILE_QUESTION_FLOW.find((field) => !answers[field]);
}

function buildProfileFallbackMessage(input: {
  firstName?: string;
  nextField: ProfileField;
  hasAnyProfile: boolean;
}): string {
  const greeting = input.firstName
    ? `Great to meet you, ${input.firstName}.`
    : input.hasAnyProfile
      ? "Thanks for sharing that."
      : "Hi, welcome to ET Super Agent.";

  return `${greeting} ${PROFILE_QUESTIONS[input.nextField]}`;
}

function buildProfileReminderMessage(input: {
  firstName?: string;
  nextField: ProfileField;
}): string {
  const fieldLabel = input.nextField
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
  const fieldQuestion = PROFILE_QUESTIONS[input.nextField];
  const example = PROFILE_FIELD_EXAMPLES[input.nextField];

  const prefix = input.firstName
    ? `I already have your name, ${input.firstName}.`
    : "I have your earlier context.";

  return `${prefix} I still need your ${fieldLabel} to continue personalization. ${fieldQuestion}${example ? ` (${example})` : ""}`;
}

function asksForName(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("what's your name") ||
    normalized.includes("what is your name") ||
    normalized.includes("your name, please") ||
    normalized.includes("may i know your name") ||
    normalized.includes("could you tell me your name")
  );
}

function isValidProfileQuestionMessage(input: {
  message: string;
  nextField: ProfileField;
  hasName: boolean;
}): boolean {
  const normalized = input.message.toLowerCase();

  if (input.hasName && input.nextField !== "name" && asksForName(normalized)) {
    return false;
  }

  const requiredHints: Record<ProfileField, string[]> = {
    name: ["name"],
    incomeRange: ["income", "lpa", "earning", "salary", "bracket"],
    riskPreference: ["risk", "conservative", "moderate", "aggressive"],
    topGoal: ["goal", "tax", "invest", "debt", "savings", "wealth"],
    loanStatus: ["loan", "emi", "debt", "credit"],
  };

  const hints = requiredHints[input.nextField];
  return hints.some((hint) => normalized.includes(hint));
}

async function buildConciergeMessageWithLlm(input: {
  session: UserSession;
  userMessage: string;
  instruction: string;
}): Promise<string | undefined> {
  const systemPrompt = fillPromptTemplate(CONCIERGE_SYSTEM_PROMPT, {
    USER_CONTEXT: JSON.stringify(input.session.profileAnswers),
  });

  const response = await llm.conversationalComplete(
    systemPrompt,
    input.session.history,
    `${input.userMessage}\n\n${input.instruction}`,
    { temperature: 0.4, maxTokens: 140 },
  );

  if (response.fallback || !response.content.trim()) {
    return undefined;
  }

  return response.content.trim();
}

const GraphState = Annotation.Root({
  message: Annotation<string>(),
  session: Annotation<UserSession>(),
  route: Annotation<Route>(),
  assistantMessage: Annotation<string>(),
  nextQuestion: Annotation<string | undefined>(),
  recommendations: Annotation<RecommendationCard[]>(),
  hiddenRecommendations: Annotation<RecommendationCard[]>(),
  gapLabel: Annotation<GapLabel | undefined>(),
  gapStrategy: Annotation<GapStrategy | undefined>(),
  postRecommendationRoute: Annotation<PostRecommendationRoute>(),
  crossSellTriggered: Annotation<boolean>(),
  crossSellTemplate: Annotation<CrossSellTemplate | undefined>(),
  crossSellReason: Annotation<string | undefined>(),
  visitedNodes: Annotation<string[]>(),
  fallbackUsed: Annotation<boolean>(),
  scenarioAssessment: Annotation<ScenarioAssessment>(),
});

function isProfileComplete(session: UserSession): boolean {
  return session.profileComplete === true;
}

const inputRouterNode = async (state: typeof GraphState.State) => {
  const route: Route = isProfileComplete(state.session) ? "navigator_agent" : "concierge_agent";
  return {
    route,
    visitedNodes: [...state.visitedNodes, "InputRouter"],
  };
};

const scenarioGuardNode = async (state: typeof GraphState.State) => {
  const assessment = assessScenario(state.message);

  if (assessment.category !== "out_of_scope") {
    return {
      route: "concierge_agent" as Route,
      scenarioAssessment: assessment,
      visitedNodes: [...state.visitedNodes, "ScenarioGuard"],
    };
  }

  return {
    route: "response_composer" as Route,
    assistantMessage: assessment.suggestedClarification,
    nextQuestion: "Share one line on your financial goal and current concern.",
    scenarioAssessment: assessment,
    visitedNodes: [...state.visitedNodes, "ScenarioGuard"],
  };
};

const conciergeAgentNode = async (state: typeof GraphState.State) => {
  const existingAnswers = { ...(state.session.profileAnswers ?? {}) };
  const hasAnyProfile = Object.keys(existingAnswers).length > 0;

  if (state.session.enrichedContext?.user) {
    const ctxUser = state.session.enrichedContext.user;
    if (!existingAnswers.name) {
      existingAnswers.name = sanitizeName(ctxUser.name);
    }
    if (!existingAnswers.incomeRange) {
      existingAnswers.incomeRange = ctxUser.incomeBand;
    }
    if (!existingAnswers.riskPreference) {
      existingAnswers.riskPreference = normalizeRiskPreference(ctxUser.riskAppetite);
    }
    if (!existingAnswers.topGoal && ctxUser.goals.length > 0) {
      existingAnswers.topGoal = normalizeTopGoal(ctxUser.goals[0]);
    }
    if (!existingAnswers.loanStatus) {
      existingAnswers.loanStatus = ctxUser.activeLoans.length > 0 ? "has_loans" : "no_loans";
    }
  }

  const heuristicAnswers = heuristicExtractProfileAnswers(state.message);
  for (const [key, value] of Object.entries(heuristicAnswers)) {
    if (value) {
      existingAnswers[key] = value;
    }
  }

  const llmAnswers = await llmExtractProfileAnswers({
    message: state.message,
    history: state.session.history,
  });
  for (const [key, value] of Object.entries(llmAnswers)) {
    if (value) {
      existingAnswers[key] = value;
    }
  }

  state.session.profileAnswers = existingAnswers;
  state.session.profileComplete = REQUIRED_PROFILE_FIELDS.every((field) => Boolean(existingAnswers[field]));

  const hasSelectedArticleContext = Boolean(state.session.pageContext.articleId);
  if (
    !state.session.profileComplete &&
    (shouldBypassProfilingForDirectChat(state.message) || hasSelectedArticleContext)
  ) {
    return {
      session: state.session,
      route: "navigator_agent" as Route,
      visitedNodes: [...state.visitedNodes, "ConciergeAgent"],
    };
  }

  if (!state.session.profileComplete) {
    const nextField = getFirstMissingField(existingAnswers) ?? "incomeRange";
    const firstName = existingAnswers.name;
    const hasName = Boolean(firstName);
    const latestAssistantMessage = state.session.history
      .slice()
      .reverse()
      .find((entry) => entry.role === "assistant")?.content ?? "";

    const fallbackMessage = buildProfileFallbackMessage({
      firstName,
      nextField,
      hasAnyProfile,
    });

    const alreadyAskedNextField = isValidProfileQuestionMessage({
      message: latestAssistantMessage,
      nextField,
      hasName,
    });
    const userLikelyAnsweredNextField = isValidProfileQuestionMessage({
      message: state.message,
      nextField,
      hasName,
    });

    if (alreadyAskedNextField && !userLikelyAnsweredNextField) {
      return {
        session: state.session,
        assistantMessage: buildProfileReminderMessage({ firstName, nextField }),
        nextQuestion: undefined,
        recommendations: [],
        route: "response_composer" as Route,
        visitedNodes: [...state.visitedNodes, "ConciergeAgent"],
      };
    }

    const llmMessage = await buildConciergeMessageWithLlm({
      session: state.session,
      userMessage: state.message,
      instruction: `Continue profiling. Ask exactly one question for the next field: ${nextField}. Never ask for fields that are already known. If name is already known, do not ask for name again.`,
    });

    const assistantMessage = llmMessage && isValidProfileQuestionMessage({
      message: llmMessage,
      nextField,
      hasName,
    })
      ? llmMessage
      : fallbackMessage;

    return {
      session: state.session,
      assistantMessage,
      nextQuestion: undefined,
      recommendations: [],
      route: "response_composer" as Route,
      visitedNodes: [...state.visitedNodes, "ConciergeAgent"],
    };
  }

  const risk = (existingAnswers.riskPreference ?? "").toLowerCase();
  state.session.persona = risk === "high"
    ? "High Net Worth"
    : risk === "low"
      ? "Conservative Wealth Builder"
      : "Balanced Planner";

  const inferredIntent = mapGoalToIntent(existingAnswers.topGoal ?? "guided_discovery");
  state.session.intents = Array.from(new Set([...state.session.intents, inferredIntent]));
  state.session.latestGoal = inferredIntent;

  const completionFallback = existingAnswers.name
    ? `Perfect, ${existingAnswers.name}. I have your profile and I am now tailoring recommendations to your goals.`
    : "Perfect, I have your profile and I am now tailoring recommendations to your goals.";

  const completionLlmMessage = await buildConciergeMessageWithLlm({
    session: state.session,
    userMessage: state.message,
    instruction: "Acknowledge profile completion and transition to personalized recommendations in one concise response.",
  });

  return {
    session: state.session,
    assistantMessage: completionLlmMessage ?? completionFallback,
    nextQuestion: undefined,
    route: "navigator_agent" as Route,
    visitedNodes: [...state.visitedNodes, "ConciergeAgent"],
  };
};

const navigatorAgentNode = async (state: typeof GraphState.State) => {
  const gapDecision = await detectGapDecision({
    message: state.message,
    session: state.session,
  });
  const gapLabel = gapDecision.label;
  const gapStrategy = getGapStrategy(gapLabel, gapDecision.recommendationFocus);

  return {
    gapLabel,
    gapStrategy,
    route: "recommendation_agent" as Route,
    visitedNodes: [...state.visitedNodes, "NavigatorAgent"],
  };
};

const recommendationAgentNode = async (state: typeof GraphState.State) => {
  const topic = state.session.pageContext.topic;
  const intent = state.session.intents[0];
  const persona = state.session.persona;
  const educationalTurn = isEducationalQuery(state.message);
  const requestedToolAction = detectRequestedToolAction(state.message);

  const latestGoal = inferLatestGoal({
    message: state.message,
    pageTopic: topic,
    fallbackIntent: state.session.latestGoal ?? intent,
  });
  const topicHint = educationalTurn ? "basics" : deriveTopicFromGoal(latestGoal, topic);

  state.session.latestGoal = latestGoal;

  let computedRecommendations = [];
  let fallbackIsUsed = false;

  if (process.env.SIMULATE_KG_UNAVAILABLE === "true") {
    computedRecommendations = buildEmptyCandidateFallbackRecommendations({ topic, intent: latestGoal });
    fallbackIsUsed = true;
  } else {
    // MOCK DB INTEGRATION: If user is low risk, filter out high risk products
    let allProducts = kgRepository.all();
    if (state.session.enrichedContext?.user && state.session.enrichedContext?.user.riskAppetite === "low") {
      allProducts = allProducts.filter(p => !p.riskProfile || p.riskProfile === "low");
    }

    const primaryCandidates = kgRepository.query({ topic: topicHint, intent: latestGoal, limit: 10 });
    let fallbackCandidates = primaryCandidates.length >= 3 ? primaryCandidates : allProducts;

    const ranked = rankItems(fallbackCandidates, { topic: topicHint, intent: latestGoal, persona });
    computedRecommendations = ranked.map(({ item, score }) => ({
      ...(item.type === "tool" ? deriveToolMetadataFromCardId(item.id) : undefined),
      id: item.id,
      title: item.title,
      type: item.type,
      why: "",
      cta: item.ctaLabel,
      url: item.ctaUrl,
      score,
    }));

    if (computedRecommendations.length === 0) {
      computedRecommendations = buildEmptyCandidateFallbackRecommendations({ topic, intent: latestGoal });
    }

    computedRecommendations = applyStrategyTypePreference(
      computedRecommendations,
      state.gapStrategy?.recommendationFocus,
    );

    computedRecommendations = applySessionHistoryRefinement(
      computedRecommendations,
      state.session.recommendationHistory,
    );

    computedRecommendations = prioritizeRequestedToolRecommendation(
      computedRecommendations,
      requestedToolAction,
    );

    computedRecommendations = computedRecommendations.slice(0, 3);
    const seenRecommendationIds = new Set(state.session.recommendationHistory);
    
    computedRecommendations = computedRecommendations.map((card) => ({
      ...card,
      why: buildTransparentWhy({
        cardType: card.type,
        latestGoal,
        topicHint,
        strategyFocus: state.gapStrategy?.recommendationFocus,
        previouslyRecommended: seenRecommendationIds.has(card.id),
      }),
    }));
  }

  const lastAssistant = state.session.history.slice().reverse().find(m => m.role === "assistant");
  const shouldShowRecommendations = shouldSurfaceRecommendations({
    message: state.message,
    gapLabel: state.gapLabel,
    profileComplete: state.session.profileComplete,
    hasArticleContext: Boolean(state.session.pageContext.articleId),
    lastAssistantMessage: lastAssistant?.content,
  });

  const serviceIntent =
    !educationalTurn &&
    (state.gapLabel === "DEBT_STRESS" ||
      [state.message, state.session.intents[0] ?? ""].some((value) => {
        const normalized = value.toLowerCase();
        return (
          normalized.includes("debt") ||
          normalized.includes("loan") ||
          normalized.includes("credit card") ||
          normalized.includes("card comparison")
        );
      }));

  const crossSellReason = serviceIntent
    ? "Rule-gated ON: service-relevant intent detected (DEBT_STRESS/loan/debt context)."
    : educationalTurn
      ? "Rule-gated OFF: educational query detected; service cross-sell intentionally suppressed."
      : "Rule-gated OFF: no service-relevant intent detected.";

  if (!shouldShowRecommendations) {
    return {
      recommendations: [],
      hiddenRecommendations: computedRecommendations,
      postRecommendationRoute: "response_composer" as PostRecommendationRoute,
      crossSellReason: "Rule-gated OFF: recommendations deferred until user asks for options.",
      route: "response_composer" as Route,
      fallbackUsed: fallbackIsUsed,
      visitedNodes: [...state.visitedNodes, "RecommendationAgent"],
    };
  }

  state.session.recommendationHistory = Array.from(
    new Set([...state.session.recommendationHistory, ...computedRecommendations.map((item) => item.id)]),
  ).slice(-20);

  return {
    recommendations: computedRecommendations,
    hiddenRecommendations: [],
    postRecommendationRoute: serviceIntent ? "cross_sell_agent" : "response_composer",
    crossSellReason,
    route: "response_composer" as Route,
    fallbackUsed: fallbackIsUsed || (computedRecommendations[0]?.id.startsWith("fallback-") ?? false),
    visitedNodes: [...state.visitedNodes, "RecommendationAgent"],
  };
};

const crossSellAgentNode = async (state: typeof GraphState.State) => {
  const template = getCrossSellTemplate(state.gapLabel);

  return {
    crossSellTriggered: true,
    crossSellTemplate: template,
    visitedNodes: [...state.visitedNodes, "CrossSellAgent"],
  };
};

const responseComposerNode = async (state: typeof GraphState.State) => {
  let assistantMessage = state.assistantMessage;
  let nextQuestion = state.nextQuestion;
  let recommendations = state.recommendations;
  let fallbackUsed = state.fallbackUsed;

  if (!assistantMessage) {
    const topic = state.session.pageContext.topic;
    const intent = state.session.intents[0] ?? "guided discovery";

    const responsePrompt = fillPromptTemplate(RESPONSE_COMPOSER_PROMPT, {
      USER_CONTEXT: JSON.stringify({
        profileAnswers: state.session.profileAnswers,
        persona: state.session.persona,
        latestGoal: state.session.latestGoal,
        activeContextHeadline: state.session.enrichedContext?.article?.headline,
        activeContextUserName: state.session.enrichedContext?.user?.name,
          activeLensName: state.session.activeLens?.name,
          activeLensRules: state.session.activeLens?.extractedContext,
        }),
      GAP_CONTEXT: JSON.stringify({
        label: state.gapLabel,
        strategy: state.gapStrategy,
      }),
      RECOMMENDATIONS_CONTEXT: JSON.stringify(
        recommendations.map((rec) => ({ title: rec.title, type: rec.type, why: rec.why })),
      ),
      HIDDEN_RECOMMENDATIONS_CONTEXT: state.hiddenRecommendations && state.hiddenRecommendations.length > 0 
        ? JSON.stringify(state.hiddenRecommendations.map((rec) => ({ title: rec.title, type: rec.type, why: rec.why })))
        : "None",
      HISTORY_CONTEXT: JSON.stringify(state.session.history.slice(-8)),
    });

    const llmResponse = await llm.complete(
      responsePrompt,
      `Latest user message: ${state.message}`,
      { temperature: 0.5, maxTokens: 220 },
    );

    if (!llmResponse.fallback && llmResponse.content.trim()) {
      assistantMessage = llmResponse.content.trim();
    } else {
      assistantMessage = composeDeterministicAssistantMessage({
        userMessage: state.message,
        topic,
        intent,
        gapLabel: state.gapLabel,
        recommendations,
        profileAnswers: state.session.profileAnswers,
        activeContextHeadline: state.session.enrichedContext?.article?.headline,
        activeContextUserName: state.session.enrichedContext?.user?.name,
      });
    }

    nextQuestion = recommendations.length > 0
      ? composeDeterministicNextQuestion({
        gapLabel: state.gapLabel,
        topic,
      })
      : "Would you like me to suggest specific tools, products, or events for this?";
  }

  if (state.crossSellTriggered && state.crossSellTemplate) {
    assistantMessage = `${assistantMessage} ${state.crossSellTemplate.message}`;
  }

  return {
    assistantMessage,
    nextQuestion,
    recommendations,
    fallbackUsed,
    visitedNodes: [...state.visitedNodes, "ResponseComposer"],
  };
};

const graph = new StateGraph(GraphState)
  .addNode("scenario_guard", scenarioGuardNode)
  .addNode("input_router", inputRouterNode)
  .addNode("concierge_agent", conciergeAgentNode)
  .addNode("navigator_agent", navigatorAgentNode)
  .addNode("recommendation_agent", recommendationAgentNode)
  .addNode("cross_sell_agent", crossSellAgentNode)
  .addNode("response_composer", responseComposerNode)
  .addEdge(START, "scenario_guard")
  .addConditionalEdges(
    "scenario_guard",
    (state) => state.route,
    {
      concierge_agent: "input_router",
      response_composer: "response_composer",
    },
  )
  .addConditionalEdges(
    "input_router",
    (state) => state.route,
    {
      concierge_agent: "concierge_agent",
      navigator_agent: "navigator_agent",
      recommendation_agent: "recommendation_agent",
      response_composer: "response_composer",
    },
  )
  .addConditionalEdges(
    "concierge_agent",
    (state) => state.route,
    {
      navigator_agent: "navigator_agent",
      response_composer: "response_composer",
    },
  )
  .addEdge("navigator_agent", "recommendation_agent")
  .addConditionalEdges(
    "recommendation_agent",
    (state) => state.postRecommendationRoute,
    {
      cross_sell_agent: "cross_sell_agent",
      response_composer: "response_composer",
    },
  )
  .addEdge("cross_sell_agent", "response_composer")
  .addEdge("response_composer", END);

const compiledGraph = graph.compile();

export async function runConversationGraph(input: {
  session: UserSession;
  message: string;
}): Promise<{
  assistantMessage: string;
  nextQuestion?: string;
  recommendations: RecommendationCard[];
  gapLabel?: GapLabel;
  gapStrategy?: GapStrategy;
  crossSellTriggered: boolean;
  crossSellTemplate?: CrossSellTemplate;
  crossSellReason?: string;
  visitedNodes: string[];
  fallbackUsed: boolean;
  scenarioAssessment: ScenarioAssessment;
  updatedSession: UserSession;
}> {
  try {
    const result = await compiledGraph.invoke({
      message: input.message,
      session: input.session,
      route: "concierge_agent",
      assistantMessage: "",
      nextQuestion: undefined,
      recommendations: [],
      gapLabel: undefined,
      gapStrategy: undefined,
      postRecommendationRoute: "response_composer",
      crossSellTriggered: false,
      crossSellTemplate: undefined,
      crossSellReason: undefined,
      visitedNodes: [],
      fallbackUsed: false,
      scenarioAssessment: {
        category: "known",
        confidence: 0.5,
        reason: "Default placeholder",
      },
    });

    return {
      assistantMessage: result.assistantMessage,
      nextQuestion: result.nextQuestion,
      recommendations: result.recommendations,
      gapLabel: result.gapLabel,
      gapStrategy: result.gapStrategy,
      crossSellTriggered: result.crossSellTriggered,
      crossSellTemplate: result.crossSellTemplate,
      crossSellReason: result.crossSellReason,
      visitedNodes: result.visitedNodes,
      fallbackUsed: result.fallbackUsed,
      scenarioAssessment: result.scenarioAssessment,
      updatedSession: result.session,
    };
  } catch {
    return {
      assistantMessage:
        "I hit a routing issue, so I am using a safe fallback recommendation flow.",
      nextQuestion: "Tell me your top priority: tax planning, investing, or debt reduction.",
      recommendations: [],
      gapLabel: undefined,
      gapStrategy: undefined,
      crossSellTriggered: false,
      crossSellTemplate: undefined,
      crossSellReason: "Rule-gated OFF: fallback response path used.",
      visitedNodes: ["FallbackRuleNode", "ResponseComposer"],
      fallbackUsed: true,
      scenarioAssessment: {
        category: "ambiguous",
        confidence: 0.66,
        reason: "Graph invocation failure fallback.",
      },
      updatedSession: input.session,
    };
  }
}
