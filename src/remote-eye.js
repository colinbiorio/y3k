// ============================================================================
// remote-eye.js — THE ROOM, SEEING THROUGH A PHONE.
//
// This pretends to be perceive. That is the entire trick and it is why the
// feature costs almost nothing: handview asks its source for snapshot() sixty
// times a second and does not care where the hands came from, so a monitor with
// no camera borrows one and every gesture — the palm halt, the pinch, the
// two-hand language, the spin, the cursors — arrives already working.
//
// IT NEVER RECEIVES A PIXEL. The phone runs the tracker; this receives points.
// See eyewire.js for the shape and remote.mjs for the channel.
//
// TWO WAYS IN, and it does not care which:
//   the relay  an EventSource, which reconnects by itself and costs ~165ms
//   direct     a WebRTC data channel the phone offers, single-digit ms on wifi
// The offer arrives down the relay like anything else; the answer goes back up
// the little piggyback channel. If the direct route never opens the relay is
// still carrying every frame and nothing has to change.
//
// AGE IS MEASURED IN THE SENDER'S CLOCK, ALWAYS. A phone and a laptop disagree
// about the time by seconds routinely, so nothing here ever subtracts one
// clock from the other. Staleness is "how long since a frame arrived", by the
// local clock; the sender's timestamp is only ever compared with the previous
// sender's timestamp, which is what the room's fresh-reading test wants.
// ============================================================================

import { pack, unpack } from './eyewire.js';

// No frame for this long and the hands are gone. Generous next to the room's
// own 24Hz because a phone on wifi drops packets and a cursor that blinks out
// on one lost frame is worse than one that lingers a fifth of a second.
const STALE_MS = 400;
const HERE_MS = 15_000;      // how often the screen says it is still here

const KEY = 'y3k.eye.device';
const NAME_KEY = 'y3k.eye.name';

// WHAT TO CALL THIS DEVICE. navigator.platform was the first thing to hand and
// it is the wrong thing: it reported "MacIntel" for an Apple Silicon Mac (the
// string is frozen at a lie browsers tell for compatibility) and "Linux armv81"
// for an Android phone. Nobody picks their own laptop out of a list that says
// Linux armv81.
//
// So: the coarsest honest guess, from the user agent, and a box to overrule it.
// Guessing is only ever a starting point here — the person looking at the list
// is the one who knows which device is which, and two identical phones will
// always need a name typed by hand.
export function deviceName() {
  try { const v = localStorage.getItem(NAME_KEY); if (v) return v; } catch { /* private */ }
  const ua = (navigator.userAgent || '');
  const touch = matchMedia('(pointer: coarse)').matches;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPad';
  if (/Android/.test(ua)) return touch ? 'Android phone' : 'Android tablet';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux machine';
  return 'a screen';
}

export function renameDevice(v) {
  const name = String(v || '').trim().slice(0, 32);
  try { if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY); } catch { /* private */ }
  return name || deviceName();
}

function deviceId() {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) { v = 'd' + crypto.randomUUID().replace(/-/g, '').slice(0, 24); localStorage.setItem(KEY, v); }
    return v;
  } catch { return 'd' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36); }
}

// EVERY SIGNED-IN DEVICE ANNOUNCES ITSELF AND LISTENS, ALWAYS — not only when
// it wants something. That is what makes the two controls symmetric: you can
// only pick "lend to the Mac" on your phone if the Mac is in a list, and the
// Mac can only be in a list if it said it was there without being asked to.
//
// It is cheap: one small POST every fifteen seconds and one idle SSE, which is
// the same thing the app already keeps open for a live stream.
export function createRemoteEye({ label = 'this screen', lender = null } = {}) {
  const id = deviceId();
  let es = null, pc = null, chan = null;
  let here = 0, on = false;
  let lastAt = 0;              // local clock, for staleness only
  let lastT = 0;               // the SENDER's clock, for the fresh test
  let via = 'off', frames = 0;
  let onState = null, onLend = null;
  let from = null;          // whose camera we asked for, if any

  // One object, rewritten in place — handview reads this every frame and a
  // fresh object graph sixty times a second is work the collector has to undo.
  const snap = { head: { x: 0, y: 0, z: 0, ok: false, age: Infinity }, hands: [], t: 0 };

  const say = (v) => { via = v; onState?.(status()); };

  function take(f) {
    if (!f) return;
    if (f.sig) return signal(f);
    // A WORD FROM ANOTHER OF YOUR DEVICES. This is what lets "borrow from the
    // phone" be a thing you choose on the Mac: the Mac asks the phone to start,
    // rather than the phone having to be the one that decides.
    if (f.ctl) return control(f);
    if (!f.v) return;                       // a heartbeat, not a frame
    unpack(f, snap);
    // The room's own loop asks "is this reading new?" by comparing seenAt.
    // Two frames with the same sender timestamp would read as one repeated
    // reading, which is exactly right — and is also why this must never be
    // replaced with a local clock, which would make every arrival look new.
    lastT = snap.t;
    lastAt = performance.now();
    frames += 1;
  }

  function control(f) {
    if (f.ctl === 'lend' && f.to && lender) {
      // Somebody who shares this account asked for our camera. Honour it: the
      // account is the permission, and this message could not have arrived
      // from anyone else — the server only routes between one account's own
      // devices. onLend lets the page turn the tracker on and say so.
      lender.start(f.to);
      onLend?.(f.to);
    } else if (f.ctl === 'stop' && lender) {
      lender.stop();
      onLend?.(null);
    }
  }

  // The phone offers; we answer. Nothing else about the negotiation is ours.
  async function signal(f) {
    if (f.sig !== 'offer' || typeof RTCPeerConnection !== 'function') return;
    try {
      if (pc) { try { pc.close(); } catch { /* gone */ } }
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.ondatachannel = (e) => {
        chan = e.channel;
        chan.onmessage = (m) => { try { take(JSON.parse(m.data)); } catch { /* a bad frame is not fatal */ } };
        chan.onopen = () => say('direct');
        chan.onclose = () => { if (chan === e.channel) { chan = null; say(es ? 'relay' : 'off'); } };
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && !chan) say(es ? 'relay' : 'off');
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: f.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await new Promise((res) => {
        if (pc.iceGatheringState === 'complete') return res();
        const t = setTimeout(res, 1500);
        pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } };
      });
      await fetch(`/api/remote/eye/${id}/say`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sig: 'answer', sdp: pc.localDescription.sdp }),
      });
    } catch { /* the relay is already carrying it; a failed upgrade is not a failure */ }
  }

  async function announce() {
    try {
      await fetch('/api/remote/here', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: id, label }),
      });
    } catch { /* offline; the next beat will do */ }
  }

  function status() {
    const age = lastAt ? performance.now() - lastAt : Infinity;
    return { on, via, id, from, frames, seeing: age < STALE_MS, ageMs: Math.round(Math.min(age, 99999)) };
  }

  return {
    id,
    // THE SHIM. Identical in shape to perceive.snapshot(), including the habit
    // of handing back the same object each time.
    snapshot() {
      const age = lastAt ? performance.now() - lastAt : Infinity;
      if (age > STALE_MS) {
        // The phone has stopped, or the wifi has. Hands OFF rather than frozen:
        // a hand left on screen where it was a second ago is a hand that will
        // grab the orb the moment it comes back, from a position nobody meant.
        for (const h of snap.hands) h.ok = false;
        snap.head.ok = false;
      }
      snap.head.age = age;
      for (const h of snap.hands) h.age = age;
      return snap;
    },

    // Announce and listen. Called once at boot for every signed-in device —
    // being in the list is not a mode, it is just being switched on.
    start() {
      if (on) return;
      on = true; say('idle');
      announce();
      here = setInterval(announce, HERE_MS);
      // EventSource, not fetch: it reconnects by itself, which matters on a
      // laptop lid and on Render's idle proxy.
      es = new EventSource(`/api/remote/eye/${id}/events`);
      es.addEventListener('see', (e) => { try { take(JSON.parse(e.data)); } catch { /* ignore a bad frame */ } });
      es.addEventListener('end', () => { say('off'); });
      es.onerror = () => { if (!chan) say('reconnecting'); };
      es.onopen = () => { if (!chan) say('relay'); };
    },

    stop() {
      if (!on) return;
      on = false;
      clearInterval(here);
      if (es) { es.close(); es = null; }
      if (chan) { try { chan.close(); } catch { /* gone */ } chan = null; }
      if (pc) { try { pc.close(); } catch { /* gone */ } pc = null; }
      for (const h of snap.hands) h.ok = false;
      snap.head.ok = false;
      lastAt = 0; lastT = 0;
      fetch(`/api/remote/eye/${id}/close`, { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      say('off');
    },

    // ASK ANOTHER OF YOUR DEVICES FOR ITS CAMERA. The whole of "borrow".
    async borrow(deviceId) {
      if (from && from !== deviceId) await this.release();
      from = deviceId || null;
      if (!from) return;
      say('relay');
      await fetch(`/api/remote/eye/${from}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ctl: 'lend', to: id }),
      }).catch(() => {});
    },

    // ...and tell it to stop, rather than just ignoring what it sends.
    async release() {
      const was = from; from = null;
      for (const h of snap.hands) h.ok = false;
      snap.head.ok = false;
      lastAt = 0;
      say('idle');
      if (was) {
        await fetch(`/api/remote/eye/${was}`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ctl: 'stop' }),
        }).catch(() => {});
      }
    },

    borrowing() { return from; },
    running() { return on; },
    status,
    onState(fn) { onState = fn; },
    onLend(fn) { onLend = fn; },
  };
}

// ============================================================================
// THE OTHER HALF: THIS DEVICE LENDING ITS CAMERA TO ANOTHER ONE.
//
// eye.html exists because a phone running the full room AND a tracker at the
// same time was, until today, a phone doing neither well. The graphics tiers
// changed that — the governor drops a phone to the light tier on its own — so
// the full app can now be the eye too, which is what Colin asked for and is
// obviously nicer than a second page to remember the address of.
//
// It sends whatever the LOCAL tracker is already producing. No second camera,
// no second model, no second inference: perceive is running anyway because the
// person turned tracking on, and this simply posts what it sees.
// ============================================================================
export function createLender({ perceive }) {
  let to = null, timer = 0, inflight = false, sent = 0, lastT = 0, err = '';

  async function beat() {
    if (!to || inflight) return;
    let snap = null;
    try { snap = perceive?.snapshot?.(); } catch { return; }
    if (!snap) return;
    // NOTHING NEW, NOTHING SENT. The tracker runs at 24Hz under a loop that may
    // be faster; posting the same reading twice spends a round trip to say
    // something the other end already knows, and — worse — the room's
    // fresh-reading test would see two different arrival times for one reading.
    const t = Math.max(0, ...snap.hands.filter((h) => h.ok).map((h) => h.seenAt || 0));
    if (t && t === lastT) return;
    lastT = t;
    inflight = true;
    try {
      const r = await fetch(`/api/remote/eye/${to}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pack(snap, Math.round(performance.now()))),
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok === false) { err = r.error || 'that screen stopped listening'; stop(); }
      else { sent += 1; err = ''; }
    } finally { inflight = false; }
  }

  function stop() { clearInterval(timer); timer = 0; to = null; }

  return {
    // 24Hz, the rate the tracker actually produces. Faster would send repeats.
    start(deviceId) { stop(); to = deviceId; sent = 0; lastT = 0; err = ''; timer = setInterval(beat, 1000 / 24); },
    stop,
    to() { return to; },
    status() { return { to, sent, err }; },
  };
}

// WHICH EYE THE ROOM IS LOOKING THROUGH. handview takes one source and asks it
// for a snapshot; this is the switch in front of it, so neither the tracker nor
// the view has to learn that the other kind exists. The remote wins ONLY while
// it is actually seeing something — a phone that has been put down must hand
// the room straight back to its own camera rather than leaving it blind.
export function createEyeSwitch({ local, remote }) {
  return {
    snapshot() {
      if (remote && remote.borrowing()) {
        const s = remote.snapshot();
        if (s.hands.some((h) => h.ok) || s.head.ok) return s;
        // Nothing from the phone this instant. If the local camera is running
        // too, let it answer; otherwise hand back the empty remote snapshot so
        // the hands go away rather than freezing.
        return local?.snapshot?.() || s;
      }
      return local?.snapshot?.() || { head: { ok: false, age: Infinity }, hands: [], t: 0 };
    },
    // Everything else a caller might reach for goes to the real tracker: the
    // remote has no camera of its own to start, no models to load, and no
    // status of the kind the settings screen reads.
    detail: (...a) => local?.detail?.(...a),
    setFace: (...a) => local?.setFace?.(...a),
    setHands: (...a) => local?.setHands?.(...a),
    stop: (...a) => local?.stop?.(...a),
  };
}
