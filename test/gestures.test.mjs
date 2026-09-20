// THE TWO NEW GESTURES — the air tap, and what ten fingers say.
// Run: node test/gestures.test.mjs
//
// Both of these are pure: the knock is a function of a little depth history,
// and the ten-finger language takes a body to talk to. So neither needs a DOM
// and both can be held to what they actually DO rather than to how they read.
// That matters more here than anywhere else in the hand, because a gesture that
// fires when you did not mean it is not a bug you can see in a diff.
import assert from 'node:assert';
import { createTwoHand } from '../src/twohand.js';
import { fingersOut, palmToScreen } from '../src/perceive.js';
import { readFileSync } from 'node:fs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- two fingers scroll the past --------------------------------------------
console.log('\ntwo fingers scroll the past:');

ok('the count ignores the thumb, and the thumb is why', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const fn = hv.slice(hv.indexOf('const fingersUp ='), hv.indexOf('export function createHandView'));
  // Measured, not assumed: the thumb's extension test crosses at a thumb held
  // roughly parallel to the fingers — 1.061 of threshold at 80 degrees of
  // abduction against a threshold of 1.06 — which is exactly where a resting
  // thumb sits during a two-finger gesture, moving ~3% per 10 degrees. A rule
  // counting all five would chatter at the tracker's own 24Hz.
  assert.ok(/for \(let i = 1; i < HAND_TIPS\.length; i\+\+\)/.test(fn),
    'the count starts at the thumb — the rule will chatter at 24Hz');
  assert.ok(/const SCROLL_FINGERS = 2;/.test(hv), 'the number is no longer a named one');
});

ok('the posture is read once per hand, and ridden on the call', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // reach.js is a pointer bus and knows nothing about fingers; the view owns
  // the posture. Putting the count in reach would be the same thing with a
  // worse contract, and it differs per hand.
  assert.ok(/const up = h \? fingersUp\(h\) : 0;/.test(hv), 'the finger count is not read');
  assert.ok(/const mayScroll = !!h && up === SCROLL_FINGERS;/.test(hv), 'the posture is not read');
  assert.ok(/reach\.move\(key, x, y, now, up\)/.test(hv), 'the finger count never reaches the bus');
  assert.ok(hv.indexOf('const up = h ? fingersUp(h) : 0;') < hv.indexOf('reach.move(key, x, y, now, up)'),
    'the count is read after it is used');
  const src = readFileSync(new URL('../src/reach.js', import.meta.url), 'utf8');
  assert.ok(/fingers = 0\)/.test(src),
    'the count does not default to zero — a call site that forgets would get everything');
  // Against the CODE, not the prose — reach.js talks about fingers constantly
  // in its comments, which is fine; what it must not do is read one.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(extended|fingersUp|HAND_TIPS)\b/.test(code), 'reach.js has learned about fingers');
});

ok('an open hand sweeping across the words scrolls nothing', () => {
  // This was the worst of it and it was not a stray finger: the per-finger loop
  // that drives the pointer runs BEFORE the palm-halt branch, and the halt
  // deliberately does not stand the pointer down — so an open hand swept across
  // the screen dragged the conversation the whole way.
  const src = readFileSync(new URL('../src/reach.js', import.meta.url), 'utf8');
  assert.ok(/p\.swipe = onSurface && fingers === 2;/.test(src), 'a five-finger sweep can still take hold of the past');
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
// N FINGERS AGAINST N. The two hands offer the same number of fingers and the
// nearest pair meets; which fingers they are is deliberately varied, because
// the whole point is that it does not matter.
function touchN(n, closed, which = null) {
  const L = hand(0.40), R = hand(0.60), dx = closed ? 0.008 : 0.10;
  const pick = which || [1, 2, 3, 4].slice(0, n);
  const ext = [false, false, false, false, false];
  for (const i of pick) ext[i] = true;
  L.extended = ext.slice(); R.extended = ext.slice();
  pick.forEach((i, k) => {
    L.points[TIPS[i]] = [0.5 - dx, 0.38 + k * 0.03, 0];
    R.points[TIPS[i]] = [0.5 + dx, 0.38 + k * 0.03, 0];
  });
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

ok('how MANY fingers touch, never which ones', () => {
  // The old rule asked which PAIR was meeting — middles for two colours, ring
  // fingers for three — and that is a question about adjacent landmarks on two
  // hands that are occluding each other, which is where the model is least
  // sure. This one never asks it: n fingers against n fingers is n colours,
  // whichever fingers they happen to be.
  const b = spy(), th = createTwoHand({ body: b });
  let t = 5000;
  for (const n of [1, 2, 3, 4]) {
    b.calls.length = 0;
    t = hold(th, touchN(n, false), t) ;
    t = hold(th, touchN(n, true), t);
    t = hold(th, touchN(n, false), t) + 400;
    const painted = b.calls.filter((c) => c[0] === 'paint').pop();
    assert.ok(painted, `${n} against ${n} said nothing`);
    assert.equal(painted[1].length, n, `${n} fingers against ${n} gave ${painted[1].length} colours`);
  }
});

ok('the same count means the same thing whichever fingers make it', () => {
  // Two colours from index+middle, then two colours from ring+little. The old
  // rule would have called the second one FOUR colours.
  const b = spy(), th = createTwoHand({ body: b });
  let t = 20000;
  t = hold(th, touchN(2, true, [1, 2]), t) + 400;
  const first = b.calls.filter((c) => c[0] === 'paint').pop();
  b.calls.length = 0;
  t = hold(th, touchN(2, false, [3, 4]), t);
  t = hold(th, touchN(2, true, [3, 4]), t) + 400;
  const second = b.calls.filter((c) => c[0] === 'paint').pop();
  assert.equal(first[1].length, 2);
  assert.equal(second[1].length, 2, 'the little and ring fingers were read as a different number');
});

ok('touching again turns over the NEXT colour, and each count keeps its own place', () => {
  const b = spy(), th = createTwoHand({ body: b });
  let t = 40000;
  const hues = [];
  for (let k = 0; k < 4; k++) {
    t = hold(th, touchN(2, false), t);
    t = hold(th, touchN(2, true), t) + 400;
    hues.push(b.calls.filter((c) => c[0] === 'paint').pop()[1].map((x) => x.rgb.join(',')).join('|'));
  }
  assert.equal(new Set(hues).size, 4, 'four touches did not give four different pairs of colours');
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

ok('the orb turn walks every look the body has, not just the four ways of drawing', () => {
  const b = spy(), th = createTwoHand({ body: b });
  const seen = [];
  for (let n = 0; n < 20; n++) {
    b.calls.length = 0;
    th.nextLook();
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
  // FIVE READINGS, ALL TRUE. Not "none of them false": [].every() is TRUE, so
  // a hand whose extension array was never filled — which is what a borrowed
  // camera produced — satisfied this and halted the body on any shape at all.
  assert.ok(/if \(h\.palm && h\.extended\?\.length === 5 && h\.extended\.every\(\(v\) => v === true\)\)/.test(hv),
    'the halt no longer needs an OPEN palm — a fist, or a hand with no reading at all, would stop it');
  // The PROPERTY, not a proxy for it: `grip` is merely computed early now (the
  // bubble has to be drawn above every early exit), so where it is DECLARED
  // says nothing. What matters is that the halt's `continue` runs before
  // anything acts on a pinch.
  assert.ok(hv.indexOf('halting = true') < hv.indexOf('if (grip && pt && (pinched[hand]'),
    'a halting hand can still pinch');
  assert.ok(hv.indexOf('halting = true') < hv.indexOf('if (twoUp && mid && reach'),
    'a halting hand can still press');
});

// --- closing one window is not closing it forever ---------------------------
console.log('\nan X means not this one:');

ok('showing a window undoes the closing of it', () => {
  const w = readFileSync(new URL('../src/windows.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  // `shut` is display:none with an !important on it, and NOTHING in this app
  // ever removed it. So closing the memory window closed it for the session:
  // every later memory set the body class and raised a window that was still
  // display:none, and so appeared to do nothing at all.
  assert.ok(/\.mind-win\.shut \{ display: none !important; \}/.test(css), 'the class this guards is gone');
  assert.ok(/const unshut = \(el\) => el\.classList\.remove\('shut', 'min'\);/.test(w), 'nothing undoes a close');
  assert.ok(/if \(el\) \{ unshut\(el\); raise\(el\); \}/.test(w), 'showing a memory does not reopen a closed window');
  // ...and closing still closes: the X is not being quietly disarmed.
  assert.ok(/el\.classList\.add\('shut'\)/.test(w), 'the X no longer closes anything');
});

// --- the orb turn -----------------------------------------------------------
// Make the shape that means zero and rotate until the back of your hand faces
// the camera. The gestures it replaces — thumbs touching, then a fist bump —
// were both weak for the same reason: they happened WHERE THE TWO HANDS MEET,
// which is the hand model's worst case. This one is one hand, unoccluded, and
// fires on a SIGN CHANGE rather than a distance crossing a line.
console.log('\nthe orb turn:');

ok('it is armed by the ring and fired by the turn, once', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  assert.ok(/const turning = \[null, null\];/.test(hv), 'the turn keeps no state');
  assert.ok(/if \(!grip\) turning\[hand\] = null;/.test(hv), 'opening the fingers does not disarm it');
  assert.ok(/turning\[hand\] = \{ side: h\.palm, fired: false \}/.test(hv), 'it does not remember which way the hand faced');
  assert.ok(/h\.palm !== turning\[hand\]\.side/.test(hv), 'it does not fire on the turn');
  assert.ok(/turning\[hand\]\.fired = true;/.test(hv), 'one ring could walk the whole list in a second');
});

ok('a pinch that rotates is not a click', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // The ring IS the press gesture — it has to be, it is thumb against index —
  // so the press has already gone down by the time the wrist starts moving.
  // SLICED BY A MARKER THAT IS ASSERTED TO EXIST. indexOf returns -1 when it
  // does not, slice(start, -1) then runs to the end of the file, and the block
  // swallows every later use of letGo — which is how this test passed on a
  // source that had been broken on purpose. Third time in this repo.
  const from = hv.indexOf('turning[hand].fired = true;');
  const to = hv.indexOf('const orb = body.orbPx', from);
  assert.ok(from > 0 && to > from, 'the orb turn block cannot be located');
  // ...and read as CODE, not prose. The comment inside this very block explains
  // why letGo is wrong, so a naive grep finds its own explanation. That is the
  // third time today; when a guard looks for an identifier, strip the comments.
  const blk = hv.slice(from, to).replace(/\/\/[^\n]*/g, '');
  assert.ok(/reach\.end\(hkey\)/.test(blk), 'the press the ring started is left down');
  assert.ok(!/letGo/.test(blk),
    'it lets go rather than ending — letGo fires a click if the pointer barely moved, so the turn would press whatever it passed over');
  assert.ok(/holding\[hand\] = null/.test(blk), 'the hand is left marked as holding something it no longer holds');
});

ok('the list of looks still lives with everything else the body is told', () => {
  const th = createTwoHand({ body: spy() });
  assert.equal(typeof th.nextLook, 'function', 'handview has no way to walk the looks');
});

// --- leaving the palm ------------------------------------------------------
// The halt works and Colin likes it; what was wrong was the way OUT of it. The
// first fix stood the whole hand down for half a second, and that was too much
// — he asked for it back: sticky for the palm, slippery for the pointer. So the
// tail now holds back exactly one thing, the fingertips' push, and everything
// else about the hand is live the instant the palm is gone.
//
// These read the source because drawCursors needs a DOM, but each assertion is
// on a property with a reason rather than on the shape of a line.
console.log('\nleaving the palm:');

ok('the stop outlasts the posture, by longer than a hand takes to move', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const m = hv.match(/const HALT_TAIL_MS = (\d+);/);
  assert.ok(m, 'there is no tail — the push is live the frame the palm breaks');
  const tail = Number(m[1]);
  // Two rAF frames — 33ms — was what it had, and leaving a palm takes ten
  // times that.
  assert.ok(tail >= 300, `a ${tail}ms tail is shorter than the movement it exists to cover`);
  assert.ok(tail <= 1200, `a ${tail}ms tail holds the push back long enough to feel broken`);
});

ok('the latch is keyed by which hand, never by slot', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // MediaPipe's result order is not an identity: when the left hand leaves, the
  // right moves from slot 1 to slot 0. A latch held by index would hold back
  // the hand that is still working.
  assert.ok(hv.includes('const spent = new Map()'), 'the latch is not a map');
  assert.ok(hv.includes('spent.set(hkey, now + HALT_TAIL_MS)'), 'the palm does not arm the tail by hand');
  assert.ok(hv.includes('const hkey = h ? keyOf(h, hand) : null;'), 'the key is not handedness');
  assert.ok(!/spent\[(hand|0|1)\]/.test(hv), 'the latch is indexed by slot somewhere');
});

ok('THE TAIL HOLDS BACK THE PUSH AND NOTHING ELSE', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // A palm stops the BODY. It was never meant to switch the HAND off, and for
  // one release it did — the marks stopped acting, presses stopped landing.
  assert.ok(/const acts = i === act && !!reach && !shaping && !holding\[hand\];/.test(hv),
    'the acting finger is stood down by the tail again — the hand goes dead after a palm');
  assert.ok(hv.includes('if (tailed) { wasAt[hand].length = 0; continue; }'),
    'the tail no longer holds the push back');
  // ...and it must sit immediately before the push loop, after the pinch
  // branches, or it takes the pinch down with it.
  const cut = hv.indexOf('if (tailed) { wasAt[hand].length = 0; continue; }');
  assert.ok(cut > hv.indexOf('const grip = '), 'the tail runs before the pinch — a palm would block a press');
  assert.ok(cut < hv.indexOf('let touching = 0;'), 'the tail runs after the push it is meant to hold back');
  assert.ok(hv.indexOf('halting = true') < cut, 'the tail runs before the halt is armed');
});

ok('a palm puts down what it was holding, but is not a switch', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const i = hv.indexOf('const standDown = (i, key) => {');
  assert.ok(i > 0, 'there is no one place that says what a palm lets go of');
  const fn = hv.slice(i, hv.indexOf('};', i));
  assert.ok(/endPinch\(i\)/.test(fn), 'a grip goes on stretching the body through a palm');
  assert.ok(/wasAt\[i\]\.length = 0/.test(fn), 'a previous position is what the next push is measured from');
  assert.ok(/aim\[i\]\.length = 0/.test(fn), 'a pre-palm aim would place the next press where the hand used to point');
  assert.ok(/holding\[i\] = null/.test(fn) && /letGo/.test(fn), 'a held press stays down through the halt');
  // AND NOT THIS. Ending the pointer is what made the hand feel switched off.
  assert.ok(!/reach\.end\(/.test(fn), 'a palm ends the pointer — the hand goes dead instead of the body going still');
});

ok('a fist needs no rule of its own', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // Worth stating, because it is why the fix is a tail and not a new gesture.
  // A fist has no extended fingers, so no mark is drawn and nothing is written
  // to `here` — and the push loop reads `here`. A fist already draws nothing
  // and already pushes nothing; what it could not do was GET there without
  // throwing the body on the way.
  // ...and the merge now also suppresses the two that became the bubble, which
  // is an ADDITION to the rule rather than a replacement of it.
  assert.ok(/const shown = !!h && h\.extended\?\.\[i\] === true && !!h\.tips\[i\] && !\(twoUp && upIdx\.includes\(i\)\);/.test(hv),
    'a mark no longer requires an extended finger — a fist would show cursors');
  assert.ok(/if \(ext\[INDEX\] === true\) return INDEX;/.test(hv),
    'actingFinger changed shape — check a fist still returns -1');
  const loop = hv.slice(hv.indexOf('let touching = 0;'), hv.indexOf('if (touching) body.handTouch'));
  assert.ok(/if \(!at\) \{[^}]*continue; \}/.test(loop),
    'a finger with no position no longer skips the push — a fist could spin the orb');
  assert.ok(loop.indexOf('if (!at)') < loop.indexOf('touching += 1'),
    'a finger with no position is counted as touching the body');
});

ok('a repeated tracker reading is not a still finger', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  const loop = hv.slice(hv.indexOf('let touching = 0;'), hv.indexOf('if (touching) body.handTouch'));
  // PRESENCE FIRST: indexOf returns -1 when absent, and -1 is less than any
  // real index, so an ordering check alone passes loudest exactly when the
  // thing it guards has been deleted.
  assert.ok(loop.includes('if (!fresh) continue;'),
    'a repeated tracker reading is pushed as a movement again — this is what made it sticky');
  assert.ok(loop.indexOf('if (!fresh) continue;') < loop.indexOf('body.handSpin'),
    'the fresh-reading gate runs after the push it is supposed to gate');
  const body = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  // ...and the body must be told separately that fingers are ON it, or letting
  // go becomes "the next frame the tracker happened to skip".
  assert.ok(/handTouch\(n\) \{/.test(body), 'the body cannot tell a still finger from a repeated reading');
  assert.ok(/if \(handPush\.on\) \{ handPush\.held = true;/.test(body), 'liveness is still taken from the pushes');
  assert.ok(!/velX = handPush\.x; velY = handPush\.y;\s*\n\s*resumeTimer/.test(body),
    'the velocity is set outside the movement branch again — silence would wipe it');
});

ok('turning the switch off forgets the latch', () => {
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  assert.ok(/spent\.clear\(\);/.test(hv), 'a hand that halted stays held back across a restart');
});

// --- the pinch is the click ------------------------------------------------
console.log('\nthe pinch is the click:');

ok('two fingers press and HOLD; one finger only points', () => {
  const src = readFileSync(new URL('../src/reach.js', import.meta.url), 'utf8');
  const hv = readFileSync(new URL('../src/handview.js', import.meta.url), 'utf8');
  // ONE press gesture, and three attempts at another have now been retired.
  // The air tap could not be told from a wag. The scrunch fired accurately but
  // dragged the cursor down on its way in, because the finger making the
  // gesture was the finger doing the aiming. And the fingertip pinch measured
  // 3.8cm of daylight as "touching", so it fired whenever a hand rested.
  //
  // Two fingers up is none of those: no shape to identify, no distance to
  // cross, and the pair that makes it IS the mark that aims it.
  assert.ok(/holdAt\(key, x, y, now, fingers\)/.test(src) || /holdAt\(key, x, y, now, fingers = 0\)/.test(src),
    'the held press is gone');
  assert.ok(/letGo\(key\)/.test(src), 'nothing releases it');
  assert.ok(/release\(p, moved < 12\);/.test(src),
    'a press that barely moved no longer clicks — a two-finger tap would do nothing');
  assert.ok(/const moved = p\.from \? Math\.hypot/.test(src),
    'nothing measures how far it travelled, so a drag would end in a click');
  assert.ok(/reach\.holdAt\(key, mid\[0\], mid\[1\], now, 2\)/.test(hv), 'the view no longer presses between the two fingers');
  // and there is no second press gesture left behind
  assert.ok(!/reach\.tap\(/.test(hv), 'a second press gesture is still wired up');
  assert.ok(!/createScrunch|createKnock/.test(hv), 'a retired detector is still being fed');
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
