#!/usr/bin/env node
// AIRDEN'S MARK, FROM ANY PICTURE OF IT. Writes air_logo.png — white ink on
// clear, cropped to the ink — which is what the liquid metal pours from (the
// chat box's crest, src/airden.js, and the portal): mercury reads a mark from
// its alpha, so a logo drawn on paper would pour as a solid block.
//
//   node scripts/air-logo.mjs <source.png> [out.png]
//
// A source that is already transparent keeps its own alpha. One drawn on an
// opaque ground (the cream of mind/assets/images/airden-logo.png) is lifted
// off it: the ground is read from the corners, and each pixel is as solid as
// it is far from the ground toward the darkest ink. Uses the Chromium that
// Playwright already has, so it needs nothing installed.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [src, out = join(dirname(fileURLToPath(import.meta.url)), '..', 'air_logo.png')] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/air-logo.mjs <source.png> [out.png]'); process.exit(2); }

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
const r = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 8) clear++;
  const transparent = clear > (W * H) / 10;
  let bg = 0, ink = 255;
  if (!transparent) {
    const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
    bg = corners.reduce((n, i) => n + lum(i), 0) / 4;
    const ls = [];
    for (let i = 0; i < d.length; i += 4 * 7) ls.push(lum(i));
    ls.sort((a, b) => a - b);
    ink = ls[Math.floor(ls.length * 0.01)];
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let a;
    if (transparent) a = d[i + 3] / 255;
    else { a = Math.min(1, Math.max(0, (bg - lum(i)) / Math.max(1, bg - ink))); a = a * a * (3 - 2 * a); }
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    if (a > 0.08) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  g.putImageData(id, 0, 0);
  const m = 12; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { w: o.width, h: o.height, transparent, png: o.toDataURL('image/png').split(',')[1] };
}, readFileSync(src).toString('base64'));
await browser.close();
writeFileSync(out, Buffer.from(r.png, 'base64'));
console.log(`${out}: ${r.w}×${r.h}, white ink on clear (${r.transparent ? 'kept its own transparency' : 'lifted off its ground'})`);
