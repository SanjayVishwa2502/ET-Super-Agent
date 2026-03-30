import { LiveNewsCard } from "../types.js";

type Section = LiveNewsCard["section"];

type CachedNews = {
  fetchedAt: number;
  expiresAt: number;
  cards: LiveNewsCard[];
  sourceCount: number;
};

export type LiveNewsSnapshot = {
  cards: LiveNewsCard[];
  lastFetchedAt?: string;
  cacheTtlSeconds: number;
  nextRefreshInSeconds: number;
  sourceCount: number;
  stale: boolean;
};

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

const QUERIES: Array<{ section: Section; query: string; take: number }> = [
  { section: "Tax", query: "india personal finance tax filing income tax update", take: 3 },
  { section: "Tax", query: "india tax deduction 80c new tax regime", take: 2 },
  { section: "Loans", query: "india personal loan emi interest rate banking", take: 3 },
  { section: "Loans", query: "india credit card debt repayment balance transfer", take: 2 },
  { section: "Investments", query: "india mutual fund sip investing market outlook", take: 3 },
  { section: "Investments", query: "india stock market nifty portfolio allocation", take: 2 },
  { section: "Insurance", query: "india health insurance life cover premium policy", take: 3 },
  { section: "Insurance", query: "india term insurance claim settlement mediclaim", take: 2 },
];

let cache: CachedNews | null = null;

const LIVE_NEWS_CACHE_SECONDS = clampNumber(process.env.LIVE_NEWS_CACHE_SECONDS, 120, 30, 900);
const LIVE_NEWS_REQUEST_TIMEOUT_MS = clampNumber(process.env.LIVE_NEWS_REQUEST_TIMEOUT_MS, 4500, 2000, 15000);
const LIVE_NEWS_MAX_ITEMS = clampNumber(process.env.LIVE_NEWS_MAX_ITEMS, 20, 8, 40);

function clampNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

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
  const timeout = setTimeout(() => controller.abort(), LIVE_NEWS_REQUEST_TIMEOUT_MS);
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

function parsePublishedAtScore(value?: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSnapshot(cached: CachedNews, stale = false): LiveNewsSnapshot {
  const now = Date.now();

  return {
    cards: cached.cards,
    lastFetchedAt: new Date(cached.fetchedAt).toISOString(),
    cacheTtlSeconds: LIVE_NEWS_CACHE_SECONDS,
    nextRefreshInSeconds: Math.max(0, Math.ceil((cached.expiresAt - now) / 1000)),
    sourceCount: cached.sourceCount,
    stale,
  };
}

async function buildCards(): Promise<{ cards: LiveNewsCard[]; sourceCount: number }> {
  const settled = await Promise.allSettled(
    QUERIES.map(async (item) => {
      const xml = await fetchRss(buildRssUrl(item.query));
      const parsed = parseItems(xml).slice(0, item.take);
      return {
        section: item.section,
        parsed,
      };
    }),
  );

  const cards: LiveNewsCard[] = [];
  let sourceCount = 0;

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }

    sourceCount += 1;
    for (const news of result.value.parsed) {
      cards.push({
        headline: news.title,
        url: news.url,
        source: news.source,
        publishedAt: news.publishedAt,
        section: result.value.section,
      });
    }
  }

  const unique = Array.from(
    new Map(cards.map((card) => [`${card.headline.toLowerCase()}|${card.source.toLowerCase()}`, card])).values(),
  )
    .sort((a, b) => parsePublishedAtScore(b.publishedAt) - parsePublishedAtScore(a.publishedAt))
    .slice(0, LIVE_NEWS_MAX_ITEMS);

  return {
    cards: unique,
    sourceCount,
  };
}

export async function getLiveNewsSnapshot(options?: { forceRefresh?: boolean }): Promise<LiveNewsSnapshot> {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && cache && Date.now() < cache.expiresAt) {
    return toSnapshot(cache);
  }

  try {
    const built = await buildCards();
    const now = Date.now();

    cache = {
      cards: built.cards,
      fetchedAt: now,
      expiresAt: now + LIVE_NEWS_CACHE_SECONDS * 1000,
      sourceCount: built.sourceCount,
    };

    return toSnapshot(cache);
  } catch {
    if (cache) {
      return toSnapshot(cache, true);
    }

    throw new Error("Unable to fetch live news");
  }
}

export async function getLiveNewsCards(options?: { forceRefresh?: boolean }): Promise<LiveNewsCard[]> {
  const snapshot = await getLiveNewsSnapshot(options);
  return snapshot.cards;
}
