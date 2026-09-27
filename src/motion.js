// THE FEEL ENGINE. Motion (motion.dev, MIT) — vendored at src/vendor/, one
// pinned version, one file, no CDN at runtime. It exists to make the
// interface PHYSICAL: springs that can be interrupted mid-flight, momentum
// that carries a flick, surfaces that arrive instead of appearing. It is for
// connective tissue only — the mercury glyphs and the orb have their own
// physics and are not to be re-animated with this.
//
// Honest fallback: if the vendor file ever failed to load, everything here
// degrades to "arrive instantly". The app must never depend on an animation
// finishing to be correct.

const M = (typeof window !== 'undefined' && window.Motion) || null;

// People who ask their OS for less motion get less motion — and so does anyone
// in Smooth, or who chose "less" under Settings → Graphics: gfx.js writes
// <html data-motion="less"> for all three (boot-gfx.js does it before the first
// paint), so the stylesheet and every caller of this read ONE switch. The OS
// query is still asked directly, so this stays right on a page where gfx never
// ran. Decorative springs check this at the call site; direct-manipulation
// feedback may stay.
export const reducedMotion = () =>
  (typeof document !== 'undefined' && document.documentElement?.dataset?.motion === 'less')
  || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

const done = Promise.resolve();
const settled = { finished: done, stop() { /* nothing running */ }, cancel() { /* likewise */ } };

// Motion's animate, or an instant settle without it: scalar tweens report
// their end value once; element tweens leave the element as CSS drew it.
export function animate(target, to, opts) {
  if (M) return M.animate(target, to, opts);
  if (typeof target === 'number' && opts && typeof opts.onUpdate === 'function') opts.onUpdate(to);
  return settled;
}
