// HOW THE HANDS WORK, and whose choice that is.
//
// Two things people disagree about, permanently, and neither answer is wrong:
// which gesture orbits and which one moves you, and which way "down" means.
// So they are settings (gear → Controls), kept in this browser beside the
// other preferences, and every surface that reads a gesture reads them here.
//
//   swap  false (default) — one finger / left drag ORBITS,
//                           two fingers / trackpad scroll PANS
//         true            — the other way round
//   invert false (default) — two fingers down carries you FORWARD, the way a
//                            trackpad scrolls a page away from you
//          true            — the ground sticks to your fingers instead
const KEY = 'y3k.controls';
const DEFAULTS = { swap: false, invert: false };

let cache = null;
function read() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
}
export function getControls() {
  if (!cache) cache = read();
  return cache;
}
export function setControl(k, v) {
  const next = { ...getControls(), [k]: !!v };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: this session only */ }
  // a world already open picks the change up on its next gesture
  try { window.dispatchEvent(new CustomEvent('y3k:controls', { detail: next })); } catch { /* older engines */ }
  return next;
}
// The cache exists because a pan asks this question sixty times a second, so
// every path that can change the preference has to be able to drop it: the
// switch in Settings, another tab, or anything that writes the key directly
// and announces it. (Without the last one, a change made outside setControl
// simply never arrived — measured.)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) cache = null; });
  window.addEventListener('y3k:controls', (e) => { cache = e?.detail || null; });
}
