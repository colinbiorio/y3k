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
//
// WHAT IT HANDS OUT. One plain object — the PROFILE — to every sink whenever it
// changes: the orb (body.setQuality, body.setBloom), the liquid glyphs
// (mercury.setQuality), the pacer (pace.setFps), the stylesheet (<html
// data-gfx data-glass data-motion>) and anyone listening for 'y3k:gfx'.
// Modules that are not sinks read window.Y3K.gfx.profile() when they start
// work. One object, so nothing can be half-switched: a tier that turned the
// bloom off but left the liquid flowing would be exactly the "turns down ONE
// thing" tier the table above says measures as nothing.
// ============================================================================

import { due, setFps, takeDrawn } from './pace.js';

// The tiers, worst last. Each names what it takes away.
//
//   high    everything. The room as designed, at the display's own rate.
//   mid     the VIEWPORT-SCALE blurs go — the nav frame, the panel behind it,
//           the chat stadium, the scrims behind sheets. The frost stays
//           everywhere it is small and everywhere the standing rule puts it:
//           fields, cards, sheets. To the eye this is close; to the compositor
//           it is most of the work.
//   low     no backdrop-filter at all, no bloom, and the liquid holds still
//           until it is touched. This is the one that looks different, and it
//           is the one that makes the app usable at all on a machine that
//           cannot hold fifteen frames a second.
//   smooth  THE FLOOR, and the mode Colin asked for by name: "a mode that no
//           matter what, just looks really smooth". Everything low drops, plus
//           the decorative motion, the shader's fine detail and the live
//           portal; the panes turn solid instead of see-through-without-blur.
//           And it is the one tier that keeps going when it is still not
//           smooth: an even thirty before an uneven sixty, then fewer pixels.
//
// 'smooth' is APPENDED, not inserted: the governor walks this list top to
// bottom, so the floor has to be last, and the default ('mid') must still be
// able to step down through 'low' to reach it.
export const TIERS = ['high', 'mid', 'low', 'smooth'];

// WHAT EACH TIER MEANS, as the profile it hands out. The field list is the
// shared contract every sink codes against:
//   bloom   orb glow post-process
//   blur    CSS glass: 'all' | 'small' (viewport-scale panes off) | 'none'
//   fps     ceiling handed to the pacer: 0 = the display's own rate
//   scale   render-resolution multiplier on top of the device-pixel cap
//   maxDpr  device-pixel-ratio cap for the WebGL canvases
//   liquid  'flow' | 'still' — still = drawn once, moves only while touched
//   detail  'full' | 'lite' — shader octaves, the trail, particle extras
//   motion  'full' | 'less' — decorative motion (also 'less' whenever the OS
//           asks for reduced motion, whatever the tier)
export const PROFILES = {
  high:   { bloom: true,  blur: 'all',   fps: 0,  scale: 1, maxDpr: 2,   liquid: 'flow',  detail: 'full', motion: 'full' },
  mid:    { bloom: true,  blur: 'small', fps: 60, scale: 1, maxDpr: 2,   liquid: 'flow',  detail: 'full', motion: 'full' },
  low:    { bloom: false, blur: 'none',  fps: 60, scale: 1, maxDpr: 1.5, liquid: 'still', detail: 'full', motion: 'full' },
  smooth: { bloom: false, blur: 'none',  fps: 60, scale: 1, maxDpr: 1.5, liquid: 'still', detail: 'lite', motion: 'less' },
};

// The values a fine-tune override may take, field by field. Anything else in
// storage (an older build's key, a hand-edited value) is ignored rather than
// handed to a sink that would have to guess what it means.
export const FINE = {
  bloom: [true, false],
  blur: ['all', 'small', 'none'],
  fps: [0, 60, 30],
  scale: [1, 0.75, 0.5],
  liquid: ['flow', 'still'],
  detail: ['full', 'lite'],
  motion: ['full', 'less'],
};

// A frame slower than this is a frame you can see. NOT 33ms: a 30fps floor
// sounds reasonable and is the wrong number, because frame times quantise to
// vsync multiples — measured, "high" sits at 33.3ms and "mid" at 31.9ms, which
// are both simply TWO FRAMES, and a 33ms threshold would step down once, land
// on the other side of the same coin, and stop. 22ms sits between one frame and
// two, so the meter keeps going until the median is a single frame. Under a
// frame cap a drawn frame's slot is longer than one vsync, and the same margin
// rides on top of the slot instead (38.6ms for an even thirty at 60Hz).
const SLOW_MS = 22;
const VSYNC_60 = 1000 / 60;
// THE HITCH. The median alone is blind to the glitch Colin described: the
// founder's machine held a fine median with an 80-100ms stall every few frames
// (mercury-buttons.js records it), and even the best measured configuration
// above still missed 32% of its frames. So a window is also bad when more than
// one drawn frame in ten runs past one and a half slots, when the 95th
// percentile passes 50ms, or when anything froze for a quarter of a second.
const LATE_SLOTS = 1.5;
const LATE_SHARE = 0.10;
const P95_MS = 50;
// A median of three slots or worse is not a machine that needs a lighter
// room, it is one that needs the floor: step two tiers at once rather than
// making it sit through another eight bad seconds on the way down.
const SEVERE_SLOTS = 2.5;
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
// After a hold lifts (back from the world, back from a hidden tab, a screen
// that asked not to be judged while it built) the first frames are that work
// finishing, not the machine. Give them two seconds before the meter looks.
const SETTLE_MS = 2000;
// A lesson this old is re-tested: a machine that needed 'low' a week ago may
// have been a laptop on battery, or may have had forty tabs open.
const STALE_MS = 7 * 24 * 3600 * 1000;

// Smooth's own ladder, used only once the floor itself is not smooth: first an
// even thirty (every other vsync — pace.js), then fewer pixels.
const ADAPT_FPS = [60, 30];
const ADAPT_SCALE = [1, 0.75, 0.5];

const KEY = 'y3k.gfx';            // the LEARNED automatic tier (a plain tier string)
const KEY_AT = 'y3k.gfx.at';      // when it was learned (ms since the epoch)
const KEY_MODE = 'y3k.gfx.mode';  // 'auto', or the tier a person chose
const KEY_FINE = 'y3k.gfx.fine';  // JSON: single-field overrides from Settings

// WHERE A FIRST-TIME VISITOR STARTS, and it is deliberately not the top.
// Measured on an Apple Silicon Mac, which is near the fast end of what anyone
// will bring: "high" holds 27.5 fps with a median frame of two vsyncs and 76%
// of frames missed. If the best-case machine cannot hold sixty at the top tier
// then the top tier is not a default, it is a preference — and nobody's first
// second in the room should be at thirty frames while a governor works out
// that it should not be. "mid" keeps every small frost, including every one
// the standing rule puts on a text field; what it drops is the viewport-scale
// blurs, which is where the cost actually was.
const START = 'mid';

const cleanFine = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(FINE)) if (FINE[k].includes(raw[k])) out[k] = raw[k];
  return out;
};

// IT ONLY EVER STEPS DOWN, within a session. A governor that steps back up when
// things improve oscillates: it drops a tier, the frame rate recovers BECAUSE
// it dropped a tier, it restores, the frame rate falls again — and the room
// pulses between two looks forever. Going down is a decision; going up is the
// next page load, where the remembered tier is the starting guess, and a lesson
// more than a week old starts one tier higher so a machine that has since got
// faster gets judged again from there.
export function createGfx({ body, mercury = null, root = null, storage = null, search = null } = {}) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const query = search != null ? search : (typeof location !== 'undefined' ? location.search : '');
  const hasWin = typeof window !== 'undefined';
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  let manual = null;          // a person's choice, which always wins
  let forced = null;          // ?gfx= in the URL: this page load only, never stored
  let at = TIERS.indexOf(START);   // the AUTOMATIC tier, as an index into TIERS
  let fine = {};              // single-field overrides from Settings
  let adaptFps = 0, adaptScale = 0;   // smooth's ladder: this session only, down only
  let bad = 0;                // consecutive windows judged bad
  let fed = null;             // a window handed in by _feed (tests)
  let windowFrom = 0;
  let startedAt = 0;
  let releasedAt = -Infinity; // when the last hold lifted
  let fresh = true;           // throw away whatever the pacer gathered before now
  let raf = 0, running = false;
  let wasAutoHeld = false;
  let current = null;         // the profile last handed out
  let lastSig = '';
  let last = null;            // the last judged window, for the HUD and Settings
  // The governor's own last step, and only that: { kind: 'tier' | 'fps' |
  // 'scale', from, to, why, at }. A person's choice, a ?gfx= force and the
  // remembered tier at boot are not steps and record none. Nor does a later
  // choice clear it: it says what happened at `at`, which stays true.
  let lastStep = null;
  // The judge is in the warm-up or a release's settle, so nothing it sees now
  // counts. In state() so the notice keeps to the same quiet.
  let settling = true;
  const holds = new Map();
  let holdSeq = 0;
  const listeners = new Set();

  const read = (k) => { try { return store ? store.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { store && store.setItem(k, v); } catch { /* private window */ } };
  const drop = (k) => { try { store && store.removeItem && store.removeItem(k); } catch { /* private window */ } };

  const osReduced = () => {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };
  const tierNow = () => forced || manual || TIERS[at];

  function compute() {
    const tier = tierNow();
    const p = { tier, manual: Boolean(forced || manual), ...PROFILES[tier] };
    if (tier === 'smooth') { p.fps = ADAPT_FPS[adaptFps]; p.scale = ADAPT_SCALE[adaptScale]; }
    Object.assign(p, fine);
    if (osReduced()) p.motion = 'less';
    return p;
  }

  // `step` is the governor's step that caused this change, handed to the
  // listeners BESIDE the profile, never in it: the profile is the sinks'
  // contract, and a step is not something a sink draws.
  function apply(force = false, step = null) {
    const p = compute();
    const sig = JSON.stringify(p);
    if (!force && sig === lastSig) return current;
    lastSig = sig;
    current = p;
    if (el) {
      el.dataset.gfx = p.tier;
      el.dataset.glass = p.blur;
      el.dataset.motion = p.motion;
    }
    setFps(p.fps);
    // The bloom is not CSS, so it is switched here rather than in the
    // stylesheet. setBloom stays beside setQuality for anything that only
    // knows the older call.
    body?.setBloom?.(p.bloom);
    body?.setQuality?.({ ...p });
    mercury?.setQuality?.({ ...p });
    for (const fn of listeners) { try { fn({ ...p }, step ? { ...step } : null); } catch (e) { console.warn('[gfx] listener', e); } }
    if (hasWin && typeof CustomEvent === 'function') {
      try { window.dispatchEvent(new CustomEvent('y3k:gfx', { detail: { ...p } })); } catch { /* no window events here */ }
    }
    return p;
  }

  function stepDown(steps, why) {
    if (forced || manual || at >= TIERS.length - 1) return false;
    const from = TIERS[at];
    at = Math.min(TIERS.length - 1, at + steps);
    write(KEY, TIERS[at]);
    write(KEY_AT, String(Date.now()));
    lastStep = { kind: 'tier', from, to: TIERS[at], why, at: Date.now() };
    const p = apply(false, lastStep);
    console.log(`[gfx] ${why} — stepping down to "${p.tier}"`);
    return true;
  }

  // The floor's own ladder. Only what nobody has pinned by hand moves: a
  // person who set thirty frames in Settings has already answered that one.
  function adaptDown(why) {
    if (fine.fps === undefined && adaptFps < ADAPT_FPS.length - 1) {
      adaptFps += 1;
      lastStep = { kind: 'fps', from: ADAPT_FPS[adaptFps - 1], to: ADAPT_FPS[adaptFps], why, at: Date.now() };
    } else if (fine.scale === undefined && adaptScale < ADAPT_SCALE.length - 1) {
      adaptScale += 1;
      lastStep = { kind: 'scale', from: ADAPT_SCALE[adaptScale - 1], to: ADAPT_SCALE[adaptScale], why, at: Date.now() };
    } else return false;
    const p = apply(false, lastStep);
    console.log(`[gfx] ${why} — smooth holds ${p.fps || 'the display\'s'} fps at ${p.scale}x resolution`);
    return true;
  }

  // What one window of drawn frames says. `slotMs` is how long a drawn frame
  // is SUPPOSED to take (the pacer's divisor times the display's vsync), so an
  // even thirty is not mistaken for a machine missing every other frame.
  function verdict({ intervals, stalls = 0, slotMs = VSYNC_60 }) {
    const n = intervals.length;
    const s = intervals.slice().sort((a, b) => a - b);
    const p50 = s[Math.floor(n / 2)];
    const p95 = s[Math.min(n - 1, Math.floor(n * 0.95))];
    const max = s[n - 1];
    const slot = slotMs > 0 ? slotMs : VSYNC_60;
    const lateAt = slot * LATE_SLOTS;
    let late = 0;
    for (let i = n - 1; i >= 0 && s[i] > lateAt; i--) late += 1;
    const slow = Math.max(SLOW_MS, slot + (SLOW_MS - VSYNC_60));
    const why = p50 > slow ? `p50 ${p50.toFixed(0)}ms`
      : late / n > LATE_SHARE ? `${Math.round((100 * late) / n)}% of frames late`
      : p95 > P95_MS ? `p95 ${p95.toFixed(0)}ms`
      : stalls > 0 ? `${stalls} stall${stalls === 1 ? '' : 's'}`
      : '';
    return { n, p50, p95, max, late: late / n, stalls, slotMs: slot, bad: Boolean(why), severe: p50 >= slot * SEVERE_SLOTS, why };
  }

  // THE AUTO-HOLDS. In the world the orb is not what is on screen (a second
  // renderer is), and a hidden tab's frames are not frames. Neither is this
  // machine's fault, and neither may teach the meter anything.
  const autoHeld = () => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.hidden || document.body?.classList.contains('in-world'));
  };

  function judge(now) {
    const given = fed; fed = null;
    const auto = autoHeld();
    if (holds.size || auto) {
      // A hold breaks the run: the windows either side of it are not
      // "in a row", so the count of bad ones starts again.
      if (auto) wasAutoHeld = true;
      bad = 0; fresh = true; windowFrom = now; settling = true;
      return;
    }
    if (wasAutoHeld) { wasAutoHeld = false; releasedAt = Math.max(releasedAt, now); }
    if (now - startedAt < WARMUP_MS || now - releasedAt < SETTLE_MS) { fresh = true; windowFrom = now; settling = true; return; }
    settling = false;
    if (fresh && !given) { fresh = false; takeDrawn(); windowFrom = now; return; }
    if (now - windowFrom < JUDGE_MS) return;
    windowFrom = now;
    fresh = false;
    const w = given || takeDrawn();
    if (w.intervals.length < 20) return;   // too few frames to say anything
    const v = verdict(w);
    last = v;
    if (!v.bad) { bad = 0; return; }
    bad += 1;
    if (bad < PATIENCE) return;
    const why = `${v.why} over ${PATIENCE} windows`;
    const moved = stepDown(v.severe ? 2 : 1, why) || (tierNow() === 'smooth' && adaptDown(why));
    if (moved) { bad = 0; fresh = true; } else bad = PATIENCE;   // nothing left to take away
  }

  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    // ASK THE PACER ON EVERY VSYNC, like every render loop does. The first
    // caller per timestamp decides and the rest get the same answer, so asking
    // here changes nothing about which frames draw — it only guarantees the
    // pacer sees every vsync (and keeps the drawn-frame record the judge reads)
    // even while the orb is paused and the liquid is still.
    due(now);
    judge(now);
  }

  function readMode() {
    const m = read(KEY_MODE);
    manual = TIERS.includes(m) ? m : null;
  }
  function readFine() {
    try { fine = cleanFine(JSON.parse(read(KEY_FINE) || 'null')); } catch { fine = {}; }
  }
  // Settings changed in another tab: the same person's choice, so it applies
  // here too. (The LEARNED tier deliberately does not travel: another tab's bad
  // spell is that tab's.)
  function onStorage(e) {
    if (e.key === KEY_MODE) { readMode(); forced = null; apply(); }
    else if (e.key === KEY_FINE) { readFine(); apply(); }
  }
  let wired = false;
  function wire() {
    if (wired || !hasWin) return;
    wired = true;
    window.addEventListener('storage', onStorage);
    try {
      const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
      mq?.addEventListener?.('change', () => apply());
    } catch { /* an older Safari: the preference is read again on the next change */ }
    if (typeof document !== 'undefined') {
      // A hidden tab runs no frames, so the judge never sees the hold end:
      // the return itself is the release.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { releasedAt = clock(); bad = 0; settling = true; } });
    }
  }

  return {
    // The remembered tier is a STARTING GUESS, not a verdict: a machine that
    // needed "low" last week is started there rather than made to earn its way
    // down again through four bad seconds, but it is still watched from there.
    start() {
      if (running) return;
      const m = /[?&]gfx=(high|mid|low|smooth)\b/.exec(query || '');
      forced = m ? m[1] : null;
      readMode();
      readFine();
      const saved = read(KEY);
      if (saved && TIERS.includes(saved)) {
        at = TIERS.indexOf(saved);
        const learned = Number(read(KEY_AT));
        const startIdx = TIERS.indexOf(START);
        if (!learned) write(KEY_AT, String(Date.now()));   // an older build's lesson ages from today
        else if (Date.now() - learned > STALE_MS && at > startIdx) {
          at -= 1;
          write(KEY, TIERS[at]);
          write(KEY_AT, String(Date.now()));
        }
      }
      apply(true);
      wire();
      running = true;
      startedAt = windowFrom = clock();
      fresh = true; settling = true;
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    },
    stop() { running = false; if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); raf = 0; },
    // A PERSON'S CHOICE OUTRANKS THE MEASUREMENT, in both directions: someone
    // on a fast machine who wants it light, and someone on a slow one who would
    // rather have the room and put up with it. null hands it back to the meter,
    // at the tier the meter had learned — not at whatever was last chosen. The
    // choice is kept AS a choice: after a reload it is still held.
    // { fine: null } also clears the fine-tune overrides in the same breath,
    // so the sinks see one change rather than two (a resolution change is a
    // reallocation; doing it twice back to back is a hitch for nothing).
    set(tier, { fine: keepFine } = {}) {
      manual = TIERS.includes(tier) ? tier : null;
      forced = null;
      write(KEY_MODE, manual || 'auto');
      if (keepFine === null) { fine = {}; drop(KEY_FINE); }
      // A click is not the governor: choosing a mode starts its own ladder over
      // (whatever was hogging the machine may be closed now).
      adaptFps = 0; adaptScale = 0;
      bad = 0; fresh = true;
      return apply().tier;
    },
    // Single-field overrides from Settings, merged over whatever the tier
    // says. setFine(null) clears them all; a field given as null clears that
    // one field.
    setFine(patch) {
      if (patch === null) fine = {};
      else {
        const next = { ...fine };
        for (const [k, v] of Object.entries(patch || {})) {
          if (v === undefined || v === null) delete next[k];
          else if (FINE[k] && FINE[k].includes(v)) next[k] = v;
        }
        fine = next;
      }
      if (Object.keys(fine).length) write(KEY_FINE, JSON.stringify(fine)); else drop(KEY_FINE);
      bad = 0; fresh = true;
      return apply();
    },
    fine() { return { ...fine }; },
    profile() { return current ? { ...current } : compute(); },
    tier() { return tierNow(); },
    auto() { return !(forced || manual); },
    mode() { return forced || manual || 'auto'; },
    // PAUSE THE JUDGE (never the pacer) while something that is not the
    // machine's fault is happening — a screen building, a world loading.
    // Returns the release; releasing twice is harmless.
    hold(reason = 'hold') {
      const id = ++holdSeq;
      holds.set(id, reason);
      return () => { if (holds.delete(id) && !holds.size) { releasedAt = clock(); settling = true; } };
    },
    // Every change of profile, with the profile, and beside it the governor's
    // step when one caused the change (null for anything else). Returns the
    // unsubscribe.
    onChange(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
    // For the test, the HUD, and anyone wanting to know why it did what it did.
    state() {
      return {
        tier: tierNow(), auto: !(forced || manual), mode: forced || manual || 'auto', forced: Boolean(forced), bad, watching: running,
        held: [...holds.values(), ...(autoHeld() ? ['in-world or hidden'] : [])], last: last ? { ...last } : null,
        lastStep: lastStep ? { ...lastStep } : null, settling,
      };
    },
    // The judgement, exposed so it can be held to actual numbers rather than
    // to a person waving a hand in front of a camera for four seconds. One call
    // is one complete window of drawn-frame intervals.
    _feed(frames, now, { stalls = 0, slotMs = VSYNC_60 } = {}) {
      fed = { intervals: frames.slice(), stalls, slotMs };
      windowFrom = now - JUDGE_MS - 1; startedAt = 0; fresh = false;
      judge(now);
    },
  };
}

// ============================================================================
// THE ROOM SAYS WHEN IT LIGHTENS ITSELF (2026-10-08). The governor used to step
// down in silence: a console line, and the readout in Settings → Graphics for
// anyone already looking. To someone on an old laptop the glass vanishing, or
// the room going soft, halfway through a conversation looks like a bug. The
// page knows exactly what it did, so it says so, once, in a sentence that is
// still true after the person picks a mode by hand: what happened, past tense.
// ============================================================================

// What Settings → Graphics calls each tier (settings.js GFX_MODES; the test
// holds the two lists together), so the sentence names the button to look for.
export const TIER_NAMES = { high: 'Everything', mid: 'Lighter', low: 'Lightest', smooth: 'Smooth' };

// One step, as a sentence. `when` (a clock time) makes it the Settings note's
// version: "At 14:32, frames were arriving late, so ...". Every bad verdict is
// frames arriving late (a slow median, too many late frames, a long tail, a
// freeze), so the cause is said the same way for all of them.
export function stepLine(step, when = '') {
  if (!step) return '';
  const did = step.kind === 'fps' ? `Smooth dropped to ${step.to} frames a second`
    : step.kind === 'scale' ? `Smooth lowered the resolution to ${Math.round(step.to * 100)}%, which makes the room look softer`
    : `the room switched to ${TIER_NAMES[step.to] || step.to} graphics`;
  const said = `frames were arriving late, so ${did}.`;
  return when ? `At ${when}, ${said}` : said[0].toUpperCase() + said.slice(1);
}

// THE TOAST'S RULES, kept here beside the steps so a test can hold them; main.js
// hands in the toast and what it can see of the page. A step is said:
//   once per kind per page load, so a machine walking mid → low → smooth hears
//     about the first and not each one after it;
//   never while the judge is held or settling (the warm-up, a world loading,
//     the first seconds back): a step cannot happen then, and one that is
//     waiting is not said into the middle of that either;
//   never over another message (`busy`), or to a hidden tab; it waits;
//   and not at all while Settings → Graphics is open, whose note says the same
//     sentence with the time: seen there, it counts as said.
// A step still waiting when the next one comes is replaced by it: one toast,
// about where the room is now, rather than a queue of them.
export function createStepNotice(gfx, { say, graphicsOpen = () => false, busy = () => false, later = (fn) => setTimeout(fn, 1000) } = {}) {
  const told = new Set();
  let waiting = null, queued = false;
  function attempt() {
    const step = waiting;
    if (!step) return;
    if (told.has(step.kind)) { waiting = null; return; }
    if (graphicsOpen()) { told.add(step.kind); waiting = null; return; }
    const st = gfx.state();
    if (st.held.length || st.settling || busy()) {
      // One timer at a time, however many steps arrive while it waits.
      if (!queued) { queued = true; later(() => { queued = false; attempt(); }); }
      return;
    }
    told.add(step.kind); waiting = null;
    // No-break spaces around the arrow: where to go is one name, and a toast
    // that wraps between "Settings →" and "Graphics" reads as two.
    say(`${stepLine(step)} Change this in Settings\u00a0→\u00a0Graphics.`, step);
  }
  const off = gfx.onChange((p, step) => { if (step && !told.has(step.kind)) { waiting = step; attempt(); } });
  return { told: () => [...told], off };
}
