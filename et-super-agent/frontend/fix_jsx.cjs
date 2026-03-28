const fs = require('fs'); let c = fs.readFileSync('src/App.tsx', 'utf8'); c = c.replace(/<header.*?>.*?<\/header>/s, ''); fs.writeFileSync('src/App.tsx', c);
