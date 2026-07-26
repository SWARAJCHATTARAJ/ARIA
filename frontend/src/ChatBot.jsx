import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Loader2 } from 'lucide-react';

export default function ChatBot({ authorizedFetch, API_BASE }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your ARIA chatbot. Ask me anything about your ingested documents or active research sessions!" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const updatedMessages = [...messages, userMessage];

    try {
      const response = await authorizedFetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages.map(m => ({ role: m.role, content: m.content })) })
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      setMessages(prev => [...prev, { role: 'assistant', content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') {
                done = true;
                break;
              }
              if (!dataStr) continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.chunk) {
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content += parsed.chunk;
                    return newMsgs;
                  });
                }
                if (parsed.error) {
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content += `\n[Error: ${parsed.error}]`;
                    return newMsgs;
                  });
                }
              } catch (e) {
                // ignore unparseable chunks
              }
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105 transition-transform z-[100] ${isOpen ? 'hidden' : 'flex'}`}
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[400px] h-[650px] max-w-[90vw] max-h-[85vh] bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl flex flex-col z-[100] overflow-hidden font-sans">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <Bot size={20} />
              </div>
              <h3 className="font-bold text-lg tracking-wide">ARIA Chat</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50/50 dark:bg-[#0a0a0a]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm shadow-md' : 'bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm shadow-sm'}`}>
                  <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-2xl rounded-bl-sm p-4 shadow-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white dark:bg-[#111] border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about your research..."
                className="flex-1 bg-gray-100 dark:bg-[#1a1a1a] border border-transparent dark:focus:border-indigo-500/30 text-gray-900 dark:text-gray-100 rounded-full px-5 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
              <button 
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-3 rounded-full transition-colors shadow-md hover:shadow-lg disabled:hover:shadow-none"
              >
                <Send size={20} className="ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
