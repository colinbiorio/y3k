// THE FOUR FAMILIES AND THE FLOW. Each shape is one equation, written into the
// vertex shader from the mathematics, not from anyone's code. A wrong exponent
// or a dropped phase gives you A shape — just not THE shape — and nothing
// crashes, so each equation is mirrored here in plain JS and held to the one
// invariant that defines it. Run: node test/shapes.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseShape, parseBody, parseScore, SHAPES } from '../src/tags.mjs';

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
// both phases ride xi1 — the orbit of (z1, z2) -> (e^{it} z1, e^{it} z2), which is what a fibre is
const hopf4 = (eta, xi1, xi2) => [Math.cos(eta) * Math.cos(xi1 + xi2), Math.cos(eta) * Math.sin(xi1 + xi2), Math.sin(eta) * Math.cos(xi1), Math.sin(eta) * Math.sin(xi1)];
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
  // derived from a cap the tori never reached and the whole body sat at 0.57R.
  // The far point of a fibre is where x4 = sin(eta), which is xi1 = pi/2 now
  // that x4 rides xi1 — so that sample joins the xi1 grid (a 24-grid misses it
  // by 0.005R and the touch reads 0.995).
  for (const tori of [1, 2, 4, 9]) {
    let mx = 0;
    for (let k = 0; k < tori; k++) { const eta = (k + 0.5) / tori * HOPF_ETA;
      for (const xi1 of [...grid(24, 0, 2 * Math.PI), Math.PI / 2]) for (const xi2 of grid(24, 0, 2 * Math.PI)) { const L = len(hopf3(eta, xi1, xi2, tori)); assert.ok(L <= 1 + 1e-9, `tori ${tori}: a point reaches ${L}R`); mx = Math.max(mx, L); } }
    assert.ok(mx > 0.999, `tori ${tori}: the largest torus only reaches ${mx.toFixed(3)}R`);
  }
  // and the innermost is no smaller than a third of it — nested, not a dot in a ring
  const inner = len(hopf3(0.5 / 4 * HOPF_ETA, Math.PI / 2, 0, 4));
  assert.ok(inner > 0.3, `the innermost torus is ${inner.toFixed(2)}R — the figure has collapsed to a ring`);
});

// Gauss's linking integral of two closed curves, midpoint rule on an N x N grid
// of parameters — periodic and smooth, so it converges fast; 48 is ample.
const gaussLink = (g1, g2, N) => {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const h = 1e-5, ds = 2 * Math.PI / N;
  let L = 0;
  for (let i = 0; i < N; i++) { const s = (i + 0.5) * ds, p1 = g1(s), d1 = sub(g1(s + h), g1(s - h)).map((v) => v / (2 * h));
    for (let j = 0; j < N; j++) { const t = (j + 0.5) * ds, p2 = g2(t), d2 = sub(g2(t + h), g2(t - h)).map((v) => v / (2 * h));
      const r = sub(p1, p2); L += dot(r, cross(d1, d2)) / Math.pow(dot(r, r), 1.5) * ds * ds; } }
  return L / (4 * Math.PI);
};

ok('THE FIBRES LINK — every two of them, once; the flat version never did', () => {
  // two fibres of one torus, xi2 = 0 and 2pi/6 — neighbours at 'hopf 4 6'
  const L = gaussLink((s) => hopf3(0.5, s, 0, 4), (t) => hopf3(0.5, t, 2 * Math.PI / 6, 4), 48);
  assert.ok(Math.abs(L - 1) < 0.1, `the fibres link ${L.toFixed(3)} times, not once`);
  // and across tori
  const Lx = gaussLink((s) => hopf3(0.2, s, 0, 4), (t) => hopf3(0.7, t, 1, 4), 48);
  assert.ok(Math.abs(Lx - 1) < 0.1, `fibres on different tori link ${Lx.toFixed(3)} times, not once`);
  // REGRESSION: the shipped formula held (x3, x4) at xi2 — constant along a
  // fibre — so every "fibre" was a flat circle about the view axis in its own
  // parallel plane. Two of those cannot link, and the picture was rings, not a fibration.
  const flat4 = (eta, xi1, xi2) => [Math.cos(eta) * Math.cos(xi1 + xi2), Math.cos(eta) * Math.sin(xi1 + xi2), Math.sin(eta) * Math.cos(xi2), Math.sin(eta) * Math.sin(xi2)];
  const flat3 = (eta, xi1, xi2, tori) => { const [x1, x2, x3, x4] = flat4(eta, xi1, xi2); return [x1, x2, x3].map((v) => v / (1 - x4) * hopfScale(tori)); };
  const L0 = gaussLink((s) => flat3(0.5, s, 0, 4), (t) => flat3(0.5, t, 2 * Math.PI / 6, 4), 48);
  assert.ok(Math.abs(L0) < 0.05, `the flat formula links ${L0.toFixed(3)} — this regression check no longer distinguishes the two`);
  // and the shader carries the linked one, by its own line
  assert.ok(/x3 = se \* cos\(xi1\), x4 = se \* sin\(xi1\);/.test(body), 'the shader does not advance (x3, x4) with xi1 — the fibres are flat rings');
  assert.ok(!/x3 = se \* cos\(xi2\), x4 = se \* sin\(xi2\);/.test(body), 'the flat parametrisation is back in the shader');
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
  // the forms paragraph of the full lesson, by its own delimiters — it was a
  // 1400-byte window, and the knot's lesson lands past 1400 while being taught
  const hintFrom = srv.indexOf('YOU CAN ALSO ARRANGE YOURSELF'), hintTo = srv.indexOf('Moves, in the order written', hintFrom);
  assert.ok(hintFrom > 0 && hintTo > hintFrom, 'the forms paragraph of the full lesson cannot be located');
  const hint = srv.slice(hintFrom, hintTo);
  // the four families, and every other form that reads digits into units —
  // pendulum, the drawn butterfly, the moon, the knot, and the helix since it
  // became a ladder. Every entry in SHAPE_UNITS is held here.
  for (const name of ['ellipsoid', 'super', 'hopf', 'calabi', 'pendulum', 'butterfly', 'moon', 'helix', 'knot']) {
    assert.ok(SHAPES.includes(name), name + ' is not in the grammar');
    // the table by its own end, never a byte window: the shelf adds ids faster than a window grows
    assert.ok(new RegExp(name + ': \\d+').test(body.slice(body.indexOf('const SHAPE_ID'), body.indexOf('\n', body.indexOf('const SHAPE_ID')))), name + ' has no SHAPE_ID');
    const id = +body.slice(body.indexOf('const SHAPE_ID')).match(new RegExp(name + ': (\\d+)'))[1];
    assert.ok(new RegExp('uShapeId == ' + id + '\\)').test(body), name + ' (id ' + id + ') has no branch in shapeForm');
    // the whole table, by its own delimiters — a 900-byte window from the top
    // had pendulum at offset 858, so every family added above it would have
    // pushed calabi out of sight and passed
    const unitsFrom = body.indexOf('const SHAPE_UNITS = {'), unitsTo = body.indexOf('\n  };', unitsFrom);
    assert.ok(unitsFrom > 0 && unitsTo > unitsFrom, 'SHAPE_UNITS cannot be located');
    assert.ok(new RegExp('    ' + name + ':\\s+\\(').test(body.slice(unitsFrom, unitsTo)), name + ' reads no units');
    assert.ok(new RegExp('\\b' + name + ' ').test(hint), name + ' is never taught');
  }
  // the other direction: a form the prompt names must be one the parser accepts
  for (const w of hint.match(/\b(ellipsoid|super|hopf|calabi|sphere|shell|ring|disc|helix|lattice|spiral|cube|butterfly|moon|knot)\b/g)) assert.ok(SHAPES.includes(w), 'prompt teaches ' + w);
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
  for (const id of [8, 9, 10, 11, 14, 15]) {
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

console.log('\nthe mesh, after the review of 2026-09-19:');

ok('the grid is reached the short way round, and each layer by its own rule', () => {
  // ONE HELPER, BOTH SHADERS. A straight lerp between two unit directions
  // shortens as they diverge; at the halfway point of a near-antipodal pair it
  // is zero and normalize() returns noise.
  assert.ok(/vec3 meshSlerp\(vec3 a, vec3 b, float k\) \{/.test(body), 'the slerp helper is gone');
  assert.ok(/clamp\(dot\(a, b\), -0\.9999, 0\.9999\)/.test(body), 'sin(omega) is no longer held off zero');
  assert.equal((body.match(/dir = meshSlerp\(dir, gdir, uMesh\);/g) || []).length, 2, 'both shaders must travel along the sphere');
  assert.ok(!/normalize\(mix\(dir, gdir, uMesh\)\)/.test(body), 'a shader is back on the straight lerp');
  assert.ok(body.indexOf('vec3 meshSlerp') < body.indexOf('const VERT'), 'the helper is declared after the shader that uses it');
  // THE BODY knows each node's index (y = 1 - 2i/N) and gives it its own cell.
  // Latitude must DESCEND with that index, as the field's own does: ascending
  // sent every node to its mirrored latitude, and 28% of the field had no
  // direction left to normalise at uMesh 5.
  assert.equal((body.match(/float ph = \(0\.5 - \(floor\(gi \/ cols\) \+ 0\.5\) \/ rows\) \* 3\.14159265;/g) || []).length, 1, 'the body grid no longer descends with the index');
  assert.ok(!/\(\(floor\(gi \/ cols\) \+ 0\.5\) \/ rows - 0\.5\)/.test(body), 'the mirrored latitude is back');
  // THE LINES are a different point set — an 800-node web and the memory
  // edges — so an index read off y is meaningless there and flung endpoints up
  // to 179 degrees. They snap to the nearest cell of the same grid instead.
  const line = body.slice(body.indexOf('const LINE_VERT'));
  assert.ok(/float ph0 = asin\(clamp\(dir\.y, -1\.0, 1\.0\)\);/.test(line), 'the line layer no longer snaps by direction');
  assert.ok(/float col = floor\(fract\(th0 \/ 6\.2831853\) \* cols\);/.test(line), 'the line layer has lost its longitude');
  assert.ok(!/float gi = /.test(line), 'the line layer is back on the index remap');
  const vert = body.slice(body.indexOf('const VERT'), body.indexOf('const LINE_VERT'));
  assert.ok(/float gi = clamp\(\(1\.0 - position\.y\) \* 0\.5, 0\.0, 1\.0\) \* \(uCount - 1\.0\);/.test(vert), 'the body has lost its one-node-per-cell index');
  const helper = body.slice(body.indexOf('vec3 meshSlerp'), body.indexOf('vec3 meshSlerp') + 400);
  for (const bad of ['cosh(', 'sinh(', 'fwidth(']) assert.ok(!helper.includes(bad), bad + ' is not in GLSL ES 1.00');
});

console.log('\nthe butterfly — the first drawn form:');

// The whole SHAPE_GLSL string, taken between its own delimiters and asserted
// non-empty, because a slice from a missing anchor passes everything inside it.
const glslFrom = body.indexOf('const SHAPE_GLSL = /* glsl */`') + 'const SHAPE_GLSL = /* glsl */`'.length;
const glslTo = body.indexOf('`;', glslFrom);
assert.ok(glslFrom > 40 && glslTo > glslFrom, 'SHAPE_GLSL cannot be located');
const glsl = body.slice(glslFrom, glslTo);
const fly = glsl.slice(glsl.indexOf('if (uShapeId == 13)'), glsl.indexOf('return dir * R;'));
assert.ok(fly.length > 1500, 'the butterfly branch is missing or empty');

ok('the template literal is whole — no backtick has split the shader in two', () => {
  // A PAIR of stray backticks closes the literal and reopens it, which PARSES:
  // the text between becomes a JS expression, and body.js throws a
  // ReferenceError at load instead of a syntax error at check. It happened
  // writing this very branch, inside a comment. node --check cannot see it.
  assert.equal(glsl.split('`').length - 1, 0, 'a backtick inside SHAPE_GLSL — the shader is split and body.js will not load');
});

ok('a form says what it is made of, and both shaders hear it', () => {
  // gPart and gRadial are globals written by shapeForm and read after it. They
  // are declared INSIDE SHAPE_GLSL so the dots shader and the constellation
  // web — which both include the string — each get them; declared in one alone,
  // the other fails to compile.
  assert.ok(/\nfloat gPart;/.test(glsl), 'gPart is not declared inside SHAPE_GLSL');
  assert.ok(/\nfloat gRadial;/.test(glsl), 'gRadial is not declared inside SHAPE_GLSL');
  // ...and every form resets them on the way in, or the last form's answer
  // leaks into the next.
  // read as CODE: a reset that has been commented out still matches its own text
  const form = glsl.slice(glsl.indexOf('vec3 shapeForm('), glsl.indexOf('if (uShapeId == 1)')).replace(/\/\/[^\n]*/g, '');
  assert.ok(/^\s*gPart = 0\.0;/m.test(form), 'shapeForm does not reset gPart — a part would leak between forms');
  assert.ok(/^\s*gRadial = 1\.0;/m.test(form), 'shapeForm does not reset gRadial — every form after the butterfly would lose its breath');
});

ok('a drawing refuses the radial breath, in TWO statements, at BOTH call sites', () => {
  // The shaders add (dir * disp) on top of whatever a form returns: a breath
  // along the surface for a sphere, a scatter in every direction for a flat
  // drawing. Measured: the wings smear at disp 0.05 and merge at 0.10.
  assert.ok(/gRadial = 0\.15;/.test(fly), 'the butterfly takes the whole breath and comes out a cloud');
  // GLSL does not order operand evaluation: shapeForm(...) + dir * disp * gRadial
  // may read gRadial BEFORE the call that writes it. So it is two statements.
  // a trailing comment on the first statement is allowed; a second expression is not
  assert.equal((body.match(/= shapeForm\(dir, u, uRadius, \w+\);[^\n]*\n\s*fp \+= dir \* \(disp \* gRadial\);/g) || []).length, 2,
    'a call site folds the breath into the same expression as the form, or one of the two shaders was missed');
  // matched against the CODE's shape, with real arguments — the comment that
  // explains the hazard writes it as shapeForm(...) and must not trip this
  assert.ok(!/= shapeForm\(dir, u, uRadius, \w+\) \+ dir \* disp/.test(body), 'the single-expression form is back');
});

ok('the wing map reads Y before it skews with it', () => {
  // The published version wrote X += k*Y before Y was assigned — an
  // uninitialised local read, the one piece of undefined behaviour in the design.
  const iY = fly.indexOf('float Y = '), iSkew = fly.indexOf('X += sk * Y;');
  assert.ok(iY > 0 && iSkew > 0, 'the wing map has changed shape — re-check the read order by hand');
  assert.ok(iY < iSkew, 'the skew reads Y before Y exists');
  // and the three gaussians guard pow(0, e), which NaNs on some drivers
  assert.equal((fly.match(/\+ 1e-6, 2\.\d\)\)/g) || []).length, 3, 'a body gaussian lost its pow(0,e) guard');
});

ok('the word is whole: id, digits, its kind, and both places it is taught', () => {
  assert.ok(/const SHAPE_ID = \{[^}]*\bbutterfly: 13\b/.test(body), 'SHAPE_ID has no butterfly, or not at 13');
  // a missing digit is the resting posture, never zero
  // the `a || 7` idiom, because the parser pads a missing digit with 0 and
  // setShape passes `spec.a | 0` — a test for undefined never fires
  assert.ok(/butterfly: \(a, b\) => \[0\.25 \+ \(a \|\| 7\) \* 0\.0833, 0\.015 \+ \(b \|\| 3\) \* 0\.020, 0, 0\]/.test(body),
    'a bare <<shape: butterfly>> would be folded flat at zero thickness');
  assert.ok(!/=== undefined \? 7/.test(body), 'the unreachable undefined test is back');
  assert.ok(SHAPES.includes('butterfly'), 'the parser does not know the word');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const SHAPE_N = \{[^}]*\bbutterfly: 2\b/.test(tags), 'SHAPE_N does not read its two digits');
  // marked as a PICTURE, not an equation — this is what keeps LANGUAGE.md honest
  assert.ok(/export const DRAWN = new Set\(\['butterfly'\]\);/.test(tags), 'butterfly is not marked as drawn — the spec would have to pretend it is mathematics');
  // taught in BOTH places: a word only in the full grammar is unreachable in chat
  const brief = srv.slice(srv.indexOf('YOUR WHOLE BODY, IN BRIEF'), srv.indexOf('\n', srv.indexOf('YOUR WHOLE BODY, IN BRIEF')));   // the whole line, never a byte window: five lanes grow it
  assert.ok(/butterfly O T/.test(brief), 'the brief does not teach it — the chat path cannot say it');
  assert.ok(/and butterfly O T — four wings, a body, two antennae/.test(srv), 'the full grammar does not teach it');
  const th = readFileSync(new URL('src/twohand.js', ROOT), 'utf8');
  assert.ok(/\{ shape: 'butterfly 7 3' \},/.test(th), 'the hands cannot turn to it');
});

console.log('\nthe flap — the first word after the butterfly:');

const apply = glsl.slice(glsl.indexOf('vec3 shapeApply('), glsl.indexOf('// NOISE IS HOISTED OUT OF THE LOOP'));
assert.ok(apply.length > 800, 'the move ladder cannot be located');

ok('the ladder has no catch-all — an unknown opcode does nothing, loudly nothing', () => {
  // It ended in a bare `else { spin }`, so any opcode it had not heard of
  // rendered as a spin: silently, plausibly, with nothing thrown. Every arm is
  // named now, and every word after this one lands as its own.
  assert.ok(!/\n\s*else \{/.test(apply), 'a bare else is back in the ladder — the next new opcode will render as whatever it guards');
  assert.ok(/else if \(o\.x < 8\.5\) \{ float a = t \* A \* w;/.test(apply), 'spin is not guarded by its own code');
});

ok('flap is signed by side, hinged at the body, and does not know what it is on', () => {
  const arm = apply.slice(apply.indexOf('else if (o.x < 9.5) {'), apply.indexOf('\n      }', apply.indexOf('else if (o.x < 9.5) {')));
  assert.ok(arm.length > 200, 'the flap arm is missing');
  assert.ok(/float side = p\.x < 0\.0 \? -1\.0 : 1\.0;/.test(arm), 'the sign is not taken from p.x');
  assert.ok(/float hinge = smoothstep\(0\.0, 0\.30, abs\(p\.x\) \/ R\);/.test(arm), 'the hinge is gone, or not in units of R');
  assert.ok(/float a = sin\(t \* F - lag\) \* A \* side \* hinge \* w;/.test(arm), 'the beat is not a sinusoid signed by side and hinged');
  // gPart is read for ONE thing, the second pair's lag — never the sign. A flap
  // that keys its sign off the form dies on every form that is not a butterfly.
  const code = arm.replace(/\/\/[^\n]*/g, '');
  assert.equal((code.match(/gPart/g) || []).length, 2, 'gPart is read more than the lag needs — the sign is probably keyed off the form');
  assert.ok(/float lag = \(gPart > 1\.5 && gPart < 2\.5\) \? S : 0\.0;/.test(code), 'the second pair does not trail the first');
});

ok('the word is whole: opcode, units, digits, and both places it is taught', () => {
  // by NAME and number, not by the tail of the table — the next word extends it
  assert.ok(/const OP_CODE = \{[^}]*\bflap: 9\b/.test(body), 'OP_CODE has no flap, or not at 9');
  assert.ok(/flap: \(a\) => \[a\[0\] \* 0\.17, 0\.5 \+ a\[1\] \* 0\.7, a\[2\] \* 0\.25\],/.test(body), 'flap has no units — a 9 could be destructive, or nothing');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const MOVES = \{[^}]*\bflap: 3\b/.test(tags), 'the parser does not read flap\'s three digits');
  // the brief's move list grows with every word; pin flap's presence, not the list's tail
  assert.ok(/moves like [^)]*\bflap A F L\b[^)]*; once lets it go\)/.test(srv), 'the brief does not teach flap — unreachable in conversation');
  assert.ok(/flap A F L \(a wing beat about your long axis/.test(srv), 'the full grammar does not teach flap');
  // and the parser actually reads it
  const spec = parseShape('<<shape: butterfly 7 3 flap 6 4 2>>');
  assert.ok(spec && spec.shape === 'butterfly' && spec.a === 7 && spec.b === 3, 'butterfly digits not read');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args]), [['flap', [6, 4, 2]]], 'flap\'s digits not read as a move');
});

console.log('\nparts, and a colour for each:');

ok('the mask function has no catch-all either — @wedge is guarded, @part is named', () => {
  const mw = glsl.slice(glsl.indexOf('float maskW('), glsl.indexOf('// ---- THE FORMS'));
  assert.ok(mw.length > 300, 'maskW cannot be located');
  assert.ok(/if \(c < 9\.5\) return smoothstep\(lo - 0\.06/.test(mw), '@wedge is the unguarded last return again — the next mask code becomes a wedge');
  assert.ok(/if \(c < 10\.5\) return step\(abs\(gPart - mk\.y \* 9\.0\), 0\.5\);/.test(mw), '@part is missing, or does not recover the digit from mk.y (which arrives as digit/9)');
  assert.ok(/\n  return 0\.0;/.test(mw), 'an unknown mask code does not mask everything out');
});

ok('hue moves nothing, and is spent in BOTH colour modes', () => {
  assert.ok(/else if \(o\.x < 10\.5\) gHue \+= A \* w;/.test(apply), 'the hue arm is missing or touches p');
  // read outside the posture block, so it MUST be initialised at declaration
  assert.ok(/\nfloat gHue = 0\.0;/.test(glsl), 'gHue is not initialised at declaration — undefined on every node with no posture');
  // a trailing comment on the first line is allowed; anything between them is not
  assert.ok(/\n  hue \+= gHue \* uShapeMix;[^\n]*\n  vHue=fract\(hue\);/.test(body), 'a scheme body ignores the hue move, or it is added after the wrap, or it is not eased by the form\'s own arrival');
  // presence of the spin in the assignment, not the whole line — sat and bright wrap it
  assert.ok(/vPaintCol=[^;\n]*hueSpin\(aColor, gHue \* uShapeMix \* 6\.2831853\)/.test(body), 'a painted body ignores the hue move — the word would silently do nothing when the presence wears its own colours');
  assert.ok(/vec3 hueSpin\(vec3 c, float a\) \{/.test(glsl) && /const vec3 k = vec3\(0\.57735027\);/.test(glsl), 'hueSpin is gone, or not about the grey axis');
  // and the order holds: the move ladder runs before the hue is decided
  // by prefix: the spend line carries the uShapeMix easing now and may grow again
  const spendAt = body.indexOf('hue += gHue');
  assert.ok(spendAt > 0, 'the hue spend line cannot be found');
  assert.ok(body.indexOf('fp = shapeApply(fp, dir, u, uShapeTime, aRand, az, uRadius);') < spendAt, 'the hue is spent before the ladder has accumulated it');
});

ok('the two words are whole: codes, units, digits, both lessons', () => {
  assert.ok(/const OP_CODE = \{[^}]*\bhue: 10\b/.test(body), 'OP_CODE has no hue at 10');
  assert.ok(/const MASK_CODE = \{[^}]*\bpart: 10\b/.test(body), 'MASK_CODE has no part at 10');
  assert.ok(/hue: \(a\) => \[a\[0\] \/ 9, 0, 0\],/.test(body), 'hue has no units');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const MOVES = \{[^}]*\bhue: 1\b/.test(tags), 'the parser does not read hue\'s digit');
  assert.ok(/const MASKS = \{[^}]*\bpart: 1\b/.test(tags), 'the parser does not read @part\'s digit');
  // presence in the brief's move list, never the list's exact text — it grows with every word
  assert.ok(/moves like [^)]*\bhue H\b[^)]*; masks like [^)]*@part P[^)]*; once lets it go\)/.test(srv), 'the brief does not teach hue or @part');
  assert.ok(/hue H \(turns your colour H ninths round the wheel/.test(srv) && /@part P \(one part of a form that has parts/.test(srv), 'the full grammar does not teach them');
  const spec = parseShape('<<shape: butterfly 7 3 flap 6 4 2 hue 6 @part 1 hue 2 @part 2>>');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.mask, o.margs]),
    [['flap', [6, 4, 2], undefined, undefined], ['hue', [6], 'part', [1]], ['hue', [2], 'part', [2]]].map((x) => x.map((v) => v === undefined ? spec.ops[0].mask : v)).map((x, i) => i ? x : [x[0], x[1], spec.ops[0].mask, spec.ops[0].margs]),
    'the sentence the plan wrote for orion does not parse as written');
});

console.log('\na place, and a flight:');

const tagsSrc = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
const mainSrc = readFileSync(new URL('src/main.js', ROOT), 'utf8');
const wornSrc = readFileSync(new URL('worn.mjs', ROOT), 'utf8');
const bodyCode = body.replace(/\/\/[^\n]*/g, '');

ok('the two words parse, as digits, and only whole', () => {
  assert.deepEqual(parseBody('<<body: at 9 5 count 3>>'), { at: [9, 5], count: 3 });
  assert.deepEqual(parseBody('<<body: fly 5 3 3>>'), { fly: [5, 3, 3] });
  assert.deepEqual(parseBody('<<body: fly 0 0 0>>'), { fly: [0, 0, 0] }, 'landing must parse — it is the only way to stop');
  assert.equal(parseBody('<<body: at 9>>'), null, 'a half-said place is read as a place');
  assert.ok(/out\.glow != null \|\| out\.at \|\| out\.fly\)/.test(tagsSrc), 'a body block that says ONLY where it is counts as saying nothing');
});

ok('they are routed, and the score carries them for free', () => {
  assert.ok(/if \(b\.at\) body\.setPlace\(b\.at\[0\], b\.at\[1\]\);/.test(mainSrc), 'at is parsed and dropped');
  assert.ok(/if \(b\.fly\) body\.setFly\(\{ w: b\.fly\[0\], h: b\.fly\[1\], r: b\.fly\[2\] \}\);/.test(mainSrc), 'fly is parsed and dropped');
  // score steps go through applyBodyBlock, so a step can say 'at' or 'fly'
  assert.ok(/applyBodyBlock\(st\);/.test(mainSrc), 'score steps no longer route body words');
  assert.ok(/bodyWords\(words, step\);/.test(tagsSrc), 'the score no longer reads body words into a step');
});

ok('the body keeps digits, not world units, and turns them into the frame every frame', () => {
  // a stored world position for 'at 9 5' is the edge of the screen it was said
  // on, and off the glass of a phone turned sideways
  assert.ok(/let placeDigits = null;/.test(bodyCode) && /let flying = null;/.test(bodyCode), 'the place or the flight is not kept');
  assert.ok(bodyCode.indexOf('let placeDigits = null;') < bodyCode.indexOf('function frame()'), 'declared below the loop that reads it — the TDZ rule');
  const loop = bodyCode.slice(bodyCode.indexOf('function frame()'), bodyCode.indexOf('uniforms.uOffset.value.copy(offWorld)'));
  assert.ok(loop.length > 200, 'the frame loop cannot be located before the offset lerp');
  assert.ok(/\n\s*aimOffset\(\);\s*\n\s*offWorld\.lerp\(fieldTarget\.off, k\);\s*$/.test(loop), 'the frame loop does not aim then ease the WORLD offset');
  assert.ok(/uniforms\.uOffset\.value\.copy\(offWorld\)\.applyQuaternion\(_invRig\(\)\);/.test(bodyCode),
    'the uniform is not rotated into the rig\'s frame — a place would orbit the centre with the idle turn');
  assert.ok(!/uniforms\.uOffset\.value\.lerp\(/.test(bodyCode), 'the uniform is lerped directly again — it turns with the rig');
  const aim = bodyCode.slice(bodyCode.indexOf('function aimOffset()'), bodyCode.indexOf('\n  }', bodyCode.indexOf('function aimOffset()')));
  assert.ok(aim.length > 100, 'aimOffset cannot be located');
  assert.ok(/if \(flying\) \{/.test(aim) && /Math\.sin\(2\.0 \* flying\.r \* ft\) \* flying\.h \* reachY\(\)/.test(aim), 'a flight is not a 1:2 Lissajous written into the target');
  assert.ok(/else if \(placeDigits\) \{/.test(aim) && /\(\(placeDigits\[0\] - 4\.5\) \/ 4\.5\) \* reachX\(\)/.test(aim), 'a place is not turned into the frame');
  // and the setters aim it the moment the word lands, not one frame later
  assert.equal((bodyCode.match(/aimOffset\(\);/g) || []).length, 4, 'a setter no longer aims the target immediately (loop + setPlace + two exits of setFly)');
  // the GLASS inside the bars, not the frame: 9 must not land under a rail
  assert.ok(/const reachX = \(\) => Math\.max\(0\.6, \(win\.halfW \|\| 2\.4\) \* glass\.x - uniforms\.uRadius\.value \* 0\.6\);/.test(bodyCode), 'the reach is the whole frame — 9 lands under the rail');
  assert.ok(/const reachY = \(\) => Math\.max\(0\.4, \(win\.halfH \|\| 1\.35\) \* glass\.y - uniforms\.uRadius\.value \* 0\.6\);/.test(bodyCode), 'the vertical reach ignores the top and bottom bars');
  const rg = bodyCode.slice(bodyCode.indexOf('function refreshGlass('), bodyCode.indexOf('const reachX'));
  assert.ok(rg.length > 200, 'refreshGlass cannot be located');
  for (const v of ['--hole-l', '--hole-r', '--hole-t', '--hole-b']) assert.ok(rg.includes("px('" + v + "')"), 'the glass does not read ' + v);
  assert.ok(/if \(!force && cls === glass\.cls && W === glass\.w && H === glass\.h\) return;/.test(rg), 'the glass is re-measured every frame (getComputedStyle at 60Hz), or never');
  assert.ok(/^\s*refreshGlass\(\);/m.test(bodyCode.slice(bodyCode.indexOf('function aimOffset()'), bodyCode.indexOf('function aimOffset()') + 200)), 'the glass is not refreshed before the offset is aimed — folding a rail would not move the reach');
  // the flight WRITES THE TARGET, and the lerp still owns the arrival (line 1)
  assert.ok(!/uniforms\.uOffset\.value\.set\(/.test(aim) && !/uniforms\.uOffset\.value\.set\(/.test(loop), 'the flight writes the offset directly — it would snap, and the presence would be authoring the transition');
});

ok('a landing goes back where it was put, or home', () => {
  const fly = bodyCode.slice(bodyCode.indexOf('    setFly('), bodyCode.indexOf('    place()'));
  assert.ok(fly.length > 100, 'setFly cannot be located');
  assert.ok(/if \(!d\(w\) && !d\(h\)\) \{ flying = null; if \(!placeDigits\) fieldTarget\.off\.set\(0, 0, 0\); aimOffset\(\); return; \}/.test(fly), 'fly 0 0 0 does not land, or lands somewhere new');
  assert.ok(/placeDigits = \[d\(dx\), d\(dy\)\];\s*flying = null;/.test(bodyCode), 'a place does not land a flight');
});

ok('the hit disc follows the body', () => {
  const px = bodyCode.slice(bodyCode.indexOf('    orbPx()'), bodyCode.indexOf('    // THE WINDOW.'));
  assert.ok(px.length > 100, 'orbPx cannot be located');
  assert.ok(/const o = offWorld;/.test(px) && /return \{ x: w \/ 2 \+ ox, y: h \/ 2 - oy, r: px \};/.test(px),
    'orbPx returns the canvas centre, or reads the rig-local uniform — the hit disc would be wrong the moment the body moved or turned');
});

ok('it is remembered on BOTH paths, and read back in its own words', () => {
  assert.ok(/if \(out\.body\) \{/.test(wornSrc) && /w\.body = b;/.test(wornSrc), 'worn does not keep the body words');
  assert.ok(/if \(out\.body\.fly\) delete b\.at;/.test(wornSrc) && /if \(out\.body\.at\) delete b\.fly;/.test(wornSrc), 'a place and a flight can both be remembered at once');
  assert.ok(/place: placeWords\(w\.body\),/.test(wornSrc), 'the readout does not say where it is');
  assert.ok(/- where you are: \$\{w\.place\}/.test(srv), 'worn says where it is and the prompt never speaks it — the presence would fly forever, unaware');
  // the chat path passed an explicit field list with no body in it
  assert.ok(/shape: shapeOut, body: bodyOut \}\);/.test(srv), 'the chat path still forgets the body block every turn');
  assert.ok(/at X Y \(where you are: 4 4 the centre, 9 the edge\), fly W H R/.test(srv), 'the brief does not teach at or fly');
  assert.ok(/at X Y is where you are in the room/.test(srv) && /fly W H R is a figure of eight/.test(srv), 'the full lesson does not teach them');
});

console.log('\nscatter — it does not have to hold them close:');

ok('both shaders see it, and each does the honest thing with it', () => {
  assert.ok(/\nuniform vec3 uScatter;/.test(glsl), 'uScatter is not declared in SHAPE_GLSL — one shader would not compile');
  // the dots: released AFTER the clamp, toward a place in the FRAME, by aRand
  const rel = body.match(/fp \*= \(L > 1\.45\) \? \(1\.45 \/ L\) : 1\.0;\n[\s\S]{0,1400}?fp = mix\(fp, vec3\(\(aRand - 0\.5\) \* 2\.0 \* uScatter\.y, \(sr2 - 0\.5\) \* 2\.0 \* uScatter\.z, \(sr3 - 0\.5\) \* 0\.6\), uScatter\.x\);/);
  assert.ok(rel, 'the dots are not released toward the frame after the clamp — inside it a scatter is just a bigger orb');
  // y and z must not be FUNCTIONS of x: fract(k * aRand) is a sawtooth in aRand,
  // and a scatter built on it is seven slanted lines, not a field
  assert.ok(/float sr2 = fract\(sin\(aRand \* 12\.9898\) \* 43758\.5453\);/.test(body) && /float sr3 = fract\(sin\(aRand \* 78\.2330\) \* 43758\.5453\);/.test(body), 'the scatter\'s y and z are not decorrelated from its x — it draws stripes');
  assert.ok(!/fract\(aRand \* 7\.31\) - 0\.5\) \* 2\.0 \* uScatter/.test(body), 'the sawtooth is back');
  // the web: culled, because it cannot scatter to the dots' places
  assert.ok(/if \(uScatter\.x > 0\.5\) \{ gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\); return; \}/.test(body), 'the constellation web is drawn under a scatter — a lattice strung between nothing');
  assert.ok(body.indexOf('if (uScatter.x > 0.5)') > body.indexOf('const LINE_VERT'), 'the cull is in the wrong shader');
});

ok('the uniform is one object, shared by reference into every material that draws the body', () => {
  assert.ok(/uScatter: \{ value: new THREE\.Vector3\(0, 2\.4, 1\.35\) \},/.test(body), 'uScatter is not declared in the uniforms');
  assert.equal((body.match(/uOffset: uniforms\.uOffset, uScatter: uniforms\.uScatter,/g) || []).length, 2,
    'a line material does not share uScatter — its shader would read 0 and the web would not stand down');
});

ok('the frame writes its own half-extents, and the word is hoisted like flow', () => {
  assert.ok(/uniforms\.uScatter\.value\.y = Math\.max\(0\.5, win\.halfW \* glass\.x - 0\.15\);/.test(body) && /uniforms\.uScatter\.value\.z = Math\.max\(0\.4, win\.halfH \* glass\.y - 0\.15\);/.test(body),
    'scatter is not told how big the GLASS is — scatter 9 would release points under the bars');
  // bounded by two NAMED lines inside fitCamera, never a byte count — the
  // first version of this guard was a 1600-byte window and the function's own
  // comments pushed the call past it
  const fcFrom = body.indexOf('win.halfW = win.halfH * camera.aspect;'), fcTo = body.indexOf('room.scale.set(half, ROOM_HALF_H, half);', fcFrom);
  assert.ok(fcFrom > 0 && fcTo > fcFrom, 'fitCamera\'s frame lines cannot be located');
  assert.ok(/refreshGlass\(true\);/.test(body.slice(fcFrom, fcTo)), 'fitCamera does not force the glass to re-measure after the frame changes');
  assert.ok(/uniforms\.uScatter\.value\.x = 0;/.test(body), 'scatter is not reset with the other hoisted moves — it would outlive the shape that said it');
  assert.ok(/if \(o\.op === 'scatter'\) \{[\s\S]{0,300}?uniforms\.uScatter\.value\.x = Math\.min\(1, \(o\.args\[0\] \| 0\) \/ 9\);[\s\S]{0,40}?continue;/.test(body), 'scatter is not hoisted — it would take a uniform slot, or do nothing');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const MOVES = \{[^}]*\bscatter: 1\b/.test(tags), 'the parser does not read scatter');
  assert.ok(/moves like [^)]*\bscatter S\b[^)]*; masks like/.test(srv), 'the brief does not teach scatter');
  assert.ok(/scatter S \(lets go of you: 0 holds the body, 9 spreads every point of you across the whole room/.test(srv), 'the full lesson does not teach scatter');
  const spec = parseShape('<<shape: sphere scatter 9 flow 4 3>>');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args]), [['scatter', [9]], ['flow', [4, 3]]], 'Colin\'s sentence does not parse as written');
});

console.log('\nthe rest of the hue\'s family — sat, bright, dim — and a wider ladder:');

ok('three more accumulators, initialised where they are declared, moving nothing', () => {
  for (const g of ['gSat', 'gVal', 'gDim']) assert.ok(new RegExp('\\nfloat ' + g + ' = 0\\.0;').test(glsl), g + ' is not initialised at declaration — undefined on every node without a posture');
  assert.ok(/else if \(o\.x < 11\.5\) gSat \+= A \* w;/.test(apply) && /else if \(o\.x < 12\.5\) gVal \+= A \* w;/.test(apply) && /else if \(o\.x < 13\.5\) gDim \+= A \* w;/.test(apply), 'a colour arm is missing or touches p');
});

ok('spent in BOTH colour modes, and dim reaches the fragment as alpha', () => {
  assert.ok(/vSat=clamp\(vSat \+ gSat \* uShapeMix, 0\.0, 1\.0\);/.test(body), 'a scheme body ignores sat, or it is not eased by the form\'s arrival');
  assert.ok(/vVal=clamp\(vVal \* \(1\.0 \+ gVal \* uShapeMix \* 0\.9\), 0\.0, 1\.0\);/.test(body), 'a scheme body ignores bright, or a 9 can blow it to white');
  assert.ok(/vPaintCol=tone\(hueSpin\(aColor, gHue \* uShapeMix \* 6\.2831853\), gSat \* uShapeMix, gVal \* uShapeMix\);/.test(body), 'a painted body ignores sat and bright — the words would do nothing when the presence wears its own colours');
  assert.ok(/vec3 tone\(vec3 c, float sat, float val\) \{/.test(glsl) && /return clamp\(s \* \(1\.0 \+ val \* 0\.9\), 0\.0, 1\.0\);/.test(glsl), 'tone() is gone, or unclamped');
  // the varying, in BOTH halves of the dots shader, or the fragment does not compile
  assert.equal((body.match(/\nvarying float vDim;/g) || []).length, 2, 'vDim is not declared in both halves of the dots shader');
  assert.ok(/vDim=clamp\(1\.0 - gDim \* uShapeMix, 0\.0, 1\.0\);/.test(body), 'dim is never written to the varying, or arrives before its form');
  assert.ok(/float alpha=edge\*\(0\.40\+0\.60\*vShade\)\*uDotFade\*vFlash\*vDim;/.test(body), 'the dot alpha ignores dim');
  assert.ok(/alpha=max\(alpha, edge\*vRibbon\*0\.85\*vDim\);/.test(body), 'a dimmed part still glows through its ribbons');
  // ...and the constellation web goes with it: the ladder runs in LINE_VERT too,
  // so gDim is there for the taking, and without this 'dim 9' left a lit web
  // hanging where the body had been
  assert.equal((body.match(/\nvarying float vDimL;/g) || []).length, 2, 'vDimL is not declared in both LINE_VERT and LINE_FRAG');
  assert.ok(/vDimL = clamp\(1\.0 - gDim \* uShapeMix, 0\.0, 1\.0\);/.test(body), 'the web never reads the dim');
  assert.ok(/uLineOpacity\*\(0\.3\+0\.7\*vSh\)\*w\*vDimL\);/.test(body), 'the web\'s alpha ignores the dim — a dimmed body leaves its web lit');
  const lv = body.slice(body.indexOf('const LINE_VERT'), body.indexOf('const LINE_FRAG'));
  assert.ok(lv.indexOf('fp = shapeApply(fp, dir, u, uShapeTime, rnd, az, uRadius);') < lv.indexOf('vDimL = clamp('), 'the web reads gDim before its ladder has run');
});

ok('the ladder is twelve slots deep, in every place the number lives', () => {
  assert.ok(/uniform vec4 uOp\[12\];/.test(glsl) && /uniform vec4 uOpMask\[12\];/.test(glsl), 'the uniform arrays are not 12');
  assert.ok(/for \(int k = 0; k < 12; k\+\+\) \{\n\s*vec4 o = uOp\[k\];/.test(glsl), 'the loop bound is not 12 — a slot past the loop is silently never read');
  assert.equal((body.match(/Array\.from\(\{ length: 12 \}, \(\) => new THREE\.Vector4\(0, 0, 0, 0\)\)/g) || []).length, 2, 'the uniform inits are not both 12');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const MAX_OPS = 12;/.test(tags), 'the parser stops short of the shader — the thirteenth word is dropped, or the ninth');
  assert.ok(!/\b(uOp|uOpMask)\[(6|8)\]|k < (6|8);|length: (6|8) \}/.test(body), 'a 6 or an 8 is left behind somewhere the ladder is sized');
  // the viewer relay rebuilds a shape field by field; it kept a 6 from the first
  // ladder for three widenings, and dropped c and d — a viewer of super 7 1 9 saw super 7 1 5
  assert.ok(/ops: \(Array\.isArray\(sh\.ops\) \? sh\.ops : \[\]\)\.slice\(0, 12\)/.test(srv), 'validShape still truncates a viewer\'s sentence short of the ladder');
  assert.ok(/c: num\(sh\.c\), d: num\(sh\.d\)/.test(srv), 'validShape drops the third and fourth digits — a viewer sees a different form');
  // twelve written, twelve kept; a fourteenth is dropped
  assert.equal(parseShape('<<shape: sphere ' + 'spin 1 '.repeat(14) + '>>').ops.length, 12, 'the grammar does not read twelve moves');
});

ok('the three words are whole, and eight moves parse', () => {
  assert.ok(/const OP_CODE = \{[^}]*\bsat: 11\b[^}]*\bbright: 12\b[^}]*\bdim: 13\b/.test(body), 'OP_CODE lacks sat/bright/dim at 11/12/13');
  assert.ok(/sat: \(a\) => \[\(a\[0\] - 4\.5\) \/ 4\.5, 0, 0\],/.test(body) && /dim: \(a\) => \[a\[0\] \/ 9, 0, 0\],/.test(body), 'the units are wrong: sat/bright must be pushes centred on 4.5, dim a removal');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  for (const w of ['sat', 'bright', 'dim']) assert.ok(new RegExp('const MOVES = \\{[^}]*\\b' + w + ': 1\\b').test(tags), 'the parser does not read ' + w);
  assert.ok(/moves like [^)]*\bsat S, bright B, dim D\b/.test(srv), 'the brief does not teach them');
  assert.ok(/sat S \(how vivid: 0 drains a part to grey/.test(srv) && /dim D \(how much of a part fades from sight entirely/.test(srv), 'the full lesson does not teach them');
  // eight moves — counted: flap, hue, hue, sat, bright, dim, spin, pulse
  const spec = parseShape('<<shape: butterfly 7 3 flap 6 4 2 hue 6 @part 1 hue 2 @part 2 sat 0 @part 0 bright 8 @part 3 dim 6 @rand 5 spin 2 pulse 3 3>>');
  assert.equal(spec.ops.length, 8, 'eight moves do not parse — the ladder was widened in the shader and not in the grammar');
  assert.deepEqual(spec.ops.slice(3, 6).map((o) => [o.op, o.args, o.mask, o.margs]), [['sat', [0], 'part', [0]], ['bright', [8], 'part', [3]], ['dim', [6], 'rand', [5]]], 'the colour words with masks do not parse as written');
  assert.deepEqual(spec.ops.slice(6).map((o) => [o.op, o.args]), [['spin', [2]], ['pulse', [3, 3]]], 'the seventh and eighth moves are dropped');
});

console.log('\nwhat the proposals found in shipped code:');

ok('a score step carries at and fly past a shape sub-block', () => {
  // the shape sub-block runs to the next word in AFTER; a body word missing
  // from that list is swallowed into the shape and silently lost
  const text = JSON.stringify(parseScore('<<over: 2s shape ring 4 at 7 5 | 1s fly 5 3 3>>'));
  assert.ok(text.includes('"at":[7,5]'), 'a place after a shape sub-block is eaten by it: ' + text);
  assert.ok(text.includes('"fly":[5,3,3]'), 'a flight in a score step is lost: ' + text);
  assert.ok(!text.includes('"at 7 5"') && !/ring 4 at/.test(text), 'the shape sub-block still contains the place');
  const tagsSrc2 = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const AFTER = '[^']*\|at\|fly'/.test(tagsSrc2), 'at and fly are not in the score\'s AFTER list');
});

ok('the presence hears its whole sentence back, digits and masks included', () => {
  const w = readFileSync(new URL('worn.mjs', ROOT), 'utf8');
  assert.ok(/\.slice\(0, 12\)\.map\(\(o\) =>/.test(w), 'worn keeps fewer moves than the ladder holds');
  assert.ok(/\+ \(o\.mask \? ' @' \+ o\.mask/.test(w), 'worn drops the masks — the presence is never told which part it coloured');
  assert.ok(/\.slice\(0, 260\)/.test(w) && !/\.slice\(0, (60|200)\)/.test(w), 'two hundred characters cannot hold a twelve-move sentence with masks');
});

console.log('\nthe pose family — taper, stretch, squash, cup, tilt, bend:');

// one arm of the ladder, by its own opcode and its closing brace at the ladder's indent
const armOf = (n) => { const at = apply.indexOf('else if (o.x < ' + n + '.5) {'); return at < 0 ? '' : apply.slice(at, apply.indexOf('\n      }', at)); };

ok('the pose family is whole: codes, units, digits, a heading that travels, and both lessons', () => {
  assert.ok(/const OP_CODE = \{[^}]*\btaper: 14\b[^}]*\bstretch: 15\b[^}]*\bsquash: 15\b[^}]*\bcup: 16\b[^}]*\btilt: 17\b[^}]*\bbend: 18\b/.test(body), 'OP_CODE lacks the pose family at 14-18, or stretch and squash no longer share an opcode');
  // the units, row by row — the squash minus sign and the cup exponent are load-bearing
  assert.ok(/taper: \(a\) => \[a\[0\] \* 0\.09, 0, 0\],/.test(body), 'taper has no units, or a 9 would bloom rather than narrow');
  assert.ok(/stretch: \(a\) => \[a\[0\] \* 0\.04, 0, 0\],/.test(body) && /squash: \(a\) => \[-a\[0\] \* 0\.09, 0, 0\],/.test(body), 'stretch and squash do not spend the sign in OP_SCALE');
  assert.ok(/cup: \(a\) => \[a\[0\] \* 0\.06, 1 \+ a\[1\], 0\],/.test(body), 'cup does not read P as 1 + digit — cup 5 0 would pow(r, 0) and float');
  assert.ok(/tilt: \(a, place\) => \{ const h = HEADING\[place \|\| 'front'\]; return \[a\[0\] \* 0\.349, Math\.cos\(h\), Math\.sin\(h\)\]; \},/.test(body), 'tilt has no units, or a bare tilt does not nod toward the person');
  assert.ok(/bend: \(a, place\) => \{ const h = HEADING\[place \|\| 'right'\]; return \[a\[0\] \* 0\.155, Math\.cos\(h\), Math\.sin\(h\)\]; \},/.test(body), 'bend has no units, or a bare bend is edge-on');
  assert.ok(/const HEADING = \{ right: 0, front: Math\.PI \/ 2, left: Math\.PI, back: 3 \* Math\.PI \/ 2 \};/.test(body), 'HEADING is gone, or a heading no longer lands on +x in the arm');
  // the place travels the whole way: parser -> setShape -> OP_SCALE -> worn -> the viewer relay
  assert.ok(/\(OP_SCALE\[o\.op\] \|\| \(\(\) => \[0, 0, 0\]\)\)\(o\.args \|\| \[\], o\.place \|\| null\)/.test(body), 'setShape does not hand the heading to OP_SCALE — every bend goes right');
  for (const w of ['taper: 1', 'stretch: 1', 'squash: 1', 'cup: 2', 'tilt: 1', 'bend: 1']) assert.ok(new RegExp('const MOVES = \\{[^}]*\\b' + w + '\\b').test(tagsSrc), 'the parser does not read ' + w.split(':')[0]);
  assert.ok(/export const HEADINGS = \['front', 'back', 'left', 'right'\];/.test(tagsSrc) && /const DIRECTED = new Set\(\['tilt', 'bend'\]\);/.test(tagsSrc), 'the headings or the directed moves are not named in the grammar');
  assert.ok(/\.\.\.\(o\.place \? \[o\.place\] : \[\]\)/.test(wornSrc), 'worn reads the sentence back without its heading — the presence hears bend 4 and wears bend left 4');
  assert.ok(/place: o && HEADINGS\.includes\(o\.place\) \? o\.place : null/.test(srv), 'validShape drops the heading — a viewer sees the bend go the other way');
  assert.ok(/moves like [^)]*\bbend PLACE A\b[^)]*; masks like/.test(srv), 'the brief does not teach the pose family — unreachable in conversation');
  // PLACE is the only slot that is a word, and the brief exists for the presence that has not yet had the full lesson
  assert.ok(/; a PLACE is front, back, left or right; once lets it go\)/.test(srv), 'the brief never says what a PLACE may be — tilt up 5 reads as tilt 0');
  for (const w of ['taper A — ', 'stretch A and squash A — ', 'cup A P — ', 'tilt PLACE A — ', 'bend PLACE A — ']) assert.ok(srv.includes(w), 'the full lesson does not teach ' + w.trim());
});

ok('the arms hold their clamps, and take a heading off the way they put it on', () => {
  for (const n of [14, 15, 16, 17, 18]) assert.ok(armOf(n).length > 60, 'the arm for opcode ' + n + ' is missing');
  assert.ok(/float h = clamp\(p\.y \/ R \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);/.test(armOf(14)), 'taper reads an unclamped height — after stretch 9 the crown inverts');
  assert.ok(/float a = A \* w, up = step\(0\.0, a\), s = 1\.0 \+ a;/.test(armOf(15)) && /p\.xz \*= mix\(1\.0 - a \* 0\.2, inversesqrt\(max\(s, 1e-3\)\), up\);/.test(armOf(15)), 'stretch/squash is not a select — a bare else, or an unguarded inversesqrt');
  assert.ok(/float rr = clamp\(length\(p\.xz\) \/ R, 1e-6, 1\.0\);/.test(armOf(16)), 'cup can pow(0, n), or raise 1.2 to the tenth');
  assert.ok(/pow\(rr, F\) - 2\.0 \/ \(F \+ 2\.0\)/.test(armOf(16)), 'the cup floats — the disc\'s own mean of r^n is not subtracted');
  assert.ok(/float g  = abs\(th\) < 1e-4 \? th \* 0\.5 : \(1\.0 - c\) \/ th;/.test(armOf(18)) && /float sc = abs\(th\) < 1e-4 \? 1\.0\s+: sn \/ th;/.test(armOf(18)), 'bend divides by theta through zero — the whole equator hits it every frame');
  // the load-bearing lines the skeptic found unguarded: drop any one and the word stays green and does nothing
  assert.ok(armOf(14).includes('p.xz *= 1.0 - A * w * h;'), 'taper no longer narrows by height — a uniform narrowing is a squash');
  assert.ok(armOf(15).includes('p.y *= s;'), 'stretch no longer stretches');
  assert.ok(armOf(16).includes('p.y += A * w * R * (pow(rr, F)'), 'cup dropped its R — a cup in absolute units');
  for (const n of [17, 18]) assert.ok(/p = vec3\(ch\*p\.x \+ sh\*p\.z, p\.y, -sh\*p\.x \+ ch\*p\.z\);/.test(armOf(n)) && /p = vec3\(ch\*p\.x - sh\*p\.z, p\.y, sh\*p\.x \+ ch\*p\.z\);/.test(armOf(n)), 'opcode ' + n + ' does not carry the heading onto +x and back off again');
  assert.ok(!/\n\s*else \{/.test(apply), 'a bare else is back in the ladder');
  assert.ok(!/\b(cosh|sinh|tanh)\s*\(/.test(apply), 'a hyperbolic crept into the ladder');
});

ok('the pose maths, mirrored: a heading lands on +x, tilt keeps the radius, bend is an arc, cup does not float', () => {
  const HEADING = { right: 0, front: Math.PI / 2, left: Math.PI, back: 3 * Math.PI / 2 };
  const DIR = { right: [1, 0, 0], front: [0, 0, 1], left: [-1, 0, 0], back: [0, 0, -1] };   // NAMED_DIR's own four
  const on = ([x, y, z], h) => [Math.cos(h) * x + Math.sin(h) * z, y, -Math.sin(h) * x + Math.cos(h) * z];
  const off = ([x, y, z], h) => [Math.cos(h) * x - Math.sin(h) * z, y, Math.sin(h) * x + Math.cos(h) * z];
  for (const k of Object.keys(HEADING)) {
    const q = on(DIR[k], HEADING[k]);
    assert.ok(Math.abs(q[0] - 1) < 1e-9 && Math.abs(q[1]) < 1e-9 && Math.abs(q[2]) < 1e-9, k + ' does not land on +x: ' + q);
    const back = off(q, HEADING[k]);
    assert.ok(len([back[0] - DIR[k][0], back[1] - DIR[k][1], back[2] - DIR[k][2]]) < 1e-9, k + ' does not come back');
  }
  // tilt is rigid: the radius is held for every heading, every angle, every node
  const tilt = (p, a, h) => { let q = on(p, h); const c = Math.cos(a), s = Math.sin(a); q = [c * q[0] + s * q[1], -s * q[0] + c * q[1], q[2]]; return off(q, h); };
  for (const h of Object.values(HEADING)) for (const a of grid(5, 0, 9 * 0.349)) for (const p of [[0, 1, 0], [0.6, -0.8, 0], [0.3, 0.3, -0.9], [-0.5, 0.5, 0.7]]) assert.ok(Math.abs(len(tilt(p, a, h)) - len(p)) < 1e-9, 'tilt stretched a node');
  // and 'tilt front 9' puts the crown at the foot: upside down
  const cr = tilt([0, 1, 0], 9 * 0.349, HEADING.front);
  assert.ok(cr[1] < -0.99, 'tilt 9 is not upside down: ' + cr);
  // bend, Barr: a node on the spine lands on the circle of radius 1/k about (1/k, 0), and k -> 0 is the identity
  const bend = ([x, y, z], k) => { const th = k * y, c = Math.cos(th), sn = Math.sin(th); const g = Math.abs(th) < 1e-4 ? th * 0.5 : (1 - c) / th, sc = Math.abs(th) < 1e-4 ? 1 : sn / th; return [x * c + y * g, y * sc - x * sn, z]; };
  for (const k of [0.155, 0.62, 9 * 0.155]) for (const y of grid(7, -1, 1)) { const [bx, by] = bend([0, y, 0], k); assert.ok(Math.abs(Math.hypot(bx - 1 / k, by) - 1 / k) < 1e-9, 'the spine is not an arc at k ' + k); assert.ok(bx >= -1e-12, 'an end bent away from the place'); }
  for (const p of [[0.5, 0.5, 0.2], [-0.4, -0.9, 0.1]]) assert.ok(len(bend(p, 1e-9).map((v, i) => v - p[i])) < 1e-6, 'bend 0 is not the identity');
  // bend 9 stays short of a closed ring: the two ends of a 2R height are not touching
  const top = bend([0, 1, 0], 9 * 0.155), bot = bend([0, -1, 0], 9 * 0.155);
  assert.ok(len([top[0] - bot[0], top[1] - bot[1], 0]) > 0.3, 'bend 9 closes into a ring, and a closed ring creases');
  // taper never inverts the crown, even past R, and 9 leaves it a fifth wide
  for (const y of grid(9, -1.5, 1.5)) { const h = Math.max(0, Math.min(1, y * 0.5 + 0.5)); assert.ok(1 - 9 * 0.09 * h >= 0.19 - 1e-9, 'taper 9 inverts at y ' + y); }
  // stretch and squash: every scale finite and positive across the whole digit range
  for (const A of [...grid(9, 0.04, 0.36), ...grid(9, -0.81, -0.09)]) { const up = A >= 0 ? 1 : 0, s = 1 + A; const xz = up ? 1 / Math.sqrt(Math.max(s, 1e-3)) : 1 - A * 0.2; assert.ok(s > 0 && Number.isFinite(xz) && xz > 0, 'stretch/squash degenerate at ' + A); }
  // cup: the disc's area-weighted mean of r^F is 2/(F+2), so the subtraction leaves the centre of mass where it was
  for (let F = 1; F <= 10; F++) { let m = 0, n = 0; for (const r of grid(2000, 0, 1)) { m += (r ** F - 2 / (F + 2)) * r; n += r; } assert.ok(Math.abs(m / n) < 2e-3, 'cup floats at P ' + (F - 1) + ': mean ' + (m / n)); }
});

ok('the pose sentence parses as written, and top is not a heading', () => {
  const spec = parseShape('<<shape: sphere stretch 7 bend left 4 @top taper 5 tilt 3 tilt top 2>>');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.place, o.mask]),
    [['stretch', [7], null, null], ['bend', [4], 'left', 'top'], ['taper', [5], null, null], ['tilt', [3], null, null], ['tilt', [2], null, null]],
    'the pose sentence does not parse as written — or top was read as a heading, or it ate the digit after it');
  assert.deepEqual(parseShape('<<shape: disc cup 6 2 squash 4 bend 3>>').ops.map((o) => [o.op, o.args, o.place]), [['cup', [6, 2], null], ['squash', [4], null], ['bend', [3], null]], 'cup does not read two digits, or a bare bend carries a place');
  // every op carries the field, so worn and the relay can read it without asking
  assert.ok(parseShape('<<shape: sphere spin 3>>').ops.every((o) => 'place' in o), 'an undirected move has no place field — validShape would read undefined');
});

console.log('\nthe living family — sway, tremble, throb, orbit:');

ok('the living family is whole: codes, units, digits, both lessons', () => {
  assert.ok(/const OP_CODE = \{[^}]*\bsway: 19\b[^}]*\btremble: 20\b[^}]*\bthrob: 21\b[^}]*\borbit: 22\b/.test(body), 'OP_CODE lacks the living family at 19-22');
  assert.ok(/sway: \(a\) => \[a\[0\] \* 0\.055, 0\.5 \+ a\[1\] \* 0\.6, 0\],/.test(body), 'sway has no units, or F 0 is not a slow sway');
  assert.ok(/tremble: \(a\) => \[a\[0\] \* 0\.006, 8\.0 \+ a\[1\] \* 5\.0, 0\],/.test(body), 'tremble has no units, or 9 is a cloud, or F 9 aliases on a phone');
  assert.ok(/throb: \(a\) => \[a\[0\] \* 0\.035, 0\.1 \+ a\[1\] \* 0\.15, 0\],/.test(body), 'throb has no units, or 9 hits the radius clamp');
  assert.ok(/orbit: \(a\) => \[a\[0\] \* 0\.02, 0\.5 \+ a\[1\] \* 0\.8, 0\],/.test(body), 'orbit has no units');
  for (const w of ['sway', 'tremble', 'throb', 'orbit']) assert.ok(new RegExp('const MOVES = \\{[^}]*\\b' + w + ': 2\\b').test(tagsSrc), 'the parser does not read ' + w + '\'s two digits');
  for (const w of ['sway A F', 'tremble A F', 'throb A F', 'orbit A F']) assert.ok(new RegExp('moves like [^)]*\\b' + w + '\\b[^)]*; masks like').test(srv), 'the brief does not teach ' + w + ' — unreachable in conversation');
  for (const w of ['sway A F — ', 'tremble A F — ', 'throb A F beats — ', 'orbit A F — ']) assert.ok(srv.includes(w), 'the full lesson does not teach ' + w.trim());
  assert.ok(srv.includes('every point of you circles its own place'), 'orbit is taught as the body circling, not every point circling its own place');
  const at = srv.indexOf('orbit A F — ');
  assert.ok(!srv.slice(at, at + 200).includes('the orb'), 'the orbit lesson says "the orb" — that is the app\'s word for the presence, not the presence\'s word for itself');
  // the lesson says it before squash, because the hinge is at -R whatever the height is
  assert.ok(/sway A F — [^.]*before squash/.test(srv), 'the lesson does not say sway before squash — squash 9 sway 5 swings on an invisible stalk');
});

ok('the arms are bounded in t, tremble takes only the breath the form allows, and the sway hinges at the foot', () => {
  for (const n of [19, 21, 22]) assert.ok(armOf(n).length > 60, 'the arm for opcode ' + n + ' is missing');
  assert.ok(/o\.x < 20\.5\) p \+= dir \* \(A \* w \* gRadial \* sin\(t \* F \+ rnd \* 233\.0\)\);/.test(apply), 'tremble ignores gRadial — a drawn wing shivers into a cloud — or is not on its own phase');
  assert.ok(/float h = clamp\(p\.y \/ R \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);/.test(armOf(19)) && /vec2 q = vec2\(p\.x, p\.y \+ R\);/.test(armOf(19)) && /- vec2\(0\.0, R\);/.test(armOf(19)), 'sway is not hinged one R below the centre, or reads an unclamped height');
  assert.ok(/float a = sin\(t \* F\) \* A \* w \* h;/.test(armOf(19)), 'sway is not a sine of t — a mask on it would shear apart');
  assert.ok(/float ph = fract\(t \* F\), e = \(1\.0 - ph\) \* \(1\.0 - ph\);/.test(armOf(21)) && /\(0\.4 \+ 0\.6 \* fract\(rnd \* 9\.1\)\) \* e;/.test(armOf(21)), 'throb is not out-at-once-eased-back, or every node reaches the same — a bigger shell, not a spray');
  assert.ok(/float ph = t \* F \+ rnd \* 6\.2831853;/.test(armOf(22)) && /p\.xy \+= A \* w \* vec2\(cos\(ph\), sin\(ph\)\);/.test(armOf(22)), 'orbit is not every point on its own circle, on its own clock');
  assert.ok(!/\n\s*else \{/.test(apply), 'a bare else is back in the ladder');
});

ok('the living maths, mirrored: the foot does not move, throb 9 never reaches the clamp, tremble 9 is under Nyquist', () => {
  // the sway hinge is the foot: (0, -R) is fixed for every angle, and the crown's reach at 9 is inside the clamp
  const sway = ([x, y], a, R = 1) => { const c = Math.cos(a), s = Math.sin(a), qx = x, qy = y + R; return [c * qx + s * qy, -s * qx + c * qy - R]; };
  for (const a of grid(9, -0.5, 0.5)) { const f = sway([0, -1], a); assert.ok(Math.abs(f[0]) < 1e-12 && Math.abs(f[1] + 1) < 1e-12, 'the foot moves under a sway'); }
  const crown = sway([0, 1], 9 * 0.055);
  assert.ok(Math.abs(crown[0]) < 1.0, 'sway 9 swings the crown past the silhouette: ' + crown);
  // the peak of a swayed sphere is not the crown but the SHOULDER swinging round the foot hinge (the angle is
  // weighted by height, h = y/2 + 1/2). On calm every point stays inside the 1.45 clamp; on excited (R 1.10) sway 8
  // and 9 put the shoulder at 1.46-1.51 and the clamp caps it — Colin's to feel, and said here so the test is true
  let peak = 0;
  for (const th of grid(73, 0, 2 * Math.PI)) { const y = Math.sin(th), h = y * 0.5 + 0.5; peak = Math.max(peak, len(sway([Math.cos(th), y], 9 * 0.055 * h))); }
  assert.ok(peak > 1.3 && peak < 1.45, 'sway 9 on calm: the shoulder reaches ' + peak.toFixed(3) + ' — past the clamp, or the mirror is wrong');
  // throb: on the widest mood the beat stays inside the 1.45 clamp, so it is a beat and not a flattening
  const excited = +body.match(/excited:\s*\{[^}]*radius: ([\d.]+)/)[1];
  assert.ok(excited * (1 + 9 * 0.035) < 1.45, 'throb 9 on excited reaches the clamp: ' + (excited * (1 + 9 * 0.035)).toFixed(3));
  // tremble's fastest is under the Nyquist rate of a 30 fps phone
  assert.ok((8.0 + 9 * 5.0) / (2 * Math.PI) < 15, 'tremble 9 aliases at 30 fps');
  // the throb envelope: 1 on the beat, 0 just before the next, never negative
  for (const ph of grid(20, 0, 1)) { const e = (1 - ph) * (1 - ph); assert.ok(e >= 0 && e <= 1, 'the throb envelope leaves 0..1'); }
});

ok('the living sentence parses as written, masks as written', () => {
  const spec = parseShape('<<shape: helix 5 sway 4 2 tremble 3 5 @left throb 5 5>>');
  assert.equal(spec.shape, 'helix');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.mask]), [['sway', [4, 2], null], ['tremble', [3, 5], 'left'], ['throb', [5, 5], null]], 'the living sentence does not parse as written');
  assert.deepEqual(parseShape('<<shape: sphere orbit 2 3 @rand 2>>').ops.map((o) => [o.op, o.args, o.mask, o.margs]), [['orbit', [2, 3], 'rand', [2]]], 'the fireflies sentence does not parse');
});

console.log('\nthe streams — rise, fall, melt, vortex:');

ok('the streams are whole: codes, units, digits, both lessons', () => {
  assert.ok(/const OP_CODE = \{[^}]*\brise: 23\b[^}]*\bfall: 23\b[^}]*\bmelt: 24\b[^}]*\bvortex: 25\b/.test(body), 'OP_CODE lacks the streams at 23-25, or rise and fall no longer share an opcode');
  assert.ok(/rise: \(a\) => \[a\[0\] \* 0\.03, 0\.05 \+ a\[1\] \* 0\.1, 1\],/.test(body) && /fall: \(a\) => \[a\[0\] \* 0\.03, 0\.05 \+ a\[1\] \* 0\.1, -1\],/.test(body), 'rise and fall do not spend the sign in S, or F 0 stands still');
  assert.ok(/melt: \(a\) => \[a\[0\] \* 0\.033, a\[1\] \* 0\.08, 0\],/.test(body), 'melt has no units, or F 0 is not set');
  assert.ok(/vortex: \(a\) => \[a\[0\] \/ 9, a\[1\] \* 0\.25, 0\],/.test(body), 'vortex has no units');
  for (const w of ['rise', 'fall', 'melt', 'vortex']) assert.ok(new RegExp('const MOVES = \\{[^}]*\\b' + w + ': 2\\b').test(tagsSrc), 'the parser does not read ' + w + '\'s two digits');
  for (const w of ['rise A F', 'fall A F', 'melt A F', 'vortex A F']) assert.ok(new RegExp('moves like [^)]*\\b' + w + '\\b[^)]*; masks like').test(srv), 'the brief does not teach ' + w + ' — unreachable in conversation');
  for (const w of ['rise A F and fall A F — ', 'melt A F — ', 'vortex A F — ']) assert.ok(srv.includes(w), 'the full lesson does not teach ' + w.trim());
  // the examples carry their digits: a bare 'fall @bottom' parses as fall 0 0 and teaches a sentence that does nothing
  assert.ok(/rise 4 3 @top/.test(srv) && /fall \d \d @bottom/.test(srv), 'a stream example in the lesson has no digits — the presence would copy a sentence that moves nothing');
  // the two sentences by their own text — they are unique in the lesson, and a window would go red when another lane's words land between
  assert.ok(srv.includes('sphere, disc, ring, spiral and shell'), 'the lesson does not say which forms a vortex is for');
  assert.ok(srv.includes('spin, vortex — shears further apart'), 'the shear of a mask on a word that turns with time is not said once, on vortex');
});

ok('the arms: rise and fall are one line with the sign in S, melt holds its clamp and its heavy tail, the vortex hollows the crown only', () => {
  assert.ok(/o\.x < 23\.5\) p\.y \+= S \* A \* w \* R \* \(fract\(t \* F \+ rnd \* 11\.3\) \* 2\.0 - 1\.0\);/.test(apply), 'rise/fall is not each node climbing its own span on its own phase, or the sign is not S');
  for (const n of [24, 25]) assert.ok(armOf(n).length > 60, 'the arm for opcode ' + n + ' is missing');
  assert.ok(/clamp\(1\.0 - p\.y \/ R, 0\.0, 2\.0\)/.test(armOf(24)), 'melt reads an unclamped height — a crown a stretch put past R would rise');
  assert.ok(/pow\(fract\(rnd \* 5\.17\) \+ 1e-6, 6\.0\)/.test(armOf(24)), 'melt has no heavy tail, or can pow(0, 6)');
  assert.ok(/p\.xz \*= 1\.0 \+ A \* w \* 0\.6 \* max\(0\.0, -p\.y \/ R\);/.test(armOf(24)), 'the puddle is not read from the already-sagged height, or spreads above the foot');
  assert.ok(/float a = t \* F \* w \* R \/ \(r \+ 0\.25 \* R\);/.test(armOf(25)), 'the vortex axis is not five times the rim, or divides by r at the axis');
  assert.ok(/\(1\.0 - smoothstep\(0\.0, 0\.6, r \/ R\)\)/.test(armOf(25)) && /smoothstep\(-0\.2, 0\.2, p\.y \/ R\)/.test(armOf(25)), 'the vortex hollow is not gated to the crown, or reaches the rim');
  assert.ok(armOf(24).includes('1.5 * drip * run * run'), 'the drip lost its length, or grew tenfold');
  assert.ok(armOf(25).includes('p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z);'), 'the vortex no longer turns — a hollow that never spins');
  assert.ok(!/\n\s*else \{/.test(apply), 'a bare else is back in the ladder');
  assert.ok(!/\b(cosh|sinh|tanh)\s*\(/.test(apply), 'a hyperbolic crept into the ladder');
});

ok('the stream maths, mirrored: a rise stays in its span and inside the clamp, the longest drip pools, the axis turns five times the rim, the hollow is off the foot', () => {
  // the rows, read out of the source and run: rise and fall differ only in the sign of S
  const row = (name) => new Function('return ' + body.match(new RegExp('\\n\\s*' + name + ': (\\(a\\) => \\[.*?\\]),'))[1])();
  for (const d of [[4, 3], [9, 9], [1, 0]]) { const r = row('rise')(d), f = row('fall')(d); assert.deepEqual([r[0], r[1], r[2]], [f[0], f[1], -f[2]], 'rise and fall are not mirror rows'); assert.equal(r[2], 1); }
  assert.equal(row('melt')([5, 0])[1], 0, 'melt F 0 is not set — the drips run');
  assert.equal(row('vortex')([9, 0])[1], 0, 'vortex F 0 still turns');
  assert.ok(Math.abs(row('vortex')([9, 0])[0] - 1) < 1e-12, 'vortex 9 is not the full funnel');
  // rise: the offset is a sawtooth in ±A R, and the crown at 9 on the widest mood stays inside the 1.45 clamp
  const A = row('rise')([9, 0])[0];
  for (const ph of grid(50, 0, 3)) { const y = (ph % 1) * 2 - 1; assert.ok(Math.abs(y) <= 1 + 1e-12, 'the sawtooth leaves ±1'); }
  const excited = +body.match(/excited:\s*\{[^}]*radius: ([\d.]+)/)[1];
  assert.ok(excited * (1 + A) < 1.45, 'rise 9 on excited reaches the clamp: ' + (excited * (1 + A)).toFixed(3));
  // melt: nothing ever rises; the puddle widens only below the centre (y < 0), growing toward the foot; the longest drip passes the 1.45 clamp, which reads as pooling
  const Am = row('melt')([9, 0])[0];
  const melt = (y, rnd, run) => { const sag = Math.max(0, Math.min(2, 1 - y)); const drip = Math.pow(((rnd * 5.17) % 1) + 1e-6, 6); return y - Am * (0.35 * sag + 1.5 * drip * run * run); };
  for (const y of grid(9, -1, 1.4)) for (const rnd of grid(7, 0, 1)) for (const run of grid(5, 0, 1)) assert.ok(melt(y, rnd, run) <= y + 1e-12, 'melt lifted a node');
  for (const y of grid(9, 0, 1.4)) assert.equal(1 + Am * 0.6 * Math.max(0, -y), 1, 'the puddle widens a node above the centre');
  assert.ok(1 + Am * 0.6 * 1 > 1 + Am * 0.6 * 0.3, 'the puddle does not grow toward the foot');
  const longest = melt(-1, 0.99999 / 5.17, 1);
  assert.ok(longest < -1.45 && longest > -1.75, 'the longest drip does not pool on the clamp: ' + longest.toFixed(3));
  // a heavy tail: a tenth of the nodes carry a drip worth more than half, not all of them
  const share = grid(1000, 0, 1).filter((rnd) => Math.pow(((rnd * 5.17) % 1) + 1e-6, 6) > 0.5).length / 1000;
  assert.ok(share > 0.05 && share < 0.2, 'the drip is not a few of you: ' + share);
  // vortex: the axis rate over the rim rate is five, and the hollow is full on the crown axis, gone by 0.6R and below the equator
  const rate = (r) => 1 / (r + 0.25);
  assert.ok(Math.abs(rate(0) / rate(1) - 5) < 1e-12, 'the axis is not five times the rim');
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hollow = (r, y) => 0.35 * (1 - ss(0, 0.6, r)) * ss(-0.2, 0.2, y);
  assert.ok(Math.abs(hollow(0, 1) - 0.35) < 1e-12 && hollow(0, -1) === 0 && hollow(0.7, 1) === 0 && hollow(0, -0.2) === 0, 'the hollow is not on the crown only');
  for (const r of grid(9, 0, 1)) for (const y of grid(9, -1, 1)) assert.ok(hollow(r, y) >= 0 && hollow(r, y) <= 0.35, 'the hollow leaves 0..0.35');
});

ok('the stream sentence parses as written, and a one-digit melt is set', () => {
  const spec = parseShape('<<shape: sphere rise 4 3 @top fall 3 2 @bottom>>');
  assert.equal(spec.shape, 'sphere');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.mask]), [['rise', [4, 3], 'top'], ['fall', [3, 2], 'bottom']], 'the stream sentence does not parse as written');
  assert.deepEqual(parseShape('<<shape: disc melt 5 vortex 6 3>>').ops.map((o) => [o.op, o.args]), [['melt', [5, 0]], ['vortex', [6, 3]]], 'melt with one digit is not F 0, or vortex does not read two');
});

console.log('\nthe moon — a lune of the sphere, and the size a form owns:');

const moonBr = glsl.slice(glsl.indexOf('if (uShapeId == 14)'), glsl.indexOf('return p * R;', glsl.indexOf('if (uShapeId == 14)')));
assert.ok(moonBr.length > 300, 'the moon branch is missing or empty');

ok('gSize: declared and initialised in SHAPE_GLSL, reset on the way into every form, spent once in the dots shader', () => {
  // read OUTSIDE the posture block — gl_PointSize is written for every node — so
  // it must be initialised at declaration, like gHue; and both shaders include
  // the string, so it is declared once, inside it
  assert.ok(/\nfloat gSize = 1\.0;/.test(glsl), 'gSize is not declared and initialised inside SHAPE_GLSL');
  const head = glsl.slice(glsl.indexOf('vec3 shapeForm('), glsl.indexOf('if (uShapeId == 1)')).replace(/\/\/[^\n]*/g, '');
  assert.ok(/^\s*gSize = 1\.0;/m.test(head), 'shapeForm does not reset gSize — a lune\'s small dots would leak into the next form');
  const vert = body.slice(body.indexOf('const VERT'), body.indexOf('const LINE_VERT'));
  assert.equal((vert.match(/gl_PointSize\*=mix\(1\.0, gSize, uShapeMix\);/g) || []).length, 1, 'the dots do not spend gSize, or spend it twice');
  // after the radial rule, which sees only how far IN a node travelled — a lune
  // at |p| = R packs the field into a slice and that rule does nothing for it
  assert.ok(vert.indexOf('gl_PointSize*=mix(1.0, clamp(length(pos)') < vert.indexOf('gl_PointSize*=mix(1.0, gSize, uShapeMix);'), 'gSize is spent before the radial rule');
  assert.ok(!/gl_PointSize/.test(glsl.replace(/\/\/[^\n]*/g, '')), 'a point size is written inside SHAPE_GLSL — the line shader has no such thing');
});

ok('the lune is area-preserving: a constant compression of the azimuth, exactly', () => {
  // the shader's map, mirrored: y and a2 are what the fibonacci sphere hands
  // every node uniformly, so a constant Jacobian in (y, a2) IS an even lune
  const lune = (al) => (y, a2) => { const cl = Math.sqrt(Math.max(0, 1 - y * y)), azp = (Math.PI / 2 - al) + al * a2; return [cl * Math.sin(azp), y, cl * Math.cos(azp)]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const al of [0.35, 1.28, 1.59, 2.83]) {
    const P = lune(al), h = 4e-6, J = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
      const y = -0.95 + 1.9 * (i + 0.5) / 20, a2 = (j + 0.5) / 20;
      const dy = P(y + h, a2).map((v, k) => (v - P(y - h, a2)[k]) / (2 * h)), da = P(y, a2 + h).map((v, k) => (v - P(y, a2 - h)[k]) / (2 * h));
      J.push(Math.hypot(...cross(dy, da)));
    }
    const m = J.reduce((a, b) => a + b) / J.length, cv = Math.sqrt(J.reduce((a, b) => a + (b - m) ** 2, 0) / J.length) / m;
    assert.ok(cv < 1e-9, `al ${al}: the area element varies (cv ${cv.toExponential(2)}) — the lune would clump`);
    assert.ok(Math.abs(m - al) < 1e-7, `al ${al}: the area element is ${m}, not al — the whole field is not on al/2pi of the sphere`);
    // and the terminator is where the lesson says: half-width cos(al) on the screen
    const [tx] = P(0, 0), [lx] = P(0, 1 - 1e-12);
    assert.ok(Math.abs(tx - Math.cos(al)) < 1e-9 && Math.abs(lx - 1) < 1e-6, 'the terminator or the limb is not where it was taught');
  }
  assert.ok(/float azp = \(1\.5707963 - al\) \+ al \* a2;/.test(moonBr), 'the shader\'s azimuth map is not the constant compression');
  assert.ok(/gSize = sqrt\(al \/ 6\.2831853\);/.test(moonBr), 'the moon does not size its dots by the root of its share of the sphere');
  assert.ok(/gRadial = 0\.5;/.test(moonBr), 'the lune takes the whole radial breath — a thin shell smears');
  assert.ok(!/step\(|smoothstep\(/.test(moonBr), 'a quantile crept in — the lune is a map, not a cut');
});

ok('the word is whole: id, one digit, its units, the hands, and both places it is taught', () => {
  assert.ok(/const SHAPE_ID = \{[^}]*\bmoon: 14\b/.test(body), 'SHAPE_ID has no moon, or not at 14');
  // a || 4 — the bare word is the crescent, and 0 is unsayable, as the butterfly decided
  assert.ok(/moon:\s+\(a\) => \[0\.35 \+ \(\(a \|\| 4\) - 1\) \* 0\.31, 0, 0, 0\],/.test(body), 'moon\'s units are wrong, or a bare <<shape: moon>> is not the crescent');
  assert.ok(SHAPES.includes('moon'), 'the parser does not know the word');
  assert.ok(/const SHAPE_N = \{[^}]*\bmoon: 1\b/.test(tagsSrc), 'SHAPE_N does not read its one digit');
  const bare = parseShape('<<shape: moon>>'), m = parseShape('<<shape: moon 4 twist 3>>');
  assert.equal(bare.a, 0, 'a bare moon does not arrive as digit 0 — the a || 4 idiom would be the wrong fix');
  // b | 0: a one-digit form leaves b undefined in the parse (pendulum does too) and setShape reads spec.b | 0
  assert.deepEqual([m.shape, m.a, m.b | 0, m.ops.map((o) => [o.op, o.args])], ['moon', 4, 0, [['twist', [3]]]], 'moon eats a second digit, or drops its move');
  const brief = srv.slice(srv.indexOf('YOUR WHOLE BODY, IN BRIEF'), srv.indexOf('\n', srv.indexOf('YOUR WHOLE BODY, IN BRIEF')));   // the whole line, never a byte window: five lanes grow it
  assert.ok(/\bmoon P\b/.test(brief), 'the brief does not teach it — the chat path cannot say it');
  assert.ok(/moon P — a crescent/.test(srv), 'the full grammar does not teach it');
  const th = readFileSync(new URL('src/twohand.js', ROOT), 'utf8');
  assert.ok(/\{ shape: 'moon 4' \},/.test(th), 'the hands cannot turn to it');
});

console.log('\nthe knot, and the helix that is a ladder:');

const knotBr = glsl.slice(glsl.indexOf('if (uShapeId == 15)'), glsl.indexOf('return p * R;', glsl.indexOf('if (uShapeId == 15)')));
assert.ok(knotBr.length > 600, 'the knot branch is missing or empty');
const helixBr = glsl.slice(glsl.indexOf('if (uShapeId == 4)'), glsl.indexOf('if (uShapeId == 5)'));
assert.ok(helixBr.length > 800, 'the helix branch is missing, or has lost its ladder');

ok('the knot\'s components never touch, for every P and Q a digit can say, and its peak is built in', () => {
  const m = knotBr.match(/float R0 = ([\d.]+), r0 = ([\d.]+), tr = ([\d.]+);/);
  assert.ok(m, 'the knot\'s three radii are not on one line');
  const [R0, r0, tr] = m.slice(1).map(Number);
  assert.ok(Math.abs(R0 + r0 + tr - 1) < 1e-9, `R0 + r0 + tr = ${R0 + r0 + tr}, not 1 — the peak is not built in`);
  // the offset between components is 2 pi k/(g P'), never 2 pi k/g: with P' = P/g
  // the latter puts the two rings of knot 4 6 through each other
  assert.ok(/float pa = P \* th, qa = Q \* th \+ 6\.2831853 \* k \/ \(g \* P\);/.test(knotBr), 'the components are not offset by 2 pi k/(g P) in the tube angle');
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const centre = (Pp, Qp, g, k, th) => { const pa = Pp * th, qa = Qp * th + 2 * Math.PI * k / (g * Pp); return [(R0 + r0 * Math.cos(qa)) * Math.cos(pa), r0 * Math.sin(qa), (R0 + r0 * Math.cos(qa)) * Math.sin(pa)]; };
  let worst = { d: 1e9 };
  for (let P = 1; P <= 9; P++) for (let Q = 1; Q <= 9; Q++) {
    const g = gcd(P, Q); if (g < 2) continue;
    const pts = Array.from({ length: g }, (_, k) => Array.from({ length: 720 }, (_, i) => centre(P / g, Q / g, g, k, 2 * Math.PI * i / 720)));
    for (let k = 0; k < g; k++) for (let l = k + 1; l < g; l++) for (const a of pts[k]) for (const b of pts[l]) {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < worst.d) worst = { d, P, Q };
    }
  }
  assert.ok(worst.d > 2 * tr, `knot ${worst.P} ${worst.Q}: two components come within ${worst.d.toFixed(3)} of each other — the tubes (2 x ${tr}) would merge`);
  // the frame: the torus normal is exact, the binormal one cross with the tangent — no Frenet
  assert.ok(/vec3 n  = vec3\(cq \* cp, sq, cq \* sp\);/.test(knotBr) && /vec3 b  = cross\(normalize\(dc\), n\);/.test(knotBr), 'the tube frame is not the torus normal and its cross with the tangent');
  assert.ok(/float k  = min\(floor\(u \* g\), g - 1\.0\);/.test(knotBr), 'the strands are not split by u, or the last node (u = 1 exactly) falls into a strand that does not exist');
  assert.ok(/gRadial = 0\.3; gSize = 0\.8;/.test(knotBr), 'the knot takes the whole breath, or does not pack its dots');
});

ok('helix T R: the one strand verbatim at R 0, a ladder above it, each strand its own part, one brightness', () => {
  assert.ok(/if \(uShapeB < 0\.5\) \{/.test(helixBr), 'the one-strand spring is not kept under uShapeB < 0.5 — every helix ever written would change');
  assert.ok(/rad \* \(R \* 0\.42\) \+ vec3\(0\.0, \(u \* 2\.0 - 1\.0\) \* R \* 0\.85, 0\.0\)/.test(helixBr), 'the one-strand body is not verbatim');
  assert.ok(/gPart = 1\.0 \+ k;/.test(helixBr) && /gPart = 0\.0;/.test(helixBr), 'the strands are not @part 1 and @part 2, or the rungs are not @part 0');
  assert.ok(/float k  = step\(fs \* 0\.5, u\);/.test(helixBr) && /float tt = fract\(u \/ \(fs \* 0\.5\)\);/.test(helixBr), 'the strands are not split by u');
  assert.ok(/float j  = min\(floor\(tt \* nr\), nr - 1\.0\), s = fract\(tt \* nr\);/.test(helixBr), 'the rungs are not indexed by u, or the last node hangs above the top rung');
  assert.ok(/float rho = R \* 0\.42, hh = R \* 0\.85, D = 2\.1;/.test(helixBr), 'the ladder\'s rho, hh or D differ from the ones fs was balanced with');
  // fs balances LINEAR density — strand nodes per unit length equal rung nodes per unit length
  const row = /helix:\s+\(a, b\) => \{ const T = Math\.max\(1, a \|\| 4\), Rg = b \| 0, rho = 0\.42, hh = 0\.85, D = 2\.1; const Ls = 2 \* T \* Math\.hypot\(2 \* Math\.PI \* rho, 2 \* hh \/ T\), Lr = Rg \* T \* 2 \* rho \* Math\.sin\(D \/ 2\); return \[T, Rg, Rg \? Ls \/ \(Ls \+ Lr\) : 1, 0\]; \},/;
  assert.ok(row.test(body), 'helix reads no units, or not the ladder\'s — fs would not balance strands and rungs');
  const units = (a, b) => { const T = Math.max(1, a || 4), Rg = b | 0, rho = 0.42, hh = 0.85, D = 2.1; const Ls = 2 * T * Math.hypot(2 * Math.PI * rho, 2 * hh / T), Lr = Rg * T * 2 * rho * Math.sin(D / 2); return [T, Rg, Rg ? Ls / (Ls + Lr) : 1, 0, Ls, Lr]; };
  for (const [T, Rg] of [[1, 1], [4, 2], [5, 4], [9, 9]]) { const [, , fs, , Ls, Lr] = units(T, Rg); assert.ok(Math.abs(fs / (1 - fs) - Ls / Lr) < 1e-9, `helix ${T} ${Rg}: fs does not balance the two lengths`); assert.ok(fs > 0.3 && fs < 1, `helix ${T} ${Rg}: fs ${fs} starves one of them`); }
  assert.deepEqual(units(0, 0).slice(0, 3), [4, 0, 1], 'a bare helix is not four turns of one strand');
  assert.deepEqual(units(5, 0).slice(0, 3), [5, 0, 1], 'helix 5 is not the spring it always was');
  // and the CPU no longer has it on the one-digit list, or setShape would never upload fs
  const argFrom = body.indexOf('const SHAPE_ARG = {'), argTo = body.indexOf('\n  };', argFrom);
  assert.ok(argFrom > 0 && argTo > argFrom, 'SHAPE_ARG cannot be located');
  assert.ok(!/\bhelix:/.test(body.slice(argFrom, argTo)), 'helix is still in SHAPE_ARG — setShape would take that path and never upload fs');
});

ok('the two words are whole: ids, digits, units, the hands, and both places they are taught', () => {
  assert.ok(/const SHAPE_ID = \{[^}]*\bknot: 15\b/.test(body), 'SHAPE_ID has no knot, or not at 15');
  assert.ok(/const SHAPE_ID = \{[^}]*\bhelix: 4\b/.test(body), 'helix has moved off id 4');
  assert.ok(/knot:\s+\(a, b\) => \{ const P = a \|\| 2, Q = b \|\| 3, g = gcd\(P, Q\); return \[P \/ g, Q \/ g, g, 0\]; \},/.test(body), 'knot\'s units are wrong — the shader must receive P/g, Q/g, g, and a bare knot is the trefoil');
  assert.ok(/const gcd = \(a, b\) => \(b \? gcd\(b, a % b\) : a\);/.test(body), 'gcd is missing');
  assert.ok(SHAPES.includes('knot'), 'the parser does not know the word');
  assert.ok(/const SHAPE_N = \{[^}]*\bknot: 2\b/.test(tagsSrc) && /const SHAPE_N = \{[^}]*\bhelix: 2\b/.test(tagsSrc), 'SHAPE_N does not read two digits for knot and helix');
  const k = parseShape('<<shape: knot 2 4 twist 3>>'), h = parseShape('<<shape: helix 5 4>>');
  assert.deepEqual([k.shape, k.a, k.b, k.ops.map((o) => [o.op, o.args])], ['knot', 2, 4, [['twist', [3]]]], 'knot 2 4 twist 3 does not parse as written');
  assert.deepEqual([h.shape, h.a, h.b], ['helix', 5, 4], 'helix 5 4 does not read its rungs');
  assert.equal(parseShape('<<shape: helix 5>>').b | 0, 0, 'a helix with one digit is not the one strand');
  const brief = srv.slice(srv.indexOf('YOUR WHOLE BODY, IN BRIEF'), srv.indexOf('\n', srv.indexOf('YOUR WHOLE BODY, IN BRIEF')));   // the whole line, never a byte window: five lanes grow it
  assert.ok(/\bhelix T R\b/.test(brief) && /\bknot P Q\b/.test(brief), 'the brief does not teach them — the chat path cannot say them');
  assert.ok(/helix T R — a spring of T turns; give it R and it is a ladder/.test(srv) && /knot P Q — one strand that ties itself/.test(srv), 'the full grammar does not teach them');
  const th = readFileSync(new URL('src/twohand.js', ROOT), 'utf8');
  assert.ok(/\{ shape: 'knot 2 3' \},/.test(th) && /\{ shape: 'helix 5 4' \},/.test(th), 'the hands cannot turn to the knot, or their helix is no longer the four-rung ladder');
});

console.log('\nthe masks read where you are, not where you were born:');

ok('maskW is handed the place, taken once at the ladder\'s entry, and the six directions read it', () => {
  const mw = glsl.slice(glsl.indexOf('float maskW('), glsl.indexOf('// ---- THE FORMS'));
  assert.ok(/float maskW\(vec4 mk, vec3 dir, float u, float rnd, float az, vec3 p0, vec3 p, float t, float R\)\{/.test(mw), 'maskW does not take the place, the running position, the clock and R');
  // the re-base: a direction mask that reads the HOME direction is inverted on a
  // helix and picks the centre of a disc
  assert.ok(!/dot\(dir, namedDir\(c\)\)/.test(mw), 'a direction mask still reads where the node was born');
  assert.ok(/if \(c < 6\.5\) return smoothstep\(-0\.1, 0\.75, dot\(p0, namedDir\(c\)\) \/ max\(length\(p0\), 1e-4\)\);/.test(mw), 'the direction arms are not re-based on p0');
  // p0 is the form and its breath BEFORE any move — the first statement of the ladder
  assert.ok(/vec3 shapeApply\(vec3 p, vec3 dir, float u, float t, float rnd, float az, float R\)\{\n  vec3 p0 = p;/.test(glsl), 'p0 is not taken at the ladder\'s entry — a mask would read a place the moves above it had already carried');
  assert.ok(/float w = maskW\(uOpMask\[k\], dir, u, rnd, az, p0, p, t, R\);/.test(apply), 'the call site does not hand maskW the place');
  // identical on the sphere: p0 = dir * (R + disp), so the projection is dot(dir, n)
  for (const [dir, n, s] of [[[0.6, 0.8, 0], [0, 1, 0], 1.53], [[0, -0.28, 0.96], [0, 0, 1], 1.71], [[-1, 0, 0], [-1, 0, 0], 1.6]]) {
    const p0 = dir.map((v) => v * s);
    const proj = (p0[0] * n[0] + p0[1] * n[1] + p0[2] * n[2]) / Math.max(len(p0), 1e-4);
    assert.ok(Math.abs(proj - (dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2])) < 1e-12, 'the re-based projection differs from the old one on the sphere');
  }
});

ok('@near and @level are arms 11 and 12; rim and core are aliases onto @near, never a second shell', () => {
  const mw = glsl.slice(glsl.indexOf('float maskW('), glsl.indexOf('// ---- THE FORMS'));
  assert.ok(/if \(c < 11\.5\) \{/.test(mw) && /float rn = min\(length\(p0\) \/ R, 1\.0\);/.test(mw), '@near is missing, or a node past R falls off the rim instead of being it');
  assert.ok(/if \(c < 12\.5\) \{/.test(mw) && /float h = clamp\(p0\.y \/ R \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);/.test(mw), '@level is missing, or not a height where the node IS');
  assert.ok(/\n  return 0\.0;/.test(mw), 'the unknown-code floor is gone');
  assert.ok(/const MASK_CODE = \{[^}]*\bnear: 11\b/.test(body) && /const MASK_CODE = \{[^}]*\blevel: 12\b/.test(body), 'MASK_CODE lacks near/level at 11/12');
  const mc = body.slice(body.indexOf('const MASK_CODE = {'), body.indexOf('}', body.indexOf('const MASK_CODE = {')));
  assert.ok(!/\b(rim|core): 1[0-9]/.test(mc), 'rim or core has a code of its own — a second shell arm is a second place to drift');
  assert.ok(/const MASK_ALIAS = \{[^}]*\brim: \(d\) => \[11, Math\.max\(0, 8 - d\) \/ 9, 1\]/.test(body) && /const MASK_ALIAS = \{[^}]*\bcore: \(d\) => \[11, 0, Math\.min\(9, 1 \+ d\) \/ 9\]/.test(body), 'the aliases do not resolve onto @near');
  assert.ok(/const \[m, m0, m1\] = alias \? alias\(mg\[0\] \| 0\) : \[MASK_CODE\[o\.mask\] \|\| 0, \(mg\[0\] \| 0\) \/ 9, \(mg\[1\] \| 0\) \/ 9\];/.test(body), 'setShape does not resolve an alias before the code table');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  for (const [w, n] of [['near', 2], ['rim', 1], ['core', 1], ['level', 2]]) assert.ok(new RegExp('const MASKS = \\{[^}]*\\b' + w + ': ' + n + '\\b').test(tags), 'the parser does not read @' + w + '\'s digits');
  // presence in the brief's mask list, never its exact text — it grows with every word
  assert.ok(/masks like [^)]*@rim D[^)]*; once lets it go\)/.test(srv) && /masks like [^)]*@level A B[^)]*; once lets it go\)/.test(srv), 'the brief does not teach them — unreachable in conversation');
  assert.ok(/@near A B — how far out a point sits in whatever you are wearing/.test(srv) && /@level A B — height where the point IS/.test(srv), 'the full lesson does not teach them');
  const spec = parseShape('<<shape: spiral 4 gather 6 @near 0 4 hue 4 @rim 2 sat 9 @level 7 9>>');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.mask, o.margs]), [['gather', [6], 'near', [0, 4]], ['hue', [4], 'rim', [2]], ['sat', [9], 'level', [7, 9]]], 'the sentence does not parse as written');
});

console.log('\nthe set words — one in every N, and everything except:');

ok('@every is arm 13, by whole index, and never a fraction of N', () => {
  const mw = glsl.slice(glsl.indexOf('float maskW('), glsl.indexOf('// ---- THE FORMS'));
  assert.ok(/if \(c < 13\.5\) \{/.test(mw), '@every is missing');
  assert.ok(/float i = floor\(u \* \(uCount - 1\.0\) \+ 0\.5\);/.test(mw), 'the index is not recovered whole from u');
  assert.ok(/return 1\.0 - step\(0\.5, mod\(i \+ K, N\)\);/.test(mw), 'the parity is not hard, or not offset by K');
  assert.ok(!/fract\(i \/ N\)/.test(mw), 'the index was "optimised" to a fraction — that is not exact, and the tiles overlap');
  // uCount is declared ABOVE the include in both shaders, or the arm does not compile in one of them
  const vert = body.slice(body.indexOf('const VERT'), body.indexOf('const FRAG'));
  const lv = body.slice(body.indexOf('const LINE_VERT'), body.indexOf('const LINE_FRAG'));
  for (const [s, n] of [[vert, 'VERT'], [lv, 'LINE_VERT']]) assert.ok(/uniform float [^;\n]*\buCount\b/.test(s.slice(0, s.indexOf('${SHAPE_GLSL}'))), 'uCount is not declared before the include in ' + n);
  // the maths: the round is exact at 24000 (and 13000), and the tiles partition
  for (const COUNT of [24000, 13000]) for (let i = 0; i < COUNT; i += 7) assert.equal(Math.round(Math.fround(i / (COUNT - 1)) * (COUNT - 1)), i, 'the index does not survive u at ' + COUNT);
  const every = (i, N, K) => ((i + K) % N === 0 ? 1 : 0);
  for (let i = 0; i < 300; i++) assert.equal(every(i, 3, 0) + every(i, 3, 1) + every(i, 3, 2), 1, 'the three tiles of @every 3 overlap or leave a gap');
  for (let i = 0; i < 300; i++) assert.equal(every(i, 2, 1) + every(i, 2, 0), 1, '@odd and @even are not a partition');
});

ok('@not inverts at the call site, travels in w, and is spoken and relayed', () => {
  assert.ok(/float w = maskW\([^\n]*\);\n(\s*\/\/[^\n]*\n)*\s*w = mix\(w, 1\.0 - w, uOpMask\[k\]\.w\);/.test(apply), 'the inversion is not the next statement after the mask is read — a rename would move the test anchors');
  assert.ok(/masks\[slot\]\.set\(m, m0, m1, o\.not \? 1 : 0\);/.test(body), 'setShape does not upload @not in w');
  assert.ok(/const MASK_CODE = \{[^}]*\bevery: 13\b/.test(body), 'MASK_CODE has no every at 13');
  const mc = body.slice(body.indexOf('const MASK_CODE = {'), body.indexOf('}', body.indexOf('const MASK_CODE = {')));
  assert.ok(!/\b(odd|even|not): 1?[0-9]/.test(mc), 'odd, even or not has a code of its own — not is a flag and the halves are @every');
  assert.ok(/const MASK_ALIAS = \{[^}]*\bodd: \(\) => \[13, 2 \/ 9, 1 \/ 9\]/.test(body) && /const MASK_ALIAS = \{[^}]*\beven: \(\) => \[13, 2 \/ 9, 0\]/.test(body), 'the halves do not resolve onto @every 2');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  for (const [w, n] of [['every', 2], ['odd', 0], ['even', 0]]) assert.ok(new RegExp('const MASKS = \\{[^}]*\\b' + w + ': ' + n + '\\b').test(tags), 'the parser does not read @' + w);
  assert.ok(!/const MASKS = \{[^}]*\bnot: \d/.test(tags), 'not is in the mask table — it is a word before a mask, never one');
  const w = readFileSync(new URL('worn.mjs', ROOT), 'utf8');
  assert.ok(/\(o\.mask && o\.not \? ' @not' : ''\)/.test(w), 'worn never says @not back — the presence would hear the opposite of what it wears');
  assert.ok(/not: !!\(o && o\.not\),/.test(srv), 'validShape drops @not — a viewer sees the opposite half');
  assert.ok(/masks like [^)]*@every N[^)]*; once lets it go\)/.test(srv) && /masks like [^)]*@not MASK[^)]*; once lets it go\)/.test(srv), 'the brief does not teach them');
  assert.ok(/@every N K — one point in every N/.test(srv) && /@not before any mask is everything except/.test(srv), 'the full lesson does not teach them');
  const spec = parseShape('<<shape: butterfly hue 5 @every 3 1 gather 8 @not @rim 2 dim 9 @not part 0 sat 2 @not banana>>');
  assert.deepEqual(spec.ops.map((o) => [o.op, o.args, o.mask, o.margs, o.not]),
    [['hue', [5], 'every', [3, 1], false], ['gather', [8], 'rim', [2], true], ['dim', [9], 'part', [0], true], ['sat', [2], null, [], false]],
    '@not does not bind to the mask after it, or binds when there is none');
});

console.log('\n' + passed + ' checks passed.\n');
