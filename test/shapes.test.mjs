// THE FOUR FAMILIES AND THE FLOW. Each shape is one equation, written into the
// vertex shader from the mathematics, not from anyone's code. A wrong exponent
// or a dropped phase gives you A shape — just not THE shape — and nothing
// crashes, so each equation is mirrored here in plain JS and held to the one
// invariant that defines it. Run: node test/shapes.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseShape, SHAPES } from '../src/tags.mjs';

const ROOT = new URL('..', import.meta.url);
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const grid = (n, lo, hi) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * (i + 0.5) / n);
const len = (v) => Math.hypot(...v);
const sg = Math.sign;

// ---- the equations, from the shelf ----------------------------------------
const ellipsoid = (eta, om, s1, s2) => {
  const ce = Math.cos(eta), se = Math.sin(eta), co = Math.cos(om), so = Math.sin(om);
  return [sg(ce * co) * Math.abs(ce) ** s1 * Math.abs(co) ** s2, sg(se) * Math.abs(se) ** s1, sg(ce * so) * Math.abs(ce) ** s1 * Math.abs(so) ** s2];
};
const superR = (t, m, n1, n2) => (Math.abs(Math.cos(m * t / 4)) ** n2 + Math.abs(Math.sin(m * t / 4)) ** n2) ** (-1 / n1);
const superRmax = (m, n1, n2) => (m < 0.5 ? 1 : Math.min(1, 2 * 0.70710678 ** n2) ** (-1 / n1));   // m = 0 never reaches the 45° point
const supershape = (th, ph, m, n1, n2) => {
  const r1 = superR(th, m, n1, n2) / superRmax(m, n1, n2), r2 = superR(ph, m, n1, n2) / superRmax(m, n1, n2);
  return [r1 * Math.cos(th) * r2 * Math.cos(ph), r2 * Math.sin(ph), r1 * Math.sin(th) * r2 * Math.cos(ph)];
};
const hopf4 = (eta, xi1, xi2) => [Math.cos(eta) * Math.cos(xi1 + xi2), Math.cos(eta) * Math.sin(xi1 + xi2), Math.sin(eta) * Math.cos(xi2), Math.sin(eta) * Math.sin(xi2)];
// scaled by the figure's OWN maximum for a given count of tori, as the shader does
const HOPF_ETA = 0.93;
const hopfScale = (tori) => { const seMax = Math.sin((tori - 0.5) / tori * HOPF_ETA); return Math.sqrt((1 - seMax) / (1 + seMax)); };
const hopf3 = (eta, xi1, xi2, tori) => { const [x1, x2, x3, x4] = hopf4(eta, xi1, xi2); return [x1, x2, x3].map((v) => v / (1 - x4) * hopfScale(tori)); };
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cpow = (z, e) => { const r = Math.hypot(z[0], z[1]) ** e, t = Math.atan2(z[1], z[0]) * e; return [r * Math.cos(t), r * Math.sin(t)]; };
const cpowN = (z, n) => { let r = [1, 0]; for (let i = 0; i < n; i++) r = cmul(r, z); return r; };
const calabi = (x, y, n, k1, k2) => {
  const chy = Math.cosh(y), shy = Math.sinh(y);
  const c = [Math.cos(x) * chy, -Math.sin(x) * shy], s = [Math.sin(x) * chy, Math.cos(x) * shy];
  const ph = (k) => [Math.cos(2 * Math.PI * k / n), Math.sin(2 * Math.PI * k / n)];
  return { z1: cmul(cpow(c, 2 / n), ph(k1)), z2: cmul(cpow(s, 2 / n), ph(k2)) };
};
const calabi3 = (x, y, n, k1, k2, al) => { const { z1, z2 } = calabi(x, y, n, k1, k2); return [z1[0], z2[0], Math.cos(al) * z1[1] + Math.sin(al) * z2[1]].map((v) => v * 0.52); };

console.log('\nthe equations hold:');

ok('the superellipsoid at s1 = s2 = 1 is exactly the unit sphere', () => {
  for (const eta of grid(17, -Math.PI / 2, Math.PI / 2)) for (const om of grid(23, -Math.PI, Math.PI)) {
    assert.ok(Math.abs(len(ellipsoid(eta, om, 1, 1)) - 1) < 1e-12, `eta ${eta} om ${om}`);
  }
  // and it really does square up toward a box and pinch past 1
  assert.ok(len(ellipsoid(0.7, 0.7, 0.3, 0.3)) > 1.05, 'low exponents do not bulge toward the cube');
  assert.ok(len(ellipsoid(0.7, 0.7, 2.5, 2.5)) < 0.7, 'high exponents do not pinch');
});

ok('the supershape at m = 0 is exactly the sphere, and its lobes touch R without passing it', () => {
  for (const th of grid(19, -Math.PI, Math.PI)) for (const ph of grid(11, -Math.PI / 2, Math.PI / 2)) {
    assert.ok(Math.abs(len(supershape(th, ph, 0, 0.95, 2.8)) - 1) < 1e-9, 'm = 0 is not the sphere');
  }
  // THE NORMALISATION: r(t)/rmax must be <= 1 everywhere and reach 1 somewhere,
  // for n2 both above and below 2 — the two regimes where the 45° point is the
  // maximum and where it is the minimum. Get the min/max backwards and the
  // starfish is either clipped flat or half-size.
  for (const [n1, n2] of [[0.55, 2.8], [0.95, 2.8], [1.4, 1.2], [0.3, 4.5], [2, 0.6]]) {
    for (const t of grid(721, -Math.PI, Math.PI)) { const r = superR(t, 7, n1, n2) / superRmax(7, n1, n2); assert.ok(r <= 1 + 1e-9, `r=${r} exceeds 1 at n1 ${n1} n2 ${n2}`); }
    // the maximum is AT the 45° point (t = π/m) when n2 > 2, and at t = 0 when
    // n2 < 2 — sample both exactly rather than hoping a grid lands on a peak
    // that gets needle-thin as n1 falls (a 721-point grid missed it by 0.0011)
    const peak = Math.max(superR(Math.PI / 7, 7, n1, n2), superR(0, 7, n1, n2)) / superRmax(7, n1, n2);
    // 1e-6, not 1e-9: the shader's 0.70710678 is eight digits and float32 holds
    // seven, so the true peak lands ~1e-8 inside R. Tighter than the hardware
    // is a test of the test.
    assert.ok(Math.abs(peak - 1) < 1e-6, `the lobes do not touch R (peak ${peak}) at n1 ${n1} n2 ${n2}`);
  }
});

ok("the hopf points lie on S³ before projection, and after it the largest torus TOUCHES R without passing it", () => {
  for (const eta of grid(9, 0, HOPF_ETA)) for (const xi1 of grid(13, 0, 2 * Math.PI)) for (const xi2 of grid(13, 0, 2 * Math.PI)) {
    const x = hopf4(eta, xi1, xi2);
    assert.ok(Math.abs(x[0] ** 2 + x[1] ** 2 + x[2] ** 2 + x[3] ** 2 - 1) < 1e-12, 'not on the 3-sphere');
  }
  // for every count of tori the shader can be handed: nothing outside R, and the
  // outermost torus's far point ON it — the first version scaled by a constant
  // derived from a cap the tori never reached and the whole body sat at 0.57R
  for (const tori of [1, 2, 4, 9]) {
    let mx = 0;
    for (let k = 0; k < tori; k++) { const eta = (k + 0.5) / tori * HOPF_ETA;
      for (const xi1 of grid(24, 0, 2 * Math.PI)) for (const xi2 of [...grid(24, 0, 2 * Math.PI), Math.PI / 2]) { const L = len(hopf3(eta, xi1, xi2, tori)); assert.ok(L <= 1 + 1e-9, `tori ${tori}: a point reaches ${L}R`); mx = Math.max(mx, L); } }
    assert.ok(mx > 0.999, `tori ${tori}: the largest torus only reaches ${mx.toFixed(3)}R`);
  }
  // and the innermost is no smaller than a third of it — nested, not a dot in a ring
  const inner = len(hopf3(0.5 / 4 * HOPF_ETA, 0, Math.PI / 2, 4));
  assert.ok(inner > 0.3, `the innermost torus is ${inner.toFixed(2)}R — the figure has collapsed to a ring`);
  // x4 is constant along a fibre, which is the whole reason the 0.73 bound works
  const a = hopf4(0.5, 0.1, 1.3)[3], b = hopf4(0.5, 4.0, 1.3)[3];
  assert.ok(Math.abs(a - b) < 1e-12, 'x4 varies along a fibre — the circle would not scale uniformly');
});

ok('THE CALABI–YAU POINTS SATISFY z1^n + z2^n = 1, for every degree and patch', () => {
  // The invariant that IS the surface. A wrong exponent, a wrong phase, or the
  // patch phase applied to the wrong factor all fail here and nowhere else.
  for (const n of [2, 3, 4, 5, 7, 9]) for (let k1 = 0; k1 < n; k1++) for (let k2 = 0; k2 < n; k2++) {
    for (const x of grid(5, 0, Math.PI / 2)) for (const y of grid(5, -1.1, 1.1)) {
      const { z1, z2 } = calabi(x, y, n, k1, k2);
      const s = cpowN(z1, n), t = cpowN(z2, n);
      assert.ok(Math.abs(s[0] + t[0] - 1) < 1e-9 && Math.abs(s[1] + t[1]) < 1e-9, `z1^n + z2^n != 1 at n ${n} k ${k1},${k2} x ${x} y ${y}`);
    }
  }
  // and the projection is brought in close enough that the in-shader clamp is a sliver, not a haircut
  let mx = 0;
  for (const n of [2, 3, 4]) for (let k1 = 0; k1 < n; k1++) for (let k2 = 0; k2 < n; k2++) for (const x of grid(9, 0, Math.PI / 2)) for (const y of grid(9, -1.1, 1.1)) mx = Math.max(mx, len(calabi3(x, y, n, k1, k2, 0.5)));
  assert.ok(mx < 1.08, `the projected surface reaches ${mx.toFixed(3)} R — the clamp would be reshaping it`);
});

console.log('\nthe shader is the same equations:');

ok('every family has an id, a branch, its units, and a lesson — and the prompt teaches nothing the shader lacks', () => {
  const ids = Object.fromEntries([...body.matchAll(/(\w+): (\d+)/g)].filter((m) => body.slice(m.index - 60, m.index).includes('SHAPE_ID') || true).map((m) => [m[1], +m[2]]));
  const hint = srv.slice(srv.indexOf('YOU CAN ALSO ARRANGE YOURSELF'), srv.indexOf('YOU CAN ALSO ARRANGE YOURSELF') + 1400);
  for (const name of ['ellipsoid', 'super', 'hopf', 'calabi']) {
    assert.ok(SHAPES.includes(name), name + ' is not in the grammar');
    assert.ok(new RegExp(name + ': \\d+').test(body.slice(body.indexOf('const SHAPE_ID'), body.indexOf('const SHAPE_ID') + 300)), name + ' has no SHAPE_ID');
    const id = +body.slice(body.indexOf('const SHAPE_ID')).match(new RegExp(name + ': (\\d+)'))[1];
    assert.ok(new RegExp('uShapeId == ' + id + '\\)').test(body), name + ' (id ' + id + ') has no branch in shapeForm');
    assert.ok(new RegExp('    ' + name + ':\\s+\\(').test(body.slice(body.indexOf('const SHAPE_UNITS'), body.indexOf('const SHAPE_UNITS') + 900)), name + ' reads no units');
    assert.ok(new RegExp('\\b' + name + ' ').test(hint), name + ' is never taught');
  }
  // the other direction: a form the prompt names must be one the parser accepts
  for (const w of hint.match(/\b(ellipsoid|super|hopf|calabi|sphere|shell|ring|disc|helix|lattice|spiral|cube)\b/g)) assert.ok(SHAPES.includes(w), 'prompt teaches ' + w);
});

ok('NO cosh OR sinh IN THE SHADER — this is GLSL ES 1.00 and they do not exist there', () => {
  // A ShaderMaterial is ES 1.00 unless told otherwise. The hyperbolics compile
  // nowhere in it, and a shader that fails to compile drops the whole body.
  assert.ok(!/\b(cosh|sinh|tanh)\s*\(/.test(stripped), 'a hyperbolic function is in the shader source');
  assert.ok(/exp\(y\)/.test(body), 'cosh/sinh are no longer built from exp()');
  // and the m = 0 guard is in the shader too, not only in this mirror
  assert.ok(/m < 0\.5 \? 1\.0 :/.test(body), 'super 0 shrinks to three quarters again');
});

ok('every family brings its point inside R', () => {
  const form = body.slice(body.indexOf('vec3 shapeForm('), body.indexOf('return dir * R;                               // sphere'));
  for (const id of [8, 9, 10, 11]) {
    const br = form.slice(form.indexOf('uShapeId == ' + id + ')'), form.indexOf('return p * R;', form.indexOf('uShapeId == ' + id + ')')));
    assert.ok(/if \(L > 1\.0\) p \/= L;/.test(br), 'form ' + id + ' can leave the camera sphere');
  }
  assert.ok(/\* 0\.045;\s+\/\/ a circle is a curve: rule 2/.test(form), 'the hopf circles ship without thickness');
});

console.log('\nthe flow:');

ok('flow is a move, hoisted like noise, and it leaves the trail buffer alone', () => {
  assert.equal(parseShape('<<shape: sphere flow 4 3>>').ops[0].op, 'flow');
  assert.deepEqual(parseShape('<<shape: sphere flow 4 3>>').ops[0].args, [4, 3]);
  assert.equal((stripped.match(/uFlowAmp > 0\.001/g) || []).length, 1, 'flow is not one hoisted branch');
  const br = stripped.slice(stripped.indexOf('uFlowAmp > 0.001'), stripped.indexOf('uFlowAmp > 0.001') + 400);
  assert.equal((br.match(/fbm\(/g) || []).length, 1, 'flow costs more than one fbm');
  assert.ok(/o\.op === 'flow'/.test(body) && /continue;/.test(body.slice(body.indexOf("o.op === 'flow'"), body.indexOf("o.op === 'flow'") + 300)), 'flow is not hoisted out of the op loop');
  // Trails composite with MaxEquation and were built for a sparse wake: over a
  // full body they saturate to a solid white disc within frames (three renders
  // said so). Flow must not switch them on; that pairing waits for condense.
  const setShapeBody = body.slice(body.indexOf('setShape(spec) {'), body.indexOf('shapeMixTarget = 1;', body.indexOf('setShape(spec) {')));
  assert.ok(!/setTrail\(/.test(setShapeBody), 'a shape is turning the trail buffer on — that is a white disc over a full body');
  assert.ok(!/trailByFlow|flowTrails/.test(body), 'the flow-trail coupling is back');
});

ok('the grammar reads every digit a family asks for, and no more', () => {
  const s = parseShape('<<shape: super 7 1 5 twist 2>>');
  assert.deepEqual([s.a, s.b, s.c, s.d], [7, 1, 5, 0]);
  assert.equal(s.ops[0].op, 'twist', 'the fourth number was eaten as a shape digit');
  const e = parseShape('<<shape: ellipsoid 2 6 9>>');
  assert.deepEqual([e.a, e.b, e.c], [2, 6, 0], 'ellipsoid read a third digit');
  assert.deepEqual([parseShape('<<shape: hopf>>').a, parseShape('<<shape: helix 5>>').a], [0, 5], 'the old two-digit forms changed');
});

console.log('\n' + passed + ' checks passed.\n');
