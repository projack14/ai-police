// client.js — WHEP media + DB chat history

let sdk = null;
let slotSessionId = 0;   // runtime WHEP slot (0..max_session-1)
let dbSessionId = null;  // DB session id from /start_session
let lastSummary = null;

function setStatus(status, msg='') {
  const ind = document.getElementById('connection-status');
  const txt = document.getElementById('status-text');
  ind.classList.remove('status-connected','status-disconnected','status-connecting');
  if (status==='connected'){ ind.classList.add('status-connected'); txt.textContent='Connected'; }
  else if (status==='connecting'){ ind.classList.add('status-connecting'); txt.textContent='Connecting...'; }
  else { ind.classList.add('status-disconnected'); txt.textContent='Disconnected' + (msg?(' '+msg):''); }
}
function buttonsConnected(on) {
  document.getElementById('start').style.display = on ? 'none' : 'inline-block';
  document.getElementById('stop').style.display = on ? 'inline-block' : 'none';
}
function addChat(msg, type='user') {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'asr-text ' + (type === 'user' ? 'user-message' : 'system-message');
  div.textContent = (type === 'user' ? 'You: ' : 'Digital Human: ') + msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function enableSummary(enabled) {
  document.getElementById('view-summary-btn').disabled = !enabled;
}

async function startConnection() {
  try {
    setStatus('connecting');
    buttonsConnected(false);

    // 1) Read user name and slot
    const name = (document.getElementById('username').value || 'Anonymous').trim() || 'Anonymous';
    const slot = parseInt(document.getElementById('whep-slot').value || '0', 10) || 0;
    slotSessionId = slot;

    // 2) Create DB session
    const s = await fetch('/start_session', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user_name: name })
    });
    if (!s.ok) throw new Error(`/start_session failed: ${s.status}`);
    const sj = await s.json();
    dbSessionId = sj.session_id;
    if (!dbSessionId) throw new Error('No db session_id');

    // 3) Start WHEP playback (SRS)
    if (!window.SrsRtcWhipWhepAsync) throw new Error('srs.sdk.js not loaded');
    if (sdk) try { sdk.close(); } catch(e){}
    sdk = new SrsRtcWhipWhepAsync();

    const videoEl = document.getElementById('video');
    const audioEl = document.getElementById('audio');
    videoEl.muted = false; // Start is a user gesture; audio should be allowed
    videoEl.playsInline = true;

    // Attach the same stream to both (video can carry audio too, but this helps in some browsers)
    videoEl.srcObject = sdk.stream;
    audioEl.srcObject = sdk.stream;

    const host = window.location.hostname;
    const url = (location.protocol === 'https:')
      ? `https://${host}/whep/`
      : `http://${host}:1985/rtc/v1/whep/?app=live&stream=livestream`;

    console.log('[WHEP] play via', url, 'slot=', slotSessionId);
    await sdk.play(url);

    // Try to play explicitly (some browsers require)
    try { await videoEl.play(); } catch {}
    try { await audioEl.play(); } catch {}

    setStatus('connected');
    buttonsConnected(true);
    enableSummary(false);
  } catch (e) {
    console.error('start error:', e);
    setStatus('disconnected','(start failed)');
    dbSessionId = null;
    try { sdk && sdk.close(); } catch {}
    sdk = null;
  }
}

async function stopConnection() {
  try {
    if (sdk) { try { sdk.close(); } catch{} sdk = null; }

    // Clear media
    const v = document.getElementById('video');
    const a = document.getElementById('audio');
    if (v) v.srcObject = null;
    if (a) a.srcObject = null;

    // End DB session and get summary
    if (dbSessionId) {
      const r = await fetch('/end_session', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ session_id: dbSessionId })
      });
      const j = await r.json().catch(()=>({}));
      if (j && j.summary) {
        lastSummary = j.summary;
        enableSummary(true);
        const body = document.getElementById('summary-modal-body');
        if (body && window.bootstrap) {
          body.textContent = lastSummary;
          new bootstrap.Modal(document.getElementById('summaryModal')).show();
        }
      }
    }
  } catch (e) {
    console.error('stop error:', e);
  } finally {
    dbSessionId = null;
    buttonsConnected(false);
    setStatus('disconnected');
  }
}

// Recording
async function startRecord() {
  if (sdk == null) return alert('Start connection first');
  try {
    await fetch('/record', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'start_record', sessionid: slotSessionId })
    });
    document.getElementById('btn_start_record').disabled = true;
    document.getElementById('btn_stop_record').disabled = false;
    document.getElementById('recording-indicator').classList.add('active');
  } catch (e){ console.error('record start error', e); }
}
async function stopRecord() {
  if (sdk == null) return;
  try {
    await fetch('/record', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'end_record', sessionid: slotSessionId })
    });
    document.getElementById('btn_start_record').disabled = false;
    document.getElementById('btn_stop_record').disabled = true;
    document.getElementById('recording-indicator').classList.remove('active');
  } catch (e){ console.error('record stop error', e); }
}

// Chat / Echo
async function sendChat(text) {
  if (!text.trim()) return;
  if (sdk == null) return alert('Start connection first');
  try {
    await fetch('/human', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        text, type:'chat', interrupt:true,
        sessionid: slotSessionId,        // runtime slot for media
        db_session_id: dbSessionId       // DB id for history
      })
    });
    addChat(text, 'user');
  } catch (e) {
    console.error('chat error:', e);
  }
}
async function sendEcho(text) {
  if (!text.trim()) return;
  if (sdk == null) return alert('Start connection first');
  try {
    await fetch('/human', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        text, type:'echo', interrupt:true,
        sessionid: slotSessionId,
        db_session_id: dbSessionId
      })
    });
    addChat(`Sent read aloud request: "${text}"`, 'system');
  } catch (e) {
    console.error('echo error:', e);
  }
}

// UI wiring
document.addEventListener('DOMContentLoaded', () => {
  // Buttons
  document.getElementById('start').addEventListener('click', startConnection);
  document.getElementById('stop').addEventListener('click', stopConnection);
  document.getElementById('btn_start_record').addEventListener('click', startRecord);
  document.getElementById('btn_stop_record').addEventListener('click', stopRecord);
  document.getElementById('view-summary-btn').addEventListener('click', () => {
    if (!lastSummary) return alert('No summary available.');
    const body = document.getElementById('summary-modal-body');
    if (body && window.bootstrap) {
      body.textContent = lastSummary;
      new bootstrap.Modal(document.getElementById('summaryModal')).show();
    }
  });

  // Chat form
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('chat-message').value;
    sendChat(text).then(() => { document.getElementById('chat-message').value = ''; });
  });

  // Echo form
  document.getElementById('echo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('message').value;
    sendEcho(text).then(() => { document.getElementById('message').value = ''; });
  });

  // Hold-to-talk (speech recognition → text → chat)
  let isRecording = false;
  let recognition;
  const speechOK = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if (speechOK) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
    recognition.onresult = (ev) => {
      let interim = '', finalTxt = '';
      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        if (ev.results[i].isFinal) finalTxt += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      document.getElementById('chat-message').value = finalTxt || interim;
    };
    recognition.onerror = (e) => console.error('Speech error:', e.error);
  }
  const voiceBtn = document.getElementById('voice-record-btn');
  function startMic() {
    if (isRecording) return;
    if (sdk == null) return alert('Start connection first');
    navigator.mediaDevices.getUserMedia({ audio:true }).then((stream) => {
      isRecording = true;
      voiceBtn.classList.add('recording-pulse'); voiceBtn.style.backgroundColor = '#dc3545';
      if (recognition) recognition.start();
      // Immediately stop mic (we only use Web Speech API text)
      setTimeout(() => stream.getTracks().forEach(t => t.stop()), 0);
    }).catch((err) => {
      console.error('Mic error:', err); alert('Cannot access microphone. Check browser permissions.');
    });
  }
  function stopMic() {
    if (!isRecording) return;
    isRecording = false;
    voiceBtn.classList.remove('recording-pulse'); voiceBtn.style.backgroundColor = '';
    if (recognition) recognition.stop();
    setTimeout(() => {
      const text = document.getElementById('chat-message').value.trim();
      if (text) sendChat(text).then(() => { document.getElementById('chat-message').value=''; });
    }, 300);
  }
  voiceBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startMic(); });
  voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startMic(); });
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => voiceBtn.addEventListener(evt, stopMic));

  // Video size slider
  const slider = document.getElementById('video-size-slider');
  const label = document.getElementById('video-size-value');
  slider.addEventListener('input', (e) => {
    const v = e.target.value; label.textContent = `${v}%`;
    document.getElementById('video').style.width = `${v}%`;
  });
});

// Best-effort cleanup
window.addEventListener('beforeunload', () => {
  try { if (sdk) sdk.close(); } catch {}
});

window.startConnection = startConnection;
