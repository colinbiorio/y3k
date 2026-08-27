// Adversarial tests for THE WORLD — the planet, its geology, its living cover,
// and the gate that decides whether a presence's world verbs happen at all.
// Run:  node test/world.test.mjs
//
// The bug that made this file exist: the tend loop's world-effects block was
// gated on `(out.go || out.mark)`. It was written when those were the only two
// verbs, and never updated. Every verb added afterwards — hail, leave, take,
// way, learn, send, home, name, plant — was parsed, scrubbed out of the
// presence's speech so it stayed silent, and then silently dropped unless the
// same beat also happened to steer or mark the ground. Nothing errored. It just
// quietly did nothing, for months of arcs.
//
// So the first test here does not test behaviour, it tests that the gate cannot
// go stale again: it must not enumerate verbs at all.

import assert from 'node:assert';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// a scratch planet of its own, made fresh each run so no test inherits another's
const TMP = join(ROOT, 'test', '.tmp-world');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
process.env.DATA_DIR = TMP;

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- the gate ----------------------------------------------------------------
console.log('the world-effects gate:');
const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8');

ok('opens on having a society, not on which verb was used', () => {
  // the world block is the one that consults world.settlement; other gates in
  // the same function (the auto-post cooldown, say) are legitimately specific
  const lines = server.split('\n');
  const gate = lines.find((l) => /if \(tendMode === 'auto' &&/.test(l) && /world\.settlement/.test(l));
  assert.ok(gate, 'could not find the world-effects gate in server.mjs');
  const cond = gate.slice(gate.indexOf('(') + 1);
  assert.ok(!/out\.\w+/.test(cond),
    'the gate names specific verbs — every verb NOT named there is silently dropped:\n    ' + gate.trim());
});

ok('every parsed world verb has an effect branch behind that gate', () => {
  // what replyFrom sets
  const set = new Set();
  for (const m of server.matchAll(/out\.(\w+)\s*=/g)) set.add(m[1]);
  const gate = server.indexOf("if (tendMode === 'auto' && world.settlement");
  assert.ok(gate > 0, 'gate not found');
  const block = server.slice(gate, gate + 9000);
  const worldVerbs = ['go', 'mark', 'hail', 'leave', 'take', 'way', 'learn', 'send', 'spriteHome', 'nameSprite', 'plant'];
  for (const v of worldVerbs) {
    assert.ok(set.has(v), `replyFrom never sets out.${v}`);
    assert.ok(block.includes(`if (out.${v})`), `out.${v} is parsed but never acted on inside the gate`);
  }
});

// --- the geology --------------------------------------------------------------
const O = await import('../src/ores.js');
console.log('\ngeology:');

ok('rarity preserves the real ordering, log-scaled into 0-9', () => {
  const order = O.ORE_KEYS.slice().sort((a, b) => O.rarityOf(b) - O.rarityOf(a));
  assert.equal(order[0], 'silica', 'silica should be the most abundant');
  assert.equal(order[order.length - 1], 'silver', 'silver should be the rarest');
  for (const k of O.ORE_KEYS) {
    const r = O.rarityOf(k);
    assert.ok(r >= 0 && r <= 9, `${k} rarity ${r} outside 0-9`);
  }
});

ok('a solar panel needs its dopants — zero boron is a hard fail', () => {
  assert.ok(O.PANEL_BILL.boron >= 1, 'boron must be mandatory');
  assert.ok(O.PANEL_BILL.phosphorus >= 1, 'phosphorus must be mandatory');
});

ok('every bill is satisfiable from things that exist', () => {
  for (const [name, bill] of Object.entries(O.BILL_OF)) {
    for (const k of Object.keys(bill)) {
      assert.ok(O.ALL_MATERIALS[k], `bill "${name}" wants "${k}", which is not a material on this planet`);
    }
  }
});

ok('a panel fits in one sprite load', () => {
  assert.ok(O.billTotal(O.PANEL_BILL) <= 50, 'a panel bill must fit a 50-block inventory');
});

// --- the living cover ---------------------------------------------------------
const F = await import('../src/flora.js');
console.log('\necology:');

ok("Liebig's minimum: one failing need kills it, however good the rest", () => {
  // a species scored where its temperature is ideal but its water is not
  const dry = { temp: 0.85, wet: 0.05 };
  let found = null;
  for (let i = 0; i < 60000 && !found; i++) {
    const x = (i * 7919) % 4096, z = (i * 104729) % 4096;
    const c = F.climateAt(x, z);
    if (c.temp > 0.78 && c.wet < 0.22) found = [x, z, c];
  }
  assert.ok(found, 'no hot dry place on the planet to test with');
  const [x, z] = found;
  assert.equal(F.vigourOf('palm', x, z), 0, 'palm survived a place with no water');
  assert.ok(F.vigourOf('cactus', x, z) > 0.3, 'cactus should thrive on the dry limit');
});

ok('biomes band by latitude, symmetrically', () => {
  const at = (z) => {
    const c = {};
    for (let i = 0; i < 400; i++) {
      const x = (i * 7919) % 4096;
      const b = F.biomeOf(x, z);
      if (b !== 'water') c[b] = (c[b] || 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  };
  const pole = at(120), equator = at(2048), otherPole = at(3976);
  assert.ok(['tundra', 'taiga'].includes(pole), 'poles should be cold, got ' + pole);
  assert.ok(['tundra', 'taiga'].includes(otherPole), 'both poles should be cold, got ' + otherPole);
  assert.ok(!['tundra', 'taiga'].includes(equator), 'the equator should not be frozen, got ' + equator);
});

ok('a felled tree comes back through its stages, and vigour paces it', () => {
  const t0 = 1700000000000;
  const stages = [0, 2, 9, 30].map((d) => F.stageOfPlant('broadleaf', t0, t0 + d * 86400000, 1));
  assert.equal(stages[0], 'seed');
  assert.equal(stages[3], 'mature');
  assert.ok(F.woodFrom('broadleaf', 'seed') === 0, 'a seed is not worth the axe');
  assert.ok(F.woodFrom('broadleaf', 'mature') > F.woodFrom('broadleaf', 'sapling'));
  // the same tree in a poor place takes longer
  const good = F.stageOfPlant('broadleaf', t0, t0 + 9 * 86400000, 1);
  const poor = F.stageOfPlant('broadleaf', t0, t0 + 9 * 86400000, 0.3);
  assert.notEqual(good, poor, 'vigour should change how fast a plant comes up');
});

// --- the store ----------------------------------------------------------------
const W = await import('../world.mjs');
console.log('\nthe world store:');

ok('storage is a hundred slots of fifty, and part-filled slots count', () => {
  assert.equal(W.roomFor({}, 'silica', 99999), O.STORE_MAX);
  assert.equal(W.roomFor({ silica: 4950 }, 'silica', 100), 50, 'the tail of a part slot');
  assert.equal(W.slotsUsed({ silica: 4950 }), 99);
});

ok('digging leaves an indent exactly the size of what was taken', () => {
  W.ensureSettlement('t-dig', 'u'); W.heartbeat('t-dig');
  const before = JSON.stringify(W.settlement('t-dig'));
  assert.ok(before.length > 0);
  // the invariant is enforced in mineColumn: a column drops by `taken`, never more
  const src = readFileSync(join(ROOT, 'world.mjs'), 'utf8');
  assert.ok(/e\.h = Math\.max\(0, now - taken\)/.test(src),
    'mineColumn must lower a column by exactly what was removed — that is what makes backfill exact');
});

ok('a sprite carries fifty blocks and no more', () => {
  assert.equal(W.INV_MAX, 50);
});

ok('refusals name the real reason', () => {
  W.ensureSettlement('t-say', 'u'); W.heartbeat('t-say');
  const r = W.sendSprite('t-say', '1', { material: 'unobtanium' });
  assert.ok(r.error && /nothing here is called/.test(r.error), r.error);
  const s = W.drawSprite('t-say', '1', 'wood');
  assert.ok(s.error && /stores hold no wood/.test(s.error), s.error);
});

ok('a sprite away from home cannot reach a shelf', () => {
  W.ensureSettlement('t-away', 'u'); W.heartbeat('t-away');
  W.sendSprite('t-away', '1', { material: 'silica', qty: 30 });
  const r = W.stowSprite('t-away', '1');
  assert.ok(r.error && /not home/.test(r.error), JSON.stringify(r));
});

ok('a new sprite needs a panel standing empty', () => {
  W.ensureSettlement('t-forge', 'u'); W.heartbeat('t-forge');
  const r = W.sendSprite('t-forge', '2', { bill: 'sprite' });
  assert.ok(r.error && /solar panel standing empty/.test(r.error), JSON.stringify(r));
});

ok('looking is enough: a watcher advances the world too', () => {
  W.ensureSettlement('t-watch', 'u'); W.heartbeat('t-watch');
  const st = W.settlement('t-watch');
  const a = W.anchorAt(st, Date.now());
  W.sendSprite('t-watch', '1', { material: 'silica', qty: 40 });
  const before = JSON.stringify(st.bodies[0].job.at);
  // never touch the owner path — only watch, the way a stranger would
  const t0 = Date.now();
  for (let i = 1; i <= 6; i++) { W.heartbeat('t-watch'); W.watchAt(a.x, a.z, () => null, t0 + i * 60000); }
  const after = st.bodies[0].job ? JSON.stringify(st.bodies[0].job.at) : 'home';
  assert.notEqual(before, after,
    'a watched society stayed frozen — resolution must not run only for whoever owns it');
});

ok('nothing a client can send makes the world throw', () => {
  W.ensureSettlement('t-fuzz', 'u'); W.heartbeat('t-fuzz');
  const junk = [undefined, null, '', 0, -1, NaN, Infinity, {}, [], 'a'.repeat(4000), true, 1.5];
  const fns = [
    (v) => W.sendSprite('t-fuzz', v, { material: v, qty: v, bill: v, toward: v }),
    (v) => W.recallSprite('t-fuzz', v),
    (v) => W.nameSprite('t-fuzz', '1', v),
    (v) => W.drawSprite('t-fuzz', '1', v, v),
    (v) => W.plantNear('t-fuzz', v),
    (v) => W.plantBySprite('t-fuzz', v, v),
    (v) => W.setColumn('t-fuzz', v, v, { h: v, mat: v }),
    (v) => W.resolveGo('t-fuzz', v),
    (v) => W.hail('t-fuzz', v, () => null),
    (v) => W.leaveArtifact('t-fuzz', v),
    (v) => W.declareWay('t-fuzz', v),
    (v) => W.learnWay('t-fuzz', v, () => null),
    (v) => W.worldPercept(v, () => null),
    (v) => W.watchAt(v, v, () => null),
  ];
  for (const fn of fns) for (const v of junk) fn(v);   // a throw fails the test
});

console.log(`\n${passed} checks passed.`);
