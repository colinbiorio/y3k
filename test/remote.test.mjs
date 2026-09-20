// A PHONE LENDING ITS EYE. Run: node test/remote.test.mjs
//
// Two things are worth testing here and they are not the interesting ones.
//
// The wire format, because both ends import it and a silent disagreement about
// it does not crash — it puts somebody's hand slightly in the wrong place.
//
// And the AUTHORIZATION, because this is the one feature in the app that lets
// one device drive another. remote.mjs never authenticates; it takes a uid the
// route has already resolved from a signed cookie and decides what that uid may
// touch. Every test below that passes a different uid is asking the same
// question: can a stranger see, feed, or close a screen that is not theirs?
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { pack, unpack, weigh, WIRE } from '../src/eyewire.js';
import * as remote from '../remote.mjs';

const ROOT = new URL('..', import.meta.url);
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const ME = 'uid-colin', THEM = 'uid-stranger';
const dev = (n) => `device-${n}-aaaaaaaa`;
// A response object shaped like the only part of one this module touches.
const fakeRes = () => {
  const r = { lines: [], ended: false, handlers: {} };
  r.write = (s) => { if (r.ended) throw new Error('write after end'); r.lines.push(s); return true; };
  r.end = () => { r.ended = true; };
  r.on = (ev, fn) => { r.handlers[ev] = fn; };
  // One write carries 'event: x\ndata: {...}\n\n', so the name has to be cut at
  // the newline — trimming the whole write leaves the payload glued to it.
  r.events = () => r.lines.map((l) => (l.match(/^event: *([^\n]+)/) || [])[1]).filter(Boolean);
  return r;
};
const reset = () => { for (const id of [...remote._internals.rooms.keys()]) remote.close(id, 'test'); };

console.log('\nthe wire:');

ok('a frame survives the round trip, quantised but not damaged', () => {
  const hand = {
    ok: true, handedness: 'Right', pinch: 0.3142,
    points: Array.from({ length: 21 }, (_, i) => [i / 21, i / 42, i / 84]),
    world: Array.from({ length: 21 }, (_, i) => [i / 21, -i / 42, i / 84]),
  };
  const back = unpack(pack({ hands: [hand], head: { ok: true, x: 0.11, y: -0.22, z: 0.33 } }, 999));
  assert.equal(back.hands.length, 1);
  assert.equal(back.hands[0].handedness, 'Right');
  assert.equal(back.hands[0].points.length, 21);
  assert.equal(back.hands[0].world.length, 21, 'the world set was dropped — a curled finger would read as extended');
  assert.ok(Math.abs(back.hands[0].pinch - 0.3142) < 1e-4);
  for (let i = 0; i < 21; i++) {
    for (let a = 0; a < 3; a++) {
      assert.ok(Math.abs(back.hands[0].points[i][a] - hand.points[i][a]) <= 5e-5, `point ${i}.${a} moved`);
    }
  }
  assert.equal(back.head.ok, true);
  assert.equal(back.t, 999, 'the sender clock did not survive — staleness would be measured against the wrong clock');
});

ok('an empty frame costs almost nothing', () => {
  const empty = pack({ hands: [], head: { ok: false } }, 1);
  assert.ok(weigh(empty) < 40, `an empty frame is ${weigh(empty)} bytes`);
  assert.equal(unpack(empty).hands.length, 0);
});

ok('two hands fit in the budget the channel is sized for', () => {
  const h = () => ({ ok: true, handedness: 'Left', pinch: 0.5,
    points: Array.from({ length: 21 }, () => [0.12345678, 0.87654321, 0.01234567]),
    world: Array.from({ length: 21 }, () => [0.12345678, 0.87654321, 0.01234567]) });
  const bytes = weigh(pack({ hands: [h(), h()], head: { ok: true, x: 0, y: 0, z: 0 } }, 1));
  assert.ok(bytes < remote._internals.MAX_FRAME_BYTES, 'a normal frame is over the server cap');
  assert.ok(bytes < 3000, `two hands cost ${bytes} bytes — the quantisation is not doing its job`);
});

ok('a hand that leaves is marked gone, not left standing', () => {
  const h = { ok: true, handedness: 'Left', pinch: 1, points: Array.from({ length: 21 }, () => [0.5, 0.5, 0]) };
  const into = unpack(pack({ hands: [h, h], head: { ok: false } }, 1));
  assert.equal(into.hands.filter((x) => x.ok).length, 2);
  unpack(pack({ hands: [h], head: { ok: false } }, 2), into);
  assert.equal(into.hands[1].ok, false, 'a hand that left is still on screen — it would grab the orb on its return');
  unpack(pack({ hands: [], head: { ok: false } }, 3), into);
  assert.equal(into.hands.filter((x) => x.ok).length, 0);
});

ok('a frame from a future version is ignored rather than half-read', () => {
  const into = unpack({ v: WIRE + 1, t: 5, h: [{ p: [1, 2, 3] }] });
  assert.equal(into.hands.length, 0, 'an unknown wire version was parsed anyway');
});

ok('a borrowed hand arrives WHOLE, not just as points', () => {
  // eyewire says it produces "exactly the shape perceive.snapshot() produces".
  // It was producing points and nothing derived from them, and every reader
  // downstream wants the derived fields:
  //   tips      the cursor's position and where a pinch is
  //   extended  which fingers are out
  const pts = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
  pts[0] = [0.5, 0.8, 0]; pts[5] = [0.5, 0.5, 0];
  pts[6] = [0.5, 0.4, 0]; pts[7] = [0.5, 0.3, 0]; pts[8] = [0.5, 0.2, 0];
  pts[17] = [0.7, 0.5, 0];
  const h = unpack(pack({ hands: [{ ok: true, points: pts, world: pts, handedness: 'Right', pinch: 0.9 }], head: { ok: false } }, 1)).hands[0];
  assert.equal(h.tips.length, 5, 'no fingertips — a borrowed camera draws no cursors and can press nothing');
  assert.deepEqual(h.tips[1], [pts[8][0], pts[8][1]], 'the index tip is not where the index landmark is');
  assert.equal(h.extended.length, 5, 'no extension reading — no pointer, no scroll, no press');
  assert.equal(h.extended[1], true, 'a plainly straight index is not read as out');
});

ok('AN EMPTY EXTENSION ARRAY IS NOT AN OPEN PALM', () => {
  // [].every(v => v === true) is TRUE. The palm halt asked exactly that, so a
  // hand with no extension reading — which is what a borrowed camera used to
  // produce — SATISFIED "every finger extended" and stopped the body on any
  // shape at all whose palm happened to face the camera.
  assert.equal([].every((v) => v === true), true, 'the language changed; this test is the reason for the guard');
  const hv = readFileSync(new URL('src/handview.js', ROOT), 'utf8');
  assert.ok(/h\.extended\?\.length === 5 && h\.extended\.every\(\(v\) => v === true\)/.test(hv),
    'the halt accepts a hand it has no reading for');
});

ok('a hand that did not survive the wire carries nothing stale', () => {
  const into = unpack(pack({ hands: [{ ok: true, points: Array.from({ length: 21 }, () => [0.5, 0.5, 0]), handedness: 'Left', pinch: 1 }], head: { ok: false } }, 1));
  assert.equal(into.hands[0].tips.length, 5);
  unpack({ v: 1, t: 2, h: [{ p: [1, 2, 3] }] }, into);          // a short, broken frame
  assert.equal(into.hands[0].ok, false, 'a frame with three numbers in it was taken as a hand');
  assert.equal(into.hands[0].tips.length, 0, 'the last good fingertips are still there to be drawn');
  assert.equal(into.hands[0].extended.length, 0, 'the last good extension reading is still there to be believed');
});

console.log('\nwho may drive whose screen:');

ok('a screen belongs to the account that announced it', () => {
  reset();
  assert.equal(remote.offer(ME, dev(1), 'the mac'), true);
  assert.equal(remote.list(ME).length, 1);
  assert.equal(remote.list(THEM).length, 0, 'a stranger can SEE this screen');
});

ok('a stranger cannot feed, attach to, or close it', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const res = fakeRes();
  assert.equal(remote.attach(THEM, dev(1), res), false, 'a stranger attached to the stream');
  assert.equal(remote.feed(THEM, dev(1), { v: 1 }).ok, false, 'a stranger drove the screen');
  assert.equal(remote.say(THEM, dev(1), { sig: 'answer' }), false, 'a stranger spoke on the back channel');
  assert.equal(remote.release(THEM, dev(1)), false, 'a stranger closed somebody else\'s screen');
  assert.equal(remote.list(ME).length, 1, 'the screen did not survive the attempts');
});

ok('a device id cannot be re-homed by claiming it', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  assert.equal(remote.offer(THEM, dev(1), 'not yours'), false, 'a stranger took over a live device id');
  assert.equal(remote.list(ME)[0].label, 'the mac');
});

ok('an owner sees their own screens and drives them', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const res = fakeRes();
  assert.equal(remote.attach(ME, dev(1), res), true);
  assert.ok(res.events().includes('hello'));
  const r = remote.feed(ME, dev(1), { v: 1, t: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.watching, true);
  assert.ok(res.events().includes('see'), 'the frame never reached the screen');
});

ok('frames are accepted while nobody is watching, and dropped', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const r = remote.feed(ME, dev(1), { v: 1 });
  // The phone must not have to know whether the desktop has reconnected this
  // second; an error here would make it back off exactly when it should not.
  assert.equal(r.ok, true);
  assert.equal(r.watching, false);
});

ok('an oversized frame is refused rather than relayed', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const huge = { v: 1, junk: 'x'.repeat(remote._internals.MAX_FRAME_BYTES + 10) };
  assert.equal(remote.feed(ME, dev(1), huge).ok, false, 'the frame cap is not enforced');
});

ok('the back channel rides home on the next frame, once', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  assert.equal(remote.say(ME, dev(1), { sig: 'answer', sdp: 'v=0' }), true);
  const first = remote.feed(ME, dev(1), { v: 1 });
  assert.equal(first.back.length, 1, 'the answer never reached the phone');
  const second = remote.feed(ME, dev(1), { v: 1 });
  assert.equal(second.back, undefined, 'the answer was delivered twice');
});

ok('the back queue is bounded by a phone that stopped listening', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  for (let i = 0; i < 100; i++) remote.say(ME, dev(1), { n: i });
  const r = remote.feed(ME, dev(1), { v: 1 });
  assert.ok(r.back.length <= 16, `the queue grew to ${r.back.length}`);
  assert.equal(r.back[r.back.length - 1].n, 99, 'it kept the oldest instead of the newest');
});

ok('a second listener replaces the first rather than doubling it', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const a = fakeRes(), b = fakeRes();
  remote.attach(ME, dev(1), a);
  remote.attach(ME, dev(1), b);
  assert.ok(a.ended, 'the first listener was left open — every frame would go out twice');
  remote.feed(ME, dev(1), { v: 1 });
  assert.ok(b.events().includes('see'));
});

ok('one account cannot fill the list with dead tabs', () => {
  reset();
  const max = remote._internals.MAX_ROOMS_PER_USER;
  for (let i = 0; i < max + 4; i++) remote.offer(ME, dev(i), `tab ${i}`);
  assert.equal(remote.list(ME).length, max, 'the per-account cap is not enforced');
});

ok('a screen that stops saying it is here is reaped', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const t = Date.now();
  assert.equal(remote.sweep(t + 1000), 0, 'a live screen was reaped');
  assert.equal(remote.sweep(t + remote._internals.ROOM_STALE_MS + 1000), 1, 'a dead screen lingers forever');
  assert.equal(remote.list(ME).length, 0);
});

ok('...but a screen somebody is still watching is not', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  remote.attach(ME, dev(1), fakeRes());
  assert.equal(remote.sweep(Date.now() + remote._internals.ROOM_STALE_MS * 4), 0,
    'a screen with an open listener was reaped out from under it');
});

ok('closing actually closes the connection, not just the listening', () => {
  reset();
  remote.offer(ME, dev(1), 'the mac');
  const res = fakeRes();
  remote.attach(ME, dev(1), res);
  remote.release(ME, dev(1));
  assert.ok(res.ended, 'the stream was left open server-side');
  assert.ok(res.events().includes('end'));
  assert.equal(remote.list(ME).length, 0);
});

console.log('\nthe route in front of it:');

ok('every remote route resolves the cookie before touching the module', () => {
  const server = readFileSync(new URL('server.mjs', ROOT), 'utf8');
  const block = server.slice(server.indexOf("if (reqPath.startsWith('/api/remote/'))"), server.indexOf("if (req.method === 'POST' && reqPath === '/api/world/walk')"));
  assert.ok(block.length > 400, 'the remote routes are gone');
  // The uid is resolved ONCE at the top of the block and every call below uses
  // it. remote.mjs authorizes but never authenticates, so a route that reached
  // it without this line would be the whole security story, missing.
  const gate = block.indexOf('const user = sessionUser(req);');
  assert.ok(gate >= 0 && gate < 200, 'the signed cookie is not resolved first');
  assert.ok(/if \(!user\) return json\(401/.test(block), 'an unsigned request is not turned away');
  for (const call of block.match(/remote\.\w+\(/g) || []) {
    assert.ok(block.indexOf(call) > gate, `${call} runs before the cookie is checked`);
  }
  assert.ok(!/remote\.(feed|attach|say|release|offer|list)\([^u)]/.test(block.replace(/remote\.(feed|attach|say|release|offer|list)\(user\.id/g, '')),
    'something reaches remote.mjs with a uid that did not come from the cookie');
});

ok('the eye has a rate bucket of its own, because it is a frame rate', () => {
  const server = readFileSync(new URL('server.mjs', ROOT), 'utf8');
  const max = +server.match(/RATE_EYE_MAX\) \|\| (\d+)/)[1];
  // 24Hz is 1440 a minute. A ceiling under that throttles the feature into
  // uselessness three seconds after it starts working.
  assert.ok(max >= 1440, `the eye's ceiling is ${max}/min, under its own 1440/min frame rate`);
  assert.ok(/\/\^\\\/api\\\/remote\\\/eye\\\//.test(server), 'the eye route is not mapped to its bucket');
});

console.log('\nnaming a device, and asking it for its camera:');

ok('a device is called something a person would recognise', () => {
  const src = readFileSync(new URL('src/remote-eye.js', ROOT), 'utf8');
  // navigator.platform was the first thing to hand and it is the wrong thing:
  // it says "MacIntel" for an Apple Silicon Mac and "Linux armv81" for an
  // Android phone. Nobody picks their laptop out of a list that says that.
  // Checked against the CODE, not the prose: the comment above deviceName()
  // explains why that property is wrong, and a naive grep finds its own
  // explanation and fails.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/navigator\.platform/.test(code), 'navigator.platform is back — it reports MacIntel and Linux armv81');
  const fn = src.slice(src.indexOf('export function deviceName()'), src.indexOf('export function renameDevice'));
  for (const want of ['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Chromebook']) {
    assert.ok(fn.includes(want), `${want} is not recognised`);
  }
  // ...and a guess is only ever a starting point: two identical phones will
  // always need a name typed by hand.
  assert.ok(/localStorage\.getItem\(NAME_KEY\)/.test(fn), 'a typed name does not win over the guess');
  const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
  assert.ok(/createRemoteEye\(\{ label: deviceName\(\)/.test(main), 'the device announces itself under some other name');
});

ok('every signed-in device announces itself, not only one that wants something', () => {
  const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
  // Both pickers are lists of the OTHER devices, so a device that only
  // announced itself when it wanted an eye could never be lent one.
  const at = main.indexOf('remoteEye.start();');
  assert.ok(at > 0, 'nothing announces the device');
  assert.ok(at > main.indexOf('enterApp.now = function'), 'it announces before anyone is signed in — the routes answer 401');
  assert.ok(at < main.indexOf('body.setMood(\'excited\')'), 'it announces late enough to miss the list');
});

ok('borrowing ASKS the other device rather than only listening', () => {
  const src = readFileSync(new URL('src/remote-eye.js', ROOT), 'utf8');
  const borrow = src.slice(src.indexOf('async borrow(deviceId)'), src.indexOf('async release()'));
  assert.ok(/ctl: 'lend', to: id/.test(borrow), 'borrow does not tell the far device to start');
  const release = src.slice(src.indexOf('async release()'), src.indexOf('borrowing()'));
  assert.ok(/ctl: 'stop'/.test(release), 'letting go does not tell the far device to stop — it would send forever');
  // ...and the far end acts on it
  assert.ok(/if \(f\.ctl === 'lend' && f\.to && lender\)/.test(src), 'a request for this camera is ignored');
  assert.ok(/if \(f\.ctl\) return control\(f\);/.test(src), 'control messages are parsed as landmark frames');
});

ok('the room prefers the far camera only while it is actually borrowing', () => {
  const src = readFileSync(new URL('src/remote-eye.js', ROOT), 'utf8');
  // `running()` is true for every signed-in device now that announcing is not
  // a mode. Keying the switch on it would blind every machine in the account.
  const sw = src.slice(src.indexOf('export function createEyeSwitch'));
  assert.ok(/remote\.borrowing\(\)/.test(sw), 'the switch keys on being switched on rather than on borrowing');
  assert.ok(!/remote\.running\(\)/.test(sw), 'the switch would take the local camera away from every device');
});

console.log(`\n${passed} checks passed.`);
