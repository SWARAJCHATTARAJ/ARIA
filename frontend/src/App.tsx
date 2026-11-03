import React, { useState, Suspense, lazy, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';
import Home from './components/Home';
import PipelineSpine from './components/PipelineSpine';
import { HistoryView, CollectionsView, OkfSpaceView, SettingsView } from './components/HubViews';
import { MobileTopBar, MobileBottomNav } from './components/ui/MobileNavBar';
import AuthModal from './components/ui/AuthModal';
import AuthGate from './components/ui/AuthGate';
import CommandPalette from './components/ui/CommandPalette';
import { Citation, MessageTelemetry } from './types';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, isNativeRuntime } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const MarkdownTestHarness = lazy(() => import('./components/MarkdownTestHarness'));

/** Offline connection banner — obsidian matte, never flashes white. */
function ConnectivityBanner() {
  const offline = !useOnlineStatus();

  if (!offline) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] aria-matte border-b border-amber-500/40 safe-pt flex items-center justify-center gap-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-amber-300 aria-cascade"
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
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
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <SettingsProvider>
            <ConnectivityBanner />
            <AppShell />
          </SettingsProvider>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppShell() {
  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
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

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
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
      className="flex flex-col md:flex-row h-[100dvh] min-h-[100dvh] bg-ink-base text-gray-200 font-sans overflow-hidden relative hud-grid select-none"
    >
      {/* Mobile Top Bar (< 768px) */}
      <MobileTopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenDrawer={() => setIsMobileDrawerOpen(true)}
      />

      {/* Mobile Slide-Over Navigation Drawer (< 768px): transform-only GPU animation */}
      <div
        className={`md:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
          isMobileDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileDrawerOpen(false)}
        aria-hidden={!isMobileDrawerOpen}
      />
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 h-full w-64 max-w-[85vw] aria-matte border-r border-ink-surface safe-pt safe-pb overflow-y-auto ${
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

      {/* Desktop Obsidian Rail (>= 768px md:block): collapsible */}
      <div className="hidden md:block shrink-0 h-full">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          collapsed={isRailCollapsed}
          onToggleCollapsed={() => setIsRailCollapsed((prev) => !prev)}
        />
      </div>

      {/* Slim Vertical Spine between Sidebar and Content on New Question (xl+ only) */}
      {activeTab === 'query' && !isFocusMode && (
        <aside className="hidden xl:flex shrink-0 w-32 border-r border-ink-surface bg-ink-base/90 p-4 flex-col justify-center select-none">
          <PipelineSpine
            mode="live"
            stage={activeTelemetry?.stage}
            tiersFired={activeTelemetry?.retrieval?.tiers}
            isComplete={activeTelemetry?.stage === 'complete'}
          />
        </aside>
      )}

      {/* Center Thread Workspace: keyed per-tab for view transitions */}
      <main
        key={activeTab}
        className="flex-1 flex flex-col h-full md:border-r border-ink-surface bg-ink-base transition-all w-full overflow-hidden pb-14 md:pb-0 animate-view-in relative"
      >
        {activeTab === 'home' && <Home onStart={() => handleTabChange('query')} />}
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
            onNavigateTab={handleTabChange}
            onToggleSidebar={() => setIsMobileDrawerOpen(true)}
          />
        )}
        {activeTab === 'history' && <HistoryView onOpenQuery={handleOpenQuery} />}
        {activeTab === 'collections' && <CollectionsView />}
        {activeTab === 'okf' && <OkfSpaceView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Right Source Panel: hidden until a query starts; slide-over on mobile/tablet, column on lg+ */}
      {isSourcePanelOpen && activeTab === 'query' && hasQuery && (
        <>
          {/* Mobile / Tablet Overlay (<1024px) */}
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setSourcePanelOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm lg:relative lg:w-96 h-full bg-[#0A0B0E] border-l border-white/[0.07] shadow-2xl flex-shrink-0 transition-transform duration-200 will-change-transform">
            <SourcePanel
              onClose={() => setSourcePanelOpen(false)}
              activeQuery={hasQuery}
              citations={activeCitations}
              telemetry={activeTelemetry}
              selectedCitationId={selectedCitationId}
              onSelectCitation={setSelectedCitationId}
              isMockActive={isMockActive}
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
