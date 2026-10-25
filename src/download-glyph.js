// ============================================================================
// download-glyph.js — THE APP, RIGHT OF THE HOUSE'S NAME.
//
// Colin, 2026-10-24: "can you add a 'y3k' logo -- the same one used for the
// browser tab, as a download app glyph titled 'download' directly right of the
// yearthreethousand logo, but smaller and also individually spinnable". The
// tab's own icon.png (index.html #home-download), poured in the name's metal
// and spun on its own (mercury-mount.js), as the model's mark under the name
// is. A press opens the desktop app's download in a new tab; a drag only turns
// it. Nothing new is asked of the site: where the app is comes from the setup
// the y3kode screen already reads (/api/code/setup, own-brain.js siteSetup),
// and which computer this is from code/platform.js, as that screen does.
// ============================================================================

import { pickBuild } from './code/platform.js';

// Where the app always is: the newest release (y3k 1.0.0 on 2026-10-24).
export const RELEASES = 'https://github.com/colinbiorio/y3k/releases/latest';

// Only an https address is opened, as Settings' "Download y3k" does.
const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

// WHERE A PRESS GOES: the build for this computer, if the site lists one; else
// the page the site says the app is on; else the newest release.
//   setup     what the site said ({ appUrl, builds, … }), or null
//   platform  this computer ({ os, arch }, code/platform.js), or null
export function downloadTarget(setup, platform) {
  return https(pickBuild(setup?.builds, platform)?.url) || https(setup?.appUrl) || RELEASES;
}

// A press that travelled this far (in px, every move added, as the spin counts
// it in mercury-buttons.js) was a turn, not a press.
export const TURNED = 5;

// THE PRESS. The site and this computer are asked once a press looks likely
// (the pointer arriving, focus, the press itself), so the tab opens within
// the press that asked for it: a browser opens a tab only in answer to a
// person's own press, and only for a few seconds after it. A press that comes
// first waits at most `wait` ms for them, then goes where it can.
//   el        the glyph (#home-download)
//   setup     () => the site's setup, or null   (own-brain.js siteSetup)
//   platform  () => this computer                (code/platform.js detectPlatform)
//   open      (url) => opens it in a new tab, with no way back to this page
export function wireDownloadGlyph({ el, setup = async () => null, platform = async () => null,
  open = (url) => globalThis.window?.open(url, '_blank', 'noopener,noreferrer'), wait = 1500,
  win = globalThis.window } = {}) {
  if (!el) return null;
  let known = null;      // { setup, platform } once the site has answered
  let asking = null;
  const ask = () => {
    if (known) return Promise.resolve(known);
    if (!asking) {
      asking = Promise.all([
        Promise.resolve().then(setup).catch(() => null),
        Promise.resolve().then(platform).catch(() => null),
      ]).then(([s, p]) => {
        asking = null;
        const got = { setup: s || null, platform: p || null };
        if (s) known = got;   // a site that did not answer is asked again next time
        return got;
      });
    }
    return asking;
  };
  // A DRAG TURNS IT. The spin captures the pointer (mercury-buttons.js), so a
  // drag ends with a click on this button wherever it is let go: the travel
  // since the press says which it was. A click from the keyboard has no press.
  let travel = 0, last = null;
  const onMove = (e) => {
    if (!last) return;
    travel += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { last = null; };
  el.addEventListener('pointerdown', (e) => {
    // THE NAME IS NOT TURNED BY IT. The glyph lives inside the name (so it
    // rides every rule that moves or hides it), and the name spins on its own
    // pointerdown: this press stops here, so each turns on its own.
    e.stopPropagation();
    travel = 0;
    last = { x: e.clientX, y: e.clientY };
    ask();
  });
  // …nor pressed from the keyboard: the name answers Enter and Space with a
  // squeeze of its own metal (mercury-buttons.js onKey), so those stop here
  // too. The button's own click on them is a default, which this leaves be.
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  el.addEventListener('pointerenter', () => { ask(); });
  el.addEventListener('focus', () => { ask(); });
  win?.addEventListener?.('pointermove', onMove, { passive: true });
  win?.addEventListener?.('pointerup', onUp);
  win?.addEventListener?.('pointercancel', onUp);
  const go = async () => {
    const got = known || await Promise.race([ask(), new Promise((r) => setTimeout(() => r(null), wait))]);
    const url = downloadTarget(got?.setup, got?.platform);
    open(url);
    return url;
  };
  el.addEventListener('click', (e) => {
    const turned = (e?.detail ?? 1) > 0 && travel >= TURNED;
    travel = 0;
    if (!turned) go();
  });
  return { go, ask };
}
