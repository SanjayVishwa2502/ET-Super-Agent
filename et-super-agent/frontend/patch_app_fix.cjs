const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

// The replacement failed on the last script because the regex for menderRenderRepl missed. Let's fix it by adding it directly before the final closing div wrapper of the return statement of App().

// Remove everything from {activeToolAction ... to the end of the App component and replace it properly.
const regex = /\{activeToolAction && sessionId && \([\s\S]*?<ToolActionModal[\s\S]*?\/>\s*\)\s*\}/;

const newBlock = `{activeToolAction && sessionId && (
        <ToolActionModal
          sessionId={sessionId}
          action={activeToolAction.action}
          title={activeToolAction.title}
          onClose={() => setActiveToolAction(null)}
          onResult={handleToolResult}
        />
      )}
      
      {showLensManager && sessionId && (
        <LensManagerModal
          sessionId={sessionId}
          lenses={availableLenses}
          activeLens={activeLens}
          onClose={() => setShowLensManager(false)}
          onLensUpdate={setAvailableLenses}
          onLensSwitch={setActiveLens}
        />
      )}`;

if (regex.test(code)) {
    code = code.replace(regex, newBlock);
    fs.writeFileSync(path, code);
    console.log("Fixed unused vars by placing component render properly.");
} else {
    console.log("Couldn't find target string for replace.");
}
