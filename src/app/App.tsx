import React, { useEffect, useRef, useState } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

import idleVideo from '../assets/move.mp4';
import talkingVideo from '../assets/talk.mp4';
import { FullHistoryDisplay } from './History';
import { VoiceWave } from './Voice';

type Chat = { sender: 'user' | 'ai'; message: string };

export default function VoiceTextAI(): React.ReactElement {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<Chat[]>([]);
  const [connected, setConnected] = useState(false);
  const [isAiTalking, setIsAiTalking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const canRestartRecognition = useRef(true);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const vadRef = useRef<any>(null);

  const speakAI = (text: string) => {
    if (muted) return;

    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;

    utterance.onstart = () => {
      setIsAiTalking(true);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      if (avatarVideoRef.current) {
        avatarVideoRef.current.play().catch(() => {});
      }
    };

    utterance.onend = () => {
      setIsAiTalking(false);

      if (!muted && connected && canRestartRecognition.current) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch {}
        }, 200);
      }
    };

    window.speechSynthesis.speak(utterance);

    setHistory(prev => [...prev, { sender: 'ai', message: text }]);
    prev => [...prev, { sender: 'ai', message: text }];
  };

  const simulateAIResponse = (userText: string) => {
    if (muted) return;

    setTimeout(() => {
      const responses = [
        `Kamu berkata: "${userText}".`,
        'Aku mendengarkanmu.',
        'Silakan lanjut.',
        'Oke, aku paham.',
      ];
      const r = responses[Math.floor(Math.random() * responses.length)];
      speakAI(r);
    }, 800);
  };

  const vad = useMicVAD({
    enabled: connected && !muted,
    getStream: async () => {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return s;
    },
    onSpeechStart: () => {
      if (muted) return;
      canRestartRecognition.current = false;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsAiTalking(false);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    },
    onSpeechEnd: () => {
      if (muted) return;
      setTimeout(() => {
        canRestartRecognition.current = true;
        if (!window.speechSynthesis.speaking && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }, 150);
    },
  } as any);

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'id-ID';

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      if (
        !muted &&
        connected &&
        !window.speechSynthesis.speaking &&
        canRestartRecognition.current
      ) {
        setTimeout(() => {
          try {
            rec.start();
          } catch (e) {}
        }, 200);
      }
    };

    rec.onresult = (ev: any) => {
      if (muted) return;
      let text = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        text += ev.results[i][0].transcript;
      }
      if (!text) return;
      setHistory(prev => [...prev, { sender: 'user', message: text }]);
      simulateAIResponse(text);
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.onresult = null;
        rec.onend = null;
        rec.onstart = null;
      } catch (e) {}
    };
  }, [connected, muted]);

  const handleStart = () => {
    setConnected(true);
    setTimeout(() => {
      if (!muted && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {}
      }
    }, 300);
  };

  const handleStop = () => {
    setConnected(false);
    if (recognitionRef.current)
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    window.speechSynthesis.cancel();
    setIsAiTalking(false);
    try {
      const s = vadRef.current?.mediaStream || vadRef.current?.stream || null;
      if (s && s.getTracks) s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch (e) {}
  };

  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;

      if (next) {
        if (recognitionRef.current)
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        setIsAiTalking(false);
        try {
          const s = vadRef.current?.mediaStream || vadRef.current?.stream || null;
          if (s && s.getTracks) s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        } catch (e) {}
      } else {
        setTimeout(() => {
          if (connected && recognitionRef.current)
            try {
              recognitionRef.current.start();
            } catch (e) {}
        }, 300);
      }

      return next;
    });
  };

  // ---------------------- UI ----------------------
  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4">
      <div className="w-full max-w-sm h-[90vh] bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden relative">
        <video
          ref={avatarVideoRef}
          key={isAiTalking ? 'talk' : 'idle'}
          src={isAiTalking ? talkingVideo : idleVideo}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20" />

        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-30">
          <div className="bg-blue-600/80 text-white text-xs px-3 py-1 rounded-full flex items-center">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-400' : 'bg-red-400'
              } animate-pulse`}
            />
            <span className="ml-2">
              {connected ? (muted ? 'Online (Muted)' : 'Online (Listening)') : 'Offline'}
            </span>
          </div>

          <button
            onClick={connected ? handleStop : handleStart}
            className={`${
              connected ? 'bg-red-500' : 'bg-green-500'
            } px-4 py-1 rounded-full text-white text-xs shadow-lg`}
          >
            {connected ? 'Stop' : 'Start'}
          </button>
        </div>

        {!muted && listening && <VoiceWave />}

        {!muted && vad.userSpeaking && (
          <div className="absolute bottom-36 w-full text-center z-50">
            <span className="bg-black/60 text-white px-4 py-1 rounded-full text-xs">
              Mendengarkan...
            </span>
          </div>
        )}

        <FullHistoryDisplay history={history} />

        <div className="absolute bottom-0 w-full p-6 z-30 flex justify-center">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all ${
              muted ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5"
            >
              <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
              <path d="M6 13.5a7.5 7.5 0 0 0 15 0v-.75a.75.75 0 0 0-1.5 0v.75a6 6 0 0 1-12 0v-.75a.75.75 0 0 0-1.5 0v.75Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
