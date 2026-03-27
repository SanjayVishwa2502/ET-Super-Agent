import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { sessionStore } from "../store/sessionStore.js";
import { profileStore } from "../store/profileStore.js";
import { UserSession } from "../types.js";

export const sessionRouter = Router();

const startSessionSchema = z.object({
  profileId: z.string().optional(),
  pageContext: z.object({
    topic: z.string().min(1),
    tags: z.array(z.string()).default([]),
    articleId: z.string().optional(),
  }),
});

sessionRouter.post("/session/start", async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const savedProfile = parsed.data.profileId
    ? await profileStore.getById(parsed.data.profileId)
    : undefined;

  const now = new Date().toISOString();
  const session: UserSession = {
    sessionId: uuidv4(),
    profileId: savedProfile?.profileId,
    createdAt: now,
    updatedAt: now,
    pageContext: parsed.data.pageContext,
    profileAnswers: savedProfile?.profileAnswers ?? {},
    profileComplete: savedProfile?.profileComplete ?? false,
    persona: "unknown",
    intents: [],
    latestGoal: undefined,
    recommendationHistory: [],
    history: [],
  };

  sessionStore.set(session);

  res.json({
    sessionId: session.sessionId,
    profileLoaded: Boolean(savedProfile),
    profile: savedProfile
      ? {
          profileId: savedProfile.profileId,
          name: savedProfile.profileAnswers.name ?? "Unknown",
          profileAnswers: savedProfile.profileAnswers,
          profileComplete: savedProfile.profileComplete,
        }
      : undefined,
    nextQuestion: "What is your primary goal right now: tax planning, investing, or debt management?",
  });
});
