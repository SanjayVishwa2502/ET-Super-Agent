const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, 'src', 'store', 'profileStore.ts');
let content = fs.readFileSync(storePath, 'utf8');

content = content.replace(
    /Omit<import\("\.\.\/types\.js"\)\.SubProfile, "id" \| "createdAt" \| "extractedContext">/g,
    'Omit<import("../types.js").SubProfile, "id" | "createdAt">'
);

fs.writeFileSync(storePath, content);
console.log("Updated profileStore.ts to fix regex miss.");
