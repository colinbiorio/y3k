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
    // the rail runs at 0.7x — post stays big as the featured action
    ['nav-profile', () => ({ shape: 'blobs', size: 39 })],
    ['nav-feed', () => ({ shape: 'bars', size: 39 })],
    ['nav-post', () => ({ shape: 'plus', size: 72 })],
    ['nav-live', () => ({ shape: 'broadcast', size: 39 })],
    ['nav-search', (el) => ({ svgEl: svgOf(el), size: 39, thicken: 1.35 })],
    ['nav-orb', () => ({ shape: 'ring', size: 40 })],
    // stiffer liquid on the small-featured glyphs: the camera wedge melts past
    // recognition at full waviness
    ['broadcast', (el) => ({ svgEl: el.querySelector('.bc-camera'), size: 52, viscosity: 1.7 })],
    ['chat-voice', (el) => ({ svgEl: svgOf(el), size: 44 })],
    ['chat-camera', (el) => ({ svgEl: svgOf(el), size: 44 })],
    // aspect-aware now, so `size` is the mark's HEIGHT: 140 tall × 1.7 = a
    // 239px-wide mark, twice the old square-baked 120px one
    ['brain-toggle', (el) => ({ imageEl: el.querySelector('img'), size: 140, aspect: 1663 / 975, viscosity: 1.8, thicken: 1.5, rim: 0.03, ss: 1.8 })],
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
    // THE CHAT PILL: a solid metal stadium sized to the menu's footprint.
    // While the chat is hovered/open, its interior dispels into the border —
    // the metal drains into a ring as the box, mic, +, and camera surface.
    const chatEl = document.getElementById('chat');
    const menuEl = document.querySelector('#chat .chat-menu');
    const toggle = document.getElementById('chat-toggle');
    if (chatEl && menuEl && toggle) {
      mount(toggle, {
        shape: 'pill', track: true, trackTarget: menuEl, hollowEl: chatEl,
        viscosity: 1.2, band: 0.25, framePx: 6, popIntensity: 1.2, seed: 91.7,
      });
    }
    // liquid frames: thin mercury rings that hug live elements through every
    // size state; they flow + take the blade but never clump/pop (not buttons).
    // Thin rings shred if the liquid is loose — they run stiff (viscosity).
    // (The text box carries NO ring of its own — the pill's border is the one.)
    const frame = (el, seed, framePx = 6) => el && mount(el, { shape: 'frame', size: 60, track: true, interactive: false, viscosity: 2.2, seed, framePx });
    frame(document.querySelector('#chat .chat-box'), 47.3, 3);    // around "say something" — hairline (hover only)
    frame(document.getElementById('chat-upload'), 63.9, 3);       // around the + — hairline
    // ...and the + itself is metal
    const up = document.getElementById('chat-upload');
    if (up) mount(up, { shape: 'plus', size: 15, viscosity: 1.3, seed: 58.1 });
    // THE WORDMARK: cast in the same metal. The png is only the shape source —
    // stiff liquid (it's type: it should breathe, not wobble) and no clump/pop.
    const brand = document.getElementById('home-brand');
    const brandImg = document.getElementById('home-brand-img');
    if (brand && brandImg) {
      mount(brand, {
        imageEl: brandImg, aspect: 2048 / 699, size: brand.clientHeight || 84,
        // cursive strokes are hairlines: they need body to read as poured
        // metal, a near-frozen silhouette (a warp as wide as the stroke tears
        // the letters apart — type doesn't distort), and extra sampling for
        // the fine curves. The reflections still crawl: that's the life.
        thicken: 1.7, rim: 0.022, flowSpeed: 0.12, viscosity: 3, ss: 1.8,
        interactive: false, seed: 12.9,
      });
    }
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
