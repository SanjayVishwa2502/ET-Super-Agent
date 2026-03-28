const fs = require("fs"); let c = fs.readFileSync("src/App.tsx", "utf8"); c = c.replace(/Mock Presets/g, "Mockk Presets"); fs.writeFileSync("src/App.tsx", c); console.log("Success");
