const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

// Insert Lens Component definitions at the bottom
const lensManagerComponent = `
// ─── Lens Manager Component ──────────────────────────────
function LensManagerModal({ 
  lenses, activeLens, sessionId, onClose, onLensUpdate, onLensSwitch 
}: { 
  lenses: SubProfile[], activeLens: SubProfile | null, sessionId: string, onClose: () => void, 
  onLensUpdate: (lenses: SubProfile[]) => void, onLensSwitch: (lens: SubProfile | null) => void 
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !desc.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/profile/lens/create', {
        sessionId, name, description: desc, tags
      });
      if (res.data.success) {
        onLensUpdate(res.data.profile.subProfiles);
        onLensSwitch(res.data.lens);
        setIsCreating(false);
        setName(''); setDesc(''); setTags([]);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to create Lens');
    }
    setLoading(false);
  };

  const handleDelete = async (lensId: string) => {
    setLoading(true);
    try {
      const res = await axios.delete('/api/profile/lens', { data: { sessionId, lensId } });
      if (res.data.success) {
        onLensUpdate(res.data.profile.subProfiles);
        if (activeLens?.id === lensId) onLensSwitch(null);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSwitch = async (lensId?: string) => {
    setLoading(true);
    try {
      const res = await axios.post('/api/profile/lens/switch', { sessionId, lensId });
      if (res.data.success) {
        onLensSwitch(res.data.activeLens || null);
        onClose();
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Contextual Lenses</h3>
            <p className="text-xs text-slate-300">Dynamically shift your AI's perspective.</p>
          </div>
          <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded"><X size={18} /></button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
          {!isCreating ? (
            <div className="space-y-4">
              <button 
                onClick={() => setIsCreating(true)}
                className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 rounded-xl hover:bg-blue-50 font-semibold flex items-center justify-center gap-2"
              >
                + Create New Lens
              </button>

              <div className="space-y-3">
                <div 
                  className={\`p-3 rounded-xl border \${!activeLens ? 'border-primary bg-red-50' : 'bg-white border-gray-200'}\`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">Base Profile (Default)</span>
                    {!activeLens ? (
                      <span className="text-xs bg-primary text-white px-2 py-1 rounded">Active</span>
                    ) : (
                      <button onClick={() => handleSwitch()} disabled={loading} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded font-semibold text-gray-700">Equip</button>
                    )}
                  </div>
                </div>

                {lenses.map(lens => {
                  const isActive = activeLens?.id === lens.id;
                  return (
                    <div key={lens.id} className={\`p-3 rounded-xl border \${isActive ? 'border-indigo-500 bg-indigo-50' : 'bg-white border-gray-200'}\`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-gray-800">{lens.name}</div>
                        <div className="flex gap-2">
                          <button onClick={() => handleDelete(lens.id)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                          {isActive ? (
                            <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded font-semibold">Active Lens</span>
                          ) : (
                            <button onClick={() => handleSwitch(lens.id)} disabled={loading} className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1 rounded font-semibold">Equip</button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-2 truncate" title={lens.description}>{lens.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {lens.tags.map(t => <span key={t} className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">#{t}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Lens Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aggressive Crypto Trader" className="w-full text-sm p-2 border rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">System Instructions (Max 1000 chars)</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the personality, rules, or exact context you want the AI to adopt..." rows={4} maxLength={1000} className="w-full text-sm p-2 border rounded-lg resize-none" />
                <div className="text-[10px] text-right text-gray-400 mt-1">{desc.length}/1000</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Keywords / Tags</label>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag()} placeholder="e.g. High Risk" className="flex-1 text-sm p-2 border rounded-lg" />
                  <button onClick={handleAddTag} className="bg-gray-200 hover:bg-gray-300 px-3 rounded-lg text-sm font-semibold">Add</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map(t => <span key={t} className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded flex items-center gap-1">{t} <button onClick={() => setTags(tags.filter(x => x !== t))}><X size={12}/></button></span>)}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setIsCreating(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200">Cancel</button>
                <button onClick={handleCreate} disabled={loading || !name || !desc} className="flex-1 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-black disabled:opacity-50">Create Lens</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`;

code = code + "\n" + lensManagerComponent;

// Insert Lens Button next to "Profile" badge header
const buttonRegex = /<div className="text-\[11px\] font-semibold uppercase tracking-wider text-slate-300">Profile<\/div>/;
const buttonRepl = `<div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Profile</div>
                    {sessionId && (
                      <button 
                        onClick={() => setShowLensManager(true)}
                        className={\`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border \${activeLens ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}\`}
                        title="Manage Lenses"
                      >
                        <User size={10} /> {activeLens ? activeLens.name : 'Base'}
                      </button>
                    )}
                  </div>`;
code = code.replace(buttonRegex, buttonRepl);

// Insert the Modal Render block before the final closing div of App
const menderRenderRepl = `
      {activeToolAction && sessionId && (
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

code = code.replace(/\{activeToolAction && sessionId && \([\s\S]*?<\/ToolActionModal>\s*\)\s*\}/, menderRenderRepl);

fs.writeFileSync(path, code);
console.log("Patched App.tsx with UI Component!");
