import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { PersistedProfile } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    profileAnswers,
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    profileComplete: isProfileComplete(profileAnswers),
    createdAt: now,
    updatedAt: now,
  };

  profiles.push(created);
  await writeProfiles(profiles);
  return created;
}

async function verifyCredentials(input: { email: string; password: string }): Promise<PersistedProfile | undefined> {
  const profile = await getByEmail(input.email);
  if (!profile || !profile.passwordHash) {
    return undefined;
  }

  const providedHash = hashPassword(input.password);
  if (providedHash !== profile.passwordHash) {
    return undefined;
  }

  return profile;
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
