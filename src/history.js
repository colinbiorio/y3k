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
    let left = px(cs.getPropertyValue('--hole-l'), 0) + PAD;
    const right = innerWidth - px(cs.getPropertyValue('--hole-r'), 0) - PAD;
    // ⚠ THE PORTAL DOES NOT GET A COLUMN. This used to inset the band to the
    // portal's right edge, which sounds careful and was the bug: it took the
    // usable side from 360px to 128px, under MIN_COL, so the layout fell back to
    // stacked and then to the merged single column — and the two-lane
    // conversation never appeared at all. It costs a lane a little of its FLOOR
    // instead now, and only the lane it is actually under — see duck() below.
    return { top, bottom, left, right, h: Math.max(80, bottom - top) };
  }

  // Where the portal is, if it is anywhere. Measured like everything else, and
  // null while it is faded out — a lane must not step around a disc nobody can
  // see, and for a visitor with no garden on the other side there is no disc.
  function portalRect() {
    const p = document.querySelector('#portal');
    if (!p) return null;
    if (parseFloat(getComputedStyle(p).opacity) < 0.05) return null;
    const r = p.getBoundingClientRect();
    return (r.width && r.height) ? r : null;
  }

  // THE LANE DUCKS UNDER THE PORTAL — by height, never by width.
  //   (2026-09-26: the portal moved INTO THE TOP BAR, outside the safe band, so
  // `floor` lands above every lane's top and this returns the lane untouched —
  // a no-op by construction rather than by deletion, and correct again the day
  // the disc comes back down. Left in for that reason.)
  //   Taking the portal's WIDTH out of the band is what broke this layout: one
  // 118px disc in the corner narrowed BOTH columns everywhere, including the
  // 700px of lane nowhere near it, until neither cleared MIN_COL. Taking its
  // HEIGHT out costs the one lane it actually sits under a few px of floor and
  // costs the other lane nothing.
  //   With the rail out, the band starts well right of the disc and this never
  // fires. Folded (--hole-l: 10px) the room reaches the screen edge and the
  // presence's newest lines land right on it, which is when it does.
  const DUCK_MIN = 24;    // a sliver of circle under centred text is not a collision
  function duck(lane) {
    const p = portalRect();
    if (!p) return lane;
    const over = Math.min(lane.x + lane.w, p.right) - Math.max(lane.x, p.left);
    if (over < DUCK_MIN) return lane;
    const floor = p.top - 12;
    if (floor < lane.top + 46) return lane;   // nothing left to give: the words win
    return { ...lane, bottom: Math.min(lane.bottom, floor) };
  }
  const ducked = (L) => ({ ...L, y3k: duck(L.y3k), you: duck(L.you) });

  // TWO COLUMNS, OR ONE STACK. Beside the orb when there is room beside it;
  // above and below when there is not. The switch is on MEASURED width, not on
  // a media query — a narrow desktop window and a tablet are the same problem,
  // and the orb's radius is itself a function of the viewport.
  const MIN_COL = 190;    // narrower than this and the lines wrap to ribbons
  const ABS_COL = 148;    // …but a ribbon still beats the alternative below
  const MAX_COL = 460;
  function lanes() {
    const b = safeBand(), r = R(), mid = cx();
    const side = Math.min(mid - r - 26 - b.left, b.right - (mid + r + 26));
    const gap = 18;
    const above = Math.max(0, (cy() - r - gap) - b.top);
    const below = Math.max(0, b.bottom - (cy() + r + gap));
    const MIN_LANE = 46;
    const stackWorks = above >= MIN_LANE && below >= MIN_LANE;
    // TWO COLUMNS when they are wide enough to read — and ALSO when they are
    // only just too narrow but the alternative is worse. On a short wide window
    // (1024x640, measured) the orb is 60% of the height, both stacked lanes come
    // out about four pixels tall, and the whole conversation disappears into a
    // strip. 188px of column is narrow. Four pixels of lane is nothing at all.
    if (side >= MIN_COL || (side >= ABS_COL && !stackWorks)) {
      const w = Math.min(MAX_COL, side);
      // Both columns stand on the band's own floor, so the shared timeline
      // reads straight across from one side to the other.
      return ducked({ split: true, band: b,
        y3k: { x: mid - r - 26 - w, w, align: 'right', top: b.top, bottom: b.bottom },
        you: { x: mid + r + 26, w, align: 'left', top: b.top, bottom: b.bottom } });
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
    // ONE LANE, WHEN TWO WILL NOT FIT. Under about two lines a lane is not a
    // small window onto the conversation, it is a place words go to be
    // invisible — measured at zero height on a 900x800 window, where the orb's
    // diameter plus the frame's insets leave nothing above it at all. Rather
    // than draw into a strip nobody can read, both speakers share whichever
    // side is bigger, and the 'you —' prefix comes back because the side is no
    // longer saying who spoke. Still never over the orb.
    if (!stackWorks) {
      const useBelow = below >= above;
      const height = Math.max(above, below);
      const top = useBelow ? b.bottom - height : b.top;
      return ducked({ split: false, merged: true, band: b,
        y3k: { x, w, align: 'center', top, bottom: top + height },
        you: { x, w, align: 'center', top, bottom: top + height } });
    }
    // The presence's floor is the top of the orb; yours is the foot of the
    // band. Its words gather above the sphere, yours below it, and neither
    // lane's rect touches the other or the orb between them.
    return ducked({ split: false, band: b,
      y3k: { x, w, align: 'center', top: b.top, bottom: cy() - r - gap },
      you: { x, w, align: 'center', top: cy() + r + gap, bottom: b.bottom } });
  }

  // ---- FOLDING THE CONVERSATION AWAY --------------------------------------
  // A dash on each side of the orb, and either one takes BOTH halves with it.
  // Colin asked for that explicitly, and it is also the only thing that can be
  // meant: the two columns are one conversation on one timeline, so folding
  // the presence's side and leaving yours would be a claim about the past that
  // is not true.
  //
  // HIDDEN BY VISIBILITY, NEVER BY OPACITY. Opacity leaves every line laid out
  // and still being transformed sixty times a second to produce something
  // nobody can see — the same trap #home was in, where an invisible
  // backdrop-filter went on re-blurring the whole viewport.
  // MEASURED, NOT ASSUMED. The dash is 26px on a desktop and a 44px tap
  // target on a phone (styles.css, the coarse-pointer block), and the right-hand
  // dash is right-aligned by its own width — so a written-down 26 would push it
  // 18px into the room on every phone.
  const foldSize = (f) => f?.offsetWidth || 26;
  const folds = ['chat-fold-y3k', 'chat-fold-you'].map((id) => document.getElementById(id));
  const foldAt = [null, null];
  for (const f of folds) {
    if (!f) continue;
    f.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = document.body.classList.toggle('chat-folded');
      for (const g of folds) g?.setAttribute('aria-expanded', String(!on));
    });
  }
  // Placed from the lanes themselves rather than from a corner of the screen,
  // so the dashes sit on the shoulders of the columns they fold however the
  // layout has arranged them — and move with them when the window does.
  function placeFolds(L) {
    // Merged is ONE region holding both speakers, so the second dash would land
    // exactly on the first. One of them stands down rather than stacking.
    const spots = [
      L.merged ? null : [L.y3k.x + L.y3k.w - foldSize(folds[0]), L.y3k.top],
      [L.you.x, L.you.top],
    ];
    for (let i = 0; i < folds.length; i++) {
      const f = folds[i]; if (!f) continue;
      const at = spots[i];
      f.classList.toggle('solo', !at);
      if (!at) continue;
      const was = foldAt[i];
      if (was && was[0] === Math.round(at[0]) && was[1] === Math.round(at[1])) continue;
      foldAt[i] = [Math.round(at[0]), Math.round(at[1])];
      f.style.transform = `translate3d(${foldAt[i][0]}px, ${foldAt[i][1]}px, 0)`;
    }
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
    placeFolds(L);
    // the 'you — ' prefix earns its place only when both speakers share a column
    el.classList.toggle('merged', !!L.merged);
    const rewrapped = [];
    // WHICH RULER THE LINES ARE MEASURED ON. Two, and the layout picks:
    //   · SPLIT — ONE shared stack, both columns running off the band's floor.
    //     A reply sits below the line it answered and the two sides read across
    //     as a single conversation, which is the whole point of two columns.
    //   · STACKED — each lane keeps its OWN stack on its own floor. A shared
    //     ruler in a 200px lane pushes the presence's newest line up and out of
    //     the screen the moment you type a long one, and an empty strip above
    //     the orb reads as broken rather than as history. The last thing each
    //     of you said always rests on its own floor. One `scroll` still moves
    //     both by the same amount, so dragging the past drags all of it.
    // (Merged is one region, so it must use the shared ruler — two stacks in
    //  one rect would draw straight through each other.)
    const perLane = !L.split && !L.merged;
    const newestH = entries.length ? entries[entries.length - 1].h : 0;
    let shared = -newestH;                    // the newest line's top, floor-relative
    const laneTop = { y3k: 0, you: 0 }, seen = { y3k: false, you: false };
    for (let i = entries.length - 1; i >= 0; i--) {
      const en = entries[i], n = en.node;
      const key = en.who === 'you' ? 'you' : 'y3k';
      const lane = L[key];
      const laneH = Math.max(1, lane.bottom - lane.top);
      let v;
      if (perLane) {
        laneTop[key] = seen[key] ? laneTop[key] - GAP - en.h : -en.h;
        seen[key] = true;
        v = laneTop[key];
      } else v = shared;
      const top = lane.bottom + v + scroll;
      const w = Math.round(lane.w / 4) * 4;         // quantized: no rewrap per frame
      if (w !== en.w || lane.x !== en.x || lane.align !== en.align) {
        en.w = w; en.x = lane.x; en.align = lane.align;
        n.style.width = w + 'px';
        n.style.left = Math.round(lane.x) + 'px';
        n.style.textAlign = lane.align;
        rewrapped.push(en);
      }
      // Presence: the newest speaks at full strength and the past thins. The
      // fade to nothing is keyed on the LANE's own edges rather than a constant
      // or the whole band, so a line lets go exactly as it leaves the room it
      // was given — at the wordmark in one layout, at the orb's rim in another.
      const age = entries.length - 1 - i;
      const offTop = Math.max(0, (lane.top + 8) - top) / 56;
      const offBot = Math.max(0, (top + en.h) - lane.bottom) / 56;
      en.baseOpacity = Math.max(0, Math.min(1,
        (age === 0 ? 1 : Math.max(0.3, 0.82 - age * 0.07)) - offTop - offBot));
      n.style.opacity = String(en.baseOpacity * en.enter);
      // AND THE LANE ACTUALLY CUTS. The fade alone leaves a legible ghost of a
      // line lying across the orb while it scrolls past — 'never overlapping'
      // has to be true of the pixels, not just of the resting positions — so
      // each line is clipped to its lane's floor and ceiling as well.
      const cutT = Math.max(0, lane.top - top), cutB = Math.max(0, (top + en.h) - lane.bottom);
      const clip = (cutT || cutB) ? `inset(${cutT.toFixed(1)}px 0px ${cutB.toFixed(1)}px 0px)` : '';
      if (clip !== en.clip) { en.clip = clip; n.style.clipPath = clip; }
      // Words climbing out of the band go INTO the screen, the same depth cue
      // the sphere column had. Only where there is depth to travel: a stacked
      // lane is a couple of lines tall and the perspective origin sits at the
      // orb, so a tilt there leans the text the wrong way AND slides it out
      // from under its own clip rect.
      const up = Math.max(0, (lane.top + laneH * 0.45) - (top + en.h / 2));
      const tilt = L.split ? Math.min(52, (up / (laneH * 0.45)) * 52) : 0;
      n.style.transform = `translateY(${top.toFixed(1)}px)` + (tilt ? ` rotateX(${tilt.toFixed(1)}deg)` : '');
      if (i > 0) shared -= GAP + entries[i - 1].h;
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
  // A wheel or a drag scrolls the past while it is OVER the conversation —
  // which means over the lanes themselves, wherever the layout has put them.
  // (The corridor around the orb stays in: it is how the gesture worked when
  // there was one column, and near the sphere it still reads as the column.)
  const inColumn = (x, y, r) => {
    const L = lanes();
    for (const lane of [L.y3k, L.you])
      if (x >= lane.x - 12 && x <= lane.x + lane.w + 12 && y >= lane.top - 8 && y <= lane.bottom + 8) return true;
    return Math.abs(x - cx()) <= r * 1.15 && y >= cy() - 2.8 * r && y <= cy() + 1.4 * r;
  };
  // How far back the past goes: enough that the OLDEST line can be pulled to
  // its lane's ceiling, and not a pixel more. The old `total - R()` was the
  // orb's radius standing in for a lane's height, which is neither of the two
  // numbers that matter — it let you drag a tall column into empty space and,
  // in a short lane, stopped short of the oldest line.
  function maxScroll() {
    const L = lanes(), room = (l) => Math.max(60, l.bottom - l.top);
    if (!L.split && !L.merged) {
      let a = 0, b = 0;
      for (const en of entries) { if (en.who === 'you') b += en.h + GAP; else a += en.h + GAP; }
      return Math.max(0, a - room(L.y3k), b - room(L.you));
    }
    let total = 0;
    for (const en of entries) total += en.h + GAP;
    return Math.max(0, total - Math.min(room(L.y3k), room(L.you)));
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
  // WHAT THIS GESTURE MUST NEVER TAKE.
  //
  // The press below is claimed in the CAPTURE phase on `window`, which is the
  // first node in the path — so anything this list forgets is not merely
  // out-competed, it never receives a pointerdown at all. That has now cost two
  // features, both of which read as "it just doesn't work":
  //
  //   - THE WORDMARK. It is a plain div sitting in the corridor above the orb,
  //     so pressing it was swallowed here and its 3D spin never began. Hover
  //     still worked (that listener is on window), which is exactly why it read
  //     as "not spinnable" rather than "dead". Worse, it passed its own test:
  //     a synthetic pointerdown defaults clientX/clientY to 0,0, which is
  //     outside the corridor, so the event got through in the test and never
  //     in a hand.
  //   - THE FLOATING WINDOWS. Dragging the camera preview or a mind window by
  //     its bar was swallowed the same way, and the re-grab that follows lands
  //     on the canvas and spins the orb instead.
  //
  // So the rule is: this gesture belongs to the ROOM. Anything a person can
  // press, drag or type into is not the room. Add to this list, never trim it.
  const HANDS_OFF = [
    '#chat', '#home-nav', '#home-nav-right', '#home-nav-top', '#home-nav-bottom',
    '#home-brand',          // the wordmark: a div, and it spins under the hand
    '#cam-popup',           // the camera preview, title bar and all
    '.mind-win',            // the windows: drag bars, tabs, resize edges
    '#portal', '.budget-pop',
    '.code-root',           // y3k Code: its transcript scrolls itself
    'button', 'textarea', 'input', 'select', 'a',
  ].join(', ');

  let dragId = null, raw = 0, dragY = 0, samples = [];
  // A DRAG SCROLLS THE PAST ONLY WHERE THE PAST IS WRITTEN — on the lines
  // themselves, not anywhere in the corridor around them. The corridor was
  // sized for a thumb on a phone with one column, and it is far too generous
  // for a pointer: a large empty region beside the orb quietly belonged to the
  // conversation, so a hand crossing it started scrolling instead of doing
  // whatever it was doing. Hard to discover, impossible to unlearn.
  //
  // The wheel keeps the corridor (it is aimed by a cursor already on screen and
  // scrolling near the column is what a wheel is for). Only the DRAG narrows.
  const PAD_X = 10, PAD_Y = 8;
  const onWords = (x, y) => {
    for (const line of el.querySelectorAll('.hl')) {
      const r = line.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (x >= r.left - PAD_X && x <= r.right + PAD_X && y >= r.top - PAD_Y && y <= r.bottom + PAD_Y) return true;
    }
    return false;
  };
  window.addEventListener('pointerdown', (e) => {
    if (!live()) return;
    const r = R();
    if (Math.hypot(e.clientX - cx(), e.clientY - cy()) < r * 1.05) return; // the orb's disc belongs to the trackball
    if (!onWords(e.clientX, e.clientY)) return;
    if (e.target.closest && e.target.closest(HANDS_OFF)) return;
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
  // onWords is handed out so the hand can ask the same question the drag asks:
  // is this point on something the conversation has written? The pointer bus
  // uses it to decide whether pressing there means anything at all, which keeps
  // one definition of where the past lives.
  return { push, clear, onWords: (x, y) => onWords(x, y) };
}
