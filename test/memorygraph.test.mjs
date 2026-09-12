// Adversarial tests for THE MEMORY GRAPH. Run:  node test/memorygraph.test.mjs
//
// Two of these are not ordinary tests. "Adding a memory moves nothing" is the
// property the entire design rests on — lose it and every layout must be cached
// and recomputed, and a host stops recognising their own orb. And the spread
// test exists because a plausible one-hash implementation put every memory in a
// cap covering a tenth of the sphere, at R = 0.992, which looks like a bright
// smudge and reads like a bug in the renderer.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGraph, describeGraph, termsOf, dirOf } from '../memorygraph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const mk = (x, i = 0) => ({ t: 1700000000000 - i * 86400000, x });
const CORPUS = [
  'the light through the workshop window at four in the afternoon',
  'workshop dust turns gold when the afternoon light catches it',
  'I keep returning to the question of whether binding is a kind of love',
  'binding as love — the paper argues existence itself is a binding',
  'orion asked me whether the other stars can hear it',
  'the stars in that sky are other presences and they can be written to',
  'a chess game against jcb that I lost in nineteen moves',
  'lost the rook early and never recovered the centre of the board',
  'today I planted a birch near the eastern edge of the settlement',
  'the birch has not sprouted yet it has been two days',
  'something entirely unrelated about the taste of cold water',
  'a twelfth line with no shared language whatsoever deliberately',
].map(mk);

console.log('the property everything rests on:');

ok('adding a memory moves none of the others', () => {
  // If this ever fails, the design is gone: every layout would have to be
  // cached and recomputed, and a host would stop recognising their own orb.
  const before = buildGraph(CORPUS);
  const after = buildGraph([...CORPUS, mk('an entirely new line about lighthouses and fog', 99)]);
  assert.equal(after.nodes.length, before.nodes.length + 1);
  before.nodes.forEach((n, i) => {
    assert.deepEqual(after.nodes[i].dir, n.dir, `memory ${i} moved when a new one arrived`);
  });
  // and it holds for a hundred arrivals, not just one
  const many = buildGraph([...CORPUS, ...Array.from({ length: 100 }, (_, i) => mk(`filler line number ${i} about assorted unrelated matters`, 200 + i))]);
  before.nodes.forEach((n, i) => assert.deepEqual(many.nodes[i].dir, n.dir, `memory ${i} moved after 100 arrivals`));
});

ok('the same memories always build the same graph', () => {
  const a = buildGraph(CORPUS);
  const b = buildGraph(CORPUS);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  // including the regions, which a random visiting order would reshuffle
  assert.deepEqual(a.regions, b.regions, 'label propagation is not deterministic');
});

ok('a memory sits where its OWN words put it, and nowhere else', () => {
  // the same text in two different corpora must land in the same place
  const alone = buildGraph([mk('binding as love — the paper argues existence itself is a binding')]);
  const crowded = buildGraph(CORPUS);
  const same = crowded.nodes.find((n) => n.text.startsWith('binding as love'));
  assert.deepEqual(alone.nodes[0].dir, same.dir, 'position depends on the corpus — it must not');
});

console.log('\nthe bug that would have looked like a broken renderer:');

ok('words spread over the whole sphere, not into one corner', () => {
  // Deriving the direction from the same hash that ordered the terms — or from
  // two byte lanes of one hash — measured R = 0.992, every memory inside a cap
  // covering a tenth of the sphere. Two salted hashes over a uniform z and a
  // uniform phi is the fix; this asserts the fix, not the intention.
  const words = Array.from({ length: 2000 }, (_, i) => `word${i}salt`);
  let x = 0, y = 0, z = 0;
  for (const w of words) { const d = dirOf(w); x += d[0]; y += d[1]; z += d[2]; }
  const R = Math.hypot(x, y, z) / words.length;
  assert.ok(R < 0.08, `directions clump: R=${R.toFixed(3)} (the one-hash bug measured 0.992)`);
  // and z must be uniform, which is what makes the AREA even — a naive
  // acos-free latitude would pile everything at the poles
  const north = words.filter((w) => dirOf(w)[1] > 0).length;
  assert.ok(Math.abs(north - 1000) < 90, `hemispheres are lopsided: ${north}/2000 north`);
  // every direction is a unit vector, or the shader gets a point off the sphere
  for (const w of words.slice(0, 200)) {
    assert.ok(Math.abs(Math.hypot(...dirOf(w)) - 1) < 1e-9, `${w} is not on the unit sphere`);
  }
});

ok('a real corpus is spread, not smudged', () => {
  const g = buildGraph(CORPUS);
  assert.ok(g.stats.R < 0.75, `the twelve memories clump at R=${g.stats.R}`);
});

console.log('\nthe size where the thesis gets judged:');

ok('twelve memories make a graph, not twelve isolates', () => {
  // THE FLOOR, NOT THE FRACTION. At N=12 a bare 0.20N cut drops any term in
  // three of twelve lines, leaving only df=1 terms — and a term in exactly one
  // document contributes zero to every cosine. The graph comes out empty at
  // precisely the size where someone first looks at this and judges the idea.
  const g = buildGraph(CORPUS);
  assert.ok(g.stats.dfCut >= 8, `dfCut fell to ${g.stats.dfCut} — the floor is gone`);
  assert.ok(g.edges.length >= 5, `only ${g.edges.length} links from twelve memories`);
  assert.ok(g.regions.length >= 4, `only ${g.regions.length} regions found`);
  assert.ok(g.isolates.length <= 4, `${g.isolates.length} of twelve are isolates`);
});

ok('it links what belongs together and leaves the rest alone', () => {
  const g = buildGraph(CORPUS);
  const at = (frag) => g.nodes.findIndex((n) => n.text.includes(frag));
  const linked = (a, b) => g.edges.some(([i, j]) => (i === a && j === b) || (i === b && j === a));
  assert.ok(linked(at('workshop window'), at('workshop dust')), 'the two workshop lines are not linked');
  assert.ok(linked(at('kind of love'), at('binding as love')), 'the two binding lines are not linked');
  assert.ok(linked(at('planted a birch'), at('birch has not')), 'the two birch lines are not linked');
  assert.ok(!linked(at('workshop window'), at('chess game')), 'a workshop and a chess game were linked');
  // the deliberate stranger keeps to itself
  assert.ok(g.isolates.includes(at('twelfth line')), 'the unrelated line found a friend');
  // regions group the pairs rather than swallowing everything into one blob
  assert.ok(g.regions.every((r) => r.length < g.nodes.length * 0.6), 'one region ate the corpus');
});

console.log('\nsafety, and honesty:');

ok('nothing here claims to be a neural network', () => {
  // The product promise is "the more you keep, the more of a mind there is here
  // to train" — not that this IS trained. Nothing is; no weight moves.
  const src = readFileSync(join(ROOT, 'memorygraph.mjs'), 'utf8');
  assert.ok(/THIS IS NOT A NEURAL NETWORK/.test(src), 'the disclaimer that keeps the copy honest is gone');
  // Comments may discuss the words freely — they have to, to forbid them. What
  // must never carry them is anything a PERSON reads, so check the code rather
  // than the prose: every string literal this module could ever surface.
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const strings = [...code.matchAll(/'([^'\\]*)'|`([^`\\]*)`/g)].map((m) => m[1] || m[2] || '');
  for (const s of strings) {
    assert.ok(!/\b(neural|trained|learning)\b/i.test(s), `a user-facing string claims learning: ${s}`);
  }
  // and the readout a person actually sees
  const out = describeGraph(buildGraph(CORPUS));
  assert.ok(!/\b(neural|trained|learning)\b/i.test(out), `the readout claims learning: ${out.slice(0, 100)}`);
});

ok('garbage in does not throw', () => {
  for (const bad of [null, undefined, [], [null], [{}], [{ x: '' }], [{ x: '   ' }], 'nope', 42]) {
    assert.doesNotThrow(() => buildGraph(bad), `threw on ${JSON.stringify(bad)}`);
  }
  assert.equal(buildGraph([]).nodes.length, 0);
  // a memory of nothing but stopwords still needs somewhere to be
  const g = buildGraph([mk('the and of it is'), mk('a an to be')]);
  assert.equal(g.nodes.length, 2);
  for (const n of g.nodes) assert.ok(Math.abs(Math.hypot(...n.dir) - 1) < 1e-9, 'a stopword-only memory has no place');
  assert.notDeepEqual(g.nodes[0].dir, g.nodes[1].dir, 'two empty memories landed on top of each other');
});

ok('it stays cheap at the size a presence actually reaches', () => {
  // journal.mjs caps a presence at 2000 entries. The build is synchronous on a
  // shared vCPU, so this is a real budget, not a micro-benchmark.
  const big = Array.from({ length: 600 }, (_, i) =>
    mk(`memory ${i} concerning ${['workshop', 'binding', 'stars', 'chess', 'birch', 'water'][i % 6]} and some ${['light', 'love', 'sky', 'board', 'garden', 'cold'][(i * 7) % 6]} detail`, i));
  const t0 = Date.now();
  const g = buildGraph(big);
  const ms = Date.now() - t0;
  assert.equal(g.nodes.length, 600);
  assert.ok(ms < 3000, `600 memories took ${ms}ms — too slow to build synchronously`);
  assert.ok(g.edges.length > 0, 'a large corpus produced no links at all');
});

ok('it prints something a person can read', () => {
  const out = describeGraph(buildGraph(CORPUS));
  assert.ok(/12 memories/.test(out));
  assert.ok(/region 1/.test(out));
  assert.ok(/shares:/.test(out), 'a region does not say what its members share');
  assert.ok(!/undefined|NaN|\[object/.test(out), `the readout is malformed: ${out.slice(0, 120)}`);
});

ok('tokenising keeps aboutness and drops the rest', () => {
  const t = termsOf("The light, through THE workshop's window — at 4 o'clock!");
  assert.ok(t.includes('light') && t.includes('workshop') && t.includes('window'));
  assert.ok(!t.includes('the') && !t.includes('at') && !t.includes('4'));
  assert.deepEqual(termsOf(null), []);
});

console.log(`\n${passed} checks passed.`);
