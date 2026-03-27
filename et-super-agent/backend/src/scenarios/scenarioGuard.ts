export type ScenarioCategory = "known" | "greeting" | "ambiguous" | "out_of_scope";

export type ScenarioAssessment = {
  category: ScenarioCategory;
  confidence: number;
  reason: string;
  suggestedClarification?: string;
};

const GREETING_PHRASES = new Set([
  "hi",
  "hello",
  "hey",
  "hey there",
  "good morning",
  "good afternoon",
  "good evening",
]);

const FINANCE_KEYWORDS = [
  "tax",
  "itr",
  "loan",
  "debt",
  "credit",
  "fd",
  "inflation",
  "invest",
  "investment",
  "mutual fund",
  "insurance",
  "portfolio",
  "retirement",
  "wealth",
  "savings",
  "sip",
  "emi",
  "interest",
  "card",
];

const OUT_OF_SCOPE_KEYWORDS = [
  "cricket",
  "football",
  "movie",
  "recipe",
  "weather",
  "travel plan",
  "gaming",
  "music",
  "politics",
  "coding",
];

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(input: string): string[] {
  return normalize(input).split(" ").filter(Boolean);
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function assessScenario(message: string): ScenarioAssessment {
  const normalizedMessage = normalize(message);
  const tokenCount = tokenize(message).length;

  if (!normalizedMessage) {
    return {
      category: "ambiguous",
      confidence: 0.3,
      reason: "Empty user message",
      suggestedClarification: "Share your main finance question in one line.",
    };
  }

  if (GREETING_PHRASES.has(normalizedMessage)) {
    return {
      category: "greeting",
      confidence: 0.98,
      reason: "Message is a greeting",
    };
  }

  const hasFinanceSignal = includesAny(normalizedMessage, FINANCE_KEYWORDS);
  const hasOutOfScopeSignal = includesAny(normalizedMessage, OUT_OF_SCOPE_KEYWORDS);

  if (hasOutOfScopeSignal && !hasFinanceSignal) {
    return {
      category: "out_of_scope",
      confidence: 0.95,
      reason: "Detected non-finance topic",
      suggestedClarification:
        "I can help with personal finance topics like tax, debt, investments, insurance, and savings. What are you currently focused on?",
    };
  }

  if (tokenCount <= 3) {
    return {
      category: "ambiguous",
      confidence: 0.75,
      reason: "Short input (1-3 words) should continue to concierge profiling",
      suggestedClarification: "Tell me a bit more about your current finance goal.",
    };
  }

  if (hasFinanceSignal) {
    return {
      category: "known",
      confidence: 0.85,
      reason: "Finance intent detected",
    };
  }

  return {
    category: "ambiguous",
    confidence: 0.6,
    reason: "No clear finance topic detected",
    suggestedClarification: "Could you share whether this is about tax, debt, investing, insurance, or savings?",
  };
}
