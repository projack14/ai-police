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
  const [_history, setHistory] = useState<Chat[]>([]);
  const [connected, setConnected] = useState<any>(false);

  const [slotSessionId, setSlotSessionId] = useState<number | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const recognitionRef = useRef<any>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);

  const srsRef = useRef<any>(null);
  const canRestartRecognition = useRef(true);
  const vadRef = useRef<any>(null);

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
  // AI Speak
  // =======================
  const speakAI = (text: string) => {
    window.speechSynthesis.cancel();
    setHistory(prev => [...prev, { sender: 'ai', message: text }]);

    const utterance = new SpeechSynthesisUtterance(text);

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
    // **********************************

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
      console.log(data);
      // const reply = data.msg || 'Tidak ada respons dari server';

      // speakAI(reply);
    } catch (err) {
      speakAI('Maaf, aku mengalami gangguan.');
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
        // **********************************
        // MODIFIKASI: Cek apakah AI sedang berbicara
        if (!window.speechSynthesis.speaking) {
          recognitionRef.current?.start();
        }
        // **********************************
      }, 150);
    },
  });

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  // =======================
  // SPEECH RECOGNITION
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
        setTimeout(() => rec.start(), 200);
      }
    };

    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (!text) return;

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
  // START WHEP
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

  // =======================
  // END SESSION
  // =======================
  const stopSessionAndGetSummary = async () => {
    if (!dbSessionId) return null;

    try {
      const res = await fetch('https://live.divtik.xyz/end_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: dbSessionId }),
      });

      const data = await res.json().catch(() => ({}));

      if (data?.summary) return data.summary;
    } catch (e) {
      console.error('Error end_session:', e);
    }

    return null;
  };

  // =======================
  // STOP CONNECTION
  // =======================
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

    // === END_SESSION
    const summary = await stopSessionAndGetSummary();
    if (summary) {
      setSessionSummary(summary);
      setShowModal(true);
    }

    setDbSessionId(null);
  };

  // =======================
  // DOWNLOAD PDF
  // =======================
  const downloadSummaryPDF = () => {
    if (!sessionSummary) return;

    const doc = new jsPDF();
    doc.setFontSize(12);
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

  // =======================
  // UI
  // =======================
  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4">
      <div className="w-full max-w-sm h-[90vh] relative bg-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        {/* AVATAR VIDEO */}

        <video
          ref={avatarVideoRef}
          src={!connected ? standby : ''}
          autoPlay
          loop
          muted={!connected} // Muted saat standby
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />

        {/* TOP BAR */}
        <div className="absolute top-0 left-0 w-full p-5 flex justify-between items-center z-40">
          <div className="bg-blue-600/80 text-white px-3 py-1 rounded-full text-xs">
            {connected ? (muted ? 'Online (Muted)' : 'Online (Listening)') : 'Offline'}
          </div>

          <div className="flex items-center gap-2">
            {/* BUTTON START/STOP */}
            <button
              onClick={connected ? handleStop : handleStart}
              className={`px-4 py-1 rounded-full text-white text-xs ${
                connected ? 'bg-red-500' : 'bg-green-500'
              }`}
            >
              {connected ? 'Stop' : 'Start'}
            </button>

            {/* BUTTON TAMPILKAN SUMMARY */}
            {sessionSummary && (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-1 rounded-full text-white text-xs bg-purple-600"
              >
                Summary
              </button>
            )}
          </div>
        </div>

        {!muted && listening && <VoiceWave />}
        {!muted && vad.userSpeaking && (
          <div className="absolute bottom-36 w-full text-center z-50">
            <span className="bg-black/60 text-white px-4 py-1 rounded-full text-xs">
              Mendengarkan...
            </span>
          </div>
        )}

        {/* CHAT HISTORY OVERLAY (Opsional: Jika ingin menampilkan chat) */}
        {/* <div className="absolute bottom-24 w-full p-4 max-h-40 overflow-y-auto z-40">
          {_history.map((chat, index) => (
            <div key={index} className={`text-sm my-1 ${chat.sender === 'user' ? 'text-right' : 'text-left'}`}>
              <span className={`px-2 py-1 rounded-lg ${chat.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}>
                {chat.message}
              </span>
            </div>
          ))}
        </div> */}

        {/* MUTE BUTTON */}
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

      {/* MODAL SUMMARY */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl text-black">
            <h2 className="text-lg font-bold mb-2">Session Summary</h2>

            <div className="bg-gray-100 p-3 rounded max-h-60 overflow-auto text-sm whitespace-pre-wrap">
              {sessionSummary}
            </div>

            <div className="flex justify-between mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-400 text-white rounded"
              >
                Close
              </button>

              <button
                onClick={downloadSummaryPDF}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
