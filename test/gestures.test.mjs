// THE TWO NEW GESTURES — the air tap, and what ten fingers say.
// Run: node test/gestures.test.mjs
//
// Both of these are pure: the knock is a function of a little depth history,
// and the ten-finger language takes a body to talk to. So neither needs a DOM
// and both can be held to what they actually DO rather than to how they read.
// That matters more here than anywhere else in the hand, because a gesture that
// fires when you did not mean it is not a bug you can see in a diff.
import assert from 'node:assert';
import { createKnock } from '../src/reach.js';
import { createTwoHand } from '../src/twohand.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- the knock --------------------------------------------------------------
const run = (frames) => {
  const k = createKnock(); let fired = 0;
  for (const [t, z, x, y] of frames) if (k.push(t, z, x, y)) fired += 1;
  return fired;
};
// Hold, pull back a tenth of a hand-width, jab forward, settle. 60Hz.
function knockFrames(t0 = 0, x = 400) {
  const f = []; let t = t0;
  for (let i = 0; i < 8; i++) f.push([t += 16, 0, x, 300]);
  for (let i = 0; i < 4; i++) f.push([t += 16, 0.025 * (i + 1), x, 300]);
  for (let i = 0; i < 4; i++) f.push([t += 16, 0.10 - 0.055 * (i + 1), x + 1, 300]);
  for (let i = 0; i < 8; i++) f.push([t += 16, -0.12, x, 300]);
  return f;
}

console.log('\nthe air tap:');

ok('a knock is a knock', () => {
  assert.equal(run(knockFrames()), 1, 'a pull-back and a jab forward did not register');
});

ok('and stillness, a swipe, and a slow reach are not', () => {
  // A hand held still, with only sensor noise on it.
  const still = []; let t = 0;
  for (let i = 0; i < 40; i++) still.push([t += 16, 0.001 * Math.sin(i), 400, 300]);
  assert.equal(run(still), 0, 'noise alone fires a tap — the button would press itself');
  // The SAME depth jolt, but the fingertip is travelling: this is a swipe with
  // a wobble in it, and it is the most likely false positive of the lot.
  const swipe = []; t = 0; let x = 200;
  for (let i = 0; i < 8; i++) swipe.push([t += 16, 0, x += 14, 300]);
  for (let i = 0; i < 4; i++) swipe.push([t += 16, 0.025 * (i + 1), x += 14, 300]);
  for (let i = 0; i < 4; i++) swipe.push([t += 16, 0.10 - 0.055 * (i + 1), x += 14, 300]);
  assert.equal(run(swipe), 0, 'a swipe with a depth wobble fires a tap');
  // The same distance travelled forward, over a second: a reach, not a knock.
  const slow = []; t = 0;
  for (let i = 0; i < 60; i++) slow.push([t += 16, 0.10 - 0.0037 * i, 400, 300]);
  assert.equal(run(slow), 0, 'a slow reach forward fires a tap');
});

ok('one knock per knock, however fast they come', () => {
  assert.equal(run(knockFrames().concat(knockFrames(700))), 2, 'two separate knocks did not both register');
  assert.equal(run(knockFrames().concat(knockFrames(200))), 1, 'a bounce after the jab fires a second tap');
});

ok('a bad depth reading cannot fire anything', () => {
  assert.equal(run([[16, NaN, 1, 1], [32, NaN, 1, 1], [48, NaN, 1, 1], [64, NaN, 1, 1]]), 0, 'a NaN depth fires a tap');
  const k = createKnock();
  k.push(16, 0, 1, 1); k.push(32, NaN, 1, 1);
  assert.equal(k.push(48, 0, 1, 1), false, 'one bad frame poisoned the detector');
});

// --- ten fingers ------------------------------------------------------------
// Two open hands, ox apart. The ruler is wrist-to-knuckle, which is 0.10 here,
// so a touch has to close to under 0.042 in frame units.
function hand(ox) {
  const p = []; for (let i = 0; i < 21; i++) p.push([ox, 0.5, 0]);
  p[0] = [ox, 0.60, 0]; p[5] = [ox, 0.50, 0];
  p[4] = [ox, 0.40, 0]; p[8] = [ox, 0.34, 0]; p[12] = [ox, 0.30, 0]; p[16] = [ox, 0.34, 0]; p[20] = [ox, 0.40, 0];
  return { ok: true, extended: [true, true, true, true, true], pinch: 1, points: p, tips: [] };
}
const TIPS = [4, 8, 12, 16, 20];
function pair(k, closed) {
  const L = hand(0.40), R = hand(0.60), dx = closed ? 0.008 : 0.10;
  L.points[TIPS[k]] = [0.5 - dx, 0.40, 0]; R.points[TIPS[k]] = [0.5 + dx, 0.40, 0];
  return [L, R];
}
function spy() {
  const calls = [];
  return { calls, setSwell: (k) => calls.push(['swell', k]), setForm: (f) => calls.push(['form', f]), paintColors: (a) => calls.push(['paint', a]) };
}
function hold(th, frames, t0, n = 6) { let t = t0; for (let i = 0; i < n; i++) { th.read(frames, t); t += 16; } return t; }

console.log('\nwhat ten fingers say:');

ok('it only listens when all ten are out', () => {
  const b = spy(), th = createTwoHand({ body: b });
  const [L, R] = pair(1, true);
  // one finger curled on one hand is not the posture
  L.extended = [true, false, true, true, true];
  assert.equal(th.read([L, R], 1000), false, 'a curled finger still entered the posture');
  assert.equal(th.read([hand(0.4)], 1000), false, 'one hand entered the posture');
  assert.equal(b.calls.length, 0, 'something was changed without the posture being held');
  assert.equal(th.read(pair(1, false), 1000), true, 'ten fingers did not enter the posture');
});

ok('the hands set the size, absolutely — the same distance is always the same size', () => {
  const b = spy(), th = createTwoHand({ body: b });
  let t = hold(th, [hand(0.05), hand(0.95)], 1000, 40);
  const apart = b.calls.filter((c) => c[0] === 'swell').pop()[1];
  t = hold(th, [hand(0.45), hand(0.55)], t, 60);
  const together = b.calls.filter((c) => c[0] === 'swell').pop()[1];
  assert.ok(apart > 1.6, `hands wide apart only reached ${apart.toFixed(2)}`);
  assert.ok(together < 0.7, `hands together only reached ${together.toFixed(2)}`);
  // and going back out returns to the same place, because it is not relative
  t = hold(th, [hand(0.05), hand(0.95)], t, 40);
  const again = b.calls.filter((c) => c[0] === 'swell').pop()[1];
  assert.ok(Math.abs(again - apart) < 0.02, 'the same distance gave a different size the second time');
});

ok('each pair of fingers means a number of colours, and the thumbs mean a form', () => {
  const b = spy(), th = createTwoHand({ body: b });
  let t = 5000;
  const said = [];
  for (let k = 0; k < 5; k++) {
    b.calls.length = 0;
    t = hold(th, pair(k, false), t);
    t = hold(th, pair(k, true), t);
    t = hold(th, pair(k, false), t) + 400;
    const c = b.calls.filter((x) => x[0] !== 'swell');
    said.push(c.length === 1 ? (c[0][0] === 'form' ? 'form' : c[0][1].length) : 'nothing');
  }
  assert.deepEqual(said, ['form', 1, 2, 3, 4], `the five pairs said ${JSON.stringify(said)}`);
});

ok('touching again turns over the NEXT colour, and round', () => {
  const b = spy(), th = createTwoHand({ body: b });
  let t = 20000; const shots = [];
  for (let n = 0; n < 4; n++) {
    t = hold(th, pair(2, false), t, 5);      // middles: two colours
    t = hold(th, pair(2, true), t, 5) + 400;
    shots.push(b.calls.filter((c) => c[0] === 'paint').pop()[1].map((a) => a.rgb.join(',')));
  }
  assert.equal(shots[0].length, 2, 'the middles did not give two colours');
  // The FIRST touch turned over colour one — there is no earlier paint to
  // compare it against, so the sequence we can see starts at the second touch:
  // colour two, then one, then two. One tap changes one, the next changes the
  // other, round and round.
  const changed = shots.slice(1).map((s, i) => (s[0] !== shots[i][0] ? 0 : s[1] !== shots[i][1] ? 1 : -1));
  assert.deepEqual(changed, [1, 0, 1], `the touches turned over slots ${JSON.stringify(changed)} instead of the second, the first, the second`);
  assert.ok(!changed.includes(-1), 'a touch changed nothing at all');
});

ok('a fingertip resting near the line does not chatter', () => {
  // Two thresholds, not one: touching closes at 0.42 hand-widths and only
  // re-arms past 0.62. A pair held right at the line would otherwise fire on
  // every frame the noise crossed it.
  const b = spy(), th = createTwoHand({ body: b });
  let t = 40000;
  const L = hand(0.40), R = hand(0.60);
  for (let i = 0; i < 90; i++) {
    // hovering at ~0.45 hand-widths apart, jittering across the touch line
    const dx = 0.0225 + 0.003 * Math.sin(i * 1.7);
    L.points[TIPS[1]] = [0.5 - dx, 0.40, 0]; R.points[TIPS[1]] = [0.5 + dx, 0.40, 0];
    th.read([L, R], t); t += 16;
  }
  const paints = b.calls.filter((c) => c[0] === 'paint').length;
  assert.ok(paints <= 1, `a fingertip hovering at the threshold fired ${paints} times`);
});

console.log('\n' + passed + ' checks passed.\n');
