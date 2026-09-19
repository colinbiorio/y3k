// ============================================================================
// handview.js — SHOWING THE HAND, AND LETTING IT REACH.
//
// Three jobs, and they answer three different questions.
//
// THE SKELETON, over the camera picture: "does it see me?" Dots and bones for
// each hand, laid on the video. Not decoration: a tracker with no visible state
// is one you have to take on faith, and when it fails — bad light, hand
// edge-on, half out of frame — this is what tells you whether the machine lost
// you or the feature is broken.
//
// THE CURSORS, on the screen: "where am I pointing?" One soft mark per
// EXTENDED fingertip. A curled finger leaves no mark, so holding up one finger
// gives you one cursor — which is what a person expects, and the only way
// pointing at something is unambiguous.
//
// THE REACH, through src/reach.js: one finger per hand actually acts. Moving it
// over the room turns the orb and over the conversation scrolls it; holding it
// on a button for six tenths of a second presses that button, with the hold
// drawn as a ring closing around the mark so the wait is visible rather than
// mysterious.
//
// WHY ONE ACTING FINGER PER HAND AND NOT FIVE. Five pointers arriving on one
// button at slightly different moments is not five times the control, it is a
// fight: the press lands, the neighbour's press lands, and the app receives a
// burst nobody meant. A hand points with one finger. So every extended finger
// is DRAWN, and the index — or the single finger you are holding up, whichever
// you meant — is the one that reaches. Two hands means two pointers, which is
// exactly what two fingers on a touchscreen already are.
// ============================================================================

import { createOneEuro } from './euro.js';
import { HAND_BONES, HAND_TIPS } from './perceive.js';
import { createTwoHand } from './twohand.js';
import { createKnock } from './reach.js';

// HOW MUCH OF THE CAMERA FRAME A HAND HAS TO SWEEP to cross the longer side of
// the screen: this is a half-extent, so 0.32 means about two thirds of the
// frame, edge to edge. Bigger is calmer and more tiring; smaller is quicker and
// twitchier. There is nothing to calibrate against — no web API gives the
// physical size of anything — so this is a chosen feel, and it is the one
// number to change if the marks feel cramped or jumpy.
const REACH = 0.32;

// Fingertip colours and sizes, thumb to pinky. The index leads because it is
// the one people point with; the thumb matches it because those two are the
// pinch.
const TINT = ['#cdd6ff', '#ffffff', '#b9c6dd', '#b9c6dd', '#b9c6dd'];
// Half what they were: at the old size five marks on one hand covered a real
// part of the screen, and a pointer you cannot see past is not a pointer.
const SIZE = [15, 19, 12, 11, 10];
const HANDS = 2;
const INDEX = 1;            // where the index finger sits in TIPS

// THE KNUCKLE EACH FINGERTIP BENDS FROM. The tap is measured as the tip's
// offset from its OWN knuckle, which is what makes moving the whole hand
// invisible to it: tip and knuckle travel together and the offset does not
// change. Only the finger bending registers, which is what a tap is.
const MCP = [2, 5, 9, 13, 17];   // thumb, index, middle, ring, little
// POINTERS ARE KEYED BY WHICH HAND, NEVER BY ARRAY POSITION. MediaPipe's
// result order is not an identity: when the left hand leaves, the right one
// moves from slot 1 to slot 0, and a pointer keyed on the slot would hand the
// departing hand's live press to the one still on screen — the cursor teleports
// mid-drag and the drag never ends. Handedness is the only stable name we get.
const keyOf = (hand, i) => 'hand:' + (hand.handedness || 'i' + i);

export function createHandView({ perceive, reach, body, popup, video } = {}) {
  let raf = 0, running = false;
  let canvas = null, ctx = null, layer = null;
  // [hand][finger] — one mark and one pair of filters each. A finger that is
  // still must stay still while another moves, so they never share state.
  const dots = [], smooth = [];
  let lastT = 0;
  const twoHand = createTwoHand({ body });
  // A little depth history per hand, for the jab. Small on purpose: the whole
  // gesture is over in a fifth of a second and anything older is a different
  // movement.
  const knock = [createKnock(), createKnock()];
  // Where each fingertip was last frame, so the body can be told how far it
  // moved. [hand][finger].
  const wasAt = [[], []];
  const pinched = [false, false];
  // A held pinch: where it was aimed when it closed, and where the grip was,
  // so the drag moves by how far the HAND has gone rather than jumping to the
  // point between two fingers that are also closing on each other.
  const holding = [null, null];
  const PINCH_ON = 0.42, PINCH_OFF = 0.58;   // two thresholds, or it chatters
  // WHERE THE FINGER WAS AIMING, a moment ago. Pinching pulls the index down
  // toward the thumb, so a click sent at the instant the pinch closes lands
  // below where the person was pointing. It is sent at where they WERE.
  const aim = [[], []];
  // Far enough back to be BEFORE the movement that triggered the press — a
  // tap's whole out-and-back fits inside 340ms, and a pinch takes a moment to
  // close — but not so far that it remembers a different intention.
  const AIM_BACK_MS = 260;
  // Which pointers we drove last frame. A hand that leaves entirely is not in
  // the list at all, so no loop body runs for it and nothing would end its
  // pointer — the liveness sweep would get there eventually, but "eventually"
  // is a quarter of a second of the room still spinning after the hand is gone.
  // Ending it the moment it stops being driven is immediate and exact.
  let drove = new Set();

  function build() {
    if (canvas || !popup) return;
    // A CHILD, never a re-parenting. The popup already carries a mounted ring
    // and the video; we add one canvas over the top and touch neither.
    canvas = document.createElement('canvas');
    canvas.className = 'hand-skel';
    canvas.setAttribute('aria-hidden', 'true');
    popup.appendChild(canvas);
    ctx = canvas.getContext('2d');

    layer = document.createElement('div');
    layer.id = 'hand-cursors';
    layer.setAttribute('aria-hidden', 'true');
    for (let hand = 0; hand < HANDS; hand++) {
      dots[hand] = []; smooth[hand] = [];
      for (let i = 0; i < HAND_TIPS.length; i++) {
        const d = document.createElement('i');
        d.className = 'hand-dot out';
        d.style.setProperty('--tint', TINT[i]);
        d.style.setProperty('--size', SIZE[i] + 'px');
        layer.appendChild(d);
        dots[hand][i] = d;
        smooth[hand][i] = [createOneEuro({ minCutoff: 1.2, beta: 0.35 }), createOneEuro({ minCutoff: 1.2, beta: 0.35 })];
      }
    }
    document.body.appendChild(layer);
  }

  // The preview is CSS-mirrored (scaleX(-1)) so it reads as a selfie, and
  // perceive already hands out viewer-space points — so a viewer-space x maps
  // STRAIGHT onto the displayed pixel. The two mirrors cancel. Do not add a
  // third one here; that is how this ends up backwards.
  function drawSkeleton(list) {
    if (!canvas || !video) return;
    const w = video.clientWidth, h = video.clientHeight;
    if (!w || !h) { canvas.width = 0; return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!list.length) return;

    // OBJECT-FIT: COVER, REPRODUCED IN THE MATHS. #cam is object-fit: cover and
    // a canvas has no such property, so the crop is done here or the skeleton
    // lands beside the hand. camera.js asks 640x480 as an IDEAL, which a camera
    // is free to miss: a 16:9 webcam in this 4:3 box loses about an eighth off
    // EACH side, and the naive map is exact in the middle and ~19px out at the
    // edge — wrong in the way that looks like it nearly works.
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const k = Math.max(w / vw, h / vh);
    const dw = vw * k, dh = vh * k, ox = (w - dw) / 2, oy = (h - dh) / 2;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const hand of list) {
      const P = hand.points;
      const X = (i) => ox + P[i][0] * dw, Y = (i) => oy + P[i][1] * dh;
      // Two passes: a wide dark stroke first so the skeleton survives a bright
      // background, then the bright line on top. A single stroke vanishes
      // against a window or a lamp — which is exactly when someone is looking
      // at this to work out why tracking is poor.
      for (const pass of [{ w: 4.5, c: 'rgba(0,0,0,0.55)' }, { w: 1.8, c: 'rgba(233,240,255,0.92)' }]) {
        ctx.lineWidth = pass.w; ctx.strokeStyle = pass.c;
        ctx.beginPath();
        for (const [a, b] of HAND_BONES) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
        ctx.stroke();
      }
      for (let i = 0; i < P.length; i++) {
        const tip = HAND_TIPS.indexOf(i);
        // A curled fingertip is drawn hollow. The skeleton is where you check
        // why a cursor vanished, so it has to show the reason.
        const out = tip < 0 || hand.extended?.[tip] === true;
        ctx.beginPath();
        ctx.arc(X(i), Y(i), tip >= 0 ? 3.6 : 2.2, 0, 6.2832);
        if (tip >= 0 && !out) { ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(150,170,200,0.75)'; ctx.stroke(); }
        else { ctx.fillStyle = tip >= 0 ? TINT[tip] : 'rgba(190,205,230,0.85)'; ctx.fill(); }
      }
      // The pinch, drawn as the thing it is: a gap that closes.
      const close = hand.pinch < 0.45;
      ctx.lineWidth = close ? 2.4 : 1.2;
      ctx.strokeStyle = close ? 'rgba(255,255,255,0.95)' : 'rgba(180,196,224,0.45)';
      ctx.setLineDash(close ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(X(4), Y(4)); ctx.lineTo(X(8), Y(8)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // The midpoint of two fingertips, on screen, through the same map the cursors
  // use — so a pinch lands exactly where its two marks meet.
  function screenOf(a, b, W, H, gain) {
    const fx = (a[0] + b[0]) / 2, fy = (a[1] + b[1]) / 2;
    return [clamp(W / 2 + (fx - 0.5) * gain, 0, W), clamp(H / 2 + (fy - 0.5) * gain, 0, H)];
  }

  // WHICH FINGER REACHES. The index if it is out, because that is what people
  // point with. Otherwise, if exactly one finger is out, that one — you were
  // clearly pointing with it. Otherwise none: an open palm or a fist is not
  // aiming at anything, and guessing would be worse than waiting.
  function actingFinger(hand) {
    const ext = hand.extended || [];
    if (ext[INDEX] === true) return INDEX;
    const out = [];
    for (let i = 0; i < HAND_TIPS.length; i++) if (ext[i] === true) out.push(i);
    return out.length === 1 ? out[0] : -1;
  }

  // The hand's half of the tap: the fingertip's offset from its own knuckle,
  // in hand-widths. The ruler is the same bone everything else here measures
  // against, so this means the same thing near the camera and across the room.
  function knocked(hand, h, tipIdx, now) {
    const ruler = Math.hypot(h.points[0][0] - h.points[5][0], h.points[0][1] - h.points[5][1]);
    if (!(ruler > 1e-4)) return false;
    const tip = h.points[HAND_TIPS[tipIdx]], mcp = h.points[MCP[tipIdx]];
    if (!tip || !mcp) return false;
    return knock[hand].push(now, (tip[0] - mcp[0]) / ruler, (tip[1] - mcp[1]) / ruler, (tip[2] - mcp[2]) / ruler);
  }

  function drawCursors(list, dt, now) {
    if (!layer) return;
    const b = document.body.classList;
    const on = b.contains('in-home') && !b.contains('gated');
    layer.classList.toggle('on', on && list.length > 0);
    // THE SECOND LANGUAGE. While the hands are saying something — sizing, or a
    // pair of fingertips in contact — the pointers stand down, so bringing two
    // fingers together to change a colour cannot also press whatever they
    // happened to be over. Any press already open is ended rather than left
    // hanging.
    const shaping = on && twoHand.read(list, now);
    if (!shaping) twoHand.reset();
    layer.classList.toggle('shaping', shaping);
    if (shaping && reach) { for (const key of drove) reach.end(key); drove = new Set(); }

    const W = window.innerWidth, H = window.innerHeight;
    // ONE pixels-per-frame-unit, SET BY THE LONGER SIDE OF THE SCREEN.
    //
    // Both requirements have to hold at once: the same scale on both axes (or a
    // circle drawn in the air lands as an ellipse and the fingers sit in an
    // arrangement the hand is not in), and every corner reachable without
    // sweeping past the edge of the camera frame. Taking the gain from the
    // LONGER side gives that side the full comfortable sweep and the shorter
    // side proportionally less, which is what you want — it is the axis you
    // have less reach on anyway. Sizing from the shorter side instead leaves a
    // wide screen's left and right edges unreachable; sizing from the width
    // alone does the same to a tall one.
    const gain = Math.max(W, H) / (REACH * 2);
    let pinching = false;
    const now_drove = new Set();
    const here = [[], []];          // this frame's fingertip positions, per hand
    let halting = false;

    for (let hand = 0; hand < HANDS; hand++) {
      const h = on ? list[hand] : null;
      const act = h ? actingFinger(h) : -1;
      if (h && h.pinch < 0.45) pinching = true;

      for (let i = 0; i < HAND_TIPS.length; i++) {
        const d = dots[hand][i];
        // EXPLICITLY OUT, not merely "not known to be in". A missing or
        // undefined reading used to show the mark, so anything the extension
        // test could not answer for became a cursor — which is most of how
        // curled fingers kept leaving marks on the screen.
        const shown = !!h && h.extended?.[i] === true && !!h.tips[i];
        d.classList.toggle('out', !shown);
        if (!shown) {
          smooth[hand][i][0].reset(); smooth[hand][i][1].reset();
          d.classList.remove('acting', 'held', 'swiping', 'refused');
          continue;
        }
        const t = h.tips[i];
        const sx = clamp(W / 2 + (t[0] - 0.5) * gain, 0, W);
        const sy = clamp(H / 2 + (t[1] - 0.5) * gain, 0, H);
        const x = smooth[hand][i][0].filter(sx, dt);
        const y = smooth[hand][i][1].filter(sy, dt);
        // translate3d, not left/top: the difference between the compositor
        // moving a layer and the whole page laying out again, ten times a frame.
        d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        here[hand][i] = [x, y];

        // ...but not while a pinch is holding: the held press is driven by how
        // far the HAND has moved, and letting the raw fingertip move the same
        // pointer in the same frame would fight it.
        const acts = i === act && !!reach && !shaping && !holding[hand];
        d.classList.toggle('acting', acts);
        if (acts) {
          const key = keyOf(h, hand);
          now_drove.add(key);
          const p = reach.move(key, x, y, now);
          // THE TAP. Checked after the move so the pointer is already where it
          // should land. The only gate left is the drag: a jolt in the middle
          // of turning the orb is the hand steadying itself, not a click.
          // Nothing else is asked — the old version also demanded the cursor
          // hold still, which rejected the very movement a tap is made of.
          // Remember where this finger was aiming, for the pinch to use.
          const a = aim[hand];
          a.push([now, x, y]);
          while (a.length && now - a[0][0] > 500) a.shift();
          // AND THE TAP LANDS WHERE THEY WERE AIMING. The jab itself moves the
          // fingertip — Colin's travel upward — so sending the press at the
          // cursor's position when the tap completes puts it above the thing
          // that was being tapped. It goes where the finger was before the
          // movement started, which is what the person was pointing at.
          if (!p.down && knocked(hand, h, i, now)) {
            const a = aimOf(hand, now) || [x, y];
            reach.tap(key, a[0], a[1], now);
            flash(d);
          }
          // The hold, drawn as a ring closing around the mark. A dwell with no
          // visible fill is a button that fires for no reason the person can
          // see; with it, the wait is a thing they are doing.
          d.style.setProperty('--dwell', p ? p.dwell.toFixed(3) : '0');
          d.classList.toggle('held', !!p && p.down && !p.swipe);
          d.classList.toggle('swiping', !!p && p.down && p.swipe);
          d.classList.toggle('refused', !!p && p.refused);
        } else {
          d.style.setProperty('--dwell', '0');
          d.classList.remove('held', 'swiping', 'refused');
        }
      }
      // A hand with nothing pointing has no pointer. This is what sends the up
      // when a finger curls mid-drag, rather than letting it time out.
      if (reach && h && act < 0) reach.end(keyOf(h, hand));

      // ---- THE HAND ON THE BODY ------------------------------------------
      if (!h || shaping || !body) { endPinch(hand); wasAt[hand].length = 0; continue; }
      // A PALM HELD UP STOPS IT. An open hand, palm toward the screen, which is
      // what that gesture means everywhere else. It cannot be confused with
      // taking hold of the body to resize it, because when you hold something
      // your palms face EACH OTHER — and it takes priority over everything
      // else this hand might be doing, since a hand saying stop is not also
      // pushing.
      if (h.palm && h.extended?.every?.((v) => v === true)) {
        halting = true;
        endPinch(hand); wasAt[hand].length = 0;
        continue;
      }
      const orb = body.orbPx?.();
      if (!orb || !(orb.r > 0)) continue;
      const onOrb = (px, py) => Math.hypot(px - orb.x, py - orb.y) <= orb.r;

      // A PINCH TAKES HOLD OF A PLACE. Between the thumb and the index, which
      // is where a person's pinch actually is, and only if that place is on
      // the body. Two thresholds so a hand hovering at the line does not grab
      // and let go over and over.
      const grip = (pinched[hand] || holding[hand]) ? h.pinch < PINCH_OFF : h.pinch < PINCH_ON;
      const pt = h.tips[0] && h.tips[1] ? screenOf(h.tips[0], h.tips[1], W, H, gain) : null;
      if (grip && pt && (pinched[hand] || onOrb(pt[0], pt[1]))) {
        if (!pinched[hand]) pinched[hand] = !!body.pinchAt?.(hand, pt[0], pt[1]);
        if (pinched[hand]) body.pinchTo?.(hand, pt[0], pt[1]);
        wasAt[hand].length = 0;          // a pinching hand does not also turn it
        continue;
      }
      // A PINCH ANYWHERE ELSE IS A PRESS, AND IT IS HELD.
      //
      // Held, not tapped, because half the things worth pointing at are dragged
      // rather than clicked: the budget slider, the wordmark's spin, the four
      // collapse arrows. A press that stays down until the fingers open answers
      // all of those the way a mouse does, and a press-and-release in one place
      // still produces the click a plain button wants — so one gesture covers
      // both and the hand never has to know which kind of thing it is over.
      //
      // It is reliable for a structural reason: a pinch is a DISTANCE between
      // two landmarks, true or false on a single frame. The tap is a shape
      // drawn over time against a hand sampled twenty times a second, so it is
      // the one that sometimes misses. Both end in the same press.
      //
      // On the body a pinch already means take hold of it, so this is
      // everywhere else — which is where the things you press actually live.
      if (grip && reach && act >= 0 && pt) {
        const key = keyOf(h, hand);
        if (!holding[hand]) {
          // PRESS WHERE THEY WERE AIMING, not where the finger is now: closing
          // a pinch pulls the index down toward the thumb, so a press sent at
          // that instant lands below the thing they were pointing at.
          const a = aimOf(hand, now) || here[hand][act];
          if (a && reach.holdAt(key, a[0], a[1], now)) {
            holding[hand] = { aim: a, grip: pt };
            flash(dots[hand][act]);
          } else { holding[hand] = { aim: null, grip: pt }; }
        } else if (holding[hand].aim) {
          // ...and drag by how far the HAND has moved since, so the press stays
          // anchored where it landed instead of sliding as the fingers settle.
          const g = holding[hand];
          reach.move(key, g.aim[0] + (pt[0] - g.grip[0]), g.aim[1] + (pt[1] - g.grip[1]), now);
        }
        wasAt[hand].length = 0;          // a pinching hand does not also turn it
        continue;
      }
      if (holding[hand]) { reach.letGo(keyOf(h, hand)); holding[hand] = null; }
      endPinch(hand);

      // EVERY FINGERTIP ON THE BODY PUSHES IT. Their movements are SUMMED, so
      // five fingers sweeping one way and two sweeping the other leave it
      // turning the first way and slower — which is what would happen to a real
      // object, and is why they are not averaged.
      for (let i = 0; i < HAND_TIPS.length; i++) {
        const at = here[hand][i];
        const prev = wasAt[hand][i];
        if (!at) { wasAt[hand][i] = null; continue; }
        if (prev && onOrb(at[0], at[1])) body.handSpin?.(at[0] - prev[0], at[1] - prev[1]);
        wasAt[hand][i] = [at[0], at[1]];
      }
    }
    body?.halt?.(halting);
    layer.classList.toggle('halting', halting);
    // Anything driven last frame and not this one has gone: end it now.
    if (reach) for (const key of drove) if (!now_drove.has(key)) reach.end(key);
    drove = now_drove;
    layer.classList.toggle('pinching', pinching);
  }

  // Where the acting finger was pointing AIM_BACK_MS ago, or the oldest thing
  // we still remember if it has not been up that long.
  function aimOf(hand, now) {
    const h = aim[hand];
    for (let i = h.length - 1; i >= 0; i--) if (now - h[i][0] >= AIM_BACK_MS) return [h[i][1], h[i][2]];
    return h.length ? [h[0][1], h[0][2]] : null;
  }

  function flash(d) {
    if (!d) return;
    d.classList.add('knock');
    setTimeout(() => d.classList.remove('knock'), 180);
  }

  function endPinch(hand) {
    if (!pinched[hand]) return;
    pinched[hand] = false;
    // Letting go does not snap: the body eases back out of the stretch on its
    // own clock, which is what an elastic thing does.
    body?.pinchEnd?.(hand);
  }

  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60;
    lastT = now;

    let list = [];
    try {
      const s = perceive?.snapshot?.();
      list = (s?.hands || []).filter((h) => h && h.ok && h.points && h.points.length >= 21).slice(0, HANDS);
    } catch { list = []; }

    drawSkeleton(list);
    drawCursors(list, dt, now);
    // The liveness sweep, every frame. This is what guarantees a drag is always
    // ended — a hand that vanishes between frames sends nothing, and without
    // this the orb would stay stuck mid-spin forever.
    reach?.sweep(now);
  }

  return {
    start() {
      build();
      if (running) return;
      running = true; lastT = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ctx && canvas && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
      layer?.classList.remove('on', 'pinching');
      endPinch(0); endPinch(1);
      holding[0] = holding[1] = null;
      aim[0].length = 0; aim[1].length = 0;
      body?.halt?.(false);
      wasAt[0].length = 0; wasAt[1].length = 0;
      for (const hand of smooth) for (const f of hand) { f[0].reset(); f[1].reset(); }
      drove = new Set();
      twoHand.reset();
      // Everything up, now: a switch turned off mid-drag must not leave a
      // pointer down somewhere.
      reach?.clear();
    },
    sync(on) { if (on) this.start(); else this.stop(); },
  };
}
