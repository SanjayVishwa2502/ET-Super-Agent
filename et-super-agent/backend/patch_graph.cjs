const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'orchestration', 'graph.ts');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /activeContextUserName: state\.session\.enrichedContext\?\.user\?\.name,\s*\n\s*\}\),/m;
const replacement = `activeContextUserName: state.session.enrichedContext?.user?.name,
          activeLensName: state.session.activeLens?.name,
          activeLensRules: state.session.activeLens?.extractedContext,
        }),`;

content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content);
console.log("Updated graph.ts context");
