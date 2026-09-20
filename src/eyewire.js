// ============================================================================
// eyewire.js — WHAT A LENT EYE SENDS, AND WHAT THE ROOM READS.
//
// One definition of the frame, imported by both ends, because the failure mode
// of a wire format with two definitions is not a crash — it is a hand that is
// subtly in the wrong place and a week spent looking at the wrong file.
//
// IT CARRIES LANDMARKS, NOT VIDEO. The phone runs MediaPipe itself and sends
// the points; the desktop never sees a pixel. That is a hundredth of the
// bandwidth of video, it needs no codec, and — the part that actually matters
// — it arrives in exactly the shape perceive.snapshot() already produces, so
// the room's gesture pipeline does not change by one line to accept it.
//
// EVERYTHING IS QUANTISED TO FOUR DECIMALS on the way out. Landmarks are
// normalised to 0..1 and the camera is not accurate to a millionth of a frame
// width; full float precision spends 17 characters to say 0.4831 and the extra
// thirteen are noise. Two hands of 21 points is ~1.1KB packed against ~3.4KB
// raw, which at 24Hz is the difference between 26KB/s and 82KB/s on somebody's
// phone plan.
//
// THE FRAME IS SELF-DATING. `t` is the sender's clock at capture, echoed back
// untouched, so the receiver can say how stale the thing it is holding is
// WITHOUT the two clocks having to agree — it only ever compares a sender
// timestamp against a previous sender timestamp. Wall-clock skew between a
// phone and a laptop is routinely seconds; anything that subtracted one from
// the other would report nonsense with total confidence.
// ============================================================================

export const WIRE = 1;                 // bump if the shape changes incompatibly
const Q = 1e4;                         // four decimals

const q = (v) => Math.round(v * Q) / Q;
const qs = (arr) => { const o = []; for (const p of arr) o.push(q(p[0]), q(p[1]), q(p[2] || 0)); return o; };
const unq = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 3) o.push([flat[i], flat[i + 1], flat[i + 2]]); return o; };

// A snapshot as perceive produces it -> the smallest honest thing to send.
// Absent parts are OMITTED rather than sent as null: a frame with no hands in
// it is the common case while somebody is talking, and it should cost bytes
// proportional to that.
export function pack(snap, t) {
  const f = { v: WIRE, t };
  const hands = (snap && snap.hands) || [];
  const live = hands.filter((h) => h && h.ok && h.points && h.points.length >= 21);
  if (live.length) {
    f.h = live.map((h) => {
      const o = { p: qs(h.points), d: h.handedness || '' };
      // The world set is what the extension test reads — without it a curled
      // finger pointing at the camera reads as extended, which is the exact
      // bug that took two rounds to find. It is not optional.
      if (h.world && h.world.length >= 21) o.w = qs(h.world);
      if (Number.isFinite(h.pinch)) o.n = q(h.pinch);
      return o;
    });
  }
  const head = snap && snap.head;
  if (head && head.ok) f.f = [q(head.x), q(head.y), q(head.z)];
  return f;
}

// ...and back into the shape the room already knows how to read. Written into
// a caller-owned object so the hot path allocates nothing per frame: the room
// reads this sixty times a second and a fresh object graph each time is work
// the garbage collector has to undo.
export function unpack(f, into = null) {
  const out = into || { head: { x: 0, y: 0, z: 0, ok: false, age: 0 }, hands: [], t: 0 };
  if (!f || f.v !== WIRE) return out;
  out.t = f.t || 0;
  const src = Array.isArray(f.h) ? f.h : [];
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    const h = out.hands[i] || (out.hands[i] = { points: [], tips: [], extended: [], world: [], handedness: '', pinch: 1, ok: false, age: 0, seenAt: 0 });
    h.points = unq(s.p || []);
    h.world = s.w ? unq(s.w) : [];
    h.handedness = s.d || '';
    h.pinch = Number.isFinite(s.n) ? s.n : 1;
    h.ok = h.points.length >= 21;
    h.age = 0;
    // seenAt is the SENDER's clock, which is the whole point: the room's
    // fresh-reading test asks "is this a different reading from last frame",
    // and the only clock that can answer that is the one that took it.
    h.seenAt = out.t;
  }
  // Hands that were in the last frame and are not in this one have left.
  for (let i = src.length; i < out.hands.length; i++) out.hands[i].ok = false;
  const head = out.head;
  if (Array.isArray(f.f)) { head.x = f.f[0]; head.y = f.f[1]; head.z = f.f[2]; head.ok = true; head.age = 0; }
  else head.ok = false;
  return out;
}

// How many bytes this frame will actually cost, for the readout. Measured
// rather than estimated, because the answer is the thing being shown.
export function weigh(f) { return JSON.stringify(f).length; }
