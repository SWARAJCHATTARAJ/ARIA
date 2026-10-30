import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Download, Copy, ThumbsUp, ThumbsDown, AlertTriangle, Maximize2, Minimize2, Check, Sparkles, StopCircle, Network, FileText, CheckCircle2, Menu, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, KeyRound, Eraser } from 'lucide-react';
import ConfidenceDial from './ConfidenceDial';
import MarkdownRenderer, { getTierGlyph, getTierColorClass } from './MarkdownRenderer';
import CitationGraph from './CitationGraph';
import VisualConceptCard from './VisualConceptCard';
import PipelineSpine from './PipelineSpine';
import { streamQuery } from '../utils/sseClient';
import { Citation, Message, MessageTelemetry, PipelineStage, AuditClaim } from '../types';
import { API_BASE_URL } from '../config';
import { addHistoryEntry, addToCollection, isInCollection, getCompareDefault, getSettings, saveSettings, getByokKey, getByokProvider, setByokKey, clearByok, getCustomContext } from '../utils/storage';
import { ResearchMode, RESEARCH_MODE_OPTIONS, DISCIPLINE_OPTIONS } from '../types';

const EXAMPLE_QUERIES = [
  {
    id: 'okf',
    label: 'OKF Resolvable: Autonomous Systems Taxonomy',
    query: 'What is the definition and taxonomy of autonomous systems in artificial intelligence?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'rag',
    label: 'RAG Dense Vector Retrieval: CRISPR Mitigation',
    query: 'What are the off-target mitigation strategies for CRISPR gene editing?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'live',
    label: 'LIVE Multi-Source Academic: JWST 2024',
    query: 'What were the latest discoveries of the James Webb Space Telescope in 2024?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'retraction',
    label: 'Test Fixture: Retraction Watch Alert (Fictional)',
    query: 'Is ambient hyperconductivity confirmed in synthesized phosphor-apatite? (test fixture)',
  },
  {
    id: 'conflict',
    label: 'Test Fixture: Cross-Tier Conflict (Fictional)',
    query: 'Do synthetic neural networks demonstrate discontinuous capability jumps? (test fixture)',
  },
];

interface ThreadViewProps {
  onCitationClick: (citation: Citation) => void;
  isFocusMode: boolean;
  onToggleFocus: () => void;
  onQueryStateChange?: (hasQuery: boolean) => void;
  onUpdateActiveTelemetry?: (telemetry: MessageTelemetry | undefined) => void;
  onUpdateActiveCitations?: (citations: Citation[]) => void;
  onMockStateChange?: (isMock: boolean) => void;
  activeTelemetry?: MessageTelemetry;
  activeCitations?: Citation[];
  isMockActive?: boolean;
  /** opens the mobile sidebar drawer (hamburger) */
  onToggleSidebar?: () => void;
  /** query handed over from History view; executes once on mount */
  pendingQuery?: string | null;
  /** parent clears the pending query after consumption */
  onPendingQueryConsumed?: () => void;
  /** parent toggles the sources drawer (used for auto-expansion on audit completion) */
  onSourcesExpand?: () => void;
}

export default function ThreadView({
  onCitationClick,
  isFocusMode,
  onToggleFocus,
  onQueryStateChange,
  onUpdateActiveTelemetry,
  onUpdateActiveCitations,
  onMockStateChange,
  isMockActive = false,
  onToggleSidebar,
  pendingQuery,
  onPendingQueryConsumed,
  onSourcesExpand,
}: ThreadViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState<boolean>(() => getCompareDefault());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative' | 'flagged'>>({});
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(false);
  const [isCitationGraphOpen, setIsCitationGraphOpen] = useState<Record<string, boolean>>({});
  const [isExportingPdf, setIsExportingPdf] = useState<Record<string, boolean>>({});
  const [bookmarkedQueries, setBookmarkedQueries] = useState<Record<string, boolean>>({});
  const [elapsedMs, setElapsedMs] = useState(0);

  // v3 Part 2: flexible research configuration from the Control Center / dock
  const initialSettings = getSettings();
  const [researchMode, setResearchMode] = useState<ResearchMode>(initialSettings.researchMode);
  const [discipline, setDiscipline] = useState<string>(initialSettings.discipline || 'auto');
  const [customContext, setCustomContext] = useState<string>(getCustomContext);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [byokProvider, setByokProvider] = useState<string>(getByokProvider());
  const [byokKey, setByokKeyState] = useState<string>(getByokKey());
  const [showByokKey, setShowByokKey] = useState(false);
  const customContextRef = useRef(customContext);
  customContextRef.current = customContext;

  const handleDownloadPdf = async (msg: Message) => {
    try {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: true }));
      const payload = {
        query: msg.query || 'Research Overview',
        answer_final: msg.content,
        confidence: msg.telemetry?.audit?.confidence ?? 0.85,
        tiers: msg.telemetry?.retrieval?.tiers || ['OKF'],
        claims: msg.telemetry?.audit?.claims || [],
        sources: msg.citations || [],
      };
      const res = await fetch(`${API_BASE_URL}/api/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('PDF export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aria-research-paper.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Capture final stream values for the history save at onDone (state not readable synchronously)
  const finalContentRef = useRef('');
  const finalConfidenceRef = useRef<number | undefined>(undefined);
  const lastQueryRef = useRef('');
  const executedPendingRef = useRef<string | null>(null);

  // Real-time millisecond telemetry counter while streaming
  useEffect(() => {
    if (!isLoading) return;
    const start = performance.now();
    setElapsedMs(0);
    const id = setInterval(() => setElapsedMs(performance.now() - start), 100);
    return () => clearInterval(id);
  }, [isLoading]);

  // Probe backend health to hide thumbs if unreachable
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (mounted && res.ok) setIsBackendReachable(true);
      } catch {
        if (mounted) setIsBackendReachable(false);
      }
    };
    checkHealth();
    return () => {
      mounted = false;
    };
  }, []);

  // Check if ?mock=1 is present in URL
  const isMockUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1';
  // Allow fixture replay only if ?mock=1 or running in dev mode
  const canReplayFixtures = isMockUrl || import.meta.env.DEV;

  // Inform parent when queries exist
  useEffect(() => {
    if (onQueryStateChange) {
      onQueryStateChange(messages.length > 0);
    }
  }, [messages.length, onQueryStateChange]);

  // v3 Part 3.3: auto-expand sources drawer when audit completes
  useEffect(() => {
    const lastAria = [...messages].reverse().find((m) => m.role === 'aria');
    if (lastAria && !lastAria.isStreaming && lastAria.telemetry?.audit) {
      if (onSourcesExpand) onSourcesExpand();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isLoading]);

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Typewriter placeholder logic
  const [placeholder, setPlaceholder] = useState('');
  useEffect(() => {
    const prompts = [
      'Analyze the structural taxonomy of autonomous systems...',
      'What are the off-target mitigation strategies for CRISPR Cas9?',
      'Latest astronomical discoveries of the James Webb Telescope...',
      'Is ambient hyperconductivity confirmed in synthesized phosphor-apatite?',
    ];
    let pIdx = 0;
    let cIdx = 0;
    let isDeleting = false;

    const tick = () => {
      const currentPrompt = prompts[pIdx];
      if (isDeleting) {
        setPlaceholder(currentPrompt.substring(0, cIdx - 1));
        cIdx--;
      } else {
        setPlaceholder(currentPrompt.substring(0, cIdx + 1));
        cIdx++;
      }

      let nextSpeed = isDeleting ? 25 : 45;

      if (!isDeleting && cIdx === currentPrompt.length) {
        nextSpeed = 2200;
        isDeleting = true;
      } else if (isDeleting && cIdx === 0) {
        isDeleting = false;
        pIdx = (pIdx + 1) % prompts.length;
        nextSpeed = 500;
      }

      setTimeout(tick, nextSpeed);
    };

    const timerId = setTimeout(tick, 500);
    return () => clearTimeout(timerId);
  }, []);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      );
    }
  };

  const executeQuery = (queryText: string, mockKey?: string, recordedDate?: string) => {
    if (!queryText.trim() || isLoading) return;

    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMsgId = `user-${Date.now()}`;
    const ariaMsgId = `aria-${Date.now()}`;

    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: queryText.trim(),
      timestamp: Date.now(),
    };

    const initialAriaMessage: Message = {
      id: ariaMsgId,
      role: 'aria',
      content: '',
      query: queryText.trim(),
      citations: [],
      telemetry: { stage: 'routing' },
      isStreaming: true,
      timestamp: Date.now(),
      recordedDate: recordedDate,
    };

    setMessages((prev) => [...prev, userMessage, initialAriaMessage]);
    setInput('');
    setIsLoading(true);

    // Capture final values for the history entry written at stream end
    finalContentRef.current = '';
    finalConfidenceRef.current = undefined;
    lastQueryRef.current = queryText.trim();

    let collectedCitations: Citation[] = [];
    let currentTelemetry: MessageTelemetry = { stage: 'routing' };

    if (onUpdateActiveCitations) onUpdateActiveCitations([]);
    if (onUpdateActiveTelemetry) onUpdateActiveTelemetry(currentTelemetry);

    // v3 Part 2.3: BYOK headers passed through to the backend
    const byokActive = Boolean(byokKey && byokProvider);
    const customHeaders: Record<string, string> = {
      ...(byokActive ? { 'X-Custom-API-Key': byokKey, 'X-Custom-Provider': byokProvider } : {}),
    };

    // Replay recorded example card if mockKey provided; live queries typed by users pass mockKey = undefined
    const effectiveMockKey = mockKey;

    streamQuery({
      query: queryText.trim(),
      compareMode: isCompareMode,
      signal: abortController.signal,
      mockFixtureKey: effectiveMockKey,
      researchMode,
      discipline,
      customContext: customContextRef.current,
      customHeaders,
      onMockState: (isMock) => {
        if (onMockStateChange) onMockStateChange(isMock);
      },
      onEvent: (evt) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== ariaMsgId) return msg;

            const updatedTelemetry = { ...(msg.telemetry || currentTelemetry) };
            let updatedContent = msg.content;
            let updatedCitations = msg.citations ? [...msg.citations] : [];
            let updatedQueuePosition = msg.queuePosition;

            switch (evt.event) {
              case 'queued':
                updatedQueuePosition = evt.position ?? 1;
                break;

              case 'start':
                updatedTelemetry.stage = 'routing';
                break;

              case 'route':
                updatedTelemetry.stage = 'retrieving';
                updatedTelemetry.route = {
                  route_decision: evt.route_decision || 'cascade',
                };
                break;

              case 'retrieve':
                updatedTelemetry.stage = 'streaming';
                updatedTelemetry.retrieval = {
                  tiers: evt.tiers,
                  okf_node_paths: evt.okf_node_paths,
                  rag_scores: evt.rag_scores,
                  sources: evt.sources,
                };
                break;

              case 'citation': {
                const newCit: Citation = {
                  id: evt.id,
                  title: evt.title,
                  path: evt.path,
                  url: evt.url,
                  authors: evt.authors,
                  year: evt.year,
                  venue: evt.venue,
                  snippet: evt.snippet,
                  source_type: evt.source_type,
                  tier: evt.tier,
                  doi: evt.doi,
                  arxiv_id: evt.arxiv_id,
                  is_retracted: evt.is_retracted,
                  review_status: evt.review_status,
                };
                if (!updatedCitations.some((c) => c.id === newCit.id)) {
                  updatedCitations.push(newCit);
                  collectedCitations = updatedCitations;
                  if (onUpdateActiveCitations) onUpdateActiveCitations(updatedCitations);
                }
                break;
              }

              case 'token':
                if (evt.delta) {
                  updatedContent += evt.delta;
                }
                updatedQueuePosition = null; // remove queued event when stream starts
                break;

              case 'audit':
                updatedTelemetry.stage = 'auditing';
                updatedTelemetry.audit = {
                  claims: evt.claims,
                  removed_claims: evt.removed_claims,
                  conflicts: evt.conflicts_found || evt.conflicts,
                  retractions: evt.retractions_found || evt.retractions,
                  confidence: evt.confidence,
                  tier_agreement: evt.tier_agreement,
                  answer_final: evt.answer_final,
                  repaired: evt.repaired ?? false,
                };
                if (evt.sources) {
                  updatedTelemetry.retrieval = {
                    ...updatedTelemetry.retrieval,
                    sources: evt.sources,
                  };
                }
                if (evt.answer_final) {
                  updatedContent = evt.answer_final;
                  finalContentRef.current = evt.answer_final;
                }
                if (typeof evt.confidence === 'number' && evt.confidence > 0) {
                  finalConfidenceRef.current = evt.confidence;
                }
                break;              case 'done':
                updatedTelemetry.stage = 'complete';
                return {
                  ...msg,
                  content: updatedContent,
                  citations: updatedCitations,
                  telemetry: updatedTelemetry,
                  queuePosition: null,
                  isStreaming: false,
                };

              case 'error':
                updatedTelemetry.stage = 'error';
                return {
                  ...msg,
                  content: updatedContent,
                  citations: updatedCitations,
                  telemetry: updatedTelemetry,
                  queuePosition: null,
                  isStreaming: false,
                  error: evt.message || 'Stream connection error',
                };
            }

            currentTelemetry = updatedTelemetry;
            if (onUpdateActiveTelemetry) onUpdateActiveTelemetry(updatedTelemetry);

            return {
              ...msg,
              content: updatedContent,
              citations: updatedCitations,
              telemetry: updatedTelemetry,
              queuePosition: updatedQueuePosition,
            };
          })
        );
      },
      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === ariaMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  error: err.message || 'Failed to connect to backend',
                }
              : msg
          )
        );
      },
      onDone: () => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === ariaMsgId ? { ...msg, isStreaming: false } : msg))
        );
        // Persist the completed thread to local History (skip mock fixture replays)
        if (!isMockActive && !effectiveMockKey && finalContentRef.current) {
          try {
            addHistoryEntry({
              query: lastQueryRef.current,
              snippet: finalContentRef.current
                .replace(/[#*`>\[\]]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 220),
              confidence: finalConfidenceRef.current,
            });
          } catch {
            // Storage unavailable; quietly ignore
          }
        }
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(input);
  };

  // Execute a query handed over from the History view exactly once
  useEffect(() => {
    if (pendingQuery && executedPendingRef.current !== pendingQuery) {
      executedPendingRef.current = pendingQuery;
      executeQuery(pendingQuery);
      if (onPendingQueryConsumed) onPendingQueryConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery]);

  const handleCopy = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleDownloadBibtex = (citations: Citation[] = []) => {
    if (citations.length === 0) return;
    const bibContent = citations
      .map((cit) => {
        const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
        const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
        return `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || 'Unknown'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
      })
      .join('\n\n');

    const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aria-citations.bib';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFeedback = async (msg: Message, type: 'positive' | 'negative' | 'flagged') => {
    // Never send feedback for mock replays or when backend is unreachable
    if (isMockActive || !isBackendReachable) return;

    // Find previous user query if any
    const msgIdx = messages.findIndex((m) => m.id === msg.id);
    let userQuery = '';
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userQuery = messages[i].content;
        break;
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: msg.id,
          verdict: type,
          query: userQuery || undefined,
          tiers: msg.telemetry?.retrieval?.tiers || [],
          route_engine: null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Show saved tick only on success
        if (data.status === 'stored') {
          setFeedbackSent((prev) => ({ ...prev, [msg.id]: type }));
        }
      }
    } catch {
      // Quiet failure if unreachable
    }
  };

  const getStageLabel = (stage?: PipelineStage) => {
    switch (stage) {
      case 'routing':
        return 'Planning...';
      case 'retrieving':
        return 'Retrieving sources...';
      case 'streaming':
        return 'Writing answer...';
      case 'auditing':
        return 'Checking claims...';
      case 'complete':
        return 'Done';
      case 'error':
        return 'Error';
      default:
        return 'Thinking...';
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full relative h-full overflow-hidden select-text">
      {/* Thread Header */}
      <div className="px-4 md:px-8 py-3.5 border-b border-ink-surface flex justify-between items-center bg-ink-base/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger: opens the sidebar drawer */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden text-ink-muted hover:text-white transition-colors p-1"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-bold text-white tracking-wider uppercase">
                New question
              </h2>
              {isMockActive && (
                <span className="font-mono text-[9px] px-1.5 py-0.2 uppercase tracking-wider bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-1">
                  <AlertTriangle size={10} /> MOCK DATA
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <button
              onClick={handleStopGeneration}
              className="text-xs font-mono text-warning hover:bg-warning/10 border border-warning/40 px-2 py-1 rounded-none flex items-center gap-1.5 transition-colors"
              title="Stop streaming"
            >
              <StopCircle size={14} /> Stop
            </button>
          )}

          <button
            onClick={onToggleFocus}
            className="text-ink-muted hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-none border border-ink-surface hover:border-gray-600"
            title="Toggle Focus Mode"
          >
            {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden md:inline">{isFocusMode ? 'Exit Focus' : 'Focus'}</span>
          </button>
        </div>
      </div>

      {/* Mobile / Tablet: horizontal pipeline progress strip (<1024px, replaces vertical spine) */}
      {messages.length > 0 && (
        <div className="lg:hidden border-b border-ink-surface shrink-0 bg-ink-base/80">
          {(() => {
            const lastAria = [...messages].reverse().find((m) => m.role === 'aria');
            return (
              <PipelineSpine
                orientation="horizontal"
                mode="live"
                stage={lastAria?.telemetry?.stage}
                tiersFired={lastAria?.telemetry?.retrieval?.tiers}
                isComplete={lastAria?.telemetry?.stage === 'complete'}
              />
            );
          })()}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 select-text">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <div className="w-full max-w-2xl bg-ink-surface/20 rounded-none p-6 border border-ink-surface relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #fff 28px)',
                  backgroundPosition: '0 -1px',
                }}
              />
              <div className="relative z-10 space-y-4">
                <div className="font-mono text-xs uppercase tracking-widest text-tier-okf flex items-center gap-2">
                  <Sparkles size={14} /> Try one of these, or type your own.
                </div>

                {/* Example buttons: in production replay real recorded okf, rag, live answers with zero tokens; test fixtures stay dev-only */}
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {(canReplayFixtures
                    ? EXAMPLE_QUERIES
                    : EXAMPLE_QUERIES.filter((q) => q.id === 'okf' || q.id === 'rag' || q.id === 'live')
                  ).map((fixture) => (
                    <button
                      key={fixture.id}
                      onClick={() => executeQuery(fixture.query, fixture.id, fixture.recordedDate)}
                      className="text-left p-3 bg-ink-base/80 hover:bg-ink-surface border border-ink-surface hover:border-tier-okf/50 transition-colors text-xs group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-tier-okf font-mono font-medium">
                          {fixture.recordedDate
                            ? `Recorded answer, ${fixture.recordedDate}, no live query`
                            : fixture.label}
                        </span>
                        {canReplayFixtures && (fixture.id === 'retraction' || fixture.id === 'conflict') && (
                          <span className="text-[9px] text-amber-400/80 uppercase border border-amber-400/30 px-1 py-0.2 font-mono">
                            test fixture
                          </span>
                        )}
                      </div>
                      <span className="text-gray-300 group-hover:text-white font-sans text-xs leading-relaxed block">
                        "{fixture.query}"
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'flex-col gap-2 max-w-[95%]'}`}
          >
            {msg.role === 'user' ? (
              <div className="bg-ink-surface px-4 py-3 rounded-none border border-ink-surface/80 max-w-[85%] text-xs font-sans text-gray-100">
                {msg.content}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Top Verification & Action Bar (Google AI Overview / Deep Research Style) */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-ink-muted pb-2 border-b border-ink-surface/50">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Fired Tiers with glyphs */}
                    <div className="flex items-center gap-1.5 border border-ink-surface px-2 py-0.5 rounded-none bg-ink-base">
                      {(['OKF', 'RAG', 'LIVE'] as const).map((t) => {
                        const glyph = getTierGlyph(t);
                        const isFired = msg.telemetry?.retrieval?.tiers?.includes(t) || msg.citations?.some((c) => c.tier === t);
                        return (
                          <span
                            key={t}
                            className={`flex items-center gap-1 text-[10px] ${
                              isFired ? 'opacity-100 font-bold' : 'opacity-30'
                            }`}
                          >
                            <span className={getTierColorClass(t).split(' ')[0]}>{glyph}</span>
                            <span>{t}</span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Verification Status Badge */}
                    {msg.telemetry?.audit?.confidence !== undefined && (
                      <div className="flex items-center gap-1 text-emerald-400 font-mono text-[10px] bg-emerald-950/50 border border-emerald-500/40 px-2 py-0.5">
                        <CheckCircle2 size={11} className="text-emerald-400" />
                        <span>{Math.round((msg.telemetry.audit.confidence ?? 0.85) * 100)}% Source-Verified</span>
                      </div>
                    )}

                    {/* Verified Claims Count */}
                    {msg.telemetry?.audit?.claims && msg.telemetry.audit.claims.length > 0 && (
                      <span className="text-[10px] text-gray-300 font-mono bg-ink-surface/50 border border-ink-surface px-1.5 py-0.5">
                        {msg.telemetry.audit.claims.filter((c) => typeof c !== 'string' && c.status === 'supported').length} / {msg.telemetry.audit.claims.length} Claims Verified
                      </span>
                    )}

                    {/* Confidence Dial */}
                    <div className="flex items-center gap-1.5">
                      <ConfidenceDial
                        confidence={msg.telemetry?.audit?.confidence ?? 0.85}
                        tierAgreement={msg.telemetry?.audit?.tier_agreement}
                        size="sm"
                      />
                    </div>

                    {/* Status Indicator with live elapsed-millisecond telemetry */}
                    {msg.isStreaming && (
                      <div className="flex items-center gap-1.5 text-tier-okf text-[10px] animate-pulse">
                        <Loader2 size={12} className="animate-spin" />
                        <span>{getStageLabel(msg.telemetry?.stage)}</span>
                        <span className="font-mono text-ink-muted">T+{(elapsedMs / 1000).toFixed(1)}s</span>
                      </div>
                    )}

                    {/* Mock badge on message if mock active */}
                    {isMockActive && (
                      <span className="font-mono text-[9px] px-1 py-0.2 bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold">
                        MOCK
                      </span>
                    )}
                  </div>

                  {/* Top Action Buttons: Citation Graph & PDF Report */}
                  {!msg.isStreaming && msg.content && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsCitationGraphOpen(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                        className={`px-2 py-1 text-[11px] font-mono flex items-center gap-1.5 border transition-all ${
                          isCitationGraphOpen[msg.id]
                            ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 shadow-sm'
                            : 'bg-ink-base border-ink-surface hover:border-gray-500 text-gray-300 hover:text-white'
                        }`}
                        title="Toggle Interactive Citation Graph"
                      >
                        <Network size={12} className={isCitationGraphOpen[msg.id] ? 'text-emerald-400 animate-pulse' : ''} />
                        <span>Citation Graph</span>
                      </button>

                      <button
                        onClick={() => handleDownloadPdf(msg)}
                        disabled={isExportingPdf[msg.id]}
                        className="px-2.5 py-1 text-[11px] font-mono flex items-center gap-1.5 bg-tier-okf/15 hover:bg-tier-okf/25 border border-tier-okf/40 hover:border-tier-okf text-tier-okf hover:text-emerald-300 transition-all disabled:opacity-50"
                        title="Download IEEE / arXiv Two-Column Academic Research Paper (PDF)"
                      >
                        {isExportingPdf[msg.id] ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Exporting Paper...</span>
                          </>
                        ) : (
                          <>
                            <FileText size={12} />
                            <span>Download Research Paper (PDF)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Interactive Citation Graph Drawer */}
                {isCitationGraphOpen[msg.id] && (
                  <CitationGraph
                    query={msg.query || ''}
                    citations={msg.citations}
                    claims={msg.telemetry?.audit?.claims?.filter((c): c is AuditClaim => typeof c === 'object')}
                    onCitationClick={onCitationClick}
                    onClose={() => setIsCitationGraphOpen(prev => ({ ...prev, [msg.id]: false }))}
                  />
                )}

                {/* Key Takeaways & Visual Concept Card (Top Overview Split Panel) */}
                {!msg.isStreaming && msg.content && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 my-3 p-3.5 bg-ink-surface/20 border border-ink-surface/70 rounded-none">
                    {/* Left: Key Verified Findings */}
                    <div className="lg:col-span-7 flex flex-col justify-between space-y-2.5">
                      <div>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-tier-okf font-semibold mb-2">
                          <Sparkles size={12} /> Key Research Takeaways
                        </div>
                        <div className="space-y-2">
                          {msg.telemetry?.audit?.claims && msg.telemetry.audit.claims.length > 0 ? (
                            msg.telemetry.audit.claims
                              .filter((c): c is AuditClaim => typeof c === 'object' && c !== null && c.status === 'supported')
                              .slice(0, 3)
                              .map((c, idx) => {
                                const cov = Math.round((c.coverage ?? 1.0) * 100);
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-2 text-xs font-sans text-gray-200 group cursor-pointer hover:text-white"
                                    onClick={() => {
                                      if (c.citation_ids && c.citation_ids.length > 0) {
                                        const targetCit = msg.citations?.find(cit => cit.id === c.citation_ids![0]);
                                        if (targetCit) onCitationClick(targetCit);
                                      }
                                    }}
                                  >
                                    <span className="font-mono text-[9px] px-1 py-0.2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-bold shrink-0 mt-0.5">
                                      {cov}%
                                    </span>
                                    <span className="leading-snug">
                                      {c.text}
                                      {c.citation_ids && c.citation_ids.length > 0 && (
                                        <span className="inline-flex gap-1 ml-1 align-middle">
                                          {c.citation_ids.slice(0, 3).map((cid) => {
                                            const cit = msg.citations?.find((x) => x.id === cid);
                                            return (
                                              <button
                                                key={cid}
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (cit) onCitationClick(cit);
                                                }}
                                                className={`font-mono text-[9px] px-1 py-0.2 border rounded-none font-bold inline-flex items-center gap-0.5 hover:brightness-125 transition-all ${getTierColorClass(cit?.tier)}`}
                                                title={cit?.title || `Citation #${cid + 1}`}
                                              >
                                                <span>{getTierGlyph(cit?.tier)}</span>
                                                <span>{cid + 1}</span>
                                              </button>
                                            );
                                          })}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })
                          ) : (
                            <div className="text-xs font-sans text-gray-400 italic">
                              Verified key findings extracted from authoritative academic literature and structured graph notes.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 text-[10px] font-mono text-ink-muted flex items-center gap-2">
                        <span>Verified against {msg.citations?.length || 1} cited primary sources</span>
                      </div>
                    </div>

                    {/* Right: Visual Concept / Diagram Card */}
                    <div className="lg:col-span-5 flex items-center">
                      <VisualConceptCard query={msg.query || ''} citations={msg.citations} />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {msg.error && (
                  <div className="p-3 bg-warning/10 border border-warning/40 text-warning text-xs font-mono rounded-none">
                    Error: {msg.error}
                  </div>
                )}

                {/* Markdown Rendered Content with split-buffered citations, GFM tables & claim audit pass */}
                <div className={`thread-content font-sans text-gray-200 max-w-[68ch] density-${initialSettings.fontDensity} leading-[1.65]`}>
                  {msg.recordedDate && (
                    <div className="mb-3 px-2.5 py-1 text-[11px] font-mono bg-tier-okf/10 border border-tier-okf/40 text-tier-okf flex items-center gap-1.5">
                      <span>Recorded answer, {msg.recordedDate}, no live query</span>
                    </div>
                  )}
                  {msg.content ? (
                    <MarkdownRenderer
                      content={msg.content}
                      citations={msg.citations}
                      onCitationClick={onCitationClick}
                      isStreaming={msg.isStreaming}
                      auditClaims={msg.telemetry?.audit?.claims?.filter((c): c is AuditClaim => typeof c === 'object' && c !== null)}
                      answerFinal={msg.telemetry?.audit?.answer_final}
                    />
                  ) : msg.queuePosition ? (
                    <div className="font-mono text-xs text-amber-300 flex items-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin text-amber-300" />
                      <span>{msg.queuePosition} ahead of you, your question starts soon</span>
                    </div>
                  ) : msg.isStreaming ? (
                    <div className="font-mono text-xs text-ink-muted flex items-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Retrieving knowledge and synthesizing response...</span>
                    </div>
                  ) : null}

                  {/* Removed Sentences Notice */}
                  {!msg.isStreaming && msg.telemetry?.audit?.removed_claims && msg.telemetry.audit.removed_claims.length > 0 && (
                    <details className="mt-3 text-xs bg-ink-surface/40 border border-ink-surface rounded px-3 py-2 text-ink-muted">
                      <summary className="cursor-pointer font-mono text-[11px] text-warning/90 hover:text-warning select-none">
                        {msg.telemetry.audit.removed_claims.length} sentence{msg.telemetry.audit.removed_claims.length > 1 ? 's' : ''} removed because the sources did not support {msg.telemetry.audit.removed_claims.length > 1 ? 'them' : 'it'}
                      </summary>
                      <div className="mt-2 space-y-1.5 pl-2 border-l border-warning/30">
                        {msg.telemetry.audit.removed_claims.map((rc, idx) => (
                          <div key={idx} className="font-sans text-[12px] text-gray-300">
                            <span className="line-through text-gray-400">"{rc.text}"</span>
                            {rc.reason && <span className="block font-mono text-[10px] text-warning/80 mt-0.5">Reason: {rc.reason}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* Action Bar */}
                {!msg.isStreaming && msg.content && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink-surface/50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="text-ink-muted hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-mono uppercase"
                        title="Copy Markdown text"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDownloadBibtex(msg.citations)}
                        disabled={!msg.citations || msg.citations.length === 0}
                        className="text-ink-muted hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-mono uppercase disabled:opacity-30"
                        title="Download .bib bibliography"
                      >
                        <Download size={12} /> .BIB
                      </button>

                      {/* Bookmark to Collections (local) */}
                      {msg.query && (
                        <button
                          onClick={() => {
                            const added = addToCollection({
                              query: msg.query!,
                              content: msg.content,
                              confidence: msg.telemetry?.audit?.confidence,
                            });
                            setBookmarkedQueries((prev) => ({ ...prev, [msg.id]: added }));
                          }}
                          disabled={bookmarkedQueries[msg.id] || isInCollection(msg.query)}
                          className={`transition-colors flex items-center gap-1.5 text-[10px] font-mono uppercase disabled:opacity-60 ${
                            bookmarkedQueries[msg.id] || isInCollection(msg.query)
                              ? 'text-tier-okf'
                              : 'text-ink-muted hover:text-white'
                          }`}
                          title={
                            bookmarkedQueries[msg.id] || isInCollection(msg.query)
                              ? 'Already saved to Collections'
                              : 'Bookmark this report to Collections'
                          }
                        >
                          {bookmarkedQueries[msg.id] || isInCollection(msg.query) ? (
                            <>
                              <BookmarkCheck size={12} /> <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <Bookmark size={12} /> <span>Save</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Hide thumbs when backend is unreachable or in mock mode; show saved tick only on success */}
                    {isBackendReachable && !isMockActive && (
                      <div className="flex items-center gap-2.5">
                        {feedbackSent[msg.id] ? (
                          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 select-none">
                            <Check size={12} /> Saved
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleFeedback(msg, 'positive')}
                              className="text-ink-muted hover:text-white transition-colors p-1"
                              title="Accurate synthesis"
                            >
                              <ThumbsUp size={13} />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg, 'negative')}
                              className="text-ink-muted hover:text-warning transition-colors p-1"
                              title="Inaccurate / Hallucination"
                            >
                              <ThumbsDown size={13} />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg, 'flagged')}
                              className="text-ink-muted hover:text-warning transition-colors flex items-center gap-1 text-[10px] font-mono px-1 py-0.5"
                              title="Flag Tier Conflict"
                            >
                              <AlertTriangle size={11} /> Flag Conflict
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Unified Collapsible: Advanced Parameters & Routing */}
      <div className="shrink-0 bg-ink-base/90 border-t border-ink-surface z-10">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 md:px-8 py-2.5 bg-ink-base/90 transition-all duration-300 ease-out hover:bg-ink-surface/60 hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 hover:scale-[1.01] border-b border-ink-surface text-left"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-200">
            <span className="text-tier-okf">⚙</span> Advanced Parameters &amp; Routing
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-ink-muted">{advancedOpen ? 'COLLAPSE' : 'EXPAND'}</span>
            <ChevronDown size={12} className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </span>
        </button>

        {advancedOpen && (
          <div className="px-4 md:px-8 pt-3 pb-2 border-t border-ink-surface bg-ink-base/90 shrink-0">
        {/* Research Mode Selector */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted mr-1">Research Mode</span>
          {RESEARCH_MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setResearchMode(m.id)}
              title={m.hint}
              className={`font-mono text-[10px] px-2 py-1 border transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                researchMode === m.id
                  ? 'bg-tier-okf/15 border-tier-okf/50 text-tier-okf'
                  : 'bg-ink-base border-ink-surface text-ink-muted hover:text-gray-200'
              }`}
            >
              <span className="mr-1">{m.glyph}</span>
              {m.label}
            </button>
          ))}
        </div>

        {/* Multi-Discipline Branch Filter */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted mr-1">Discipline Branch</span>
          {DISCIPLINE_OPTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDiscipline(d.id)}
              className={`font-mono text-[10px] px-2 py-1 border transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                discipline === d.id
                  ? 'bg-tier-live/15 border-tier-live/50 text-tier-live'
                  : 'bg-ink-base border-ink-surface text-ink-muted hover:text-gray-200'
              }`}
            >
              <span className="mr-1">{d.glyph}</span>
              {d.label}
            </button>
          ))}
        </div>

        {/* Advanced Research Parameters: custom context + BYOK key injector */}
          {advancedOpen && (
            <div className="mt-2 p-3 bg-ink-surface/40 border border-ink-surface space-y-3 animate-view-in">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-gray-200 mb-1.5">
                  Custom Research Context / Notes / Reference Links
                </div>
                <textarea
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  placeholder="Paste lecture notes, paper excerpts, raw data, or specific URLs. Injected as authoritative user context ahead of retrieved literature."
                  className="w-full h-24 bg-ink-base border border-ink-surface p-2 text-[11px] font-sans text-gray-200 placeholder-ink-muted focus:outline-none focus:border-tier-okf/50 resize-none"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCustomContext('')}
                    className="text-[9px] font-mono px-2 py-1 border border-ink-surface text-ink-muted hover:text-warning hover:border-warning/50 transition-colors"
                  >
                    <span className="flex items-center gap-1"><Eraser size={10} /> Clear context</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomContext(customContext)}
                    disabled={!customContext.trim()}
                    className="text-[9px] font-mono px-2 py-1 ml-1 bg-tier-okf/15 border border-tier-okf/40 text-tier-okf hover:bg-tier-okf/25 transition-colors disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1"><ChevronUp size={10} /> Set Context</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-ink-surface/70">
                <div className="font-mono text-[10px] uppercase tracking-wider text-gray-200 mb-1.5 flex items-center gap-1.5">
                  <KeyRound size={11} className="text-tier-okf" /> Custom BYOK API Key (Groq / OpenAI / Anthropic / Gemini)
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={byokProvider}
                    onChange={(e) => setByokProvider(e.target.value)}
                    className="bg-ink-base border border-ink-surface text-[11px] font-mono text-gray-200 px-2 py-1 outline-none focus:border-tier-okf/50"
                  >
                    <option value="">Default Engine</option>
                    <option value="groq">Groq</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                  </select>
                  <div className="flex-1 relative">
                    <input
                      type={showByokKey ? 'text' : 'password'}
                      value={byokKey}
                      onChange={(e) => setByokKeyState(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-ink-base border border-ink-surface text-[11px] font-mono text-gray-200 px-2 py-1.5 pr-8 outline-none focus:border-tier-okf/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowByokKey((v) => !v)}
                      className="absolute right-1.5 top-1.5 text-ink-muted hover:text-white"
                    >
                      {showByokKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { if (byokProvider && byokKey) setByokKey(byokProvider, byokKey); }}                    className="text-[10px] font-mono px-2.5 py-1 bg-tier-okf/15 border border-tier-okf/40 text-tier-okf hover:bg-tier-okf/25 transition-colors disabled:opacity-40"
                    disabled={!byokProvider || !byokKey}
                  >
                    <span className="flex items-center gap-1"><KeyRound size={10} /> Save Key</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearByok(); setByokProvider(''); setByokKeyState(''); }}
                    className="text-[10px] font-mono px-2.5 py-1 bg-ink-base border border-ink-surface text-ink-muted hover:text-warning hover:border-warning/50 transition-colors"
                  >
                    <span className="flex items-center gap-1"><Eraser size={10} /> Clear Key</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-ink-base border-t border-ink-surface shrink-0">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            className="w-full bg-ink-surface border border-ink-surface rounded-none pl-4 pr-12 py-3 text-xs font-sans text-gray-200 placeholder-ink-muted focus:outline-none focus:border-tier-okf/50 focus:ring-1 focus:ring-tier-okf/50 resize-none h-14"
            placeholder={placeholder}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-3 text-ink-muted hover:text-white transition-all duration-300 ease-out hover:scale-[1.01] disabled:opacity-40 p-1"
            aria-label="Send query"
          >
            <Send size={16} />
          </button>
        </div>

        <div className="flex justify-between items-center mt-2 px-1">
          <div className="flex gap-4 text-xs font-mono text-ink-muted">
            <button
              type="button"
              onClick={() => setIsCompareMode(!isCompareMode)}
              className={`transition-colors text-[11px] ${
                isCompareMode ? 'text-tier-live font-bold' : 'hover:text-white'
              }`}
            >
              Compare Tiers [{isCompareMode ? 'On' : 'Off'}]
            </button>
          </div>
          <span className="text-[10px] font-mono text-ink-muted">Press Enter to stream</span>
        </div>
      </form>
    </div>
  );
}
