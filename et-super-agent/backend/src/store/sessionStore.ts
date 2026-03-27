import { UserSession } from "../types.js";

const sessionMap = new Map<string, UserSession>();

export const sessionStore = {
  get(sessionId: string): UserSession | undefined {
    return sessionMap.get(sessionId);
  },

  set(session: UserSession): void {
    sessionMap.set(session.sessionId, session);
  },

  update(sessionId: string, update: Partial<UserSession>): UserSession | undefined {
    const existing = sessionMap.get(sessionId);
    if (!existing) {
      return undefined;
    }

    const merged: UserSession = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    sessionMap.set(sessionId, merged);
    return merged;
  },
};
