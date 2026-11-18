// DONE FROM HERE (Colin, 18 Nov 2026: "it would be cool if orion could
// actually do stuff straight from the home screen too"): the home screen's
// card for a line run in kode with the room shut (src/home-run.js), and how
// main.js and social.js hand it there. Run: node test/home-run.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom } from './fakes/mini-dom.mjs';
import { clock, cardText, outcomeWords, createHomeRun } from '../src/home-run.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the words:');
await ok('the clock reads as kode\'s does', () => {
  assert.deepEqual([clock(7000), clock(102000), clock(3789000), clock(-5)], ['0:07', '1:42', '1:03:09', '0:00']);
});
await ok('working: where, for how long, and what it is doing', () => {
  const c = cardText({ project: 'y3k', at: 1000, doing: 'Running npm test' }, 43000);
  assert.deepEqual(c, { tone: 'run', head: 'kode in y3k', line: 'Working 0:42 · Running npm test', answer: null });
  assert.equal(cardText(null).line, 'Sending it…');
  assert.equal(cardText({ at: 1000, doing: '' }, 2000).line, 'Working 0:01');
});
await ok('a card that waits: a tool to allow or decline this once, a plan to go ahead with, a question answered in kode', () => {
  assert.deepEqual(cardText({ project: 'y3k', request: { kind: 'permission', requestId: 'r1', tool: 'Bash', title: 'Bash: npm test' } }),
    { tone: 'ask', head: 'kode asks to use Bash: npm test', line: 'Allow it this once?', answer: ['Allow', 'Decline'] });
  assert.deepEqual(cardText({ request: { kind: 'plan', requestId: 'r2' } }).answer, ['Go ahead', 'Keep planning']);
  const q = cardText({ request: { kind: 'question', requestId: 'r3' } });
  assert.deepEqual([q.tone, q.answer, q.line], ['ask', null, 'Open kode to answer it.']);
});
await ok('how it ended: done, stopped, or not finished, with the coder\'s first words back', () => {
  assert.deepEqual(cardText({ project: 'y3k', done: { outcome: 'done', did: 'The far plane is fixed.' } }),
    { tone: 'done', head: 'Done in y3k', line: 'The far plane is fixed.', answer: null });
  assert.equal(cardText({ project: 'y3k', done: { outcome: 'stopped', did: '' } }).head, 'Stopped in y3k');
  assert.deepEqual([cardText({ done: { outcome: 'failed' } }).tone, cardText({ done: { outcome: 'failed' } }).head], ['failed', 'It did not finish']);
});
await ok('what the presence is handed to say: where, and the reply as said aloud; else its first words; else what happened', () => {
  assert.equal(outcomeWords({ project: 'y3k', reply: 'The far plane is fixed. The tests pass.', did: 'x' }), 'In y3k: The far plane is fixed. The tests pass.');
  assert.equal(outcomeWords({ project: 'y3k', reply: '', did: 'The far plane is fixed.' }), 'In y3k: The far plane is fixed.');
  assert.equal(outcomeWords({ project: 'y3k', outcome: 'done' }), 'In y3k: it is done.');
  assert.equal(outcomeWords({ outcome: 'stopped' }), 'it was stopped before it finished.');
  assert.equal(outcomeWords({ outcome: 'failed' }), 'it did not finish.');
  assert.equal(outcomeWords(null), '');
});

console.log('\nthe card:');
installDom();
const card = () => document.body.childNodes.find((n) => n.className === 'home-run');
const q = (cls) => card()?.querySelector('.' + cls);
await ok('it stands while kode works, puts the coder\'s question with its two answers, sends the answer, and says how it ended, once', async () => {
  let tick = null;
  const answered = [], done = [], opened = [];
  const hr = createHomeRun({
    run: async (text, onTick) => { tick = onTick; onTick({ sid: 's1', project: 'y3k', at: 1000, doing: '', request: null, done: null }); return { ok: true, sid: 's1', project: 'y3k' }; },
    answer: async (sid, id, d) => { answered.push([sid, id, d]); return { ok: true }; },
    openKode: () => opened.push(1),
    onDone: (d) => done.push(d),
    now: () => 31000,
  });
  const r = await hr.start('fix the far plane');
  assert.deepEqual(r, { ok: true, sid: 's1', project: 'y3k' });
  assert.ok(card(), 'the card stands');
  assert.equal(card().getAttribute('role'), 'status');
  assert.equal(card().dataset.tone, 'run');
  assert.equal(q('hr-head').textContent, 'kode in y3k');
  assert.equal(q('hr-line').textContent, 'Working 0:30');
  assert.ok(q('hr-yes').hidden && q('hr-no').hidden && q('hr-close').hidden, 'nothing to answer yet, and no close while it works');
  tick({ sid: 's1', project: 'y3k', at: 1000, doing: 'Waiting on you', request: { kind: 'permission', requestId: 'r1', tool: 'Bash', title: 'Bash: npm test' }, done: null });
  assert.equal(card().dataset.tone, 'ask');
  assert.equal(q('hr-head').textContent, 'kode asks to use Bash: npm test');
  assert.deepEqual([q('hr-yes').hidden, q('hr-yes').textContent, q('hr-no').textContent], [false, 'Allow', 'Decline']);
  q('hr-yes').click();
  await new Promise((res) => setTimeout(res, 0));
  assert.deepEqual(answered, [['s1', 'r1', 'allow']]);
  q('hr-open').click();
  assert.equal(opened.length, 1, 'open kode is always there');
  tick({ sid: 's1', project: 'y3k', at: 1000, doing: '', request: null, done: { outcome: 'done', did: 'The far plane is fixed.', reply: 'The far plane is fixed.', project: 'y3k' } });
  assert.equal(card().dataset.tone, 'done');
  assert.deepEqual([q('hr-head').textContent, q('hr-line').textContent], ['Done in y3k', 'The far plane is fixed.']);
  assert.ok(!q('hr-close').hidden, 'now it can be closed');
  tick({ sid: 's1', project: 'y3k', done: { outcome: 'done' } });
  assert.equal(done.length, 1, 'the presence hears it once');
  q('hr-close').click();
  assert.equal(card(), undefined, 'closed');
});
await ok('a line that cannot run from here takes the card down and says why to the caller', async () => {
  const hr = createHomeRun({ run: async () => ({ ok: false, why: 'offline' }) });
  assert.deepEqual(await hr.start('fix the far plane'), { ok: false, why: 'offline' });
  assert.equal(card(), undefined);
  const thrown = createHomeRun({ run: async () => { throw new Error('gone'); } });
  assert.deepEqual(await thrown.start('fix it'), { ok: false, why: 'refused' });
  assert.equal(card(), undefined);
});
await ok('while it works it can be stopped from here, as Esc stops it in the room; the card says so until the turn has stopped', async () => {
  let tick = null;
  const stopped = [];
  const hr = createHomeRun({ run: async (t, onTick) => { tick = onTick; return { ok: true }; }, stop: async (sid) => { stopped.push(sid); return { ok: true }; }, now: () => 5000 });
  await hr.start('x');
  assert.ok(q('hr-stop').hidden, 'nothing to stop before it is running');
  tick({ sid: 's3', project: 'y3k', at: 1000, doing: 'Running npm test' });
  assert.equal(q('hr-stop').hidden, false);
  q('hr-stop').click();
  await new Promise((res) => setTimeout(res, 0));
  assert.deepEqual(stopped, ['s3']);
  assert.equal(q('hr-line').textContent, 'Stopping…');
  tick({ sid: 's3', project: 'y3k', at: 1000, doing: 'Running npm test' });
  assert.equal(q('hr-line').textContent, 'Stopping…', 'not taken back by the next tick');
  tick({ sid: 's3', project: 'y3k', done: { outcome: 'stopped', did: '' } });
  assert.deepEqual([q('hr-head').textContent, q('hr-stop').hidden, q('hr-close').hidden], ['Stopped in y3k', true, false]);
  hr.close();
});
await ok('an answer that did not go through says so, and the buttons come back', async () => {
  let tick = null;
  const hr = createHomeRun({ run: async (t, onTick) => { tick = onTick; return { ok: true }; }, answer: async () => ({ ok: false }) });
  await hr.start('x');
  tick({ sid: 's2', request: { kind: 'plan', requestId: 'p1' } });
  q('hr-no').click();
  await new Promise((res) => setTimeout(res, 0));
  assert.match(q('hr-line').textContent, /did not go through/);
  assert.ok(!q('hr-no').disabled && !q('hr-yes').disabled);
  hr.close();
  assert.equal(card(), undefined);
});

console.log('\nthe page:');
const main = read('src/main.js'), social = read('src/social.js'), css = read('styles.css');
await ok('the yes keeps the person where they are: the line runs from here, and only where it cannot does it go into kode', () => {
  assert.match(main, /once: 'yes, from here', cancel: `no, it is for \$\{name\}` \}\);/);
  assert.match(main, /const r = await homeRun\.start\(line\.text\);\n\s+if \(r\.ok\) return;/);
  assert.match(main, /if \(!\(await social\.kodeSay\(line\.text\)\)\) toast\(/, 'and where it cannot, into kode as before');
  assert.match(main, /run: \(t, onTick\) => social\.kodeRun\(t, onTick\),/);
  assert.match(main, /onDone: \(done\) => sayOutcome\(done\),/);
  assert.match(main, /stop: \(sid\) => social\.kodeStop\(sid\),/);
});
await ok('how it went is said by the presence: through the translator at the Personality rank, after its own turn, kept in the conversation', () => {
  const fn = main.slice(main.indexOf('async function sayOutcome(done) {'), main.indexOf('\n}\n', main.indexOf('async function sayOutcome(done) {')));
  assert.match(fn, /const rank = getRank\(\);/);
  assert.match(fn, /codeLink\.voice\(\{ text: plain, rank, where: done\.project \|\| '', recent: \[\] \}\)/);
  assert.match(fn, /while|for \(let i = 0; i < 120 && \(busy \|\| currentSpeak\)/, 'never over its own turn');
  assert.ok(fn.indexOf('showCaption(said') < fn.indexOf('noteSpoken(said)') && fn.indexOf('noteSpoken(said)') < fn.indexOf('codeLink.speak(said)'));
});
await ok('social makes kode without opening the room, and the card is not drawn in it', () => {
  assert.match(social, /async function kodeRun\(text, onTick\) \{\n\s+if \(!codeView\) \{/);
  assert.match(social, /return codeView\.run\(text, onTick\);/);
  assert.ok(!/kodeRun[\s\S]{0,400}showView\('code'\)/.test(social.slice(social.indexOf('async function kodeRun'), social.indexOf('const kodeAnswer'))), 'no trip');
  assert.match(css, /body\.in-code \.home-run \{ display: none; \}/);
});

console.log(`\n${passed} checks passed.`);
