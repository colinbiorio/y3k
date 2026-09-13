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

  // ---- THE ROOM THE WORDS ARE ALLOWED IN -----------------------------------
  // Measured, never assumed. Every one of these is a real element whose size
  // changes with the window, the frame's fold state and the chat's three
  // levels, so the safe band is recomputed each pass rather than written down
  // as a number that would be wrong at some resolution nobody tested.
  const px = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
  function safeBand() {
    const cs = getComputedStyle(document.body);
    // the frame's own insets: the bars are on a string and these follow them
    const holeT = px(cs.getPropertyValue('--hole-t'), 0);
    const holeB = px(cs.getPropertyValue('--hole-b'), 0);
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return (r.width && r.height) ? r : null; };
    const brand = rect('#home-brand');          // the wordmark floats over the room
    const chat = rect('#chat');                 // and the bar grows as it types
    const PAD = 14;
    const top = Math.max(holeT, brand ? brand.bottom : 0) + PAD;
    const bottom = innerHeight - Math.max(holeB, chat ? innerHeight - chat.top : 0) - PAD;
    const left = px(cs.getPropertyValue('--hole-l'), 0) + PAD;
    const right = innerWidth - px(cs.getPropertyValue('--hole-r'), 0) - PAD;
    return { top, bottom, left, right, h: Math.max(80, bottom - top) };
  }

  // TWO COLUMNS, OR ONE STACK. Beside the orb when there is room beside it;
  // above and below when there is not. The switch is on MEASURED width, not on
  // a media query — a narrow desktop window and a tablet are the same problem,
  // and the orb's radius is itself a function of the viewport.
  const MIN_COL = 190;    // narrower than this and the lines wrap to ribbons
  const MAX_COL = 460;
  function lanes() {
    const b = safeBand(), r = R(), mid = cx();
    const side = Math.min(mid - r - 26 - b.left, b.right - (mid + r + 26));
    if (side >= MIN_COL) {
      const w = Math.min(MAX_COL, side);
      return { split: true, band: b,
        y3k: { x: mid - r - 26 - w, w, align: 'right' },      // the presence, left of the orb
        you: { x: mid + r + 26, w, align: 'left' } };         // you, right of it
    }
    // STACKED. The presence's words sit above the orb and yours below, and the
    // two halves get exactly what the orb leaves — NO MINIMUM.
    //   A floor was the obvious thing to write and it was wrong: on an iPad and
    // on any narrow window the orb is large against the band, so a floor of a
    // fifth of the band pushed both lanes straight back INTO the orb. Measured
    // overlapping on 834x1194 and 900x800. Not overlapping is the requirement,
    // and a short lane still scrolls — it is a small window onto the past, not
    // a broken one — whereas an overlapping lane is unreadable at any length.
    //   If both come out very short the screen genuinely has no room for an orb
    // that size and two columns of text, and the answer to that is the orb's,
    // not the layout's.
    const w = Math.min(MAX_COL, b.right - b.left);
    const x = mid - w / 2;
    const gap = 18;
    let above = Math.max(0, (cy() - r - gap) - b.top);
    let below = Math.max(0, b.bottom - (cy() + r + gap));
    // ONE LANE, WHEN TWO WILL NOT FIT. Under about two lines a lane is not a
    // small window onto the conversation, it is a place words go to be
    // invisible — measured at zero height on a 900x800 window, where the orb's
    // diameter plus the frame's insets leave nothing above it at all. Rather
    // than draw into a strip nobody can read, both speakers share whichever
    // side is bigger, and the 'you —' prefix comes back because the side is no
    // longer saying who spoke. Still never over the orb.
    const MIN_LANE = 46;
    if (above < MIN_LANE || below < MIN_LANE) {
      const useBelow = below >= above;
      const top = useBelow ? b.bottom - below : b.top;
      const height = Math.max(above, below);
      return { split: false, merged: true, band: b,
        y3k: { x, w, align: 'center', top, height },
        you: { x, w, align: 'center', top, height } };
    }
    return { split: false, band: b,
      y3k: { x, w, align: 'center', top: b.top, height: above },
      you: { x, w, align: 'center', top: b.bottom - below, height: below } };
  }

  // ---- layout: measure only what changed, then write only transforms -------
  // Heights are cached per entry and re-measured only when the text or the
  // chord width changes, so a momentum frame is pure transform/opacity writes.
  function measure(entry) { entry.h = entry.node.offsetHeight || 22; }


  // TWO LANES, ONE TIMELINE. The presence speaks down one side and you speak
  // down the other, but they share a single chronological stack and a single
  // `scroll` — so dragging the past moves both halves of the conversation
  // together and a reply always sits below the line it answered. Separate
  // per-lane stacks would drift apart the moment one side said more than the
  // other, and then scrolling would mean two different things at once.
  function positionPass() {
    const L = lanes();
    // the 'you — ' prefix earns its place only when both speakers share a column
    el.classList.toggle('stacked', !L.split);
    const rewrapped = [];
    const bandBottom = L.split ? L.band.bottom : (L.you.top + L.you.height);
    // The newest line's BOTTOM rests at the foot of its lane. Everything older
    // climbs from there, so the thing being said now is always in the same
    // place no matter how much came before it.
    const newestH = entries.length ? entries[entries.length - 1].h : 0;
    let top = bandBottom - newestH + scroll;
    for (let i = entries.length - 1; i >= 0; i--) {
      const en = entries[i], n = en.node;
      const lane = en.who === 'you' ? L.you : L.y3k;
      const w = Math.round(lane.w / 4) * 4;         // quantized: no rewrap per frame
      if (w !== en.w || lane.x !== en.x || lane.align !== en.align) {
        en.w = w; en.x = lane.x; en.align = lane.align;
        n.style.width = w + 'px';
        n.style.left = Math.round(lane.x) + 'px';
        n.style.textAlign = lane.align;
        rewrapped.push(en);
      }
      // Presence: the newest speaks at full strength and the past thins. The
      // fade to nothing is keyed on the band's own top rather than a constant,
      // so a line lets go exactly as it reaches the wordmark instead of at some
      // height that happened to be right on one screen.
      const age = entries.length - 1 - i;
      const offTop = Math.max(0, (L.band.top + 8) - top) / 56;
      en.baseOpacity = Math.max(0, Math.min(1, (age === 0 ? 1 : Math.max(0.3, 0.82 - age * 0.07)) - offTop));
      n.style.opacity = String(en.baseOpacity * en.enter);
      // Words climbing out of the band go INTO the screen, the same depth cue
      // the sphere column had — measured against the band now, not the orb.
      const up = Math.max(0, (L.band.top + L.band.h * 0.45) - (top + en.h / 2));
      const tilt = Math.min(52, (up / Math.max(1, L.band.h * 0.45)) * 52);
      n.style.transform = `translateY(${top.toFixed(1)}px)` + (tilt ? ` rotateX(${tilt.toFixed(1)}deg)` : '');
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
