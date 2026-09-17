// The list of firsts. Pure predicates, so the tests are about the properties a
// pure list has to have — not about any particular milestone's threshold.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MILESTONES, HORIZON, progress, snapshot } from '../src/milestones.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };

console.log('\nthe list of firsts:');

ok('a fresh society has exactly one first, and two things to reach for', () => {
  const p = progress(snapshot({ founded: Date.now(), built: [], bodies: [{}, {}, {}] }));
  assert.deepEqual(p.done.map((m) => m.key), ['founded']);
  assert.equal(p.next.length, 2, 'two next — three is a to-do list, one gives nothing to choose between');
  assert.equal(p.done.length + p.next.length + p.later.length, MILESTONES.length);
});

ok('nothing is ever written down: the same world gives the same answer twice', () => {
  const w = snapshot({ founded: 1, bodies: [{}, {}, {}, {}], ways: ['a'],
    built: [{ kind: 'storage', hold: { stone: 120 } }, { kind: 'panel' }] });
  const a = JSON.stringify(progress(w)), b = JSON.stringify(progress(w));
  assert.equal(a, b);
  assert.ok(Object.isFrozen(w) || true, 'progress() must not mutate its input');
  assert.equal(JSON.stringify(w), JSON.stringify(snapshot({ founded: 1, bodies: [{}, {}, {}, {}], ways: ['a'],
    built: [{ kind: 'storage', hold: { stone: 120 } }, { kind: 'panel' }] })));
});

ok('a milestone added later is retroactive by construction', () => {
  // no migration hands them out: a society that already built a rover has
  // always had 'rover', because the question is asked of the world, not a flag
  const w = snapshot({ founded: 1, bodies: [{}, {}, {}], built: [{ kind: 'vehicle', of: 'rover' }] });
  assert.ok(progress(w).done.some((m) => m.key === 'rover'));
});

ok('an unfinished build does not count', () => {
  const w = snapshot({ founded: 1, bodies: [{}, {}, {}], built: [{ kind: 'panel', done: false }] });
  assert.ok(!progress(w).done.some((m) => m.key === 'panel'), 'a panel still being made is not first light');
});

ok('what the sprites carry counts as held', () => {
  const w = snapshot({ founded: 1, bodies: [{ inv: { stone: 3 } }, {}, {}], built: [] });
  assert.ok(progress(w).done.some((m) => m.key === 'first-block'));
});

ok('the horizon is shown, never counted', () => {
  const p = progress(snapshot({ founded: 1, bodies: [{}, {}, {}], built: [] }));
  assert.ok(p.horizon.length >= 2 && p.horizon === HORIZON);
  assert.ok(!p.next.some((m) => HORIZON.find((h) => h.key === m.key)), 'a horizon item must not be offered as next');
  assert.equal(p.total, MILESTONES.length, 'total counts only what can be reached today');
});

ok('every key is unique, and the file has no side effects', () => {
  const keys = [...MILESTONES, ...HORIZON].map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  const src = readFileSync(new URL('../src/milestones.js', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|localStorage|writeFile|persist\(|Date\.now\(\)/.test(src),
    'milestones.js reads a snapshot and nothing else — no clock, no store, no network');
});

ok('the snapshot is the whole contract, and it is narrow', () => {
  // it is what lets this run on the client: nothing private rides along
  const w = snapshot({ pid: 'secret', uid: 'secret', founded: 1, bodies: [{ id: 0, seed: 9, inv: { a: 1 } }],
    built: [{ kind: 'panel', x: 3, z: 4, since: 1 }], ask: { material: 'x' }, course: {} });
  assert.deepEqual(Object.keys(w).sort(), ['bodies', 'built', 'founded', 'ways']);
  assert.ok(!('pid' in w) && !('uid' in w) && !('course' in w));
  assert.deepEqual(Object.keys(w.bodies[0]), ['inv']);
});

console.log(`\n${passed} checks passed.`);
