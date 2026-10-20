// speed.mjs — HOW FAST A MIND WROTE. Colin, 2026-10-19: "as an ai harness, i
// wonder about token speed and cross-model collaboration -- could we display
// tokens per second and also figure out how to maximize that number?"
//
// The server's half: the clock a provider's stream keeps (streamClock), the
// one line the page is told about a turn (turnSpeed), and what the own-sign-in
// relay accepts from a page about a turn it ran (cleanSpeed). The page's half
// is src/speed.js; y3kode's is speedOf in y3k-code/brain.mjs.

// THE STREAM'S OWN CLOCK (Colin, 2026-10-19: "could we display tokens per
// second and also figure out how to maximize that number?"). Each provider's
// stream marks its tokens as they arrive and hands the clock back with its
// usage, so the route's one call into a provider stays the line its tests pin
// and turnSpeed (below) reads the rate off the provider's own numbers.
export function streamClock(now = () => performance.now()) {
  const t0 = now();
  let firstAt = null, lastAt = null;
  return {
    token() { const t = now(); firstAt ??= t; lastAt = t; },
    read: () => (firstAt == null ? { firstMs: null, genMs: null } : { firstMs: Math.round(firstAt - t0), genMs: Math.round(lastAt - firstAt) }),
  };
}

// What the page is told about how fast a turn was. A key's numbers come from
// the provider's stream (streamClock); the own sign-in's from y3kode, measured
// beside Claude Code itself (y3k-code/brain.mjs speedOf), so the hops through
// the page and the relay are not counted against the model. tps is every
// output token, thinking included, over the time from the first token to the
// last: the model's own speed. A provider that hides its reasoning (OpenAI's
// reasoning_tokens) is timed on what it shows, and counted the same way.
// Too short to time (under a fifth of a second of writing) has no rate.
export function turnSpeed(out, model) {
  const s = out?.speed;
  if (!s || typeof s !== 'object') return null;
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const tok = Math.max(0, out?.usage?.out | 0);
  const hidden = Math.max(0, out?.usage?.think | 0);
  const genMs = n(s.genMs);
  let tps = Number.isFinite(s.tps) && s.tps > 0 ? Math.round(s.tps * 10) / 10 : null;
  const shown = tok - hidden;
  if (tps == null && shown > 1 && genMs >= 200) tps = Math.round(((shown - 1) / genMs) * 10000) / 10;
  return { model: typeof s.model === 'string' && s.model ? s.model.slice(0, 80) : String(model || '').slice(0, 80), out: tok, think: n(s.think) ?? hidden, firstMs: n(s.firstMs), genMs, tps, rough: !!s.rough };
}

// What a page may report about a turn its y3kode ran (own-relay.mjs answer):
// numbers in range and a model name, nothing else. The page is the person's
// own, but what it says still lands in a line other code reads.
export function cleanSpeed(s) {
  if (!s || typeof s !== 'object') return null;
  const n = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null);
  const out = {
    out: n(s.out, 1e7), think: n(s.think, 1e7), firstMs: n(s.firstMs, 36e5), wordMs: n(s.wordMs, 36e5), genMs: n(s.genMs, 36e5),
    apiMs: n(s.apiMs, 36e5), tps: n(s.tps, 1e5), rough: s.rough === true,
    model: typeof s.model === 'string' && /^[\w.:/@\[\]-]{1,80}$/.test(s.model) ? s.model : null,
  };
  return out;
}
