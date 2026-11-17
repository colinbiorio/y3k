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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as B from '../src/game/body.js';
import * as I from '../src/game/input.js';
import * as R from '../src/game/rings.js';
import * as Gt from '../src/game/gait.js';
import * as Cr from '../src/game/crawl.js';
import * as S from '../src/game/state.js';
import * as K from '../src/game/kinds.js';
import * as Ch from '../src/game/chooser.js';
import { leave } from '../src/game/drape.js';
import * as F from '../src/game/fine.js';
import * as Kin from '../src/game/bodies/kin.js';
import { LIGHTS, LIGHT_NAMES } from '../src/game/lights.js';
import { createWorldGate } from '../src/game/gate.js';
import { MODE_LINES, cellText } from '../src/game/menu.js';
import * as SH from '../src/game/shelter.js';
import { createWorld, BODY, KINDS, BUILDINGS } from '../src/game/world.js';
import * as HO from '../src/game/house.js';
import { solveBoxes, rayBox } from '../src/game/solids.js';

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

// the builds two of the bodies stand on, as their own files give them: a number changed there is tried here
const litOf = (file, re) => { const m = read(file).match(re); assert.ok(m, `${file} has ${re}`); return JSON.parse(m[1].replace(/(\w+):/g, '"$1":')); };
const MANTIS_LEGS = litOf('src/game/bodies/mantis.js', /const LEGS = (\{[^}]*\});/);
const ROBOT_BUILD = litOf('src/game/bodies/robot.js', /createBiped\(\{ scale: s, build: (\{[^}]*\}),/);

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
  for (const build of [undefined, MANTIS_LEGS, ROBOT_BUILD]) {
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
  for (const build of [undefined, MANTIS_LEGS, ROBOT_BUILD]) {
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

ok('each kind has a body of its own, and every option is named in it: none does nothing', () => {
  const figure = read('src/game/figure.js');
  for (const kind of K.KINDS) {
    const Name = kind.id[0].toUpperCase() + kind.id.slice(1), src = read(`src/game/bodies/${kind.id}.js`);
    assert.ok(figure.includes(`import { create${Name} } from './bodies/${kind.id}.js';`), 'figure.js has the ' + kind.id);
    assert.ok(new RegExp(`\\b${kind.id}: create${Name}\\b`).test(figure), 'and makes it');
    assert.ok(src.includes(`export function create${Name}(look, { lite = false } = {})`), kind.id + ' is made from a look');
    for (const c of kind.choices) {
      assert.ok(new RegExp(`\\blook\\.${c.id}\\b`).test(src), `the ${kind.id} reads its ${c.id}`);
      if (c.swatch) continue;                          // a colour is looked up in its table (kinds.js), not named
      c.options.forEach((o, i) => {
        // the first is the body as it was first drawn, and wearing nothing needs no line: any other is named
        if (i === 0 || ['bare', 'none', 'plain'].includes(o)) return;
        assert.ok(new RegExp(`'${o}'|\\b${o}:`).test(src), `the ${kind.id}'s ${c.id} "${o}" is drawn by nothing`);
      });
    }
  }
  assert.ok(figure.includes('MAKE[cleanKind(kind)]'), 'a kind that is not one is the first');
});

ok('what every body shares: its limbs as cloth feels them, what goes with it when it is put somewhere, its shade on the water', () => {
  const common = read('src/game/bodies/common.js');
  assert.ok(common.includes('capsule(a, pa, b, pb, r) { const c = { a: [0, 0, 0], b: [0, 0, 0], r: r * s,'), 'a limb is as much bigger as the body is drawn');
  // put somewhere, not gone there: further in a frame than any body goes
  assert.ok(common.includes('if (had && (dx || dy || dz) && (dt <= 0 || Math.hypot(dx, dy, dz) > 2 + 80 * dt)) for (const w of world) w.shift(dx, dy, dz);'));
  assert.ok(Math.max(B.SPRINT, B.DASH_SPEED, B.FLY_SPRINT) < 80, 'no body goes 80 m/s');
  assert.ok(common.includes('c.cloth.step(dt, c.free ? [] : shapes, floor, c.stiff)'), 'a cloth is pushed out of the body, unless it is free of it');
  assert.ok(common.includes('shade: rig.shade ?? 1,'));
  assert.match(read('src/game/bodies/light.js'), /\bshade: 0\.3,/, 'the light goes through a body of light');
  assert.ok(read('src/game/view.js').includes('V.update(K.clock, camera, [{ x: pos[0], z: pos[2], y: pos[1], k: figure.shade }]);'));
});

console.log('the void: a cloth and the limb under it');

const THIGH = { a: [0, 1, 0], b: [0, 0.6, 0.4], r: 0.1 };                 // a thigh lifted half way: from the hip forward and down to the knee
const MID = [0, 0.8, 0.2], UP = [0, Math.SQRT1_2, Math.SQRT1_2];          // its middle, and the way across it that is up and forward
// how far a point is from a limb's line, and how far along the limb that is
const off = (p, sh) => {
  const e = sh.b.map((x, i) => x - sh.a[i]), ee = e.reduce((n, x) => n + x * x, 0);
  const t = ee > 0 ? Math.min(1, Math.max(0, p.reduce((n, x, i) => n + (x - sh.a[i]) * e[i], 0) / ee)) : 0;
  return { t, dist: Math.hypot(...p.map((x, i) => x - sh.a[i] - e[i] * t)) };
};
const over = (p) => p.reduce((n, x, i) => n + (x - MID[i]) * UP[i], 0);
const UNDER = [0.02, MID[1] - 0.04 * UP[1], MID[2] - 0.04 * UP[2]];       // a point of cloth that has got in under the thigh

ok('a point inside a limb is put on its surface by the nearest way; one outside is left', () => {
  const sh = { a: [0, 0, 0], b: [0, 1, 0], r: 0.1 };
  const P = [0.03, 0.5, 0.04];
  assert.equal(leave(P, 0, sh), true);
  near(P[0], 0.06, 1e-12); near(P[1], 0.5, 1e-12); near(P[2], 0.08, 1e-12);
  const Q = [0.2, 0.5, 0]; assert.equal(leave(Q, 0, sh), false); assert.deepEqual(Q, [0.2, 0.5, 0]);
  const end = [0, 1.05, 0]; assert.equal(leave(end, 0, sh), true); near(end[1], 1.1, 1e-12, 'past its end a limb is round');
  const start = [0, -0.05, 0]; assert.equal(leave(start, 0, sh), true); near(start[1], -0.1, 1e-12, 'and before its start');
  const axis = [0, 0.5, 0]; assert.equal(leave(axis, 0, sh), false, 'on the line itself no way is nearer than another'); assert.deepEqual(axis, [0, 0.5, 0]);
  const ball = { a: [1, 1, 1], b: [1, 1, 1], r: 0.2 }, R = [1.1, 1, 1];     // a limb with no length is a ball
  assert.equal(leave(R, 0, ball), true); near(R[0], 1.2, 1e-12);
});

ok('the nearest way out of a lifted thigh is under it: that is how a knee came through a skirt', () => {
  const P = [...UNDER];
  assert.equal(leave(P, 0, THIGH), true);
  near(off(P, THIGH).dist, THIGH.r, 1e-12); assert.ok(over(P) < 0, 'left under the thigh');
});

ok('a garment that says which way is out is put over the limb, and not slid along it', () => {
  const P = [...UNDER], O = [0, 0, 1], was = off(P, THIGH);              // a skirt's front: out is forward
  assert.equal(leave(P, 0, THIGH, O, 0), true);
  const now = off(P, THIGH);
  near(now.dist, THIGH.r, 1e-12, 'on its surface'); near(now.t, was.t, 1e-12, 'as far along the limb as it was');
  near(over(P), (-over(UNDER) * THIGH.r) / was.dist, 1e-12, 'as far over the thigh as it was under it');
  near(P[0], (UNDER[0] * THIGH.r) / was.dist, 1e-12, 'and to the same side');
  // one that is already on the outer side leaves by the nearest way
  const A = [0.02, MID[1] + 0.04 * UP[1], MID[2] + 0.04 * UP[2]], N = [...A];
  leave(A, 0, THIGH, O, 0); leave(N, 0, THIGH);
  assert.deepEqual(A, N); assert.ok(over(A) > 0);
  // and once it is out it stays where it is
  const again = [...P]; leave(again, 0, THIGH, O, 0);
  for (let i = 0; i < 3; i++) near(again[i], P[i], 1e-12);
});

ok('askew, in no axis\'s favour: what of it was against the way out is turned round, and the rest is kept', () => {
  const sh = { a: [0.1, 1, -0.2], b: [0.45, 0.72, 0.31], r: 0.12 }, out = [0.3, 0.5, 0.8];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], add = (u, v, k = 1) => u.map((x, i) => x + k * v[i]), unit = (u) => u.map((x) => x / Math.hypot(...u));
  const e = add(sh.b, sh.a, -1), E = unit(e);
  const N = unit(add(out, E, -dot(out, E)));                               // across the limb, the way out
  const W = [E[1] * N[2] - E[2] * N[1], E[2] * N[0] - E[0] * N[2], E[0] * N[1] - E[1] * N[0]];   // across the limb, neither out nor in
  const foot = add(sh.a, e, 0.37);
  for (const [n, w] of [[-0.05, 0.03], [-0.02, -0.06], [-0.09, 0], [0.04, 0.05]]) {
    const P = [7, 7, 7, ...add(add(foot, N, n), W, w)], O = [9, 9, 9, ...out];
    assert.equal(leave(P, 3, sh, O, 3), true);
    const k = sh.r / Math.hypot(n, w), want = add(add(foot, N, Math.abs(n) * k), W, w * k);
    for (let i = 0; i < 3; i++) near(P[3 + i], want[i], 1e-12, `${n} against the way out, ${w} beside it`);
    assert.deepEqual(P.slice(0, 3), [7, 7, 7]);
  }
});

ok('at a limb\'s round ends the whole way out counts; beside its length, only what lies across it', () => {
  // a ball (a shoulder): a point behind its middle is put in front, as high as it was
  const ball = { a: [0, 1, 0], b: [0, 1, 0], r: 0.1 }, P = [0, 1.01, -0.05];
  assert.equal(leave(P, 0, ball, [0, 0, 1], 0), true);
  near(Math.hypot(P[0], P[1] - 1, P[2]), 0.1, 1e-12); assert.ok(P[2] > 0);
  near(P[1] - 1, (0.01 * 0.1) / Math.hypot(0.01, 0.05), 1e-12, 'only what was against the way out is turned round');
  // past the knee, the thigh's round end: the same, though forward is half along the thigh
  const Q = [THIGH.b[0], THIGH.b[1] - 0.04, THIGH.b[2] - 0.02];
  assert.equal(off(Q, THIGH).t, 1);
  assert.equal(leave(Q, 0, THIGH, [0, 0, 1], 0), true);
  near(Math.hypot(Q[0] - THIGH.b[0], Q[1] - THIGH.b[1], Q[2] - THIGH.b[2]), THIGH.r, 1e-12);
  near(Q[2] - THIGH.b[2], (0.02 * THIGH.r) / Math.hypot(0.04, 0.02), 1e-12, 'in front of the knee'); assert.ok(Q[1] < THIGH.b[1]);
  // a way out that lies along the limb says nothing about its sides: then the nearest way
  const level = { a: [0, 1, 0], b: [0, 1, 0.4], r: 0.1 };
  for (const [across, side] of [[0, -1], [0.09, -1], [0.11, 1], [0.6, 1]]) {
    const U = [0.01, 0.96, 0.2];
    assert.equal(leave(U, 0, level, [0, across, Math.sqrt(1 - across * across)], 0), true);
    assert.equal(Math.sign(U[1] - 1), side, `a way out with ${across} of it across the limb`);
    near(Math.hypot(U[0], U[1] - 1), 0.1, 1e-12); near(U[2], 0.2, 1e-12);
  }
});

ok('each point is put out by its own column\'s way, and no other point is touched', () => {
  const ball = { a: [0, 1, 0], b: [0, 1, 0], r: 0.1 };
  const O = [0, 0, -1, 0, 0, 1];                                          // two columns: the back's and the front's
  const P = [5, 5, 5, 0.01, 1, 0.03, 0.01, 1, 0.03];                      // a point far off, and one point twice
  assert.equal(leave(P, 3, ball, O, 3), true); assert.equal(leave(P, 6, ball, O, 0), true); assert.equal(leave(P, 0, ball, O, 0), false);
  assert.deepEqual(P.slice(0, 3), [5, 5, 5]);
  assert.ok(P[5] > 0 && P[8] < 0, 'the front\'s goes forward, the back\'s goes back'); near(P[5], -P[8], 1e-15); near(P[3], P[6], 1e-15);
});

ok('the cloth asks it of every point and every limb; the skirt and the cape say which way is out; what they lie on is fatter than what is drawn', () => {
  const shape = read('src/game/shape.js'), drape = read('src/game/drape.js'), human = read('src/game/bodies/human.js');
  assert.ok(!/^\s*import\b/m.test(drape), 'drape.js has no page and no three in it: it is run here');
  assert.ok(shape.includes("import { leave } from './drape.js';"));
  assert.ok(shape.includes('for (const sh of shapes) leave(P, o, sh, OW, (i % cols) * 3);'), 'each point, each limb, its column\'s way out');
  assert.ok(shape.includes('scale = 1, out = null })'), 'a cloth that says nothing leaves by the nearest way, as before');
  assert.ok(shape.includes('const O = out ? new Float32Array(cols * 3) : null, OW = out ? new Float32Array(cols * 3) : null;'), 'said in the bone\'s numbers, turned into the world\'s as the bone moves');
  assert.equal((human.match(/\bout: \(\w\) => \[Math\.cos\(ring\(\w\)\), [\d.]+, Math\.sin\(ring\(\w\)\)\],/g) || []).length, 2, 'the skirt (open or all the way round) and the cape');
  // a cloth is flat between its points and cuts corners: the shin showed between them (14 Nov 2026)
  const fattest = (name) => Math.max(...JSON.parse(human.match(new RegExp(`const ${name} = (\\[\\[.*\\]\\]);`))[1]).flatMap(([, w, d]) => [w, d]));
  const felt = (re) => +human.match(re)[1];
  assert.ok(felt(/rig\.capsule\(l\.hip, \[0, 0, 0\], l\.knee, \[0, 0, 0\], ([\d.]+) \* kl\)/) > fattest('THIGH'), 'the thigh');
  assert.ok(felt(/rig\.capsule\(l\.knee, \[0, 0, 0\], l\.ankle, \[0, 0, 0\], ([\d.]+) \* kl\)/) > fattest('SHIN'), 'the shin');
});

console.log('the void: the body sheet');

ok('along a row the arrows go round, choosing as they go; Home and End go to its ends', () => {
  const row = ['a', 'b', 'c'];
  assert.equal(Ch.stepTo(row, 'a', 'ArrowRight'), 'b'); assert.equal(Ch.stepTo(row, 'c', 'ArrowRight'), 'a'); assert.equal(Ch.stepTo(row, 'b', 'ArrowDown'), 'c');
  assert.equal(Ch.stepTo(row, 'a', 'ArrowLeft'), 'c'); assert.equal(Ch.stepTo(row, 'c', 'ArrowUp'), 'b');
  assert.equal(Ch.stepTo(row, 'b', 'Home'), 'a'); assert.equal(Ch.stepTo(row, 'b', 'End'), 'c');
  for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a']) assert.equal(Ch.stepTo(row, 'b', key), null, key + ' is not the row\'s');
  assert.equal(Ch.stepTo(row, 'nope', 'ArrowRight'), 'b', 'from what is not in the row: from its first');
  for (const kind of K.KINDS) for (const c of kind.choices) {
    let at = c.options[0]; for (let i = 0; i < 5; i++) at = Ch.stepTo(c.options, at, 'ArrowRight');
    assert.equal(at, c.options[0], 'five steps go round five');
  }
});

ok('the sheet shows a kind as it looks: five rows of five, one on in each, the colours on those that are colours', () => {
  for (const kind of K.KINDS) {
    const look = K.randomLook(kind.id, () => 0.5), rows = Ch.rowsOf(kind.id, look);
    assert.deepEqual(rows.map((r) => r.id), kind.choices.map((c) => c.id));
    rows.forEach((r, i) => {
      assert.deepEqual(r.options.map((o) => o.id), kind.choices[i].options);
      assert.deepEqual(r.options.filter((o) => o.on).map((o) => o.id), [look[r.id]], 'the one it wears');
      for (const o of r.options) assert.deepEqual(o.swatch, K.swatchOf(kind.id, r.id, o.id));
      assert.equal(r.options.every((o) => Array.isArray(o.swatch)), !!kind.choices[i].swatch);
    });
    assert.ok(Ch.rowsOf(kind.id, null).every((r) => r.options.every((o) => !o.on)), 'a look that is not there: none on, and no fall');
  }
  assert.deepEqual(Ch.rowsOf('dragon', {}).map((r) => r.id), K.kindOf('human').choices.map((c) => c.id), 'a kind that is not one: the first');
});

ok('the five pictures the kinds were drawn from are in the house, and small', () => {
  for (const id of K.KIND_IDS) {
    const url = Ch.cardOf(id);
    assert.ok(url.endsWith(`/src/game/art/v2/${id}.webp`), url);
    const f = fileURLToPath(url);
    assert.ok(existsSync(f), id + '.webp'); assert.ok(statSync(f).size < 12000, 'a picture in a sheet is a few kilobytes');
  }
  assert.equal(Ch.cardOf('dragon'), Ch.cardOf('human'));
});

const DESK = { canvas: { left: 0, top: 0, right: 1280, bottom: 800 }, room: { left: 90, top: 90, right: 1190, bottom: 710 }, sheet: { left: 858, top: 79, right: 1266, bottom: 721 } };
const PHONE = { canvas: { left: 0, top: 0, right: 390, bottom: 844 }, room: { left: 55, top: 120, right: 335, bottom: 790 }, sheet: { left: 0, top: 371, right: 390, bottom: 844 } };
const TAN = Math.tan((55 * Math.PI) / 360);

ok('the body stands in what the sheet leaves of the room: beside it on a desk, over it on a phone', () => {
  assert.deepEqual(Ch.FILL, [0.86, 0.9]);
  // a desk: the room is 90..1190 across and the sheet begins at 858, so the body's middle is at 474, 166 left of the picture's
  const d = Ch.standIn(DESK.canvas, DESK.room, DESK.sheet);
  assert.equal(d.x, 640 - (90 + 858) / 2); assert.equal(d.y, 0);
  near(d.d, (1.8 * 800) / (2 * TAN * 0.86 * 620), 1e-12, 'far enough for 1.8 m to take 86% of the room\'s height');
  // a phone: the sheet is its foot, so the body stands between the bar and the sheet
  const p = Ch.standIn(PHONE.canvas, PHONE.room, PHONE.sheet);
  assert.equal(p.x, 0); assert.equal(p.y, 422 - (120 + 371) / 2);
  near(p.d, (1.8 * 844) / (2 * TAN * 0.86 * 251), 1e-12);
  assert.ok(p.d > d.d, 'smaller on a phone: it stands further off');
  // a wide body in a narrow place is fitted by its width
  const wide = Ch.standIn(PHONE.canvas, PHONE.room, PHONE.sheet, { tall: 1, wide: 3 });
  near(wide.d, (3 * 844) / (2 * TAN * 0.9 * 280), 1e-12);
  // a taller body stands further off; a wider angle of view, nearer
  assert.ok(Ch.standIn(DESK.canvas, DESK.room, DESK.sheet, { tall: 2.6 }).d > d.d);
  assert.ok(Ch.standIn(DESK.canvas, DESK.room, DESK.sheet, { fov: 70 }).d < d.d);
  // beside and over the same size: beside
  const tie = Ch.standIn({ left: 0, top: 0, right: 100, bottom: 100 }, { left: 0, top: 0, right: 100, bottom: 100 }, { left: 50, top: 50, right: 100, bottom: 100 });
  assert.deepEqual([tie.x, tie.y], [25, 0]);
  // where on the page the canvas lies changes nothing; nor does a room that goes past the canvas: what is seen ends with it
  const moved = (r, dx, dy) => ({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });
  const past = (r) => ({ left: r.left - 100, right: r.right + 100, top: r.top - 50, bottom: r.bottom + 50 });
  for (const at of [DESK, PHONE]) {
    assert.deepEqual(Ch.standIn(moved(at.canvas, 30, 40), moved(at.room, 30, 40), moved(at.sheet, 30, 40)), Ch.standIn(at.canvas, at.room, at.sheet));
    assert.deepEqual(Ch.standIn(at.canvas, past(at.canvas), at.sheet), Ch.standIn(at.canvas, at.canvas, at.sheet));
  }
});

ok('with no room, a sheet over everything or no canvas, it still stands somewhere', () => {
  const c = DESK.canvas;
  // a room that is not there (not measured yet, or off the canvas): the canvas is the room
  for (const room of [{ left: 0, top: 0, right: 0, bottom: 0 }, { left: 2000, top: 0, right: 2400, bottom: 800 }]) {
    const r = Ch.standIn(c, room, DESK.sheet);
    assert.equal(r.x, 640 - 858 / 2); assert.equal(r.y, 0);
  }
  // the sheet over all of the room: the room's middle
  const all = Ch.standIn(c, DESK.room, { left: 0, top: 0, right: 1280, bottom: 800 });
  assert.deepEqual([all.x, all.y], [0, 0]); near(all.d, (1.8 * 800) / (2 * TAN * 0.86 * 620), 1e-12);
  // a canvas with no size (the tab not laid out yet)
  for (const cv of [{ left: 0, top: 0, right: 0, bottom: 800 }, { left: 0, top: 0, right: 1280, bottom: 0 }, { left: 0, top: 0, right: NaN, bottom: 800 }]) assert.deepEqual(Ch.standIn(cv, DESK.room, DESK.sheet), { x: 0, y: 0, d: 4 });
  // never nearer than 1.6 m nor further than 16
  assert.equal(Ch.standIn(c, DESK.room, DESK.sheet, { tall: 0.2, wide: 0.2 }).d, 1.6);
  assert.equal(Ch.standIn(c, { left: 600, top: 380, right: 640, bottom: 420 }, DESK.sheet, { tall: 3, wide: 3 }).d, 16);
});

ok('with no page there is no sheet, and nothing falls', () => {
  for (const doc of [null, undefined, {}, { getElementById: () => null }]) {
    const c = Ch.createChooser({ doc, get: () => { throw new Error('not asked'); }, set: () => { throw new Error('not set'); } });
    c.open(); c.close(); c.off();
    assert.equal(c.isOpen(), false); assert.equal(c.rect(), null);
  }
});

ok('the body sheet is a sheet like the others, but does not cover what it is about', () => {
  const html = read('index.html');
  const at = html.indexOf('<div id="game-body" class="modal" hidden>');
  assert.ok(at > 0, 'static in index.html, so the keeper of sheets finds it as the page starts');
  const sheet = html.slice(at, html.indexOf('<div id="settings"', at));
  assert.match(sheet, /<button id="game-body-close" class="x mercury" aria-label="Close">/); assert.match(sheet, /<div class="sheet-body game-body-body" id="game-body-body"><\/div>/);
  assert.match(read('src/mercury-mount.js'), /\['game-body-close', [\d.]+\]/, 'the liquid X is mounted (an unmounted one is an empty button)');
  const ch = read('src/game/chooser.js');
  for (const piece of ['role="radiogroup"', 'role="radio"', 'aria-checked="${isOn}"', 'tabindex="${isOn ? 0 : -1}"', 'aria-labelledby="game-body-l-${esc(r.id)}"', 'id="game-body-left"', 'id="game-body-right"',
    'id="game-body-random"', 'id="game-body-fresh"', "el.style.background = b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;", "import { KINDS, kindOf, freshLook, randomLook, swatchOf } from './kinds.js';"]) assert.ok(ch.includes(piece), 'chooser.js: ' + piece);
  assert.ok(!/\bfetch\(|localStorage|\bstyle="/.test(ch), 'it asks the network for nothing, keeps nothing itself, and writes no style into markup');
  const css = read('styles.css');
  // no veil over the body and no frost over a live canvas (a frosted sheet over one is blurred again every frame)
  assert.ok(css.includes('#game-body { background: none; backdrop-filter: none; -webkit-backdrop-filter: none; justify-content: flex-end; pointer-events: none; }'));
  const own = css.slice(css.indexOf('#game-body .sheet {'), css.indexOf('.body-kinds {'));
  assert.match(own, /pointer-events: auto;/); assert.match(own, /background: rgba\(15, 17, 23, 0\.9\); backdrop-filter: none;/);
  // its head stays and its rows scroll below it: on a phone the X had gone off with the rows
  assert.match(own, /display: flex; flex-direction: column; overflow: hidden; \}/);
  assert.match(own, /#game-body \.sheet-head \{ flex: none; background: transparent; backdrop-filter: none;/);
  assert.match(own, /#game-body \.sheet-body \{ flex: 1 1 auto; min-height: 0; overflow: auto;/);
  // one height for every option, taller under a finger
  assert.match(css, /\.body-opt \{[^}]*min-height: 42px;/); assert.ok(css.includes('@media (pointer: coarse) { .body-opt { min-height: 46px; } }'));
  // a phone: the sheet is the foot of the page and all but solid; the bar's four words are on one line; the thumbs are put away
  assert.ok(css.includes('#game-body .sheet { width: 100vw; max-height: 56vh; margin: 0; border-radius: 18px 18px 0 0; background: rgba(15, 17, 23, 0.97); }'));
  assert.ok(css.includes('.game-bar { gap: 4px 2px; padding-left: 6px; padding-right: 6px; }'));
  assert.ok(css.includes('body:has(#game-body:not([hidden])) .game-touch { display: none; }'));
});

ok('while the sheet is open the body poses: the hands are not read, it is made again as it is chosen, and the game goes on when it closes', () => {
  const view = read('src/game/view.js');
  assert.ok(view.includes("import { createChooser, standIn } from './chooser.js';"));
  assert.ok(view.includes('<button type="button" id="game-body-open" class="login-alt" aria-haspopup="dialog"'), 'the bar has the button');
  assert.ok(view.includes("press('#game-body-open', openBody);"));
  assert.ok(view.includes('const posing = chooser.isOpen();')); assert.ok(view.includes('const paused = !posing && (root.inert || menu.isOpen());'), 'its own sheet does not stop the picture');
  assert.ok(view.includes('const inp = paused || posing ? IDLE : input.frame(dt);'), 'the hands are not read');
  assert.match(view, /function hint\(\) \{\s+if \(chooser\?\.isOpen\(\)\) return '';/, 'nor told what the keys do');
  // the body is fitted to the room that is seen (the page's frame stands over the rest of the canvas), under the bar
  assert.ok(view.includes('if ((posing || stand) && !K.size) K.size = sized(figure, pos);'));
  assert.ok(view.includes('stand = standIn(cv, { left: room.left, right: room.right, bottom: room.bottom, top: Math.max(room.top, bar ? bar.bottom : room.top) }, sheet, { fov: FOV, tall: K.size.tall, wide: K.size.wide });'));
  assert.ok(view.includes('camera.setViewOffset(cv.clientWidth || 1, cv.clientHeight || 1, stand.x * u, stand.y * u, cv.clientWidth || 1, cv.clientHeight || 1);'));
  assert.ok(view.includes('stand = null; pose = 0; camera.clearViewOffset();'), 'and the picture is put back');
  // a body that cannot be made is said, and the one that was stays
  assert.ok(view.includes("toast('that body could not be made'); return false;"));
  assert.ok(view.includes('K.figure = made; K.worn = worn(st); K.size = null; standT = 0;'), 'a new body is measured again');
  assert.match(view, /kind: st\.kind, look: \{ \.\.\.st\.looks\[st\.kind\] \}, posing: !!chooser\?\.isOpen\(\), facing: K\.body\.yaw, seen: seen\(\)/, 'what the smoke reads');
  const smoke = read('scripts/void-smoke.mjs');
  assert.ok(smoke.includes('<desk|pad|phone|bodies|fine>')); assert.ok(smoke.includes('each of the 125 options put on once'));
  assert.ok(smoke.includes('keeps its way out in reach, its rows scrolled to their end'));
});

console.log('the void: what is kept, and the door');

ok('what the void keeps between visits, and junk is not believed', () => {
  const st = store();
  assert.deepEqual(S.loadState(st), { mode: 'survival', light: 'pale', zoom: 5.5, kind: 'human', looks: K.cleanLooks(null), building: 'shelter' });
  const looks = K.cleanLooks(null); looks.octopus.skin = 'ink'; looks.human.hair = 'braid';
  S.saveState(st, { mode: 'creative', light: 'night', zoom: 7.123456, kind: 'octopus', looks, building: 'house' });
  assert.deepEqual(S.loadState(st), { mode: 'creative', light: 'night', zoom: 7.12, kind: 'octopus', looks, building: 'house' });
  assert.equal(S.loadState(store({ [S.STATE_KEY]: '{"building":"castle"}' })).building, 'shelter', 'a building that is not made is the shelter');
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

// ── how fine it is drawn (fine.js). Colin, 15 Nov 2026: "is the pixelation necessary?" It was not: the void had
// taken its measure from the room's tier, which begins in the middle and only ever steps down.
const VS = 1000 / 60, r3 = (a) => a.map((x) => Math.round(x * 1000) / 1000);
// A machine, for the watch: a sixty-a-second screen and a frame that costs `costOf(w)` ms. A frame not done by
// the screen's next turn waits for the one after; `cap`: a browser that holds its pages to that many ms a frame.
// Answers what the watch did ([what, the step, the second]) and how many times it tried fewer pixels.
function play(w, rs, seconds, costOf, { cap = 0 } = {}) {
  const did = [], t0 = w.trials; let ms = VS;
  for (let t = 0; t < seconds * 1000; t += ms) {
    const d = F.watch(w, ms, rs); if (d) did.push([d, w.level, Math.round(t / 1000)]);
    ms = Math.max(cap, Math.ceil(costOf(w) / VS - 1e-9) * VS);
  }
  return { did, tried: w.trials - t0 };
}
// a frame the page makes in `made` ms, whose picture takes `wait` ms at the finest step, all of that pixels
const machine = (rs, made, wait) => (w) => made + wait * (rs[w.level] / rs[0]) ** 2;
const MAC = F.ratios(2, 1470, 880);

ok('the void is drawn with the screen\'s own pixels, two a point at the most; the room\'s guess at a tier is not read', () => {
  assert.deepEqual(r3(MAC), [2, 1.75, 1.5, 1.25, 1], 'his Mac: the whole screen at its own pixels, and four steps under it');
  assert.deepEqual(r3(F.ratios(1, 1280, 800)), [1, 0.875, 0.75], 'a one-pixel screen has three steps, none under three quarters');
  assert.deepEqual(r3(F.ratios(3, 390, 844)), [2, 1.75, 1.5, 1.25, 1], 'a phone: two at the most');
  const wide = F.ratios(2, 2560, 1440);
  assert.ok(2560 * 1440 * wide[0] ** 2 <= F.FINE.pixels * 1.0001 && wide[0] > 1.4, 'a very large canvas: a 4K screen\'s worth of pixels and no more');
  for (const rs of [MAC, F.ratios(1.5, 1280, 720), F.ratios(1, 3000, 2000), F.ratios(2.625, 412, 915), F.ratios(0.5, 800, 600)])
    for (let i = 0; i < rs.length; i += 1) { assert.ok(rs[i] >= F.FINE.least); if (i) assert.ok(rs[i] < rs[i - 1] - 0.04, 'each step is a real one'); }
  for (const bad of [0, NaN, undefined, -2]) assert.equal(F.ratios(bad, 800, 600)[0], 1);
  // a person's own choice of a lighter page is kept (Settings; ?gfx=); what the page guessed for itself is not
  assert.equal(F.chosen({ tier: 'low', manual: false }), 0); assert.equal(F.chosen({ tier: 'smooth', manual: false }), 0);
  assert.equal(F.chosen({ tier: 'low', manual: true }), 1.25); assert.equal(F.chosen({ tier: 'smooth', manual: true }), 1);
  assert.equal(F.chosen({ tier: 'mid', manual: true }), 0); assert.equal(F.chosen({ tier: 'high', manual: true }), 0);
  for (const none of [null, undefined, {}]) assert.equal(F.chosen(none), 0);
  assert.equal(F.ratios(2, 1470, 880, 1.25)[0], 1.25); assert.equal(F.ratios(1, 1280, 800, 1.25)[0], 1);
  // …and the view: edges smoothed always, nothing of the tier but that choice, and the watch told only how long frames are
  const view = read('src/game/view.js');
  assert.match(view, /new THREE\.WebGLRenderer\(\{ antialias: true, /); assert.doesNotMatch(view, /antialias: !/);
  assert.doesNotMatch(view, /dataset\.gfx|tierNow|const DPR\b/);
  assert.match(view, /hand = chosen\(globalThis\.window\?\.Y3K\?\.gfx\?\.profile\?\.\(\)\);/);
  assert.match(view, /K\.rs = ratios\(window\.devicePixelRatio \|\| 1, w, h, hand\);/);
  assert.match(view, /const did = watch\(K\.fine, since, K\.rs\); if \(did === 'ratio'\) size\(\); else if \(did === 'plain' && !K\.lite\) plain\(\);/);
  assert.match(view, /if \(!since\) \{ if \(rest\(K\.fine\) === 'ratio'\) size\(\); \}/);
  assert.doesNotMatch(view, /readPixels/, 'a read-back measures its own wait, not the drawing (16 Nov 2026)');
});

ok('good frames are left alone; so is a hitch; and a browser that holds its pages to thirty a second keeps its sharp picture', () => {
  // his Mac, measured: 7 ms a frame at two pixels a point
  let w = F.createWatch(), got = play(w, MAC, 120, machine(MAC, 2, 5));
  assert.deepEqual([got.did, got.tried, w.level, w.plain], [[], 0, 0, false]);
  // three frames of 400 ms every five seconds: a hitch is not a slow machine
  w = F.createWatch(); let n = 0; got = play(w, MAC, 120, () => ((n += 1) % 300 < 3 ? 400 : 7));
  assert.deepEqual([got.did, got.tried, w.level], [[], 0, 0]);
  // thirty a second, and the drawing costs 7 ms: fewer pixels are tried, buy nothing, and are given back at once;
  // each try waits twice as long as the one before, and the picture is never left turned down
  w = F.createWatch(); got = play(w, MAC, 600, machine(MAC, 2, 5), { cap: 2 * VS });
  assert.ok(got.tried >= 2 && got.tried <= 6, 'tried, and seldom: ' + got.tried + ' times in ten minutes');
  assert.ok(got.did.every((d, i) => d[0] === 'ratio' && d[1] === (i % 2 ? 0 : MAC.length - 1)), 'each try given back: ' + JSON.stringify(got.did));
  const tries = got.did.filter((d) => d[1] > 0).map((d) => d[2]);
  for (let i = 2; i < tries.length; i += 1) assert.ok(tries[i] - tries[i - 1] > 1.5 * (tries[i - 1] - tries[i - 2]), 'each wait longer: ' + tries);
  assert.deepEqual([w.level, w.plain], [0, false]);
});

ok('a drawing that is the cause is turned down, then climbs back as far as the frames allow; at the bottom, too slow, its stuff is made plain', () => {
  // 20 ms a frame, 18 of them pixels: every frame misses the screen's turn. Tried at the bottom, kept, and climbed
  // back to the finest step that keeps up (the second: 15.8 ms); the finest (20 ms) is tried and taken back
  let w = F.createWatch(), m = machine(MAC, 2, 18), got = play(w, MAC, 120, m);
  assert.equal(got.did[0][1], MAC.length - 1); assert.ok(got.did[0][2] <= 3, 'within a few seconds: ' + got.did[0][2]);
  assert.equal(w.level, 1, 'where it settles: ' + JSON.stringify(got.did));
  assert.ok(m({ level: 1 }) <= VS && m({ level: 0 }) > VS, 'the finest step that keeps up');
  assert.ok(got.did.findIndex((d) => d[1] === 1) >= 0 && got.did.find((d) => d[1] === 1)[2] <= 40, 'there within forty seconds');
  assert.equal(w.plain, false);
  // a machine that draws in software: 153 ms. To the bottom, and since even there it is slow, plain; then nothing more
  w = F.createWatch(); got = play(w, MAC, 300, machine(MAC, 3, 150));
  assert.deepEqual(got.did.map((d) => d.slice(0, 2)), [['ratio', 4], ['plain', 4]]);
  assert.ok(got.did[1][2] <= 6, 'both within a few seconds: ' + got.did[1][2]);
  // software drawing on a big canvas: 900 ms a frame at the finest, 250 at the last step. Both far past what a hitch
  // is cut to; the try is judged by the frames as they were, and kept
  w = F.createWatch(); got = play(w, MAC, 300, machine(MAC, 30, 870));
  assert.deepEqual(got.did.map((d) => d.slice(0, 2)), [['ratio', 4], ['plain', 4]], JSON.stringify(got.did));
  // a screen with one step has nothing to turn down but its stuff
  const one = F.ratios(0.5, 800, 600); assert.equal(one.length, 1);
  w = F.createWatch(); got = play(w, one, 60, () => 33);
  assert.deepEqual(got.did.map((d) => d.slice(0, 2)), [['plain', 0]]);
});

ok('fewer pixels are given back where they buy nothing: a page slow with its own work keeps its sharp picture', () => {
  // the page's own work is the cause (40 ms of making, 5 of waiting): the bottom step would still miss two turns
  let w = F.createWatch(), got = play(w, MAC, 300, () => 45);
  assert.ok(got.tried >= 1 && got.tried <= 5 && w.level === 0 && !w.plain, JSON.stringify([got, w.level, w.plain]));
  // half and half (9 and 9): the bottom keeps up, and the climb stops where the frames would miss again
  w = F.createWatch(); const m = machine(MAC, 9, 9); got = play(w, MAC, 120, m);
  assert.ok(w.level > 0 && m({ level: w.level }) <= VS && m({ level: w.level - 1 }) > VS, 'settled at ' + w.level);
});
ok('where there is room again it is turned back up, a step at a time; a step up that had to be taken back makes it slower to try', () => {
  // turned down to the fourth step, and then the machine has room (5 ms at the finest): a step every half minute
  let w = F.createWatch(); w.level = 3;
  let got = play(w, MAC, 40, machine(MAC, 1, 4));
  assert.deepEqual(got.did.map((d) => d.slice(0, 2)), [['ratio', 2]], 'one step in the first forty seconds');
  got = play(w, MAC, 120, machine(MAC, 1, 4));
  assert.deepEqual(got.did.map((d) => d[1]), [1, 0]); assert.equal(w.level, 0);
  assert.ok(got.did[1][2] - got.did[0][2] >= F.FINE.look, 'and the next no sooner than the wait');
  assert.equal(w.wait, F.FINE.look, 'no step was taken back: it is as quick to look as it was');
  got = play(w, MAC, 120, machine(MAC, 1, 4)); assert.deepEqual(got.did, []);
  // a machine with a cliff: cheap from the third step down, dear above it. Each time the step up is taken back,
  // it waits twice as long before the next, up to a limit; in an hour it is taken back a handful of times
  w = F.createWatch(); w.level = 3;
  got = play(w, MAC, 3600, (x) => (x.level >= 2 ? 5 : 20));
  const back = got.did.filter((d, i) => i && d[1] > got.did[i - 1][1]).map((d) => d[2]);
  assert.ok(back.length >= 3 && back.length <= 12, 'taken back ' + back.length + ' times in the hour (without the wait: about a hundred)');
  for (let i = 2; i < back.length && back[i - 1] - back[i - 2] < F.FINE.wary * F.FINE.look / 2; i += 1)
    assert.ok(back[i] - back[i - 1] > 1.5 * (back[i - 1] - back[i - 2]), 'each wait longer than the last, to the limit: ' + back);
  assert.ok(w.wait > F.FINE.look && w.wait <= F.FINE.wary * F.FINE.look);
  assert.equal(w.level, 2);
});

ok('a watch that was away drops what it was in the middle of, a try under way taken back; a frame of no length tells it nothing', () => {
  const w = F.createWatch(); w.hold = 0; w.phase = 'trial'; w.why = 'down'; w.from = 1; w.level = 4; w.got = [30, 31, 29]; w.ring = [40, 41]; w.slow = 1.2;
  assert.equal(F.rest(w), 'ratio');
  assert.deepEqual([w.phase, w.why, w.level, w.got, w.ring, w.slow], ['', '', 1, [], [], 0]); assert.ok(w.hold >= F.FINE.settle);
  assert.equal(F.rest(w), null, 'nothing under way: nothing to give back');
  const before = JSON.stringify(w);
  for (const ms of [0, -5, NaN, undefined]) assert.equal(F.watch(w, ms, MAC), null);
  assert.equal(JSON.stringify(w), before);
  // a canvas that came to have fewer steps (another screen): the step is brought within them
  const v = F.createWatch(); v.level = 4; F.watch(v, VS, F.ratios(1, 1280, 800)); assert.equal(v.level, 2);
});

// ── the human's face and hands (17 Nov 2026). Colin, 15 Nov: "the human isn't realistic whatsoever". They are MakeHuman's
// CC0 mesh now, in the game's own bone frames (./bodies/kin.js), decoded by ./bodies/human.js.
const dec = (b64, T) => { const b = Buffer.from(b64, 'base64'); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const partOf = (part) => ({ pos: Float32Array.from(dec(part.pos, Int16Array), (x) => x * 1e-5), nrm: dec(part.nrm, Int8Array), idx: dec(part.idx, Uint16Array), uv: part.uv ? dec(part.uv, Uint16Array) : null, col: part.col ? dec(part.col, Uint8Array) : null });
const within = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x} is not in [${lo}, ${hi}]`);
const box = (pos) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); } return [lo, hi]; };

ok('the human\'s face, hands and hair are MakeHuman\'s CC0 mesh, whole and in its bones\' frames', () => {
  const src = read('src/game/bodies/kin.js');
  assert.match(src, /released as CC0 1\.0/); assert.match(src, /makehumancommunity\/makehuman/);
  assert.ok(statSync(join(ROOT, 'src/game/bodies/kin.js')).size < 400000, 'a few hundred kilobytes of numbers, no more');
  for (const [name, part] of Object.entries({ HEAD: Kin.HEAD, HAND: Kin.HAND, CROP: Kin.CROP, SHAVED: Kin.SHAVED })) {
    const d = partOf(part);
    assert.equal(d.pos.length, part.n * 3, name); assert.equal(d.nrm.length, part.n * 3, name);
    assert.ok(d.idx.length % 3 === 0 && d.idx.length > 3000 && d.idx.every((i) => i < part.n), name + ': its triangles are its own');
    for (let i = 0; i < d.nrm.length; i += 3) assert.ok(Math.hypot(d.nrm[i], d.nrm[i + 1], d.nrm[i + 2]) > 100, name + ': a normal of no length');
    if (d.uv) assert.equal(d.uv.length, part.n * 2, name);
    if (d.col) assert.equal(d.col.length, part.n * 3, name);
  }
  // the head: upright in the head bone's frame (y up from the top of the neck, the face toward +z), its size a head's
  const [lo, hi] = box(partOf(Kin.HEAD).pos);
  near(lo[1], -0.02, 1e-4, 'cut level at the neck'); within(hi[1] - lo[1], 0.24, 0.29, 'chin-to-crown with the neck');
  within(hi[0] - lo[0], 0.15, 0.19, 'ear to ear'); assert.ok(hi[2] > 0.14 && lo[2] > -0.08, 'the nose forward, the back of the head behind');
  // two eyes, level, either side, in front, an eye's size
  const [l, r] = Kin.EYES;
  near(l[0], -r[0], 1e-9, 'either side'); near(l[1], r[1], 1e-9, 'level'); within(l[0], 0.026, 0.036, 'apart'); within(l[3], 0.011, 0.018, 'an eye\'s radius');
  assert.ok(l[2] > 0.09 && l[1] > 0.11 && l[1] < 0.15, 'in front, at the eyes\' height');
  // a left hand in the hand bone's frame: the fingers toward -y, the thumb toward +z, the palm toward -x (the body's middle)
  const hand = partOf(Kin.HAND).pos, [hl, hh] = box(hand);
  within(-hl[1], 0.12, 0.2, 'wrist to fingertip'); assert.ok(hh[1] < 0.02, 'nothing above the wrist but its crease');
  let thumb = -Infinity, palm = 0; for (let i = 0; i < hand.length; i += 3) { thumb = Math.max(thumb, hand[i + 2]); palm += hand[i]; }
  assert.ok(thumb > 0.04, 'the thumb forward'); assert.ok(palm / (hand.length / 3) < -0.005, 'curled toward the palm, which faces in');
  // hair over the scalp, not the face: its hairline above the eyes in front; the tail and the braid behind the head
  const crop = partOf(Kin.CROP).pos;
  for (let i = 0; i < crop.length; i += 3) if (crop[i + 2] > 0.09 && Math.abs(crop[i]) < 0.03) assert.ok(crop[i + 1] > l[1] + 0.03, 'no hair on the face');
  for (const k of ['tail', 'braid']) { const [x, y, z] = Kin.HAIR_AT[k]; assert.ok(x === 0 && z < -0.05 && y > 0.05, k + ' behind the head'); }
  assert.ok(Kin.CURLS.length >= 30 && Kin.CURLS.every(([x, y, z, nx, ny, nz]) => Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-3 && y > 0.04), 'curls over the crown and the back');
  // …and the human wears them: the face with its tints, the hands mirrored for the right, the hair on the scalp
  const human = read('src/game/bodies/human.js');
  for (const line of ['K.own(head, kin(FACE), skinMat(true));', 'K.own(a.hand, sided(a.side, kin(HAND)), M.skin);', 'const cap = () => K.own(head, kin(CROPPED), M.hair);', 'm.vertexColors = tinted;'])
    assert.ok(human.includes(line), 'human.js lacks: ' + line);
  assert.match(human, /if \(d\.uv\) g\.setAttribute\('uv'/, 'hair has no UVs, and is still made');
});

ok('an octopus arm ends in a point and its roll is turned to its own side: it does not look cut off', () => {
  const o = read('src/game/bodies/octopus.js');
  const tip = /const TIP = \[([\d.]+), ([\d.]+)\], fine = \(x\) => 1 - \(1 - TIP\[1\]\) \* sat\(\(x - 1 \+ TIP\[0\]\) \/ TIP\[0\]\) \*\* 2;/.exec(o);
  assert.ok(tip, 'the taper is where it was');
  const over = Number(tip[1]), to = Number(tip[2]), sat = (x) => Math.min(1, Math.max(0, x)), fine = (x) => 1 - (1 - to) * sat((x - 1 + over) / over) ** 2;
  assert.ok(over >= 0.2 && over <= 0.4 && to <= 0.15, 'over the last few tenths, to a small share');
  // the six it stands on (thick) and the two that hang (slim) both carry it
  const thick = /thick = \(x\) => kt \* \(([\d.]+) \+ ([\d.]+) \* \(1 - x\) \*\* ([\d.]+)\) \* fine\(x\)/.exec(o);
  const slim = /slim = \(u\) => kt \* \(([\d.]+) \+ ([\d.]+) \* \(1 - u\) \*\* ([\d.]+)\) \* fine\(u\)/.exec(o);
  assert.ok(thick && slim);
  for (const m of [thick, slim]) {
    const was = (x) => Number(m[1]) + Number(m[2]) * (1 - x) ** Number(m[3]), r = (x) => was(x) * fine(x);
    assert.ok(was(1) >= 0.005, 'what it ended as: a stump as thick as a finger\'s bone');
    assert.ok(r(1) < 0.0012, 'what it ends as now, in metres: ' + r(1));
    near(r(0.6), was(0.6), 1e-12, 'above the tip it is as thick as it was');
    for (let i = 1; i <= 50; i += 1) assert.ok(r(i / 50) < r((i - 1) / 50), 'it only ever thins');
  }
  // the roll at the floor is turned toward the arm's own side of the body (a body's front is +Z): the two at the
  // front and the two at the back turn outward, the two at the sides stay; none is turned across the body
  const splay = Number(/const SPLAY = ([\d.]+);/.exec(o)[1]); assert.ok(splay >= 0.3 && splay <= 0.8);
  assert.match(o, /sc: Math\.cos\(SPLAY \* Math\.sin\(2 \* a\)\), ss: Math\.sin\(SPLAY \* Math\.sin\(2 \* a\)\)/);
  assert.match(o, /\[dx, dz\] = \[\(dx \* leg\.sc \+ dz \* leg\.ss\) \/ dl, \(dz \* leg\.sc - dx \* leg\.ss\) \/ dl\];/);
  for (let i = 0; i < 6; i += 1) {
    const a = (i + 0.5) * Math.PI / 3, c = Math.cos(splay * Math.sin(2 * a)), s = Math.sin(splay * Math.sin(2 * a));
    const x = Math.sin(a) * c + Math.cos(a) * s, z = Math.cos(a) * c - Math.sin(a) * s;      // an arm that reached straight out, turned as the code turns it
    assert.ok(Math.sign(x) === Math.sign(Math.sin(a)) && Math.abs(x) >= Math.abs(Math.sin(a)) - 1e-12, 'arm ' + i + ' is turned toward its side');
    assert.ok(Math.sign(z) === Math.sign(Math.cos(a)) || Math.abs(Math.cos(a)) < 1e-9, 'arm ' + i + ' still points fore or aft as it did');
    near(Math.hypot(x, z), 1, 1e-12);
  }
});

ok('GAME.md keeps the asks in his own words, and what has been done about each', () => {
  const g = read('GAME.md');
  for (const words of ['full-fledged open-world video game', 'at least 5 different types of spaceships', '5 different types of buildings', '5 is our magic number',
    'one should be mantis/insectoid', "some type of 'force'", 'make up 5 different plasma weapons', 'defy gravity by 2x', 'omnidirectional dash', 'simulate the actual speed of light',
    'an endless void', '1 inch of still water', "don't spend real money", 'get a working product first', 'ancient/natural, current, and futuristic'])
    assert.ok(g.includes(words), 'GAME.md quotes: ' + words);
  assert.match(g, /## Where it stands/); assert.match(g, /## What is next/);
});

// a body walked with the keys held (move: [right, forward], the eye at `yaw`) for `seconds`, in the world's steps
function walk(body, move, yaw, seconds, extra = {}) {
  for (let t = 0; t < seconds; t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move, yaw, pitch: 0, ...extra }, B.STEP); }
  return body;
}

ok('the shelter: four metres across, a dome of rammed earth on a dry-stone ring, a room inside it, a skylight and a doorway', () => {
  const S = SH.SHELTER;
  near(2 * S.out, 4, 1e-9, 'four metres across');
  near(SH.outerR(0), S.out, 1e-9); near(SH.outerR(S.base), S.out, 1e-6, 'the dome meets the stone ring'); near(SH.innerR(S.base), S.in, 1e-6);
  near(SH.outerH(0), S.top, 1e-9); near(SH.innerH(0), S.topIn, 1e-9);
  for (let y = 0; y < S.topIn; y += 0.05) assert.ok(SH.innerR(y) < SH.outerR(y) - 0.15, 'the shell has thickness at ' + y);
  for (let r = 0; r < S.in; r += 0.05) assert.ok(SH.innerH(r) < SH.outerH(r) - 0.15, 'the roof has thickness at ' + r);
  assert.ok(SH.innerH(1.1) > BODY.tall + S.floor + 0.2, 'a body stands up in the middle of it');
  assert.ok(S.door.high > BODY.tall + 0.1 && S.door.half * 2 > 2 * BODY.rad + 0.3, 'a body goes through its doorway');
  const b = { x: 10, z: -4, yaw: 0.7 };
  for (const [lx, lz] of [[0.3, -1.2], [-1.1, 0.4]]) { const [x, z] = SH.toWorld(b, lx, lz), [ax, az] = SH.toLocal(b, x, z); near(ax, lx, 1e-12); near(az, lz, 1e-12); }
});

ok('built where the body stands: in front of it, its door toward it; the key again near it takes it down, and it goes', () => {
  const body = B.createBody({ yaw: 0.4 }), w = createWorld();
  body.p = [3, 0, -2];
  const { did, b } = w.toggle(body);
  assert.equal(did, 'up');
  const [dx, dz] = SH.doorWorld(b), toBody = Math.hypot(dx - body.p[0], dz - body.p[2]), toCentre = Math.hypot(b.x - body.p[0], b.z - body.p[2]);
  near(toCentre, SH.SHELTER.out + 1.6, 1e-9, 'a few steps in front');
  near(toBody, 1.6, 1e-9, 'the door faces the body');
  assert.deepEqual(SH.phase(b), { stones: 0, walls: 0, rest: 0, gone: false });
  w.update(SH.SHELTER.build.base); assert.equal(SH.phase(b).stones, 1); assert.equal(SH.phase(b).walls, 0);
  w.update(SH.SHELTER.build.done); assert.deepEqual(SH.phase(b), { stones: 1, walls: 1, rest: 1, gone: false });
  assert.equal(w.toggle(body).did, 'down');
  w.update(SH.SHELTER.build.down + 0.01); assert.equal(w.buildings.length, 0, 'taken down, it is gone');
  const far = B.createBody({ yaw: 0 }); w.toggle(far); far.p = [500, 0, 500]; w.toggle(far);
  w.update(SH.SHELTER.build.down + 0.01); assert.equal(w.buildings.length, 1, 'one at a time: building the next takes the first down');
});

ok('a body walks into it through the doorway, is stopped by its walls, cannot leave but by the door, and keeps its head under the dome', () => {
  const w = createWorld(), body = B.createBody({ yaw: 0 });
  body.world = w;
  w.toggle(body); w.update(10);
  const b = w.buildings[0];
  // the eye behind the body, looking the way it faces (+Z): yaw π looks along +Z
  walk(body, [0, 1], Math.PI, 2.2);
  assert.ok(w.inside(body.p), 'in through the doorway: ' + body.p.map((v) => v.toFixed(2)));
  near(body.p[1], SH.SHELTER.floor, 1e-9, 'on the dry floor');
  walk(body, [0, 1], Math.PI, 3);
  const [lx, lz] = SH.toLocal(b, body.p[0], body.p[2]);
  assert.ok(w.inside(body.p) && Math.hypot(lx, lz) < SH.SHELTER.in, 'the far wall (and the hearth) stop it: ' + [lx, lz].map((v) => v.toFixed(2)));
  walk(body, [1, 0], Math.PI, 3); assert.ok(w.inside(body.p), 'nor does the side wall let it out');
  walk(body, [0, 0], Math.PI, 0.3, { jumpPressed: true, jump: true });
  let top = 0; for (let t = 0; t < 1.5; t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move: [0, 0], yaw: Math.PI, jump: true }, B.STEP); top = Math.max(top, body.p[1]); }
  assert.ok(top + BODY.tall <= SH.innerH(Math.hypot(...SH.toLocal(b, body.p[0], body.p[2]))) + 1e-6 && top > 0.2, 'a jump inside rises but stops at the dome: ' + top.toFixed(2));
  // out again, the way it came: turn round and walk to the doorway's line
  const [cx, cz] = SH.toWorld(b, 0, -0.1); body.p = [cx, SH.SHELTER.floor, cz]; body.v = [0, 0, 0]; body.grounded = true;
  walk(body, [0, -1], Math.PI, 3);
  assert.ok(!w.inside(body.p) && Math.hypot(...SH.toLocal(b, body.p[0], body.p[2])) > SH.SHELTER.out, 'out through the doorway');
  near(body.p[1], 0, 1e-9, 'down the threshold onto the water');
});

ok('from outside the walls are solid all round: a body walked at them slides along them, and gets in only by the doorway; one that comes down on the dome stands on it', () => {
  const w = createWorld(), b = SH.placeShelter({ p: [0, 0, 0], yaw: 0 }); b.t = 10; w.buildings.push(b);
  for (let a = 0.2; a < 2 * Math.PI - 0.1; a += 0.3) {
    const [sx, sz] = SH.toWorld(b, Math.sin(a) * 4, Math.cos(a) * 4), body = B.createBody({ world: w });
    body.p = [sx, 0, sz];
    const inward = Math.atan2(b.x - sx, b.z - sz);       // the yaw the body walks along; the eye looks along −Z at yaw 0, so it faces the other way
    for (let t = 0; t < 3; t += B.STEP) {
      body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: inward + Math.PI, pitch: 0 }, B.STEP);
      const [lx, lz] = SH.toLocal(b, body.p[0], body.p[2]), r = Math.hypot(lx, lz);
      if (r < SH.SHELTER.out + BODY.rad - 1e-6 && r > SH.SHELTER.in - BODY.rad) assert.ok(lz > 0 && Math.abs(lx) <= SH.SHELTER.door.half, 'in the wall at bearing ' + a.toFixed(1) + ': ' + [lx, lz].map((v) => v.toFixed(2)));
    }
    const away = Math.min(a, 2 * Math.PI - a) > 1.4;
    if (away) assert.ok(Math.hypot(...SH.toLocal(b, body.p[0], body.p[2])) >= SH.SHELTER.out + BODY.rad - 1e-6, 'far from the doorway it stays out, at bearing ' + a.toFixed(1));
  }
  const body = B.createBody({ world: w, grounded: false });
  const [tx, tz] = SH.toWorld(b, 0.2, -0.3); body.p = [tx, 4, tz]; body.v = [0, 0, 0];
  walk(body, [0, 0], 0, 2);
  assert.ok(body.grounded && Math.abs(body.p[1] - SH.outerH(Math.hypot(...SH.toLocal(b, body.p[0], body.p[2])) - BODY.rad * 0.5)) < 1e-6 && body.p[1] > 2.5, 'standing on the dome: ' + body.p[1].toFixed(3));
});

ok('the eye stays out of the walls: a body inside keeps it in the room with it, short of the dome; a body outside keeps it out of the walls, and may look in through the doorway', () => {
  const b = SH.placeShelter({ p: [0, 0, 0], yaw: 0 }); b.t = 10;
  const [hx, hz] = SH.toWorld(b, 0, 0.4), head = [hx, 1.6, hz];
  const [bx, bz] = SH.toWorld(b, 0, -4), behind = [bx, 2.6, bz];
  const t = SH.eyeRoom(b, head, behind), at = head.map((v, i) => v + (behind[i] - v) * t);
  assert.ok(t < 0.5 && !SH.solid(b, at, 0.1), 'kept inside, short of the back wall: ' + t.toFixed(3));
  const [ox, oz] = SH.toWorld(b, 0, 6), out = [ox, 1.5, oz], [ix, iz] = SH.toWorld(b, 0, -0.3), inner = [ix, 1.2, iz];
  const tDoor = SH.eyeRoom(b, inner, out); assert.ok(tDoor < 0.4, 'from inside, not out through the doorway: ' + tDoor.toFixed(3));
  const [sx, sz] = SH.toWorld(b, 4.5, 0), side = [sx, 1.4, sz];
  assert.ok(SH.eyeRoom(b, inner, side) < 0.6, 'nor through the wall');
  const [dx, dz] = SH.toWorld(b, 0, 2.6), atDoor = [dx, 1.5, dz], [fx, fz] = SH.toWorld(b, 0, 8), farOut = [fx, 2.2, fz];
  near(SH.eyeRoom(b, atDoor, farOut), 1, 1e-9, 'outside, nothing in the way');
  const [wx, wz] = SH.toWorld(b, 3.2, 1.0), [ex, ez] = SH.toWorld(b, -3.5, -1.0);
  assert.ok(SH.eyeRoom(b, [wx, 1.5, wz], [ex, 1.8, ez]) < 0.3, 'outside, not through the dome');
});

ok('the sun inside: through the skylight from overhead, through the doorway when it is low in front, and the dome shades the rest', () => {
  const b = SH.placeShelter({ p: [0, 0, 0], yaw: 0 }), at = (lx, y, lz) => { const [x, z] = SH.toWorld(b, lx, lz); return [x, y, z]; };
  const overhead = [0, 1, 0];
  assert.equal(SH.sunIn(b, ...at(0, 0.03, 0), overhead), 1, 'under the skylight, noon');
  assert.equal(SH.sunIn(b, ...at(0.9, 0.03, 0.2), overhead), 0, 'beside it, in the shade');
  const low = (() => { const [x, z] = SH.toWorld(b, 0, 1), d = [x - b.x, 0.25, z - b.z], m = Math.hypot(...d); return d.map((v) => v / m); })();   // low, from the doorway's side
  assert.equal(SH.sunIn(b, ...at(0, 0.03, 0.6), low), 1, 'through the open doorway');
  assert.equal(SH.sunIn(b, ...at(0, 0.03, 0.6), low, 0), 0, 'not through a shut door');
  assert.equal(SH.sunIn(b, ...at(0, 0.03, 0), [0, -1, 0]), 0, 'no sun below the horizon');
  const w = createWorld(); w.buildings.push(b); b.t = 10;
  assert.equal(w.sunAt([50, 0, 50], [0.3, 0.5, 0.8]), 1, 'in the open, the sun');
  assert.equal(w.wet(...at(0, 0, 0).filter((_, i) => i !== 1)), false, 'no water on its floor'); assert.equal(w.wet(40, 40), true);
});

// a body in a house, stepped in the world's steps with the keys held (move: [right, forward]) at the eye's yaw
function houseWalk(body, b, move, yaw, seconds, extra = {}) { walk(body, move, yaw, seconds, extra); const [lx, lz] = HO.toLocal(b, body.p[0], body.p[2]); return { lx, lz, y: body.p[1] }; }
function aHouse() {
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w;
  w.build(body, 'house'); w.update(10);
  return { w, body, b: w.buildings[0] };
}

ok('a body against boxes: a step is stood on, a wall pushes it out the short way, an underside it was below is a ceiling; a ray leaves a box where it should', () => {
  const step = { x0: 0, x1: 1, z0: 0, z1: 1, y0: 0, y1: 0.3 }, wall = { x0: 2, x1: 3, z0: -5, z1: 5, y0: 0, y1: 3 }, lid = { x0: -1, x1: 1, z0: -1, z1: 1, y0: 2, y1: 2.2 };
  near(solveBoxes([step], 0.5, -0.2, 0, 0, 0.3, 1.7, 0.35).floor, 0.3, 1e-12, 'a step under the edge of the body');
  const r = solveBoxes([wall], 1.85, 0, 0, 0, 0.3, 1.7, 0.35); near(r.lx, 1.7, 1e-9, 'out of the wall'); assert.ok(r.hit);
  near(solveBoxes([lid], 0, 0, 0.5, 0.2, 0.3, 1.7, 0.35).ceiling, 2, 1e-12, 'a lid over the head');
  const inside = solveBoxes([wall], 2.6, 0, 0, 0, 0.3, 1.7, 0.35); near(inside.lx, 3.3, 1e-9, 'its middle inside the wall: out by the nearer face');
  near(rayBox(wall, [0, 1, 0], [1, 0, 0]), 2, 1e-12); near(rayBox(wall, [2.5, 1, 0], [1, 0, 0]), 0.5, 1e-12, 'from inside, where it leaves');
  assert.equal(rayBox(wall, [0, 1, 0], [-1, 0, 0]), Infinity);
});

ok('the house: six by nine on its piers, a steep thatched roof (52°) to a ridge 7.3 m up, a porch, a room open to its roof, a loft over its back', () => {
  const P = HO.SOLIDS.find((s) => s.part === 'platform');
  near(P.x1 - P.x0, 6, 1e-9, 'six across'); near(P.z1 - P.z0, 9, 1e-9, 'nine long'); near(P.y1, HO.HOUSE.floor, 1e-9);
  near(HO.TAN, Math.tan((52 * Math.PI) / 180), 1e-12); within(HO.RIDGE, 7.2, 7.4, 'the ridge');
  assert.ok(HO.roofIn(HO.HOUSE.half - HO.HOUSE.wall) > HO.HOUSE.top, 'the thatch rests on the walls');
  const standing = HO.HOUSE.plate - (HO.HOUSE.loft.top + BODY.tall - HO.HOUSE.top) / HO.TAN;
  assert.ok(standing > 1.3, 'a body stands up in the loft, over ' + (2 * standing).toFixed(2) + ' m of it');
  assert.ok(HO.inRoom(0, 1.5, 0) && HO.inRoom(0, 1.5, -3) && HO.inRoom(0, 3.6, -3) && !HO.inRoom(0, 3.06, -3), 'the room, under the loft, in the loft; not the loft\'s floor');
  assert.ok(HO.inPorch(0, 1.5, 3.6) && !HO.inRoom(0, 1.5, 3.6), 'the porch is not the room');
  assert.ok(HO.RAIL < HO.HOUSE.plate && HO.roofIn(HO.RAIL) >= HO.HOUSE.loft.top + 0.85, 'the loft\'s rail ends where the roof meets it');
});

ok('a house goes up in front of the body, its steps toward it; up the steps, across the porch, in at its door; its walls, its table and its stove hold the body; its platform is too high to step onto from the side', () => {
  const { w, body, b } = aHouse();
  const [sx, sz] = HO.toWorld(b, 0, HO.REACH_Z);
  near(Math.hypot(sx - 0, sz - 0), 1.5, 1e-9, 'the outer step a stride and a half in front');
  let q = houseWalk(body, b, [0, 1], Math.PI, 2.2);
  assert.ok(q.lz < HO.HOUSE.porch && q.y === HO.HOUSE.floor && w.inside(body.p)?.kind === 'house', 'up the steps and in: ' + JSON.stringify(q));
  q = houseWalk(body, b, [0, 1], Math.PI, 3);
  near(q.lz, HO.HOUSE.back + HO.HOUSE.wall + BODY.rad, 1e-6, 'the back wall');
  // the table: walked at from beside it
  const [tx, tz] = HO.toWorld(b, 0.4, 0.4); body.p = [tx, HO.HOUSE.floor, tz]; body.v = [0, 0, 0]; body.grounded = true;
  q = houseWalk(body, b, [1, 0], Math.PI, 1.5);                         // the eye looks along +z: its right is the house's +x (the house faces it)
  assert.ok(Math.abs(q.lx - (1.0 - BODY.rad)) < 1e-6, 'the table: ' + JSON.stringify(q));
  // the platform's side: walked at from the water it holds the body out; it does not lift it
  const s2 = B.createBody({ world: w }); const [ox, oz] = HO.toWorld(b, -5, 0); s2.p = [ox, 0, oz];
  walk(s2, [0, 1], Math.atan2(-(b.x - ox), -(b.z - oz)), 2);
  const [lx2] = HO.toLocal(b, s2.p[0], s2.p[2]); near(lx2, -HO.HOUSE.half - BODY.rad, 1e-6, 'held at the platform\'s edge'); near(s2.p[1], 0, 1e-9, 'and not lifted');
});

ok('the ladder: pushed toward it the body climbs onto the loft; it walks there; pushed away at the top it climbs down; let alone it hangs; a jump lets go; the rail keeps it off the loft\'s edge', () => {
  const { w, body, b } = aHouse();
  const [x0, z0] = HO.toWorld(b, HO.HOUSE.ladder.x, -0.6); body.p = [x0, HO.HOUSE.floor, z0]; body.was = [...body.p]; body.v = [0, 0, 0]; body.grounded = true;
  let q = houseWalk(body, b, [0, 1], Math.PI, 0.6);
  assert.ok(body.climbing && q.y > 0.6, 'climbing: ' + JSON.stringify(q));
  const hold = q.y; q = houseWalk(body, b, [0, 0], Math.PI, 0.5); near(q.y, hold, 1e-6, 'let alone it hangs');
  q = houseWalk(body, b, [0, 1], Math.PI, 2.5);
  assert.ok(!body.climbing && body.grounded && Math.abs(q.y - HO.HOUSE.loft.top) < 1e-9 && q.lz < HO.HOUSE.loft.z, 'on the loft: ' + JSON.stringify(q));
  q = houseWalk(body, b, [1, 0], Math.PI, 1.0); q = houseWalk(body, b, [0, -1], Math.PI, 1.0);       // along the loft, away from the ladder's gap; then back to its edge
  near(q.lz, HO.HOUSE.loft.z - 0.06 - BODY.rad, 1e-6, 'the rail holds it at the edge'); near(q.y, HO.HOUSE.loft.top, 1e-9, 'it did not fall');
  // back to the ladder's gap and down
  const [x1, z1] = HO.toWorld(b, HO.HOUSE.ladder.x, -2.4); body.p = [x1, HO.HOUSE.loft.top, z1]; body.was = [...body.p]; body.v = [0, 0, 0]; body.grounded = true;
  q = houseWalk(body, b, [0, -1], Math.PI, 3.5);
  assert.ok(!body.climbing && body.grounded && Math.abs(q.y - HO.HOUSE.floor) < 1e-9, 'down again: ' + JSON.stringify(q));
  // a jump lets go part way up
  const [x2, z2] = HO.toWorld(b, HO.HOUSE.ladder.x, -0.6); body.p = [x2, HO.HOUSE.floor, z2]; body.was = [...body.p]; body.grounded = true;
  houseWalk(body, b, [0, 1], Math.PI, 0.9); assert.ok(body.climbing);
  houseWalk(body, b, [0, 0], Math.PI, B.STEP, { jumpPressed: true, jump: true }); assert.ok(!body.climbing, 'let go');
  q = houseWalk(body, b, [0, 0], Math.PI, 1.5); assert.ok(body.grounded && Math.abs(q.y - HO.HOUSE.floor) < 1e-9, 'it falls to the floor');
});

ok('in the loft the roof keeps a head under it: walked toward the eaves a body is held where its head meets the thatch; the room\'s floor under the loft has a ceiling', () => {
  const { body, b } = aHouse();
  const [x0, z0] = HO.toWorld(b, 0.0, -3.0); body.p = [x0, HO.HOUSE.loft.top, z0]; body.was = [...body.p]; body.grounded = true;
  const q = houseWalk(body, b, [1, 0], Math.PI, 2);                    // toward the eaves on the house's +x
  const head = HO.HOUSE.loft.top + BODY.tall, lim = HO.HOUSE.plate - (head - HO.HOUSE.top) / HO.TAN - BODY.rad;
  assert.ok(Math.abs(Math.abs(q.lx) - lim) < 1e-6 || Math.abs(q.lx) < lim + 1e-6, 'held at ' + q.lx.toFixed(3) + ', its limit ' + lim.toFixed(3));
  assert.ok(HO.roofIn(Math.abs(q.lx) + BODY.rad) >= head - 1e-6, 'its head under the thatch');
  const under = B.createBody({ world: body.world }), [ux, uz] = HO.toWorld(b, 0, -3); under.p = [ux, HO.HOUSE.floor, uz]; under.was = [...under.p];
  let top = 0; walk(under, [0, 0], Math.PI, 0.05, { jumpPressed: true, jump: true });
  for (let t = 0; t < 1.5; t += B.STEP) { under.was = [...under.p]; B.stepBody(under, { move: [0, 0], yaw: Math.PI, jump: true }, B.STEP); top = Math.max(top, under.p[1]); }
  near(top + BODY.tall, HO.HOUSE.loft.under, 1e-6, 'a jump under the loft stops at its floor');
});

ok('the house to the eye: a body in its room (or loft) keeps the eye in the room; outside, the eye stays out of its walls and roof; the sun gets in by the round window and by the doorway under the porch', () => {
  const b = { kind: 'house', x: 0, z: 0, yaw: 0, t: 10, down: -1 }, at = (lx, y, lz) => { const [x, z] = HO.toWorld(b, lx, lz); return [x, y, z]; };
  const head = at(0, 2.2, -0.5), back = at(0, 3.5, 6), t = HO.eyeRoom(b, head, back), q = head.map((v, i) => v + (back[i] - v) * t);
  assert.ok(t < 1 && HO.inRoom(...(() => { const [lx, lz] = HO.toLocal(b, q[0], q[2]); return [lx, q[1], lz]; })(), 0.1), 'kept in the room: ' + t.toFixed(3));
  const loftHead = at(-1, 4.8, -3), behind = at(-1, 5.4, 2), tl = HO.eyeRoom(b, loftHead, behind);
  assert.ok(tl > 0.6, 'from the loft it may stand in the room\'s air behind: ' + tl.toFixed(3));
  const out1 = at(0, 2, 8), out2 = at(0, 2.5, 14); near(HO.eyeRoom(b, out1, out2), 1, 1e-9, 'outside, in front: nothing in the way');
  const side = at(6, 1.8, 0), across = at(-6, 2.2, 0); assert.ok(HO.eyeRoom(b, side, across) < 0.4, 'not through the walls');
  const roofTop = at(0, 9, 0), down = at(0, 2, 0); assert.ok(HO.eyeRoom(b, roofTop, down) < 0.3, 'not down through the thatch');
  const unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
  assert.equal(HO.sunLocal(1.4, 1.7, HO.HOUSE.window.z, unit([1, 0.25, 0])), 1, 'by the round window');
  assert.equal(HO.sunLocal(-1.4, 1.7, HO.HOUSE.window.z, unit([-1, 0.25, 0])), 0, 'the left wall has none');
  assert.equal(HO.sunLocal(0, 0.6, 1.0, unit([0, 0.3, 1])), 1, 'by the doorway, a low sun in front');
  assert.equal(HO.sunLocal(0, 0.6, 1.0, unit([0, 1.2, 1])), 0, 'a high one is caught by the porch\'s ceiling');
  assert.equal(HO.sunLocal(0, 0.6, 1.0, unit([0, 0.3, 1]), 0), 0, 'not through a shut door');
  assert.equal(HO.sunLocal(0.5, 0.6, -3.5, unit([1, 0.3, 0])), 0, 'under the loft, its floor and the walls shade it');
});

ok('one of each kind stands, and never one on another: a second house takes the first down; a house that would stand on the shelter is not built; the key near either takes that one down', () => {
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w;
  assert.equal(w.build(body, 'shelter').did, 'up'); w.update(10);
  const blocked = w.build(body, 'house'); assert.equal(blocked.did, 'blocked'); assert.equal(blocked.b.kind, 'shelter');
  body.p = [30, 0, 0]; assert.equal(w.build(body, 'house').did, 'up'); w.update(10);
  assert.deepEqual(w.standing().map((b) => b.kind).sort(), ['house', 'shelter'], 'both stand');
  body.p = [80, 0, 0]; w.build(body, 'house'); w.update(HO.HOUSE.build.down + 0.1);
  assert.equal(w.buildings.filter((b) => b.kind === 'house').length, 1, 'a second house took the first down');
  const h = w.buildings.find((b) => b.kind === 'house'), [dx, dz] = HO.doorWorld(h);
  assert.ok(w.wet(500, 500) && !w.wet(...HO.toWorld(h, 0, 4.9)), 'its steps are dry while it stands, the open water wet');
  body.p = [dx, 0, dz];
  assert.equal(w.toggle(body, 'shelter').did, 'down', 'the key at its door takes it down');
  assert.deepEqual(BUILDINGS.map((x) => x.kind), ['shelter', 'house', 'workshop', 'tower', 'hall']);
  assert.deepEqual(BUILDINGS.filter((x) => x.ready).map((x) => x.kind), Object.keys(KINDS), 'what is offered is what is made');
});

ok('the build key is an action like the others: two keys, a pad button, in the controls; the world is wired to the body, the eye, the light and the water', () => {
  const b = I.defaults();
  assert.deepEqual(b.keys.build, ['KeyB', '']); assert.equal(b.pad.build, 2);
  assert.ok(I.ACTIONS.find((a) => a.id === 'build')?.note);
  const view = read('src/game/view.js');
  for (const line of ['kept.body.world = kept.world;', 'K.world.update(dt)', 'K.world.shift(far[0], far[1])', 'K.world.eye(', 'K.world.wet(', 'V.setIndoor(K.indoor)', 'figure.group.visible = !eye.hide;', "id=\"game-build-list\"", 'said(K.world.toggle(K.body, st.building))', "(b.kind === 'house' ? createHouseArt : createShelterArt)"]) assert.ok(view.includes(line), 'view.js lacks ' + line);
  assert.ok(read('src/game/buildings/house.js').includes("from '../house.js'"), 'the house drawn is not the numbers\' house');
  assert.ok(read('src/game/buildings/shelter.js').includes("from '../shelter.js'"), 'the drawing is not the numbers\' shelter');
});

console.log(`\n${passed} checks passed.`);
