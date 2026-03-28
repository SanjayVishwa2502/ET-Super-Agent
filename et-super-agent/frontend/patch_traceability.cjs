const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `{data.gapDetection?.strategy?.recommendationFocus && (`;
const insertionStr = `            {/* Active Lens Info */}
            {data.activeLensEnforced && (
              <div className="bg-purple-100 border border-purple-200 rounded px-2 py-1.5 mb-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                <div>
                  <strong className="text-purple-900">Active Lens Rules Enforced:</strong>{' '}
                  <span className="text-purple-700 font-bold">Yes</span>
                </div>
              </div>
            )}

            `;

content = content.replace(targetStr, insertionStr + targetStr);

fs.writeFileSync(filePath, content);
console.log("Updated App.tsx with Traceability Drawer Lens info.");
