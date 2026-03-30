import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { BehaviorDocument, PersistedProfile, SubProfile } from "../types.js";
import { getSqlDatabase, sqlDatabaseMeta } from "./sqlDatabase.js";

type SaveProfileInput = {
  profileId?: string;
  profileAnswers: Record<string, string>;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type ProfileRow = {
  profile_id: string;
  account_ref: string | null;
  profile_answers: string;
  email: string | null;
  password_hash: string | null;
  profile_complete: number;
  behavior_doc: string | null;
  login_count: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type SubProfileRow = {
  id: string;
  profile_id: string;
  name: string;
  description: string;
  tags: string;
  extracted_context: string | null;
  created_at: string;
};

const BEHAVIOR_STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "have", "your", "what", "when", "where", "will", "would", "about", "there", "their", "which", "could", "should", "please", "hello", "thanks", "need", "want", "help", "just", "then", "also", "into", "after", "before", "like", "more", "very", "much", "good", "great", "okay", "ok",
]);

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

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function getSubProfiles(profileId: string): Promise<SubProfile[]> {
  const db = await getSqlDatabase();
  const rows = await db.query<SubProfileRow>(
    `
      SELECT id, profile_id, name, description, tags, extracted_context, created_at
      FROM sub_profiles
      WHERE profile_id = ?
      ORDER BY created_at ASC
    `,
    [profileId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    tags: parseJson<string[]>(row.tags, []),
    extractedContext: row.extracted_context ?? undefined,
    createdAt: row.created_at,
  }));
}

async function mapProfileRow(row: ProfileRow): Promise<PersistedProfile> {
  const profileAnswers = parseJson<Record<string, string>>(row.profile_answers, {});
  const now = new Date().toISOString();

  return {
    profileId: row.profile_id,
    accountRef: row.account_ref ?? makeAccountRef(row.profile_id),
    profileAnswers,
    email: row.email ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    profileComplete: Number(row.profile_complete ?? 0) > 0,
    subProfiles: await getSubProfiles(row.profile_id),
    behaviorDoc: parseJson<BehaviorDocument | undefined>(row.behavior_doc, createBehaviorDocument(now)),
    loginCount: Number(row.login_count ?? 0),
    lastLoginAt: row.last_login_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findProfileRowById(profileId: string): Promise<ProfileRow | undefined> {
  const db = await getSqlDatabase();
  return db.queryOne<ProfileRow>(
    `
      SELECT profile_id, account_ref, profile_answers, email, password_hash,
             profile_complete, behavior_doc, login_count, last_login_at,
             created_at, updated_at
      FROM profiles
      WHERE profile_id = ?
      LIMIT 1
    `,
    [profileId],
  );
}

async function findProfileRowByEmail(email: string): Promise<ProfileRow | undefined> {
  const db = await getSqlDatabase();
  return db.queryOne<ProfileRow>(
    `
      SELECT profile_id, account_ref, profile_answers, email, password_hash,
             profile_complete, behavior_doc, login_count, last_login_at,
             created_at, updated_at
      FROM profiles
      WHERE email = ?
      LIMIT 1
    `,
    [normalizeEmail(email)],
  );
}

function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

async function insertProfile(profile: PersistedProfile): Promise<void> {
  const db = await getSqlDatabase();

  await db.run(
    `
      INSERT INTO profiles (
        profile_id, account_ref, profile_answers, email, password_hash,
        profile_complete, behavior_doc, login_count, last_login_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      profile.profileId,
      profile.accountRef ?? null,
      JSON.stringify(profile.profileAnswers),
      profile.email ?? null,
      profile.passwordHash ?? null,
      toSqlBool(profile.profileComplete),
      JSON.stringify(profile.behaviorDoc ?? null),
      profile.loginCount ?? 0,
      profile.lastLoginAt ?? null,
      profile.createdAt,
      profile.updatedAt,
    ],
  );
}

async function updateProfile(profile: PersistedProfile): Promise<void> {
  const db = await getSqlDatabase();

  await db.run(
    `
      UPDATE profiles
      SET
        account_ref = ?,
        profile_answers = ?,
        email = ?,
        password_hash = ?,
        profile_complete = ?,
        behavior_doc = ?,
        login_count = ?,
        last_login_at = ?,
        updated_at = ?
      WHERE profile_id = ?
    `,
    [
      profile.accountRef ?? null,
      JSON.stringify(profile.profileAnswers),
      profile.email ?? null,
      profile.passwordHash ?? null,
      toSqlBool(profile.profileComplete),
      JSON.stringify(profile.behaviorDoc ?? null),
      profile.loginCount ?? 0,
      profile.lastLoginAt ?? null,
      profile.updatedAt,
      profile.profileId,
    ],
  );
}

function isUniqueEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("UNIQUE constraint failed: profiles.email") ||
    error.message.includes("duplicate key value")
  );
}

async function getAll(): Promise<PersistedProfile[]> {
  const db = await getSqlDatabase();
  const rows = await db.query<ProfileRow>(
    `
      SELECT profile_id, account_ref, profile_answers, email, password_hash,
             profile_complete, behavior_doc, login_count, last_login_at,
             created_at, updated_at
      FROM profiles
      ORDER BY updated_at DESC
    `,
  );

  const profiles: PersistedProfile[] = [];
  for (const row of rows) {
    profiles.push(await mapProfileRow(row));
  }

  return profiles;
}

async function getById(profileId: string): Promise<PersistedProfile | undefined> {
  const row = await findProfileRowById(profileId);
  return row ? mapProfileRow(row) : undefined;
}

async function getByName(name: string): Promise<PersistedProfile | undefined> {
  const normalized = normalizeName(name);
  const profiles = await getAll();
  return profiles.find((profile) => normalizeName(profile.profileAnswers.name ?? "") === normalized);
}

async function getByEmail(email: string): Promise<PersistedProfile | undefined> {
  const row = await findProfileRowByEmail(email);
  return row ? mapProfileRow(row) : undefined;
}

async function register(input: RegisterInput): Promise<PersistedProfile> {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await getByEmail(normalizedEmail);
  if (existing) {
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

  try {
    await insertProfile(created);
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new Error("EMAIL_EXISTS");
    }
    throw error;
  }

  return getById(created.profileId) as Promise<PersistedProfile>;
}

async function verifyCredentials(input: { email: string; password: string }): Promise<PersistedProfile | undefined> {
  const row = await findProfileRowByEmail(input.email);
  if (!row) {
    return undefined;
  }

  const profile = await mapProfileRow(row);
  if (!profile.passwordHash) {
    return undefined;
  }

  const providedHash = hashPassword(input.password);
  if (providedHash !== profile.passwordHash) {
    return undefined;
  }

  const now = new Date().toISOString();
  const updated: PersistedProfile = {
    ...profile,
    accountRef: profile.accountRef || makeAccountRef(profile.profileId),
    behaviorDoc: profile.behaviorDoc ?? createBehaviorDocument(now),
    loginCount: (profile.loginCount ?? 0) + 1,
    lastLoginAt: now,
    updatedAt: now,
  };

  await updateProfile(updated);
  return getById(updated.profileId);
}

async function save(input: SaveProfileInput): Promise<PersistedProfile> {
  const now = new Date().toISOString();

  let existing: PersistedProfile | undefined;
  if (input.profileId) {
    existing = await getById(input.profileId);
  }

  if (!existing && input.profileAnswers.name) {
    existing = await getByName(input.profileAnswers.name);
  }

  if (existing) {
    const mergedAnswers = mergeAnswers(existing.profileAnswers, input.profileAnswers);

    const updated: PersistedProfile = {
      ...existing,
      accountRef: existing.accountRef || makeAccountRef(existing.profileId),
      profileAnswers: mergedAnswers,
      profileComplete: isProfileComplete(mergedAnswers),
      behaviorDoc: existing.behaviorDoc ?? createBehaviorDocument(now),
      loginCount: existing.loginCount ?? 0,
      updatedAt: now,
    };

    await updateProfile(updated);
    return getById(updated.profileId) as Promise<PersistedProfile>;
  }

  const cleanAnswers = mergeAnswers({}, input.profileAnswers);
  const created: PersistedProfile = {
    profileId: input.profileId ?? uuidv4(),
    accountRef: "",
    profileAnswers: cleanAnswers,
    profileComplete: isProfileComplete(cleanAnswers),
    behaviorDoc: createBehaviorDocument(now),
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  created.accountRef = makeAccountRef(created.profileId);

  await insertProfile(created);
  return getById(created.profileId) as Promise<PersistedProfile>;
}

async function createSubProfile(
  profileId: string,
  subProfileInput: Omit<SubProfile, "id" | "createdAt">,
): Promise<SubProfile> {
  const profile = await getById(profileId);
  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const newSubProfile: SubProfile = {
    id: uuidv4(),
    createdAt: now,
    ...subProfileInput,
  };

  const db = await getSqlDatabase();
  await db.run(
    `
      INSERT INTO sub_profiles (
        id, profile_id, name, description, tags, extracted_context, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      newSubProfile.id,
      profileId,
      newSubProfile.name,
      newSubProfile.description,
      JSON.stringify(newSubProfile.tags),
      newSubProfile.extractedContext ?? null,
      newSubProfile.createdAt,
    ],
  );

  await db.run(
    `UPDATE profiles SET updated_at = ? WHERE profile_id = ?`,
    [now, profileId],
  );

  return newSubProfile;
}

async function deleteSubProfile(profileId: string, subProfileId: string): Promise<void> {
  const profile = await getById(profileId);
  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  const db = await getSqlDatabase();
  const changes = await db.run(
    `
      DELETE FROM sub_profiles
      WHERE profile_id = ? AND id = ?
    `,
    [profileId, subProfileId],
  );

  if (changes > 0) {
    await db.run(
      `UPDATE profiles SET updated_at = ? WHERE profile_id = ?`,
      [new Date().toISOString(), profileId],
    );
  }
}

async function recordBehaviorSignal(profileId: string | undefined, message: string): Promise<PersistedProfile | undefined> {
  if (!profileId) {
    return undefined;
  }

  const profile = await getById(profileId);
  if (!profile) {
    return undefined;
  }

  const updated: PersistedProfile = {
    ...profile,
    behaviorDoc: mergeBehaviorSignal(profile.behaviorDoc, message),
    updatedAt: new Date().toISOString(),
  };

  await updateProfile(updated);
  return getById(profileId);
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
  mode: sqlDatabaseMeta.mode,
};
