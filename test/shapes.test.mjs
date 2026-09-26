// THE FOUR FAMILIES AND THE FLOW. Each shape is one equation, written into the
// vertex shader from the mathematics, not from anyone's code. A wrong exponent
// or a dropped phase gives you A shape — just not THE shape — and nothing
// crashes, so each equation is mirrored here in plain JS and held to the one
// invariant that defines it. Run: node test/shapes.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseShape, parseBody, SHAPES } from '../src/tags.mjs';

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
  for (const w of hint.match(/\b(ellipsoid|super|hopf|calabi|sphere|shell|ring|disc|helix|lattice|spiral|cube|butterfly)\b/g)) assert.ok(SHAPES.includes(w), 'prompt teaches ' + w);
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
  assert.ok(/butterfly: \(a, b\) => \[0\.25 \+ \(a === undefined \? 7 : a\) \* 0\.0833, 0\.015 \+ \(b === undefined \? 3 : b\) \* 0\.020, 0, 0\]/.test(body),
    'a bare <<shape: butterfly>> would be folded flat at zero thickness');
  assert.ok(SHAPES.includes('butterfly'), 'the parser does not know the word');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const SHAPE_N = \{[^}]*\bbutterfly: 2\b/.test(tags), 'SHAPE_N does not read its two digits');
  // marked as a PICTURE, not an equation — this is what keeps LANGUAGE.md honest
  assert.ok(/export const DRAWN = new Set\(\['butterfly'\]\);/.test(tags), 'butterfly is not marked as drawn — the spec would have to pretend it is mathematics');
  // taught in BOTH places: a word only in the full grammar is unreachable in chat
  const brief = srv.slice(srv.indexOf('YOUR WHOLE BODY, IN BRIEF'), srv.indexOf('YOUR WHOLE BODY, IN BRIEF') + 900);
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
  assert.ok(/\n  hue \+= gHue;[^\n]*\n  vHue=fract\(hue\);/.test(body), 'a scheme body ignores the hue move, or it is added after the wrap');
  // presence of the spin in the assignment, not the whole line — sat and bright wrap it
  assert.ok(/vPaintCol=[^;\n]*hueSpin\(aColor, gHue \* 6\.2831853\)/.test(body), 'a painted body ignores the hue move — the word would silently do nothing when the presence wears its own colours');
  assert.ok(/vec3 hueSpin\(vec3 c, float a\) \{/.test(glsl) && /const vec3 k = vec3\(0\.57735027\);/.test(glsl), 'hueSpin is gone, or not about the grey axis');
  // and the order holds: the move ladder runs before the hue is decided
  assert.ok(body.indexOf('fp = shapeApply(fp, dir, u, uShapeTime, aRand, az, uRadius);') < body.indexOf('hue += gHue;'), 'the hue is spent before the ladder has accumulated it');
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
  const loop = bodyCode.slice(bodyCode.indexOf('function frame()'), bodyCode.indexOf('uniforms.uOffset.value.lerp(fieldTarget.off, k);'));
  assert.ok(loop.length > 200, 'the frame loop cannot be located before the offset lerp');
  assert.ok(/\n\s*aimOffset\(\);\s*$/.test(loop), 'the frame loop does not aim the offset right before it lerps it');
  const aim = bodyCode.slice(bodyCode.indexOf('function aimOffset()'), bodyCode.indexOf('\n  }', bodyCode.indexOf('function aimOffset()')));
  assert.ok(aim.length > 100, 'aimOffset cannot be located');
  assert.ok(/if \(flying\) \{/.test(aim) && /Math\.sin\(2\.0 \* flying\.r \* ft\) \* flying\.h \* reachY\(\)/.test(aim), 'a flight is not a 1:2 Lissajous written into the target');
  assert.ok(/else if \(placeDigits\) \{/.test(aim) && /\(\(placeDigits\[0\] - 4\.5\) \/ 4\.5\) \* reachX\(\)/.test(aim), 'a place is not turned into the frame');
  // and the setters aim it the moment the word lands, not one frame later
  assert.equal((bodyCode.match(/aimOffset\(\);/g) || []).length, 4, 'a setter no longer aims the target immediately (loop + setPlace + two exits of setFly)');
  assert.ok(/const reachX = \(\) => Math\.max\(0\.6, \(win\.halfW \|\| 2\.4\) - uniforms\.uRadius\.value \* 0\.6\);/.test(bodyCode), 'the reach is not the frame less most of a radius');
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
  assert.ok(/const o = uniforms\.uOffset\.value;/.test(px) && /return \{ x: w \/ 2 \+ ox, y: h \/ 2 - oy, r: px \};/.test(px),
    'orbPx returns the canvas centre — every hand gesture would aim at empty air the moment the body moved');
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
  const rel = body.match(/fp \*= \(L > 1\.45\) \? \(1\.45 \/ L\) : 1\.0;\n[\s\S]{0,700}?fp = mix\(fp, vec3\(\(aRand - 0\.5\) \* 2\.0 \* uScatter\.y, \(fract\(aRand \* 7\.31\) - 0\.5\) \* 2\.0 \* uScatter\.z, \(fract\(aRand \* 13\.77\) - 0\.5\) \* 0\.6\), uScatter\.x\);/);
  assert.ok(rel, 'the dots are not released toward the frame after the clamp — inside it a scatter is just a bigger orb');
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
  assert.ok(/uniforms\.uScatter\.value\.y = Math\.max\(0\.5, win\.halfW - 0\.15\);/.test(body) && /uniforms\.uScatter\.value\.z = Math\.max\(0\.4, win\.halfH - 0\.15\);/.test(body),
    'fitCamera does not tell scatter how big the room is — scatter 9 would fill a laptop\'s guess on a phone');
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
  assert.ok(/vSat=clamp\(vSat \+ gSat, 0\.0, 1\.0\);/.test(body), 'a scheme body ignores sat');
  assert.ok(/vVal=clamp\(vVal \* \(1\.0 \+ gVal \* 0\.9\), 0\.0, 1\.0\);/.test(body), 'a scheme body ignores bright, or a 9 can blow it to white');
  assert.ok(/vPaintCol=tone\(hueSpin\(aColor, gHue \* 6\.2831853\), gSat, gVal\);/.test(body), 'a painted body ignores sat and bright — the words would do nothing when the presence wears its own colours');
  assert.ok(/vec3 tone\(vec3 c, float sat, float val\) \{/.test(glsl) && /return clamp\(s \* \(1\.0 \+ val \* 0\.9\), 0\.0, 1\.0\);/.test(glsl), 'tone() is gone, or unclamped');
  // the varying, in BOTH halves of the dots shader, or the fragment does not compile
  assert.equal((body.match(/\nvarying float vDim;/g) || []).length, 2, 'vDim is not declared in both halves of the dots shader');
  assert.ok(/vDim=clamp\(1\.0 - gDim, 0\.0, 1\.0\);/.test(body), 'dim is never written to the varying');
  assert.ok(/float alpha=edge\*\(0\.40\+0\.60\*vShade\)\*uDotFade\*vFlash\*vDim;/.test(body), 'the dot alpha ignores dim');
  assert.ok(/alpha=max\(alpha, edge\*vRibbon\*0\.85\*vDim\);/.test(body), 'a dimmed part still glows through its ribbons');
});

ok('the ladder is eight slots deep, in every place the number lives', () => {
  assert.ok(/uniform vec4 uOp\[8\];/.test(glsl) && /uniform vec4 uOpMask\[8\];/.test(glsl), 'the uniform arrays are not 8');
  assert.ok(/for \(int k = 0; k < 8; k\+\+\) \{\n\s*vec4 o = uOp\[k\];/.test(glsl), 'the loop bound is not 8 — a slot past the loop is silently never read');
  assert.equal((body.match(/Array\.from\(\{ length: 8 \}, \(\) => new THREE\.Vector4\(0, 0, 0, 0\)\)/g) || []).length, 2, 'the uniform inits are not both 8');
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/const MAX_OPS = 8;/.test(tags), 'the parser still stops at 6 — the seventh word is dropped');
  assert.ok(!/\b(uOp|uOpMask)\[6\]|k < 6;|length: 6 \}/.test(body), 'a 6 is left behind somewhere the ladder is sized');
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

console.log('\n' + passed + ' checks passed.\n');
