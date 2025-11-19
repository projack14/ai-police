import React from 'react';

export const VoiceWave: React.FC = () => (
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-64 h-64 pointer-events-none z-40">
    <div className="absolute w-24 h-24 rounded-full border-2 border-white/50 animate-ping opacity-75"></div>
    <div
      className="absolute w-40 h-40 rounded-full border-2 border-white/40 animate-ping"
      style={{ animationDelay: '0.5s' }}
    ></div>
    <div
      className="absolute w-56 h-56 rounded-full border-2 border-white/30 animate-ping"
      style={{ animationDelay: '1s' }}
    ></div>
  </div>
);
