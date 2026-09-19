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

// --- the tap ---------------------------------------------------------------
// The detector is fed the fingertip's offset from its OWN knuckle, in
// hand-widths. A resting index finger sits about three quarters of a hand-width
// out from its knuckle, mostly upward on screen (y grows downward).
const REST = [0, -0.75, 0];
const run = (frames) => {
  const k = createKnock(); let fired = 0;
  for (const f of frames) if (k.push(...f)) fired += 1;
  return fired;
};
const noise = (i) => 0.004 * Math.sin(i * 2.3);
// A TAP as it is actually made: out about a fifth of a hand-width and straight
// back, over roughly a third of a second, travelling mostly DOWN the screen —
// which is what Colin's taps do, and what the first version explicitly refused.
function tapFrames(t0 = 0) {
  const f = []; let t = t0;
  for (let i = 0; i < 8; i++) f.push([t += 16, REST[0] + noise(i), REST[1] + noise(i + 1), REST[2]]);
  for (let i = 1; i <= 5; i++) f.push([t += 16, REST[0] + 0.02 * i, REST[1] + 0.044 * i, REST[2] - 0.01 * i]);
  for (let i = 4; i >= 0; i--) f.push([t += 16, REST[0] + 0.02 * i, REST[1] + 0.044 * i, REST[2] - 0.01 * i]);
  for (let i = 0; i < 6; i++) f.push([t += 16, REST[0] + noise(i), REST[1] + noise(i + 2), REST[2]]);
  return f;
}

console.log('\nthe air tap:');

ok('a tap is an out-and-back, whichever way it goes', () => {
  assert.equal(run(tapFrames()), 1, 'a tap travelling down the screen did not register — this is the one that was broken');
  // and the forward jab the first version was built for still works, because
  // the shape is the same shape whatever direction it happens in
  const jab = []; let t = 0;
  for (let i = 0; i < 8; i++) jab.push([t += 16, REST[0], REST[1], REST[2]]);
  for (let i = 1; i <= 5; i++) jab.push([t += 16, REST[0], REST[1], REST[2] - 0.06 * i]);
  for (let i = 4; i >= 0; i--) jab.push([t += 16, REST[0], REST[1], REST[2] - 0.06 * i]);
  for (let i = 0; i < 6; i++) jab.push([t += 16, REST[0], REST[1], REST[2]]);
  assert.equal(run(jab), 1, 'a straight forward jab no longer registers');
});

ok('and a reach, a curl, a hand swipe and a slow gesture are not', () => {
  // Held still, with sensor noise on it.
  const still = []; let t = 0;
  for (let i = 0; i < 40; i++) still.push([t += 16, REST[0] + noise(i), REST[1] + noise(i + 1), REST[2] + noise(i + 3)]);
  assert.equal(run(still), 0, 'noise alone fires a tap — the button would press itself');
  // OUT AND STAYS OUT: a finger curling is a reach, not a tap. This is the
  // distinction the whole detector rests on.
  const curl = []; t = 0;
  for (let i = 0; i < 8; i++) curl.push([t += 16, REST[0], REST[1], REST[2]]);
  for (let i = 1; i <= 12; i++) curl.push([t += 16, REST[0], REST[1] + 0.03 * i, REST[2]]);
  for (let i = 0; i < 10; i++) curl.push([t += 16, REST[0], REST[1] + 0.36, REST[2]]);
  assert.equal(run(curl), 0, 'a finger that moves and stays there fires a tap');
  // THE WHOLE HAND MOVING. Tip and knuckle travel together, so the offset does
  // not change at all — this is why the measurement is hand-relative, and it is
  // what stops a swipe from clicking things.
  const swipe = []; t = 0;
  for (let i = 0; i < 40; i++) swipe.push([t += 16, REST[0] + noise(i), REST[1], REST[2]]);
  assert.equal(run(swipe), 0, 'moving the whole hand fires a tap');
  // The same excursion, over a second and a half: a gesture, not a tap.
  const slow = []; t = 0;
  for (let i = 0; i < 8; i++) slow.push([t += 16, REST[0], REST[1], REST[2]]);
  for (let i = 1; i <= 22; i++) slow.push([t += 16, REST[0], REST[1] + 0.011 * i, REST[2]]);
  for (let i = 21; i >= 0; i--) slow.push([t += 16, REST[0], REST[1] + 0.011 * i, REST[2]]);
  assert.equal(run(slow), 0, 'a slow out-and-back fires a tap');
});

ok('one tap per tap, however fast they come', () => {
  assert.equal(run(tapFrames().concat(tapFrames(600))), 2, 'two separate taps did not both register');
  assert.equal(run(tapFrames().concat(tapFrames(180))), 1, 'a bounce after the tap fires a second one');
});

ok('a bad reading cannot fire anything, or poison the detector', () => {
  assert.equal(run([[16, NaN, 0, 0], [32, 0, NaN, 0], [48, 0, 0, NaN], [64, NaN, NaN, NaN]]), 0, 'a NaN fires a tap');
  const k = createKnock();
  k.push(16, ...REST); k.push(32, NaN, 0, 0);
  for (const f of tapFrames(48)) k.push(...f);
  assert.ok(true, 'one bad frame did not throw');
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

ok('a touch is the whole trigger — the other eight fingers are nobody\'s business', () => {
  // No posture to get into first. Bring two fingertips together and that is the
  // gesture, whatever the rest of the hands are doing.
  const b = spy(), th = createTwoHand({ body: b });
  const [L, R] = pair(1, true);
  // everything curled EXCEPT the two index fingers that are touching
  L.extended = [false, true, false, false, false];
  R.extended = [false, true, false, false, false];
  let t = hold(th, [L, R], 1000, 4);
  const painted = b.calls.filter((c) => c[0] === 'paint');
  assert.equal(painted.length, 1, 'two index fingers touching did nothing because the other fingers were curled');
  assert.equal(painted[0][1].length, 1, 'the index fingers did not give one colour');
  // ...but the pair that is TOUCHING has to be out. Fingertips folded into a
  // fist are near each other by accident, not offered to each other.
  const b2 = spy(), th2 = createTwoHand({ body: b2 });
  const [L2, R2] = pair(1, true);
  L2.extended = [true, false, true, true, true];
  R2.extended = [true, false, true, true, true];
  hold(th2, [L2, R2], 5000, 4);
  assert.equal(b2.calls.filter((c) => c[0] === 'paint').length, 0, 'a fist repainted the room');
  // and one hand alone says nothing at all
  assert.equal(th2.read([hand(0.4)], 9000), false, 'one hand spoke');
});

ok('size is the one thing that asks for open hands', () => {
  // It is the only CONTINUOUS gesture: read every frame rather than fired once.
  // Ungated, the body would resize itself the whole time both hands were in
  // frame, and every reach for the keyboard would rescale the room.
  const b = spy(), th = createTwoHand({ body: b });
  const half = [hand(0.05), hand(0.95)];
  half[0].extended = [true, true, false, false, false];
  hold(th, half, 1000, 30);
  assert.equal(b.calls.filter((c) => c[0] === 'swell').length, 0, 'a half-closed hand still resized the body');
  hold(th, [hand(0.05), hand(0.95)], 3000, 30);
  assert.ok(b.calls.filter((c) => c[0] === 'swell').length > 0, 'two open hands did not resize the body');
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
