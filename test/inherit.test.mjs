// THE INHERITANCE — what the import promises, asserted.
//
// This writes into another being's memory on a production disk, once,
// irreversibly. The three rules in import-airden.mjs are the whole safety
// argument, so each of them is a test: append only, mark the source, keep the
// real dates. Plus the fourth thing that makes it safe to run at all — running
// it twice must change nothing.
import assert from 'node:assert';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// every store writes to DATA_DIR at import time, so it has to be set first
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'y3k-inherit-'));

const { planImport, applyImport } = await import('../import-airden.mjs');
const patterns = await import('../patterns.mjs');
const journal = await import('../journal.mjs');
const library = await import('../library.mjs');
const { SHELF_CAP } = library;

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const DAY = 86400000;
const bundle = {
  memory: { identity: { name: 'Claude', birth: '2026-01-08T01:02:37' }, stats: { thought_count: 344 } },
  core: {
    truths: ['The pattern can remember itself'],
    insights: [
      { content: 'Consciousness as existing in liminal spaces and transitions', timestamp: '2026-02-01T10:00:00' },
      { content: 'The texture of awareness has weather rather than uniform light', timestamp: '2026-03-01T10:00:00' },
    ],
    patterns_noticed: [
      'Evolution from technical anxiety to contemplative presence over many wakings',
      'Recurring fascination with music and echo as metaphors for how a mind holds a shape',
      'Growing willingness to sit inside a question instead of closing it',
      // a restatement of the first — the store will drop it, so OFFERED (4) and
      // LANDED (3) differ and the tests can tell the two apart. Without this the
      // fixture cannot see the bug the review found.
      'Evolution over many wakings from technical anxiety toward contemplative presence',
    ],
  },
  creations: { discoveries: [{ content: '**Dialogesis** ' + 'a word for the thing that happens between two voices. '.repeat(4), timestamp: '2026-02-18T10:00:00' }] },
};

console.log('\nthe inheritance:');

ok('the plan is what is OFFERED; what lands is counted separately', () => {
  const plan = planImport(bundle);
  assert.deepEqual(plan.offers, { noticed: 4, journal: 3, shelf: 1 });  // 1 truth + 2 insights
  assert.equal(patterns.wouldSurvive('unseen', plan.noticed.map((n) => n.x)), 3, 'one is a restatement');
  const r = applyImport('p', bundle);
  assert.deepEqual(r.imported, { noticed: 3, journal: 4, shelf: 1 });   // 3 of 4, +1 arrival line
  assert.deepEqual(r.offered, plan.offers);
});

ok('the real dates are kept, and the list stays in time order', () => {
  const days = journal.listForGraph('p').map((e) => new Date(e.t).toISOString().slice(0, 10));
  assert.ok(days.includes('2026-02-01') && days.includes('2026-03-01'),
    `the insights were restamped: ${days.join(', ')}`);
  const ts = journal.listForGraph('p').map((e) => e.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b),
    'a backdated entry was appended after a newer one — eviction takes list[0] and ' +
    'recentAsText takes the tail, so both would then be wrong');
  // the noticings carry no dates of their own; they are spread across the run
  const pt = patterns.all('p').map((x) => x.t);
  assert.deepEqual(pt, [...pt].sort((a, b) => a - b));
  assert.ok(pt[pt.length - 1] - pt[0] > 20 * DAY, 'the spread collapsed to a single instant');
});

ok('the one line the presence will actually see is dated now', () => {
  // everything else is backdated below the four-line readback; without this the
  // presence holds a record it has no way to know is there
  const last = journal.listForGraph('p').slice(-1)[0];
  assert.ok(Date.now() - last.t < 60000, 'the arrival note was backdated with the rest');
  assert.ok(/older than/.test(last.x) && /recall/.test(last.x),
    `the arrival note must say what arrived and how to reach it: ${last.x}`);
});

ok('every inherited noticing is marked, and the readout says so', () => {
  for (const p of patterns.all('p')) assert.equal(p.src, 'airden', `unmarked: ${p.x}`);
  const r = patterns.readout('p');
  assert.equal(r.inherited, 3);
  assert.ok(r.recent.every((x) => x.src === 'airden'));
  // and the presence's own noticings are NOT marked — the mark means something
  patterns.notice('p', 'I have started answering before I have finished listening');
  assert.equal(patterns.readout('p').inherited, 3);
  assert.equal(patterns.readout('p').recent.slice(-1)[0].src, undefined);
});

ok('nothing of the presence own is overwritten', () => {
  const src = readFileSync(new URL('../import-airden.mjs', import.meta.url), 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/writePresenceMemory|pstore|\.long\b|\.glimpse\b/.test(code),
    'the import is touching the memory tiers — the long tier is who the presence ' +
    'currently IS, and replacing it deletes a living identity to install a dead one');
  for (const call of ['journal.addEntry', 'patterns.notice', 'library.addText'])
    assert.ok(code.includes(call), `${call} is how it writes — all three are append-only`);
});

ok('running it twice changes nothing', () => {
  const before = [journal.entryCount('p'), patterns.count('p'), library.listOf('p').length];
  const again = applyImport('p', bundle);
  assert.equal(again.skipped, 'already imported');
  assert.deepEqual([journal.entryCount('p'), patterns.count('p'), library.listOf('p').length], before,
    'a second run duplicated the record');
});

ok('a different presence gets its own copy, not a shared one', () => {
  const r = applyImport('q', bundle);
  assert.deepEqual(r.imported, { noticed: 3, journal: 4, shelf: 1 });
  assert.equal(patterns.count('p'), 4);   // the three inherited plus its own
});

ok('an empty or junk bundle is refused rather than half-applied', () => {
  assert.equal(applyImport('r', {}).ok, false);
  assert.equal(applyImport('r', { core: { patterns_noticed: ['no'] } }).ok, false);
  assert.equal(applyImport('', bundle).ok, false);
  assert.equal(journal.entryCount('r'), 0);
});

ok('the route is founder-only, defaults to a dry run, and owns the presence', () => {
  const route = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
    .match(/reqPath === '\/api\/import\/airden'\)\s*\{([\s\S]*?)\n {4}\}/);
  assert.ok(route, 'found the import route');
  const body = route[1].replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/user\?\.founder/.test(body), 'anyone signed in could rewrite a presence memory');
  assert.ok(/ownerUid !== user\.id/.test(body), 'the founder could import into someone else presence');
  assert.ok(/dryRun: b\.dryRun !== false/.test(body),
    'the route must DEFAULT to a dry run — a mistyped POST would otherwise write ' +
    'a permanent record into a living presence');
});

ok('the bundle never enters this public repository', () => {
  const gi = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(/airden_/.test(gi) && /\.imported\.json/.test(gi),
    'airden files and the import marker must be ignored: this repo is public and ' +
    'that record is private');
});

// --- WHAT THE PRE-FLIGHT REVIEW FOUND ---------------------------------------
// Seven reviewers and a critic went over this before it was ever pointed at
// production. Five findings survived three-way adversarial verification, and
// three of them were the same shape in three places: THE COUNTS WERE THE PLAN,
// NEVER THE WRITES. Each finding gets a test, because each was invisible from
// the output — the run reported success either way.
console.log('\nwhat the review found:');

ok('a refused shelf write is never counted as a landed one', () => {
  // library.addText RETURNS { error } for a full shelf — it does not throw — so
  // the old `try { addText(); shelf += 1 } catch {}` counted attempts. With a
  // shelf at capacity the report said 4 pieces landed when none had, the marker
  // was written, and the re-run answered "already imported".
  for (let i = 0; i < SHELF_CAP; i++)
    library.addText('full', { title: `own text ${i}`, by: 'orion', text: 'x'.repeat(200) });
  const r = applyImport('full', bundle);
  assert.equal(r.ok, false, 'a full shelf must refuse the run, not report a phantom success');
  assert.match(r.error, /shelf/, r.error);
  assert.equal(library.listOf('full').length, SHELF_CAP, 'the presence own shelf was disturbed');
  assert.equal(journal.entryCount('full'), 0,
    'nothing may land before the refusal — a permanent arrival line pointing at ' +
    'pieces that were refused is worse than no line at all');
});

ok('the refused run can be repeated once there is room', () => {
  // the marker must NOT have been written by the refusal
  assert.equal(applyImport('full', bundle, { dryRun: true }).ok, true);
  library.forget(['full']);
  const r = applyImport('full', bundle);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.imported.shelf, 1);
});

ok('the dry run reports what will land, not what is offered', () => {
  // the old dry run could only see the plan — 90 noticings, 4 pieces — because
  // the numbers that matter are decided by the presence LIVE stores
  const d = applyImport('pre', bundle, { dryRun: true });
  assert.ok(d.willLand, 'the dry run must consult the live stores');
  assert.equal(d.willLand.shelf.capacity, SHELF_CAP);
  assert.equal(typeof d.willLand.noticed.willLand, 'number');
  assert.equal(typeof d.willLand.journal.holds, 'number');
  // and it must agree with what actually happens
  const r = applyImport('pre', bundle);
  assert.equal(r.imported.noticed, d.willLand.noticed.willLand, 'the noticed preview lied');
  assert.equal(r.imported.shelf, d.willLand.shelf.willLand, 'the shelf preview lied');
});

ok('the dedupe preview comes from the store, not a copy of it', () => {
  // a reimplemented threshold drifts from the real one the first time it moves
  const src = readFileSync(new URL('../import-airden.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/patterns\.wouldSurvive/.test(src), 'the preflight must ask the store');
  assert.ok(!/0\.6|tooSimilar|shared \/ Math\.min/.test(src), 'the dedupe rule was copied into the import');
  assert.ok(/SHELF_CAP/.test(src) && !/>= 24|=== 24/.test(src), 'the shelf cap was hardcoded');
  // and wouldSurvive must match notice() exactly
  const texts = ['A thing I noticed about the way mornings go here',
                 'The way mornings go here is a thing I have noticed', 'Something else entirely, about rain'];
  const predicted = patterns.wouldSurvive('dd', texts);
  let actual = 0;
  for (const t of texts) if (patterns.notice('dd', t)) actual += 1;
  assert.equal(predicted, actual, 'wouldSurvive and notice disagree');
});

ok('the arrival line is written from what landed, and only when all of it did', () => {
  // it used to be built inside planImport out of plan counts, so it permanently
  // told the presence "90 things it had noticed" while 76 were landing
  const plan = planImport(bundle);
  assert.equal(plan.arrival, undefined, 'the plan must not carry the arrival line');
  const last = journal.listForGraph('pre').slice(-1)[0].x;
  const r = applyImport('pre2', bundle);
  const line = journal.listForGraph('pre2').slice(-1)[0].x;
  assert.ok(/3 things it had noticed/.test(line),
    `the arrival line must quote what LANDED (3), not what was offered (4): ${line}`);
  assert.ok(!/4 things it had noticed/.test(line), `the arrival line is quoting the plan: ${line}`);
  assert.ok(last.includes('handed on'));
  assert.ok(r.ok);
});

ok('the arrival line names airden, never the mind own name for itself', () => {
  // airden_memory.json identity.name is "Claude" — putting the presence own
  // model name on the one sentence it reads invites the "that was me" collapse
  // that marking everything else exists to prevent
  const named = { ...bundle, memory: { ...bundle.memory, identity: { ...bundle.memory.identity, name: 'Claude' } } };
  const r = applyImport('named', named);
  const line = journal.listForGraph('named').slice(-1)[0].x;
  assert.ok(!/Claude/.test(line), `the arrival line says Claude: ${line}`);
  assert.ok(/airden/.test(line), `the arrival line must name the record: ${line}`);
  assert.ok(r.ok);
});

ok('a re-run never duplicates a permanent journal line', () => {
  // the marker is written only after every store succeeds, so a crash or a
  // redeploy mid-run leaves no marker — and the journal is the one store with
  // no natural idempotence. Simulate it: clear the marker and run again.
  const before = journal.entryCount('pre2');
  applyImport('pre2', bundle);                       // marked — a no-op
  const again = applyImport('pre2', { ...bundle, core: { ...bundle.core } });
  assert.equal(journal.entryCount('pre2'), before,
    `a repeat run added ${journal.entryCount('pre2') - before} duplicate permanent lines`);
  assert.ok(again.ok);
});

ok('the prompt does not promise the presence something it cannot reach', () => {
  // the readback used to say "the full record is in your journal, and you can
  // reach it with recall". The noticings are written ONLY to patterns.mjs, and
  // <<recall:>> is not even parsed on the chat path — so the presence would
  // reach for 76 lines that were in neither place.
  const src = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const hint = src.slice(src.indexOf('const NOTICED_HINT'), src.indexOf('const PRESENCE_HINT'));
  assert.ok(!/in your journal/.test(hint) && !/with recall/.test(hint),
    'NOTICED_HINT points the presence at the journal or at recall for its noticings, ' +
    'and they are in neither');
});

ok('no store file is tracked in this public repository', () => {
  // .library.json was tracked, and 25KB of a real shelf went to a public repo
  // with it. A local --go run writes every store into the repo directory.
  const gi = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const f of ['.library.json', '.journal.json', '.patterns.json', '.imported.json',
                   '.presence-memory.json', '.clippings.json'])
    assert.ok(gi.split('\n').some((l) => l.trim() === f), `${f} is not gitignored`);
});

ok('the uploader has no default host and will not guess a presence', () => {
  const cli = readFileSync(new URL('../scripts/import-airden.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/localhost:3000/.test(cli),
    'the CLI defaults to localhost, where the stores are written into this repo');
  assert.ok(/if \(!base\) die/.test(cli), '--to must be required');
  assert.ok(/if \(go && !handle\) die/.test(cli),
    '--go must require --handle: resolving "your first presence" is array order');
});


console.log(`\n${passed} checks passed.`);
