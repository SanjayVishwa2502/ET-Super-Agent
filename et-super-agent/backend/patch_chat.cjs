const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'routes', 'chat.ts');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /crossSell: \{\s*triggered: result\.crossSellTriggered,\s*reason: result\.crossSellReason,\s*template: result\.crossSellTemplate,\s*\},\s*\},\s*\}\);/m;
const replacement = `crossSell: {
          triggered: result.crossSellTriggered,
          reason: result.crossSellReason,
          template: result.crossSellTemplate,
        },
        activeLensEnforced: !!session.activeLensId,
      },
    });`;

content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content);
console.log("Updated chat.ts");
