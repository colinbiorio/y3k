// THE ORB'S HANDS ON THIS COMPUTER. Colin, 2026-10-19: "give option for full
// control over computer with your orb as a transparent entity with its own
// cursor that floats around showing what is being accessed / clicked /
// interacted with ... make it visually appealing to the user in a way that
// shows what you're doing as best you can."
//
// What this file is: the engine's three verbs for that, on this machine only.
//   computer.look  a picture of the main screen (so the presence can see it)
//   computer.act   one action: move, click, double, right, scroll, type, key
//   computer.stop  stop at once, and forget the yes
// The deciding happens elsewhere (the page asks the presence's own brain for
// one action at a time); this file only does what it is told, one step at a
// time, and only after the person said yes here.
//
// THE LINES IT KEEPS.
//  - Off until asked, then asked on THIS computer (consent 'computer.control',
//    a native dialog in the y3k app, defaulting to no). The yes lasts until
//    stop, an engine restart, or ten idle minutes; then it is asked again.
//  - Every action is announced BEFORE it happens ('computer.action', with what
//    and where), so the overlay can fly the orb's cursor there and say what it
//    is about to do, and the audit log keeps the same line.
//  - A stop is immediate and sticky: anything in flight is refused after it.
//  - macOS first (screencapture, sips, CoreGraphics through osascript). Other
//    systems say plainly that they are not supported yet.
//  - Typing is capped, keys are one combination at a time, coordinates must be
//    on the picture it was given. Nothing here reads files or runs commands
//    the presence chose.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './proc.mjs';

export const ACTIONS = ['move', 'click', 'double', 'right', 'scroll', 'type', 'key'];
export const MAX_TYPE = 2000;
export const LOOK_MAX = 1280;               // the picture's longest side, in pixels
export const IDLE_MS = 10 * 60 * 1000;      // a yes left unused this long is asked again
export const SHOW_MS = 420;                 // the cursor's flight before the action lands

// macOS virtual key codes for the named keys a presence may press
const KEYS = {
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51, escape: 53, esc: 53,
  left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96,
};
const MODS = { cmd: 'command down', command: 'command down', ctrl: 'control down', control: 'control down', alt: 'option down', option: 'option down', shift: 'shift down' };

// "cmd+shift+t" → { key: 't' | code, using: [...] } or null
export function parseKey(s) {
  const parts = String(s || '').toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  const key = parts.pop();
  const using = [];
  for (const m of parts) { if (!MODS[m]) return null; using.push(MODS[m]); }
  if (Object.hasOwn(KEYS, key)) return { code: KEYS[key], using };
  if (/^[a-z0-9]$/.test(key) || /^[`\-=[\]\\;',./]$/.test(key)) return { char: key, using };
  return null;
}

// The JavaScript-for-Automation that does one action. Pure: a test reads it.
export function script(a) {
  const P = (x, y) => `$.CGPointMake(${x}, ${y})`;
  const post = (type, x, y, btn = 0, clicks = 1) =>
    `(()=>{const e=$.CGEventCreateMouseEvent($(), ${type}, ${P(x, y)}, ${btn}); $.CGEventSetIntegerValueField(e, 1, ${clicks}); $.CGEventPost(0, e);})();`;
  const head = "ObjC.import('CoreGraphics');";
  switch (a.action) {
    case 'move': return `${head}${post(5, a.x, a.y)}`;
    case 'click': return `${head}${post(5, a.x, a.y)}${post(1, a.x, a.y)}${post(2, a.x, a.y)}`;
    case 'right': return `${head}${post(5, a.x, a.y)}${post(3, a.x, a.y, 1)}${post(4, a.x, a.y, 1)}`;
    case 'double': return `${head}${post(5, a.x, a.y)}${post(1, a.x, a.y)}${post(2, a.x, a.y)}${post(1, a.x, a.y, 0, 2)}${post(2, a.x, a.y, 0, 2)}`;
    case 'scroll': return `${head}${post(5, a.x, a.y)}$.CGEventPost(0, $.CGEventCreateScrollWheelEvent2($(), 0, 1, ${Math.round(-a.dy)}, 0, 0));`;
    case 'type': return `Application('System Events').keystroke(${JSON.stringify(a.text)});`;
    case 'key': {
      const k = a.parsed;
      const using = k.using.length ? `, {using: ${JSON.stringify(k.using)}}` : '';
      return k.code != null ? `Application('System Events').keyCode(${k.code}${using});` : `Application('System Events').keystroke(${JSON.stringify(k.char)}${using});`;
    }
    default: return '';
  }
}

// Check and normalise one action against the last picture's size. → { action } | { error }
export function checkAction(a, shot) {
  if (!a || typeof a !== 'object' || !ACTIONS.includes(a.action)) return { error: `Unknown action. One of: ${ACTIONS.join(', ')}.` };
  const out = { action: a.action, label: typeof a.label === 'string' ? a.label.replace(/[\u0000-\u001f]+/g, ' ').slice(0, 120) : '' };
  if (['move', 'click', 'double', 'right', 'scroll'].includes(a.action)) {
    if (!shot) return { error: 'Look first: a position is on the last picture.' };
    const x = Number(a.x), y = Number(a.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > shot.w || y > shot.h) return { error: 'That position is not on the picture.' };
    // picture pixels → screen points
    out.x = Math.round(x * shot.screenW / shot.w);
    out.y = Math.round(y * shot.screenH / shot.h);
    if (a.action === 'scroll') {
      const dy = Number(a.dy ?? a.amount ?? 3);
      if (!Number.isFinite(dy) || Math.abs(dy) > 50) return { error: 'Scroll by -50 to 50 lines.' };
      out.dy = dy;
    }
  }
  if (a.action === 'type') {
    if (typeof a.text !== 'string' || !a.text) return { error: 'Type what?' };
    if (a.text.length > MAX_TYPE) return { error: `At most ${MAX_TYPE} characters at a time.` };
    out.text = a.text;
  }
  if (a.action === 'key') {
    const k = parseKey(a.key);
    if (!k) return { error: 'A key like "return", "cmd+t" or "shift+tab".' };
    out.key = String(a.key).toLowerCase(); out.parsed = k;
  }
  return { action: out };
}

export function createComputer({ ask, emit, audit, tmpDir, os = process.platform, runner = run, now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let granted = 0;          // when the yes was given (0: none)
  let lastUse = 0;
  let stopped = false;
  let asking = null;
  let shot = null;          // the last picture's sizes: { w, h, screenW, screenH }
  const able = os === 'darwin';
  const NOT_HERE = { ok: false, code: 'unsupported', error: 'Computer control works on macOS for now.' };

  async function yes() {
    if (granted && now() - lastUse < IDLE_MS) return true;
    granted = 0;
    if (!asking) asking = ask('computer.control', {}).finally(() => { asking = null; });
    const ok = await asking;
    if (ok) { granted = now(); lastUse = now(); stopped = false; }
    return ok;
  }

  async function screenSize() {
    const r = await runner('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('AppKit'); const f=$.NSScreen.mainScreen.frame; JSON.stringify({w:f.size.width,h:f.size.height})"], { timeout: 8000 });
    try { const s = JSON.parse(String(r.stdout).trim()); if (s.w > 0 && s.h > 0) return s; } catch { /* below */ }
    return null;
  }

  async function look() {
    if (!able) return NOT_HERE;
    if (!(await yes())) return { ok: false, code: 'declined', error: 'Not allowed on the computer.' };
    if (stopped) return { ok: false, code: 'stopped', error: 'Stopped.' };
    const dir = mkdtempSync(join(tmpDir, 'look-'));
    try {
      const f = join(dir, 'screen.jpg');
      const c = await runner('screencapture', ['-x', '-m', '-t', 'jpg', f], { timeout: 15000 });
      if (c.code !== 0) return { ok: false, code: 'no-picture', error: 'The screen could not be captured. Give the y3k app Screen Recording in System Settings → Privacy & Security.' };
      await runner('sips', ['-Z', String(LOOK_MAX), f], { timeout: 15000 });
      const dims = await runner('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f], { timeout: 8000 });
      const w = Number(/pixelWidth:\s*(\d+)/.exec(dims.stdout)?.[1]), h = Number(/pixelHeight:\s*(\d+)/.exec(dims.stdout)?.[1]);
      const screen = await screenSize();
      if (!w || !h || !screen) return { ok: false, code: 'no-picture', error: 'The screen could not be measured.' };
      shot = { w, h, screenW: screen.w, screenH: screen.h };
      lastUse = now();
      audit?.write('computer.look', { w, h });
      return { ok: true, image: readFileSync(f).toString('base64'), w, h };
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } }
  }

  async function act(a) {
    if (!able) return NOT_HERE;
    if (stopped) return { ok: false, code: 'stopped', error: 'Stopped.' };
    if (!(await yes())) return { ok: false, code: 'declined', error: 'Not allowed on the computer.' };
    const c = checkAction(a, shot);
    if (c.error) return { ok: false, code: 'invalid', error: c.error };
    const x = c.action;
    // shown first: the cursor flies there and says what it is about to do
    emit({ type: 'computer.action', action: x.action, x: x.x ?? null, y: x.y ?? null, label: x.label || '', text: x.action === 'type' ? x.text.slice(0, 80) : '', key: x.key || '' });
    audit?.write('computer.act', { action: x.action, x: x.x ?? null, y: x.y ?? null, chars: x.text?.length || 0, key: x.key || null, label: x.label });
    await wait(SHOW_MS);
    if (stopped) return { ok: false, code: 'stopped', error: 'Stopped.' };
    const r = await runner('osascript', ['-l', 'JavaScript', '-e', script(x)], { timeout: 15000 });
    lastUse = now();
    if (r.code !== 0) {
      const why = String(r.stderr || '');
      if (/not allowed|assistive|accessibility|1002|-1719|-25211/i.test(why)) return { ok: false, code: 'no-access', error: 'macOS blocked it: give the y3k app Accessibility in System Settings → Privacy & Security.' };
      return { ok: false, code: 'failed', error: why.split('\n')[0].slice(0, 200) || 'It did not work.' };
    }
    return { ok: true };
  }

  function stop() {
    stopped = true; granted = 0; shot = null;
    emit({ type: 'computer.stopped' });
    audit?.write('computer.stop', {});
    return { ok: true };
  }

  const status = () => ({ ok: true, able, granted: !!granted && now() - lastUse < IDLE_MS, stopped });

  return { look, act, stop, status };
}
