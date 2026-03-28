const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/backend/src/store/profileStore.ts';
let code = fs.readFileSync(path, 'utf8');

const newMethods = `
async function createSubProfile(profileId: string, subProfileInput: Omit<import("../types.js").SubProfile, "id" | "createdAt" | "extractedContext">): Promise<import("../types.js").SubProfile> {
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

export const profileStore = {`;

const regexExport = /export const profileStore = \{/g;
code = code.replace(regexExport, newMethods);

const regexExportEnd = /(export const profileStore = \{[\s\S]*?)(};)/g;
code = code.replace(regexExportEnd, "$1  createSubProfile,\n  deleteSubProfile,\n};");

fs.writeFileSync(path, code);
console.log("Patched profileStore.ts!");
