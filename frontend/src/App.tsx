import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ThreadView from './components/ThreadView';
import SourcePanel from './components/SourcePanel';

export default function App() {
  const [isSourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('query');
  const [isFocusMode, setIsFocusMode] = useState(false);

  return (
    <div className="flex h-screen bg-ink-base text-gray-200 font-sans overflow-hidden relative">
      {/* Left Navigation */}
      {!isFocusMode && (
        <div className="hidden md:block">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      )}

      {/* Center Thread Workspace */}
      <main className="flex-1 flex flex-col h-full md:border-r border-ink-surface bg-ink-base transition-all w-full">
        {activeTab === 'query' && (
          <ThreadView 
            onCitationClick={() => setSourcePanelOpen(true)} 
            isFocusMode={isFocusMode}
            onToggleFocus={() => setIsFocusMode(!isFocusMode)}
          />
        )}
        {activeTab !== 'query' && (
          <div className="flex-1 flex items-center justify-center text-ink-muted flex-col gap-4 p-8 text-center">
            <h2 className="text-xl font-mono uppercase tracking-widest">{activeTab} View</h2>
            <p>This view will be wired up to the Supabase backend in Part 2.</p>
          </div>
        )}
      </main>

      {/* Right Source Panel (Persistent on desktop, slide-over on mobile) */}
      {isSourcePanelOpen && activeTab === 'query' && (
        <>
          {/* Mobile Overlay */}
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSourcePanelOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm md:relative md:w-96 h-full bg-ink-surface shadow-2xl flex-shrink-0 transition-transform">
            <SourcePanel onClose={() => setSourcePanelOpen(false)} />
          </aside>
        </>
      )}
    </div>
  );
}
