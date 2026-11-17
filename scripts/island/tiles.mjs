// tiles.mjs — ELEVATION TILES, READ. The public AWS Terrain Tiles (Mapzen's
// "terrarium" PNGs: height = R·256 + G + B/256 − 32768 metres, in Web
// Mercator, 256 pixels a tile) decoded without any library: the PNG's chunks,
// its deflated rows, their five filters. Only what lordhowe-build.mjs needs.
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6) || w > 4096 || h > 4096) throw new Error(`a PNG this reader does not read (${w}x${h}, depth ${bd}, type ${ct})`);
  const bpp = ct === 2 ? 3 : 4, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(h * stride);
  if (raw.length < h * (stride + 1)) throw new Error('a PNG cut short');
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y > 0 ? px[dst - stride + x] : 0, c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

// A zoom's tiles in a folder (t<z>_<x>_<y>.png), as one height function over Web Mercator: lat, lon in degrees
// to metres (bilinear between pixel centres). Answers NaN where no tile was fetched.
export function mosaic(dir, z) {
  const tiles = new Map(), N = 256 * 2 ** z;
  const tile = (tx, ty) => {
    const k = tx + '_' + ty;
    if (!tiles.has(k)) {
      const f = join(dir, `t${z}_${tx}_${ty}.png`);
      let hts = null;
      if (existsSync(f)) {
        const { w, h, bpp, px } = readPng(readFileSync(f));
        if (w !== 256 || h !== 256) throw new Error('a tile not 256 square: ' + f);
        hts = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) hts[i] = px[i * bpp] * 256 + px[i * bpp + 1] + px[i * bpp + 2] / 256 - 32768;
      }
      tiles.set(k, hts);
    }
    return tiles.get(k);
  };
  const at = (X, Y) => { const tx = Math.floor(X / 256), ty = Math.floor(Y / 256), t = tile(tx, ty); return t ? t[(Y - ty * 256) * 256 + (X - tx * 256)] : NaN; };
  // lat, lon → global pixel (centres at +0.5)
  const pixel = (lat, lon) => { const la = (lat * Math.PI) / 180; return [((lon + 180) / 360) * N - 0.5, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * N - 0.5]; };
  return {
    height(lat, lon) {
      const [X, Y] = pixel(lat, lon), x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    },
    pixel,
  };
}
