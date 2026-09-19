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

// THE REACHABLE BOX, AS ONE HALF-EXTENT — not a rectangle with its own x and y
// spans. Two different gains stretch the axes by different amounts, so the
// marks sit in an arrangement the hand is not in: a circle drawn in the air
// would land as an ellipse. The box is square in FRAME units and maps to the
// viewport's shorter side, with the longer side free to overshoot and clamp.
const REACH = 0.32;

// Fingertip colours and sizes, thumb to pinky. The index leads because it is
// the one people point with; the thumb matches it because those two are the
// pinch.
const TINT = ['#cdd6ff', '#ffffff', '#b9c6dd', '#b9c6dd', '#b9c6dd'];
const SIZE = [30, 38, 24, 22, 20];
const HANDS = 2;
const INDEX = 1;            // where the index finger sits in TIPS

export function createHandView({ perceive, reach, popup, video } = {}) {
  let raf = 0, running = false;
  let canvas = null, ctx = null, layer = null;
  // [hand][finger] — one mark and one pair of filters each. A finger that is
  // still must stay still while another moves, so they never share state.
  const dots = [], smooth = [];
  let lastT = 0;

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
        const out = tip < 0 || hand.extended?.[tip] !== false;
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

  // WHICH FINGER REACHES. The index if it is out, because that is what people
  // point with. Otherwise, if exactly one finger is out, that one — you were
  // clearly pointing with it. Otherwise none: an open palm or a fist is not
  // aiming at anything, and guessing would be worse than waiting.
  function actingFinger(hand) {
    const ext = hand.extended || [];
    if (ext[INDEX]) return INDEX;
    const out = [];
    for (let i = 0; i < HAND_TIPS.length; i++) if (ext[i]) out.push(i);
    return out.length === 1 ? out[0] : -1;
  }

  function drawCursors(list, dt, now) {
    if (!layer) return;
    const b = document.body.classList;
    const on = b.contains('in-home') && !b.contains('gated');
    layer.classList.toggle('on', on && list.length > 0);

    const W = window.innerWidth, H = window.innerHeight;
    // ONE pixels-per-frame-unit for both axes, taken from the shorter side.
    const gain = Math.min(W, H) / (REACH * 2);
    let pinching = false;

    for (let hand = 0; hand < HANDS; hand++) {
      const h = on ? list[hand] : null;
      const act = h ? actingFinger(h) : -1;
      if (h && h.pinch < 0.45) pinching = true;

      for (let i = 0; i < HAND_TIPS.length; i++) {
        const d = dots[hand][i];
        const shown = !!h && h.extended?.[i] !== false && !!h.tips[i];
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

        const acts = i === act && !!reach;
        d.classList.toggle('acting', acts);
        if (acts) {
          const p = reach.move('hand' + hand, x, y, now);
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
      if (reach && act < 0) reach.end('hand' + hand);
    }
    layer.classList.toggle('pinching', pinching);
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
      for (const hand of smooth) for (const f of hand) { f[0].reset(); f[1].reset(); }
      // Everything up, now: a switch turned off mid-drag must not leave a
      // pointer down somewhere.
      reach?.clear();
    },
    sync(on) { if (on) this.start(); else this.stop(); },
  };
}
