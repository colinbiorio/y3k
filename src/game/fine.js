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
// its own frames. When they have been long for a while it asks the drawing
// itself what it costs, by waiting for it (view.js): a long frame is not
// always the drawing's doing. A browser saving power holds every page to
// thirty a second, and turning the picture down there would buy nothing.
// And what a frame costs is two things: what the page spends making it, and
// what it then waits for the picture. Only the wait is the pixels' doing.
// So fewer pixels are tried only where they would buy something, as far down
// as it needs and no further; where they would not, or at the bottom, its
// stuff is made plain. Where there is room again it is turned back up, a
// step at a time; and a step up that had to be taken back makes it twice as
// slow to try the next one.
//
// Nothing here touches the page or three.js: numbers in, numbers out
// (test/game.test.mjs).

export const FINE = {
  most: 2,                    // pixels a point, at the most
  pixels: 8.3e6,              // …and never more of them than this in all: a 4K screen's worth
  steps: [1, 0.875, 0.75, 0.625, 0.5],      // what it can be turned down to, as shares of where it begins
  least: 0.75,                // …but never under this many pixels a point
  long: 21,                   // ms: a frame is long past this (under 48 a second)
  patience: 1.5,              // s of long frames before the drawing is asked what it costs
  asks: 5,                    // frames it is asked for; the middle one is believed
  busy: 12,                   // ms: a drawing that costs this much is the cause, and is turned down
  aim: 11,                    // …to where it should cost no more than this
  worth: 0.75,                // …or, where that cannot be reached, to the bottom if it would cost this share of what it does, or less
  room: 8,                    // ms: it is turned back up a step only if it would still cost under this
  settle: 2,                  // s it is left alone after any change
  again: 20,                  // s before it is asked again, when it was not the cause
  look: 30,                   // s of good frames between looks at whether there is room
  wary: 16,                   // …and at the most this many times that, after steps up that had to be taken back
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
export const createWatch = () => ({ level: 0, plain: false, mean: 16.7, hold: FINE.settle, slow: 0, good: 0, asking: '', costs: [], cost: 0, waited: 0, wait: FINE.look, rose: false });

// It was away (the tab hidden, the void left): what it was in the middle of is dropped.
export function rest(w) { w.hold = Math.max(w.hold, FINE.settle / 2); w.slow = 0; w.asking = ''; w.costs = []; }

// One frame has gone by. `ms`: since the one before. `cost`: what the last one took, if the watch had asked
// (w.asking was set when it began), else null: [ms the page spent making it, ms it then waited for the picture].
// `rs`: the steps this canvas has (ratios).
// Answers 'ratio' when the step has changed (w.level), 'plain' when its stuff is to be made plain (w.plain),
// and null when nothing is to be done.
export function watch(w, ms, cost, rs) {
  if (!(ms > 0)) return null;
  const dt = Math.min(ms, 1000) / 1000, floor = rs.length - 1;
  w.mean += (Math.min(ms, 100) - w.mean) * 0.05;                          // a hitch is one long frame, not a slow machine
  if (w.level > floor) w.level = floor;
  if (w.asking) {
    if (!cost) return null;
    w.costs.push(cost);
    if (w.costs.length < FINE.asks) return null;
    const [made, waited] = w.costs.sort((a, b) => a[0] + a[1] - b[0] - b[1])[FINE.asks >> 1], c = made + waited, why = w.asking, from = rs[w.level];
    const at = (to) => made + waited * (rs[to] / from) ** 2;               // what it would cost at another step, were the wait all pixels
    w.cost = c; w.waited = waited; w.asking = ''; w.costs = []; w.slow = 0; w.good = 0; w.hold = FINE.settle;
    if (why === 'up') {
      if (w.level > 0 && at(w.level - 1) < FINE.room) { w.level -= 1; w.rose = true; return 'ratio'; }
      return null;
    }
    if (c < FINE.busy) { w.hold = FINE.again; return null; }               // slow, and not by this: it is left as it is
    if (w.rose) { w.rose = false; w.wait = Math.min(2 * w.wait, FINE.wary * FINE.look); }      // the step up was one too many
    if (w.level < floor) {
      let to = w.level + 1;
      while (to < floor && at(to) > FINE.aim) to += 1;
      if (at(to) <= FINE.aim || at(to) <= FINE.worth * c) { w.level = to; return 'ratio'; }
    }
    if (!w.plain) { w.plain = true; w.hold = 2 * FINE.settle; return 'plain'; }                       // fewer pixels would buy next to nothing, or there are no fewer
    w.hold = 3 * FINE.again; return null;                                  // nothing is left to turn down
  }
  if (w.hold > 0) { w.hold -= dt; return null; }
  if (w.mean > FINE.long) { w.good = 0; w.slow += dt; if (w.slow >= FINE.patience) w.asking = 'down'; return null; }
  w.slow = 0;
  if (w.level > 0 || w.rose) {
    w.good += dt;
    if (w.good >= w.wait) { w.good = 0; w.rose = false; if (w.level > 0) w.asking = 'up'; }           // the last step up has held
  }
  return null;
}
