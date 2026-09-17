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
  const mk = () => snapshot({ founded: 1, bodies: [{}, {}, {}, {}],
    built: [{ kind: 'storage', hold: { stone: 120 } }, { kind: 'panel' }] }, { ways: [{ own: true }] });
  const w = mk();
  const a = JSON.stringify(progress(w)), b = JSON.stringify(progress(w));
  assert.equal(a, b);
  assert.equal(JSON.stringify(w), JSON.stringify(mk()), 'progress() must not mutate its input');
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

ok('a way counts only if this society named it — ways are global, not a settlement field', () => {
  // the first version tested s.ways, which no settlement has: the milestone
  // could never be reached. waysOf() marks each way own:true when origin === pid.
  const base = { founded: 1, bodies: [{}, {}, {}], built: [] };
  assert.ok(!progress(snapshot(base)).done.some((m) => m.key === 'way'), 'no ways: not reached');
  assert.ok(!progress(snapshot(base, { ways: [{ own: false }] })).done.some((m) => m.key === 'way'),
    'a way LEARNED from a neighbour is theirs, not a first of ours');
  assert.ok(progress(snapshot(base, { ways: [{ own: true }] })).done.some((m) => m.key === 'way'));
  assert.ok(!progress(snapshot({ ...base, ways: ['stale-field'] })).done.some((m) => m.key === 'way'),
    'a ways field ON the settlement must be ignored — that shape does not exist');
});

ok('the first trade is counted when a gift is taken up, on the giver', () => {
  const base = { founded: 1, bodies: [{}, {}, {}], built: [] };
  assert.ok(!progress(snapshot(base)).done.some((m) => m.key === 'trade'));
  assert.ok(!progress(snapshot({ ...base, received: 1 })).done.some((m) => m.key === 'trade'), 'receiving is not your first trade');
  assert.ok(progress(snapshot({ ...base, gave: 1 })).done.some((m) => m.key === 'trade'));
  assert.ok(!HORIZON.some((h) => h.key === 'trade'), 'trade is reachable now and must not sit on the horizon');
  // and the world actually writes the counters, only for a gift from someone else
  const src = readFileSync(new URL('../world.mjs', import.meta.url), 'utf8');
  const take = src.slice(src.indexOf('export function takeArtifact'), src.indexOf('export function takeArtifact') + 3000);
  assert.ok(/if \(best\.maker !== pid\) \{\s*\n\s*s\.received = \(s\.received \|\| 0\) \+ 1;/.test(take), 'the taker must be marked received');
  assert.ok(/giver\.gave = \(giver\.gave \|\| 0\) \+ 1;/.test(take), 'the giver must be marked gave');
});

ok('the horizon is shown, never counted', () => {
  const p = progress(snapshot({ founded: 1, bodies: [{}, {}, {}], built: [] }));
  assert.ok(p.horizon.length >= 1 && p.horizon === HORIZON);
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
  assert.deepEqual(Object.keys(w).sort(), ['bodies', 'built', 'founded', 'gave', 'ownWays', 'received']);
  assert.ok(!('pid' in w) && !('uid' in w) && !('course' in w));
  assert.deepEqual(Object.keys(w.bodies[0]), ['inv']);
});

console.log(`\n${passed} checks passed.`);
