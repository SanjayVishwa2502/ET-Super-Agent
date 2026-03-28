const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, 'src', 'store', 'profileStore.ts');
let content = fs.readFileSync(storePath, 'utf8');

// The profileStore previously omitted extractedContext when expecting it from user. We need to allow passing it.
content = content.replace(
    /createSubProfile\(masterProfileId: string, subProfileData: Omit<SubProfile, 'id' | 'createdAt' | 'extractedContext'>\)/g,
    "createSubProfile(masterProfileId: string, subProfileData: Omit<SubProfile, 'id' | 'createdAt'>)"
);

content = content.replace(
    /const newSubProfile: SubProfile = \{\s*\.\.\.subProfileData,\s*id: [^,]+,\s*createdAt: [^,]+,\s*extractedContext: ""\s*\};/m,
    `const newSubProfile: SubProfile = {
      ...subProfileData,
      id: "lens-" + Date.now().toString() + "-" + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      extractedContext: subProfileData.extractedContext || ""
    };`
);

fs.writeFileSync(storePath, content);
console.log("Updated profileStore.ts to accept extractedContext.");
