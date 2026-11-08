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
//
// SHEETS (the same evening). Opening Settings by its glyph left focus on the
// glyph, behind the sheet's veil; Tab went to seventeen controls behind it in
// thirty stops; Escape did nothing. While a sheet (.modal) is open, all that
// lies behind it is inert too (not the sheets, a question asked over one, the
// toast); focus goes into it unless it put focus there itself; Escape closes
// it by its own close button (so its own close runs); and when it closes,
// focus goes back to what opened it. One owner decides inert for all of it,
// so the two rules never undo each other.
// ============================================================================

export const BY_POINTER = ['chat', 'portal', 'nav-life', 'home-brand', 'cam-popup'];
export const HUD_HIDDEN_BY = ['gated', 'in-home'];   // styles.css: body.gated #hud-top, body.in-home #hud-top
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';
// never made inert for an open sheet: the sheets themselves, a question asked over one (consent.js), the toast
const keepsOver = (c) => !!(c.classList?.contains('modal') || c.classList?.contains('consent-scrim') || c.id === 'toast'
  || /^(script|style|link|template)$/i.test(c.tagName || ''));
const inertUp = (e) => { for (let x = e; x; x = x.parentNode) if (x.inert) return true; return false; };

export function wireInert({ doc = globalThis.document, win = globalThis.window } = {}) {
  if (!doc?.body || !win?.getComputedStyle) return null;
  const chrome = BY_POINTER.map((id) => doc.getElementById(id)).filter(Boolean);
  const hud = doc.getElementById('hud-top');
  const sheets = doc.querySelectorAll ? [...doc.querySelectorAll('.modal')] : [];
  const set = (el, off) => { if (el && el.inert !== off) el.inert = off; };
  // open is what is on screen: four sheets open by `hidden`, three (go live, compose, profile) by an .open class
  const shown = (m) => !m.hidden && win.getComputedStyle(m).display !== 'none';
  const hidden = (el) => (el === hud ? HUD_HIDDEN_BY.some((c) => doc.body.classList.contains(c)) : win.getComputedStyle(el).pointerEvents === 'none');
  let open = null, opener = null;
  const sync = () => {
    const sheet = sheets.find(shown) || null;
    // what opened it: what had focus, read before anything behind it goes inert (and so loses focus)
    if (sheet && sheet !== open) { const a = doc.activeElement; opener = a && a !== doc.body && !sheet.contains(a) ? a : null; }
    for (const c of doc.body.children ? [...doc.body.children] : []) if (!keepsOver(c) && !chrome.includes(c) && c !== hud) set(c, !!sheet);
    for (const el of chrome) set(el, !!sheet || hidden(el));
    if (hud) set(hud, !!sheet || hidden(hud));
    if (sheet === open) return;
    if (sheet && !sheet.contains(doc.activeElement)) sheet.querySelector(FOCUSABLE)?.focus?.();
    if (!sheet && opener?.isConnected && !inertUp(opener)) opener.focus?.();
    if (!sheet) opener = null;
    open = sheet;
  };
  // every state that hides or shows them is a class on the body (gated, in-home, panel-open, viewing, cam-on, in-…),
  // and every sheet opens and closes by its `hidden` or its class
  if (win.MutationObserver) {
    new win.MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    for (const m of sheets) new win.MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  // Escape closes the open sheet by its own close button; a key already answered (a select's list, a question
  // asked over the sheet: each stops it there) is left alone
  doc.addEventListener?.('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const sheet = sheets.find(shown);
    const x = sheet && (sheet.querySelector('.sheet-head .x') || [...sheet.querySelectorAll('button')].find((b) => b.getAttribute?.('aria-label') === 'Close'));
    if (x) { e.preventDefault?.(); x.click(); }
  });
  sync();
  return sync;
}
