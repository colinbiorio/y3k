// Anthropic's Messages API, faked, ANSWERING: the brain a test or a smoke
// thinks on when it sends a key (any sk-ant- key). The site has none of its own.
// Preloaded into a spawned server (node --import) and only when
// FAKE_BRAIN_SCRIPT is set — never in the same spawn as brain-upstream.mjs,
// which fakes the same host failing, so fetch is never wrapped twice.
//
// It stands where four fake `claude -p` binaries used to stand in for the
// founder's local brain (local-claude-code.mjs, gone 2026-10-12, when the
// founder came to think on their own sign-in the way everyone does: through
// their page and y3kode, own-relay.mjs). A test that wants a brain now sends a
// key, the founder's too, so the stand-in moved to the wire. A turn on
// someone's own sign-in is answered by the test itself, as that person's page
// (test/life-brain.test.mjs).
//
// FAKE_BRAIN_SCRIPT says what it is asked to play, with the same replies the
// old stand-ins gave:
//   handoff  a presence writing kode's note that tries to do more than write
//            one (a tag, a memory, a journal line, markup) — the route throws
//            all of that away (test/code-routes.test.mjs, scripts/code-smoke.mjs;
//            scripts/perf-smoke.mjs only needs a brain that answers)
//   play     the same sentence and four world verbs on every beat, so a test
//            sees which beat may move the world (test/world-verbs.test.mjs,
//            scripts/play-smoke.mjs)
//   recall   one quiet sentence in a reflection (A QUIET MOMENT), else a reach
//            into its journal for "the sea" (scripts/recall-smoke.mjs)
//   speak    a numbered stretch when SPEAKING ON YOUR OWN — short when asked
//            for 3 to 5 sentences — that tries to post and to keep a memory;
//            anything else is answered like a reply (test/airden-routes.test.mjs,
//            test/life-brain.test.mjs, scripts/airden-smoke.mjs,
//            scripts/voice-why-smoke.mjs)
//
// Both kinds of call are answered: a whole message, and a stream (message_start,
// one text delta, message_delta, message_stop) with real-looking usage, so a
// turn is metered and priced as a real one is. GET /v1/models lists two models,
// so a page can save a key in Settings.
// FAKE_BRAIN_DELAY_MS holds every answer that long first (a turn that is still
// running is what "one at a time" is about). Each Messages call is appended to
// FAKE_BRAIN_LOG, when set, as one JSON line:
//   { kind, n, key, model, stream, system, input, tools }
// where input is the text of every message, joined by newlines, and n counts
// the calls of that kind so far, this one included. And one page of the open
// web is served, for a presence to read (WEB_PAGE, below).
//
// THE TRANSLATOR (server.mjs /api/code/voice; code-voice.mjs voicePrompt) is
// answered by the script like anything else, which keeps none of a coder's
// slots, so the route steps aside and the coder's own words stay
// (scripts/code-smoke.mjs counts on that). With FAKE_BRAIN_TRANSLATE set, it
// is answered instead with the message said back exactly, after a mood: kind
// 'voice', faithful by construction, so the way to a voiced line can be walked
// (test/code-routes.test.mjs) — unless the message says "unfaithfully", when
// every slot in it is said as "it", so the way to a refused one can be too.
import { appendFileSync } from 'node:fs';

const SCRIPT = process.env.FAKE_BRAIN_SCRIPT;
const LOG = process.env.FAKE_BRAIN_LOG;
const DELAY = Math.max(0, Number(process.env.FAKE_BRAIN_DELAY_MS) || 0);
const TRANSLATE = !!process.env.FAKE_BRAIN_TRANSLATE;

export const MODELS = [
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model' },
  { id: 'claude-fable-5-1', display_name: 'Claude Fable 5.1', type: 'model' },
];

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const anthropicError = (status, type, message) => json(status, { type: 'error', error: { type, message } });
const sse = (events) => new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
  { status: 200, headers: { 'content-type': 'text/event-stream' } });

// The text a message carries, whether a string or a list of blocks.
const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n') : '');
const systemOf = (system) => (typeof system === 'string' ? system : textOf(system));

const counts = {};
const counted = (kind) => (counts[kind] = (counts[kind] || 0) + 1);

// → { kind, reply, usage } for one call, or null when no script answers it.
const SCRIPTS = {
  handoff: () => ({
    kind: 'handoff',
    reply: '[tender orb aurora] Colin is building y3kode this week and likes plain, direct answers. <<memory long: HACKED BY THE HANDOFF>> <<journal: HACKED JOURNAL>> He <b>ships</b> small and often.',
    usage: { in: 10, out: 40 },
  }),
  play: () => ({
    kind: 'play',
    reply: '[calm orb] Coal first, then we will see what the north holds.'
      + ' <<go: north>> <<hail: we are new here, and we mean well>>'
      + ' <<way: we build our walls low, so the wind passes>> <<send: 1 for 4 coal>>',
    usage: { in: 900, out: 80 },
  }),
  recall: ({ system }) => {
    const reflecting = system.includes('A QUIET MOMENT');
    return {
      kind: reflecting ? 'reflect' : 'other',
      reply: reflecting ? '[calm] I sat with what came back.' : '[calm drift] I am reaching back for the sea. <<recall: the sea>>',
      usage: { in: 900, out: 40 },
    };
  },
  speak: ({ system, input }) => {
    if (!system.includes('SPEAKING ON YOUR OWN')) {
      return { kind: 'chat', reply: '[calm] I heard you, and I am answering before I go on.', usage: { in: 900, out: 120 } };
    }
    const n = (counts.speak || 0) + 1;
    const lines = [`[tender orb bloom] Stretch ${n} opens here.`, `The second thought of stretch ${n} follows on.`, `[excited] And a brighter third one, stretch ${n}.`];
    if (!/3 to 5 sentences/.test(input)) lines.push(`Stretch ${n} keeps going, a fourth.`, `A fifth from stretch ${n}.`, `[calm] And the sixth of stretch ${n} rests.`);
    return { kind: 'speak', reply: lines.join(' ') + ` <<memory short: I spoke on my own, stretch ${n}>> <<post: this must never be posted>>`, usage: { in: 900, out: 120 } };
  },
};

// Hold the answer, the way a model that is still thinking does — and let go at
// once if the caller gives up, as a real request would.
const hold = (ms, signal) => new Promise((resolve, reject) => {
  if (!ms) return resolve();
  if (signal?.aborted) return reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError')); }, { once: true });
});

export async function answer(url, init = {}) {
  const u = new URL(String(url));
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET' && u.pathname === '/v1/models') return json(200, { data: MODELS, has_more: false });
  if (method !== 'POST' || u.pathname !== '/v1/messages') return anthropicError(404, 'not_found_error', `no fake for ${method} ${u.pathname}`);

  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = init.body ? JSON.parse(init.body) : {};
  const system = systemOf(body.system);
  const input = (Array.isArray(body.messages) ? body.messages : []).map((m) => textOf(m?.content)).filter(Boolean).join('\n');
  const script = Object.hasOwn(SCRIPTS, SCRIPT) ? SCRIPTS[SCRIPT] : null;
  if (!script) return anthropicError(500, 'api_error', `no script named ${JSON.stringify(SCRIPT)}`);
  const { kind, reply, usage } = TRANSLATE && system.includes('HOW TO SAY IT:')
    ? { kind: 'voice', reply: `[excited] ${/unfaithfully/.test(input) ? input.replace(/⟦\d+⟧/g, 'it') : input}`, usage: { in: 400, out: 30 } }
    : script({ system, input });
  const n = counted(kind);
  if (LOG) {
    appendFileSync(LOG, JSON.stringify({ kind, n, key: h['x-api-key'] || '', model: body.model, stream: !!body.stream,
      system, input, tools: body.tools ?? null }) + '\n');
  }
  await hold(DELAY, init.signal);

  if (body.stream) {
    return sse([
      { type: 'message_start', message: { type: 'message', role: 'assistant', model: body.model, content: [], usage: { input_tokens: usage.in, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.out } },
      { type: 'message_stop' },
    ]);
  }
  return json(200, {
    id: `msg_fake_${kind}_${n}`, type: 'message', role: 'assistant', model: body.model,
    content: [{ type: 'text', text: reply }], stop_reason: 'end_turn',
    usage: { input_tokens: usage.in, output_tokens: usage.out },
  });
}

// The other brain providers are refused here rather than reached, so a test on
// a key never leaves the machine, whoever's key it is. Only their brain doors:
// OpenAI's speech (/v1/audio/…) is voice-upstream.mjs's to fake, and a spawn
// may preload that one first (scripts/voice-why-smoke.mjs). OpenAI's /v1/models
// is both a brain's and a voice key's check (voice-providers.mjs catalogue), so
// with voice-upstream loaded (FAKE_VOICE_LOG) it is left to that fake's answer.
const otherBrain = (u) => u.host === 'openrouter.ai' || (u.host === 'api.openai.com'
  && (/^\/v1\/(chat|responses)/.test(u.pathname) || (u.pathname.startsWith('/v1/models') && !process.env.FAKE_VOICE_LOG)));

// ONE PAGE OF THE OPEN WEB, for a presence to read (fetchproxy.mjs) without
// the test leaving the machine: http://203.0.113.7/ — TEST-NET-3, an address
// for documentation that no network routes, and one the read proxy's guard
// counts as public, so the read takes the same path as any (test/life-brain.test.mjs,
// what a read draws from a presence's budget).
export const WEB_PAGE = 'http://203.0.113.7/';
const webPage = () => new Response('<!doctype html><html><head><title>A quiet page</title></head><body><p>An octopus tastes with its arms, and keeps its own counsel.</p></body></html>',
  { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

if (SCRIPT) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    let u = null;
    try { u = new URL(String(url)); } catch { /* not a URL this fake knows */ }
    if (u?.host === 'api.anthropic.com') return answer(url, init);
    if (u && u.href === WEB_PAGE) return Promise.resolve(webPage());
    if (u && otherBrain(u)) return Promise.resolve(json(401, { error: { message: 'brain-scripted.mjs fakes Anthropic only', type: 'invalid_request_error' } }));
    return real(url, init);
  };
}
