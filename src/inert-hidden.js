// ============================================================================
// inert-hidden.js — THE KEYS GO ONLY WHERE THE EYES CAN.
//
// The page hides its chrome by `opacity: 0; pointer-events: none` (the chat
// bar under an open panel, the name and the portal behind the entrance card,
// the camera until it is on), which a mouse obeys and the Tab key does not.
// A guest scout's desktop pass (8 Nov 2026) tabbed through the live site:
// twelve controls nobody could see took focus behind the entrance card (the
// chat bar's input among them: typing went into a box that was not there),
// the same twelve under the feed, two at home. And the header's back button
// opts back into pointer events on purpose (#hud-top is pointer-events: none
// so it never blocks the orb), so while the header was hidden the invisible
// "‹ home" still took taps: on a phone at home, over the 4irden portal's edge.
//
// A hidden container is made `inert`: out of the tab order, out of reach of a
// screen reader and of every pointer, and drawn exactly as before (the fades
// are untouched: inert changes nothing on screen). Five containers turn their
// own pointer events off when they hide, and that is the sign read here (it
// is not transitioned, so it is final the moment the class changes). The
// header's pointer events are always off, so it follows its two hiding rules
// in styles.css instead: body.gated and body.in-home.
// ============================================================================

export const BY_POINTER = ['chat', 'portal', 'nav-life', 'home-brand', 'cam-popup'];
export const HUD_HIDDEN_BY = ['gated', 'in-home'];   // styles.css: body.gated #hud-top, body.in-home #hud-top

export function wireInert({ doc = globalThis.document, win = globalThis.window } = {}) {
  if (!doc?.body || !win?.getComputedStyle) return null;
  const els = BY_POINTER.map((id) => doc.getElementById(id)).filter(Boolean);
  const hud = doc.getElementById('hud-top');
  const set = (el, off) => { if (el && el.inert !== off) el.inert = off; };
  const sync = () => {
    for (const el of els) set(el, win.getComputedStyle(el).pointerEvents === 'none');
    set(hud, HUD_HIDDEN_BY.some((c) => doc.body.classList.contains(c)));
  };
  // every state that hides or shows them is a class on the body (gated, in-home, panel-open, viewing, cam-on, in-…)
  if (win.MutationObserver) new win.MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  sync();
  return sync;
}
