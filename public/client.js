// client.js — WHEP media + DB chat history (FULL GLOBAL READY)

let sdk = null;
let slotSessionId = 0;   // runtime WHEP slot (0..max_session-1)
let dbSessionId = null;  // DB session id from /start_session
let lastSummary = null;

// ---------------- UI HELPERS ----------------

function setStatus(status, msg='') {
  const ind = document.getElementById('connection-status');
  const txt = document.getElementById('status-text');
  if (!ind || !txt) return;

  ind.classList.remove('status-connected','status-disconnected','status-connecting');
  if (status==='connected'){ ind.classList.add('status-connected'); txt.textContent='Connected'; }
  else if (status==='connecting'){ ind.classList.add('status-connecting'); txt.textContent='Connecting...'; }
  else { ind.classList.add('status-disconnected'); txt.textContent='Disconnected' + (msg?(' '+msg):''); }
}

function buttonsConnected(on) {
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  if (!startBtn || !stopBtn) return;
  startBtn.style.display = on ? 'none' : 'inline-block';
  stopBtn.style.display = on ? 'inline-block' : 'none';
}

function addChat(msg, type='user') {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'asr-text ' + (type === 'user' ? 'user-message' : 'system-message');
  div.textContent = (type === 'user' ? 'You: ' : 'Digital Human: ') + msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function enableSummary(enabled) {
  const btn = document.getElementById('view-summary-btn');
  if (btn) btn.disabled = !enabled;
}

// ---------------- START CONNECTION ----------------

async function startConnection() {
  try {
    setStatus('connecting');
    buttonsConnected(false);

    // 1) User + Slot
    const name = (document.getElementById('username')?.value || 'Anonymous').trim();
    const slot = parseInt(document.getElementById('whep-slot')?.value || '0', 10);
    slotSessionId = slot;

    // 2) Create DB Session
    const s = await fetch('/start_session', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user_name: name })
    });
    if (!s.ok) throw new Error(`/start_session failed: ${s.status}`);
    const sj = await s.json();
    console.log('sj',sj)
    dbSessionId = sj.session_id;
    if (!dbSessionId) throw new Error('No db session_id');

    // 3) Start WHEP Playback
    if (!window.SrsRtcWhipWhepAsync) throw new Error('srs.sdk.js not loaded');
    if (sdk) try { sdk.close(); } catch(e){}
    sdk = new SrsRtcWhipWhepAsync();

    const videoEl = document.getElementById('video');
    const audioEl = document.getElementById('audio');

    videoEl.muted = false;
    videoEl.playsInline = true;

    videoEl.srcObject = sdk.stream;
    audioEl.srcObject = sdk.stream;

    const host = window.location.hostname;
    const url = (location.protocol === 'https:')
      ? `https://${host}/whep/`
      : `http://${host}:1985/rtc/v1/whep/?app=live&stream=livestream`;

    await sdk.play(url);

    // Autoplay
    try { await videoEl.play(); } catch {}
    try { await audioEl.play(); } catch {}

    setStatus('connected');
    buttonsConnected(true);
    enableSummary(false);

    console.log('slotSessionId =', slotSessionId);
    console.log('dbSessionId =', dbSessionId);

    // --------- EXPOSE TO GLOBAL ----------
    window.slotSessionId = slotSessionId;
    window.dbSessionId = dbSessionId;

    return { slotSessionId, dbSessionId }; // React bisa menerima value ini
  } 
  catch (e) {
    console.error('start error:', e);
    setStatus('disconnected','(start failed)');
    dbSessionId = null;
    try { sdk && sdk.close(); } catch {}
    sdk = null;
    return null;
  }
}

// ---------------- STOP CONNECTION ----------------

async function stopConnection() {
  try {
    if (sdk) { try { sdk.close(); } catch{} sdk = null; }

    const v = document.getElementById('video');
    const a = document.getElementById('audio');
    if (v) v.srcObject = null;
    if (a) a.srcObject = null;

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
    window.dbSessionId = null;
    buttonsConnected(false);
    setStatus('disconnected');
  }
}

// ---------------- RECORDING ----------------

async function startRecord() {
  if (!sdk) return alert('Start connection first');
  try {
    await fetch('/record', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'start_record', sessionid: slotSessionId })
    });
    document.getElementById('btn_start_record').disabled = true;
    document.getElementById('btn_stop_record').disabled = false;
    document.getElementById('recording-indicator')?.classList.add('active');
  } catch (e){
    console.error('record start error', e);
  }
}

async function stopRecord() {
  if (!sdk) return;
  try {
    await fetch('/record', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'end_record', sessionid: slotSessionId })
    });
    document.getElementById('btn_start_record').disabled = false;
    document.getElementById('btn_stop_record').disabled = true;
    document.getElementById('recording-indicator')?.classList.remove('active');
  } catch (e){
    console.error('record stop error', e);
  }
}

// ---------------- CHAT ----------------

async function sendChat(text) {
  if (!text.trim()) return;
  if (!sdk) return alert('Start connection first');
  try {
    await fetch('/human', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        text, type:'chat', interrupt:true,
        sessionid: slotSessionId,
        db_session_id: dbSessionId
      })
    });
    addChat(text, 'user');
  } catch (e) {
    console.error('chat error:', e);
  }
}

async function sendEcho(text) {
  if (!text.trim()) return;
  if (!sdk) return alert('Start connection first');
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

// ---------------- UI WIRING (NOT GLOBAL) ----------------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start')?.addEventListener('click', startConnection);
  document.getElementById('stop')?.addEventListener('click', stopConnection);
  document.getElementById('btn_start_record')?.addEventListener('click', startRecord);
  document.getElementById('btn_stop_record')?.addEventListener('click', stopRecord);

  document.getElementById('view-summary-btn')?.addEventListener('click', () => {
    if (!lastSummary) return alert('No summary available.');
    const body = document.getElementById('summary-modal-body');
    if (body && window.bootstrap) {
      body.textContent = lastSummary;
      new bootstrap.Modal(document.getElementById('summaryModal')).show();
    }
  });

  // CHAT FORM
  document.getElementById('chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('chat-message').value;
    sendChat(text).then(() => { document.getElementById('chat-message').value = ''; });
  });

  // ECHO FORM
  document.getElementById('echo-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('message').value;
    sendEcho(text).then(() => { document.getElementById('message').value = ''; });
  });
});

// Cleanup
window.addEventListener('beforeunload', () => {
  try { if (sdk) sdk.close(); } catch {}
});

// ---------------- GLOBAL EXPORT ----------------
window.startConnection = startConnection;
window.stopConnection = stopConnection;
window.sendChat = sendChat;
window.sendEcho = sendEcho;
window.startRecord = startRecord;
window.stopRecord = stopRecord;
