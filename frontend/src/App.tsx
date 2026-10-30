import React, { useState, Suspense, lazy, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';
import Landing from './components/Landing';
import PipelineSpine from './components/PipelineSpine';
import { HistoryView, CollectionsView, OkfSpaceView, SettingsView } from './components/HubViews';
import { Citation, MessageTelemetry, AriaSettings, ThemePreset, AnimationIntensity } from './types';
import { getSettings, saveSettings } from './utils/storage';

const MarkdownTestHarness = lazy(() => import('./components/MarkdownTestHarness'));

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

  return <AppShell />;
}

function AppShell() {
  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);
  const [isMockActive, setIsMockActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Query handed over from History -> New question
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // v3 Part 3: Research Control Center settings (theme, motion, density)
  const [settings, setSettings] = useState<AriaSettings>(() => getSettings());

  const applyAppearance = (s: AriaSettings) => {
    const themeMap: Record<string, ThemePreset> = {
      cyber_obsidian: 'cyber_obsidian',
      quantum_indigo: 'quantum_indigo',
      emerald_matrix: 'emerald_matrix',
      solar_amber: 'solar_amber',
      high_contrast: 'high_contrast',
    };
    const root = document.documentElement;
    root.dataset.theme = themeMap[s.themePreset] || 'cyber_obsidian';
    const motionMap: Record<string, number> = {
      full_kinetic: 1,
      subtle_smooth: 0.55,
      reduced_motion: 0,
    };
    root.style.setProperty('--motion-scale', String(motionMap[s.animationIntensity] ?? 1));
    document.body.classList.remove('density-compact', 'density-standard', 'density-comfortable');
    document.body.classList.add(`density-${s.fontDensity || 'standard'}`);
  };

  useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  const handleUpdateSettings = (patch: Partial<AriaSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const handleSourcesExpand = () => {
    setSourcePanelOpen(true);
  };

  // Active query state shared with SourcePanel
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<MessageTelemetry | undefined>(undefined);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitationId(citation.id);
    setSourcePanelOpen(true);
  };

  const handleOpenQuery = (query: string) => {
    setPendingQuery(query);
    setActiveTab('query');
    setIsSidebarOpen(false);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-ink-base text-gray-200 font-sans overflow-hidden relative hud-grid">
      {/* Mobile Sidebar Drawer Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Navigation: fixed column on desktop, slide-over drawer on mobile */}
      <div className="hidden lg:block shrink-0">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-ink-base border-r border-ink-surface shadow-2xl transition-transform duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      </aside>

      {/* Slim Vertical Spine between Sidebar and Content on New Question */}
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
      <main key={activeTab} className="flex-1 flex flex-col h-full md:border-r border-ink-surface bg-ink-base transition-all w-full overflow-hidden animate-view-in">
        {activeTab === 'home' && <Landing onStart={() => handleTabChange('query')} />}
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
            onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
            pendingQuery={pendingQuery}
            onPendingQueryConsumed={() => setPendingQuery(null)}
            onSourcesExpand={handleSourcesExpand}
          />
        )}
        {activeTab === 'history' && <HistoryView onOpenQuery={handleOpenQuery} />}
        {activeTab === 'collections' && <CollectionsView />}
        {activeTab === 'okf' && <OkfSpaceView />}
        {activeTab === 'settings' && (
          <SettingsView settings={settings} onUpdateSettings={handleUpdateSettings} />
        )}
      </main>

      {/* Right Source Panel: hidden until a query starts; slide-over on mobile/tablet, column on lg+ */}
      {isSourcePanelOpen && activeTab === 'query' && hasQuery && (
        <>
          {/* Mobile / Tablet Overlay (<1024px) */}
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
            onClick={() => setSourcePanelOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm lg:relative lg:w-96 h-full bg-ink-surface shadow-2xl flex-shrink-0 transition-transform">
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
    </div>
  );
}
