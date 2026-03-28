const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/reference docs/ET_Super_Agent_Dynamic_Profiles_Plan.md';
let code = fs.readFileSync(path, 'utf8');

code = code.replace("### Phase 2: The UI Control Center", "### Phase 2: The UI Control Center (Frontend Layer) - [COMPLETED]");

fs.writeFileSync(path, code);
console.log("Patched docs phase 2!");
