// How the y3k Code screen reaches the engine on the person's own computer.
//
//  - In the y3k desktop app: the local bridge (window.y3kCode, from the preload),
//    no network at all.
//  - In a browser: the companion (`y3k-code`) on http://127.0.0.1:<port>, paired
//    once with a code the person sees on their computer (REACH.md §5).
//
// Either way the screen gets the same two things: `cmd(obj)` → a promise of the
// engine's answer, and a stream of numbered events that resumes where it left
// off after a drop. Nothing here ever talks to yearthreethousand.com.

export const PORTS = [47821, 47822, 47823, 47824, 47825, 47826, 47827, 47828, 47829, 47830];
const PAIR_KEY = 'y3k-code:pair';        // { port, token } — this browser's pairing
const PENDING_KEY = 'y3k-code:pending';  // { port, code, at } — from the link the engine opened
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  sget(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
  sset(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// The engine opens yearthreethousand.com/#y3k-code=<port>-<code>. A fragment is
// never sent to any server; this takes it out of the address bar at once so it
// is not left in history or a screenshot, and keeps it for the Code screen.
export function takePairingFromHash(loc = location, hist = history) {
  const m = /(?:^#|&)y3k-code=(\d{2,5})-([A-Za-z0-9]{8})(?:&|$)/.exec(loc.hash || '');
  if (!m) return null;
  try { hist.replaceState(null, '', loc.pathname + loc.search); } catch { /* ignore */ }
  const port = Number(m[1]);
  const code = cleanCode(m[2]);
  if (!(port > 1023 && port < 65536) || !CODE_RE.test(code)) return null;
  const p = { port, code, at: Date.now() };
  store.sset(PENDING_KEY, p);
  return p;
}

export function pendingPairing() {
  const p = store.sget(PENDING_KEY);
  if (!p || Date.now() - p.at > 5 * 60 * 1000) { store.sset(PENDING_KEY, null); return null; }
  return p;
}
export const clearPending = () => store.sset(PENDING_KEY, null);
export const savedPairing = () => store.get(PAIR_KEY);
export const forgetPairing = () => store.set(PAIR_KEY, null);

const base = (port) => `http://127.0.0.1:${port}`;

// Is an engine answering on this port? Only ever called after the person asks
// (a click), never on page load: probing localhost unasked is what trips the
// browser's local-network prompt for every visitor.
export async function probe(port, { timeoutMs = 1500 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base(port)}/v1/hello`, { signal: ac.signal, cache: 'no-store', credentials: 'omit' });
    const j = await r.json();
    return j?.name === 'y3k-code' ? { port, ...j } : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function findEngine() {
  const found = await Promise.all(PORTS.map((p) => probe(p)));
  return found.find(Boolean) || null;
}

// Trade the code for a token. The engine asks the person on their computer
// first, so this can wait as long as they take to answer.
export async function pair(port, code) {
  const c = cleanCode(code);
  if (!CODE_RE.test(c)) return { error: 'The code is 8 letters and numbers.' };
  try {
    const r = await fetch(`${base(port)}/v1/pair`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }), credentials: 'omit', cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return { error: j.error || `The engine said no (${r.status}).` };
    store.set(PAIR_KEY, { port, token: j.token });
    clearPending();
    return { ok: true, port, token: j.token };
  } catch {
    return { error: 'Could not reach y3k Code on this computer. Is it running?' };
  }
}

// --- the companion ------------------------------------------------------------
export function createCompanion({ port, token, onEvent, onStatus, onReset }) {
  const auth = { authorization: `Bearer ${token}` };
  let closed = false;
  let ac = null;
  let epoch = null;
  let seq = 0;
  let attempt = 0;
  let status = 'connecting';
  const setStatus = (s, detail) => { if (s !== status || detail) { status = s; onStatus?.(s, detail); } };

  async function cmd(obj) {
    try {
      const r = await fetch(`${base(port)}/v1/cmd`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(obj), credentials: 'omit', cache: 'no-store',
      });
      if (r.status === 401) { setStatus('unpaired'); return { ok: false, error: 'This browser is no longer paired.', code: 'unpaired' }; }
      return await r.json();
    } catch {
      return { ok: false, error: 'y3k Code on this computer is not answering.', code: 'offline' };
    }
  }

  // Server-sent events over fetch, so the token rides in a header instead of the URL.
  async function loop() {
    while (!closed) {
      ac = new AbortController();
      try {
        const q = new URLSearchParams({ after: String(seq) });
        if (epoch) q.set('epoch', epoch);
        const r = await fetch(`${base(port)}/v1/events?${q}`, { headers: auth, signal: ac.signal, credentials: 'omit', cache: 'no-store' });
        if (r.status === 401) { setStatus('unpaired'); return; }
        if (!r.ok || !r.body) throw new Error(String(r.status));
        attempt = 0;
        setStatus('connected');
        const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (block.startsWith(':')) continue;
            let ev = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) ev = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            if (!data) continue;
            let obj;
            try { obj = JSON.parse(data); } catch { continue; }
            if (ev === 'reset') { epoch = obj.epoch; seq = obj.seq; onReset?.(obj); continue; }
            if (obj.epoch && obj.epoch !== epoch) epoch = obj.epoch;
            if (obj.seq <= seq) continue; // already seen
            seq = obj.seq;
            onEvent(obj);
          }
        }
      } catch { /* dropped — reconnect below */ }
      if (closed) return;
      setStatus('reconnecting');
      const wait = Math.min(10000, 400 * 2 ** attempt++);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  loop();

  return {
    kind: 'companion', cmd,
    close() { closed = true; ac?.abort(); },
    get status() { return status; },
    async revoke() { try { await fetch(`${base(port)}/v1/revoke`, { method: 'POST', headers: auth, credentials: 'omit' }); } catch { /* offline */ } forgetPairing(); },
  };
}

// --- the desktop app's local bridge -------------------------------------------
export function createDesktop({ onEvent, onStatus, onReset }) {
  const bridge = window.y3kCode;
  let seq = 0;
  let epoch = null;
  const take = (e) => {
    if (e.epoch !== epoch) { if (epoch) onReset?.({ epoch: e.epoch, seq: e.seq }); epoch = e.epoch; }
    if (e.seq <= seq) return;
    seq = e.seq;
    onEvent(e);
  };
  const off = bridge.onEvent(take);
  bridge.since(0).then((events) => { for (const e of events || []) take(e); onStatus?.('connected'); }).catch(() => onStatus?.('offline'));
  return {
    kind: 'desktop', cmd: (obj) => bridge.cmd(obj),
    close() { off?.(); },
    get status() { return 'connected'; },
    async revoke() {},
  };
}

export const hasDesktopBridge = () => typeof window !== 'undefined' && !!window.y3kCode?.cmd;
