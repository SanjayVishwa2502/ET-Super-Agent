const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'services', 'llmPrompts.ts');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /8\. Response should be 3-5 sentences max, plain text only\./;
const replacement = `8. Response should be 3-5 sentences max, plain text only.
  9. FATAL RULE: If an "Active Lens (Sub-Profile)" is provided in the Context, you MUST completely adopt its persona, risk posture, and Core Directives into your response generation. Ensure your tone, tool recommendations, and strategy strictly match the Active Lens.`;

content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content);
console.log("Updated prompt in llmPrompts.ts");
