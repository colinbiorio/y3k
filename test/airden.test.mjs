// AIRDEN IN Y3K — your presence, speaking on its own. Run: node test/airden.test.mjs
//
// The pieces (src/stretch.mjs): what a stretch may say, where its sentences
// end, and which of its words carry the body's tags.
//
// The speaker (src/airden.js), on a clock that only moves when told and a
// voice driven by hand: the first stretch is short and the bank is refilled
// before it runs dry; words appear as they are heard and the tags land on the
// word they precede; only what was said is remembered and handed back; typing
// lets the sentence finish and then gives you the floor, and the stream comes
// back fresh; the refusals stop it with a reason; a hidden tab rests; a voice
// that never starts is read instead; leaving the room ends it.
import assert from 'node:assert';
import { cleanStretch, sentencesOf, piecesOf, spokenOf, MAX_SENTENCE } from '../src/stretch.mjs';
import { createAirden, readingVoice, REFILL_AT, START_WAIT_MS, LINE_CHARS } from '../src/airden.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the words:');

await ok('a stretch keeps its tags and beats; every silent block, fence and cut-off block goes', () => {
  const c = cleanStretch('[calm field] One. <<memory short: kept elsewhere>> Two ~hush~ here.\n```js\nx()\n```\nThree. <<journal: cut off at the en');
  assert.equal(c, '[calm field] One. Two ~hush~ here.\n\nThree.');
  assert.equal(cleanStretch('  '), '');
});

await ok('sentences end at . ! ? … and line breaks; a held breath does not; a lone tag joins the next', () => {
  assert.deepEqual(sentencesOf('It is not the view... it is the waiting. Then… Something else! ok.\n[tender]\nWhat now? "Yes." 3.5 apples'),
    ['It is not the view... it is the waiting.', 'Then…', 'Something else!', 'ok.', '[tender] What now?', '"Yes."', '3.5 apples']);
  assert.deepEqual(sentencesOf('[excited plasma] Look! [calm] Rest.'), ['[excited plasma] Look!', '[calm] Rest.']);
});

await ok('a run-on is said in breaths, cut at a comma', () => {
  const parts = sentencesOf('word '.repeat(40) + 'turning, ' + 'word '.repeat(110) + 'end.');
  assert.ok(parts.length >= 2 && parts.every((p) => p.length <= MAX_SENTENCE + 1));
  assert.ok(parts[0].endsWith(','));
});

await ok('a sentence plays as tags, beats and words; honest brackets stay words', () => {
  const p = piecesOf('[tender orb bloom] You came ~flare 8~ back (by the way) [calm] today.');
  assert.deepEqual(p.filter((x) => !x.word), [{ tag: { mood: 'tender', form: 'orb', scheme: 'bloom', morph: null } }, { beat: 'flare', n: 8 }, { tag: { mood: 'calm', form: null, scheme: null, morph: null } }]);
  assert.equal(spokenOf(p), 'You came back (by the way) today.');
});

// ---------------------------------------------------------------------------
// A clock that moves only when told, and a voice driven by hand.
function clock() {
  let t = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => t,
    set: (fn, ms) => { id += 1; tasks.set(id, { at: t + Math.max(0, ms || 0), fn }); return id; },
    clear: (i) => { tasks.delete(i); },
    async tick(ms) {
      const end = t + ms;
      for (;;) {
        await settle();
        let next = null;
        for (const [i, k] of tasks) if (k.at <= end && (!next || k.at < next[1].at)) next = [i, k];
        if (!next) break;
        tasks.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
      await settle();
    },
  };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function rig({ replies = [], typed = () => false, hidden = () => false, isLast = () => true } = {}) {
  const c = clock();
  const log = { requests: [], shown: [], played: [], said: [], states: [], budgets: [], floor: [] };
  let busy = false, roomGen = 1;
  const voices = [];
  const queue = replies.slice();
  const a = createAirden({
    presence: () => 'orion',
    request: async (body) => { log.requests.push(body); const r = queue.shift(); return typeof r === 'function' ? r(body) : (r || { available: false, reason: 'upstream' }); },
    context: () => ({ exchange: [{ role: 'user', content: 'hello' }], tz: 'UTC', keyFields: {} }),
    floor: { held: () => busy, take: () => { busy = true; log.floor.push('take'); }, give: () => { busy = false; log.floor.push('give'); } },
    waiting: typed,
    gen: () => roomGen,
    voice: (h) => {
      const v = { pushed: [], h, stopped: false,
        push(t) { this.pushed.push(t); }, end() {}, stop() { this.stopped = true; },
        start(i, ms = 1000) { h.onChunk(this.pushed[i], 'start', ms); },
        end_(i) { h.onChunk(this.pushed[i], 'end'); } };
      voices.push(v);
      return v;
    },
    show: (t) => log.shown.push(t),
    play: (p) => log.played.push(p),
    said: (s) => log.said.push(s),
    onState: (s) => log.states.push(s),
    onBudget: (b) => log.budgets.push(b),
    hidden,
    isLast,
    timer: c,
    now: c.now,
  });
  return { a, c, log, voices, setBusy: (v) => { busy = v; }, busy: () => busy, moveRoom: () => { roomGen += 1; }, queue };
}
const stretch = (text, extra = {}) => ({ available: true, text, budget: { remaining: 4.5 }, ...extra });

console.log('\nthe speaker:');

await ok('it asks for a short stretch first, says nothing and holds nothing until words arrive', async () => {
  const r = rig({ replies: [() => new Promise(() => {})] });
  assert.equal(r.a.start(), true);
  await r.c.tick(10);
  assert.equal(r.log.requests.length, 1);
  assert.deepEqual({ ...r.log.requests[0], exchange: null }, { presence: 'orion', size: 'short', said: '', exchange: null, tz: 'UTC' });
  assert.deepEqual(r.log.requests[0].exchange, [{ role: 'user', content: 'hello' }]);
  assert.equal(r.busy(), false);
  assert.deepEqual(r.log.states[0], { on: true, phase: 'gathering' });
});

await ok('a stretch is queued behind the voice, and the next — a long one — is asked for while it is said', async () => {
  const r = rig({ replies: [stretch('[calm] One here. Two here. [tender] Three here. Four here.'), () => new Promise(() => {})] });
  r.a.start();
  await r.c.tick(10);
  assert.equal(r.busy(), true, 'it holds the floor while it speaks');
  assert.deepEqual(r.voices[0].pushed, ['One here.', 'Two here.'], 'the one being heard and one behind it');
  assert.equal(r.log.requests.length, 2);
  assert.equal(r.log.requests[1].size, 'long');
  assert.deepEqual(r.log.budgets, [{ remaining: 4.5 }]);
  assert.ok(4 < REFILL_AT);
});

await ok('words appear as they are heard, the tags land on their word, and only what was heard is remembered', async () => {
  const r = rig({ replies: [stretch('[calm] One here. Two here. [tender] Three here.'), () => new Promise(() => {})] });
  r.a.start();
  await r.c.tick(10);
  r.voices[0].start(0, 1000);
  await r.c.tick(0);
  assert.deepEqual(r.log.played, [{ tag: { mood: 'calm', form: null, scheme: null, morph: null } }]);
  assert.deepEqual(r.log.shown, ['One']);
  await r.c.tick(1000);
  assert.deepEqual(r.log.shown, ['One', 'One here.']);
  assert.deepEqual(r.log.said, [], 'shown is not said: it is said when the voice is done with it');
  r.voices[0].end_(0);
  await r.c.tick(0);
  assert.deepEqual(r.log.said, ['One here.']);
  assert.deepEqual(r.voices[0].pushed, ['One here.', 'Two here.', 'Three here.'], 'the next is queued as one finishes');
  r.voices[0].start(1, 500); await r.c.tick(600); r.voices[0].end_(1);
  r.voices[0].start(2, 500); await r.c.tick(0);
  assert.deepEqual(r.log.played.at(-1), { tag: { mood: 'tender', form: null, scheme: null, morph: null } });
  await r.c.tick(600); r.voices[0].end_(2); await r.c.tick(0);
  assert.equal(r.log.shown.at(-1), 'One here. Two here. Three here.', 'one line, grown in place');
  assert.equal(r.busy(), false, 'nothing left to say: the floor is free');
  assert.equal(r.a._state().saidTail, 'One here. Two here. Three here.');
});

await ok('the next stretch carries on from what was said aloud — not from what was waiting', async () => {
  let asked = null;
  const r = rig({ replies: [stretch('Alpha one. Beta two. Gamma three. Delta four.'), (b) => { asked = b; return new Promise(() => {}); }] });
  r.a.start();
  await r.c.tick(10);
  assert.equal(asked.said, '', 'asked before anything was said');
  r.voices[0].start(0); await r.c.tick(1000); r.voices[0].end_(0); await r.c.tick(0);
  assert.equal(r.a._state().saidTail, 'Alpha one.');
  assert.ok(!/Gamma|Delta/.test(r.a._state().saidTail));
});

await ok('typing mid-sentence: the sentence finishes, you get the floor, and it comes back fresh and short', async () => {
  let typed = false, lateStretch = null;
  const r = rig({ typed: () => typed, replies: [stretch('One here. Two here. Three here.'), () => new Promise((res) => { lateStretch = res; })] });
  r.a.start();
  await r.c.tick(10);
  r.voices[0].start(0, 1000);
  typed = true;                                  // you type while it is saying "One here."
  await r.c.tick(400);
  assert.equal(r.busy(), true, 'the sentence is still being said');
  r.voices[0].end_(0);
  await r.c.tick(0);
  assert.deepEqual(r.log.said, ['One here.'], 'it finished its sentence');
  assert.ok(r.voices[0].stopped, 'and the one queued behind it is not said');
  assert.equal(r.busy(), false, 'you have the floor');
  assert.deepEqual(r.log.floor, ['take', 'give']);
  // the reply takes the floor; meanwhile the stale stretch arrives and is dropped
  typed = false; r.setBusy(true);
  await r.c.tick(500);
  lateStretch(stretch('STALE never said. Written before you spoke.'));
  await r.c.tick(500);
  assert.deepEqual(r.a._state().bank, [], 'what was written before you spoke is never said');
  r.queue.push(stretch('Fresh one. Fresh two.'), () => new Promise(() => {}));
  r.setBusy(false);
  await r.c.tick(500);
  const last = r.log.requests[2];
  assert.equal(r.log.requests.length, 4, 'the fresh short one, and the long one behind it');
  assert.equal(last.size, 'short');
  assert.equal(last.said, 'One here.');
  assert.deepEqual(r.voices.at(-1).pushed, ['Fresh one.', 'Fresh two.']);
});

await ok('the sentence after has already begun when you type: it is cut on its first syllable', async () => {
  let typed = false;
  const r = rig({ typed: () => typed, replies: [stretch('One here. Two here.'), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  r.voices[0].start(0, 300);
  typed = true;
  r.voices[0].start(1, 300);                    // the browser says "two" started before "one" ended
  await r.c.tick(0);
  assert.deepEqual(r.log.said, ['One here.'], 'the first counts as said');
  assert.ok(r.voices[0].stopped);
  assert.equal(r.busy(), false);
});

await ok('no provider, no budget: it stops and says why; busy waits; three failures stop it', async () => {
  const a = rig({ replies: [{ available: false, reason: 'byok' }] });
  a.a.start(); await a.c.tick(10);
  assert.equal(a.a.isOn(), false);
  assert.deepEqual(a.log.states.at(-1), { on: false, why: 'byok', budget: undefined });
  const b = rig({ replies: [{ available: false, reason: 'budget', budget: { remaining: 0 } }] });
  b.a.start(); await b.c.tick(10);
  assert.deepEqual(b.log.states.at(-1), { on: false, why: 'budget', budget: { remaining: 0 } });
  const c = rig({ replies: [{ available: false, reason: 'busy' }, stretch('Then words.')] });
  c.a.start(); await c.c.tick(2000);
  assert.equal(c.a.isOn(), true);
  assert.deepEqual(c.voices[0].pushed, ['Then words.']);
  const d = rig({ replies: [] });
  d.a.start(); await d.c.tick(20000);
  assert.equal(d.log.requests.length, 3);
  assert.deepEqual(d.log.states.at(-1), { on: false, why: 'upstream' });
});

await ok('a tab you are not looking at finishes its sentence, rests, and asks for nothing', async () => {
  let away = false;
  const r = rig({ hidden: () => away, replies: [stretch('One here. Two here. Three here. Four here. Five here. Six here.')] });
  r.a.start(); await r.c.tick(10);
  away = true;
  r.voices[0].start(0, 200); await r.c.tick(300); r.voices[0].end_(0);
  r.voices[0].start(1, 200); await r.c.tick(300); r.voices[0].end_(1); await r.c.tick(0);
  assert.equal(r.busy(), false);
  assert.equal(r.log.requests.length, 1);
  assert.deepEqual(r.voices[0].pushed, ['One here.', 'Two here.'], 'nothing more is given to the voice');
  away = false; r.a.pump(); await r.c.tick(0);
  assert.deepEqual(r.voices.at(-1).pushed.slice(-2), ['Three here.', 'Four here.']);
});

await ok('a voice that never starts: the rest is read at the pace it would be said', async () => {
  const r = rig({ replies: [stretch('One here. Two here.'), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  await r.c.tick(START_WAIT_MS + 10);
  assert.equal(r.a._state().mute, true);
  await r.c.tick(5000);
  assert.deepEqual(r.log.said, ['One here.', 'Two here.']);
});

await ok('leaving the room ends it, and the floor is given back', async () => {
  const r = rig({ replies: [stretch('One here. Two here.'), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  assert.equal(r.busy(), true);
  r.moveRoom(); r.a.pump();
  assert.equal(r.a.isOn(), false);
  assert.equal(r.busy(), false);
  assert.deepEqual(r.log.states.at(-1), { on: false, why: 'room' });
});

await ok('a long run starts a new line in the ring; so does a long wait for the next stretch', async () => {
  const s = 'Words go here and keep going for a while. ';
  let later = null;
  const r = rig({ replies: [stretch(s.repeat(7)), () => new Promise((res) => { later = res; }), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  for (let i = 0; i < 7; i++) { r.voices[0].start(i, 100); await r.c.tick(150); r.voices[0].end_(i); await r.c.tick(0); }
  assert.equal(r.busy(), false, 'the bank ran dry: the floor is free while the next stretch is written');
  await r.c.tick(13000);
  later(stretch('After the wait.'));
  await r.c.tick(10);
  r.voices.at(-1).start(0, 100); await r.c.tick(150); r.voices.at(-1).end_(0); await r.c.tick(0);
  const lines = r.log.shown.filter((t, i, all) => !(all[i + 1] || '').startsWith(t));
  assert.ok(lines.every((l) => l.length <= LINE_CHARS + s.length), 'no line runs past the limit');
  assert.equal(lines.length, 3, JSON.stringify(lines));
  assert.equal(lines.at(-1), 'After the wait.', 'after a long wait the next sentence starts its own line');
});

await ok('you speak mid-sentence: its sentence is shown whole first, and what follows starts below your words', async () => {
  const r = rig({ replies: [stretch('First sentence is here. Second one now.'), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  r.voices[0].start(0, 1000); await r.c.tick(300);
  assert.equal(r.log.shown.at(-1), 'First sentence', 'half-said');
  r.a.settleLine();
  assert.equal(r.log.shown.at(-1), 'First sentence is here.', 'whole, before your line goes in');
  await r.c.tick(1000); r.voices[0].end_(0); r.voices[0].start(1, 200); await r.c.tick(300);
  assert.equal(r.log.shown.at(-1), 'Second one now.', 'a line of its own, not grown onto the first');
  assert.equal(r.log.shown.filter((t) => t === 'First sentence is here.').length, 1, 'shown whole once');
});

await ok('someone else\'s line went in below: it does not grow its old line again, it starts a new one', async () => {
  let mine = true;
  const r = rig({ isLast: () => mine, replies: [stretch('One here now. Two here now.'), () => new Promise(() => {})] });
  r.a.start(); await r.c.tick(10);
  r.voices[0].start(0, 200); await r.c.tick(300); r.voices[0].end_(0);
  mine = false;
  r.voices[0].start(1, 200); await r.c.tick(300);
  assert.equal(r.log.shown.at(-1), 'Two here now.');
});

await ok('the reading voice keeps time and stops when told', async () => {
  const c = clock();
  const ev = [];
  const v = readingVoice({ onChunk: (t, p) => ev.push(`${p}:${t}`), timer: c });
  v.push('Hi there.'); v.push('Bye.');
  await c.tick(5000);
  assert.deepEqual(ev, ['start:Hi there.', 'end:Hi there.', 'start:Bye.', 'end:Bye.']);
  v.stop(); v.push('more'); await c.tick(5000);
  assert.equal(ev.length, 4);
});

console.log(`\n${passed} checks passed.`);
