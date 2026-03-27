import { KGItem } from "./kg.schema.js";

type ScoreContext = {
  topic?: string;
  intent?: string;
  persona?: string;
};

const WEIGHTS = {
  intentMatch: 0.35,
  topicMatch: 0.25,
  personaMatch: 0.2,
  businessPriority: 0.1,
  freshness: 0.1,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenMatch(source: string[], target?: string): number {
  if (!target) {
    return 0;
  }

  const normalizedTarget = normalize(target);
  const matched = source.some((entry) => normalize(entry).includes(normalizedTarget));
  return matched ? 1 : 0;
}

function personaMatchScore(item: KGItem, persona?: string): number {
  if (!persona) {
    return 0;
  }

  const personaTokens = normalize(persona)
    .split(/\s+/)
    .filter((token) => token.length > 2);

  if (personaTokens.length === 0) {
    return 0;
  }

  const audience = item.audience.map(normalize);
  const matched = personaTokens.filter((token) => audience.some((entry) => entry.includes(token))).length;
  return matched / personaTokens.length;
}

export function scoreItem(item: KGItem, context: ScoreContext): number {
  const intentMatch = tokenMatch(item.intentMap, context.intent);
  const topicMatch = tokenMatch([item.category, ...item.tags], context.topic);
  const personaMatch = personaMatchScore(item, context.persona);
  const businessPriority = item.businessPriority;
  const freshness = item.freshnessScore;

  const score =
    WEIGHTS.intentMatch * intentMatch +
    WEIGHTS.topicMatch * topicMatch +
    WEIGHTS.personaMatch * personaMatch +
    WEIGHTS.businessPriority * businessPriority +
    WEIGHTS.freshness * freshness;

  return Number(score.toFixed(4));
}

export function rankItems(items: KGItem[], context: ScoreContext): Array<{ item: KGItem; score: number }> {
  return items
    .map((item) => ({ item, score: scoreItem(item, context) }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.item.businessPriority !== a.item.businessPriority) {
        return b.item.businessPriority - a.item.businessPriority;
      }
      return b.item.freshnessScore - a.item.freshnessScore;
    });
}

export type { ScoreContext };
