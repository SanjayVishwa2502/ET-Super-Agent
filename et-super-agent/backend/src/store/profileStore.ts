import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { BehaviorDocument, PersistedProfile } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KV_REST_API_URL =
  process.env.KV_REST_API_URL?.trim() ||
  process.env.UPSTASH_REDIS_REST_URL?.trim();
const KV_REST_API_TOKEN =
  process.env.KV_REST_API_TOKEN?.trim() ||
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const PROFILES_KV_KEY = process.env.PROFILE_STORE_KEY?.trim() || "et-super-agent:profiles:v1";

function kvConfigured(): boolean {
  return Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
}

function currentStoreMode(): "kv" | "tmp-file" | "file" {
  if (kvConfigured()) return "kv";
  if (process.env.VERCEL) return "tmp-file";
  return "file";
}

async function kvCommand(args: string[]): Promise<unknown> {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error("KV not configured");
  }

  const res = await fetch(KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw new Error(`KV command failed with status ${res.status}`);
  }

  const payload = await res.json() as { result?: unknown };
  return payload.result;
}

function resolveProfilesFilePath(): string {
  const configuredPath = process.env.PROFILE_STORE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  // Vercel serverless runtime has writable temp storage only under /tmp.
  if (process.env.VERCEL) {
    return path.resolve("/tmp", "et-super-agent", "profiles.json");
  }

  return path.resolve(__dirname, "../../data/profiles.json");
}

const profilesFilePath = resolveProfilesFilePath();

type SaveProfileInput = {
  profileId?: string;
  profileAnswers: Record<string, string>;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

const BEHAVIOR_STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "have", "your", "what", "when", "where", "will", "would", "about", "there", "their", "which", "could", "should", "please", "hello", "thanks", "need", "want", "help", "just", "then", "also", "into", "after", "before", "like", "more", "very", "much", "good", "great", "okay", "ok",
]);

async function ensureStoreFile(): Promise<void> {
  const dir = path.dirname(profilesFilePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(profilesFilePath);
  } catch {
    await fs.writeFile(profilesFilePath, "[]\n", "utf-8");
  }
}

async function readProfiles(): Promise<PersistedProfile[]> {
  if (kvConfigured()) {
    try {
      const result = await kvCommand(["GET", PROFILES_KV_KEY]);
      if (typeof result !== "string") {
        return [];
      }

      const parsed = JSON.parse(result) as PersistedProfile[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("KV read failed, falling back to file storage:", err);
    }
  }

  await ensureStoreFile();
  try {
    const raw = await fs.readFile(profilesFilePath, "utf-8");
    const parsed = JSON.parse(raw) as PersistedProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: PersistedProfile[]): Promise<void> {
  if (kvConfigured()) {
    try {
      await kvCommand(["SET", PROFILES_KV_KEY, JSON.stringify(profiles)]);
      return;
    } catch (err) {
      console.warn("KV write failed, falling back to file storage:", err);
    }
  }

  await ensureStoreFile();
  await fs.writeFile(profilesFilePath, `${JSON.stringify(profiles, null, 2)}\n`, "utf-8");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function makeAccountRef(profileId: string): string {
  const short = profileId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ETA-${short}`;
}

function inferTraitsFromMessage(text: string): string[] {
  const normalized = text.toLowerCase();
  const traits: string[] = [];

  if (normalized.includes("tax") || normalized.includes("deduction")) traits.push("tax-focused");
  if (normalized.includes("loan") || normalized.includes("debt") || normalized.includes("emi")) traits.push("debt-aware");
  if (normalized.includes("invest") || normalized.includes("portfolio") || normalized.includes("sip")) traits.push("investment-oriented");
  if (normalized.includes("safe") || normalized.includes("conservative") || normalized.includes("low risk")) traits.push("risk-conservative");
  if (normalized.includes("high risk") || normalized.includes("aggressive")) traits.push("risk-aggressive");
  if (normalized.includes("plan") || normalized.includes("goal")) traits.push("planner-mindset");

  return traits;
}

function extractBehaviorTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !BEHAVIOR_STOP_WORDS.has(item))
    .slice(0, 32);
}

function createBehaviorDocument(now: string): BehaviorDocument {
  return {
    summary: "No behavior profile yet.",
    keywords: [],
    traits: [],
    tokenCounts: {},
    lastSignals: [],
    messageCount: 0,
    updatedAt: now,
  };
}

function summarizeBehavior(doc: BehaviorDocument): string {
  const topKeywords = doc.keywords.slice(0, 5);
  const topTraits = doc.traits.slice(0, 4);

  const keywordText = topKeywords.length > 0 ? topKeywords.join(", ") : "insufficient data";
  const traitText = topTraits.length > 0 ? topTraits.join(", ") : "not inferred yet";
  return `User focus terms: ${keywordText}. Inferred behavior traits: ${traitText}.`;
}

function mergeBehaviorSignal(existing: BehaviorDocument | undefined, message: string): BehaviorDocument {
  const now = new Date().toISOString();
  const base = existing ?? createBehaviorDocument(now);
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return {
      ...base,
      updatedAt: now,
    };
  }

  const tokenCounts = { ...base.tokenCounts };
  for (const token of extractBehaviorTokens(trimmedMessage)) {
    tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
  }

  const keywords = Object.entries(tokenCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([token]) => token);

  const traits = Array.from(new Set([...base.traits, ...inferTraitsFromMessage(trimmedMessage)])).slice(0, 12);
  const lastSignals = [...base.lastSignals, trimmedMessage].slice(-12);

  const merged: BehaviorDocument = {
    ...base,
    tokenCounts,
    keywords,
    traits,
    lastSignals,
    messageCount: (base.messageCount ?? 0) + 1,
    updatedAt: now,
  };

  merged.summary = summarizeBehavior(merged);
  return merged;
}

function mergeAnswers(
  existing: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === "string" && value.trim().length > 0) {
      merged[key] = value.trim();
    }
  }
  return merged;
}

function isProfileComplete(profileAnswers: Record<string, string>): boolean {
  const required = ["name", "incomeRange", "riskPreference", "topGoal"];
  return required.every((field) => Boolean(profileAnswers[field]));
}

async function getAll(): Promise<PersistedProfile[]> {
  const profiles = await readProfiles();
  return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function getById(profileId: string): Promise<PersistedProfile | undefined> {
  const profiles = await readProfiles();
  return profiles.find((profile) => profile.profileId === profileId);
}

async function getByName(name: string): Promise<PersistedProfile | undefined> {
  const profiles = await readProfiles();
  const normalized = normalizeName(name);
  return profiles.find((profile) => normalizeName(profile.profileAnswers.name ?? "") === normalized);
}

async function getByEmail(email: string): Promise<PersistedProfile | undefined> {
  const profiles = await readProfiles();
  const normalized = normalizeEmail(email);
  return profiles.find((profile) => normalizeEmail(profile.email ?? "") === normalized);
}

async function register(input: RegisterInput): Promise<PersistedProfile> {
  const profiles = await readProfiles();
  const normalizedEmail = normalizeEmail(input.email);
  const emailExists = profiles.some((profile) => normalizeEmail(profile.email ?? "") === normalizedEmail);
  if (emailExists) {
    throw new Error("EMAIL_EXISTS");
  }

  const now = new Date().toISOString();
  const profileAnswers = mergeAnswers({}, {
    name: input.name,
    email: normalizedEmail,
  });

  const created: PersistedProfile = {
    profileId: uuidv4(),
    accountRef: "",
    profileAnswers,
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    profileComplete: isProfileComplete(profileAnswers),
    behaviorDoc: createBehaviorDocument(now),
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  created.accountRef = makeAccountRef(created.profileId);

  profiles.push(created);
  await writeProfiles(profiles);
  return created;
}

async function verifyCredentials(input: { email: string; password: string }): Promise<PersistedProfile | undefined> {
  const profiles = await readProfiles();
  const normalizedEmail = normalizeEmail(input.email);
  const index = profiles.findIndex((profile) => normalizeEmail(profile.email ?? "") === normalizedEmail);
  if (index === -1) {
    return undefined;
  }

  const profile = profiles[index];
  if (!profile.passwordHash) return undefined;

  const providedHash = hashPassword(input.password);
  if (providedHash !== profile.passwordHash) {
    return undefined;
  }

  const updated: PersistedProfile = {
    ...profile,
    accountRef: profile.accountRef || makeAccountRef(profile.profileId),
    behaviorDoc: profile.behaviorDoc ?? createBehaviorDocument(new Date().toISOString()),
    loginCount: (profile.loginCount ?? 0) + 1,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  profiles[index] = updated;
  await writeProfiles(profiles);
  return updated;
}

async function save(input: SaveProfileInput): Promise<PersistedProfile> {
  const profiles = await readProfiles();
  const now = new Date().toISOString();

  let existingIndex = -1;
  if (input.profileId) {
    existingIndex = profiles.findIndex((profile) => profile.profileId === input.profileId);
  }

  if (existingIndex === -1 && input.profileAnswers.name) {
    const normalized = normalizeName(input.profileAnswers.name);
    existingIndex = profiles.findIndex(
      (profile) => normalizeName(profile.profileAnswers.name ?? "") === normalized,
    );
  }

  if (existingIndex >= 0) {
    const existing = profiles[existingIndex];
    const mergedAnswers = mergeAnswers(existing.profileAnswers, input.profileAnswers);

    const updated: PersistedProfile = {
      ...existing,
      profileAnswers: mergedAnswers,
      profileComplete: isProfileComplete(mergedAnswers),
      updatedAt: now,
    };

    profiles[existingIndex] = updated;
    await writeProfiles(profiles);
    return updated;
  }

  const cleanAnswers = mergeAnswers({}, input.profileAnswers);
  const created: PersistedProfile = {
    profileId: input.profileId ?? uuidv4(),
    profileAnswers: cleanAnswers,
    profileComplete: isProfileComplete(cleanAnswers),
    behaviorDoc: createBehaviorDocument(now),
    createdAt: now,
    updatedAt: now,
  };

  created.accountRef = makeAccountRef(created.profileId);
  created.loginCount = 0;

  profiles.push(created);
  await writeProfiles(profiles);
  return created;
}


async function createSubProfile(profileId: string, subProfileInput: Omit<import("../types.js").SubProfile, "id" | "createdAt">): Promise<import("../types.js").SubProfile> {
  const profiles = await readProfiles();
  const index = profiles.findIndex(p => p.profileId === profileId);
  if (index === -1) throw new Error("PROFILE_NOT_FOUND");
  
  const existing = profiles[index];
  const newSubProfile: import("../types.js").SubProfile = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...subProfileInput
  };
  
  const updated: PersistedProfile = {
    ...existing,
    subProfiles: [...(existing.subProfiles || []), newSubProfile],
    updatedAt: new Date().toISOString()
  };
  
  profiles[index] = updated;
  await writeProfiles(profiles);
  return newSubProfile;
}

async function deleteSubProfile(profileId: string, subProfileId: string): Promise<void> {
  const profiles = await readProfiles();
  const index = profiles.findIndex(p => p.profileId === profileId);
  if (index === -1) throw new Error("PROFILE_NOT_FOUND");
  
  const existing = profiles[index];
  if (!existing.subProfiles) return;
  
  const updatedSubProfiles = existing.subProfiles.filter(sp => sp.id !== subProfileId);
  
  if (updatedSubProfiles.length !== existing.subProfiles.length) {
    const updated: PersistedProfile = {
      ...existing,
      subProfiles: updatedSubProfiles,
      updatedAt: new Date().toISOString()
    };
    profiles[index] = updated;
    await writeProfiles(profiles);
  }
}

async function recordBehaviorSignal(profileId: string | undefined, message: string): Promise<PersistedProfile | undefined> {
  if (!profileId) {
    return undefined;
  }

  const profiles = await readProfiles();
  const index = profiles.findIndex((profile) => profile.profileId === profileId);
  if (index === -1) {
    return undefined;
  }

  const existing = profiles[index];
  const updated: PersistedProfile = {
    ...existing,
    behaviorDoc: mergeBehaviorSignal(existing.behaviorDoc, message),
    updatedAt: new Date().toISOString(),
  };

  profiles[index] = updated;
  await writeProfiles(profiles);
  return updated;
}

export const profileStore = {
  getAll,
  getById,
  getByName,
  getByEmail,
  register,
  verifyCredentials,
  save,
  createSubProfile,
  deleteSubProfile,
  recordBehaviorSignal,
};

export const profileStoreMeta = {
  mode: currentStoreMode(),
};
