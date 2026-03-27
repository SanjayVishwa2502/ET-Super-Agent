import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { PersistedProfile } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profilesFilePath = path.resolve(__dirname, "../../data/profiles.json");

type SaveProfileInput = {
  profileId?: string;
  profileAnswers: Record<string, string>;
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

export const profileStore = {
  getAll,
  getById,
  getByName,
  save,
};
