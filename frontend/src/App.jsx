import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Play, Settings, History, Layers, ChevronDown, ChevronUp, 
  ExternalLink, ShieldCheck, Download, 
  CheckCircle, AlertCircle, Plus, X, RefreshCw,
  Sun, Moon, Menu
} from 'lucide-react';

const API_BASE = window.location.port === "5173" ? "http://127.0.0.1:8000" : "";
const OWNER_USER_ID = "swaraj_admin";

function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState(true);

  // App core states
  const [question, setQuestion] = useState("");
  const [customPlan, setCustomPlan] = useState([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isResearching, setIsResearching] = useState(false);

  // Mobile responsive states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState("brief");

  // Collapse sidebar on small screens initially
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Sync theme to root element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);
  
  // Pipeline Visualizer states
  const [currentStage, setCurrentStage] = useState("idle"); // idle, plan, search, draft, verify, complete
  const [researchLogs, setResearchLogs] = useState([]);
  
  // Active research result states
  const [result, setResult] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [memoryStatus, setMemoryStatus] = useState(null);
  
  // Sidebar / Session History
  const [sessions, setSessions] = useState([]);
  
  // Ingestion Drawer state
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestType, setIngestType] = useState("pdf"); // pdf, url, note
  const [ingestFile, setIngestFile] = useState(null);
  const [ingestUrlStr, setIngestUrlStr] = useState("");
  const [ingestTextTitle, setIngestTextTitle] = useState("");
  const [ingestTextBody, setIngestTextBody] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState(null);
  
  // Vector Database state
  const [memoryCount, setMemoryCount] = useState(0);
  
  // Settings Panel drawer
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    llm_provider: "openrouter",
    model: "openrouter/free",
    collection_name: "aria_research_memory",
    memory_path: ".aria_chroma_db",
    key_configured: false
  });
  
  // Settings controls
  const [useLocal, setUseLocal] = useState(true);
  const [useWeb, setUseWeb] = useState(true);
  const [useFinance, setUseFinance] = useState(false);
  const [maxIterations, setMaxIterations] = useState(2);
  const [fieldFocus, setFieldFocus] = useState("all");
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [topK, setTopK] = useState(5);
  const [userId, setUserId] = useState(() => {
    let id = localStorage.getItem("aria_user_id");
    if (!id) {
      id = "user_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("aria_user_id", id);
    }
    return id;
  });

  const [error, setError] = useState(null);
  const [expandedCitationId, setExpandedCitationId] = useState(null);
  const [activeRightTab, setActiveRightTab] = useState("citations"); // citations, logs, metrics

  const consoleEndRef = useRef(null);

  const sourceCounts = (items = []) => {
    return items.reduce((acc, item) => {
      const key = (item.source_type || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  };

  const citationStats = (currentResult) => {
    const answer = currentResult?.answer || "";
    const evidenceCount = currentResult?.evidence?.length || 0;
    const citations = [...answer.matchAll(/(?<!!)\[(\d+)\]/g)].map(match => Number(match[1]));
    const valid = new Set(citations.filter(number => number >= 1 && number <= evidenceCount));
    const invalid = new Set(citations.filter(number => number < 1 || number > evidenceCount));
    return {
      inline: citations.length,
      citedSources: valid.size,
      uncitedSources: Math.max(0, evidenceCount - valid.size),
      invalid: invalid.size,
      coverage: evidenceCount ? Math.round((valid.size / evidenceCount) * 100) : 0
    };
  };

  // Initialize and load default configs
  useEffect(() => {
    fetchSettings();
    fetchMemoryCount();
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [userId]);

  // Auto scroll research logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [researchLogs]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const fetchMemoryCount = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/memory/count`);
      if (response.ok) {
        const data = await response.json();
        setMemoryCount(data.count);
      }
    } catch (err) {
      console.error("Failed to fetch memory count:", err);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/sessions?user_id=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  const clearMemory = async () => {
    setMemoryStatus(null);
    try {
      const response = await fetch(`${API_BASE}/api/memory/clear?user_id=${encodeURIComponent(userId)}`, { method: "POST" });
      if (response.ok) {
        setMemoryCount(0);
        setMemoryStatus({ type: "success", message: "Local memory and search history cleared." });
        fetchSessions();
      } else {
        throw new Error("Failed to clear local memory.");
      }
    } catch (err) {
      console.error("Failed to clear memory database:", err);
      setMemoryStatus({ type: "error", message: err.message || "Failed to clear local memory." });
    }
  };

  // Generate sub-query plan
  const generatePlan = async () => {
    if (!question.trim()) return;
    setIsPlanning(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/research/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (response.ok) {
        const data = await response.json();
        setCustomPlan(data.queries);
      } else {
        throw new Error("Failed to generate research plan");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPlanning(false);
    }
  };

  // Run the full agentic research loop (SSE Stream)
  const runResearch = async () => {
    if (!question.trim()) return;
    
    setIsResearching(true);
    setResult(null);
    setError(null);
    setCurrentStage("plan");
    setResearchLogs(["Initializing ARIA Research Workspace..."]);
    
    try {
      const response = await fetch(`${API_BASE}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          use_local: useLocal,
          use_web: useWeb,
          use_finance: useFinance,
          max_iterations: maxIterations,
          custom_plan: customPlan.length > 0 ? customPlan : null,
          field_focus: fieldFocus,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned error code ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 2);

          let eventType = "message";
          let eventData = "";

          const lines = message.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.substring(5).trim();
            }
          }

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
              
              if (eventType === "init") {
                setResearchLogs(prev => [...prev, `[System] > ${parsed.message}`]);
              } else if (eventType === "stage_complete") {
                const { stage, elapsed, events } = parsed;
                setCurrentStage(stage === "verify" ? "verify" : stage);
                if (events && events.length > 0) {
                  setResearchLogs(prev => [...prev, ...events.map(ev => `[ARIA] > ${ev}`)]);
                }
                setResearchLogs(prev => [...prev, `[System] > Timeline: ${stage} completed in ${elapsed}s`]);
              } else if (eventType === "result") {
                setCurrentStage("complete");
                setResult(parsed.result);
                setSelectedSessionId(parsed.session_id);
                fetchSessions();
                fetchMemoryCount();
              } else if (eventType === "error") {
                setError(parsed.error);
                setCurrentStage("idle");
              }
            } catch (err) {
              console.error("Failed to parse stream event:", err);
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      setError(err.message);
      setCurrentStage("idle");
    } finally {
      setIsResearching(false);
    }
  };

  // Load past session
  const loadSessionDetails = async (sessionId) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        setResult(data.result);
        setQuestion(data.result.question);
        setCustomPlan(data.result.plan);
        setSelectedSessionId(sessionId);
        setCurrentStage("complete");
        setActiveRightTab("citations");
      } else {
        throw new Error("Failed to load session details.");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle ingestion forms
  const handleIngest = async (e) => {
    e.preventDefault();
    setIsIngesting(true);
    setIngestMessage(null);

    try {
      let response;
      if (ingestType === "pdf") {
        if (!ingestFile) throw new Error("Please select a PDF file.");
        const formData = new FormData();
        formData.append("file", ingestFile);
        response = await fetch(`${API_BASE}/api/ingest/pdf`, {
          method: "POST",
          body: formData
        });
      } else if (ingestType === "url") {
        if (!ingestUrlStr) throw new Error("Please enter a valid HTTP/HTTPS URL.");
        response = await fetch(`${API_BASE}/api/ingest/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: ingestUrlStr })
        });
      } else {
        if (!ingestTextBody.trim()) throw new Error("Please paste text content to index.");
        response = await fetch(`${API_BASE}/api/ingest/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: ingestTextBody,
            source_name: ingestTextTitle || "Manual note",
            source_type: "note"
          })
        });
      }

      const data = await response.json();
      if (response.ok) {
        setIngestMessage({ type: "success", text: `${data.message} (${data.chunks} chunks indexed)` });
        setIngestFile(null);
        setIngestUrlStr("");
        setIngestTextTitle("");
        setIngestTextBody("");
        fetchMemoryCount();
      } else {
        throw new Error(data.detail || "Ingestion failed.");
      }
    } catch (err) {
      setIngestMessage({ type: "error", text: err.message });
    } finally {
      setIsIngesting(false);
    }
  };

  const addPlanQuery = () => {
    setCustomPlan([...customPlan, ""]);
  };

  const removePlanQuery = (index) => {
    setCustomPlan(customPlan.filter((_, i) => i !== index));
  };

  const updatePlanQuery = (index, val) => {
    const updated = [...customPlan];
    updated[index] = val;
    setCustomPlan(updated);
  };

  const downloadReport = (format) => {
    if (!selectedSessionId) {
      setError("No saved research session is selected for download.");
      return;
    }

    setError(null);
    try {
      const url = `${API_BASE}/api/sessions/${selectedSessionId}/download/${format}?user_id=${encodeURIComponent(userId)}`;
      window.open(url, "_blank");
    } catch (err) {
      setError(err.message || `Failed to download ${format.toUpperCase()} report.`);
    }
  };

  const analyticsCounts = result ? sourceCounts(result.evidence || []) : {};
  const analyticsTypes = Object.entries(analyticsCounts).sort((a, b) => b[1] - a[1]);
  const analyticsCitations = citationStats(result);
  const topEvidence = result
    ? [...(result.evidence || [])].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5)
    : [];

  return (
    <div className="flex h-screen overflow-hidden bg-aria-bg text-aria-text font-sans antialiased">
      
      {/* Backdrop overlay for mobile sidebar drawer */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-aria-bg/60 backdrop-blur-sm md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 1. LEFT SIDEBAR: Responsive drawer / sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-aria-border flex flex-col bg-aria-surface select-none transition-all duration-300 ease-in-out md:relative md:z-auto ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:-ml-64"
      }`}>
        
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-aria-border">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs tracking-wider uppercase text-aria-text">A R I A</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-aria-border text-aria-muted font-mono font-medium">v1.2</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-1 rounded text-aria-muted hover:text-aria-text transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 rounded text-aria-muted hover:text-aria-text transition-colors"
              title="Settings"
            >
              <Settings size={14} />
            </button>

            {/* Close / Collapse button */}
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 rounded text-aria-muted hover:text-aria-text transition-colors ml-0.5"
              title="Collapse Sidebar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Database Quick Stats */}
        <div className="px-4 py-2 border-b border-aria-border flex justify-between items-center text-[10px] text-aria-muted bg-aria-surface/20">
          <span>Knowledge Base</span>
          <span className="font-mono text-aria-accent">{memoryCount} chunks</span>
        </div>

        {/* Navigation / Actions */}
        <div className="p-3 border-b border-aria-border space-y-2">
          <button
            onClick={() => {
              setResult(null);
              setQuestion("");
              setCustomPlan([]);
              setSelectedSessionId(null);
              setCurrentStage("idle");
            }}
            className="w-full py-1.5 px-3 bg-aria-surface hover:bg-aria-border border border-aria-border text-aria-text text-xs rounded font-medium transition-colors flex items-center justify-between"
          >
            <span>New Research Loop</span>
            <Plus size={13} className="text-aria-muted" />
          </button>

          <button
            onClick={() => setShowIngestModal(true)}
            className="w-full py-1.5 px-3 hover:bg-aria-surface text-aria-muted hover:text-aria-text text-xs rounded font-medium transition-colors flex items-center gap-2 border border-transparent hover:border-aria-border"
          >
            <Layers size={13} />
            <span>Manage Sources</span>
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <h3 className="text-[10px] font-semibold text-aria-muted uppercase tracking-wider mb-2 px-2 flex items-center gap-1.5">
              <History size={11} />
              Recent Queries
            </h3>
            
            {sessions.length === 0 ? (
              <p className="text-[11px] text-aria-muted/50 italic p-3 text-center">
                No past queries
              </p>
            ) : (
              <div className="space-y-0.5">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSessionDetails(s.id)}
                    className={`w-full text-left py-2 px-2.5 rounded text-[11px] transition-all truncate border-l-2 ${
                      selectedSessionId === s.id
                        ? "bg-aria-surface text-aria-accent border-aria-accent font-medium"
                        : "border-transparent text-aria-muted hover:bg-aria-surface/50 hover:text-aria-text"
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Database Ingestion Status Footer */}
        <div className="p-3 border-t border-aria-border space-y-2 text-[10px]">
          {memoryStatus && (
            <div
              className={`rounded border px-2 py-1.5 leading-relaxed ${
                memoryStatus.type === "error"
                  ? "border-aria-error/30 bg-aria-error/10 text-aria-error"
                  : "border-aria-border bg-aria-bg/40 text-aria-muted"
              }`}
            >
              {memoryStatus.message}
            </div>
          )}
          <button 
            onClick={clearMemory}
            className="text-aria-muted hover:text-aria-error transition-colors flex items-center gap-1"
          >
            Clear local memory
          </button>
        </div>
      </aside>

      {/* 2. MAIN RESEARCH CONTAINER */}
      <main className="flex-1 flex flex-col overflow-hidden bg-aria-bg">
        
        {/* TOP MINIMALIST HEADER & PROGRESS TRACKER */}
        <header className="h-14 px-4 md:px-6 border-b border-aria-border flex items-center justify-between bg-aria-bg shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded text-aria-muted hover:text-aria-text transition-colors border border-aria-border bg-aria-surface shrink-0"
              title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="15" 
                height="15" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <span className="text-xs font-semibold tracking-wide text-aria-text uppercase truncate">Research Workspace</span>
          </div>

          {/* Stepper progress visualizer - Sleek horizontal bar */}
          <div className="hidden sm:flex items-center gap-4 text-[10px] shrink-0">
            {[
              { id: "plan", label: "Plan" },
              { id: "search", label: "Retrieve" },
              { id: "draft", label: "Synthesize" },
              { id: "verify", label: "Verify" }
            ].map((stage) => {
              const stagesList = ["plan", "search", "draft", "verify", "complete"];
              const stageIndex = stagesList.indexOf(stage.id);
              const currentStageIndex = stagesList.indexOf(currentStage);
              
              let status = "pending"; // pending, active, complete
              if (currentStage === "complete") {
                status = "complete";
              } else if (currentStageIndex === stageIndex) {
                status = "active";
              } else if (currentStageIndex > stageIndex) {
                status = "complete";
              }

              return (
                <div key={stage.id} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    status === "complete"
                      ? "bg-aria-complete"
                      : status === "active"
                      ? "bg-aria-accent animate-pulse"
                      : "bg-aria-pending"
                  }`} />
                  <span className={`font-medium ${
                    status === "active" ? "text-aria-accent" : status === "complete" ? "text-aria-text" : "text-aria-muted"
                  }`}>{stage.label}</span>
                </div>
              );
            })}
          </div>
        </header>

        {/* Mobile Workspace Tabs Selector */}
        {result && !isResearching && (
          <div className="flex border-b border-aria-border bg-aria-surface/30 md:hidden shrink-0">
            <button
              onClick={() => setMobileActiveTab("brief")}
              className={`flex-1 py-3 text-center text-xs font-semibold transition-colors border-b-2 ${
                mobileActiveTab === "brief"
                  ? "border-aria-accent text-aria-accent"
                  : "border-transparent text-aria-muted hover:text-aria-text"
              }`}
            >
              Executive Brief
            </button>
            <button
              onClick={() => setMobileActiveTab("details")}
              className={`flex-1 py-3 text-center text-xs font-semibold transition-colors border-b-2 ${
                mobileActiveTab === "details"
                  ? "border-aria-accent text-aria-accent"
                  : "border-transparent text-aria-muted hover:text-aria-text"
              }`}
            >
              References & Logs
            </button>
          </div>
        )}

        {/* WORKSPACE MIDDLE BODY - Splits into Left Brief Panel and Right Citations/Logs Panel */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT PANEL: Chat objectives & synthesized results */}
          <div className={`flex-1 flex flex-col overflow-y-auto border-r border-aria-border ${
            result && !isResearching && mobileActiveTab !== "brief" ? "hidden md:flex" : "flex"
          }`}>
            <div className="flex-1 p-6 space-y-6 w-full">
              
              {/* Errors container */}
              {error && (
                <div className="p-4 bg-aria-error/15 text-aria-error border border-aria-error/25 rounded-lg text-xs flex gap-2 items-start">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1 text-aria-text">Research Error</h4>
                    <p className="opacity-90 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              {/* Blank state */}
              {!result && !isResearching && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-20">
                  <div className="w-10 h-10 rounded-lg bg-aria-surface border border-aria-border flex items-center justify-center text-aria-muted">
                    <Search size={18} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-aria-text">Ask ARIA anything</h2>
                    <p className="text-xs text-aria-muted leading-relaxed max-w-sm">
                      Provide a research task or objective. ARIA will decompose it, query sources, synthesize findings, and check for accuracy.
                    </p>
                  </div>
                </div>
              )}

              {/* Live research console logs */}
              {isResearching && (
                <div className="flex-1 flex flex-col bg-aria-bg border border-aria-border p-5 rounded-xl font-mono text-[11px] text-aria-muted shadow-lg h-96 overflow-hidden">
                  <div className="flex justify-between items-center border-b border-aria-border pb-3 mb-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-aria-accent animate-ping"></span>
                      <span className="text-[10px] text-aria-accent font-semibold uppercase tracking-wider">Researching Live...</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 scroll-smooth">
                    {researchLogs.map((log, idx) => {
                      let colorClass = "text-aria-muted";
                      if (log.includes("[System]")) colorClass = "text-aria-accent font-semibold";
                      else if (log.includes("Synthesis:")) colorClass = "text-aria-complete";
                      else if (log.includes("Auditor:")) colorClass = "text-aria-accent";

                      return (
                        <div key={idx} className={colorClass}>
                          {log}
                        </div>
                      );
                    })}
                    <div ref={consoleEndRef} />
                  </div>
                </div>
              )}

              {/* Research synthesized markdown report */}
              {result && !isResearching && (
                <div className="space-y-6">
                  {/* Objective details */}
                  <div className="pb-4 border-b border-aria-border">
                    <span className="text-[9px] font-bold text-aria-muted uppercase tracking-wider block mb-1">Research Question</span>
                    <h2 className="text-sm font-semibold text-aria-text leading-relaxed">{result.question}</h2>
                  </div>

                  {/* Synthesized Brief Content */}
                  <div className="space-y-5">
                    <span className="text-[9px] font-bold text-aria-muted uppercase tracking-wider block">Synthesized Executive Brief</span>
                    <div className="text-aria-muted text-xs leading-relaxed space-y-4 max-w-none prose dark:prose-invert">
                      {result.answer.split('\n\n').map((para, pIdx) => {
                        if (para.startsWith('### ')) {
                          return <h3 key={pIdx} className="text-xs font-semibold text-aria-text pt-2 uppercase tracking-wide">{para.replace('### ', '')}</h3>;
                        }
                        if (para.startsWith('## ')) {
                          return <h2 key={pIdx} className="text-sm font-bold text-aria-accent pt-3">{para.replace('## ', '')}</h2>;
                        }
                        
                        const parts = para.split(/(\[\d+\])/g);
                        return (
                          <p key={pIdx}>
                            {parts.map((part, ptIdx) => {
                              const match = part.match(/^\[(\d+)\]$/);
                              if (match) {
                                const num = parseInt(match[1]);
                                return (
                                  <button 
                                    key={ptIdx}
                                    onClick={() => {
                                      setActiveRightTab("citations");
                                      setExpandedCitationId(num - 1);
                                    }}
                                    className="mx-0.5 px-1 bg-aria-accent/15 hover:bg-aria-accent/30 text-aria-accent rounded text-[10px] font-bold border border-aria-accent/25 transition-colors"
                                  >
                                    [{num}]
                                  </button>
                                );
                              }
                              return part;
                            })}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {/* Verification checklist details */}
                  <div className="p-4 bg-aria-surface border border-aria-border rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs text-aria-accent font-semibold mb-2">
                      <ShieldCheck size={14} />
                      <span>Auditor Grounding Report</span>
                    </div>
                    <pre className="text-[11px] text-aria-muted whitespace-pre-wrap leading-relaxed font-sans">
                      {result.verification}
                    </pre>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* RIGHT PANEL: Sleek Citations, Activity Trace Logs, and Metrics */}
          {result && !isResearching && (
            <div className={`w-full md:w-96 flex flex-col bg-aria-surface overflow-hidden select-none shrink-0 border-l border-aria-border ${
              mobileActiveTab !== "details" ? "hidden md:flex" : "flex"
            }`}>
              
              {/* Tab Navigation header */}
              <div className="h-11 border-b border-aria-border flex bg-aria-bg/50 text-[10px] font-semibold text-aria-muted px-2">
                {[
                  { id: "citations", label: "Citations" },
                  { id: "analytics", label: "Analytics" },
                  { id: "logs", label: "Activity Trace" },
                  { id: "metrics", label: "Metrics" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveRightTab(tab.id)}
                    className={`flex-1 text-center transition-colors border-b-2 ${
                      activeRightTab === tab.id
                        ? "border-aria-accent text-aria-accent bg-aria-surface/30"
                        : "border-transparent hover:text-aria-text"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Body */}
              <div className="flex-1 overflow-y-auto p-4">
                
                {/* 1. CITATIONS TAB */}
                {activeRightTab === "citations" && (
                  <div className="space-y-3">
                    {result.evidence.length === 0 ? (
                      <p className="text-xs text-aria-muted/50 italic text-center p-8">No citations found</p>
                    ) : (
                      result.evidence.map((item, idx) => {
                        const isExpanded = expandedCitationId === idx;
                        return (
                          <div 
                            key={idx} 
                            className={`border rounded-lg transition-all bg-aria-surface ${
                              isExpanded ? "border-aria-accent bg-aria-accent/5" : "border-aria-border"
                            }`}
                          >
                            <button
                              onClick={() => setExpandedCitationId(isExpanded ? null : idx)}
                              className="w-full text-left p-3 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-aria-accent">[{idx + 1}]</span>
                                <span className="font-bold text-aria-text truncate">{item.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] bg-aria-bg border border-aria-border text-aria-muted px-1.5 py-0.2 rounded font-semibold uppercase">
                                  {item.source_type}
                                </span>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-3 pb-3 pt-1 border-t border-aria-border mt-1">
                                <p className="text-[11px] font-semibold text-aria-text leading-relaxed whitespace-pre-wrap select-text font-sans bg-aria-bg p-3 border border-aria-border rounded-md">
                                  {item.summary}
                                </p>
                                
                                {item.url && (
                                  <div className="mt-2 flex justify-between items-center text-[10px]">
                                    <span className="text-aria-muted">Relevance: {item.score?.toFixed(2)}</span>
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-aria-accent hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink size={10} />
                                      View Reference
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 2. ANALYTICS TAB */}
                {activeRightTab === "analytics" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Inline Citations</span>
                        <strong className="text-sm font-semibold text-aria-text">{analyticsCitations.inline}</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Coverage</span>
                        <strong className="text-sm font-semibold text-aria-text">{analyticsCitations.coverage}%</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Cited Sources</span>
                        <strong className="text-sm font-semibold text-aria-text">{analyticsCitations.citedSources}</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Invalid Citations</span>
                        <strong className={`text-sm font-semibold ${analyticsCitations.invalid ? "text-amber-400" : "text-aria-text"}`}>
                          {analyticsCitations.invalid}
                        </strong>
                      </div>
                    </div>

                    <div className="p-4 bg-aria-surface border border-aria-border rounded-lg space-y-3">
                      <h4 className="text-[10px] font-semibold text-aria-text uppercase tracking-wider">Source Mix</h4>
                      {analyticsTypes.length === 0 ? (
                        <p className="text-xs text-aria-muted">No evidence collected.</p>
                      ) : (
                        <div className="space-y-2">
                          {analyticsTypes.map(([sourceType, count]) => {
                            const percentage = result.evidence.length > 0 ? Math.round((count / result.evidence.length) * 100) : 0;
                            return (
                              <div key={sourceType} className="space-y-1 text-xs">
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="font-semibold uppercase tracking-wider text-aria-text">{sourceType}</span>
                                  <span className="text-aria-muted">{count} · {percentage}%</span>
                                </div>
                                <div className="h-2 w-full bg-aria-bg rounded-full overflow-hidden border border-aria-border">
                                  <div className="h-full bg-aria-accent" style={{ width: `${percentage}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-aria-surface border border-aria-border rounded-lg space-y-3">
                      <h4 className="text-[10px] font-semibold text-aria-text uppercase tracking-wider">Top Source Relevance</h4>
                      {topEvidence.length === 0 ? (
                        <p className="text-xs text-aria-muted">No scored sources available.</p>
                      ) : (
                        <div className="space-y-2">
                          {topEvidence.map((item, idx) => {
                            const score = Math.max(0, Math.min(1, item.score || 0));
                            return (
                              <div key={`${item.title}-${idx}`} className="space-y-1">
                                <div className="flex justify-between gap-3 text-[10px]">
                                  <span className="text-aria-text font-semibold truncate">[{idx + 1}] {item.title}</span>
                                  <span className="text-aria-muted">{score.toFixed(2)}</span>
                                </div>
                                <div className="h-2 w-full bg-aria-bg rounded-full overflow-hidden border border-aria-border">
                                  <div className="h-full bg-emerald-500" style={{ width: `${score * 100}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-aria-surface border border-aria-border rounded-lg">
                      <h4 className="text-[10px] font-semibold text-aria-text uppercase tracking-wider mb-3">Workflow</h4>
                      <div className="flex items-center justify-between text-[9px] text-aria-muted">
                        {["Plan", "Retrieve", "Draft", "Verify", "Export"].map((stage, idx) => (
                          <div key={stage} className="flex flex-col items-center gap-1 min-w-0">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              stage === "Verify" && result.verification?.includes("NEEDS_MORE_RESEARCH")
                                ? "bg-amber-500 text-aria-bg"
                                : "bg-aria-accent text-aria-bg"
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="truncate">{stage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. ACTIVITY LOGS TAB */}
                {activeRightTab === "logs" && (
                  <div className="font-mono text-[10px] text-aria-muted space-y-1.5 bg-aria-bg/50 border border-aria-border p-3 rounded-lg max-h-[85svh] overflow-y-auto">
                    {result.events.map((event, idx) => (
                      <div key={idx} className={event.includes("Timeline:") ? "text-aria-accent" : ""}>
                        &gt; {event}
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. METRICS TAB */}
                {activeRightTab === "metrics" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Grounding iterations</span>
                        <strong className="text-sm font-semibold text-aria-text">{result.metrics?.iterations || 0} passes</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Retrieved Sources</span>
                        <strong className="text-sm font-semibold text-aria-text">{result.metrics?.evidence_items || 0} chunks</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Synthesized Brief size</span>
                        <strong className="text-sm font-semibold text-aria-text">{result.metrics?.answer_tokens_est || 0} tokens</strong>
                      </div>
                      <div className="p-3 bg-aria-surface border border-aria-border rounded-lg">
                        <span className="text-[10px] text-aria-muted block mb-1">Estimated Output</span>
                        <strong className="text-sm font-semibold text-aria-text">{result.metrics?.total_output_tokens_est || 0} tokens</strong>
                      </div>
                    </div>

                    <div className="p-4 bg-aria-surface border border-aria-border rounded-lg space-y-3">
                      <h4 className="text-[10px] font-semibold text-aria-text uppercase tracking-wider">Source Distribution Mix</h4>
                      <div className="space-y-2">
                        {["pdf", "note", "wikipedia", "web", "research", "finance"].map((sourceType) => {
                          const count = result.evidence.filter(ev => ev.source_type.toLowerCase() === sourceType.toLowerCase()).length;
                          const percentage = result.evidence.length > 0 ? (count / result.evidence.length) * 100 : 0;
                          if (count === 0) return null;

                          return (
                            <div key={sourceType} className="space-y-1 text-xs">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-semibold uppercase tracking-wider text-aria-text">{sourceType}</span>
                                <span className="text-aria-muted">{count}</span>
                              </div>
                              <div className="h-1 w-full bg-aria-bg rounded-full overflow-hidden">
                                <div className="h-full bg-aria-accent" style={{ width: `${percentage}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </div>
              
              {/* Document download buttons bar */}
              <div className="p-3 border-t border-aria-border bg-aria-bg/50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => downloadReport("pdf")}
                  disabled={!selectedSessionId}
                  className="px-2.5 py-1 text-[10px] bg-aria-surface hover:bg-aria-border border border-aria-border rounded text-aria-text font-semibold flex items-center gap-1 transition-colors"
                >
                  <Download size={11} /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadReport("md")}
                  disabled={!selectedSessionId}
                  className="px-2.5 py-1 text-[10px] bg-aria-surface hover:bg-aria-border border border-aria-border rounded text-aria-text font-semibold flex items-center gap-1 transition-colors"
                >
                  <Download size={11} /> Download MD
                </button>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM INPUT & DECOMPOSE QUERY BUILDER PANEL */}
        <div className="p-4 sm:p-6 border-t border-aria-border bg-aria-bg">
          <div className="w-full space-y-4">
            
            {/* Planned subqueries editor */}
            {customPlan.length > 0 && (
              <div className="p-4 bg-aria-surface border border-aria-border rounded-xl space-y-3 shadow-md">
                <div className="flex justify-between items-center border-b border-aria-border pb-2">
                  <span className="text-[9px] font-bold text-aria-muted uppercase tracking-wider flex items-center gap-1">
                    <Layers size={11} />
                    Decomposed Query Steps
                  </span>
                  <button 
                    onClick={() => setCustomPlan([])}
                    className="text-[9px] hover:text-aria-error font-semibold transition-colors"
                  >
                    Reset Plan
                  </button>
                </div>
                
                <div className="space-y-2">
                  {customPlan.map((q, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-[10px] text-aria-muted font-mono w-4">{idx+1}.</span>
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => updatePlanQuery(idx, e.target.value)}
                        className="flex-1 text-[11px] p-1.5 bg-aria-bg border border-aria-border text-aria-text rounded focus:outline-none focus:border-aria-accent"
                      />
                      <button 
                        onClick={() => removePlanQuery(idx)}
                        aria-label={`Remove query step ${idx + 1}`}
                        className="p-1 hover:bg-aria-bg rounded text-aria-muted hover:text-aria-text transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-[10px]">
                  <button
                    onClick={addPlanQuery}
                    className="text-aria-accent hover:underline font-semibold"
                  >
                    + Add query step
                  </button>
                </div>
              </div>
            )}

            {/* Main Chat Question Form Input */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-aria-surface border border-aria-border shadow-sm rounded-xl p-1.5 sm:p-0 relative">
              <input
                type="text"
                placeholder="Submit objective... (e.g. Compare AI chip supply chain risks)"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isResearching) runResearch();
                }}
                disabled={isResearching}
                className="w-full py-3 sm:py-3.5 pl-4 pr-4 sm:pr-36 bg-transparent text-xs text-aria-text outline-none rounded-xl disabled:opacity-50"
              />
              
              <div className="flex gap-1.5 mt-1.5 sm:mt-0 px-2 pb-2 sm:p-0 sm:absolute sm:right-2.5 justify-end">
                <button
                  type="button"
                  onClick={generatePlan}
                  disabled={isPlanning || isResearching || !question.trim()}
                  className="flex-1 sm:flex-none px-2.5 py-1.5 hover:bg-aria-bg rounded border border-aria-border text-[10px] font-semibold text-aria-text transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isPlanning ? <RefreshCw size={12} className="animate-spin" /> : <Layers size={11} />}
                  <span>Decompose</span>
                </button>
                
                <button
                  type="button"
                  onClick={runResearch}
                  disabled={isResearching || !question.trim()}
                  className="flex-1 sm:flex-none px-3.5 py-1.5 bg-aria-accent hover:bg-aria-accent/85 text-aria-bg rounded text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 shadow glow-cyan-sm disabled:opacity-50"
                >
                  {isResearching ? <RefreshCw size={12} className="animate-spin text-aria-bg" /> : <Play size={9} fill="currentColor" className="text-aria-bg mt-0.5" />}
                  <span>Execute</span>
                </button>
              </div>
            </div>
            
          </div>
        </div>

      </main>

      {/* 3. INGESTION DRAWER/MODAL Overlay */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-aria-bg/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="bg-aria-surface border border-aria-border rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => {
                setShowIngestModal(false);
                setIngestMessage(null);
              }}
              className="absolute right-4 top-4 p-1 hover:bg-aria-bg rounded text-aria-muted hover:text-aria-text transition-colors"
            >
              <X size={16} />
            </button>

            <h3 className="text-xs font-semibold text-aria-text uppercase tracking-wider mb-1">Knowledge Ingestion Source</h3>
            <p className="text-[10px] text-aria-muted mb-4">Add PDF files, web urls, or manual notes to index into the vector store.</p>

            <form onSubmit={handleIngest} className="space-y-4">
              <div className="flex bg-aria-bg border border-aria-border p-0.5 rounded-lg text-xs">
                {["pdf", "url", "note"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setIngestType(type);
                      setIngestMessage(null);
                    }}
                    className={`flex-1 py-1 rounded text-center capitalize font-medium ${
                      ingestType === type
                        ? "bg-aria-border text-aria-text"
                        : "text-aria-muted hover:text-aria-text"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {ingestType === "pdf" && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-aria-muted font-medium">Select PDF document</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setIngestFile(e.target.files[0])}
                    className="w-full text-xs text-aria-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-aria-border file:text-xs file:bg-aria-bg file:text-aria-text hover:file:bg-aria-border cursor-pointer"
                  />
                </div>
              )}

              {ingestType === "url" && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-aria-muted font-medium">Extract Web Page Content</label>
                  <input
                    type="url"
                    placeholder="https://example.com/report"
                    value={ingestUrlStr}
                    onChange={(e) => setIngestUrlStr(e.target.value)}
                    className="w-full text-xs p-2.5 bg-aria-bg border border-aria-border text-aria-text rounded-lg focus:outline-none focus:border-aria-accent"
                  />
                </div>
              )}

              {ingestType === "note" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-aria-muted font-medium">Title</label>
                    <input
                      type="text"
                      placeholder="Note title (e.g. Project Specs)"
                      value={ingestTextTitle}
                      onChange={(e) => setIngestTextTitle(e.target.value)}
                      className="w-full text-xs p-2.5 bg-aria-bg border border-aria-border text-aria-text rounded-lg focus:outline-none focus:border-aria-accent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-aria-muted font-medium">Content Body</label>
                    <textarea
                      placeholder="Paste your content here..."
                      rows={5}
                      value={ingestTextBody}
                      onChange={(e) => setIngestTextBody(e.target.value)}
                      className="w-full text-xs p-2.5 bg-aria-bg border border-aria-border text-aria-text rounded-lg focus:outline-none focus:border-aria-accent"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isIngesting}
                className="w-full py-2 bg-aria-border hover:bg-aria-border/80 text-aria-text rounded-lg text-xs font-semibold shadow transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIngesting ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                {isIngesting ? "Indexing Content..." : "Index Ingest Source"}
              </button>

              {ingestMessage && (
                <div className={`p-2.5 rounded text-[11px] flex gap-2 items-start ${
                  ingestMessage.type === "success" 
                    ? "bg-aria-complete/10 text-aria-complete border border-aria-complete/25"
                    : "bg-aria-error/10 text-aria-error border border-aria-error/25"
                }`}>
                  {ingestMessage.type === "success" ? <CheckCircle size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
                  <span>{ingestMessage.text}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 4. SETTINGS SIDE-PANEL DRAWER */}
      {showSettings && (
        <div className="fixed inset-0 z-40 bg-aria-bg/50 backdrop-blur-sm select-none" onClick={() => setShowSettings(false)}>
          <div 
            className="w-full sm:w-80 border-l border-aria-border bg-aria-surface flex flex-col absolute right-0 top-0 bottom-0 h-full shadow-2xl animate-in slide-in-from-right duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-aria-border flex justify-between items-center bg-aria-bg/10">
              <span className="font-semibold text-xs text-aria-text uppercase tracking-wider flex items-center gap-1.5">
                <Settings size={13} />
                Configurations
              </span>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-aria-bg rounded text-aria-muted hover:text-aria-text transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              
              {/* API Status badge */}
              <div className="p-3 bg-aria-bg border border-aria-border rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-aria-muted">Provider:</span>
                  <span className="font-semibold capitalize text-aria-text">{settings.llm_provider}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-aria-muted">Model:</span>
                  <span className="font-semibold text-aria-text">{settings.model}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-aria-muted">API Key status:</span>
                  <span className={`px-2 py-0.5 rounded-[4px] font-bold text-[10px] ${
                    settings.key_configured 
                      ? "bg-aria-complete/10 text-aria-complete border border-aria-complete/25"
                      : "bg-aria-error/10 text-aria-error border border-aria-error/25"
                  }`}>
                    {settings.key_configured ? "READY" : "NOT SET"}
                  </span>
                </div>
              </div>

              {/* Search toggles */}
              <div className="space-y-3">
                <h4 className="font-semibold text-aria-muted uppercase tracking-wider text-[10px]">Sources settings</h4>
                
                <div className="flex items-center justify-between p-2.5 bg-aria-bg/30 rounded-xl border border-aria-border">
                  <div>
                    <span className="font-medium block">Search Web Sources</span>
                    <span className="text-[10px] text-aria-muted">Wikipedia, Arxiv, OpenAlex, DDG, DOAJ, PubMed</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={useWeb}
                    onChange={(e) => setUseWeb(e.target.checked)}
                    className="accent-aria-accent h-4 w-4 rounded border-aria-border bg-aria-bg"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-aria-bg/30 rounded-xl border border-aria-border">
                  <div>
                    <span className="font-medium block">Search Local Memory</span>
                    <span className="text-[10px] text-aria-muted">Retrieve from indexed documents</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={useLocal}
                    onChange={(e) => setUseLocal(e.target.checked)}
                    className="accent-aria-accent h-4 w-4 rounded border-aria-border bg-aria-bg"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-aria-bg/30 rounded-xl border border-aria-border">
                  <div>
                    <span className="font-medium block">Market Snapshots</span>
                    <span className="text-[10px] text-aria-muted">Include live finance stock quotes</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={useFinance}
                    onChange={(e) => setUseFinance(e.target.checked)}
                    className="accent-aria-accent h-4 w-4 rounded border-aria-border bg-aria-bg"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-aria-muted uppercase tracking-wider block">Research Domain Focus</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsFocusOpen(!isFocusOpen)}
                      className="w-full bg-aria-bg border border-aria-border rounded-xl px-3 py-2.5 text-xs font-semibold text-aria-text flex justify-between items-center hover:border-aria-accent transition-colors focus:outline-none"
                    >
                      <span>
                        {fieldFocus === "all" && "🌐 All Domains (Comprehensive)"}
                        {fieldFocus === "general" && "📰 General Web, Tech & News"}
                        {fieldFocus === "medical" && "🧬 Biomedical & Life Sciences"}
                        {fieldFocus === "stem" && "🔬 STEM (CS, Math, Engineering)"}
                        {fieldFocus === "humanities" && "📚 Social Sciences & Humanities"}
                      </span>
                      <ChevronDown size={12} className={`text-aria-muted transition-transform duration-200 ${isFocusOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isFocusOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsFocusOpen(false)} />
                        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-aria-surface border border-aria-border rounded-xl shadow-xl overflow-hidden py-1 divide-y divide-aria-border/10 animate-in fade-in slide-in-from-top-1 duration-150">
                          <button
                            type="button"
                            onClick={() => { setFieldFocus("all"); setIsFocusOpen(false); }}
                            className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 hover:bg-aria-bg/70 ${fieldFocus === "all" ? "text-aria-accent bg-aria-bg/30 font-semibold" : "text-aria-text"}`}
                          >
                            🌐 All Domains (Comprehensive)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFieldFocus("general"); setIsFocusOpen(false); }}
                            className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 hover:bg-aria-bg/70 ${fieldFocus === "general" ? "text-aria-accent bg-aria-bg/30 font-semibold" : "text-aria-text"}`}
                          >
                            📰 General Web, Tech &amp; News
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFieldFocus("medical"); setIsFocusOpen(false); }}
                            className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 hover:bg-aria-bg/70 ${fieldFocus === "medical" ? "text-aria-accent bg-aria-bg/30 font-semibold" : "text-aria-text"}`}
                          >
                            🧬 Biomedical &amp; Life Sciences
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFieldFocus("stem"); setIsFocusOpen(false); }}
                            className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 hover:bg-aria-bg/70 ${fieldFocus === "stem" ? "text-aria-accent bg-aria-bg/30 font-semibold" : "text-aria-text"}`}
                          >
                            🔬 STEM (CS, Math, Engineering)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFieldFocus("humanities"); setIsFocusOpen(false); }}
                            className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 hover:bg-aria-bg/70 ${fieldFocus === "humanities" ? "text-aria-accent bg-aria-bg/30 font-semibold" : "text-aria-text"}`}
                          >
                            📚 Social Sciences &amp; Humanities
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Hyperparameters */}
              <div className="space-y-4">
                <h4 className="font-semibold text-aria-muted uppercase tracking-wider text-[10px]">Parameters</h4>
                
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-aria-muted">Validation depth (passes)</span>
                    <span className="font-semibold text-aria-text">{maxIterations}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="3" 
                    value={maxIterations} 
                    onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-aria-border rounded-lg appearance-none cursor-pointer accent-aria-accent"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-aria-muted">LLM temperature</span>
                    <span className="font-semibold text-aria-text">{temperature}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1.0" 
                    step="0.05"
                    value={temperature} 
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-aria-border rounded-lg appearance-none cursor-pointer accent-aria-accent"
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between">
                    <span className="text-aria-muted">Top-k vector retrieval</span>
                    <span className="font-semibold text-aria-text">{topK} chunks</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={topK} 
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-aria-border rounded-lg appearance-none cursor-pointer accent-aria-accent"
                  />
                </div>

                <div className="space-y-1.5 pt-3 border-t border-aria-border">
                  <span className="text-[10px] font-semibold text-aria-muted uppercase tracking-wider block">User Session Profile</span>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={userId} 
                      onChange={(e) => {
                        const newId = e.target.value;
                        setUserId(newId);
                        localStorage.setItem("aria_user_id", newId);
                      }}
                      placeholder="e.g. user_123"
                      className="flex-1 bg-aria-bg border border-aria-border rounded-xl px-3 py-2 text-xs font-semibold text-aria-text focus:outline-none focus:border-aria-accent"
                    />
                    <button
                      onClick={() => {
                        setUserId(OWNER_USER_ID);
                        localStorage.setItem("aria_user_id", OWNER_USER_ID);
                      }}
                      className={`px-2.5 bg-aria-surface hover:bg-aria-border border rounded-xl text-xs font-semibold transition-colors ${
                        userId === OWNER_USER_ID ? "border-aria-accent text-aria-accent" : "border-aria-border text-aria-text"
                      }`}
                      title="Use owner profile"
                    >
                      Owner
                    </button>
                    <button 
                      onClick={() => {
                        const newId = "user_" + Math.random().toString(36).substring(2, 11);
                        setUserId(newId);
                        localStorage.setItem("aria_user_id", newId);
                      }}
                      className="px-2.5 bg-aria-surface hover:bg-aria-border border border-aria-border rounded-xl text-xs font-semibold text-aria-text transition-colors"
                      title="Generate new User ID"
                    >
                      Reset
                    </button>
                  </div>
                  <span className="text-[10px] text-aria-muted block leading-normal pt-0.5">
                    Owner ID: <code className="text-aria-accent font-semibold">{OWNER_USER_ID}</code> or `admin`. This profile can view and manage all users' research histories.
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
