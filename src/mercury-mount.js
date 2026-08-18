// Mounts the liquid mercury SDF system (mercury-buttons.js) onto every app
// button. Each button becomes its own body of liquid with its own particle
// physics: the cursor slices INTO the metal (and it heals), a click clumps,
// pops into droplets, and reforms. Presets cover the shapes the shader knows
// analytically; everything else rides the raster→SDF pipeline from the very
// svg/img glyph already inside the button (which the CSS then hides).
import { mount } from './mercury-buttons.js';

export function mountAppMercury() {
  const $ = (id) => document.getElementById(id);
  const svgOf = (el) => (el ? el.querySelector('svg') : null);
  const plans = [
    ['nav-settings', (el) => ({ svgEl: svgOf(el), size: 38 })],
    ['nav-profile', () => ({ shape: 'blobs', size: 42 })],
    ['nav-feed', () => ({ shape: 'bars', size: 42 })],
    ['nav-live', () => ({ shape: 'broadcast', size: 42 })],
    ['nav-post', () => ({ shape: 'plus', size: 42 })],
    ['nav-search', (el) => ({ svgEl: svgOf(el), size: 42 })],
    ['nav-orb', () => ({ shape: 'ring', size: 44 })],
    ['broadcast', (el) => ({ svgEl: el.querySelector('.bc-camera'), size: 40 })],
    ['chat-toggle', () => ({ shape: 'bubble', size: 132, popIntensity: 1.2 })],
    ['chat-voice', (el) => ({ svgEl: svgOf(el), size: 34 })],
    ['chat-camera', (el) => ({ svgEl: svgOf(el), size: 34 })],
    ['brain-toggle', (el) => ({ imageEl: el.querySelector('img'), size: 92, viscosity: 1.4 })],
  ];
  let mounted = 0;
  for (let i = 0; i < plans.length; i++) {
    const [id, plan] = plans[i];
    const el = $(id);
    if (!el) continue;
    // deterministic per-button seed: unique identity, stable across loads
    const h = mount(el, { ...plan(el), seed: (i + 1) * 7.31 });
    if (!h) return false; // no WebGL2 → the caller falls back wholesale
    mounted++;
  }
  return mounted > 0;
}
