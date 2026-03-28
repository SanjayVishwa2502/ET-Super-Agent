const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
let repl = `
                  )}

                  {!isCreatingLens ? (
                    <button 
                      onClick={() => setIsCreatingLens(true)}
                      className="w-full mt-2 mb-4 py-2 border-2 border-dashed border-indigo-200 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                    >
                      + Create Custom Lens
                    </button>
                  ) : (
                    <div className="mb-4 bg-white border border-indigo-100 p-3 rounded-xl shadow-sm">
                      <h4 className="text-[11px] font-bold text-gray-800 mb-2">New Lens</h4>
                      <input 
                        type="text" 
                        placeholder="Lens Name" 
                        className="w-full text-xs p-2 mb-2 border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                        value={newLensName}
                        onChange={e => setNewLensName(e.target.value)}
                      />
                      <textarea 
                        placeholder="Describe what this lens wants... (max 1000 chars)" 
                        className="w-full text-xs p-2 mb-2 border border-gray-200 rounded resize-none h-16 focus:outline-none focus:border-indigo-400"
                        value={newLensDesc}
                        onChange={e => setNewLensDesc(e.target.value)}
                      />
                      <input 
                        type="text" 
                        placeholder="Tags (comma separated)" 
                        className="w-full text-xs p-2 mb-2 border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                        value={newLensTags}
                        onChange={e => setNewLensTags(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => setIsCreatingLens(false)}
                          className="px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleCreateLens}
                          className="px-3 py-1.5 text-[10px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                          disabled={!newLensName.trim() ||!newLensDesc.trim()}
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  )}
// success
`
c = c.replace(/(\n)  (\n\s*<div className="mb-2">\n\s+<h4 className="text-\[10px\] font-bold uppercase text-gray-400 mb-2">Mock Presets<\/h4>)/g, repl + '$2');
fs.writeFileSync('src/App.tsx', c);
console.log('success');