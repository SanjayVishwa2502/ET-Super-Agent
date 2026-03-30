import { Router } from "express";
import { z } from "zod";
import { profileStore } from "../store/profileStore.js";
import { extractLensContext } from "../services/lensExtractionService.js";
import { sessionStore } from "../store/sessionStore.js";
import { UserSession } from "../types.js";
import { v4 as uuidv4 } from "uuid";

export const profileRouter = Router();

function buildValidationMessage(details: { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> }): string | null {
  const parts: string[] = [];

  for (const entry of details.formErrors) {
    const text = entry.trim();
    if (text) parts.push(text);
  }

  for (const [field, errors] of Object.entries(details.fieldErrors)) {
    if (!errors || errors.length === 0) continue;
    const joined = errors.map((item) => item.trim()).filter(Boolean).join(", ");
    if (joined) parts.push(`${field}: ${joined}`);
  }

  if (parts.length === 0) return null;
  return parts.join(" | ");
}

function toPublicProfile(profile: {
  profileId: string;
  accountRef?: string;
  profileAnswers: Record<string, string>;
  profileComplete: boolean;
  subProfiles?: import("../types.js").SubProfile[];
  loginCount?: number;
  lastLoginAt?: string;
}) {
  return {
    profileId: profile.profileId,
    accountRef: profile.accountRef,
    profileAnswers: profile.profileAnswers,
    profileComplete: profile.profileComplete,
    subProfiles: profile.subProfiles || [],
    loginCount: profile.loginCount ?? 0,
    lastLoginAt: profile.lastLoginAt,
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
      accountRef: profile.accountRef,
      name: profile.profileAnswers.name ?? "Unknown",
      profileComplete: profile.profileComplete,
      loginCount: profile.loginCount ?? 0,
      lastLoginAt: profile.lastLoginAt,
      updatedAt: profile.updatedAt,
      profileAnswers: profile.profileAnswers,
    })),
  });
});

profileRouter.post("/profile/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    const message = buildValidationMessage(details);
    res.status(400).json({
      error: message ? `Invalid payload: ${message}` : "Invalid payload",
      details,
    });
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
    const details = parsed.error.flatten();
    const message = buildValidationMessage(details);
    res.status(400).json({
      error: message ? `Invalid payload: ${message}` : "Invalid payload",
      details,
    });
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

const createLensSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().min(1).max(50),
  description: z.string().max(1000),
  tags: z.array(z.string()).max(10).default([]),
});

profileRouter.post("/profile/lens/create", async (req, res) => {
  const parsed = createLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Session or profile not found" });
    return;
  }

  try {
      // PHASE 3: Semantic Extraction Generation
      // Instead of taking up vector DB space, we use the LLM to generate rules during creation
      const extractedContext = await extractLensContext(
        parsed.data.name,
        parsed.data.description,
        parsed.data.tags || []
      );
      
      const newLens = await profileStore.createSubProfile(session.profileId, {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
        extractedContext: extractedContext
      });
    
    // Auto-switch to new lens
    session.activeLensId = newLens.id;
    session.activeLens = newLens;
    sessionStore.set(session);

    const updatedProfile = await profileStore.getById(session.profileId);
    
    res.json({
      success: true,
      lens: newLens,
      profile: updatedProfile ? toPublicProfile(updatedProfile) : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create lens" });
  }
});

const deleteLensSchema = z.object({
  sessionId: z.string().min(1),
  lensId: z.string().min(1),
});

profileRouter.delete("/profile/lens", async (req, res) => {
  const parsed = deleteLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  try {
    await profileStore.deleteSubProfile(session.profileId, parsed.data.lensId);
    if (session.activeLensId === parsed.data.lensId) {
      session.activeLensId = undefined;
      session.activeLens = undefined;
      sessionStore.set(session);
    }
    
    const updatedProfile = await profileStore.getById(session.profileId);
    res.json({ success: true, profile: updatedProfile ? toPublicProfile(updatedProfile) : undefined });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete lens" });
  }
});

const switchLensSchema = z.object({
  sessionId: z.string().min(1),
  lensId: z.string().optional(), // undefined to reset to base profile
});

profileRouter.post("/profile/lens/switch", async (req, res) => {
  const parsed = switchLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  try {
    const profile = await profileStore.getById(session.profileId);
    if (!profile) throw new Error("Profile not found");

    if (parsed.data.lensId) {
      const lens = profile.subProfiles?.find(sp => sp.id === parsed.data.lensId);
      if (!lens) throw new Error("Lens not found");
      session.activeLensId = lens.id;
      session.activeLens = lens;
    } else {
      session.activeLensId = undefined;
      session.activeLens = undefined;
    }
    
    sessionStore.set(session);
    res.json({ success: true, activeLensId: session.activeLensId, activeLens: session.activeLens });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

