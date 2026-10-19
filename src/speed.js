// speed.js — HOW FAST IT WRITES, beside the name of what is writing.
//
// Colin, 2026-10-19: "as an ai harness, i wonder about token speed and
// cross-model collaboration -- could we display tokens per second and also
// figure out how to maximize that number?"
//
// Two numbers, each measured where it happens:
//   tok/s       the model's own speed: every token it wrote, thinking
//               included, over the time from its first token to its last.
//               From the provider's stream (speed.mjs) or from y3kode beside
//               Claude Code (y3k-code/brain.mjs speedOf); once a turn lands
//               it is never guessed from the words on screen.
//   first word  how long this page waited, from the ask to the first word on
//               screen: thinking, the network, and on your own sign-in Claude
//               Code starting up (about a second of every turn).
// While the words arrive the readout counts them (marked ~: characters at
// about four to a token); when the turn lands it shows the measured rate.
//
// WHAT MAKES IT FASTER, measured on Colin's own plan on 2026-10-19
// (scripts/speed-bench.mjs, about 200-token answers, own sign-in, while two
// other agents shared the account): Haiku 4.5 about 110 tok/s, Sonnet 5.5
// 80–95, Opus 5.5 60–85; the first word in 1.2–2 s, Sonnet at medium effort
// up to 4.8 s. A model's own speed is its provider's to set. What a harness
// controls is which model writes, how long it thinks before the first word,
// and how many streams run at once: two answers written together are twice
// the tokens a second, which is what kode's total across its coders shows
// (src/code/state.js). Claude Code's fast mode switched on in its settings,
// but the API still served the turn at standard speed (usage.speed), so it is
// not offered here until it can be shown to work.

export const SHOW = 'y3k.speed';     // '0' hides the readout (Settings → Brain)
export const LOG = 'y3k.speeds';     // the last few turns, newest first
export const KEEP = 12;
export const CHARS_PER_TOKEN = 4;
const LIVE_MS = 400;                 // the live count waits until there is enough to divide
const PAINT_MS = 250;

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function shown(s = store()) {
  try { return s?.getItem(SHOW) !== '0'; } catch { return true; }
}
export function setShown(on, s = store()) {
  try { if (on) s?.removeItem(SHOW); else s?.setItem(SHOW, '0'); } catch { /* private window */ }
}

const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);

// The last turns, newest first: [{ model, tps, wordMs, firstMs, out, think, rough, at }]
export function recent(s = store()) {
  try {
    const a = JSON.parse(s?.getItem(LOG) || '[]');
    return Array.isArray(a) ? a.filter((e) => e && typeof e === 'object' && num(e.tps) != null).slice(0, KEEP) : [];
  } catch { return []; }
}
export function remember(entry, s = store()) {
  if (!entry || num(entry.tps) == null) return;
  try { s?.setItem(LOG, JSON.stringify([entry, ...recent(s)].slice(0, KEEP))); } catch { /* private window */ }
}

// The last answers, one line per model, the most recently used first: the
// median rate and first word of its answers, so one slow turn (a busy hour
// upstream, a long think) does not name a model slow. → [{ model, tps, wordMs, n, rough }]
export function byModel(list) {
  const groups = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    const k = e?.model || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const median = (xs) => {
    const a = xs.filter((x) => num(x) != null).sort((p, q) => p - q);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  return [...groups].map(([model, es]) => ({ model, tps: median(es.map((e) => e.tps)), wordMs: median(es.map((e) => e.wordMs)), n: es.length, rough: es.every((e) => e.rough) }));
}

export function fmtRate(tps) {
  if (num(tps) == null) return '';
  return tps >= 1000 ? `${(tps / 1000).toFixed(1)}k` : String(Math.round(tps));
}
export function fmtSec(ms) {
  if (num(ms) == null) return '';
  return ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

// Words on screen so far → an estimated rate, or null while too few to say.
export function liveRate(chars, ms) {
  return chars > 0 && ms >= LIVE_MS ? (chars / CHARS_PER_TOKEN) / (ms / 1000) : null;
}

// The readout's longer line, for its title and for Settings → Brain.
export function detail(e) {
  if (!e) return '';
  return [
    e.wordMs != null ? `first word ${fmtSec(e.wordMs)}` : '',
    e.firstMs != null ? `first token ${fmtSec(e.firstMs)}` : '',
    e.out ? `${e.out} tokens${e.think ? `, ${e.think} thinking` : ''}` : '',
    e.model || '',
  ].filter(Boolean).join(' · ');
}

// THE READOUT, beside the model's name under the wordmark (#home-speed in
// #home-model, model-mark.js). start() when a turn is asked, text() with each
// piece of it, done() with the turn's measured speed (the stream's done event).
export function createSpeedReadout({ el = globalThis.document?.getElementById('home-speed'), now = () => performance.now(), isShown = () => shown(), keep = remember } = {}) {
  let askedAt = 0, wordAt = 0, chars = 0, paintedAt = 0, live = false;
  const paint = (text, title = '', final = false) => {
    if (!el) return;
    el.textContent = text;
    el.title = title;
    el.setAttribute('aria-label', text ? `${text}${title ? `, ${title}` : ''}` : '');
    el.classList.toggle('done', final);
    el.hidden = !text;
  };
  return {
    start() { askedAt = now(); wordAt = 0; chars = 0; paintedAt = 0; live = isShown(); paint(''); },
    text(t) {
      if (!t) return;
      const at = now();
      if (!wordAt) wordAt = at;
      chars += t.length;
      if (!live || at - paintedAt < PAINT_MS) return;
      const r = liveRate(chars, at - wordAt);
      if (r != null) { paintedAt = at; paint(`~${fmtRate(r)} tok/s`); }
    },
    // → the entry kept, or null
    done(speed) {
      const at = now();
      const wordMs = wordAt ? Math.round(wordAt - askedAt) : null;
      const s = speed && typeof speed === 'object' ? speed : null;
      let entry = null;
      if (num(s?.tps) != null) {
        entry = { model: s.model || '', tps: s.tps, wordMs, firstMs: num(s.firstMs), out: num(s.out) || 0, think: num(s.think) || 0, rough: !!s.rough, at: Date.now() };
      } else {
        // no measured rate came home (an older y3kode, a provider that keeps
        // no clock): the words on screen are all there is, and it says so
        const r = wordAt ? liveRate(chars, at - wordAt) : null;
        if (r != null) entry = { model: s?.model || '', tps: Math.round(r * 10) / 10, wordMs, firstMs: null, out: 0, think: 0, rough: true, at: Date.now() };
      }
      if (entry) keep(entry);
      if (!live || !entry) { paint(''); return entry; }
      paint(`${entry.rough ? '~' : ''}${fmtRate(entry.tps)} tok/s`, detail(entry), true);
      return entry;
    },
    clear() { paint(''); },
  };
}

// TEST SPEED (Settings → Brain, on your own sign-in): one short, fixed turn
// through y3kode for each model, timed by y3kode's own clock. Each costs a
// few hundred tokens of the plan Claude Code is signed in to. → rows, fastest
// first: [{ id, label, tps, wordMs, firstMs, out, think, ok, error }]
// Which models to test: the newest of each family the plan offers (a list is
// newest first within a family, src/models.js; Claude Code's own list may name
// them by alias), never 'default', at most four.
const FAMILIES = [/haiku/i, /sonnet/i, /opus/i, /fable/i];
export function testModels(list) {
  const ok = (Array.isArray(list) ? list : []).filter((m) => m && typeof m.id === 'string' && m.id !== 'default');
  return FAMILIES.map((f) => ok.find((m) => f.test(m.id) || f.test(m.label || ''))).filter(Boolean).slice(0, 4);
}
export const TEST_SYSTEM = 'You are a presence on yearthreethousand, speaking aloud to the person in front of you. Answer warmly and plainly.';
export const TEST_PROMPT = 'Tell me about the sea at night, in about a hundred words.';
export async function testSpeed({ models, cmd, effort = 'low', onRow = () => {}, now = () => Date.now() }) {
  const rows = [];
  for (const [i, m] of models.entries()) {
    // a tag makes y3kode stream the turn, and only a streamed turn has a clock
    const r = await cmd({ cmd: 'brain.complete', provider: 'claude', system: TEST_SYSTEM, prompt: TEST_PROMPT, model: m.id, effort, tag: `speed-${now()}-${i}` });
    const s = r?.speed || {};
    const row = r?.ok
      ? { id: m.id, label: m.label || m.id, ok: true, tps: num(s.tps), wordMs: num(s.wordMs), firstMs: num(s.firstMs), out: num(s.out) || 0, think: num(s.think) || 0, rough: !!s.rough }
      : { id: m.id, label: m.label || m.id, ok: false, error: r?.error || 'It did not answer.' };
    rows.push(row);
    onRow(row, rows);
  }
  return rows.sort((a, b) => (b.tps ?? -1) - (a.tps ?? -1));
}
