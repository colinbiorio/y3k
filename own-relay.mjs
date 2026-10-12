// YOUR PRESENCE, ON YOUR OWN SIGN-IN, FROM THE SITE. The founder's own brain
// used to exist only when the site itself ran on the founder's machine
// (local-claude-code.mjs: Y3K_LOCAL_CLAUDE_CODE=1, loopback only). On the
// hosted site there is no Claude Code to run, so with the site's key gone the
// orb had nothing to think with (Colin: "i deleted the api key from the site,
// and it stopped responding"). This brings the same brain to the hosted site:
// a turn of the founder's presence is handed to the founder's own open page,
// which hands it to y3kode on the founder's own computer (y3k-code/brain.mjs),
// which runs the founder's own signed-in Claude Code once, with no tools, and
// the words come back the same way. The server never touches a credential and
// never reaches the computer: the page in the person's own browser is the only
// bridge (CODE.md, line 2).
//
// FOR ONE PERSON, while the software is built (Colin, 2026-10-07: "i'm not
// releasing the app for users, i'm building the software and in the process of
// figuring out the legality of it"). WHO is that line, in one place. Anthropic
// does not let an app route other people's requests through their Free, Pro or
// Max plans (https://code.claude.com/docs/en/legal-and-compliance); widening WHO
// is a question for the provider first, not an edit here.
//
// THE CHANNEL. The founder's page, with this chosen in Settings → Brain, holds
// open GET /api/own-brain (an event stream) and says which client to think
// with. A turn is one `job` event on the newest such stream; the page answers
// POST /api/own-brain/<id> from the same session. A job unanswered in time, or
// whose stream closes, fails like any upstream that did not answer — the orb
// says what is missing rather than inventing a line (src/brain.js).

import { randomBytes } from 'node:crypto';
import { toPrompt } from './local-claude-code.mjs';

export const WHO = (user) => !!user?.founder;
export const THINKERS = ['claude'];           // y3k-code/brain.mjs THINKERS: the clients with a verified no-tools mode
export const LEDGER_MODEL = 'own:claude-code';   // what the ledger calls a turn on the founder's own sign-in ($0)
const MAX_TEXT = 200000;
const PING_MS = 25000;

export function createRelay({ timeoutMs = 190000, now = () => Date.now() } = {}) {
  const channels = new Map();   // uid → [{ res, provider, at, jobs:Set }]
  const jobs = new Map();       // id → { uid, ch, finish }

  const live = (uid) => (channels.get(uid) || []).filter((c) => !c.closed);
  const send = (ch, ev, data) => { try { ch.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); return true; } catch { return false; } };

  // GET /api/own-brain — the founder's page, offering to think.
  function open(req, res, user, { provider } = {}) {
    if (!WHO(user)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not yours' })); return; }
    const p = THINKERS.includes(provider) ? provider : THINKERS[0];
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const ch = { res, provider: p, at: now(), jobs: new Set(), closed: false };
    channels.set(user.id, [...live(user.id), ch]);
    send(ch, 'ready', { provider: p });
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closing */ } }, PING_MS);
    ping.unref?.();
    const close = () => {
      if (ch.closed) return;
      ch.closed = true;
      clearInterval(ping);
      channels.set(user.id, live(user.id));
      if (!channels.get(user.id).length) channels.delete(user.id);
      // what this page was asked and never answered fails now, not at the timeout
      for (const id of ch.jobs) jobs.get(id)?.finish({ ok: false, status: 'gone', detail: 'the page that was thinking closed' });
    };
    req.on('close', close);
    res.on('close', close);
  }

  const connected = (user) => WHO(user) && live(user.id).length > 0;

  // One turn, through the newest page. → { ok, text, usage } | { ok: false, status, detail }
  function ask(user, { system, prompt, effort, signal } = {}) {
    if (!WHO(user)) return Promise.resolve({ ok: false, status: 'not-yours' });
    const chs = live(user.id);
    const ch = chs[chs.length - 1];
    if (!ch) return Promise.resolve({ ok: false, status: 'no-page', detail: 'no page of yours is open to think with' });
    if (signal?.aborted) return Promise.resolve({ ok: false, status: 'aborted' });
    const id = randomBytes(16).toString('hex');
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        jobs.delete(id);
        ch.jobs.delete(id);
        resolve(r);
      };
      const onAbort = () => { send(ch, 'cancel', { id }); finish({ ok: false, status: 'aborted' }); };
      const timer = setTimeout(() => { send(ch, 'cancel', { id }); finish({ ok: false, status: 'timeout' }); }, timeoutMs);
      timer.unref?.();
      signal?.addEventListener?.('abort', onAbort, { once: true });
      jobs.set(id, { uid: user.id, ch, finish });
      ch.jobs.add(id);
      if (!send(ch, 'job', { id, provider: ch.provider, system: String(system || ''), prompt: String(prompt || ''), ...(effort ? { effort } : {}) })) finish({ ok: false, status: 'gone' });
    });
  }

  // POST /api/own-brain/<id> — the page's answer. Only the session the job was
  // sent to may answer it. → true if it was waiting
  function answer(user, id, b = {}) {
    const j = jobs.get(String(id));
    if (!j || !user || j.uid !== user.id) return false;
    if (b.ok === true && typeof b.text === 'string') {
      const u = b.usage && typeof b.usage === 'object' ? b.usage : {};
      const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      j.finish({ ok: true, text: b.text.slice(0, MAX_TEXT), usage: { in: n(u.in), out: n(u.out), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) } });
    } else {
      j.finish({ ok: false, status: String(b.code || 'failed').slice(0, 40), detail: String(b.error || '').slice(0, 400) });
    }
    return true;
  }

  // The same shape as a BRAIN_PROVIDERS entry and local-claude-code's, bound
  // to one person — never registered by name, so no request body can reach it.
  function provider(user, { systemFor, replyFrom }) {
    const effortFor = (opts) => (opts?.noThink ? 'low' : 'medium');
    const run = (paint, opts, messages, image, signal) => ask(user, { system: systemFor(paint, opts), prompt: toPrompt(messages, image), effort: effortFor(opts), signal });
    return {
      detect: () => false,
      defaultModel: () => LEDGER_MODEL,
      async chat(_key, _model, messages, image, paint, opts) {
        const r = await run(paint, opts, messages, image, opts?.signal);
        if (!r.ok) return r;
        if (opts?.raw) return { ok: true, usage: r.usage, text: r.text };
        return { ok: true, usage: r.usage, ...replyFrom(r.text, paint) };
      },
      // whole, not streamed: the words arrive when the turn is done
      async chatStream(_key, _model, messages, onDelta, image, paint, signal, opts) {
        const r = await run(paint, opts, messages, image, signal);
        if (!r.ok) return r;
        if (r.text) onDelta?.(r.text);
        return { ok: true, usage: r.usage };
      },
    };
  }

  return { open, connected, ask, answer, provider, get pending() { return jobs.size; } };
}
