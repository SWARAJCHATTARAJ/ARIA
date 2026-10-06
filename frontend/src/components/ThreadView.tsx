import React, { useState } from 'react';
import { Send, Loader2, Download, Copy, ThumbsUp, ThumbsDown, AlertTriangle, Maximize2, Minimize2, CheckCircle2 } from 'lucide-react';
import ConfidenceDial from './ConfidenceDial';

interface ThreadViewProps {
  onCitationClick: (source: any) => void;
  isFocusMode: boolean;
  onToggleFocus: () => void;
  onQueryStateChange?: (hasQuery: boolean) => void;
}

interface Message {
  role: 'user' | 'aria';
  content: string;
  citations?: any[];
  isStreaming?: boolean;
}

export default function ThreadView({ onCitationClick, isFocusMode, onToggleFocus, onQueryStateChange }: ThreadViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);

  React.useEffect(() => {
    if (onQueryStateChange) {
      onQueryStateChange(messages.length > 0);
    }
  }, [messages.length, onQueryStateChange]);

  // Typewriter placeholder logic
  const [placeholder, setPlaceholder] = useState('');
  useEffect(() => {
    const prompts = [
      "Analyze the structural integrity of carbon nanotubes...",
      "Summarize recent papers on autonomous multi-agent systems...",
      "What is the impact of prompt engineering on LLM reasoning?"
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
      
      let nextSpeed = isDeleting ? 30 : 50;
      
      if (!isDeleting && cIdx === currentPrompt.length) {
        nextSpeed = 2000;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsLoading(true);

    // Real backend connection
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const apiKey = import.meta.env.VITE_API_KEY || '';

    fetch(`${apiUrl}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ query: userMsg, compare_mode: isCompareMode })
    })
    .then(async (res) => {
      if (!res.ok) throw new Error('API Error');
      // For now, since streaming requires complex async iteration in React, 
      // we'll handle the basic response or mock if endpoint isn't up
      setMessages(prev => [...prev, {
        role: 'aria',
        content: `Backend connected! (Streaming integration pending) \n\nYou asked: "${userMsg}"`,
        citations: []
      }]);
    })
    .catch((err) => {
      console.warn("Backend not reachable, falling back to mock:", err);
      setMessages(prev => [...prev, {
        role: 'aria',
        content: `Failed to connect to backend at ${apiUrl}. \n\nMake sure the FastAPI server is running!`,
        citations: []
      }]);
    })
    .finally(() => {
      setIsLoading(false);
    });
  };

  const [selection, setSelection] = useState<{text: string, x: number, y: number} | null>(null);

  React.useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelection({
          text: sel.toString().trim(),
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });
      } else {
        setSelection(null);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleAddToOKF = () => {
    if (selection) {
      alert(`Saved to personal OKF:\n"${selection.text}"`);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full relative">
      {/* Thread Header */}
      <div className="px-4 md:px-8 py-4 border-b border-ink-surface flex justify-between items-center bg-ink-base/80 backdrop-blur-sm z-10 sticky top-0">
        <div>
          <h2 className="text-sm font-semibold text-white truncate max-w-[200px] md:max-w-md">Autonomous Intelligence Maturity</h2>
          <div className="text-[10px] font-mono text-ink-muted mt-0.5">Collection: Thesis Lit Review • 14 mins ago</div>
        </div>
        <button 
          onClick={onToggleFocus}
          className="text-ink-muted hover:text-white transition-colors flex items-center gap-2 text-xs font-mono shrink-0"
          title="Toggle Focus Mode"
        >
          {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span className="hidden md:inline">{isFocusMode ? 'Exit Focus' : 'Focus'}</span>
        </button>
      </div>

      {/* Quick Capture Toolbar */}
      {selection && (
        <div 
          className="fixed z-50 bg-ink-surface border border-ink-muted/30 shadow-lg rounded-md flex items-center p-1 -translate-x-1/2 -translate-y-full"
          style={{ left: selection.x, top: selection.y }}
        >
          <button 
            onClick={handleAddToOKF}
            className="px-3 py-1.5 text-xs font-mono text-tier-okf hover:bg-tier-okf/10 rounded transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <div className="w-2 h-2 rounded-full bg-tier-okf" />
            Save to OKF
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center h-full mt-12">
            <div className="w-full max-w-2xl bg-ink-surface/10 rounded-md p-8 relative overflow-hidden min-h-[300px]">
              {/* Ruled lines texture */}
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #fff 28px)', backgroundPosition: '0 -1px' }} />
              <div className="relative z-10 font-mono text-ink-muted/50 text-sm flex items-start gap-2">
                <span className="text-tier-okf mt-0.5 animate-pulse">_</span> Start a new research thread...
              </div>
            </div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'flex-col gap-2 max-w-[90%]'}`}>
            {msg.role === 'user' ? (
              <div className="bg-ink-surface px-4 py-3 rounded-lg max-w-[80%] text-sm">
                {msg.content}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 text-xs font-mono text-ink-muted mb-2">
                  <div className="flex items-center gap-2 border border-ink-surface px-2 py-1 rounded bg-ink-base">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-tier-okf animate-pulse" /> OKF</span>
                    <span className="text-ink-surface">|</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-tier-rag" /> RAG</span>
                    <span className="text-ink-surface">|</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-tier-live" /> LIVE</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase">Confidence</span>
                    <ConfidenceDial level="high" />
                  </div>
                </div>
                <div className="prose prose-invert prose-p:leading-relaxed prose-sm max-w-none relative">
                  <p>{msg.content}</p>
                  
                  {/* Verified Stamp Overlay (Audit step) */}
                  <div className="absolute -right-4 -top-4 opacity-80 pointer-events-none">
                    <span className="text-[10px] font-mono text-tier-okf flex items-center gap-1 border border-tier-okf/30 px-2 py-1 rounded bg-tier-okf/10 animate-stamp shadow-sm transform rotate-12">
                      <CheckCircle2 size={12} /> VERIFIED
                    </span>
                  </div>

                  {msg.citations && msg.citations.map((cit, cIdx) => (
                    <button key={cIdx} onClick={() => onCitationClick(cit)} className="inline-flex items-center justify-center px-1 py-0.5 ml-1 text-[10px] font-mono text-tier-okf bg-tier-okf/10 hover:bg-tier-okf/20 rounded border border-tier-okf/30 transition-colors">
                      [{cit.source}]
                    </button>
                  ))}
                </div>
                {/* Action Bar (Export & Feedback) */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-surface/50">
                  <div className="flex gap-3">
                    <button className="text-ink-muted hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-mono uppercase" title="Copy Markdown">
                      <Copy size={12} /> Copy
                    </button>
                    <button className="text-ink-muted hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-mono uppercase" title="Download .bib">
                      <Download size={12} /> .BIB
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button className="text-ink-muted hover:text-tier-okf transition-colors" title="Accurate (Train Dristi)">
                      <ThumbsUp size={14} />
                    </button>
                    <button className="text-ink-muted hover:text-warning transition-colors" title="Inaccurate">
                      <ThumbsDown size={14} />
                    </button>
                    <button className="text-ink-muted hover:text-tier-live transition-colors flex items-center gap-1 text-[10px] font-mono" title="Report Conflict">
                      <AlertTriangle size={12} /> Flag Conflict
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-ink-muted text-sm">
            <Loader2 className="animate-spin" size={16} /> Thinking...
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-ink-base border-t border-ink-surface">
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
            className="w-full bg-ink-surface border border-ink-surface rounded-lg pl-4 pr-12 py-3 text-sm text-gray-200 placeholder-ink-muted focus:outline-none focus:border-tier-okf/50 focus:ring-1 focus:ring-tier-okf/50 resize-none h-14"
            placeholder={placeholder}
          />
          <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-3 top-3 text-ink-muted hover:text-white transition-colors disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <div className="flex gap-4 text-xs font-mono text-ink-muted">
            <button 
              type="button" 
              onClick={() => setIsCompareMode(!isCompareMode)}
              className={`transition-colors ${isCompareMode ? 'text-tier-live font-bold' : 'hover:text-white'}`}
            >
              Compare Tiers [{isCompareMode ? 'On' : 'Off'}]
            </button>
            <span className="opacity-50">Focus Mode [Off]</span>
          </div>
          <span className="text-xs font-mono text-ink-muted">Cmd+K for actions</span>
        </div>
      </form>
    </div>
  );
}
