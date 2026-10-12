// YOUR OWN BRAIN, THROUGH YOUR OWN PAGE (own-relay.mjs). Run:
// node test/own-relay.test.mjs
//
// The hosted site hands a turn of a person's presence to that person's open
// page and waits for the words — any signed-in account, the founder like
// anyone (2026-10-12). These pin: every account may offer, and nobody without
// one; a turn goes only to a page of the account it belongs to, and only that
// account may answer it; a closed page or a slow one fails the turn at once or
// in time rather than hanging; one account cannot pile up pages; and the
// provider it builds has the same shape as the others, so the routes call it
// the same way. The prompt it builds is the one the founder's local brain used
// to build (local-claude-code.mjs, gone): the same checks, moved here.
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { createRelay, WHO, toPrompt, MAX_PAGES } from '../own-relay.mjs';

let passed = 0;
// the relay's timers do not hold a process open (the server's own listener
// does); this one stands in for it
const keep = setInterval(() => {}, 1000);
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// a page holding GET /api/own-brain open
function page() {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.status = 0;
  res.out = '';
  res.writeHead = (s) => { res.status = s; };
  res.write = (t) => { res.out += t; return true; };
  res.end = (t = '') => { res.out += t; res.ended = true; };
  const events = () => res.out.split('\n\n').filter((b) => b.startsWith('event: ')).map((b) => {
    const [e, d] = b.split('\n');
    return { ev: e.slice(7), data: JSON.parse(d.slice(6)) };
  });
  return { req, res, events, close: () => req.emit('close') };
}
const founder = { id: 'u1', founder: true };
const member = { id: 'u2', founder: false };
const other = { id: 'u3' };

console.log('your own brain, through your own page:');

await ok('every signed-in account may offer, the founder like anyone; nobody without an account', async () => {
  for (const u of [founder, member, other]) assert.equal(WHO(u), true, JSON.stringify(u));
  for (const u of [null, undefined, {}, { id: '' }, { id: 42 }, { founder: true }]) assert.equal(WHO(u), false, JSON.stringify(u));
  const relay = createRelay();
  const nobody = page();
  relay.open(nobody.req, nobody.res, { founder: true }, { provider: 'claude' });
  assert.equal(nobody.res.status, 403, 'a founder flag is not an account');
  assert.equal((await relay.ask(null, { system: 's', prompt: 'p' })).status, 'not-yours');
  const p = page();
  relay.open(p.req, p.res, member, { provider: 'claude' });
  assert.equal(p.res.status, 200);
  assert.equal(relay.connected(member), true);
  assert.equal(relay.connected(founder), false, 'one account\'s page is not another\'s');
});

await ok('a turn goes only to a page of the account it belongs to, and only that account may answer it', async () => {
  const relay = createRelay();
  const mine = page(), theirs = page(), colin = page();
  relay.open(mine.req, mine.res, member, {});
  relay.open(theirs.req, theirs.res, other, {});
  relay.open(colin.req, colin.res, founder, {});
  const pending = relay.ask(member, { system: 'SYS', prompt: 'mine' });
  const job = mine.events().find((e) => e.ev === 'job')?.data;
  assert.ok(job, 'the member\'s page was asked');
  for (const p of [theirs, colin]) assert.ok(!p.events().some((e) => e.ev === 'job'), 'another account\'s page was asked');
  for (const u of [other, founder, null, { id: member.id + 'x' }]) assert.equal(relay.answer(u, job.id, { ok: true, text: 'not yours' }), false, JSON.stringify(u));
  assert.equal(relay.answer(member, job.id, { ok: true, text: 'mine' }), true);
  assert.equal((await pending).text, 'mine');
  // and the founder's own turn goes to the founder's page, as anyone's does
  const p2 = relay.ask(founder, { system: 'S', prompt: 'P' });
  const j2 = colin.events().find((e) => e.ev === 'job')?.data;
  assert.ok(j2 && mine.events().filter((e) => e.ev === 'job').length === 1);
  assert.equal(relay.answer(member, j2.id, { ok: true, text: 'x' }), false);
  relay.answer(founder, j2.id, { ok: true, text: 'colin' });
  assert.equal((await p2).text, 'colin');
});

await ok('no page open: the turn fails at once, saying so', async () => {
  const relay = createRelay();
  assert.equal(relay.connected(founder), false);
  const r = await relay.ask(founder, { system: 's', prompt: 'p' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'no-page');
});

await ok('a turn goes to the newest page, and its answer comes back', async () => {
  const relay = createRelay();
  const a = page(), b = page();
  relay.open(a.req, a.res, member, { provider: 'claude' });
  relay.open(b.req, b.res, member, { provider: 'nope' });
  assert.equal(relay.connected(member), true);
  assert.deepEqual(b.events()[0], { ev: 'ready', data: { provider: 'claude' } }, 'an unknown client is the one that can think');
  const pending = relay.ask(member, { system: 'SYS', prompt: 'PROMPT', effort: 'low' });
  const job = b.events().find((e) => e.ev === 'job').data;
  assert.ok(!a.events().some((e) => e.ev === 'job'), 'one page, not every page');
  assert.match(job.id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...job, id: 'x' }, { id: 'x', provider: 'claude', system: 'SYS', prompt: 'PROMPT', effort: 'low' });
  // nobody else may answer it, not even with its id — the founder included
  assert.equal(relay.answer(other, job.id, { ok: true, text: 'not yours' }), false);
  assert.equal(relay.answer(founder, job.id, { ok: true, text: 'not yours either' }), false);
  assert.equal(relay.answer(member, job.id, { ok: true, text: '[calm] hello', usage: { in: 10, out: -4, cacheRead: 'x' } }), true);
  assert.equal(relay.answer(member, job.id, { ok: true, text: 'again' }), false, 'answered once');
  const r = await pending;
  assert.deepEqual(r, { ok: true, text: '[calm] hello', usage: { in: 10, out: 0, cacheRead: 0, cacheWrite: 0 } });
  assert.equal(relay.pending, 0);
});

await ok('a page that closes fails what it was asked at once; the next page takes over', async () => {
  const relay = createRelay();
  const a = page();
  relay.open(a.req, a.res, founder, {});
  const pending = relay.ask(founder, { system: 's', prompt: 'p' });
  a.close();
  const r = await pending;
  assert.equal(r.ok, false);
  assert.equal(r.status, 'gone');
  assert.equal(relay.connected(founder), false);
  const b = page();
  relay.open(b.req, b.res, founder, {});
  assert.equal(relay.connected(founder), true);
});

await ok('a page that never answers: the turn fails in time and the page is told to let it go; a refusal says why', async () => {
  const relay = createRelay({ timeoutMs: 30 });
  const a = page();
  relay.open(a.req, a.res, founder, {});
  const r = await relay.ask(founder, { system: 's', prompt: 'p' });
  assert.equal(r.status, 'timeout');
  assert.ok(a.events().some((e) => e.ev === 'cancel'));
  const p2 = relay.ask(founder, { system: 's', prompt: 'p' });
  const job = a.events().filter((e) => e.ev === 'job').pop().data;
  relay.answer(founder, job.id, { ok: false, code: 'signed-out', error: 'run claude, then /login' });
  assert.deepEqual(await p2, { ok: false, status: 'signed-out', detail: 'run claude, then /login' });
  // and the person going away mid-turn
  const ac = new AbortController();
  const p3 = relay.ask(founder, { system: 's', prompt: 'p', signal: ac.signal });
  ac.abort();
  assert.equal((await p3).status, 'aborted');
});

await ok('its provider has the routes\' shape: the conversation flattened, the reply parsed, streamed whole', async () => {
  const relay = createRelay();
  const a = page();
  relay.open(a.req, a.res, member, {});
  const p = relay.provider(member, { systemFor: (paint, opts) => opts?.system || (paint ? 'SYS+PAINT' : 'SYS'), replyFrom: (text) => ({ speech: text.replace(/^\[[^\]]*\]\s*/, ''), mood: 'calm' }) });
  assert.equal(p.detect('sk-anything'), false, 'never chosen by a key');
  const answer = async (text) => { for (let i = 0; i < 50; i++) { const j = a.events().filter((e) => e.ev === 'job').pop()?.data; if (j && relay.answer(member, j.id, { ok: true, text })) return j; await new Promise((r) => setTimeout(r, 2)); } throw new Error('no job'); };
  const c = p.chat(null, 'm', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'what is up' }], null, true, { noThink: true });
  const job = await answer('[calm] not much');
  assert.equal(job.system, 'SYS+PAINT');
  assert.equal(job.effort, 'low');
  assert.match(job.prompt, /Them: hi\nYou: hello/);
  assert.match(job.prompt, /Their newest message:\nwhat is up$/);
  assert.equal((await c).speech, 'not much');
  const said = [];
  const s = p.chatStream(null, 'm', [{ role: 'user', content: 'go' }], (t) => said.push(t), null, false, null, { system: 'OWN' });
  const job2 = await answer('[calm] went');
  assert.equal(job2.system, 'OWN');
  assert.equal(job2.effort, 'medium');
  assert.equal((await s).ok, true);
  assert.deepEqual(said, ['[calm] went']);
});

await ok(`one account holds at most ${MAX_PAGES} pages: past that the oldest is let go, and what it was asked fails at once`, async () => {
  // the oldest page is holding a turn when the page past the cap arrives
  const busy = createRelay();
  const held = page();
  busy.open(held.req, held.res, member, {});
  const asked = busy.ask(member, { system: 's', prompt: 'p' });
  for (let i = 0; i < MAX_PAGES; i++) { const p = page(); busy.open(p.req, p.res, member, {}); }
  assert.equal(held.res.ended, true, 'the oldest page was ended');
  // …and told why first, so it closes for good rather than reconnect and push
  // the next oldest out in turn (src/own-brain.js, 'replaced')
  assert.deepEqual(held.events().at(-1), { ev: 'replaced', data: {} }, 'the page let go is told it was replaced');
  assert.equal((await asked).status, 'gone');
  assert.equal(busy.connected(member), true, 'the newest pages still offer');
  // a full house of pages, and one more: exactly the oldest goes
  const relay = createRelay();
  const pages = Array.from({ length: MAX_PAGES }, () => page());
  for (const p of pages) relay.open(p.req, p.res, member, {});
  const extra = page();
  relay.open(extra.req, extra.res, member, {});
  assert.deepEqual(pages.map((p) => !!p.res.ended), [true, ...Array(MAX_PAGES - 1).fill(false)]);
  assert.deepEqual([...pages, extra].map((p) => p.events().some((e) => e.ev === 'replaced')), [true, ...Array(MAX_PAGES).fill(false)],
    'only the page let go is told so');
  const pending = relay.ask(member, { system: 's', prompt: 'p' });
  const job = extra.events().find((e) => e.ev === 'job')?.data;
  assert.ok(job, 'a turn goes to the newest page');
  relay.answer(member, job.id, { ok: true, text: 'ok' });
  assert.equal((await pending).text, 'ok');
  // another account's pages are its own count
  const theirs = page();
  relay.open(theirs.req, theirs.res, other, {});
  assert.ok(!theirs.res.ended && !extra.res.ended);
});

console.log('\nthe prompt it hands the page (moved here from local-claude-code.mjs):');

await ok('the conversation arrives as a transcript, newest message last', () => {
  const prompt = toPrompt([
    { role: 'user', content: 'hi orb' },
    { role: 'assistant', content: '[calm] hello' },
    { role: 'user', content: [{ type: 'text', text: 'how are you?' }, { type: 'image', source: {} }] },
  ], null);
  assert.ok(prompt.includes('Them: hi orb') && prompt.includes('You: [calm] hello'), prompt);
  assert.ok(prompt.trimEnd().endsWith('Their newest message:\nhow are you?'), prompt);
});

await ok('a message starting with "/" is never read as a Claude Code command', () => {
  const prompt = toPrompt([{ role: 'user', content: '/help me' }], null);
  assert.ok(!prompt.startsWith('/'), prompt);
  assert.ok(prompt.endsWith('/help me'));
});

await ok('a camera frame is admitted to, not pretended; silence is answered as silence', () => {
  assert.match(toPrompt([{ role: 'user', content: 'look at me' }], 'base64data'), /cannot see it/);
  assert.match(toPrompt([{ role: 'assistant', content: 'still there?' }], null), /You: still there\?[\s\S]*no words — respond to the silence/);
  assert.match(toPrompt('not a list', null), /^Their newest message:\n\(no words/);
});

clearInterval(keep);
console.log(`\n${passed} checks passed.`);
