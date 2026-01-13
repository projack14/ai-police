'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

import { VoiceWave } from './Voice';
import standby from '../assets/police.mp4';
import { jsPDF } from 'jspdf';

type Chat = { sender: 'user' | 'ai'; message: string };

declare global {
  interface Window {
    SrsRtcWhipWhepAsync: any;
    slotSessionId: number;
    dbSessionId: string;
    startConnection?: any;
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceTextAI(): React.ReactElement {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState<any>(false);
  const [history, setHistory] = useState<Chat[]>([]); // State untuk menampilkan teks di layar
  const [connected, setConnected] = useState<any>(false);

  const [slotSessionId, setSlotSessionId] = useState<number | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const recognitionRef = useRef<any>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null); // Untuk auto-scroll

  const srsRef = useRef<any>(null);
  const canRestartRecognition = useRef(true);
  const vadRef = useRef<any>(null);

  // Auto-scroll saat ada chat baru
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // ==========================
  // CEK SESSION
  // ==========================
  const checkSessionFromWindow = async () => {
    const name = (
      (document.getElementById('username') as HTMLInputElement)?.value || 'Anonymous'
    ).trim();

    const slot = parseInt(
      (document.getElementById('whep-slot') as HTMLInputElement)?.value || '0',
      10
    );
    setSlotSessionId(slot);

    const s = await fetch('https://live.divtik.xyz/start_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_name: name }),
    });

    if (!s.ok) return;

    const sj = await s.json();
    setDbSessionId(sj.session_id);
  };

  useEffect(() => {
    checkSessionFromWindow();
  }, []);

  // =======================
  // AI Speak (Tampilkan Teks AI)
  // =======================
  const speakAI = (text: string) => {
    window.speechSynthesis.cancel();

    // MENAMPILKAN TEKS AI KE LAYAR
    setHistory(prev => [...prev, { sender: 'ai', message: text }]);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';

    utterance.onstart = () => {
      recognitionRef.current?.stop();
    };

    utterance.onend = () => {
      setTimeout(() => {
        if (connected && !muted) {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error('Error starting recognition after AI speak:', e);
          }
        }
      }, 500);
    };

    window.speechSynthesis.speak(utterance);
  };

  // ============================
  // SEND CHAT KE SERVER
  // ============================
  const sendChatToServer = async (text: string) => {
    try {
      const res = await fetch('https://live.divtik.xyz/human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          type: 'chat',
          interrupt: true,
          sessionid: slotSessionId,
          db_session_id: dbSessionId,
        }),
      });

      const data = await res.json();
      // Ambil balasan dari server (sesuaikan dengan key JSON server Anda)
      const reply = data.msg || data.reply || '';

      if (reply) {
        speakAI(reply);
      }
    } catch (err) {
      speakAI('Maaf, aku mengalami gangguan koneksi.');
    }
  };

  // =======================
  // VAD
  // =======================
  const vad = useMicVAD({
    getStream: async () => {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    },
    onSpeechStart: () => {
      canRestartRecognition.current = false;
      window.speechSynthesis.cancel();
      recognitionRef.current?.stop();
    },
    onSpeechEnd: () => {
      setTimeout(() => {
        canRestartRecognition.current = true;
        if (!window.speechSynthesis.speaking) {
          recognitionRef.current?.start();
        }
      }, 150);
    },
  });

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  // =======================
  // SPEECH RECOGNITION (Tampilkan Teks User)
  // =======================
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
      if (
        !window.speechSynthesis.speaking &&
        connected &&
        !muted &&
        canRestartRecognition.current
      ) {
        setTimeout(() => {
          try {
            rec.start();
          } catch {}
        }, 200);
      }
    };

    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (!text) return;

      // MENAMPILKAN TEKS USER KE LAYAR
      setHistory(prev => [...prev, { sender: 'user', message: text }]);
      sendChatToServer(text);
    };

    recognitionRef.current = rec;

    return () => {
      rec.onstart = null;
      rec.onend = null;
      rec.onresult = null;
    };
  }, [connected, muted]);

  // =======================
  // START / STOP / WHEP
  // =======================
  const handleStart = async () => {
    setConnected(true);
    const WHEP = window.SrsRtcWhipWhepAsync;
    if (!WHEP) {
      setConnected(false);
      return;
    }

    try {
      const sdk = new WHEP();
      srsRef.current = sdk;
      const video = avatarVideoRef.current;
      if (video) {
        video.srcObject = sdk.stream;
        video.muted = false;
        await sdk.play('https://live.divtik.xyz/whep/');
        await video.play().catch(() => {});
      }
    } catch (err) {
      setConnected(false);
      return;
    }

    if (!muted) {
      setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch {}
      }, 400);
    }
  };

  const handleStop = async () => {
    setConnected(false);
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    try {
      srsRef.current?.close();
    } catch {}
    if (avatarVideoRef.current) {
      avatarVideoRef.current.pause();
      avatarVideoRef.current.srcObject = null;
    }

    const summary = await stopSessionAndGetSummary();
    if (summary) {
      setSessionSummary(summary);
      setShowModal(true);
    }
    setDbSessionId(null);
  };

  const stopSessionAndGetSummary = async () => {
    if (!dbSessionId) return null;
    try {
      const res = await fetch('https://live.divtik.xyz/end_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: dbSessionId }),
      });
      const data = await res.json();
      return data?.summary || null;
    } catch (e) {
      return null;
    }
  };

  const downloadSummaryPDF = () => {
    if (!sessionSummary) return;
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(sessionSummary, 180);
    doc.text('Session Summary:', 10, 10);
    doc.text(splitText, 10, 20);
    doc.save('summary.pdf');
  };

  const toggleMute = () => {
    setMuted((prev: any) => {
      const next = !prev;
      if (next) {
        recognitionRef.current?.stop();
        window.speechSynthesis.cancel();
      } else {
        if (!window.speechSynthesis.speaking) {
          setTimeout(() => recognitionRef.current?.start(), 400);
        }
      }
      return next;
    });
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4 font-sans text-white">
      <div className="w-full max-w-sm h-[90vh] relative bg-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-gray-700">
        {/* AVATAR VIDEO */}
        <video
          ref={avatarVideoRef}
          src={!connected ? standby : ''}
          autoPlay
          loop
          muted={!connected}
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />

        {/* GRADIENT OVERLAY (Agar teks terbaca) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

        {/* TOP STATUS BAR */}
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-50">
          <div
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          >
            {connected ? (muted ? 'Muted' : 'Live') : 'Offline'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={connected ? handleStop : handleStart}
              className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                connected ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {connected ? 'End Call' : 'Start'}
            </button>
          </div>
        </div>

        {/* CHAT DISPLAY (Overlay Teks di Layar) */}
        <div className="absolute bottom-32 w-full px-4 max-h-[40%] overflow-y-auto z-40 flex flex-col gap-3 no-scrollbar">
          {history.map((chat, index) => (
            <div
              key={index}
              className={`flex ${chat.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm shadow-lg ${
                  chat.sender === 'user'
                    ? 'bg-blue-600/90 text-white rounded-br-none border border-blue-400/30'
                    : 'bg-white/90 text-gray-900 rounded-bl-none border border-gray-200'
                }`}
              >
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* VOICE INDICATOR */}
        {!muted && (listening || vad.userSpeaking) && (
          <div className="absolute bottom-24 left-0 w-full flex justify-center z-50">
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="text-[10px] font-medium">Mendengarkan...</span>
            </div>
          </div>
        )}

        {/* CONTROLS */}
        <div className="absolute bottom-0 w-full p-6 flex justify-center items-center gap-6 z-50 bg-gradient-to-t from-black/60 to-transparent">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-xl ${
              muted
                ? 'bg-red-500 shadow-red-500/20'
                : 'bg-white/10 backdrop-blur-md hover:bg-white/20'
            }`}
          >
            {muted ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* MODAL SUMMARY */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-blue-400">Ringkasan Sesi</h2>
            <div className="bg-gray-900/50 rounded-xl p-4 max-h-60 overflow-auto text-sm leading-relaxed text-gray-300 border border-gray-700">
              {sessionSummary}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-gray-700 rounded-xl font-bold hover:bg-gray-600 transition"
              >
                Tutup
              </button>
              <button
                onClick={downloadSummaryPDF}
                className="flex-1 py-3 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition"
              >
                Simpan PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
