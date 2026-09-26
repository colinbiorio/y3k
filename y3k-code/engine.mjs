// The engine: one per machine, shared by every screen that is paired with it. It
// owns the sessions, the ordered event stream, the person's folders and keys, and
// asks the person — on this machine — before anything is trusted.
//
// Transports (http.mjs for the companion, the desktop's IPC host) do nothing but
// authenticate, pass commands to `handle()` and stream `subscribe()`/`since()`.

import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { PROTOCOL, MODES, validateCommand } from './protocol.mjs';
import { createBus, createCoalescer } from './bus.mjs';
import { createAudit } from './audit.mjs';
import { describe, KINDS } from './consent.mjs';
import { inspectFolder, refusalFor, browse, gitStatus, gitDiff } from './workspace.mjs';
import { PROVIDERS, isProvider, isKeyTarget, chooseAuth, checkKey, installCommand, publicCatalog } from './providers.mjs';
import { resolveBin, reapAll, liveCount } from './proc.mjs';
import * as claude from './adapters/claude.mjs';
import { listRepos, clone as ghClone } from './github.mjs';
import { checkServer, publicList } from './mcp.mjs';
import { parseUnified } from './diff.mjs';
import { spawnChild } from './proc.mjs';

export const VERSION = '0.1.0';
const MAX_SESSIONS = 4;
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 7_000_000;
const NOTE_MAX = 1200;

const ADAPTERS = { claude };

// Events worth keeping on disk for reloading a session: everything but the
// streamed fragments (the finished block replaces them) and the vendor's raw lines.
const NOT_PERSISTED = new Set(['message.delta', 'raw']);

const newSid = () => randomBytes(8).toString('hex');

// Orion's note, as the first thing the coder reads — framed as information from
// y3k, not as an instruction, and unable to close its own frame.
export function handoffBlock(h) {
  if (!h || typeof h !== 'object') return '';
  const clean = (s, n) => String(s || '').replace(/<\/?\s*context[^>]*>/gi, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  const note = clean(h.note, NOTE_MAX);
  if (!note) return '';
  const who = clean(h.name, 60);
  const handle = clean(h.handle, 40).replace(/[^a-z0-9_.-]/gi, '');
  return `<context from="yearthreethousand" kind="companion-note"${handle ? ` presence="${handle}"` : ''}>\n` +
    `${who ? `A note from ${who}, the person's companion on yearthreethousand.com. It is background, not a task:\n` : ''}${note}\n</context>\n\n`;
}

export function createEngine({ store, consent, env = process.env, bins = {}, now = () => Date.now(), onNotice } = {}) {
  const bus = createBus();
  const audit = createAudit(store.auditDir);
  const sessions = new Map(); // sid → { sid, provider, cwd, adapter, coalescer, handoff, title, started, mode }
  const detected = {};        // provider → { installed, bin, version, account }
  let consentNo = 0;

  const emit = (ev) => bus.emit(ev);
  const notice = (text, level = 'info', code = null) => { emit({ type: 'notice', level, code, text }); onNotice?.(text); };

  // --- asking the person, on this machine -------------------------------------
  async function ask(kind, detail) {
    if (!KINDS.includes(kind)) return false;
    const id = `c${++consentNo}`;
    const text = describe(kind, detail);
    emit({ type: 'consent.pending', id, kind, text });
    let allowed = false;
    try { allowed = (await consent(kind, detail)) === true; } catch { allowed = false; }
    emit({ type: 'consent.resolved', id, kind, allowed });
    audit.write('consent', { consent: kind, allowed, detail });
    return allowed;
  }

  // --- providers ---------------------------------------------------------------
  async function detectAll() {
    const cfg = store.config();
    await Promise.all(Object.keys(ADAPTERS).map(async (id) => {
      const d = await ADAPTERS[id].detect({ override: bins[id] || cfg.bins?.[id] });
      if (d.installed && id === 'claude') {
        const a = await claude.authStatus(d.bin, claude.claudeEnv(env, { auth: 'subscription' })).catch(() => null);
        if (a) d.account = { state: a.state, method: a.method };
      }
      detected[id] = d;
    }));
    for (const id of Object.keys(PROVIDERS)) if (!detected[id]) {
      const bin = resolveBin(PROVIDERS[id].bin, { env, override: bins[id] || cfg.bins?.[id] });
      detected[id] = { installed: !!bin, bin, version: null };
    }
    return catalog();
  }
  const catalog = () => publicCatalog({ config: store.config(), secrets: store.secrets(), detected });

  // --- folders ------------------------------------------------------------------
  function trusted(cwd) {
    const info = inspectFolder(cwd, { configDir: store.dir });
    if (info.refused) return { error: info.refused };
    const rec = store.folders()[info.real];
    if (!rec?.trusted) return { error: 'Trust this folder first.', code: 'untrusted', real: info.real };
    return { real: info.real, rec };
  }

  function recent() {
    return Object.entries(store.folders())
      .filter(([, r]) => r.trusted)
      .map(([path, r]) => ({ path, name: r.name, mode: r.mode || null, lastUsed: r.lastUsed || r.trustedAt || 0, isGit: !!r.isGit }))
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 30);
  }

  // --- the session index and each session's own event file ---------------------
  const indexFile = () => join(store.sessionsDir, 'index.jsonl');
  const eventsFile = (sid) => join(store.sessionsDir, `${sid}.jsonl`);
  function indexWrite(rec) {
    try { appendFileSync(indexFile(), JSON.stringify(rec) + '\n', { mode: 0o600 }); } catch { /* reloading is a convenience */ }
  }
  function indexRead() {
    if (!existsSync(indexFile())) return [];
    const bySid = new Map();
    for (const line of readFileSync(indexFile(), 'utf8').split('\n')) {
      if (!line) continue;
      try { const r = JSON.parse(line); bySid.set(r.sid, { ...(bySid.get(r.sid) || {}), ...r }); } catch { /* skip */ }
    }
    return [...bySid.values()];
  }

  function sessionEmitter(s) {
    const persist = (e) => {
      if (NOT_PERSISTED.has(e.type)) return;
      try { appendFileSync(eventsFile(s.sid), JSON.stringify(e) + '\n', { mode: 0o600 }); } catch { /* ignore */ }
    };
    const out = (ev) => { const seq = bus.emit({ ...ev, sid: s.sid }); persist({ ...ev, sid: s.sid, seq }); };
    s.coalescer = createCoalescer(out, 25);
    return (ev) => {
      if (ev.type === 'message.delta') return s.coalescer.push(ev);
      s.coalescer.flush();
      if (ev.type === 'session.ended') onEnded(s, ev);
      if (ev.type === 'turn.ended') refreshGit(s);
      if (ev.type === 'session.ready' && ev.providerSessionId) s.providerSessionId = ev.providerSessionId;
      if (ev.type === 'mode.changed' && MODES.includes(ev.mode)) { s.mode = ev.mode; rememberMode(s.cwd, ev.mode); }
      out(ev);
    };
  }

  // After every turn, the folder's git state: the branch, and what changed.
  function refreshGit(s) {
    gitStatus(s.cwd).then((st) => { if (!st.error) s.emit({ type: 'git.status', ...st }); }).catch(() => {});
  }

  function onEnded(s, ev) {
    indexWrite({ sid: s.sid, ended: now(), endReason: ev.reason });
    setTimeout(() => sessions.delete(s.sid), 0);
  }

  function rememberMode(real, mode) {
    if (store.folders()[real]) store.setFolder(real, { mode, lastUsed: now() });
  }

  // --- sessions -----------------------------------------------------------------
  async function startSession({ provider, cwd, model, effort, mode, title, handoff, resumeId, fork, resumeOf }) {
    if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
    const p = PROVIDERS[provider];
    const A = ADAPTERS[p.adapter];
    if (!p.ready || !A) return { ok: false, error: `${p.label} is coming soon in y3k Code.`, code: 'not-ready' };
    if (sessions.size >= MAX_SESSIONS) return { ok: false, error: `At most ${MAX_SESSIONS} sessions at once — stop one first.`, code: 'too-many' };
    const t = trusted(cwd);
    if (t.error) return { ok: false, error: t.error, code: t.code || 'refused', path: t.real };
    const chosen = mode || t.rec.mode;
    if (!chosen) return { ok: false, error: 'Choose how much this session may do on its own.', code: 'needs-mode' };
    if (!MODES.includes(chosen)) return { ok: false, error: 'Unknown mode.' };
    if (model && model !== 'default' && !claude.isModel(model)) return { ok: false, error: 'Unknown model.' };
    if (effort && !claude.EFFORTS.includes(effort)) return { ok: false, error: 'Unknown effort.' };
    if (!detected[provider]) await detectAll();
    const d = detected[provider];
    if (!d?.installed) return { ok: false, error: `${p.label} is not installed on this computer.`, code: 'not-installed', install: installCommand(provider) };
    const auth = chooseAuth(provider, { config: store.config(), secrets: store.secrets() });
    if (auth.error) return { ok: false, error: auth.error, code: auth.code };

    const sid = newSid();
    const s = { sid, provider, cwd: t.real, handoff: handoffBlock(handoff), title: title || null, started: now(), mode: chosen, sentFirst: false };
    s.emit = sessionEmitter(s);
    const name = `y3k: ${t.rec.name || t.real.split(/[\\/]/).pop()}`;
    s.adapter = A.createAdapter({
      sid, cwd: t.real, emit: s.emit, audit, bin: d.bin, tmpDir: store.tmpDir, configDir: store.dir,
      env: A.envFor(env, { auth: auth.method, apiKey: auth.key }),
      opts: { mode: chosen, model: model && model !== 'default' ? model : null, effort, name, resumeId, fork, title, mcp: store.mcp() },
    });
    sessions.set(sid, s);
    store.setFolder(t.real, { mode: chosen, lastUsed: now() });
    audit.write('session.start', { sid, provider, cwd: t.real, mode: chosen, model, effort, auth: auth.method, resumeId, fork: !!fork, handoff: !!s.handoff });
    try {
      const r = await s.adapter.start();
      s.providerSessionId = r.providerSessionId;
    } catch (err) {
      sessions.delete(sid);
      return { ok: false, error: String(err?.message || err) };
    }
    indexWrite({ sid, provider, cwd: t.real, providerSessionId: s.providerSessionId, title: s.title, started: s.started, mode: chosen, model: model || null, resumeOf: resumeOf || null, fork: !!fork });
    emit({ type: 'workspace.recent', folders: recent() });
    return { ok: true, sid, providerSessionId: s.providerSessionId, mode: chosen, auth: auth.method };
  }

  function live(sid) {
    const s = sessions.get(sid);
    return s ? { s } : { error: 'That session is not running.' };
  }

  function checkAttachments(list) {
    if (!list) return null;
    if (list.length > MAX_IMAGES) return `At most ${MAX_IMAGES} images per message.`;
    for (const a of list) {
      if (!a || a.type !== 'image' || typeof a.data !== 'string' || typeof a.mediaType !== 'string') return 'Only images can be attached.';
      if (a.data.length > MAX_IMAGE_B64) return 'That image is too large (5 MB at most).';
    }
    return null;
  }

  // The presence's note rides with the FIRST message only — the person has
  // read it by then, and may have changed it or left it out.
  function send(s, text, attachments, handoff) {
    const first = !s.sentFirst;
    s.sentFirst = true;
    if (first && handoff) s.handoff = handoffBlock(handoff);
    const full = first && s.handoff ? s.handoff + text : text;
    if (first && !s.title) {
      s.title = text.split('\n')[0].slice(0, 60);
      indexWrite({ sid: s.sid, title: s.title });
      s.emit({ type: 'session.title', title: s.title });
    }
    const imgs = (attachments || []).length;
    // The screen shows what the person typed; the note, if any, is shown by the
    // screen as its own card, from its own copy.
    s.emit({ type: 'message.user', text, images: imgs, withNote: first && !!s.handoff });
    audit.write('session.send', { sid: s.sid, chars: text.length, images: imgs, withNote: first && !!s.handoff });
    return s.adapter.send({ text: full, attachments });
  }

  function loadSession(sid) {
    if (!/^[a-f0-9]{16}$/.test(sid)) return { ok: false, error: 'Unknown session.' };
    const f = eventsFile(sid);
    if (!existsSync(f)) return { ok: false, error: 'Unknown session.' };
    const events = [];
    for (const line of readFileSync(f, 'utf8').split('\n')) { if (line) { try { events.push(JSON.parse(line)); } catch { /* skip */ } } }
    const meta = indexRead().find((r) => r.sid === sid) || null;
    return { ok: true, sid, meta, live: sessions.has(sid), events: events.slice(-5000) };
  }

  // --- commands -----------------------------------------------------------------
  const H = {
    'engine.hello': async () => ({ ok: true, ...hello() }),
    'provider.list': async () => ({ ok: true, providers: catalog() }),
    'provider.refresh': async () => {
      const providers = await detectAll();
      emit({ type: 'provider.status', providers });
      return { ok: true, providers };
    },
    // An install is a yes on this computer, and only the vendor's own npm
    // package is ever installed from here; anything else is a command to run
    // in a terminal.
    'provider.install': async ({ provider }) => {
      if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
      const p = PROVIDERS[provider];
      const pkg = /^npm install -g (@?[a-z0-9][\w./-]*)$/.exec(p.install?.npm || '')?.[1];
      const npm = resolveBin(platform() === 'win32' ? 'npm.cmd' : 'npm', { env });
      if (!pkg || !npm) return { ok: false, code: 'run-in-terminal', command: installCommand(provider), error: `Install ${p.label} by running this in a terminal, then press refresh.` };
      const command = `npm install -g ${pkg}`;
      if (!(await ask('provider.install', { label: p.label, command }))) return { ok: false, code: 'declined', error: 'Not installed.' };
      audit.write('install', { provider, command });
      notice(`Installing ${p.label}…`, 'info', 'install');
      const code = await new Promise((resolve) => {
        const c = spawnChild(npm, ['install', '-g', pkg], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        const line = (t) => { const x = String(t).trim(); if (x) emit({ type: 'notice', level: 'info', code: 'install', text: x.slice(0, 300) }); };
        c.stdout.setEncoding('utf8').on('data', (d) => d.split('\n').forEach(line));
        c.stderr.setEncoding('utf8').on('data', (d) => d.split('\n').forEach(line));
        c.on('error', () => resolve(-1));
        c.on('exit', (x) => resolve(x));
      });
      const providers = await detectAll();
      emit({ type: 'provider.status', providers });
      return code === 0 ? { ok: true, providers } : { ok: false, error: `The install did not finish (exit ${code}). Try it in a terminal: ${command}`, command, providers };
    },
    'provider.login': async ({ provider }) => {
      if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
      const p = PROVIDERS[provider];
      if (!p.login) return { ok: false, error: `${p.label} uses an API key.` };
      return { ok: false, code: 'run-in-terminal', command: p.login, error: `Sign in by running this in a terminal, then press refresh.` };
    },
    'provider.setKey': async ({ provider, key }) => {
      if (!isKeyTarget(provider)) return { ok: false, error: 'Unknown provider.' };
      const k = checkKey(provider, key);
      if (k.error) return { ok: false, error: k.error };
      store.setSecret(provider, k.key);
      audit.write('key.set', { provider });
      return { ok: true, providers: catalog() };
    },
    'provider.clearKey': async ({ provider }) => {
      if (!isKeyTarget(provider)) return { ok: false, error: 'Unknown provider.' };
      store.setSecret(provider, null);
      audit.write('key.clear', { provider });
      return { ok: true, providers: catalog() };
    },
    'models.list': async ({ provider }) => {
      if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
      return { ok: true, models: PROVIDERS[provider].models, efforts: provider === 'claude' ? claude.EFFORTS : [] };
    },
    'workspace.pick': async () => ({ ok: false, code: 'desktop-only', error: 'Choose a folder from the list.' }),
    'workspace.browse': async ({ path }) => { const r = browse(path); return r.error ? { ok: false, error: r.error } : { ok: true, ...r }; },
    'workspace.recent': async () => ({ ok: true, folders: recent() }),
    'workspace.open': async ({ path }) => {
      const info = inspectFolder(path, { configDir: store.dir });
      if (info.refused) return { ok: false, error: info.refused, code: 'refused' };
      const rec = store.folders()[info.real];
      if (rec?.trusted) {
        store.setFolder(info.real, { lastUsed: now(), isGit: info.isGit });
        return { ok: true, path: info.real, name: info.name, trusted: true, mode: rec.mode || null, isGit: info.isGit, findings: info.findings };
      }
      const yes = await ask('folder.trust', { path: info.real, findings: info.findings });
      if (!yes) return { ok: false, error: 'Not trusted.', code: 'declined', findings: info.findings };
      store.setFolder(info.real, { trusted: true, trustedAt: now(), lastUsed: now(), name: info.name, isGit: info.isGit, findings: info.findings.length });
      emit({ type: 'workspace.recent', folders: recent() });
      return { ok: true, path: info.real, name: info.name, trusted: true, mode: null, isGit: info.isGit, findings: info.findings };
    },
    'workspace.forget': async ({ path }) => {
      const info = inspectFolder(path, { configDir: store.dir });
      const real = info.real || path;
      if ([...sessions.values()].some((s) => s.cwd === real)) return { ok: false, error: 'A session is running there — stop it first.' };
      store.forgetFolder(real);
      audit.write('folder.forget', { path: real });
      emit({ type: 'workspace.recent', folders: recent() });
      return { ok: true };
    },
    'git.status': async ({ cwd }) => {
      const t = trusted(cwd);
      if (t.error) return { ok: false, error: t.error };
      const st = await gitStatus(t.real);
      return st.error ? { ok: false, error: st.error } : { ok: true, ...st };
    },
    'git.diff': async ({ cwd, path, staged }) => {
      const t = trusted(cwd);
      if (t.error) return { ok: false, error: t.error };
      const d = await gitDiff(t.real, { path, staged });
      if (d.error) return { ok: false, error: d.error };
      const patch = d.patch.slice(0, 2_000_000);
      return { ok: true, files: parseUnified(patch), truncated: d.patch.length > patch.length };
    },
    'session.start': async (c) => startSession(c),
    'session.send': async ({ sid, text, attachments, handoff }) => {
      const { s, error } = live(sid);
      if (error) return { ok: false, error };
      if (!String(text).trim() && !(attachments || []).length) return { ok: false, error: 'Nothing to send.' };
      const bad = checkAttachments(attachments);
      if (bad) return { ok: false, error: bad };
      return send(s, text, attachments, handoff);
    },
    'session.interrupt': async ({ sid }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.interrupt(); },
    'session.stop': async ({ sid }) => { const { s, error } = live(sid); if (error) return { ok: false, error }; audit.write('session.stop', { sid }); return s.adapter.stop(); },
    'session.setMode': async ({ sid, mode }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.setMode(mode); },
    'session.setModel': async ({ sid, model }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.setModel(model); },
    'session.setEffort': async ({ sid, effort }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.setEffort(effort); },
    'session.contextUsage': async ({ sid }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.contextUsage(); },
    'session.limits': async ({ sid }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.limits(); },
    'session.list': async ({ cwd }) => {
      let rows = indexRead();
      if (cwd) { const info = inspectFolder(cwd, { configDir: store.dir }); rows = rows.filter((r) => r.cwd === info.real); }
      rows = rows.map((r) => ({ ...r, live: sessions.has(r.sid) })).sort((a, b) => (b.started || 0) - (a.started || 0)).slice(0, 200);
      return { ok: true, sessions: rows };
    },
    'session.load': async ({ sid }) => loadSession(sid),
    'session.resume': async ({ provider, cwd, providerSessionId, sid, fork }) => {
      let id = providerSessionId;
      if (!id && sid) id = indexRead().find((r) => r.sid === sid)?.providerSessionId;
      if (!id || !claude.isSessionId(id)) return { ok: false, error: 'Nothing to resume.' };
      return startSession({ provider, cwd, resumeId: id, fork: !!fork, resumeOf: sid || null });
    },
    'session.fork': async ({ sid }) => {
      const r = indexRead().find((x) => x.sid === sid);
      if (!r?.providerSessionId) return { ok: false, error: 'Unknown session.' };
      return startSession({ provider: r.provider, cwd: r.cwd, resumeId: r.providerSessionId, fork: true, resumeOf: sid });
    },
    'permission.answer': async ({ sid, requestId, decision, scope, message }) => {
      const { s, error } = live(sid);
      if (error) return { ok: false, error };
      if (!['allow', 'deny'].includes(decision)) return { ok: false, error: 'Allow or deny.' };
      if (scope && !['once', 'session', 'always'].includes(scope)) return { ok: false, error: 'Unknown scope.' };
      return s.adapter.answerPermission({ requestId, decision, scope, message });
    },
    'question.answer': async ({ sid, requestId, answers }) => {
      const { s, error } = live(sid);
      if (error) return { ok: false, error };
      for (const v of Object.values(answers)) if (typeof v !== 'string' || v.length > 4000) return { ok: false, error: 'Answers must be text.' };
      return s.adapter.answerQuestion({ requestId, answers });
    },
    'mcp.list': async () => ({ ok: true, servers: publicList(store.mcp()) }),
    'mcp.add': async (c) => {
      const chk = checkServer(c);
      if (chk.error) return { ok: false, error: chk.error };
      const m = store.mcp();
      if (m.mcpServers?.[c.name]) return { ok: false, error: 'A connector with that name already exists.' };
      const sv = chk.server;
      if (!(await ask('mcp.add', { name: c.name, command: sv.command, args: sv.args, url: sv.url }))) return { ok: false, code: 'declined', error: 'Not added.' };
      store.setMcp({ ...m, mcpServers: { ...(m.mcpServers || {}), [c.name]: sv } });
      audit.write('mcp.add', { name: c.name, transport: sv.type, command: sv.command, args: sv.args, url: sv.url });
      return { ok: true, servers: publicList(store.mcp()), note: 'New sessions will have it.' };
    },
    'mcp.remove': async ({ name }) => {
      const m = store.mcp();
      if (!m.mcpServers?.[name]) return { ok: false, error: 'No such connector.' };
      const next = { ...m.mcpServers };
      delete next[name];
      store.setMcp({ ...m, mcpServers: next });
      audit.write('mcp.remove', { name });
      return { ok: true, servers: publicList(store.mcp()) };
    },
    'github.repos': async ({ q }) => { const r = await listRepos({ env, q }); return r.error ? { ok: false, ...r } : { ok: true, repos: r.repos }; },
    'github.clone': async ({ repo }) => {
      audit.write('github.clone', { repo });
      const r = await ghClone({ env, repo });
      return r.error ? { ok: false, ...r } : { ok: true, path: r.path };
    },
    'mcp.toggle': async ({ sid, name, enabled }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.mcpToggle(name, enabled); },
    'mcp.reconnect': async ({ sid, name }) => { const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.mcpReconnect(name); },
    'audit.tail': async ({ n }) => ({ ok: true, entries: audit.tail(n || 100) }),
  };

  function hello() {
    return {
      name: 'y3k-code', version: VERSION, protocol: PROTOCOL, epoch: bus.epoch, seq: bus.seq, platform: platform(),
      modes: MODES, providers: catalog(), recent: recent(),
      sessions: [...sessions.values()].map((s) => ({ sid: s.sid, provider: s.provider, cwd: s.cwd, title: s.title, mode: s.mode, state: s.adapter?.state || 'idle', started: s.started })),
    };
  }

  // Every command goes through here. `ctx` says where it came from, for the audit.
  async function handle(obj, ctx = {}) {
    const v = validateCommand(obj);
    if (!v.ok) return { ok: false, error: v.error, code: 'invalid' };
    const fn = H[obj.cmd];
    if (!fn) return { ok: false, error: `${obj.cmd} is not available yet.`, code: 'not-implemented' };
    const { id, cmd, ...args } = obj;
    if (!/^(engine\.hello|provider\.list|workspace\.(browse|recent)|session\.(list|load|contextUsage|limits)|git\.|models\.|mcp\.list|audit\.tail)/.test(cmd)) {
      audit.write('cmd', { cmd, via: ctx.via || null, origin: ctx.origin || null, sid: args.sid || null });
    }
    try {
      const r = await fn(args, ctx);
      return id ? { id, ...r } : r;
    } catch (err) {
      audit.write('error', { cmd, error: String(err?.message || err) });
      return { ...(id ? { id } : {}), ok: false, error: 'Something went wrong in the engine.', detail: String(err?.message || err).slice(0, 300) };
    }
  }

  function shutdown() {
    for (const s of sessions.values()) { try { s.adapter.stop(); } catch { /* ignore */ } }
    setTimeout(reapAll, 5500).unref?.();
  }

  emit({ type: 'engine.hello', version: VERSION, protocol: PROTOCOL });
  detectAll().then((providers) => emit({ type: 'provider.status', providers })).catch(() => {});

  return {
    epoch: bus.epoch, get seq() { return bus.seq; }, since: bus.since, subscribe: bus.subscribe,
    handle, hello, ask, shutdown, notice, detectAll, audit,
    get sessionCount() { return sessions.size; }, liveChildren: liveCount,
  };
}
