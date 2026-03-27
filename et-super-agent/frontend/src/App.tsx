import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Send, Bot, Cpu, ChevronDown, ChevronUp, ExternalLink, X,
  Mic, MicOff, Volume2, VolumeX, CheckCircle2, XCircle, Zap,
  Newspaper, User, ArrowRight, Sparkles, Shield, TrendingUp,
  CreditCard, Heart, Activity, FlaskConical, RotateCcw, AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Message, NewsCard, UserPersona, ActiveContextSummary, DashboardData, SavedProfile
} from './types';

type ProfileSummary = {
  name: string;
  riskPreference?: string;
  topGoal?: string;
  incomeRange?: string;
};

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function deriveProfileSummaryFromAnswers(answers?: Record<string, string>, fallbackName?: string): ProfileSummary {
  return {
    name: answers?.name ?? fallbackName ?? 'Guest',
    riskPreference: answers?.riskPreference,
    topGoal: answers?.topGoal,
    incomeRange: answers?.incomeRange,
  };
}

// ─── Section icon + color mapping ─────────────────────────
const SECTION_META: Record<string, { icon: React.ReactNode; badgeClass: string; gradient: string }> = {
  Tax: {
    icon: <Shield size={14} />,
    badgeClass: 'badge-tax',
    gradient: 'from-amber-50 to-orange-50',
  },
  Loans: {
    icon: <CreditCard size={14} />,
    badgeClass: 'badge-loans',
    gradient: 'from-red-50 to-rose-50',
  },
  Investments: {
    icon: <TrendingUp size={14} />,
    badgeClass: 'badge-investments',
    gradient: 'from-emerald-50 to-teal-50',
  },
  Insurance: {
    icon: <Heart size={14} />,
    badgeClass: 'badge-insurance',
    gradient: 'from-indigo-50 to-violet-50',
  },
};

// ─── Main App ─────────────────────────────────────────────
export default function App() {
  // Chat state
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dashboard state
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserPersona | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsCard | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveContextSummary | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const [contextSwitching, setContextSwitching] = useState(false);

  // Persistent profile/login state
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [loginName, setLoginName] = useState('');
  const [sessionBooting, setSessionBooting] = useState(false);
  const [welcomeBackName, setWelcomeBackName] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [activeProfileSummary, setActiveProfileSummary] = useState<ProfileSummary>({ name: 'Guest' });
  const [lastChatError, setLastChatError] = useState<{ text: string; detail: string } | null>(null);
  const [activeToolAction, setActiveToolAction] = useState<{
    action: "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";
    title: string;
  } | null>(null);

  // Validation state
  const [showValidation, setShowValidation] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [validationRunning, setValidationRunning] = useState(false);

  // ─── Fetch dashboard data and persisted profiles on mount ────────────────
  useEffect(() => {
    const initializeData = async () => {
      try {
        const [dashboardRes, profileRes] = await Promise.all([
          axios.get('/api/dashboard/news'),
          axios.get('/api/profile/list'),
        ]);

        const data: DashboardData = dashboardRes.data;
        setDashboardData(data);
        if (data.userPersonas.length > 0) {
          setSelectedUser(data.userPersonas[0]);
        }

        const profiles: SavedProfile[] = profileRes.data.profiles ?? [];
        setSavedProfiles(profiles);
        if (profiles.length > 0) {
          setSelectedProfileId(profiles[0].profileId);
          setLoginName(profiles[0].name);
        }
      } catch (err) {
        console.error("Failed to initialize dashboard/profile data:", err);
      }
    };
    initializeData();
  }, []);

  const startGuestSession = async () => {
    setSessionBooting(true);
    try {
      const res = await axios.post('/api/session/start', {
        pageContext: { topic: 'general', tags: ['dashboard'] },
      });

      setSessionId(res.data.sessionId);
      setWelcomeBackName(null);
      setActiveProfileSummary({ name: 'Guest' });
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: "Welcome to ET Super Agent. You are continuing as guest, so I will build your profile as we chat.",
      }]);
    } catch (err) {
      console.error('Failed to start guest session:', err);
    } finally {
      setSessionBooting(false);
    }
  };

  const startSessionWithSelectedProfile = async () => {
    if (!selectedProfileId) return;
    setSessionBooting(true);
    try {
      const res = await axios.post('/api/session/start', {
        profileId: selectedProfileId,
        pageContext: { topic: 'general', tags: ['dashboard'] },
      });

      setSessionId(res.data.sessionId);
      const loadedName = res.data.profile?.name ?? 'there';
      setWelcomeBackName(loadedName);
      setActiveProfileSummary(deriveProfileSummaryFromAnswers(res.data.profile?.profileAnswers, loadedName));
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: `Welcome back, ${loadedName}! I loaded your saved profile, so we can jump straight into recommendations.`,
      }]);
    } catch (err) {
      console.error('Failed to start session with saved profile:', err);
    } finally {
      setSessionBooting(false);
    }
  };

  const loginByName = async () => {
    if (!loginName.trim()) return;
    setSessionBooting(true);
    try {
      const res = await axios.post('/api/profile/login', {
        name: loginName.trim(),
        pageContext: { topic: 'general', tags: ['dashboard'] },
      });

      setSessionId(res.data.sessionId);
      const loadedName = res.data.profile?.profileAnswers?.name ?? loginName.trim();
      setWelcomeBackName(loadedName);
      setActiveProfileSummary(deriveProfileSummaryFromAnswers(res.data.profile?.profileAnswers, loadedName));
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: res.data.welcomeMessage ?? `Welcome back, ${loadedName}!`,
      }]);
    } catch (err) {
      console.error('Login by name failed:', err);
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: `I could not find a saved profile for \"${loginName.trim()}\". Please continue as guest or select another profile.`,
      }]);
    } finally {
      setSessionBooting(false);
    }
  };

  const saveCurrentProfile = async () => {
    if (!sessionId) return;
    setProfileSaving(true);
    try {
      const res = await axios.post('/api/profile/save', { sessionId });
      const profileName = res.data.profile?.profileAnswers?.name ?? 'Profile';
      setWelcomeBackName(profileName);
      setActiveProfileSummary(deriveProfileSummaryFromAnswers(res.data.profile?.profileAnswers, profileName));
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Saved successfully. I can now remember you as ${profileName} next time.`,
      }]);

      const refreshed = await axios.get('/api/profile/list');
      setSavedProfiles(refreshed.data.profiles ?? []);
    } catch (err) {
      console.error('Profile save failed:', err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'I could not save this profile yet. Please make sure your basic profile fields are filled and try again.',
      }]);
    } finally {
      setProfileSaving(false);
    }
  };

  // ─── Context switch handler ─────────────────────────────
  const handleContextSwitch = useCallback(async (article: NewsCard, user: UserPersona) => {
    if (!sessionId) return;
    setContextSwitching(true);
    try {
      const res = await axios.post('/api/context/select-article', {
        sessionId,
        userId: user.userId,
        articleId: article.articleId,
      });

      const summary: ActiveContextSummary = res.data.activeContextSummary;
      setActiveContext(summary);
      setContextVersion(prev => prev + 1);

      // Add system notification to chat
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `🔄 Context updated! Now reading: **"${summary.articleHeadline}"** as **${summary.userName}**. My recommendations will adapt to this context. Ask me anything!`,
      }]);
    } catch (err) {
      console.error("Context switch failed:", err);
    } finally {
      setContextSwitching(false);
    }
  }, [sessionId]);

  // ─── News card click ────────────────────────────────────
  const handleArticleClick = (article: NewsCard) => {
    setSelectedArticle(article);
    if (selectedUser) {
      handleContextSwitch(article, selectedUser);
    }
  };

  // ─── User persona click ────────────────────────────────
  const handleUserClick = (user: UserPersona) => {
    setSelectedUser(user);
    if (selectedArticle) {
      handleContextSwitch(selectedArticle, user);
    }
  };

  // ─── Scroll to bottom ──────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // ─── TTS ───────────────────────────────────────────────
  const speakText = (text: string) => {
    if (isMuted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // ─── STT ───────────────────────────────────────────────
  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSend(undefined, transcript);
    };

    recognition.start();
  };

  // ─── Chat send ─────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const textToProcess = overrideText || input;
    if (!textToProcess.trim() || !sessionId || isLoading) return;

    const userText = textToProcess.trim();
    setLastChatError(null);
    setInput('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await axios.post('/api/chat/message', {
        sessionId,
        message: userText,
      });

      const data = res.data;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.assistantMessage,
        cards: data.recommendations,
        orchestrationData: data.orchestration,
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakText(data.assistantMessage);

      if (data.nextQuestion) {
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: data.nextQuestion,
          }]);
          speakText(data.nextQuestion);
        }, 800);
      }
    } catch (err) {
      console.error("Chat error:", err);
      const detail = axios.isAxiosError(err)
        ? err.response?.data?.error ?? err.message
        : 'Unexpected error';
      setLastChatError({ text: userText, detail: String(detail) });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'I encountered an error connecting to ET systems. You can retry the same message with one click below.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const retryFailedMessage = async () => {
    if (!lastChatError?.text || isLoading) return;
    await handleSend(undefined, lastChatError.text);
  };

  // ─── Compare handler ───────────────────────────────────
  const handleCompare = async (category: string) => {
    if (!sessionId || isLoading) return;
    setIsLoading(true);

    try {
      const res = await axios.post('/api/recommendations/compare', {
        sessionId,
        category,
      });

      const data = res.data;
      const compareMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I've analyzed top ${category.replace('-', ' ')} against your profile. Here's how they compare:`,
        compareData: data,
      };

      setMessages(prev => [...prev, compareMsg]);
      speakText(`I've analyzed top ${category.replace('-', ' ')} against your profile. Here's how they compare.`);
    } catch (err) {
      console.error("Compare error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Validation runner ─────────────────────────────────
  const runValidation = async () => {
    setValidationRunning(true);
    setValidationReport(null);
    try {
      const res = await axios.post('/api/validation/run-scenarios');
      setValidationReport(res.data);
    } catch (err) {
      console.error('Validation error:', err);
    } finally {
      setValidationRunning(false);
    }
  };

  const handleToolCtaClick = (card: { toolAction?: string; title: string; url: string }) => {
    if (
      card.toolAction === 'risk-profiler' ||
      card.toolAction === 'goal-planner' ||
      card.toolAction === 'fund-screener' ||
      card.toolAction === 'spend-analyzer'
    ) {
      setActiveToolAction({
        action: card.toolAction,
        title: card.title,
      });
      return;
    }

    window.open(card.url, '_blank', 'noopener,noreferrer');
  };

  const handleToolResult = (summary: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: summary,
    }]);
    speakText(summary);
  };

  // ─── Group articles by section ─────────────────────────
  const articlesBySection = dashboardData?.newsCards.reduce((acc, article) => {
    if (!acc[article.section]) acc[article.section] = [];
    acc[article.section].push(article);
    return acc;
  }, {} as Record<string, NewsCard[]>) ?? {};

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-800 font-sans">
      {/* HEADER */}
      <header className="bg-white shadow-sm border-b-4 border-primary px-8 py-4 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-3xl font-serif font-black tracking-tight">
          <span className="text-primary">THE ECONOMIC</span> TIMES
        </h1>
        <div className="flex items-center gap-6">
          <nav className="text-sm font-semibold flex gap-6 text-gray-500">
            <span className="text-black">HOME</span>
            <span>MARKETS</span>
            <span>NEWS</span>
            <span>INDUSTRY</span>
            <span>WEALTH</span>
          </nav>
          <button
            onClick={() => { setShowValidation(true); runValidation(); }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all hover:scale-105"
            title="Run Phase 5 Validation Scenarios"
          >
            <FlaskConical size={14} />
            Validate
          </button>
        </div>
      </header>

      {!sessionId && (
        <section className="max-w-6xl mx-auto mt-6 mb-2 px-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Profile Login & Recall</h2>
                <p className="text-sm text-gray-500">Select an existing profile or continue as guest before starting chat.</p>
              </div>
              <div className="text-xs text-gray-500">
                Saved profiles: <span className="font-semibold text-gray-700">{savedProfiles.length}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Quick Select</label>
                <select
                  value={selectedProfileId}
                  onChange={(e) => {
                    const profileId = e.target.value;
                    setSelectedProfileId(profileId);
                    const selected = savedProfiles.find((p) => p.profileId === profileId);
                    if (selected) {
                      setLoginName(selected.name);
                    }
                  }}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {savedProfiles.length === 0 && <option value="">No saved profiles</option>}
                  {savedProfiles.map((profile) => (
                    <option key={profile.profileId} value={profile.profileId}>
                      {profile.name} ({profile.profileComplete ? 'complete' : 'partial'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Login by Name</label>
                <input
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="Enter your saved name"
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={startSessionWithSelectedProfile}
                  disabled={sessionBooting || !selectedProfileId}
                  className="flex-1 bg-black text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Use Profile
                </button>
                <button
                  onClick={loginByName}
                  disabled={sessionBooting || !loginName.trim()}
                  className="flex-1 bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Login
                </button>
                <button
                  onClick={startGuestSession}
                  disabled={sessionBooting}
                  className="flex-1 bg-gray-100 text-gray-800 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Continue as Guest
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MAIN 2-COLUMN LAYOUT */}
      <div className="flex gap-0 min-h-[calc(100vh-73px)]">

        {/* ── LEFT: DASHBOARD PANEL ── */}
        <div className="w-[420px] bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">

          {/* USER PERSONA SELECTOR */}
          <div className="p-4 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <User size={16} className="text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Select Persona</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {dashboardData?.userPersonas.map(user => (
                <button
                  key={user.userId}
                  onClick={() => handleUserClick(user)}
                  className={`persona-card text-left p-3 rounded-xl bg-white shadow-sm ${selectedUser?.userId === user.userId ? 'selected' : ''
                    }`}
                >
                  <div className="text-sm font-semibold text-gray-800 leading-tight mb-1">
                    {user.name.split('(')[0].trim()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded risk-${user.riskAppetite}`}>
                      {user.riskAppetite} risk
                    </span>
                    <span className="text-[10px] text-gray-400">{user.incomeBand}</span>
                  </div>
                  {user.activeLoans.length > 0 && (
                    <div className="text-[10px] text-red-500 mt-1 font-medium">
                      ⚠ {user.activeLoans.length} active loan{user.activeLoans.length > 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* NEWS CARDS LIST */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Newspaper size={16} className="text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Today's News</h3>
            </div>

            {Object.entries(articlesBySection).map(([section, articles]) => {
              const meta = SECTION_META[section] ?? SECTION_META.Tax;
              return (
                <div key={section}>
                  <div className="section-header flex items-center gap-2 mb-2">
                    <span className={`${meta.badgeClass} text-[10px] font-bold uppercase px-2 py-1 rounded-full flex items-center gap-1`}>
                      {meta.icon} {section}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {articles.map(article => (
                      <div
                        key={article.articleId}
                        onClick={() => handleArticleClick(article)}
                        className={`news-card bg-white rounded-xl p-3.5 shadow-sm ${selectedArticle?.articleId === article.articleId ? 'selected' : ''
                          }`}
                      >
                        <h4 className="text-sm font-semibold text-gray-900 leading-snug mb-2 pr-6">
                          {article.headline}
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {article.topicTags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {article.riskSignals.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {article.riskSignals.slice(0, 2).map(signal => (
                              <span key={signal} className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded font-medium">
                                {signal}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: MAIN CONTENT + CHAT ── */}
        <div className="flex-1 relative">
          {/* Article content area */}
          <main className="max-w-3xl mx-auto mt-8 p-8 bg-white shadow-sm rounded-xl mb-24">
            {selectedArticle ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`${SECTION_META[selectedArticle.section]?.badgeClass ?? 'badge-tax'} text-[11px] font-bold uppercase px-2.5 py-1 rounded-full flex items-center gap-1`}>
                    {SECTION_META[selectedArticle.section]?.icon} {selectedArticle.section}
                  </span>
                </div>
                <h2 className="text-3xl font-bold mb-4 leading-tight text-gray-900">
                  {selectedArticle.headline}
                </h2>
                <p className="text-gray-400 text-sm mb-6 border-b pb-4">
                  By ET Bureau | Updated: Mar 27, 2026
                </p>
                <div className="space-y-5 text-lg text-gray-700 leading-relaxed">
                  <p>
                    This article covers key insights related to <strong>{selectedArticle.section.toLowerCase()}</strong> topics
                    including {selectedArticle.topicTags.join(', ')}. Our analysis explores the current landscape and
                    what it means for different investor profiles.
                  </p>
                  <div className="p-5 bg-blue-50 border-l-4 border-blue-500 italic text-base rounded-r-lg">
                    "Understanding the interplay between {selectedArticle.topicTags[0]} and {selectedArticle.topicTags[1] || 'market dynamics'} is
                    crucial for informed financial decision-making in the current economic environment."
                  </div>
                  <p>
                    Risk signals to note: {selectedArticle.riskSignals.join(', ')}. Our Super Agent analyzes these
                    factors along with your personal profile to deliver tailored recommendations.
                  </p>
                </div>

                {/* Topic tags */}
                <div className="mt-8 pt-4 border-t flex flex-wrap gap-2">
                  {selectedArticle.topicTags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-20">
                <Sparkles size={48} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-400 mb-2">Select a News Article</h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  Click on any news card from the left panel. The Super Agent will dynamically
                  tune its recommendations based on the article context and your selected persona.
                </p>
              </div>
            )}
          </main>

          {/* ── FLOATING CHAT WIDGET ── */}
          <div className="fixed bottom-6 right-6 z-50">
            {!isOpen ? (
              <button
                onClick={() => setIsOpen(true)}
                className="bg-primary hover:bg-red-600 text-white rounded-full p-4 shadow-xl flex items-center gap-3 transition-transform hover:scale-105"
              >
                <Bot size={28} />
                <span className="font-semibold px-1">ET Super Agent</span>
                {activeContext && (
                  <span className="w-3 h-3 bg-green-400 rounded-full live-dot absolute -top-1 -right-1 border-2 border-white" />
                )}
              </button>
            ) : (
              <div className="bg-white w-[480px] shadow-2xl rounded-2xl overflow-hidden flex flex-col border border-gray-200" style={{ height: '680px' }}>
                {/* WIDGET HEADER */}
                <div className="bg-primary text-white p-4 flex justify-between items-center z-10">
                  <div className="flex items-center gap-3">
                    <Bot size={24} />
                    <div>
                      <h3 className="font-bold text-lg">ET Super Agent</h3>
                      {welcomeBackName && (
                        <p className="text-[11px] text-red-100">Welcome back, {welcomeBackName}!</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveCurrentProfile}
                      disabled={!sessionId || profileSaving}
                      className="hover:bg-red-600 p-1 rounded text-[11px] font-semibold px-2 disabled:opacity-50"
                      title="Save Profile"
                    >
                      {profileSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setIsMuted(!isMuted);
                        if (!isMuted) window.speechSynthesis.cancel();
                      }}
                      className="hover:bg-red-600 p-1 rounded"
                      title={isMuted ? "Unmute Voice" : "Mute Voice"}
                    >
                      {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="hover:bg-red-600 p-1 rounded" title="Close">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Profile</div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                    <span className="bg-slate-800 border border-slate-600 px-2 py-0.5 rounded-full">{activeProfileSummary.name}</span>
                    {activeProfileSummary.riskPreference && (
                      <span className="bg-emerald-800/70 border border-emerald-600 px-2 py-0.5 rounded-full">Risk: {toTitleCase(activeProfileSummary.riskPreference)}</span>
                    )}
                    {activeProfileSummary.topGoal && (
                      <span className="bg-indigo-800/70 border border-indigo-600 px-2 py-0.5 rounded-full">Goal: {toTitleCase(activeProfileSummary.topGoal)}</span>
                    )}
                    {activeProfileSummary.incomeRange && (
                      <span className="bg-amber-800/70 border border-amber-600 px-2 py-0.5 rounded-full">Income: {activeProfileSummary.incomeRange}</span>
                    )}
                  </div>
                </div>

                {/* ACTIVE CONTEXT BADGE */}
                {activeContext && (
                  <div className="context-badge bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5 border-b border-blue-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 bg-green-500 rounded-full live-dot shrink-0" />
                      <span className="font-semibold text-blue-900">
                        {activeContext.userName}
                      </span>
                      <ArrowRight size={10} className="text-blue-400" />
                      <span className="text-blue-700 truncate max-w-[220px]" title={activeContext.articleHeadline}>
                        {activeContext.articleHeadline}
                      </span>
                    </div>
                    <span className="text-[10px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                      v{contextVersion}
                    </span>
                  </div>
                )}

                {/* CHAT THREAD */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3 rounded-2xl max-w-[85%] ${msg.role === 'user' ? 'bg-black text-white rounded-br-none' : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'}`}>
                        <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>

                      {/* RECOMMENDATION CARDS */}
                      {msg.cards && msg.cards.length > 0 && (
                        <div className="mt-3 w-[90%] space-y-3">
                          {msg.cards.map((card, idx) => (
                            <div key={idx} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-primary border border-primary/30 bg-red-50 px-2 py-1 rounded">
                                  {card.type}
                                </span>
                              </div>
                              <h4 className="font-bold text-gray-900 mb-2 leading-tight">{card.title}</h4>
                              <p className="text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded border border-gray-100 flex gap-2 items-start">
                                <Bot size={14} className="mt-0.5 text-blue-500 shrink-0" />
                                <span>{card.why}</span>
                              </p>
                              {card.toolAction ? (
                                <button
                                  onClick={() => handleToolCtaClick(card)}
                                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {card.cta} <ExternalLink size={14} />
                                </button>
                              ) : (
                                <a href={card.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                  {card.cta} <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                          ))}
                          {msg.cards.some(c => c.type === 'product') && (
                            <button
                              onClick={() => handleCompare('personal-loans')}
                              className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-sm transition-all"
                            >
                              <Zap size={16} />
                              Deep Compare Top Matches
                            </button>
                          )}
                        </div>
                      )}

                      {/* COMPARE DATA UI */}
                      {msg.compareData && (
                        <div className="mt-3 w-[95%] space-y-4">
                          {msg.compareData.recommendations.map((item, idx) => (
                            <div key={idx} className="bg-white border-2 border-indigo-100 rounded-xl p-4 shadow-md relative overflow-hidden">
                              {idx === 0 && (
                                <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                  TOP MATCH
                                </div>
                              )}
                              <div className="mb-2 flex items-center gap-2">
                                {item.eligibilityStatus && (
                                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${item.eligibilityStatus === 'eligible' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {item.eligibilityStatus}
                                  </span>
                                )}
                                {typeof item.matchScore === 'number' && (
                                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-indigo-100 text-indigo-800">
                                    Score {Math.round(item.matchScore)}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-indigo-900 pb-2 border-b border-indigo-50 mb-3 pr-16">{item.title}</h4>
                              <p className="text-xs text-gray-700 mb-3 italic bg-indigo-50 p-2 rounded">
                                "{item.reason}"
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <div className="flex items-center gap-1 text-green-700 font-semibold mb-1">
                                    <CheckCircle2 size={12} /> Pros
                                  </div>
                                  <ul className="pl-3 list-disc text-gray-600 space-y-1">
                                    {item.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                                  </ul>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1 text-red-700 font-semibold mb-1">
                                    <XCircle size={12} /> Cons
                                  </div>
                                  <ul className="pl-3 list-disc text-gray-600 space-y-1">
                                    {item.cons.map((con, i) => <li key={i}>{con}</li>)}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* TRACEABILITY METADATA */}
                      {msg.orchestrationData && (
                        <TraceabilityDrawer
                          data={msg.orchestrationData}
                          selectedArticleId={activeContext?.articleId}
                          contextVersion={contextVersion}
                        />
                      )}
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex items-start">
                      <div className="bg-white border p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <div className="text-xs text-gray-500 font-medium">Thinking with your context and profile...</div>
                      </div>
                    </div>
                  )}

                  {lastChatError && !isLoading && (
                    <div className="flex items-start">
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl rounded-bl-none shadow-sm max-w-[90%]">
                        <div className="flex items-start gap-2 text-xs text-amber-900">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <div>
                            <div className="font-semibold">Message failed to send</div>
                            <div className="text-amber-700 mt-0.5">{lastChatError.detail}</div>
                            <button
                              onClick={retryFailedMessage}
                              className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded-md font-semibold"
                            >
                              <RotateCcw size={12} /> Retry Last Message
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Context switching indicator */}
                  {contextSwitching && (
                    <div className="flex items-start">
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2 text-xs text-blue-700">
                        <Activity size={14} className="animate-spin" />
                        Switching context...
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA */}
                <form onSubmit={(e) => handleSend(e)} className="p-3 border-t bg-white flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`p-2 rounded-xl transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    title="Voice Input"
                  >
                    {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  <input
                    type="text"
                    placeholder={activeContext ? `Ask about ${activeContext.articleHeadline.split(':')[0]}...` : "Select an article to start..."}
                    className="flex-1 bg-gray-100 p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="bg-black hover:bg-gray-800 text-white rounded-xl p-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Send Request"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── VALIDATION PANEL MODAL ── */}
      {showValidation && (
        <ValidationPanel
          report={validationReport}
          running={validationRunning}
          onClose={() => setShowValidation(false)}
          onRerun={runValidation}
        />
      )}

      {activeToolAction && sessionId && (
        <ToolActionModal
          sessionId={sessionId}
          action={activeToolAction.action}
          title={activeToolAction.title}
          onClose={() => setActiveToolAction(null)}
          onResult={handleToolResult}
        />
      )}
    </div>
  );
}

// ─── Traceability Drawer Component ──────────────────────
function TraceabilityDrawer({
  data,
  selectedArticleId,
  contextVersion,
}: {
  data: any;
  selectedArticleId?: string;
  contextVersion: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-[85%] mt-2 border border-blue-200 bg-blue-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 text-xs font-semibold text-blue-800 flex justify-between items-center"
      >
        <div className="flex items-center gap-2">
          <Cpu size={14} /> Agent Traceability Drawer
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 text-[11px] text-gray-700 font-mono space-y-2 border-t border-blue-100">
          {/* Context Info */}
          {selectedArticleId && (
            <div className="bg-blue-100 rounded px-2 py-1.5 mb-2">
              <div>
                <strong className="text-blue-900">Selected Article ID:</strong>{' '}
                <span className="text-blue-700 font-bold">{selectedArticleId}</span>
              </div>
              <div>
                <strong className="text-blue-900">Context Version:</strong>{' '}
                <span className="text-blue-700 font-bold">v{contextVersion}</span>
              </div>
            </div>
          )}

          <div>
            <strong className="text-gray-900">Gap Label:</strong>{' '}
            <span className="text-pink-700 font-bold">{data.gapDetection?.label || 'None'}</span>
          </div>
          {data.gapDetection?.strategy?.recommendationFocus && (
            <div>
              <strong className="text-gray-900">Strategy:</strong>{' '}
              <span className="text-purple-700">{data.gapDetection.strategy.recommendationFocus.join(' > ')}</span>
            </div>
          )}
          <div>
            <strong className="text-gray-900">Cross-Sell:</strong>{' '}
            {data.crossSell?.triggered ? (
              <span className="bg-green-200 text-green-800 px-1 py-0.5 rounded">TRIGGERED</span>
            ) : (
              <span className="text-gray-500">OFF</span>
            )}
          </div>
          {data.crossSell?.reason && (
            <div className="text-gray-500 italic">└ {data.crossSell.reason}</div>
          )}
          <div>
            <strong className="text-gray-900">Visited Nodes:</strong>
            <div className="mt-1 flex flex-wrap gap-1">
              {data.visitedNodes.map((node: string, i: number) => (
                <span key={i} className="bg-gray-200 px-1 py-0.5 rounded text-[10px]">{node}</span>
              ))}
            </div>
          </div>

          {/* Scenario Assessment */}
          {data.scenarioAssessment && (
            <div className="mt-2 pt-2 border-t border-blue-100">
              <strong className="text-gray-900">Scenario:</strong>{' '}
              <span className={`font-bold ${data.scenarioAssessment.category === 'known' ? 'text-green-700' :
                data.scenarioAssessment.category === 'ambiguous' ? 'text-yellow-700' :
                  'text-red-700'
                }`}>
                {data.scenarioAssessment.category}
              </span>
              <span className="text-gray-400 ml-1">
                ({(data.scenarioAssessment.confidence * 100).toFixed(0)}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Validation Panel Component ──────────────────────────
function ValidationPanel({
  report,
  running,
  onClose,
  onRerun,
}: {
  report: any;
  running: boolean;
  onClose: () => void;
  onRerun: () => void;
}) {
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FlaskConical size={22} />
            <div>
              <h2 className="font-bold text-lg">Phase 5 — Validation Scenarios</h2>
              <p className="text-violet-200 text-xs">Proving true context awareness is real and deterministic</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRerun}
              disabled={running}
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all"
            >
              <Activity size={14} className={running ? 'animate-spin' : ''} />
              {running ? 'Running...' : 'Re-Run'}
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {running && !report && (
            <div className="text-center py-16">
              <Activity size={40} className="mx-auto text-indigo-400 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Running all 4 validation scenarios...</p>
              <p className="text-gray-400 text-sm mt-1">This exercises the full LangGraph pipeline for each test case</p>
            </div>
          )}

          {report && (
            <>
              {/* Summary Bar */}
              <div className="flex items-center gap-4 mb-6 p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-gray-900">{report.passed}/{report.totalScenarios}</span>
                  <span className="text-sm text-gray-500">passed</span>
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${report.failed === 0
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                        : 'bg-gradient-to-r from-yellow-400 to-orange-500'
                      }`}
                    style={{ width: `${(report.passed / report.totalScenarios) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  {new Date(report.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Scenario Cards */}
              <div className="space-y-4">
                {report.scenarios.map((scenario: any) => (
                  <div
                    key={scenario.scenarioId}
                    className={`border-2 rounded-xl overflow-hidden transition-all ${scenario.passed
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-red-200 bg-red-50/50'
                      }`}
                  >
                    {/* Scenario Header */}
                    <div
                      className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/50 transition-colors"
                      onClick={() => setExpandedScenario(
                        expandedScenario === scenario.scenarioId ? null : scenario.scenarioId
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {scenario.passed ? (
                          <CheckCircle2 size={22} className="text-green-600 shrink-0" />
                        ) : (
                          <XCircle size={22} className="text-red-600 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-sm">
                            [{scenario.scenarioId}] {scenario.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {scenario.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold uppercase px-2 py-1 rounded-full ${scenario.passed
                            ? 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                          }`}>
                          {scenario.passed ? 'PASS' : 'FAIL'}
                        </span>
                        {expandedScenario === scenario.scenarioId
                          ? <ChevronUp size={16} className="text-gray-400" />
                          : <ChevronDown size={16} className="text-gray-400" />
                        }
                      </div>
                    </div>

                    {/* Evidence Details */}
                    {expandedScenario === scenario.scenarioId && (
                      <div className="px-5 pb-4 border-t border-gray-100">
                        {scenario.error && (
                          <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-lg text-xs text-red-800 font-mono">
                            Error: {scenario.error}
                          </div>
                        )}
                        <div className="mt-3">
                          <div className="text-[11px] font-bold uppercase text-gray-400 mb-2">Evidence</div>
                          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-[11px] overflow-x-auto font-mono leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                            {JSON.stringify(scenario.evidence, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolActionModal({
  sessionId,
  action,
  title,
  onClose,
  onResult,
}: {
  sessionId: string;
  action: "risk-profiler" | "goal-planner" | "fund-screener" | "spend-analyzer";
  title: string;
  onClose: () => void;
  onResult: (summary: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [riskStep, setRiskStep] = useState(0);

  const [riskForm, setRiskForm] = useState({
    investmentHorizon: '5_10y',
    lossTolerance: 'moderate',
    incomeStability: 'stable',
    savingsRatePercent: 20,
    ageBracket: '26_35',
  });

  const [goalForm, setGoalForm] = useState({
    targetGoal: 'wealth_creation',
    targetAmount: 3000000,
    timeHorizonMonths: 84,
    currentSavings: 300000,
  });

  const [fundForm, setFundForm] = useState({
    riskProfile: 'medium',
    focusTags: 'bluechip,safe-returns',
    limit: 5,
  });

  const [spendForm, setSpendForm] = useState({
    monthlyIncome: 120000,
    rent: 30000,
    emis: 18000,
    discretionarySpend: 22000,
  });

  const [riskResult, setRiskResult] = useState<any>(null);
  const [goalResult, setGoalResult] = useState<any>(null);
  const [fundResults, setFundResults] = useState<any[]>([]);
  const [spendResult, setSpendResult] = useState<any>(null);

  const riskSteps = [
    {
      title: 'Investment Horizon',
      body: (
        <select value={riskForm.investmentHorizon} onChange={(e) => setRiskForm({ ...riskForm, investmentHorizon: e.target.value })} className="w-full mt-2 border rounded px-3 py-2">
          <option value="lt_3y">Less than 3 years</option>
          <option value="3_5y">3 to 5 years</option>
          <option value="5_10y">5 to 10 years</option>
          <option value="gt_10y">More than 10 years</option>
        </select>
      ),
    },
    {
      title: 'Loss Tolerance',
      body: (
        <select value={riskForm.lossTolerance} onChange={(e) => setRiskForm({ ...riskForm, lossTolerance: e.target.value })} className="w-full mt-2 border rounded px-3 py-2">
          <option value="none">None</option>
          <option value="small">Small</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
        </select>
      ),
    },
    {
      title: 'Income Stability',
      body: (
        <select value={riskForm.incomeStability} onChange={(e) => setRiskForm({ ...riskForm, incomeStability: e.target.value })} className="w-full mt-2 border rounded px-3 py-2">
          <option value="unstable">Unstable</option>
          <option value="variable">Variable</option>
          <option value="stable">Stable</option>
          <option value="very_stable">Very stable</option>
        </select>
      ),
    },
    {
      title: 'Savings Rate',
      body: (
        <div className="mt-2">
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={riskForm.savingsRatePercent}
            onChange={(e) => setRiskForm({ ...riskForm, savingsRatePercent: Number(e.target.value) })}
            className="w-full"
          />
          <div className="text-xs text-gray-600 mt-1">{riskForm.savingsRatePercent}% of monthly income saved</div>
        </div>
      ),
    },
    {
      title: 'Age Bracket',
      body: (
        <select value={riskForm.ageBracket} onChange={(e) => setRiskForm({ ...riskForm, ageBracket: e.target.value })} className="w-full mt-2 border rounded px-3 py-2">
          <option value="18_25">18 to 25</option>
          <option value="26_35">26 to 35</option>
          <option value="36_50">36 to 50</option>
          <option value="gt_50">Above 50</option>
        </select>
      ),
    },
  ];

  const submit = async () => {
    setSubmitting(true);
    setToolError(null);
    try {
      if (action === 'risk-profiler') {
        const res = await axios.post('/api/tools/risk-profiler', {
          sessionId,
          answers: {
            ...riskForm,
            savingsRatePercent: Number(riskForm.savingsRatePercent),
          },
          persistToProfile: true,
        });
        setRiskResult(res.data);
        onResult(`Risk Profiler complete: score ${res.data.riskScore}/10 (${res.data.riskLabel}). Suggested allocation is ${res.data.suggestedAllocation.equity}% equity, ${res.data.suggestedAllocation.debt}% debt, ${res.data.suggestedAllocation.cash}% cash.`);
      }

      if (action === 'goal-planner') {
        const res = await axios.post('/api/tools/goal-planner', {
          sessionId,
          input: {
            ...goalForm,
            targetAmount: Number(goalForm.targetAmount),
            timeHorizonMonths: Number(goalForm.timeHorizonMonths),
            currentSavings: Number(goalForm.currentSavings),
          },
          persistToProfile: true,
        });
        setGoalResult(res.data);
        onResult(`Goal Planner complete: monthly target is Rs ${Number(res.data.monthlyTarget).toLocaleString('en-IN')} for ${res.data.timeline.years} years with suggested allocation ${res.data.allocation.equity}/${res.data.allocation.debt}/${res.data.allocation.cash}.`);
      }

      if (action === 'fund-screener') {
        const res = await axios.post('/api/tools/fund-screener', {
          sessionId,
          input: {
            riskProfile: fundForm.riskProfile,
            focusTags: fundForm.focusTags.split(',').map((tag) => tag.trim()).filter(Boolean),
            limit: Number(fundForm.limit),
          },
          persistToProfile: true,
        });
        setFundResults(res.data.results ?? []);

        const topTitles = (res.data.results ?? []).slice(0, 3).map((item: any) => item.title).join(', ');
        onResult(`Fund Screener complete for ${res.data.userRiskProfile} risk profile. Top matches: ${topTitles || 'No funds matched'} .`);
      }

      if (action === 'spend-analyzer') {
        const res = await axios.post('/api/tools/spend-analyzer', {
          sessionId,
          input: {
            monthlyIncome: Number(spendForm.monthlyIncome),
            rent: Number(spendForm.rent),
            emis: Number(spendForm.emis),
            discretionarySpend: Number(spendForm.discretionarySpend),
          },
          persistToProfile: true,
        });
        setSpendResult(res.data);
        onResult(`Spend Analyzer complete: savings rate ${res.data.savingsRate}%, debt ratio ${res.data.debtRatio}%, financial health score ${res.data.healthScore}/100.`);
      }

      if (action !== 'fund-screener') {
        onClose();
      }
    } catch (err) {
      console.error('Tool action failed:', err);
      const detail = axios.isAxiosError(err)
        ? err.response?.data?.error ?? err.message
        : 'Unknown tool error';
      setToolError(String(detail));
      onResult('Tool execution failed. Please review inputs and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {action === 'risk-profiler' && (
            <div className="rounded-xl border border-gray-200 p-4 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-slate-900">Step {riskStep + 1} of {riskSteps.length}</h4>
                <div className="text-xs text-slate-500">5-question risk quiz</div>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${((riskStep + 1) / riskSteps.length) * 100}%` }} />
              </div>
              <div className="text-sm font-semibold text-slate-800">{riskSteps[riskStep].title}</div>
              {riskSteps[riskStep].body}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setRiskStep((prev) => Math.max(0, prev - 1))}
                  disabled={riskStep === 0}
                  className="px-3 py-1.5 rounded border border-gray-300 text-xs font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setRiskStep((prev) => Math.min(riskSteps.length - 1, prev + 1))}
                  disabled={riskStep === riskSteps.length - 1}
                  className="px-3 py-1.5 rounded bg-slate-800 text-white text-xs font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {action === 'goal-planner' && (
            <>
              <label className="block text-sm font-medium">Target Goal
                <input value={goalForm.targetGoal} onChange={(e) => setGoalForm({ ...goalForm, targetGoal: e.target.value })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>
              <label className="block text-sm font-medium">Target Amount: Rs {goalForm.targetAmount.toLocaleString('en-IN')}
                <input type="range" min={100000} max={20000000} step={100000} value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: Number(e.target.value) })} className="w-full mt-2" />
              </label>
              <label className="block text-sm font-medium">Time Horizon: {goalForm.timeHorizonMonths} months
                <input type="range" min={12} max={360} step={6} value={goalForm.timeHorizonMonths} onChange={(e) => setGoalForm({ ...goalForm, timeHorizonMonths: Number(e.target.value) })} className="w-full mt-2" />
              </label>
              <label className="block text-sm font-medium">Current Savings
                <input type="number" value={goalForm.currentSavings} onChange={(e) => setGoalForm({ ...goalForm, currentSavings: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>

              {goalResult && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                  <div className="font-bold">Projection Snapshot</div>
                  <div className="mt-1">Monthly Target: Rs {Number(goalResult.monthlyTarget).toLocaleString('en-IN')}</div>
                  <div>Allocation: {goalResult.allocation?.equity}/{goalResult.allocation?.debt}/{goalResult.allocation?.cash}</div>
                </div>
              )}
            </>
          )}

          {action === 'fund-screener' && (
            <>
              <label className="block text-sm">Risk Profile
                <select value={fundForm.riskProfile} onChange={(e) => setFundForm({ ...fundForm, riskProfile: e.target.value })} className="w-full mt-1 border rounded px-2 py-2">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="block text-sm">Focus Tags (comma separated)
                <input value={fundForm.focusTags} onChange={(e) => setFundForm({ ...fundForm, focusTags: e.target.value })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>
              <label className="block text-sm">Results Limit
                <input type="number" min={1} max={10} value={fundForm.limit} onChange={(e) => setFundForm({ ...fundForm, limit: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>

              {fundResults.length > 0 && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                  {fundResults.map((item: any) => (
                    <div key={item.productId} className="border rounded-lg p-2.5 bg-white shadow-sm">
                      <div className="text-xs font-bold text-gray-900 leading-tight">{item.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-full font-semibold ${item.eligibilityStatus === 'eligible' ? 'bg-green-100 text-green-700' : item.eligibilityStatus === 'borderline' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{item.eligibilityStatus}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{Math.round(item.matchScore)} score</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">{item.eligibilityNote}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {action === 'spend-analyzer' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">Monthly Income
                <input type="number" value={spendForm.monthlyIncome} onChange={(e) => setSpendForm({ ...spendForm, monthlyIncome: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>
              <label className="block text-sm">Rent
                <input type="number" value={spendForm.rent} onChange={(e) => setSpendForm({ ...spendForm, rent: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>
              <label className="block text-sm">EMIs
                <input type="number" value={spendForm.emis} onChange={(e) => setSpendForm({ ...spendForm, emis: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>
              <label className="block text-sm">Discretionary Spend
                <input type="number" value={spendForm.discretionarySpend} onChange={(e) => setSpendForm({ ...spendForm, discretionarySpend: Number(e.target.value) })} className="w-full mt-1 border rounded px-2 py-2" />
              </label>

              {spendResult && (
                <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                  <div className="font-bold">Spending Health Summary</div>
                  <div className="mt-1">Savings Rate: {spendResult.savingsRate}%</div>
                  <div>Debt Ratio: {spendResult.debtRatio}%</div>
                  <div>Health Score: {spendResult.healthScore}/100</div>
                </div>
              )}
            </div>
          )}

          {riskResult && action === 'risk-profiler' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900">
              <div className="font-bold">Risk Profile Result</div>
              <div className="mt-1">Score: {riskResult.riskScore}/10 ({riskResult.riskLabel})</div>
              <div>Allocation: {riskResult.suggestedAllocation?.equity}% / {riskResult.suggestedAllocation?.debt}% / {riskResult.suggestedAllocation?.cash}%</div>
            </div>
          )}

          {toolError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
              {toolError}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-gray-700">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
            {submitting ? 'Running...' : 'Run Tool'}
          </button>
        </div>
      </div>
    </div>
  );
}
