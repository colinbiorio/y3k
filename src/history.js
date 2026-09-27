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
//
// A STREAMED REPLY IS THE BUSIEST THING THIS FILE DOES, and it used to be the
// most expensive thing on the page while the orb was animating to speech: every
// SSE delta (20-50 a second) rebuilt every word span of the line, forced a
// layout, re-ran the whole lane layout over up to 100 lines, and tripped the
// mercury MutationObserver's document-wide sweep. The rebuild also discarded
// words that were still fading in, so they snapped to full strength mid-reveal
// — a visible glitch on every reply. Now: one update per frame, whatever the
// stream's rate; a growing line only ever APPENDS the words that are new; and
// the layout runs only when the line actually changed height.

import { animate, reducedMotion } from './motion.js';

export function createHistory() {
  const el = document.createElement('div');
  el.id = 'chat-history';
  document.body.appendChild(el);

  const MAX = 100;
  const GAP = 7;
  // { who, node, text, plain, parts, nodes, revealed, h, w, x, align, enter,
  //   baseOpacity, hidden, op, tf, clip }
  const entries = [];
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
  // ONCE PER FRAME, NOT ONCE PER CALLER. lanes() costs a getComputedStyle on
  // <body>, two rect reads for the band and a computed style plus a rect for
  // the portal — and it was asked by every wheel tick, every scroll-spring
  // frame, every hand frame (onWords) and every streamed delta, each forcing
  // the layout the previous writer had just dirtied. The answer cannot change
  // inside one frame unless something moved, so it is kept for the frame
  // (document.timeline's clock holds still through a frame's callbacks and
  // tasks; where it is missing every call measures, which is where this
  // started) and thrown away the moment a resize or a body class or inset
  // change says something did move.
  let laneCache = null, laneAt = NaN;
  const frameClock = () => {
    const t = typeof document.timeline === 'object' && document.timeline ? document.timeline.currentTime : null;
    return typeof t === 'number' ? t : performance.now();
  };
  function lanesNow() {
    const at = frameClock();
    if (laneCache && at === laneAt) return laneCache;
    laneAt = at;
    laneCache = lanes();
    return laneCache;
  }
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
  const FOLD_SZ = 26;
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
      L.merged ? null : [L.y3k.x + L.y3k.w - FOLD_SZ, L.y3k.top],
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

  // WHERE THE WORDS ARE, as last laid out. onWords is asked by the drag on
  // every press and by the hand on every frame it is over the stage, and each
  // ask used to walk every line through getBoundingClientRect. The rects only
  // move when this file moves them (a layout pass, a glide frame, a resize) or
  // when the container is shown or hidden (a body class), so they are measured
  // once after each of those and read from here in between.
  let wordRects = null;
  const moved = () => { wordRects = null; };

  // LAYERS ONLY WHILE SOMETHING IS MOVING. styles.css promotes every line
  // (will-change: transform, opacity), which is right for a scroll spring and
  // wrong the rest of the time: up to a hundred resting layers, each with a
  // four-deep text shadow, composited on every frame the orb draws behind them.
  // Inline style wins over the sheet, so lines rest flat and are lifted only
  // for the length of a spring or a drag.
  let layered = false;
  function layer(on) {
    if (on === layered) return;
    layered = on;
    for (const en of entries) en.node.style.willChange = on && !en.hidden ? 'transform, opacity' : 'auto';
  }


  // TWO LANES, ONE TIMELINE. The presence speaks down one side and you speak
  // down the other, but they share a single chronological stack and a single
  // `scroll` — so dragging the past moves both halves of the conversation
  // together and a reply always sits below the line it answered. Separate
  // per-lane stacks would drift apart the moment one side said more than the
  // other, and then scrolling would mean two different things at once.
  function positionPass() {
    const L = lanesNow();
    moved();
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
      if (i > 0) shared -= GAP + entries[i - 1].h;
      // A LINE FADED TO NOTHING IS TAKEN OFF THE SCREEN, not drawn at zero.
      // Past the lane's edge a line is invisible and still laid out, layered,
      // clipped and transformed on every spring frame; visibility retires the
      // painting and this skips the writes. It stays laid out on purpose — its
      // height is part of where every older line stands. (The width above is
      // still written for the same reason: a stale wrap is a stale height.)
      const gone = en.baseOpacity <= 0;
      if (gone !== en.hidden) {
        en.hidden = gone;
        n.style.visibility = gone ? 'hidden' : '';
        if (layered) n.style.willChange = gone ? 'auto' : 'transform, opacity';
      }
      if (gone) continue;
      const op = String(en.baseOpacity * en.enter);
      if (op !== en.op) { en.op = op; n.style.opacity = op; }
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
      const tf = `translateY(${top.toFixed(1)}px)` + (tilt ? ` rotateX(${tilt.toFixed(1)}deg)` : '');
      if (tf !== en.tf) { en.tf = tf; n.style.transform = tf; }
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
      onUpdate: (v) => { lift = v; el.style.transform = v ? `translateY(${v.toFixed(1)}px)` : ''; moved(); },
    });
  }

  // Lines are layered while ANY of the three is moving them: a spring, a drag,
  // or a wheel that has ticked in the last quarter second. One question, asked
  // in one place, so none of them can drop the layers out from under another.
  let scrollAnim = null, dragging = false, wheelRest = 0;
  const settleLayers = () => layer(!!scrollAnim || dragging || !!wheelRest);
  function stopScrollAnim() { scrollAnim?.stop(); scrollAnim = null; settleLayers(); }
  function springScrollTo(target, velocity) {
    if (reducedMotion()) { scroll = target; positionPass(); return; }
    stopScrollAnim();
    layer(true);
    const anim = animate(scroll, target, {
      type: 'spring', stiffness: 160, damping: 26, velocity: velocity || 0, restDelta: 0.4,
      onUpdate: (v) => { scroll = v; positionPass(); },
    });
    scrollAnim = anim;
    anim.finished?.then(() => { if (scrollAnim === anim) { scrollAnim = null; settleLayers(); } }, () => {});
  }

  // ---- the words arrive as they are spoken ----------------------------------
  // The presence's lines are not printed, they are SAID: each word materializes
  // in order and the word arriving right now glows a touch brighter before
  // settling into the line (the active word). Your own lines appear whole:
  // they were already yours.
  // (Pattern after KokonutUI's text reveals, re-grown here in vanilla soil.)
  //
  // OPACITY AND NOTHING ELSE. The reveal was opacity + a 3px lift + a 5px blur.
  // The blur is a filter re-rasterised on every word every frame of the fade,
  // and the lift is an independent transform Motion has to drive from the main
  // thread — at a 55ms stagger that is several running on every frame of a
  // reply. Opacity alone runs on the compositor and reads the same at arm's
  // length. Under reduced motion (the OS's, or the smooth mode's) there is no
  // per-word reveal at all: the line is plain text, see `plain` below.
  //
  // APPEND, NEVER REBUILD. The line keeps its words (`parts`, `nodes`) and a
  // new delta is diffed against them: the unchanged prefix stays exactly as it
  // is — including a word halfway through its fade, which used to be replaced
  // by a fresh, fully opaque copy and snap — a word the stream had split in
  // two is finished in place, and only the words that are genuinely new are
  // added. Text is written through `.data` on existing text nodes, which the
  // mercury MutationObserver (childList only) never hears.
  const isSpace = (p) => /^\s+$/.test(p);
  function wordNode(p) {
    if (isSpace(p)) return document.createTextNode(p);
    const s = document.createElement('span');
    s.className = 'hw';
    s.appendChild(document.createTextNode(p));
    return s;
  }
  function setWords(entry, text) {
    const parts = String(text).split(/(\s+)/).filter(Boolean);
    const n = entry.node;
    const old = entry.parts || [];
    const nodes = entry.nodes || [];
    let keep = 0;
    while (keep < old.length && keep < parts.length && old[keep] === parts[keep]) keep += 1;
    // the last word on screen, still arriving: finish it where it stands
    if (keep === old.length - 1 && keep < parts.length && parts[keep].startsWith(old[keep])
        && isSpace(parts[keep]) === isSpace(old[keep])) {
      const node = nodes[keep];
      (node.nodeType === 3 ? node : node.firstChild).data = parts[keep];
      keep += 1;
    }
    // anything after the shared prefix that is no longer true (a stream that
    // rewrote its tail — rare, but a scrubbed tag can do it) goes
    for (let i = nodes.length - 1; i >= keep; i--) nodes[i].remove();
    nodes.length = keep;
    let wi = 0;                          // word index across the utterance
    for (let i = 0; i < keep; i++) if (!isSpace(parts[i])) wi += 1;
    const fresh = [];
    const frag = document.createDocumentFragment();
    for (let i = keep; i < parts.length; i++) {
      const node = wordNode(parts[i]);
      if (node.nodeType === 1) {
        if (wi >= entry.revealed) { node.style.opacity = '0'; fresh.push(node); }
        wi += 1;
      }
      nodes.push(node);
      frag.appendChild(node);
    }
    if (frag.firstChild) n.appendChild(frag);
    entry.parts = parts; entry.nodes = nodes;
    entry.revealed = Math.max(entry.revealed, wi);   // every word is now queued or settled
    fresh.forEach((s, i) => {
      s.classList.add('hw-live');
      animate(s, { opacity: [0, 1] }, { duration: 0.3, delay: i * 0.055, ease: 'easeOut' })
        // Motion leaves its last keyframe (1) inline; without Motion nothing
        // animates and finished resolves at once — clearing the inline 0 is
        // what keeps a word from staying invisible in that case
        .finished.then(() => { if (s.style.opacity === '0') s.style.opacity = ''; s.classList.remove('hw-live'); }, () => {});
    });
  }
  // Plain lines are one text node, rewritten in place as a transcript grows.
  function setPlain(entry, text) {
    const n = entry.node, f = n.firstChild;
    if (f && f.nodeType === 3 && f === n.lastChild) f.data = text;
    else n.textContent = text;
  }
  const speak = (entry, text) => {
    if (entry.plain) setPlain(entry, text); else setWords(entry, text);
    entry.text = text;
  };

  // ONE UPDATE PER FRAME. main.js hands every SSE delta straight to push(),
  // 20-50 times a second; the screen can show one of them per frame. The latest
  // text for the line that is growing waits here and is laid out once, on the
  // next frame. Anything that is NOT the same line growing — the other speaker,
  // a new utterance — lays the waiting one out first, so the order of the
  // conversation is never changed by the wait. At most one frame of latency.
  let queued = null, queuedRaf = 0;
  const sameLine = (a, b) => a.startsWith(b) || b.startsWith(a);
  function push(who, text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (queued && (queued.who !== who || !sameLine(t, queued.text))) flush();
    queued = { who, text: t };
    if (!queuedRaf) queuedRaf = requestAnimationFrame(flush);
  }
  function flush() {
    if (queuedRaf) { cancelAnimationFrame(queuedRaf); queuedRaf = 0; }
    const q = queued;
    queued = null;
    if (q) apply(q.who, q.text);
  }

  let lastPushAt = 0;
  function apply(who, t) {
    const last = entries[entries.length - 1];
    const growing = last && last.who === who && (Date.now() - lastPushAt) < 15000 && sameLine(t, last.text);
    lastPushAt = Date.now();
    if (growing) {
      // the same utterance, still arriving (a streamed reply, a live voice
      // transcript) — the line grows in place instead of stacking triplets,
      // and only the words that just arrived are spoken in
      if (t === last.text) return;
      const was = last.h;
      speak(last, t);
      moved();
      measure(last);
      // Most deltas add a word to a line that does not wrap: the height is the
      // same, nothing in the column moves, and there is nothing to lay out.
      const away = scroll !== 0 || scrollAnim;
      stopScrollAnim(); scroll = 0;
      if (last.h !== was || away) relayout();
      if (last.h > was) glideFrom(last.h - was); // the column breathes up as the line wraps
      return;
    }
    const n = document.createElement('div');
    n.className = 'hl ' + (who === 'you' ? 'hl-you' : 'hl-ai');
    n.style.willChange = 'auto';
    el.appendChild(n);
    const still = reducedMotion();
    // plain: a line with no per-word reveal — yours (already yours), or any
    // line under reduced motion. Decided once, so a line never changes kind
    // halfway through being said.
    const entry = { who, node: n, text: '', plain: who === 'you' || still, h: 0, w: -1, x: 0, enter: still ? 1 : 0,
      baseOpacity: 1, revealed: 0, hidden: false, op: '', tf: '', clip: '' };
    speak(entry, t);
    entries.push(entry);
    while (entries.length > MAX) entries.shift().node.remove();
    measure(entry);
    moved();
    // a new line always brings you home to now — gliding, not teleporting
    if (scroll > 0 && !reducedMotion()) springScrollTo(0, 0); else { stopScrollAnim(); scroll = 0; }
    relayout();
    glideFrom(entry.h + GAP);   // the column rises into its new state
    if (entry.enter < 1) {
      animate(0, 1, {
        type: 'spring', duration: 0.6, bounce: 0,
        onUpdate: (v) => {
          entry.enter = v;
          if (entry.hidden) return;
          entry.op = String(entry.baseOpacity * v);
          entry.node.style.opacity = entry.op;
        },
      });
    }
  }

  function clear() {
    queued = null;
    if (queuedRaf) { cancelAnimationFrame(queuedRaf); queuedRaf = 0; }
    stopScrollAnim(); glideAnim?.stop();
    lift = 0; el.style.transform = '';
    for (const e of entries) e.node.remove();
    entries.length = 0;
    scroll = 0;
    moved();
  }

  // ---- scrolling the past ----------------------------------------------------
  const live = () => entries.length && getComputedStyle(el).display !== 'none';
  // A wheel or a drag scrolls the past while it is OVER the conversation —
  // which means over the lanes themselves, wherever the layout has put them.
  // (The corridor around the orb stays in: it is how the gesture worked when
  // there was one column, and near the sphere it still reads as the column.)
  const inColumn = (x, y, r) => {
    const L = lanesNow();
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
    const L = lanesNow(), room = (l) => Math.max(60, l.bottom - l.top);
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
  //
  // PASSIVE, AND IT ASKS THE CHEAP QUESTIONS FIRST. It was a non-passive
  // listener on window, which makes the browser wait for the main thread
  // before scrolling ANY scroller in the app — the feed, the settings sheet, a
  // window's body, the Code transcript — and every tick then read computed
  // styles and half a dozen rects before deciding it had nothing to do. There
  // was never a default to prevent: html and body do not scroll, so over the
  // column nothing else would have moved. What it still must not take is a
  // wheel aimed at something that scrolls itself (a window over the column,
  // the chat box) or a pinch (ctrl+wheel is the page's zoom). (quiet() reads
  // HANDS_OFF, declared further down — it runs long after this file has.)
  const quiet = (e) => {
    if (!entries.length || e.ctrlKey) return true;
    const c = document.body.classList;
    if (!c.contains('in-home') || c.contains('panel-open') || c.contains('gated') || c.contains('viewing') || c.contains('chat-folded')) return true;
    return !!e.target?.closest?.(HANDS_OFF);
  };
  window.addEventListener('wheel', (e) => {
    if (quiet(e) || !live() || !inColumn(e.clientX, e.clientY, R())) return;
    stopScrollAnim();
    // wheel UP looks back (the past sits above) — chat-log convention
    const next = Math.max(0, Math.min(maxScroll(), scroll - e.deltaY));
    if (next === scroll) return;
    scroll = next;
    // a wheel is a burst of ticks, not one: the lines take their layers for
    // the burst and give them back once it has rested
    clearTimeout(wheelRest);
    wheelRest = setTimeout(() => { wheelRest = 0; settleLayers(); }, 250);
    settleLayers();
    positionPass();
  }, { passive: true });

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
  // A line taken off the screen (visibility, above) is not somewhere the words
  // are, so it is not measured and cannot be pressed on.
  function lineRects() {
    const out = [];
    for (const line of el.querySelectorAll('.hl')) {
      if (line.style.visibility === 'hidden') continue;
      const r = line.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.push(r);
    }
    return out;
  }
  const onWords = (x, y) => {
    if (!wordRects) wordRects = lineRects();
    for (const r of wordRects) {
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
    dragging = true;
    stopScrollAnim();   // …which layers the lines: a drag is moving them now
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
    dragging = false;
    const max = maxScroll();
    if (scroll < 0 || scroll > max) { springScrollTo(Math.max(0, Math.min(max, scroll)), 0); return; }
    // velocity from the last ~100ms of the gesture → carry the flick
    const now = performance.now();
    const past = samples.filter(([t]) => now - t < 120);
    if (past.length >= 2 && !reducedMotion()) {
      const [t0, s0] = past[0], [t1, s1] = past[past.length - 1];
      const v = t1 > t0 ? (s1 - s0) / ((t1 - t0) / 1000) : 0;   // px/s
      if (Math.abs(v) > 220) { springScrollTo(Math.max(0, Math.min(max, scroll + v * 0.28)), v); return; }
    }
    settleLayers();   // nothing is carrying it on: the lines can rest flat
  };
  window.addEventListener('pointerup', endHistDrag, { capture: true });
  window.addEventListener('pointercancel', endHistDrag, { capture: true });

  window.addEventListener('resize', () => {
    laneCache = null;
    for (const en of entries) { en.w = -1; measure(en); }  // widths and wraps both move
    relayout();
  });
  // Showing, hiding, folding and the frame's insets all live on <body> — its
  // class and its inline --hole-* — so any change there means the lanes and
  // the word rects measured this frame may already be wrong.
  new MutationObserver(() => { laneCache = null; moved(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  // onWords is handed out so the hand can ask the same question the drag asks:
  // is this point on something the conversation has written? The pointer bus
  // uses it to decide whether pressing there means anything at all, which keeps
  // one definition of where the past lives.
  return { push, clear, onWords: (x, y) => onWords(x, y) };
}
