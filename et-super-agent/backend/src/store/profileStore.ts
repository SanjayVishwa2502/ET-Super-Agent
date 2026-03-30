import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { PersistedProfile } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KV_REST_API_URL = process.env.KV_REST_API_URL?.trim();
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN?.trim();
const PROFILES_KV_KEY = process.env.PROFILE_STORE_KEY?.trim() || "et-super-agent:profiles:v1";

function kvConfigured(): boolean {
  return Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
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
};
