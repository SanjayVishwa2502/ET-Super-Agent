import { z } from "zod";
import { UserSession } from "../types.js";
import { llm } from "./llmService.js";
import { NEWS_SUMMARY_PROMPT, fillPromptTemplate } from "./llmPrompts.js";

const summarySchema = z.object({
  summary: z.string().min(1),
  insights: z.array(z.string()).min(1),
  watchouts: z.array(z.string()).optional(),
});

function formatFallbackSummary(session: UserSession): { summary: string; insights: string[]; watchouts: string[] } {
  const article = session.enrichedContext?.article;
  const section = article?.section ?? "Investments";
  const headline = article?.headline ?? "current finance update";
  const topicTags = article?.topicTags ?? [];
  const riskSignals = article?.riskSignals ?? [];

  const summary = `Here is a quick summary of ${headline}. This update is primarily about ${section.toLowerCase()} and can influence near-term personal finance decisions depending on your goals.`;

  const insights = [
    `Core theme: ${section} conditions are shifting, so decisions should be based on your risk profile and timeline.`,
    topicTags.length > 0
      ? `Focus areas to track: ${topicTags.slice(0, 3).join(", ")}.`
      : "Focus areas to track: policy change, rates, and risk sentiment.",
    "Action for users: avoid one-shot reactions; review allocation, cash buffer, and debt obligations before acting.",
  ];

  const watchouts = riskSignals.length > 0
    ? [`Watch for: ${riskSignals.slice(0, 2).join(", ")}.`]
    : ["Watch for short-term volatility and headline-driven noise."];

  return { summary, insights, watchouts };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25);
}

function buildSnippetAwareFallback(input: {
  session: UserSession;
  snippet?: string;
}): { summary: string; insights: string[]; watchouts: string[] } {
  const article = input.session.enrichedContext?.article;
  const section = article?.section ?? "Investments";
  const headline = article?.headline ?? "current finance update";
  const topicTags = article?.topicTags ?? [];

  const sentences = splitSentences(input.snippet ?? "");
  const lead = sentences[0]
    ? sentences[0]
    : `This update focuses on ${section.toLowerCase()} and may affect near-term personal finance choices.`;

  const summary = `${headline}: ${lead}`;

  const insights: string[] = [];
  insights.push(`Primary impact area: ${section.toLowerCase()} decisions should align with your risk profile and time horizon.`);

  if (sentences[1]) {
    insights.push(`What changed: ${sentences[1]}`);
  } else if (topicTags.length > 0) {
    insights.push(`Key themes to track: ${topicTags.slice(0, 3).join(", ")}.`);
  }

  insights.push("Practical action: review cash buffer, ongoing SIP/EMI commitments, and avoid reactionary one-day decisions.");

  const watchouts: string[] = [];
  if (section === "Loans") {
    watchouts.push("Watchout: rate-sensitive products can change total interest cost faster than expected.");
  } else if (section === "Tax") {
    watchouts.push("Watchout: verify filing-year applicability before acting on any tax update.");
  } else if (section === "Investments") {
    watchouts.push("Watchout: short-term volatility can be high after policy or macro headlines.");
  } else {
    watchouts.push("Watchout: compare exclusions, waiting periods, and hidden conditions before selecting plans.");
  }

  return {
    summary,
    insights: insights.slice(0, 5),
    watchouts: watchouts.slice(0, 3),
  };
}

async function fetchArticleSnippet(sourceUrl?: string): Promise<string | undefined> {
  if (!sourceUrl) {
    return undefined;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];

    const snippet = ogDesc ?? metaDesc;
    if (!snippet) {
      return undefined;
    }

    return snippet.replace(/\s+/g, " ").trim().slice(0, 500);
  } catch {
    return undefined;
  }
}

export async function summarizeCurrentNews(session: UserSession): Promise<{
  summary: string;
  insights: string[];
  watchouts: string[];
  fallbackUsed: boolean;
}> {
  const article = session.enrichedContext?.article;

  if (!article) {
    const fallback = formatFallbackSummary(session);
    return { ...fallback, fallbackUsed: true };
  }

  const articleSnippet = await fetchArticleSnippet(article.sourceUrl);

  const prompt = fillPromptTemplate(NEWS_SUMMARY_PROMPT, {
    ARTICLE_CONTEXT: JSON.stringify({
      headline: article.headline,
      section: article.section,
      topicTags: article.topicTags,
      riskSignals: article.riskSignals,
      source: article.source ?? "ET context",
      sourceUrl: article.sourceUrl ?? null,
      snippet: articleSnippet ?? null,
    }),
    USER_CONTEXT: JSON.stringify({
      profileAnswers: session.profileAnswers,
      latestGoal: session.latestGoal,
      intents: session.intents,
      persona: session.persona,
    }),
  });

  const llmResponse = await llm.complete(
    prompt,
    "Summarize this news in user-friendly language with actionable insights.",
    { temperature: 0.2, maxTokens: 280, jsonMode: true },
  );

  if (!llmResponse.fallback && llmResponse.content) {
    const tryParse = (raw: string) => {
      const direct = JSON.parse(raw);
      return summarySchema.parse(direct);
    };

    try {
      let parsed = tryParse(llmResponse.content);

      // Some small models wrap JSON in prose. Attempt substring extraction before falling back.
      if (!parsed) {
        throw new Error("Unreachable");
      }

      return {
        summary: parsed.summary,
        insights: parsed.insights.slice(0, 5),
        watchouts: (parsed.watchouts ?? []).slice(0, 3),
        fallbackUsed: false,
      };
    } catch {
      try {
        const start = llmResponse.content.indexOf("{");
        const end = llmResponse.content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const candidate = llmResponse.content.slice(start, end + 1);
          const parsed = summarySchema.parse(JSON.parse(candidate));
          return {
            summary: parsed.summary,
            insights: parsed.insights.slice(0, 5),
            watchouts: (parsed.watchouts ?? []).slice(0, 3),
            fallbackUsed: false,
          };
        }
      } catch {
        // Continue to deterministic fallback.
      }
    }
  }

  const fallback = articleSnippet
    ? buildSnippetAwareFallback({ session, snippet: articleSnippet })
    : formatFallbackSummary(session);
  return { ...fallback, fallbackUsed: true };
}
