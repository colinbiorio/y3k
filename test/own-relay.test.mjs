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
// gets no more turns, a page let go that is not reading is taken down rather
// than left holding what waits for it, and what a page says back reaches the
// log as one plain line. What waits unread is counted in bytes, across an
// account's pages together and across every page at once, the pages holding
// the most cut first; every ping asks again whether a page's session stands,
// and a closed account's pages go at once (forget). And everyone together:
// no machine that asks (its source) is refused for what it holds below the
// site's ceiling — a shared address is many people, and eight strangers on a
// carrier's IPv4, each with two ordinary turns out, once refused a ninth
// person there — and at the site's generous ceiling, now that the site-wide
// breaker is gone, each account is judged as itself, never by the address it
// shares: one person's ordinary share (two turns of an ordinary size) is
// never let go for anyone else's, however many strangers ask from however
// many addresses, nor is a crowd of such people behind one busy address
// refused or let go for it; only an account past its share gives up its
// largest, the one furthest past its own first, wherever it asks from and
// whoever shares its address (a machine flooding, a person behind it asking
// too, a campus's long conversations no sooner than the same one alone), and
// only to someone who would hold less past theirs, a tie goes against the asker, and with
// nobody past their share the newcomer is the one refused. A hundred
// accounts each holding two of the largest turns are past their share, and
// cannot refuse a person's ordinary turn; a conversation unusually long is
// past it too, and given up only in a flood. What a turn holds is all of it:
// the route's body while it waits (holds), with the relay's own copy. Code's
// translator never takes the last
// of an account's turns (spare), and the two refusals that are not the plan's
// limit have words of their own for the page (ownWhy). The prompt it builds is
// the one the founder's local brain used to build (local-claude-code.mjs,
// gone): the same checks, moved here.
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { createRelay, WHO, toPrompt, ownWhy, OWN_WHYS, MAX_PAGES, MAX_SYSTEM, MAX_PROMPT, MAX_JOBS, MAX_BUFFERED, MAX_PENDING, MAX_HELD, LET_GO_MS,
  MAX_UNREAD, SHARE_BYTES } from '../own-relay.mjs';
import * as relayModule from '../own-relay.mjs';
import { COMMANDS, validateCommand } from '../y3k-code/protocol.mjs';

let passed = 0;
// the relay's timers do not hold a process open (the server's own listener
// does); this one stands in for it
const keep = setInterval(() => {}, 1000);
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// a page holding GET /api/own-brain open. stall() makes it stop reading: from
// then on what is written waits unread, as it does on a socket nobody drains.
// Its end finishes at once while nothing waits unread, as a reading page's
// does; `endHangs` makes an end that never finishes, for the backstop.
// `nodeCount` counts what waits as Node's own stream does — a string by its
// characters, a Buffer by its bytes — where otherwise it is counted in bytes
// whatever it was written as. res.kinds: what each write was, by kind.
function page({ endHangs = false, nodeCount = false } = {}) {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.status = 0;
  res.out = '';
  res.writableLength = 0;
  res.kinds = new Set();
  let stalled = false;
  res.writeHead = (s) => { res.status = s; };
  res.write = (t) => {
    if (res.destroyed) throw new Error('write after destroy');
    res.kinds.add(Buffer.isBuffer(t) ? 'buffer' : typeof t);
    res.out += t;
    if (stalled) res.writableLength += nodeCount ? t.length : Buffer.byteLength(t);
    return !stalled;
  };
  res.end = (t = '') => { res.out += t; res.ended = true; if (!endHangs && !res.writableLength) { res.writableFinished = true; res.emit('finish'); } };
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
  assert.ok(job2.prompt.startsWith('(A camera frame') && job2.prompt.includes('right now.)\nTheir newest message:\naaa'), 'the lines around it stay whole');
  assert.equal(job2.image, 'frame', 'the frame rides with the job (2026-10-19), and the words say it is there');
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

// A real page on a real socket that stops reading once its stream is open:
// what the relay writes to it waits, first in the kernel's buffers and then in
// this server's (res.writableLength). `opts` is what the route gives open().
async function pausedPage(relay, user, opts = {}) {
  let res0 = null;
  const server = http.createServer((req, res) => { res0 = res; relay.open(req, res, user, opts); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const sock = net.connect(server.address().port, '127.0.0.1');
  await new Promise((r) => sock.once('connect', r));
  sock.write('GET /api/own-brain HTTP/1.1\r\nHost: x\r\n\r\n');
  sock.pause();
  for (let i = 0; i < 200 && !res0; i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(res0, 'the page never reached the relay');
  return { res: () => res0, end: async () => { sock.destroy(); await new Promise((r) => server.close(r)); } };
}
// Turns sent to it, each let go by its asker so the account's turns stay
// free, until this server holds some of it unread: under the bound, so the
// page is still held and nothing has cut it.
async function fillUnder(relay, user, res) {
  const chunk = 'f'.repeat(64 * 1024);
  for (let i = 0; i < 2000 && !(res.writableLength > 0); i++) {
    const ac = new AbortController();
    const p = relay.ask(user, { system: 's', prompt: chunk, signal: ac.signal });
    ac.abort();
    await p;
    await new Promise((r) => setImmediate(r));
  }
  assert.ok(res.writableLength > 0, 'nothing ever waited unread in this server');
  assert.ok(res.writableLength <= MAX_BUFFERED, `past the bound already: ${res.writableLength}`);
  assert.ok(!res.destroyed && relay.connected(user), 'the page was cut before it was let go');
}

await ok('a page let go for newer ones, holding unread what it was sent, is taken down: cycling pages cannot hold a bound each', async () => {
  const relay = createRelay();
  const p = await pausedPage(relay, member);
  try {
    const res = p.res();
    await fillUnder(relay, member, res);
    // newer pages of the same account arrive: the paused one is the oldest
    for (let i = 0; i < MAX_PAGES; i++) { const q = page(); relay.open(q.req, q.res, member, {}); }
    assert.equal(res.destroyed, true, `let go with ${res.writableLength} bytes unread, and its connection left open`);
    assert.equal(relay.connected(member), true, 'the newer pages still offer');
    assert.equal(relay.pending, 0);
  } finally { await p.end(); }
});

await ok('…and so is one let go because its session was cut off since it opened', async () => {
  const relay = createRelay();
  const stands = { yes: true };
  const p = await pausedPage(relay, member, { valid: () => stands.yes });
  try {
    const res = p.res();
    await fillUnder(relay, member, res);
    stands.yes = false;
    assert.equal(relay.connected(member), false);
    assert.equal(res.destroyed, true, `let go with ${res.writableLength} bytes unread, and its connection left open`);
  } finally { await p.end(); }
});

await ok('a page let go that reads is told why and ended cleanly, never cut; an end that never finishes is cut in time', async () => {
  // a real page that reads its stream
  const relay = createRelay();
  let res0 = null;
  const server = http.createServer((req, res) => { res0 = res; relay.open(req, res, member, {}); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    let read = 0;
    const got = new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/own-brain' }, (inc) => {
        let body = '';
        inc.setEncoding('utf8');
        inc.on('data', (d) => { body += d; read += d.length; });
        inc.on('end', () => resolve({ body, complete: inc.complete }));
        inc.on('error', reject);
      }).on('error', reject);
    });
    for (let i = 0; i < 200 && !relay.connected(member); i++) await new Promise((r) => setTimeout(r, 5));
    // a turn it is sent and reads, then newer pages arrive
    const asked = relay.ask(member, { system: 's', prompt: 'w'.repeat(MAX_PROMPT) });
    // ...and has read, however long 200KB takes this machine: the clean end
    // below can only finish at once into a connection the page has emptied. A
    // fixed 50ms was not always enough on a busy CI runner (2026-10-21).
    for (let i = 0; i < 2000 && read < MAX_PROMPT; i++) await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < MAX_PAGES; i++) { const q = page(); relay.open(q.req, q.res, member, {}); }
    // (Node marks a response destroyed once its connection is let go after a
    // clean end, so what is asked of it is asked now, and of what arrived)
    assert.deepEqual([res0.destroyed, res0.writableFinished], [false, true], 'a page that reads was taken down, or its end did not finish');
    assert.equal((await asked).status, 'gone');
    const { body, complete } = await got;
    assert.ok(complete, 'the stream was cut, not ended: the page would open it again and push the next oldest out');
    assert.match(body, /event: replaced\ndata: \{\}\n\n$/, 'it was not told why, last');
  } finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
  // an end that has not finished in letGoMs: down
  assert.ok(LET_GO_MS >= 1000 && LET_GO_MS <= 30000, `a few seconds: ${LET_GO_MS}`);
  const quick = createRelay({ letGoMs: 30 });
  const hangs = page({ endHangs: true }), fine = page();
  quick.open(hangs.req, hangs.res, member, {});
  quick.open(fine.req, fine.res, other, {});
  for (const [p, u] of [[hangs, member], [fine, other]]) for (let i = 0; i < MAX_PAGES; i++) { const q = page(); quick.open(q.req, q.res, u, {}); }
  assert.ok(hangs.res.ended && !hangs.res.destroyed, 'not at once: nothing was waiting unread');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(hangs.res.destroyed, true, 'an end that never finished left its connection open');
  assert.ok(fine.res.ended && !fine.res.destroyed, 'an end that finished was cut anyway');
});

await ok('what waits unread is counted in bytes: what is written is a Buffer, so two-byte characters are cut at the bound, not at twice it', async () => {
  // a page that counts what waits as Node does: a string by its characters, a Buffer by its bytes
  const relay = createRelay({ maxBuffered: 4096, maxJobs: 10, timeoutMs: 300 });
  const a = page({ nodeCount: true });
  relay.open(a.req, a.res, member, {});
  a.res.stall();
  // each job about 3100 bytes, and 1600 characters
  const asked = [1, 2, 3].map(() => relay.ask(member, { system: 's', prompt: 'é'.repeat(1500) }));
  assert.equal(jobsOf(a).length, 2, `${jobsOf(a).length} jobs of 3000 bytes each queued behind a page not reading, past a bound of 4096 bytes`);
  assert.ok(a.res.writableLength > 4096 && a.res.writableLength < 2 * 4096, String(a.res.writableLength));
  for (const p of asked) assert.equal((await p).status, 'gone');
  assert.deepEqual([...a.res.kinds], ['buffer'], 'something was written as a string, and counted in characters');
});

// Turns sent to the newest page of `user`, each let go by its asker so the
// account's turns stay free, until `res` holds at least `target` bytes unread
// in this server or is cut.
async function fillTo(relay, user, res, target) {
  const chunk = 'f'.repeat(64 * 1024);
  for (let i = 0; i < 4000 && !res.destroyed && !(res.writableLength >= target); i++) {
    const ac = new AbortController();
    const p = relay.ask(user, { system: 's', prompt: chunk, signal: ac.signal });
    ac.abort();
    await p;
    await new Promise((r) => setImmediate(r));
  }
}
// Every page cut, as it was cut: what it held unread then, and what each of
// the other pages still up held. And every chunk written to them, by kind.
// Pages are watched as they are added.
function watcher() {
  const pages = [], cuts = [], kinds = new Set();
  const add = (p) => {
    const res = p.res(), down = res.destroy.bind(res), put = res.write.bind(res);
    res.destroy = (...a) => {
      if (!res.destroyed) cuts.push({ name: p.name, held: res.writableLength, others: pages.filter((o) => o !== p && !o.res().destroyed).map((o) => o.res().writableLength) });
      return down(...a);
    };
    res.write = (c, ...a) => { kinds.add(Buffer.isBuffer(c) ? 'buffer' : typeof c); return put(c, ...a); };
    pages.push(p);
    return p;
  };
  return { pages, cuts, kinds, add };
}
const unreadOn = (pages) => pages.filter((p) => !p.res().destroyed).reduce((n, p) => n + p.res().writableLength, 0);
// the most one job adds to a page's unread: its 64KB, and its event's lines
const ONE_JOB = 64 * 1024 + 512;

await ok('an account\'s pages together hold no more than the bound unread: newer pages cannot each hold one, and the page holding the most goes first', async () => {
  const bound = 512 * 1024;
  const relay = createRelay({ maxBuffered: bound });
  const seen = watcher();
  try {
    // a page opens, and is sent turns (it is the newest) until it holds three
    // quarters of the bound unread: under it on its own, past it with any
    // other; then the next page opens, up to as many as an account may hold
    for (let i = 0; i < MAX_PAGES; i++) {
      const p = seen.add(Object.assign(await pausedPage(relay, member), { name: `page ${i + 1}` }));
      await fillTo(relay, member, p.res(), bound * 0.75);
      assert.ok(!p.res().destroyed, `${p.name} was cut, holding less than the bound on its own`);
      assert.ok(unreadOn(seen.pages) <= bound + ONE_JOB, `the account's pages hold ${unreadOn(seen.pages)} bytes unread, past ${bound}`);
    }
    assert.ok(seen.cuts.length >= MAX_PAGES - 1, `${seen.cuts.length} pages cut`);
    for (const c of seen.cuts) assert.ok(c.others.every((n) => n <= c.held), `${c.name} was cut holding ${c.held}, while another held ${Math.max(...c.others)}`);
    assert.equal(relay.connected(member), true, 'the newest page was cut for what the older ones held');
    assert.deepEqual([...seen.kinds], ['buffer'], 'something was written as a string, and counted in characters');
    assert.equal(relay.pending, 0);
  } finally { for (const p of seen.pages) await p.end(); }
});

await ok('every page together holds no more than the site\'s bound unread: the pages holding the most are cut first, and a page that reads is never refused for them', async () => {
  const relay = createRelay({ maxBuffered: 512 * 1024, maxUnread: 768 * 1024 });
  const hogs = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }, { id: 'h4' }];
  const seen = watcher();
  // a person whose page reads what it is sent
  const v = page();
  relay.open(v.req, v.res, member, {});
  try {
    for (const u of hogs) seen.add(Object.assign(await pausedPage(relay, u), { name: u.id, user: u }));
    for (const p of seen.pages) {
      // each account holds well under its own bound, and more than the site's share of one
      await fillTo(relay, p.user, p.res(), 320 * 1024);
      assert.ok(p.res().destroyed || p.res().writableLength < 512 * 1024, 'an account was cut on its own bound, not the site\'s');
      // the person asks meanwhile: written at once, and answered
      const n = jobsOf(v).length;
      const mine = relay.ask(member, { system: 's', prompt: 'hello' });
      assert.equal(jobsOf(v).length, n + 1, 'a page that reads was refused for what other pages hold unread');
      relay.answer(member, jobsOf(v).at(-1).id, { ok: true, text: 'answered' });
      assert.equal((await mine).text, 'answered');
      assert.ok(unreadOn(seen.pages) <= 768 * 1024 + ONE_JOB, `every page together holds ${unreadOn(seen.pages)} bytes unread`);
    }
    assert.ok(seen.cuts.length >= 2, `${seen.cuts.length} pages cut, holding four times 320KB against 768KB`);
    for (const c of seen.cuts) assert.ok(c.others.every((n) => n <= c.held), `${c.name} was cut holding ${c.held}, while another held ${Math.max(...c.others)}`);
    assert.ok(!v.res.destroyed && !v.res.ended && relay.connected(member), 'the page that reads was cut');
    assert.equal(relay.pending, 0);
  } finally { for (const p of seen.pages) await p.end(); }
});

await ok('every ping asks again whether the page\'s session stands: one cut off is let go within a ping, though nothing asks for a turn', async () => {
  const relay = createRelay({ pingMs: 20 });
  const stands = { a: true, b: true };
  const a = page(), b = page();
  relay.open(a.req, a.res, member, { valid: () => stands.a });
  relay.open(b.req, b.res, other, { valid: () => stands.b });
  const held = relay.ask(member, { system: 's', prompt: 'p' });
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(a.res.out.includes(': ping\n\n') && !a.res.ended, 'a page whose session stands was not pinged, or was let go');
  // a's session is cut off; from here on nothing asks for a turn of member's
  // or whether they are connected: only the pings
  stands.a = false;
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(a.res.ended, true, 'a page whose session was cut off stayed open until its account next asked for a turn');
  assert.equal((await held).status, 'gone', 'what it held did not fail');
  assert.ok(!b.res.ended, 'another account\'s page was let go');
  // a check that throws is a no here too
  const c = page();
  relay.open(c.req, c.res, founder, { valid: () => { throw new Error('no session store'); } });
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(c.res.ended, true);
  // and one that is not reading is taken down, not left holding what waits for it
  const stand = { yes: true };
  const p = await pausedPage(relay, founder, { valid: () => stand.yes });
  try {
    const res = p.res();
    await fillUnder(relay, founder, res);
    stand.yes = false;
    for (let i = 0; i < 100 && !res.destroyed; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(res.destroyed, true, `let go at a ping with ${res.writableLength} bytes unread, and its connection left open`);
  } finally { await p.end(); }
});

await ok('an account closed: every page of it is let go at once and what they held fails, nobody else\'s; one not reading is taken down', async () => {
  const relay = createRelay();
  const a = page(), b = page(), t = page();
  relay.open(a.req, a.res, member, {});
  relay.open(b.req, b.res, member, {});
  relay.open(t.req, t.res, other, {});
  const held = relay.ask(member, { system: 's', prompt: 'p' });
  const theirs = relay.ask(other, { system: 's', prompt: 'p' });
  relay.forget(member.id);
  assert.deepEqual([a.res.ended, b.res.ended], [true, true], 'a page of a closed account was left open');
  assert.equal((await held).status, 'gone');
  assert.equal(relay.connected(member), false);
  assert.ok(!t.res.ended, 'another account\'s page was let go');
  relay.answer(other, jobsOf(t)[0].id, { ok: true, text: 'theirs' });
  assert.equal((await theirs).text, 'theirs');
  for (const nobody of ['nobody', undefined, null, 42]) relay.forget(nobody);
  assert.equal(relay.connected(other), true);
  const p = await pausedPage(relay, member);
  try {
    const res = p.res();
    await fillUnder(relay, member, res);
    relay.forget(member.id);
    assert.equal(res.destroyed, true, `let go with ${res.writableLength} bytes unread, and its connection left open`);
  } finally { await p.end(); }
});

console.log('\nwhat everyone together can make the server hold, never by refusing someone for someone else:');

// whether a turn is still out (it was written, and waits) or already settled
const settled = (p) => Promise.race([p, new Promise((r) => setImmediate(() => r('out')))]);
const MB = 1024 * 1024;
const FULL_MOST_DETAIL = 'the site is holding as many turns as it holds for everyone, and this connection holds the most of them';
const FULL_SHARE_DETAIL = 'the site is holding as many turns as it holds for everyone, and nobody holds more of them past their own share than this connection would';
// a turn of `bytes` bytes as the relay counts it: a word of system prompt and
// of prompt, and the rest the body its route holds while it waits (holds)
const sized = (bytes) => ({ system: 's', prompt: 'p', holds: bytes - 2 });
// an ordinary turn: a presence's system prompt (about 9KB) and a dozen turns
// of conversation, as written (some 29KB)
const ORDINARY = { system: 'S'.repeat(9000), prompt: `Their newest message:\n${'é'.repeat(10 * 1024)}` };

await ok('the bounds: everyone\'s generous and safe on a small instance, each account\'s two turns, and nothing in between', () => {
  // the bytes guard the memory; the turns are many, so filling them with
  // ordinary shares, which nobody can be made to give up, takes thousands of
  // accounts at once (it was 1024: about five hundred)
  assert.ok(MAX_PENDING / MAX_JOBS >= 4000 && MAX_PENDING <= 16384, `thousands of accounts' two turns: ${MAX_PENDING}`);
  assert.ok(MAX_HELD >= 32 * MB && MAX_HELD <= 128 * MB, `tens of MB: ${MAX_HELD}`);
  // one person's ordinary share holds two ordinary turns: a presence's system
  // prompt (some 9KB), a dozen turns of conversation as the prompt, and the
  // same again as the body the route holds while it waits
  assert.ok(SHARE_BYTES >= MAX_JOBS * 48 * 1024, `a share of ${SHARE_BYTES} bytes`);
  // …and not two of the largest turns y3kode takes. It was: and fifty-odd
  // addresses each holding two of those filled everyone's bytes with what
  // nobody could be made to give up, and every ordinary turn was refused.
  // Filling them with ordinary shares takes hundreds.
  assert.ok(SHARE_BYTES < MAX_SYSTEM + MAX_PROMPT, `a share of ${SHARE_BYTES} bytes holds one of the largest turns`);
  assert.ok(MAX_HELD / SHARE_BYTES >= 256, `everyone's bytes filled by ${MAX_HELD / SHARE_BYTES} ordinary shares`);
  assert.ok(MAX_HELD >= 64 * (MAX_SYSTEM + MAX_PROMPT), 'not even 64 of the largest turns y3kode takes');
  // and no bound per machine: what one address holds is bounded by
  // everyone's (MAX_PENDING, MAX_HELD) and each account's (MAX_JOBS) alone
  // (reversed 2026-10-12: sixteen turns and 8MB per address refused a ninth
  // person behind a carrier's shared IPv4)
  assert.deepEqual(Object.keys(relayModule).filter((k) => /SOURCE/.test(k)), [], 'a bound per machine is back');
  assert.ok(MAX_UNREAD >= 8 * MAX_BUFFERED && MAX_UNREAD <= 64 * MB, `unread on every page together: ${MAX_UNREAD}`);
});

await ok('a crowd behind one address (a carrier\'s shared IPv4, a campus, an office, a VPN\'s exit), each person with their two ordinary turns out, never refuses the next person there below the site\'s ceiling: by turns and by bytes, at the bounds the site runs with', async () => {
  // Reversed 2026-10-12. One machine waited on at most sixteen turns and 8MB,
  // and past them was told 'busy' at once: eight strangers on a carrier's
  // IPv4, each with their two tiny turns out, refused a ninth person there
  // their first turn ('own-busy'), with the server holding next to nothing;
  // and seven, each with two long conversations out, did the same by bytes.
  // Each account's own two (MAX_JOBS) are the only bound on them now, below
  // the site's ceiling.
  const NAT = '198.51.100.23';
  for (const [crowd, turn] of [
    // a thousand people, each with two short turns out
    [1000, { system: 'S'.repeat(9000), prompt: 'Their newest message:\nhello' }],
    // twenty, each with two long conversations out (some 590KB each, as written)
    [20, { system: 'S'.repeat(9000), prompt: '一'.repeat(196000) }],
  ]) {
    const relay = createRelay({ timeoutMs: 600000 });
    const theirs = [];
    for (let i = 0; i < crowd; i++) {
      const u = { id: `nat${i}` };
      const p = reader();
      relay.open(p.req, p.res, u, {});
      for (let k = 0; k < MAX_JOBS; k++) theirs.push(relay.ask(u, { ...turn, source: NAT }));
    }
    const now = await Promise.all(theirs.map(settled));
    assert.deepEqual(now.filter((r) => r !== 'out'), [], `${crowd} behind one address: one was refused for the others there`);
    assert.ok(relay.pending === crowd * MAX_JOBS && relay.held < MAX_HELD, `${relay.pending} turns, ${relay.held} bytes: below the ceiling`);
    // the next person there, with a presence's system prompt and a word
    const p = page();
    relay.open(p.req, p.res, member, {});
    const mine = relay.ask(member, { system: 'S'.repeat(9000), prompt: 'Their newest message:\nhello', source: NAT });
    assert.equal(jobsOf(p).length, 1, `a person was refused behind an address ${crowd} others hold their ordinary turns on`);
    assert.equal(await settled(mine), 'out');
    // …and their second, as anyone's
    const second = relay.ask(member, { system: 'S'.repeat(9000), prompt: 'Their newest message:\nand again', source: NAT });
    assert.equal(jobsOf(p).length, 2);
    // a third of anyone's is refused for their own two alone, said as theirs
    const third = await relay.ask({ id: 'nat0' }, { ...turn, source: NAT });
    assert.deepEqual([third.ok, third.status], [false, 'busy']);
    assert.match(third.detail, /your presence is already thinking/);
    for (const j of jobsOf(p)) relay.answer(member, j.id, { ok: true, text: 'answered' });
    assert.deepEqual((await Promise.all([mine, second])).map((r) => r.text), ['answered', 'answered']);
    assert.deepEqual((await Promise.all(theirs.map(settled))).filter((r) => r !== 'out'), [], 'a turn behind the address was let go below the ceiling');
  }
});

await ok('…and at the site\'s ceiling a crowd behind one busy address, each person within their share, is neither let go nor refused for it: tens of accounts elsewhere, each holding a little less than the crowd together, give way to the next person behind it and to a person elsewhere, never the crowd; at the bounds the site runs with', async () => {
  // Until 2026-10-12 an address was measured as one holder against one
  // person's share, and gave way, or was refused, as one: twenty people
  // behind a campus's IPv4, each with one ordinary turn out, were one source
  // past its share, and some fifty free accounts, each holding a turn just
  // under the crowd's whole on each of two IPv6 /64s, filled the ceiling. The
  // next person behind the campus was refused ('own-full': with them, the
  // crowd held the most), and a person elsewhere took room from the crowd.
  const relay = createRelay({ timeoutMs: 600000 });
  const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
  const CAMPUS = '192.0.2.10';
  const crowd = [];
  for (let i = 0; i < 20; i++) {
    open({ id: `campus${i}` });
    crowd.push(relay.ask({ id: `campus${i}` }, { ...ORDINARY, source: CAMPUS }));
  }
  const each = relay.held / 20;
  assert.ok(each > 28 * 1024 && each < 32 * 1024, `an ordinary turn is ${each} bytes`);
  // the attacker: free accounts, each holding a turn just under the crowd's
  // whole on each of two /64s, until the ceiling, and the last of the room
  const NEAR = relay.held - 2 * 1024;
  const theirs = [];
  let n = 0;
  while (relay.held + NEAR <= MAX_HELD) {
    const u = { id: `near${n >> 1}` };
    if (n % 2 === 0) open(u);
    theirs.push(relay.ask(u, { ...sized(NEAR), source: `2001:db8:${(n++).toString(16)}::/64` }));
  }
  open({ id: 'filler' });
  theirs.push(relay.ask({ id: 'filler' }, { ...sized(MAX_HELD - relay.held - 900), source: '2001:db8:ffff::/64' }));
  assert.ok(relay.held > MAX_HELD - 1000 && relay.held <= MAX_HELD, `the ceiling: ${relay.held} of ${MAX_HELD}`);
  assert.ok(n >= 100 && n <= 120, `${n} turns from ${n / 2} accounts`);
  assert.deepEqual((await Promise.all(theirs.map(settled))).filter((r) => r !== 'out'), []);
  // the next person behind the campus
  const p = page();
  relay.open(p.req, p.res, member, {});
  const mine = relay.ask(member, { ...ORDINARY, source: CAMPUS });
  assert.equal(jobsOf(p).length, 1, 'the next person behind a busy address was refused for the crowd there');
  assert.equal(await settled(mine), 'out');
  // a person elsewhere
  const q = page();
  relay.open(q.req, q.res, other, {});
  const elsewhere = relay.ask(other, { ...ORDINARY, source: '203.0.113.200' });
  assert.equal(jobsOf(q).length, 1);
  // and the attacker asks again, small turns from fresh accounts on fresh /64s
  for (let j = 0; j < 40; j++) {
    const u = { id: `again${j >> 1}` };
    if (j % 2 === 0) open(u);
    const r = await settled(relay.ask(u, { ...sized(20 * 1024), source: `2001:db8:f${j.toString(16)}::/64` }));
    assert.ok(r === 'out' || r.status === 'full', JSON.stringify(r));
  }
  assert.deepEqual((await Promise.all(crowd.map(settled))).filter((r) => r !== 'out'), [], 'a turn of the crowd\'s, each within its share, was let go');
  assert.deepEqual(await Promise.all([mine, elsewhere].map(settled)), ['out', 'out'], 'a person\'s ordinary turn was let go');
  const shed = (await Promise.all(theirs.map(settled))).filter((r) => r !== 'out');
  assert.ok(shed.length >= 1 && shed.every((r) => r.status === 'full' && /let go to make room/.test(r.detail)), JSON.stringify(shed.slice(0, 3)));
  assert.ok(relay.held <= MAX_HELD);
});

await ok('one machine flooding the site\'s ceiling by itself, from as many free accounts as it likes, holds no more than everyone\'s bound: by bytes its accounts, past their share, give way, to a person elsewhere as among themselves, and the person is never the one let go; by turns, thousands of accounts each within their share are the flood the ceiling is for, from one machine as from many; at the bounds the site runs with', async () => {
  // It was told 'busy' past sixteen turns and 8MB of its own, which refused
  // the people behind a shared address too (above). Now what one machine can
  // make the server hold is what everyone's can (MAX_HELD, MAX_PENDING). At
  // that ceiling the machine was measured as one holder against one person's
  // share, and gave way as one, until 2026-10-12; which made a crowd behind a
  // busy address give way and be refused for strangers too (above). Each of
  // its accounts is measured now, as anyone's: by bytes, each holding the
  // largest turns is past its share, and gives them up to anyone who would
  // hold less past theirs, the machine's own other accounts too; by turns,
  // each holding two tiny turns is within its share, and nothing here can
  // tell thousands of them from thousands of people behind one address
  // (reversed: the machine gave way by turns as by bytes). Making them is
  // what is slow: ten accounts an hour from one address (auth.mjs).
  const HOG = '198.51.100.9';
  const BIG = { system: 'é'.repeat(MAX_SYSTEM), prompt: 'é'.repeat(MAX_PROMPT) };   // 800KB as written
  for (const mode of ['bytes', 'turns']) {
    const relay = createRelay({ timeoutMs: 600000 });
    const theirs = [];
    let refused = 0, n = 0;
    const hog = async (t) => {
      const u = { id: `hog${n++}` };
      const p = reader();
      relay.open(p.req, p.res, u, {});
      for (let k = 0; k < MAX_JOBS; k++) {
        const r = relay.ask(u, { ...t, source: HOG });
        const s = await settled(r);
        if (s === 'out') theirs.push(r);
        else { assert.deepEqual([s.ok, s.status], [false, 'full'], JSON.stringify(s)); refused += 1; }
        assert.ok(relay.held <= MAX_HELD && relay.pending <= MAX_PENDING, `${mode}: ${relay.held} bytes, ${relay.pending} turns`);
      }
    };
    const p = page();
    relay.open(p.req, p.res, member, {});
    // a person on another machine, with a presence's system prompt and a word
    const ordinary = (word) => relay.ask(member, { system: 'S'.repeat(9000), prompt: `Their newest message:\n${word}`, source: '203.0.113.7' });
    if (mode === 'bytes') {
      // sixty accounts, each asking for two of the largest turns y3kode takes
      // (96MB in all, past everyone's 64MB), and the last of the room
      for (let i = 0; i < 60; i++) await hog(BIG);
      const f = reader();
      relay.open(f.req, f.res, { id: 'hogfill' }, {});
      theirs.push(relay.ask({ id: 'hogfill' }, { ...sized(MAX_HELD - relay.held - 900), source: HOG }));
      assert.ok(relay.held > MAX_HELD - 1000 && relay.held <= MAX_HELD, `one machine holds ${relay.held} of ${MAX_HELD} bytes`);
      // past the ceiling its accounts took room from one another, one that
      // would hold less past its share from one holding more, and a tie went
      // against the asker: refused 'full', never 'busy' for its address
      const shed = (await Promise.all(theirs.map(settled))).filter((r) => r !== 'out');
      assert.ok(shed.length >= 10 && refused >= 10, `${shed.length} let go, ${refused} refused`);
      assert.ok(shed.every((r) => r.status === 'full' && /let go to make room/.test(r.detail)), JSON.stringify(shed.slice(0, 3)));
      const mine = ordinary('hello');
      assert.equal(jobsOf(p).length, 1, 'a person was refused for one machine flooding the ceiling');
      // the machine asks again from each account, and from new ones: whatever
      // it is told, the person's turn is never the one let go
      for (let i = 0; i < 60; i++) {
        const r = await settled(relay.ask({ id: `hog${i}` }, { ...BIG, source: HOG }));
        assert.ok(r === 'out' || r.status === 'busy' || r.status === 'full', JSON.stringify(r));
      }
      for (let i = 0; i < 20; i++) await hog(BIG);
      assert.equal(await settled(mine), 'out', 'a person\'s ordinary turn was let go for one machine flooding the ceiling');
      // and their next turn goes too
      const next = ordinary('and again');
      assert.equal(jobsOf(p).length, 2, 'a person\'s second turn was refused for one machine flooding the ceiling');
      for (const j of jobsOf(p)) relay.answer(member, j.id, { ok: true, text: 'answered' });
      assert.deepEqual((await Promise.all([mine, next])).map((r) => r.text), ['answered', 'answered']);
    } else {
      // as many accounts as fill every turn the site holds, and a thousand
      // more: each within its share, none of theirs is let go, and those past
      // the ceiling are refused
      for (let i = 0; i < MAX_PENDING / MAX_JOBS + 1000; i++) await hog({ system: 's', prompt: 'p' });
      assert.equal(relay.pending, MAX_PENDING, `one machine holds ${relay.pending} of ${MAX_PENDING} turns`);
      assert.equal(refused, 1000 * MAX_JOBS);
      assert.deepEqual((await Promise.all(theirs.map(settled))).filter((r) => r !== 'out'), [], 'a turn within its account\'s share was let go');
      // a person elsewhere is refused as anyone new is in a flood: nothing written, nothing let go
      const late = await settled(ordinary('hello'));
      assert.deepEqual([late.ok, late.status, late.detail], [false, 'full', FULL_SHARE_DETAIL]);
      assert.equal(jobsOf(p).length, 0);
      // and as the flood's turns end, the room is theirs
      relay.forget('hog0');
      assert.equal(relay.pending, MAX_PENDING - MAX_JOBS);
      const mine = ordinary('hello');
      assert.equal(jobsOf(p).length, 1);
      relay.answer(member, jobsOf(p)[0].id, { ok: true, text: 'answered' });
      assert.equal((await mine).text, 'answered');
    }
  }
});

await ok(`at the site's ceiling of ${MAX_PENDING} turns a new one is not refused while an account holds past its share: it gives up its largest, down to its share, whoever shares its machine, and the people beside it there, each within theirs, give up nothing; one holding the most, or tied for it, is refused 'full'`, async () => {
  const turn = (relay, u, source, bytes) => relay.ask(u, { system: '', prompt: 'x'.repeat(bytes), source });
  // Three accounts on one machine with a turn each are three people, each
  // within their share. Until 2026-10-12 the machine was measured as one
  // holder, three turns past one person's two, and its largest was let go for
  // a newcomer elsewhere; now nothing of theirs goes, and with nobody past
  // their share the newcomer is refused.
  {
    const relay = createRelay({ maxPending: 4, timeoutMs: 2000 });
    const crowd = ['p1', 'p2', 'p3', 'c1'].map((id) => ({ id }));
    for (const u of [...crowd, member]) { const p = page(); relay.open(p.req, p.res, u, {}); }
    const theirs = [turn(relay, crowd[0], 'A', 10), turn(relay, crowd[1], 'A', 30), turn(relay, crowd[2], 'A', 20), turn(relay, crowd[3], 'C', 5)];
    const late = await turn(relay, member, 'B', 5);
    assert.deepEqual([late.ok, late.status], [false, 'full'], 'three people behind one machine gave way as one');
    assert.deepEqual(await Promise.all(theirs.map(settled)), ['out', 'out', 'out', 'out'], 'a turn within its share was let go for its machine');
  }
  // three turns at most for an account here, one person's share two (MAX_JOBS)
  const relay = createRelay({ maxPending: 5, maxJobs: 3, timeoutMs: 2000 });
  const [h1, h2, c] = [{ id: 'h1' }, { id: 'h2' }, { id: 'c1' }];
  const pages = new Map();
  for (const u of [h1, h2, c, member]) { const p = page(); relay.open(p.req, p.res, u, {}); pages.set(u.id, p); }
  // machine A: h1 with three turns (10, 30 and 20 bytes), past one person's
  // share; h2 beside it with one; machine C: one
  const a10 = turn(relay, h1, 'A', 10), a30 = turn(relay, h1, 'A', 30), a20 = turn(relay, h1, 'A', 20), a5 = turn(relay, h2, 'A', 5), c5 = turn(relay, c, 'C', 5);
  assert.equal(relay.pending, 5);
  const [big] = jobsOf(pages.get('h1')).filter((j) => j.prompt.length === 30);
  // a person on machine B asks: h1 gives up its largest, and the person's turn goes
  const b5 = turn(relay, member, 'B', 5);
  assert.equal(jobsOf(pages.get(member.id)).length, 1, 'the newcomer was refused while an account held past its share');
  const shed = await a30;
  assert.deepEqual([shed.ok, shed.status], [false, 'full']);
  assert.ok(pages.get('h1').events().some((e) => e.ev === 'cancel' && e.data.id === big.id), 'the page was not told to let it go');
  assert.deepEqual(await Promise.all([a10, a20, a5, c5].map(settled)), ['out', 'out', 'out', 'out'], 'more was let go than made room, or from a share');
  assert.equal(relay.pending, 5);
  // h1 asks again at the ceiling: with its new one it holds the most (three), so its own turn is refused, and nothing is let go
  const again = await turn(relay, h1, 'A', 1);
  assert.deepEqual([again.ok, again.status, again.detail], [false, 'full', FULL_MOST_DETAIL]);
  assert.equal(jobsOf(pages.get('h1')).length, 3, 'a refused turn was written');
  // h1's two are one person's ordinary share now, which nobody's turn takes,
  // and a tie goes against the asker: C, two with its new one, against h1's
  // two, is refused, and nothing of h1's is let go. (It went the other way
  // once: a tie went to the asker, and the largest left went.) h2, beside h1
  // on its machine, the same.
  for (const [u, src] of [[c, 'C'], [h2, 'A']]) {
    const r = await turn(relay, u, src, 1);
    assert.deepEqual([r.ok, r.status, r.detail], [false, 'full', FULL_MOST_DETAIL], u.id);
    assert.equal(jobsOf(pages.get(u.id)).length, 1, 'a refused turn was written');
  }
  assert.deepEqual(await Promise.all([a10, a20, a5, c5, b5].map(settled)), ['out', 'out', 'out', 'out', 'out'], 'a turn of an ordinary share was let go');
  for (const [uid, p] of pages) for (const j of jobsOf(p)) relay.answer({ id: uid }, j.id, { ok: true, text: 'x' });
  await Promise.all([a10, a20, a5, c5, b5]);
  assert.equal(relay.pending, 0);
});

await ok(`…at its ceiling of ${MAX_HELD / MB}MB the same, by bytes counted as written; and each turn's are given back however it ends`, async () => {
  // one person's share is 500 bytes here, so A's one turn of 600 is past it
  const relay = createRelay({ maxHeld: 1000, maxJobs: 10, shareBytes: 500, timeoutMs: 60 });
  const a = page(), b = page(), f = page();
  relay.open(a.req, a.res, member, {});
  relay.open(b.req, b.res, other, {});
  relay.open(f.req, f.res, founder, {});
  // 600 bytes out from machine A: 300 characters of two bytes each
  const big = relay.ask(member, { system: 'ss', prompt: 'é'.repeat(299), source: 'A' });
  assert.equal(relay.held, 600);
  // machine C asks 401, one past: A holds the most, past its share, and its 600 make room
  const c401 = relay.ask(other, { system: 's', prompt: 'p'.repeat(400), source: 'C' });
  assert.equal(jobsOf(b).length, 1, 'the newcomer was refused for another machine\'s bytes');
  assert.equal((await big).status, 'full');
  assert.ok(a.events().some((e) => e.ev === 'cancel'));
  assert.equal(relay.held, 401);
  // C asks 700 more: with it, C itself holds the most, so its own is refused, and nothing is let go
  const over = await relay.ask(other, { system: 's', prompt: 'p'.repeat(699), source: 'C' });
  assert.deepEqual([over.ok, over.status], [false, 'full']);
  assert.equal(jobsOf(b).length, 1);
  assert.equal(relay.held, 401);
  // what fits goes: 599 more is exactly 1000
  const fits = relay.ask(founder, { system: 's', prompt: 'p'.repeat(598), source: 'B' });
  assert.equal(relay.held, 1000);
  relay.answer(founder, jobsOf(f)[0].id, { ok: true, text: 'ok' });
  await fits;
  assert.equal(relay.held, 401, 'an answered turn was not given back');
  // aborted, timed out, a page that closed: each gives its bytes back
  const ac = new AbortController();
  const gone = relay.ask(founder, { system: 's', prompt: 'q', signal: ac.signal, source: 'B' });
  ac.abort();
  await gone;
  assert.equal((await c401).status, 'timeout');
  const c = page();
  relay.open(c.req, c.res, { id: 'u4' }, {});
  const closing = relay.ask({ id: 'u4' }, { system: 's', prompt: 'r', source: 'D' });
  c.close();
  assert.equal((await closing).status, 'gone');
  assert.equal(relay.held, 0);
  assert.equal(relay.pending, 0);
});

// a page that reads everything at once and keeps none of it, for the tests
// at the bounds the site runs with (thousands of jobs, megabytes of them)
function reader() {
  const req = new EventEmitter(), res = new EventEmitter();
  res.writableLength = 0;
  res.writeHead = () => {};
  res.write = () => true;
  res.end = () => { res.writableFinished = true; res.emit('finish'); };
  res.destroy = () => { res.destroyed = true; res.emit('close'); };
  return { req, res };
}

await ok('a person with one ordinary turn out is never let go for strangers\' turns, however many addresses each put one beside it: by turns and by bytes, at the bounds the site runs with', async () => {
  // Each stranger is a fresh account asking from a fresh address (an IPv6
  // /64 of its own), each holding one turn. Before, the source holding the
  // most gave way and a tie went to the asker: with every source holding one
  // turn, the person's was let go for the first stranger past the ceiling,
  // and by bytes, a person's turn larger than each stranger's was. By bytes
  // the strangers are thousands here: one person's share is two ordinary
  // turns, and filling everyone's bytes with turns within it takes that many.
  for (const mode of ['turns', 'bytes']) {
    const relay = createRelay({ timeoutMs: 600000 });
    const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
    open(member);
    // the person's turn: a presence's system prompt (about 9KB) and their
    // words; by bytes, a conversation of the usual length, three times each
    // stranger's turn, and within one person's share (SHARE_BYTES)
    const STRANGER = mode === 'turns' ? 'p' : 'x'.repeat(16 * 1024);
    const mine = relay.ask(member, { system: 'S'.repeat(9000), prompt: mode === 'turns' ? 'hello' : 'é'.repeat(20 * 1024), source: '203.0.113.7' });
    assert.ok(relay.held <= SHARE_BYTES && (mode === 'turns' || relay.held > 3 * STRANGER.length), `the person's turn is ${relay.held} bytes`);
    let n = 0, out = 0, full = 0, other = 0;
    const strangers = [];
    const stranger = async () => {
      const u = { id: `stranger${n}` };
      open(u);
      const r = relay.ask(u, { system: 's', prompt: STRANGER, source: `2001:db8:${(n++).toString(16)}::1` });
      const s = await settled(r);
      if (s === 'out') { out += 1; strangers.push(r); } else if (s.status === 'full') full += 1; else other += 1;
    };
    // the ceiling filled, by one or the other, and then as many strangers again (in turns, a thousand)
    while (relay.pending < MAX_PENDING && relay.held + 1 + STRANGER.length <= MAX_HELD) await stranger();
    const filled = n;
    for (let i = 0; i < Math.min(filled, 1000); i++) await stranger();
    assert.equal(await settled(mine), 'out', `${mode}: the person's ordinary turn was let go for a stranger's`);
    assert.equal(other, 0, `${mode}: a stranger was refused for something besides the ceiling`);
    assert.ok(full >= Math.min(filled, 1000), `${mode}: ${full} refused 'full' past the ceiling`);
    for (const r of strangers) assert.equal(await settled(r), 'out', `${mode}: a stranger's one turn was let go for another's`);
    assert.ok(mode === 'turns' ? relay.pending === MAX_PENDING : relay.held > MAX_HELD - STRANGER.length, `${mode}: the ceiling was never reached`);
  }
});

// a turn of the largest size y3kode takes, counted as written: 1.2MB
const LARGEST = { system: '\u4e00'.repeat(MAX_SYSTEM), prompt: '\u4e00'.repeat(MAX_PROMPT) };

await ok('a hundred free accounts on as many addresses, each holding two of the largest turns y3kode takes, cannot refuse a person\'s ordinary turn: past their share, they give way to it, at the bounds the site runs with', async () => {
  // Before, one person's share was two of the largest turns (1.2MB): some
  // fifty-five addresses each holding two filled everyone's 64MB with what
  // nobody could be made to give up, and every new turn on the site, a
  // person's 9KB one too, was refused 'full'.
  const relay = createRelay({ timeoutMs: 600000 });
  const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
  const theirs = [];
  let n = 0;
  const strangers = async (count) => {
    for (let i = 0; i < count; i++, n++) {
      const u = { id: `largest${n}` };
      open(u);
      for (let k = 0; k < MAX_JOBS; k++) theirs.push(relay.ask(u, { ...LARGEST, source: `2001:db8:${n.toString(16)}::/64` }));
      await new Promise((r) => setImmediate(r));
    }
  };
  await strangers(100);
  // and one more, to leave less room than the person's turn: the ceiling is what is in the way
  open({ id: 'filler' });
  theirs.push(relay.ask({ id: 'filler' }, { system: 's', prompt: 'p', holds: MAX_HELD - relay.held - 900, source: '2001:db8:ffff::/64' }));
  assert.ok(relay.held > MAX_HELD - 1000 && relay.held <= MAX_HELD, `the ceiling: ${relay.held} of ${MAX_HELD}`);
  const shedBefore = (await Promise.all(theirs.map(settled))).filter((r) => r !== 'out').length;
  // the person, with a presence's system prompt and a word
  const p = page();
  relay.open(p.req, p.res, member, {});
  const mine = relay.ask(member, { system: 'S'.repeat(9000), prompt: 'Their newest message:\nhello', source: '203.0.113.7' });
  assert.equal(jobsOf(p).length, 1, 'a person\'s ordinary turn was refused for strangers holding two of the largest turns each');
  assert.equal(await settled(mine), 'out');
  const shed = (await Promise.all(theirs.map(settled))).filter((r) => r !== 'out');
  assert.ok(shed.length > shedBefore && shed.every((r) => r.status === 'full'), 'nothing past its share gave way');
  assert.ok(relay.held <= MAX_HELD);
  // fifty more come, and ask again: the person's turn, within one person's
  // share, is never the one let go, and their next turn goes too
  await strangers(50);
  assert.equal(await settled(mine), 'out', 'a person\'s ordinary turn was let go for strangers holding the largest');
  const next = relay.ask(member, { system: 'S'.repeat(9000), prompt: 'Their newest message:\nand again', source: '203.0.113.7' });
  assert.equal(jobsOf(p).length, 2);
  for (const j of jobsOf(p)) relay.answer(member, j.id, { ok: true, text: 'answered' });
  assert.deepEqual((await Promise.all([mine, next])).map((r) => r.text), ['answered', 'answered']);
});

await ok('a person behind a flooder\'s address is not refused for it: the flooder\'s accounts, past their share, give way to them as to anyone, and their turn, within its share, never does; at the bounds the site runs with', async () => {
  // Until 2026-10-12 the address was measured as one holder, and an asker's
  // own address never gave way to it: a person behind an IPv4 a machine was
  // flooding from (a carrier's shared one, a café's) was refused 'own-full'
  // while people elsewhere went, the flood's turns given up to them alone.
  const relay = createRelay({ timeoutMs: 600000 });
  const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
  const NAT = '198.51.100.66';
  const BYTES = Buffer.byteLength(LARGEST.system) + Buffer.byteLength(LARGEST.prompt);
  const theirs = [];
  let n = 0;
  while (relay.held + BYTES <= MAX_HELD) {
    const u = { id: `flood${n++}` };
    open(u);
    for (let k = 0; k < MAX_JOBS && relay.held + BYTES <= MAX_HELD; k++) theirs.push(relay.ask(u, { ...LARGEST, source: NAT }));
  }
  open({ id: 'floodfill' });
  theirs.push(relay.ask({ id: 'floodfill' }, { ...sized(MAX_HELD - relay.held - 900), source: NAT }));
  assert.ok(relay.held > MAX_HELD - 1000 && relay.held <= MAX_HELD, `the ceiling: ${relay.held} of ${MAX_HELD}`);
  assert.deepEqual((await Promise.all(theirs.map(settled))).filter((r) => r !== 'out'), []);
  // a person behind the same address, with an ordinary turn
  const p = page();
  relay.open(p.req, p.res, member, {});
  const mine = relay.ask(member, { ...ORDINARY, source: NAT });
  assert.equal(jobsOf(p).length, 1, 'a person behind a flooder\'s address was refused for it');
  assert.equal(await settled(mine), 'out');
  const shed = (await Promise.all(theirs.map(settled))).filter((r) => r !== 'out');
  assert.ok(shed.length >= 1 && shed.every((r) => r.status === 'full' && /let go to make room/.test(r.detail)), 'nothing past its share gave way');
  // the flood asks again from each of its accounts, and from twenty new ones:
  // whatever it is told, the person's turn is never the one let go
  for (let i = 0; i < n; i++) await settled(relay.ask({ id: `flood${i}` }, { ...LARGEST, source: NAT }));
  for (let i = 0; i < 20; i++) {
    const u = { id: `flood${n++}` };
    open(u);
    for (let k = 0; k < MAX_JOBS; k++) await settled(relay.ask(u, { ...LARGEST, source: NAT }));
  }
  assert.ok(relay.held <= MAX_HELD);
  assert.equal(await settled(mine), 'out', 'a person\'s ordinary turn was let go for a flood from their own address');
  // and their second goes too
  const next = relay.ask(member, { ...ORDINARY, source: NAT });
  assert.equal(jobsOf(p).length, 2, 'a person\'s second turn was refused for a flood from their own address');
  for (const j of jobsOf(p)) relay.answer(member, j.id, { ok: true, text: 'answered' });
  assert.deepEqual((await Promise.all([mine, next])).map((r) => r.text), ['answered', 'answered']);
});

await ok('a person with an unusually long conversation out is past their share: let go only in a flood, and only for someone holding less', async () => {
  // Reversed: a share once held two of the largest turns, so a long
  // conversation was never let go however many asked. Now hundreds of
  // addresses, each holding one turn within its share, are a flood.
  const relay = createRelay({ timeoutMs: 600000 });
  const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
  open(member);
  // a presence's system prompt and a long conversation, past one person's share
  const LONG = { system: 'S'.repeat(9000), prompt: 'é'.repeat(150 * 1024) };
  const long = relay.ask(member, { ...LONG, source: '203.0.113.7' });
  assert.ok(relay.held > SHARE_BYTES, `${relay.held}`);
  const STRANGER = 'x'.repeat(100 * 1024);
  let n = 0;
  const stranger = async () => {
    const u = { id: `flood${n}` };
    open(u);
    const r = relay.ask(u, { system: 's', prompt: STRANGER, source: `2001:db8:${(n++).toString(16)}::1` });
    return settled(r);
  };
  // below the ceiling nothing is let go, however long the conversation
  while (relay.held + 1 + STRANGER.length <= MAX_HELD) assert.equal(await stranger(), 'out');
  assert.ok(n >= 512, `the ceiling filled by ${n} addresses`);
  assert.equal(await settled(long), 'out', 'a long conversation was let go below the ceiling');
  // past it, a stranger holding less makes room from it
  assert.equal(await stranger(), 'out', 'the stranger past the ceiling was refused while a turn past its share was out');
  const shed = await settled(long);
  assert.deepEqual([shed.ok, shed.status], [false, 'full']);
  // asked again it would hold more than any of them, none of whom is past
  // their share: it is refused, and nothing is let go
  const again = await relay.ask(member, { ...LONG, source: '203.0.113.7' });
  assert.deepEqual([again.ok, again.status, again.detail], [false, 'full', FULL_MOST_DETAIL]);
  // and this is a flood: hundreds of addresses, each holding a turn within
  // its share, refuse anyone new, an ordinary turn too, once they have taken
  // the room left (the last of it, a share's worth, by one more) and until
  // theirs end — what the ceiling is there for, and nothing fewer can do
  while (relay.held + 1 + STRANGER.length <= MAX_HELD) assert.equal(await stranger(), 'out');
  open({ id: 'last' });
  const last = relay.ask({ id: 'last' }, { system: 's', prompt: 'p', holds: MAX_HELD - relay.held - 100, source: '2001:db8:ffff::1' });
  assert.equal(await settled(last), 'out');
  assert.ok(relay.held > MAX_HELD - 1000, `${relay.held}`);
  const ordinary = await settled(relay.ask(member, { system: 'S'.repeat(9000), prompt: 'é'.repeat(20 * 1024), source: '203.0.113.7' }));
  assert.deepEqual([ordinary.ok, ordinary.status], [false, 'full']);
  assert.match(ordinary.detail, /past their own share/);
});

await ok('at the ceiling the account furthest past its own share gives way first, wherever it asks from: accounts further past theirs, spread over as many /64s as they like, go before a campus\'s long conversations, and a long conversation behind the busy address goes no sooner than its twin alone elsewhere; at the bounds the site runs with', async () => {
  // Until 2026-10-12 (the same day) the address chose who gave way first: the
  // one whose accounts held the most past their shares together. Twenty people
  // behind a campus's IPv4, each with a conversation 12KB past their share,
  // held 240KB past them together, and gave up nineteen of those to fresh
  // accounts on fresh /64s before any of four hundred turns on as many /64s,
  // each 13KB past its own share, gave way; and the same conversation alone
  // elsewhere was never touched while the crowd's went.
  const relay = createRelay({ timeoutMs: 600000 });
  const open = (u) => { const p = reader(); relay.open(p.req, p.res, u, {}); };
  // each turn as it stands: 'out', or what it was told
  const track = (r) => { const t = { r: 'out' }; r.then((x) => { t.r = x; }); return t; };
  const out = (ts) => ts.filter((t) => t.r === 'out').length;
  const KB = 1024, CAMPUS = '192.0.2.10';
  const long = (id, source) => { const u = { id }; open(u); return track(relay.ask(u, { ...sized(SHARE_BYTES + 12 * KB), source })); };
  // ten behind the campus, the same conversation alone elsewhere, ten more
  // behind the campus: each 12KB past one person's share
  const older = [], newer = [];
  for (let i = 0; i < 10; i++) older.push(long(`campus${i}`, CAMPUS));
  const twin = long('twin', '203.0.113.5');
  for (let i = 10; i < 20; i++) newer.push(long(`campus${i}`, CAMPUS));
  // free accounts, each with a turn 13KB past a share on each of two /64s, to the ceiling
  const far = [];
  let n = 0;
  while (relay.held + SHARE_BYTES + 13 * KB <= MAX_HELD) {
    const u = { id: `far${n >> 1}` };
    if (n % 2 === 0) open(u);
    far.push(track(relay.ask(u, { ...sized(SHARE_BYTES + 13 * KB), source: `2001:db8:${(n++).toString(16)}::/64` })));
  }
  await new Promise((r) => setImmediate(r));
  assert.ok(far.length >= 400 && out(far) === far.length && out([...older, twin, ...newer]) === 21, `${far.length} turns 13KB past a share`);
  // then turns 2KB past a share, from fresh accounts on fresh /64s: each makes
  // room from whoever holds more past theirs
  let m = 0;
  const next = async () => {
    const u = { id: `next${m}` };
    open(u);
    const r = await settled(relay.ask(u, { ...sized(SHARE_BYTES + 2 * KB), source: `2001:db8:e${(m++).toString(16)}::/64` }));
    assert.equal(r, 'out', `a turn 2KB past a share was refused while others held more past theirs: ${JSON.stringify(r)}`);
    assert.ok(m < 4 * far.length && relay.held <= MAX_HELD);
  };
  // every turn further past its share goes before any of the long conversations
  while (out(far) > 0) {
    await next();
    assert.equal(out([...older, twin, ...newer]), 21, `a long conversation 12KB past its share was let go while ${out(far)} turns 13KB past theirs were out, ${m} asks in`);
  }
  // and then the long conversations, alike wherever they are: the older
  // first, so the ten behind the campus older than the twin, then the twin,
  // and none of the ten newer before it
  while (twin.r === 'out') {
    await next();
    assert.equal(out(newer), 10, 'a long conversation behind the busy address was let go while its twin alone elsewhere, older, was kept');
  }
  assert.equal(out(older), 0, 'the twin alone was let go while older conversations behind the busy address were kept');
  while (out(newer) === 10) await next();
  assert.equal(newer[0].r.status, 'full', 'not the oldest of the newer went next');
  for (const t of [...far, ...older, twin, newer[0]]) assert.deepEqual([t.r.status, /let go to make room/.test(t.r.detail)], ['full', true], JSON.stringify(t.r));
  assert.ok(relay.held <= MAX_HELD);
});

await ok('hundreds of accounts, each holding a whole share at each of two addresses, are a flood: the next person is refused at the ceiling, told nobody holds more past their own share, and nothing within a share is let go; as theirs end, the room is the person\'s', async () => {
  // what the ceiling is there for, and what nothing fewer can do: by bytes,
  // MAX_HELD / SHARE_BYTES whole shares, two to an account at most
  const relay = createRelay({ timeoutMs: 600000 });
  const theirs = [];
  for (let i = 0; i < MAX_HELD / SHARE_BYTES / MAX_JOBS; i++) {
    const u = { id: `share${i}` };
    const r = reader();
    relay.open(r.req, r.res, u, {});
    for (const half of ['a', 'b']) theirs.push(relay.ask(u, { ...sized(SHARE_BYTES), source: `2001:db8:${half}${i.toString(16)}::/64` }));
  }
  assert.equal(relay.held, MAX_HELD);
  const p = page();
  relay.open(p.req, p.res, member, {});
  const late = await settled(relay.ask(member, { ...ORDINARY, source: '203.0.113.77' }));
  assert.deepEqual([late.ok, late.status, late.detail], [false, 'full', FULL_SHARE_DETAIL]);
  assert.equal(jobsOf(p).length, 0, 'a refused turn was written');
  assert.deepEqual((await Promise.all(theirs.map(settled))).filter((r) => r !== 'out'), [], 'a turn within its share was let go');
  // one of them closes its account: its room is the person's
  relay.forget('share0');
  const mine = relay.ask(member, { ...ORDINARY, source: '203.0.113.77' });
  assert.equal(jobsOf(p).length, 1);
  relay.answer(member, jobsOf(p)[0].id, { ok: true, text: 'answered' });
  assert.equal((await mine).text, 'answered');
});

await ok('what the route holds while a turn waits counts with it (holds): an image turn\'s body grows what is held by at least its size, in every bound, and is given back when it ends', async () => {
  // three turns at most for an account here, so the third is the ceiling's to refuse
  const relay = createRelay({ timeoutMs: 1000, maxHeld: 2.5 * MB, maxJobs: 3 });
  const a = page(), b = page();
  relay.open(a.req, a.res, member, {});
  relay.open(b.req, b.res, other, {});
  const own = relay.provider(member, { systemFor: (_paint, opts) => opts?.system || 'SYS', replyFrom: (text) => ({ speech: text }) });
  // what /api/brain read for an image turn: a picture and a word (server.mjs bodyHeld)
  const BODY = Buffer.byteLength(JSON.stringify({ messages: [{ role: 'user', content: 'look at this' }], image: 'A'.repeat(1000000) }));
  const first = own.chat(null, 'own', [{ role: 'user', content: 'look at this' }], true, false, { system: 'SYS', source: 'A', holds: BODY });
  const [job] = jobsOf(a);
  assert.match(job.prompt, /A camera frame came with this message/);
  assert.equal(relay.held, BODY + Buffer.byteLength('SYS') + Buffer.byteLength(job.prompt));
  assert.ok(relay.held >= BODY, `held ${relay.held} for a body of ${BODY}`);
  // everyone's bound counts it (2.5MB here; it was this machine's share, a
  // bound gone 2026-10-12): a second fits, and a third does not, its account
  // already holding the most (its machine's, once: another account asking
  // there is measured as itself now, as anyone elsewhere)
  const second = own.chat(null, 'own', [{ role: 'user', content: 'and this' }], true, false, { system: 'SYS', source: 'A', holds: BODY });
  assert.equal(jobsOf(a).length, 2);
  const third = await relay.ask(member, { system: 'SYS', prompt: 'p', source: 'A', holds: BODY });
  assert.equal(jobsOf(a).length, 2, 'a refused turn was written');
  assert.deepEqual([third.ok, third.status, third.detail], [false, 'full', FULL_MOST_DETAIL]);
  assert.ok(relay.held + BODY > 2.5 * MB && relay.held - BODY < 2.5 * MB / 2, `held ${relay.held}: the third fits unless its body counts`);
  // what is not a count of bytes counts as nothing
  const base = relay.held;
  for (const holds of [-5, NaN, Infinity, '9999999', null, {}]) {
    const r = relay.ask(other, { system: 'S', prompt: 'p', source: 'B', holds });
    assert.equal(relay.held, base + 2, JSON.stringify(holds));
    relay.answer(other, jobsOf(b).at(-1).id, { ok: true, text: 'x' });
    await r;
  }
  assert.equal(relay.held, base);
  // answered, given back
  for (const j of jobsOf(a)) relay.answer(member, j.id, { ok: true, text: 'seen' });
  assert.deepEqual((await Promise.all([first, second])).map((r) => r.speech), ['seen', 'seen']);
  assert.equal(relay.held, 0);
  // and at everyone's ceiling: a turn whose route holds a megabyte is past one
  // person's share, and gives way to an ordinary one
  const tight = createRelay({ maxHeld: 2 * MB, timeoutMs: 1000 });
  const c = page(), d = page();
  tight.open(c.req, c.res, member, {});
  tight.open(d.req, d.res, other, {});
  const heavy = tight.ask(member, { system: 'SYS', prompt: 'p', source: 'A', holds: 2000 * 1000 });
  const light = tight.ask(other, { system: 'S'.repeat(9000), prompt: 'p'.repeat(100 * 1000), source: 'B' });
  assert.equal(jobsOf(d).length, 1, 'an ordinary turn was refused for one whose route holds more than its share');
  assert.equal((await heavy).status, 'full');
  tight.answer(other, jobsOf(d)[0].id, { ok: true, text: 'x' });
  await light;
  assert.equal(tight.held, 0);
});

await ok('…while one past a person\'s share gives way to anyone holding less, down to its share and no further; with nobody past it, the newcomer is refused, and a tie goes against the asker', async () => {
  // seven turns at most here; one person's share is two turns (MAX_JOBS)
  const relay = createRelay({ maxPending: 7, maxJobs: 10, timeoutMs: 2000 });
  const users = ['v', 'a1', 'a2', 'b', 'c', 'd'].map((id) => ({ id }));
  const pages = new Map();
  for (const u of users) { const p = page(); relay.open(p.req, p.res, u, {}); pages.set(u.id, p); }
  const [v, a1, a2, b, c, d] = users;
  const turn = (u, source, bytes) => relay.ask(u, { system: '', prompt: 'x'.repeat(bytes), source });
  // the person on V, one turn; on machine A, a1 with three (past one
  // person's share) and a2 beside it with one (within its own); B, two (its share)
  const v1 = turn(v, 'V', 50), a10 = turn(a1, 'A', 10), a30 = turn(a1, 'A', 30), a20 = turn(a1, 'A', 20), a5 = turn(a2, 'A', 5), b1 = turn(b, 'B', 1), b2 = turn(b, 'B', 1);
  assert.equal(relay.pending, 7);
  // C asks: a1 gives up its largest, and is down to its share
  const c1 = turn(c, 'C', 5);
  assert.equal(jobsOf(pages.get('c')).length, 1, 'the newcomer was refused while an account held past its share');
  assert.equal((await a30).status, 'full');
  assert.deepEqual(await Promise.all([v1, a10, a20, a5, b1, b2].map(settled)), ['out', 'out', 'out', 'out', 'out', 'out'], 'more was let go than made room, or from a share');
  // D asks: nobody is past their share, so D's turn is refused and nothing is let go
  const d1 = await turn(d, 'D', 1);
  assert.deepEqual([d1.ok, d1.status], [false, 'full']);
  assert.match(d1.detail, /past their own share/);
  assert.equal(jobsOf(pages.get('d')).length, 0, 'a refused turn was written');
  // a1 asks a third again: with its new one it holds the most, and is refused
  const a3 = await turn(a1, 'A', 1);
  assert.deepEqual([a3.status, a3.detail], ['full', FULL_MOST_DETAIL]);
  assert.deepEqual(await Promise.all([v1, a10, a20, a5, b1, b2, c1].map(settled)), ['out', 'out', 'out', 'out', 'out', 'out', 'out']);
  for (const [uid, p] of pages) for (const j of jobsOf(p)) relay.answer({ id: uid }, j.id, { ok: true, text: 'x' });
  await Promise.all([v1, a10, a20, a5, b1, b2, c1]);
  assert.equal(relay.pending, 0);

  // a tie, between two past their share (one turn each, here): the asker is
  // refused and the other keeps its own; holding less, the asker gets room
  const tie = createRelay({ maxPending: 3, maxJobs: 10, shareJobs: 1, timeoutMs: 2000 });
  const tp = new Map();
  for (const u of [a1, b, c]) { const p = page(); tie.open(p.req, p.res, u, {}); tp.set(u.id, p); }
  const e1 = tie.ask(a1, { system: '', prompt: 'e1', source: 'E' }), e2 = tie.ask(a1, { system: '', prompt: 'e2', source: 'E' });
  const f1 = tie.ask(b, { system: '', prompt: 'f1', source: 'F' });
  assert.equal(tie.pending, 3);
  const f2 = await tie.ask(b, { system: '', prompt: 'f2', source: 'F' });
  assert.deepEqual([f2.ok, f2.status], [false, 'full'], 'a tie went to the asker');
  assert.equal(f2.detail, FULL_MOST_DETAIL);
  assert.deepEqual(await Promise.all([e1, e2, f1].map(settled)), ['out', 'out', 'out']);
  const g1 = tie.ask(c, { system: '', prompt: 'g1', source: 'G' });
  assert.equal(jobsOf(tp.get('c')).length, 1);
  assert.deepEqual((await Promise.all([e1, e2].map(settled))).map((r) => (r === 'out' ? r : r.status)).sort(), ['full', 'out']);
  for (const [uid, p] of tp) for (const j of jobsOf(p)) tie.answer({ id: uid }, j.id, { ok: true, text: 'x' });
  await Promise.all([f1, g1]);
});

await ok('a route\'s last word (admit) is asked only once the relay would take the turn; a no refuses it with nothing written, held or let go', async () => {
  // one person's share is one turn here, so A's two are past it
  const relay = createRelay({ maxPending: 2, maxJobs: 10, shareJobs: 1, timeoutMs: 1000 });
  let asked = 0;
  const admit = (yes) => () => { asked += 1; return yes; };
  // no page yet
  assert.equal((await relay.ask(member, { system: 's', prompt: 'p', admit: admit(true) })).status, 'no-page');
  const a = page(), b = page();
  relay.open(a.req, a.res, member, {});
  relay.open(b.req, b.res, other, {});
  assert.equal((await relay.ask(member, { system: 's', prompt: 'p'.repeat(MAX_PROMPT + 1), admit: admit(true) })).status, 'too-large');
  assert.equal(asked, 0, 'asked for a turn the relay refused');
  // two from machine A: the site is full
  const one = relay.ask(member, { system: 's', prompt: 'p', source: 'A', admit: admit(true) });
  const two = relay.ask(member, { system: 's', prompt: 'pp', source: 'A', admit: admit(true) });
  assert.deepEqual([asked, jobsOf(a).length], [2, 2]);
  // A asking a third holds the most: refused before it is asked
  assert.equal((await relay.ask(member, { system: 's', prompt: 'p', source: 'A', admit: admit(true) })).status, 'full');
  // the account busy, for a turn that leaves one spare
  const solo = createRelay();
  const s = page();
  solo.open(s.req, s.res, founder, {});
  const out = solo.ask(founder, { system: 's', prompt: 'p' });
  assert.equal((await solo.ask(founder, { system: 's', prompt: 'p', spare: 1, admit: admit(true) })).status, 'busy');
  solo.answer(founder, jobsOf(s)[0].id, { ok: true, text: 'x' });
  await out;
  assert.equal(asked, 2, 'asked for a turn the relay refused');
  // B would make room (A's largest), but the route says no: nothing is let go, written or held
  for (const no of [false, 1, 'yes', undefined]) {
    const r = await relay.ask(other, { system: 's', prompt: 'p', source: 'B', admit: () => { asked += 1; return no; } });
    assert.deepEqual([r.ok, r.status], [false, 'not-admitted'], JSON.stringify(no));
  }
  assert.equal(asked, 6);
  assert.deepEqual(await Promise.all([one, two].map(settled)), ['out', 'out'], 'a turn was let go for one the route refused');
  assert.deepEqual([jobsOf(b).length, relay.pending, relay.held], [0, 2, 5]);
  // and a yes: A's largest goes, and B's is written
  const yes = relay.ask(other, { system: 's', prompt: 'p', source: 'B', admit: admit(true) });
  assert.deepEqual([asked, jobsOf(b).length], [7, 1]);
  assert.equal((await two).status, 'full');
  relay.answer(member, jobsOf(a)[0].id, { ok: true, text: 'x' });
  relay.answer(other, jobsOf(b)[0].id, { ok: true, text: 'x' });
  await Promise.all([one, yes]);
  assert.equal(relay.pending, 0);
});

console.log('\nCode\'s translator, and why a turn on the plan did not answer:');

await ok('a turn that keeps one spare never takes the last of the account\'s turns; an ordinary one still may', async () => {
  assert.equal(MAX_JOBS, 2, 'the translator\'s one spare assumes y3kode\'s two');
  const relay = createRelay({ timeoutMs: 300 });
  const a = page();
  relay.open(a.req, a.res, member, {});
  // a turn of the person's is out: the translator steps aside, and nothing is written
  const chat = relay.ask(member, { system: 's', prompt: 'chat' });
  const voiced = await relay.ask(member, { system: 's', prompt: 'voice', spare: 1 });
  assert.deepEqual([voiced.ok, voiced.status], [false, 'busy']);
  assert.equal(jobsOf(a).length, 1);
  relay.answer(member, jobsOf(a)[0].id, { ok: true, text: 'said' });
  await chat;
  // nothing out: the translator goes, and the person's own next turn still has its turn
  const v = relay.ask(member, { system: 's', prompt: 'voice', spare: 1 });
  assert.equal(jobsOf(a).length, 2);
  assert.equal((await relay.ask(member, { system: 's', prompt: 'voice 2', spare: 1 })).status, 'busy', 'a second translator turn took the last');
  const c2 = relay.ask(member, { system: 's', prompt: 'chat 2' });
  assert.equal(jobsOf(a).length, 3, 'the person\'s turn was refused for the translator\'s');
  assert.equal((await relay.ask(member, { system: 's', prompt: 'chat 3' })).status, 'busy');
  for (const j of jobsOf(a).slice(1)) relay.answer(member, j.id, { ok: true, text: 'x' });
  await Promise.all([v, c2]);
  // what is not a whole number of turns keeps none
  for (const spare of [-1, 0, 1.5, '1', null, NaN]) {
    const p = relay.ask(member, { system: 's', prompt: 'p', spare });
    const q = relay.ask(member, { system: 's', prompt: 'p', spare });
    assert.equal(relay.pending, 2, JSON.stringify(spare));
    for (const j of jobsOf(a).slice(-2)) relay.answer(member, j.id, { ok: true, text: 'x' });
    await Promise.all([p, q]);
  }
  // and the provider carries it from the route's options
  const pr = relay.provider(member, { systemFor: () => 'SYS', replyFrom: (t) => ({ speech: t }) });
  const held = relay.ask(member, { system: 's', prompt: 'chat' });
  assert.deepEqual(await pr.chat(null, 'm', [{ role: 'user', content: 'voice' }], null, false, { raw: true, noThink: true, spare: 1 }),
    { ok: false, status: 'busy', detail: 'your presence is already thinking as much as y3kode does at once' });
  const ordinary = pr.chat(null, 'm', [{ role: 'user', content: 'hi' }], null, false, { raw: true });
  for (const j of jobsOf(a).slice(-2)) relay.answer(member, j.id, { ok: true, text: 'x' });
  assert.equal((await ordinary).text, 'x');
  await held;
  assert.equal(relay.pending, 0);
});

await ok('busy and full are named for the page, y3kode\'s own busy too, and nothing else is', async () => {
  assert.deepEqual(OWN_WHYS, { busy: 'own-busy', full: 'own-full' });
  assert.equal(ownWhy({ ok: false, status: 'busy' }), 'own-busy');
  assert.equal(ownWhy({ ok: false, status: 'full' }), 'own-full');
  for (const status of ['gone', 'timeout', 'no-page', 'aborted', 'too-large', 'signed-out', 'failed', 'declined', 'not-installed', 'toString', 'constructor', undefined, 429]) {
    assert.equal(ownWhy({ ok: false, status }), null, String(status));
  }
  for (const out of [null, undefined, { ok: true, status: 'busy' }, {}]) assert.equal(ownWhy(out), null, JSON.stringify(out));
  // y3kode saying 'busy' itself, through the page, is the same word
  const relay = createRelay();
  const a = page();
  relay.open(a.req, a.res, member, {});
  const p = relay.ask(member, { system: 's', prompt: 'p' });
  relay.answer(member, jobsOf(a)[0].id, { ok: false, code: 'busy', error: 'already thinking twice' });
  assert.equal(ownWhy(await p), 'own-busy');
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
// SPEAK AS IT THINKS (2026-10-19). A turn's words so far arrive from the page
// (POST /api/own-brain/<id>/part) and are passed on as they grow; the answer's
// remainder comes at the end; nothing is said twice; parts for someone else's
// turn, or for none, are refused; and a page that sends no parts answers whole.
await ok('a streamed turn: parts pass on only what is new, the answer only the rest, and no one else may send them', async () => {
  const relay = createRelay();
  const p = page();
  relay.open(p.req, p.res, founder, { provider: 'claude' });
  const prov = relay.provider(founder, { systemFor: () => 'sys', replyFrom: (t) => ({ speech: t }) });
  const got = [];
  const turn = prov.chatStream(null, null, [{ role: 'user', content: 'hi' }], (d) => got.push(d), null, null, null, {});
  await new Promise((r) => setImmediate(r));
  const job = p.events().find((e) => e.ev === 'job').data;
  assert.equal(relay.part({ id: 'someone-else' }, job.id, { text: 'Hello.' }), false, 'not yours: refused');
  assert.equal(relay.part(founder, 'f'.repeat(32), { text: 'x' }), false, 'no such turn');
  relay.part(founder, job.id, { text: 'Hello.' });
  relay.part(founder, job.id, { text: 'Hello.' });            // the same again: nothing new
  relay.part(founder, job.id, { text: 'Hello. How' });
  relay.answer(founder, job.id, { ok: true, text: 'Hello. How are you?', usage: {} });
  const r = await turn;
  assert.equal(r.ok, true);
  assert.deepEqual(got, ['Hello.', ' How', ' are you?']);
  assert.equal(got.join(''), 'Hello. How are you?', 'said once, in order');
  const whole = [];
  const turn2 = prov.chatStream(null, null, [{ role: 'user', content: 'hi' }], (d) => whole.push(d), null, null, null, {});
  await new Promise((r) => setImmediate(r));
  const job2 = p.events().filter((e) => e.ev === 'job').at(-1).data;
  relay.answer(founder, job2.id, { ok: true, text: 'All at once.', usage: {} });
  await turn2;
  assert.deepEqual(whole, ['All at once.'], 'an older y3kode with no parts: whole, as before');
});

console.log(`\n${passed} checks passed.`);
