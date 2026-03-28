const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/, SavedProfile/, "");

fs.writeFileSync(path, code);
console.log("Fixed unused SavedProfile var.");
