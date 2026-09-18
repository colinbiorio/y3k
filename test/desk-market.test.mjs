// THE DESK'S MARKET — step one. Run: node test/desk-market.test.mjs
import assert from 'node:assert';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'desk-'));
const M = await import('../desk-market.mjs');
const srv = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// a payload in Yahoo's shape: a 2:1 split on day 2 (adjclose halves the earlier close)
const fixture = { chart: { result: [{ timestamp: [1000, 2000, 3000, 4000], indicators: {
  quote: [{ open: [100, 102, 52, null], high: [104, 106, 54, 55], low: [98, 100, 50, 51], close: [102, 104, 53, null], volume: [10, 11, 12, 13] }],
  adjclose: [{ adjclose: [51, 52, 53, null] }] } }] } };

console.log('\nthe bars:');
ok('back-adjustment scales o/h/l by adjclose/close per day, and a null close is dropped not zeroed', () => {
  const r = M.parseChart(fixture, 'X');
  assert.equal(r.source, 'yahoo');
  assert.equal(r.bars.length, 3, 'the null-close bar was kept');
  assert.equal(r.bars[0].c, 51);                       // the adjusted close
  assert.ok(Math.abs(r.bars[0].o - 50) < 1e-9, 'open not scaled by the split');
  assert.ok(Math.abs(r.bars[0].h - 52) < 1e-9);
  assert.equal(r.bars[2].c, 53);                       // after the split, unchanged
  assert.throws(() => M.parseChart({ chart: { result: [] } }, 'X'), /no result/);
});

ok('the synthetic walk is deterministic per symbol, differs by symbol, and says what it is', () => {
  const a = M.synth('SPY', 50, 0), b = M.synth('SPY', 50, 0), c = M.synth('QQQ', 50, 0);
  assert.deepEqual(a.bars, b.bars, 'the same symbol walked two different paths');
  assert.notDeepEqual(a.bars, c.bars, 'two symbols walked the same path');
  assert.equal(a.source, 'synthetic');
  for (const bar of a.bars) { assert.ok(bar.l <= Math.min(bar.o, bar.c) + 1e-9 && bar.h >= Math.max(bar.o, bar.c) - 1e-9, 'a bar whose high/low do not contain open/close'); assert.ok(bar.c > 0); }
});

console.log('\nthe clock, the cache, the honesty:');
await (async () => {
  M._test.reset();
  let calls = 0;
  const fake = async (url) => { calls += 1; if (/SPY|QQQ/.test(url)) return { ok: true, json: async () => fixture }; return { ok: false, status: 429 }; };
  const did = await M.refresh({ fetchImpl: fake, symbols: ['SPY', 'QQQ', 'AAPL'], pauseMs: 0 });
  ok('a refresh fetches each symbol once, keeps what came back, and names the fallback for what did not', () => {
    assert.equal(did, true); assert.equal(calls, 3);
    assert.equal(M.bars('SPY').source, 'yahoo');
    assert.equal(M.bars('AAPL').source, 'synthetic', 'a failed symbol was served as if it were market data');
    assert.match(M.bars('AAPL').error, /429/);
    assert.equal(M.bars('NVDA').source, 'synthetic', 'a never-fetched symbol must still be named synthetic');
  });
  ok('a second refresh while one is in flight is a no-op, not a pile-up', async () => {
    let release; const slow = () => new Promise((r) => { release = r; });
    const p1 = M.refresh({ fetchImpl: async () => { await slow(); return { ok: true, json: async () => fixture }; }, symbols: ['SPY'], pauseMs: 0 });
    const p2 = await M.refresh({ fetchImpl: fake, symbols: ['SPY'], pauseMs: 0 });
    assert.equal(p2, false, 'two refreshes ran at once');
    release(); await p1;
  });
  ok('the scan carries sources, sizes and last closes — and NO bars', () => {
    const snap = M.snapshot();
    assert.ok(Object.keys(snap.symbols).length === M.UNIVERSE.length);
    assert.equal(snap.symbols.SPY.source, 'yahoo');
    assert.equal(snap.symbols.SPY.bars, 3);
    assert.equal(snap.symbols.SPY.last, 53);
    assert.ok(!JSON.stringify(snap).includes('"o":'), 'the scan is shipping bars');
    assert.ok(JSON.stringify(snap).length < 4000, 'the scan is not small');
  });
})();

console.log('\nthe server:');
ok('the route is founder-gated with a 404, reads the cache only, and the clock is started once at boot', () => {
  const r = srv.slice(srv.indexOf("reqPath === '/api/desk/scan'"), srv.indexOf("reqPath === '/api/desk/scan'") + 400);
  assert.ok(/!user\?\.founder/.test(r) && /404/.test(r), 'not founder-gated with a 404');
  assert.ok(!/fetch\(|refresh\(/.test(r), 'THE ROUTE FETCHES — a request must never wait on the network');
  assert.equal((srv.match(/deskMarket\.start\(\);/g) || []).length, 1, 'the clock is started zero or several times');
  const mod = readFileSync(new URL('../desk-market.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/if \(inFlight\) return false;/.test(mod), 'no in-flight guard');
  assert.ok(!/process\.env\.(ANTHROPIC|OPENAI)/.test(mod) && !/key/i.test(mod.replace(/keyof/g, '')), 'the market module touches a key');
  const gi = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(gi.includes('.desk-market.json') && gi.includes('.desk-market.json.tmp'), 'the cache is not gitignored');
});

console.log('\n' + passed + ' checks passed.\n');
