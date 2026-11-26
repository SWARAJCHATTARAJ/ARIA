import { useState, Suspense, lazy, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';
import { HistoryView, CollectionsView, OkfSpaceView, SettingsView } from './components/HubViews';
import { MobileTopBar } from './components/ui/MobileNavBar';
import CommandPalette from './components/ui/CommandPalette';
import { AuditClaim, Citation, MessageTelemetry } from './types';
import { AuthProvider, useAuth, isNativeRuntime } from './context/AuthContext';
import { SettingsProvider, useSettingsStore } from './context/SettingsContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import LoginScreen from './components/LoginScreen';
import AuthModal from './components/ui/AuthModal';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { recordSourceExplored } from './utils/researchPulse';
import { Loader2, X, Keyboard } from 'lucide-react';

const MarkdownTestHarness = lazy(() => import('./components/MarkdownTestHarness'));

/** Offline connection banner — obsidian matte, never flashes white. */
function ConnectivityBanner() {
  const offline = !useOnlineStatus();

  if (!offline) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] aria-matte border-b border-tier-live/40 safe-pt flex items-center justify-center gap-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-tier-live aria-cascade"
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-tier-live animate-pulse" />
      Offline — session persisted · reconnecting when available
    </div>
  );
}

export default function App() {
  // Dev-only manual test page at /?test=md
  const isTestMode =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === 'md';

  if (isTestMode) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-ink-base text-gray-400 p-8 font-mono text-xs">Loading Test Harness...</div>}>
        <MarkdownTestHarness />
      </Suspense>
    );
  }

  return (
    <AuthProvider>
      <SettingsProvider>
        <ErrorBoundary surface="Workspace">
          <ConnectivityBanner />
          <RootGate />
        </ErrorBoundary>
      </SettingsProvider>
    </AuthProvider>
  );
}

function RootGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090B] flex flex-col items-center justify-center gap-3 select-none">
        <Loader2 size={18} className="animate-spin text-[#52525B]" />
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#52525B]">
          Restoring session
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppShell />;
}

const DESKTOP_SHORTCUTS = [
  { keys: '/', desc: 'Focus research prompt bar' },
  { keys: '⌘ / Ctrl + K', desc: 'Start a fresh research thread' },
  { keys: '⌘ / Ctrl + P', desc: 'Open quick command palette' },
  { keys: '[  /  ]', desc: 'Step backward / forward through cited sources' },
  { keys: '⌘ / Ctrl + ]', desc: 'Toggle Research Inspector drawer' },
  { keys: '⌘ / Ctrl + B', desc: 'Collapse or expand navigation rail' },
  { keys: 'Esc', desc: 'Close active modal, popover, or drawer' },
];

function AppShell() {
  const { settings } = useSettingsStore();
  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('query');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);
  const [isMockActive, setIsMockActive] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [threadResetCounter, setThreadResetCounter] = useState(0);

  // Query handed over from History -> New question
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // Active query state shared with SourcePanel
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<MessageTelemetry | undefined>(undefined);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);
  const [highlightedEvidenceQuote, setHighlightedEvidenceQuote] = useState<string | null>(null);
  const [hasActiveError, setHasActiveError] = useState<boolean>(false);

  const startNewThread = useCallback(() => {
    setPendingQuery(null);
    setHasQuery(false);
    setActiveCitations([]);
    setActiveTelemetry(undefined);
    setSelectedCitationId(null);
    setHighlightedEvidenceQuote(null);
    setHasActiveError(false);
    setThreadResetCounter((c) => c + 1);
    setActiveTab('query');
    setIsMobileDrawerOpen(false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('aria:focus-composer'));
    }, 40);
  }, []);

  // Power-user desktop keyboard shortcuts: /, Esc, Cmd/Ctrl+K (new thread), [ and ], Cmd/Ctrl+B, ?
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewThread();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsRailCollapsed((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.code === 'BracketRight')) {
        e.preventDefault();
        setSourcePanelOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setIsCommandPaletteOpen(false);
        setIsMobileDrawerOpen(false);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (window.innerWidth < 1024) {
          setSourcePanelOpen(false);
        }
        return;
      }

      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setActiveTab('query');
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('aria:focus-composer'));
        }, 20);
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      } else if ((e.key === '[' || e.key === ']') && activeCitations.length > 0) {
        e.preventDefault();
        setSourcePanelOpen(true);
        const ids = activeCitations.map((c) => c.id);
        const curIdx = selectedCitationId !== null ? ids.indexOf(selectedCitationId) : -1;
        const nextIdx =
          e.key === ']'
            ? curIdx === -1
              ? 0
              : (curIdx + 1) % ids.length
            : curIdx <= 0
            ? ids.length - 1
            : curIdx - 1;
        setSelectedCitationId(ids[nextIdx]);
        setHighlightedEvidenceQuote(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCitations, selectedCitationId, startNewThread]);

  // Click-to-Proof sync: open Inspector directly to Sources, highlight exact evidence_quote
  const handleCitationClick = useCallback((citation: Citation, claim?: AuditClaim) => {
    setSelectedCitationId(citation.id);
    setHighlightedEvidenceQuote(claim?.evidence_quote || claim?.evidence || null);
    setSourcePanelOpen(true);
    recordSourceExplored();
  }, []);

  const handleOpenQuery = useCallback((query: string) => {
    setPendingQuery(query);
    setActiveTab('query');
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setIsMobileDrawerOpen(false);
  }, []);

  const handleSourcesExpand = useCallback(() => {
    setSourcePanelOpen(true);
  }, []);

  const handleToggleInspector = useCallback(() => {
    setSourcePanelOpen((prev) => !prev);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSourcePanelOpen(false);
  }, []);

  const handleOpenDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  return (
    <div
      data-runtime={isNativeRuntime ? 'native' : 'web'}
      data-preset={settings.themePreset}
      className="flex flex-col md:flex-row h-[100dvh] min-h-[100dvh] bg-[#09090B] text-[#EDEDED] font-sans overflow-hidden relative select-none"
    >
      {/* Mobile Top Bar (< 768px): Unified minimal 48px header */}
      <MobileTopBar
        activeTab={activeTab}
        hasQuery={hasQuery}
        isInspectorOpen={isSourcePanelOpen}
        onTabChange={handleTabChange}
        onOpenDrawer={handleOpenDrawer}
        onNewQuestion={startNewThread}
        onToggleInspector={handleToggleInspector}
      />

      {/* Mobile Slide-Over Navigation Drawer (< 768px) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-200 ${
          isMobileDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleCloseDrawer}
        aria-hidden={!isMobileDrawerOpen}
      />
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-[#0C0C0F] border-r border-white/[0.07] overflow-y-auto overscroll-contain will-change-transform ${
          isMobileDrawerOpen ? 'aria-drawer-open' : 'aria-drawer'
        } ${isMobileDrawerOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!isMobileDrawerOpen}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      </aside>

      {/* Desktop Sidebar (>= 768px md:block): fluid GPU-accelerated collapsible */}
      <div className="hidden md:block shrink-0 h-full bg-[#0C0C0F]">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          collapsed={isRailCollapsed}
          onToggleCollapsed={() => setIsRailCollapsed((prev) => !prev)}
        />
      </div>

      {/* Center Thread Workspace */}
      <ErrorBoundary surface="Workspace">
        <main
          key={activeTab}
          className="flex-1 flex flex-col h-full md:border-r border-white/[0.07] bg-[#09090B] transition-all w-full overflow-hidden animate-fade-slide relative"
        >
          {activeTab === 'query' && (
            <ThreadView
              key={threadResetCounter}
              onCitationClick={handleCitationClick}
              isFocusMode={isFocusMode}
              onToggleFocus={() => setIsFocusMode(!isFocusMode)}
              onQueryStateChange={setHasQuery}
              onUpdateActiveTelemetry={setActiveTelemetry}
              onUpdateActiveCitations={setActiveCitations}
              onMockStateChange={setIsMockActive}
              activeTelemetry={activeTelemetry}
              activeCitations={activeCitations}
              isMockActive={isMockActive}
              pendingQuery={pendingQuery}
              onPendingQueryConsumed={() => setPendingQuery(null)}
              onSourcesExpand={handleSourcesExpand}
              onToggleSidebar={handleOpenDrawer}
              isInspectorOpen={isSourcePanelOpen}
              onToggleInspector={handleToggleInspector}
              onQueryErrorChange={setHasActiveError}
              onOpenShortcuts={() => setShowShortcutsModal(true)}
            />
          )}
          {activeTab === 'history' && <HistoryView onOpenQuery={handleOpenQuery} />}
          {activeTab === 'collections' && <CollectionsView />}
          {activeTab === 'okf' && <OkfSpaceView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </ErrorBoundary>

      {/* Right Source Panel / Research Inspector */}
      {isSourcePanelOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-200"
            onClick={handleCloseInspector}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm lg:relative lg:w-96 h-full bg-[#111115] border-l border-white/[0.07] flex-shrink-0 right-sidebar-smooth overscroll-contain will-change-transform">
            <SourcePanel
              onClose={handleCloseInspector}
              activeQuery={hasQuery}
              citations={activeCitations}
              telemetry={activeTelemetry}
              selectedCitationId={selectedCitationId}
              highlightedEvidenceQuote={highlightedEvidenceQuote}
              onSelectCitation={(id, quote) => {
                setSelectedCitationId(id);
                setHighlightedEvidenceQuote(quote ?? null);
              }}
              isMockActive={isMockActive}
              hasError={hasActiveError}
            />
          </aside>
        </>
      )}

      {/* Desktop Keyboard Shortcuts Cheat-Sheet Modal */}
      {showShortcutsModal && (
        <div
          className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-full max-w-md p-5 bg-[#111115] border border-white/[0.10] rounded-[10px] shadow-2xl space-y-4 animate-fade-slide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.07]">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#EDEDED]">
                <Keyboard size={15} className="text-[var(--aria-accent)]" />
                <span>Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded hover:bg-[#18181E] cursor-pointer"
                aria-label="Close shortcuts"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2">
              {DESKTOP_SHORTCUTS.map((sc) => (
                <div key={sc.keys} className="flex items-center justify-between text-[12px]">
                  <span className="text-[#8B8B8E]">{sc.desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#09090B] border border-white/[0.1] font-mono text-[11px] text-[#EDEDED]">
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <AuthModal />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleTabChange}
        onStartQuery={(q) => handleOpenQuery(q)}
      />
    </div>
  );
}
