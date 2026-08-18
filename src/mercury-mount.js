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
    ['nav-settings', (el) => ({ svgEl: svgOf(el), size: 49 })],
    ['nav-profile', () => ({ shape: 'blobs', size: 55 })],
    ['nav-feed', () => ({ shape: 'bars', size: 55 })],
    ['nav-live', () => ({ shape: 'broadcast', size: 55 })],
    ['nav-post', () => ({ shape: 'plus', size: 55 })],
    ['nav-search', (el) => ({ svgEl: svgOf(el), size: 55, thicken: 1.35 })],
    ['nav-orb', () => ({ shape: 'ring', size: 57 })],
    // stiffer liquid on the small-featured glyphs: the camera wedge melts past
    // recognition at full waviness
    ['broadcast', (el) => ({ svgEl: el.querySelector('.bc-camera'), size: 52, viscosity: 1.7 })],
    // the chat button is a WIDE bubble sized to the expanded menu's footprint,
    // so hover swaps bubble → pill in place
    ['chat-toggle', () => ({ shape: 'bubblewide', size: 138, aspect: 3.17, popIntensity: 1.2, viscosity: 1.1 })],
    ['chat-voice', (el) => ({ svgEl: svgOf(el), size: 44 })],
    ['chat-camera', (el) => ({ svgEl: svgOf(el), size: 44 })],
    ['brain-toggle', (el) => ({ imageEl: el.querySelector('img'), size: 120, viscosity: 1.4, thicken: 2.2 })],
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
  if (mounted) {
    // the liquid frame around the chat box: tracks the menu through its
    // hover-pill and full-width typing states; flows + takes the blade, but
    // never clumps/pops (it is not a button)
    const menu = document.querySelector('#chat .chat-menu');
    if (menu) mount(menu, { shape: 'frame', size: 60, track: true, interactive: false, viscosity: 1.5, seed: 91.7 });
  }
  return mounted > 0;
}
