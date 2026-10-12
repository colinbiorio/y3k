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
// the same way. And what any page can make the server hold is bounded: a page
// that stops reading is cut off, no job is larger than y3kode takes, an account
// has two turns out at most, a page whose session was cut off since it opened
// gets no more turns, and what a page says back reaches the log as one plain
// line. The prompt it builds is the one the founder's local brain used to
// build (local-claude-code.mjs, gone): the same checks, moved here.
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { createRelay, WHO, toPrompt, MAX_PAGES, MAX_SYSTEM, MAX_PROMPT, MAX_JOBS, MAX_BUFFERED } from '../own-relay.mjs';
import { COMMANDS, validateCommand } from '../y3k-code/protocol.mjs';

let passed = 0;
// the relay's timers do not hold a process open (the server's own listener
// does); this one stands in for it
const keep = setInterval(() => {}, 1000);
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// a page holding GET /api/own-brain open. stall() makes it stop reading: from
// then on what is written waits unread, as it does on a socket nobody drains
function page() {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.status = 0;
  res.out = '';
  res.writableLength = 0;
  let stalled = false;
  res.writeHead = (s) => { res.status = s; };
  res.write = (t) => { if (res.destroyed) throw new Error('write after destroy'); res.out += t; if (stalled) res.writableLength += Buffer.byteLength(t); return !stalled; };
  res.end = (t = '') => { res.out += t; res.ended = true; };
  res.destroy = () => { res.destroyed = true; res.emit('close'); };
  res.stall = () => { stalled = true; };
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

console.log('\nwhat a page can make the server hold:');

// the job events a page has been sent
const jobsOf = (p) => p.events().filter((e) => e.ev === 'job').map((e) => e.data);

await ok('a page that stops reading is cut off before more is buffered for it, and what it was asked fails at once', async () => {
  assert.ok(MAX_BUFFERED >= 1024 * 1024 && MAX_BUFFERED <= 4 * 1024 * 1024, `a small bound, about 2MB: ${MAX_BUFFERED}`);
  // (a short timeout, so a turn written past the bound would fail as 'timeout', not hang)
  const relay = createRelay({ maxBuffered: 4096, maxJobs: 10, timeoutMs: 300 });
  const a = page();
  relay.open(a.req, a.res, member, {});
  a.res.stall();
  const first = relay.ask(member, { system: 's', prompt: 'x'.repeat(3000) });
  const second = relay.ask(member, { system: 's', prompt: 'y'.repeat(3000) });
  assert.equal(jobsOf(a).length, 2, 'under the bound, a job is written');
  assert.ok(a.res.writableLength > 4096);
  const third = relay.ask(member, { system: 's', prompt: 'z' });
  for (const p of [first, second, third]) assert.equal((await p).status, 'gone');
  assert.equal(jobsOf(a).length, 2, 'nothing more was queued behind what it was not reading');
  assert.equal(a.res.destroyed, true, 'its connection was taken down');
  assert.equal(relay.connected(member), false);
  assert.equal(relay.pending, 0);
  // a page that reads what it is sent is never cut, however much it is sent
  const b = page();
  relay.open(b.req, b.res, member, {});
  for (let i = 0; i < 5; i++) {
    const pending = relay.ask(member, { system: 's', prompt: 'w'.repeat(3000) });
    relay.answer(member, jobsOf(b).at(-1).id, { ok: true, text: 'read' });
    assert.equal((await pending).text, 'read');
  }
  assert.equal(relay.connected(member), true);
});

await ok('…and on a real socket that never reads, the server holds no more than the bound and one job', async () => {
  const relay = createRelay({ maxJobs: 1 });
  let res0 = null;
  const server = http.createServer((req, res) => { res0 = res; relay.open(req, res, member, {}); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const sock = net.connect(server.address().port, '127.0.0.1');
  await new Promise((r) => sock.once('connect', r));
  sock.write('GET /api/own-brain HTTP/1.1\r\nHost: x\r\n\r\n');
  sock.pause();   // a page with a session that never reads its stream
  assert.ok(await (async () => { for (let i = 0; i < 200 && !relay.connected(member); i++) await new Promise((r) => setTimeout(r, 5)); return relay.connected(member); })());
  const big = 'q'.repeat(MAX_PROMPT - 100);
  let most = 0, asked = 0;
  // each turn is let go by its asker (the person closed the tab), which frees
  // the account's slot for the next: only the buffer can stop this
  while (relay.connected(member) && asked < 400) {
    const ac = new AbortController();
    const p = relay.ask(member, { system: 's', prompt: big, signal: ac.signal });
    asked += 1;
    most = Math.max(most, res0.writableLength);
    ac.abort();
    await p;
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(relay.connected(member), false, `still holding a stream that read nothing after ${asked} jobs`);
  assert.ok(most <= MAX_BUFFERED + big.length + 1000, `held ${most} bytes unread`);
  sock.destroy();
  await new Promise((r) => server.close(r));
});

await ok('no job is larger than y3kode takes: the prompt is cut to fit, oldest turns first, and the newest always goes', async () => {
  const spec = COMMANDS['brain.complete'];
  assert.equal(MAX_SYSTEM, spec.system.max, 'the system bound is y3kode\'s');
  assert.equal(MAX_PROMPT, spec.prompt.max, 'the prompt bound is y3kode\'s');
  const relay = createRelay({ timeoutMs: 300 });
  const a = page();
  relay.open(a.req, a.res, member, {});
  const p = relay.provider(member, { systemFor: () => 'SYS', replyFrom: (t) => ({ speech: t }) });
  // ten turns of 50k characters, then the newest: about 500k, where y3kode takes 200k
  const long = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn${i} ` + String(i).repeat(50000) }));
  const c = p.chat(null, 'm', [...long, { role: 'user', content: 'and now?' }], null, false, {});
  const job = jobsOf(a).at(-1);
  assert.ok(job.prompt.length <= MAX_PROMPT, `${job.prompt.length} characters`);
  assert.ok(job.prompt.endsWith('Their newest message:\nand now?'), 'the newest message went last');
  assert.ok(job.prompt.includes('turn9 ') && job.prompt.includes('turn8 ') && !job.prompt.includes('turn0 '), 'the oldest turns go first, the newest stay');
  assert.ok(job.prompt.startsWith('The conversation so far:\n'), job.prompt.slice(0, 60));
  assert.deepEqual(validateCommand({ cmd: 'brain.complete', provider: job.provider, system: job.system, prompt: job.prompt, effort: job.effort }), { ok: true }, 'y3kode would refuse it');
  relay.answer(member, job.id, { ok: true, text: 'ok' });
  await c;
  // one newest message larger than the whole: its newest end goes
  const huge = 'a'.repeat(150000) + 'b'.repeat(150000) + 'THE END';
  const c2 = p.chat(null, 'm', [{ role: 'user', content: 'before' }, { role: 'user', content: huge }], 'frame', false, {});
  const job2 = jobsOf(a).at(-1);
  assert.equal(job2.prompt.length, MAX_PROMPT);
  assert.ok(job2.prompt.endsWith('bTHE END') && !job2.prompt.includes('before'), 'the newest end of the newest message');
  assert.ok(job2.prompt.startsWith('(A camera frame') && job2.prompt.includes('cannot see it.)\nTheir newest message:\naaa'), 'the lines around it stay whole');
  relay.answer(member, job2.id, { ok: true, text: 'ok' });
  await c2;
  // an ordinary conversation is not touched
  assert.equal(toPrompt([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'how?' }], null),
    'The conversation so far:\nThem: hi\nYou: hello\n\nTheir newest message:\nhow?');
  // a bound the fixed lines alone fill: nothing but them, never the whole message
  assert.equal(toPrompt([{ role: 'user', content: 'abc' }], null, 22), 'Their newest message:\n');
  // a system prompt past y3kode's bound fails at once, and nothing is written
  const n = jobsOf(a).length;
  const r = await relay.ask(member, { system: 's'.repeat(MAX_SYSTEM + 1), prompt: 'p' });
  assert.deepEqual([r.ok, r.status], [false, 'too-large']);
  assert.equal((await relay.ask(member, { system: 's', prompt: 'p'.repeat(MAX_PROMPT + 1) })).status, 'too-large');
  assert.equal(jobsOf(a).length, n, 'an oversized job was written');
  assert.equal(relay.pending, 0);
});

await ok(`one account has at most ${MAX_JOBS} turns out at once; past that, 'busy' at once and nothing is written`, async () => {
  assert.ok(MAX_JOBS >= 1 && MAX_JOBS <= 3, `about what y3kode runs at once: ${MAX_JOBS}`);
  const relay = createRelay({ timeoutMs: 300 });
  const a = page(), b = page(), t = page();
  relay.open(a.req, a.res, member, {});
  relay.open(b.req, b.res, member, {});
  relay.open(t.req, t.res, other, {});
  const out = Array.from({ length: MAX_JOBS }, () => relay.ask(member, { system: 's', prompt: 'p' }));
  assert.equal(jobsOf(b).length, MAX_JOBS);
  const over = await relay.ask(member, { system: 's', prompt: 'p' });
  assert.deepEqual([over.ok, over.status], [false, 'busy']);
  assert.equal(jobsOf(a).length + jobsOf(b).length, MAX_JOBS, 'the turn past the bound reached a page');
  // another account's are its own count
  const theirs = relay.ask(other, { system: 's', prompt: 'p' });
  assert.equal(jobsOf(t).length, 1);
  relay.answer(other, jobsOf(t)[0].id, { ok: true, text: 'theirs' });
  assert.equal((await theirs).text, 'theirs');
  // one answered, one more may go
  relay.answer(member, jobsOf(b)[0].id, { ok: true, text: 'done' });
  assert.equal((await out[0]).text, 'done');
  const next = relay.ask(member, { system: 's', prompt: 'p' });
  assert.equal(jobsOf(b).length, MAX_JOBS + 1);
  for (const j of jobsOf(b).slice(1)) relay.answer(member, j.id, { ok: true, text: 'x' });
  await Promise.all([...out, next]);
  assert.equal(relay.pending, 0);
});

await ok('a page whose session was cut off since it opened gets no more turns: it is let go before the next is chosen', async () => {
  const relay = createRelay();
  const stands = { a: true, b: true };
  const a = page(), b = page();
  relay.open(a.req, a.res, member, { valid: () => stands.a });
  relay.open(b.req, b.res, member, { valid: () => stands.b });
  const held = relay.ask(member, { system: 's', prompt: 'p' });
  assert.equal(jobsOf(b).length, 1, 'the newest page was asked');
  // b's session is cut off (an account reclaimed through Google, say)
  stands.b = false;
  assert.equal(relay.connected(member), true, 'a still stands');
  assert.equal(b.res.ended, true, 'the page on a cut-off session was let go');
  assert.equal((await held).status, 'gone', 'what it was holding failed at once');
  const next = relay.ask(member, { system: 's', prompt: 'p' });
  assert.equal(jobsOf(b).length, 1, 'a turn reached a page whose session no longer stands');
  relay.answer(member, jobsOf(a)[0].id, { ok: true, text: 'from a' });
  assert.equal((await next).text, 'from a');
  // and the last one going leaves nothing to think with
  stands.a = false;
  assert.equal(relay.connected(member), false);
  assert.equal((await relay.ask(member, { system: 's', prompt: 'p' })).status, 'no-page');
  // a check that throws is a no
  const c = page();
  relay.open(c.req, c.res, member, { valid: () => { throw new Error('no session store'); } });
  assert.equal(relay.connected(member), false);
  // with no check given, a page stands as long as its stream does (as before)
  const d = page();
  relay.open(d.req, d.res, member, {});
  assert.equal(relay.connected(member), true);
});

await ok('what a page says back reaches the log as one plain line: y3kode\'s word for it, or "failed"', async () => {
  const relay = createRelay();
  const a = page();
  relay.open(a.req, a.res, member, {});
  const refuse = async (b) => { const p = relay.ask(member, { system: 's', prompt: 'p' }); relay.answer(member, jobsOf(a).at(-1).id, b); return p; };
  const LS = String.fromCharCode(0x2028), NEL = String.fromCharCode(0x85);
  for (const code of ['signed-out', 'busy', 'not-installed', 'declined']) assert.equal((await refuse({ ok: false, code })).status, code);
  for (const code of ['signed-out\n[own] forged line', 'Refused', '-x', 'a'.repeat(41), 'x y', 'ok\r', 42, null, { toString: () => 'busy' }]) {
    assert.equal((await refuse({ ok: false, code })).status, 'failed', JSON.stringify(String(code)));
  }
  const r = await refuse({ ok: false, code: 'refused', error: `one\n[own] claude forged\r\n\x1b[31mred\x00${LS}two${NEL}three\ttab` });
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(r.detail) && !r.detail.includes(LS), JSON.stringify(r.detail));
  assert.match(r.detail, /^one \[own\] claude forged \[31mred two three tab$/);
  assert.equal((await refuse({ ok: false, error: 'x'.repeat(5000) })).detail.length, 400);
  assert.equal((await refuse({ ok: false, error: { not: 'text' } })).detail, '');
  assert.deepEqual(await refuse(null), { ok: false, status: 'failed', detail: '' }, 'an empty answer is a failure, not a throw');
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
