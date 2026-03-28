const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/const \[fullSavedProfile, setFullSavedProfile\] = useState<SavedProfile \| null>\(null\);/g, "");
code = code.replace(/setFullSavedProfile\(res\.data\.profile\);/g, "");

fs.writeFileSync(path, code);
console.log("Fixed unused fullSavedProfile var.");
