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
import * as WO from '../src/game/workshop.js';
import * as TO from '../src/game/tower.js';
import * as HA from '../src/game/hall.js';
import * as SP from '../src/game/ships.js';
import { solveBoxes, rayBox } from '../src/game/solids.js';
import * as CB from '../src/game/combat.js';
import * as GR from '../src/game/island/ground.js';
import { SHAPE } from '../src/game/island/lordhowe-shape.js';
import * as LF from '../src/game/island/life.js';
import { inflateSync } from 'node:zlib';

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
  assert.deepEqual(b.keys.jump, ['Space', 'KeyQ']); assert.deepEqual(b.keys.dash, ['', ''], 'Q was the dash\'s (its second key went to the guard, 17 Nov)');
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

ok('a press on the canvas gives it the keys and holds the pointer; then the left button casts the ring and the right one guards; a held pointer looks', () => {
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
  assert.equal(e.defaultPrevented, true); const g = inp.frame(); assert.ok(g.guard && g.guardPressed);
  win.fire('mouseup', { button: 2 });
  el.fire('mousedown', { button: 0 }); const a = inp.frame(); assert.ok(a.attack && a.attackPressed, 'with the pointer held, the left button casts');
  win.fire('mouseup', { button: 0 });
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
  assert.ok(read('src/game/view.js').includes('const shades = [{ x: pos[0], z: pos[2], y: pos[1], k: figure.shade }];'), 'the body\'s shade first (the nearest bots\' after it)');
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
  assert.deepEqual(S.loadState(st), { mode: 'survival', light: 'pale', zoom: 5.5, kind: 'human', looks: K.cleanLooks(null), building: 'shelter', level: 1, place: 'void' });
  const looks = K.cleanLooks(null); looks.octopus.skin = 'ink'; looks.human.hair = 'braid';
  S.saveState(st, { mode: 'creative', light: 'night', zoom: 7.123456, kind: 'octopus', looks, building: 'house', level: 3, place: 'island' });
  assert.deepEqual(S.loadState(st), { mode: 'creative', light: 'night', zoom: 7.12, kind: 'octopus', looks, building: 'house', level: 3, place: 'island' });
  assert.equal(S.loadState(store({ [S.STATE_KEY]: '{"place":"mars"}' })).place, 'void', 'a place not on the map is the void');
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

// ---- the workshop (workshop.js): ten by twelve, three brick vaults, a wall of glass
// a body in a workshop, stepped in the world's steps with the keys held (move: [right, forward]) at the eye's yaw
function shopWalk(body, b, move, yaw, seconds, extra = {}) { walk(body, move, yaw, seconds, extra); const [lx, lz] = WO.toLocal(b, body.p[0], body.p[2]); return { lx, lz, y: body.p[1] }; }
function aWorkshop() {
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w;
  w.build(body, 'workshop'); w.update(10);
  return { w, body, b: w.buildings[0] };
}
const shopAt = (body, b, lx, lz, y = WO.WORKSHOP.floor) => { const [x, z] = WO.toWorld(b, lx, lz); body.p = [x, y, z]; body.was = [...body.p]; body.v = [0, 0, 0]; body.grounded = true; };

ok('the workshop: ten by twelve of half-metre adobe; three brick barrel vaults springing 3.4 m over its floor to crowns 4.9 m over it; a wall of glass six metres of which slide open; a chimney to 10.8 m', () => {
  const W = WO.WORKSHOP, walls = WO.SOLIDS.filter((s) => s.part === 'wall');
  near(Math.max(...walls.map((s) => s.x1)) - Math.min(...walls.map((s) => s.x0)), 10, 1e-9, 'ten across');
  near(Math.max(...walls.map((s) => s.z1)) - Math.min(...walls.map((s) => s.z0)), 12, 1e-9, 'twelve long');
  near(W.wall, 0.5, 1e-9, 'thick walls'); near(WO.IN, 4.5, 1e-9);
  near(W.spring - W.floor, 3.4, 1e-9, 'where they spring'); near(WO.CROWN - W.floor, 4.9, 1e-9, 'their crowns');
  near(WO.vaultIn(-3), WO.CROWN, 1e-9); near(WO.vaultIn(0), WO.CROWN, 1e-9); near(WO.vaultIn(3), WO.CROWN, 1e-9);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) near(WO.vaultIn(x), W.spring, 1e-9, 'springing at ' + x);
  near(WO.vaultOut(1.5), W.spring + 0.8, 1e-9, 'the valleys between them');
  assert.ok(WO.WALLTOP >= WO.vaultOut(WO.IN), 'the side walls rise over the outer vaults\' haunches');
  near(6 * W.glass.panel, 2 * WO.IN, 1e-9, 'six panels fill the wall'); near(2 * W.glass.open, 6, 1e-9, 'six metres open');
  assert.ok(W.chimney.top - WO.vaultOut(W.kiln.x) > 5, 'the chimney stands five metres over the roof');
  for (const part of ['bench', 'kiln', 'rack', 'stool']) assert.ok(WO.SOLIDS.some((s) => s.part === part), part);
});

ok('a workshop goes up in front of the body, its glass toward it; up its steps and in at the opening; its walls, the glass beside the opening, the bench, the kiln, the racks and the columns hold the body', () => {
  const { w, body, b } = aWorkshop(), W = WO.WORKSHOP;
  const [sx, sz] = WO.toWorld(b, 0, WO.REACH_Z);
  assert.ok(Math.hypot(sx - body.p[0], sz - body.p[2]) > 1 && Math.hypot(sx - body.p[0], sz - body.p[2]) < 2, 'its steps a stride or so away');
  let q = shopWalk(body, b, [0, 1], Math.PI, 6);
  assert.ok(w.inside(body.p)?.kind === 'workshop', 'up the steps and in: ' + JSON.stringify(q));
  near(q.y, W.floor, 1e-9, 'on its floor'); near(q.lz, -4.85 + BODY.rad, 1e-6, 'the back rack');
  shopAt(body, b, 0, 4); q = shopWalk(body, b, [1, 0], Math.PI, 3); near(q.lx, WO.IN - BODY.rad, 1e-6, 'the right wall');
  shopAt(body, b, 0, 0); q = shopWalk(body, b, [1, 0], Math.PI, 3); near(q.lx, 3.85 - BODY.rad, 1e-6, 'the right rack');
  shopAt(body, b, 3.75, 4); q = shopWalk(body, b, [0, -1], Math.PI, 2); near(q.lz, W.glass.z - 0.1 - BODY.rad, 1e-6, 'the glass beside the opening');
  shopAt(body, b, 0, 4); q = shopWalk(body, b, [0, -1], Math.PI, 2); assert.ok(q.lz > W.front && !w.inside(body.p), 'out through the opening: ' + JSON.stringify(q));
  shopAt(body, b, -2, 0); q = shopWalk(body, b, [-1, 0], Math.PI, 3); near(q.lx, W.bench.x1 + BODY.rad, 1e-6, 'the bench');
  shopAt(body, b, 3, -1); q = shopWalk(body, b, [0, 1], Math.PI, 3); near(q.lz, W.kiln.z + W.kiln.r + BODY.rad, 1e-6, 'the kiln');
  shopAt(body, b, 0, -2); q = shopWalk(body, b, [1, 0], Math.PI, 2); near(q.lx, 1.5 - W.column - BODY.rad, 1e-6, 'a column');
  // outside: the side wall holds a body on the ground and does not lift it; the plinth's front is two steps up
  const s2 = B.createBody({ world: w }); const [ox, oz] = WO.toWorld(b, -7, 0); s2.p = [ox, 0, oz];
  walk(s2, [1, 0], Math.PI, 2);
  near(WO.toLocal(b, s2.p[0], s2.p[2])[0], -W.half - BODY.rad, 1e-6, 'held at the wall'); near(s2.p[1], 0, 1e-9, 'and not lifted');
  assert.ok(w.wall(WO.toWorld(b, -W.half - BODY.rad - 0.05, 0).flatMap((v, i) => (i === 0 ? [v, 0] : [v])))?.d < 0.5, 'its adobe is a wall to run along');
});

ok('inside, the vaults keep a jump under them and a beam stops one under it; from above, a body stands on the vaults, down into the valleys between them, and the chimney is in its way', () => {
  const { body, b } = aWorkshop(), W = WO.WORKSHOP;
  const peak = (lx, lz) => {
    shopAt(body, b, lx, lz); let top = 0; walk(body, [0, 0], Math.PI, 0.05, { jumpPressed: true, jump: true });
    for (let t = 0; t < 2.5; t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move: [0, 0], yaw: Math.PI, jump: true }, B.STEP); top = Math.max(top, body.p[1]); }
    return top + BODY.tall;
  };
  const free = peak(0, 0.8);
  assert.ok(free <= WO.underVault(0, BODY.rad) + 1e-6, 'a jump keeps under the middle vault: ' + free.toFixed(3));
  near(peak(1.5, 0.8), W.spring - W.beam.deep, 1e-6, 'under a beam a jump stops at it');
  // on the roof: dropped onto the middle vault's crown it stands on it; walked across, down into the valley, up the next
  shopAt(body, b, 0, 0, 7); body.grounded = false;
  let q = shopWalk(body, b, [0, 0], Math.PI, 1.2);
  near(q.y, WO.roofTop(q.lx, BODY.rad * 0.5), 1e-6, 'on the crown');
  q = shopWalk(body, b, [1, 0], Math.PI, 0.35);
  assert.ok(q.y < WO.CROWN + W.shell - 0.05 && q.y >= WO.vaultOut(1.5) - 1e-6, 'down toward the valley: ' + q.y.toFixed(3));
  shopAt(body, b, W.kiln.x, 0, WO.vaultOut(W.kiln.x));
  q = shopWalk(body, b, [0, 1], Math.PI, 4);
  near(q.lz, W.kiln.z + W.chimney.r + BODY.rad, 1e-6, 'the chimney in its way'); assert.ok(q.y > W.spring, 'still up there');
});

ok('the workshop to the eye and the sun: the eye stays out of its walls, vaults and glass, inside and out, and may look out through the opening; the sun gets in only through the glass and its half-rounds, past the header and the beams', () => {
  const b = { kind: 'workshop', x: 0, z: 0, yaw: 0, t: 10, down: -1 }, at = (lx, y, lz) => { const [x, z] = WO.toWorld(b, lx, lz); return [x, y, z]; };
  const head = at(0, 2.2, -3), back = at(0, 3.5, -9), t = WO.eyeRoom(b, head, back), q = head.map((v, i) => v + (back[i] - v) * t);
  assert.ok(t < 1 && WO.inRoom(...(() => { const [lx, lz] = WO.toLocal(b, q[0], q[2]); return [lx, q[1], lz]; })(), 0.1), 'kept in the room: ' + t.toFixed(3));
  near(WO.eyeRoom(b, at(0, 2.2, 3), at(0, 2.5, 9)), 1, 1e-9, 'from inside, out through the opening: nothing in the way');
  near(WO.eyeRoom(b, at(0, 2, 10), at(0, 2.5, 16)), 1, 1e-9, 'outside, in front: nothing in the way');
  assert.ok(WO.eyeRoom(b, at(7, 2, 0), at(-7, 2.2, 0)) < 0.25, 'not through the walls');
  assert.ok(WO.eyeRoom(b, at(0, 9, 0), at(0, 2, 0)) < 0.6, 'not down through a vault');
  assert.ok(WO.eyeRoom(b, at(3.75, 2, 9), at(3.75, 2, 0)) < 0.5, 'not through the glass beside the opening');
  const unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
  assert.equal(WO.sunLocal(0, 1, 0, unit([0, 0.3, 1])), 1, 'a low sun in front, through the glass');
  assert.equal(WO.sunLocal(0, 1, 0, unit([0, 0.6, 1])), 1, 'a higher one through a half-round');
  assert.equal(WO.sunLocal(0, 1, 0, unit([0, 0.5, 1])), 0, 'the header between them');
  assert.equal(WO.sunLocal(0, 1, 0, unit([1, 0.3, 0])), 0, 'the side walls have none');
  assert.equal(WO.sunLocal(0, 1, 0, unit([0, 0.3, -1])), 0, 'nor the back');
  assert.equal(WO.sunLocal(0, 1, 0, [0, 1, 0]), 0, 'nor the vaults');
  assert.equal(WO.sunLocal(0.75, 1, 0, unit([0, 1, 1.5])), 1, 'beside a beam, lit');
  assert.equal(WO.sunLocal(1.5, 1, 0, unit([0, 1, 1.5])), 0, 'under it, its shade');
  const w = createWorld(); w.buildings.push(b);
  assert.equal(w.sunAt(at(0, 1, 0), unit([0, 0.3, 1])), 1, 'the world asks the workshop: here, from in front (its +z is the world\'s +z)');
  assert.equal(w.sunAt(at(0, 1, 0), unit([0, 0.3, -1])), 0, 'and from behind, its shade');
});

ok('the workshop goes up in seven and a half seconds, the plinth, the walls, the vaults one after another, the glass and the chimney, the things; taken down it goes the same way backward; its glass slides open as a body comes', () => {
  const W = WO.WORKSHOP, b = { kind: 'workshop', x: 0, z: 0, yaw: 0, t: 0.5, down: -1 };
  let p = WO.phase(b); near(p.base, 0.5, 1e-9); assert.equal(p.walls, 0);
  b.t = 4.2; p = WO.phase(b); assert.ok(p.walls === 1 && p.vaults > 0.4 && p.vaults < 0.6 && p.glass === 0);
  b.t = W.build.done; p = WO.phase(b); assert.equal(p.rest, 1);
  b.down = W.build.down / 2; p = WO.phase(b); assert.ok(p.rest === 0 && p.walls === 1 && p.vaults > 0 && p.vaults < 1, 'half down: ' + JSON.stringify(p));
  b.down = W.build.down; assert.equal(WO.phase(b).gone, true);
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w; w.build(body, 'workshop'); w.update(10);
  w.toggle(body, 'workshop'); w.update(W.build.down + 0.01); assert.equal(w.buildings.length, 0, 'the key near it took it down');
  const s = { x: 0, z: 0, yaw: 0 }, at = (lx, lz) => { const [x, z] = WO.toWorld(s, lx, lz); return [x, 0, z]; };
  assert.ok(WO.opens(s, at(0, 9)) && WO.opens(s, at(3.5, 7)) && WO.opens(s, at(-2, -5)), 'near the opening, or inside');
  assert.ok(!WO.opens(s, at(0, 10.5)) && !WO.opens(s, at(-7, 0)), 'not from further off, nor beside it');
});

// ---- the tower (tower.js): six metres across, a stair round its wall to a gallery under a glass dome
function aTower() {
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w;
  w.build(body, 'tower'); w.update(20);
  return { w, body, b: w.buildings[0] };
}
const towerAt = (body, b) => { const [lx, lz] = TO.toLocal(b, body.p[0], body.p[2]); return { lx, lz, r: Math.hypot(lx, lz), th: Math.atan2(lz, lx), y: body.p[1] }; };
// walk toward a point in the tower's frame (steering the eye at it each step), for up to `seconds`
function towerTo(body, b, lx, lz, seconds) {
  for (let t = 0; t < seconds; t += B.STEP) {
    const [x, z] = TO.toWorld(b, lx, lz), dx = x - body.p[0], dz = z - body.p[2];
    if (Math.hypot(dx, dz) < 0.15) break;
    body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: Math.atan2(-dx, -dz), pitch: 0 }, B.STEP);
  }
  return towerAt(body, b);
}
// climb: each step aim a little ahead along the stair (clockwise seen from above) by the wall, until `until` says stop
function towerClimb(body, b, seconds, until = () => false) {
  let t = 0, low = Infinity;
  for (; t < seconds; t += B.STEP) {
    const q = towerAt(body, b); if (until(q)) break;
    const a = q.th - 0.25, [x, z] = TO.toWorld(b, 1.95 * Math.cos(a), 1.95 * Math.sin(a));
    const before = body.p[1]; body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: Math.atan2(-(x - body.p[0]), -(z - body.p[2])), pitch: 0 }, B.STEP);
    low = Math.min(low, body.p[1] - before);
  }
  return { t, low, q: towerAt(body, b) };
}

ok('the tower: six metres across of half-metre limestone; a hundred steps in two and a half turns up its wall to a gallery 20 m up; two landings a turn apart, on the same side; a glass dome to about 24 m', () => {
  const T = TO.TOWER;
  near(2 * T.ro, 6, 1e-9, 'six across'); near(T.ro - T.ri, 0.5, 1e-9);
  near(TO.TOP - T.floor, T.stair.steps * T.stair.rise, 1e-9); near(TO.TOP, 20.3, 1e-9, 'the gallery');
  near(T.stair.steps / T.stair.perTurn, 2.5, 1e-9, 'two and a half turns');
  within(TO.CROWN, 23.5, 24.5, 'about twenty-four tall');
  const [l1, l2] = TO.LANDINGS;
  near(l2.top - l1.top, T.stair.perTurn * T.stair.rise, 1e-9, 'a turn apart'); near(l1.dir[0], l2.dir[0], 1e-9); near(l1.dir[1], l2.dir[1], 1e-9, 'on the same side');
  near(TO.rampAt(l1.step - 0.5), l1.top, 1e-9, 'the stair is level with each landing at its step');
  near(TO.treadAt(0), T.floor + T.stair.rise, 1e-9, 'the first tread a step up');
  assert.ok(TO.turnsAt(Math.PI / 2).every((t) => t.s > T.door.high + 2), 'the stair passes over the door high up');
  assert.ok(TO.SLITS.length >= 15, 'narrow windows spiral up it: ' + TO.SLITS.length);
});

ok('a tower goes up in front of the body, its door toward it; in at the door; up the stair along the wall, held on it by its rail, to the gallery in a few seconds without a fall; and down again', () => {
  const { w, body, b } = aTower(), T = TO.TOWER;
  const [dx, dz] = TO.doorWorld(b); assert.ok(Math.hypot(dx - body.p[0], dz - body.p[2]) < 2.5, 'its door near the body');
  let q = towerTo(body, b, 0, 0, 4);
  assert.ok(w.inside(body.p)?.kind === 'tower' && q.r < 0.2, 'in at the door: ' + JSON.stringify(q)); near(q.y, T.floor, 1e-9, 'on its floor');
  const a0 = T.stair.start + 0.15; towerTo(body, b, 1.95 * Math.cos(a0), 1.95 * Math.sin(a0), 3);
  const up = towerClimb(body, b, 20, (q) => q.y >= TO.TOP - 1e-6);
  near(up.q.y, TO.TOP, 1e-9, 'up to the gallery'); assert.ok(up.t < 8, 'in ' + up.t.toFixed(2) + ' s'); assert.ok(up.low > -0.05, 'never a fall: ' + up.low.toFixed(3));
  within(up.q.r, TO.TOWER.well + BODY.rad - 1e-6, TO.TOWER.ri - BODY.rad + 1e-6, 'kept on the stair, between its rail and the wall');
  // down: aim behind instead, anticlockwise
  let t = 0;
  for (; t < 20 && body.p[1] > T.floor + 1e-6; t += B.STEP) {
    const c = towerAt(body, b), a = c.th + 0.25, [x, z] = TO.toWorld(b, 1.95 * Math.cos(a), 1.95 * Math.sin(a));
    body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: Math.atan2(-(x - body.p[0]), -(z - body.p[2])), pitch: 0 }, B.STEP);
  }
  near(body.p[1], T.floor, 1e-9, 'down to the floor again in ' + t.toFixed(2) + ' s');
});

ok('beside each landing the stair\'s rail opens and a body steps onto it; the landings\' rails hold it there; under the stair\'s low first steps a body is kept out in the well; flying up under a landing, the head meets it', () => {
  const { w, body, b } = aTower(), T = TO.TOWER, [L1] = TO.LANDINGS;
  towerTo(body, b, 0, 0, 4); const a0 = T.stair.start + 0.15; towerTo(body, b, 1.95 * Math.cos(a0), 1.95 * Math.sin(a0), 3);
  towerClimb(body, b, 20, (q) => q.y >= L1.top - 0.05);
  let q = towerTo(body, b, 0.45, 0.6, 3); walk(body, [0, 0], 0, 0.6); q = towerAt(body, b);
  near(q.y, L1.top, 1e-9, 'on the landing'); assert.ok(Math.hypot(q.lx, q.lz) < T.well, 'off the stair');
  q = towerTo(body, b, -L1.dir[0], -L1.dir[1], 2);
  near(q.lx * L1.dir[0] + q.lz * L1.dir[1], BODY.rad, 0.005, 'the rail along its open edge'); near(q.y, L1.top, 1e-9);
  q = towerTo(body, b, 2.2 * Math.cos(L1.th - 0.9), 2.2 * Math.sin(L1.th - 0.9), 2);
  near(q.r, T.well - BODY.rad, 1e-6, 'its curved edge has a rail too, away from the stair\'s gap'); near(q.y, L1.top, 1e-9);
  // on the floor under the stair's first steps, walking toward the wall: kept out in the well
  const s2 = B.createBody({ world: w }), a = T.stair.start - 0.5, [x, z] = TO.toWorld(b, 0.6 * Math.cos(a), 0.6 * Math.sin(a)); s2.p = [x, T.floor, z];
  for (let t = 0; t < 2; t += B.STEP) { const [tx, tz] = TO.toWorld(b, 2.4 * Math.cos(a), 2.4 * Math.sin(a)); s2.was = [...s2.p]; B.stepBody(s2, { move: [0, 1], yaw: Math.atan2(-(tx - s2.p[0]), -(tz - s2.p[2])), pitch: 0 }, B.STEP); }
  const q2 = towerAt(s2, b); assert.ok(q2.r <= T.well - BODY.rad + 1e-6 && q2.y === T.floor, 'kept off: ' + JSON.stringify(q2));
  // flying up the well under the first landing, the head meets its underside
  const s3 = B.createBody({ world: w }), [ux, uz] = TO.toWorld(b, 0.4 * L1.dir[0], 0.4 * L1.dir[1]); s3.p = [ux, T.floor, uz]; s3.was = [...s3.p];
  s3.mode = 'creative'; s3.flying = true; s3.grounded = false;
  for (let t = 0; t < 4; t += B.STEP) { s3.was = [...s3.p]; B.stepBody(s3, { move: [0, 0], yaw: 0, pitch: 0, up: true }, B.STEP); }
  near(s3.p[1] + BODY.tall, L1.top - 0.15, 1e-6, 'flying up under the landing, the head meets it');
});

ok('from the gallery, round to its door and out onto the ledge; its side rails hold; off its front a body falls', () => {
  const { w, body, b } = aTower(), T = TO.TOWER;
  towerTo(body, b, 0, 0, 4); const a0 = T.stair.start + 0.15; towerTo(body, b, 1.95 * Math.cos(a0), 1.95 * Math.sin(a0), 3);
  towerClimb(body, b, 20, (q) => q.y >= TO.TOP - 1e-6);
  let q;
  for (const a of [-2.4, -2.9, -3.4, -3.9, -4.4]) q = towerTo(body, b, 1.9 * Math.cos(a), 1.9 * Math.sin(a), 2);
  near(q.y, TO.TOP, 1e-9, 'round the gallery, clockwise, past the stair\'s top');
  q = towerTo(body, b, 0, 1.9, 2); q = towerTo(body, b, 0, 3.8, 3);
  assert.ok(q.lz > T.ro + 0.3 && !w.inside(body.p), 'out through its door onto the ledge: ' + JSON.stringify(q)); near(q.y, TO.TOP, 1e-9);
  q = towerTo(body, b, 3, 3.8, 1.5); near(q.lx, T.ledge.half - BODY.rad, 1e-6, 'its side rail');
  q = towerTo(body, b, 0, 9, 2.5); assert.ok(q.y < TO.TOP - 1 && q.lz > T.ledge.out, 'off its front it falls: ' + q.y.toFixed(2));
});

ok('the tower to the eye and the sun: the eye kept inside with a body inside, out of its stone, its stair and its landings, free up the open well; the sun through a narrow window, down through the dome, by the door, not through the wall; a landing shades what is under it', () => {
  const b = { kind: 'tower', x: 0, z: 0, yaw: 0, t: 20, down: -1 }, at = (lx, y, lz) => { const [x, z] = TO.toWorld(b, lx, lz); return [x, y, z]; };
  const [L1] = TO.LANDINGS, unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
  assert.ok(TO.eyeRoom(b, at(0, 2, 0), at(6, 2, 0.4)) < 0.45, 'not out through the wall');
  near(TO.eyeRoom(b, at(0, 2, -0.8), at(0, 15, -0.8)), 1, 1e-9, 'up the open half of the well');
  assert.ok(TO.eyeRoom(b, at(0.3, 2, 0.6), at(0.3, 12, 0.6)) < 0.62, 'not through a landing');
  assert.ok(TO.eyeRoom(b, at(0, 1.5, 1), at(0, 2, 8)) < 0.25, 'from inside, kept inside (its door is narrow)');
  near(TO.eyeRoom(b, at(0, 1.5, 6), at(0, 2, 12)), 1, 1e-9, 'outside, in front of the door: nothing in the way');
  const w = TO.SLITS[3], dir = [Math.cos(w.th), Math.sin(w.th)];
  assert.equal(TO.sunLocal(dir[0], w.y, dir[1], unit([dir[0], 0.05, dir[1]])), 1, 'through a narrow window');
  const off = w.th + 0.4; assert.equal(TO.sunLocal(dir[0], w.y, dir[1], unit([Math.cos(off), 0.05, Math.sin(off)])), 0, 'not through the wall beside it');
  const g = 2.5; assert.equal(TO.sunLocal(1.9 * Math.cos(g), TO.TOP + 0.05, 1.9 * Math.sin(g), [0, 1, 0]), 1, 'down through the dome onto the gallery');
  assert.equal(TO.sunLocal(0, 0.4, -0.8, [0, 1, 0]), 1, 'down the open half of the well to the floor, when the sun is high');
  assert.equal(TO.sunLocal(0.3, 0.4, 0.6, [0, 1, 0]), 0, 'under a landing, its shade');
  assert.ok(L1.dir[0] * 0.3 + L1.dir[1] * 0.6 > 0);
  assert.equal(TO.sunLocal(0, 1, 1, unit([0, 0.2, 1]), 1), 1, 'in at the open door'); assert.equal(TO.sunLocal(0, 1, 1, unit([0, 0.2, 1]), 0), 0, 'not at a shut one');
});

ok('the tower goes up in about eight seconds, the shaft and its stair, the floors, the dome, the things; comes down backward; its round wall is a wall to run along, outside and in', () => {
  const T = TO.TOWER, b = { kind: 'tower', x: 0, z: 0, yaw: 0.7, t: 3, down: -1 };
  let p = TO.phase(b); assert.ok(p.base === 1 && p.walls > 0.5 && p.walls < 0.7 && p.floors === 0);
  b.t = T.build.done; assert.equal(TO.phase(b).rest, 1);
  b.down = T.build.down / 4; p = TO.phase(b); assert.ok(p.rest === 0 && p.walls === 1 && p.floors === 1 && p.dome > 0 && p.dome < 1, 'a quarter down, the things gone first: ' + JSON.stringify(p));
  b.down = -1;
  const out = TO.toWorld(b, 0, -(T.ro + 0.3)), r1 = TO.wall(b, [out[0], 0, out[1]]);
  assert.ok(r1 && Math.abs(r1.d - 0.3) < 1e-9, 'outside, by its back');
  const back = TO.toWorld(b, 0, -1), n = [back[0] - b.x, back[1] - b.z]; assert.ok(r1.n[0] * n[0] + r1.n[1] * n[1] > 0.99 && Math.abs(Math.hypot(...r1.n) - 1) < 1e-9, 'its face looks out, away from the axis, toward the body');
  const inn = TO.toWorld(b, -(T.ri - 0.3), 0), r2 = TO.wall(b, [inn[0], 5, inn[1]]); assert.ok(r2 && Math.abs(r2.d - 0.3) < 1e-9, 'inside, along its wall');
  assert.equal(TO.wall(b, [...(() => { const [x, z] = TO.toWorld(b, 0, T.ro + 0.3); return [x, 0, z]; })()].slice(0, 3)), null, 'not across its doorway');
});

// ---- the hall (hall.js): thirty by forty on three terraces, the hangar in the lowest
function aHall() {
  const w = createWorld(), body = B.createBody({ yaw: 0 }); body.world = w;
  w.build(body, 'hall'); w.update(20);
  return { w, body, b: w.buildings[0] };
}
const hallAt = (body, b) => { const [lx, lz] = HA.toLocal(b, body.p[0], body.p[2]); return { lx, lz, y: body.p[1] }; };
function hallTo(body, b, lx, lz, seconds) {
  for (let t = 0; t < seconds; t += B.STEP) {
    const [x, z] = HA.toWorld(b, lx, lz), dx = x - body.p[0], dz = z - body.p[2];
    if (Math.hypot(dx, dz) < 0.15) break;
    body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: Math.atan2(-dx, -dz), pitch: 0 }, B.STEP);
  }
  return hallAt(body, b);
}

ok('the hall: thirty by forty on three terraces, the lowest the tallest with the hangar in it; its floor 7 m up, its ridge 17 m over that; seven arches on stone columns each side; a hangar mouth 18 m wide', () => {
  const W = HA.HALL, [t1, t2, t3] = W.terraces;
  near(2 * W.half, 30, 1e-9, 'thirty across'); near(W.front - W.back, 40, 1e-9, 'forty long');
  assert.ok(t1.hx > t2.hx && t2.hx > t3.hx && t3.hx > W.half && t1.hz > t2.hz && t2.hz > t3.hz && t3.hz > W.front, 'three terraces, each round the next, the hall on the top one');
  near(HA.P, 7, 1e-9, 'the hall\'s floor'); assert.ok(t1.top > (t2.top - t1.top) * 3, 'the lowest the tallest');
  near(HA.roofIn(0) - HA.P, W.ridge, 1e-9, 'the ridge');
  near(W.lower.steps * W.lower.rise, t1.top, 1e-9, 'the lower flights reach the lowest terrace\'s top');
  near(W.upper.steps * W.upper.rise, t2.top - t1.top, 1e-9); near(W.upper.steps * W.upper.rise, t3.top - t2.top, 1e-9, 'the middle flights each a terrace');
  assert.equal(W.columns.zs.length, 7); near(2 * W.hangar.mouth, 18, 1e-9, 'the mouth'); near(HA.archTop(0), W.hangar.ceil, 1e-9, 'its arch\'s crown');
  assert.ok(HA.SOLIDS.filter((s) => s.part === 'bed').length >= 10, 'gardens along the terraces');
});

ok('a hall goes up in front of the body, its stairs toward it: up a lower flight, across the lowest terrace, up the middle flights, in at its door; round its hearth and its table; out, down, and into the hangar to its back wall', () => {
  const { w, body, b } = aHall(), W = HA.HALL;
  let q = hallTo(body, b, -14, 42, 6); q = hallTo(body, b, -14, 31, 6);
  near(q.y, W.terraces[0].top, 1e-9, 'up a lower flight');
  q = hallTo(body, b, 0, 31, 6); near(q.y, W.terraces[0].top, 1e-9, 'across');
  q = hallTo(body, b, 0, 23, 6); near(q.y, HA.P, 1e-9, 'up the middle flights');
  q = hallTo(body, b, 0, 15, 4); assert.ok(w.inside(body.p)?.kind === 'hall', 'in at its door');
  q = hallTo(body, b, 0, 3, 4); near(q.lz, W.hearth.z + W.hearth.half + BODY.rad, 1e-6, 'the hearth in the way');
  q = hallTo(body, b, 4, 3, 3); q = hallTo(body, b, 4, -10, 4); q = hallTo(body, b, -4, -10, 3);
  near(q.lx, W.bench.x + W.bench.half + BODY.rad, 1e-6, 'the table and its benches in the way');
  q = hallTo(body, b, 16, -7.5, 4); near(q.lx, HA.IN - BODY.rad, 1e-6, 'the side wall between two columns');
  q = hallTo(body, b, 0, 15, 6); q = hallTo(body, b, 0, 22, 4); q = hallTo(body, b, 0, 31, 6); q = hallTo(body, b, 14, 31.5, 6); q = hallTo(body, b, 14, 43, 6);
  near(q.y, 0, 1e-9, 'out and down');
  q = hallTo(body, b, 0, 36, 6); q = hallTo(body, b, 0, 10, 6); q = hallTo(body, b, 0, -5, 4);
  assert.ok(w.inside(body.p)?.kind === 'hall', 'in the hangar'); near(q.lz, W.hangar.back + BODY.rad, 1e-6, 'to its back wall'); near(q.y, 0.05, 1e-9);
});

ok('the hall\'s roof keeps a head under it and is stood on from above; in the hangar a jump meets its vault; the eye stays in the hall with a body there; the sun gets into the hall by the glass under its eaves and the open door, and into the hangar by its mouth', () => {
  const { w, body, b } = aHall(), W = HA.HALL;
  // a jump in the hangar
  const [hx, hz] = HA.toWorld(b, 0, 20); body.p = [hx, 0.05, hz]; body.was = [...body.p]; body.v = [0, 0, 0]; body.grounded = true;
  let top = 0; walk(body, [0, 0], Math.PI, 0.05, { jumpPressed: true, jump: true });
  for (let t = 0; t < 1.5; t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move: [0, 0], yaw: Math.PI, jump: true }, B.STEP); top = Math.max(top, body.p[1]); }
  near(top + BODY.tall, W.hangar.ceil, 1e-6, 'a held jump in the hangar meets its vault');
  // on the roof
  const [rx, rz] = HA.toWorld(b, 0, 0); body.p = [rx, HA.RIDGE + 2, rz]; body.was = [...body.p]; body.grounded = false; body.v = [0, 0, 0];
  walk(body, [0, 0], Math.PI, 1.5);
  near(body.p[1], HA.RIDGE, 1e-6, 'stands on the ridge');
  const at = (lx, y, lz) => { const [x, z] = HA.toWorld(b, lx, lz); return [x, y, z]; }, unit = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
  const head = at(0, HA.P + 2, -5), t = HA.eyeRoom(b, head, at(0, HA.P + 3, 30));
  assert.ok(t < 1 && t > 0.3, 'the eye kept in the hall: ' + t.toFixed(3));
  near(HA.eyeRoom(b, at(0, 3, 50), at(0, 4, 60)), 1, 1e-9, 'in front of it, nothing in the way');
  assert.ok(HA.eyeRoom(b, at(-30, 2, 0), at(30, 2, 0)) < 0.2, 'not through the terraces');
  // the sun: through the glass band, not the stone under it nor the roof; by the door; the hangar by its mouth
  assert.equal(HA.sunLocal(12, HA.P + 2.5, 0, unit([1, 1, 0])), 1, 'through the glass under the eaves');
  assert.equal(HA.sunLocal(12, HA.P + 2.5, 0, unit([1, 0.3, 0])), 0, 'not through the stone wall');
  assert.equal(HA.sunLocal(10, HA.P + 1.5, 0, unit([1, 1.2, 0])), 0, 'a high sun is held by the roof');
  assert.equal(HA.sunLocal(0, HA.P + 1.5, 0, [0, 1, 0]), 0, 'not through the roof');
  assert.equal(HA.sunLocal(0, HA.P + 1, 10, unit([0, 0.2, 1]), 1), 1, 'by the open door'); assert.equal(HA.sunLocal(0, HA.P + 1, 10, unit([0, 0.2, 1]), 0), 0, 'not by a shut one');
  assert.equal(HA.sunLocal(0, 1, 25, unit([0, 0.2, 1])), 1, 'into the hangar by its mouth'); assert.equal(HA.sunLocal(0, 1, 25, unit([1, 0.2, 0.2])), 0, 'not through its sides');
  const w2 = createWorld(); w2.buildings.push(b);
  assert.equal(w2.sunAt(at(12, HA.P + 2.5, 0), unit([...(() => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c, 1, s]; })()])), 1, 'the world asks the hall');
});

ok('the hall goes up in eight and a half seconds, the terraces, the walls and columns, the arches, the roof and the glass, the things; comes down backward; its terraces and walls are walls to run along', () => {
  const W = HA.HALL, b = { kind: 'hall', x: 0, z: 0, yaw: 0, t: 1, down: -1 };
  let p = HA.phase(b); near(p.base, 0.5, 1e-9); assert.equal(p.walls, 0);
  b.t = W.build.done; assert.equal(HA.phase(b).rest, 1);
  b.down = W.build.down / 4; p = HA.phase(b); assert.ok(p.rest === 0 && p.roof > 0 && p.roof < 1, 'a quarter down, the things gone first: ' + JSON.stringify(p));
  b.down = -1;
  const r = HA.wall(b, [-(W.terraces[0].hx + 0.3), 0, 0]); assert.ok(r && Math.abs(r.d - 0.3) < 1e-9 && r.n[0] < -0.99, 'the lowest terrace\'s side');
  const r2 = HA.wall(b, [HA.IN - 0.3, HA.P, -7.5]); assert.ok(r2 && r2.n[0] < -0.99, 'the hall\'s wall from inside');
});

// ---- the ships (ships.js): the skiff, put, boarded, flown and stepped off
ok('a skiff is put in front of the body, pointing its way, at its hover over the water; its seat is in reach at once; the five are offered, the skiff, the dart, the dhow and the ark made', () => {
  const body = B.createBody({ yaw: 0.6 }); body.p = [3, 0, -2];
  const s = SP.placeShip(body);
  near(s.yaw, 0.6, 1e-12); near(s.p[1], SP.SKIFF.hover, 1e-12);
  near(Math.hypot(s.p[0] - 3, s.p[2] + 2), SP.SKIFF.put[1], 1e-9, 'a few steps in front');
  assert.ok(SP.ahead(s)[0] * (s.p[0] - 3) + SP.ahead(s)[2] * (s.p[2] + 2) > 0, 'ahead of the body');
  assert.equal(SP.nearShip([s], body.p), s, 'its seat in reach from where the body called it');
  body.p = [3 - 8 * Math.sin(0.6), 0, -2 - 8 * Math.cos(0.6)]; assert.equal(SP.nearShip([s], body.p), null, 'not from further off');
  assert.deepEqual(SP.SHIPS.map((x) => x.kind), ['skiff', 'dart', 'dhow', 'ark', 'carrier']);
  assert.deepEqual(SP.SHIPS.filter((x) => x.ready).map((x) => x.kind), ['skiff', 'dart', 'dhow', 'ark']);
  near(SP.SKIFF.length, 5, 1e-9, 'about five metres long');
});

ok('aboard, the skiff turns toward where the eye looks, drives along its heading at its speed (faster opened up), climbs as the eye looks up, rises and sinks, never below its keel over the water; let be, it slows to a hover; a building stops it; stepping off puts the body beside it, falling', () => {
  const body = B.createBody({ yaw: 0 }), s = SP.placeShip(body), step = (inp, sec) => { for (let t = 0; t < sec; t += 1 / 60) { SP.stepShip(s, { pitch: 0, ...inp }, 1 / 60); SP.carry(s, body); } };
  SP.board(s, body); assert.equal(body.seated, s); near(body.p[1], SP.seatAt(s)[1], 1e-12, 'in its seat');
  step({ move: [0, 1], yaw: Math.PI }, 2);
  near(Math.hypot(...s.v), SP.SKIFF.speed, 1e-9, 'at its speed'); assert.ok(s.p[2] > 30 && Math.abs(s.p[0]) < 1e-6, 'along its heading: ' + s.p.map((v) => v.toFixed(2)));
  near(body.p[2], SP.seatAt(s)[2], 1e-12, 'the body carried with it');
  step({ move: [0, 1], yaw: Math.PI, sprint: true }, 2); near(Math.hypot(...s.v), SP.SKIFF.boost, 1e-9, 'opened up');
  step({ move: [0, 1], yaw: Math.PI / 2 }, 0.25);
  const turned = s.yaw; assert.ok(turned < -1e-3 && turned > -SP.SKIFF.turn * (0.25 + 2 / 60) - 1e-6, 'turning toward the eye at its rate: ' + turned.toFixed(3));
  step({ move: [0, 1], yaw: Math.PI / 2 }, 2); near(s.yaw, -Math.PI / 2, 1e-9, 'pointing where the eye looks');
  const y0 = s.p[1]; step({ move: [0, 1], yaw: Math.PI / 2, pitch: 0.5 }, 1); assert.ok(s.p[1] > y0 + 5, 'looking up as it goes, it climbs');
  step({ move: [0, 0], yaw: Math.PI / 2 }, 3); near(Math.hypot(...s.v), 0, 1e-9, 'let be, it slows to a hover');
  const y1 = s.p[1]; step({ move: [0, 0], yaw: Math.PI / 2, up: true }, 1); assert.ok(s.p[1] > y1 + 4, 'rises');
  step({ move: [0, 0], yaw: Math.PI / 2, down: true }, 8); near(s.p[1], SP.SKIFF.keel, 1e-9, 'and sinks to its keel over the water, no lower');
  // a building in its way: a house a few metres ahead stops it
  const w = createWorld(), b2 = B.createBody({ yaw: 0 }); b2.world = w; w.build(b2, 'house'); w.update(10);
  const s2 = SP.placeShip({ p: [0, 0, -8], yaw: 0 }); s2.p[1] = 2; let stopped = false;
  for (let t = 0; t < 3; t += 1 / 60) { SP.stepShip(s2, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60, { solid: (q) => w.solid(q) }); if (w.solid(s2.p)) stopped = 'inside'; }
  const hz = w.buildings[0].z; assert.ok(stopped !== 'inside' && s2.p[2] < hz, 'held short of the house: ' + s2.p[2].toFixed(2) + ' < ' + hz.toFixed(2));
  // stepping off
  SP.leave(s, body); assert.equal(body.seated, null); assert.equal(body.grounded, false);
  near(Math.hypot(body.p[0] - SP.seatAt(s)[0], body.p[2] - SP.seatAt(s)[2]), 1.3, 1e-9, 'beside it');
});

ok('the dart: eleven metres, put beside the body (it is too long to put in front) with its cockpit at the body\'s shoulder, pointing its way; faster than the skiff; its wingtips meet what is solid', () => {
  const D = SP.DART, body = B.createBody({ yaw: 0 }); body.p = [0, 0, 0];
  near(D.length, 11, 1e-9, 'about eleven metres long');
  const s = SP.placeShip(body, () => 0, 'dart');
  assert.equal(s.kind, 'dart'); near(s.yaw, 0, 1e-12);
  assert.ok(s.p[0] > 2 && Math.abs(s.p[2]) < 2, 'beside the body: ' + s.p.map((v) => v.toFixed(2)));
  const tail = SP.shipPoint(s, [0, 0, -D.length / 2]), nose = SP.shipPoint(s, [0, 0, D.length / 2]);
  assert.ok(tail[2] < -2 && nose[2] > 2, 'alongside it, its tail behind and its point ahead');
  assert.equal(SP.nearShip([s], body.p), s, 'its seat in reach');
  SP.board(s, body);
  for (let t = 0; t < 2; t += 1 / 60) SP.stepShip(s, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60);
  near(Math.hypot(...s.v), D.speed, 1e-9, 'its speed'); assert.ok(D.speed > SP.SKIFF.speed * 1.5 && D.boost > SP.SKIFF.boost * 1.8, 'faster than the skiff');
  // flown past a house with its middle clear of it but a wingtip not: stopped short
  const w = createWorld(), b2 = B.createBody({ yaw: 0 }); b2.world = w; w.build(b2, 'house'); w.update(10);
  const h = w.buildings[0], s2 = SP.placeShip({ p: [h.x + 5.5, 0, h.z - 12], yaw: 0 }, () => 0, 'dart'); s2.p = [h.x + 5.5, 2, h.z - 12];
  for (let t = 0; t < 3; t += 1 / 60) SP.stepShip(s2, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60, { solid: (q) => w.solid(q) });
  const tip = SP.shipPoint(s2, D.edges[1]);
  assert.ok(Math.abs(tip[0] - h.x) < 3 && tip[2] < h.z - 2.4 && !w.solid(tip), 'its wingtip caught at the house\'s front wall: ' + tip.map((v) => v.toFixed(2)));
  near(Math.hypot(...s2.v), 0, 1, 'stopped there');
});

ok('the dhow: twenty-eight metres, put beside the body with its stern alongside; its helm, high on the stern cabin, is taken from the water; heavy, it comes up to speed and turns slowly; its side meets what is solid', () => {
  const D = SP.DHOW, body = B.createBody({ yaw: 0 }); body.p = [0, 0, 0];
  near(D.length, 28, 1e-9, 'about twenty-eight metres long');
  const s = SP.placeShip(body, () => 0, 'dhow'), helm = SP.seatAt(s);
  assert.ok(s.p[0] > D.beam / 2 + 1, 'beside the body, clear of it: ' + s.p.map((v) => v.toFixed(2)));
  assert.ok(helm[1] - body.p[1] > 4, 'its helm high over the water: ' + helm[1].toFixed(2));
  assert.equal(SP.nearShip([s], body.p), s, 'and taken from the water beside it');
  SP.board(s, body); near(body.p[1], helm[1], 1e-12, 'up at the helm');
  for (let t = 0; t < 1; t += 1 / 60) SP.stepShip(s, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60);
  assert.ok(Math.hypot(...s.v) < 7, 'heavy: a second in, still slow: ' + Math.hypot(...s.v).toFixed(2));
  for (let t = 0; t < 4; t += 1 / 60) SP.stepShip(s, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60);
  near(Math.hypot(...s.v), D.speed, 1e-9, 'then at its speed');
  assert.ok(D.turn < SP.DART.turn / 2 && D.accel < SP.SKIFF.accel / 2, 'slower to turn and to come up to speed than the small ones');
  // flown past a house with its middle clear but its side not: stopped short
  const w = createWorld(), b2 = B.createBody({ yaw: 0 }); b2.world = w; w.build(b2, 'house'); w.update(10);
  const h = w.buildings[0], s2 = SP.placeShip({ p: [0, 0, 0], yaw: 0 }, () => 0, 'dhow'); s2.p = [h.x + 5.8, 2.5, h.z - 30];
  for (let t = 0; t < 12; t += 1 / 60) SP.stepShip(s2, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60, { solid: (q) => w.solid(q) });
  const side = SP.shipPoint(s2, D.edges[1]);
  assert.ok(side[2] < h.z - 2 && !w.solid(side), 'its side caught at the house: ' + side.map((v) => v.toFixed(2)));
});

ok('the ark: eighty metres, its ring round its middle riding clear of the water; put ahead of the body, pointing its way, far enough off to be seen whole; boarded from the water near its stern, up into its helm in the dome on the prow; the heaviest, it comes up to speed and turns the slowest; never lower than its keel; its ring meets what is solid', () => {
  const A = SP.ARK, body = B.createBody({ yaw: 0 }); body.p = [0, 0, 0];
  near(A.length, 80, 1e-9, 'about eighty metres long');
  near(A.ring.turn * 60, 2 * Math.PI, 1e-9, 'its ring turns once a minute');
  const rim = A.ring.r + A.ring.tube;
  assert.ok(A.keel > rim && A.hover > A.keel, 'its ring\'s foot clear of the water, put and flown');
  const [dx, dy, dz] = A.dome.at, [sx, sy, sz] = A.seat;
  assert.ok(sy > dy && Math.hypot(sx - dx, sy + 1.1 - dy, sz - dz) < A.dome.r - 0.4, 'the helm in the dome, a seated head under its glass');
  assert.ok(A.edges.some(([x, y, z]) => Math.abs(y + rim) < 1e-9 && z === A.ring.z) && A.edges.some(([x, y]) => Math.abs(x - rim) < 1e-9 && y === 0), 'its ring\'s rim is what meets what is solid');
  const s = SP.placeShip(body, () => 0, 'ark'), helm = SP.seatAt(s);
  near(s.yaw, 0, 1e-12, 'pointing the body\'s way'); assert.ok(Math.abs(s.p[0]) < 1e-9 && s.p[2] > 0, 'ahead of the body');
  // seen whole from where it was called: the eye (a few metres behind the body, level) has its ring's top inside its 55 degrees
  const top = s.p[1] + rim, ringAt = s.p[2] + A.ring.z + 5;
  assert.ok(Math.atan2(top - 1.6, ringAt) < (27.5 * Math.PI) / 180 - 0.03, 'its ring\'s top inside the eye\'s view: ' + ((Math.atan2(top - 1.6, ringAt) * 180) / Math.PI).toFixed(1));
  assert.ok(SP.shipPoint(s, [0, 0, -A.length / 2])[2] > 5, 'its stern clear ahead of the body');
  assert.ok(helm[1] - body.p[1] > 15, 'its dome high over the water: ' + helm[1].toFixed(2));
  assert.equal(SP.nearShip([s], body.p), s, 'boarded from where it was called, near its stern');
  body.p = [0, 0, s.p[2] + 20]; assert.equal(SP.nearShip([s], body.p), null, 'not from under its ring');
  body.p = [-40, 0, 0]; assert.equal(SP.nearShip([s], body.p), null, 'nor from far off'); body.p = [0, 0, 0];
  SP.board(s, body); near(body.p[1], helm[1], 1e-12, 'lifted up into the dome'); near(body.p[2], helm[2], 1e-12, 'at the helm, on the prow');
  for (let t = 0; t < 1; t += 1 / 60) SP.stepShip(s, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60);
  assert.ok(Math.hypot(...s.v) < 5, 'the heaviest: a second in, still slow: ' + Math.hypot(...s.v).toFixed(2));
  for (let t = 0; t < 8; t += 1 / 60) SP.stepShip(s, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60);
  near(Math.hypot(...s.v), A.speed, 1e-9, 'then at its speed');
  assert.ok(A.turn < SP.DHOW.turn && A.accel < SP.DHOW.accel, 'slower to turn and to come up to speed than the dhow');
  for (let t = 0; t < 4; t += 1 / 60) SP.stepShip(s, { move: [0, 0], yaw: Math.PI, pitch: 0, down: true }, 1 / 60);
  near(s.p[1], A.keel, 1e-9, 'sunk as low as it goes'); assert.ok(SP.shipPoint(s, [0, -rim, A.ring.z])[1] > 0.3, 'its ring\'s foot still over the water');
  // flown at a house with its middle passing over it but its ring's foot not: caught short of it
  const w = createWorld(), b2 = B.createBody({ yaw: 0 }); b2.world = w; w.build(b2, 'house'); w.update(10);
  const h = w.buildings[0], low = A.hover - rim;
  const line = [-2.5, -1.5, 1.5, 2.5, 0.8, -0.8].map((ox) => ({ ox, z: Array.from({ length: 200 }, (_, i) => h.z - 12 + i * 0.1).find((z) => w.solid([h.x + ox, low, z])) })).find((l) => l.z !== undefined);
  assert.ok(line, 'the house stands in the way of the ring\'s foot');
  const s2 = SP.placeShip({ p: [0, 0, 0], yaw: 0 }, () => 0, 'ark'); s2.p = [h.x + line.ox, A.hover, h.z - 60];
  for (let t = 0; t < 12; t += 1 / 60) SP.stepShip(s2, { move: [0, 1], yaw: Math.PI, pitch: 0 }, 1 / 60, { solid: (q) => w.solid(q) });
  const foot = SP.shipPoint(s2, [0, -rim, A.ring.z]);
  assert.ok(!w.solid(foot) && foot[2] < line.z && foot[2] > line.z - 2.5, 'its ring\'s foot caught at the house: ' + foot.map((v) => v.toFixed(2)) + ' against ' + line.z.toFixed(2));
});

ok('seated in a ship, a body on two legs sits: its hips low over the seat, its thighs forward and its knees bent, its hands out on the controls', () => {
  const g = Gt.createGait(), body = B.createBody({ yaw: 0 }); body.seated = {};
  assert.equal(Gt.stateOf(body), 'seat');
  let pose = null; for (let i = 0; i < 90; i++) pose = Gt.stepGait(g, body, 1 / 60);
  assert.ok(pose.pelvis < 0.2, 'the hips over the seat: ' + pose.pelvis.toFixed(3));
  assert.ok(pose.legL.z > 0.3 && pose.legR.z > 0.3, 'the feet forward');
  const ik = Gt.legIK(pose.legL.z, pose.legL.y); assert.ok(ik.knee > 0.8, 'the knee bent: ' + ik.knee.toFixed(2));
  assert.ok(pose.armL.swing > 0.4 && pose.armR.swing > 0.4, 'the hands out ahead');
  body.seated = null; for (let i = 0; i < 90; i++) pose = Gt.stepGait(g, body, 1 / 60); assert.ok(pose.pelvis > 0.7, 'and up again off it');
});

ok('the board key: R, and the pad\'s left on the cross; the view wires the ships: the list, the key, the ship flown instead of the body', () => {
  const b = I.defaults(); assert.deepEqual(b.keys.board, ['KeyR', '']); assert.equal(b.pad.board, 14);
  assert.ok(I.ACTIONS.find((a) => a.id === 'board')?.note);
  const view = read('src/game/view.js');
  for (const line of ['id="game-ship-list"', 'if (inp.board) boardOrLeave();', 'stepShip(K.aboard,', 'carry(K.aboard, body);', 'hands: down || K.aboard ? {}']) assert.ok(view.includes(line), 'view.js lacks ' + line);
  assert.ok(read('src/game/ships/skiff.js').includes("from '../ships.js'"), 'the skiff drawn is not the numbers\' skiff');
  assert.ok(read('src/game/ships/dart.js').includes("from '../ships.js'"), 'the dart drawn is not the numbers\' dart');
  assert.ok(read('src/game/ships/dhow.js').includes("from '../ships.js'"), 'the dhow drawn is not the numbers\' dhow');
  assert.ok(read('src/game/ships/ark.js').includes("from '../ships.js'"), 'the ark drawn is not the numbers\' ark');
  assert.ok(view.includes('ark: createArkArt'), 'the view does not draw the ark');
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
  for (const line of ['kept.body.world = kept.world;', 'K.world.update(dt)', 'K.world.shift(far[0], far[1])', 'K.world.eye(', 'K.world.wet(', 'V.setIndoor(K.indoor)', 'figure.group.visible = !eye.hide;', "id=\"game-build-list\"", 'said(K.world.toggle(K.body, st.building))', 'art = ARTS[b.kind]({ lite: K.lite })', 'k.opens ? k.opens(b, K.body.p)']) assert.ok(view.includes(line), 'view.js lacks ' + line);
  assert.ok(read('src/game/buildings/workshop.js').includes("from '../workshop.js'"), 'the workshop drawn is not the numbers\' workshop');
  assert.ok(read('src/game/buildings/tower.js').includes("from '../tower.js'"), 'the tower drawn is not the numbers\' tower');
  assert.ok(read('src/game/buildings/hall.js').includes("from '../hall.js'"), 'the hall drawn is not the numbers\' hall');
  assert.ok(read('src/game/buildings/house.js').includes("from '../house.js'"), 'the house drawn is not the numbers\' house');
  assert.ok(read('src/game/buildings/shelter.js').includes("from '../shelter.js'"), 'the drawing is not the numbers\' shelter');
});

// ---- the fight (combat.js): the ring and the bots
// Colin, 17 Nov 2026: "a plasma weapon generated with several ways to attack with it, getting a bot enemy that we can
// spawn in at varying difficulty". A body at the origin facing −z; the eye behind it looking along −z.
const FRAME = 1 / 60;
function arena(seed = 3) {
  const c = CB.createCombat({ seed }), body = B.createBody({ yaw: Math.PI });
  const aim = { from: [0.3, 1.9, 5.5], dir: [0, 0, -1] };
  return { c, body, aim };
}
// a bot of a level standing (hovering) where it is put, not yet shooting
function standBot(c, body, at, level = 1) {
  const b = CB.spawnBot(c, body, 0, level); b.p = [...at]; b.alt = at[1]; b.mode = 'fight'; b.fire = 99; b.strafeT = 99; b.v = [0, 0, 0];
  c.events.length = 0;
  return b;
}
function fightFor(c, body, aim, seconds, hands = {}, extra = {}) {
  const evs = [];
  for (let t = 0; t < seconds - 1e-9; t += FRAME) { CB.stepCombat(c, FRAME, { body, aim, hands: typeof hands === 'function' ? hands(t) : hands, ...extra }); evs.push(...c.events.splice(0)); }
  return evs;
}
const kinds = (evs, type) => evs.filter((e) => e.type === type);

ok('the ring: a tap casts it along the eye\'s line at the bot nearest it; it goes out, strikes the bot once, and comes back to the hand', () => {
  const { c, body, aim } = arena(), b = standBot(c, body, [0.6, 1.3, -10]);
  let evs = fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true });
  evs = evs.concat(fightFor(c, body, aim, FRAME, { attack: false }));
  assert.equal(kinds(evs, 'cast').length, 1, 'cast'); assert.equal(c.ring.mode, 'out');
  assert.equal(kinds(evs, 'cast')[0].power, 0, 'a tap is a plain cast');
  evs = evs.concat(fightFor(c, body, aim, 2.5));
  const hits = kinds(evs, 'hit');
  assert.equal(hits.length, 1, 'struck once, out and back: ' + JSON.stringify(hits));
  assert.equal(hits[0].damage, CB.RING.cast.damage); assert.equal(b.hp, b.max - CB.RING.cast.damage);
  assert.equal(kinds(evs, 'catch').length, 1, 'caught again'); assert.equal(c.ring.mode, 'held');
});

ok('an attack pressed while the ring is away calls it home and waits for it: a tap casts again as it comes, a hold spins it up', () => {
  const { c, body, aim } = arena();
  fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }); fightFor(c, body, aim, 0.3, {});
  assert.equal(c.ring.mode, 'out');
  let evs = fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }).concat(fightFor(c, body, aim, FRAME, {}));
  assert.equal(kinds(evs, 'recall').length, 1, 'called home'); assert.equal(c.ring.mode, 'back');
  evs = evs.concat(fightFor(c, body, aim, 0.6, {}));
  assert.equal(kinds(evs, 'cast').length, 1, 'cast again as soon as it was in hand');
  fightFor(c, body, aim, 2.5, {});
  assert.equal(c.ring.mode, 'held');
  fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }); fightFor(c, body, aim, FRAME, {}); fightFor(c, body, aim, 0.3, {});
  fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }); fightFor(c, body, aim, 2.5, { attack: true });
  assert.equal(c.ring.mode, 'charging', 'held while it came home: it spins up');
});

ok('held, the ring spins up (and the body walks); let go, it flies faster and further and strikes two and a half times as hard: a drifter breaks', () => {
  const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.3, -16]);
  let evs = fightFor(c, body, aim, 1.2, (t) => ({ attack: true, attackPressed: t === 0 }));
  assert.equal(c.ring.mode, 'charging'); near(c.ring.charge, 1, 1e-9, 'spun up all the way'); assert.ok(c.slow, 'spinning it up, the body walks');
  evs = evs.concat(fightFor(c, body, aim, 1.5, { attack: false }));
  const cast = kinds(evs, 'cast')[0];
  near(cast.power, 1, 1e-9);
  const hit = kinds(evs, 'hit')[0];
  assert.equal(hit.damage, CB.RING.charged.damage); assert.ok(CB.RING.charged.damage >= 2.5 * CB.RING.cast.damage);
  assert.equal(kinds(evs, 'broken').length, 1, 'broken'); assert.equal(c.broken, 1); assert.equal(c.bots.length, 0, 'gone from the fight');
  assert.ok(CB.RING.charged.reach > CB.RING.cast.reach && CB.RING.charged.speed > CB.RING.cast.speed);
});

ok('the whirl: everything within reach is struck once and thrown back; what is further is not', () => {
  const { c, body, aim } = arena(), near1 = standBot(c, body, [0, 1.2, -2]), near2 = standBot(c, body, [1.6, 1.0, 1.4]), far = standBot(c, body, [0, 1.2, -6]);
  const evs = fightFor(c, body, aim, 0.6, (t) => ({ sweep: t === 0 }));
  assert.equal(kinds(evs, 'whirl').length, 1);
  const struck = kinds(evs, 'hit').map((e) => e.id).sort();
  assert.deepEqual(struck, [near1.id, near2.id].sort(), 'the two within reach, once each');
  assert.equal(far.hp, far.max, 'the far one untouched');
  assert.ok(near1.p[2] < -2 && Math.hypot(near2.p[0], near2.p[2]) > Math.hypot(1.6, 1.4), 'thrown back');
  assert.equal(c.ring.mode, 'held', 'back in hand');
});

ok('in the air the attack is a slam: the body is driven down; where it lands a wave strikes, hardest nearest, nothing past its reach', () => {
  const { c, body, aim } = arena();
  body.p = [0, 3.2, 0]; body.grounded = false; body.v = [0, 0, 0];
  const a = standBot(c, body, [1, 1.0, 0]), b = standBot(c, body, [0, 1.0, -5]), x = standBot(c, body, [0, 1.0, -9]);
  CB.stepCombat(c, FRAME, { body, aim, hands: { attack: true, attackPressed: true } });
  assert.equal(c.ring.mode, 'slam'); assert.ok(body.v[1] <= -CB.RING.slam.fall, 'driven down');
  const evs = [];
  for (let t = 0; t < 1 && c.ring.mode === 'slam'; t += FRAME) { B.advance(body, { move: [0, 0], yaw: 0 }, FRAME); CB.stepCombat(c, FRAME, { body, aim, hands: {} }); evs.push(...c.events.splice(0)); }
  assert.equal(kinds(evs, 'slam').length, 1, 'a wave');
  const dmg = Object.fromEntries(kinds(evs, 'hit').map((e) => [e.id, e.damage]));
  assert.ok(dmg[a.id] > dmg[b.id] && dmg[b.id] > 0, 'hardest nearest: ' + JSON.stringify(dmg));
  assert.equal(dmg[x.id], undefined, 'past its reach');
  assert.ok(!(c.ring.mode === 'slam'));
  // on the ground the same press is a cast, not a slam
  const g = arena(); CB.stepCombat(g.c, FRAME, { body: g.body, aim: g.aim, hands: { attack: true, attackPressed: true } }); assert.equal(g.c.ring.mode, 'charging');
});

ok('the guard: a bolt from the front is turned aside; raised just as one comes, it goes back at its sender three times as hard; from behind, it strikes', () => {
  const bolt = (c, b, from, v) => c.bolts.push({ p: from, v, owner: 'bot', from: b.id, level: 1, damage: 6, life: 3 });
  // a parry
  { const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.1, -8]);
    bolt(c, b, [0, 1.1, -3], [0, 0, 16]);
    const evs = fightFor(c, body, aim, 1.5, (t) => ({ guard: true, guardPressed: t === 0 }));
    assert.equal(kinds(evs, 'parry').length, 1, 'a parry'); assert.equal(c.player.hp, CB.PLAYER.hp, 'unhurt');
    assert.equal(b.hp, b.max - 18, 'its own bolt, three times as hard'); }
  // a guard held already
  { const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.1, -8]);
    fightFor(c, body, aim, 0.5, (t) => ({ guard: true, guardPressed: t === 0 }));
    bolt(c, b, [0, 1.1, -3], [0, 0, 16]);
    const evs = fightFor(c, body, aim, 1, { guard: true });
    assert.equal(kinds(evs, 'deflect').length, 1, 'turned aside'); assert.equal(kinds(evs, 'parry').length, 0);
    assert.equal(c.player.hp, CB.PLAYER.hp); assert.equal(b.hp, b.max, 'its sender untouched'); }
  // from behind
  { const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.1, 8]);
    bolt(c, b, [0, 1.1, 3], [0, 0, -16]);
    const evs = fightFor(c, body, aim, 1, (t) => ({ guard: true, guardPressed: t === 0 }));
    assert.equal(kinds(evs, 'hurt').length, 1); assert.equal(c.player.hp, CB.PLAYER.hp - 6); }
  // the guard pressed while the ring is out calls it home
  { const { c, body, aim } = arena();
    fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }); fightFor(c, body, aim, 0.2, {});
    assert.equal(c.ring.mode, 'out');
    const evs = fightFor(c, body, aim, FRAME, { guardPressed: true, guard: true });
    assert.equal(kinds(evs, 'recall').length, 1); assert.equal(c.ring.mode, 'back'); }
});

ok('five levels of bot, each tougher, quicker and surer than the last; one comes up out of the water, keeps its distance, circles and shoots', () => {
  const L = CB.LEVELS;
  assert.equal(L.length, 5);
  for (let i = 1; i < 5; i++) {
    assert.ok(L[i].hp > L[i - 1].hp && L[i].speed > L[i - 1].speed && L[i].every < L[i - 1].every && L[i].spread < L[i - 1].spread, 'level ' + (i + 1));
    assert.ok(L[i].dodge >= L[i - 1].dodge && L[i].lead >= L[i - 1].lead && L[i].bolt.damage > L[i - 1].bolt.damage && L[i].burst >= L[i - 1].burst);
  }
  assert.equal(L[0].dodge, 0); assert.equal(L[0].lead, 0);
  const { c, body, aim } = arena(5), b = CB.spawnBot(c, body, 0, 3);
  assert.equal(b.mode, 'rise'); assert.ok(b.p[1] < 0, 'under the water');
  assert.equal(kinds(c.events, 'spawn').length, 1);
  const evs = fightFor(c, body, aim, 8, {}, { creative: true });
  assert.equal(b.mode, 'fight'); assert.ok(b.p[1] > 1, 'hovering');
  const d = Math.hypot(b.p[0], b.p[2]);
  assert.ok(d > L[2].range[0] - 1.5 && d < L[2].range[1] + 1.5, 'at its distance: ' + d.toFixed(2));
  assert.ok(kinds(evs, 'bolt').length >= 4, 'it shoots: ' + kinds(evs, 'bolt').length);
  assert.equal(c.player.hp, CB.PLAYER.hp, 'in creative nothing hurts the body');
});

ok('the best bots lead a moving body; a drifter shoots where it is; a bot that may slip a cast does', () => {
  const lead = (level) => {
    const { c, body, aim } = arena(9), b = standBot(c, body, [0, 1.2, -9], level);
    b.L = { ...b.L, spread: 0 }; b.fire = 0; body.v = [6, 0, 0];
    CB.stepCombat(c, FRAME, { body, aim, hands: {}, creative: true });
    const x = c.bolts[0], to = [body.p[0] - x.p[0], body.p[1] + 1.1 - x.p[1], body.p[2] - x.p[2]];
    return Math.atan2(x.v[0], -x.v[2]) - Math.atan2(to[0], -to[2]);
  };
  near(lead(1), 0, 0.03, 'a drifter at where the body is');
  assert.ok(lead(5) > 0.12, 'a warden ahead of it: ' + lead(5).toFixed(3));
  // slipping a cast: a warden that will, a drifter that never does
  for (const [level, slips] of [[5, true], [1, false]]) {
    const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.3, -11], level);
    c.rand = () => 0;
    const evs = fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }).concat(fightFor(c, body, aim, 0.6, {}));
    assert.equal(kinds(evs, 'dodge').length > 0, slips, 'level ' + level);
  }
});

ok('struck down at nothing, the body stands again whole after a moment, spared a while; unhurt for a while it mends', () => {
  const { c, body, aim } = arena(), b = standBot(c, body, [0, 1.1, -8]);
  c.player.hp = 5; c.player.hurt = 0;            // just hurt: not mending yet
  c.bolts.push({ p: [0, 1.1, -2], v: [0, 0, 16], owner: 'bot', from: b.id, level: 1, damage: 6, life: 3 });
  let evs = fightFor(c, body, aim, 0.5, {});
  assert.equal(kinds(evs, 'down').length, 1); assert.ok(c.player.down > 0); assert.equal(c.player.hp, 0);
  // down, the hands do nothing
  evs = fightFor(c, body, aim, FRAME, { attack: true, attackPressed: true }); assert.equal(c.ring.mode, 'held');
  evs = fightFor(c, body, aim, CB.PLAYER.down + 0.1, {});
  assert.equal(kinds(evs, 'rise').length, 1); assert.equal(c.player.hp, CB.PLAYER.hp); assert.ok(c.player.mercy > 0, 'spared a moment');
  c.player.hp = 50; c.player.hurt = 0; c.player.mercy = 0;
  fightFor(c, body, aim, CB.PLAYER.regenAfter + 1, {});
  assert.ok(c.player.hp > 50 && c.player.hp <= CB.PLAYER.hp, 'mended: ' + c.player.hp);
});

ok('twelve bots at once at most; cleared, they sink; the origin moved, the fight moves with it; the ring stops at a wall and a bolt is spent there', () => {
  const { c, body, aim } = arena();
  for (let i = 0; i < 13; i++) CB.spawnBot(c, body, 0, 1 + (i % 5));
  assert.equal(c.bots.length, CB.MAX_BOTS);
  assert.equal(CB.spawnBot(c, body, 0, 1), null);
  c.events.length = 0; CB.clearBots(c);
  assert.equal(c.bots.length, 0); assert.equal(kinds(c.events, 'gone').length, CB.MAX_BOTS);
  const b = standBot(c, body, [5, 1, 5]); CB.shiftCombat(c, 2, 3); assert.deepEqual(b.p, [3, 1, 2]);
  // a house between the body and where it casts
  const w = createWorld(), walker = B.createBody({ yaw: 0 }); walker.world = w;
  w.build(walker, 'house'); w.update(10);
  const h = w.buildings[0], [cx, cz] = HO.toWorld(h, 0, 0);
  // cast from nine metres off its side, at its middle: the side wall (local x = 3) is six metres off
  const [sx, sz] = HO.toWorld(h, 9, 0), c2 = CB.createCombat(), body2 = B.createBody({ yaw: Math.atan2(cx - sx, cz - sz) }); body2.p = [sx, 0, sz];
  const from = [sx, 1.6, sz], dir = (() => { const d = [cx - sx, 0, cz - sz], m = Math.hypot(...d); return d.map((v) => v / m); })();
  const evs = fightFor(c2, body2, { from, dir }, FRAME, { attack: true, attackPressed: true }, { world: w }).concat(fightFor(c2, body2, { from, dir }, 0.5, {}, { world: w }));
  assert.ok(kinds(evs, 'spark').length >= 1, 'it met the wall'); assert.ok(c2.ring.went < 6.5 && c2.ring.went > 5, 'and turned back there: ' + c2.ring.went.toFixed(2));
  // and a bolt into the wall is spent
  c2.bolts.push({ p: [...from], v: dir.map((v) => v * 20), owner: 'bot', from: 0, level: 1, damage: 6, life: 3 });
  fightFor(c2, B.createBody({ yaw: 0 }), { from, dir }, 0.6, {}, { world: w, creative: true }); assert.equal(c2.bolts.length, 0);
});

ok('the fight\'s hands: cast, whirl, guard and a bot have keys and pad buttons; an older keeping that gave the right mouse to the dash keeps it there', () => {
  const d = I.defaults();
  assert.deepEqual(d.keys.attack, ['Mouse0', 'KeyJ']); assert.deepEqual(d.keys.guard, ['Mouse2', 'KeyL']); assert.deepEqual(d.keys.whirl, ['KeyE', 'KeyK']); assert.deepEqual(d.keys.spawn, ['KeyN', '']);
  assert.equal(d.pad.attack, 7); assert.equal(d.pad.guard, 6); assert.equal(d.pad.whirl, 5); assert.equal(d.pad.spawn, 15);
  const all = Object.values(d.keys).flat().filter(Boolean); assert.equal(new Set(all).size, all.length, 'one key, one thing');
  const pads = Object.values(d.pad).filter((n) => n >= 0); assert.equal(new Set(pads).size, pads.length, 'one button, one thing');
  const old = store({ [I.STORE_KEY]: JSON.stringify({ v: 1, keys: { dash: ['KeyQ', 'Mouse2'] }, pad: { dash: 1 } }) });
  const b = I.loadBindings(old);
  assert.deepEqual(b.keys.dash, ['KeyQ', 'Mouse2'], 'kept'); assert.deepEqual(b.keys.guard, ['', 'KeyL'], 'the guard does without the right mouse');
  const inp = I.createInput(I.defaults());
  inp.down('KeyJ'); let f = inp.frame(); assert.ok(f.attack && f.attackPressed);
  f = inp.frame(); assert.ok(f.attack && !f.attackPressed, 'held, pressed once'); inp.up('KeyJ');
  inp.down('KeyE'); inp.down('KeyL'); inp.down('KeyN'); f = inp.frame(); assert.ok(f.whirl && f.guard && f.guardPressed && f.spawn);
  const st = store(); S.saveState(st, { ...S.freshState(), level: 4 }); assert.equal(S.loadState(st).level, 4);
  assert.equal(S.loadState(store({ [S.STATE_KEY]: JSON.stringify({ level: 9 }) })).level, 1, 'not believed');
});

ok('the fight is wired to the page: stepped after the body, drawn, moved with the origin, called from the bar and the key', () => {
  const view = read('src/game/view.js');
  for (const line of ['stepCombat(C, dt, {', 'K.fight.update(K.combat', 'shiftCombat(K.combat, far[0], far[1])', 'id="game-bot-list"', 'if (inp.spawn) callBot();', 'tip(figure, pos, body.yaw, K.fallen, K.lean)', 'class="game-hud"']) assert.ok(view.includes(line), 'view.js lacks ' + line);
  assert.ok(read('src/game/fight.js').includes("from './combat.js'"), "the ring drawn is not the numbers' ring");
});

// ---- the wall run (body.js, house.js's wall). Colin, 17 Nov: "a third feature -- wall run".
// A house at the origin, unturned (its own frame is the world's). Its back wall's outer face is at z = −4.5, from
// x = −3 to 3, under the roof's end (which reaches 4.95): high enough over it to run along. A body behind it on the
// water, the eye looking along +x (yaw −π/2): forward is +x, and the hands push a little toward the wall (+z).
function wallYard() {
  const w = createWorld(), b = { kind: 'house', x: 0, z: 0, yaw: 0, t: 10, down: -1 }; w.buildings.push(b);
  const body = B.createBody({ yaw: Math.PI / 2, world: w }); body.p = [-2.8, 0, -4.8]; body.was = [...body.p];
  return { w, b, body };
}
const ALONG = -Math.PI / 2;
// the body stepped through a list of [seconds, input] with the world's walls; answers every event and the highest it went
function drive(body, plan) {
  const evs = []; let top = body.p[1];
  for (const [secs, inp] of plan) for (let t = 0; t < secs - 1e-9; t += B.STEP) {
    body.was = [...body.p];
    B.stepBody(body, { yaw: ALONG, pitch: 0, move: [0, 0], ...inp, jumpPressed: t === 0 && !!inp.jumpPressed }, B.STEP);
    evs.push(...body.events.splice(0)); top = Math.max(top, body.p[1]);
  }
  return { evs, top };
}
const runAlong = [[0.3, { move: [0.3, 1] }], [0.3, { move: [0.3, 1], jump: true, jumpPressed: true }]];

ok('a wall run: jumped at along the house\'s back wall, the body takes to it and runs along it faster than it ran, held up, to its corner', () => {
  const { w, body } = wallYard();
  near(w.wall([-1, 1.0, -4.8])?.d ?? 9, 0.3, 1e-9, 'a wall 0.3 m off'); assert.deepEqual(w.wall([-1, 1.0, -4.8]).n, [0, -1], 'facing out, toward the body');
  assert.equal(w.wall([4.5, 1.0, -4.8]), null, 'past its corner, none'); assert.equal(w.wall([-1, 1.0, -6]), null, 'too far off, none');
  assert.equal(w.wall([-2.6, 3.5, -4.8]), null, 'over its top (the gable\'s slope), none'); assert.ok(w.wall([-1, 3.5, -4.8]), 'nearer the ridge it is higher');
  const x0 = body.p[0];
  const { evs } = drive(body, [...runAlong, [2, { move: [0.3, 1] }]]);
  const on = evs.findIndex((e) => e.type === 'wallrun' && e.on), off = evs.findIndex((e, i) => i > on && e.type === 'wallrun' && !e.on);
  assert.ok(on >= 0 && off > on, 'on the wall and off it: ' + evs.map((e) => e.type).join());
  assert.deepEqual(evs[on].n, [0, -1]);
  assert.ok(body.p[0] > 3, 'along it to the corner: ' + body.p[0].toFixed(2)); assert.ok(body.p[0] - x0 > 7, 'further than a run and a jump: ' + (body.p[0] - x0).toFixed(2));
  assert.ok(body.grounded && body.p[1] === 0 && !body.wallrun, 'and down on the water again');
  // on it: along at least WALL.along (more than a run), held to its face, a jump's rise not carried up it
  const s2 = wallYard().body; drive(s2, [...runAlong, [0.15, { move: [0.3, 1] }]]);
  assert.ok(s2.wallrun, 'still on it'); assert.ok(s2.v[0] >= B.WALL.along - 1e-9 && B.WALL.along > B.RUN, 'along it at ' + s2.v[0].toFixed(2));
  assert.ok(s2.p[1] > 1 && s2.v[1] <= B.WALL.lift + 1e-9, 'held up, not flung up: ' + s2.p[1].toFixed(2) + ' at ' + s2.v[1].toFixed(2));
  near(s2.p[2], -4.8, 1e-6, 'at the wall\'s face');
});

ok('a jump off the wall leaps out and up and gives the air\'s dash back; the same wall waits for the ground', () => {
  const { body } = wallYard();
  drive(body, [...runAlong, [0.15, { move: [0.3, 1] }]]);
  assert.ok(body.wallrun); body.airDash = 0;
  const { evs } = drive(body, [[B.STEP, { move: [0.3, 1], jump: true, jumpPressed: true }]]);
  assert.ok(evs.some((e) => e.type === 'walljump'));
  assert.ok(body.v[2] < -5 && body.v[1] > 5 && body.v[0] > 5 && !body.wallrun && body.airDash === B.AIR_DASHES, 'on, out, up, the dash back: ' + body.v.map((v) => v.toFixed(2)));
  // pushing back at the same wall in the air: no second run until it has stood on something
  const back = drive(body, [[0.6, { move: [1, 1] }]]);
  assert.ok(!back.evs.some((e) => e.type === 'wallrun' && e.on), 'the same wall waits');
  drive(body, [[2.5, {}]]); assert.ok(body.grounded && body.lastWall === null, 'the ground forgets it');
});

ok('no wall run when slow, low, going away from the wall, or with no wall there; a dash ends one', () => {
  const walkOn = (inp) => { const { body } = wallYard(); return drive(body, [[0.3, inp], [0.6, { ...inp, jump: true, jumpPressed: true }]]).evs.some((e) => e.type === 'wallrun' && e.on); };
  assert.equal(walkOn({ move: [0.3, 1], walk: true }), false, 'at a walk');
  assert.equal(walkOn({ move: [-1, 0.3] }), false, 'going away from it');
  assert.equal(walkOn({ move: [0.3, 1] }), true, 'running along it, it does');
  { const { body } = wallYard(); assert.equal(drive(body, [[1, { move: [0.3, 1] }]]).evs.some((e) => e.type === 'wallrun'), false, 'on the water, not jumping'); }
  { const body = B.createBody({ yaw: Math.PI, world: createWorld() }); assert.equal(drive(body, runAlong).evs.some((e) => e.type === 'wallrun'), false, 'nothing there'); }
  { const { body } = wallYard(); drive(body, [...runAlong, [0.1, { move: [0.3, 1] }]]); assert.ok(body.wallrun);
    const { evs } = drive(body, [[B.STEP, { move: [0.3, 1], dash: true }]]); assert.ok(!body.wallrun && evs.some((e) => e.type === 'dash'), 'a dash takes it off the wall'); }
  // a turned house: the wall's face turned with it
  const w2 = createWorld(); w2.buildings.push({ kind: 'house', x: 10, z: 0, yaw: Math.PI / 2, t: 10, down: -1 });
  const [wx, wz] = HO.toWorld(w2.buildings[0], -1, -4.8), r = w2.wall([wx, 1, wz]);
  near(r.n[0], -1, 1e-9); near(r.n[1], 0, 1e-9, 'its back wall faces −x when it is turned a quarter (its back, local −z, turned to −x)');
});

ok('beside the house\'s long side its eaves are a ceiling to a jump from the water: the head stops under the thatch, the body is not thrown aside', () => {
  const { w } = wallYard(), body = B.createBody({ yaw: 0, world: w }); body.p = [-3.6, 0, 0]; body.was = [...body.p];
  const { top } = drive(body, [[1.2, { jump: true, jumpPressed: true }]]);
  near(top + B.createBody().p[1] + BODY.tall, HO.roofIn(HO.HOUSE.eave), 1e-6, 'the head under the eave\'s edge');
  near(body.p[0], -3.6, 1e-9, 'where it jumped');
});

// ---- the island (island/ground.js, lordhowe.bin, lordhowe-shape.js). Colin, 17 Nov: "let's pick a random small island on
// earth ... just the general shape and size and expected fauna of a small island of your choice". Lord Howe Island.
const islandBytes = readFileSync(join(ROOT, 'src/game/island/lordhowe.bin'));
const islandHead = GR.parseHead(new Uint8Array(islandBytes));
const islandGround = GR.createGround(islandHead, GR.heightsOf(islandHead, new Uint8Array(inflateSync(islandBytes.subarray(GR.HEAD)))));
// a little made-up ground: flat sand at 1 m, a cliff rising 20 m at x = 40, deep sea west of x = −40
function madeGround() {
  const w = 12, h = 6, S = 16, x0 = -88, z0 = -40, main = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = x0 + i * S; main[j * w + i] = x >= 40 ? 21 : x <= -40 ? -10 : 1; }
  return GR.createGround({ w, h, spacing: S, x0, z0, pw: 1, ph: 1, px0: 1e6, pz0: 1e6 }, { main, pyramid: new Float32Array(1) });
}

ok('Lord Howe Island from the tiles: a crescent 11.7 km long, its two mountains in the south and two hills in the north, a little more land than it has (the data blurs its shore)', () => {
  assert.equal(SHAPE.name, 'Lord Howe Island');
  within(SHAPE.length, 10500, 12500, 'its length');
  within(SHAPE.mainKm2, 13, 20, 'its main island\'s land (its own figure: 14.55 km²)');
  const named = Object.fromEntries(SHAPE.peaks.map((p) => [p.name, p]));
  within(named['Mount Gower'].h, 800, 900, 'Mount Gower (875 m)'); within(named['Mount Lidgbird'].h, 640, 800, 'Mount Lidgbird (777 m)');
  assert.ok(named['Mount Lidgbird'].z < named['Mount Gower'].z && named['Mount Gower'].z > 2000, 'Gower south of Lidgbird, both in the south');
  assert.ok(named['Mount Eliza'] && named['Malabar Hill'] && named['Mount Eliza'].x < named['Malabar Hill'].x && named['Malabar Hill'].z < -2000, 'the two hills of the north, Eliza to the west');
  near(islandGround.height(named['Mount Gower'].x, named['Mount Gower'].z), named['Mount Gower'].h, 0.6, 'the ground at its summit is its summit');
  assert.ok(islandBytes.length < 400000, 'the heights travel in under 400 KB: ' + islandBytes.length);
  near(SHAPE.pyramid.h, 551, 1, 'Ball\'s Pyramid, as high as it is (modelled: the tiles miss it)'); assert.equal(SHAPE.pyramid.modelled, true);
  within(Math.hypot(SHAPE.pyramid.x, SHAPE.pyramid.z), 26000, 30000, 'and as far off');
  near(islandGround.height(SHAPE.pyramid.x + 30, SHAPE.pyramid.z), islandGround.height(SHAPE.pyramid.x + 30, SHAPE.pyramid.z), 0);
  assert.ok(Math.max(...[0, 60, -60].map((d) => islandGround.height(SHAPE.pyramid.x + d, SHAPE.pyramid.z - 90))) > 400, 'it stands up out of the sea where it is');
});

ok('the lagoon lies in the hollow on the west, shallow, closed by a reef crest; the sea is deep off the east cliffs and off Mount Gower\'s west; the arrival is on its beach facing Gower', () => {
  const a = SHAPE.arrive;
  within(islandGround.height(a.x, a.z), 0.5, 7, 'the beach');
  const lagoon = [150, 400, 700].map((d) => islandGround.depth(a.x - d, a.z));
  assert.ok(lagoon.every((d) => d > 0.2 && d < 4.5), 'shallow water west of the beach: ' + lagoon.map((d) => d.toFixed(2)));
  // across the lagoon to the west: shallow, then the crest, then deep
  let crest = null, deep = null;
  for (let x = a.x - 100; x > a.x - 3500; x -= 16) { const d = islandGround.depth(x, a.z); if (crest === null && d < 0.7 && x < a.x - 400) crest = x; if (crest !== null && d > 8) { deep = x; break; } }
  assert.ok(crest !== null && deep !== null && crest - deep < 700, 'a reef crest, and deep water beyond it within 700 m: ' + [crest, deep]);
  const g = SHAPE.peaks.find((p) => p.name === 'Mount Gower');
  let east = g.x; while (islandGround.height(east, g.z) > 0) east += 16;
  assert.ok(islandGround.depth(east + 600, g.z) > 6, 'deep water off Gower\'s east cliffs (past the rocks at their foot): ' + islandGround.depth(east + 600, g.z).toFixed(1));
  let west = g.x; while (islandGround.height(west, g.z) > 0) west -= 16;
  assert.ok(islandGround.depth(west - 250, g.z) > 6, 'and off its west, beyond the lagoon\'s end');
  near(Math.atan2(g.x - a.x, g.z - a.z), a.facing, 1e-3, 'facing Mount Gower');
  assert.ok(SHAPE.lagoonKm2 > 4 && SHAPE.lagoonKm2 < 13, 'the lagoon\'s size: ' + SHAPE.lagoonKm2);
});

ok('the ground a body stands on is the drawn triangles: exact at the samples, on the two triangles between them; off both grids, the shelf', () => {
  const H = islandHead, S = H.spacing, m = islandGround.hts.main, i = 300, j = 400, x = H.x0 + i * S, z = H.z0 + j * S;
  near(islandGround.height(x, z), m[j * H.w + i], 1e-4, 'at a sample');
  const h00 = m[j * H.w + i], h10 = m[j * H.w + i + 1], h01 = m[(j + 1) * H.w + i], h11 = m[(j + 1) * H.w + i + 1];
  near(islandGround.height(x + 0.25 * S, z + 0.25 * S), h00 + (h10 - h00) * 0.25 + (h01 - h00) * 0.25, 1e-4, 'on the first triangle');
  near(islandGround.height(x + 0.75 * S, z + 0.75 * S), h11 + (h01 - h11) * 0.25 + (h10 - h11) * 0.25, 1e-4, 'on the second');
  assert.equal(islandGround.height(60000, 60000), GR.SEA_FLOOR, 'the shelf beyond');
  let steep = 0; for (let k = 0; k < 4000; k++) { const px = H.x0 + 2000 + (k % 80) * 70, pz = H.z0 + 3000 + Math.floor(k / 80) * 160; const [sx, sz] = islandGround.slope(px, pz); if (Math.hypot(sx, sz) > GR.STEEP) steep++; }
  assert.ok(steep > 40, 'the island has cliffs too steep to walk up: ' + steep + ' of 4000 places');
});

ok('a body on the ground: it stands on the land, walks along it, is held at the foot of a cliff, swims in deep water with its head out (slower, a small kick for a jump), runs along a cliff', () => {
  const w = createWorld(); w.ground = madeGround();
  const body = B.createBody({ yaw: Math.PI / 2, world: w }); body.p = [0, 1, 0]; body.was = [...body.p];
  walk(body, [0, 0], 0, 0.2); near(body.p[1], 1, 1e-9, 'on the sand');
  // east, at the cliff (the eye looking along +x: yaw −π/2, forward +x)
  walk(body, [0, 1], -Math.PI / 2, 4);
  assert.ok(body.p[0] < 40 && body.p[0] > 20 && body.p[1] < 10, 'held below the cliff: ' + body.p.map((v) => v.toFixed(2)));
  // the cliff to run along: beside it, at its foot
  near(w.wall([39.5 - 16 + 16, 1.4, 0]) ? 1 : 0, 1, 0, 'a cliff is a wall beside it');
  // west, into the deep: it swims
  const s2 = B.createBody({ yaw: -Math.PI / 2, world: w }); s2.p = [-30, 1, 0]; s2.was = [...s2.p];
  walk(s2, [0, 1], Math.PI / 2, 12);
  assert.ok(s2.p[0] < -50 && s2.swim, 'out into the deep (at a swimmer\'s pace): ' + s2.p[0].toFixed(1));
  near(s2.p[1], -GR.SWIM, 1e-6, 'its feet SWIM down, its head out');
  near(Math.hypot(s2.v[0], s2.v[2]), B.SWIM.speed, 1e-6, 'at a swimmer\'s pace');
  let top = s2.p[1]; walk(s2, [0, 0], 0, 0.02, { jump: true, jumpPressed: true }); for (let t = 0; t < 1; t += B.STEP) { B.stepBody(s2, { move: [0, 0], yaw: 0, jump: true }, B.STEP); top = Math.max(top, s2.p[1]); }
  assert.ok(top - -GR.SWIM < 0.6 && top - -GR.SWIM > 0.2, 'a kick up out of the water: ' + (top + GR.SWIM).toFixed(2));
  assert.equal(w.wet(-60, 0), true); assert.equal(w.wet(0, 0), false, 'the land is dry');
  assert.ok(w.solid([60, 5, 0]) && !w.solid([60, 25, 0]), 'what flies stops in the ground');
  assert.ok(w.eye([0, 2, 0], [80, 2, 0]) < 0.6, 'the eye stays out of the hill');
});

// ---- the island's life (island/life.js): its palms and the animals expected there
ok('kentia palms grow thick on forest ground and here and there on the grass flats (never on the beach, the cliffs or in the sea), the same palm in the same place every time', () => {
  const a = SHAPE.arrive, hills = [-1500, -4000];                       // the northern hills, under their forest
  const p1 = LF.palmsNear(islandGround, hills[0], hills[1], 120), p2 = LF.palmsNear(islandGround, hills[0], hills[1], 120);
  assert.deepEqual(p1, p2, 'the same every time');
  assert.ok(p1.length > 400, 'a forest: ' + p1.length + ' palms within 120 m');
  for (const p of LF.palmsNear(islandGround, a.x + 300, a.z, 200)) { assert.ok(['forest', 'grass'].includes(LF.cover(islandGround, p.x, p.z))); assert.ok(p.y > 2.9 && p.h >= 7 && p.h <= 14); }
  assert.equal(LF.palmsNear(islandGround, a.x - 400, a.z, 60).length, 0, 'none in the lagoon');
  const covers = new Set(); for (let k = 0; k < 400; k++) covers.add(LF.cover(islandGround, a.x - 300 + k * 6, a.z));
  for (const c of ['sea', 'beach', 'forest']) assert.ok(covers.has(c), 'from the lagoon inland: ' + [...covers]);
});

ok('sooty terns wheel over open water off the north end, the east side and the south; tropicbirds glide high along Gower and Lidgbird, never into them', () => {
  const flocks = LF.flocksOf(SHAPE);
  assert.equal(flocks.length, 3);
  for (const f of flocks) for (let k = 0; k < f.n; k += 3) for (let t = 0; t < 120; t += 7) {
    const b = LF.ternAt(f, k, t);
    assert.ok(islandGround.height(b.x, b.z) < 0, `over water: flock ${f.id} bird ${k} at ${t}s`); assert.ok(b.y > 25, 'in the air');
  }
  const trop = LF.tropicsOf(SHAPE), g = SHAPE.peaks.find((p) => p.name === 'Mount Gower');
  assert.equal(trop.length, 8);
  for (const b of trop) for (let t = 0; t < 200; t += 5) {
    const q = LF.tropicAt(b, t, islandGround);
    assert.ok(q.y > islandGround.height(q.x, q.z) + 40, 'clear of the cliffs');
    assert.ok(Math.hypot(q.x - g.x, q.z - g.z) < 3600, 'about the two mountains');
  }
});

ok('woodhens stay on the forest floor round the body; a body standing still draws them to a few steps off; a dash scatters them', () => {
  const H = LF.createHens(5), body = { p: [-1500, islandGround.height(-1500, -4000), -4000], yaw: 0, dashT: 0, flying: false };   // in the northern hills' forest
  for (let t = 0; t < 40; t += 0.05) LF.stepHens(H, islandGround, body, 0.05);
  for (const h of H.hens) { assert.ok(h.placed); const c = LF.cover(islandGround, h.x, h.z); assert.ok(c === 'forest' || c === 'grass', 'on its ground: ' + c); near(h.y, islandGround.height(h.x, h.z), 1e-9); }
  // one placed near: drawn in, and kept a few steps off
  const h0 = H.hens[0]; const [px, pz] = [body.p[0] + 9, body.p[2]];
  if (LF.cover(islandGround, px, pz) === 'forest') { h0.x = px; h0.z = pz; }
  for (let t = 0; t < 12; t += 0.05) LF.stepHens(H, islandGround, body, 0.05);
  const d0 = Math.hypot(h0.x - body.p[0], h0.z - body.p[2]);
  assert.ok(d0 < LF.HEN.curious && d0 > 1.5, 'curious, and a few steps off: ' + d0.toFixed(2));
  body.dashT = 0.2;
  for (let t = 0; t < 1.2; t += 0.05) LF.stepHens(H, islandGround, body, 0.05);
  assert.ok(Math.hypot(h0.x - body.p[0], h0.z - body.p[2]) > d0 + 2, 'scattered');
});

ok('green turtles cruise the lagoon under its surface and come up to breathe; a palm\'s trunk is in a body\'s way', () => {
  const T = LF.createTurtles(islandGround, SHAPE);
  assert.equal(T.length, LF.TURTLE.n);
  let breaths = 0;
  for (let t = 0; t < 120; t += 0.1) {
    breaths += LF.stepTurtles(T, islandGround, 0.1, t).length;
    for (const u of T) { assert.ok(islandGround.depth(u.x, u.z) > 0.5, 'in the water'); assert.ok(u.y < 0, 'under its surface'); }
  }
  assert.ok(breaths >= T.length * 2, 'up to breathe: ' + breaths);
  // a trunk: walked at, the body is held off it
  const w = createWorld(); w.ground = islandGround; w.trunks = (x, z) => LF.trunksNear(islandGround, x, z);
  const palm = LF.palmsNear(islandGround, -1500, -4000, 60).find((p) => LF.palmsNear(islandGround, p.x - 2, p.z, 3.2).length === 1 && islandGround.depth(p.x - 2, p.z) === 0);
  const body = B.createBody({ world: w, yaw: 0 }); body.p = [palm.x - 2, islandGround.height(palm.x - 2, palm.z), palm.z]; body.was = [...body.p];
  walk(body, [0, 1], -Math.PI / 2, 1.5);
  assert.ok(Math.hypot(body.p[0] - palm.x, body.p[2] - palm.z) >= BODY.rad + LF.PALM.trunk - 1e-6, 'held off the trunk: ' + Math.hypot(body.p[0] - palm.x, body.p[2] - palm.z).toFixed(3));
});

// ---- building and fighting on the island: a building stands on its ground; bots hover over it
ok('on the island a house stands with its way in at the ground\'s height, is walked into, its floor under the body; where the ground falls away or rises behind, nothing is built', () => {
  const w = createWorld(); w.ground = islandGround;
  const a = SHAPE.arrive;
  // facing inland (east) from the beach the ground rises behind where it would stand: not built, and why
  const up = B.createBody({ world: w, yaw: Math.PI / 2 }); up.p = [a.x + 30, islandGround.floor(a.x + 30, a.z), a.z];
  const r0 = w.build(up, 'house'); assert.equal(r0.did, 'steep'); assert.equal(r0.rises, true);
  // from the flats behind the beach, facing the lagoon (downhill): it goes up between the body and the beach
  const body = B.createBody({ world: w, yaw: -Math.PI / 2 }); body.p = [a.x + 40, islandGround.floor(a.x + 40, a.z), a.z]; body.was = [...body.p];
  const r = w.build(body, 'house');
  assert.equal(r.did, 'up', 'built: ' + JSON.stringify(r.did === 'steep' ? r.fall : r.did));
  const b = r.b; w.update(10);
  const [ex, ez] = KINDS.house.entry(b);
  near(b.y, islandGround.height(ex, ez), 1e-9, 'its way in at the ground\'s height'); assert.ok(b.y > 1, 'raised to it: ' + b.y.toFixed(2));
  // its door, walked to and in: the body stands on its floor, at its height
  const [dx, dz] = HO.doorWorld(b); body.p = [dx + Math.sin(b.yaw) * 3, islandGround.floor(dx + Math.sin(b.yaw) * 3, dz + Math.cos(b.yaw) * 3), dz + Math.cos(b.yaw) * 3]; body.was = [...body.p];
  const eyeYaw = b.yaw;                                  // the eye looking along the house's −z (into it, from its front)
  for (let t = 0; t < 5 && !w.inside(body.p); t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: eyeYaw, pitch: 0 }, B.STEP); }
  assert.ok(w.inside(body.p)?.kind === 'house', 'in at its door: ' + body.p.map((v) => v.toFixed(2)));
  near(body.p[1], b.y + HO.HOUSE.floor, 1e-6, 'on its floor, at its height');
  assert.equal(w.within(b, body.p), true);
  assert.ok(w.built(b.x, b.z) && !w.built(b.x + 30, b.z), 'its footprint is built on (no palm grows there; no trunk is in the way in it)');
  // where the ground falls away (Mount Lidgbird's flank): not built
  const lid = SHAPE.peaks.find((p) => p.name === 'Mount Lidgbird');
  const steep = B.createBody({ world: w, yaw: 0 }); steep.p = [lid.x + 300, islandGround.height(lid.x + 300, lid.z), lid.z];
  const r2 = w.build(steep, 'shelter');
  assert.equal(r2.did, 'steep'); assert.ok(r2.fall > 1.4);
  // and in the void, as before: at the water's height
  const v = createWorld(), vb = B.createBody({ world: v, yaw: 0 }); assert.equal(v.build(vb, 'house').b.y, 0);
});

ok('on the island a workshop stands where a house would, its plinth at the ground\'s height before its steps; walked up them and in at its opening, the body stands on its floor', () => {
  const w = createWorld(); w.ground = islandGround;
  const a = SHAPE.arrive, body = B.createBody({ world: w, yaw: -Math.PI / 2 }); body.p = [a.x + 40, islandGround.floor(a.x + 40, a.z), a.z]; body.was = [...body.p];
  const r = w.build(body, 'workshop'); assert.equal(r.did, 'up', 'built: ' + JSON.stringify(r.did === 'steep' ? r.fall : r.did));
  const b = r.b; w.update(10);
  const [ex, ez] = KINDS.workshop.entry(b); near(b.y, islandGround.height(ex, ez), 1e-9, 'its way in at the ground\'s height');
  const [sx, sz] = WO.toWorld(b, 0, WO.REACH_Z + 1); body.p = [sx, islandGround.floor(sx, sz), sz]; body.was = [...body.p];
  for (let t = 0; t < 6 && !w.inside(body.p); t += B.STEP) { body.was = [...body.p]; B.stepBody(body, { move: [0, 1], yaw: b.yaw, pitch: 0 }, B.STEP); }
  assert.ok(w.inside(body.p)?.kind === 'workshop', 'in at its opening: ' + body.p.map((v) => v.toFixed(2)));
  near(body.p[1], b.y + WO.WORKSHOP.floor, 1e-6, 'on its floor, at its height');
  assert.ok(w.built(b.x + 8, b.z) === true && w.built(b.x + 10, b.z) === false, 'no palm grows within its footprint\'s circle');
});

ok('on the island the hall stands in the lagoon\'s shallows by the beach, facing the water; where the ground falls away under its broad terraces, it is not built', () => {
  const w = createWorld(); w.ground = islandGround;
  const a = SHAPE.arrive, body = B.createBody({ world: w, yaw: -Math.PI / 2 }); body.p = [a.x - 20, islandGround.floor(a.x - 20, a.z), a.z];
  const built = w.build(body, 'hall'); assert.equal(built.did, 'up', 'built: ' + JSON.stringify(built.did === 'steep' ? built.fall : built.did));
  const w2 = createWorld(); w2.ground = islandGround;
  const at = B.createBody({ world: w2, yaw: -Math.PI / 2 }); at.p = [a.x + 40, islandGround.floor(a.x + 40, a.z), a.z];
  assert.equal(w2.build(at, 'hall').did, 'steep', 'where the house stands (the ground falls 5.6 m under the hall\'s terraces)');
});

ok('on the island a bot comes up out of the ground where it is called and hovers over whatever is under it, never inside a hill', () => {
  const w = createWorld(); w.ground = islandGround;
  const c = CB.createCombat({ seed: 4 }), hills = [-1500, -4000], body = B.createBody({ world: w, yaw: 0 });
  body.p = [hills[0], islandGround.height(hills[0], hills[1]), hills[1]];
  const b = CB.spawnBot(c, body, Math.PI / 2, 2);
  for (let t = 0; t < 8; t += 1 / 60) {
    CB.stepCombat(c, 1 / 60, { body, aim: { from: [body.p[0], body.p[1] + 2, body.p[2]], dir: [1, 0, 0] }, hands: {}, creative: true, world: w });
    if (b.mode === 'fight') assert.ok(b.p[1] > islandGround.height(b.p[0], b.p[2]) + 0.5, 'over the ground: ' + (b.p[1] - islandGround.height(b.p[0], b.p[2])).toFixed(2));
  }
  assert.equal(b.mode, 'fight');
  within(b.p[1] - Math.max(0, islandGround.height(b.p[0], b.p[2])), 0.8, 3.5, 'hovering its height over the ground');
});

console.log(`\n${passed} checks passed.`);
