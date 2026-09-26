// Liquid mercury button physics.
//
// Every .mercury button is a bare chrome glyph (the look lives in CSS + the
// shared SVG gradient/turbulence filter). This module gives them the LIQUID:
//
// FLOW — the metal never sits still. The shared #merc-liquid turbulence drifts
// continuously, driven by summed incommensurate sines (their periods never
// realign, so the motion doesn't loop). One filter feeds every glyph, updated
// at ~30fps; honored off under prefers-reduced-motion.
//
// TOUCH — the blob only moves where your cursor actually touches the shape:
// inside the button, the contact point drags the surface toward itself (a lean
// + a stretch along the pull axis, growing toward the edges, neutral at dead
// center). Leave the shape and it relaxes back. Click and it snaps home and
// POPS (the CSS merc-pop squash-and-settle rides `scale`, composing with the
// lean's `transform`).

import { due } from './pace.js';

const PULL = 0.34;     // how far the surface follows the contact point
const STRETCH = 0.30;  // elongation along the pull axis at the very edge
const TOUCH_PAD = 3;   // px of forgiveness around the shape's box

export function initMercury() {
  const els = [...document.querySelectorAll('.mercury')];
  if (!els.length) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- FLOW: the never-still, never-looping surface --------------------------
  // Both filters flow: the standard one and the thick variant (the univispira).
  // Values live in the glyphs' 2x-rendered space; incommensurate sine sums
  // never realign, so the motion genuinely doesn't loop.
  const rigs = [
    { noise: document.getElementById('merc-noise'), disp: document.getElementById('merc-disp'), ph: 0 },
    { noise: document.getElementById('merc-noise2'), disp: document.getElementById('merc-disp2'), ph: 2.4 },
  ].filter((r) => r.noise && r.disp);
  // THE FLOW STOPS, not skips, whenever it has nothing worth animating. Each
  // attribute write re-rasterizes every glyph's SVG filter chain on the CPU —
  // turbulence, displacement, two lightings, a blur — and this path is only
  // ever running on the weakest machines (no WebGL2 at all). So:
  //   · body.merc-gl: the WebGL glyphs are drawing and the SVGs are hidden;
  //   · the graphics tier is low or smooth, or motion is 'less' (gfx.js /
  //     boot-gfx.js set these on <html>): the liquid holds still there, and
  //     the filter keeps the frame it last had.
  // It used to keep a rAF alive forever even with merc-gl on. Now the loop
  // ends, and a y3k:gfx change that allows flow again restarts it.
  const calm = () => {
    const d = document.documentElement.dataset;
    return document.body.classList.contains('merc-gl')
      || d.gfx === 'low' || d.gfx === 'smooth' || d.motion === 'less';
  };
  if (rigs.length && !reduced) {
    let frame = 0, running = false;
    const flow = (now) => {
      if (calm()) { running = false; return; }
      requestAnimationFrame(flow);
      if (!due(now)) return;   // pace.js: the vsyncs every loop draws on
      // Every other drawn frame is plenty — turbulence regen isn't free.
      if ((frame++ & 1) === 0) {
        const t = now / 1000;
        for (const rig of rigs) {
          const p = rig.ph;
          const fx = 0.013 + 0.005 * Math.sin(t * 0.97 + p) + 0.0035 * Math.sin(t * 1.71 + p);
          const fy = 0.0155 + 0.005 * Math.sin(t * 1.31 + 1.7 + p) + 0.0035 * Math.sin(t * 2.09 + p);
          const sc = 4.6 + 1.9 * Math.sin(t * 0.77 + 0.9 + p) + 1.1 * Math.sin(t * 2.41 + p);
          rig.noise.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
          rig.disp.setAttribute('scale', sc.toFixed(2));
        }
      }
    };
    // The loop's first frame asks calm() itself, so a tier change is judged by
    // what <html> says a frame later — never by whether gfx.js happened to set
    // the attribute before or after it sent the event.
    const start = () => { if (!running) { running = true; requestAnimationFrame(flow); } };
    window.addEventListener('y3k:gfx', start);
    start();
  }

  // --- TOUCH: contact-only pull ----------------------------------------------
  let mx = -1e4, my = -1e4;
  let raf = 0;
  const tick = () => {
    raf = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width) { if (el.style.transform) el.style.transform = ''; continue; }
      const inside = mx >= r.left - TOUCH_PAD && mx <= r.right + TOUCH_PAD
        && my >= r.top - TOUCH_PAD && my <= r.bottom + TOUCH_PAD;
      if (!inside) { if (el.style.transform) el.style.transform = ''; continue; }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = mx - cx, dy = my - cy;
      // How far off dead-center the contact is, 0..1 — the middle barely moves,
      // the rim follows the finger.
      const nx = dx / (r.width / 2 + TOUCH_PAD), ny = dy / (r.height / 2 + TOUCH_PAD);
      const pull = Math.min(1, Math.hypot(nx, ny));
      const ang = Math.atan2(dy, dx);
      const tx = dx * PULL, ty = dy * PULL;
      const sx = 1 + pull * STRETCH, sy = 1 - pull * STRETCH * 0.55;
      el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${ang}rad) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${-ang}rad)`;
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };

  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; schedule(); }, { passive: true });
  window.addEventListener('pointerdown', () => schedule(), { passive: true });
  // The cursor leaving the window releases every blob.
  document.addEventListener('pointerleave', () => { mx = my = -1e4; schedule(); });

  // Click: snap home and pop. The animation rides `scale` (not transform), so
  // it composes with — and visually overrides — the lean for its 0.4s.
  for (const el of els) {
    el.addEventListener('click', () => {
      el.style.transform = '';
      el.classList.remove('merc-pop');
      void el.offsetWidth; // restart the animation even on rapid clicks
      el.classList.add('merc-pop');
      setTimeout(() => el.classList.remove('merc-pop'), 450);
    });
  }
}
