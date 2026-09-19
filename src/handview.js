// ============================================================================
// handview.js — SHOWING THE HAND.
//
// Two drawings, and they answer two different questions.
//
// THE SKELETON, over the camera preview: "does it see me?" Twenty-one dots and
// twenty-one bones laid on the video. This is not decoration. A tracker with no
// visible state is a thing you have to take on faith, and when it fails — bad
// light, hand edge-on, out of frame — the person has no way to tell whether the
// machine lost them or the feature is broken. With the skeleton on, the failure
// explains itself and they move their hand.
//
// THE CURSORS, on the screen: "where am I pointing?" One soft mark per
// fingertip, at the place that finger maps to. Note what this deliberately is
// NOT: it does not click anything. A free-air cursor aimed at 44px glyphs is a
// genuinely bad interaction — landmark jitter is several pixels at arm's
// length, there is no surface to rest against, and an unsupported arm tires in
// under a minute. That is not a tuning problem and polish will not fix it. The
// fix is magnetic targeting — snapping to things rather than aiming at pixels —
// and it is its own piece of work. Until then these marks show the tracking and
// nothing more, which is an honest thing for them to be.
//
// Both are pulls off perceive's snapshot, on our own frame loop. Nothing here
// can stall perception and perception cannot stall this.
// ============================================================================

import { createOneEuro } from './euro.js';
import { HAND_BONES, HAND_TIPS } from './perceive.js';

// THE REACHABLE BOX, AS ONE HALF-EXTENT — not a rectangle with its own x and y
// spans. Two different gains stretch the axes by different amounts, so the five
// marks sit in an arrangement the hand is not in: the spread from index to
// pinky comes out wider than it is, and a circle drawn in the air lands as an
// ellipse. "Accurate screen location" has to mean the same scale both ways.
// The box is centred and square in FRAME units, then mapped to the viewport's
// shorter side so nothing is squashed, with the longer side free to overshoot
// and clamp — which is the axis a hand has the least reach on anyway.
const REACH = 0.32;   // half-width of the reachable square, in frame units

// Fingertip colours, thumb to pinky. The index leads because it is the one
// people point with, and the thumb matches it because those two are the pinch.
const TINT = ['#cdd6ff', '#ffffff', '#b9c6dd', '#b9c6dd', '#b9c6dd'];
const SIZE = [30, 38, 24, 22, 20];

export function createHandView({ perceive, popup, video } = {}) {
  let raf = 0, running = false;
  let canvas = null, ctx = null;
  let layer = null;
  const dots = [];
  // One filter per axis per finger. A cursor is the most jitter-visible thing
  // on the screen — it is small, it is high contrast, and the eye tracks it —
  // so it gets the same treatment the head does rather than a lerp.
  const smooth = HAND_TIPS.map(() => [createOneEuro({ minCutoff: 1.2, beta: 0.35 }), createOneEuro({ minCutoff: 1.2, beta: 0.35 })]);
  let lastT = 0;

  function build() {
    if (canvas || !popup) return;
    // A CHILD, never a re-parenting. The popup already carries a mounted ring
    // and the video; we add one canvas over the top of them and touch neither.
    canvas = document.createElement('canvas');
    canvas.className = 'hand-skel';
    canvas.setAttribute('aria-hidden', 'true');
    popup.appendChild(canvas);
    ctx = canvas.getContext('2d');

    layer = document.createElement('div');
    layer.id = 'hand-cursors';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < HAND_TIPS.length; i++) {
      const d = document.createElement('i');
      d.className = 'hand-dot';
      d.style.setProperty('--tint', TINT[i]);
      d.style.setProperty('--size', SIZE[i] + 'px');
      layer.appendChild(d);
      dots.push(d);
    }
    document.body.appendChild(layer);
  }

  // The preview is CSS-mirrored (scaleX(-1)) so it reads as a selfie, and
  // perceive already hands out viewer-space points — so a viewer-space x maps
  // STRAIGHT onto the displayed pixel. The two mirrors cancel. Do not add a
  // third one here; that is how this ends up backwards.
  function drawSkeleton(hand) {
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
    if (!hand) return;

    const P = hand.points;
    // OBJECT-FIT: COVER, REPRODUCED IN THE MATHS. #cam is object-fit: cover and
    // a canvas has no such property, so the crop has to be done here or the
    // skeleton lands beside the hand. camera.js asks for 640x480 as an IDEAL,
    // which a camera is free to miss: a 16:9 webcam in this 4:3 box loses about
    // an eighth of its width off EACH side, and the naive map is then exact in
    // the middle and ~19px out at the edge of a 186px preview — wrong in the
    // way that looks like it nearly works.
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;              // between tracks: draw nothing rather than draw it wrong
    const k = Math.max(w / vw, h / vh);  // cover: fill both axes, crop the excess
    const dw = vw * k, dh = vh * k, ox = (w - dw) / 2, oy = (h - dh) / 2;
    const X = (i) => ox + P[i][0] * dw, Y = (i) => oy + P[i][1] * dh;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Two passes: a wide dark stroke first so the skeleton survives a bright
    // background, then the bright line on top of it. A single stroke vanishes
    // against a window or a lamp, which is exactly when someone is looking at
    // this to work out why tracking is poor.
    for (const pass of [{ w: 4.5, c: 'rgba(0,0,0,0.55)' }, { w: 1.8, c: 'rgba(233,240,255,0.92)' }]) {
      ctx.lineWidth = pass.w; ctx.strokeStyle = pass.c;
      ctx.beginPath();
      for (const [a, b] of HAND_BONES) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
      ctx.stroke();
    }
    for (let i = 0; i < P.length; i++) {
      const tip = HAND_TIPS.indexOf(i);
      ctx.beginPath();
      ctx.arc(X(i), Y(i), tip >= 0 ? 3.6 : 2.2, 0, 6.2832);
      ctx.fillStyle = tip >= 0 ? TINT[tip] : 'rgba(190,205,230,0.85)';
      ctx.fill();
    }
    // The pinch, drawn as the thing it is: a gap that closes. Nothing else on
    // screen says what the threshold is, so the line says it.
    const close = hand.pinch < 0.45;
    ctx.lineWidth = close ? 2.4 : 1.2;
    ctx.strokeStyle = close ? 'rgba(255,255,255,0.95)' : 'rgba(180,196,224,0.45)';
    ctx.setLineDash(close ? [] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(X(4), Y(4)); ctx.lineTo(X(8), Y(8)); ctx.stroke();
    ctx.setLineDash([]);
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function drawCursors(hand, dt) {
    if (!layer) return;
    const b = document.body.classList;
    const show = !!hand && b.contains('in-home') && !b.contains('gated');
    layer.classList.toggle('on', show);
    if (!show) { for (const f of smooth) { f[0].reset(); f[1].reset(); } return; }

    const W = window.innerWidth, H = window.innerHeight;
    // ONE pixels-per-frame-unit for both axes, taken from the shorter side.
    const gain = Math.min(W, H) / (REACH * 2);
    for (let i = 0; i < HAND_TIPS.length; i++) {
      const t = hand.tips[i];
      if (!t) continue;
      const sx = clamp(W / 2 + (t[0] - 0.5) * gain, 0, W);
      const sy = clamp(H / 2 + (t[1] - 0.5) * gain, 0, H);
      const x = smooth[i][0].filter(sx, dt);
      const y = smooth[i][1].filter(sy, dt);
      // translate3d, not left/top: this is the difference between the compositor
      // moving a layer and the whole page laying out again, five times a frame.
      dots[i].style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    layer.classList.toggle('pinching', hand.pinch < 0.45);
  }

  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60;
    lastT = now;

    let hand = null;
    try {
      const s = perceive?.snapshot?.();
      const h = s?.hands?.[0];
      if (h && h.ok && h.points && h.points.length >= 21) hand = h;
    } catch { hand = null; }

    drawSkeleton(hand);
    drawCursors(hand, dt);
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
      for (const f of smooth) { f[0].reset(); f[1].reset(); }
    },
    // The view follows the switch, not the other way round: it draws only while
    // hands are actually being tracked, so there is never a skeleton on screen
    // for a model that is not loaded.
    sync(on) { if (on) this.start(); else this.stop(); },
  };
}
