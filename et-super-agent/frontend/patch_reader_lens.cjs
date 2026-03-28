const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace Reader Lens display logic
const oldReaderLens = /<p className="text-\[11px\] text-gray-500">\s*\{selectedUser \? `\$\{selectedUser\.name\.split\('\('\)\[0\]\.trim\(\)\} • \$\{selectedUser\.incomeBand\}` : 'No lens selected'\}\s*<\/p>/;
const newReaderLens = `<p className="text-[11px] font-bold text-indigo-700">
                      {activeLens ? \`\${activeLens.name}\` : selectedUser ? \`\${selectedUser.name.split('(')[0].trim()} • \${selectedUser.incomeBand}\` : 'No lens selected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLensManager(true)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm"
                >
                  Manage Lenses
                </button>
              </div>

              {activeLens && activeLens.tags && activeLens.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                   {activeLens.tags.map((t, idx) => (
                     <span key={idx} className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200 font-medium">#{t}</span>
                   ))}
                </div>
              )}`;

content = content.replace(oldReaderLens, newReaderLens);

// Prevent the old "Switch Lens" button from rendering right after since I merged the buttons
const oldSwitchLensBtn = /<\/div>\s*<button\s*onClick=\{([^}]+)\}\s*className="text-\[11px\] font-semibold px-2\.5 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-100"\s*>\s*\{showPersonaLab \? 'Hide Context Lab' : 'Switch Lens'\}\s*<\/button>\s*<\/div>/m;
content = content.replace(oldSwitchLensBtn, "</div>\n</div>");

// 2. Fix the Delete button text string in LensManagerModal
content = content.replace(/<button onClick=\{\(\) => handleDelete\(lens\.id\)\} className="text-gray-400 hover:text-red-500"><X size=\{16\} \/><\/button>/g, 
  `<button onClick={() => handleDelete(lens.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1 rounded font-semibold text-red-600 flex items-center gap-1"><Trash2 size={12} /> Delete</button>`);

// Add Trash2 to lucide-react imports if not there
if (content.includes("lucide-react") && !content.includes("Trash2")) {
  content = content.replace(/import\s*\{\s*([^}]+)\}\s*from\s*'lucide-react';/m, (match, p1) => {
    return `import { ${p1.trim()}, Trash2 } from 'lucide-react';`;
  });
}

fs.writeFileSync(filePath, content);
console.log("Patched reader lens and delete UI!");
