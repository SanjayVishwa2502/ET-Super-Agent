import { UserSession } from "../types.js";
import { getSqlDatabase, sqlDatabaseMeta } from "./sqlDatabase.js";

type SessionRow = {
  session_id: string;
  session_json: string;
  expires_at: string;
  updated_at: string;
};

type CachedSession = {
  session: UserSession;
  expiresAt: string;
};

const sessionCache = new Map<string, CachedSession>();

const SESSION_TTL_SECONDS = resolveSessionTtl();

function resolveSessionTtl(): number {
  const parsed = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60 * 60 * 24 * 7;
  }

  return Math.floor(parsed);
}

function computeExpiresAt(nowIso: string): string {
  const nowMs = Date.parse(nowIso);
  return new Date(nowMs + SESSION_TTL_SECONDS * 1000).toISOString();
}

function isExpired(expiresAt: string, nowIso: string): boolean {
  return expiresAt <= nowIso;
}

async function cleanupExpiredSessions(nowIso: string): Promise<void> {
  const db = await getSqlDatabase();
  await db.run(
    `DELETE FROM sessions WHERE expires_at <= ?`,
    [nowIso],
  );

  for (const [sessionId, cached] of sessionCache.entries()) {
    if (isExpired(cached.expiresAt, nowIso)) {
      sessionCache.delete(sessionId);
    }
  }
}

async function get(sessionId: string): Promise<UserSession | undefined> {
  const nowIso = new Date().toISOString();

  const cached = sessionCache.get(sessionId);
  if (cached) {
    if (isExpired(cached.expiresAt, nowIso)) {
      sessionCache.delete(sessionId);
    } else {
      return cached.session;
    }
  }

  const db = await getSqlDatabase();
  const row = await db.queryOne<SessionRow>(
    `
      SELECT session_id, session_json, expires_at, updated_at
      FROM sessions
      WHERE session_id = ?
      LIMIT 1
    `,
    [sessionId],
  );

  if (!row) {
    return undefined;
  }

  if (isExpired(row.expires_at, nowIso)) {
    await db.run(
      `DELETE FROM sessions WHERE session_id = ?`,
      [sessionId],
    );
    return undefined;
  }

  try {
    const parsed = JSON.parse(row.session_json) as UserSession;
    sessionCache.set(sessionId, {
      session: parsed,
      expiresAt: row.expires_at,
    });
    return parsed;
  } catch {
    await db.run(
      `DELETE FROM sessions WHERE session_id = ?`,
      [sessionId],
    );
    return undefined;
  }
}

async function set(session: UserSession): Promise<void> {
  const nowIso = new Date().toISOString();
  const normalized: UserSession = {
    ...session,
    updatedAt: nowIso,
  };
  const expiresAt = computeExpiresAt(nowIso);

  const db = await getSqlDatabase();
  await db.run(
    `
      INSERT INTO sessions (session_id, session_json, expires_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id)
      DO UPDATE SET
        session_json = excluded.session_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `,
    [
      normalized.sessionId,
      JSON.stringify(normalized),
      expiresAt,
      normalized.updatedAt,
    ],
  );

  sessionCache.set(normalized.sessionId, {
    session: normalized,
    expiresAt,
  });

  await cleanupExpiredSessions(nowIso);
}

async function update(sessionId: string, updateInput: Partial<UserSession>): Promise<UserSession | undefined> {
  const existing = await get(sessionId);
  if (!existing) {
    return undefined;
  }

  const merged: UserSession = {
    ...existing,
    ...updateInput,
    updatedAt: new Date().toISOString(),
  };

  await set(merged);
  return merged;
}

export const sessionStore = {
  get,
  set,
  update,
};

export const sessionStoreMeta = {
  mode: sqlDatabaseMeta.mode,
};
