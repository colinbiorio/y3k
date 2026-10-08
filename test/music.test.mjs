// THE MUSIC LOOKUP, WHICH ANYONE MAY ASK. Run:  node test/music.test.mjs
//
// /api/music/tracks needs no account (Settings says so), and audit 2026-10-08
// found what that cost: every new q was a new entry in a Map that never let
// go of one, and about 41 requests out to Audius. This walks music.mjs with
// Audius faked in this process and the clock in the test's hand: what is kept,
// for how long, how many at most, what a miss may cost, and who is told no.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// Audius, faked: a list of `n` tracks, each one's stream a 302 to a content
// node that answers 206 with the CORS header. Every request out is counted,
// and every probe body knows whether it was cancelled.
let out = { list: 0, resolve: 0, probe: 0, cancelled: 0 };
let n = 20;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (/\/tracks\/(search|trending)\?/.test(u)) {
    out.list += 1;
    const data = Array.from({ length: n }, (_, i) => ({ id: 't' + i, title: 'track ' + i, user: { name: 'someone' }, duration: 60 }));
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (/\/stream\?app_name=/.test(u)) {
    out.resolve += 1;
    return new Response(null, { status: 302, headers: { location: 'https://node.example/audio/' + u.split('/tracks/')[1].split('/')[0] } });
  }
  out.probe += 1;
  const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(64)); }, cancel() { out.cancelled += 1; } });
  return new Response(body, { status: 206, headers: { 'access-control-allow-origin': '*' } });
};
let clock = Date.now();
const realNow = Date.now;
Date.now = () => clock;
const music = await import('../music.mjs');
const T = music._test;
const fresh = () => { T.reset(); out = { list: 0, resolve: 0, probe: 0, cancelled: 0 }; clock += 10 * 60e3; };

console.log('what is kept:');

await ok('trending is one list, whatever q came with it', async () => {
  fresh();
  await music.list({ kind: 'trending', q: 'a' });
  await music.list({ kind: 'trending', q: 'b' });
  await music.list({ kind: 'trending' });
  assert.equal(out.list, 1, 'a q on trending made a list of its own');
  assert.equal(T.size, 1);
});

await ok('a search is kept by its words, not their case or spacing', async () => {
  fresh();
  await music.list({ kind: 'search', q: 'Lo  Fi' });
  await music.list({ kind: 'search', q: ' lo fi ' });
  assert.equal(out.list, 1);
});

await ok('the same miss asked twice at once is fetched once', async () => {
  fresh();
  const [a, b] = await Promise.all([music.list({ kind: 'search', q: 'rain' }), music.list({ kind: 'search', q: 'rain' })]);
  assert.equal(out.list, 1, 'two fan-outs for one question');
  assert.equal(out.resolve, n);
  assert.equal(a, b);
});

await ok('a list is dropped once it is stale, and never more than LIST_MAX are held', async () => {
  fresh();
  for (let i = 0; i < 30; i++) { await music.list({ kind: 'search', q: 'q' + i }); clock += 5e3; }
  assert.ok(T.size <= Math.ceil(T.LIST_TTL_MS / 5e3), `stale lists kept: ${T.size}`);
  clock += T.LIST_TTL_MS + 1;
  await music.list({ kind: 'search', q: 'one more' });
  assert.equal(T.size, 1, 'nothing fresh but the last one');
  // the ceiling is a backstop the miss limits keep it under, so it is pinned
  // as written: least recently used out first, a refreshed key moved to the back
  const src = readFileSync(new URL('music.mjs', ROOT), 'utf8');
  assert.ok(src.includes('while (listCache.size > LIST_MAX) listCache.delete(listCache.keys().next().value);'), 'the size ceiling is gone');
  assert.ok(/listCache\.delete\(key\);\s+\/\/ a refreshed key moves to the end\s+listCache\.set\(key/.test(src), 'a refreshed key keeps its old place and is evicted first');
  assert.ok(T.LIST_MAX <= 500, 'the ceiling is not a ceiling');
});

await ok('a hit costs nothing, and a stale hit is fetched again', async () => {
  fresh();
  await music.list({ kind: 'trending' });
  clock += 1e3;
  await music.list({ kind: 'trending' });
  assert.equal(out.list, 1);
  clock += T.LIST_TTL_MS;
  await music.list({ kind: 'trending' });
  assert.equal(out.list, 2);
});

console.log('what a miss may cost:');

await ok('each probe lets go of its connection without reading the audio', async () => {
  fresh();
  await music.list({ kind: 'search', q: 'drums' });
  assert.equal(out.probe, n);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(out.cancelled, n, 'an unread body holds its connection open');
});

await ok('one machine gets MISS_PER_SOURCE new lookups a minute, and nobody else pays for it', async () => {
  fresh();
  n = 0;   // nothing to resolve: only the counting is under test
  for (let i = 0; i < T.MISS_PER_SOURCE; i++) await music.list({ kind: 'search', q: 'a' + i, source: '203.0.113.5' });
  await assert.rejects(music.list({ kind: 'search', q: 'one too many', source: '203.0.113.5' }), (e) => e.busy === true);
  assert.equal(out.list, T.MISS_PER_SOURCE, 'the refused lookup still went out');
  // what it already has is still answered, and the next machine is not refused
  await music.list({ kind: 'search', q: 'a0', source: '203.0.113.5' });
  await music.list({ kind: 'search', q: 'fresh', source: '203.0.113.6' });
  clock += 61e3;
  await music.list({ kind: 'search', q: 'a minute later', source: '203.0.113.5' });
});

await ok('and everyone together gets MISS_TOTAL', async () => {
  fresh();
  n = 0;
  let refused = 0;
  for (let i = 0; i < T.MISS_TOTAL + 5; i++) {
    try { await music.list({ kind: 'search', q: 'w' + i, source: 'machine-' + i }); } catch (e) { assert.equal(e.busy, true); refused += 1; }
  }
  assert.equal(refused, 5);
  assert.equal(out.list, T.MISS_TOTAL);
  n = 20;
});

await ok('the route says who is asking, and a refusal is a 429 that says what to do', async () => {
  const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
  const route = srv.slice(srv.indexOf("reqPath === '/api/music/tracks'"), srv.indexOf("if (reqPath === '/api/shelf')"));
  assert.ok(route.includes('music.list({ kind, q, source: sourceOf(req) })'), 'the lookup is not told who asked');
  assert.ok(/if \(e && e\.busy\) return json\(429,/.test(route), 'a refusal is not a 429');
  const settings = readFileSync(new URL('src/settings.js', ROOT), 'utf8');
  assert.ok(settings.includes("e.status === 429 ? 'Too many new searches. Try again in a minute.'"), 'the music pane says the service is unreachable when it is only busy');
});

Date.now = realNow;
console.log(`\n${passed} passed`);
