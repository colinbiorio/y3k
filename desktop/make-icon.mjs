// ============================================================================
// make-icon.mjs — the app icon, built from the wordmark.
//
// icon.png is the y3k mark in liquid metal on transparency, 485x746. An app
// icon has to be square and has to have a ground, or the mark floats on
// whatever the dock happens to be over. This lays it on the room's own near
// black and pads it out to each square anything asks for.
//
// Written with nothing but node's zlib, deliberately. This repo has no build
// step and no dependencies, and adding an image library to draw one square
// would be the largest thing in it. PNG is a simple format: a header, some
// deflated scanlines each with a filter byte, an end marker. That is all this
// reads and all it writes.
//
//   node desktop/make-icon.mjs
//
// Rerun it if the mark changes. The outputs are committed, so nobody needs to
// run it to build the app or to serve the site.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GROUND = [4, 3, 10];      // #04030a — the renderer's own clear colour
const MARGIN = 0.10;            // how much air around the mark

// WHAT GETS WRITTEN, and who asks for it. The big one is for electron-builder,
// which renders every size macOS wants out of a single 1024 square. The two
// small ones are for the web manifest, which wants exactly 192 and 512 — a
// browser installing the site to a dock or a home screen reaches for those by
// name. They are rescaled from the mark rather than from each other, so the
// 192 is a clean resampling of the original strokes and not a resampling of a
// resampling.
const OUTPUTS = [
  { size: 1024, file: 'desktop/icon-app.png' },
  { size: 512, file: 'icon-512.png' },
  { size: 192, file: 'icon-192.png' },
];

// ---- read ------------------------------------------------------------------
function readPng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let at = 8, w = 0, h = 0, depth = 0, color = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; color = body[9];
      if (body[12] !== 0) throw new Error('interlaced pngs are not read here');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8 || (color !== 6 && color !== 2)) throw new Error(`only 8-bit RGB/RGBA, got depth ${depth} colour ${color}`);
  const ch = color === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  // UNFILTER. Each scanline carries one byte saying how it was encoded against
  // the line above and the pixel to the left; undoing that is the whole of
  // reading a PNG once it is inflated.
  const stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= ch) ? prev[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}

// ---- write -----------------------------------------------------------------
function writePng(file, w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none. It is an icon, not a payload.
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const b = Buffer.alloc(8 + body.length + 4);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, 'ascii'); body.copy(b, 8);
    b.writeInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), body])), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc = (b) => { let c = -1; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return c ^ -1; };

// ---- compose ---------------------------------------------------------------
const src = readPng(ROOT + 'icon.png');

// Bilinear, because the mark is being shrunk by more than half and nearest
// neighbour on a thin metal stroke is a staircase.
const at = (x, y, c) => {
  x = Math.max(0, Math.min(src.w - 1, x)); y = Math.max(0, Math.min(src.h - 1, y));
  const i = (y * src.w + x) * src.ch;
  return c === 3 ? (src.ch === 4 ? src.px[i + 3] : 255) : src.px[i + c];
};

for (const { size, file } of OUTPUTS) {
  const fit = Math.min((size * (1 - MARGIN * 2)) / src.w, (size * (1 - MARGIN * 2)) / src.h);
  const dw = Math.round(src.w * fit), dh = Math.round(src.h * fit);
  const ox = Math.round((size - dw) / 2), oy = Math.round((size - dh) / 2);

  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = GROUND[0]; out[i * 4 + 1] = GROUND[1]; out[i * 4 + 2] = GROUND[2]; out[i * 4 + 3] = 255;
  }
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) / fit - 0.5, sy = (y + 0.5) / fit - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const s = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        s[c] = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy)
             + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
      }
      const a = s[3] / 255;
      if (a <= 0.002) continue;
      const d = ((oy + y) * size + (ox + x)) * 4;
      for (let c = 0; c < 3; c++) out[d + c] = Math.round(s[c] * a + out[d + c] * (1 - a));
    }
  }
  writePng(ROOT + file, size, size, out);
  console.log(`${file.padEnd(22)} ${size}x${size}, mark at ${dw}x${dh}`);
}
