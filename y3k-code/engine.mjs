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
import { createBus, createCoalescer, COALESCED } from './bus.mjs';
import { createAudit } from './audit.mjs';
import { describe, KINDS } from './consent.mjs';
import { inspectFolder, refusalFor, browse, gitStatus, gitDiff, listFiles, matchFiles } from './workspace.mjs';
import { PROVIDERS, VIA_OPENCODE, isProvider, isKeyTarget, chooseAuth, checkKey, installCommand, publicCatalog, authState, keyChoice } from './providers.mjs';
import { resolveBin, reap, liveChildren, liveCount } from './proc.mjs';
import * as claude from './adapters/claude.mjs';
import * as codex from './adapters/codex.mjs';
import * as acp from './adapters/acp.mjs';
import * as opencode from './adapters/opencode.mjs';
import { listRepos, clone as ghClone } from './github.mjs';
import { checkServer, publicList } from './mcp.mjs';
import { createOrb, ORB_SERVER } from './orb.mjs';
import { THINKERS, thinkWithClaude } from './brain.mjs';
import { createUpdater } from './update.mjs';
import { parseUnified } from './diff.mjs';
import { spawnChild } from './proc.mjs';

export const VERSION = '0.3.0';   // 0.2: brain.complete — your presence thinking on your own sign-in
                                  // 0.3: engine.update — the newest version from the site, on the person's yes (update.mjs)
const MAX_SESSIONS = 4;
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 7_000_000;
const NOTE_MAX = 1200;

// Each adapter module: detect, createAdapter, envFor, isModel, isSessionId, EFFORTS, CAPS.
const ADAPTERS = { claude, codex, acp, opencode };

// Events worth keeping on disk for reloading a session: everything but the
// streamed fragments (the finished block replaces them), a running command's
// output so far (its tool.result carries the final output, and a noisy build
// would otherwise write tens of these a second and push the session's start
// out of what a reload reads back) and the vendor's raw lines.
const NOT_PERSISTED = new Set(['message.delta', 'tool.progress', 'raw']);

const newSid = () => randomBytes(8).toString('hex');
const isSid = (x) => typeof x === 'string' && /^[a-f0-9]{16}$/.test(x);

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

// `door()`: where this engine can be reached on this computer
// (http://127.0.0.1:<port>), once it is listening — the orb's MCP door
// (orb.mjs) is there. Null: no orb tool for the coders.
// `update`: { site, root, restart({ dir, version }), fetchFn? } from a host that
// can run a newer version in this one's place (update.mjs); null: it cannot.
export function createEngine({ store, consent, env = process.env, bins = {}, now = () => Date.now(), onNotice, door = () => null, update = null } = {}) {
  const bus = createBus();
  const audit = createAudit(store.auditDir);
  const sessions = new Map(); // sid → { sid, provider, cwd, adapter, coalescer, handoff, title, started, mode }
  const detected = {};        // provider → { installed, bin, version, account, ollama? }
  let consentNo = 0;

  const emit = (ev) => bus.emit(ev);
  // The orb, for the coder (orb.mjs): every session's client gets the tool. A
  // move goes to whatever screens are listening; with none, the coder is told.
  const orb = createOrb({ emit, hasPage: () => bus.subscribers > 0, version: VERSION, now });
  const withOrb = (m, sid) => {
    const base = door();
    return base ? { ...m, mcpServers: { ...(m?.mcpServers || {}), [ORB_SERVER]: orb.server(sid, base) } } : m;
  };
  const notice = (text, level = 'info', code = null) => { emit({ type: 'notice', level, code, text }); onNotice?.(text); };

  // --- asking the person, on this machine -------------------------------------
  async function ask(kind, detail) {
    if (!KINDS.includes(kind)) return false;
    const id = `c${++consentNo}`;
    const text = describe(kind, detail);
    emit({ type: 'consent.pending', id, kind, text });
    let allowed = false;
    // The id rides along so a consent that can be answered in more than one
    // place (the companion's terminal AND its local approval page) files the
    // question under the same id the page saw in consent.pending.
    try { allowed = (await consent(kind, detail, { id })) === true; } catch { allowed = false; }
    emit({ type: 'consent.resolved', id, kind, allowed });
    audit.write('consent', { consent: kind, allowed, detail });
    return allowed;
  }

  // --- the newest version, from the site (update.mjs) ----------------------------
  const updater = createUpdater({ site: update?.site, root: update?.root, restart: update?.restart, fetchFn: update?.fetchFn, current: VERSION, ask, audit });

  // --- providers ---------------------------------------------------------------
  // Whether the person is signed in to each client, asked of the client itself
  // with the environment a session would get — never read out of its files
  // (providers.mjs, top). Only { state, method } is kept.
  const SIGNED_IN = {
    claude: (d) => claude.authStatus(d.bin, claude.claudeEnv(env, { auth: 'subscription' })),
    codex: (d) => codex.loginStatus(d.bin, codex.envFor(env, {})),
    gemini: async () => acp.signInState(env),
    opencode: (d) => opencode.authList(d.bin, env),
  };

  async function detectOne(id) {
    const p = PROVIDERS[id];
    const override = bins[id] || store.config().bins?.[id];
    const A = ADAPTERS[p.adapter];
    let d;
    if (A) d = await A.detect({ override, env });
    else { const bin = resolveBin(p.bin, { env, override }); d = { installed: !!bin, bin, version: null }; }
    if (d.installed && SIGNED_IN[id]) {
      const a = await SIGNED_IN[id](d).catch(() => null);
      if (a) d.account = { state: a.state, method: a.method ?? null };
    }
    // Ollama is a way into OpenCode's models that needs no key at all.
    if (d.installed && id === 'opencode') d.ollama = (await opencode.ollamaModels(env).catch(() => [])).length > 0;
    detected[id] = d;
    return d;
  }

  async function detectAll() {
    await Promise.all(Object.keys(PROVIDERS).map((id) => detectOne(id).catch(() => { detected[id] = detected[id] || { installed: null }; })));
    return catalog();
  }
  // …with the modes each tool can really work in (Gemini has no safe "auto").
  const catalog = () => publicCatalog({ config: store.config(), secrets: store.secrets(), detected })
    .map((p) => ({ ...p, modes: ADAPTERS[PROVIDERS[p.id].adapter]?.CAPS.modes || [] }));

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
      .map(([path, r]) => ({ path, name: r.name, mode: r.mode || null, provider: isProvider(r.provider) ? r.provider : null, lastUsed: r.lastUsed || r.trustedAt || 0, isGit: !!r.isGit }))
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
      if (COALESCED.has(ev.type)) return s.coalescer.push(ev);
      s.coalescer.flush();
      // a session that continues another says which, and how much of it — the
      // screen draws that conversation above this one (its own file starts empty)
      if (ev.type === 'session.started' && s.prior) ev = { ...ev, prior: s.prior, priorCut: s.priorCut ?? null };
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
    orb.close(s.sid);
    setTimeout(() => sessions.delete(s.sid), 0);
  }

  function rememberMode(real, mode) {
    if (store.folders()[real]) store.setFolder(real, { mode, lastUsed: now() });
  }

  // --- getting in ----------------------------------------------------------------
  // Before a session starts: can it get in? When the client last said nobody is
  // signed in (or OpenCode had no way in at all), ask it again — they may have
  // signed in since the page was drawn — and only then refuse, saying exactly
  // what to run. Anything short of a clear "signed out" goes ahead: a session
  // that cannot get in says so in the client's own words.
  async function cannotGetIn(id) {
    const state = () => authState(id, { config: store.config(), secrets: store.secrets(), detected });
    if (state() !== 'signed-out' && state() !== 'needs-key') return null;
    await detectOne(id).catch(() => {});
    emit({ type: 'provider.status', providers: catalog() });
    const p = PROVIDERS[id];
    if (state() === 'signed-out') return { ok: false, code: 'signed-out', loginCommand: p.login, error: `Sign in to ${p.label} first: run \`${p.login}\` in a terminal, then come back.` };
    if (state() === 'needs-key') return { ok: false, code: 'needs-key', error: id === 'opencode' ? 'Add a key for one of OpenCode\'s providers, sign in with `opencode auth login`, or start Ollama on this computer.' : chooseAuth(id, { config: store.config(), secrets: store.secrets() }).error || 'Add your API key first.' };
    return null;
  }

  // --- your presence, on your own sign-in (brain.mjs) ---------------------------
  // One turn of thinking for the presence, through the client the person signed
  // in to. Asked once per client on this computer; then each turn is the
  // client run once, with no tools, in an empty folder. Two at a time at most.
  let thinking = 0;
  const askingThink = new Map();   // provider → the question on its way (asked once, not per turn)
  async function think({ provider, system, prompt, model, effort }) {
    const p = PROVIDERS[provider];
    if (!THINKERS.includes(provider)) return { ok: false, code: 'unsupported', error: `${p?.label || 'That tool'} cannot think for your presence yet: only Claude Code can, with no tools.` };
    if (!detected[provider]) await detectOne(provider);
    const d = detected[provider];
    if (!d?.installed) return { ok: false, code: 'not-installed', error: `${p.label} is not installed on this computer.`, install: installCommand(provider) };
    const why = await cannotGetIn(provider);
    if (why) return why;
    const auth = chooseAuth(provider, { config: store.config(), secrets: store.secrets() });
    if (auth.error) return { ok: false, code: auth.code, error: auth.error };
    if (!store.config().ownBrain?.[provider]) {
      if (!askingThink.has(provider)) askingThink.set(provider, ask('brain.own', { label: p.label }).finally(() => askingThink.delete(provider)));
      if (!(await askingThink.get(provider))) return { ok: false, code: 'declined', error: 'Not allowed on the computer.' };
      store.setConfig({ ownBrain: { ...(store.config().ownBrain || {}), [provider]: true } });
    }
    if (thinking >= 2) return { ok: false, code: 'busy', error: 'Your presence is already thinking twice over — try again in a moment.' };
    thinking++;
    try {
      const r = await thinkWithClaude({ bin: d.bin, env: claude.claudeEnv(env, { auth: auth.method, apiKey: auth.key }), tmpDir: join(store.tmpDir, 'brain'), system, prompt, model, effort });
      audit.write('brain.complete', { provider, chars: prompt.length, ok: r.ok, code: r.code || null });
      return r;
    } finally { thinking--; }
  }

  // For Claude Code, Codex and Gemini CLI a key is the person's choice over
  // their own sign-in: setting one IS that choice, and clearing it goes back.
  function chooseKey(id, on) {
    if (!isProvider(id) || id === 'opencode') return;
    store.setConfig({ auth: keyChoice(store.config(), id, on) });
  }

  // --- sessions -----------------------------------------------------------------
  async function startSession({ provider, cwd, model, effort, mode, title, handoff, resumeId, fork, resumeOf, resumeAt, priorCut }) {
    if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
    const p = PROVIDERS[provider];
    const A = ADAPTERS[p.adapter];
    if (!p.ready || !A) return { ok: false, error: `${p.label} is coming soon in y3kode.`, code: 'not-ready' };
    if (sessions.size >= MAX_SESSIONS) return { ok: false, error: `At most ${MAX_SESSIONS} sessions at once — stop one first.`, code: 'too-many' };
    const t = trusted(cwd);
    if (t.error) return { ok: false, error: t.error, code: t.code || 'refused', path: t.real };
    const chosen = mode || t.rec.mode;
    if (!chosen) return { ok: false, error: 'Choose how much this session may do on its own.', code: 'needs-mode' };
    if (!MODES.includes(chosen)) return { ok: false, error: 'Unknown mode.' };
    if (model && model !== 'default' && !A.isModel(model)) return { ok: false, error: 'Unknown model.' };
    if (effort && !A.EFFORTS.includes(effort)) return { ok: false, error: 'Unknown effort.' };
    if (!A.CAPS.modes.includes(chosen)) return { ok: false, error: `${p.label} cannot work in that mode here.`, code: 'mode-unavailable' };
    if (!detected[provider]) await detectOne(provider);
    const d = detected[provider];
    if (!d?.installed) return { ok: false, error: `${p.label} is not installed on this computer.`, code: 'not-installed', install: installCommand(provider) };
    const auth = chooseAuth(provider, { config: store.config(), secrets: store.secrets() });
    if (auth.error) return { ok: false, error: auth.error, code: auth.code };
    const why = await cannotGetIn(provider);
    if (why) return why;

    const sid = newSid();
    const s = { sid, provider, cwd: t.real, handoff: handoffBlock(handoff), title: title || null, started: now(), mode: chosen, sentFirst: false,
      prior: isSid(resumeOf) ? resumeOf : null, priorCut: Number.isInteger(priorCut) && priorCut >= 0 ? priorCut : null };
    s.emit = sessionEmitter(s);
    const name = `y3k: ${t.rec.name || t.real.split(/[\\/]/).pop()}`;
    s.adapter = A.createAdapter({
      sid, cwd: t.real, emit: s.emit, audit, bin: d.bin, tmpDir: store.tmpDir, configDir: store.dir,
      env: A.envFor(env, { auth: auth.method, apiKey: auth.key, homeDir: join(store.dir, 'homes', provider) }),
      apiKey: auth.method === 'apiKey' ? auth.key : null, provider,
      // the person's connectors, and y3k's own: the orb
      opts: { mode: chosen, model: model && model !== 'default' ? model : null, effort, name, resumeId, fork, title, mcp: withOrb(store.mcp(), sid),
        // where the conversation it resumes stands: the message it goes back
        // to, else where the session it continues left off
        resumeAt: resumeId && resumeAt ? resumeAt : null, startAfter: resumeId && !resumeAt && s.prior ? lastAnchor(s.prior) : null,
        orb: door() ? { name: ORB_SERVER, ...orb.server(sid, door()) } : null,
        // OpenCode: its own store (`opencode auth login`), plus an open-model
        // key for each provider the person gave one here
        viaKeys: p.adapter === 'opencode' ? Object.fromEntries(Object.entries(store.secrets()).filter(([k]) => Object.hasOwn(VIA_OPENCODE, k))) : undefined,
        ownAuth: p.adapter === 'opencode' ? ({ 'signed-in': true, 'signed-out': false }[d.account?.state] ?? null) : undefined },
    });
    sessions.set(sid, s);
    // The folder remembers the tool as well as the mode, so the page can offer
    // one "Continue in <folder> · <tool> · <mode>" instead of three choices.
    store.setFolder(t.real, { mode: chosen, provider, lastUsed: now() });
    audit.write('session.start', { sid, provider, cwd: t.real, mode: chosen, model, effort, auth: auth.method, resumeId, fork: !!fork, ...(resumeAt ? { resumeAt } : {}), handoff: !!s.handoff });
    try {
      const r = await s.adapter.start();
      s.providerSessionId = r.providerSessionId;
    } catch (err) {
      sessions.delete(sid);
      orb.close(sid);
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

  // Where a session's conversation stood when it last said: its newest anchor
  // (a message of the person's, or the end of a turn), from its file — or, if
  // it never got that far, where the session it continued stood.
  function lastAnchor(sid, depth = 0) {
    if (!isSid(sid) || depth > 8 || !existsSync(eventsFile(sid))) return null;
    let at = null, prior = null;
    for (const line of readFileSync(eventsFile(sid), 'utf8').split('\n')) {
      if (!line.includes('"lastUuid"') && !line.includes('"message.anchor"') && !line.includes('"prior"')) continue;
      try {
        const e = JSON.parse(line);
        if (e.type === 'turn.ended' && e.lastUuid) at = e.lastUuid;
        else if (e.type === 'message.anchor' && e.uuid) at = e.uuid;
        else if (e.type === 'session.started' && e.prior) prior = e.prior;
      } catch { /* skip */ }
    }
    return at || (prior ? lastAnchor(prior, depth + 1) : null);
  }

  function loadSession(sid) {
    if (!isSid(sid)) return { ok: false, error: 'Unknown session.' };
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
      return { ok: false, code: 'run-in-terminal', command: p.login, loginCommand: p.login, error: `Sign in to ${p.label} by running this in a terminal, then check again.` };
    },
    'provider.setKey': async ({ provider, key }) => {
      if (!isKeyTarget(provider)) return { ok: false, error: 'Unknown provider.' };
      const k = checkKey(provider, key);
      if (k.error) return { ok: false, error: k.error };
      store.setSecret(provider, k.key);
      chooseKey(provider, true);
      audit.write('key.set', { provider });
      return { ok: true, providers: catalog() };
    },
    'provider.clearKey': async ({ provider }) => {
      if (!isKeyTarget(provider)) return { ok: false, error: 'Unknown provider.' };
      store.setSecret(provider, null);
      chooseKey(provider, false);
      audit.write('key.clear', { provider });
      return { ok: true, providers: catalog() };
    },
    'models.list': async ({ provider }) => {
      if (!isProvider(provider)) return { ok: false, error: 'Unknown provider.' };
      return { ok: true, models: PROVIDERS[provider].models, efforts: ADAPTERS[PROVIDERS[provider].adapter]?.EFFORTS || [] };
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
        return { ok: true, path: info.real, name: info.name, trusted: true, mode: rec.mode || null, provider: isProvider(rec.provider) ? rec.provider : null, isGit: info.isGit, findings: info.findings };
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
    // The composer's "@": file names in a TRUSTED folder, matched to what is
    // typed. Names only — the coder reads a file when it is asked to, as ever.
    'workspace.files': async ({ cwd, q }) => {
      const t = trusted(cwd);
      if (t.error) return { ok: false, error: t.error, code: t.code };
      const files = await listFiles(t.real);
      return { ok: true, files: matchFiles(files, q || '') };
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
    // The command gate holds a mode to MODES already; it is checked again here,
    // as startSession does, since each adapter turns it into its vendor's permissions.
    'session.setMode': async ({ sid, mode }) => { if (!MODES.includes(mode)) return { ok: false, error: 'Unknown mode.' }; const { s, error } = live(sid); return error ? { ok: false, error } : s.adapter.setMode(mode); },
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
      const A = isProvider(provider) ? ADAPTERS[PROVIDERS[provider].adapter] : null;
      if (!id || !A || !A.isSessionId(id)) return { ok: false, error: 'Nothing to resume.' };
      return startSession({ provider, cwd, resumeId: id, fork: !!fork, resumeOf: sid || null });
    },
    'session.fork': async ({ sid }) => {
      const r = indexRead().find((x) => x.sid === sid);
      if (!r?.providerSessionId) return { ok: false, error: 'Unknown session.' };
      return startSession({ provider: r.provider, cwd: r.cwd, resumeId: r.providerSessionId, fork: true, resumeOf: sid });
    },
    // GOING BACK — Claude Code's rewind, for the conversation: a new session
    // with everything up to just before one of the person's messages (`at`:
    // the anchor that message stood on), forked, so the old one stays in the
    // history as it was; with no anchor (the first message), a new session in
    // the same folder. The files on the computer are not touched. The old
    // session, if it is running, is stopped once the new one is up — one
    // conversation, gone back — but never in the middle of a turn.
    'session.rewind': async ({ sid, at, cut, model }) => {
      const rec = indexRead().find((x) => x.sid === sid) || null;
      const was = sessions.get(sid) || null;
      const provider = was?.provider || rec?.provider;
      const cwd = was?.cwd || rec?.cwd;
      const psid = was?.providerSessionId || rec?.providerSessionId;
      if (!isProvider(provider) || !cwd) return { ok: false, error: 'Unknown session.' };
      const A = ADAPTERS[PROVIDERS[provider].adapter];
      if (!A?.CAPS?.rewind) return { ok: false, error: `${PROVIDERS[provider].label} cannot go back to an earlier message here.`, code: 'cannot' };
      if (at != null && !(A.isSessionId(at) && psid && A.isSessionId(psid))) return { ok: false, error: 'Nothing to go back to.' };
      if (cut != null && !(Number.isInteger(cut) && cut >= 0)) return { ok: false, error: 'Nothing to go back to.' };
      if (was && ['running', 'waiting'].includes(was.adapter.state)) return { ok: false, error: 'It is still working — stop it first (Esc), then go back.', code: 'busy' };
      const r = await startSession({ provider, cwd, mode: was?.mode || rec?.mode, model: model || undefined, title: was?.title || rec?.title || undefined,
        ...(at != null ? { resumeId: psid, fork: true, resumeAt: at } : {}), resumeOf: sid, priorCut: cut ?? 0 });
      if (!r.ok) return r;
      // the old one is let go only once the new one is up: a Claude Code that
      // cannot go back (or will not start) leaves the person where they were
      const now = sessions.get(r.sid);
      const up = await Promise.race([now?.adapter.up || Promise.resolve({ ok: true }), new Promise((res) => setTimeout(() => res({ ok: true }), 20000).unref?.())]);
      if (!up.ok) return { ok: false, error: up.why || 'Claude Code did not start.', code: 'not-started' };
      if (was && sessions.has(sid)) { audit.write('session.stop', { sid, why: 'went back' }); was.adapter.stop(); }
      return r;
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
    // the page's answer to an orb.move: what it understood, or why not
    'orb.done': async ({ move, ok, said, why }) => ({ ok: orb.done({ id: move, ok, said, why }) }),
    'brain.complete': async (c) => think(c),
    'engine.update': async (c) => updater.run(c),
    'mcp.add': async (c) => {
      const chk = checkServer(c);
      if (chk.error) return { ok: false, error: chk.error };
      const m = store.mcp();
      if (m.mcpServers?.[c.name]) return { ok: false, error: 'A connector with that name already exists.' };
      const sv = chk.server;
      // The names of what it is given, never the values (consent.mjs, describe).
      const given = { env: Object.keys(sv.env || {}), headers: Object.keys(sv.headers || {}) };
      if (!(await ask('mcp.add', { name: c.name, command: sv.command, args: sv.args, url: sv.url, ...given }))) return { ok: false, code: 'declined', error: 'Not added.' };
      store.setMcp({ ...m, mcpServers: { ...(m.mcpServers || {}), [c.name]: sv } });
      audit.write('mcp.add', { name: c.name, transport: sv.type, command: sv.command, args: sv.args, url: sv.url, ...given });
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
    // "Bring a cloud session here" (M8). Until the spike (scripts/code-cloud-spike.mjs)
    // shows that attaching works, y3k Code only checks and says what to do: open
    // it on claude.ai, or copy it here with `claude --teleport` in a terminal —
    // after which it continues like any local session. Nothing runs from here.
    'cloud.check': async ({ ref, cwd }) => {
      const id = (/(session_[A-Za-z0-9]{10,64})/.exec(String(ref || '')) || [])[1];
      if (!id) return { ok: false, error: 'That is not a claude.ai/code session link.' };
      const checks = [];
      const d = detected.claude || (await detectAll(), detected.claude);
      checks.push({ ok: !!d?.installed, text: d?.installed ? `Claude Code ${d.version || ''} is installed` : 'Claude Code is not installed' });
      checks.push({ ok: d?.account?.state === 'signed-in', text: d?.account?.state === 'signed-in' ? 'Signed in to Claude (the session must be on this account)' : 'Sign in to Claude Code first: run `claude` in a terminal' });
      let folder = null;
      if (cwd) {
        const t = trusted(cwd);
        if (t.error) checks.push({ ok: false, text: t.error });
        else {
          folder = t.real;
          const st = await gitStatus(t.real);
          checks.push({ ok: !st.error, text: st.error ? 'The folder is not a git repository' : `On branch ${st.branch}` });
          if (!st.error) checks.push({ ok: !st.files.length, text: st.files.length ? `${st.files.length} uncommitted change(s) — teleport needs a clean folder` : 'No uncommitted changes' });
        }
      }
      return { ok: true, id, url: `https://claude.ai/code/${id}`, folder, checks, teleport: `claude --teleport ${id}` };
    },
    'cloud.bring': async ({ ref, cwd, method }) => {
      const r = await H['cloud.check']({ ref, cwd });
      if (!r.ok) return r;
      audit.write('cloud.bring', { id: r.id, method, cwd: r.folder });
      if (method === 'open') return { ok: true, open: r.url };
      return { ok: false, code: 'run-in-terminal', command: r.teleport, cwd: r.folder, error: `In a terminal, in ${r.folder || 'a clean clone of its repository'}, run: ${r.teleport} — then continue it from Past sessions.` };
    },
  };

  function hello() {
    return {
      name: 'y3k-code', version: VERSION, protocol: PROTOCOL, epoch: bus.epoch, seq: bus.seq, platform: platform(),
      modes: MODES, providers: catalog(), recent: recent(),
      // the clients that can think for your presence (brain.mjs); a page asks
      // before offering a brain, since an older engine has none
      thinkers: THINKERS,
      // it can fetch a newer version of itself and restart on it (engine.update)
      update: updater.able,
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
    if (!/^(engine\.hello|provider\.list|workspace\.(browse|recent|files)|session\.(list|load|contextUsage|limits)|git\.|models\.|mcp\.list|audit\.tail|orb\.done)/.test(cmd)) {
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
    const left = liveChildren();
    setTimeout(() => reap(left), 5500).unref?.();
  }

  emit({ type: 'engine.hello', version: VERSION, protocol: PROTOCOL });
  detectAll().then((providers) => emit({ type: 'provider.status', providers })).catch(() => {});

  return {
    epoch: bus.epoch, get seq() { return bus.seq; }, since: bus.since, subscribe: bus.subscribe,
    handle, hello, ask, shutdown, notice, detectAll, audit, orb,
    get sessionCount() { return sessions.size; }, liveChildren: liveCount,
  };
}
