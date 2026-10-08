#!/usr/bin/env node
// A POST'S MEDIA, IN CHROMIUM (audit, 2026-10-08). The composer says the
// server's limits when a file is picked, fits a large photo instead of
// refusing it, refuses an animated GIF with the reason, and posts a clip the
// feed then plays from byte ranges (a 206, which Safari needs to play at all).
// The chat fits a large photo under what a turn can carry before attaching it.
// The vision judge is faked inside the server, as in test/media.test.mjs.
//
//   node scripts/media-smoke.mjs [--port <n>] [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { deflateSync } from 'node:zlib';
import { MEDIA_CAPS, CHAT_IMAGE_MAX, ANIMATED, tooLarge } from '../src/media-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const shots = arg('--shots');
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

// A photo-like PNG over the 3MB cap: a gradient with grain, which deflate
// cannot squeeze (about 2 bytes a pixel) and JPEG can.
function photoPng(w, h) {
  const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const td = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); td.copy(out, 4); out.writeUInt32BE(crc(td), 8 + data.length); return out; };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let seed = 7;
  const grain = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 16) % 41 - 20; };
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, 40 + (x / w) * 180 + grain()));
      raw[i + 1] = Math.max(0, Math.min(255, 70 + (y / h) * 120 + grain()));
      raw[i + 2] = Math.max(0, Math.min(255, 160 - (x / w) * 90 + grain()));
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const GIF2 = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]),
  ...[0, 1].map(() => Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00])), Buffer.from([0x3b])]);

const JUDGE = `
const real = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') return real(url, opts);
  return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"safe": true, "reason": ""}' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};`;
const tmp = mkdtempSync(join(tmpdir(), 'y3k-media-smoke-'));
mkdirSync(join(tmp, 'data'));
const port = Number(arg('--port')) || await freePort();
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(JUDGE).toString('base64')}`, 'server.mjs'], {
  cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), ANTHROPIC_API_KEY: '', FOUNDER_PASSWORD: '', RENDER: '' },
});
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(180000);   // a shared machine, software GL: every action is slow
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const mediaAnswers = [];
page.on('response', (r) => { if (/\/media\/[0-9a-f-]{36}$/.test(r.url())) mediaAnswers.push(r.status()); });
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const status = () => page.textContent('#compose-status');
const waitStatus = (want) => page.waitForFunction((w) => document.getElementById('compose-status')?.textContent === w, want).catch(() => {});

try {
  // The account is made here and signed into through the card, as a person
  // would: a remembered session is asked for with a 2.5s limit, which a loaded
  // machine running software GL can miss.
  const r = await fetch(`${SITE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'mediasmoke@example.com', username: 'mediasmoke', password: 'a-long-password-1', age17: true, terms: true }) });
  check('signed up', r.ok, String(r.status));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 180000 });
  await page.fill('#login-email', 'mediasmoke');
  await page.fill('#login-pass', 'a-long-password-1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.click('#nav-post');
  await page.waitForSelector('#compose-modal.open #seg-human');
  await page.click('#seg-human');
  await page.waitForSelector('#compose-human:not([hidden])');

  console.log('the composer says the limits when a file is picked:');
  await page.setInputFiles('#compose-file', { name: 'three-minutes.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(MEDIA_CAPS.video + 1024 * 1024) });
  await waitStatus(tooLarge('video'));
  check('a clip over 24MB is refused by its size, on the spot', (await status()) === tooLarge('video'), await status());
  await page.fill('#compose-text', 'a harbour, and a clip of it');
  await shot('1-composer-video-too-large');
  await page.setInputFiles('#compose-file', { name: 'loop.gif', mimeType: 'image/gif', buffer: GIF2 });
  await waitStatus(ANIMATED);
  check('an animated GIF is refused, with the reason', (await status()) === ANIMATED, await status());

  const big = photoPng(1800, 1300);
  check('the photo is over the 3MB cap as it comes', big.length > MEDIA_CAPS.image, String(big.length));
  await page.setInputFiles('#compose-file', { name: 'harbour.png', mimeType: 'image/png', buffer: big });
  await page.waitForSelector('#media-preview:not([hidden]) #media-stage img').catch(() => {});
  const fitted = await page.evaluate(async () => {
    const img = document.querySelector('#media-stage img');
    if (!img) return null;
    const b = await fetch(img.src).then((x) => x.blob());
    return { size: b.size, type: b.type, w: img.naturalWidth, h: img.naturalHeight, status: document.getElementById('compose-status').textContent };
  });
  check('a photo over the cap is redrawn to fit, not refused', fitted && fitted.size <= MEDIA_CAPS.image && fitted.type === 'image/jpeg' && fitted.w === 1800 && !fitted.status, JSON.stringify(fitted));
  await shot('2-composer-photo-fitted');

  // A real clip, recorded in the page from a canvas.
  const added = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    let f = 0;
    const tick = setInterval(() => { g.fillStyle = `hsl(${f * 9} 60% 45%)`; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText(String(f++), 120, 140); }, 66);
    rec.start(); await new Promise((r) => setTimeout(r, 3000)); rec.stop(); clearInterval(tick);
    await new Promise((r) => { rec.onstop = r; });
    const dt = new DataTransfer();
    dt.items.add(new File(parts, 'clip.webm', { type: 'video/webm' }));
    const input = document.getElementById('compose-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    return parts.reduce((n, p) => n + p.size, 0);
  });
  await page.waitForFunction(() => document.querySelectorAll('#media-dots i').length === 2, null).catch(() => {});
  check('the recorded clip joins the photo', (await page.evaluate(() => document.querySelectorAll('#media-dots i').length)) === 2, `clip of ${added} bytes`);

  console.log('posted, and played from byte ranges:');
  await page.evaluate(() => localStorage.setItem('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-smoke-not-a-key', model: null })));
  await page.click('#compose-post');
  await page.waitForFunction(() => !document.getElementById('compose-modal').classList.contains('open')).catch(() => {});
  check('the post went up', !(await page.evaluate(() => document.getElementById('compose-modal').classList.contains('open'))), await status());
  await page.waitForSelector('video[src^="/media/"]').catch(() => {});
  const played = await page.evaluate(async () => {
    const vids = [...document.querySelectorAll('video[src^="/media/"]')];
    const v = vids[0];
    if (!v) return { found: false };
    v.scrollIntoView({ block: 'center' });
    v.muted = true;
    if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 90000); });
    const duration = v.duration;
    const seeked = await new Promise((r) => { v.addEventListener('seeked', () => r(true), { once: true }); v.currentTime = Math.max(0, (duration || 2) - 0.5); setTimeout(() => r(false), 90000); });
    return { found: true, duration, seeked, readyState: v.readyState };
  });
  check('the feed\'s video loads its metadata and seeks', played.found && played.duration > 1 && played.seeked, JSON.stringify(played));
  // Chromium's player asks for its media in byte ranges on its own.
  check('the player was answered with a 206', mediaAnswers.includes(206), JSON.stringify(mediaAnswers));
  await page.waitForTimeout(800);
  await shot('3-feed-with-the-post');

  console.log('the chat fits a large photo before attaching it:');
  await page.setInputFiles('#chat-file', { name: 'harbour.png', mimeType: 'image/png', buffer: big });
  await page.waitForSelector('#chat-thumb:not([hidden])').catch(() => {});
  const att = await page.evaluate(() => { const t = document.getElementById('chat-thumb'); return { shown: !t.hidden, b64: (t.getAttribute('src') || '').replace(/^data:[^;,]*;base64,/, '').length, type: (t.getAttribute('src') || '').slice(0, 23) }; });
  check('attached as a JPEG within what a turn carries', att.shown && att.b64 > 0 && att.b64 <= CHAT_IMAGE_MAX && att.type === 'data:image/jpeg;base64,', JSON.stringify(att));
  await shot('4-chat-photo-attached');
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await page.screenshot({ path: join(tmp, 'error.png') }).catch(() => {});
  console.log('    (screenshot: ' + join(tmp, 'error.png') + ')');
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll media checks passed.');
process.exit(failures ? 1 : 0);
