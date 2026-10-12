// YOUR PRESENCE, ON YOUR OWN SIGN-IN, FROM THE SITE. A turn of your presence's
// thinking — a conversation, a game, one of its own hours — is handed to your
// own open page, which hands it to y3kode on your own computer
// (y3k-code/brain.mjs), which runs your own signed-in Claude Code once, with no
// tools, and the words come back the same way. The server never touches a
// credential and never reaches the computer: the page in the person's own
// browser is the only bridge (CODE.md, line 2).
//
// EACH PERSON, ON THEIR OWN. Open to every signed-in account since 2026-10-12,
// on Colin's word after legal advice (WHO, below, is that line in one place).
// A turn goes only to a page of the person whose presence it is, and only the
// session it was sent to may answer it: nobody's turn ever reaches anyone
// else's page, computer or plan. The site never pays for, resells or pools
// anyone's usage, and the only limit on a turn is the person's own plan: when
// it is spent, their presence waits for it, the founder's like anyone's. So a
// turn here draws no presence budget, is not counted on the site-wide breaker
// that guards the site's keys, and never touches the house allowance
// (server.mjs, OWN_PID).
// Anthropic's terms on plan credentials:
// https://code.claude.com/docs/en/legal-and-compliance.
//
// There used to be a second way for the founder alone: the site running on
// their own machine spawned `claude -p` itself (local-claude-code.mjs,
// Y3K_LOCAL_CLAUDE_CODE=1). It is gone (2026-10-12); the founder thinks through
// this path like everyone.
//
// THE CHANNEL. The person's page, with this chosen in Settings → Brain (or by
// default, once y3kode on that computer can think: src/own-brain.js), holds
// open GET /api/own-brain (an event stream) and says which client to think
// with. A turn is one `job` event on the newest such stream; the page answers
// POST /api/own-brain/<id> from the same account. A job unanswered in time, or
// whose stream closes, fails like any upstream that did not answer — the orb
// says what is missing rather than inventing a line (src/brain.js).

import { randomBytes } from 'node:crypto';

// Any signed-in account. The routes refuse a visitor with no session before
// this is asked; it is checked again here so nothing reaches a channel without one.
export const WHO = (user) => typeof user?.id === 'string' && user.id.length > 0;
export const THINKERS = ['claude'];           // y3k-code/brain.mjs THINKERS: the clients with a verified no-tools mode
export const LEDGER_MODEL = 'own:claude-code';   // what the ledger calls a turn on someone's own sign-in ($0)
const MAX_TEXT = 200000;
const PING_MS = 25000;
// Pages one account may hold open at once. Each is a held connection, and now
// that every account may offer one, a script with a session must not be able to
// pile them up: past this, the oldest is let go (a turn goes to the newest).
export const MAX_PAGES = 4;

// The conversation as one prompt. y3kode runs the client in print mode, which
// takes one prompt, so earlier turns ride along as a transcript and the newest
// line comes last. The prompt never starts with the person's own words, so a
// message beginning with '/' is never read as a Claude Code command.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  return '';
}
export function toPrompt(messages, image) {
  const turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m?.role, text: textOf(m?.content) }))
    .filter((t) => t.text);
  const last = turns.length && turns[turns.length - 1].role === 'user' ? turns.pop() : null;
  const lines = [];
  if (turns.length) {
    lines.push('The conversation so far:');
    for (const t of turns) lines.push(`${t.role === 'assistant' ? 'You' : 'Them'}: ${t.text}`);
    lines.push('');
  }
  // Honest senses: this bridge carries text only. Say so rather than let the orb
  // pretend it saw a frame it was never sent.
  if (image) lines.push('(A camera frame came with this message, but this connection carries text only, so you cannot see it.)');
  lines.push('Their newest message:');
  lines.push(last ? last.text : '(no words — respond to the silence as yourself)');
  return lines.join('\n');
}

export function createRelay({ timeoutMs = 190000, now = () => Date.now(), maxPages = MAX_PAGES } = {}) {
  const channels = new Map();   // uid → [{ res, provider, at, jobs:Set, close }]
  const jobs = new Map();       // id → { uid, ch, finish }

  const live = (uid) => (channels.get(uid) || []).filter((c) => !c.closed);
  const send = (ch, ev, data) => { try { ch.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); return true; } catch { return false; } };

  // GET /api/own-brain — a person's page, offering to think for their own presence.
  function open(req, res, user, { provider } = {}) {
    if (!WHO(user)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not yours' })); return; }
    const p = THINKERS.includes(provider) ? provider : THINKERS[0];
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const ch = { res, provider: p, at: now(), jobs: new Set(), closed: false };
    // the oldest of this account's pages give way to the newest, and are told
    // so: a stream that just ends is one an EventSource opens again, and that
    // page, back as the newest, would let the next oldest go, round and round
    const held = live(user.id);
    for (const old of held.slice(0, Math.max(0, held.length - maxPages + 1))) {
      send(old, 'replaced', {});
      old.close();
      try { old.res.end(); } catch { /* already gone */ }
    }
    channels.set(user.id, [...live(user.id), ch]);
    send(ch, 'ready', { provider: p });
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closing */ } }, PING_MS);
    ping.unref?.();
    const close = ch.close = () => {
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

  // One turn, through the newest page of this person's. → { ok, text, usage } | { ok: false, status, detail }
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

  // POST /api/own-brain/<id> — the page's answer. Only the account the job was
  // sent to may answer it. → true if it was waiting
  function answer(user, id, b = {}) {
    const j = jobs.get(String(id));
    if (!j || !WHO(user) || j.uid !== user.id) return false;
    if (b.ok === true && typeof b.text === 'string') {
      const u = b.usage && typeof b.usage === 'object' ? b.usage : {};
      const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      j.finish({ ok: true, text: b.text.slice(0, MAX_TEXT), usage: { in: n(u.in), out: n(u.out), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) } });
    } else {
      j.finish({ ok: false, status: String(b.code || 'failed').slice(0, 40), detail: String(b.error || '').slice(0, 400) });
    }
    return true;
  }

  // The same shape as a BRAIN_PROVIDERS entry, bound to one person — never
  // registered by name, so no request body can reach it. `systemFor` and
  // `replyFrom` come from server.mjs, where the prompts and the reply parser live.
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
