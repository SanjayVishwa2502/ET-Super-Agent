import { UserSession } from "../types.js";

const sessionMap = new Map<string, UserSession>();
const KV_REST_API_URL =
  process.env.KV_REST_API_URL?.trim() ||
  process.env.UPSTASH_REDIS_REST_URL?.trim();
const KV_REST_API_TOKEN =
  process.env.KV_REST_API_TOKEN?.trim() ||
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const SESSION_STORE_PREFIX = process.env.SESSION_STORE_PREFIX?.trim() || "et-super-agent:session:";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7);

function kvConfigured(): boolean {
  return Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
}

function currentStoreMode(): "kv" | "memory" {
  return kvConfigured() ? "kv" : "memory";
}

function getSessionKey(sessionId: string): string {
  return `${SESSION_STORE_PREFIX}${sessionId}`;
}

async function kvCommand(args: string[]): Promise<unknown> {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error("KV not configured");
  }

  const response = await fetch(KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`Session KV command failed with status ${response.status}`);
  }

  const payload = await response.json() as { result?: unknown };
  return payload.result;
}

export const sessionStore = {
  async get(sessionId: string): Promise<UserSession | undefined> {
    const existing = sessionMap.get(sessionId);
    if (existing) {
      return existing;
    }

    if (!kvConfigured()) {
      return undefined;
    }

    try {
      const result = await kvCommand(["GET", getSessionKey(sessionId)]);
      if (typeof result !== "string") {
        return undefined;
      }

      const parsed = JSON.parse(result) as UserSession;
      sessionMap.set(sessionId, parsed);
      return parsed;
    } catch (err) {
      console.warn("Session KV read failed:", err);
      return undefined;
    }
  },

  async set(session: UserSession): Promise<void> {
    const normalized: UserSession = {
      ...session,
      updatedAt: new Date().toISOString(),
    };

    sessionMap.set(normalized.sessionId, normalized);

    if (!kvConfigured()) {
      return;
    }

    try {
      await kvCommand([
        "SETEX",
        getSessionKey(normalized.sessionId),
        String(SESSION_TTL_SECONDS),
        JSON.stringify(normalized),
      ]);
    } catch (err) {
      console.warn("Session KV write failed:", err);
    }
  },

  async update(sessionId: string, update: Partial<UserSession>): Promise<UserSession | undefined> {
    const existing = await this.get(sessionId);
    if (!existing) {
      return undefined;
    }

    const merged: UserSession = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    await this.set(merged);
    return merged;
  },
};

export const sessionStoreMeta = {
  mode: currentStoreMode(),
};
