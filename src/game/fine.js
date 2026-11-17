// fine.js — HOW FINE THE VOID IS DRAWN, and who decides.
//
// It once took its measure from the room's (../gfx.js). That one begins in
// the middle and only ever steps down, and what it learns is what the room's
// glass costs: so on a screen with two pixels to a point the void was drawn
// with one and a half and stretched, and once the room had stepped down, with
// one and a quarter and its edges left rough. That was the pixelation (Colin,
// 15 Nov 2026). Measured on that Mac: his whole screen at two pixels a point,
// its edges smoothed, is 7 ms a frame (GAME.md, "Measured").
//
// So the void keeps its own measure. It begins with the screen's own pixels
// (two a point at the most), and its edges are always smoothed. It watches
// its own frames, and only them: how long a frame is, from one to the next.
// (A first rule asked the drawing what it costs by reading a pixel back; the
// wait for that answer measured 8 to 10 ms whatever the drawing cost, and in
// a browser that holds its pages to thirty a second it turned the void down
// for nothing and never back up. Measured, 16 Nov 2026.)
//
// When the frames have been long for a while, fewer pixels are TRIED: the
// last step, for two seconds. If the frames are clearly shorter there, the
// pixels were the cause: the step is kept, and from it the void climbs back a
// step at a time while the frames stay good, until a step up makes them long,
// which is taken back. If the frames are no shorter, the pixels were not the
// cause (a page busy with its own work; a browser saving power): the picture
// goes back as it was, and the next try waits twice as long. Where even the
// last step is too slow, its stuff is made plain. A step up that had to be
// taken back makes the next look up twice as slow to come.
//
// Nothing here touches the page or three.js: numbers in, numbers out
// (test/game.test.mjs).

export const FINE = {
  most: 2,                    // pixels a point, at the most
  pixels: 8.3e6,              // …and never more of them than this in all: a 4K screen's worth
  steps: [1, 0.875, 0.75, 0.625, 0.5],      // what it can be turned down to, as shares of where it begins
  least: 0.75,                // …but never under this many pixels a point
  long: 21,                   // ms: frames are long past this (under 48 a second)
  good: 18,                   // ms: frames are good under this (a sixty-a-second screen keeping up, give or take)
  patience: 1.5,              // s of long frames before fewer pixels are tried
  settle: 0.5,                // s after a change before frames are counted (the canvas's first frames are not yet its own)
  trial: 1.5,                 // s of frames counted at the step tried
  gain: 0.8,                  // fewer pixels are kept only if the frames there are this share of what they were, or shorter
  quick: 4,                   // s of good frames before a step up, just after fewer pixels were kept
  look: 30,                   // s of good frames before a step up, otherwise
  wary: 16,                   // …the wait to look up grows to at most this many times `look`, after steps up that had to be taken back
  again: 20,                  // s before fewer pixels are tried again, after a try that bought nothing; twice that each time it buys nothing
  most_again: 320,            // s: …up to this
};

// A person's own choice of a lighter page (Settings; ?gfx= for one load) is kept: at most this many pixels a
// point, and plain stuff. The page's own guess at a tier is never read here: it is about the room's glass.
const BY_HAND = { low: 1.25, smooth: 1 };
export const chosen = (profile) => (profile && profile.manual && BY_HAND[profile.tier]) || 0;

// Pixels a point at each step, finest first, for a screen of `dpr` and a canvas of w by h points (`cap`: a
// person's choice, above). A step that would change nothing is left out: a one-pixel screen has three.
export function ratios(dpr, w, h, cap = 0) {
  const top = Math.max(FINE.least, Math.min(dpr > 0 ? dpr : 1, cap || FINE.most, Math.sqrt(FINE.pixels / Math.max(1, w * h))));
  const out = [];
  for (const s of FINE.steps) { const r = Math.max(FINE.least, top * s); if (!out.length || out[out.length - 1] - r > 0.04) out.push(r); }
  return out;
}

// What the watch remembers. It is kept for as long as the page is (view.js): leaving the void and coming
// back does not begin it again; a new page does, from the top.
export const createWatch = () => ({ level: 0, plain: false, mean: 16.7, hold: FINE.settle, slow: 0, good: 0, calm: 0, wait: FINE.look, back: FINE.again,
  phase: '', why: '', from: 0, before: 0, ring: [], got: [], t: 0, trials: 0 });
// the middle one of some frame times: a hitch among them does not move it
const middle = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

// It was away (the tab hidden, the void left): what it was in the middle of is dropped, and a try under way is
// taken back (the frames it counted were not all its own). Answers 'ratio' when that changed the step.
export function rest(w) {
  const back = !!w.phase && w.level !== w.from;
  if (w.phase) w.level = w.from;
  w.phase = ''; w.why = ''; w.got = []; w.ring = []; w.t = 0; w.slow = 0; w.good = 0;
  w.hold = Math.max(w.hold, FINE.settle);
  return back ? 'ratio' : null;
}

// One frame has gone by: `ms` since the one before. `rs`: the steps this canvas has (ratios).
// Answers 'ratio' when the step has changed (w.level), 'plain' when its stuff is to be made plain (w.plain),
// and null when nothing is to be done.
export function watch(w, ms, rs) {
  if (!(ms > 0)) return null;
  const dt = Math.min(ms, 1000) / 1000, floor = rs.length - 1;
  w.mean += (Math.min(ms, 100) - w.mean) * 0.05;                           // a hitch is one long frame, not a slow machine
  w.ring.push(Math.min(ms, 1000)); if (w.ring.length > 30) w.ring.shift();  // the last frames as they were, for a try to be judged by
  if (w.level > floor) w.level = floor;
  if (w.phase === 'settle') { w.hold -= dt; if (w.hold <= 0) { w.phase = 'trial'; w.got = []; w.t = 0; } return null; }
  if (w.phase === 'trial') {
    w.got.push(Math.min(ms, 1000)); w.t += dt;
    if (w.t < FINE.trial || w.got.length < 3) return null;
    const after = middle(w.got), why = w.why;
    w.got = [];
    w.phase = ''; w.why = ''; w.slow = 0; w.good = 0; w.hold = FINE.settle;
    if (why === 'down') {
      if (after <= FINE.gain * w.before) {                                    // fewer pixels bought something: kept, and soon a step back up is tried
        w.back = FINE.again; w.wait = FINE.quick;
        if (after > FINE.long && !w.plain) { w.plain = true; w.wait = FINE.look; return 'plain'; }      // …and even there it is slow: plain stuff too
        return null;
      }
      w.level = w.from; w.hold = w.back; w.back = Math.min(2 * w.back, FINE.most_again);     // it bought nothing: as it was, and longer before the next try
      return 'ratio';
    }
    if (after > FINE.long) { w.level = w.from; w.wait = Math.min(2 * Math.max(w.wait, FINE.look), FINE.wary * FINE.look); return 'ratio'; }   // one step too many
    return null;                                                               // the step up holds
  }
  if (w.hold > 0) { w.hold -= dt; return null; }
  if (w.mean > FINE.long) {
    w.good = 0; w.calm = 0; w.slow += Math.min(dt, 0.1);
    if (w.slow < FINE.patience) return null;
    w.slow = 0;
    if (w.level < floor) { w.why = 'down'; w.from = w.level; w.before = middle(w.ring); w.level = floor; w.phase = 'settle'; w.hold = FINE.settle; w.trials += 1; return 'ratio'; }
    if (!w.plain) { w.plain = true; w.hold = 2 * FINE.again; return 'plain'; }        // at the bottom already: its stuff is made plain
    w.hold = 3 * FINE.again; return null;                                     // nothing is left to turn down
  }
  w.slow = 0;
  if (w.mean >= FINE.good) { w.good = 0; w.calm = 0; return null; }
  if (w.back > FINE.again && (w.calm += dt) >= FINE.look) { w.back = FINE.again; w.calm = 0; }     // good for a while: the next try is quick again
  if (w.level > 0) {
    w.good += dt;
    if (w.good >= w.wait) { w.good = 0; w.why = 'up'; w.from = w.level; w.before = middle(w.ring); w.level -= 1; w.phase = 'settle'; w.hold = FINE.settle; return 'ratio'; }
  }
  return null;
}
