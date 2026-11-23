// ground.js — THE ISLAND'S GROUND, AS NUMBERS. No page, no three: the suite
// runs it; island.js draws it.
//
// lordhowe.bin (made by scripts/island/lordhowe-build.mjs): a 48-byte head,
// then, deflated, the heights in decimetres, each row as differences along
// it: first the island's grid (16 m apart; x east, z south, metres from the
// island's middle), then Ball's Pyramid's. Sea level is y = 0; the sea floor
// is below it.
//
// The height under a point is cut into the same two triangles a cell is drawn
// as (island.js), so a foot stands exactly on what is seen. A body may not
// walk up ground steeper than STEEP (it is held at its foot, and slides on
// it); ground that rises past a body's middle within a hand's breadth of its
// side is a cliff it can run along (body.js's wall run). In water deeper than
// SWIM it swims: it floats with its head out (its feet SWIM down).
import { levelled } from '../plinth.js';

export const HEAD = 48;
export const SEA_FLOOR = -48;              // m: the shelf beyond the grids
export const STEEP = Math.tan((50 * Math.PI) / 180);   // the steepest ground a body walks up (50 degrees)
export const SWIM = 1.35;                  // m of water past which a body swims, its feet this far down

// the head: the grids' sizes and places, and where the island is on Earth
export function parseHead(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, HEAD));
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'LHI1') throw new Error('not an island file');
  return {
    w: v.getUint16(4, true), h: v.getUint16(6, true), spacing: v.getFloat32(8, true), x0: v.getFloat32(12, true), z0: v.getFloat32(16, true),
    pw: v.getUint16(20, true), ph: v.getUint16(22, true), px0: v.getFloat32(24, true), pz0: v.getFloat32(28, true),
    lat: v.getFloat32(32, true), lon: v.getFloat32(36, true),
  };
}
// the heights, from the inflated rest of the file (its rows undone, decimetres to metres)
export function heightsOf(head, raw) {
  const n1 = head.w * head.h, n2 = head.pw * head.ph;
  if (raw.byteLength < (n1 + n2) * 2) throw new Error('the island file is cut short');
  const d = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (n1 + n2) * 2));
  const undo = (off, w, h) => { const a = new Float32Array(w * h); for (let j = 0; j < h; j++) { let v = 0; for (let i = 0; i < w; i++) { v += d[off + j * w + i]; a[j * w + i] = v / 10; } } return a; };
  return { main: undo(0, head.w, head.h), pyramid: undo(n1, head.pw, head.ph) };
}
// in a page: the file fetched and inflated by the browser's own deflate
export async function loadIsland(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the island did not arrive (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer()), head = parseHead(bytes);
  const stream = new Blob([bytes.subarray(HEAD)]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  return { head, hts: heightsOf(head, raw) };
}

// One grid's height at a point, by its cell's two triangles (00, 10, 01) and (10, 11, 01); null off the grid.
function onGrid(a, w, h, x0, z0, S, x, z) {
  const gx = (x - x0) / S, gz = (z - z0) / S;
  if (!(gx >= 0 && gz >= 0 && gx <= w - 1 && gz <= h - 1)) return null;
  const i = Math.min(w - 2, Math.floor(gx)), j = Math.min(h - 2, Math.floor(gz)), fx = gx - i, fz = gz - j;
  const h00 = a[j * w + i], h10 = a[j * w + i + 1], h01 = a[(j + 1) * w + i], h11 = a[(j + 1) * w + i + 1];
  return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function createGround(head, hts) {
  const S = head.spacing;
  const g = {
    head, hts,
    // ground levelled for a building (../plinth.js levelFor): each eases the ground under its pad to its level
    flats: [],
    // the ground as the tiles have it, before anything was levelled
    base(x, z) {
      const a = onGrid(hts.main, head.w, head.h, head.x0, head.z0, S, x, z);
      if (a !== null) return a;
      const b = onGrid(hts.pyramid, head.pw, head.ph, head.px0, head.pz0, S, x, z);
      return b !== null ? b : SEA_FLOOR;
    },
    // the ground's height (the sea floor where it is under the sea; the shelf off both grids), levelled where it was
    height(x, z) {
      let h = g.base(x, z);
      for (const f of g.flats) h = levelled(f, x, z, h);
      return h;
    },
    // which way it rises, and how steeply (rise over run, along x and along z)
    slope(x, z, e = 0.5) { return [(g.height(x + e, z) - g.height(x - e, z)) / (2 * e), (g.height(x, z + e) - g.height(x, z - e)) / (2 * e)]; },
    // how deep the sea is over the ground (0 on land)
    depth(x, z) { return Math.max(0, -g.height(x, z)); },
    // where a body's feet are held: on the ground, or swimming with its feet SWIM down in deeper water
    floor(x, z) { const h = g.height(x, z); return h < -SWIM ? -SWIM : h; },
    // a cliff beside a body (feet at p): the ground rising past its middle within `reach` of its side, in eight ways round;
    // answers the face's outward way and how near, as world.wall does
    wall(p, rad = 0.3, reach = 0.22) {
      const top = p[1] + 1.2;
      let best = null;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, ux = Math.cos(a), uz = Math.sin(a);
        for (const d of [rad, rad + reach]) {
          if (g.height(p[0] + ux * d, p[2] + uz * d) > top) { if (!best || d < best.d) best = { d, n: [-ux, -uz] }; break; }
        }
      }
      if (!best) return null;
      // the face's way more truly: the ground's fall line where it rose
      const [sx, sz] = g.slope(p[0] - best.n[0] * best.d, p[2] - best.n[1] * best.d), m = Math.hypot(sx, sz);
      if (m > STEEP) best.n = [-sx / m, -sz / m];
      return best;
    },
    // a body's step on the ground: up anything gentler than STEEP; up anything steeper it is held (it may go along
    // or down it). Answers where it may be across the ground, from where it was.
    step(was, to) {
      const [sx, sz] = g.slope(to[0], to[2]), m = Math.hypot(sx, sz);
      if (m <= STEEP) return to;
      const ux = sx / m, uz = sz / m, mx = to[0] - was[0], mz = to[2] - was[2], up = mx * ux + mz * uz;
      return up > 0 ? [to[0] - ux * up, to[1], to[2] - uz * up] : to;
    },
    // a line from `from` to `to` (the eye's): how far along it before it would be in the ground (1: clear)
    clear(from, to, above = 0.35, n = 24) {
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t, z = from[2] + (to[2] - from[2]) * t;
        if (y < g.height(x, z) + above) return (i - 1) / n;
      }
      return 1;
    },
  };
  return g;
}

// The sea's sheet, as numbers: a fan of SEGS round its middle, then RINGS each GROW times as wide as the one inside it,
// out past the eye's furthest (45 km), all at y = 0 and facing up (its triangles wound counter-clockwise seen from
// above). island.js moves it with the eye, and the waves move its points (water.js), so near the eye they are close: a
// sixteenth of the distance apart along the way out, a thirtieth across (half a metre at ten metres).
export const SEA_RINGS = { segs: 192, rings: 202, first: 0.4, grow: 1.06 };
export function seaSheet({ segs, rings, first, grow } = SEA_RINGS) {
  const pos = [0, 0, 0], idx = [];
  for (let k = 0, r = first; k < rings; k++, r *= grow) for (let i = 0; i < segs; i++) { const a = (i / segs) * 2 * Math.PI; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let k = 0; k < rings - 1; k++) for (let i = 0; i < segs; i++) {
    const a = 1 + k * segs + i, b = 1 + k * segs + ((i + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}
