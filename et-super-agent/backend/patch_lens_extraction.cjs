const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, 'src', 'routes', 'profile.ts');
let content = fs.readFileSync(profilePath, 'utf8');

// Add import
if (!content.includes('import { extractLensContext }')) {
    content = content.replace(
        /import \{ profileStore \} from "\.\.\/store\/profileStore\.js";/,
        'import { profileStore } from "../store/profileStore.js";\nimport { extractLensContext } from "../services/lensExtractionService.js";'
    );
}

// Modify route
const regex = /try\s*\{\s*const newLens = await profileStore\.createSubProfile\(session\.profileId,\s*\{\s*name:\s*parsed\.data\.name,\s*description:\s*parsed\.data\.description,\s*tags:\s*parsed\.data\.tags,\s*\}\);/m;

const replacement = `try {
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
      });`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(profilePath, content);
    console.log("Updated profile.ts with semantic extraction.");
} else {
    console.log("Could not find regex match to update profile.ts.");
}
