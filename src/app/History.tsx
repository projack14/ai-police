import React, { useEffect, useRef } from 'react';

type Chat = { sender: 'user' | 'ai'; message: string };

export const FullHistoryDisplay: React.FC<{ history: Chat[] }> = ({ history }) => {
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  return (
    <div className="absolute top-96 bottom-48 left-0 w-full px-4 z-40 pointer-events-none">
      <div className="h-full overflow-y-auto space-y-4 pr-2 pointer-events-auto">
        {history.map((chat, i) => (
          <div key={i} className={`flex flex-col ${chat.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] backdrop-blur-sm ${
                chat.sender === 'user' ? 'bg-blue-600/80 text-white rounded-tr-sm' : 'bg-black/50 text-gray-100 rounded-tl-sm'
              }`}
            >
              <span className="text-xs font-semibold mb-1 block opacity-70">
                {chat.sender === 'user' ? 'Anda' : 'AI Police'}
              </span>
              {chat.message}
            </div>
          </div>
        ))}
        <div ref={historyEndRef} />
      </div>
    </div>
  );
};
