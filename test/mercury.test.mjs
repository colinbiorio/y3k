// The liquid glyphs (src/mercury-*.js) — what the smooth work promised and must
// keep. Run: node test/mercury.test.mjs
//
// Most of mercury lives behind WebGL and the DOM, so most of what can go wrong
// is caught in a browser (scripts/code-smoke.mjs). What CAN run here runs as
// behaviour: the startup bake against the transform it replaced, byte for
// byte; the quality profile's mapping; the border's hover band; the bake
// height. The rest are guards on source text for promises that are one line
// each and easy to undo by accident (the pacer's order, dt never negative,
// the prime pass owning no clock, the depth buffer, no polling).

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const MB = read('src/mercury-buttons.js');
const MOUNT = read('src/mercury-mount.js');

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// A slice of the module's source, from one marker up to (not including) the next.
const slice = (src, from, to) => {
  const a = src.indexOf(from), z = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && z > a, `markers not found: ${from} … ${to}`);
  return src.slice(a, z);
};

// The quality profile reaches the module through a sink and through the y3k:gfx
// event. A stand-in window catches the listener and the console handle.
const heard = {};
globalThis.window = { addEventListener: (t, f) => { heard[t] = f; } };
const merc = await import('../src/mercury-buttons.js');
const Q = () => ({ ...window.__merc.quality });

console.log('\nthe startup bake:');

// The 8SSEDT as it was before the bake was sliced and cached (b4e3b4f), kept
// here verbatim in logic as the reference the new one must equal to the byte.
function referenceSDF(alpha, w, h, rangeY) {
  const INF = 1e9;
  const mask = new Float64Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i] / 255;
  const mk = (inside) => {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const on = inside ? mask[i] > 0.5 : mask[i] <= 0.5; gx[i] = on ? 0 : INF; gy[i] = on ? 0 : INF; }
    const compare = (x, y, ox, oy) => {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx, i = y * w + x;
      const cx = gx[j] + ox, cy = gy[j] + oy;
      if (cx * cx + cy * cy < gx[i] * gx[i] + gy[i] * gy[i]) { gx[i] = cx; gy[i] = cy; }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) { compare(x, y, -1, 0); compare(x, y, 0, -1); compare(x, y, -1, -1); compare(x, y, 1, -1); }
      for (let x = w - 1; x >= 0; x--) compare(x, y, 1, 0);
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) { compare(x, y, 1, 0); compare(x, y, 0, 1); compare(x, y, -1, 1); compare(x, y, 1, 1); }
      for (let x = 0; x < w; x++) compare(x, y, -1, 0);
    }
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    return out;
  };
  const dOut = mk(false), dIn = mk(true);
  const pxPerUnit = h / (2 * rangeY);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const sd = Math.fround(dIn[i] - dOut[i]);
    out[i] = Math.max(0, Math.min(255, 127.5 + ((sd - (mask[i] - 0.5)) / pxPerUnit / 0.6) * 127.5));
  }
  return out;
}

// The new transform, lifted out of the module as it stands. MessageChannel is
// shadowed so its slices yield through setTimeout (an open port would keep
// node alive after the last test).
const SDF_RANGE = Number(/const SDF_RANGE = ([\d.]+);/.exec(MB)[1]);
const { encodeSDF } = new Function('SDF_RANGE', 'MessageChannel',
  slice(MB, 'const EDT_FAR', '// THE BAKES RUN ONE AT A TIME') + '\nreturn { encodeSDF };')(SDF_RANGE, undefined);

await ok('the sliced transform is the old one, to the byte', async () => {
  assert.equal(SDF_RANGE, 0.6, 'the reference encodes with SDF_RANGE 0.6');
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const [W, H] of [[64, 48], [119, 119], [301, 97], [1, 1], [3, 40]]) {
    for (const kind of ['blobs', 'empty', 'full', 'speckle']) {
      const a = new Uint8Array(W * H);
      if (kind === 'full') a.fill(255);
      if (kind === 'speckle') for (let i = 0; i < a.length; i++) a[i] = rnd() < 0.3 ? Math.floor(rnd() * 256) : 0;
      if (kind === 'blobs') {
        for (let k = 0; k < 5; k++) {
          const cx = rnd() * W, cy = rnd() * H, rr = rnd() * Math.min(W, H) * 0.3 + 1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const d = Math.hypot(x - cx, y - cy) - rr;
            if (d < 1) a[y * W + x] = Math.max(a[y * W + x], Math.round(255 * Math.min(1, 1 - d)));
          }
        }
      }
      const want = referenceSDF(a, W, H, 1.7);
      const { px } = await encodeSDF(a, W, H, 1.7);
      assert.equal(px.length, W * H, 'one byte a texel (R8)');
      let diff = 0;
      for (let i = 0; i < want.length; i++) if (want[i] !== px[i]) diff++;
      assert.equal(diff, 0, `${W}x${H} ${kind}: ${diff} texels differ`);
    }
  }
});

await ok('bakes follow the drawn size on desktop, except the hairline marks', () => {
  const bakeHeightFor = new Function('BAKE_H', 'COARSE',
    slice(MB, 'function bakeHeightFor', 'function bakeKeyFor') + '\nreturn bakeHeightFor;')(512, false);
  assert.equal(bakeHeightFor(238), 333, 'a 70px rail glyph at dpr 2: 1.4x its 238 device px');
  assert.equal(bakeHeightFor(60), 128, 'never under 128');
  assert.equal(bakeHeightFor(900), 512, 'never over BAKE_H');
  assert.equal(bakeHeightFor(238, true), 512, 'the cursive and the univispira keep the full bake');
  for (const m of ["['brain-toggle'", 'imageEl: loginLogo', 'imageEl: enterUnivi']) {
    const at = MOUNT.indexOf(m);
    assert.ok(at > 0 && /fullBake: true/.test(MOUNT.slice(at, at + 400)), `${m} keeps fullBake`);
  }
});

await ok('baked bytes are cached across visits under a versioned key, and kept for a context restore', () => {
  assert.ok(/const BAKE_VERSION = \d+;/.test(MB));
  assert.ok(MB.includes("'v' + BAKE_VERSION + '|'"), 'the IndexedDB key carries the version');
  assert.ok(/gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.R8, W, H, 0, gl\.RED, gl\.UNSIGNED_BYTE, px\)/.test(MB), 'R8 upload');
  const restored = slice(MB, "addEventListener('webglcontextrestored'", 'return R;');
  assert.ok(!/bakeBytes|encodeSDF|rasterize/.test(restored), 'a restore re-uploads, it never re-bakes');
  const code = (MB + MOUNT + read('src/mercury.js') + read('src/mercury-gl.js')).replace(/\/\/.*$/gm, '');
  assert.ok(!/requestIdleCallback/.test(code), 'no requestIdleCallback (APPSTORE)');
});

console.log('\nthe quality profile:');

await ok('no call is today: flowing, uncapped, the governor free, borders swell', () => {
  const q = Q();
  assert.deepEqual([q.still, q.cap, q.ssMax, q.octPin, q.ringHover], [false, Infinity, Infinity, 0, true]);
});

await ok('smooth holds the liquid, caps the pixels, pins one octave, stills the borders', () => {
  merc.setMercuryQuality({ tier: 'smooth', liquid: 'still', maxDpr: 1.5, motion: 'less' });
  const q = Q();
  assert.deepEqual([q.still, q.cap, q.ssMax, q.octPin, q.ringHover], [true, 1.5, 1, 1, false]);
});

await ok('low only holds the liquid still; mid and high are today', () => {
  merc.setMercuryQuality({ tier: 'low', liquid: 'still', maxDpr: 1.5 });
  let q = Q();
  assert.deepEqual([q.still, q.cap, q.ssMax, q.octPin, q.ringHover], [true, Infinity, Infinity, 0, true]);
  merc.setMercuryQuality({ tier: 'mid', liquid: 'flow', maxDpr: 2 });
  q = Q();
  assert.deepEqual([q.still, q.cap, q.ssMax, q.octPin, q.ringHover], [false, Infinity, Infinity, 0, true]);
});

await ok('the y3k:gfx event reaches it too, and a bad profile never throws', () => {
  assert.equal(typeof heard['y3k:gfx'], 'function');
  heard['y3k:gfx']({ detail: { tier: 'smooth', liquid: 'still', maxDpr: 1.25 } });
  assert.equal(Q().cap, 1.25);
  heard['y3k:gfx']({ detail: null });
  merc.setMercuryQuality(undefined);
  assert.equal(Q().still, false, 'no profile is the default profile');
  assert.ok(/export \{ setMercuryQuality \} from '\.\/mercury-buttons\.js';/.test(MOUNT), 're-exported for main.js');
});

console.log('\nthe loop:');

await ok('the pacer is asked after re-scheduling; dt is between drawn frames and never negative', () => {
  const frame = slice(MB, 'const frame = (now, schedule = true) => {', 'r.renderNow = () => {');
  assert.ok(/import \{ due \} from '\.\/pace\.js';/.test(MB));
  assert.ok(/requestAnimationFrame\(frame\);[\s\S]{0,400}if \(!due\(now\)\) return;/.test(frame), 'schedule first, then ask');
  assert.ok(frame.includes('Math.max(0, Math.min(0.05, (now - last) / 1000))'), 'dt clamped to [0, 0.05]');
  for (const f of ['src/mercury.js', 'src/mercury-gl.js']) {
    const s = read(f);
    assert.ok(/import \{ due \} from '\.\/pace\.js';/.test(s) && /requestAnimationFrame\((flow|frame)\);\s*if \(!due\(now\)\) return;/.test(s), f);
  }
});

await ok('the prime pass owns no clock and draws only new arrivals', () => {
  const prime = slice(MB, 'r.renderNow = () => {', 'requestAnimationFrame(frame);');
  assert.ok(!/frame\(|r\.fc|last =|frameMs|advanceLiquid|advanceTide/.test(prime.replace(/\/\/.*$/gm, '')), 'no counters, no clocks');
  assert.ok(/pass\(performance\.now\(\), 0, 0, true\)/.test(prime));
  assert.ok(MB.includes('if (prime && (b.drawn || b.stagger < r.primeFrom)) continue;'));
});

await ok('no depth or stencil buffer beside the shared canvas', () => {
  assert.ok(/getContext\('webgl2', \{ alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false \}\)/.test(MB));
});

await ok('frozen means frozen: every body under the still tier, and a tide only while it turns', () => {
  assert.ok(MB.includes('if ((b.still || Q.still) && b.drawn && !active && !b.wasActive && !(MAT_EASE && b.matLive) && !tideWake) continue;'));
  assert.ok(MB.includes('const tideWake = TIDE.moving && !Q.still;'));
  assert.ok(MB.includes('if (active || !Q.still) b.clock += flowMs;'), 'the flow clock runs only while touched');
});

console.log('\nthe border under the hand:');

// nearBand, lifted out of mount() with a body wrapped round a 1000x600 box.
const nearBandSrc = slice(MB, 'const nearBand = (e, rect) => {', 'const onMoveSoft');
const ringBody = (w, h, framePx, shape) => {
  const unit = 40, M = shape === 10 ? Math.max(10, framePx * 2.6) : Math.max(10, Math.min(18, h * 0.22));
  const cw = w + M, ch = h + M, frameT = (framePx / 2) / unit;
  const b = { shapeId: shape, rangeX: cw / (2 * unit), frameT, radius: 16 / unit,
    frameVec: shape === 10 ? [(w / 2) / unit, frameT] : [(w / 2) / unit, (h / 2) / unit] };
  const near = new Function('b', 'cfg', 'SHAPES', nearBandSrc + '\nreturn nearBand;')(b, { framePx }, { frame: 8, line: 10 });
  const rect = { left: 0, top: 0, width: cw, height: ch };
  return (x, y) => near({ clientX: cw / 2 + x, clientY: ch / 2 + y }, rect);
};

await ok('a frame wakes only near its metal, never over the room it frames', () => {
  const near = ringBody(1000, 600, 6, 8);
  assert.equal(near(0, 0), false, 'the middle of the room');
  assert.equal(near(200, -100), false, 'over the orb');
  assert.equal(near(500, 0), true, 'on the right edge');
  assert.equal(near(488, 0), true, 'just inside it');
  assert.equal(near(508, 0), true, 'just outside it');
  assert.equal(near(460, 0), false, '40px in');
  assert.equal(near(0, -300), true, 'on the top edge');
});

await ok('a divider wakes along its line, not across the section', () => {
  const near = ringBody(400, 1, 3, 10);
  assert.equal(near(0, 0), true);
  assert.equal(near(150, 8), true);
  assert.equal(near(0, 40), false);
});

console.log('\nthe sweep and the chrome:');

await ok('the sweep looks at what was added, skips the churn, and draws only when it mounted', () => {
  assert.ok(/const SKIP_WITHIN = '\.code-root, #chat-history';/.test(MOUNT));
  assert.ok(/const SKIP_SELF = 'canvas\.mercury-blob, i\.liq-div, ' \+ SKIP_WITHIN;/.test(MOUNT));
  assert.ok(/if \(!covered\) made \+= ringAll\(n\);/.test(MOUNT) && /if \(made\) renderNow\(\);/.test(MOUNT));
  assert.ok(!/querySelectorAll\('\.liquid-ringed'\)\.length/.test(MOUNT), 'no recount over the document');
  assert.ok(/const LIVE = new Set\(\);/.test(MOUNT));
});

await ok('no polling, no giant data URLs, folded rails draw nothing', () => {
  assert.ok(!/setInterval\(/.test(MOUNT), 'the slider bead has no interval');
  assert.ok(/c\.toBlob\(/.test(MOUNT) && /URL\.createObjectURL\(blob\)/.test(MOUNT), 'grain as a blob: URL');
  assert.ok(/'home-nav': railGate\('nav-collapsed'\), 'home-nav-right': railGate\('nav-collapsed-right'\)/.test(MOUNT));
});

console.log(`\n${passed} checks passed.`);
