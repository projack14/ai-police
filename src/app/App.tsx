import React, { useEffect, useRef, useState } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

import idleVideo from '../assets/move.mp4';
import talkingVideo from '../assets/talk.mp4';
import { FullHistoryDisplay } from './History';
import { VoiceWave } from './Voice';

type Chat = { sender: 'user' | 'ai'; message: string };

export default function VoiceTextAI(): React.ReactElement {
  const [listening, setListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [history, setHistory] = useState<Chat[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [isAiTalking, setIsAiTalking] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);

  const speakAI = (text: string) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;

    utterance.onstart = () => {
      setIsAiTalking(true);
      if (avatarVideoRef.current) {
        avatarVideoRef.current.play().catch(e => console.log('Video play error:', e));
      }
    };

    utterance.onend = () => {
      setIsAiTalking(false);
    };

    window.speechSynthesis.speak(utterance);

    setHistory(prev => [...prev, { sender: 'ai', message: text }]);
  };

  const simulateAIResponse = (userText: string) => {
    setTimeout(() => {
      const responses = [
        `Kamu berkata: "${userText}". Mode simulasi aktif.`,
        'Tampilan video sudah berfungsi! Mulut saya bergerak, kan?',
        'Ini adalah respon acak. Sekarang giliranmu bicara lagi.',
        'Aku tidak bisa memproses pertanyaan kompleks di mode ini.',
      ];
      const randomRes = responses[Math.floor(Math.random() * responses.length)];
      speakAI(randomRes);
    }, 1000);
  };

  const vad: any = useMicVAD({
    getStream: async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });
      return stream;
    },
    onSpeechStart: () => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsAiTalking(false);
      }
    },
    onSpeechEnd: () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }, 120);
      }
    },
  });

  useEffect(() => {
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'id-ID';

      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);

      rec.onresult = (ev: any) => {
        let text = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          text += ev.results[i][0].transcript;
        }
        setTranscript(text);
        setHistory(prev => [...prev, { sender: 'user', message: text }]);
        simulateAIResponse(text);
      };

      rec.onerror = (e: any) => {
        console.error('Speech error:', e);
        setListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const handleStart = () => setConnected(true);
  const handleStop = () => setConnected(false);

  const handleSendClick = () => {
    if (!transcript.trim()) return;
    setHistory(prev => [...prev, { sender: 'user', message: transcript }]);
    simulateAIResponse(transcript);
    setTranscript('');
  };

  const handleMicToggle = () => {
    const rec = recognitionRef.current;
    if (!rec) return;

    if (isAiTalking) {
      window.speechSynthesis.cancel();
      setIsAiTalking(false);
      try {
        rec.start();
      } catch (e) {}
      return;
    }

    if (listening) {
      try {
        rec.stop();
      } catch (e) {}
    } else {
      try {
        rec.stop();
        rec.start();
      } catch (e) {}
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4">
      <div className="w-full max-w-sm h-[90vh] bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 z-0 bg-black">
          <video
            ref={avatarVideoRef}
            key={isAiTalking ? 'talking' : 'idle'}
            src={isAiTalking ? talkingVideo : idleVideo}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none"></div>
        </div>

        <audio id="audio" />

        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-30">
          <div className="bg-blue-500/80 text-white text-xs px-3 py-1 rounded-full flex items-center shadow-lg backdrop-blur-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-400' : 'bg-red-400'
              } animate-pulse`}
            />
            <span className="ml-2">{connected ? 'Online (Simulasi)' : 'Offline'}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={connected ? handleStop : handleStart}
              className={`${
                connected ? 'bg-red-500' : 'bg-green-500'
              } px-4 py-1 rounded-full text-white text-xs font-medium shadow-lg hover:brightness-110 transition-all`}
            >
              {connected ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        {listening && <VoiceWave />}

        {vad.userSpeaking && (
          <div className="absolute bottom-36 w-full text-center z-50">
            <span className="bg-black/60 text-white px-4 py-1 rounded-full text-xs backdrop-blur-md border border-white/10">
              Mendengarkan...
            </span>
          </div>
        )}

        <FullHistoryDisplay history={history} />

        <div className="absolute bottom-0 left-0 w-full p-6 z-30 flex flex-col items-center">
          {!listening && !isAiTalking && (
            <div className="flex gap-2 mb-4 overflow-x-auto w-full justify-center pb-2">
              {['Apa kabar?', 'Siapa kamu?', 'Nyanyi dong!'].map(s => (
                <button
                  key={s}
                  className="px-4 py-2 text-xs bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/5 transition-all whitespace-nowrap backdrop-blur-sm"
                  onClick={() => {
                    setTranscript(s);
                    simulateAIResponse(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleMicToggle}
            disabled={isAiTalking && !listening}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all ${
              listening
                ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] scale-110'
                : 'bg-blue-600 hover:bg-blue-500'
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
