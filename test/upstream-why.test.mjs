// WHY THE BRAIN DID NOT ANSWER. Run: node test/upstream-why.test.mjs
//
// The server always knew (it logs "[upstream] byok openai 429 You exceeded your
// current quota…"), and told the page only `unavailable`. The page then said
// one line for everything, and sent a person whose phone had lost its signal to
// Settings to check a key that worked. Three things are pinned here:
//
//  - the reason, from a provider's status and words (upstream-why.mjs), for
//    the failures each provider really sends, and null for the ones it cannot
//    name, which keep the old line;
//  - the page asks ONCE. Every failed stream used to fall through to a second,
//    non-streaming call with the same key: a 429 was hit again at once, a 529
//    got twice the load, and a reply cut halfway was paid for twice;
//  - the routes: the word reaches the page and the provider's own text does
//    not, because it can echo part of the key.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { upstreamWhy, UPSTREAM_WHYS } from '../upstream-why.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const fail = (status, detail) => ({ ok: false, status, detail });

console.log('the reason, from what the provider said:');

await ok('Anthropic: a bad key, an empty account, a missing model, an overloaded hour', () => {
  assert.equal(upstreamWhy(fail(401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')), 'key');
  assert.equal(upstreamWhy(fail(403, '{"type":"error","error":{"type":"permission_error","message":"Your API key does not have permission"}}')), 'key');
  // a 400, not a 402: only its words say it is money
  assert.equal(upstreamWhy(fail(400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}')), 'credit');
  assert.equal(upstreamWhy(fail(404, '{"type":"error","error":{"type":"not_found_error","message":"model: m-retired"}}')), 'model');
  assert.equal(upstreamWhy(fail(429, '{"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}')), 'rate');
  assert.equal(upstreamWhy(fail(529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')), 'busy');
  assert.equal(upstreamWhy(fail(500, '{"type":"error","error":{"type":"api_error","message":"Internal server error"}}')), 'busy');
});

await ok('OpenAI\'s 429 is two things, told apart by its code: no money, or too fast', () => {
  assert.equal(upstreamWhy(fail(429, '{\n    "error": {\n        "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.",\n        "type": "insufficient_quota",\n        "param": null,\n        "code": "insufficient_quota"\n    }\n}')), 'credit');
  // the rate-limit message links to the billing page: the money words must
  // not win over the rate words, or a busy minute reads as an empty account
  assert.equal(upstreamWhy(fail(429, '{"error":{"message":"Rate limit reached for model-x in organization org-1 on requests per min (RPM): Limit 3, Used 3, Requested 1. Please try again in 20s. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.","type":"requests","param":null,"code":"rate_limit_exceeded"}}')), 'rate');
  // the same body cut at 300 characters (safeText) still reads the same
  assert.equal(upstreamWhy(fail(429, '{"error":{"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.","type":"insuffic'.slice(0, 300))), 'credit');
  // a 429 that says nothing is a rate limit, the ordinary meaning
  assert.equal(upstreamWhy(fail(429, '')), 'rate');
  assert.equal(upstreamWhy(fail(401, '{"error":{"message":"Incorrect API key provided: sk-proj-****abcd.","code":"invalid_api_key"}}')), 'key');
  assert.equal(upstreamWhy(fail(404, '{"error":{"message":"The model `m-x` does not exist or you do not have access to it.","code":"model_not_found"}}')), 'model');
});

await ok('OpenRouter: 402 is credit, its 200-with-an-error envelope is read by its code, and a flagged input is not the key', () => {
  assert.equal(upstreamWhy(fail(402, '{"error":{"code":402,"message":"Insufficient credits. Add more using https://openrouter.ai/credits"}}')), 'credit');
  assert.equal(upstreamWhy(fail(429, 'Rate limit exceeded: free-models-per-min')), 'rate');
  assert.equal(upstreamWhy(fail(502, 'Provider returned error')), 'busy');
  assert.equal(upstreamWhy(fail(503, 'No allowed providers are available for the selected model')), 'busy');
  assert.equal(upstreamWhy(fail(400, 'm-x is not a valid model ID')), 'model');
  assert.equal(upstreamWhy(fail(403, 'Your chosen model requires moderation and your input was flagged')), null);
  assert.equal(upstreamWhy(fail('402', 'string code from the envelope')), 'credit');
});

await ok('a 400 is only named when it says what is wrong; anything else keeps the old line', () => {
  assert.equal(upstreamWhy(fail(400, 'API key not valid. Please pass a valid API key.')), 'key');
  assert.equal(upstreamWhy(fail(400, "This model's maximum context length is 128000 tokens.")), null, 'a long conversation is not a model the key cannot use');
  assert.equal(upstreamWhy(fail(400, 'messages: roles must alternate')), null);
  assert.equal(upstreamWhy(fail(413, 'request_too_large')), null);
  assert.equal(upstreamWhy(fail(422, '')), null);
});

await ok('the site\'s own connection to the provider: refused, timed out, or cut partway', () => {
  assert.equal(upstreamWhy(fail('network', 'fetch failed')), 'unreachable');
  assert.equal(upstreamWhy(fail('timeout', 'The operation was aborted due to timeout')), 'unreachable');
  assert.equal(upstreamWhy(fail('stream', 'terminated')), 'unreachable');
  // an error event in the middle of a stream (server.mjs puts its type first)
  assert.equal(upstreamWhy(fail('stream', 'overloaded_error: Overloaded')), 'busy');
  assert.equal(upstreamWhy(fail('stream', 'api_error: Internal server error')), 'busy');
  assert.equal(upstreamWhy(fail('stream', '502: Provider disconnected')), 'busy');
  assert.equal(upstreamWhy(fail('stream', 'rate_limit_error: Rate limited')), 'rate');
  // the prefix is read as the status the same refusal would have had
  assert.equal(upstreamWhy(fail('stream', '402: Insufficient credits. Add more using https://openrouter.ai/credits')), 'credit');
  assert.equal(upstreamWhy(fail('stream', 'insufficient_quota: You exceeded your current quota')), 'credit');
  assert.equal(upstreamWhy(fail('stream', 'not_found_error: model: m-retired')), 'model');
  assert.equal(upstreamWhy(fail('stream', 'stream error')), 'unreachable', 'an error event with no words at all');
  // a prefix that is not on the list is not guessed at, and keeps the old line
  assert.equal(upstreamWhy(fail('stream', 'context_length_exceeded: This model\'s maximum context length is 128000 tokens.')), null);
  assert.equal(upstreamWhy(fail('stream', 'invalid_request_error: messages: roles must alternate')), null);
});

await ok('a 401 or 403 that says it is not the key is not called the key', () => {
  assert.equal(upstreamWhy(fail(403, '{"error":{"code":"unsupported_country_region_territory","message":"Country, region, or territory not supported"}}')), null);
});

await ok('nothing to name: a success, the founder\'s own brain, an unknown status', () => {
  assert.equal(upstreamWhy({ ok: true }), null);
  assert.equal(upstreamWhy(null), null);
  for (const s of ['aborted', 'not-installed', 'spawn', 'gone', 'no-page', 'upstream', undefined]) assert.equal(upstreamWhy(fail(s, '')), null, String(s));
  // every word it can say is one the page has a line for
  assert.deepEqual(UPSTREAM_WHYS, ['key', 'credit', 'rate', 'model', 'busy', 'unreachable']);
});

await ok('the server sends the word, never the provider\'s text, on every brain path it was asked for', () => {
  const s = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  assert.match(s, /import \{ upstreamWhy \} from '\.\/upstream-why\.mjs';/);
  assert.match(s, /sse\('error', \{ error: 'unavailable', \.\.\.upstreamRefused\(pid, out\) \}\)/, 'the stream\'s error event');
  assert.match(s, /\[upstream\] byok \$\{pid\}[^\n]*return json\(200, \{ available: false, \.\.\.upstreamRefused\(pid, out\) \}\)/, 'the key, not streaming');
  assert.match(s, /\[upstream\] anthropic \$\{out\.status\}[^\n]*return json\(200, \{ available: false, \.\.\.upstreamRefused\('anthropic', out\) \}\)/, 'the house, not streaming');
  assert.match(s, /\[speak\] \$\{brain\.pid\}[^\n]*return json\(200, \{ available: false, \.\.\.upstreamRefused\(brain\.pid, out\) \}\)/, 'airden');
  // and nothing that reaches the page carries the detail
  const helper = s.slice(s.indexOf('const upstreamRefused = '), s.indexOf('\n};\n', s.indexOf('const upstreamRefused = ')));
  assert.ok(helper.length > 50 && !/detail/.test(helper), 'the page is handed the provider\'s words');
});

await ok('the stream\'s pings go on through the wordless rescue, which is as silent as a think', () => {
  const s = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  const route = s.slice(s.indexOf("req.url === '/api/brain/stream'"), s.indexOf('// --- Voice endpoints'));
  // stopped right after the first call, they left the rescue to the page's
  // 45s watchdog, which would cut it and ask the non-streaming route again
  assert.ok(!/chatStream\([^\n]*\);\n\s+clearInterval\(heartbeat\);/.test(route), 'the heartbeat stops before the rescue');
  assert.match(route, /if \(!out\.ok\) clearInterval\(heartbeat\);/);
  assert.match(route, /clearInterval\(heartbeat\);\n\s+sse\('done'/);
  assert.ok(route.indexOf('const rescue = ') < route.lastIndexOf('clearInterval(heartbeat)'));
});

// --- the page ------------------------------------------------------------------
console.log('\nthe page: one request for a refusal, and one line for each reason:');

// THIS file's stand-ins for the browser: storage with a key in it, a network
// that records every request, and a clock where the idle watchdog's 45s is 80ms.
let stored = { provider: 'anthropic', key: 'sk-ant-x', model: 'm-small' };
globalThis.localStorage = { getItem: (k) => (k === 'y3k.brain' && stored ? JSON.stringify(stored) : null), setItem() {}, removeItem() {} };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 45000 ? 80 : ms, ...a);
let online = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ onLine: online }) });
const calls = [];
let route = () => { throw new Error('no route'); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), signal: init.signal }); return route(String(url), init); };

const enc = new TextEncoder();
const ev = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
// An event stream that plays its parts in order: a string is sent, a number is
// a wait in ms, and HANG holds it open, saying nothing, until it is aborted.
const HANG = Symbol('hang');
function streamOf(parts, signal) {
  let ctl;
  const body = new ReadableStream({ start(c) { ctl = c; } });
  signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
  (async () => {
    for (const p of parts) {
      if (signal?.aborted) return;
      if (p === HANG) return;
      if (typeof p === 'number') { await new Promise((r) => realSetTimeout(r, p)); continue; }
      try { ctl.enqueue(enc.encode(p)); } catch { return; }
    }
    try { ctl.close(); } catch { /* errored */ }
  })();
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const answered = (speech) => new Response(JSON.stringify({ available: true, mood: 'calm', speech }), { headers: { 'content-type': 'application/json' } });
const refusedEvent = (why, provider = 'anthropic') => ev('error', { error: 'unavailable', reason: 'upstream', why, provider });

const brain = await import('../src/brain.js');
const turn = async (streamParts, plain = () => answered('[calm] The second way.')) => {
  calls.length = 0;
  route = (url, init) => (url === '/api/brain/stream' ? streamOf(streamParts, init.signal) : plain(url, init));
  return brain.respondStream('hello');
};

await ok('a key the provider turned away: one request, never asked again, and the line names the provider', async () => {
  const r = await turn([refusedEvent('key')]);
  assert.deepEqual(calls.map((c) => c.url), ['/api/brain/stream'], 'the non-streaming route was asked the same thing');
  assert.equal(r.speech, 'Anthropic did not accept this key. It may be mistyped or revoked. Check it in Settings → Brain.');
  assert.equal(r.why, 'key');
  assert.ok(r.local && r.notice, 'a notice, off the air');
});

await ok('credit, rate, model and busy are asked once too, each with its own line', async () => {
  const lines = {
    credit: 'Your Anthropic account is out of credit. Add credit with Anthropic, then try again.',
    rate: 'Anthropic is limiting how often this key can be used. Wait a little, then try again.',
    model: 'This key cannot use m-small. Choose another model in Settings → Brain.',
    busy: 'Anthropic is overloaded or having trouble on its side. Try again shortly.',
  };
  for (const [why, line] of Object.entries(lines)) {
    const r = await turn([refusedEvent(why)]);
    assert.equal(calls.length, 1, `${why} was asked twice`);
    assert.equal(r.speech, line);
  }
  // OpenAI's name for OpenAI's refusal
  assert.match((await turn([refusedEvent('credit', 'openai')])).speech, /^Your OpenAI account is out of credit/);
});

await ok('a cut line before any words, or a reason the server could not name: asked again, as before', async () => {
  const a = await turn([refusedEvent('unreachable')]);
  assert.deepEqual(calls.map((c) => c.url), ['/api/brain/stream', '/api/brain']);
  assert.equal(a.speech, 'The second way.');
  const b = await turn([ev('error', { error: 'unavailable', reason: 'upstream' })]);
  assert.equal(calls.length, 2);
  assert.equal(b.speech, 'The second way.');
  // the stream simply ended, with neither done nor error
  await turn([ev('mood', { mood: 'calm' })]);
  assert.equal(calls.length, 2);
});

await ok('after words were said, never asked again: what the person saw was the reply stopping', async () => {
  const heard = [];
  calls.length = 0;
  route = (url, init) => streamOf([ev('mood', { mood: 'calm' }), ev('text', { text: 'I was just about to ' }), ev('error', { error: 'unavailable', reason: 'upstream', why: 'unreachable', provider: 'anthropic' })], init.signal);
  const r = await brain.respondStream('hello', { onText: (t) => heard.push(t) });
  assert.deepEqual(heard, ['I was just about to ']);
  assert.equal(calls.length, 1, 'a half-said reply was paid for twice');
  assert.equal(r.speech, 'The connection dropped before the reply was finished. Try again.');
  // the provider's own reason still wins when there is one
  const busy = await turn([ev('mood', { mood: 'calm' }), ev('text', { text: 'I was ' }), refusedEvent('busy')]);
  assert.equal(calls.length, 1);
  assert.match(busy.speech, /^Anthropic is overloaded/);
});

await ok('the idle watchdog ends a stream that has gone silent, and the turn is asked once more', async () => {
  const r = await turn([ev('mood', { mood: 'thinking' }), HANG]);
  assert.deepEqual(calls.map((c) => c.url), ['/api/brain/stream', '/api/brain']);
  assert.ok(calls[0].signal.aborted, 'the silent stream was left open');
  assert.equal(r.speech, 'The second way.');
});

await ok('…but the server\'s pings are bytes: a long, silent think is not cut', async () => {
  const ping = ': ping\n\n';
  // 5 × 40ms of pings is 200ms, well past the 80ms that stands in for 45s
  const r = await turn([ping, 40, ping, 40, ping, 40, ping, 40, ping, 40,
    ev('mood', { mood: 'calm' }), ev('text', { text: 'Thought it through.' }), ev('done', { mood: 'calm', speech: 'Thought it through.' })]);
  assert.equal(calls.length, 1);
  assert.equal(r.speech, 'Thought it through.');
  assert.ok(!r.notice);
});

await ok('a key no provider claims: one request, and said as the key', async () => {
  calls.length = 0;
  route = () => new Response(JSON.stringify({ error: 'unrecognized API key', why: 'key' }), { status: 400, headers: { 'content-type': 'application/json' } });
  stored = { key: 'what-is-this', model: '' };
  const r = await brain.respondStream('hello');
  assert.equal(calls.length, 1);
  assert.equal(r.speech, 'The key in Settings → Brain is not one the site recognizes. Check it there.');
  stored = { provider: 'anthropic', key: 'sk-ant-x', model: 'm-small' };
});

await ok('offline: nothing is sent at all, and the line says it is the connection', async () => {
  online = false;
  calls.length = 0;
  const r = await brain.respondStream('hello');
  online = true;
  assert.equal(calls.length, 0, 'a request went out from a device that knows it is offline');
  assert.equal(r.why, 'offline');
  assert.equal(r.speech, 'This device could not reach the site. Check the connection, then try again.');
  // and a fetch that cannot connect says the same, with no second try
  calls.length = 0;
  route = () => { throw new TypeError('Failed to fetch'); };
  const t = await brain.respondStream('hello');
  assert.equal(calls.length, 1);
  assert.equal(t.why, 'offline');
});

await ok('a site that could not be asked is the connection, not a site with no brain, and is asked again', async () => {
  // no key here, so whether the site has a brain is asked of /api/health; it
  // used to remember a failed ask as "no brain" and say NO_PROVIDER for good
  stored = null;
  route = () => { throw new TypeError('Failed to fetch'); };
  const said = [];
  const o = await brain.openingStream({ onText: (t) => said.push(t) });
  assert.deepEqual(said, ['This device could not reach the site. Check the connection, then try again.']);
  assert.ok(o.notice);
  assert.equal((await brain.respondStream('hello')).why, 'offline');
  calls.length = 0;
  route = (url, init) => (url === '/api/health' ? new Response(JSON.stringify({ brain: true }))
    : streamOf([ev('mood', { mood: 'calm' }), ev('text', { text: 'Here.' }), ev('done', { mood: 'calm', speech: 'Here.' })], init.signal));
  const r = await brain.respondStream('hello');
  assert.deepEqual(calls.map((c) => c.url), ['/api/health', '/api/brain/stream']);
  assert.equal(r.speech, 'Here.');
  stored = { provider: 'anthropic', key: 'sk-ant-x', model: 'm-small' };
});

await ok('on the site\'s key, a refused key is the site\'s to fix, and a limit is the site key\'s', async () => {
  stored = null;
  route = (url, init) => (url === '/api/health' ? new Response(JSON.stringify({ brain: true })) : streamOf([refusedEvent('credit')], init.signal));
  const r = await brain.respondStream('hello');
  assert.equal(r.speech, "The site's key could not be used just now. Try again later, or add your own key in Settings → Brain.");
  route = (url, init) => streamOf([refusedEvent('rate')], init.signal);
  assert.equal((await brain.respondStream('hello')).speech, "Anthropic is limiting how often the site's key can be used. Wait a little, then try again.");
  stored = { provider: 'anthropic', key: 'sk-ant-x', model: 'm-small' };
});

await ok('every line is plain: no dashes for breath, and the provider is named wherever it is known', () => {
  for (const why of brain.WHYS) {
    for (const p of ['anthropic', 'openai', 'openrouter', undefined]) {
      const line = brain.whyLine(why, p);
      assert.ok(line && !/—/.test(line), `${why}/${p}: ${line}`);
      if (p && !['model', 'dropped', 'offline'].includes(why)) assert.ok(line.includes({ anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' }[p]), `${why} does not say whose: ${line}`);
    }
  }
  assert.equal(brain.whyLine('something-else', 'anthropic'), null, 'an unknown reason keeps the old line');
});

await ok('main.js gives the words back when the site could not be reached; airden and the komputer say the same lines', () => {
  const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  assert.match(main, /if \(r\?\.why === 'offline' && !priv && text && !text\.startsWith\('\('\)\) \{\n\s+chatInput\.value = /);
  assert.match(main, /why: result\?\.why \|\| null/, 'the turn does not carry its reason back to handle()');
  assert.match(main, /else if \(why === 'upstream'\) showCaption\(whyLine\(upstream, provider\) \|\| PROVIDER_FAILED, 'y3k'\);/);
  const tend = readFileSync(join(ROOT, 'src/tend.js'), 'utf8');
  assert.equal((tend.match(/else if \(REFUSED\.has\(r\?\.why\)\) \{ showCaption\(whyLine\(r\.why, r\.provider\), 'y3k'\); stopAlive\(\); \}/g) || []).length, 2);
});

const { createAirden } = await import('../src/airden.js');
await ok('airden stops at once on a refused key, and waits out a busy provider before it says so', async () => {
  // its reason rides as `why`: `reason: 'busy'` is the komputer mid-beat (waited
  // out without counting), and a provider's bad hour must not read as that
  const run = async (replies) => {
    const states = [];
    let asked = 0;
    let t = 0;
    const a = createAirden({
      presence: () => 'orion', request: async () => { asked += 1; return replies.shift() || { available: false, reason: 'upstream' }; },
      floor: { held: () => false, take() {}, give() {} }, voice: () => null, show() {}, onState: (st) => states.push(st),
      timer: { set: (fn) => realSetTimeout(fn, 1), clear: (h) => clearTimeout(h) }, now: () => (t += 10000),
    });
    a.start();
    for (let i = 0; i < 40 && a.isOn(); i++) await new Promise((r) => realSetTimeout(r, 5));
    return { asked, last: states.at(-1) };
  };
  const key = await run([{ available: false, reason: 'upstream', why: 'key', provider: 'openai' }]);
  assert.equal(key.asked, 1, 'a refused key was asked again');
  assert.deepEqual(key.last, { on: false, why: 'upstream', upstream: 'key', provider: 'openai' });
  const busy = await run([1, 2, 3].map(() => ({ available: false, reason: 'upstream', why: 'busy', provider: 'anthropic' })));
  assert.equal(busy.asked, 3);
  assert.deepEqual(busy.last, { on: false, why: 'upstream', upstream: 'busy', provider: 'anthropic' });
});

globalThis.setTimeout = realSetTimeout;
globalThis.fetch = realFetch;

// --- the routes ----------------------------------------------------------------
console.log('\nthe routes: the word reaches the page, the provider\'s words do not:');

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const DATA = mkdtempSync(join(tmpdir(), 'y3k-why-'));
const LOG = join(DATA, 'upstream.log');
const PASSWORD = 'why-' + Math.random().toString(36).slice(2);
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
async function boot() {
  const child = spawn(process.execPath, ['--import', './test/fakes/brain-upstream.mjs', 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    // the site's own key is one the fake answers 529 for: the house path
    env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: 'sk-ant-busy-house',
      Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '', FAKE_BRAIN_LOG: LOG, RATE_MAX: '500' },
  });
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => realSetTimeout(r, 120)); }
  return child;
}
// The founder is seeded on the first boot; orion, on a boot that finds the founder.
let server = await boot();
await new Promise((r) => realSetTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await boot();

const sent = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const clearLog = () => writeFileSync(LOG, '');
const post = (path, body, cookie) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const messages = [{ role: 'user', content: 'hello' }];
// What a page reads off the stream, and the raw text, to search for leaks.
async function streamed(body, cookie) {
  const r = await post('/api/brain/stream', body, cookie);
  const raw = await r.text();
  const events = raw.split('\n\n').filter(Boolean).map((b) => {
    const e = /^event: (.+)$/m.exec(b); const d = /^data: (.+)$/m.exec(b);
    return e && d ? { event: e[1], data: JSON.parse(d[1]) } : null;
  }).filter(Boolean);
  return { status: r.status, raw, events, error: events.find((x) => x.event === 'error')?.data };
}
// none of the provider's words: the key it echoed, or its message
const LEAK = /sk-ant-revoked|sk-ant-broke|sk-ant-midway|sk-quota|sk-fast|sk-or-broke|sk-ant-busy|invalid x-api-key|credit balance|current quota|Rate limit reached|Insufficient credits|Overloaded \(/;

try {
  const login = await post('/api/auth/login', { identifier: 'colinbiorio@gmail.com', password: PASSWORD });
  const founder = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(founder, 'the founder signs in');

  await ok('the stream, on a key: the reason and whose, once, and nothing the provider wrote', async () => {
    clearLog();
    const s = await streamed({ messages, key: 'sk-ant-revoked-abcd', provider: 'anthropic' });
    assert.deepEqual(s.error, { error: 'unavailable', reason: 'upstream', why: 'key', provider: 'anthropic' });
    assert.ok(!LEAK.test(s.raw), s.raw);
    assert.equal(sent().length, 1, 'the provider was asked more than once');
  });

  await ok('a stream the provider cuts partway: the words that came, then why', async () => {
    const s = await streamed({ messages, key: 'sk-ant-midway', provider: 'anthropic' });
    assert.ok(s.events.some((x) => x.event === 'text' && /about to/.test(x.data.text)));
    assert.deepEqual(s.error, { error: 'unavailable', reason: 'upstream', why: 'busy', provider: 'anthropic' });
    assert.ok(!LEAK.test(s.raw), s.raw);
  });

  await ok('not streaming, on a key: credit and rate told apart for OpenAI; credit and model for Anthropic', async () => {
    const ask = (key, provider) => post('/api/brain', { messages, key, provider }).then((r) => r.text());
    const cases = [['sk-quota', 'openai', 'credit'], ['sk-fast', 'openai', 'rate'], ['sk-ant-broke', 'anthropic', 'credit'], ['sk-ant-gone', 'anthropic', 'model']];
    for (const [key, provider, why] of cases) {
      clearLog();
      const raw = await ask(key, provider);
      assert.deepEqual(JSON.parse(raw), { available: false, reason: 'upstream', why, provider }, key);
      assert.ok(!LEAK.test(raw), raw);
      assert.equal(sent().length, 1, `${key}: asked more than once`);
    }
  });

  await ok('a key no provider claims: 400, said as the key, on both routes, and nothing is called', async () => {
    clearLog();
    for (const path of ['/api/brain', '/api/brain/stream']) {
      const r = await post(path, { messages, key: 'what-is-this' });
      assert.equal(r.status, 400);
      assert.deepEqual(await r.json(), { error: 'unrecognized API key', why: 'key' });
    }
    assert.equal(sent().length, 0);
  });

  await ok('the site\'s key (signed in, no key of your own): its provider\'s bad hour is said as one', async () => {
    clearLog();
    const s = await streamed({ messages }, founder);
    assert.deepEqual(s.error, { error: 'unavailable', reason: 'upstream', why: 'busy', provider: 'anthropic' });
    assert.ok(!LEAK.test(s.raw), s.raw);
    const plain = await post('/api/brain', { messages }, founder).then((r) => r.text());
    assert.deepEqual(JSON.parse(plain), { available: false, reason: 'upstream', why: 'busy', provider: 'anthropic' });
    assert.ok(!LEAK.test(plain), plain);
    assert.equal(sent().length, 2);
    assert.ok(sent().every((x) => x.key === 'sk-ant-busy-house'));
  });

  await ok('airden\'s door: an empty OpenRouter account is credit; a key no provider claims is the key', async () => {
    await post('/api/presences/orion/budget', { set: 5 }, founder);
    clearLog();
    const raw = await post('/api/speak', { presence: 'orion', key: 'sk-or-broke', provider: 'openrouter' }, founder).then((r) => r.text());
    assert.deepEqual(JSON.parse(raw), { available: false, reason: 'upstream', why: 'credit', provider: 'openrouter' });
    assert.ok(!LEAK.test(raw), raw);
    assert.equal(sent().length, 1);
    const odd = await post('/api/speak', { presence: 'orion', key: 'what-is-this' }, founder).then((r) => r.json());
    assert.deepEqual(odd, { available: false, reason: 'upstream', why: 'key' });
    assert.equal(sent().length, 1, 'an unrecognised key reached a provider');
  });
} finally {
  server.kill('SIGTERM');
}

console.log(`\n${passed} checks passed.`);
