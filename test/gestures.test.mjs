// THE TWO NEW GESTURES — the air tap, and what ten fingers say.
// Run: node test/gestures.test.mjs
//
// Both of these are pure: the knock is a function of a little depth history,
// and the ten-finger language takes a body to talk to. So neither needs a DOM
// and both can be held to what they actually DO rather than to how they read.
// That matters more here than anywhere else in the hand, because a gesture that
// fires when you did not mean it is not a bug you can see in a diff.
import assert from 'node:assert';
import { createScrunch, SCRUNCH } from '../src/reach.js';
import { createTwoHand } from '../src/twohand.js';
import { fingersOut, palmToScreen } from '../src/perceive.js';
import { readFileSync } from 'node:fs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- the scrunch ------------------------------------------------------------
// Bend the pointer finger and that is the click. The detector is fed ONE
// number per frame: how much of its own length the index is spending, which is
// ~0.97 straight and ~0.39 in a fist (measured off fingersOut, not guessed).
//
// This replaces the air tap, which was an out-and-back of the fingertip
// measured against its own knuckle. The reason it never became reliable is in
// the first test below: swinging a straight finger down from the knuckle moves
// the tip exactly as far as curling it does, so a wag and a tap were the same
// shape. In THIS signal a wag is silent, because the finger never bends.
const STRAIGHT = 0.97;
const noise = (i) => 0.004 * Math.sin(i * 2.3);

// A scrunch: straight for a while, bend over `inN` frames, come back over
// `outN`, straight again. 42ms a frame is the hand model's real rate (24Hz).
function scrunchFrames({ depth = 0.17, inN = 3, outN = 3, hold = 0, t0 = 0, pre = 6 } = {}) {
  const f = []; let t = t0;
  for (let i = 0; i < pre; i++) f.push([t += 42, STRAIGHT + noise(i)]);
  const began = t;                       // the last straight frame: the answer
  for (let i = 1; i <= inN; i++) f.push([t += 42, STRAIGHT - (depth / inN) * i]);
  for (let i = 0; i < hold; i++) f.push([t += 42, STRAIGHT - depth]);
  for (let i = outN - 1; i >= 0; i--) f.push([t += 42, STRAIGHT - (depth / outN) * i]);
  for (let i = 0; i < 4; i++) f.push([t += 42, STRAIGHT + noise(i)]);
  return { frames: f, began };
}
const fire = (frames) => {
  const k = createScrunch(); const at = [];
  for (const f of frames) { const r = k.push(...f); if (r) at.push(r); }
  return at;
};

console.log('\nthe scrunch:');

ok('bending the pointer finger clicks, subtly or emphatically', () => {
  for (const depth of [0.11, 0.17, 0.30]) {
    const { frames } = scrunchFrames({ depth });
    assert.equal(fire(frames).length, 1, `a ${depth} bend did not register`);
  }
  // and held a moment at the bottom, which is what a slow hand does
  assert.equal(fire(scrunchFrames({ hold: 4 }).frames).length, 1, 'a scrunch held for a beat did not register');
});

ok('IT CLICKS WHERE THE BEND BEGAN, not where it ended', () => {
  // This is the whole of "don't let this cause selections to be too low":
  // curling drags the fingertip down and in, so the press has to be placed at
  // the moment the finger was last straight.
  for (const depth of [0.11, 0.17, 0.30]) {
    const { frames, began } = scrunchFrames({ depth });
    assert.deepEqual(fire(frames), [began], `a ${depth} bend reported the wrong moment`);
  }
  // and it must not be fooled by noise into reporting a much earlier frame:
  // the straightest sample in the window is NOT the start of the bend, and
  // taking it cost 170ms in a synthetic trace — long enough for the hand to
  // have been pointing somewhere else entirely.
  const { frames, began } = scrunchFrames({ pre: 14 });
  assert.deepEqual(fire(frames), [began], 'the reported moment drifted back into the plateau');
});

ok('a WAG is silent, which is the whole reason for this signal', () => {
  // Swinging a straight finger from the knuckle: the tip travels as far as a
  // tap and the finger never bends. The old detector could not tell these
  // apart and fired on both.
  const wag = []; let t = 0;
  for (let i = 0; i < 24; i++) wag.push([t += 42, STRAIGHT + noise(i)]);
  assert.equal(fire(wag).length, 0, 'a wagging straight finger clicks');
});

ok('closing the hand is not a click, however far it goes', () => {
  // A bend that STAYS bent is a hand closing — making a fist, or giving up on
  // pointing. Clicking on that would fire every time you lowered your hand,
  // and lowering your hand is now how you leave the palm halt.
  const fist = []; let t = 0;
  for (let i = 0; i < 6; i++) fist.push([t += 42, STRAIGHT + noise(i)]);
  for (let i = 1; i <= 8; i++) fist.push([t += 42, Math.max(0.39, STRAIGHT - 0.08 * i)]);
  for (let i = 0; i < 8; i++) fist.push([t += 42, 0.39]);
  assert.equal(fire(fist).length, 0, 'closing a fist fires a click');
});

ok('and neither is a twitch, a slow curl, or a finger already bent', () => {
  assert.equal(fire(scrunchFrames({ depth: 0.05 }).frames).length, 0, 'a twitch fires a click');
  // A LANGUID BEND THAT STILL FITS THE WINDOW. Stretching it over a second and
  // a half proves nothing — the 460ms window rejects that on length alone and
  // the rate threshold is never reached. This one is deep enough (0.10), comes
  // all the way back, and fits inside the window; the only thing standing
  // between it and a click is that it was not quick.
  const slow = []; let t = 0;
  for (let i = 0; i < 3; i++) slow.push([t += 42, STRAIGHT + noise(i)]);
  for (let i = 1; i <= 7; i++) slow.push([t += 42, STRAIGHT - 0.0143 * i]);   // 0.10 over 294ms
  for (let i = 2; i >= 0; i--) slow.push([t += 42, STRAIGHT - 0.0333 * i]);
  for (let i = 0; i < 2; i++) slow.push([t += 42, STRAIGHT + noise(i)]);
  assert.equal(fire(slow).length, 0, 'a slow deliberate curl fires a click');
  // scrunching a finger that was already curled is fidgeting, not pointing
  const bent = []; t = 0;
  for (let i = 0; i < 6; i++) bent.push([t += 42, 0.70 + noise(i)]);
  for (let i = 1; i <= 3; i++) bent.push([t += 42, 0.70 - 0.06 * i]);
  for (let i = 2; i >= 0; i--) bent.push([t += 42, 0.70 - 0.06 * i]);
  for (let i = 0; i < 4; i++) bent.push([t += 42, 0.70 + noise(i)]);
  assert.equal(fire(bent).length, 0, 'bending an already-curled finger fires a click');
});

ok('it survives the hand model dropping to 15Hz', () => {
  // The rate halves when the face runs beside the hands, which is the failure
  // the air tap took three rounds to find: a detector that needs more samples
  // than the gesture contains cannot be tuned into working.
  // FIVE SAMPLES IN THE WINDOW, which is what a 250ms gesture at 15Hz really
  // is. A generous pre-roll would hide the problem: the window would fill up
  // with idle frames and any sample floor would pass. This is the starved case.
  const f = []; let t = 0;
  f.push([t += 66, STRAIGHT]);
  const began = t;
  for (let i = 1; i <= 2; i++) f.push([t += 66, STRAIGHT - 0.085 * i]);
  for (let i = 1; i >= 0; i--) f.push([t += 66, STRAIGHT - 0.085 * i]);
  assert.deepEqual(fire(f), [began], 'a scrunch at 15Hz is invisible to the detector');
});

ok('one click per scrunch, however fast they come', () => {
  const a = scrunchFrames({ t0: 0 }), b = scrunchFrames({ t0: 900 });
  assert.equal(fire(a.frames.concat(b.frames)).length, 2, 'two separate scrunches did not both register');
  const c = scrunchFrames({ t0: 200 });
  assert.equal(fire(a.frames.concat(c.frames)).length, 1, 'the finger settling fires a second click');
});

ok('a bad reading cannot fire anything, or poison the detector', () => {
  assert.equal(fire([[42, NaN], [84, undefined], [126, null], [168, NaN]]).length, 0, 'a NaN clicks');
  const k = createScrunch();
  k.push(42, STRAIGHT); k.push(84, NaN);
  for (const f of scrunchFrames({ t0: 126 }).frames) k.push(...f);
  assert.ok(true, 'one bad frame did not throw');
});

ok('the straightness it is fed is the one fingersOut already computes', () => {
  // One measurement, one meaning. If these drifted apart, the threshold that
  // says "extended" and the threshold that says "bent" would be about
  // different quantities.
  const straight = Array.from({ length: 21 }, () => [0, 0, 0]);
  straight[0] = [0, 1, 0]; straight[5] = [0, 0, 0];
  straight[6] = [0, -1, 0]; straight[7] = [0, -2, 0]; straight[8] = [0, -3, 0];
  straight[17] = [1, 0, 0];
  const out = [], bend = [];
  fingersOut(straight, out, straight, bend);
  assert.equal(out[1], true, 'a straight finger is not extended');
  assert.ok(bend[1] > 0.99, `a straight finger reads ${bend[1]}, not ~1`);
  const curled = straight.map((q) => q.slice());
  curled[7] = [0.6, -1.4, 0]; curled[8] = [0.2, -0.9, 0];
  const out2 = [], bend2 = [];
  fingersOut(curled, out2, curled, bend2);
  assert.equal(out2[1], false, 'a curled finger is still extended');
  assert.ok(bend2[1] < 0.5, `a curled finger reads ${bend2[1]}, not well under half`);
  // and the gesture's own floor sits above what fingersOut calls extended
  assert.ok(SCRUNCH.STRAIGHT > 0.82, 'a scrunch can start from a finger that is not even extended');
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

// --- leaving the palm ------------------------------------------------------
// The halt works; getting OUT of it did not. The test is on the source because
// drawCursors needs a DOM, but each assertion is on a property that has a
// reason, not on the shape of a line.
console.log('\nleaving the palm:');

ok('the stop outlasts the posture, by longer than a hand takes to move', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const m = hv.match(/const HALT_TAIL_MS = (\d+);/);
  assert.ok(m, 'there is no tail — the halt releases the frame the palm breaks');
  const tail = Number(m[1]);
  // Two rAF frames — 33ms — was what it had, and leaving a palm takes ten times
  // that. Below ~300ms the fingers are still moving when the hand goes live.
  assert.ok(tail >= 300, `a ${tail}ms tail is shorter than the movement it exists to cover`);
  assert.ok(tail <= 1200, `a ${tail}ms tail leaves the hand switched off long enough to feel broken`);
});

ok('the latch is keyed by which hand, never by slot', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // MediaPipe's result order is not an identity: when the left hand leaves, the
  // right moves from slot 1 to slot 0. A latch held by index would switch off
  // the hand that is still working — the same trap the pointer keys already
  // carry a comment about.
  assert.ok(hv.includes('const spent = new Map()'), 'the latch is not a map');
  assert.ok(hv.includes('spent.set(hkey, now + HALT_TAIL_MS)'), 'the palm does not arm the tail by hand');
  assert.ok(hv.includes('const hkey = h ? keyOf(h, hand) : null;'), 'the key is not handedness');
  assert.ok(!/spent\[(hand|0|1)\]/.test(hv), 'the latch is indexed by slot somewhere');
});

ok('a hand inside the tail touches nothing at all', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // The pointer half and the body half are two different code paths and the
  // tail has to close both: one turns the orb, the other scrolls the words.
  assert.ok(/const acts = i === act && !!reach && !shaping && !holding\[hand\] && !tailed;/.test(hv),
    'the acting finger still drives a pointer while the hand is standing down');
  assert.ok(hv.includes('if (tailed) { standDown(hand, hkey); continue; }'),
    'the tail does not stand the hand down before the body section');
  // ...and it must sit AFTER the palm branch, or a halting hand could pinch.
  assert.ok(hv.indexOf('halting = true') < hv.indexOf('if (tailed) { standDown'),
    'the tail branch runs before the halt is armed');
});

ok('standing down puts down every single thing a hand was holding', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const i = hv.indexOf('const standDown = (i, key) => {');
  assert.ok(i > 0, 'there is no one place that says what letting go means');
  const fn = hv.slice(i, hv.indexOf('};', i));
  // Each of these survives the gesture and acts after it if it is not cleared.
  assert.ok(/endPinch\(i\)/.test(fn), 'a grip goes on stretching the body');
  assert.ok(/wasAt\[i\]\.length = 0/.test(fn), 'a previous position is what the next push is measured from');
  assert.ok(/aim\[i\]\.length = 0/.test(fn), 'a pre-palm aim would place the next press where the hand used to point');
  assert.ok(/scrunch\[i\]\.reset\(\)/.test(fn), 'the bend samples either side of the gap read as one scrunch');
  assert.ok(/holding\[i\] = null/.test(fn) && /letGo/.test(fn), 'a held press stays down through the halt');
  assert.ok(/reach\.end\(key\)/.test(fn), 'the pointer is left hovering until the liveness sweep finds it');
});

ok('a fist needs no rule of its own', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // Worth stating, because it is why the fix is a tail and not a new gesture.
  // A fist has no extended fingers, so: no mark is drawn (the `shown` test),
  // nothing is written to `here`, and the spin loop reads `here` — so a fist
  // already draws nothing and already pushes nothing. What it could not do
  // before was GET there without throwing the body on the way.
  assert.ok(/const shown = !!h && h\.extended\?\.\[i\] === true && !!h\.tips\[i\];/.test(hv),
    'a mark no longer requires an extended finger — a fist would show cursors');
  // Stated as the property rather than as the line, because the line now also
  // carries the fresh-reading gate: a finger with no screen position must
  // reach neither handSpin nor the touch count.
  const loop = hv.slice(hv.indexOf('let touching = 0;'), hv.indexOf('if (touching) body.handTouch'));
  assert.ok(/if \(!at\) \{[^}]*continue; \}/.test(loop),
    'a finger with no position no longer skips the push — a fist could spin the orb');
  assert.ok(loop.indexOf('if (!at)') < loop.indexOf('touching += 1'),
    'a finger with no position is counted as touching the body');
  // PRESENCE FIRST. indexOf returns -1 when the string is absent, and -1 is
  // less than any real index, so an ordering check alone passes loudest
  // exactly when the thing it guards has been deleted.
  assert.ok(loop.includes('if (!fresh) continue;'),
    'a repeated tracker reading is still pushed as a movement — this is what made it sticky');
  assert.ok(loop.indexOf('if (!fresh) continue;') < loop.indexOf('body.handSpin'),
    'the fresh-reading gate runs after the push it is supposed to gate');
  assert.ok(/if \(ext\[INDEX\] === true\) return INDEX;/.test(hv),
    'actingFinger changed shape — check a fist still returns -1');
});

ok('turning the switch off forgets the latch', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  assert.ok(/spent\.clear\(\);/.test(hv), 'a hand that halted stays switched off across a restart');
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
