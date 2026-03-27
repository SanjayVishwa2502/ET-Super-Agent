const fs = require('fs');
const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const target = code.substring(code.indexOf("const handleToolResult ="), code.indexOf("const summarizeCurrentNews"));
const fixed = `const handleToolResult = (summary: string) => {
      handleSend(undefined, \`I used the tool and got this response: "\${summary}". Please explain what this means for my profile naturally, and suggest if I should look at any related tools or products.\`);
    };

    `;
code = code.replace(target, fixed);
fs.writeFileSync(path, code);
