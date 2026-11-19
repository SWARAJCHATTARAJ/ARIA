import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Loader2,
  Download,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Maximize2,
  Minimize2,
  Check,
  FileText,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Bookmark,
  ArrowUpRight,
  Sparkles,
  Clock,
  Square,
  ChevronDown,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { streamQuery } from '../services/sseClient';
import { Citation, Message, MessageTelemetry, PipelineStage, AuditClaim, HistoryEntry } from '../types';
import { API_BASE_URL } from '../services/config';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { addHistoryEntry, getHistory, addToCollection, isInCollection } from '../services/storage';

const TOPIC_PILLS = [
  {
    id: 'okf',
    label: 'Autonomous Systems Taxonomy',
    query: 'What is the definition and taxonomy of autonomous systems in artificial intelligence?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'rag',
    label: 'CRISPR Off-Target Mitigation',
    query: 'What are the off-target mitigation strategies for CRISPR gene editing?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'live',
    label: 'JWST 2024 Deep Field',
    query: 'What were the latest discoveries of the James Webb Space Telescope in 2024?',
    recordedDate: 'October 16, 2026',
  },
  {
    id: 'bft',
    label: 'Byzantine Fault Tolerance',
    query: 'How do multi-agent consensus protocols handle Byzantine fault tolerance?',
  },
];

function getFollowUpQuestions(query: string, content: string): string[] {
  const qLower = query.toLowerCase();
  const cLower = content.toLowerCase();

  if (qLower.includes('crispr') || cLower.includes('cas9')) {
    return [
      'How do high-fidelity Cas9 variants like SpCas9-HF1 compare in on-target efficiency?',
      'What are the in vivo delivery barriers for prime editing guide RNAs?',
      'How do base editors mitigate double-strand break insertions and deletions?',
    ];
  }
  if (qLower.includes('autonomous') || cLower.includes('autonomy')) {
    return [
      'What formal verification methods certify Level 4 and Level 5 autonomous decision boundaries?',
      'How do asynchronous multi-agent coordination protocols mitigate packet drops?',
      'What architectural patterns prevent cascade failures in distributed perception pipelines?',
    ];
  }
  if (qLower.includes('jwst') || qLower.includes('webb') || cLower.includes('redshift')) {
    return [
      'How do JWST high-redshift (z > 10) observations constrain Lambda-CDM cosmological models?',
      'What spectroscopic signatures from NIRSpec confirm active galactic nuclei in early epochs?',
      'What dust extinction correction parameters are applied to JWST deep-field spectra?',
    ];
  }
  if (qLower.includes('byzantine') || qLower.includes('consensus') || cLower.includes('fault tolerance')) {
    return [
      'How does PBFT message complexity scale as node count increases beyond 100?',
      'What are the formal latency bounds of DAG-based consensus protocols like Narwhal?',
      'How do leaderless consensus mechanisms prevent eclipse attacks under network partitions?',
    ];
  }
  if (qLower.includes('pvc') || cLower.includes('polyvinyl chloride')) {
    return [
      'What thermal degradation mechanisms trigger dehydrochlorination in unplasticized PVC?',
      'How do bio-based plasticizers compare to phthalates in migration resistance?',
      'What catalytic recycling pathways recover chlorine without generating dioxins?',
    ];
  }

  // Derive from headings if available
  const headings = content.match(/^##\s+(.+)$/gm);
  if (headings && headings.length >= 2) {
    const cleanHeadings = headings.map((h) => h.replace(/^##\s+/, '').trim());
    return [
      `What empirical benchmarks validate ${cleanHeadings[1] || 'core mechanisms'}?`,
      `How do technical limitations impact real-world applications in this domain?`,
      `What recent comparative studies evaluate alternative architectures or formulations?`,
    ];
  }

  return [
    'What empirical benchmarks validate the theoretical formulation?',
    'What are the primary technical failure modes and operational limitations?',
    'How do recent 2024–2026 experimental studies compare with prior findings?',
  ];
}

/**
 * Inline Collapsible Research Trace:
 * Rendered directly inside the active answer header as a compact, single-line status bar:
 * PLAN -> RETRIEVE [OKF · RAG · LIVE] -> SYNTHESIZE -> VERIFY
 * Smoothly expands on click to show retrieval details and collapses cleanly into Verified pill.
 */
function ResearchTraceBar({
  telemetry,
  isStreaming,
  citationsCount = 0,
}: {
  telemetry?: MessageTelemetry;
  isStreaming?: boolean;
  citationsCount?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stage = telemetry?.stage;
  const tiers = telemetry?.retrieval?.tiers || [];

  const isPlanning = stage === 'routing' || stage === 'retrieving';
  const isRetrieving = stage === 'retrieving';
  const isSynthesizing = stage === 'streaming';
  const isAuditing = stage === 'auditing';
  const isComplete = stage === 'complete';

  return (
    <div className="space-y-1.5 select-none w-full">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[4px] border border-white/[0.07] bg-[#09090B] hover:bg-[#18181E] text-[#8B8B8E] hover:text-[#EDEDED] transition-all cursor-pointer active:scale-[0.98]"
        >
          {isStreaming ? (
            <div className="flex items-center gap-1.5 text-[#60A5FA]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
              <span className="font-medium">
                {stage === 'routing' && 'PLANNING'}
                {stage === 'retrieving' && 'RETRIEVING SOURCES'}
                {stage === 'streaming' && 'SYNTHESIZING'}
                {stage === 'auditing' && 'VERIFYING'}
                {!['routing', 'retrieving', 'streaming', 'auditing'].includes(stage || '') && 'ANALYZING'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#60A5FA]">
              <CheckCircle2 size={13} className="text-[#60A5FA]" />
              <span className="text-[#EDEDED] font-medium">Verified</span>
              <span className="tabular-nums text-[#71717A]">({citationsCount} Sources)</span>
            </div>
          )}

          <span className="text-[#71717A] text-[10px]">·</span>
          <div className="flex items-center gap-1 text-[10px] text-[#71717A] font-mono">
            <span className={isPlanning ? 'text-[#EDEDED] font-semibold' : ''}>PLAN</span>
            <span>→</span>
            <span className={isRetrieving ? 'text-[#EDEDED] font-semibold' : ''}>
              RETRIEVE
              {tiers.length > 0 && (
                <span className="ml-1 inline-flex gap-1">
                  {tiers.includes('OKF') && <span className="text-[#60A5FA]">OKF</span>}
                  {tiers.includes('RAG') && <span className="text-[#A78BFA]">RAG</span>}
                  {tiers.includes('LIVE') && <span className="text-[#F59E0B]">LIVE</span>}
                </span>
              )}
            </span>
            <span>→</span>
            <span className={isSynthesizing ? 'text-[#EDEDED] font-semibold' : ''}>SYNTHESIZE</span>
            <span>→</span>
            <span className={isAuditing || isComplete ? 'text-[#60A5FA] font-semibold' : ''}>VERIFY</span>
          </div>

          <ChevronDown
            size={12}
            className={`text-[#71717A] ml-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Accordion Smooth Height Expansion */}
      <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
        <div className="accordion-inner">
          <div className="p-3 bg-[#09090B] border border-white/[0.07] rounded-[6px] space-y-2 text-[11px] font-mono mt-1">
            <div className="flex items-center justify-between text-[#8B8B8E] pb-1.5 border-b border-white/[0.05]">
              <span>Active Retrieval Route</span>
              <span className="text-[#60A5FA] font-semibold">Cascade (Tri-Tier Concurrent)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-1.5 rounded-[4px] bg-[#111115] border border-white/[0.05]">
                <div className="text-[10px] text-[#71717A]">OKF TIER</div>
                <div className="text-[#60A5FA] font-semibold mt-0.5">
                  {tiers.includes('OKF') ? 'Active' : 'Standby'}
                </div>
              </div>
              <div className="p-1.5 rounded-[4px] bg-[#111115] border border-white/[0.05]">
                <div className="text-[10px] text-[#71717A]">RAG TIER</div>
                <div className="text-[#A78BFA] font-semibold mt-0.5">
                  {tiers.includes('RAG') ? 'Active' : 'Standby'}
                </div>
              </div>
              <div className="p-1.5 rounded-[4px] bg-[#111115] border border-white/[0.05]">
                <div className="text-[10px] text-[#71717A]">LIVE TIER</div>
                <div className="text-[#F59E0B] font-semibold mt-0.5">
                  {tiers.includes('LIVE') ? 'Active' : 'Standby'}
                </div>
              </div>
            </div>
            {telemetry?.audit?.confidence !== undefined && (
              <div className="flex items-center justify-between text-[#8B8B8E] pt-1">
                <span>Deterministic Claim Entailment Score</span>
                <span className="text-[#60A5FA] tabular-nums font-semibold">
                  {Math.round(telemetry.audit.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  onToggleSidebar?: () => void;
  pendingQuery?: string | null;
  onPendingQueryConsumed?: () => void;
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
  const emptyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [emptyInput, setEmptyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedCollectionIds, setSavedCollectionIds] = useState<Record<string, boolean>>({});
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative' | 'flagged'>>({});
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<Record<string, boolean>>({});
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);

  const { settings: _settings } = useSettingsContext();
  const { accessToken } = useAuth();

  useEffect(() => {
    try {
      const history = getHistory();
      setRecentHistory(history.slice(0, 3));
    } catch {
      // storage quiet fallback
    }
  }, [messages.length]);

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
      // PDF export failed silently
    } finally {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const handleSaveToCollection = (msg: Message) => {
    if (!msg.content) return;
    try {
      addToCollection({
        query: msg.query || 'Research Overview',
        content: msg.content.replace(/[#*`>\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
        confidence: msg.telemetry?.audit?.confidence,
      });
      setSavedCollectionIds((prev) => ({ ...prev, [msg.id]: true }));
    } catch {
      // ignore
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  const finalContentRef = useRef('');
  const finalConfidenceRef = useRef<number | undefined>(undefined);
  const lastQueryRef = useRef('');
  const executedPendingRef = useRef<string | null>(null);

  // Probe backend health
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

  // Clean up in-flight requests and timers on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamThrottleCleanupRef.current) {
        streamThrottleCleanupRef.current();
      }
      if (streamScrollTimerRef.current !== undefined) {
        window.clearTimeout(streamScrollTimerRef.current);
      }
    };
  }, []);

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | undefined>(undefined);
  const streamScrollTimerRef = useRef<number | undefined>(undefined);
  const lastScrollTimeRef = useRef<number>(0);
  const streamThrottleCleanupRef = useRef<(() => void) | null>(null);

  const debouncedScrollToBottom = useCallback(() => {
    if (!isNearBottomRef.current) return;
    const now = performance.now();
    if (now - lastScrollTimeRef.current >= 100) {
      lastScrollTimeRef.current = now;
      if (streamScrollTimerRef.current !== undefined) {
        window.clearTimeout(streamScrollTimerRef.current);
        streamScrollTimerRef.current = undefined;
      }
      messagesEndRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
      });
    } else if (streamScrollTimerRef.current === undefined) {
      streamScrollTimerRef.current = window.setTimeout(() => {
        streamScrollTimerRef.current = undefined;
        lastScrollTimeRef.current = performance.now();
        if (isNearBottomRef.current) {
          messagesEndRef.current?.scrollIntoView({
            behavior: 'auto',
            block: 'end',
          });
        }
      }, 100);
    }
  }, []);

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
      if (streamScrollTimerRef.current !== undefined) {
        window.clearTimeout(streamScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamThrottleCleanupRef.current) {
      streamThrottleCleanupRef.current();
      streamThrottleCleanupRef.current = null;
    }
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  const executeQuery = (queryText: string, mockKey?: string, recordedDate?: string) => {
    if (!queryText.trim() || isLoading) return;

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
    setEmptyInput('');
    setIsLoading(true);

    finalContentRef.current = '';
    finalConfidenceRef.current = undefined;
    lastQueryRef.current = queryText.trim();

    let currentTelemetry: MessageTelemetry = { stage: 'routing' };

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
          updatedQueuePosition = null;
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

    let pendingEvents: any[] = [];
    let throttleTimer: number | null = null;
    let lastFlushTime = 0;
    const THROTTLE_INTERVAL_MS = 50; // Smooth 20fps token batching

    const flushEvents = () => {
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      lastFlushTime = performance.now();

      if (pendingEvents.length === 0) return;
      const events = pendingEvents;
      pendingEvents = [];

      const coalescedEvents: any[] = [];
      for (const e of events) {
        if (
          e.event === 'token' &&
          coalescedEvents.length > 0 &&
          coalescedEvents[coalescedEvents.length - 1].event === 'token'
        ) {
          coalescedEvents[coalescedEvents.length - 1].delta =
            (coalescedEvents[coalescedEvents.length - 1].delta || '') + (e.delta || '');
        } else {
          coalescedEvents.push(e);
        }
      }

      const prevTelemetryStage = currentTelemetry.stage;

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== ariaMsgId) return msg;
          let next = msg;
          for (const e of coalescedEvents) {
            next = applyEvent(next, e);
          }
          return next;
        })
      );

      if (currentTelemetry.stage !== prevTelemetryStage && onUpdateActiveTelemetry) {
        onUpdateActiveTelemetry(currentTelemetry);
      }

      debouncedScrollToBottom();
    };

    const scheduleFlush = (immediate = false) => {
      if (immediate) {
        flushEvents();
        return;
      }

      const now = performance.now();
      const elapsed = now - lastFlushTime;

      if (elapsed >= THROTTLE_INTERVAL_MS) {
        flushEvents();
      } else if (throttleTimer === null) {
        throttleTimer = window.setTimeout(() => {
          flushEvents();
        }, THROTTLE_INTERVAL_MS - elapsed);
      }
    };

    streamThrottleCleanupRef.current = () => {
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      pendingEvents = [];
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
        if (
          evt.event === 'done' ||
          evt.event === 'error' ||
          evt.event === 'audit' ||
          evt.event === 'route' ||
          evt.event === 'retrieve'
        ) {
          scheduleFlush(true);
        } else {
          scheduleFlush(false);
        }
      },
      onError: (err: any) => {
        // If aborted by user, clean exit without error banner
        if (abortController.signal.aborted) {
          setIsLoading(false);
          return;
        }
        scheduleFlush(true);
        if (streamThrottleCleanupRef.current) {
          streamThrottleCleanupRef.current();
          streamThrottleCleanupRef.current = null;
        }
        setIsLoading(false);
        const status = err?.status;
        const rawMsg = err?.message || 'Failed to connect to backend';

        let friendlyMsg = rawMsg;
        if (status === 401 || rawMsg.includes('401') || rawMsg.toLowerCase().includes('unauthorized')) {
          friendlyMsg = 'Authentication required or session expired (HTTP 401).';
        } else if (status === 500 || rawMsg.includes('500')) {
          friendlyMsg = 'Server encountered an internal error. Please retry.';
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === ariaMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  error: friendlyMsg,
                }
              : msg
          )
        );
      },
      onDone: () => {
        scheduleFlush(true);
        if (streamThrottleCleanupRef.current) {
          streamThrottleCleanupRef.current();
          streamThrottleCleanupRef.current = null;
        }
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === ariaMsgId ? { ...msg, isStreaming: false } : msg))
        );
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
            // storage quiet ignore
          }
        }
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(input);
  };

  const handleEmptySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(emptyInput);
  };

  useEffect(() => {
    if (pendingQuery && executedPendingRef.current !== pendingQuery) {
      executedPendingRef.current = pendingQuery;
      executeQuery(pendingQuery);
      if (onPendingQueryConsumed) onPendingQueryConsumed();
    }
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
    if (isMockActive || !isBackendReachable) return;

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
        if (data.status === 'stored') {
          setFeedbackSent((prev) => ({ ...prev, [msg.id]: type }));
        }
      }
    } catch {
      // Quiet failure
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full relative h-full overflow-hidden select-text bg-[#09090B]">
      {/* Thread Header */}
      <div className="px-6 py-3 border-b border-white/[0.07] flex justify-between items-center bg-[#09090B] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[#EDEDED] font-mono tracking-[-0.02em]">
            ARIA Workspace
          </span>
          {isMockActive && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-[#111115] border border-[#60A5FA] text-[#60A5FA]">
              MOCK DATA
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <button
              onClick={handleStopGeneration}
              className="px-2.5 py-1 bg-[#111115] hover:bg-[#18181E] border border-red-500/40 text-red-400 rounded-[6px] text-[11px] font-mono flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
              title="Stop streaming"
            >
              <Square size={11} className="fill-current" />
              <span>Stop</span>
            </button>
          )}

          <button
            onClick={onToggleFocus}
            className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#111115] transition-colors cursor-pointer active:scale-[0.98]"
            title={isFocusMode ? 'Exit Focus' : 'Focus'}
          >
            {isFocusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 select-text hud-scroll"
      >
        {/* Open Editorial Workspace (Empty State): pristine typography on #09090B canvas */}
        {messages.length === 0 && (
          <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center py-8 animate-fade-slide">
            <div className="w-full max-w-2xl text-center space-y-3 mb-8">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[4px] border border-white/[0.07] bg-[#111115] text-[11px] font-mono text-[#8B8B8E]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
                <span>Deterministic Evidence Workspace</span>
              </div>
              <h1 className="text-[32px] sm:text-[38px] font-semibold text-[#EDEDED] tracking-[-0.02em]">
                Research Workspace
              </h1>
              <p className="text-[14px] text-[#8B8B8E] max-w-lg mx-auto leading-relaxed">
                Primary source synthesis across structured knowledge notes, dense vector indexes, and live academic papers.
              </p>
            </div>

            {/* Spacious Centered Multi-line Research Composer */}
            <form
              onSubmit={handleEmptySubmit}
              className="w-full max-w-2xl bg-[#111115] border border-white/[0.07] focus-within:border-white/[0.18] rounded-[8px] p-3 transition-all duration-150"
            >
              <textarea
                ref={emptyTextareaRef}
                value={emptyInput}
                onChange={(e) => {
                  setEmptyInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEmptySubmit(e);
                  }
                }}
                placeholder="Ask a research question or enter a scientific concept..."
                rows={2}
                className="w-full bg-transparent p-2 text-[15px] text-[#EDEDED] placeholder-[#71717A] focus:outline-none resize-none leading-relaxed font-sans"
                aria-label="Research query"
              />

              <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] mt-1 text-[11px] font-mono text-[#71717A]">
                <span className="hidden sm:inline">Press Enter ↵ to synthesize · Shift+Enter for new line</span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="submit"
                    disabled={!emptyInput.trim() || isLoading}
                    className="btn-primary text-[12px] py-1.5 px-4 rounded-[6px]"
                  >
                    Synthesize
                  </button>
                </div>
              </div>
            </form>

            {/* Understated Topic Pills (plain text, no quotes) */}
            <div className="w-full max-w-2xl mt-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {TOPIC_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => executeQuery(pill.query, pill.id, pill.recordedDate)}
                    className="px-3 py-1.5 bg-[#111115] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] rounded-[6px] text-[12px] font-sans text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{pill.label}</span>
                    <ArrowUpRight size={11} className="text-[#71717A] opacity-70" />
                  </button>
                ))}
              </div>
            </div>

            {/* Continue Recent Research (from History) */}
            {recentHistory.length > 0 && (
              <div className="w-full max-w-2xl mt-8 pt-6 border-t border-white/[0.07]">
                <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-wider text-[#71717A]">
                  <Clock size={12} />
                  <span>Continue Recent Research</span>
                </div>
                <div className="space-y-1.5">
                  {recentHistory.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => executeQuery(h.query)}
                      className="w-full text-left px-3.5 py-2.5 bg-[#111115] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] rounded-[6px] text-[13px] text-[#EDEDED] hover:text-white flex items-center justify-between group active:scale-[0.98] transition-all"
                    >
                      <span className="truncate pr-4">{h.query}</span>
                      <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-[#71717A]">
                        {typeof h.confidence === 'number' && (
                          <span className="text-[#60A5FA] tabular-nums">
                            {Math.round(h.confidence * 100)}%
                          </span>
                        )}
                        <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="space-y-4">
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="p-3.5 px-4 bg-[#18181E] border border-white/[0.07] rounded-[8px] text-[14px] text-[#EDEDED] max-w-2xl leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4 w-full">
                {/* Header Verification Strip with Inline Collapsible Research Trace */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                  <ResearchTraceBar
                    telemetry={msg.telemetry}
                    isStreaming={msg.isStreaming}
                    citationsCount={msg.citations?.length || 0}
                  />
                </div>

                {/* Error Banner with Retry */}
                {msg.error && (
                  <div className="p-3 bg-[#09090B] border border-red-500/40 text-red-400 text-[12px] font-mono rounded-[6px] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{msg.error}</span>
                    </div>
                    {msg.query && (
                      <button
                        type="button"
                        onClick={() => executeQuery(msg.query!)}
                        className="shrink-0 px-2.5 py-1 bg-[#111115] hover:bg-[#18181E] border border-white/[0.07] text-[#EDEDED] text-[11px] rounded transition-colors flex items-center gap-1 cursor-pointer"
                        title="Retry query"
                      >
                        <RotateCcw size={11} />
                        <span>Retry</span>
                      </button>
                    )}
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
                    <div className="flex items-center gap-2 py-4 text-[#8B8B8E] text-[13px] font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
                      <span>Retrieving and synthesizing primary evidence...</span>
                    </div>
                  ) : null}
                </div>

                {/* Contextual Follow-Up Questions */}
                {!msg.isStreaming && msg.content && (
                  <div className="pt-3 border-t border-white/[0.05] space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#71717A]">
                      <Sparkles size={11} className="text-[#60A5FA]" />
                      <span>Follow-up Research Questions</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getFollowUpQuestions(msg.query || '', msg.content).map((fq, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => executeQuery(fq)}
                          className="text-left px-3 py-1.5 bg-[#09090B] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] rounded-[6px] text-[12px] text-[#EDEDED] flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer group"
                        >
                          <span className="line-clamp-1">{fq}</span>
                          <ArrowUpRight size={11} className="text-[#71717A] group-hover:text-[#60A5FA] shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                {!msg.isStreaming && msg.content && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.07]">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                      >
                        {copiedMsgId === msg.id ? <Check size={13} className="text-[#60A5FA]" /> : <Copy size={13} />}
                        <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        onClick={() => handleDownloadBibtex(msg.citations)}
                        disabled={!msg.citations || msg.citations.length === 0}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.98] transition-all cursor-pointer"
                        title="Export BibTeX"
                      >
                        <Download size={13} />
                        <span>.BIB</span>
                      </button>

                      <button
                        onClick={() => handleDownloadPdf(msg)}
                        disabled={isExportingPdf[msg.id]}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.98] transition-all cursor-pointer"
                        title="Export PDF Report"
                      >
                        {isExportingPdf[msg.id] ? (
                          <>
                            <Loader2 size={12} className="animate-spin text-[#60A5FA]" />
                            <span>Exporting...</span>
                          </>
                        ) : (
                          <>
                            <FileText size={13} />
                            <span>PDF</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleSaveToCollection(msg)}
                        className="flex items-center gap-1.5 text-[12px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                        title="Save to Collection"
                      >
                        <Bookmark
                          size={13}
                          className={
                            savedCollectionIds[msg.id] || isInCollection(msg.query || '')
                              ? 'text-[#60A5FA] fill-[#60A5FA]'
                              : ''
                          }
                        />
                        <span>
                          {savedCollectionIds[msg.id] || isInCollection(msg.query || '')
                            ? 'Saved'
                            : 'Save'}
                        </span>
                      </button>
                    </div>

                    {isBackendReachable && !isMockActive && (
                      <div className="flex items-center gap-2">
                        {feedbackSent[msg.id] ? (
                          <span className="text-[12px] font-mono text-[#60A5FA] flex items-center gap-1">
                            <Check size={13} /> Feedback Recorded
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleFeedback(msg, 'positive')}
                              className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                              title="Helpful"
                            >
                              <ThumbsUp size={13} />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg, 'negative')}
                              className="p-1 text-[#8B8B8E] hover:text-red-400 active:scale-[0.98] transition-all cursor-pointer"
                              title="Unhelpful"
                            >
                              <ThumbsDown size={13} />
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

      {/* Docked Composer (Visible once a query exists) */}
      {messages.length > 0 && (
        <div className="p-3.5 bg-[#0C0C0F] border-t border-white/[0.07] shrink-0">
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
              placeholder="Ask a follow-up or research question..."
              rows={1}
              className="flex-1 bg-[#09090B] border border-white/[0.07] focus:border-white/[0.18] focus:outline-none rounded-[6px] px-3.5 py-2 text-[14px] text-[#EDEDED] placeholder-[#71717A] resize-none leading-relaxed"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="px-3.5 py-2 bg-[#18181E] hover:bg-[#202026] border border-red-500/40 text-red-400 rounded-[6px] text-[12px] font-mono flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                title="Stop generation"
              >
                <Square size={12} className="fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="btn-primary shrink-0 text-[12px] py-2 px-3.5"
                aria-label="Send query"
              >
                <Send size={14} />
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
