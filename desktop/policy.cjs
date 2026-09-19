// ============================================================================
// policy.cjs — THE DECISIONS THE SHELL MAKES ABOUT WHAT IT WILL ALLOW.
//
// Four of them, and every one fails quietly in the wrong direction. A
// permission handler that says yes too often hands the camera to a page that is
// not ours. A navigation guard that says "ours" too often leaves the window
// sitting somewhere else with no address bar to tell you so. A media request
// mapped too generously lights a prompt nobody asked for. And a failed load
// judged too harshly throws away a page that was working. That is exactly the
// sort of thing a person reads once, agrees with, and never tests.
//
// So they live here instead of inline in main.cjs: plain functions over
// strings, no electron, no window — which means the test suite at the repo root
// can run them under node and try the cases a person would not think to try by
// hand (the look-alike host, the credential in the userinfo field, the
// javascript: url). main.cjs does nothing but hand them the real arguments.
// ============================================================================

// WHAT THE APP MAY BE ASKED FOR. Everything not named here is refused, because
// the list of things a browser can request grows with every Chromium bump and a
// denylist would quietly admit each new one.
//
//   media       the camera and the microphone — the face and the hands
//   fullscreen  the room, filling the screen
//   pointerLock the world screen, when you are looking around it
//   clipboard-sanitized-write   copy, from a button in the page
const ALLOWED = new Set(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write']);

// IS THIS OUR ORIGIN? Compared as a parsed origin and never as a prefix or a
// substring: `https://yearthreethousand.com.evil.test` contains our host, and
// `https://yearthreethousand.com@evil.test` reads as our host to a human eye —
// both are somebody else, and both are one careless `startsWith` away from
// being handed the camera.
function sameOrigin(url, home) {
  try { return new URL(url).origin === new URL(home).origin; } catch { return false; }
}

// May this page be granted this permission? Both halves, always: the right
// permission on the wrong page is the whole failure mode.
function mayUse(permission, url, home) {
  return ALLOWED.has(permission) && sameOrigin(url, home);
}

// Where a click should go. The window stays on the room; everything else is
// handed to the real browser, where a person has tabs, history, and an address
// bar they can read — the three things this window deliberately does not have.
// Only http(s) is passed on: `javascript:`, `file:` and custom schemes handed
// to the OS are how a link in a page turns into something running outside it.
function routeFor(url, home) {
  if (sameOrigin(url, home)) return 'stay';
  return /^https?:\/\//i.test(url) ? 'browser' : 'drop';
}

// WHICH SYSTEM PROMPTS A MEDIA REQUEST NEEDS. macOS gates the camera and the
// microphone a second time, at the system level, underneath the page's own
// permission — and Chromium inside Electron does not reliably raise that prompt
// on its own. When it does not, getUserMedia fails with NotAllowedError and the
// tracking silently does nothing, which is the one failure this app cannot
// afford: the face and the hands ARE the reason it exists.
//
// So the shell asks macOS itself, at the moment the page asks. Only for what
// was actually asked for: Chromium says which kinds in the request, and a page
// reaching for the camera must not raise a microphone prompt beside it. An
// empty or missing list means video — the site opens the camera far more often
// than the microphone, and a wrong guess here costs a prompt, not a capability.
function mediaFor(details) {
  const kinds = Array.isArray(details && details.mediaTypes) ? details.mediaTypes : [];
  const out = new Set();
  for (const k of kinds) {
    if (k === 'audio') out.add('microphone');
    else if (k === 'video') out.add('camera');
  }
  return out.size ? [...out] : ['camera'];
}

// Is a failed load worth replacing the page over? -3 is ABORTED, which is what
// a redirect, a second navigation, or the user pressing reload mid-load looks
// like from here. Treating that as a failure means an ordinary redirect can
// flash the offline page over a site that is working perfectly.
function isRealFailure(code, isMainFrame) {
  return isMainFrame === true && code !== -3;
}

module.exports = { ALLOWED, sameOrigin, mayUse, routeFor, mediaFor, isRealFailure };
