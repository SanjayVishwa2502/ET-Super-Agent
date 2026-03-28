const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The block we want to replace cleanly is exactly this:
const searchString = `                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Reader Lens</h3>
                    <p className="text-[11px] text-gray-500">
                      {selectedUser ? \`\${selectedUser.name.split('(')[0].trim()} • \${selectedUser.incomeBand}\` : 'No lens selected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPersonaLab((prev) => !prev)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
                >
                  {showPersonaLab ? 'Hide Context Lab' : 'Switch Lens'}
                </button>
              </div>`;

const replaceString = `                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">Reader Lens</h3>
                    <p className="text-[11px] font-bold text-indigo-700">
                      {activeLens ? activeLens.name : (selectedUser ? \`\${selectedUser.name.split('(')[0].trim()} • \${selectedUser.incomeBand}\` : 'No lens selected')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLensManager(true)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  Manage Lenses
                </button>
              </div>
              
              {activeLens && activeLens.tags && activeLens.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                   {activeLens.tags.map((t, idx) => (
                     <span key={idx} className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 font-medium">#{t}</span>
                   ))}
                </div>
              )}`;

if (content.includes(searchString)) {
  content = content.replace(searchString, replaceString);
  console.log("Replaced Reader Lens Header safely!");
} else {
  console.log("Could not find exact Reader Lens string.");
}

// 2. Fix the Delete button text string in LensManagerModal
content = content.replace(/<button onClick=\{\(\) => handleDelete\(lens\.id\)\} className="text-gray-400 hover:text-red-500"><X size=\{16\} \/><\/button>/g, 
  `<button onClick={() => handleDelete(lens.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1 rounded font-semibold flex items-center gap-1"><Trash2 size={12} /> Delete</button>`);

// Add Trash2 to lucide-react imports if not there
if (content.includes("lucide-react") && !content.includes("Trash2")) {
  content = content.replace(/import\s*\{\s*([^}]+)\}\s*from\s*'lucide-react';/m, (match, p1) => {
    return `import { ${p1.trim()}, Trash2 } from 'lucide-react';`;
  });
}

fs.writeFileSync(filePath, content);
console.log("Done patching.");
