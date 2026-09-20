// ============================================================================
// remote.mjs — A PHONE LENDS ITS EYE TO A SCREEN THAT HAS NONE.
//
// Colin's monitor has no camera. His phone has two. So the phone watches him
// and the desktop room reacts — which is the same feature REACH.md §5 called
// "the phone as a remote", arriving for a different reason than expected.
//
// WHAT CROSSES THE WIRE IS NOT VIDEO, and that decision is the whole design.
// The phone runs MediaPipe itself and sends the LANDMARKS: 21 points per hand
// and the face's transform, about a kilobyte a frame at 24Hz. Video would need
// WebRTC, cost far more latency, and still leave the inference to be done at
// one end or the other. Landmarks also mean the desktop's gesture pipeline
// does not change by one line — perceive.snapshot() already produces exactly
// this shape, so the room simply reads a remote source instead of a local one
// and the palm halt, the pinch, the two-hand language and the spin all work
// untouched.
//
// THE CHANNEL IS THE ONE ALREADY IN PRODUCTION. streams.mjs is this pattern
// with a different noun — SSE fan-out down, POST up — and it is proven on
// Render, reconnects by itself, and needs no new infrastructure. This file
// clones its bookkeeping and its heartbeat discipline deliberately.
//
// PAIRING IS BY ACCOUNT, NOT BY CODE. REACH.md specced a typed pairing code
// because it assumed a phone that was not signed in; signing in on both devices
// is what Colin actually asked for, and it is strictly safer — there is nothing
// to brute-force, because the only rooms a phone can see or feed are ones owned
// by the account it is already authenticated as. A stranger cannot enumerate
// them, cannot claim one, and cannot send a frame to one. The route layer is
// responsible for never calling anything here with a uid it has not verified.
//
// All state is in memory and dies with the process. A pairing that does not
// survive a deploy is correct: both ends reconnect, and a stale eye is worse
// than an absent one.
// ============================================================================

const ROOM_STALE_MS = 45_000;    // a room that stops saying it is here is gone
const EYE_STALE_MS = 6_000;      // ...and an eye that stops sending has looked away
const MAX_ROOMS_PER_USER = 4;    // a laptop, a desktop, a spare tab, one to grow on
const MAX_FRAME_BYTES = 24_000;  // two hands of landmarks is ~1KB; this is generous
const SWEEP_MS = 10_000;

// deviceId -> room. deviceId is minted by the desktop and is opaque here.
const rooms = new Map();

const now = () => Date.now();

function sseWrite(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); return true; }
  catch { return false; }
}

// Everything below takes a uid that the ROUTE has already verified against the
// signed cookie. Nothing here authenticates; everything here authorizes.
const mine = (uid, deviceId) => {
  const r = rooms.get(deviceId);
  return r && uid && r.uid === uid ? r : null;
};

// A desktop says: I am here, I have no camera, I would like an eye. Called on
// open and refreshed on a timer — a room that stops saying it is here is reaped
// rather than lingering in someone's device list forever.
export function offer(uid, deviceId, label) {
  if (!uid || !deviceId) return false;
  const had = rooms.get(deviceId);
  if (had && had.uid !== uid) return false;          // never re-home a device
  if (!had) {
    // Bound per account, oldest first — a tab that crashed and reopened a
    // hundred times must not fill the list it is trying to appear in.
    const ours = [...rooms.values()].filter((r) => r.uid === uid);
    if (ours.length >= MAX_ROOMS_PER_USER) {
      ours.sort((a, b) => a.lastSeen - b.lastSeen);
      close(ours[0].deviceId, 'replaced');
    }
    rooms.set(deviceId, {
      uid, deviceId, label: String(label || 'a screen').slice(0, 40),
      res: null, lastSeen: now(), eyeAt: 0, frames: 0, openedAt: now(),
      // Desktop -> phone, piggybacked on the reply to the phone's next POST.
      // A second SSE in the other direction would be a second connection to
      // keep alive for a handful of messages; the phone is already talking to
      // us twenty-four times a second and the answer can simply ride back.
      // Used for WebRTC signalling, which is exactly this shape: a few
      // hundred bytes, twice, at the start.
      back: [],
    });
  } else {
    had.lastSeen = now();
    if (label) had.label = String(label).slice(0, 40);
  }
  return true;
}

// What this account has waiting. The phone's whole pairing UI is this list.
export function list(uid) {
  const t = now();
  return [...rooms.values()]
    .filter((r) => r.uid === uid)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((r) => ({
      deviceId: r.deviceId,
      label: r.label,
      // Is anybody actually listening at the other end? A room whose page was
      // closed without a clean goodbye still sits here until the sweep, and
      // offering it as connectable would be a lie.
      watching: !!r.res,
      // ...and is an eye already feeding it? Two phones on one room is allowed
      // — the last frame wins — but the second one should know.
      eye: t - r.eyeAt < EYE_STALE_MS,
      age: Math.round((t - r.openedAt) / 1000),
    }));
}

// THE DESKTOP'S END. One listener per room: a second attach replaces the first
// rather than fanning out, because two copies of one room's eye is not a
// feature, it is the same tab left open twice.
export function attach(uid, deviceId, res) {
  const r = mine(uid, deviceId);
  if (!r) return false;
  if (r.res && r.res !== res) { sseWrite(r.res, 'end', { reason: 'replaced' }); try { r.res.end(); } catch { /* gone */ } }
  r.res = res;
  r.lastSeen = now();
  res.on('close', () => { if (r.res === res) r.res = null; });
  sseWrite(res, 'hello', { deviceId, eye: now() - r.eyeAt < EYE_STALE_MS });
  return true;
}

// THE PHONE'S END. `frame` is opaque to this module on purpose — the server has
// no business understanding landmarks, and a schema here would be a second
// place to update every time the tracker changes. It is bounded, not parsed.
export function feed(uid, deviceId, frame) {
  const r = mine(uid, deviceId);
  if (!r) return { ok: false, error: 'no such screen' };
  const body = JSON.stringify(frame);
  if (body.length > MAX_FRAME_BYTES) return { ok: false, error: 'frame too large' };
  r.eyeAt = now();
  r.lastSeen = r.eyeAt;
  r.frames += 1;
  // A room nobody is watching still accepts frames and drops them. The phone
  // must not have to care whether the desktop has reconnected this second, and
  // an error here would make it back off exactly when it should not.
  const back = r.back.length ? r.back.splice(0, r.back.length) : undefined;
  if (!r.res) return { ok: true, watching: false, back };
  if (!sseWrite(r.res, 'see', frame)) { r.res = null; return { ok: true, watching: false, back }; }
  return { ok: true, watching: true, back };
}

// The desktop's word back. Bounded hard: a phone that stops POSTing must not
// leave an unbounded queue behind it, and signalling is a handful of messages
// — anything that fills this is a bug, not a busy channel.
const MAX_BACK = 16;
export function say(uid, deviceId, msg) {
  const r = mine(uid, deviceId);
  if (!r) return false;
  if (r.back.length >= MAX_BACK) r.back.shift();
  r.back.push(msg);
  return true;
}

// Either end may end it, and ending it must actually close the connection
// server-side rather than merely stopping the listening.
export function close(deviceId, reason = 'closed') {
  const r = rooms.get(deviceId);
  if (!r) return false;
  if (r.res) { sseWrite(r.res, 'end', { reason }); try { r.res.end(); } catch { /* gone */ } }
  rooms.delete(deviceId);
  return true;
}

export function release(uid, deviceId, reason = 'closed') {
  return mine(uid, deviceId) ? close(deviceId, reason) : false;
}

// A room whose desktop has gone quiet. Held open while an SSE listener is still
// attached: a person watching an empty room is still watching.
export function sweep(t = now()) {
  let n = 0;
  for (const r of [...rooms.values()]) {
    if (r.res) { r.lastSeen = t; continue; }
    if (t - r.lastSeen > ROOM_STALE_MS) { close(r.deviceId, 'stale'); n += 1; }
  }
  return n;
}

export function stats() {
  return { rooms: rooms.size, watching: [...rooms.values()].filter((r) => r.res).length };
}

// Not started at import: a module that schedules work the moment it is required
// is a module that cannot be tested.
export function startSweeper(ms = SWEEP_MS) {
  const h = setInterval(() => sweep(), ms);
  h.unref?.();
  return () => clearInterval(h);
}

export const _internals = { rooms, ROOM_STALE_MS, EYE_STALE_MS, MAX_ROOMS_PER_USER, MAX_FRAME_BYTES };
