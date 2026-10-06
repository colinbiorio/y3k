// The companion's door: a tiny HTTP server on 127.0.0.1 that only
// yearthreethousand.com can use, and only after the person has said yes on this
// machine (REACH.md §5, CODE.md line 7).
//
// Every request passes, in order:
//   1. the socket is loopback                       (else dropped)
//   2. Host is exactly 127.0.0.1:<port> or localhost:<port>   (421 — DNS rebinding)
//   3. Origin is exactly an allowed origin          (403 — every other page)
//   4. preflights answered, Private Network Access allowed, no cookies ever
//   5. a paired token, except /v1/hello and /v1/pair (401)
//   6. bodies are JSON and small                    (413/400)
// and every response says: no-store, nosniff, and never frame me.
//
// One door opens between 2 and 3: the approval page, /approve, where the
// person answers the engine's questions in a window instead of the terminal
// (consent.mjs, createConsentDesk). It is for the person at this machine, so it
// is shaped the other way round from everything else here:
//   - GET /approve is a top-level page in their own browser, which carries no
//     Origin; it needs the right Host and nothing else, and changes nothing
//   - it runs nothing from anywhere (CSP default-src 'none'; its one style and
//     one script allowed by hash) and cannot be framed (frame-ancestors 'none',
//     X-Frame-Options) — so no other page can dress it up or click it
//   - an answer is POST /approve/<id> carrying that question's 128-bit nonce,
//     from Origin exactly http://127.0.0.1:<port> or http://localhost:<port>:
//     only someone who could READ the page can answer, and other sites cannot
//   - its Allow button wakes ~700ms after the window has focus, and sleeps
//     again when it loses it: a site that pops this window open under a
//     person's double-click gets the second click on a button that is off
//
// And pairing can come pre-approved: `y3k-code --pair <CODE>` (pair.mjs) — the
// person typed the command, so /v1/pair with that code needs no second yes.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { title as consentTitle } from './consent.mjs';

export const SITE_ORIGINS = ['https://yearthreethousand.com', 'https://www.yearthreethousand.com'];
export const PORTS = [47821, 47822, 47823, 47824, 47825, 47826, 47827, 47828, 47829, 47830];
const CMD_MAX = 32 * 1024 * 1024;
const SMALL_MAX = 4096;
const MAX_STREAMS = 8;
const PING_MS = 15000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function baseHeaders(origin) {
  const h = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    vary: 'Origin',
  };
  if (origin) h['access-control-allow-origin'] = origin;
  return h;
}

function readRaw(req, max) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { over = true; req.destroy(); resolve({ tooLarge: true }); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!over) resolve({ text: Buffer.concat(chunks).toString('utf8') }); });
    req.on('error', () => resolve({ bad: true }));
  });
}

async function readBody(req, max) {
  const r = await readRaw(req, max);
  if (r.tooLarge || r.bad) return r;
  try { return { value: r.text ? JSON.parse(r.text) : {} }; } catch { return { bad: true }; }
}

// --- the approval page ----------------------------------------------------------
// The room's own near-black and greys (desktop/main.cjs's offline card), so the
// window reads as part of y3k rather than as a raw local server.
const APPROVE_CSS = `
:root{color-scheme:dark}
html,body{margin:0;background:#04030a;color:#8e96a6;font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:2.4rem 1.25rem 3rem}
.k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6f7686;margin:0 0 1.4rem}
h1{color:#dfe4ee;font-weight:500;font-size:20px;margin:0 0 1.2rem}
.ask{border:1px solid #20232d;border-radius:14px;padding:1.1rem 1.2rem 1.2rem;margin:0 0 1rem;background:#0a0b11}
.ask h2{color:#dfe4ee;font-weight:500;font-size:16px;margin:0 0 .5rem}
.what{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1.1rem}
.row{display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap}
button{font:inherit;border-radius:999px;padding:.55rem 1.3rem;cursor:pointer;border:1px solid #3a3f4d;background:transparent;color:#dfe4ee}
button.yes{background:#dfe4ee;color:#04030a;border-color:#dfe4ee}
button:disabled{opacity:.35;cursor:default}
.done{color:#dfe4ee;margin:0 0 1rem}
.fine{font-size:13px;color:#6f7686;margin-top:1.6rem}
`;
const APPROVE_JS = `
(function () {
  var yes = document.querySelectorAll('button[data-allow]');
  var t = 0;
  function set(on) { for (var i = 0; i < yes.length; i++) yes[i].disabled = !on; }
  function arm() {
    clearTimeout(t); set(false);
    if (document.hidden || !document.hasFocus()) return;
    t = setTimeout(function () { set(true); }, 700);
  }
  window.addEventListener('focus', arm);
  window.addEventListener('blur', function () { clearTimeout(t); set(false); });
  document.addEventListener('visibilitychange', arm);
  arm();
  if (document.body.getAttribute('data-close')) setTimeout(function () { window.close(); }, 1200);
})();
`;
const cspHash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const APPROVE_CSP = `default-src 'none'; style-src ${cspHash(APPROVE_CSS)}; script-src ${cspHash(APPROVE_JS)}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function approvePage(asks, done) {
  const said = { allow: 'Allowed.', deny: 'Not allowed.', gone: 'That question was already answered, or ran out of time.' }[done] || '';
  const close = said && !asks.length;
  const cards = asks.map((q) => `
<form class="ask" method="post" action="/approve/${esc(q.id)}">
<h2>${esc(q.title || consentTitle(q.kind))}</h2>
<p class="what">${esc(q.text)}</p>
<input type="hidden" name="nonce" value="${esc(q.nonce)}">
<div class="row"><button type="submit" name="answer" value="deny">Don’t allow</button><button type="submit" name="answer" value="allow" class="yes" data-allow disabled>Allow</button></div>
</form>`).join('');
  // Nothing waiting: look again every 2 seconds, so a window opened a moment
  // early still shows the question when it arrives. Never while a question is
  // up — a reload under the cursor would re-arm the button mid-read.
  const refresh = asks.length ? '' : `<meta http-equiv="refresh" content="${said ? '3;url=/approve' : '2'}">`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>y3kode — answer on this computer</title>
<style>${APPROVE_CSS}</style></head>
<body${close ? ' data-close="1"' : ''}><main>
<p class="k">y3kode · on this computer</p>
${said ? `<p class="done">${esc(said)}</p>` : ''}
<h1>${asks.length ? (asks.length === 1 ? 'y3kode is asking' : `y3kode is asking ${asks.length} things`) : close ? 'Nothing else is waiting. You can close this window.' : 'Nothing is waiting for an answer right now.'}</h1>
${cards}
<p class="fine">Only you, at this computer, can answer these. yearthreethousand.com can ask; it cannot say yes. The same questions are in the window where y3kode is running — answer in either place.</p>
</main><script>${APPROVE_JS}</script></body></html>`;
}

const bearer = (req) => {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
};

// `origins`: exact origins allowed in addition to the site's own (dev only).
// `desk`: the consent desk whose questions the approval page lists and answers
// (consent.mjs); without one there is no approval page. `onPaired`: told
// {origin, agent, preapproved} each time a browser pairs. `pingMs`: how often an
// open event stream is pinged and its token checked again (tests shorten it).
export function createHttp({ engine, pairing, origins = [], desk = null, onPairCode, onPaired, log = () => {}, pingMs = PING_MS } = {}) {
  const allowed = new Set([...SITE_ORIGINS, ...origins]);
  let port = 0;
  let streams = 0;
  const live = new Set(); // each open event stream's end()
  const hosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  function send(res, status, body, origin, extra = {}) {
    const text = body == null ? '' : JSON.stringify(body);
    res.writeHead(status, { ...baseHeaders(origin), ...(body == null ? {} : { 'content-type': 'application/json; charset=utf-8' }), ...extra });
    res.end(text);
  }

  async function onRequest(req, res) {
    // 1 — loopback only (the listener is bound to 127.0.0.1; this is belt and braces)
    if (!LOOPBACK.has(req.socket.remoteAddress)) { req.socket.destroy(); return; }
    // 2 — Host
    if (!hosts().has(String(req.headers.host || '').toLowerCase())) return send(res, 421, { error: 'wrong host' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = url.pathname;
    // the approval page (see the top of this file) — before the Origin check,
    // because a page the person opens carries no Origin
    if (desk && (path === '/approve' || path.startsWith('/approve/'))) return approve(req, res, url);
    // the orb's MCP door (orb.mjs) — for the coding clients this engine
    // started, each with its session's token; never for a page
    const mcp = /^\/mcp\/([0-9a-f]{16})$/.exec(path);
    if (mcp && engine.orb) return orbDoor(engine, req, res, mcp[1]);
    // 3 — Origin
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return send(res, 403, { error: 'This page may not use y3kode.' });
    // 4 — preflight
    if (req.method === 'OPTIONS') {
      const h = {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'authorization, content-type, last-event-id',
        'access-control-max-age': '600',
      };
      if (req.headers['access-control-request-private-network'] === 'true') h['access-control-allow-private-network'] = 'true';
      return send(res, 204, null, origin, h);
    }

    if (path === '/v1/hello' && req.method === 'GET') {
      // Enough for the page to know an engine is here and whether its token still works.
      const t = bearer(req);
      // `preapproved`: this engine was started with `--pair` and is still
      // waiting for that page — so a page watching several ports can tell it
      // from another engine that happens to be running too.
      return send(res, 200, { name: 'y3k-code', protocol: engine.hello().protocol, version: engine.hello().version, paired: !!(t && pairing.verify(t)), preapproved: !!pairing.preapproved }, origin);
    }

    if (path === '/v1/pair' && req.method === 'POST') {
      const b = await readBody(req, SMALL_MAX);
      if (b.tooLarge) return send(res, 413, { error: 'too large' }, origin);
      if (b.bad || typeof b.value?.code !== 'string') return send(res, 400, { error: 'bad request' }, origin);
      const r = pairing.check(b.value.code);
      if (r === 'limited') return send(res, 429, { error: 'Too many tries — wait a minute.' }, origin);
      if (r === 'expired') { onPairCode?.(pairing.issueCode(), 'expired'); return send(res, 410, { error: 'That code expired. A new one is showing where y3kode is running.' }, origin); }
      if (r === 'bad' || r === 'voided') { if (r === 'voided') onPairCode?.(pairing.issueCode(), 'voided'); return send(res, 403, { error: "That code isn't right." }, origin); }
      const agent = String(req.headers['user-agent'] || '').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
      // A pre-approved code: the person already said yes by running the command
      // that carried it. Anything else is asked on the machine.
      const preapproved = r === 'preapproved';
      const yes = preapproved || await engine.ask('pair', { origin, agent: browserName(agent) });
      if (!yes) { onPairCode?.(pairing.issueCode(), 'declined'); return send(res, 403, { error: 'Not allowed on the computer.' }, origin); }
      const token = pairing.mint({ origin, agent: browserName(agent), preapproved });
      engine.audit.write('pair', { origin, agent, preapproved });
      if (onPaired) onPaired({ origin, agent: browserName(agent), preapproved }); else log(`Paired with ${origin}.`);
      return send(res, 200, { token, epoch: engine.epoch }, origin);
    }

    // 5 — everything else needs a token
    const token = bearer(req);
    if (!token || !pairing.verify(token)) return send(res, 401, { error: 'not paired' }, origin);

    if (path === '/v1/cmd' && req.method === 'POST') {
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json only' }, origin);
      const b = await readBody(req, CMD_MAX);
      if (b.tooLarge) return send(res, 413, { error: 'too large' }, origin);
      if (b.bad) return send(res, 400, { error: 'bad json' }, origin);
      const r = await engine.handle(b.value, { via: 'http', origin });
      return send(res, 200, r, origin);
    }

    if (path === '/v1/events' && req.method === 'GET') return events(req, res, url, origin, token);

    if (path === '/v1/revoke' && req.method === 'POST') {
      pairing.revokeAll();
      engine.audit.write('revoke', { origin });
      for (const end of [...live]) end();
      return send(res, 200, { ok: true }, origin);
    }

    return send(res, 404, { error: 'not found' }, origin);
  }

  // GET /approve and POST /approve/<id>. The rules are at the top of this file.
  async function approve(req, res, url) {
    const page = (status, html, extra = {}) => {
      res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': APPROVE_CSP,
        'x-frame-options': 'DENY',
        'cross-origin-resource-policy': 'same-origin',
        // NOT no-referrer (every other answer here): under no-referrer a
        // browser sends `Origin: null` with a form's POST, and the answer
        // could not be told from one posted by a sandboxed frame anywhere.
        'referrer-policy': 'same-origin',
        ...extra,
      });
      res.end(req.method === 'HEAD' ? '' : html);
    };
    const refuse = (status, why) => page(status, `<!doctype html><meta charset="utf-8"><title>y3kode</title><p>${esc(why)}</p>`);
    if (url.pathname === '/approve') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return refuse(405, 'Not here.');
      const done = url.searchParams.get('done');
      return page(200, approvePage(desk.pending(), done));
    }
    const m = /^\/approve\/([A-Za-z0-9]{1,24})$/.exec(url.pathname);
    if (!m || req.method !== 'POST') return refuse(404, 'Not here.');
    const origin = req.headers.origin;
    if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return refuse(403, 'Answer from the y3kode window on this computer.');
    if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers['content-type'] || '')) return refuse(415, 'Not a form.');
    const b = await readRaw(req, SMALL_MAX);
    if (b.tooLarge || b.bad) return refuse(400, 'Not a form.');
    const f = new URLSearchParams(b.text);
    const ans = f.get('answer');
    if (ans !== 'allow' && ans !== 'deny') return refuse(400, 'Allow or don’t allow.');
    const r = desk.answer(m[1], f.get('nonce'), ans === 'allow');
    if (r === 'bad') return refuse(403, 'That answer is not from this window.');
    if (r === 'ok') engine.audit.write('consent.answer', { id: m[1], via: 'approval page', allowed: ans === 'allow' });
    // Post, then redirect, then get: a reload of the result can never answer twice.
    res.writeHead(303, { location: `/approve?done=${r === 'ok' ? ans : 'gone'}`, 'cache-control': 'no-store', 'referrer-policy': 'same-origin' });
    return res.end();
  }

  // Server-sent events. The page reads this with fetch (so it can send its
  // token), passing the last seq and epoch it saw. A new epoch or a gap wider
  // than the ring gets a `reset`, after which the page reloads its sessions.
  //
  // A stream is only as good as its token. Revoking used to stop commands but
  // not the stream: a browser that had been disconnected — from the page, or by
  // `y3k-code revoke` in another terminal (store.mjs now sees that file change)
  // — went on receiving every session's output until it happened to reconnect.
  // Now a revoke from the page ends every open stream at once, and each ping
  // (every 15s) checks the token again, so a revoke from anywhere else ends it
  // within one; the page's reconnect then gets 401 and says it was unpaired.
  function events(req, res, url, origin, token) {
    if (streams >= MAX_STREAMS) return send(res, 429, { error: 'too many streams' }, origin);
    streams++;
    res.writeHead(200, { ...baseHeaders(origin), 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const write = (e) => { res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`); };
    const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
    const epoch = url.searchParams.get('epoch');
    let backlog = epoch && epoch === engine.epoch ? engine.since(after) : after === 0 && !epoch ? engine.since(0) : null;
    let last = after;
    // After a reset the page counts from the seq it was given, so the stream
    // must too: a page from an older engine sends its old (often larger) seq,
    // and every new event below it would be dropped.
    if (backlog === null) {
      res.write(`event: reset\ndata: ${JSON.stringify({ epoch: engine.epoch, seq: engine.seq })}\n\n`);
      backlog = [];
      last = engine.seq;
    }
    for (const e of backlog) { write(e); last = e.seq; }
    const unsub = engine.subscribe((e) => { if (e.seq > last) { write(e); last = e.seq; } });
    let closed = false;
    const close = () => { if (closed) return; closed = true; streams--; clearInterval(ping); unsub(); live.delete(end); };
    const end = () => { close(); try { res.end(); } catch { /* already gone */ } };
    const ping = setInterval(() => { if (!pairing.verify(token)) end(); else res.write(': ping\n\n'); }, pingMs);
    ping.unref?.();
    live.add(end);
    req.on('close', close);
    res.on('close', close);
  }

  const server = createServer((req, res) => {
    onRequest(req, res).catch(() => { try { send(res, 500, { error: 'engine error' }); } catch { /* closed */ } });
  });
  server.headersTimeout = 20000;
  server.requestTimeout = 0; // the event stream is long-lived

  function listenOn(p) {
    return new Promise((resolve, reject) => {
      const onErr = (err) => { server.off('listening', onOk); reject(err); };
      const onOk = () => { server.off('error', onErr); resolve(server.address().port); };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(p, '127.0.0.1');
    });
  }

  // The first free port of the known ten (so the page can find it), else any.
  async function listen(preferred) {
    const tries = preferred != null ? [preferred] : [...PORTS, 0];
    for (const p of tries) {
      try { port = await listenOn(p); return port; } catch (err) { if (err.code !== 'EADDRINUSE' || preferred != null) throw err; }
    }
    throw new Error('no free port');
  }

  // Closing ends the open event streams first: a page that is still connected
  // would otherwise hold the door open for as long as it stays.
  function close() {
    return new Promise((r) => {
      for (const end of [...live]) end();
      server.close(() => r());
      setImmediate(() => server.closeIdleConnections?.());
    });
  }

  return { server, listen, close, get port() { return port; } };
}

// POST /mcp/<sid>: one JSON-RPC message (or a batch) from a coding client,
// answered with JSON. No Origin (every browser page sends one, no MCP client
// does), the session's own token, JSON, small. No event stream (GET is 405,
// which tells an MCP client there is none) and no MCP session to end.
export async function orbDoor(engine, req, res, sid) {
  const out = (status, body, extra = {}) => {
    res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(body == null ? {} : { 'content-type': 'application/json; charset=utf-8' }), ...extra });
    res.end(body == null ? '' : JSON.stringify(body));
  };
  if (req.headers.origin) return out(403, { error: 'Not for pages.' });
  if (!engine.orb.allowed(sid, req.headers.authorization)) return out(401, { error: 'unauthorized' });
  if (req.method !== 'POST') return out(405, null, { allow: 'POST' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return out(415, { error: 'json only' });
  const b = await readBody(req, 64 * 1024);
  if (b.tooLarge) return out(413, { error: 'too large' });
  if (b.bad) return out(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  const r = await engine.orb.rpc(sid, b.value);
  return r == null ? out(202, null) : out(200, r);
}

// The desktop app's engine has no page door (it speaks to its window over IPC),
// so the orb's door is all it listens on: loopback, a port of its own choosing,
// the right Host, /mcp/<sid> and nothing else.
export function createOrbServer({ engine }) {
  let port = 0;
  const server = createServer((req, res) => {
    const deny = (status) => { res.writeHead(status, { 'cache-control': 'no-store' }); res.end(); };
    if (!LOOPBACK.has(req.socket.remoteAddress)) { req.socket.destroy(); return; }
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return deny(421);
    const m = /^\/mcp\/([0-9a-f]{16})$/.exec(new URL(req.url, 'http://127.0.0.1').pathname);
    if (!m) return deny(404);
    orbDoor(engine, req, res, m[1]).catch(() => { try { deny(500); } catch { /* closed */ } });
  });
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;
  return {
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; server.unref(); resolve(port); }); }),
    close: () => new Promise((r) => server.close(() => r())),
    get port() { return port; },
  };
}

function browserName(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return ua.slice(0, 40) || 'a browser';
}

export const _test = { baseHeaders, browserName, approvePage, APPROVE_CSP, APPROVE_CSS, APPROVE_JS };
