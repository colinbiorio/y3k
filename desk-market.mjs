// ============================================================================
// THE DESK'S MARKET — eight symbols, daily bars, refreshed on a clock.
//
// STEP 3 of the desk plan, and deliberately the smallest thing that answers
// the one question nobody could answer from a laptop: does Render's shared
// egress reach Yahoo's chart endpoint the way this Mac does? From here it
// returned 200 for all eight, with adjusted closes and no nulls, in 50-400ms,
// with no key, no header and no cookie. GET /api/desk/scan (founder only)
// reports the same from production.
//
// THREE RULES:
//   1. NEVER FETCH INSIDE A REQUEST. The original (y3trading, Python) fetched
//      per request and rescanned its universe on every /api/signals; in this
//      single process, sharing a page with the WebGL body, that is a visible
//      stall for everyone. Bars refresh on a ten-minute interval with an
//      in-flight boolean; a request reads the cache and nothing else.
//   2. THE SOURCE IS NAMED. Every payload carries source: 'yahoo' or
//      'synthetic'. When the endpoint cannot be reached the desk still has
//      bars — a seeded synthetic walk — and it says so on every row. A desk
//      that quietly served invented prices as market data would be lying
//      about the one thing it exists to be honest about.
//   3. NOTHING HERE SPENDS ANYTHING. No key, no model, no order. Prices only.
// ============================================================================

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.desk-market.json');

export const UNIVERSE = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'BTC-USD', 'ETH-USD', 'SOL-USD'];
export const REFRESH_MS = 10 * 60 * 1000;
const RANGE = '1y';
// a fixed host and a fixed shape — nothing user-supplied ever reaches this URL
const chartUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=1d&events=div%2Csplit`;

// ---- parsing ---------------------------------------------------------------
// Yahoo's chart payload → daily bars, BACK-ADJUSTED: every o/h/l is scaled by
// adjclose/close for its own day, so a split or a dividend does not appear as
// a price move. Bars with a null close are dropped rather than zero-filled —
// a zero close is a 100% crash to anything downstream.
export function parseChart(json, symbol) {
  const res = json?.chart?.result?.[0];
  if (!res) throw new Error(json?.chart?.error?.description || 'no result');
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose || null;
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null || !(c > 0)) continue;
    const a = adj?.[i] != null ? adj[i] : c;
    const f = a / c;
    bars.push({ t: ts[i] * 1000, o: +((q.open?.[i] ?? c) * f).toFixed(6), h: +((q.high?.[i] ?? c) * f).toFixed(6), l: +((q.low?.[i] ?? c) * f).toFixed(6), c: +a.toFixed(6), v: q.volume?.[i] ?? 0 });
  }
  if (!bars.length) throw new Error('no bars');
  return { symbol, source: 'yahoo', bars, at: Date.now(), error: null };
}

// ---- the declared fallback -------------------------------------------------
// FNV-1a over the symbol, so the same symbol always walks the same path (the
// Python original seeded from Python's per-process-salted hash, which is why
// its "deterministic" generator contradicted its own docstring). Crypto walks
// wider than equities; that is the only thing this knows about markets.
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export function synth(symbol, n = 260, now = Date.now()) {
  let x = fnv1a(symbol) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const crypto = /-USD$/.test(symbol);
  const vol = crypto ? 0.035 : 0.012, drift = crypto ? 0.0006 : 0.0003;
  let c = crypto ? 100 + rnd() * 900 : 50 + rnd() * 400;
  const bars = [];
  const day = 86400000;
  for (let i = n - 1; i >= 0; i--) {
    const g = (rnd() + rnd() + rnd() - 1.5) * vol * 2;   // roughly normal
    const o = c;
    c = Math.max(0.5, c * (1 + drift + g));
    const h = Math.max(o, c) * (1 + rnd() * vol * 0.5), l = Math.min(o, c) * (1 - rnd() * vol * 0.5);
    bars.push({ t: now - i * day, o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +c.toFixed(4), v: Math.round(1e6 * (0.5 + rnd())) });
  }
  return { symbol, source: 'synthetic', bars, at: now, error: null };
}

// ---- the cache ---------------------------------------------------------------
let cache = {};          // symbol -> { symbol, source, bars, at, error }
let inFlight = false;
let timer = null;
let lastRefresh = 0;
function load() { try { const j = JSON.parse(readFileSync(FILE, 'utf8')); if (j && typeof j === 'object') cache = j; } catch { cache = {}; } }
function save() { try { const tmp = FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(cache)); renameSync(tmp, FILE); } catch { /* a cache that cannot be written is still a cache */ } }
load();

async function fetchOne(symbol, fetchImpl) {
  const r = await fetchImpl(chartUrl(symbol), { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return parseChart(await r.json(), symbol);
}

// One pass over the universe, sequentially and politely. A symbol that fails
// keeps its last good bars (or gets the synthetic walk if it never had any)
// and records why, so the scan can show it.
export async function refresh({ fetchImpl = globalThis.fetch, symbols = UNIVERSE, pauseMs = 150 } = {}) {
  if (inFlight) return false;
  inFlight = true;
  try {
    for (const s of symbols) {
      try { cache[s] = await fetchOne(s, fetchImpl); }
      catch (e) {
        const prev = cache[s];
        cache[s] = prev && prev.bars?.length ? { ...prev, error: String(e.message || e), at: prev.at } : { ...synth(s), error: String(e.message || e) };
      }
      if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
    }
    lastRefresh = Date.now();
    save();
    return true;
  } finally { inFlight = false; }
}

// Bars for one symbol — from the cache, or the synthetic walk if it has never
// been fetched, source named either way. Never triggers a fetch.
export function bars(symbol) { return cache[symbol] || synth(symbol); }

// What the scan shows: sources, sizes, last closes, errors — and NO bars, so
// the founder's probe is a few hundred bytes and not eight years of prices.
export function snapshot() {
  const out = {};
  for (const s of UNIVERSE) {
    const rec = cache[s];
    out[s] = rec
      ? { source: rec.source, bars: rec.bars.length, last: rec.bars[rec.bars.length - 1]?.c ?? null, at: rec.at, error: rec.error || null }
      : { source: 'none', bars: 0, last: null, at: null, error: 'never fetched' };
  }
  return { at: Date.now(), lastRefresh, inFlight, refreshMs: REFRESH_MS, symbols: out };
}

// Started once by the server. The first pass runs after a short delay so boot
// is not held behind eight network calls; then every ten minutes.
export function start({ delayMs = 8000 } = {}) {
  if (timer) return;
  setTimeout(() => { refresh().catch(() => {}); }, delayMs);
  timer = setInterval(() => { refresh().catch(() => {}); }, REFRESH_MS);
  if (timer.unref) timer.unref();
}
export function stop() { if (timer) { clearInterval(timer); timer = null; } }
export const _test = { get cache() { return cache; }, reset() { cache = {}; inFlight = false; lastRefresh = 0; } };
