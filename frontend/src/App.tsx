import React, { useState, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';
import Landing from './components/Landing';
import PipelineSpine from './components/PipelineSpine';
import { Citation, MessageTelemetry } from './types';

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

  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);
  const [isMockActive, setIsMockActive] = useState(false);

  // Active query state shared with SourcePanel
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<MessageTelemetry | undefined>(undefined);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitationId(citation.id);
    setSourcePanelOpen(true);
  };

  return (
    <div className="flex h-screen bg-ink-base text-gray-200 font-sans overflow-hidden relative">
      {/* Left Navigation */}
      {!isFocusMode && (
        <div className="hidden md:block shrink-0">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      )}

      {/* Slim Vertical Spine between Sidebar and Content on New Question */}
      {activeTab === 'query' && !isFocusMode && (
        <aside className="hidden lg:flex shrink-0 w-32 border-r border-ink-surface bg-ink-base/90 p-4 flex-col justify-center select-none">
          <PipelineSpine
            mode="live"
            stage={activeTelemetry?.stage}
            tiersFired={activeTelemetry?.retrieval?.tiers}
            isComplete={activeTelemetry?.stage === 'complete'}
          />
        </aside>
      )}

      {/* Center Thread Workspace */}
      <main className="flex-1 flex flex-col h-full md:border-r border-ink-surface bg-ink-base transition-all w-full overflow-hidden">
        {activeTab === 'home' && (
          <Landing onStart={() => setActiveTab('query')} />
        )}
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
          />
        )}
        {activeTab !== 'query' && activeTab !== 'home' && (
          <div className="flex-1 flex items-center justify-center text-ink-muted flex-col gap-4 p-8 text-center">
            <h2 className="text-xl font-mono uppercase tracking-widest">{activeTab} View</h2>
            <p className="text-sm font-sans">This is coming soon.</p>
          </div>
        )}
      </main>

      {/* Right Source Panel: hidden until a query starts */}
      {isSourcePanelOpen && activeTab === 'query' && hasQuery && (
        <>
          {/* Mobile Overlay */}
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
            onClick={() => setSourcePanelOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm md:relative md:w-96 h-full bg-ink-surface shadow-2xl flex-shrink-0 transition-transform">
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
