import React, { useEffect, useRef, useState } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

import idleVideo from '../assets/move.mp4';
import talkingVideo from '../assets/talk.mp4';
import { FullHistoryDisplay } from './History';
import { VoiceWave } from './Voice';

type Chat = { sender: 'user' | 'ai'; message: string };

// Deklarasi global untuk fungsi yang ada di client.js
declare global {
  interface Window {
    startConnection: () => Promise<void>; // Menambahkan Promise<void> karena startConnection adalah async
    stopConnection: () => Promise<void>; // Menambahkan stopConnection
  }
}

export default function VoiceTextAI(): React.ReactElement {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState<any>(false);
  const [history, setHistory] = useState<Chat[]>([]);
  // Gunakan state ini untuk mencerminkan status koneksi global (dari client.js)
  const [connected, setConnected] = useState<boolean>(false);
  const [isAiTalking, setIsAiTalking] = useState(false);

  // Bagian ini (Speech Synthesis dan VAD) tidak langsung terkait dengan client.js,
  // namun tetap menjadi bagian dari logika obrolan berbasis suara Anda.
  const recognitionRef = useRef<any>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);

  // Menghapus referensi SRS Publisher karena logika koneksi sekarang ada di client.js
  // const srsRef = useRef<any>(null);

  const canRestartRecognition = useRef(true);
  const vadRef = useRef<any>(null);

  // --- LOGIKA AI (Speech Synthesis & Response Simulation) ---

  const speakAI = (text: string) => {
    // ... (Logika speakAI tetap sama)
    if (muted) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 1.0;

    utter.onstart = () => {
      setIsAiTalking(true);
      try {
        recognitionRef.current?.stop();
      } catch {}
      avatarVideoRef.current?.play();
    };

    utter.onend = () => {
      setIsAiTalking(false);

      if (!muted && connected && canRestartRecognition.current) {
        setTimeout(() => recognitionRef.current?.start(), 200);
      }
    };

    window.speechSynthesis.speak(utter);
    setHistory(prev => [...prev, { sender: 'ai', message: text }]);
  };

  const simulateAIResponse = (text: string) => {
    // *CATATAN: Di aplikasi real-time, Anda harus mengirim teks ini ke backend API (seperti yang dilakukan client.js/sendChat)*
    setTimeout(() => {
      const responses = [
        `Kamu berkata: "${text}".`,
        'Aku mendengarkan.',
        'Silakan lanjut.',
        'Oke, aku paham.',
      ];
      speakAI(responses[Math.floor(Math.random() * responses.length)]);
    }, 700);
  };

  // --- Voice Activity Detection (VAD) ---

  const vad = useMicVAD({
    getStream: async () => {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    },
    onSpeechStart: () => {
      canRestartRecognition.current = false;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsAiTalking(false);
      }
      try {
        recognitionRef.current?.stop();
      } catch {}
    },
    onSpeechEnd: () => {
      setTimeout(() => {
        canRestartRecognition.current = true;
        if (!window.speechSynthesis.speaking) {
          try {
            recognitionRef.current?.start();
          } catch {}
        }
      }, 150);
    },
  });

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  // --- Speech Recognition (Pengenalan Suara) ---

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'id-ID';

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);

      if (connected && !muted && canRestartRecognition.current) {
        setTimeout(() => rec.start(), 200);
      }
    };

    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (!text) return;

      // HANYA MENSIMULASIKAN RESPON. Untuk integrasi penuh, Anda harus memanggil fungsi chat dari client.js
      setHistory(prev => [...prev, { sender: 'user', message: text }]);
      simulateAIResponse(text);
    };

    recognitionRef.current = rec;

    return () => {
      rec.onresult = null;
      rec.onend = null;
      rec.onstart = null;
    };
  }, [connected, muted]);

  // --- Fungsi Handle Koneksi (Memanggil client.js) ---

  const handleStart = async () => {
    if (window.startConnection) {
      // 1. Panggil fungsi global yang ada di client.js
      await window.startConnection();

      // 2. Update state lokal
      setConnected(true);

      // 3. Mulai Speech Recognition
      setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch {}
      }, 400);
    } else {
      console.error('startConnection() not found! Pastikan client.js dimuat sebelum App.tsx.');
    }
  };

  const handleStop = async () => {
    if (window.stopConnection) {
      // 1. Panggil fungsi global yang ada di client.js
      await window.stopConnection();

      // 2. Update state lokal
      setConnected(false);

      // 3. Hentikan Speech Recognition/Synthesis lokal
      try {
        recognitionRef.current?.stop();
      } catch {}

      window.speechSynthesis.cancel();
      setIsAiTalking(false);

      // 4. Hentikan mic tracks dari VAD (jika masih aktif)
      try {
        const s = vadRef.current?.mediaStream || vadRef.current?.stream || undefined;
        s?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      } catch {}
    } else {
      // Hanya update state lokal jika stopConnection tidak ditemukan
      setConnected(false);
    }
  };

  const toggleMute = () => {
    // ... (Logika toggleMute tetap sama)
    setMuted(prev => {
      const next = !prev;
      if (next) {
        try {
          recognitionRef.current?.stop();
        } catch {}
        window.speechSynthesis.cancel();
        setIsAiTalking(false);
      } else {
        if (connected) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch {}
          }, 400);
        }
      }
      return next;
    });
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4">
      {/* ... (UI Rendering) ... */}
      <div className="w-full max-w-sm h-[90vh] relative bg-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <video
          ref={avatarVideoRef}
          key={isAiTalking ? 'talk' : 'idle'}
          src={isAiTalking ? talkingVideo : idleVideo}
          autoPlay
          loop={!isAiTalking} // Loop saat idle
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />

        <div className="absolute top-0 left-0 w-full p-5 flex justify-between items-center z-40">
          <div className="bg-blue-600/80 text-white px-3 py-1 rounded-full text-xs">
            {/* {connected ? (muted ? 'Online (Muted)' : 'Online (Listening)') : 'Offline'} */}
            <span className="status-indicator status-disconnected" id="connection-status"></span>
            <span id="status-text">Disconnected</span>
          </div>

          <button
            onClick={connected ? handleStop : handleStart}
            className={`px-4 py-1 rounded-full text-white text-xs ${
              connected ? 'bg-red-500' : 'bg-green-500'
            }`}
            id={connected ? 'stop' : 'start'}
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

        <div className="absolute bottom-0 w-full p-6 flex justify-center z-40">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full text-white flex items-center justify-center ${
              muted ? 'bg-gray-600' : 'bg-blue-600'
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
