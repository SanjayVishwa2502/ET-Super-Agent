import { Router } from "express";
import { z } from "zod";
import { profileStore } from "../store/profileStore.js";
import { sessionStore } from "../store/sessionStore.js";
import { UserSession } from "../types.js";
import { v4 as uuidv4 } from "uuid";

export const profileRouter = Router();

function toPublicProfile(profile: {
  profileId: string;
  profileAnswers: Record<string, string>;
  profileComplete: boolean;
}) {
  return {
    profileId: profile.profileId,
    profileAnswers: profile.profileAnswers,
    profileComplete: profile.profileComplete,
  };
}

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  pageContext: z.object({
    topic: z.string().min(1).default("general"),
    tags: z.array(z.string()).default([]),
    articleId: z.string().optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  pageContext: z.object({
    topic: z.string().min(1).default("general"),
    tags: z.array(z.string()).default([]),
    articleId: z.string().optional(),
  }).optional(),
});

const saveSchema = z.object({
  sessionId: z.string().min(1),
  profileId: z.string().optional(),
  name: z.string().optional(),
});

profileRouter.get("/profile/list", async (_req, res) => {
  const profiles = await profileStore.getAll();
  res.json({
    profiles: profiles.map((profile) => ({
      profileId: profile.profileId,
      name: profile.profileAnswers.name ?? "Unknown",
      profileComplete: profile.profileComplete,
      updatedAt: profile.updatedAt,
      profileAnswers: profile.profileAnswers,
    })),
  });
});

profileRouter.post("/profile/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const created = await profileStore.register({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });

    const now = new Date().toISOString();
    const session: UserSession = {
      sessionId: uuidv4(),
      profileId: created.profileId,
      createdAt: now,
      updatedAt: now,
      pageContext: parsed.data.pageContext ?? { topic: "general", tags: [] },
      profileAnswers: created.profileAnswers,
      profileComplete: created.profileComplete,
      persona: "unknown",
      intents: [],
      latestGoal: undefined,
      recommendationHistory: [],
      history: [],
    };

    sessionStore.set(session);

    res.status(201).json({
      created: true,
      sessionId: session.sessionId,
      profile: toPublicProfile(created),
      welcomeMessage: `Welcome, ${created.profileAnswers.name ?? "there"}! Your account is ready.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      res.status(409).json({ error: "Account already exists for this email." });
      return;
    }
    res.status(500).json({ error: "Failed to register profile." });
  }
});

profileRouter.post("/profile/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const found = await profileStore.verifyCredentials({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!found) {
    res.status(401).json({ error: "Invalid email or password", found: false });
    return;
  }

  const now = new Date().toISOString();
  const session: UserSession = {
    sessionId: uuidv4(),
    profileId: found.profileId,
    createdAt: now,
    updatedAt: now,
    pageContext: parsed.data.pageContext ?? { topic: "general", tags: [] },
    profileAnswers: found.profileAnswers,
    profileComplete: found.profileComplete,
    persona: "unknown",
    intents: [],
    latestGoal: undefined,
    recommendationHistory: [],
    history: [],
  };

  sessionStore.set(session);

  res.json({
    found: true,
    sessionId: session.sessionId,
    profile: toPublicProfile(found),
    welcomeMessage: `Welcome back, ${found.profileAnswers.name ?? "there"}!`,
  });
});

profileRouter.post("/profile/save", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const profileAnswers = { ...session.profileAnswers };
  if (parsed.data.name?.trim()) {
    profileAnswers.name = parsed.data.name.trim();
  }

  const saved = await profileStore.save({
    profileId: parsed.data.profileId ?? session.profileId,
    profileAnswers,
  });

  session.profileId = saved.profileId;
  session.profileAnswers = saved.profileAnswers;
  session.profileComplete = saved.profileComplete;
  sessionStore.set(session);

  res.json({
    saved: true,
    profile: toPublicProfile(saved),
  });
});
