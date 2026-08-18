// Mounts the liquid mercury SDF system (mercury-buttons.js) onto every app
// button. Each button becomes its own body of liquid with its own particle
// physics: the cursor slices INTO the metal (and it heals), a click clumps,
// pops into droplets, and reforms. Presets cover the shapes the shader knows
// analytically; everything else rides the raster→SDF pipeline from the very
// svg/img glyph already inside the button (which the CSS then hides).
import { mount } from './mercury-buttons.js';

// The chat surfaces wear the room's own material: the walls' cool-graphite
// albedo (rgb v, v+2, v+6 — body.js panelTexture) under fine vertical brushed
// grain (body.js brushedRoughnessTexture), with the room's top-lit falloff —
// but NO machined seams. Rendered once to a canvas, applied as CSS background.
function brushedWallSkin() {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgb(52,55,62)');
  grad.addColorStop(0.45, 'rgb(44,47,53)');
  grad.addColorStop(1, 'rgb(33,35,40)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x++) {
    const v = 40 + Math.floor(Math.random() * 26);
    g.strokeStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.globalAlpha = 0.10 + Math.random() * 0.22;
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke();
  }
  g.globalAlpha = 1;
  return c.toDataURL('image/png');
}

export function mountAppMercury() {
  const $ = (id) => document.getElementById(id);
  const svgOf = (el) => (el ? el.querySelector('svg') : null);
  const plans = [
    ['nav-settings', (el) => ({ svgEl: svgOf(el), size: 49 })],
    ['nav-profile', () => ({ shape: 'blobs', size: 55 })],
    ['nav-feed', () => ({ shape: 'bars', size: 55 })],
    ['nav-post', () => ({ shape: 'plus', size: 72 })],
    ['nav-live', () => ({ shape: 'broadcast', size: 55 })],
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
    // liquid frames: thin mercury rings that hug live elements through every
    // size state; they flow + take the blade but never clump/pop (not buttons).
    // Thin rings shred if the liquid is loose — they run stiff (viscosity).
    const frame = (el, seed, framePx = 6) => el && mount(el, { shape: 'frame', size: 60, track: true, interactive: false, viscosity: 2.2, seed, framePx });
    frame(document.querySelector('#chat .chat-menu'), 91.7);      // around the whole pill
    frame(document.querySelector('#chat .chat-box'), 47.3, 3);    // around "say something" — hairline
    frame(document.getElementById('chat-upload'), 63.9, 3);       // around the + — hairline
    // ...and the + itself is metal
    const up = document.getElementById('chat-upload');
    if (up) mount(up, { shape: 'plus', size: 15, viscosity: 1.3, seed: 58.1 });
    // the purple glass gives way to the room's brushed metal (grain is vertical,
    // so repeat-x survives any width the box grows to)
    const skin = brushedWallSkin();
    for (const sel of ['#chat .chat-menu', '#chat .chat-box']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      el.style.background = `url(${skin}) left top / auto 100% repeat-x`;
      el.style.backdropFilter = 'none';
    }
  }
  return mounted > 0;
}
