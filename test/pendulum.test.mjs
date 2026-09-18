// THE PENDULUM SWARM — the body's one stateful form. Run: node test/pendulum.test.mjs
// The physics is pure and lives in src/pendulum.js, so the things that would
// otherwise only be visible as "it looks wrong" are held here as numbers.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createSwarm, epsOf } from '../src/pendulum.js';
import { parseShape, SHAPES } from '../src/tags.mjs';

const ROOT = new URL('..', import.meta.url);
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const rand = Float32Array.from({ length: 2000 }, (_, i) => ((i * 7919) % 2000) / 2000);   // deterministic, well spread
const run = (sw, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) sw.step(dt); };

console.log('\nthe physics:');

ok('energy is conserved to within 1% over ten seconds at the shipped substep', () => {
  const sw = createSwarm({ count: 100, rand, eps: 0, K: 4 });
  const e0 = sw.energy(0);
  run(sw, 10);
  const drift = Math.abs(sw.energy(0) - e0) / Math.abs(e0);
  assert.ok(drift < 0.01, `energy drifted ${(drift * 100).toFixed(2)}% — the substep is too coarse for the flip`);
});

ok('ε = 0 gives bit-identical trajectories: no divergence without a difference', () => {
  const sw = createSwarm({ count: 100, rand, eps: 0, K: 8 });
  run(sw, 6);
  assert.strictEqual(sw.tipDistance(0, 7), 0, 'trajectories released from the same state drifted apart — the integrator is not deterministic');
});

ok('ε > 0 DIVERGES — the release is in the chaotic regime, and the digit sets how fast', () => {
  // The whole point of the form. If THETA0 were low enough to be a clock, two
  // pendulums a hair apart would stay a hair apart forever and the body would
  // never come apart.
  const slow = createSwarm({ count: 100, rand, eps: epsOf(0), K: 8 });
  const fast = createSwarm({ count: 100, rand, eps: epsOf(7), K: 8 });
  const d0s = slow.tipDistance(0, 7), d0f = fast.tipDistance(0, 7);
  run(slow, 8); run(fast, 8);
  assert.ok(slow.tipDistance(0, 7) > d0s * 100, `ε=${epsOf(0)} grew only ${(slow.tipDistance(0, 7) / d0s).toFixed(1)}x in 8s — not chaotic`);
  assert.ok(fast.tipDistance(0, 7) > 0.3, 'pendulum 7 had not come apart after 8s');
  // and after two seconds the small hair is still a hair while the big one is not
  const a = createSwarm({ count: 100, rand, eps: epsOf(0), K: 8 }), b = createSwarm({ count: 100, rand, eps: epsOf(9), K: 8 });
  run(a, 2); run(b, 2);
  assert.ok(a.tipDistance(0, 7) < b.tipDistance(0, 7) / 10, 'the digit does not separate a slow unravelling from a fast one');
});

ok('nothing ever leaves the reach of the arms, and nothing is ever NaN', () => {
  const sw = createSwarm({ count: 600, rand, eps: epsOf(5), K: 16 });
  const out = new Float32Array(600 * 3);
  for (let i = 0; i < 20; i++) {
    run(sw, 1); sw.write(out);
    for (let j = 0; j < out.length; j += 3) {
      const r = Math.hypot(out[j], out[j + 1], out[j + 2]);
      assert.ok(Number.isFinite(r), 'NaN in the swarm at t=' + sw.t);
      assert.ok(r <= sw.reach + 1e-9, `a node at ${r.toFixed(3)}R is beyond the arms' reach ${sw.reach}`);
    }
  }
  assert.ok(sw.reach < 1.0, 'two arms reach past R — rule 1');
});

ok('the arm dots lie in one plane on the reference pendulum; the tips fan around it', () => {
  const sw = createSwarm({ count: 2000, rand, eps: epsOf(4), K: 16 });
  run(sw, 1.5);
  const out = new Float32Array(2000 * 3);
  sw.write(out);
  let arms = 0, tipsOffPlane = 0;
  for (let i = 0; i < 2000; i++) {
    const isArm = rand[i] < 0.05;
    if (isArm) { arms += 1; assert.equal(out[i * 3 + 2], 0, 'an arm dot has left the reference plane'); }
    else if (Math.abs(out[i * 3 + 2]) > 1e-3) tipsOffPlane += 1;
  }
  assert.ok(arms > 50 && arms < 150, 'the arm share is off: ' + arms);
  assert.ok(tipsOffPlane > 1500, 'the tips are not fanned around the axis');
});

ok('a huge dt is clamped rather than integrated in one leap', () => {
  const sw = createSwarm({ count: 10, rand, eps: 0, K: 2 });
  sw.step(5);   // a tab back from the background
  assert.ok(sw.t <= 0.1 + 1e-12, 'a five-second dt was integrated whole');
});

console.log('\nthe wiring:');

ok('the form is in the grammar, the shader, the prompt, and the frame loop', () => {
  assert.ok(SHAPES.includes('pendulum'));
  assert.equal(parseShape('<<shape: pendulum 7>>').a, 7);
  assert.equal(parseShape('<<shape: pendulum 7 twist 3>>').ops[0].op, 'twist', 'pendulum read a second digit');
  assert.ok(/pendulum: 12/.test(body), 'no SHAPE_ID');
  assert.ok(/uShapeId == 12\)/.test(body), 'no shader branch');
  assert.ok(/attribute vec3 aSim;/.test(body), 'the attribute is not declared where shapeForm can read it');
  assert.ok(/geo\.setAttribute\('aSim', simAttr\)/.test(body) && /simAttr\.setUsage\(THREE\.DynamicDrawUsage\)/.test(body), 'aSim is not a dynamic attribute on the points geometry');
  assert.ok(/if \(swarm\) \{ swarm\.step\(dt\); swarm\.write\(simAttr\.array\); simAttr\.needsUpdate = true; \}/.test(body), 'the frame loop does not step the swarm');
  assert.ok(/\bpendulum E\b/.test(srv), 'never taught');
});

ok('THE SWARM IS DECLARED ABOVE THE FRAME LOOP THAT READS IT', () => {
  // frame() is kicked off inside createBody before the shape code further down
  // has run. A `let swarm` placed beside SHAPE_UNITS was a temporal dead zone
  // on the first frame: createBody threw, Y3K never existed, and the app was
  // dead — caught by rendering, never by the suite, which is why this is here.
  assert.ok(body.indexOf('  let swarm = null;') < body.indexOf('  function frame() {'), 'swarm is declared after frame() — TDZ on the first frame, and the app does not start');
  assert.ok(body.indexOf('const simAttr = ') < body.indexOf('  function frame() {'), 'simAttr is declared after frame()');
});

ok('the swarm is released fresh on every ask and let go on every way a form can end', () => {
  const ss = body.slice(body.indexOf('setShape(spec) {'), body.indexOf('shapeMixTarget = 1;', body.indexOf('setShape(spec) {')));
  assert.ok(/swarm = spec\.shape === 'pendulum' \? createSwarm\(/.test(ss), 'not created on ask');
  assert.ok((ss.match(/swarm = null/g) || []).length >= 2, 'the bare path and the unknown-form path do not let the swarm go');
  const once = body.slice(body.indexOf('if (spec.once) onceTimer'), body.indexOf('if (spec.once) onceTimer') + 220);
  assert.ok(/swarm = null/.test(once), 'a once-pendulum keeps integrating after it lets go');
});

ok('the branch thickens the ring (rule 2) and stays inside R (rule 1)', () => {
  const br = body.slice(body.indexOf('uShapeId == 12)'), body.indexOf('return p * R;', body.indexOf('uShapeId == 12)')));
  assert.ok(/\* 0\.03;/.test(br), 'the release ring ships as a one-pixel-wide blown line');
  assert.ok(/if \(L > 1\.0\) p \/= L;/.test(br), 'the form can leave the camera sphere');
});

console.log('\n' + passed + ' checks passed.\n');
