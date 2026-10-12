// THE FOUNDER'S OWN BRAIN, THROUGH THEIR OWN PAGE (own-relay.mjs). Run:
// node test/own-relay.test.mjs
//
// The hosted site hands a turn of the founder's presence to the founder's open
// page and waits for the words. These pin: only the founder, only the session
// a job was sent to may answer it, a closed page or a slow one fails the turn
// at once or in time rather than hanging, and the provider it builds has the
// same shape as the others, so the routes call it the same way.
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { createRelay, WHO } from '../own-relay.mjs';

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
const other = { id: 'u2' };

console.log('the founder\'s own brain, through their page:');

await ok('for the founder only: anyone else is refused the stream and never asked', async () => {
  assert.equal(WHO(founder), true);
  assert.equal(WHO(other), false);
  assert.equal(WHO(null), false);
  const relay = createRelay();
  const p = page();
  relay.open(p.req, p.res, other, { provider: 'claude' });
  assert.equal(p.res.status, 403);
  assert.equal(relay.connected(other), false);
  assert.equal((await relay.ask(other, { system: 's', prompt: 'p' })).status, 'not-yours');
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
  relay.open(a.req, a.res, founder, { provider: 'claude' });
  relay.open(b.req, b.res, founder, { provider: 'nope' });
  assert.equal(relay.connected(founder), true);
  assert.deepEqual(b.events()[0], { ev: 'ready', data: { provider: 'claude' } }, 'an unknown client is the one that can think');
  const pending = relay.ask(founder, { system: 'SYS', prompt: 'PROMPT', effort: 'low' });
  const job = b.events().find((e) => e.ev === 'job').data;
  assert.ok(!a.events().some((e) => e.ev === 'job'), 'one page, not every page');
  assert.match(job.id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...job, id: 'x' }, { id: 'x', provider: 'claude', system: 'SYS', prompt: 'PROMPT', effort: 'low' });
  // nobody else may answer it, not even with its id
  assert.equal(relay.answer(other, job.id, { ok: true, text: 'not yours' }), false);
  assert.equal(relay.answer(founder, job.id, { ok: true, text: '[calm] hello', usage: { in: 10, out: -4, cacheRead: 'x' } }), true);
  assert.equal(relay.answer(founder, job.id, { ok: true, text: 'again' }), false, 'answered once');
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
  relay.open(a.req, a.res, founder, {});
  const p = relay.provider(founder, { systemFor: (paint, opts) => opts?.system || (paint ? 'SYS+PAINT' : 'SYS'), replyFrom: (text) => ({ speech: text.replace(/^\[[^\]]*\]\s*/, ''), mood: 'calm' }) });
  assert.equal(p.detect('sk-anything'), false, 'never chosen by a key');
  const answer = async (text) => { for (let i = 0; i < 50; i++) { const j = a.events().filter((e) => e.ev === 'job').pop()?.data; if (j && relay.answer(founder, j.id, { ok: true, text })) return j; await new Promise((r) => setTimeout(r, 2)); } throw new Error('no job'); };
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

clearInterval(keep);
console.log(`\n${passed} checks passed.`);
