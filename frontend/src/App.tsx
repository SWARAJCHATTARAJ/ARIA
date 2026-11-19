import React, { useState, Suspense, lazy, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';
import { HistoryView, CollectionsView, OkfSpaceView, SettingsView } from './components/HubViews';
import { MobileTopBar, MobileBottomNav } from './components/ui/MobileNavBar';
import CommandPalette from './components/ui/CommandPalette';
import { Citation, MessageTelemetry } from './types';
import { AuthProvider, useAuth, isNativeRuntime } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import LoginScreen from './components/LoginScreen';
import AuthModal from './components/ui/AuthModal';
import { Loader2 } from 'lucide-react';

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
        <ConnectivityBanner />
        <RootGate />
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

function AppShell() {
  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('query');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);
  const [isMockActive, setIsMockActive] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);

  // Query handed over from History -> New question
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // Active query state shared with SourcePanel
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<MessageTelemetry | undefined>(undefined);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);
  const [hasActiveError, setHasActiveError] = useState<boolean>(false);

  // Global Ctrl+K / Cmd+K listener and Ctrl+B / Cmd+B sidebar toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsRailCollapsed((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.code === 'BracketRight')) {
        e.preventDefault();
        setSourcePanelOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Stable handlers (useCallback) — memoized children deep in the tree
  // (MarkdownRenderer, SourcePanel, Sidebar) skip re-renders while streaming.
  const handleCitationClick = useCallback((citation: Citation) => {
    setSelectedCitationId(citation.id);
    setSourcePanelOpen(true);
  }, []);

  const handleOpenQuery = useCallback((query: string) => {
    setPendingQuery(query);
    setActiveTab('query');
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    // Close the slide-over drawer on navigation
    setIsMobileDrawerOpen(false);
  }, []);

  const handleSourcesExpand = useCallback(() => {
    setSourcePanelOpen(true);
  }, []);

  return (
    <div
      data-runtime={isNativeRuntime ? 'native' : 'web'}
      className="flex flex-col md:flex-row h-[100dvh] min-h-[100dvh] bg-[#09090B] text-[#EDEDED] font-sans overflow-hidden relative select-none"
    >
      {/* Mobile Top Bar (< 768px) */}
      <MobileTopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenDrawer={() => setIsMobileDrawerOpen(true)}
      />

      {/* Mobile Slide-Over Navigation Drawer (< 768px) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
          isMobileDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileDrawerOpen(false)}
        aria-hidden={!isMobileDrawerOpen}
      />
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 h-full w-64 max-w-[85vw] bg-[#0C0C0F] border-r border-white/[0.07] safe-pt safe-pb overflow-y-auto ${
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
      <main
        key={activeTab}
        className="flex-1 flex flex-col h-full md:border-r border-white/[0.07] bg-[#09090B] transition-all w-full overflow-hidden pb-14 md:pb-0 animate-fade-slide relative"
      >
        {activeTab === 'query' && (
          <ThreadView
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
            onToggleSidebar={() => setIsMobileDrawerOpen(true)}
            isInspectorOpen={isSourcePanelOpen}
            onToggleInspector={() => setSourcePanelOpen((prev) => !prev)}
            onQueryErrorChange={setHasActiveError}
          />
        )}
        {activeTab === 'history' && <HistoryView onOpenQuery={handleOpenQuery} />}
        {activeTab === 'collections' && <CollectionsView />}
        {activeTab === 'okf' && <OkfSpaceView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Right Source Panel / Research Inspector */}
      {isSourcePanelOpen && activeTab === 'query' && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-200"
            onClick={() => setSourcePanelOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm lg:relative lg:w-96 h-full bg-[#111115] border-l border-white/[0.07] flex-shrink-0 right-sidebar-smooth">
            <SourcePanel
              onClose={() => setSourcePanelOpen(false)}
              activeQuery={hasQuery}
              citations={activeCitations}
              telemetry={activeTelemetry}
              selectedCitationId={selectedCitationId}
              onSelectCitation={setSelectedCitationId}
              isMockActive={isMockActive}
              hasError={hasActiveError}
            />
          </aside>
        </>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (< 768px) */}
      <MobileBottomNav activeTab={activeTab} onTabChange={handleTabChange} />

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
