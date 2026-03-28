const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

c = c.replace(
  /<p className="text-\[11px\] text-gray-500">[\s\S]*?<\/p>/,
  '<p className="text-[11px] font-bold text-indigo-700">\\n{activeLens ? \\ : selectedUser ? \\ • \\ : \'No lens selected\'}\\n</p>'
);

c = c.replace(
  /onClick=\{[^}]*setShowPersonaLab[^}]*\}[^>]*>[\s\S]*?<\/button>/,
  'onClick={() => setShowLensManager(true)}\nclassName="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shadow-sm"\n>\nManage Lenses\n</button>'
);

c = c.replace(
  /\{showPersonaLab && \(/,
  '{activeLens && activeLens.tags && activeLens.tags.length > 0 && (<div className="flex flex-wrap gap-1 mt-3 px-0">{activeLens.tags.map(t => <span key={t} className="text-[9px] uppercase font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-md border border-indigo-200 mt-1 mr-1">#{t}</span>)}</div>)}\n{showPersonaLab && ('
);

c = c.replace(
  /<button onClick=\{\(\) => handleDelete\(lens\.id\)\} className="text-gray-400 hover:text-red-500"><X size=\{16\} \/><\/button>/g,
  '<button onClick={() => handleDelete(lens.id)} className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1 rounded font-semibold ml-2">Delete</button>'
);

fs.writeFileSync('src/App.tsx', c);
console.log('App patched successfully');
