import { LiveNewsCard } from "../types.js";

type Section = LiveNewsCard["section"];

type CachedNews = {
  expiresAt: number;
  cards: LiveNewsCard[];
};

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

const QUERIES: Array<{ section: Section; query: string }> = [
  { section: "Tax", query: "india personal finance tax filing" },
  { section: "Loans", query: "india personal loan emi interest rate" },
  { section: "Investments", query: "india mutual fund sip investing" },
  { section: "Insurance", query: "india life health insurance policy" },
];

let cache: CachedNews | null = null;

function buildRssUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-IN",
    gl: "IN",
    ceid: "IN:en",
  });
  return `${GOOGLE_NEWS_RSS}?${params.toString()}`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match?.[1]) {
    return undefined;
  }
  return decodeXmlEntities(match[1]);
}

function parseItems(xml: string): Array<{ title: string; url: string; source: string; publishedAt?: string }> {
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const parsed: Array<{ title: string; url: string; source: string; publishedAt?: string }> = [];

  for (const item of itemMatches) {
    const title = extractTag(item, "title");
    const url = extractTag(item, "link");
    const source = extractTag(item, "source") ?? "News";
    const publishedAt = extractTag(item, "pubDate");

    if (title && url) {
      parsed.push({ title, url, source, publishedAt });
    }
  }

  return parsed;
}

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`RSS request failed with ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLiveNewsCards(): Promise<LiveNewsCard[]> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.cards;
  }

  const cards: LiveNewsCard[] = [];

  for (const item of QUERIES) {
    try {
      const xml = await fetchRss(buildRssUrl(item.query));
      const parsed = parseItems(xml).slice(0, 4);
      for (const news of parsed) {
        cards.push({
          headline: news.title,
          url: news.url,
          source: news.source,
          publishedAt: news.publishedAt,
          section: item.section,
        });
      }
    } catch {
      // If one source fails, continue with remaining sections.
    }
  }

  const unique = Array.from(
    new Map(cards.map((card) => [`${card.headline.toLowerCase()}|${card.source.toLowerCase()}`, card])).values(),
  ).slice(0, 16);

  cache = {
    cards: unique,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return unique;
}
