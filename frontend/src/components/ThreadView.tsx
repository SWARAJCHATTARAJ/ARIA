import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Download, Copy, ThumbsUp, ThumbsDown, Maximize2, Minimize2, Check, StopCircle, FileText, CheckCircle2 } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { streamQuery } from '../services/sseClient';
import { Citation, Message, MessageTelemetry, PipelineStage, AuditClaim } from '../types';
import { API_BASE_URL } from '../services/config';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { addHistoryEntry } from '../services/storage';

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
  /** query handed over from History -> New question */
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
  activeTelemetry,
  activeCitations: _activeCitations,
  isMockActive = false,
  onToggleSidebar: _onToggleSidebar,
  pendingQuery,
  onPendingQueryConsumed,
  onSourcesExpand: _onSourcesExpand,
}: ThreadViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative' | 'flagged'>>({});
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<Record<string, boolean>>({});

  // Read interface settings once from global SettingsContext (density + motion only)
  const { settings: _settings } = useSettingsContext();
  const { accessToken } = useAuth();

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
      const exportHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        exportHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch(`${API_BASE_URL}/api/export/pdf`, {
        method: 'POST',
        headers: exportHeaders,
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
    } catch {
      // PDF export failed silently — flag clears in finally below
    } finally {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);
  // Clear pending copy-feedback timers when the thread unmounts (tab switches
  // remount this component — never let a timer fire on a dead instance).
  useEffect(
    () => () => {
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    },
    []
  );
  // Capture final stream values for the history save at onDone (state not readable synchronously)
  const finalContentRef = useRef('');
  const finalConfidenceRef = useRef<number | undefined>(undefined);
  const lastQueryRef = useRef('');
  const executedPendingRef = useRef<string | null>(null);

  // Real-time millisecond telemetry lives in isolated <LiveElapsed> chips
  // (own interval, own re-render) so streaming ticks never re-render the
  // whole thread view.

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

  // Inform parent when queries exist
  useEffect(() => {
    if (onQueryStateChange) {
      onQueryStateChange(messages.length > 0);
    }
  }, [messages.length, onQueryStateChange]);

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Autoscroll: only follow the stream while the user is already near the
  // bottom (no smooth-scroll fight), throttled through requestAnimationFrame.
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (scrollRafRef.current !== undefined) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = undefined;
        isNearBottomRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (scrollRafRef.current !== undefined) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    const streaming = messages.some((m) => m.isStreaming);
    messagesEndRef.current?.scrollIntoView({
      behavior: streaming ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages]);

  // Typewriter placeholder: mutated directly on the textarea element (zero
  // React re-renders — placeholder text changes don't change React state).
  // The recursive chain is fully cleared on unmount (prevents stacked
  // zombie loops that freeze the tab) and idles when the tab is hidden.
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
    let alive = true;
    let timerId: number | undefined;

    const tick = () => {
      if (!alive) return;

      if (document.hidden) {
        // idle frame — keep the chain alive but never work while hidden
        timerId = window.setTimeout(tick, 500);
        return;
      }

      const currentPrompt = prompts[pIdx];
      if (isDeleting) {
        cIdx--;
      } else {
        cIdx++;
      }

      const shown = currentPrompt.substring(0, Math.max(cIdx, 0));
      textareaRef.current?.setAttribute('placeholder', shown);

      let nextSpeed = isDeleting ? 25 : 45;

      if (!isDeleting && cIdx >= currentPrompt.length) {
        nextSpeed = 2200;
        isDeleting = true;
      } else if (isDeleting && cIdx <= 0) {
        isDeleting = false;
        pIdx = (pIdx + 1) % prompts.length;
        nextSpeed = 500;
      }

      timerId = window.setTimeout(tick, nextSpeed);
    };

    timerId = window.setTimeout(tick, 500);
    return () => {
      alive = false;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
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

    let currentTelemetry: MessageTelemetry = { stage: 'routing' };

    // Reducer: apply one SSE event to the streaming message document
    const applyEvent = (msg: Message, evt: any): Message => {
      const updatedTelemetry = { ...(msg.telemetry || currentTelemetry) };
      let updatedContent = msg.content;
      let updatedCitations = msg.citations ? [...msg.citations] : [];
      let updatedQueuePosition: number | null = msg.queuePosition ?? null;

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
          break;

        case 'done':
          updatedTelemetry.stage = 'complete';
          currentTelemetry = updatedTelemetry;
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
          currentTelemetry = updatedTelemetry;
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

      return {
        ...msg,
        content: updatedContent,
        citations: updatedCitations,
        telemetry: updatedTelemetry,
        queuePosition: updatedQueuePosition,
      };
    };

    // rAF-batched event application: coalesce bursty SSE token events into a
    // single setMessages per animation frame (prevents re-render storms).
    let pendingEvents: any[] = [];
    let flushScheduled = false;
    const flushEvents = () => {
      flushScheduled = false;
      if (pendingEvents.length === 0) return;
      const events = pendingEvents;
      pendingEvents = [];
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== ariaMsgId) return msg;
          let next = msg;
          for (const e of events) {
            next = applyEvent(next, e);
          }
          return next;
        })
      );
      if (onUpdateActiveTelemetry) onUpdateActiveTelemetry(currentTelemetry);
    };

    if (onUpdateActiveCitations) onUpdateActiveCitations([]);
    if (onUpdateActiveTelemetry) onUpdateActiveTelemetry(currentTelemetry);

    const streamHeaders: Record<string, string> = {};
    if (accessToken) {
      streamHeaders['Authorization'] = `Bearer ${accessToken}`;
    }

    streamQuery({
      query: queryText.trim(),
      compareMode: false,
      signal: abortController.signal,
      mockFixtureKey: mockKey,
      customHeaders: streamHeaders,

      onMockState: (isMock) => {
        if (onMockStateChange) onMockStateChange(isMock);
      },
      onEvent: (evt) => {
        pendingEvents.push(evt);
        if (!flushScheduled) {
          flushScheduled = true;
          window.requestAnimationFrame(flushEvents);
        }
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
        if (!isMockActive && !mockKey && finalContentRef.current) {
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
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedMsgId(null), 2000);
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
      const feedbackHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        feedbackHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: feedbackHeaders,
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
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full relative h-full overflow-hidden select-text bg-[#0A0A0B]">
      {/* Thread Header */}
      <div className="px-6 py-4 border-b border-[#262629] flex justify-between items-center bg-[#141416] shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[#EDEDED]">
            New Question
          </h2>
          {isMockActive && (
            <span className="text-[12px] font-mono px-2 py-0.5 rounded-[4px] bg-[#0A0A0B] border border-[#34D399] text-[#34D399]">
              MOCK DATA
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <button
              onClick={handleStopGeneration}
              className="px-3 py-1 bg-transparent hover:bg-[#1B1B1E] border border-[#EF4444]/40 text-[#EF4444] rounded-[6px] text-[12px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Stop streaming"
            >
              <StopCircle size={14} /> Stop
            </button>
          )}

          <button
            onClick={onToggleFocus}
            className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#1B1B1E] transition-colors cursor-pointer"
            title={isFocusMode ? "Exit Focus" : "Focus"}
          >
            {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 select-text hud-scroll"
      >
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-xl bg-[#141416] border border-[#262629] rounded-[8px] p-8 space-y-4">
              <h3 className="text-[24px] font-semibold text-[#EDEDED]">
                Ask a Research Question
              </h3>
              <p className="text-[14px] text-[#8B8B8E] leading-relaxed">
                Multi-tier synthesis across structured notes, vector search, and academic papers with primary source citations.
              </p>
              <div className="space-y-2 pt-2">
                {EXAMPLE_QUERIES.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => executeQuery(item.query, item.id, item.recordedDate)}
                    className="w-full text-left p-3 bg-[#0A0A0B] border border-[#262629] hover:border-[#38383C] rounded-[6px] text-[14px] text-[#8B8B8E] hover:text-[#EDEDED] transition-colors"
                  >
                    "{item.query}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="space-y-4">
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="p-4 bg-[#141416] border border-[#262629] rounded-[8px] text-[14px] text-[#EDEDED] max-w-2xl leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-[#141416] border border-[#262629] rounded-[8px] space-y-4 w-full">
                {/* Header Verification Strip */}
                <div className="flex items-center justify-between pb-3 border-b border-[#262629] text-[12px] font-mono text-[#8B8B8E]">
                  <div className="flex items-center gap-3">
                    {msg.isStreaming ? (
                      <div className="flex items-center gap-2 text-[#5E8BFF]">
                        <Loader2 size={14} className="animate-spin" />
                        <span>{getStageLabel(msg.telemetry?.stage)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[#34D399]">
                        <CheckCircle2 size={14} />
                        <span>Verified ({msg.citations?.length || 0} Sources)</span>
                      </div>
                    )}
                  </div>

                  {!msg.isStreaming && msg.content && (
                    <button
                      onClick={() => handleDownloadPdf(msg)}
                      disabled={isExportingPdf[msg.id]}
                      className="px-3 py-1 bg-transparent hover:bg-[#0A0A0B] border border-[#262629] hover:border-[#38383C] text-[#EDEDED] text-[12px] font-mono rounded-[6px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isExportingPdf[msg.id] ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <>
                          <FileText size={12} />
                          <span>PDF Report</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Error Banner */}
                {msg.error && (
                  <div className="p-3 bg-[#0A0A0B] border border-[#EF4444]/40 text-[#EF4444] text-[12px] font-mono rounded-[6px]">
                    Error: {msg.error}
                  </div>
                )}

                {/* Markdown Content */}
                <div className="text-[14px] text-[#EDEDED] leading-relaxed">
                  {msg.content ? (
                    <MarkdownRenderer
                      content={msg.content}
                      citations={msg.citations}
                      onCitationClick={onCitationClick}
                      isStreaming={msg.isStreaming}
                      auditClaims={msg.telemetry?.audit?.claims?.filter((c): c is AuditClaim => typeof c === 'object' && c !== null)}
                      answerFinal={msg.telemetry?.audit?.answer_final}
                    />
                  ) : msg.isStreaming ? (
                    <div className="flex items-center gap-2 py-4 text-[#8B8B8E] text-[14px]">
                      <Loader2 size={16} className="animate-spin text-[#5E8BFF]" />
                      <span>Synthesizing response from primary sources...</span>
                    </div>
                  ) : null}
                </div>

                {/* Action Bar */}
                {!msg.isStreaming && msg.content && (
                  <div className="flex items-center justify-between pt-3 border-t border-[#262629]">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] transition-colors"
                      >
                        {copiedMsgId === msg.id ? <Check size={14} className="text-[#34D399]" /> : <Copy size={14} />}
                        <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => handleDownloadBibtex(msg.citations)}
                        disabled={!msg.citations || msg.citations.length === 0}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] transition-colors disabled:opacity-40"
                      >
                        <Download size={14} />
                        <span>.BIB</span>
                      </button>
                    </div>

                    {isBackendReachable && !isMockActive && (
                      <div className="flex items-center gap-2">
                        {feedbackSent[msg.id] ? (
                          <span className="text-[12px] font-mono text-[#34D399] flex items-center gap-1">
                            <Check size={14} /> Saved
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleFeedback(msg, 'positive')}
                              className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] transition-colors"
                              title="Helpful"
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg, 'negative')}
                              className="p-1 text-[#8B8B8E] hover:text-[#EF4444] transition-colors"
                              title="Unhelpful"
                            >
                              <ThumbsDown size={14} />
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

      {/* Prompt Input Box */}
      <div className="p-4 bg-[#141416] border-t border-[#262629] shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a research question..."
            rows={1}
            className="flex-1 bg-[#0A0A0B] border border-[#262629] focus:border-[#5E8BFF] focus:outline-none rounded-[6px] px-4 py-2.5 text-[14px] text-[#EDEDED] placeholder-[#8B8B8E] resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="btn-primary shrink-0"
            aria-label="Send query"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}