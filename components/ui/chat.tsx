'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  onNewResponse: (nodes: number[]) => void;
  isThinking: boolean;
  setIsThinking: (state: boolean) => void;
}

export default function Chat({ onNewResponse, isThinking, setIsThinking }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final de los mensajes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsThinking(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-6) // Enviamos solo los últimos 6 mensajes para contexto
        }),
      });

      const data = await response.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        // Notificamos al orquestador (page.tsx) los nodos activos
        if (data.nodes) onNewResponse(data.nodes);
      }
    } catch (error) {
      console.error("Error en el chat:", error);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md bg-black/40 backdrop-blur-md border-l border-white/10 p-4">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-hide">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-200'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isThinking && <div className="text-xs text-white/30 animate-pulse">Daniel está pensando...</div>}
      </div>

      <div className="relative">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Pregunta algo a mi gemelo digital..."
          className="w-full bg-white/5 border border-white/20 rounded-full py-3 px-5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button 
          onClick={sendMessage}
          className="absolute right-2 top-1.5 bg-blue-500 hover:bg-blue-400 p-1.5 rounded-full transition-colors"
        >
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}