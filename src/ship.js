// ship.js — THE FOUNDER'S PAGE FOLLOWS THE DEPLOY.
//
// Colin, 2026-10-24: "give yourself the ability to push changes to the website
// and reload lmao -- frictionless is the goal -- obviously only give that
// ability to me tho lmao".
//
// Every push to main is a deploy (render.yaml): for a minute or three the site
// answers 502, then it is back on the new commit, which /api/health says. This
// asks now and then which commit is live, and when it is no longer the one
// this page was loaded on, the page reloads itself, so the newest version is
// on the founder's screen, laptop or phone, with no hand on the browser.
// FOUNDER ONLY: main.js starts this for the founder's account and nobody
// else's. Everyone else keeps the page they have: a deploy never pulls a
// conversation out from under them. Nothing here can be reached from outside;
// there is no endpoint, only a page reading a public number. No answer, a 502
// or a server that cannot say its commit is never a change: the deploy is in
// flight, and the first commit heard is the version this page is.
export const EVERY_MS = 20_000;
export const DELAY_MS = 1500;   // the note is readable before the page goes

/** What health's answer means against the commit this page knows. Pure, so it is tested. */
export function decide(known, health) {
  const commit = health && health.ok && typeof health.commit === 'string' && health.commit ? health.commit : null;
  if (!commit) return { known, reload: false };          // down, deploying, or a server that cannot say
  if (!known) return { known: commit, reload: false };   // the first answer is the version this page is
  return { known, reload: commit !== known };
}

export function createVersionWatch({ fetchFn = (...a) => fetch(...a), reload = () => location.reload(), every = EVERY_MS,
  delay = DELAY_MS, note = () => {}, doc = typeof document === 'undefined' ? null : document } = {}) {
  let known = null;
  let timer = null;
  let stopped = false;
  const onVis = () => { if (doc.visibilityState === 'visible') tick(); };
  const stop = () => { stopped = true; clearInterval(timer); timer = null; doc?.removeEventListener?.('visibilitychange', onVis); };
  async function tick() {
    if (stopped || (doc && doc.visibilityState === 'hidden')) return false;   // a hidden tab asks nothing; it asks when it is seen again
    let d = null;
    try { d = await fetchFn('/api/health', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch { d = null; }
    const what = decide(known, d);
    known = what.known;
    if (what.reload) { note(known); stop(); setTimeout(reload, delay); }
    return what.reload;
  }
  const start = () => { if (timer || stopped) return; tick(); timer = setInterval(tick, every); doc?.addEventListener?.('visibilitychange', onVis); };
  return { start, stop, tick, get known() { return known; }, get running() { return !!timer; } };
}

/** A small line at the foot of the page, for the moment before it reloads. */
export function newVersionNote(doc = document) {
  let el = doc.getElementById('ship-note');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'ship-note';
    Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '6px 12px',
      font: '13px/1.4 system-ui, sans-serif', color: '#e8e8ee', background: 'rgba(12,12,18,0.82)', borderRadius: '999px', zIndex: 9999, pointerEvents: 'none' });
    doc.body.appendChild(el);
  }
  el.textContent = 'a new version is live — reloading';
  return el;
}
