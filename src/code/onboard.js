// y3kode's front door: getting it onto this computer, pairing this browser with
// it, and making sure the coding tool is signed in — one click wherever one
// click can do it. code-view.js keeps the state; the screens are drawn here.
//
// The rules it keeps (CODE.md):
//  - It never reaches for localhost on its own. The ten ports are watched only
//    after the person clicks "Copy the start command" (or "Try again"), and for
//    ten minutes at most: a visitor who never clicks is never probed, so no one
//    meets the browser's local-network prompt for nothing.
//  - Running the copied command IS the yes (`--pair <CODE>`, CODE.md line 7):
//    the page makes the code, and the person carries it to their own computer
//    by pasting it there. Nothing here can say yes for them. The approval
//    window it opens is the engine's own page on another origin — this page
//    can open it, never script it.
//  - Each coding tool runs on the person's own sign-in, on their machine. The
//    page never asks for a Claude, ChatGPT or Google credential: it says which
//    command signs in, and checks again when they come back. A key is asked
//    for only where a key is the only way in (the open models OpenCode
//    reaches), or when the person picks "Use an API key instead" themselves.
//  - The site is reached only through `env.setup()`, handed in by main.js.
//    src/code itself never calls the site.

import { h, icon, swap } from './dom.js';
import { PORTS, randomCode, probe, pair, findPaired, findEngine, savedPairing, openApproval, hasDesktopBridge, cleanCode } from './transport.js';

// What signs each tool in, typed in Terminal. The engine says so itself
// (`loginCommand`); these are for an engine from before it did.
const LOGIN = { claude: 'claude', codex: 'codex login', gemini: 'gemini', opencode: 'opencode auth login' };
// The tools people pay for by subscription. They are never asked for a key:
// the key is the person's own opt-in, behind "Use an API key instead".
export const SIGN_IN_TOOLS = new Set(['claude', 'codex', 'gemini']);
const WATCH_EVERY_MS = 1500;          // one look at the ten ports
const WATCH_FOR_MS = 10 * 60 * 1000;  // then stop: it was asked for once, not forever
const APP_WAIT_MS = 1500;             // no blur by then: no app took y3k://
const SETUP_KEEP_MS = 30 * 60 * 1000; // the command's link lasts 24 h; ask again after 30 min

// Where a tool stands on this machine, from its provider entry:
//   ok | signed-out | not-installed | needs-key | checking | unknown
// Takes every engine this page may meet: the current `auth` string, the
// earlier 'signin-off' (read as signed-out), and the oldest, where `auth` was
// the list of methods and only `account` said whether the tool was signed in.
export function authOf(p) {
  if (!p) return 'unknown';
  let a = typeof p.auth === 'string' ? p.auth : null;
  if (a === 'signin-off') a = 'signed-out';
  if (p.installed === false || (a === 'not-installed' && p.installed !== true)) return 'not-installed';
  if (a && a !== 'unknown' && a !== 'not-installed') return a;
  if (p.installed == null) return 'checking';   // the engine is still looking
  if (p.keySet) return 'ok';
  if (p.account?.state === 'signed-in') return 'ok';
  if (p.account?.state === 'signed-out') return 'signed-out';
  return 'unknown';
}
// A tool the person has to set up before a folder and a mode are worth picking.
export const needsSetup = (p) => ['signed-out', 'not-installed', 'needs-key'].includes(authOf(p));
export const loginCommand = (p) => p?.loginCommand || LOGIN[p?.id] || p?.login || null;
export const startCommand = (setup, code) => `${String(setup.command).trim()} --pair ${code}`;
// The file from "Download the file instead" lands in Downloads on every system
// people use; `~` reads the same in Terminal and in PowerShell.
export const fileCommand = (code) => `npx -y ~/Downloads/y3k-code.tgz --pair ${code}`;
// Only our own paths and https: the setup answer is data, never a script link.
const safeHref = (u) => (typeof u === 'string' && (/^\/(?!\/)[\w./-]*$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u)) ? u : null);

// Watches the ten ports for the engine the person is starting, and connects
// the moment it answers: with the saved token if that engine still knows this
// browser, else by trading `code` for a token — only with an engine that says
// it was started with a pre-approved code (`preapproved`), so a y3kode started
// some other way is never sent a wrong guess (five of those void its code).
// One look at a time; the next starts `every` ms after the last one ends.
export function watchForEngine({ code, token = null, ports = PORTS, every = WATCH_EVERY_MS, forMs = WATCH_FOR_MS,
  probeFn = probe, pairFn = pair, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), onFound, onMiss, onEnd } = {}) {
  let live = true;
  const until = now() + forMs;
  const tried = new Map(); // port → pair attempts with this code
  (async () => {
    while (live && now() < until) {
      const up = (await Promise.all(ports.map((p) => probeFn(p)))).filter(Boolean);
      for (const e of up) {
        if (!live) return;
        if (token) {
          const again = await probeFn(e.port, { token });
          if (live && again?.paired) { live = false; onFound?.({ port: e.port, token, how: 'token' }); return; }
        }
        if (e.preapproved === true && (tried.get(e.port) || 0) < 2) {
          tried.set(e.port, (tried.get(e.port) || 0) + 1);
          const r = await pairFn(e.port, code);
          if (!live) return;
          if (r?.ok) { live = false; onFound?.({ port: e.port, token: r.token, how: 'code' }); return; }
          onMiss?.({ port: e.port, error: r?.error, status: r?.status });
        }
      }
      if (live) await wait(every);
    }
    if (live) { live = false; onEnd?.(); }
  })();
  return { stop() { live = false; }, get live() { return live; } };
}

// Copy, in the ways browsers allow it. Safari forgets the click once a fetch
// has been awaited, so a command still on its way is handed over as a promise
// inside the click (ClipboardItem); a finished one is written directly. The
// last resort is a selected, off-screen <textarea> and execCommand('copy').
export async function copyText(text) {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
  if (typeof text !== 'string') {
    if (typeof ClipboardItem !== 'undefined' && clip?.write) {
      try {
        await clip.write([new ClipboardItem({ 'text/plain': Promise.resolve(text).then((t) => new Blob([t], { type: 'text/plain' })) })]);
        return true;
      } catch { /* fall through with the finished text */ }
    }
    try { text = await text; } catch { return false; }
  }
  try { await clip.writeText(text); return true; } catch { /* no permission, or no clipboard API */ }
  try {
    const ta = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', left: '-9999px', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}

const hero = (title, sub) => h('div.cv-hero', h('div.cv-heromark', icon('laptop')), h('h2.cv-title', title), sub ? h('p.cv-sub', sub) : null);
const cmdLine = (text) => h('div.cv-cmdline.ob-cmd', h('code.cm', text));
const extLink = (href, label) => h('a.cv-link', { href, target: '_blank', rel: 'noopener noreferrer' }, label);

export function copyButton(text, label = 'Copy') {
  const b = h('button.btn.ob-copy', { type: 'button' }, label);
  b.addEventListener('click', async () => {
    const ok = await copyText(text);
    b.textContent = ok ? 'Copied' : 'Select it and copy';
    setTimeout(() => { if (b.isConnected) b.textContent = label; }, 1600);
  });
  return b;
}

// The engine's approval page, for a companion started from Terminal: what it
// asks shows there with Allow and Don't allow, first answer wins (Terminal or page).
export function approvalButton(port) {
  const b = h('button.btn.ob-approve', { type: 'button', title: 'Opens y3kode\'s own page on this computer, where you answer' }, 'Open the approval window');
  b.addEventListener('click', () => openApproval(port));
  return b;
}

// env: {
//   cmd(obj)            the engine
//   setup()             → { command, download, appUrl, … } | null — main.js asks the site
//   connected(port, token)  a watch found the engine: use this pairing now
//   pairWith(port, code)    a typed code: code-view pairs, on its pairing screen
//   providersChanged(list)  the engine answered with fresh provider entries
//   redraw()            home; redrawTools() the tools drawer, if it is open
//   forgetPairing()     the engine no longer knows this browser
//   retryDesktop()      start the app's engine again
//   watchFn             (tests) stands in for watchForEngine
// }
export function createOnboard(env) {
  const watchFn = env.watchFn || watchForEngine;
  let setupP = null;
  let setupAt = 0;
  let setupV;              // undefined: not asked yet · null: not offered here · else the answer
  let code = null;         // this page's code, the same in every command it copies until used
  let copied = null;       // null: not yet · { ok, file } after a click
  let watch = null;        // { handle, state: waiting|found|miss|ended, msg }
  let watchEl = null;      // the live status line, updated in place (no redraw)
  let app = null;          // null | opening | opened | missing
  let codeOpen = false;    // "Have a code?" opened
  let typed = '';          // what is in the code box, kept across redraws
  let tryState = null;     // "isn't running": null | looking | none
  let autoLooked = null;   // the transport already scanned for once, quietly
  const keyOpen = new Set(); // tools whose "Use an API key instead" is open

  function getSetup() {
    if (setupP && Date.now() - setupAt < SETUP_KEEP_MS) return setupP;
    setupAt = Date.now();
    setupP = Promise.resolve()
      .then(() => env.setup?.())
      .then((s) => (s?.ok && typeof s.command === 'string' && s.command.trim() ? s : null), () => null)
      .then((s) => {
        const was = setupV;
        setupV = s;
        if (!s) setupP = null;               // ask again on the next click
        if (was !== s && (was === undefined || !s)) env.redraw();
        return s;
      });
    return setupP;
  }

  // --- the watch ---------------------------------------------------------------
  function startWatch() {
    if (watch?.handle.live) return;
    watch = { state: 'waiting' };
    const token = savedPairing()?.token || null;
    watch.handle = watchFn({
      code, token,
      onFound: ({ port, token: t }) => {
        watch.state = 'found'; drawWatch();
        code = null; copied = null;          // used: the next command gets a new one
        env.connected(port, t);
      },
      onMiss: ({ status, error }) => {
        watch.state = 'miss';
        watch.msg = status === 403 || status === 410
          ? 'y3kode started from an earlier copy of the command. Copy it again and paste the new one.'
          : error || 'y3kode answered, but did not connect.';
        drawWatch();
      },
      onEnd: () => { watch.state = 'ended'; drawWatch(); },
    });
  }
  const stopWatch = () => { watch?.handle.stop(); watch = null; };

  function watchLine() {
    const w = watch;
    if (!w) return null;
    if (w.state === 'found') return h('span.lv-ok', icon('check'), ' Found it — connecting…');
    if (w.state === 'miss') return h('span', h('span.pm-pulse'), ' ', w.msg);
    if (w.state === 'ended') {
      const again = h('button.cv-link', { type: 'button' }, 'look again');
      again.addEventListener('click', () => { startWatch(); drawWatch(); });
      return h('span.muted', 'Stopped looking after 10 minutes. Started it? ', again);
    }
    return h('span', h('span.pm-pulse'), ' Waiting for y3kode to start…');
  }
  function drawWatch() { if (watchEl?.isConnected) swap(watchEl, watchLine()); }

  // --- copying the command -------------------------------------------------------
  async function copyStart({ file = false } = {}) {
    code ||= randomCode();
    const text = setupV
      ? (file ? fileCommand(code) : startCommand(setupV, code))
      : getSetup().then((s) => (s ? (file ? fileCommand(code) : startCommand(s, code)) : Promise.reject(new Error('not offered'))));
    const ok = await copyText(text);
    if (!setupV) return; // not offered here: getSetup() redrew with the older way
    copied = { ok, file: file || !!copied?.file };
    startWatch();
    env.redraw();
  }

  function stepsBlock() {
    if (!copied || !setupV || !code) return null;
    const line = copied.file ? fileCommand(code) : startCommand(setupV, code);
    watchEl = h('div.cv-status.ob-watch', watchLine());
    return h('div.ob-after',
      copied.ok ? h('div.lv-ok.cv-small', icon('check'), ' Copied. Now:') : h('div.cv-small', 'Could not copy it by itself — select the line below and copy it. Then:'),
      h('ol.ob-steps',
        h('li', h('b', 'Open Terminal'), h('span.muted', ' (Mac: ⌘-Space, type Terminal · Windows: Start, type PowerShell)')),
        h('li', h('b', 'Paste')),
        h('li', h('b', 'Press Return'))),
      cmdLine(line),
      watchEl,
      h('div.muted.cv-small', 'Leave that window open while you code. This page connects by itself — nothing to type here.'));
  }

  function nodeLine() {
    return h('div.muted.cv-small', 'Needs Node.js 20 or newer — ', extLink('https://nodejs.org', 'Get Node.js'));
  }

  function downloadLink() {
    const href = safeHref(setupV?.download);
    if (!href) return null;
    const a = h('a.cv-link.cv-small', { href, download: 'y3k-code.tgz' }, 'Download the file instead');
    // The download still needs its own line in Terminal: copy that one, and
    // watch the same way.
    a.addEventListener('click', () => { copyStart({ file: true }); });
    return a;
  }

  // A code typed by hand — for a y3kode that was started some other way and
  // printed its own. The pairing screen takes it from there.
  function codeBox() {
    if (!codeOpen) {
      const b = h('button.cv-link.cv-small', { type: 'button' }, 'Have a code from y3kode? Type it');
      b.addEventListener('click', () => { codeOpen = true; env.redraw(); });
      return b;
    }
    const input = h('input.cv-code', { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'XXXX-XXXX', maxlength: 9, 'aria-label': 'Pairing code' });
    input.value = typed;
    const status = h('div.cv-status');
    const go = h('button.btn', { type: 'button' }, 'Connect');
    const run = async () => {
      const c = cleanCode(input.value);
      if (c.length !== 8) { swap(status, h('span.lv-error', 'The code is the 8 letters and numbers y3kode printed.')); return; }
      go.disabled = true;
      swap(status, h('span.th-shimmer', 'Looking for y3kode on this computer…'));
      const eng = await findEngine();
      go.disabled = false;
      if (!eng) { swap(status, h('span.lv-error', 'y3kode is not running on this computer (or this browser cannot reach it).')); return; }
      typed = '';
      env.pairWith(eng.port, c);
    };
    input.addEventListener('input', () => { const c = cleanCode(input.value).slice(0, 8); input.value = c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; typed = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    go.addEventListener('click', run);
    return h('div.ob-codebox', h('div.cv-coderow', input, go), status);
  }

  // Path B, the command. `fallback`: this site does not hand out the engine
  // (an older server) — then the way it was started before, from a y3k clone.
  function commandPath({ title = 'Or start it from Terminal', letter = 'B' } = {}) {
    if (setupV === null) {
      return h('div.cv-card.ob-path',
        h('div.ob-pathhead', h('span.cv-stepno', letter), h('b', 'Start it from Terminal')),
        h('div.cv-step', h('span.cv-stepno', '1'), h('div', h('b', 'Start y3kode on this computer'),
          h('div.muted.cv-small', 'From the y3k folder, in Terminal:'), cmdLine('node y3k-code/bin/y3k-code.mjs'))),
        h('div.cv-step', h('span.cv-stepno', '2'), h('div', h('b', 'It opens this page by itself. Or type the code it shows:'), codeOpenNow())),
        h('div.cv-step', h('span.cv-stepno', '3'), h('div', h('b', 'Say yes in its window.'), h('div.muted.cv-small', 'A page can ask to connect; only you, at your computer, can let it.'))),
        nodeLine());
    }
    const copy = h('button.btn.btn-allow.ob-copystart', { type: 'button' }, copied ? 'Copy it again' : 'Copy the start command');
    copy.addEventListener('click', () => copyStart());
    return h('div.cv-card.ob-path.ob-cmdpath',
      h('div.ob-pathhead', h('span.cv-stepno', letter), h('b', title)),
      h('div.muted.cv-small', 'One line to paste. It fetches y3kode, starts it, and connects it to this page.'),
      h('div.cv-acts.ob-left', copy),
      stepsBlock(),
      h('div.ob-links', downloadLink(), nodeLine()),
      codeBox());
  }
  function codeOpenNow() { codeOpen = true; return codeBox(); }

  // Path A, the app. A y3k:// link the app registers; if the page neither
  // blurs nor hides within 1.5 s, nothing took it — offer the download.
  function openApp() {
    app = 'opening'; env.redraw();
    let left = false;
    const away = () => { left = true; };
    const hid = () => { if (document.hidden) left = true; };
    window.addEventListener('blur', away);
    document.addEventListener('visibilitychange', hid);
    try { location.href = 'y3k://code'; } catch { /* no handler at all */ }
    setTimeout(() => {
      window.removeEventListener('blur', away);
      document.removeEventListener('visibilitychange', hid);
      app = left ? 'opened' : 'missing';
      env.redraw();
    }, APP_WAIT_MS);
  }

  function appPath() {
    // The app's own window without the bridge: a y3k app from before y3kode.
    const oldApp = typeof navigator !== 'undefined' && /\bElectron\//.test(navigator.userAgent) && !hasDesktopBridge();
    const appUrl = safeHref(setupV?.appUrl);
    const dl = appUrl ? h('a.btn', { href: appUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Download the app') : null;
    let status = null;
    if (app === 'opening') status = h('div.cv-status', h('span.th-shimmer', 'Opening the y3k app…'));
    else if (app === 'opened') status = h('div.cv-status.lv-ok', 'The y3k app is open — y3kode is behind its laptop.');
    else if (app === 'missing') status = h('div.cv-status', dl ? 'The y3k app is not on this computer yet.' : 'The y3k app did not open. Start y3kode from Terminal instead — it works without the app.');
    const open = h('button.btn.btn-allow', { type: 'button' }, 'Open the y3k app');
    open.addEventListener('click', openApp);
    return h('div.cv-card.ob-path.ob-apppath',
      h('div.ob-pathhead', h('span.cv-stepno', 'A'), h('b', 'Use the y3k app — y3kode is built in')),
      h('div.muted.cv-small', oldApp ? 'This y3k app is from before y3kode. The new one has it inside.' : 'Nothing else to install: open the app, then its laptop.'),
      h('div.cv-acts.ob-left', oldApp ? dl || open : open, app === 'missing' && !oldApp ? dl : null),
      status);
  }

  // The first-run card: two ways in, one button each.
  function firstRun({ unpaired = false } = {}) {
    if (setupV === undefined) getSetup();
    return h('div.cv-center.ob-first',
      hero('Get y3kode on this computer', 'y3kode runs the coding tools you already use — Claude Code, Codex, Gemini CLI, OpenCode — on your own computer, signed in as you. You see every step, and every change before it happens.'),
      unpaired ? h('div.cv-note.warn', 'This browser was disconnected from y3kode — pair again below.') : null,
      appPath(),
      commandPath());
  }

  // A saved pairing that cannot reach its engine: most often, it is simply not
  // running. Try again looks on all ten ports with the saved token (the engine
  // takes the first free one, so after a restart it may be on another).
  async function tryAgain({ quiet = false } = {}) {
    if (!quiet) { tryState = 'looking'; env.redraw(); }
    const token = savedPairing()?.token;
    const hit = await findPaired(token);
    if (hit) { tryState = null; env.connected(hit.port, token); return; }
    if (quiet) return;
    // Something answers, but not to this browser's token: it was unpaired.
    if (await findEngine()) { tryState = null; env.forgetPairing(); return; }
    tryState = 'none';
    env.redraw();
  }

  function notRunning({ transport }) {
    if (transport?.kind === 'desktop') {
      const again = h('button.btn.btn-allow', { type: 'button' }, 'Try again');
      again.addEventListener('click', () => env.retryDesktop());
      return h('div.cv-center', hero('y3kode did not start', 'It runs inside the app, and something stopped it.'), h('div.cv-card', h('div.cv-acts.ob-left', again)));
    }
    if (setupV === undefined) getSetup();
    if (autoLooked !== transport) { autoLooked = transport; tryAgain({ quiet: true }); }
    const again = h('button.btn', { type: 'button', disabled: tryState === 'looking' }, 'Try again');
    again.addEventListener('click', () => tryAgain());
    const status = tryState === 'looking' ? h('div.cv-status', h('span.th-shimmer', 'Looking for y3kode on this computer…'))
      : tryState === 'none' ? h('div.cv-status.lv-error', 'Still not answering. Start it with the command above.') : null;
    return h('div.cv-center.ob-down',
      hero('y3kode isn\'t running on this computer', 'This browser is paired with it. Start it again, and this page connects by itself.'),
      commandPath({ title: 'Start it from Terminal', letter: '1' }),
      h('div.cv-card', h('div.cv-acts.ob-left', again, (() => { const b = h('button.cv-link.cv-small', { type: 'button' }, 'or open the y3k app'); b.addEventListener('click', openApp); return b; })()), status,
        app === 'missing' ? h('div.cv-status.muted', 'The y3k app did not open.') : null));
  }

  // The pairing screen, drawn from the state code-view keeps (home.pairing):
  //   { status: 'probing' | 'asking' | 'error', port, code, msg }
  function pairingScreen(p, { retry, back }) {
    if (p.status === 'probing') {
      return h('div.cv-center.ob-pairing', hero('Connecting to y3kode', null), h('div.cv-card', h('div.cv-status', h('span.th-shimmer', 'Looking for y3kode on this computer…'))));
    }
    if (p.status === 'asking') {
      return h('div.cv-center.ob-pairing', hero('Say yes on your computer', 'y3kode is asking whether this page may connect. Answer in its approval window — or in the Terminal window where it is running: type y, then Return.'),
        h('div.cv-card', h('div.cv-acts.ob-left', approvalButton(p.port)), h('div.cv-status', h('span.pm-pulse'), ' Waiting for your answer…')));
    }
    const input = h('input.cv-code', { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'XXXX-XXXX', maxlength: 9, 'aria-label': 'Pairing code' });
    input.value = p.typed || '';
    input.addEventListener('input', () => { const c = cleanCode(input.value).slice(0, 8); input.value = c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; p.typed = input.value; });
    const go = h('button.btn.btn-allow', { type: 'button' }, 'Try again');
    const run = () => { const c = cleanCode(input.value); retry(c.length === 8 ? c : p.code); };
    go.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    const b = h('button.btn', { type: 'button' }, 'Back');
    b.addEventListener('click', back);
    return h('div.cv-center.ob-pairing', hero('That did not connect', null),
      h('div.cv-card', h('div.cv-note.err', p.msg || 'y3kode did not answer.'),
        h('div.cv-small', p.http ? 'If y3kode printed a new code, type it here: ' : 'Is y3kode still running? Then try again — or type the code it shows: '),
        h('div.cv-coderow', input, go),
        h('div.muted.cv-small', `y3kode on port ${p.port}.`),
        h('div.cv-acts', b)));
  }

  // --- coding tools: signed in, or how to sign in ----------------------------------
  const refreshBtn = (label = 'Check again') => {
    const b = h('button.btn.ob-refresh', { type: 'button' }, label);
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Checking…';
      const r = await env.cmd({ cmd: 'provider.refresh' });
      if (r?.ok && Array.isArray(r.providers)) env.providersChanged(r.providers);
      else { b.disabled = false; b.textContent = label; }
    });
    return b;
  };

  function installButton(p) {
    const b = h('button.btn', { type: 'button' }, `Install ${p.label}`);
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Asking on your computer…';
      const r = await env.cmd({ cmd: 'provider.install', provider: p.id });
      if (!r.ok) env.toast(r.error || 'not installed');
      if (Array.isArray(r.providers)) env.providersChanged(r.providers);
      else { b.disabled = false; b.textContent = `Install ${p.label}`; }
    });
    return b;
  }

  function keyRow(id, { label, placeholder, keySet, keyUrl }) {
    const key = h('input.cv-keyin', { type: 'password', placeholder: keySet ? 'key saved — paste to replace' : placeholder, autocomplete: 'off', spellcheck: false, 'aria-label': label });
    const save = h('button.btn', { type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      const r = await env.cmd({ cmd: 'provider.setKey', provider: id, key: key.value });
      key.value = '';
      if (!r.ok) { env.toast(r.error); return; }
      env.providersChanged(r.providers); env.toast('saved on your computer');
    });
    const clr = keySet ? h('button.cv-link', { type: 'button' }, 'remove') : null;
    clr?.addEventListener('click', async () => { const r = await env.cmd({ cmd: 'provider.clearKey', provider: id }); if (r.ok) env.providersChanged(r.providers); });
    return h('div.cv-keyrow', key, save, clr, keyUrl ? extLink(keyUrl, 'get a key') : null);
  }

  // One of the model providers OpenCode reaches, with the person's key for it.
  // There is no subscription sign-in for these: the key is the way in.
  function viaRow(v) {
    if (v.local) return h('div.cv-via', h('span.cv-viachip.on', v.label), h('span.muted.cv-small', ' — no key: start Ollama on this computer and its models appear.'));
    return h('div.cv-via',
      h('div.cv-provhead', h('span.cv-viachip' + (v.keySet ? '.on' : ''), v.label), v.keyUrl ? h('a.cv-link.cv-small', { href: v.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'get a key') : null),
      v.notice ? h('div.muted.cv-small', v.notice) : null,
      keyRow(v.id, { label: `${v.label} key`, placeholder: `${v.label} key`, keySet: v.keySet }));
  }

  // What to do about a tool that is not ready: the steps, never a key prompt
  // for a tool that has its own sign-in.
  function toolSetup(p) {
    const st = authOf(p);
    const name = p.label || p.id;
    if (st === 'checking') return h('div.muted.cv-small', h('span.th-shimmer', 'checking…'));
    if (st === 'not-installed') {
      return h('div.ob-setup',
        h('div.cv-small', `${name} is not on this computer yet. To install it, run this in Terminal:`),
        p.install ? h('div.ob-cmdrow', cmdLine(p.install), copyButton(p.install)) : null,
        h('div.cv-acts.ob-left', p.ready !== false ? installButton(p) : null, refreshBtn()));
    }
    if (st === 'signed-out') {
      const login = loginCommand(p) || 'its sign-in command';
      return h('div.ob-setup.ob-signin',
        h('div.cv-small', 'Sign in to ', h('b', name), ' first: open Terminal, run ', h('code.cm', login), ', sign in, then come back.'),
        h('div.cv-acts.ob-left', copyButton(login), refreshBtn()));
    }
    if (st === 'needs-key') {
      if (p.via) return h('div.ob-setup', h('div.cv-small', `${name} runs open models with your key for one of them — or signs in with `, h('code.cm', loginCommand(p)), '.'), h('div.cv-vias', p.via.map(viaRow)));
      return h('div.ob-setup', h('div.cv-small', `${name} is set to use an API key, and none is saved.`),
        keyRow(p.id, { label: `${p.label} API key`, placeholder: `${p.vendor} API key`, keySet: p.keySet, keyUrl: p.keyUrl }));
    }
    return null;
  }

  // Before a folder and a mode: the chosen tool, set up.
  function toolGate(p) {
    const st = authOf(p);
    const what = st === 'signed-out' ? `Sign in to ${p.label} first` : st === 'not-installed' ? `Install ${p.label} first` : `Add a key for ${p.label} first`;
    return h('div.cv-card.ob-gate', h('div.cv-cardhead', icon('key'), h('b', what)), toolSetup(p));
  }

  const STATE_CHIP = {
    ok: ['Signed in ✓', 's-signed-in'], 'signed-out': ['not signed in', 's-not-signed-in'], 'not-installed': ['not installed', 's-not-installed'],
    'needs-key': ['needs a key', 's-needs-a-key'], checking: ['checking…', 's-checking'],
  };
  function chip(p) {
    const st = authOf(p);
    let [text, cls] = STATE_CHIP[st] || [p.ready === false ? 'coming soon' : p.installed ? 'installed' : '', 's-other'];
    if (st === 'ok' && p.keySet && !p.via) [text, cls] = ['key saved', 's-key-saved'];
    else if (st === 'ok' && !SIGN_IN_TOOLS.has(p.id)) text = 'ready';
    return text ? h('span.cv-pstate.' + cls, text) : null;
  }

  // One row of the tools drawer.
  function toolRow(p) {
    const signIn = SIGN_IN_TOOLS.has(p.id);
    let key = null;
    if (signIn && authOf(p) !== 'needs-key') {
      if (p.keySet) {
        key = h('div', h('div.muted.cv-small', 'Using your API key for this, not your sign-in.'),
          keyRow(p.id, { label: `${p.label} API key`, placeholder: `${p.vendor} API key`, keySet: true, keyUrl: p.keyUrl }));
      } else if (keyOpen.has(p.id)) {
        key = h('div', h('div.muted.cv-small', 'Only if you would rather pay per use than use your sign-in.'),
          keyRow(p.id, { label: `${p.label} API key`, placeholder: `${p.vendor} API key`, keySet: false, keyUrl: p.keyUrl }));
      } else {
        const b = h('button.cv-link.cv-small.ob-usekey', { type: 'button' }, 'Use an API key instead');
        b.addEventListener('click', () => { keyOpen.add(p.id); env.redrawTools(); });
        key = h('div', b);
      }
    }
    return h('div.cv-prov' + (p.ready === false ? '.soon' : ''),
      h('div.cv-provhead', h('b', p.label), h('span.muted.cv-small', p.vendor), h('span.cv-grow'), chip(p)),
      p.note ? h('div.muted.cv-small', p.note) : null,
      authOf(p) === 'needs-key' && p.via ? null : toolSetup(p),
      key,
      p.via ? h('div.cv-vias', p.via.map(viaRow)) : null);
  }

  // "Continue in <folder> · <tool> · <mode>": the last place, the last tool.
  function continueButton({ folder, tool, mode, onGo }) {
    const b = h('button.btn.btn-allow.ob-continue', { type: 'button', title: 'Enter' },
      h('span.ob-contlabel', 'Continue in ', h('b', folder), ` · ${tool}`, mode ? ` · ${mode}` : ''), icon('chevron'));
    b.addEventListener('click', onGo);
    return b;
  }

  // The "look at your computer" banner. From a browser the engine is a
  // companion started in Terminal, and it has a window for the answer too.
  function consentNote(c, transport) {
    const what = c.kind === 'folder.trust' ? 'y3kode is asking you to trust this folder.'
      : c.kind === 'pair' ? 'y3kode is asking whether this page may connect.'
        : c.kind === 'provider.install' ? 'y3kode is asking to install a coding tool.'
          : c.kind === 'mcp.add' ? 'y3kode is asking to add a connector.'
            : 'y3kode is asking you something.';
    if (transport?.kind === 'companion' && transport.port) {
      return h('div.cv-note.warn.ob-ask', h('span.pm-pulse'), h('div.cv-grow', h('b', 'Say yes on your computer. '), what), approvalButton(transport.port));
    }
    return h('div.cv-note.warn', h('span.pm-pulse'), h('div', h('b', 'Look at your computer. '), what));
  }

  return {
    firstRun, notRunning, pairingScreen, toolSetup, toolGate, toolRow, continueButton, consentNote,
    stopWatch,
    // a pairing made some other way: nothing to wait for any more
    paired() { stopWatch(); tryState = null; codeOpen = false; copied = null; code = null; },
    get watching() { return !!watch?.handle.live; },
  };
}
