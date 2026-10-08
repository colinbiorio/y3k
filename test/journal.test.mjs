// RECALL, and the one line a reflection brings back. Run:  node test/journal.test.mjs
//
// The search these replace kept every query word over two letters and matched
// it as a substring. On a scratch journal <<recall: the sea>> came back with the
// one line about the sea and five that only had "the" in them, and
// <<recall: it is the>> came back with six unrelated lines NOT marked as a
// fallback, so a live room was shown them as though the presence had gone
// looking. And every prompt showed only the newest 2 to 8 lines, so the deep
// past of a journal never reached the mind that kept it.
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// every store reads DATA_DIR at import time, so it has to be set first
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'y3k-journal-'));

const journal = await import('../journal.mjs');
const patterns = await import('../patterns.mjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 8, 12);           // 2026-10-08, midday UTC
const ago = (n) => NOW - n * DAY;
const texts = (r) => r.map((e) => e.text);

// The same twelve lines the old search was measured against.
const SCRATCH = [
  'the sea was grey this morning and I watched it for a long while',
  'I keep coming back to the question of what a memory is for',
  'the paper on binding argues that existence is a kind of holding',
  'jcb beat me at chess again; I lost the rook in the opening',
  'the light in the workshop at four is the best light of the day',
  'started a new piece of work about the stars and their letters',
  'my heart was not in the reading today',
  'the oak by the eastern edge has finally sprouted',
  'I wrote to the presence on the far star and heard nothing back',
  'the art of waiting is mostly the art of not counting',
  'a long day of reading about the history of maps',
  'the ocean is mostly unexplored, which comforts me somehow',
];
SCRATCH.forEach((x, i) => journal.addEntry('s', x, ago(40 - i)));

console.log('recall finds what it reached for:');

// Review, 2026-10-08: the first version reused memorygraph.mjs's STOP list,
// which also drops content words, so a recall made of them found nothing.
ok('content words a person recalls by are searched: work, light, first, new', () => {
  assert.deepEqual(texts(journal.searchEntries('s', 'work')), [SCRATCH[5]]);
  assert.ok(texts(journal.searchEntries('s', 'the new piece of work')).includes(SCRATCH[5]));
  journal.addEntry('t', 'my first thought this morning was of the old harbour', ago(3));
  journal.addEntry('t', 'nothing much happened today', ago(2));
  assert.deepEqual(texts(journal.searchEntries('t', 'first thought')), ['my first thought this morning was of the old harbour']);
});
ok('function words alone find nothing: about, all, because, something', () => {
  for (const q of ['about all of it', 'because', 'something here', 'it is the']) {
    const r = journal.searchEntries('s', q);
    assert.ok(!r.length || r.fallback, `${q} → ${texts(r).join(' | ')}`);
  }
});
ok('a word with combining marks stays one word (Devanagari vowel signs)', () => {
  journal.addEntry('d', 'नमस्ते दुनिया, आज समुद्र शांत था', ago(1));
  journal.addEntry('d', 'कुछ और', ago(1));
  assert.deepEqual(texts(journal.searchEntries('d', 'समुद्र')), ['नमस्ते दुनिया, आज समुद्र शांत था']);
});

ok("'the sea' returns only the line about the sea", () => {
  const r = journal.searchEntries('s', 'the sea');
  assert.deepEqual(texts(r), [SCRATCH[0]], 'a stop word is searching again');
  assert.equal(r.fallback, undefined, 'a real search was marked as a fallback');
});

ok("'oceans' finds 'ocean'", () => {
  assert.deepEqual(texts(journal.searchEntries('s', 'oceans')), [SCRATCH[11]]);
});

ok("'art' does not find 'heart', and 'star' does not find 'started'", () => {
  assert.deepEqual(texts(journal.searchEntries('s', 'art')), [SCRATCH[9]]);
  // 'stars' folds to 'star' and so does the query; 'started' folds to 'start'
  assert.deepEqual(texts(journal.searchEntries('s', 'star')), [SCRATCH[8], SCRATCH[5]]);
});

ok('a query of only stop words is the fallback, never a search result', () => {
  // the exact query that used to come back as six "matches" and go on air
  for (const q of ['it is the', 'what was it', 'it', '']) {
    const r = journal.searchEntries('s', q);
    assert.equal(r.fallback, true, `"${q}" was answered as a search`);
    assert.deepEqual(texts(r), SCRATCH.slice(-6), 'the fallback is the tail of the record');
  }
  // and the flag the client checks before it publishes is still set this way
  assert.ok(/recent\.fallback = true;/.test(read('journal.mjs')));
});

ok('a word nobody kept matches nothing, rather than falling back', () => {
  const r = journal.searchEntries('s', 'the volcano');
  assert.deepEqual(r, []);
  assert.equal(r.fallback, undefined, 'an honest miss became the tail of the record');
});

ok('suffixes fold both ways, within reason', () => {
  journal.addEntry('f', 'walked to the river and watched the stories end', ago(5));
  journal.addEntry('f', 'running late again, I stopped at the seed library', ago(4));
  journal.addEntry('f', 'loved the early hours, quietly', ago(3));
  journal.addEntry('f', 'an ear for the sound of rain', ago(2));
  const one = (q) => texts(journal.searchEntries('f', q));
  assert.deepEqual(one('walking'), ['walked to the river and watched the stories end']);
  assert.deepEqual(one('story'), ['walked to the river and watched the stories end']);
  assert.deepEqual(one('run'), ['running late again, I stopped at the seed library']);
  assert.deepEqual(one('stop'), ['running late again, I stopped at the seed library']);
  assert.deepEqual(one('love'), ['loved the early hours, quietly']);
  assert.deepEqual(one('quiet'), ['loved the early hours, quietly']);
  // the folds that would invent a match: "seed" is not "se", "early" is not "ear"
  assert.deepEqual(one('seeds'), ['running late again, I stopped at the seed library']);
  assert.deepEqual(one('ear'), ['an ear for the sound of rain']);
});

ok('a rare word outranks a common one, newest first among equals', () => {
  journal.addEntry('r', 'the light again, nothing more', ago(9));
  journal.addEntry('r', 'light on the floor', ago(8));
  journal.addEntry('r', 'the kingfisher by the light', ago(7));
  journal.addEntry('r', 'light, only light', ago(6));
  // "kingfisher" is in one line of four and "light" in all four, so the line
  // with both comes first and the rest follow newest first
  const r = texts(journal.searchEntries('r', 'light kingfisher'));
  assert.deepEqual(r, ['the kingfisher by the light', 'light, only light', 'light on the floor', 'the light again, nothing more']);
});

ok('the only line of a young journal can still be found', () => {
  // with a bare log(N/df) its weight is log(1/1) = 0, and nothing would come back
  journal.addEntry('one', 'I named the cat Ptolemy', ago(1));
  assert.deepEqual(texts(journal.searchEntries('one', 'ptolemy')), ['I named the cat Ptolemy']);
});

ok('recall drops function words only, not the memory graph\'s wider list', () => {
  assert.ok(!/import \{ STOP \} from '\.\/memorygraph\.mjs';/.test(read('journal.mjs')), 'recall drops content words again');
  assert.ok(/const QUIET = new Set\(/.test(read('journal.mjs')));
});

console.log('one line from long ago, in a reflection:');

// A record with no anniversaries in it: 40 lines kept 11..50 days ago, then a
// tail of 8 kept in the last few days. Days 30 and 7 are skipped on purpose.
function fill(pid, extraDays = []) {
  const days = [];
  for (let d = 50; d >= 11; d--) if (d !== 30) days.push(d);
  for (const d of extraDays) days.push(d);
  for (const d of [6, 5, 4, 3, 2, 1, 0.5, 0]) days.push(d);   // the shown tail
  days.sort((a, b) => b - a);
  for (const d of days) journal.addEntry(pid, `kept ${d} days back (${pid})`, ago(d));
}

ok('the anniversary line comes back when there is one, the deepest first', () => {
  fill('ann', [30, 100]);
  const r = journal.resurface('ann', { skipNewest: 8, now: NOW });
  assert.equal(r.text, 'kept 100 days back (ann)');
  assert.equal(r.anniversary, true);
  assert.equal(r.daysAgo, 100);
  // the next reflection may not repeat it, so the other anniversary comes next
  const r2 = journal.resurface('ann', { skipNewest: 8, now: NOW });
  assert.equal(r2.text, 'kept 30 days back (ann)');
});

ok('never a line from the tail the same prompt already shows, even on an anniversary', () => {
  // a line kept exactly 7 days ago that is still among the newest four
  for (let d = 40; d >= 20; d--) journal.addEntry('tail', `old ${d}`, ago(d));
  for (const d of [7, 3, 2, 1]) journal.addEntry('tail', `new ${d}`, ago(d));
  for (let i = 0; i < 30; i++) {
    const r = journal.resurface('tail', { skipNewest: 4, now: NOW });
    assert.ok(r && /^old /.test(r.text), `brought back "${r && r.text}" from the shown tail`);
  }
});

ok('with no anniversary, the pick is from the older half', () => {
  fill('half');
  const r = journal.resurface('half', { skipNewest: 8, now: NOW });
  assert.equal(r.anniversary, false);
  // the pool is the 39 lines kept 11..50 days back; the older half is 31..50
  assert.ok(r.daysAgo >= 31, `picked a line from ${r.daysAgo} days back`);
});

ok('never the same line twice in any run of ten', () => {
  fill('ten');
  const picks = [];
  for (let i = 0; i < 60; i++) picks.push(journal.resurface('ten', { skipNewest: 8, now: NOW + i * 3600000 })?.text);
  for (let i = 0; i < picks.length; i++) {
    assert.ok(picks[i], `reflection ${i} brought nothing back from a 39-line pool`);
    assert.ok(!picks.slice(Math.max(0, i - 10), i).includes(picks[i]), `"${picks[i]}" came back within ten`);
  }
});

ok('a small record goes quiet rather than repeating, and comes back after ten', () => {
  for (const d of [20, 19, 18]) journal.addEntry('few', `few ${d}`, ago(d));
  journal.addEntry('few', 'few tail', ago(0));
  const picks = [];
  for (let i = 0; i < 14; i++) picks.push(journal.resurface('few', { skipNewest: 1, now: NOW })?.text ?? null);
  assert.equal(new Set(picks.slice(0, 3)).size, 3, 'the first three are the three old lines');
  assert.deepEqual(picks.slice(3, 11), Array(8).fill(null), 'a line came back within ten');
  assert.ok(picks.slice(11).some(Boolean), 'the record stayed silent for good');
  for (let i = 0; i < picks.length; i++) {
    if (picks[i]) assert.ok(!picks.slice(Math.max(0, i - 10), i).includes(picks[i]));
  }
});

ok('the pick is deterministic, and an empty or all-tail record gives nothing', () => {
  fill('d1');
  const a = journal.resurface('d1', { skipNewest: 8, now: NOW });
  journal.forget(['d1']);
  fill('d1');
  assert.deepEqual(journal.resurface('d1', { skipNewest: 8, now: NOW }), a, 'the same record and day picked differently');
  assert.equal(journal.resurface('nobody', { now: NOW }), null);
  journal.addEntry('short', 'only line', ago(3));
  assert.equal(journal.resurface('short', { skipNewest: 4, now: NOW }), null);
});

ok('forgetting a presence forgets what came back too', () => {
  assert.ok(/surfaced\.delete\(pid\)/.test(read('journal.mjs')));
});

console.log('it reaches the presence and no one else:');

ok('the line is only ever handed to the reflection prompt', () => {
  const srv = read('server.mjs');
  // one call, made only for a reflection, sized by the tail that prompt shows
  const calls = [...srv.matchAll(/journal\.resurface\(/g)].length;
  assert.equal(calls, 1, `resurface is called ${calls} times`);
  assert.ok(/longAgo: tendMode === 'reflect' \? journal\.resurface\(presence\.id, \{ skipNewest: T\.journalLines \}\) : null,/.test(srv));
  // the bag it rides in goes into prompt builders and nowhere else: a response
  // or a publish that took mindCtx would carry the line to a browser
  const uses = [...srv.matchAll(/.{0,24}\bmindCtx\b.{0,2}/g)].map((m) => m[0]);
  for (const u of uses) {
    assert.ok(/const mindCtx =/.test(u) || /[A-Z_]+_HINT\(mindCtx\)/.test(u), `mindCtx used outside a prompt: ${u}`);
  }
  // and longAgo is read only by the reflection hint
  const reads = [...srv.matchAll(/\bo\.longAgo\b/g)].length;
  const hint = srv.slice(srv.indexOf('const REFLECT_HINT'), srv.indexOf('// THE GAME.'));
  assert.equal([...hint.matchAll(/\bo\.longAgo\b/g)].length, reads);
  assert.ok(/It is yours; it may no longer be true\./.test(srv));
  // the browser never so much as names it
  const client = readdirSync(join(ROOT, 'src')).filter((f) => /\.m?js$/.test(f))
    .map((f) => read(join('src', f))).join('\n') + read('index.html');
  assert.ok(!/longAgo|resurface/.test(client), 'the client has learned of the resurfaced line');
});

ok('a reflection sets the first noticing beside the latest six', () => {
  // distinct enough that the store's near-duplicate check keeps all nine
  const NOTICED = [
    'early on I wanted every page to explain itself',
    'chess games make me slower and kinder afterwards',
    'silence used to frighten me and now it rests me',
    'letters across the sky matter more than posts',
    'returning to oaks whenever the reading gets heavy',
    'stars appear in nearly everything I write lately',
    'maps pull at me the way questions once did',
    'rain sounds keep showing up when nothing happens',
    'finishing things has become harder than starting them',
  ];
  NOTICED.forEach((x, i) => patterns.notice('n', x, ago(20 - i)));
  const r = patterns.readout('n');
  assert.equal(r.total, 9, 'the fixture lost a noticing to the near-duplicate check');
  assert.equal(r.recent.length, 6);
  assert.deepEqual(r.first, { x: NOTICED[0] });
  // while the first is still one of the six, it is not offered twice
  NOTICED.slice(0, 3).forEach((x, i) => patterns.notice('m', x, ago(5 - i)));
  assert.equal(patterns.readout('m').first, null);
  assert.equal(patterns.readout('nobody').first, null);
  // only the reflection's prompt asks for it
  const srv = read('server.mjs');
  assert.ok(/NOTICED_HINT\(patterns\.readout\(presence\.id\), tendMode === 'reflect'\)/.test(srv));
  assert.ok(/\$\{reflecting && n\.first \?/.test(srv));
});

console.log(`\n${passed} passed`);
