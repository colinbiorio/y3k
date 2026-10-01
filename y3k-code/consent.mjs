// Trust is granted on the machine, not in the page (CODE.md, line 7). Pairing a
// browser, trusting a folder, adding a connector and installing a tool are asked
// HERE — in a native dialog (desktop), or in the engine's own terminal or its
// own local approval page (companion) — so a compromised web page can ask but
// never say yes.
//
// A consent implementation is `ask(kind, detail, { id }) → Promise<boolean>`.
// The engine wraps it so every request and answer is announced
// (consent.pending / consent.resolved) and audited.

import { createInterface } from 'node:readline';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const KINDS = ['pair', 'folder.trust', 'mcp.add', 'provider.install', 'provider.login', 'cloud.attach'];

// The words the person reads. Kept here so the terminal, the native dialog and
// the audit log all say the same thing.
export function describe(kind, d = {}) {
  switch (kind) {
    case 'pair': return `${d.origin || 'A web page'}${d.agent ? ` (${d.agent})` : ''} wants to connect to y3kode on this computer. It will be able to start coding sessions in folders you trust.`;
    case 'folder.trust': return [`Trust ${d.path}?`, 'Coding sessions will be able to read and (with your permission) change files here.',
      ...(d.findings?.length ? ['This folder contains things that can run commands or change how coding tools behave:', ...d.findings.map((f) => `  • ${f.file}: ${f.detail}`)] : [])].join('\n');
    // What a connector is given matters as much as what it runs: an env like
    // NODE_OPTIONS or npm_config_registry changes what that command does. The
    // names only, never the values — they are often secrets, and this text
    // reaches the page (consent.pending) and the audit.
    case 'mcp.add': return [`Add the connector "${d.name}"? It ${d.command ? `runs: ${d.command} ${(d.args || []).join(' ')}` : `connects to ${d.url}`}`,
      ...(d.env?.length ? [`With these environment variables set: ${d.env.join(', ')}`] : []),
      ...(d.headers?.length ? [`With these headers: ${d.headers.join(', ')}`] : [])].join('\n');
    case 'provider.install': return `Install ${d.label}? This runs: ${d.command}`;
    case 'provider.login': return `Open ${d.label}'s own sign-in? This runs: ${d.command}`;
    case 'cloud.attach': return `Bring the cloud session ${d.ref} to ${d.cwd}?`;
    default: return `${kind}: ${JSON.stringify(d)}`;
  }
}

// What each question is, as a heading a person can take in at a glance (the
// approval page shows this above the full text from describe()).
export function title(kind) {
  return {
    pair: 'Connect a browser to y3kode?',
    'folder.trust': 'Trust this folder?',
    'mcp.add': 'Add a connector?',
    'provider.install': 'Install a coding tool?',
    'provider.login': 'Open a sign-in?',
    'cloud.attach': 'Bring a cloud session here?',
  }[kind] || 'Allow this?';
}

// For the companion: the questions waiting for the person, answerable in two
// places — the terminal the engine was started from, and its approval page
// (http.mjs, GET /approve) — and whichever answers first is the answer. That
// page exists because the terminal is the wrong place to depend on: the browser
// the engine just opened sits on top of it, a notice can scroll the prompt away,
// and with no terminal at all (stdin not a TTY) every question used to be
// refused on the spot. Now, with no terminal, the page is the way, for as long
// as the question lasts.
//
//  - one question at a time on the terminal; one the page already answered is
//    skipped, and one the page answers while the terminal is asking closes the
//    prompt and says so
//  - each question carries a 128-bit nonce the page must send back with its
//    answer, so an answer can only come from someone who could READ the page
//    (the page itself; other sites cannot read a 127.0.0.1 page)
//  - anything but y/yes is no; no answer in `timeoutMs` is no
//  - with no terminal AND no page to point at, it refuses at once, as before
export function createConsentDesk({ input = process.stdin, output = process.stdout, timeoutMs = 120000, approveUrl = () => null } = {}) {
  const open = new Map(); // id → question
  let chain = Promise.resolve();
  let n = 0;

  function ask(kind, detail, meta = {}) {
    const text = describe(kind, detail);
    const url = approveUrl();
    const tty = !!input.isTTY;
    if (!tty && !url) { output.write(`\n[y3k-code] Refused (no terminal to ask on): ${text}\n`); return Promise.resolve(false); }
    let id = String(meta.id ?? '');
    if (!/^[A-Za-z0-9]{1,24}$/.test(id) || open.has(id)) id = `q${++n}`;
    return new Promise((resolve) => {
      const q = { id, kind, text, nonce: randomBytes(16).toString('hex'), at: Date.now(), settled: false, onSettle: null };
      // Not unref'd: a question someone is waiting on keeps the process up
      // until it is answered or runs out.
      const timer = setTimeout(() => { output.write('\n(no answer — refused)\n'); q.settle(false, 'timeout'); }, timeoutMs);
      q.settle = (allowed, via) => {
        if (q.settled) return false;
        q.settled = true;
        clearTimeout(timer);
        open.delete(id);
        try { q.onSettle?.(allowed, via); } catch { /* the terminal went away */ }
        resolve(allowed);
        return true;
      };
      open.set(id, q);
      if (tty) chain = chain.then(() => turn(q, url)).catch(() => {});
      else output.write(`\n${text}\nAnswer in the approval window: ${url}\n`);
    });
  }

  function turn(q, url) {
    if (q.settled) return undefined;
    return new Promise((done) => {
      const rl = createInterface({ input, output });
      q.onSettle = (allowed, via) => {
        if (via !== 'terminal') rl.close();
        if (via === 'page') output.write(`\n(answered in the approval window — ${allowed ? 'allowed' : 'not allowed'})\n`);
        done();
      };
      rl.question(`\n${q.text}\n${url ? `(or answer in the approval window: ${url})\n` : ''}Allow? [y/N] `, (a) => {
        rl.close();
        q.settle(/^\s*y(es)?\s*$/i.test(a), 'terminal');
      });
    });
  }

  // From the approval page: 'ok' | 'gone' (answered already, or timed out) | 'bad' (wrong nonce).
  function answer(id, nonce, allowed) {
    const q = open.get(String(id));
    if (!q) return 'gone';
    const a = Buffer.from(String(nonce || ''));
    const b = Buffer.from(q.nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return 'bad';
    q.settle(allowed === true, 'page');
    return 'ok';
  }

  const pending = () => [...open.values()].map(({ id, kind, text, nonce, at }) => ({ id, kind, title: title(kind), text, nonce, at }));

  return { ask, answer, pending };
}

// The terminal alone (the same desk with no page to point at): one question at
// a time; anything but y/yes is no; no answer in `timeoutMs` is no; no terminal
// is no.
export function terminalConsent({ input = process.stdin, output = process.stdout, timeoutMs = 60000 } = {}) {
  return createConsentDesk({ input, output, timeoutMs }).ask;
}

// For tests and for folders the person picked in a native dialog: a fixed answer.
export const fixedConsent = (answer) => async () => answer;
