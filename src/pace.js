// ============================================================================
// pace.js — WHICH VSYNCS DRAW. One clock shared by every render loop.
//
// A machine that manages forty frames a second does not look like forty: frames
// land on vsync multiples, so it alternates 16.7, 33 and 50ms, and that
// unevenness is what reads as glitchy (gfx.js measured "high" and "mid" both
// sitting at exactly two vsyncs with most frames missed). An even thirty looks
// smoother than an uneven forty-five. So this picks a divisor N and lets a loop
// draw only on every Nth vsync.
//
// THE SAME VSYNCS FOR EVERY LOOP. requestAnimationFrame hands every callback in
// one frame the same timestamp, so the first loop to ask about a timestamp
// decides for that vsync and every other loop asking with the same timestamp
// gets the same answer. The orb and the liquid glyphs therefore draw together
// or rest together, never interleaved into a cadence that is even for neither.
//
// A LOOP MUST ASK EVERY VSYNC it is scheduled on (`if (!due(ts)) return;` right
// after it re-schedules itself), and must measure its own dt only on the frames
// it draws, so a skipped vsync is time that passes, not time that is lost.
//
// WHAT THE GOVERNOR JUDGES. Skipped vsyncs are cheap, so the plain rAF interval
// stops meaning anything once N > 1: it reads 16.7ms on a machine that is
// missing every drawn slot. This keeps the intervals between DRAWN frames, and
// gfx.js judges those.
// ============================================================================

const RING = 120;            // vsync intervals kept for the refresh estimate
const KEEP_DRAWN = 600;      // drawn-frame intervals kept for the judge
const GAP_MS = 250;          // longer than this is a hidden tab or a stall, not a vsync

let fps = 0;                 // 0 = every vsync
let refresh = 1000 / 60;     // estimated ms per vsync
let divisor = 1;
let lastTs = -1;
let idx = 0;                 // vsyncs seen
let lastDrawIdx = -Infinity;
let lastDrawTs = -1;
let dueNow = true;
let sinceEstimate = 0;
const deltas = [];
let drawn = [];
let stalls = 0;              // gaps between GAP_MS and a second: felt, not hidden-tab

function recompute() {
  divisor = fps > 0 ? Math.max(1, Math.round(1000 / fps / refresh)) : 1;
}

// The refresh interval is the SHORT end of what is seen, not the median: a
// struggling machine misses vsyncs, and its median is a multiple of the real
// interval. The tenth percentile is the display; everything above it is load.
function estimate() {
  if (deltas.length < 30) return;
  const s = deltas.slice().sort((a, b) => a - b);
  const r = s[Math.floor(s.length * 0.1)];
  if (r > 4 && r < 60) { refresh = r; recompute(); }
}

// Should the loop asking draw on this vsync? Call with the rAF timestamp.
export function due(ts) {
  if (ts === lastTs) return dueNow;
  if (lastTs >= 0) {
    const d = ts - lastTs;
    if (d > 0 && d < GAP_MS) {
      deltas.push(d);
      if (deltas.length > RING) deltas.shift();
      if (++sinceEstimate >= 30) { sinceEstimate = 0; estimate(); }
      idx += Math.max(1, Math.round(d / refresh));
    } else if (d >= GAP_MS) {
      if (d < 1000) stalls += 1;
      // Back from a hidden tab, a sleep, or a long stall: start the cadence
      // fresh and draw now, rather than count the gap as missed slots.
      idx += 1;
      lastDrawIdx = -Infinity;
      lastDrawTs = -1;
    }
  }
  lastTs = ts;
  dueNow = idx - lastDrawIdx >= divisor;
  if (dueNow) {
    if (lastDrawTs >= 0) {
      drawn.push(ts - lastDrawTs);
      if (drawn.length > KEEP_DRAWN) drawn.splice(0, drawn.length - KEEP_DRAWN);
    }
    lastDrawIdx = idx;
    lastDrawTs = ts;
  }
  return dueNow;
}

// The frame-rate ceiling. 0 = the display's own rate. Anything else is turned
// into a whole number of vsyncs, so 30 on a 144Hz panel is every fifth vsync
// (28.8fps, even) rather than an uneven thirty.
export function setFps(n) {
  fps = n > 0 ? n : 0;
  recompute();
}

// For the governor: the drawn-frame intervals since the last call, and the
// stalls (250ms–1s gaps) counted since the last call.
export function takeDrawn() {
  const d = drawn;
  drawn = [];
  const s = stalls;
  stalls = 0;
  return { intervals: d, stalls: s, slotMs: divisor * refresh, refresh, divisor };
}

export function stats() {
  return { fpsTarget: fps, refresh, divisor, drawnFps: 1000 / (divisor * refresh) };
}

// Tests only.
export function _reset() {
  fps = 0; refresh = 1000 / 60; divisor = 1; lastTs = -1; idx = 0;
  lastDrawIdx = -Infinity; lastDrawTs = -1; dueNow = true; sinceEstimate = 0;
  deltas.length = 0; drawn = []; stalls = 0;
}
