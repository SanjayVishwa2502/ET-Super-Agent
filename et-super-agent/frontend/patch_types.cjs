const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/types.ts';
let code = fs.readFileSync(path, 'utf8');

const newTypes = `
export type SubProfile = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  extractedContext?: string;
  createdAt: string;
};

export type SavedProfile = {
  profileId: string;
  name: string;
  profileComplete: boolean;
  updatedAt: string;
  profileAnswers: Record<string, string>;
  subProfiles?: SubProfile[];
};`;

code = code.replace(/export type SavedProfile = \{[\s\S]*?\};/, newTypes);
fs.writeFileSync(path, code);
console.log("Patched frontend types.ts!");
