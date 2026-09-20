// ============================================================================
// eye.js — THE PHONE, WATCHING, ON BEHALF OF A SCREEN THAT CANNOT.
//
// A monitor with no camera and a phone with two. The phone runs the tracker and
// sends the landmarks; the desktop reads them exactly where it would have read
// its own. Nothing about the room's gestures changes to accept this — the palm
// halt, the pinch, the two-hand language and the spin all arrive already
// working, because the frame it receives is the shape perceive already made.
//
// TWO ROUTES HOME, AND THE SLOW ONE IS THE ONE THAT ALWAYS WORKS.
//
//   relay   phone -> Render -> desktop, over the channel streams.mjs proved.
//           MEASURED: 110ms round trip to Render on a good connection, so about
//           165ms of network before the hand has moved on screen. That is
//           fine for a face and mush for a fingertip.
//   direct  a WebRTC data channel, phone straight to desktop across the wifi.
//           Single-digit milliseconds, because the packet never leaves the
//           building.
//
// It starts on the relay because the relay needs no negotiation, and upgrades
// to direct the moment the channel opens. If it never opens — different
// networks, a hostile router — it simply stays on the relay and says so, which
// is worse but is not broken. REACH.md called WebRTC "the right answer if this
// ever needs sub-30ms"; the measurement is what promoted it from a note to the
// build.
//
// NO STUN SERVER, deliberately. Host candidates alone connect two devices on
// one wifi, which is the case this exists for, and adding a public STUN server
// would hand a third party both endpoints' addresses to solve a problem nobody
// here has. If it ever needs to work across networks that is a decision to take
// on purpose, not a default to inherit.
// ============================================================================

import { pack, weigh } from './eyewire.js';

const $ = (id) => document.getElementById(id);
const VISION = '@mediapipe/tasks-vision';
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// The phone is not trying to hit 60. The desktop's own tracker runs at 24 and
// the room is built around that rate; going faster would only spend battery to
// send frames nobody reads differently.
const HZ = 24;
const TICK = 1000 / HZ;

// The skeleton, as pairs — the same topology the room draws, so the preview
// here and the preview there are the same picture.
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const state = {
  facing: 'user',        // 'user' = the one pointing at you; 'environment' = the other
  stream: null,
  task: null,
  screen: null,          // deviceId we are lending to
  running: false,
  pc: null, chan: null,  // the direct route, when it exists
  via: 'idle',
  stamp: 0,              // monotonic, because detectForVideo demands it
  sent: 0, bytes: 0, lastFps: 0, fpsFrom: 0, fpsN: 0,
  lag: null,
};

const note = (t, warn = false) => { const n = $('note'); n.textContent = t; n.className = warn ? 'note warn' : 'note'; };
const stat = (id, v) => { $(id).textContent = v; };

// ---- who are we, and what is waiting -------------------------------------
async function whoami() {
  const r = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((x) => x.json()).catch(() => null);
  return r && r.user ? r.user : null;
}

async function screens() {
  const r = await fetch('/api/remote/screens', { credentials: 'same-origin' }).then((x) => x.json()).catch(() => null);
  return (r && r.screens) || [];
}

function paintScreens(list) {
  const sel = $('screen');
  const had = sel.value;
  sel.innerHTML = '';
  if (!list.length) {
    sel.innerHTML = '<option value="">no other device of yours is signed in</option>';
    sel.disabled = true; $('go').disabled = true;
    return;
  }
  sel.disabled = false; $('go').disabled = false;
  for (const s of list) {
    const o = document.createElement('option');
    o.value = s.deviceId;
    // Say whether anybody is actually there. A screen whose tab was closed
    // without a goodbye lingers until the sweep, and offering it silently
    // would be a lie the phone then spends thirty seconds proving.
    o.textContent = `${s.label}${s.watching ? '' : ' (not open)'}${s.eye ? ' · already being watched' : ''}`;
    sel.appendChild(o);
  }
  if (had && list.some((s) => s.deviceId === had)) sel.value = had;
}

// ---- the camera ----------------------------------------------------------
// FRONT AND BACK. The front camera is the one you point at yourself and is the
// default; the back one is sharper and is what you want when the phone is on a
// stand across the desk. Switching means tearing the track down and asking
// again — a live MediaStreamTrack cannot change which lens it is reading.
async function openCamera() {
  if (state.stream) { for (const t of state.stream.getTracks()) t.stop(); state.stream = null; }
  const want = {
    video: {
      facingMode: state.facing,
      width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  };
  const s = await navigator.mediaDevices.getUserMedia(want);
  state.stream = s;
  const v = $('cam');
  v.srcObject = s;
  // The front camera is mirrored so it reads as a mirror, the way every selfie
  // view does. The back one is not — mirroring what the room sees would be
  // wrong. NOTE the landmarks are NOT mirrored either way: the room mirrors
  // when it draws, and a second mirror here is how this ends up backwards.
  v.classList.toggle('mirror', state.facing === 'user');
  await v.play().catch(() => {});
  return s;
}

async function ensureTask() {
  if (state.task) return state.task;
  note('loading the hand model (7.5 MB, once)');
  const mod = await import(VISION);
  const fs = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
  const opts = (d) => ({
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: d },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  // GPU is a request, not a guarantee — same lesson as perceive.js. Ask, and
  // fall back rather than discovering later that it silently went to the CPU.
  try { state.task = await mod.HandLandmarker.createFromOptions(fs, opts('GPU')); }
  catch { state.task = await mod.HandLandmarker.createFromOptions(fs, opts('CPU')); }
  return state.task;
}

// ---- the direct route ----------------------------------------------------
// Offered by the phone, answered by the desktop, signalled over the relay the
// phone is already using. Non-trickle: it waits for gathering to finish and
// sends one offer, because with no STUN server there are only host candidates
// and gathering finishes almost immediately.
async function tryDirect(deviceId) {
  if (typeof RTCPeerConnection !== 'function') return;
  const pc = new RTCPeerConnection({ iceServers: [] });
  state.pc = pc;
  // Unordered and unreliable, ON PURPOSE. This is a live position: a frame
  // that arrives late is worthless because a newer one has already replaced
  // it, and retransmitting it would delay that newer one behind it. Dropping
  // a frame costs one twenty-fourth of a second of hand; resending it costs
  // every frame after it.
  const chan = pc.createDataChannel('eye', { ordered: false, maxRetransmits: 0 });
  chan.onopen = () => { state.chan = chan; state.via = 'direct'; note('direct — the phone is talking straight to the screen'); };
  chan.onclose = () => { if (state.chan === chan) { state.chan = null; state.via = 'relay'; } };
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && state.chan === chan) {
      state.chan = null; state.via = 'relay';
      note('the direct route dropped — back on the relay', true);
    }
  };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 1500);            // never hang on a router that will not answer
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } };
  });
  send(deviceId, { sig: 'offer', sdp: pc.localDescription.sdp });
}

async function onBack(deviceId, msgs) {
  for (const m of msgs || []) {
    if (m && m.sig === 'answer' && state.pc && !state.pc.currentRemoteDescription) {
      try { await state.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); }
      catch (e) { note('the screen answered with something unusable — staying on the relay', true); }
    }
  }
}

// ---- sending -------------------------------------------------------------
let inflight = false;
async function send(deviceId, payload) {
  // The direct channel first, when it is up. No await, no round trip, no
  // chance for a slow POST to stack behind the next frame.
  if (state.chan && state.chan.readyState === 'open' && !payload.sig) {
    try { state.chan.send(JSON.stringify(payload)); return; } catch { /* fall through to the relay */ }
  }
  // COALESCE, NEVER QUEUE. HTTP/1.1 caps in-flight requests and a queue of
  // stale hand positions is worse than a gap — if the last POST has not come
  // back, this frame is simply dropped and the next one is newer anyway.
  if (inflight && !payload.sig) return;
  inflight = true;
  try {
    const r = await fetch(`/api/remote/eye/${deviceId}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((x) => x.json()).catch(() => null);
    if (r && r.back) onBack(deviceId, r.back);
    if (r && r.ok === false) note(r.error || 'the screen stopped listening', true);
  } finally { inflight = false; }
}

// ---- the loop ------------------------------------------------------------
function drawSkeleton(hands) {
  const c = $('skel'), v = $('cam');
  const w = v.clientWidth, h = v.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // object-fit: cover, reproduced — the video is cropped to fill, so the
  // landmarks have to be mapped through the same crop or they sit off the hand.
  const vw = v.videoWidth || 1, vh = v.videoHeight || 1;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2, oy = (h - vh * scale) / 2;
  const mirror = state.facing === 'user';
  const X = (nx) => ox + (mirror ? (1 - nx) : nx) * vw * scale;
  const Y = (ny) => oy + ny * vh * scale;
  for (const lm of hands) {
    g.strokeStyle = 'rgba(160,190,240,0.75)'; g.lineWidth = 2;
    for (const [a, b] of BONES) {
      g.beginPath(); g.moveTo(X(lm[a].x), Y(lm[a].y)); g.lineTo(X(lm[b].x), Y(lm[b].y)); g.stroke();
    }
    g.fillStyle = 'rgba(230,240,255,0.95)';
    for (const p of lm) { g.beginPath(); g.arc(X(p.x), Y(p.y), 3, 0, 6.2832); g.fill(); }
  }
}

function loop() {
  if (!state.running) return;
  setTimeout(loop, TICK);
  const v = $('cam');
  if (!state.task || !v || v.readyState < 2) return;
  const now = performance.now();
  state.stamp = Math.max(state.stamp + 1, Math.round(now));
  let res = null;
  try { res = state.task.detectForVideo(v, state.stamp); } catch { return; }
  const lms = (res && res.landmarks) || [];
  const worlds = (res && res.worldLandmarks) || [];
  drawSkeleton(lms);

  // Into the shape perceive makes, so eyewire can pack it and the room can read
  // it without either end knowing the other exists.
  const hands = lms.map((lm, i) => {
    const cat = res.handednesses?.[i]?.[0];
    return {
      ok: true,
      // MIRRORED HERE, ONCE. The room works in viewer space — x growing to the
      // right as YOU see it — and the raw landmarks are in image space. The
      // front camera's image is a mirror of the room, the back camera's is not.
      points: lm.map((p) => [state.facing === 'user' ? 1 - p.x : p.x, p.y, p.z]),
      world: (worlds[i] || []).map((p) => [state.facing === 'user' ? -p.x : p.x, p.y, p.z]),
      // ...and handedness flips with the mirror for the same reason it does in
      // perceive.js: MediaPipe labels the hand as the CAMERA sees it.
      handedness: cat ? (state.facing === 'user'
        ? (cat.categoryName === 'Left' ? 'Right' : 'Left')
        : cat.categoryName) : '',
      pinch: pinchOf(lm),
    };
  });

  const frame = pack({ hands, head: { ok: false } }, Math.round(now));
  state.bytes += weigh(frame);
  state.sent += 1;
  state.fpsN += 1;
  if (now - state.fpsFrom > 1000) {
    state.lastFps = Math.round(state.fpsN * 1000 / (now - state.fpsFrom));
    state.fpsFrom = now; state.fpsN = 0;
    stat('s-fps', state.lastFps);
    stat('s-via', state.via);
    stat('s-size', `${Math.round(state.bytes / 1024)} KB sent`);
  }
  if (state.screen) send(state.screen, frame);
}

// The same ratio the room uses: thumb tip to index tip over the wrist-to-knuckle
// span, so the number means the same thing at arm's length as up close.
function pinchOf(lm) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const span = d(lm[0], lm[5]);
  return span > 1e-4 ? d(lm[4], lm[8]) / span : 1;
}

// ---- wiring --------------------------------------------------------------
async function start() {
  const id = $('screen').value;
  if (!id) return;
  try {
    // getUserMedia MUST be called from inside the gesture on iOS, so this is
    // the first thing the tap does — before the model load, which is slow.
    await openCamera();
  } catch (e) {
    note(`the camera said no: ${e && e.name === 'NotAllowedError' ? 'permission denied' : (e && e.message) || e}`, true);
    return;
  }
  $('go').textContent = 'Stop'; $('go').className = 'stop';
  state.screen = id; state.running = true; state.via = 'relay';
  note('relaying — upgrading to a direct link if the wifi allows it');
  try { await ensureTask(); } catch (e) { note(`the model would not load: ${(e && e.message) || e}`, true); return stop(); }
  note('watching');
  loop();
  tryDirect(id).catch(() => { /* the relay is already carrying it */ });
  // A quiet heartbeat keeps the relay's idea of "an eye is on it" true even
  // while every frame is going down the direct channel and the server sees none.
  state.beat = setInterval(() => { if (state.chan) send(id, { v: 0, t: Date.now() }); }, 2500);
}

function stop() {
  state.running = false;
  clearInterval(state.beat);
  if (state.chan) { try { state.chan.close(); } catch { /* gone */ } state.chan = null; }
  if (state.pc) { try { state.pc.close(); } catch { /* gone */ } state.pc = null; }
  if (state.stream) { for (const t of state.stream.getTracks()) t.stop(); state.stream = null; }
  state.screen = null; state.via = 'idle';
  $('go').textContent = 'Lend it my eye'; $('go').className = 'go';
  stat('s-via', 'idle'); stat('s-fps', '–');
  note('stopped');
}

$('go').addEventListener('click', () => (state.running ? stop() : start()));
$('flip').addEventListener('click', async () => {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  $('flip').textContent = state.facing === 'user' ? 'Use back camera' : 'Use front camera';
  if (state.stream) { try { await openCamera(); } catch (e) { note(`that camera is not available: ${(e && e.message) || e}`, true); } }
});

(async () => {
  const me = await whoami();
  if (!me) {
    $('who').textContent = 'not signed in';
    note('Sign in first, in this browser, with the same account as the screen. Then come back here.', true);
    $('go').disabled = true;
    const a = document.createElement('a');
    a.href = '/'; a.textContent = 'Open yearthreethousand to sign in';
    $('note').appendChild(document.createElement('br')); $('note').appendChild(a);
    return;
  }
  $('who').textContent = `signed in as ${me.username || me.name || 'you'}`;
  const refresh = async () => paintScreens(await screens());
  await refresh();
  // The desktop announces itself on a timer, so this list is only ever a few
  // seconds stale. Polling it while idle is cheap and means a screen that
  // opens after the phone does simply appears.
  setInterval(() => { if (!state.running) refresh(); }, 3000);
})();
