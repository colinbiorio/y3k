// ============================================================================
// gfx.js — HOW MUCH ROOM THIS MACHINE CAN AFFORD.
//
// Colin asked whether we could "detect the system peripherals and optimize
// exactly for the machine that's being used". We cannot, and the reason is
// worth stating because it is the whole design of this file: nothing a web page
// can ask about a machine predicts whether THIS page will be smooth on it.
// hardwareConcurrency counts cores, not the GPU. deviceMemory is rounded to a
// power of two and lies on purpose. The unmasked renderer string is being
// removed from browsers for fingerprinting, and where it survives it names a
// chip, not a thermal state or what else is running. devicePixelRatio was
// MEASURED here to predict nothing at all: dropping it from 2 to 1 changed the
// frame rate by 0.7 fps.
//
// So this does not guess. IT WATCHES THE FRAME RATE, which is the only honest
// signal, costs nothing, and is right about the machine, the window size, the
// other tabs, the battery state and the afternoon all at once.
//
// WHAT IT SWITCHES, AND WHY IT SWITCHES SEVERAL THINGS AT ONCE. Measured in an
// Electron window on the room (medians of five runs, spread 1.6x):
//
//   baseline                          12.3 fps    p50 66.7ms    98% of frames >32ms
//   without the mercury blits         12.5 fps  — inside the noise
//   without the orb's bloom           16.8 fps
//   without backdrop-filter           20.3 fps
//   without all three                 44.8 fps    p50 16.8ms    32%
//
// Read that last row against the ones above it. Each thing alone buys a little;
// all of them together buy 3.6x. That is the signature of several things each
// forcing the GPU to synchronise in the same frame — take one away and the next
// one simply becomes the wall. It is also why the two obvious knobs did nothing
// when they were tried: a smaller blur radius and a lower pixel ratio both make
// one of these CHEAPER without removing a single sync.
//
// The consequence is the rule this file is built on: A TIER THAT TURNS DOWN ONE
// THING WILL MEASURE AS DOING NOTHING. Tiers here drop whole categories
// together or they are not worth having.
// ============================================================================

// The tiers, worst last. Each names what it takes away.
//
//   high  everything. The room as designed.
//   mid   the three VIEWPORT-SCALE blurs go — the nav frame, the panel behind
//         it, the chat stadium. The frost stays everywhere it is small and
//         everywhere the standing rule puts it: fields, cards, sheets. To the
//         eye this is close; to the compositor it is most of the work.
//   low   no backdrop-filter at all, and no bloom. This is the one that looks
//         different, and it is the one that makes the app usable at all on a
//         machine that cannot hold fifteen frames a second.
export const TIERS = ['high', 'mid', 'low'];

// A frame slower than this is a frame you can see. NOT 33ms: a 30fps floor
// sounds reasonable and is the wrong number, because frame times quantise to
// vsync multiples — measured, "high" sits at 33.3ms and "mid" at 31.9ms, which
// are both simply TWO FRAMES, and a 33ms threshold would step down once, land
// on the other side of the same coin, and stop. 22ms sits between one frame and
// two, so the meter keeps going until the median is a single frame.
const SLOW_MS = 22;
// How long a window has to look bad before stepping down. Long enough that a
// garbage collection, a view switch, or the 1.5s mercury bake at startup cannot
// trigger it; short enough that a person does not sit through a minute of it.
const JUDGE_MS = 4000;
// ...and it has to be bad for this many windows in a row. One bad four seconds
// is a page doing something; three is a machine that cannot.
const PATIENCE = 2;
// Nothing is judged until the room has settled. The bake alone is 1.5s and the
// first frames of any WebGL page are the worst it will ever be.
const WARMUP_MS = 6000;

const KEY = 'y3k.gfx';

// WHERE A FIRST-TIME VISITOR STARTS, and it is deliberately not the top.
// Measured on an Apple Silicon Mac, which is near the fast end of what anyone
// will bring: "high" holds 27.5 fps with a median frame of two vsyncs and 76%
// of frames missed. If the best-case machine cannot hold sixty at the top tier
// then the top tier is not a default, it is a preference — and nobody's first
// second in the room should be at thirty frames while a governor works out
// that it should not be. "mid" keeps every small frost, including every one
// the standing rule puts on a text field; what it drops is the three
// viewport-scale blurs, which is where the cost actually was.
const START = 'mid';

// IT ONLY EVER STEPS DOWN, within a session. A governor that steps back up when
// things improve oscillates: it drops a tier, the frame rate recovers BECAUSE
// it dropped a tier, it restores, the frame rate falls again — and the room
// pulses between two looks forever. Going down is a decision; going up is the
// next page load, where the remembered tier is the starting guess and a machine
// that has since got faster gets judged again from there.
export function createGfx({ body, root = null, storage = null } = {}) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);

  let manual = null;          // a person's choice, which always wins
  let at = TIERS.indexOf(START);   // index into TIERS
  let bad = 0;                // consecutive windows judged bad
  let samples = [];
  let windowFrom = 0;
  let startedAt = 0;
  let raf = 0, last = 0, running = false;
  let onChange = null;

  const read = () => { try { return store && store.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { store && store.setItem(KEY, v); } catch { /* private window */ } };

  function apply() {
    const tier = manual || TIERS[at];
    if (el) el.dataset.gfx = tier;
    // The bloom is not CSS, so it is switched here rather than in the
    // stylesheet. Everything else a tier does is a selector.
    body?.setBloom?.(tier !== 'low');
    onChange?.(tier);
    return tier;
  }

  function stepDown(why) {
    if (manual || at >= TIERS.length - 1) return false;
    at += 1;
    write(TIERS[at]);
    const tier = apply();
    console.log(`[gfx] ${why} — stepping down to "${tier}"`);
    bad = 0; samples = [];
    return true;
  }

  function judge(now) {
    if (now - startedAt < WARMUP_MS) { samples = []; windowFrom = now; return; }
    if (now - windowFrom < JUDGE_MS) return;
    const n = samples.length;
    windowFrom = now;
    if (n < 20) { samples = []; return; }   // too few frames to say anything
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(n / 2)];
    samples = [];
    if (p50 > SLOW_MS) {
      bad += 1;
      if (bad >= PATIENCE) stepDown(`p50 ${p50.toFixed(0)}ms over ${PATIENCE} windows`);
    } else {
      bad = 0;
    }
  }

  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const d = now - last; last = now;
    // A gap longer than a second is the tab having been hidden or the machine
    // having been asleep. It is not a slow frame and must not be judged as one.
    if (d > 0 && d < 1000) samples.push(d);
    judge(now);
  }

  return {
    // The remembered tier is a STARTING GUESS, not a verdict: a machine that
    // needed "low" last week is started there rather than made to earn its way
    // down again through four bad seconds, but it is still watched from there.
    start() {
      if (running) return;
      const saved = read();
      if (saved && TIERS.includes(saved)) at = TIERS.indexOf(saved);
      apply();
      running = true;
      startedAt = last = (typeof performance !== 'undefined' ? performance.now() : 0);
      windowFrom = startedAt;
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    // A PERSON'S CHOICE OUTRANKS THE MEASUREMENT, in both directions: someone
    // on a fast machine who wants it light, and someone on a slow one who would
    // rather have the room and put up with it. null hands it back to the meter.
    set(tier) {
      manual = TIERS.includes(tier) ? tier : null;
      if (manual) { at = TIERS.indexOf(manual); write(manual); }
      return apply();
    },
    tier() { return manual || TIERS[at]; },
    auto() { return !manual; },
    onChange(fn) { onChange = fn; },
    // For the test, and for anyone wanting to know why it did what it did.
    state() { return { tier: this.tier(), auto: !manual, bad, watching: running }; },
    // The judgement, exposed so it can be held to actual numbers rather than
    // to a person waving a hand in front of a camera for four seconds.
    _feed(frames, now) { samples = frames.slice(); windowFrom = now - JUDGE_MS - 1; startedAt = 0; judge(now); },
  };
}
