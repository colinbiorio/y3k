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
// turn here draws no presence budget and is $0 on their ledger (server.mjs,
// OWN_PID); the site has no key or allowance of its own for it to touch.
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
//
// WHAT IT HOLDS, AND FOR HOW LONG. Every account may hold a stream open here,
// and accounts are free to make, so nothing a page does may make the server
// hold more than a little for it. A job is never larger than y3kode would take
// (MAX_SYSTEM, MAX_PROMPT: the prompt is cut to fit, oldest turns first); an
// account has at most MAX_JOBS turns out at once, as y3kode thinks at most two
// at a time; a stream whose page has stopped reading it is cut once
// MAX_BUFFERED is waiting unread, rather than buffer every job sent after; and
// a page is asked again whether its session still stands each time one is
// about to be chosen (valid, from the route), so a session cut off after the
// stream opened (an account reclaimed or deleted: auth.mjs sessionsFrom) stops
// receiving its owner's turns at once.

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
// What y3kode takes in one turn (y3k-code/protocol.mjs, 'brain.complete':
// system and prompt at most 200000 characters each, refused past that rather
// than cut). A job it would refuse is never written: the prompt is cut to fit
// (toPrompt), and a system prompt past it fails the turn here, at once.
export const MAX_SYSTEM = 200000;
export const MAX_PROMPT = 200000;
// One account's turns out at once. y3kode thinks two at a time and says 'busy'
// to a third (y3k-code/engine.mjs think), so a third here could only wait on a
// page to be refused: it fails at once instead, and nothing piles up behind a
// page for the server to hold.
export const MAX_JOBS = 2;
// What may wait unread on one page's stream. A page reads its stream as it
// arrives, so this stays near nothing; a stream opened and never read (a
// script with a session) would otherwise have every job sent to it, each up to
// MAX_SYSTEM + MAX_PROMPT, buffered in this server's memory for as long as the
// connection lasted. Past this the stream is cut, as a page that closed is.
export const MAX_BUFFERED = 2 * 1024 * 1024;

// The conversation as one prompt. y3kode runs the client in print mode, which
// takes one prompt, so earlier turns ride along as a transcript and the newest
// line comes last. The prompt never starts with the person's own words, so a
// message beginning with '/' is never read as a Claude Code command.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  return '';
}
const HEARD = 'The conversation so far:';
const NEWEST = 'Their newest message:';
const SILENCE = '(no words — respond to the silence as yourself)';
// Honest senses: this bridge carries text only. Say so rather than let the orb
// pretend it saw a frame it was never sent.
const UNSEEN = '(A camera frame came with this message, but this connection carries text only, so you cannot see it.)';
// At most `max` characters (MAX_PROMPT: what y3kode takes). The newest message
// always goes, cut to its newest end if it alone is too long; the turns before
// it ride along newest first while they fit, so a long conversation loses its
// oldest turns first.
export function toPrompt(messages, image, max = MAX_PROMPT) {
  const turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m?.role, text: textOf(m?.content) }))
    .filter((t) => t.text);
  const last = turns.length && turns[turns.length - 1].role === 'user' ? turns.pop() : null;
  const tail = image ? [UNSEEN, NEWEST] : [NEWEST];
  const fixed = tail.join('\n').length + 1;
  let newest = last ? last.text : SILENCE;
  if (fixed + newest.length > max) newest = newest.slice(newest.length - Math.max(0, max - fixed));
  const room = max - fixed - newest.length;
  const said = [];
  let used = HEARD.length + 2;   // the heading's line break, and the blank line after the transcript
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = `${turns[i].role === 'assistant' ? 'You' : 'Them'}: ${turns[i].text}`;
    if (used + line.length + 1 > room) break;
    used += line.length + 1;
    said.unshift(line);
  }
  return [...(said.length ? [HEARD, ...said, ''] : []), ...tail, newest].join('\n');
}

// What a page says about a turn it could not take is written to the server's
// log ([own], server.mjs), so it is made plain first: the code is one word of
// the kind y3kode uses ('signed-out', 'busy') or else 'failed', and the reason
// is one line with no control characters, so no page can write lines of its own
// into the log.
const CODE = /^[a-z][a-z-]{0,39}$/;
const oneLine = (s, n) => (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').slice(0, n);

export function createRelay({ timeoutMs = 190000, now = () => Date.now(), maxPages = MAX_PAGES, maxJobs = MAX_JOBS, maxBuffered = MAX_BUFFERED } = {}) {
  const channels = new Map();   // uid → [{ res, provider, at, jobs:Set, closed, valid, close }]
  const jobs = new Map();       // id → { uid, ch, finish }

  const held = (uid) => (channels.get(uid) || []).filter((c) => !c.closed);
  // This account's pages that may still think for it. Each is asked again
  // whether its session stands (valid: the route's check of the stream's own
  // cookie) whenever a page is about to be chosen, and one whose session was
  // cut off since it opened is let go now, its turns with it.
  const live = (uid) => {
    for (const c of held(uid)) {
      let ok = false;
      try { ok = c.valid() === true; } catch { /* a check that throws is a no */ }
      if (!ok) { c.close(); try { c.res.end(); } catch { /* already gone */ } }
    }
    return held(uid);
  };
  const outFor = (uid) => held(uid).reduce((n, c) => n + c.jobs.size, 0);

  // Everything written to a page goes through here. A page that has stopped
  // reading is cut before one more byte is queued for it: its connection is
  // taken down (ending it politely would only queue behind what it is not
  // reading) and what it was asked fails 'gone'. → whether it was written
  const write = (ch, text) => {
    if (ch.closed) return false;
    if ((ch.res.writableLength || 0) > maxBuffered) {
      ch.close();
      try { ch.res.destroy(); } catch { /* already gone */ }
      return false;
    }
    try { ch.res.write(text); return true; } catch { return false; }
  };
  const send = (ch, ev, data) => write(ch, `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);

  // GET /api/own-brain — a person's page, offering to think for their own presence.
  // valid() says whether the session that opened it still stands (server.mjs);
  // without one, it stands as long as the stream does.
  function open(req, res, user, { provider, valid } = {}) {
    if (!WHO(user)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not yours' })); return; }
    const p = THINKERS.includes(provider) ? provider : THINKERS[0];
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const ch = { res, provider: p, at: now(), jobs: new Set(), closed: false, valid: typeof valid === 'function' ? valid : () => true };
    let ping = null;
    const close = ch.close = () => {
      if (ch.closed) return;
      ch.closed = true;
      clearInterval(ping);
      const rest = held(user.id);
      if (rest.length) channels.set(user.id, rest); else channels.delete(user.id);
      // what this page was asked and never answered fails now, not at the timeout
      for (const id of ch.jobs) jobs.get(id)?.finish({ ok: false, status: 'gone', detail: 'the page that was thinking closed' });
    };
    // the oldest of this account's pages give way to the newest, and are told
    // so: a stream that just ends is one an EventSource opens again, and that
    // page, back as the newest, would let the next oldest go, round and round
    const before = live(user.id);
    for (const old of before.slice(0, Math.max(0, before.length - maxPages + 1))) {
      send(old, 'replaced', {});
      old.close();
      try { old.res.end(); } catch { /* already gone */ }
    }
    channels.set(user.id, [...held(user.id), ch]);
    req.on('close', close);
    res.on('close', close);
    ping = setInterval(() => write(ch, ': ping\n\n'), PING_MS);
    ping.unref?.();
    send(ch, 'ready', { provider: p });
  }

  const connected = (user) => WHO(user) && live(user.id).length > 0;

  // One turn, through the newest page of this person's. → { ok, text, usage } | { ok: false, status, detail }
  function ask(user, { system, prompt, effort, signal } = {}) {
    if (!WHO(user)) return Promise.resolve({ ok: false, status: 'not-yours' });
    const chs = live(user.id);
    const ch = chs[chs.length - 1];
    if (!ch) return Promise.resolve({ ok: false, status: 'no-page', detail: 'no page of yours is open to think with' });
    if (signal?.aborted) return Promise.resolve({ ok: false, status: 'aborted' });
    const sys = String(system || ''), said = String(prompt || '');
    if (sys.length > MAX_SYSTEM || said.length > MAX_PROMPT) return Promise.resolve({ ok: false, status: 'too-large', detail: 'more than y3kode takes in one turn' });
    if (outFor(user.id) >= maxJobs) return Promise.resolve({ ok: false, status: 'busy', detail: 'your presence is already thinking as much as y3kode does at once' });
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
      // settled first, then the page told: a page cut off for not reading
      // while being told fails the rest of what it holds, not this one twice
      const onAbort = () => { finish({ ok: false, status: 'aborted' }); send(ch, 'cancel', { id }); };
      const timer = setTimeout(() => { finish({ ok: false, status: 'timeout' }); send(ch, 'cancel', { id }); }, timeoutMs);
      timer.unref?.();
      signal?.addEventListener?.('abort', onAbort, { once: true });
      jobs.set(id, { uid: user.id, ch, finish });
      ch.jobs.add(id);
      if (!send(ch, 'job', { id, provider: ch.provider, system: sys, prompt: said, ...(effort ? { effort } : {}) })) finish({ ok: false, status: 'gone' });
    });
  }

  // POST /api/own-brain/<id> — the page's answer. Only the account the job was
  // sent to may answer it. → true if it was waiting
  function answer(user, id, b) {
    const j = jobs.get(String(id));
    if (!j || !WHO(user) || j.uid !== user.id) return false;
    if (!b || typeof b !== 'object') b = {};
    if (b.ok === true && typeof b.text === 'string') {
      const u = b.usage && typeof b.usage === 'object' ? b.usage : {};
      const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      j.finish({ ok: true, text: b.text.slice(0, MAX_TEXT), usage: { in: n(u.in), out: n(u.out), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) } });
    } else {
      j.finish({ ok: false, status: typeof b.code === 'string' && CODE.test(b.code) ? b.code : 'failed', detail: oneLine(b.error, 400) });
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
