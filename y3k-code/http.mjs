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

import { createServer } from 'node:http';

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

function readBody(req, max) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { over = true; req.destroy(); resolve({ tooLarge: true }); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) return;
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve({ value: text ? JSON.parse(text) : {} }); } catch { resolve({ bad: true }); }
    });
    req.on('error', () => resolve({ bad: true }));
  });
}

const bearer = (req) => {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
};

// `origins`: exact origins allowed in addition to the site's own (dev only).
export function createHttp({ engine, pairing, origins = [], onPairCode, log = () => {} } = {}) {
  const allowed = new Set([...SITE_ORIGINS, ...origins]);
  let port = 0;
  let streams = 0;
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
    // 3 — Origin
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return send(res, 403, { error: 'This page may not use y3k Code.' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = url.pathname;
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
      return send(res, 200, { name: 'y3k-code', protocol: engine.hello().protocol, version: engine.hello().version, paired: !!(t && pairing.verify(t)) }, origin);
    }

    if (path === '/v1/pair' && req.method === 'POST') {
      const b = await readBody(req, SMALL_MAX);
      if (b.tooLarge) return send(res, 413, { error: 'too large' }, origin);
      if (b.bad || typeof b.value?.code !== 'string') return send(res, 400, { error: 'bad request' }, origin);
      const r = pairing.check(b.value.code);
      if (r === 'limited') return send(res, 429, { error: 'Too many tries — wait a minute.' }, origin);
      if (r === 'expired') { onPairCode?.(pairing.issueCode(), 'expired'); return send(res, 410, { error: 'That code expired. A new one is showing where y3k Code is running.' }, origin); }
      if (r === 'bad') { if (!pairing.code) onPairCode?.(pairing.issueCode(), 'voided'); return send(res, 403, { error: "That code isn't right." }, origin); }
      const agent = String(req.headers['user-agent'] || '').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
      const yes = await engine.ask('pair', { origin, agent: browserName(agent) });
      if (!yes) { onPairCode?.(pairing.issueCode(), 'declined'); return send(res, 403, { error: 'Not allowed on the computer.' }, origin); }
      const token = pairing.mint({ origin, agent: browserName(agent) });
      engine.audit.write('pair', { origin, agent });
      log(`Paired with ${origin}.`);
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

    if (path === '/v1/events' && req.method === 'GET') return events(req, res, url, origin);

    if (path === '/v1/revoke' && req.method === 'POST') {
      pairing.revokeAll();
      engine.audit.write('revoke', { origin });
      return send(res, 200, { ok: true }, origin);
    }

    return send(res, 404, { error: 'not found' }, origin);
  }

  // Server-sent events. The page reads this with fetch (so it can send its
  // token), passing the last seq and epoch it saw. A new epoch or a gap wider
  // than the ring gets a `reset`, after which the page reloads its sessions.
  function events(req, res, url, origin) {
    if (streams >= MAX_STREAMS) return send(res, 429, { error: 'too many streams' }, origin);
    streams++;
    res.writeHead(200, { ...baseHeaders(origin), 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const write = (e) => { res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`); };
    const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
    const epoch = url.searchParams.get('epoch');
    let backlog = epoch && epoch === engine.epoch ? engine.since(after) : after === 0 && !epoch ? engine.since(0) : null;
    if (backlog === null) {
      res.write(`event: reset\ndata: ${JSON.stringify({ epoch: engine.epoch, seq: engine.seq })}\n\n`);
      backlog = [];
    }
    let last = after;
    for (const e of backlog) { write(e); last = e.seq; }
    const unsub = engine.subscribe((e) => { if (e.seq > last) { write(e); last = e.seq; } });
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    ping.unref?.();
    let closed = false;
    const close = () => { if (closed) return; closed = true; streams--; clearInterval(ping); unsub(); };
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

  return { server, listen, close: () => new Promise((r) => server.close(() => r())), get port() { return port; } };
}

function browserName(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return ua.slice(0, 40) || 'a browser';
}

export const _test = { baseHeaders, browserName };
