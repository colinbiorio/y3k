// THE VOID (src/game/, GAME.md): the first stage of the open world Colin asked
// for on 13 Nov 2026, "an endless void ... with 1 inch of still water", and the
// body that moves in it. What is pinned here is what he asked for in numbers:
//
//   "in 'survival', there should just be tap to jump or hold to jump higher --
//    allowing the character to defy gravity by 2x, but still be affected."
//   "there should be omnidirectional dash options."
//   "characters should be able to fly, but only in 'creative' mode"
//   "should be options for both controller and keyboard/mouse, with a dedicated
//    'controls' menu option from inside 'world' tab."
//
// The modules that draw (void.js, figure.js, view.js) import three and cannot
// be loaded here: they are read as text, and looked at in a real browser
// (GAME.md, "how it is looked at"). Everything that decides anything is in the
// modules below, which have no page in them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as B from '../src/game/body.js';
import * as I from '../src/game/input.js';
import * as R from '../src/game/rings.js';
import * as Gt from '../src/game/gait.js';
import * as Cr from '../src/game/crawl.js';
import * as S from '../src/game/state.js';
import * as K from '../src/game/kinds.js';
import { LIGHTS, LIGHT_NAMES } from '../src/game/lights.js';
import { createWorldGate } from '../src/game/gate.js';
import { MODE_LINES, cellText } from '../src/game/menu.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const okAsync = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} ± ${eps}`);
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };

const { STEP } = B;
const IDLE = { move: [0, 0], yaw: 0, pitch: 0 };
// run the body step by step until `done`, answering the highest it stood and how many steps it took
function run(s, inp, done, max = 4000) {
  let top = s.p[1], n = 0;
  while (n < max) { B.stepBody(s, typeof inp === 'function' ? inp(n) : inp); n += 1; top = Math.max(top, s.p[1]); if (done(s, n)) break; }
  assert.ok(n < max, 'it ended');
  return { top, n };
}
const pressThen = (first, rest) => (n) => (n === 0 ? { ...IDLE, ...rest, ...first } : { ...IDLE, ...rest });
const landed = (s, n) => n > 1 && s.grounded;

console.log('the void: the body');

ok('one inch of water, and the jump is written from the height asked of it', () => {
  assert.equal(B.WATER, 0.0254);
  near(B.JUMP_V0 ** 2 / (2 * B.G), 1.5, 1e-12);
  assert.equal(B.HOLD_GRAVITY, 0.5, 'held, the pull is halved: twice the height, and still pulled');
});

ok('a tap rises 1.5 m', () => {
  const s = B.createBody();
  const { top } = run(s, pressThen({ jumpPressed: true }, { jump: false }), landed);
  near(top, 1.5, 2e-3);
  assert.deepEqual(s.events.map((e) => e.type), ['jump', 'land']);
});

ok('held, it rises 3.0 m: gravity defied by two, and no more', () => {
  const s = B.createBody();
  const { top } = run(s, pressThen({ jumpPressed: true }, { jump: true }), landed);
  near(top, 3.0, 2e-3);
  assert.ok(top <= 3.0 + 1e-9, 'never over twice the tap');
});

ok('held, it is still pulled: it comes down, and at the full pull', () => {
  const s = B.createBody();
  run(s, pressThen({ jumpPressed: true }, { jump: true }), (b) => !b.grounded && b.v[1] < 0);   // past the top, still held
  const v0 = s.v[1];
  for (let i = 0; i < 12; i++) B.stepBody(s, { ...IDLE, jump: true });
  near(s.v[1] - v0, -B.G * 12 * STEP, 1e-9, 'the fall');
  const land = run(s, { ...IDLE, jump: true }, (b) => b.grounded);
  assert.ok(land.n > 0 && s.p[1] === 0);
});

ok('let go on the way up, it lands between the two, and holding again does not lift it', () => {
  const tops = [0.1, 0.25, 0.4].map((letGo) => {
    const s = B.createBody();
    return run(s, (n) => ({ ...IDLE, jumpPressed: n === 0, jump: n * STEP < letGo || n * STEP > letGo + 0.05 }), landed).top;
  });
  for (const t of tops) assert.ok(t > 1.5 + 0.01 && t < 3.0 - 0.01, 'between: ' + t);
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], 'held longer rises higher');
  const s = B.createBody();
  const once = run(s, (n) => ({ ...IDLE, jumpPressed: n === 0, jump: n * STEP < 0.25 }), landed).top;
  near(tops[1], once, 1e-12, 'a second hold in the same jump adds nothing');
});

ok('in survival a second press in the air does nothing, and the ground takes it back', () => {
  const s = B.createBody();
  run(s, (n) => ({ ...IDLE, jumpPressed: n === 0 || n === 40, jump: false }), landed);
  assert.equal(s.flying, false);
  assert.deepEqual(s.events.map((e) => e.type), ['jump', 'land']);
});

ok('a press just before the ground jumps on landing; a step off the ground is forgiven for a moment', () => {
  const s = B.createBody({ p: [0, 0.02, 0], v: [0, -1, 0], grounded: false, coyote: 0 });
  run(s, pressThen({ jumpPressed: true }, {}), (b) => b.events.some((e) => e.type === 'jump'), 60);
  assert.deepEqual(s.events.map((e) => e.type), ['land', 'jump'], 'the press was kept for the landing');
  const late = B.createBody({ p: [0, 0.4, 0], grounded: false, coyote: 0.05 });
  B.stepBody(late, { ...IDLE, jumpPressed: true });
  assert.equal(late.events[0]?.type, 'jump', 'a moment after leaving the ground still jumps');
  const tooLate = B.createBody({ p: [0, 0.4, 0], grounded: false, coyote: 0 });
  for (let i = 0; i < 30; i++) B.stepBody(tooLate, { ...IDLE, jumpPressed: i === 0 });
  assert.ok(!tooLate.events.some((e) => e.type === 'jump'), 'and later does not');
});

ok('the dash goes 6.24 m, any way the hands point', () => {
  near(B.DASH_SPEED * B.DASH_TIME, 6.24, 1e-12);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, move = [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
    const s = B.createBody();
    B.stepBody(s, { ...IDLE, move, dash: true });
    while (s.dashT > 0) B.stepBody(s, { ...IDLE, move });
    const w = B.wish({ move, yaw: 0 });
    near(Math.hypot(s.p[0], s.p[2]), 6.24, 1e-9, 'how far, ' + move);
    near(s.p[0], w[0] * 6.24, 1e-9); near(s.p[2], w[2] * 6.24, 1e-9);
    assert.equal(s.p[1], 0);
  }
  // and with the eye turned, "forward" is where the eye looks
  const s = B.createBody();
  B.stepBody(s, { ...IDLE, yaw: Math.PI / 2, move: [0, 1], dash: true });
  while (s.dashT > 0) B.stepBody(s, { ...IDLE, yaw: Math.PI / 2, move: [0, 1] });
  near(s.p[0], -6.24, 1e-9); near(s.p[2], 0, 1e-9);
});

ok('with no hand on the keys it dashes the way the body faces', () => {
  const s = B.createBody({ yaw: Math.PI });                      // as it begins: its back to the eye
  B.stepBody(s, { ...IDLE, dash: true });
  while (s.dashT > 0) B.stepBody(s, IDLE);
  near(s.p[2], -6.24, 1e-9, 'away from the eye'); near(s.p[0], 0, 1e-9);
  const t = B.createBody();                                      // told nothing, a body faces +Z, toward the eye
  B.stepBody(t, { ...IDLE, dash: true });
  while (t.dashT > 0) B.stepBody(t, IDLE);
  near(t.p[2], 6.24, 1e-9, 'toward the eye'); assert.equal(t.p[0], 0);
});

ok('a dash is not a second dash until it has rested', () => {
  const s = B.createBody();
  B.stepBody(s, { ...IDLE, move: [0, 1], dash: true });
  let dashes = 1;
  for (let i = 0; i < 200; i++) { const before = s.events.length; B.stepBody(s, { ...IDLE, move: [0, 1], dash: true }); if (s.events.length > before && s.events.at(-1).type === 'dash') { dashes += 1; near(i * STEP, B.DASH_COOLDOWN, 2 * STEP, 'when'); break; } }
  assert.equal(dashes, 2);
});

ok('one dash in the air, given back by the ground', () => {
  const s = B.createBody();
  B.stepBody(s, { ...IDLE, jumpPressed: true, jump: true });
  for (let i = 0; i < 30; i++) B.stepBody(s, { ...IDLE, jump: true });
  const count = () => s.events.filter((e) => e.type === 'dash').length;
  B.stepBody(s, { ...IDLE, move: [1, 0], dash: true, jump: true });
  assert.equal(count(), 1); assert.equal(s.events.at(-1).air, true); assert.equal(s.airDash, 0);
  const y = s.p[1];
  while (s.dashT > 0) B.stepBody(s, { ...IDLE, jump: true });
  near(s.p[1], y, 1e-9, 'a level dash keeps its height');
  for (let i = 0; i < 90 && !s.grounded; i++) B.stepBody(s, { ...IDLE, dash: true });
  assert.equal(count(), 1, 'no second one in the same air');
  run(s, IDLE, (b) => b.grounded);
  assert.equal(s.airDash, B.AIR_DASHES);
  for (let i = 0; i < 80; i++) B.stepBody(s, IDLE);
  B.stepBody(s, { ...IDLE, dash: true });
  assert.equal(count(), 2, 'and on the ground again it dashes');
});

ok('flight is creative\'s alone', () => {
  const s = B.createBody();
  B.stepBody(s, { ...IDLE, flyToggle: true });
  assert.equal(s.flying, false, 'the fly key does nothing in survival');
  assert.equal(B.setMode(s, 'creative'), 'creative');
  B.stepBody(s, { ...IDLE, flyToggle: true });
  assert.equal(s.flying, true);
  for (let i = 0; i < 240; i++) B.stepBody(s, { ...IDLE, up: true });
  assert.ok(s.p[1] > 15, 'it climbs: ' + s.p[1]);
  for (let i = 0; i < 120; i++) B.stepBody(s, IDLE);               // it eases to a stop
  const y = s.p[1];
  for (let i = 0; i < 240; i++) B.stepBody(s, IDLE);
  near(s.p[1], y, 1e-9, 'and hangs there: no pull on a flier');
  assert.equal(B.setMode(s, 'survival'), 'survival');
  assert.equal(s.flying, false, 'survival takes the flight away where the body is');
  run(s, IDLE, (b) => b.grounded);
  assert.equal(s.events.at(-1).type, 'land');
  assert.equal(B.setMode(s, 'nonsense'), 'survival', 'a mode that is not one is survival');
});

ok('a body that says it flies in survival does not: it falls like any other', () => {
  const s = B.createBody({ p: [0, 6, 0], grounded: false, coyote: 0, flying: true });   // as a kept place, or a mistake, might say
  B.stepBody(s, { ...IDLE, up: true });
  assert.equal(s.flying, false, 'whatever it was told');
  run(s, { ...IDLE, up: true }, (b) => b.grounded);
  assert.equal(s.p[1], 0); assert.equal(s.events.at(-1).type, 'land');
  near(s.events.at(-1).speed, Math.sqrt(2 * B.G * 6), 0.05, 'at the speed six metres of the full pull give');
});

ok('in creative a second jump in the air takes off; sink lands on the water', () => {
  const s = B.createBody({ mode: 'creative' });
  run(s, (n) => ({ ...IDLE, jumpPressed: n === 0 || n === 30, jump: n < 30 }), (b) => b.flying, 200);
  assert.ok(s.p[1] > 0.5 && s.v[1] >= 0, 'from where it was, not falling');
  run(s, { ...IDLE, down: true }, (b) => !b.flying, 2000);
  assert.equal(s.grounded, true); assert.equal(s.p[1], 0);
});

ok('flying, forward is where the eye looks, and sprint is fast', () => {
  const up = B.wish({ move: [0, 1], yaw: 0, pitch: Math.PI / 2 }, true);
  near(up[1], 1, 1e-12); near(Math.hypot(up[0], up[2]), 0, 1e-12);
  const flat = B.wish({ move: [0, 1], yaw: 0, pitch: Math.PI / 2 }, false);
  assert.equal(flat[1], 0, 'on foot the eye\'s pitch does not lift anyone');
  const s = B.createBody({ mode: 'creative', flying: true, grounded: false, p: [0, 10, 0] });
  for (let i = 0; i < 360; i++) B.stepBody(s, { ...IDLE, move: [0, 1], sprint: true });
  near(Math.hypot(...s.v), B.FLY_SPRINT, 1e-6);
});

ok('on foot: a walk, a run, a sprint, and a stick pushed past its rim is no faster', () => {
  for (const [inp, top] of [[{ walk: true }, B.WALK], [{}, B.RUN], [{ sprint: true }, B.SPRINT]]) {
    const s = B.createBody();
    for (let i = 0; i < 240; i++) B.stepBody(s, { ...IDLE, move: [0, 1], ...inp });
    near(Math.hypot(s.v[0], s.v[2]), top, 1e-9);
  }
  const s = B.createBody();
  for (let i = 0; i < 240; i++) B.stepBody(s, { ...IDLE, move: [1, 1] });
  near(Math.hypot(s.v[0], s.v[2]), B.RUN, 1e-9, 'a diagonal');
  near(s.yaw, Math.atan2(s.v[0], s.v[2]), 1e-6, 'and the body has come round to face where it goes');
});

ok('the same arc at any frame rate, and a press on a frame too short to hold a step is kept', () => {
  const lands = [1 / 60, 1 / 144, 1 / 30, 1 / 240, 'uneven'].map((dt) => {
    const s = B.createBody();
    let i = 0, seed = 7;
    const next = () => { if (dt !== 'uneven') return dt; seed = (seed * 1103515245 + 12345) % 2147483648; return 0.002 + 0.03 * (seed / 2147483648); };
    while (!s.events.some((e) => e.type === 'land') && i < 5000) { B.advance(s, { move: [0, 1], yaw: 0, pitch: 0, jump: true, jumpPressed: i === 0 }, next()); i += 1; }
    const j = s.events.find((e) => e.type === 'jump'), l = s.events.find((e) => e.type === 'land');
    assert.ok(j && l, 'it jumped and landed at ' + dt);
    return l.at[2];
  });
  for (const z of lands) near(z, lands[0], 1e-9, 'where it came down');
  assert.ok(lands[0] < -5, 'and it went somewhere: ' + lands[0]);
});

ok('a stalled tab does not come back as one long fall', () => {
  const s = B.createBody({ p: [0, 50, 0], grounded: false, coyote: 0 });
  B.advance(s, IDLE, 30);
  assert.ok(s.p[1] > 49, 'thirty seconds away is a quarter of one: ' + s.p[1]);
});

ok('a press is heard by one step: a frame that holds twelve does not jump, dash or take off twelve times', () => {
  const count = (s, type) => s.events.filter((e) => e.type === type).length;
  const j = B.createBody();
  B.advance(j, { ...IDLE, jumpPressed: true }, 0.1);
  for (let i = 0; i < 240; i++) B.advance(j, IDLE, 1 / 60);
  assert.equal(count(j, 'jump'), 1, 'one jump in four seconds, though it came down in one'); assert.equal(j.grounded, true); assert.equal(j.p[1], 0);
  const d = B.createBody();
  B.advance(d, { ...IDLE, dash: true }, 0.1);
  for (let i = 0; i < 240; i++) B.advance(d, IDLE, 1 / 60);
  assert.equal(count(d, 'dash'), 1, 'one dash, though it has rested seven times over');
  const f = B.createBody({ mode: 'creative' });
  B.advance(f, { ...IDLE, flyToggle: true }, 0.1);
  assert.equal(count(f, 'fly'), 1); assert.equal(f.flying, true, 'up, and not up and down again');
});

ok('what is drawn glides: under uneven frames it moves as far as the frame was long', () => {
  const s = B.createBody();
  for (let i = 0; i < 240; i++) B.advance(s, { ...IDLE, move: [0, 1] }, STEP);
  const at = [0, 0, 0]; let was = B.shown(s, at)[2];
  for (const dt of [1 / 144, 1 / 50, 1 / 90, 1 / 61, 0.004, 1 / 30, 1 / 120, 0.011]) {
    B.advance(s, { ...IDLE, move: [0, 1] }, dt);
    const z = B.shown(s, at)[2];
    near(was - z, B.RUN * dt, 1e-9, 'a frame of ' + dt);
    was = z;
  }
});

ok('the origin moved under the body: the same place, in new numbers', () => {
  const s = B.createBody({ p: [3000, 1, -4500] });
  s.was[0] = 2999.9; s.was[2] = -4500.1; s.acc = STEP / 2;
  const before = B.shown(s);
  B.shift(s, 3000, -4499.1);
  const after = B.shown(s);
  near(after[0], before[0] - 3000, 1e-9); near(after[2], before[2] + 4499.1, 1e-9); assert.equal(after[1], before[1]);
});

console.log('the void: the hands');

ok('every action has two keys\' places and a controller\'s, and no key or button is given twice', () => {
  const d = I.defaults(), ids = I.ACTIONS.map((a) => a.id);
  assert.deepEqual(Object.keys(d.keys), ids); assert.deepEqual(Object.keys(d.pad), ids);
  const keys = ids.flatMap((id) => { assert.equal(d.keys[id].length, 2); return d.keys[id].filter(Boolean); });
  assert.equal(new Set(keys).size, keys.length, 'keys');
  const pads = ids.map((id) => d.pad[id]).filter((n) => n >= 0);
  assert.equal(new Set(pads).size, pads.length, 'buttons');
  for (const id of ['jump', 'dash', 'sprint', 'fly', 'down', 'mode', 'menu']) assert.ok(d.pad[id] >= 0 && d.keys[id][0], id + ' is on both');
  for (const a of I.ACTIONS.filter((x) => x.stick)) assert.equal(d.pad[a.id], -1, 'moving is the stick\'s');
  assert.deepEqual([d.keys.forward[0], d.keys.left[0], d.keys.back[0], d.keys.right[0], d.keys.jump[0]], ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
});

ok('one key does one thing: giving it to an action takes it from the one that had it', () => {
  const b = I.defaults();
  I.bindKey(b, 'jump', 1, 'KeyQ');
  assert.deepEqual(b.keys.jump, ['Space', 'KeyQ']); assert.deepEqual(b.keys.dash, ['', 'Mouse2']);
  I.bindKey(b, 'jump', 1, '');
  assert.deepEqual(b.keys.jump, ['Space', '']);
  I.bindPad(b, 'dash', 0);
  assert.equal(b.pad.dash, 0); assert.equal(b.pad.jump, -1, 'A was jump\'s');
  I.bindPad(b, 'forward', 5);
  assert.equal(b.pad.forward, -1, 'the stick\'s actions take no button');
  I.bindKey(b, 'nonsense', 0, 'KeyZ'); I.bindKey(b, 'jump', 2, 'KeyZ');
  assert.ok(!Object.values(b.keys).flat().includes('KeyZ'));
});

ok('what was chosen is kept, and what is not what it should be is not believed', () => {
  const st = store(), b = I.defaults();
  I.bindKey(b, 'jump', 0, 'KeyJ'); I.bindPad(b, 'dash', 5); b.look = { mouse: 2.5, stick: 0.5, invertY: true };
  assert.equal(I.saveBindings(st, b), true);
  assert.deepEqual(I.loadBindings(st), b);
  assert.deepEqual(I.loadBindings(store()), I.defaults(), 'nothing kept');
  assert.deepEqual(I.loadBindings(null), I.defaults(), 'nowhere to keep it');
  for (const junk of ['{not json', '[]', '"words"', '7', 'null', '{"keys":7,"pad":"x","look":[]}'])
    assert.deepEqual(I.loadBindings(store({ [I.STORE_KEY]: junk })), I.defaults(), junk);
  const odd = I.loadBindings(store({ [I.STORE_KEY]: JSON.stringify({ keys: { jump: [7, 'KeyJ', 'KeyX'], dash: 'KeyQ', gone: ['KeyP', ''] }, pad: { jump: 99, dash: 1.5, forward: 3, fly: 7 }, look: { mouse: -1, stick: 400, invertY: 'yes' } }) }));
  assert.deepEqual(odd.keys.jump, ['', 'KeyJ']); assert.deepEqual(odd.keys.dash, I.defaults().keys.dash); assert.equal(odd.keys.gone, undefined);
  assert.equal(odd.pad.jump, 0); assert.equal(odd.pad.dash, 1); assert.equal(odd.pad.forward, -1); assert.equal(odd.pad.fly, 7);
  assert.deepEqual(odd.look, { mouse: 1, stick: 1, invertY: false });
  assert.equal(I.saveBindings({ setItem() { throw new Error('full'); } }, b), false, 'a full store is not a crash');
});

ok('a stick at rest says nothing, and starts from nothing at the dead circle\'s edge', () => {
  assert.deepEqual(I.stick(0.1, 0.1), [0, 0]);
  assert.deepEqual(I.stick(0, 0), [0, 0]);
  near(I.stick(1, 0)[0], 1, 1e-12);
  near(I.stick(I.DEADZONE + 0.5 * (1 - I.DEADZONE), 0)[0], 0.5, 1e-12);
  const [x, y] = I.stick(0.6, -0.8);
  near(Math.hypot(x, y), 1, 1e-12); near(x / y, 0.6 / -0.8, 1e-12, 'the way it points is kept');
  near(Math.hypot(...I.stick(1, 1)), 1, 1e-12, 'a corner is no more than the rim');
});

ok('a press is one press: handed over once, however long the key is held', () => {
  const inp = I.createInput();
  assert.equal(inp.down('Space'), 'jump');
  assert.equal(inp.down('Space', true), 'jump', 'the keyboard repeating');
  let f = inp.frame();
  assert.equal(f.jumpPressed, true); assert.equal(f.jump, true);
  f = inp.frame();
  assert.equal(f.jumpPressed, false, 'not again'); assert.equal(f.jump, true, 'still held');
  inp.down('Space', true);
  assert.equal(inp.frame().jumpPressed, false, 'a repeat is not a press');
  inp.up('Space');
  assert.equal(inp.frame().jump, false);
  assert.equal(inp.down('KeyP'), null, 'a key that is nobody\'s');
});

ok('the keys: W A S D and the arrows move, the mouse turns the eye right when it goes right', () => {
  const inp = I.createInput();
  inp.down('KeyW'); inp.down('KeyD');
  assert.deepEqual(inp.frame().move, [1, 1]);
  inp.down('KeyS'); inp.down('KeyA');
  assert.deepEqual(inp.frame().move, [0, 0], 'opposites cancel');
  inp.clear();
  inp.down('ArrowUp');
  assert.deepEqual(inp.frame().move, [0, 1]);
  inp.mouse(120, -50);
  const f = inp.frame();
  near(f.look[0], -120 * I.MOUSE_RAD, 1e-12, 'yaw turns left when positive, so right is negative');
  near(f.look[1], 50 * I.MOUSE_RAD, 1e-12, 'the mouse pushed away looks up');
  assert.deepEqual(inp.frame().look.map(Math.abs), [0, 0], 'and a look is handed over once');
  const b = I.defaults(); b.look.invertY = true; b.look.mouse = 2;
  const inv = I.createInput(b); inv.mouse(10, 10);
  const g = inv.frame();
  near(g.look[0], -10 * I.MOUSE_RAD * 2, 1e-12); near(g.look[1], 10 * I.MOUSE_RAD * 2, 1e-12, 'turned over');
});

ok('a controller: the left stick moves, the right turns the eye, a button is one press', () => {
  const inp = I.createInput(), none = Array(17).fill(false);
  const pad = (axes, down = []) => ({ axes, buttons: none.map((_, i) => down.includes(i)) });
  inp.pad(pad([0, -1, 0, 0]));
  let f = inp.frame(1 / 60);
  near(f.move[0], 0, 1e-12); near(f.move[1], 1, 1e-12, 'the stick pushed away is forward'); assert.equal(f.device, 'pad');
  inp.pad(pad([0.5, 0, 0, 0]));
  f = inp.frame(1 / 60);
  assert.ok(f.move[0] > 0.3 && f.move[0] < 0.5, 'part way is part way: ' + f.move[0]);
  inp.pad(pad([0, 0, 1, 0]));
  f = inp.frame(0.5);
  near(f.look[0], -I.STICK_YAW * 0.5, 1e-9, 'right is right'); near(f.look[1], 0, 1e-12);
  inp.pad(pad([0, 0, 0, 0], [0]));
  f = inp.frame();
  assert.equal(f.jumpPressed, true); assert.equal(f.jump, true); assert.equal(f.up, true);
  inp.pad(pad([0, 0, 0, 0], [0]));
  f = inp.frame();
  assert.equal(f.jumpPressed, false, 'held is not pressed again'); assert.equal(f.jump, true);
  inp.pad(pad([0, 0, 0, 0], [1, 3, 8, 9]));
  f = inp.frame();
  assert.deepEqual([f.dash, f.flyToggle, f.modeToggle, f.menu, f.jump], [true, true, true, true, false]);
  inp.pad(null);
  assert.deepEqual(inp.frame().move, [0, 0], 'a controller unplugged holds nothing');
});

ok('L3 sprints until you stop', () => {
  const inp = I.createInput(), none = Array(17).fill(false);
  const pad = (axes, down = []) => ({ axes, buttons: none.map((_, i) => down.includes(i)) });
  inp.pad(pad([0, -1, 0, 0], [10])); assert.equal(inp.frame().sprint, true);
  inp.pad(pad([0, -1, 0, 0])); assert.equal(inp.frame().sprint, true, 'the button let go, still moving');
  inp.pad(pad([0, 0, 0, 0])); assert.equal(inp.frame().sprint, false, 'stopped');
  inp.pad(pad([0, -1, 0, 0])); assert.equal(inp.frame().sprint, false, 'and it does not come back by itself');
});

ok('a thumb on glass: the stick it draws moves, a button held is held, and all of it can be let go at once', () => {
  const inp = I.createInput();
  inp.thumb([0.2, 1]); inp.hold('jump', true); inp.hold('jump', true);
  let f = inp.frame();
  assert.deepEqual(f.move, [0.2, 1]); assert.equal(f.device, 'touch');
  assert.equal(f.jumpPressed, true); assert.equal(f.jump, true);
  f = inp.frame();
  assert.equal(f.jumpPressed, false); assert.equal(f.jump, true);
  inp.drag(-100, 0);
  near(inp.frame().look[0], 100 * I.TOUCH_RAD, 1e-12, 'a finger drawn left turns the eye left');
  inp.down('KeyW'); inp.clear();
  f = inp.frame();
  assert.deepEqual([f.move, f.jump, f.jumpPressed], [[0, 0], false, false]); assert.deepEqual(inp.heldCodes(), []);
});

ok('what a key and a button are called', () => {
  assert.deepEqual(['KeyW', 'Space', 'ShiftLeft', 'Mouse2', 'Digit4', 'Numpad7', 'ArrowUp', 'Escape', 'F5', ''].map(I.keyLabel), ['W', 'space', 'left shift', 'right mouse', '4', 'numpad 7', '↑', 'esc', 'f5', '']);
  assert.deepEqual([0, 1, 9, 10, 40, -1].map(I.padLabel), ['A', 'B', 'menu', 'L3', 'button 40', '']);
  const b = I.defaults();
  assert.equal(cellText(b, 'jump', 0), 'space'); assert.equal(cellText(b, 'jump', 1), '—'); assert.equal(cellText(b, 'jump', 'pad'), 'A'); assert.equal(cellText(b, 'walk', 'pad'), '—');
});

ok('the first controller that is there is the one heard, a standard one before another', () => {
  const g = (id, mapping, pressed = false) => ({ id, mapping, connected: true, axes: [0.5, -0.25], buttons: [{ pressed, value: pressed ? 1 : 0 }, { pressed: false, value: 0.7 }] });
  assert.equal(I.readPad({ getGamepads: () => [null, null] }), null);
  assert.equal(I.readPad({}), null); assert.equal(I.readPad({ getGamepads() { throw new Error('no'); } }), null);
  const p = I.readPad({ getGamepads: () => [null, g('odd', ''), g('std', 'standard', true)] });
  assert.equal(p.id, 'std'); assert.deepEqual(p.axes, [0.5, -0.25, 0, 0]); assert.deepEqual(p.buttons, [true, true], 'a trigger past half way is down');
});

// the page's events, with a page made of nothing
function fakePage() {
  const target = () => { const h = new Map(); return { h, addEventListener: (ev, fn) => { if (!h.has(ev)) h.set(ev, new Set()); h.get(ev).add(fn); }, removeEventListener: (ev, fn) => h.get(ev)?.delete(fn),
    fire(ev, e = {}) { const evt = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e }; for (const fn of [...(h.get(ev) || [])]) fn(evt); return evt; } }; };
  const win = target(), doc = target(), el = target(), canvas = { tagName: 'CANVAS', focused: 0, focus() { this.focused += 1; doc.activeElement = canvas; } };
  win.navigator = { getGamepads: () => [] };
  doc.activeElement = { tagName: 'BODY' }; doc.pointerLockElement = null; doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.fire('pointerlockchange'); };
  el.querySelector = (sel) => (sel === 'canvas' ? canvas : null);
  el.requestPointerLock = () => { doc.pointerLockElement = el; doc.fire('pointerlockchange'); return Promise.resolve(); };
  el.getBoundingClientRect = () => ({ left: 100, top: 0, width: 400, height: 600 });
  return { win, doc, el, canvas };
}

ok('the page\'s keys: the game hears them, except while typing, on a focused button, behind a sheet, or under ⌘', () => {
  const { win, doc, el } = fakePage(), inp = I.createInput();
  let paused = false;
  const wire = I.wireInput(inp, { el, win, doc, paused: () => paused });
  let e = win.fire('keydown', { code: 'Space' });
  assert.equal(e.defaultPrevented, true, 'space does not scroll the page'); assert.equal(inp.frame().jumpPressed, true);
  win.fire('keyup', { code: 'Space' });
  doc.activeElement = { tagName: 'TEXTAREA' };
  e = win.fire('keydown', { code: 'Space' });
  assert.equal(e.defaultPrevented, false); assert.equal(inp.frame().jumpPressed, false, 'typing in the chat is not jumping');
  doc.activeElement = { tagName: 'DIV', isContentEditable: true };
  win.fire('keydown', { code: 'KeyW' }); assert.deepEqual(inp.frame().move, [0, 0]);
  doc.activeElement = { tagName: 'BUTTON' };
  e = win.fire('keydown', { code: 'Space' });
  assert.equal(e.defaultPrevented, false, 'a button walked to with Tab keeps its Space'); assert.equal(inp.frame().jumpPressed, false);
  win.fire('keydown', { code: 'KeyW' }); assert.deepEqual(inp.frame().move, [0, 1], 'and the other keys are still the game\'s');
  win.fire('keyup', { code: 'KeyW' });
  doc.activeElement = { tagName: 'CANVAS' };
  paused = true; win.fire('keydown', { code: 'Space' }); assert.equal(inp.frame().jumpPressed, false, 'a sheet is open');
  paused = false;
  win.fire('keydown', { code: 'KeyD', metaKey: true }); assert.deepEqual(inp.frame().move, [0, 0], '⌘D is the browser\'s');
  win.fire('keydown', { code: 'Escape', defaultPrevented: true }); assert.equal(inp.frame().menu, false, 'the Escape that closed a sheet does not open one');
  win.fire('keydown', { code: 'Escape' }); assert.equal(inp.frame().menu, true);
  win.fire('keydown', { code: 'KeyW' }); win.fire('keydown', { code: 'MetaLeft' });
  assert.deepEqual(inp.frame().move, [0, 0], 'under ⌘ the keyups never come: everything is let go');
  win.fire('keydown', { code: 'KeyW' }); win.fire('blur');
  assert.deepEqual(inp.frame().move, [0, 0], 'and when the window loses the keys');
  win.fire('keydown', { code: 'KeyW' }); doc.hidden = false; doc.fire('visibilitychange');
  assert.deepEqual(inp.frame().move, [0, 1], 'a tab come back to has taken nothing');
  doc.hidden = true; doc.fire('visibilitychange');
  assert.deepEqual(inp.frame().move, [0, 0], 'a tab put away lets go: its keyups may never come');
  doc.hidden = false;
  assert.equal(win.fire('keydown', { code: 'KeyP' }).defaultPrevented, false, 'a key the game has no use for is the page\'s');
  const b = inp.bindings; I.bindKey(b, 'jump', 0, 'KeyJ'); inp.setBindings(b);
  e = win.fire('keydown', { code: 'Space' });
  assert.equal(e.defaultPrevented, true, 'Space given no work still does not scroll the page under the game'); assert.equal(inp.frame().jumpPressed, false);
  assert.equal(win.fire('keydown', { code: 'ArrowDown' }).defaultPrevented, true); win.fire('keyup', { code: 'ArrowDown' });
  win.fire('keydown', { code: 'KeyJ' }); assert.equal(inp.frame().jumpPressed, true, 'and the key it was given to jumps');
  win.fire('keyup', { code: 'KeyJ' }); win.fire('keyup', { code: 'Space' });
  wire.off();
  win.fire('keydown', { code: 'Space' }); assert.equal(inp.frame().jumpPressed, false, 'put down, it hears nothing');
  assert.ok([...win.h.values(), ...doc.h.values(), ...el.h.values()].every((s) => s.size === 0), 'and leaves no listener behind');
});

ok('a press on the canvas gives it the keys and holds the pointer; the right button dashes; a held pointer looks', () => {
  const { win, doc, el, canvas } = fakePage(), inp = I.createInput();
  const locks = [];
  let paused = false;
  const wire = I.wireInput(inp, { el, win, doc, paused: () => paused, onLock: (on) => locks.push(on) });
  doc.activeElement = { tagName: 'TEXTAREA', blur() {} };
  el.fire('mousedown', { button: 0 });
  assert.equal(canvas.focused, 1, 'the chat\'s field lets go'); assert.equal(wire.locked(), true); assert.deepEqual(locks, [true]);
  doc.fire('mousemove', { movementX: 120, movementY: 0, clientX: 640, clientY: 400 });
  near(inp.frame().look[0], -0.288, 1e-9, '120 px to the right');
  doc.fire('mousemove', { movementX: 120, movementY: 0, clientX: 640, clientY: 400 });
  near(inp.frame().look[0], -0.288, 1e-9, 'a held pointer stays where it is and says how far it moved');
  paused = true; doc.fire('mousemove', { movementX: 120, movementY: 40 });
  let still = inp.frame(); assert.equal(Math.abs(still.look[0]), 0, 'a sheet opened over a held pointer: the eye is still'); assert.equal(Math.abs(still.look[1]), 0);
  el.fire('wheel', { deltaY: 100 }); assert.equal(Math.abs(inp.frame().zoom), 0, 'and the wheel is the sheet\'s');
  paused = false;
  const e = el.fire('mousedown', { button: 2 });
  assert.equal(e.defaultPrevented, true); assert.equal(inp.frame().dash, true);
  win.fire('mouseup', { button: 2 });
  assert.equal(el.fire('contextmenu').defaultPrevented, true, 'no menu over the game');
  el.fire('wheel', { deltaY: 100 }); assert.ok(inp.frame().zoom > 0, 'the wheel pulled back draws the eye back');
  el.fire('wheel', { deltaY: 48 }); const px = inp.frame().zoom;
  el.fire('wheel', { deltaY: 3, deltaMode: 1 }); near(inp.frame().zoom, px, 1e-12, 'a wheel that counts in lines: three lines are 48 px');
  assert.equal(el.fire('wheel', { deltaY: 10 }).defaultPrevented, true, 'the page does not scroll under it'); inp.frame();
  wire.release();
  assert.equal(wire.locked(), false); assert.deepEqual(locks, [true, false]);
  doc.fire('mousemove', { movementX: 50 }); assert.equal(Math.abs(inp.frame().look[0]), 0, 'a pointer not held and not dragging turns nothing');
  wire.off();
});

ok('where no lock is to be had a drag looks, measured by where the pointer went', () => {
  const { win, doc, el } = fakePage(), inp = I.createInput();
  el.requestPointerLock = () => Promise.reject(new Error('refused'));
  let paused = false;
  const wire = I.wireInput(inp, { el, win, doc, paused: () => paused });
  el.fire('mousedown', { button: 0, clientX: 300, clientY: 200 });
  assert.equal(wire.locked(), false);
  // WebKit's way with a script's mouse: the pointer goes somewhere and movementX stays 0
  doc.fire('mousemove', { clientX: 360, clientY: 200, movementX: 0, movementY: 0 });
  doc.fire('mousemove', { clientX: 420, clientY: 190, movementX: 0, movementY: 0 });
  let f = inp.frame();
  near(f.look[0], -0.288, 1e-9, '120 px to the right, in two moves'); near(f.look[1], 0.024, 1e-9, '10 px up looks up');
  doc.fire('mousemove', { clientX: 430, clientY: 190, movementX: 999, movementY: 999 });
  f = inp.frame();
  near(f.look[0], -0.024, 1e-9, 'the pointer went 10 px, whatever was said of it'); near(f.look[1], 0, 1e-9);
  // a sheet opened in the middle of a drag: nothing turns behind it, and nothing is owed when it closes
  paused = true; doc.fire('mousemove', { clientX: 530, clientY: 190 }); assert.equal(Math.abs(inp.frame().look[0]), 0);
  paused = false; doc.fire('mousemove', { clientX: 540, clientY: 190 }); near(inp.frame().look[0], -0.024, 1e-9, 'only what moved since');
  win.fire('mouseup', { button: 0 });
  doc.fire('mousemove', { clientX: 700, clientY: 190, movementX: 160 }); assert.equal(Math.abs(inp.frame().look[0]), 0, 'let go, it turns nothing');
  // a press and a move that say no place at all turn nothing, and leave numbers behind
  el.fire('mousedown', { button: 0 }); doc.fire('mousemove', { movementX: 5 });
  f = inp.frame(); assert.equal(Math.abs(f.look[0]), 0); assert.equal(Math.abs(f.look[1]), 0);
  wire.off();
});

ok('a thumb on the left of the glass is the stick, a finger on the right looks', () => {
  const { win, doc, el } = fakePage(), inp = I.createInput();
  const wire = I.wireInput(inp, { el, win, doc });
  el.fire('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 180, clientY: 400 });      // 80 of 400 across: the left
  el.fire('pointermove', { pointerId: 1, clientX: 180, clientY: 400 - 28 });
  near(inp.frame().move[1], 0.5, 1e-9, 'half the stick\'s reach up is half way forward');
  el.fire('pointermove', { pointerId: 1, clientX: 180, clientY: 400 - 300 });
  assert.deepEqual(inp.frame().move, [0, 1], 'past the rim is the rim');
  el.fire('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 420, clientY: 300 });      // the right
  el.fire('pointermove', { pointerId: 2, clientX: 320, clientY: 300 });
  const f = inp.frame();
  near(f.look[0], 100 * I.TOUCH_RAD, 1e-9); assert.deepEqual(f.move, [0, 1], 'while the thumb still holds');
  el.fire('pointerup', { pointerId: 1 });
  assert.deepEqual(inp.frame().move, [0, 0], 'the thumb lifted');
  el.fire('pointerup', { pointerId: 2 });
  // the stick's side is the left 45% of the glass: a finger alone past it looks, and does not push the stick
  el.fire('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 100 + 200, clientY: 300 });     // half way across
  el.fire('pointermove', { pointerId: 3, clientX: 100 + 150, clientY: 300 });
  let g = inp.frame();
  near(g.look[0], 50 * I.TOUCH_RAD, 1e-9, 'a look'); assert.deepEqual(g.move, [0, 0], 'no stick');
  el.fire('pointerup', { pointerId: 3 });
  el.fire('pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 100 + 160, clientY: 300 });     // 40% across
  el.fire('pointermove', { pointerId: 4, clientX: 100 + 160 + 56, clientY: 300 });
  const flat = (m) => m.map((x) => x + 0);                       // a stick pushed level says -0 for its height
  assert.deepEqual(flat(inp.frame().move), [1, 0], 'inside it, the stick');
  // one stick: a second thumb on the same side looks, and leaves the first where it is
  el.fire('pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 150, clientY: 500 });
  el.fire('pointermove', { pointerId: 5, clientX: 150 - 20, clientY: 500 });
  g = inp.frame();
  assert.deepEqual(flat(g.move), [1, 0], 'the first thumb\'s push'); near(g.look[0], 20 * I.TOUCH_RAD, 1e-9, 'the second looks');
  el.fire('pointerup', { pointerId: 5 });
  assert.deepEqual(flat(inp.frame().move), [1, 0], 'and lifting it does not let the stick go');
  el.fire('pointercancel', { pointerId: 4 });
  assert.deepEqual(inp.frame().move, [0, 0], 'a touch the page took away is a thumb lifted');
  el.fire('pointerdown', { pointerType: 'mouse', pointerId: 9, clientX: 150, clientY: 300 });
  el.fire('pointermove', { pointerId: 9, clientX: 150, clientY: 200 });
  assert.deepEqual(inp.frame().move, [0, 0], 'a mouse is not a thumb');
  wire.off();
});

console.log('the void: the water');

ok('a ring rides at the speed one inch of water gives it', () => {
  near(R.RIPPLE_SPEED, Math.sqrt(9.81 * 0.0254), 1e-12); near(R.RIPPLE_SPEED, 0.499, 5e-4);
  for (const age of [0.5, 1, 2, 4]) {
    let best = 0, at = 0;
    for (let r = 0; r < 6; r += 0.001) { const h = Math.abs(R.ring(r, age).h); if (h > best) { best = h; at = r; } }
    near(at, R.RIPPLE_SPEED * age, 0.02, 'the crest at ' + age + ' s');
  }
});

ok('it thins as it widens, dies away, and is nothing before it falls or far from its crest', () => {
  const peak = (age) => { let best = 0; for (let r = 0; r < 8; r += 0.002) best = Math.max(best, Math.abs(R.ring(r, age).h)); return best; };
  assert.ok(peak(0.5) > peak(1.5) && peak(1.5) > peak(3) && peak(3) > peak(6) && peak(6) > 0);
  assert.deepEqual(R.ring(1, -0.1), { h: 0, slope: 0 });
  // at its crest a ring stands amp/k high, less what it has thinned, what it has died (1/e a life) and, in its first moments, what it has not yet risen
  const k = (2 * Math.PI) / R.RING.wavelength, crest = (age) => { const r = R.RIPPLE_SPEED * age; return R.ring(r, age).h * k * Math.sqrt(1 + r / R.RING.thin); };
  near(crest(R.RING.life), Math.exp(-1), 1e-12, 'one life on');
  near(crest(R.RING.born / 2), 0.5 * Math.exp(-R.RING.born / 2 / R.RING.life), 1e-12, 'half way through its birth');
  assert.equal(crest(0), 0, 'it begins from nothing: no step in the water where a foot comes down');
  assert.ok(crest(R.RING.oldest - 0.1) > 0, 'old, it is still there');
  assert.deepEqual(R.ring(R.RIPPLE_SPEED * (R.RING.oldest + 0.1), R.RING.oldest + 0.1), { h: 0, slope: 0 }, 'and too old, it is gone, even at its crest');
  assert.deepEqual(R.ring(5, 1), { h: 0, slope: 0 }, 'still water ahead of it');
  assert.deepEqual(R.ring(1, NaN), { h: 0, slope: 0 });
  near(R.ring(0.3, 1, 2).h, 2 * R.ring(0.3, 1, 1).h, 1e-15, 'twice as hard is twice as high');
  // the slope is the wave's own slope (the slow thinning with distance held still, as the shader holds it)
  for (const [r, age] of [[0.45, 1], [0.9, 2], [0.2, 0.4]]) {
    const thin = (x) => Math.sqrt(1 + x / R.RING.thin), u = (x) => R.ring(x, age).h * thin(x);
    near(R.ring(r, age).slope, (u(r + 1e-6) - u(r - 1e-6)) / 2e-6 / thin(r), 1e-6, 'at ' + r);
  }
});

ok('the newest ring takes the oldest\'s place, and the rings move with the origin', () => {
  const d = R.createDrops(3);
  assert.ok([0, 1, 2].every((i) => d.data[i * 4 + 2] < -1000), 'none has fallen yet');
  d.add(1, 2, 10, 0.1); d.add(3, 4, 11, 0.2); d.add(5, 6, 12, 0.3); d.add(7, 8, 13, 0.4);
  assert.deepEqual([...d.data].map((x) => Math.round(x * 10) / 10), [7, 8, 13, 0.4, 3, 4, 11, 0.2, 5, 6, 12, 0.3]);
  d.shift(1, -1);
  assert.deepEqual([d.data[0], d.data[1], d.data[4], d.data[5]], [6, 9, 2, 5]);
  assert.equal(R.createDrops().n, R.DROPS);
});

ok('the void has no edge: far out, the numbers begin again by whole periods of the floor\'s lattice', () => {
  assert.equal(R.rebase(100, -2000), null); assert.equal(R.rebase(-2047, 2047), null);
  const far = R.rebase(2100, -5000);
  assert.deepEqual(far, [R.PERIOD[0], Math.round(-5000 / R.PERIOD[1]) * R.PERIOD[1]]);
  assert.ok(Math.abs(2100 - far[0]) < R.FAR && Math.abs(-5000 - far[1]) < R.FAR, 'and the body is near the origin again');
  // the honeycomb repeats over a cell flat to flat one way and √3 cells the other: PERIOD is whole numbers of both
  near(R.PERIOD[0] / R.CELL, Math.round(R.PERIOD[0] / R.CELL), 1e-9);
  near(R.PERIOD[1] / (R.CELL * Math.sqrt(3)), Math.round(R.PERIOD[1] / (R.CELL * Math.sqrt(3))), 1e-9);
  assert.ok(R.PERIOD[0] < R.FAR && R.PERIOD[1] < R.FAR, 'a period is less than far, so a rebase always brings the body back inside');
});

ok('the water\'s shader is written from the same numbers', () => {
  const v = read('src/game/void.js');
  for (const piece of ['${RIPPLE_SPEED.toFixed(6)}', '${RING.width.toFixed(4)}', '((2 * Math.PI) / RING.wavelength)', '${RING.oldest.toFixed(1)}', '${RING.reach.toFixed(2)}',
    '${RING.life.toFixed(3)}', '${RING.born.toFixed(3)}', '${RING.thin.toFixed(3)}', 'uniform vec4 uDrops[${DROPS}]', 'hexEdge(fp / ${CELL.toFixed(3)})'])
    assert.ok(v.includes(piece), 'void.js writes ' + piece);
  assert.ok(/water\.position\.y = WATER\b/.test(v) && v.includes("import { WATER } from './body.js'"), 'and the water lies one inch over the floor');
  assert.ok(!/RIPPLE_SPEED\s*=|const\s+C\s*=\s*0\.\d/.test(v.replace('const float C = ${RIPPLE_SPEED.toFixed(6)};', '')), 'no second copy of the speed');
});

console.log('the void: the body\'s carriage');

const MANTIS_LEGS = { thigh: 0.5, shin: 0.62, ankle: 0.06, ball: 0.08, hip: 0.07, stand: 1.0, pivot: 1.0, knee: -1 };

ok('the leg\'s two bones put the ankle where the stride says, with a knee that bends forward or back', () => {
  for (const bend of [1, -1]) for (const [z, y] of [[0, -0.86], [0.3, -0.7], [-0.25, -0.75], [0.1, -0.5], [0.4, -0.4]]) {
    const { thigh, knee } = Gt.legIK(z, y, Gt.BUILD.thigh, Gt.BUILD.shin, bend), a = Gt.ankleOf(thigh, knee);
    near(a.z, z, 1e-9, 'ahead'); near(a.y, y, 1e-9, 'below');
    assert.ok(bend * knee >= 0 && bend * knee < Math.PI, 'a knee bends one way: ' + knee);
  }
  const far = Gt.legIK(2, -2), a = Gt.ankleOf(far.thigh, far.knee);
  near(Math.atan2(a.z, -a.y), Math.PI / 4, 1e-6, 'out of reach, it reaches toward');
  near(Math.hypot(a.z, a.y), Gt.BUILD.thigh + Gt.BUILD.shin - 0.004, 1e-9, 'with a straight leg');
});

ok('a foot on the floor stays where it was put, whoever\'s legs they are', () => {
  for (const build of [undefined, MANTIS_LEGS]) {
    const g = Gt.createGait(build), Bd = g.build;
    for (const v of [0.3, 1, B.WALK, 2.6, B.RUN, B.SPRINT]) {
      const st = Gt.stride(v, Bd);
      near((st.cadence * st.travel) / st.duty, v, 1e-12, 'the body goes over a planted foot as far as it travels');
      for (let i = 0; i < 300; i++) {
        const ph = (i / 300) * st.duty, p = Gt.poseAt(g, ph, v), phi = Math.max(0, p.legL.foot);
        // the ball of the left foot on the floor: how far the body has come, and where the foot is from it
        near(v * (ph / st.cadence) + p.legL.z + Bd.ball * Math.cos(phi) - Bd.ankle * Math.sin(phi), st.ahead + Bd.ball, 1e-9, `it does not slide at ${v} m/s`);
        const sole = p.pelvis + p.legL.y - Bd.ball * Math.sin(phi) - Bd.ankle * Math.cos(phi);
        assert.ok(sole > -1e-9 && sole < 0.0201, 'and its ball is on the floor: ' + sole);
      }
      // the other foot, half a stride on, is the same foot
      const a = Gt.poseAt(g, 0.1, v), b = Gt.poseAt(g, 0.6, v);
      near(a.legL.z, b.legR.z, 1e-12); near(a.legL.x, -b.legR.x, 1e-12); near(a.pelvis, b.pelvis, 1e-12);
    }
  }
});

ok('the feet come down as often as the speed asks, left and right in turn', () => {
  near(Gt.cadence(B.WALK), 1.1069, 1e-3); near(Gt.cadence(B.RUN), 1.6986, 1e-3); near(Gt.cadence(B.SPRINT), 1.892, 1e-3);
  assert.ok(Gt.cadence(B.RUN, { ...Gt.BUILD, ...MANTIS_LEGS }) < Gt.cadence(B.RUN), 'longer legs take fewer steps');
  const g = Gt.createGait(), body = B.createBody({ v: [0, 0, B.RUN] });
  const falls = [];
  for (let i = 0; i < 600; i++) { const pose = Gt.stepGait(g, body, 1 / 60); for (const f of pose.footfalls) falls.push(f); }
  near(falls.length / 10, 2 * Gt.cadence(B.RUN), 0.25, 'steps a second');
  for (let i = 1; i < falls.length; i++) assert.ok(Math.sign(falls[i][0]) === -Math.sign(falls[i - 1][0]), 'in turn');
  assert.ok(falls.every((f) => Math.abs(f[0]) > 0.7 * Gt.BUILD.hip && Math.abs(f[0]) <= Gt.BUILD.hip + 1e-9 && f[1] > 0.2 && f[1] < 0.9), 'each to its own side and ahead of the body');
  const still = Gt.createGait(), stood = B.createBody();
  let n = 0; for (let i = 0; i < 300; i++) n += Gt.stepGait(still, stood, 1 / 60).footfalls.length;
  assert.equal(n, 0, 'standing, no foot falls');
  const air = Gt.createGait(), leapt = B.createBody({ v: [0, 0, B.RUN], grounded: false });
  for (let i = 0; i < 300; i++) n += Gt.stepGait(air, leapt, 1 / 60).footfalls.length;
  assert.equal(n, 0, 'nor in the air, however fast it goes: no ring where no foot came down');
});

ok('no pose puts a foot through the floor or a leg past its reach, the hips\' sway, tip and turn counted', () => {
  for (const build of [undefined, MANTIS_LEGS]) {
    for (const [v, flags] of [[[0, 0, 0], {}], [[0, 0, 0.4], {}], [[0, 0, B.WALK], {}], [[0, 0, 2.5], {}], [[0, 0, B.RUN], {}], [[B.SPRINT, 0, 0], {}], [[0, 4, 3], { grounded: false }], [[0, -9, 3], { grounded: false }],
      [[0, 0, 26], { dashT: 0.2 }], [[0, 0, 0], { flying: true, grounded: false }], [[0, 3, 40], { flying: true, grounded: false }]]) {
      const g = Gt.createGait(build), body = B.createBody({ v, ...flags }), reach = g.build.thigh + g.build.shin - 0.004;
      for (let i = 0; i < 240; i++) {
        const pose = Gt.stepGait(g, body, 1 / 60);
        for (const side of [1, -1]) {
          const leg = side > 0 ? pose.legL : pose.legR, t = Gt.fromHip(pose, side, g.build);
          assert.ok([leg.x, leg.y, leg.z, leg.foot].every(Number.isFinite));
          assert.ok(Math.hypot(t.x, t.y, t.z) <= reach + 1e-9, `within reach of its own hip: ${Math.hypot(t.x, t.y, t.z) - reach} over at ${v}`);
          if (pose.state === 'ground') assert.ok(pose.pelvis + leg.y >= g.build.ankle - 1e-9, `the ankle stays over the floor: ${pose.pelvis + leg.y} at ${v}`);
        }
        assert.ok(pose.pelvis > 0.5 && pose.pelvis < 1.15 && [pose.sway, pose.roll, pose.hipYaw, pose.bank, pose.twist].every(Number.isFinite));
      }
    }
  }
  // standing, the hips are over the feet and nothing swings
  const g = Gt.createGait(), stood = Gt.stepGait(g, B.createBody(), 1 / 60);
  near(stood.legL.z, 0, 1e-12); near(stood.legR.z, 0, 1e-12); near(stood.sway, 0, 1e-12); near(stood.armL.swing, 0, 1e-12);
  near(stood.legL.x, Gt.BUILD.hip, 1e-12); near(stood.legR.x, -Gt.BUILD.hip, 1e-12);
});

ok('a body leans into a turn on the ground, and not in the air', () => {
  const turn = (flags) => {
    const g = Gt.createGait(), body = B.createBody({ v: [0, 0, B.RUN], ...flags });
    let pose = null;
    for (let i = 0; i < 90; i++) { body.yaw += 2.4 / 60; pose = Gt.stepGait(g, body, 1 / 60); }
    return pose.bank;
  };
  const left = turn({});
  assert.ok(left > 0.15 && left <= 0.32, 'turning toward its left it leans: ' + left);
  near(turn({ grounded: false }), 0, 1e-9, 'in the air there is nothing to lean on');
  const g = Gt.createGait(), body = B.createBody({ v: [0, 0, B.RUN], yaw: 3.1 });
  Gt.stepGait(g, body, 1 / 60); body.yaw = -3.1; const p = Gt.stepGait(g, body, 1 / 60);
  assert.ok(Math.abs(p.bank) < 0.05, 'a turn past the half-circle is a small turn, not a spin: ' + p.bank);
});

ok('what the body is doing, of the four; and a landing is taken in the knees', () => {
  assert.equal(Gt.stateOf(B.createBody()), 'ground');
  assert.equal(Gt.stateOf(B.createBody({ grounded: false })), 'air');
  assert.equal(Gt.stateOf(B.createBody({ grounded: false, dashT: 0.1 })), 'dash');
  assert.equal(Gt.stateOf(B.createBody({ flying: true, dashT: 0.1 })), 'fly');
  const g = Gt.createGait(), body = B.createBody();
  const before = Gt.stepGait(g, body, 1 / 60).pelvis;
  Gt.land(g, 7.67);                                       // the speed a 3 m jump comes down at
  const after = Gt.stepGait(g, body, 1 / 60).pelvis;
  assert.ok(before - after > 0.15, 'the hips drop: ' + (before - after));
  for (let i = 0; i < 120; i++) Gt.stepGait(g, body, 1 / 60);
  near(Gt.stepGait(g, body, 1 / 60).pelvis, before, 0.01, 'and come up again');
  Gt.land(g, 1000); assert.ok(g.crouch <= 0.3, 'no landing folds it flat');
  const soft = Gt.createGait(); Gt.land(soft, 2);
  near(soft.crouch, 0.08, 1e-12, 'a small drop is a small bend: 4 cm for each m/s it came down at');
});

console.log('the void: a body on six arms');

// the crawl, lived for a while at 60 frames a second: the body goes where its speed takes it
const crawlFor = (s, body, at, seconds, each = null) => {
  for (let f = 0; f < Math.round(seconds * 60); f++) { at[0] += body.v[0] / 60; at[2] += body.v[2] / 60; Cr.stepCrawl(s, body, at, 1 / 60); if (each) each(f); }
};

ok('at rest six tips stand on a ring round the body, sixty degrees apart, none of them straight ahead', () => {
  const s = Cr.createCrawl(), body = B.createBody({ yaw: 0.7 }), at = [3, 0, -2];
  Cr.stepCrawl(s, body, at, 1 / 60);
  assert.equal(s.tips.length, 6); assert.equal(s.falls.length, 0, 'a body only just made rings no water');
  s.tips.forEach((t, i) => {
    assert.ok(t.down && t.y === 0, 'planted');
    near(Math.hypot(t.x - at[0], t.z - at[2]), Cr.CRAWL.ring, 1e-12, 'on the ring');
    const dx = t.x - at[0], dz = t.z - at[2], lx = dx * Math.cos(0.7) - dz * Math.sin(0.7), lz = dx * Math.sin(0.7) + dz * Math.cos(0.7);
    near((Math.atan2(lx, lz) + 2 * Math.PI) % (2 * Math.PI), (i + 0.5) * Math.PI / 3, 1e-9, 'round from the front by the left');
  });
  let lifted = 0;
  crawlFor(s, body, at, 3, () => { lifted += s.tips.filter((t) => !t.down).length + s.falls.length; });
  assert.equal(lifted, 0, 'and standing, none of them stirs');
  const long = Cr.createCrawl({ ring: 0.3 }); Cr.stepCrawl(long, body, at, 1 / 60);
  near(Math.hypot(long.tips[2].x - at[0], long.tips[2].z - at[2]), 0.3, 1e-12, 'longer arms stand wider');
});

ok('a tip on the floor stays where it was put; three are always down; the two threes take turns evenly', () => {
  for (const v of [0.4, B.WALK, 2.4]) {
    const s = Cr.createCrawl(), body = B.createBody({ v: [0, 0, v] }), at = [0, 0, 0];
    const was = s.tips.map(() => null), lifts = s.tips.map(() => 0), lands = [[], []];
    let falls = 0, landed = 0, top = 0;
    crawlFor(s, body, at, 8, (f) => {
      let down = 0;
      assert.ok([0, 1].some((g) => [0, 2, 4].every((i) => s.tips[i + g].down)), 'a whole three, every other one round the ring');
      s.tips.forEach((t, i) => {
        assert.ok(Math.hypot(t.x - at[0], t.z - at[2]) < Cr.CRAWL.ring + Cr.CRAWL.reach + 0.25, `no arm is asked to be longer than it is, at ${v} m/s`);
        assert.ok(t.y >= 0 && t.y <= Cr.CRAWL.lift + 1e-12, 'nor lifted higher than a step');
        if (!t.down) { if (was[i]) lifts[i] += 1; was[i] = null; top = Math.max(top, t.y); return; }
        down += 1;
        if (was[i]) { assert.equal(t.x, was[i][0], `it does not slide at ${v} m/s`); assert.equal(t.z, was[i][1]); assert.equal(t.y, 0); }
        else if (f) {
          landed += 1; if (i < 2) lands[i].push(f / 60);
          if (f > 120) near(t.z - Cr.homeOf(s, i, at, 0)[1], Cr.CRAWL.reach * Math.min(1, v / 0.6), 1e-6, 'it comes down a stride ahead of where it would stand');
        }
        was[i] = [t.x, t.z];
      });
      assert.ok(down >= 3, `three on the floor at ${v} m/s: ${down}`);
      falls += s.falls.length;
      for (const [x, z] of s.falls) assert.ok(s.tips.some((t) => t.down && t.x === x && t.z === z), 'a fall is where a tip now stands');
    });
    assert.ok(lifts.every((n) => n >= 3), 'every tip steps: ' + lifts);
    assert.ok(top > 0.6 * Cr.CRAWL.lift, 'and is lifted to do it: ' + top);
    assert.equal(falls, landed, 'and each time one comes down it is told');
    const a = lands[0], b = lands[1], P = a[a.length - 1] - a[a.length - 2], lag = (((b[b.length - 1] - a[a.length - 1]) % P) + P) % P;
    assert.ok(lag > 0.35 * P && lag < 0.65 * P, `one three comes down half a stride after the other at ${v} m/s: ${lag / P}`);
  }
});

ok('turning where it stands, the tips follow it round, and come to rest on the ring', () => {
  const s = Cr.createCrawl(), body = B.createBody(), at = [0, 0, 0];
  let steps = 0, least = 6;
  crawlFor(s, body, at, 2, () => { body.yaw += 1.5 / 60; steps += s.falls.length; least = Math.min(least, s.tips.filter((t) => t.down).length); });
  assert.ok(steps >= 12, 'they step: ' + steps); assert.ok(least >= 3, 'three at a time');
  crawlFor(s, body, at, 1.5);
  s.tips.forEach((t, i) => { const home = Cr.homeOf(s, i, at, body.yaw); assert.ok(t.down && Math.hypot(t.x - home[0], t.z - home[1]) <= 0.05 + 1e-9, 'home, or as near as makes no step'); });
  const still = Cr.createCrawl(), stood = B.createBody(); Cr.stepCrawl(still, stood, at, 1 / 60);
  stood.yaw = 0.2; steps = 0; crawlFor(still, stood, at, 1, () => { steps += still.falls.length + still.tips.filter((t) => !t.down).length; });
  assert.equal(steps, 0, 'a turn of a few degrees is not worth a step');
});

ok('off the floor every tip is loose and goes with the body; the floor takes all six at once', () => {
  const s = Cr.createCrawl(), body = B.createBody({ v: [0, 0, B.WALK] }), at = [0, 0, 0];
  crawlFor(s, body, at, 1);
  for (const flags of [{ grounded: false }, { dashT: 0.2 }, { flying: true, grounded: false }]) {
    Object.assign(body, { grounded: true, dashT: 0, flying: false }, flags);
    crawlFor(s, body, at, 0.5, () => assert.equal(s.falls.length, 0, 'no ring where no tip came down'));
    assert.equal(s.state, Gt.stateOf(body));
    assert.ok(s.tips.every((t) => !t.down && Math.hypot(t.x - at[0], t.z - at[2]) <= Cr.CRAWL.ring + Cr.CRAWL.reach + 1e-9), 'loose, and with it');
    Object.assign(body, { grounded: true, dashT: 0, flying: false });
    Cr.stepCrawl(s, body, at, 1 / 60);
    assert.ok(s.tips.every((t) => t.down)); assert.equal(s.falls.length, 6, 'six rings');
  }
});

ok('faster than a crawl can carry it, it jets; and it does not flicker between the two', () => {
  assert.ok(B.WALK < Cr.CRAWL.jet[0] && Cr.CRAWL.jet[0] < Cr.CRAWL.jet[1] && B.RUN > Cr.CRAWL.jet[1], 'a walk crawls, a run jets');
  const s = Cr.createCrawl(), body = B.createBody({ v: [0, 0, 2.9] }), at = [0, 0, 0];
  crawlFor(s, body, at, 2); assert.equal(s.state, 'crawl', 'from below, 2.9 m/s is a crawl');
  body.v[2] = B.RUN; crawlFor(s, body, at, 1); assert.equal(s.state, 'jet'); assert.ok(s.tips.every((t) => !t.down), 'nothing on the floor');
  body.v[2] = 2.9; crawlFor(s, body, at, 2); assert.equal(s.state, 'jet', 'from above, 2.9 m/s is still a jet');
  body.v[2] = B.WALK; crawlFor(s, body, at, 1); assert.equal(s.state, 'crawl'); assert.ok(s.tips.filter((t) => t.down).length >= 3, 'and it is on its arms again');
});

ok('the origin moved under it: the tips go with it, and none of them steps for that', () => {
  const s = Cr.createCrawl(), body = B.createBody({ v: [0, 0, B.WALK] }), at = [0, 0, 0];
  for (let f = 0; f < 600 && !s.tips.some((t) => !t.down && t.s > 0.3 && t.s < 0.7); f++) crawlFor(s, body, at, 1 / 60);
  const before = s.tips.map((t) => ({ ...t }));
  assert.ok(before.some((t) => !t.down && t.s > 0.3) && before.some((t) => t.down), 'some in the middle of a step, some planted');
  Cr.shiftCrawl(s, -400, 800); at[0] -= 400; at[2] += 800;
  Cr.stepCrawl(s, body, at, 0);
  s.tips.forEach((t, i) => { near(t.x, before[i].x - 400, 1e-9); near(t.z, before[i].z + 800, 1e-9); assert.equal(t.down, before[i].down); assert.equal(t.s, before[i].s); });
  assert.equal(s.falls.length, 0);
});

console.log('the void: the five kinds of body');

ok('five kinds: the four he named and one of light; five choices each, five options a choice', () => {
  assert.deepEqual(K.KIND_IDS, ['human', 'robot', 'mantis', 'octopus', 'light']);
  for (const kind of K.KINDS) {
    assert.equal(kind.choices.length, 5, kind.id + ' has five kinds of choice');
    assert.equal(new Set(kind.choices.map((c) => c.id)).size, 5);
    for (const c of kind.choices) {
      assert.equal(c.options.length, 5, `${kind.id}'s ${c.id} has five`);
      assert.equal(new Set(c.options).size, 5, 'each its own');
      for (const o of c.options) assert.match(o, /^[a-z]+$/);
    }
    assert.ok(kind.line.length > 8 && kind.line.length < 40);
  }
  assert.equal(K.COUNT, 5 * 5 ** 5, '15,625 bodies');
  // his example: "for the human -- 5 hair types, 5 body types, 5 clothing types, and two others with 5 options"
  assert.deepEqual(K.kindOf('human').choices.map((c) => c.id), ['hair', 'build', 'clothing', 'skin', 'dye']);
  assert.equal(K.FIRST_KIND, 'human');
});

ok('a look is one option of each choice; what is not one is the first; chance picks whole looks', () => {
  for (const id of K.KIND_IDS) {
    const fresh = K.freshLook(id);
    assert.deepEqual(Object.keys(fresh), K.kindOf(id).choices.map((c) => c.id));
    assert.deepEqual(Object.values(fresh), K.kindOf(id).choices.map((c) => c.options[0]), 'the first of each is the body as it was first drawn');
    assert.deepEqual(K.cleanLook(id, null), fresh); assert.deepEqual(K.cleanLook(id, 'x'), fresh); assert.deepEqual(K.cleanLook(id, { __proto__: { hair: 'tail' }, hair: 7 }), fresh);
    const last = K.randomLook(id, () => 0.999999), first = K.randomLook(id, () => 0), edge = K.randomLook(id, () => 1);
    assert.deepEqual(first, fresh); assert.deepEqual(last, edge);
    assert.deepEqual(Object.values(last), K.kindOf(id).choices.map((c) => c.options[4]));
    assert.deepEqual(K.cleanLook(id, last), last, 'a whole look is kept whole');
  }
  assert.deepEqual(K.cleanLook('human', { hair: 'tail', build: 'giant', extra: 'x' }), { ...K.freshLook('human'), hair: 'tail' });
  assert.equal(K.cleanKind('mantis'), 'mantis'); assert.equal(K.cleanKind('toString'), 'human'); assert.equal(K.cleanKind(null), 'human');
  assert.deepEqual(Object.keys(K.cleanLooks({ human: { hair: 'curls' }, dragon: {} })), K.KIND_IDS);
  assert.equal(K.cleanLooks({ human: { hair: 'curls' } }).human.hair, 'curls');
});

ok('a choice of colour shows its colours, a choice of shape none', () => {
  const hex = /^#[0-9a-f]{6}$/;
  let coloured = 0;
  for (const kind of K.KINDS) for (const c of kind.choices) for (const o of c.options) {
    const sw = K.swatchOf(kind.id, c.id, o);
    if (c.swatch) { coloured += 1; assert.ok(Array.isArray(sw) && sw.length >= 1 && sw.length <= 2 && sw.every((x) => hex.test(x)), `${kind.id} ${c.id} ${o}`); }
    else assert.equal(sw, null);
  }
  assert.equal(coloured, 7 * 5, 'seven of the twenty-five choices are colours');
  assert.equal(K.swatchOf('human', 'skin', 'nope'), null); assert.equal(K.swatchOf('human', 'nope', 'sand'), null);
  assert.deepEqual(K.swatchOf('light', 'colour', 'aurora'), K.AURA.aurora);
});

console.log('the void: what is kept, and the door');

ok('what the void keeps between visits, and junk is not believed', () => {
  const st = store();
  assert.deepEqual(S.loadState(st), { mode: 'survival', light: 'pale', zoom: 5.5, kind: 'human', looks: K.cleanLooks(null) });
  const looks = K.cleanLooks(null); looks.octopus.skin = 'ink'; looks.human.hair = 'braid';
  S.saveState(st, { mode: 'creative', light: 'night', zoom: 7.123456, kind: 'octopus', looks });
  assert.deepEqual(S.loadState(st), { mode: 'creative', light: 'night', zoom: 7.12, kind: 'octopus', looks });
  const odd = S.loadState(store({ [S.STATE_KEY]: '{"kind":"dragon","looks":{"human":{"hair":"mohawk","dye":"moss"},"robot":7}}' }));
  assert.equal(odd.kind, 'human', 'a kind that is not one of the five is the first');
  assert.deepEqual(odd.looks.human, { ...K.freshLook('human'), dye: 'moss' }, 'an option that is not one of the five is the first; the rest is kept');
  assert.deepEqual(odd.looks.robot, K.freshLook('robot'));
  for (const junk of ['{', '[]', '"x"', '{"mode":"god","light":"noon","zoom":"near"}', '{"mode":7,"light":null,"zoom":null}'])
    assert.deepEqual(S.loadState(store({ [S.STATE_KEY]: junk })), S.freshState(), junk);
  assert.equal(S.loadState(store({ [S.STATE_KEY]: '{"zoom":900}' })).zoom, S.ZOOM.max);
  assert.equal(S.loadState(store({ [S.STATE_KEY]: '{"zoom":-3}' })).zoom, S.ZOOM.min);
  assert.deepEqual(S.loadState(null), S.freshState());
  assert.equal(S.freshState().mode, 'survival', 'a first visit is survival');
});

ok('the world tab opens on the void the first time, and on the one last chosen after', () => {
  assert.equal(S.loadWhich(store()), 'void'); assert.equal(S.loadWhich(null), 'void');
  assert.equal(S.loadWhich(store({ [S.WHICH_KEY]: 'societies' })), 'societies');
  assert.equal(S.loadWhich(store({ [S.WHICH_KEY]: 'elsewhere' })), 'void');
  const st = store(); S.saveWhich(st, 'societies'); assert.equal(st.m.get(S.WHICH_KEY), 'societies');
  S.saveWhich(st, 'anything'); assert.equal(st.m.get(S.WHICH_KEY), 'void');
});

const tick = () => new Promise((r) => setTimeout(r, 0));
function door({ kept = {}, load } = {}) {
  const log = [], st = store(kept), grid = { innerHTML: 'x' };
  const societies = { open: (g) => log.push(['societies.open', g === grid]), close: () => log.push(['societies.close']) };
  const view = { open: (g) => log.push(['void.open', g === grid]), close: () => log.push(['void.close']) };
  let made = 0, deps = null, loads = 0;
  const loadVoid = load || (async () => { loads += 1; return { createGameView: (d) => { made += 1; deps = d; return view; } }; });
  const toasts = [];
  const gate = createWorldGate({ societies, loadVoid, toast: (t) => toasts.push(t), storage: st });
  return { gate, log, st, grid, toasts, made: () => made, loads: () => loads, deps: () => deps, names: () => log.map((l) => l[0]) };
}

await okAsync('the door: the void by default, made once, and each world one press from the other', async () => {
  const d = door();
  d.gate.open(d.grid); await tick();
  assert.deepEqual(d.log, [['void.open', true]]); assert.equal(d.grid.innerHTML, '', 'the grid is cleared for it');
  d.gate.open(d.grid); await tick();
  assert.equal(d.log.length, 1, 'the world glyph pressed again does not open it twice');
  d.deps().toSocieties(); await tick();
  assert.deepEqual(d.names().slice(1), ['void.close', 'societies.close', 'societies.open']);
  assert.equal(d.gate.which(), 'societies'); assert.equal(d.st.m.get(S.WHICH_KEY), 'societies', 'kept');
  d.gate.go('void'); await tick();
  assert.equal(d.names().at(-1), 'void.open'); assert.equal(d.made(), 1, 'the same void, not a second one');
  d.gate.close();
  assert.deepEqual(d.names().slice(-2), ['void.close', 'societies.close']); assert.equal(d.gate.isOpen(), false);
  const n = d.log.length; d.gate.go('societies'); await tick();
  assert.equal(d.log.length, n, 'choosing while the tab is closed opens nothing'); assert.equal(d.gate.which(), 'societies', 'but is kept for next time');
  const again = door({ kept: { [S.WHICH_KEY]: 'societies' } });
  again.gate.open(again.grid); await tick();
  assert.deepEqual(again.names(), ['societies.open']); assert.equal(again.made(), 0, 'the void\'s code is not fetched until it is wanted');
});

await okAsync('the door: where the void cannot be drawn it says so and opens the societies, and tries again next time', async () => {
  let fail = true;
  const d = door({ load: async () => ({ createGameView: () => ({ open() { if (fail) throw new Error('no canvas'); d.log.push(['void.open']); }, close() { d.log.push(['void.close']); } }) }) });
  const warn = console.warn; console.warn = () => {};
  try { d.gate.open(d.grid); await tick(); } finally { console.warn = warn; }
  assert.deepEqual(d.names(), ['void.close', 'societies.open']); assert.equal(d.toasts.length, 1); assert.match(d.toasts[0], /could not be drawn/);
  assert.equal(d.st.m.has(S.WHICH_KEY), false, 'not kept: the next visit tries the void again');
  fail = false; d.gate.go('void'); await tick();
  assert.equal(d.names().at(-1), 'void.open');
  const gone = door({ load: async () => { throw new Error('offline'); } });
  console.warn = () => {};
  try { gone.gate.open(gone.grid); await tick(); } finally { console.warn = warn; }
  assert.deepEqual(gone.names(), ['societies.open'], 'the code never arrived'); assert.equal(gone.toasts.length, 1);
});

await okAsync('the door: a void that arrives after they have left, or chosen the other world, does not open', async () => {
  let arrive;
  const slow = () => new Promise((r) => { arrive = () => r({ createGameView: () => ({ open: () => d.log.push(['void.open']), close: () => d.log.push(['void.close']) }) }); });
  const d = door({ load: slow });
  d.gate.open(d.grid); d.gate.close(); arrive(); await tick();
  assert.ok(!d.names().includes('void.open'), 'left the tab');
  const e = door({ load: () => new Promise((r) => { arrive = () => r({ createGameView: () => ({ open: () => e.log.push(['void.open']), close: () => e.log.push(['void.close']) }) }); }) });
  e.gate.open(e.grid); e.gate.go('societies'); arrive(); await tick();
  assert.ok(!e.names().includes('void.open'), 'chose the societies'); assert.equal(e.names().at(-1), 'societies.open');
});

await okAsync('the door: a void that fails after they have left, or chosen the other world, says nothing and opens nothing', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    let fail;
    const late = () => new Promise((_, no) => { fail = () => no(new Error('offline')); });
    const d = door({ load: late });
    d.gate.open(d.grid); d.gate.close(); fail(); await tick();
    assert.deepEqual(d.names(), ['societies.close'], 'left the tab: nothing opens behind them'); assert.equal(d.toasts.length, 0);
    assert.equal(d.gate.which(), 'void', 'and the void is still the one to try next time');
    const e = door({ load: late });
    e.gate.open(e.grid); e.gate.go('societies'); fail(); await tick();
    assert.deepEqual(e.names(), ['societies.close', 'societies.open'], 'the societies they chose, opened once'); assert.equal(e.toasts.length, 0, 'and no word of a void they did not wait for');
  } finally { console.warn = warn; }
});

await okAsync('the door: the void\'s code is asked for once, a world chosen again is left as it is, and two openings make one void', async () => {
  const d = door();
  d.gate.open(d.grid); await tick();
  d.gate.close(); d.gate.open(d.grid); await tick();
  assert.equal(d.loads(), 1, 'made already, it is not fetched again'); assert.equal(d.made(), 1);
  assert.deepEqual(d.names(), ['void.open', 'void.close', 'societies.close', 'void.open']);
  d.gate.go('void'); await tick();
  assert.equal(d.log.length, 4, 'the void, chosen from the void, is not closed and opened again');
  d.gate.go('societies'); await tick();
  assert.deepEqual(d.names().slice(4), ['void.close', 'societies.close', 'societies.open']);
  d.gate.go('societies'); await tick();
  assert.equal(d.log.length, 7, 'nor the societies');
  // opened, left and opened again before the code has come: both openings are answered by one void, opened once
  let arrive = null, made = 0;
  const e = door({ load: () => new Promise((r) => { const before = arrive; arrive = () => { before?.(); r({ createGameView: () => { made += 1; return { open: () => e.log.push(['void.open']), close: () => e.log.push(['void.close']) }; } }); }; }) });
  e.gate.open(e.grid); e.gate.close(); e.gate.open(e.grid); arrive(); await tick();
  assert.equal(made, 1, 'one void'); assert.equal(e.names().filter((x) => x === 'void.open').length, 1, 'opened once');
});

console.log('the void: the lights, the sheet, the page');

ok('three lights, each with everything the void and a body in it are drawn from', () => {
  assert.deepEqual(LIGHT_NAMES, ['pale', 'dusk', 'night']);
  const fields = Object.keys(LIGHTS.pale).sort();
  for (const k of ['zenith', 'horizon', 'glow', 'glowAmt', 'glowDir', 'band', 'floor', 'line', 'lineAmt', 'f0', 'mote', 'moteSolid', 'stars', 'key', 'keyAmt', 'env', 'fill', 'fillAmt']) assert.ok(fields.includes(k), k);
  for (const name of LIGHT_NAMES) {
    const L = LIGHTS[name];
    assert.deepEqual(Object.keys(L).sort(), fields, name);
    for (const c of [L.zenith, L.horizon, L.glow, L.floor, L.line, L.mote, L.key, ...L.fill]) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.equal(L.glowDir.length, 3); assert.equal(L.fill.length, 2);
    assert.ok(L.glowDir[1] > 0, 'the light is over the horizon'); assert.ok(L.f0 > 0 && L.f0 < 1 && L.keyAmt > 0 && L.env > 0 && L.fillAmt >= 0);
  }
  assert.ok(LIGHTS.night.fillAmt > LIGHTS.dusk.fillAmt && LIGHTS.pale.fillAmt === 0, 'the darker the sky, the more of it is laid on the body');
  const v = read('src/game/void.js');
  for (const k of fields) assert.ok(new RegExp('\\bL\\.' + k + '\\b').test(v), 'void.js draws from ' + k);
});

ok('each mode says what it is, in the words asked for', () => {
  assert.deepEqual(Object.keys(MODE_LINES), S.MODES);
  assert.match(MODE_LINES.survival, /a tap jumps/); assert.match(MODE_LINES.survival, /twice the height/); assert.match(MODE_LINES.survival, /ground still takes you back/);
  assert.match(MODE_LINES.creative, /flight/); assert.match(MODE_LINES.creative, /second jump in the air/);
});

ok('the controls sheet is a sheet like the others, and its close is drawn', () => {
  const html = read('index.html');
  const at = html.indexOf('<div id="game-menu" class="modal" hidden>');
  assert.ok(at > 0, 'static in index.html, so the keeper of sheets finds it as the page starts');
  const sheet = html.slice(at, html.indexOf('<div id="settings"', at));
  assert.match(sheet, /<button id="game-menu-close" class="x mercury" aria-label="Close">/); assert.match(sheet, /id="game-menu-body"/);
  assert.match(read('src/mercury-mount.js'), /\['game-menu-close', [\d.]+\]/, 'the liquid X is mounted (an unmounted one is an empty button)');
  const menu = read('src/game/menu.js');
  for (const piece of ['role="table"', 'aria-pressed=', 'aria-label="${esc(', 'press a key…', 'press a button…', 'back to the defaults']) assert.ok(menu.includes(piece), 'menu.js: ' + piece);
});

ok('the world tab goes through the door, and each world has the button to the other', () => {
  const social = read('src/social.js');
  assert.match(social, /import \{ createWorldGate \} from '\.\/game\/gate\.js';/);
  assert.match(social, /else if \(v === 'world'\) world\.open\(\$\('home-grid'\)\);/); assert.match(social, /if \(v !== 'world'\) world\.close\(\);/);
  assert.ok(!/worldView\.(open|close)\(/.test(social), 'nothing opens the societies round the door');
  assert.match(social, /toVoid: \(\) => world\.go\('void'\)/);
  const wv = read('src/world-view.js');
  assert.match(wv, /id="world-void"/); assert.match(wv, /#world-void'\)\?\.addEventListener\('click', \(\) => toVoid\(\)\)/);
  const view = read('src/game/view.js');
  for (const id of ['game-mode', 'game-controls', 'game-societies', 'game-t-jump', 'game-t-dash', 'game-t-sink']) assert.ok(view.includes(`id="${id}"`), id);
  assert.match(view, /press\('#game-societies', \(\) => toSocieties\?\.\(\)\)/);
  assert.ok(!/from '\.\/game\/(view|void|figure)\.js'/.test(social + read('src/main.js')), 'the void\'s drawing code is fetched when wanted, not with the page');
  assert.match(read('src/game/gate.js'), /loadVoid = \(\) => import\('\.\/view\.js'\)/);
});

ok('the canvas takes the keys, the body begins with its back to the eye, and the page puts its own mark away', () => {
  const view = read('src/game/view.js');
  assert.match(view, /cv\.tabIndex = 0; cv\.setAttribute\('role', 'application'\);/); assert.match(view, /cv\.setAttribute\('aria-label', '[^']{20,}'\)/);
  assert.match(view, /createBody\(\{ yaw: Math\.PI \}\)/);
  const open = view.slice(view.indexOf('  function open() {'), view.indexOf('  function close() {'));
  assert.ok(open.indexOf("classList.add('in-void')") > 0 && open.indexOf('focusCanvas();', open.indexOf("classList.add('in-void')")) > 0, 'focused as it opens');
  assert.match(view.slice(view.indexOf('  function close() {')), /classList\.remove\('in-void'\)/);
  const css = read('styles.css');
  assert.match(css, /body\.in-void:not\(\.airden\) \.chat-air \{ visibility: hidden; \}/);
  assert.match(css, /\.game-canvas canvas \{[^}]*outline: none;/);
  // a body's front is +Z (atan2(x, z)); yaw π faces −Z, where the eye looks at its yaw 0
  const s = B.createBody({ yaw: Math.PI });
  near(Math.sin(s.yaw), 0, 1e-12); near(Math.cos(s.yaw), -1, 1e-12);
  const fwd = B.wish({ move: [0, 1], yaw: 0 });
  assert.deepEqual([Math.abs(fwd[0]), fwd[2]], [0, -1]);
});

ok('a waiting picture is not drawn again, and the standing hint is put away once the hands know', () => {
  const view = read('src/game/view.js');
  assert.match(view, /if \(!paused\) still = 0; else if \(\+\+still > 4\) return;/);
  assert.match(view, /function lightTo\(name\) \{[^\n]*still = 0;/, 'a light chosen in the sheet is drawn');
  assert.match(view, /still = 0;\s+\/\/ a canvas that changed size/);
  assert.match(view, /if \(touch \|\| K\.learned > LEARNED\) return '';/);
});

ok('GAME.md keeps the asks in his own words, and what has been done about each', () => {
  const g = read('GAME.md');
  for (const words of ['full-fledged open-world video game', 'at least 5 different types of spaceships', '5 different types of buildings', '5 is our magic number',
    'one should be mantis/insectoid', "some type of 'force'", 'make up 5 different plasma weapons', 'defy gravity by 2x', 'omnidirectional dash', 'simulate the actual speed of light',
    'an endless void', '1 inch of still water', "don't spend real money", 'get a working product first', 'ancient/natural, current, and futuristic'])
    assert.ok(g.includes(words), 'GAME.md quotes: ' + words);
  assert.match(g, /## Where it stands/); assert.match(g, /## What is next/);
});

console.log(`\n${passed} checks passed.`);
