// ============================================================================
// code-host.cjs — y3k Code's engine, hosted by the desktop app.
//
// The engine (../y3k-code, packed into the app's resources) runs in an Electron
// UTILITY PROCESS: not in the window, so pressing ⌘R to pick up a new deploy
// leaves every coding session running; not in this main process, so nothing it
// does can freeze the window. It is started the first time the page asks, and
// never for anyone who does not open Code.
//
// This file is the only way between the page and the engine, and it is narrow:
//   - it answers the site's own top frame and nothing else (policy.bridgeMay)
//   - the folder a session runs in comes from the OS's own folder picker
//   - every question the engine asks is a native dialog, with "Don't allow"
//     as the default and the answer if the dialog is dismissed
//   - quitting stops every coding tool before the app goes
// ============================================================================

const { ipcMain, dialog, utilityProcess, app } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { bridgeMay } = require('./policy.cjs');

function enginePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'y3k-code', 'ipc-host.mjs')
    : path.join(__dirname, '..', 'y3k-code', 'ipc-host.mjs');
}

// An app opened from the Dock or Finder gets a bare PATH, so the coding tools
// the person installed from a terminal would look missing. Their login shell's
// environment is read once, and only PATH-like variables are taken from it.
function shellEnv() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') return resolve({});
    const sh = process.env.SHELL || '/bin/zsh';
    // A marker, because an interactive login shell may print a banner first.
    execFile(sh, ['-ilc', 'printf "__Y3K_PATH__%s\\0" "$PATH"'], { timeout: 4000, encoding: 'utf8' }, (err, out) => {
      const m = /__Y3K_PATH__([^\0]*)\0/.exec(out || '');
      resolve(!err && m && m[1] ? { PATH: m[1] } : {});
    });
  });
}

function createCodeHost({ getWin, home }) {
  let child = null;
  let starting = null;
  let n = 0;
  const replies = new Map();
  let quitting = false;
  let bye = null;

  const winOk = () => {
    const w = getWin();
    return w && !w.isDestroyed() && bridgeMay({ frameUrl: w.webContents.getURL(), isMainFrame: true }, home) ? w : null;
  };

  async function start() {
    if (child) return child;
    if (starting) return starting;
    starting = (async () => {
      const extra = await shellEnv();
      const env = { ...process.env, ...(extra.PATH ? { PATH: `${extra.PATH}${path.delimiter}${process.env.PATH || ''}` } : {}) };
      const c = utilityProcess.fork(enginePath(), [], { env, serviceName: 'y3k Code', stdio: 'inherit' });
      c.on('message', onMessage);
      c.on('exit', () => {
        if (child === c) child = null;
        for (const fn of replies.values()) fn({ ok: false, error: 'The Code engine stopped.', code: 'offline' });
        replies.clear();
        bye?.();
      });
      child = c;
      starting = null;
      return c;
    })();
    return starting;
  }

  function onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'reply') { const fn = replies.get(m.id); replies.delete(m.id); fn?.(m.result); return; }
    if (m.type === 'event') { const w = winOk(); if (w) w.webContents.send('y3k-code:event', m.event); return; }
    if (m.type === 'consent') { ask(m); return; }
    if (m.type === 'bye') bye?.();
  }

  // A native dialog, over the window, defaulting to no.
  async function ask({ id, kind, text }) {
    const w = winOk();
    const [first, ...rest] = String(text || '').split('\n');
    let allowed = false;
    if (w && !quitting) {
      const r = await dialog.showMessageBox(w, {
        type: kind === 'folder.trust' && rest.length > 1 ? 'warning' : 'question',
        title: 'y3k Code', message: first, detail: rest.join('\n') || undefined,
        buttons: ['Allow', "Don't allow"], defaultId: 1, cancelId: 1, noLink: true,
      }).catch(() => ({ response: 1 }));
      allowed = r.response === 0;
    }
    child?.postMessage({ type: 'consent', id, allowed });
  }

  function request(msg) {
    return new Promise(async (resolve) => {
      const c = await start();
      const id = ++n;
      replies.set(id, resolve);
      c.postMessage({ ...msg, id });
    });
  }

  // The folder comes from the OS's picker — the page never names a path here.
  async function pick() {
    const w = winOk();
    if (!w) return { ok: false, error: 'No window.' };
    const r = await dialog.showOpenDialog(w, { title: 'Choose a folder for y3k Code', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths?.[0]) return { ok: false, code: 'cancelled', error: 'No folder chosen.' };
    return request({ type: 'cmd', cmd: { cmd: 'workspace.open', path: r.filePaths[0] } });
  }

  const refuse = { ok: false, error: 'Not from this page.', code: 'refused' };
  const senderOk = (e) => {
    const f = e.senderFrame;
    const w = getWin();
    return !!f && !!w && !w.isDestroyed() && e.sender === w.webContents && bridgeMay({ frameUrl: f.url, isMainFrame: f === w.webContents.mainFrame }, home);
  };

  ipcMain.handle('y3k-code:cmd', async (e, obj) => {
    if (!senderOk(e)) return refuse;
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'bad command', code: 'invalid' };
    if (obj.cmd === 'workspace.pick') return pick();
    return request({ type: 'cmd', cmd: obj });
  });
  ipcMain.handle('y3k-code:since', async (e, after) => {
    if (!senderOk(e)) return [];
    return request({ type: 'since', after: Number(after) || 0 });
  });

  // Quitting: ask the engine to stop every tool, wait for it (a few seconds at
  // most), then let the app go. Nothing it started is left running.
  // `quit`: the app is going, so any question still open is answered no.
  function stopAll({ quit = false } = {}) {
    if (quit) quitting = true;
    if (!child) return Promise.resolve();
    const c = child;
    return new Promise((resolve) => {
      const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } resolve(); }, 6000);
      bye = () => { clearTimeout(t); bye = null; resolve(); };
      c.postMessage({ type: 'shutdown' });
    });
  }

  return { stopAll, running: () => !!child };
}

module.exports = { createCodeHost, shellEnv, enginePath };
