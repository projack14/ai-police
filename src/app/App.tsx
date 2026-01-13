'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

import { VoiceWave } from './Voice';
import standby from '../assets/police.mp4';
import { jsPDF } from 'jspdf';
import { FullHistoryDisplay } from './History';
type Chat = { sender: 'user' | 'ai'; message: string };

declare global {
  interface Window {
    SrsRtcWhipWhepAsync: any;
    slotSessionId: number;
    dbSessionId: string;
    startConnection?: any;
  }
}

export default function VoiceTextAI(): React.ReactElement {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState<any>(false);
  const [history, setHistory] = useState<Chat[]>([]);
  const [connected, setConnected] = useState<any>(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [slotSessionId, setSlotSessionId] = useState<number | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const recognitionRef = useRef<any>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);

  const srsRef = useRef<any>(null);
  const canRestartRecognition = useRef(true);
  const vadRef = useRef<any>(null);

  //------------------------------------------------------
  // CEK SESSION
  //------------------------------------------------------
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

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  //------------------------------------------------------
  // AI SPEAK (TTS DARI BROWSER)
  //------------------------------------------------------
  const speakAI = (text: string) => {
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 1;

    window.speechSynthesis.speak(utter);

    setHistory(prev => [...prev, { sender: 'ai', message: text }]);
  };

  //------------------------------------------------------
  // KIRIM CHAT KE API
  //------------------------------------------------------
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
      const reply = data.msg || 'Tidak ada respons dari server';

      // speakAI(reply);
    } catch (err) {
      speakAI('Maaf, aku mengalami gangguan.');
    }
  };

  //------------------------------------------------------
  // VAD + ANC (SUPAYA SUARA AI TIDAK TERTANGKAP MIC)
  //------------------------------------------------------
  const vad = useMicVAD({
    getStream: async () => {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

  //------------------------------------------------------
  // SPEECH RECOGNITION
  //------------------------------------------------------
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

  //------------------------------------------------------
  // START WHEP (MATIKAN AUDIO STREAM AGAR MIC TIDAK MENANGKAP)
  //------------------------------------------------------
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
      video.srcObject = sdk.stream;

      // MATIKAN AUDIO TRACK VIDEO (SUPAYA SUARA AI TIDAK MASUK MIC)
      sdk.stream?.getAudioTracks()?.forEach(t => (t.enabled = false));

      video.muted = false; // video tetap hidup, tapi tanpa suara dari stream

      await sdk.play('https://live.divtik.xyz/whep/');
      await video.play().catch(() => {});
    } catch (err) {
      setConnected(false);
      return;
    }

    setTimeout(() => {
      try {
        recognitionRef.current?.start();
      } catch {}
    }, 400);
  };

  //------------------------------------------------------
  // END SESSION
  //------------------------------------------------------
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

  //------------------------------------------------------
  // STOP CONNECTION
  //------------------------------------------------------
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

  //------------------------------------------------------
  // DOWNLOAD PDF
  //------------------------------------------------------
  const downloadSummaryPDF = () => {
    if (!sessionSummary) return;

    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('Session Summary:', 10, 10);
    doc.text(sessionSummary, 10, 20);
    doc.save('summary.pdf');
  };

  //------------------------------------------------------
  // MUTE BUTTON
  //------------------------------------------------------
  const toggleMute = () => {
    setMuted((prev: any) => {
      const next = !prev;
      if (next) {
        recognitionRef.current?.stop();
        window.speechSynthesis.cancel();
      } else {
        setTimeout(() => recognitionRef.current?.start(), 400);
      }
      return next;
    });
  };

  //------------------------------------------------------
  // UI
  //------------------------------------------------------
  return (
    <div className="w-full min-h-screen bg-gray-900 flex justify-center items-center p-4">
      <div
        className={`relative bg-gray-800 overflow-hidden shadow-2xl transition-all duration-300
  ${isFullscreen ? 'w-screen h-screen rounded-none' : 'w-full max-w-xl h-[90vh] rounded-[2.5rem]'}`}
      >
        <video
          ref={avatarVideoRef}
          src={!connected ? standby : ''}
          autoPlay
          loop
          muted={false}
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />

        <div className="absolute top-0 left-0 w-full p-5 flex justify-between items-center z-40">
          <div className="bg-blue-600/80 text-white px-3 py-1 rounded-full text-xs">
            {connected ? (muted ? 'Online (Muted)' : 'Online (Listening)') : 'Offline'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={connected ? handleStop : handleStart}
              className={`px-4 py-1 rounded-full text-white text-xs ${
                connected ? 'bg-red-500' : 'bg-green-500'
              }`}
            >
              {connected ? 'Stop' : 'Start'}
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-3 py-1 rounded-full text-white text-xs bg-black/60 hover:bg-black/80"
            >
              {isFullscreen ? 'Exit Full' : 'Full Screen'}
            </button>
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

        <FullHistoryDisplay history={history} />

        {/* MUTE BUTTON */}
        <div className="absolute bottom-0 w-full p-6 flex justify-center z-40">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full text-white flex items-center justify-center ${
              muted ? 'bg-gray-600' : 'bg-blue-600'
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
