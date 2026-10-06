// A tiny Chrome DevTools Protocol driver for headless Chrome — no dependencies
// (Node >= 22 has WebSocket). Used by scripts/kode-shot.mjs to look at the
// page the way a person would, on a machine with Chrome and no Playwright.
// Written 2026-10-06 to see the kode page's "black void" and the hard break
// between the pane and the orb, which no test could show.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ port = 9333, width = 1400, height = 900 } = {}) {
  mkdirSync('/tmp/y3k-shot/profile', { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/y3k-shot/profile',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
    ...(process.env.FAKECAM ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []), 'about:blank',
  ], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  if (!targets) { chrome.kill(); throw new Error('chrome did not come up'); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method) for (const f of listeners.get(d.method) || []) f(d.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (method, f) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(f); };
  const logs = [];
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  on('Runtime.consoleAPICalled', (p) => logs.push(`[${p.type}] ` + p.args.map((a) => a.value ?? a.description ?? '').join(' ')));
  on('Runtime.exceptionThrown', (p) => logs.push('[exception] ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  on('Log.entryAdded', (p) => logs.push(`[${p.entry.level}] ${p.entry.text}`));
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function goto(url) {
    const loaded = new Promise((r) => on('Page.loadEventFired', r));
    await send('Page.navigate', { url });
    await Promise.race([loaded, sleep(15000)]);
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function shot(path, clip) {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  }
  async function close() { try { ws.close(); } catch {} chrome.kill(); }
  return { send, on, goto, evaluate, shot, sleep, close, logs, chrome };
}

export function dotenv(path) {
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
