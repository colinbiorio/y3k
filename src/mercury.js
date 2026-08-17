// Liquid mercury button physics.
//
// Every .mercury button is a bare chrome glyph (the look lives in CSS + the
// shared SVG gradient/turbulence filter). This module gives them the LIQUID:
// when the cursor comes near, the blob leans and stretches toward it — pulled
// like a droplet — and on click it snaps back and POPS (the CSS merc-pop
// squash-and-settle). Transforms only, computed once per animation frame, so
// the whole effect stays on the GPU.

const REACH = 110;       // px — how far the pull field extends beyond the button
const PULL = 0.30;       // how far the blob leans toward the cursor (of the distance)
const STRETCH = 0.26;    // how much it elongates along the pull axis at full pull

export function initMercury() {
  const els = [...document.querySelectorAll('.mercury')];
  if (!els.length) return;

  let mx = -1e4, my = -1e4;
  let raf = 0;
  const tick = () => {
    raf = 0;
    for (const el of els) {
      // Skip hidden buttons (their rects are empty) and mid-pop buttons (the
      // pop animation owns `scale`; transform stays free for the lean).
      const r = el.getBoundingClientRect();
      if (!r.width) { el.style.transform = ''; continue; }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = mx - cx, dy = my - cy;
      const d = Math.hypot(dx, dy);
      const reach = REACH + r.width / 2;
      if (d > reach) { if (el.style.transform) el.style.transform = ''; continue; }
      // Eased pull: nothing at the edge of the field, full at the surface.
      const pull = Math.pow(1 - d / reach, 1.6);
      const ang = Math.atan2(dy, dx);
      const tx = dx * pull * PULL, ty = dy * pull * PULL;
      const sx = 1 + pull * STRETCH, sy = 1 - pull * STRETCH * 0.55;
      // Lean toward the cursor, stretch along that axis (rotate → scale → unrotate).
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
