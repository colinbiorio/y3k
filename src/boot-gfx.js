// ============================================================================
// boot-gfx.js — THE TIER, BEFORE THE FIRST PAINT.
//
// gfx.js decides the graphics tier, but it runs inside main.js, a module that
// waits for three.js and sixty-odd other files before its first line executes.
// Until then <html> carried no data-gfx at all, so the first frames painted —
// and blurred, behind the curtain — at the most expensive setting the
// stylesheet has, and a machine that had learned it needs "smooth" paid for
// "high" all through boot. This file is the same decision made from the same
// storage, early: a classic script in <head>, so it runs before the body is
// parsed.
//
// EXTERNAL, NOT INLINE, on purpose: the page's content policy allows inline
// scripts only by hash, and test/security.test.mjs holds the page to exactly
// one (the importmap). It costs one no-cache revalidation.
//
// It must agree with gfx.js's start() — test/gfx.test.mjs runs both over the
// same storage and compares — and it is only ever a first guess: gfx.js
// re-applies the real profile the moment main.js runs.
// ============================================================================
(function () {
  var root = document.documentElement;
  var TIERS = ['high', 'mid', 'low', 'smooth'];
  // Per tier: the glass it keeps and the motion it allows (gfx.js PROFILES).
  var GLASS = { high: 'all', mid: 'small', low: 'none', smooth: 'none' };
  var MOTION = { high: 'full', mid: 'full', low: 'full', smooth: 'less' };
  var START = 'mid';
  var STALE_MS = 7 * 24 * 3600 * 1000;
  var get = function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  try {
    var tier = null;
    var m = /[?&]gfx=(high|mid|low|smooth)\b/.exec(location.search || '');
    if (m) tier = m[1];
    if (!tier) {
      var mode = get('y3k.gfx.mode');
      if (TIERS.indexOf(mode) >= 0) tier = mode;
    }
    if (!tier) {
      var saved = get('y3k.gfx');
      var i = TIERS.indexOf(saved);
      if (i < 0) i = TIERS.indexOf(START);
      else {
        var learned = Number(get('y3k.gfx.at'));
        if (learned && Date.now() - learned > STALE_MS && i > TIERS.indexOf(START)) i -= 1;
      }
      tier = TIERS[i];
    }
    var glass = GLASS[tier], motion = MOTION[tier];
    var fine = null;
    try { fine = JSON.parse(get('y3k.gfx.fine') || 'null'); } catch (e) { fine = null; }
    if (fine && typeof fine === 'object') {
      if (fine.blur === 'all' || fine.blur === 'small' || fine.blur === 'none') glass = fine.blur;
      if (fine.motion === 'full' || fine.motion === 'less') motion = fine.motion;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) motion = 'less';
    root.setAttribute('data-gfx', tier);
    root.setAttribute('data-glass', glass);
    root.setAttribute('data-motion', motion);
  } catch (e) {
    // Nothing here may stop the page: without it, gfx.js sets the same three
    // attributes a moment later, under the curtain.
  }
})();
