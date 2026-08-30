// THE CONVERSATION, WRAPPED AROUND THE SPHERE. Every line said in the room —
// yours and the presence's — stacks upward from just below the orb's center,
// and the column is SHAPED by the sphere: each line's width is the circle's
// chord at that height, so the newest line runs the full diameter and older
// lines narrow as they climb around the top. The wheel or a drag scrolls back
// through what was said; a new line brings the stack home.
//
// The column is PHYSICAL: lines ride composited transforms (translateY +
// rotateX), never layout properties, so scrolling is pure GPU work; a new
// line glides the whole column up on a spring instead of teleporting it; a
// flick carries momentum and the edges rubber-band. All of it collapses to
// "arrive instantly" under prefers-reduced-motion.
//
// The container never takes the pointer (the orb's drag owns the stage) —
// window-level handlers act only while the gesture is over the column.

import { animate, reducedMotion } from './motion.js';

export function createHistory() {
  const el = document.createElement('div');
  el.id = 'chat-history';
  document.body.appendChild(el);

  const MAX = 100;
  const GAP = 7;
  const entries = [];   // { who, node, h, w, x, enter, baseOpacity }
  let scroll = 0;       // px the stack is slid down; 0 = the newest line at its anchor

  const R = () => Math.min(innerWidth, innerHeight) * 0.30;  // the orb's visual radius
  const cx = () => innerWidth / 2;
  const cy = () => innerHeight / 2;

  // ---- layout: measure only what changed, then write only transforms -------
  // Heights are cached per entry and re-measured only when the text or the
  // chord width changes, so a momentum frame is pure transform/opacity writes.
  function measure(entry) { entry.h = entry.node.offsetHeight || 22; }

  function positionPass() {
    const r = R(), midX = cx(), midY = cy();
    const rewrapped = [];
    // the newest entry's TOP sits just below the sphere's center — unless the
    // line is so tall it would run under the chat bar (a long streamed reply
    // on a phone): then it lifts just enough that its tail stays readable
    const newestH = entries.length ? entries[entries.length - 1].h : 0;
    let top = Math.min(midY + 12, innerHeight - 96 - newestH) + scroll;
    for (let i = entries.length - 1; i >= 0; i--) {
      const en = entries[i], n = en.node;
      // the chord is sampled at the line's edge NEAREST the equator. Sampling
      // at its own middle looks right for short lines but lets a tall line
      // run away (higher → narrower → taller → higher); the nearest edge
      // pushes back — a line that grows reaches DOWN toward the wide part.
      const bottom = top + en.h;
      const dy = bottom <= midY ? bottom - midY : top >= midY ? top - midY : 0;
      const chord = Math.abs(dy) >= r ? 0 : 2 * Math.sqrt(r * r - dy * dy);
      // quantized so a scrolling line doesn't rewrap on every frame
      const w = Math.round(Math.max(r * 0.95, Math.min(2 * r, chord)) / 4) * 4;
      if (w !== en.w) { en.w = w; n.style.width = w + 'px'; n.style.left = (midX - w / 2) + 'px'; rewrapped.push(en); }
      // presence: the newest line speaks at full strength; the past thins
      // with age and lets go entirely once it climbs off the top
      const age = entries.length - 1 - i;
      const offTop = Math.max(0, (midY - 2.6 * r) - top) / 60;
      en.baseOpacity = Math.max(0, Math.min(1, (age === 0 ? 1 : Math.max(0.3, 0.8 - age * 0.07)) - offTop));
      n.style.opacity = String(en.baseOpacity * en.enter);
      // words at the top go INTO the screen: tilt grows from 0 at the
      // equator to ~58° over the crown (below center stays flat — the
      // current line faces the room)
      const midDy = (top + en.h / 2) - midY;
      const tilt = midDy < 0 ? Math.min(58, (-midDy / r) * 52) : 0;
      n.style.transform = `translateY(${top.toFixed(1)}px)` + (tilt ? ` rotateX(${tilt.toFixed(1)}deg)` : '');
      // the next line up starts ITS height above this one's top
      if (i > 0) top -= GAP + entries[i - 1].h;
    }
    return rewrapped;
  }

  function relayout() {
    // width changes can rewrap a line; re-measure and settle (the nearest-edge
    // chord makes this converge — each pass pulls heights toward the truth)
    for (let pass = 0; pass < 3; pass++) {
      const rewrapped = positionPass();
      let changed = false;
      for (const en of rewrapped) { const was = en.h; measure(en); if (en.h !== was) changed = true; }
      if (!changed) return;
    }
    positionPass(); // final placement with the last measurements
  }

  // ---- the column's springs -------------------------------------------------
  // One scalar spring glides the whole column (container transform — zero
  // per-line work); another walks `scroll` home or carries a flick.
  let glideAnim = null, lift = 0;
  function glideFrom(extra) {
    if (reducedMotion()) return;
    glideAnim?.stop();
    const start = lift + extra;
    glideAnim = animate(start, 0, {
      type: 'spring', duration: 0.55, bounce: 0.16,
      onUpdate: (v) => { lift = v; el.style.transform = v ? `translateY(${v.toFixed(1)}px)` : ''; },
    });
  }

  let scrollAnim = null;
  function stopScrollAnim() { scrollAnim?.stop(); scrollAnim = null; }
  function springScrollTo(target, velocity) {
    if (reducedMotion()) { scroll = target; positionPass(); return; }
    stopScrollAnim();
    scrollAnim = animate(scroll, target, {
      type: 'spring', stiffness: 160, damping: 26, velocity: velocity || 0, restDelta: 0.4,
      onUpdate: (v) => { scroll = v; positionPass(); },
    });
  }

  // ---- the words arrive as they are spoken ----------------------------------
  // The presence's lines are not printed, they are SAID: each word materializes
  // in order — a breath of blur and lift — and the word arriving right now
  // glows a touch brighter before settling into the line (the active word).
  // Your own lines appear whole: they were already yours.
  // (Pattern after KokonutUI's text reveals, re-grown here in vanilla soil.)
  function setWords(entry, text) {
    const parts = String(text).split(/(\s+)/);
    const n = entry.node;
    n.textContent = '';
    let wi = 0;                          // word index across the utterance
    const fresh = [];
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { n.appendChild(document.createTextNode(p)); continue; }
      const s = document.createElement('span');
      s.className = 'hw';
      s.textContent = p;
      if (wi >= entry.revealed) { s.style.opacity = '0'; fresh.push(s); }
      n.appendChild(s);
      wi += 1;
    }
    entry.revealed = wi;                 // every word is now queued or settled
    fresh.forEach((s, i) => {
      s.classList.add('hw-live');
      animate(s, { opacity: [0, 1], y: [3, 0], filter: ['blur(5px)', 'blur(0px)'] },
        { duration: 0.3, delay: i * 0.055, ease: 'easeOut' })
        .finished.then(() => s.classList.remove('hw-live'));
    });
  }
  const speak = (entry, text) => {
    if (entry.who === 'you' || reducedMotion()) { entry.node.textContent = text; entry.revealed = Infinity; }
    else setWords(entry, text);
  };

  let lastPushAt = 0;
  function push(who, text) {
    const t = String(text || '').trim();
    if (!t) return;
    const last = entries[entries.length - 1];
    const growing = last && last.who === who && (Date.now() - lastPushAt) < 15000
      && (t.startsWith(last.node.textContent) || last.node.textContent.startsWith(t));
    lastPushAt = Date.now();
    if (growing) {
      // the same utterance, still arriving (a streamed reply, a live voice
      // transcript) — the line grows in place instead of stacking triplets,
      // and only the words that just arrived are spoken in
      const was = last.h;
      speak(last, t);
      measure(last);
      stopScrollAnim(); scroll = 0;
      relayout();
      if (last.h > was) glideFrom(last.h - was); // the column breathes up as the line wraps
      return;
    }
    const n = document.createElement('div');
    n.className = 'hl ' + (who === 'you' ? 'hl-you' : 'hl-ai');
    el.appendChild(n);
    const entry = { who, node: n, h: 0, w: -1, x: 0, enter: reducedMotion() ? 1 : 0, baseOpacity: 1, revealed: 0 };
    speak(entry, t);
    entries.push(entry);
    while (entries.length > MAX) entries.shift().node.remove();
    measure(entry);
    // a new line always brings you home to now — gliding, not teleporting
    if (scroll > 0 && !reducedMotion()) springScrollTo(0, 0); else { stopScrollAnim(); scroll = 0; }
    relayout();
    glideFrom(entry.h + GAP);   // the column rises into its new state
    if (entry.enter < 1) {
      animate(0, 1, {
        type: 'spring', duration: 0.6, bounce: 0,
        onUpdate: (v) => { entry.enter = v; entry.node.style.opacity = String(entry.baseOpacity * v); },
      });
    }
  }

  function clear() {
    stopScrollAnim(); glideAnim?.stop();
    lift = 0; el.style.transform = '';
    for (const e of entries) e.node.remove();
    entries.length = 0;
    scroll = 0;
  }

  // ---- scrolling the past ----------------------------------------------------
  const live = () => entries.length && getComputedStyle(el).display !== 'none';
  const inColumn = (x, y, r) =>
    Math.abs(x - cx()) <= r * 1.15 && y >= cy() - 2.8 * r && y <= cy() + 1.4 * r;
  function maxScroll() {
    let total = 0;
    for (const en of entries) total += en.h + GAP;
    return Math.max(0, total - R());
  }

  // The wheel scrolls the past while the cursor is over the column — direct,
  // no inertia of its own (the wheel already has the hand's cadence).
  window.addEventListener('wheel', (e) => {
    if (!live() || !inColumn(e.clientX, e.clientY, R())) return;
    stopScrollAnim();
    // wheel UP looks back (the past sits above) — chat-log convention
    const next = Math.max(0, Math.min(maxScroll(), scroll - e.deltaY));
    if (next === scroll) return;
    e.preventDefault();
    scroll = next;
    positionPass();
  }, { passive: false });

  // Touch has no wheel — a drag that BEGINS in the column's corridor but
  // OUTSIDE the orb's disc scrolls the past instead. The press is taken in the
  // capture phase so the trackball (which owns the whole canvas) never sees
  // it; grabbing the sphere itself still always spins the orb. A flick keeps
  // going with real momentum; past the ends the column rubber-bands.
  let dragId = null, raw = 0, dragY = 0, samples = [];
  window.addEventListener('pointerdown', (e) => {
    if (!live()) return;
    const r = R();
    if (!inColumn(e.clientX, e.clientY, r)) return;
    if (Math.hypot(e.clientX - cx(), e.clientY - cy()) < r * 1.05) return; // the orb's disc belongs to the trackball
    if (e.target.closest && e.target.closest('#chat, #home-nav, #home-nav-right, button, textarea, input, select')) return;
    stopScrollAnim();
    dragId = e.pointerId; raw = scroll; dragY = e.clientY;
    samples = [[performance.now(), scroll]];
    e.stopPropagation();
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (dragId === null || e.pointerId !== dragId) return;
    const max = maxScroll();
    raw += e.clientY - dragY;                       // pulling DOWN brings the past down into view
    dragY = e.clientY;
    samples.push([performance.now(), raw]);
    if (samples.length > 6) samples.shift();
    // past the ends the hand feels the column resist
    scroll = raw < 0 ? raw * 0.3 : raw > max ? max + (raw - max) * 0.3 : raw;
    positionPass();
  });
  const endHistDrag = (e) => {
    if (dragId === null || e.pointerId !== dragId) return;
    dragId = null;
    const max = maxScroll();
    if (scroll < 0 || scroll > max) { springScrollTo(Math.max(0, Math.min(max, scroll)), 0); return; }
    // velocity from the last ~100ms of the gesture → carry the flick
    const now = performance.now();
    const past = samples.filter(([t]) => now - t < 120);
    if (past.length >= 2 && !reducedMotion()) {
      const [t0, s0] = past[0], [t1, s1] = past[past.length - 1];
      const v = t1 > t0 ? (s1 - s0) / ((t1 - t0) / 1000) : 0;   // px/s
      if (Math.abs(v) > 220) springScrollTo(Math.max(0, Math.min(max, scroll + v * 0.28)), v);
    }
  };
  window.addEventListener('pointerup', endHistDrag, { capture: true });
  window.addEventListener('pointercancel', endHistDrag, { capture: true });

  window.addEventListener('resize', () => {
    for (const en of entries) { en.w = -1; measure(en); }  // widths and wraps both move
    relayout();
  });
  return { push, clear };
}
