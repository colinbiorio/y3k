// ============================================================================
// back.js — BACK STAYS ON THE SITE.
//
// No view added a history entry, so on a phone the back gesture (or Back) with
// the feed, a profile, the world or a game open left the site altogether: the
// visitor was dropped on whatever page came before (a guest scout, 5 Nov 2026).
// Now opening a view from the orb pushes ONE entry; Back pops it and comes home
// to the orb, as the site's own way home would. Coming home by the site's own
// controls takes the entry back quietly, so the next Back is not a dead press.
// One entry, never a stack: views change within it (feed to profile to world),
// and Back from any of them is home. Pure but for the window it is handed, so
// it is tested without a browser (test/back.test.mjs).
// ============================================================================
export function createBack({ win = typeof window === 'undefined' ? null : window, onBack = () => {} } = {}) {
  let pushed = false;   // our one entry is on the history
  let quiet = 0;        // popstates we caused ourselves (history.back on coming home), to let pass
  const onPop = () => {
    if (quiet > 0) { quiet -= 1; return; }
    if (!pushed) return;   // a Back from home (or past our entry): the browser's own
    pushed = false;
    onBack();
  };
  win?.addEventListener?.('popstate', onPop);
  return {
    // a view other than the orb is showing
    away() {
      if (pushed || !win?.history?.pushState) return;
      try { win.history.pushState({ y3k: 'view' }, ''); pushed = true; } catch { /* a sandboxed frame: Back stays the browser's */ }
    },
    // home again by the site's own controls: our entry goes, quietly
    home() {
      if (!pushed) return;
      pushed = false;
      quiet += 1;
      try { win.history.back(); } catch { quiet -= 1; }
    },
    pushed: () => pushed,
    dispose: () => win?.removeEventListener?.('popstate', onPop),
  };
}
