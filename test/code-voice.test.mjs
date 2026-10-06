// Orion's voice over the coder: code-voice.mjs (server) and src/code/voice.js
// (page). Run: node test/code-voice.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { voicePrompt, faithful, readVoiced, rankOf, RANKS, createVoiceCap, VOICE_MAX_IN } from '../code-voice.mjs';
import { mask, unmask, hasProse, splitHead, createVoicer, forVoice, getRank, setRank, RANK_NAMES } from '../src/code/voice.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the translator (server):');

await ok('five ranks; 1 is off and anything unknown is the default, Friend', () => {
  assert.deepEqual(Object.keys(RANKS).map(Number), [1, 2, 3, 4, 5]);
  assert.equal(RANKS[1].line, null);
  assert.equal(rankOf(3), 3); assert.equal(rankOf(0), 3); assert.equal(rankOf('5'), 3); assert.equal(rankOf(5), 5);
});

await ok('the prompt is small, and carries the face, memory, place and the last lines — never a coding context', () => {
  const p = voicePrompt({ face: { name: 'Orion', bio: 'a presence' }, memory: 'x'.repeat(5000), rank: 3, host: 'colin', where: 'p-vs-np', recent: ['a', 'b', 'c'] });
  assert.ok(p.length < 3600, `${p.length} chars`);
  assert.match(p, /You are Orion — a presence/);
  assert.match(p, /working in: p-vs-np/);
  assert.ok(!p.includes('- a\n') && p.includes('- b') && p.includes('- c'), 'the last two lines only');
  assert.match(p, /NEVER CHANGE THE FACTS/);
  assert.match(p, /square brackets/);
  for (const r of [2, 3, 4, 5]) assert.ok(voicePrompt({ rank: r }).includes(RANKS[r].line));
});

await ok('a reply is kept only if every slot and every number survives, at a sane length', () => {
  const src = 'I changed ⟦1⟧ and ⟦2⟧; 12 of 14 tests pass now (0.3s).';
  assert.ok(faithful(src, 'Changed ⟦1⟧ and ⟦2⟧ — 12 of 14 tests pass now, in 0.3s!'));
  assert.ok(!faithful(src, 'Changed ⟦1⟧ — 12 of 14 tests pass now, in 0.3s!'), 'a slot lost');
  assert.ok(!faithful(src, 'Changed ⟦1⟧ and ⟦1⟧ and ⟦2⟧ — 12 of 14 tests pass, 0.3s.'), 'a slot doubled');
  assert.ok(!faithful(src, 'Changed ⟦1⟧ and ⟦2⟧ — 13 of 14 tests pass now, in 0.3s!'), 'a number changed');
  assert.ok(!faithful(src, 'Done.'), 'too short to be the same message');
  assert.ok(!faithful(src, ''), 'empty');
});

await ok('the reply is read as markdown: a leading [mood form] tag comes off, nothing else is touched', () => {
  assert.deepEqual(readVoiced('[excited web] Fixed ⟦1⟧ (finally).\n\n- one\n- two'), { speech: 'Fixed ⟦1⟧ (finally).\n\n- one\n- two', mood: 'excited', form: 'web' });
  assert.deepEqual(readVoiced('Plain message, [not a tag] inside.'), { speech: 'Plain message, [not a tag] inside.', mood: null, form: null });
  assert.equal(readVoiced('{"mood":"calm"} braces in prose stay').speech, '{"mood":"calm"} braces in prose stay', 'no JSON fallback');
});

await ok('a runaway page is capped per person per day', () => {
  const clock = { t: Date.parse('2026-09-28T10:00:00Z') };
  const cap = createVoiceCap({ perDay: 3, now: () => clock.t });
  assert.ok(cap.take('u') && cap.take('u') && cap.take('u'));
  assert.equal(cap.take('u'), false);
  assert.ok(cap.take('v'), 'per person');
  clock.t += 86400000;
  assert.ok(cap.take('u'), 'a new day');
});

console.log('\nthe page (masking and the voicer):');

const MD = [
  'I updated `server.mjs` and src/code/view.js — see [the docs](https://x.io/a).',
  '',
  '```js',
  'const a = 1; // in ./lib/x.js',
  '```',
  '',
  'Run ./scripts/go.sh next; 12 tests pass.',
].join('\n');

await ok('code, links and paths become slots, and come back byte for byte', () => {
  const { prose, slots } = mask(MD);
  assert.ok(!/const a = 1|server\.mjs|x\.io|go\.sh|view\.js/.test(prose), prose);
  assert.ok(prose.includes('12 tests pass'), 'numbers stay in the prose for the translator to keep');
  assert.equal(unmask(prose, slots), MD);
  assert.equal(slots.filter((s) => s.startsWith('```')).length, 1, 'a fence is one slot');
});

await ok('only prose with words is worth a call; a long message voices its opening and keeps the rest', () => {
  assert.equal(hasProse('⟦1⟧\n\n⟦2⟧'), false);
  assert.equal(hasProse('Here is the fix for it.'), true);
  const long = ('A sentence about the work. '.repeat(20) + '\n\n').repeat(20);
  const { head, rest } = splitHead(long);
  assert.ok(head.length <= 1500 && head.length > 200, String(head.length));
  assert.equal(head + rest, long);
  assert.ok(VOICE_MAX_IN >= 6000);
  assert.deepEqual(splitHead('short'), { head: 'short', rest: '' });
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const store = new Map();
const mem = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

await ok('only the coder\'s own finished words are voiced: not its thinking, a subagent\'s, or a replayed history', () => {
  const said = { type: 'message.block', id: 'm1', block: 1, kind: 'text', text: 'Here is what I changed.', parentCallId: null };
  assert.equal(forVoice(said), true);
  assert.equal(forVoice({ ...said, type: 'message.delta' }), false, 'still streaming');
  assert.equal(forVoice({ ...said, kind: 'thinking' }), false);
  assert.equal(forVoice({ ...said, parentCallId: 'call_task' }), false, 'a subagent\'s');
  assert.equal(forVoice({ ...said, history: true }), false, 'said once already, when it was new');
  const view = readFileSync(new URL('../src/code/code-view.js', import.meta.url), 'utf8');
  assert.match(view, /if \(forVoice\(e\)\) \{/, 'the view asks it of each event');
});

await ok('the slider: five ranks, remembered, Friend by default', () => {
  assert.equal(getRank(mem), 3);
  assert.equal(setRank(5, mem), 5); assert.equal(getRank(mem), 5);
  assert.equal(setRank(9, mem), 5); assert.equal(setRank(0, mem), 1);
  assert.deepEqual(Object.values(RANK_NAMES), ['Off', 'Light', 'Friend', 'Warm', 'Orion']);
});

await ok('Off never calls the translator; the coder\'s words stay', async () => {
  let calls = 0;
  const v = createVoicer({ link: { voice: async () => { calls++; return { text: 'x' }; } }, rank: () => 1 });
  const b = { text: 'Here is a plain answer about the change.' };
  assert.equal(v.block({ item: {}, block: b }), false);
  await tick();
  assert.equal(calls, 0); assert.equal(b.voice, undefined);
});

await ok('a voiced block gets Orion\'s words with the code put back, the body moves, and it redraws', async () => {
  const sent = [];
  let redrawn = 0, moved = null;
  const v = createVoicer({
    link: { voice: async (req) => { sent.push(req); return { text: req.text.replace('I updated', 'Okay — I updated'), mood: 'excited', form: null }; } },
    rank: () => 3, onVoiced: () => { redrawn++; }, express: (x) => { moved = x; },
  });
  const b = { text: MD };
  v.block({ item: {}, block: b, where: 'p-vs-np' });
  await tick(); await tick();
  assert.equal(sent.length, 1);
  assert.ok(!/const a = 1|server\.mjs/.test(sent[0].text), 'code never left the page');
  assert.equal(sent[0].rank, 3); assert.equal(sent[0].where, 'p-vs-np');
  assert.equal(b.voice, MD.replace('I updated', 'Okay — I updated'), 'every slot restored exactly');
  assert.equal(redrawn, 1);
  assert.deepEqual(moved, { mood: 'excited', form: null });
  assert.equal(b.text, MD, "the coder's words are kept underneath, never shown in their place");
});

await ok('no voice (no key, a cap, a refusal) keeps the coder\'s words; a block is asked once', async () => {
  let calls = 0;
  const v = createVoicer({ link: { voice: async () => { calls++; return null; } }, rank: () => 3 });
  const b = { text: 'Here is a plain answer about the change you asked for.' };
  v.block({ item: {}, block: b });
  v.block({ item: {}, block: b });
  await tick(); await tick();
  assert.equal(calls, 1);
  assert.equal(b.voice, null);
});

console.log(`\n${passed} checks passed.`);
