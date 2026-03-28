const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add SubProfile imports
code = code.replace(/import \{([\s\S]*?)Message, NewsCard, UserPersona, ActiveContextSummary, DashboardData, LiveNewsCard([\s\S]*?)\} from '\.\/types';/, "import { $1Message, NewsCard, UserPersona, ActiveContextSummary, DashboardData, LiveNewsCard, SubProfile, SavedProfile$2 } from './types';");

// Add activeLens state
const stateInsertion = `  const [activeProfileSummary, setActiveProfileSummary] = useState<ProfileSummary>({ name: 'Guest' });
  
  // Lens Manager State
  const [showLensManager, setShowLensManager] = useState(false);
  const [activeLens, setActiveLens] = useState<SubProfile | null>(null);
  const [availableLenses, setAvailableLenses] = useState<SubProfile[]>([]);
  const [fullSavedProfile, setFullSavedProfile] = useState<SavedProfile | null>(null);`;
  
code = code.replace(/const \[activeProfileSummary, setActiveProfileSummary\] = useState<ProfileSummary>\(\{ name: 'Guest' \}\);/, stateInsertion);

// Hydrate lenses on login
const loginInsertion = `      setActiveProfileSummary(deriveProfileSummaryFromAnswers(res.data.profile?.profileAnswers, loadedName));
      setFullSavedProfile(res.data.profile);
      setAvailableLenses(res.data.profile?.subProfiles || []);
      if (res.data.activeLens) setActiveLens(res.data.activeLens);`;

code = code.replace(/setActiveProfileSummary\(deriveProfileSummaryFromAnswers\(res\.data\.profile\?.profileAnswers, loadedName\)\);/g, loginInsertion);

fs.writeFileSync(path, code);
console.log("Patched App.tsx with Lens State!");
