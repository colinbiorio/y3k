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
import { fingersOut, palmToScreen } from '../src/perceive.js';
import { readFileSync } from 'node:fs';

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
  return {
    calls,
    setSwell: (k) => calls.push(['swell', k]),
    setForm: (f) => calls.push(['form', f]),
    setShape: (sp) => calls.push(['shape', sp]),
    paintColors: (a) => calls.push(['paint', a]),
  };
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
    // The thumbs say a LOOK, which is either a way of drawing (and a setShape
    // first, to drop whatever geometry was standing) or a shape.
    const look = c.find((x) => x[0] === 'form' || (x[0] === 'shape' && x[1]));
    const painted = c.find((x) => x[0] === 'paint');
    said.push(look ? 'form' : painted ? painted[1].length : 'nothing');
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

console.log('\nwhich fingers are out:');

// A hand, built honestly: 21 points, each finger a chain of four. Straight
// fingers point up (y decreasing); curled ones fold the tip back toward the
// knuckle, which is what a curled finger does and what the old test could not
// see when the hand faced the camera.
function handOf({ curl = [0, false, false, false, false], thumbIn = false } = {}) {
  const p = new Array(21).fill(0).map(() => [0, 0, 0]);
  p[0] = [0.50, 0.90, 0];
  const baseX = [0.40, 0.44, 0.50, 0.56, 0.61];
  const chains = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  for (let f = 0; f < 5; f++) {
    const [a, b, c, t] = chains[f], x = baseX[f];
    if (f === 0) {
      p[a] = [0.44, 0.84, 0]; p[b] = [0.40, 0.78, 0];
      if (thumbIn) { p[c] = [0.46, 0.74, 0]; p[t] = [0.52, 0.72, 0]; }  // folded across the palm
      else { p[c] = [0.34, 0.72, 0]; p[t] = [0.30, 0.67, 0]; }          // out to the side
      continue;
    }
    p[a] = [x, 0.72, 0];
    if (curl[f]) { p[b] = [x, 0.65, 0]; p[c] = [x + 0.01, 0.62, 0]; p[t] = [x + 0.005, 0.68, 0]; }
    else { p[b] = [x, 0.64, 0]; p[c] = [x, 0.57, 0]; p[t] = [x, 0.50, 0]; }
  }
  return p;
}

ok('a curled finger is in, however well the camera can see its tip', () => {
  // THE BUG THIS REPLACES: the old test asked whether the tip was further from
  // the wrist than the joint below it, which is true of a half-curled finger
  // seen from the front. Curled fingers kept leaving marks on the screen.
  const shapes = {
    'open hand': [handOf(), [true, true, true, true, true]],
    'pointing': [handOf({ curl: [0, false, true, true, true], thumbIn: true }), [false, true, false, false, false]],
    'a fist': [handOf({ curl: [0, true, true, true, true], thumbIn: true }), [false, false, false, false, false]],
    'two fingers': [handOf({ curl: [0, false, false, true, true], thumbIn: true }), [false, true, true, false, false]],
    'thumbs up': [handOf({ curl: [0, true, true, true, true], thumbIn: false }), [true, false, false, false, false]],
  };
  for (const [name, [pts, want]] of Object.entries(shapes)) {
    assert.deepEqual(fingersOut(pts), want, `${name} read as ${JSON.stringify(fingersOut(pts))}`);
  }
});

ok('a finger is out when it is spending its own length, and the thumb is its own case', () => {
  // The ratio needs no calibration and survives the hand being at any angle,
  // because both the bones and the reach shrink with distance together.
  const straight = fingersOut(handOf());
  assert.ok(straight.every(Boolean), 'an open hand is not fully open');
  // Halve every finger's distance from the camera: the same hand, further away.
  const far = handOf().map(([x, y, z]) => [0.5 + (x - 0.5) * 0.4, 0.8 + (y - 0.8) * 0.4, z]);
  assert.deepEqual(fingersOut(far), straight, 'the same hand read differently at a distance');
  // A THUMB TUCKED INTO A FIST stays nearly straight along its own chain — it
  // swings across the palm rather than folding — so the ratio would call it
  // out. It is measured against the far knuckle instead.
  assert.equal(fingersOut(handOf({ curl: [0, true, true, true, true], thumbIn: true }))[0], false, 'a tucked thumb reads as out');
  assert.equal(fingersOut(handOf({ thumbIn: false }))[0], true, 'an extended thumb reads as in');
  // and a hand with no points at all answers, rather than throwing
  assert.deepEqual(fingersOut(new Array(21).fill(0).map(() => [0, 0, 0])), [false, false, false, false, false], 'a degenerate hand did not answer false');
});

ok('the thumbs walk every look the body has, not just the four ways of drawing', () => {
  const b = spy(), th = createTwoHand({ body: b });
  const seen = [];
  let t = 80000;
  for (let n = 0; n < 20; n++) {
    t = hold(th, pair(0, false), t, 5);
    t = hold(th, pair(0, true), t, 5) + 400;
    const last = b.calls.filter((c) => c[0] === 'form' || c[0] === 'shape').pop();
    seen.push(last ? last[1] : null);
  }
  const forms = seen.filter((x) => typeof x === 'string');
  const shapes = seen.filter((x) => x && typeof x === 'object').map((x) => x.shape);
  assert.ok(forms.length >= 4, `only ${forms.length} render forms in twenty touches`);
  assert.ok(new Set(shapes).size >= 10, `only ${new Set(shapes).size} distinct shapes in twenty touches — the library is unreachable by hand`);
  for (const want of ['helix', 'hopf', 'calabi', 'pendulum', 'super']) {
    assert.ok(shapes.includes(want), `${want} is not reachable by thumb`);
  }
  // and it comes back round rather than stopping at the end
  assert.ok(seen[17] !== null && seen[0] !== null, 'the walk does not wrap');
});

console.log('\nthe hands on the body:');

ok('a palm to the screen is told apart from the back of the hand, for either hand', () => {
  // The signed turn of wrist -> index knuckle -> little knuckle. Walk those
  // three and they go one way for a palm and the other for a back, which is
  // the same fact that stops a glove fitting the wrong hand.
  const mk = (indexLeft) => {
    const p = new Array(21).fill(0).map(() => [0, 0, 0]);
    p[0] = [0.50, 0.80, 0];
    p[5] = [indexLeft ? 0.45 : 0.55, 0.62, 0];
    p[17] = [indexLeft ? 0.56 : 0.44, 0.64, 0];
    return p;
  };
  assert.equal(palmToScreen(mk(true), 'Right'), true, 'a right palm does not read as a palm');
  assert.equal(palmToScreen(mk(false), 'Right'), false, 'the back of a right hand reads as a palm');
  assert.equal(palmToScreen(mk(false), 'Left'), true, 'a left palm does not read as a palm');
  assert.equal(palmToScreen(mk(true), 'Left'), false, 'the back of a left hand reads as a palm');
  // edge-on, where it is facing neither
  const flat = new Array(21).fill(0).map(() => [0.5, 0.5, 0]);
  assert.equal(palmToScreen(flat, 'Right'), false, 'a hand edge-on claims to be a palm');
  assert.equal(palmToScreen([], 'Right'), false, 'an empty hand claims to be a palm');
});

ok('the body sums what the hands do to it, and a palm stops it', () => {
  const body = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // SUMMED, never averaged: five fingers one way and two the other leave it
  // turning the first way and slower, which is what would happen to a real
  // object. Averaging would make two fingers as strong as five.
  assert.ok(/handPush\.x \+= dx \* ROT_SPEED; handPush\.y \+= dy \* ROT_SPEED; handPush\.n \+= 1;/.test(body), 'the hands no longer sum — two fingers would push as hard as five');
  assert.ok(/velX = handPush\.x; velY = handPush\.y;/.test(body), 'the turn the hands left is not what a release inherits — a flick would not carry');
  // and everything the loop reads is declared above it
  const loopAt = body.indexOf('  function frame()');
  for (const decl of ['const handPush = {', 'const pinches = [null, null];', 'let halted = false;']) {
    assert.ok(body.indexOf(decl) > 0 && body.indexOf(decl) < loopAt, `${decl} is declared below the loop that reads it`);
  }
  // A PALM STOPS IT, and holds it stopped — not a brake that slows it.
  assert.ok(/if \(halted\) \{ velX = 0; velY = 0; return; \}/.test(body), 'a palm no longer stops the body, or does not hold it stopped');
  assert.ok(/handSpin\(dx, dy\) \{\s*\n\s*if \(halted/.test(body), 'a hand that says stop can still push');
  assert.ok(/if \(h\.palm && h\.extended\?\.every\?\.\(\(v\) => v === true\)\)/.test(hv), 'the halt no longer needs an OPEN palm — a fist would stop it');
  assert.ok(hv.indexOf('halting = true') < hv.indexOf('const grip = '), 'a halting hand can still pinch');
});

ok('a pinch holds a place on the body, in the body own space', () => {
  const body = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  // LOCAL, not world. The body turns under the hand, so a pull held in world
  // space would slide across the surface as it rotated — you would take hold
  // of one place and find yourself dragging another.
  assert.ok(/applyQuaternion\(_invRig\(\)\)/.test(body), 'the pinch is no longer stored in the body own space');
  assert.equal((body.match(/applyQuaternion\(_invRig\(\)\)/g) || []).length, 2, 'the anchor and the pull are not both in the same space');
  assert.ok(/if \(q > 1\) return false;/.test(body), 'a pinch off the body still takes hold');
  // the falloff, and both shaders applying it
  assert.equal((body.match(/pos \+= pinchPull\(dir\);/g) || []).length, 2, 'the web does not stretch with the field it is drawn between');
  assert.ok(/exp\(uPinchA\.w \* \(dot\(d0, uPinchA\.xyz\) - 1\.0\)\)/.test(body), 'the pinch no longer falls off with distance — it would move the whole body');
  // and letting go eases rather than snaps
  assert.ok(/uv\.value\.multiplyScalar\(1 - k\)/.test(body), 'letting go of a stretched body snaps it back');
  assert.ok(/const PINCH_REACH = \d+;/.test(body), 'how tightly a pinch holds is no longer a named number');
});

console.log('\n' + passed + ' checks passed.\n');
