// Orion's voice over the coder: code-voice.mjs (server) and src/code/voice.js
// (page). Run: node test/code-voice.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { voicePrompt, faithful, readVoiced, rankOf, RANKS, createVoiceCap, VOICE_MAX_IN } from '../code-voice.mjs';
import { mask, unmask, hasProse, splitHead, createVoicer, forVoice, getRank, setRank, RANK_NAMES, BUSY_MS, BUSY_TRIES } from '../src/code/voice.js';

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

// 2026-10-12: on the person's own Claude plan the translator thinks through the
// same page and y3kode as their conversation, and y3kode takes two turns at
// once for everything. Two translations out at once left their own next line
// refused as busy, and the orb blamed the plan for it.
await ok('on the person\'s own plan the voicer asks one at a time, on a key two, and it is asked again as that changes', async () => {
  let own = true, out = 0, most = 0, n = 0;
  const waiting = [];
  const link = {
    onOwnPlan: () => own,
    voice: () => { out += 1; most = Math.max(most, out); return new Promise((r) => waiting.push(() => { out -= 1; r(null); })); },
  };
  const v = createVoicer({ link, rank: () => 3 });
  const more = (k) => { for (let i = 0; i < k; i++) v.block({ item: {}, block: { text: `Here is plain answer number ${n++} about the change you asked for.` } }); };
  const settleAll = async () => { while (waiting.length) { waiting.shift()(); await tick(); } };
  more(3);
  await tick();
  assert.equal(out, 1, 'two translations out at once on the plan the conversation thinks on');
  await settleAll();
  assert.equal(most, 1, 'one at a time, every one');
  own = false;   // a key in use now
  most = 0;
  more(3);
  await tick();
  assert.equal(out, 2, 'a key is not held to the plan\'s one at a time');
  await settleAll();
  assert.equal(most, 2);
  // a page with no link to ask (or an older one) keeps two; a number given stands
  let seen = 0;
  const fixed = createVoicer({ link: { voice: () => { seen += 1; return new Promise(() => {}); } }, rank: () => 3, maxInFlight: 3 });
  for (let i = 0; i < 4; i++) fixed.block({ item: {}, block: { text: `Another plain answer number ${i} about the change you asked for.` } });
  await tick();
  assert.equal(seen, 3);
  // and main.js says which it is, from the same place every turn reads it
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /\n  onOwnPlan: \(\) => onOwnPlan\(\),\n/, 'Code\'s link does not say when the translator is on the person\'s own plan');
  assert.match(readFileSync(new URL('../src/code/code-view.js', import.meta.url), 'utf8'), /createVoicer\(\{ link, onVoiced:/, 'the view builds the voicer without the link it asks');
});

// 2026-10-12: the site never lets a translation take the last of the turns
// y3kode takes at once (own-relay.mjs spare), and a translation refused for it
// was said as no voice at all: the message kept the coder's words for good,
// though it was refused only because the person's own turn was out.
await ok('a translation refused as busy is asked again after a wait, a few times at most; any other no is final', async () => {
  const waits = [];
  const later = (fn, ms) => { waits.push({ fn, ms }); };
  const wake = async () => { for (const w of waits.splice(0)) w.fn(); await tick(); await tick(); };
  const BUSY = { available: false, reason: 'busy' };
  const plain = (n) => ({ text: `Here is plain answer number ${n} about the change you asked for.` });
  // busy twice, then its words
  let calls = 0, redrawn = 0;
  const answers = [BUSY, BUSY, { text: 'Okay, here is a plain answer about the change you asked for.', mood: 'calm' }];
  const v = createVoicer({ link: { voice: async () => { calls += 1; return answers.shift(); } }, rank: () => 3, onVoiced: () => { redrawn += 1; }, later });
  const b = plain(1);
  v.block({ item: {}, block: b });
  await tick(); await tick();
  assert.equal(calls, 1);
  assert.equal(b.voice, null, 'not voiced yet');
  assert.deepEqual(waits.map((w) => w.ms), [BUSY_MS], 'a busy translation was never asked again: the coder\'s words stood for good');
  await wake();
  assert.equal(calls, 2);
  assert.deepEqual(waits.map((w) => w.ms), [BUSY_MS * 2], 'each wait is twice the last');
  await wake();
  assert.equal(calls, 3);
  assert.equal(b.voice, 'Okay, here is a plain answer about the change you asked for.');
  assert.equal(redrawn, 1);
  assert.equal(waits.length, 0, 'voiced: nothing more is asked');
  // always busy: asked once and BUSY_TRIES times more, then the coder's words stay
  assert.ok(BUSY_TRIES >= 2 && BUSY_TRIES <= 5, 'a few tries, not forever');
  let tries = 0;
  const always = createVoicer({ link: { voice: async () => { tries += 1; return BUSY; } }, rank: () => 3, later });
  const c = plain(2);
  always.block({ item: {}, block: c });
  await tick(); await tick();
  for (let i = 0; i < BUSY_TRIES + 3; i++) await wake();
  assert.equal(tries, 1 + BUSY_TRIES);
  assert.equal(c.voice, null);
  // its words changed while it waited, or the slider went to Off: not asked again
  let asked = 0, rank = 3;
  const w = createVoicer({ link: { voice: async () => { asked += 1; return BUSY; } }, rank: () => rank, later });
  const d = plain(3), e = plain(4);
  w.block({ item: {}, block: d }); w.block({ item: {}, block: e });
  await tick(); await tick();
  assert.equal(asked, 2);
  d.text = 'The coder rewrote this message while the translation waited for a turn.';
  await wake();
  assert.equal(asked, 3, 'only the one whose words still stand');
  rank = 1;
  await wake();
  assert.equal(asked, 3, 'asked again with the slider at Off');
  assert.equal(waits.length, 0);
  // any other no (no brain, a cap, a refusal, a dead connection) is not asked again
  let other = 0;
  const once = createVoicer({ link: { voice: async () => { other += 1; return other === 1 ? { available: false, reason: 'cap' } : null; } }, rank: () => 3, later });
  once.block({ item: {}, block: plain(5) });
  await tick(); await tick();
  assert.equal(other, 1); assert.equal(waits.length, 0);
  // and Code's link says busy when the site does, instead of nothing
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const voiceAt = main.indexOf('  async voice({ text, rank, where, recent }) {');
  const voice = main.slice(voiceAt, main.indexOf('\n  },', voiceAt));
  assert.match(voice, /if \(d && typeof d\.text === 'string'\) return d;\n\s*return d\?\.reason === 'busy' \? \{ available: false, reason: 'busy' \} : null;/, 'main.js drops the site\'s busy, and the voicer never hears it');
});

// 2026-10-12 (G4): Code's note and its voice read the site's word for a page
// that is another account's now (409, brain.js reloaded) as nothing at all,
// and the page went on as an account that is gone. They give nothing still,
// and the page reloads.
await ok('Code\'s note and voice, refused as another account\'s page (409 reload), give nothing and reload the page; busy is still busy', async () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const method = (head) => {
    const at = main.indexOf(head);
    assert.ok(at >= 0, head.trim() + ' is gone from main.js');
    return main.slice(at, main.indexOf('\n  },', at)) + '\n  }';
  };
  const brain = await import('../src/brain.js');
  let reloads = 0, answer = null;
  const was = globalThis.location;
  globalThis.location = { reload: () => { reloads += 1; } };
  const link = new Function('d', `const { myPresence, fetch, keyFields, reloaded } = d; return {\n${method('  async writeNote() {')},\n${method('  async voice({ text, rank, where, recent }) {')}\n};`)({
    myPresence: { handle: 'orion' }, fetch: async () => answer, keyFields: () => ({ as: 'a' }), reloaded: brain.reloaded,
  });
  const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
  try {
    answer = reply(409, { error: 'reload', reason: 'reload' });
    assert.equal(await link.voice({ text: 'hi' }), null);
    assert.equal(reloads, 1, 'the voice: the page went on as the account that is gone');
    assert.deepEqual(await link.writeNote(), { available: false }, 'the note handed the refusal on as an answer');
    assert.equal(reloads, 2, 'the note: the page went on as the account that is gone');
    // everything else as before
    answer = reply(200, { available: false, reason: 'busy' });
    assert.deepEqual(await link.voice({ text: 'hi' }), { available: false, reason: 'busy' });
    answer = reply(200, { text: 'Voiced.' });
    assert.deepEqual(await link.voice({ text: 'hi' }), { text: 'Voiced.' });
    answer = reply(429, { error: 'cap', text: 'not a voice' });
    assert.equal(await link.voice({ text: 'hi' }), null, 'a refusal with a body was taken for a voice');
    answer = reply(200, { note: 'A note.' });
    assert.deepEqual(await link.writeNote(), { note: 'A note.' });
    assert.equal(reloads, 2);
  } finally { globalThis.location = was; }
});

console.log(`\n${passed} checks passed.`);
