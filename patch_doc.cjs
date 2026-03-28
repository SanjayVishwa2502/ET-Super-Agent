const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/reference docs/ET_Super_Agent_Dynamic_Profiles_Plan.md';
let code = fs.readFileSync(path, 'utf8');

code = code.replace("### Phase 4: Semantic", "### Phase 3: Semantic");
code = code.replace("### Phase 5: Agent Prompt", "### Phase 4: Agent Prompt");
code = code.replace("### Phase 1: Storage", "### Phase 1: Storage & API Architecture (Data Layer) - [COMPLETED]");

fs.writeFileSync(path, code);
console.log("Patched docs!");
