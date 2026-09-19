// THE WINDOW — REACH stage 2. Run: node test/window.test.mjs
//
// The technique is one matrix, and the matrix is either right or the room is on
// a gimbal. So the maths is mirrored here in plain JS and held to the two
// identities that DEFINE it — the same way shapes.test.mjs mirrors each shape's
// equation — and then the shader-side source is guarded to be the same
// expressions. A mirror that drifts from the source is worse than no test, so
// the guards are on the exact lines, not on the idea.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createOneEuro, createOneEuro3 } from '../src/euro.js';

const ROOT = new URL('..', import.meta.url);
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
const settings = readFileSync(new URL('src/settings.js', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- the mirror -------------------------------------------------------------
// Row-major, exactly as Matrix4.set takes its arguments and exactly as body.js
// writes them.
function offAxis({ halfW, halfH, dist, ex = 0, ey = 0, ez = 0, near = 0.1, far = 100 }) {
  const n = near, f = far, d = dist + ez;
  const l = (-halfW - ex) * n / d;
  const r = (halfW - ex) * n / d;
  const b = (-halfH - ey) * n / d;
  const t = (halfH - ey) * n / d;
  return [
    2 * n / (r - l), 0, (r + l) / (r - l), 0,
    0, 2 * n / (t - b), (t + b) / (t - b), 0,
    0, 0, -(f + n) / (f - n), -2 * f * n / (f - n),
    0, 0, -1, 0,
  ];
}

// three's own PerspectiveCamera.updateProjectionMatrix, for r160, with no
// offset/zoom — the matrix the app draws with when the window is off.
function threePerspective(fovDeg, aspect, near = 0.1, far = 100) {
  const top = near * Math.tan((Math.PI / 180) * 0.5 * fovDeg);
  const height = 2 * top, width = aspect * height;
  const left = -0.5 * width;
  const l = left, r = left + width, t = top, b = top - height;
  const n = near, f = far;
  return [
    2 * n / (r - l), 0, (r + l) / (r - l), 0,
    0, 2 * n / (t - b), (t + b) / (t - b), 0,
    0, 0, -(f + n) / (f - n), -2 * f * n / (f - n),
    0, 0, -1, 0,
  ];
}

// Project a world point through an eye at (ex,ey,dist+ez) looking down -z.
function project(m, p, eye) {
  const v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const x = m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3];
  const y = m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7];
  const w = m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15];
  return [x / w, y / w];
}

// The framing fitCamera computes, for a given fov and aspect.
function framing(fovDeg, aspect, R = 1.6) {
  const vHalf = (fovDeg * Math.PI) / 180 / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const limit = Math.min(vHalf, hHalf);
  const dist = (R / Math.sin(limit)) * 1.06;
  const halfH = Math.tan(vHalf) * dist;
  return { dist, halfH, halfW: halfH * aspect };
}

console.log('\nthe window:');

ok('centred, the frustum IS three\'s own — bit for bit, at every shape of screen', () => {
  // The acceptance test the brief asks for, as an identity rather than a vibe:
  // with the viewer centred the render must be pixel-identical to tracking off.
  for (const aspect of [0.46, 0.75, 1, 1.6, 2.4, 3.2]) {
    const { dist, halfW, halfH } = framing(45, aspect);
    const mine = offAxis({ halfW, halfH, dist });
    const theirs = threePerspective(45, aspect);
    for (let i = 0; i < 16; i++) {
      assert.ok(Object.is(mine[i], theirs[i]) || Math.abs(mine[i] - theirs[i]) < 1e-12,
        `aspect ${aspect}, element ${i}: ${mine[i]} vs ${theirs[i]} — a centred head would not render identically`);
    }
  }
});

ok('a point ON the glass never moves, wherever the eye goes', () => {
  // This is what makes it a WINDOW and not a camera on a gimbal, and it is
  // exact, not approximate: for p.z = 0 the eye terms cancel algebraically and
  // the projection collapses to px/halfW. The orb sits on this plane, so the
  // orb is nailed to the screen and only the room behind it parallaxes.
  const { dist, halfW, halfH } = framing(45, 1.6);
  const p = [0.8, -0.45, 0];
  const base = project(offAxis({ halfW, halfH, dist }), p, [0, 0, dist]);
  for (const [ex, ey, ez] of [[0.4, 0, 0], [-0.4, 0.3, 0], [0, 0, 0.5], [0.6, -0.6, -0.4]]) {
    const m = offAxis({ halfW, halfH, dist, ex, ey, ez });
    const got = project(m, p, [ex, ey, dist + ez]);
    assert.ok(Math.abs(got[0] - base[0]) < 1e-12 && Math.abs(got[1] - base[1]) < 1e-12,
      `eye ${ex},${ey},${ez} moved a point on the glass to ${got} from ${base} — the world is swinging`);
  }
  assert.ok(Math.abs(base[0] - 0.8 / halfW) < 1e-12, 'the glass does not map to halfW');
});

ok('a point BEHIND the glass parallaxes, the right way and by the right amount', () => {
  // Lean right and the far wall shifts right relative to the orb, which is what
  // reveals its left side. The closed form is ex*Z / (halfW*(Z+dist)) — if the
  // sign of this ever flips, the room is inside out and nobody will be able to
  // say why it feels wrong.
  const { dist, halfW, halfH } = framing(45, 1.6);
  const Z = 6;                        // a wall, behind the glass
  for (const ex of [0.2, 0.5, -0.35]) {
    const m = offAxis({ halfW, halfH, dist, ex });
    const got = project(m, [0, 0, -Z], [ex, 0, dist]);
    const want = ex * Z / (halfW * (Z + dist));
    assert.ok(Math.abs(got[0] - want) < 1e-12, `ex ${ex}: ${got[0]} vs ${want}`);
    assert.ok(Math.sign(got[0]) === Math.sign(ex), 'the far wall moves against the head — the room is inside out');
  }
  // and farther is more: that IS parallax
  const near = Math.abs(project(offAxis({ halfW, halfH, dist, ex: 0.4 }), [0, 0, -1], [0.4, 0, dist])[0]);
  const far = Math.abs(project(offAxis({ halfW, halfH, dist, ex: 0.4 }), [0, 0, -12], [0.4, 0, dist])[0]);
  assert.ok(far > near, 'depth makes no difference — there is no parallax, only a shear');
});

ok('the filter is still when still and quick when moving — measured, not asserted', () => {
  const dt = 1 / 30;
  const sd = (a) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length); };
  let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  // stillness: a held head with noise on it
  let f = createOneEuro({ minCutoff: 0.3, beta: 0.1 });
  const out = []; for (let i = 0; i < 300; i++) out.push(f.filter(10 + rnd() * 0.6, dt));
  const still = sd(out.slice(100));
  assert.ok(still < 0.05, `too shivery when held still (sd ${still.toFixed(4)})`);
  // responsiveness: 15 units/s for a second, how far behind at the end
  f = createOneEuro({ minCutoff: 0.3, beta: 0.1 });
  for (let i = 0; i < 60; i++) f.filter(0, dt);
  let lag = 0; for (let i = 1; i <= 30; i++) { const truth = i * 0.5; const got = f.filter(truth, dt); if (i === 30) lag = (truth - got) / 0.5; }
  assert.ok(lag < 2, `lags ${lag.toFixed(2)} frames behind a moving head — it will feel like a swimming pool`);
  // a lerp quiet enough to match would lag more than ten frames; that trade is
  // the whole reason this filter is here rather than a lerp
  let v = 0, llag = 0; for (let i = 1; i <= 30; i++) { const truth = i * 0.5; v += (truth - v) * 0.06; if (i === 30) llag = (truth - v) / 0.5; }
  assert.ok(llag > lag * 4, 'the lerp comparison no longer holds — re-derive the constants');
});

ok('a NaN cannot poison the camera matrix', () => {
  // One NaN through an unguarded filter makes every later output NaN, which
  // makes the projection NaN, which is a black screen with nothing in the
  // console. It has to die at the boundary.
  const f = createOneEuro();
  f.filter(1, 1 / 60);
  assert.ok(Number.isFinite(f.filter(NaN, 1 / 60)), 'a NaN came back out');
  assert.ok(Number.isFinite(f.filter(2, 1 / 60)), 'the filter stayed poisoned after one NaN');
  const f3 = createOneEuro3();
  const out = f3.filter(1, NaN, 3, 1 / 60, 1 / 60);
  assert.ok(out.every(Number.isFinite), 'the vector filter passed a NaN through');
  // a zero dt (two reads in one frame) must not divide by zero either
  assert.ok(Number.isFinite(createOneEuro().filter(1, 0)), 'dt of zero produced a non-finite value');
});

console.log('\nwhat the body actually does:');

ok('the matrix is written by hand, and only ever by us', () => {
  const fn = body.slice(body.indexOf('function setOffAxis('), body.indexOf('function restoreSymmetric('));
  assert.ok(fn.length > 200, 'setOffAxis is gone');
  // makePerspective's signature has moved across three releases; sixteen floats
  // cannot.
  assert.ok(!/\.makePerspective\(/.test(body), 'a three helper is building the projection — its signature has changed across releases');
  assert.ok(/camera\.projectionMatrix\.set\(/.test(fn), 'the matrix is no longer set directly');
  assert.ok(/camera\.projectionMatrixInverse\.copy\(camera\.projectionMatrix\)\.invert\(\)/.test(fn), 'the inverse is stale — raycasting and unproject would be wrong');
  assert.ok(/const l = \(-win\.halfW - ex\) \* n \/ d;/.test(fn), 'the left plane no longer matches the mirror in this file');
  assert.ok(/const r = \(win\.halfW - ex\) \* n \/ d;/.test(fn), 'the right plane no longer matches the mirror in this file');
  assert.ok(/if \(!\(d > 1e-3\)/.test(fn), 'an eye at or behind the glass would divide by zero');
  // and it is put back when we stop
  const rs = body.slice(body.indexOf('function restoreSymmetric('), body.indexOf('function applyEye('));
  assert.ok(/camera\.updateProjectionMatrix\(\)/.test(rs), 'nothing restores three\'s own matrix');
});

ok('everything is declared above its FIRST READER, not merely above the loop', () => {
  // THE TDZ RULE, sixth time, and the fifth version of this guard was still too
  // weak — it checked "above the frame loop" and passed while the app was dead
  // on load. fitCamera is also a reader (it writes the window rect) and it runs
  // inside resize() during setup, long before the loop starts. A `let` below
  // THAT is in its temporal dead zone, createBody throws, Y3K is never defined,
  // and the whole app is a black screen with one line in the console.
  //
  // So the bar is the EARLIEST reader of each name, found in the text rather
  // than assumed.
  const decls = ['const win = {', 'let eyeSource = null;', 'let eyeGain = 0;', 'let eyeSymmetric = true;', 'const eyeFilt =', 'const eyeBase = {', 'const eyeAt = {'];
  const readers = [body.indexOf('  function frame()'), body.indexOf('function fitCamera()'), body.indexOf('    fitCamera();'), body.indexOf('  resize();')];
  for (const r of readers) assert.ok(r > 0, 'a reader this guard depends on has been renamed — re-derive the list');
  const earliest = Math.min(...readers);
  for (const decl of decls) {
    const at = body.indexOf(decl);
    assert.ok(at > 0, `"${decl}" is gone`);
    assert.ok(at < earliest, `"${decl}" is declared after something that reads it — createBody will throw and the app will not start`);
  }
  assert.ok(/applyEye\(dt\);/.test(body.slice(body.indexOf('  function frame()'))), 'the loop never applies the eye');
  // and the window rect is written before anything could read it back
  assert.ok(body.indexOf('const win = {') < body.indexOf('win.dist = dist;'), 'win is written before it exists');
});

ok('the window is fitted where the framing is decided, and nowhere else', () => {
  const fit = body.slice(body.indexOf('function fitCamera()'), body.indexOf('function fitCamera()') + 2600);
  assert.ok(/win\.dist = dist;/.test(fit), 'the window does not track the camera distance');
  assert.ok(/win\.halfH = Math\.tan\(vHalf\) \* dist;/.test(fit), 'the window height is not the camera\'s own');
  assert.ok(/win\.halfW = win\.halfH \* camera\.aspect;/.test(fit), 'the window does not follow the aspect — it would skew on resize');
});

ok('reduced motion caps it, the face going caps nothing suddenly', () => {
  assert.ok(/const REDUCED = typeof matchMedia === 'function' && matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;/.test(body), 'reduced motion is not read');
  assert.ok(/const cap = REDUCED \? EYE_GAIN_REDUCED : EYE_GAIN_MAX;/.test(body), 'reduced motion no longer caps the gain');
  assert.ok(/EYE_GAIN_REDUCED = 0\.0\d+/.test(body) && /EYE_GAIN_MAX = 0\.0\d+/.test(body), 'the caps are gone');
  const ae = body.slice(body.indexOf('function applyEye('));
  assert.ok(/Math\.pow\(0\.05, Math\.min\(0\.25, dt\) \/ EYE_HOME_S\)/.test(ae), 'the face-lost ease is gone — it would snap home on every glance away');
  assert.ok(/EYE_HOME_S = 0\.4/.test(body), 'the ease home is no longer ~400ms');
  assert.ok(/try \{ h = eyeSource\(\); \} catch \{ h = null; \}/.test(ae), 'a throwing eye source would take the render loop with it');
  assert.ok(/Number\.isFinite\(h\.x\)/.test(ae), 'a non-finite head reading would reach the camera matrix');
});

ok('it is hooked by a pull, and it has exactly one dial', () => {
  assert.ok(/body\.setEyeSource\(\(\) => perceive\.snapshot\(\)\.head\);/.test(main), 'the window is not hooked to the eye');
  assert.ok(/id="room-eye"/.test(settings), 'the depth dial is gone');
  assert.ok(/body\.setEye\?\.\(v\)/.test(settings), 'the dial no longer drives the window');
  assert.ok(/save\('y3k\.eye', v\)/.test(settings), 'the dial is not remembered');
  // The switch and the dial are remembered SEPARATELY: turning the window off
  // and on again has to return the feel this person chose, not a default.
  assert.ok(/id="room-face"/.test(settings), 'the window has no on/off of its own — the camera button is the only on-ramp');
  assert.ok(/save\('y3k\.face'/.test(settings), 'the switch is not remembered');
  assert.ok(/localStorage\.getItem\('y3k\.face'\) !== '0'/.test(main), 'the remembered switch is not applied at boot');
  const note = settings.slice(settings.indexOf('const paintEyeNote'), settings.indexOf('const paintEyeNote') + 1400);
  assert.ok(/reduced motion/i.test(note), 'the note does not admit that reduced motion caps it');
  assert.ok(/Waiting for the camera/.test(note), 'the note does not say the thing is waiting on a camera the switch cannot turn on');
  // THE PRIVACY SENTENCE. While the camera is on, every message carries a still
  // from it (main.js: the image on each turn). So these switches must not turn
  // the camera on, and the panel has to say what turning it on means.
  assert.ok(/camera\.isOn\(\) \? camera\.captureFrame\(\) : null/.test(main), 'the camera is no longer read per turn — re-check whether the settings copy is still true');
  assert.ok(/picture from it with each message/.test(settings), 'the panel no longer says what having the camera on means');
  assert.ok(/never turn it on for you/.test(settings), 'the panel no longer promises that a switch cannot open the camera');
  assert.ok(!/camera\.on\(\)/.test(settings), 'settings can open the camera — that would start sending pictures from a tracking switch');
});

console.log('\n' + passed + ' checks passed.\n');
