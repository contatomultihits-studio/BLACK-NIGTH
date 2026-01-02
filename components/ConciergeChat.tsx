
import React, { useState, useRef, useEffect } from 'react';
import { getConciergeResponse } from '../services/geminiService';

interface Message {
  role: 'user' | 'model';
  text: string;
}

const ConciergeChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Boa noite! Sou o concierge do Black Night. Como posso tornar sua experiência memorável hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const response = await getConciergeResponse(userMsg, history);
    setMessages(prev => [...prev, { role: 'model', text: response }]);
    setIsLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="w-80 md:w-96 glass-card rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[450px]">
          <div className="p-4 gold-gradient text-black flex justify-between items-center font-bold">
            <span className="flex items-center gap-2">
              <i className="fas fa-crown"></i> Concierge Black Night
            </span>
            <button onClick={() => setIsOpen(false)} className="hover:opacity-70">
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-black/40">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                  m.role === 'user' 
                    ? 'bg-gold-gradient text-black font-medium' 
                    : 'bg-zinc-800 text-gray-200'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 p-3 rounded-2xl text-sm text-gray-400 animate-pulse">
                  Digitando...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-zinc-900 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pergunte algo..."
              className="flex-1 bg-zinc-800 border-none rounded-full px-4 py-2 text-sm focus:ring-1 focus:ring-[#d4af37] outline-none"
            />
            <button 
              onClick={handleSend}
              className="w-10 h-10 gold-gradient text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
            >
              <i className="fas fa-paper-plane text-sm"></i>
            </button>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 gold-gradient rounded-full shadow-2xl flex items-center justify-center text-black text-2xl hover:scale-110 transition-transform ring-4 ring-black"
        >
          <i className="fas fa-comment-dots"></i>
        </button>
      )}
    </div>
  );
};

export default ConciergeChat;
