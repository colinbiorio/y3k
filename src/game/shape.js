// shape.js — WHAT THE BODIES ARE MADE WITH. Nothing in the void is a model
// file: a body is arithmetic, and these are its four tools.
//
//   loft    a skin drawn through cross-sections stacked up an axis (a chest, a
//           thigh, a head, a plate): each section a half-width, a half-depth
//           (front and back may differ), where its middle is, and how square
//           it is. Smooth between sections, round at the ends.
//   tube    a skin round a line of points that moves every frame (an arm of
//           the octopus, an antenna, a braid, a ribbon of light).
//   cloth   a hanging sheet that falls, trails and is pushed out of the legs
//           (a coat's skirt, a cloak, a veil). It lives in the world, not on
//           the bones: still air is what makes it stream.
//   kit     collects what is drawn on each bone and makes one mesh for each
//           bone and material.
//
// And the surfaces: small seamless grey tiles in ./art/v1/ (made with
// Higgsfield from our brief: wool, linen, bronze, glaze, skin, engraved) that
// a material's own colour is multiplied by, and that are its relief too.
//
// A body faces +Z and its left is +X. Round a section the angle runs from the
// back (-Z) by the left (+X) to the front (+Z) and on, so a skin's seam is
// behind it.
import * as THREE from 'three';

const spow = (c, p) => Math.sign(c) * Math.pow(Math.abs(c), p);
const TAU = Math.PI * 2;

// sections [y, w, d | [front, back], z = 0, e = 2, x = 0], made whole and put in order: [y, w, front, back, z, e, x]
const whole = (stations) => {
  const S = stations.map(([y, w, d, z = 0, e = 2, x = 0]) => [y, w, Array.isArray(d) ? d[0] : d, Array.isArray(d) ? d[1] : d, z, e, x]);
  if (S[0][0] > S[S.length - 1][0]) S.reverse();
  return S;
};
// the section at a height: smooth between those given (a Hermite spline through them)
function sectionAt(S, y) {
  const n = S.length;
  let i = 0; while (i < n - 2 && y >= S[i + 1][0]) i++;
  const a = S[i], b = S[i + 1], h = b[0] - a[0], t = Math.min(1, Math.max(0, (y - a[0]) / Math.max(1e-9, h))), t2 = t * t, t3 = t2 * t;
  const slope = (k, f) => { const p = S[Math.max(0, k - 1)], q = S[Math.min(n - 1, k + 1)]; return (q[f] - p[f]) / Math.max(1e-6, q[0] - p[0]); };
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2, r = [a[0] + h * t];
  for (let f = 1; f < 7; f++) r.push(h00 * a[f] + h10 * h * slope(i, f) + h01 * b[f] + h11 * h * slope(i + 1, f));
  r[1] = Math.max(r[1], 1e-4); r[2] = Math.max(r[2], 1e-4); r[3] = Math.max(r[3], 1e-4); r[5] = Math.max(r[5], 0.6);
  return r;
}
function ringsOf(stations, sub) {
  const S = whole(stations), out = [];
  for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < sub; k++) out.push(sectionAt(S, S[i][0] + (S[i + 1][0] - S[i][0]) * (k / sub) + (k ? 0 : 1e-12)));
  out.push(sectionAt(S, S[S.length - 1][0]));
  return out;
}
// where a section's edge is at an angle: [x, z]
const edge = (r, th) => { const p = 2 / r[5], c = Math.cos(th), s = Math.sin(th); return [r[6] + r[1] * spow(c, p), r[4] + (s >= 0 ? r[2] : r[3]) * spow(s, p)]; };

// A point on a skin: (y, th, lift) → [x, y, z], at a height and an angle round it, `lift` off its surface.
export function on(stations) {
  const S = whole(stations);
  return (y, th, lift = 0) => {
    const r = sectionAt(S, y), [x, z] = edge(r, th);
    if (!lift) return [x, y, z];
    const a = edge(r, th - 0.02), b = edge(r, th + 0.02), tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    return [x + (lift * tz) / l, y, z - (lift * tx) / l];
  };
}
// A piece laid on a skin (a plate, a collar, a belt, the opening of a coat): between the heights y[0] and
// y[1], and at each height between the two angles th says (th(v), v = 0 at the bottom and 1 at the top; or
// one pair for all), `lift` off the skin, with a rim down to it so that it has a thickness.
export function panel(stations, { y, th, lift = 0.004, rows = 6, cols = 8, tile = 0.3, rim = true } = {}) {
  const at = on(stations), span = typeof th === 'function' ? th : () => th;
  const m = cols + 1, pos = [], uv = [], idx = [];
  const where = (i, j, l) => { const v = i / rows, [a, b] = span(v); return at(y[0] + (y[1] - y[0]) * v, a + (b - a) * (j / cols), l); };
  for (let i = 0; i <= rows; i++) {                           // the tile's middle is at the piece's middle
    let across = 0, was = null; const us = [];
    for (let j = 0; j < m; j++) {
      const p = where(i, j, lift);
      if (was) across += Math.hypot(p[0] - was[0], p[2] - was[2]);
      was = p; pos.push(p[0], p[1], p[2]); us.push(across);
    }
    const mid = (us[Math.floor(cols / 2)] + us[Math.ceil(cols / 2)]) / 2;
    for (let j = 0; j < m; j++) uv.push(0.5 + (us[j] - mid) / tile, 0.5 + ((y[1] - y[0]) * (i / rows - 0.5)) / tile);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; idx.push(a, c, b, b, c, d); }
  if (rim) {
    const side = (list, flip) => {
      const base = pos.length / 3;
      for (const [i, j] of list) { const t = where(i, j, lift), b = where(i, j, -0.001), o = (i * m + j) * 2; pos.push(t[0], t[1], t[2], b[0], b[1], b[2]); uv.push(uv[o], uv[o + 1], uv[o], uv[o + 1]); }
      for (let k = 0; k < list.length - 1; k++) { const t0 = base + 2 * k, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3; if (flip) idx.push(t0, b0, t1, t1, b0, b1); else idx.push(t0, t1, b0, t1, b1, b0); }
    };
    const row = (i) => Array.from({ length: m }, (_, j) => [i, j]), col = (j) => Array.from({ length: rows + 1 }, (_, i) => [i, j]);
    side(row(0), false); side(row(rows), true); side(col(0), true); side(col(cols), false);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// a round end: rings that close over the last one; k is the dome's height as a share of the smaller half-width
function capOf(r, dir, k, n = 4) {
  const h = k * Math.min(r[1], (r[2] + r[3]) / 2), out = [];
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI / 2, s = Math.max(Math.cos(a), 0.003);
    out.push([r[0] + dir * h * Math.sin(a), r[1] * s, r[2] * s, r[3] * s, r[4], r[5], r[6]]);
  }
  return out;
}

// A skin through sections listed along Y (either way up). cap: [bottom, top], 0 open, else how domed.
// arc: [from, to] in radians for part of the way round (a plate, a hood); tile: metres a repeat of its surface.
export function loft(stations, { seg = 20, sub = 3, cap = [1, 1], tile = 0.3, arc = null } = {}) {
  let R = ringsOf(stations, sub);
  const dome = (k) => (k > 0.6 ? 7 : 4);                         // a tall dome wants more rings
  if (cap[0]) R = [...capOf(R[0], -1, cap[0], dome(cap[0])).reverse(), ...R];
  if (cap[1]) R = [...R, ...capOf(R[R.length - 1], 1, cap[1], dome(cap[1]))];
  const [a0, a1] = arc || [-Math.PI / 2, 1.5 * Math.PI], whole = !arc;
  const n = R.length, m = seg + 1;
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2), idx = [];
  const mid = R[n >> 1], round = Math.PI * (mid[1] + (mid[2] + mid[3]) / 2) * (a1 - a0) / TAU;
  const ru = whole ? Math.max(1, Math.round(round / tile)) : round / tile;
  let along = 0;
  for (let i = 0; i < n; i++) {
    const [y, w, df, db, z, e, x] = R[i], p = 2 / e;
    if (i) along += Math.hypot(y - R[i - 1][0], w - R[i - 1][1]);
    for (let j = 0; j < m; j++) {
      const th = a0 + (a1 - a0) * j / seg, c = Math.cos(th), s = Math.sin(th), o = i * m + j;
      pos[o * 3] = x + w * spow(c, p); pos[o * 3 + 1] = y; pos[o * 3 + 2] = z + (s >= 0 ? df : db) * spow(s, p);
      uv[o * 2] = ru * j / seg; uv[o * 2 + 1] = along / tile;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nor = geo.attributes.normal.array;
  if (whole) for (let i = 0; i < n; i++) {                       // the seam is one edge, not two
    const a = (i * m) * 3, b = (i * m + seg) * 3;
    let x = nor[a] + nor[b], y = nor[a + 1] + nor[b + 1], z = nor[a + 2] + nor[b + 2]; const l = Math.hypot(x, y, z) || 1;
    nor[a] = nor[b] = x / l; nor[a + 1] = nor[b + 1] = y / l; nor[a + 2] = nor[b + 2] = z / l;
  }
  for (const [i, on, y] of [[0, cap[0], -1], [n - 1, cap[1], 1]]) if (on) for (let j = 0; j < m; j++) { const o = (i * m + j) * 3; nor[o] = 0; nor[o + 1] = y; nor[o + 2] = 0; }
  return geo;
}
// A limb from the joint it hangs from (the origin) down its own -Y: shape is [how far along 0..1, w, d = w, z = 0, e = 2, x = 0].
export function limb(length, shape, opts = {}) {
  return loft(along(length, shape), { seg: 14, cap: [1, 1], ...opts });
}
// a limb's sections as a skin's (for `on` and `panel`): [how far along, half-width, half-depth, z] → [y, …]
export const along = (length, shape) => shape.map(([t, w, d = w, z = 0, e = 2, x = 0]) => [-t * length, w, d, z, e, x]);
// a ball, squashed: [rx, ry, rz]
export function ball(r, seg = 16) { const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7))); g.scale(r[0], r[1], r[2]); return g; }
// a ring lying flat (round Y): radius, thickness, squash of the ring [x, z]
export function hoop(radius, thick, squash = [1, 1], seg = 28) { const g = new THREE.TorusGeometry(radius, thick, 8, seg); g.rotateX(Math.PI / 2); g.scale(squash[0], 1, squash[1]); return g; }

// placed: a geometry turned (x, y, z, in that order of writing; applied Z, then X, then Y) and moved
export function placed(geo, at = [0, 0, 0], rot = null, scale = null) {
  if (scale) geo.scale(scale[0], scale[1], scale[2]);
  if (rot) { if (rot[2]) geo.rotateZ(rot[2]); if (rot[0]) geo.rotateX(rot[0]); if (rot[1]) geo.rotateY(rot[1]); }
  geo.translate(at[0], at[1], at[2]);
  return geo;
}
// the same shape for the other side of the body
export function mirrored(geo) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array, ix = geo.index.array;
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return geo;
}
// many into one (each has position, normal, uv and an index); the many are let go
export function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let v = 0, i = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k++) idx[i + k] = ix[k] + v;
    v += g.attributes.position.count; i += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// What is drawn on each bone, by material: put() as the body is described, build() once, dispose() at the end.
export function kit() {
  const bins = new Map(), made = [], mats = new Set(), extra = [];
  return {
    put(bone, mat, geo) { if (!bins.has(bone)) bins.set(bone, new Map()); const b = bins.get(bone); if (!b.has(mat)) b.set(mat, []); b.get(mat).push(geo); mats.add(mat); return geo; },
    // a mesh of its own (something that moves by itself: a wing, a cloth, a tube)
    own(parent, geo, mat, { cull = true } = {}) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = cull; parent.add(m); extra.push(geo); for (const x of [].concat(mat)) mats.add(x); return m; },
    mat(m) { mats.add(m); return m; },
    build() { for (const [bone, b] of bins) for (const [mat, list] of b) { const g = merge(list); made.push(g); bone.add(new THREE.Mesh(g, mat)); } bins.clear(); },
    each(fn) { for (const m of mats) fn(m); },
    dispose() { for (const g of made) g.dispose(); for (const g of extra) g.dispose(); for (const m of mats) m.dispose(); },
  };
}

// ── a skin round a moving line ────────────────────────────────────────────
// n points; radius(t) is a number or [across, through] at t = 0..1 along it. set(P, hint) lays it on the
// points P (x, y, z, x, y, z, …): `hint` says which way its "through" side faces at the first point, and
// that is carried down the line without twisting.
export function tube(n, { seg = 8, radius = () => 0.02, tile = 0.3, length = 1 } = {}) {
  const m = seg + 1, pos = new Float32Array(n * m * 3), nor = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2), idx = [];
  const rad = [], C = [], S = [];
  for (let i = 0; i < n; i++) { const r = radius(i / (n - 1)); rad.push(Array.isArray(r) ? r : [r, r]); }
  for (let j = 0; j < m; j++) { C.push(Math.cos(TAU * j / seg)); S.push(Math.sin(TAU * j / seg)); }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { uv[(i * m + j) * 2] = j / seg; uv[(i * m + j) * 2 + 1] = (i / (n - 1)) * length / tile; }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  function set(P, hint = [0, 0, 1]) {
    let nx = hint[0], ny = hint[1], nz = hint[2];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const d = nx * tx + ny * ty + nz * tz; nx -= d * tx; ny -= d * ty; nz -= d * tz;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-5) { nx = Math.abs(ty) < 0.9 ? 0 : 1; ny = Math.abs(ty) < 0.9 ? 1 : 0; nz = 0; const e = nx * tx + ny * ty; nx -= e * tx; ny -= e * ty; nz -= e * tz; nl = Math.hypot(nx, ny, nz); }
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const rx = rad[i][0], rz = rad[i][1], px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      for (let j = 0; j < m; j++) {
        const c = C[j], s = S[j], o = (i * m + j) * 3;
        pos[o] = px + rx * c * bx + rz * s * nx; pos[o + 1] = py + rx * c * by + rz * s * ny; pos[o + 2] = pz + rx * c * bz + rz * s * nz;
        const qx = rz * c * bx + rx * s * nx, qy = rz * c * by + rx * s * ny, qz = rz * c * bz + rx * s * nz, ql = Math.hypot(qx, qy, qz) || 1;
        nor[o] = qx / ql; nor[o + 1] = qy / ql; nor[o + 2] = qz / ql;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  }
  return { geo, set, n };
}
// a tube laid once on a line that does not move (a horn, a curl, a strap): points [[x, y, z], …]
export function pipe(points, opts = {}, hint = [0, 0, 1]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  const t = tube(points.length, { length, ...opts });
  t.set(points.flat(), hint);
  return t.geo;
}
// more points through a few, smoothly (Catmull-Rom): [[x, y, z], …] → [[x, y, z], …]
export function through(points, per = 4) {
  const out = [], n = points.length, at = (i) => points[Math.min(n - 1, Math.max(0, i))];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < per; k++) {
    const t = k / per, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    out.push([0, 1, 2].map((f) => 0.5 * (2 * b[f] + (c[f] - a[f]) * t + (2 * a[f] - 5 * b[f] + 4 * c[f] - d[f]) * t * t + (3 * b[f] - a[f] - 3 * c[f] + d[f]) * t * t * t)));
  }
  out.push(points[n - 1].slice());
  return out;
}

// ── cloth ─────────────────────────────────────────────────────────────────
// cols x (rows + 1) points. The top row is held on a bone (`anchor`, at `top[c]` in the bone's own
// space); each point below hangs `len[r]` from the one above, is drawn toward where the garment was cut
// to hang (`dir(c, r)`, in the bone's space: stiff says how firmly), falls, keeps its distance from its
// neighbours across, and is pushed out of `shapes` (capsules { a, b, r } in the world) and kept over the
// water. The points are in the world: the mesh must be a child of something that never moves.
export function cloth({ anchor, cols, rows, top, dir, len, closed = false, hem = 0, tile = 0.3, stiff = 0.15, damp = 0.9, gravity = 7, lift = 0, scale = 1 }) {
  const R1 = rows + 1, N = cols * R1, P = new Float32Array(N * 3), Q = new Float32Array(N * 3);
  const L = Array.from({ length: R1 }, (_, r) => (r ? (Array.isArray(len) ? len[r - 1] : len) * scale : 0));     // `scale`: how much bigger the bone's body is drawn than it was measured
  const D = new Float32Array(N * 3), DW = new Float32Array(N * 3), A = new Float32Array(cols * 3), A0 = new Float32Array(cols * 3);
  for (let c = 0; c < cols; c++) for (let r = 1; r < R1; r++) { const d = dir(c, r), l = Math.hypot(d[0], d[1], d[2]) || 1, o = (r * cols + c) * 3; D[o] = d[0] / l; D[o + 1] = d[1] / l; D[o + 2] = d[2] / l; }
  // how far apart neighbours across are, as it was cut
  const W = new Float32Array(N), rest = new Float32Array(N * 3);
  for (let c = 0; c < cols; c++) { rest[c * 3] = top[c][0] * scale; rest[c * 3 + 1] = top[c][1] * scale; rest[c * 3 + 2] = top[c][2] * scale; }
  for (let r = 1; r < R1; r++) for (let c = 0; c < cols; c++) { const o = (r * cols + c) * 3, u = ((r - 1) * cols + c) * 3; for (let k = 0; k < 3; k++) rest[o + k] = rest[u + k] + D[o + k] * L[r]; }
  const pairs = closed ? cols : cols - 1;
  for (let r = 0; r < R1; r++) for (let c = 0; c < pairs; c++) { const a = (r * cols + c) * 3, b = (r * cols + (c + 1) % cols) * 3; W[r * cols + c] = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]); }
  // the mesh: one more column when it goes all the way round, so its surface can wrap
  const MC = closed ? cols + 1 : cols, pos = new Float32Array(MC * R1 * 3), nor = new Float32Array(MC * R1 * 3), uv = new Float32Array(MC * R1 * 2), idx = [];
  let across = 0, down = 0;
  const us = [0]; for (let c = 0; c < MC - 1; c++) { across += W[cols + (c % cols)] || W[c % cols]; us.push(across); }
  const ru = closed ? Math.max(1, Math.round(across / tile)) / across : 1 / tile;
  for (let r = 0; r < R1; r++) { down += L[r]; for (let c = 0; c < MC; c++) { uv[(r * MC + c) * 2] = us[c] * ru; uv[(r * MC + c) * 2 + 1] = -down / tile; } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (let r = 0; r < rows; r++) for (let c = 0; c < MC - 1; c++) { const a = r * MC + c, b = a + 1, c2 = a + MC, d = c2 + 1; idx.push(a, b, c2, b, d, c2); }
  geo.setIndex(idx);
  if (hem) { const cut = (rows - hem) * (MC - 1) * 6; geo.addGroup(0, cut, 0); geo.addGroup(cut, hem * (MC - 1) * 6, 1); }
  let ready = false;
  const M = () => anchor.matrixWorld.elements;
  function hold() {                                         // the bone, now: where the top row is and which way the cut hangs
    const e = M(), k = 1 / (Math.hypot(e[0], e[1], e[2]) || 1);
    for (let c = 0; c < cols; c++) { const [x, y, z] = top[c]; A[c * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; A[c * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; A[c * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
    for (let i = cols; i < N; i++) { const o = i * 3, x = D[o], y = D[o + 1], z = D[o + 2]; DW[o] = (e[0] * x + e[4] * y + e[8] * z) * k; DW[o + 1] = (e[1] * x + e[5] * y + e[9] * z) * k; DW[o + 2] = (e[2] * x + e[6] * y + e[10] * z) * k; }
  }
  function write() {
    for (let r = 0; r < R1; r++) for (let c = 0; c < MC; c++) {
      const s = (r * cols + (c % cols)) * 3, o = (r * MC + c) * 3;
      pos[o] = P[s]; pos[o + 1] = P[s + 1]; pos[o + 2] = P[s + 2];
      const cl = closed ? (c + cols - 1) % cols : Math.max(0, c - 1), cr = closed ? (c + 1) % cols : Math.min(cols - 1, c + 1);
      const l = (r * cols + cl) * 3, rr = (r * cols + cr) * 3, u = (Math.max(0, r - 1) * cols + (c % cols)) * 3, d = (Math.min(rows, r + 1) * cols + (c % cols)) * 3;
      const ax = P[rr] - P[l], ay = P[rr + 1] - P[l + 1], az = P[rr + 2] - P[l + 2], bx = P[d] - P[u], by = P[d + 1] - P[u + 1], bz = P[d + 2] - P[u + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, nl = Math.hypot(nx, ny, nz) || 1;
      nor[o] = nx / nl; nor[o + 1] = ny / nl; nor[o + 2] = nz / nl;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  }
  function settle() {                                       // as it was cut, where the bone is now
    hold();
    for (let c = 0; c < cols; c++) for (let k = 0; k < 3; k++) P[c * 3 + k] = A[c * 3 + k];
    for (let r = 1; r < R1; r++) for (let c = 0; c < cols; c++) { const o = (r * cols + c) * 3, u = ((r - 1) * cols + c) * 3; for (let k = 0; k < 3; k++) P[o + k] = P[u + k] + DW[o + k] * L[r]; }
    Q.set(P); A0.set(A); ready = true;
  }
  return {
    geo, points: P, cols, rows,
    settle,
    // the origin was moved under the body: everything goes with it
    shift(dx, dy, dz) { for (let i = 0; i < N; i++) { P[i * 3] += dx; P[i * 3 + 1] += dy; P[i * 3 + 2] += dz; Q[i * 3] += dx; Q[i * 3 + 1] += dy; Q[i * 3 + 2] += dz; } for (let c = 0; c < cols; c++) { A0[c * 3] += dx; A0[c * 3 + 1] += dy; A0[c * 3 + 2] += dz; } },
    step(dt, shapes = [], floor = 0, k = stiff) {
      if (!ready) { settle(); write(); return; }
      hold();
      if (dt <= 0) { for (let i = 0; i < cols * 3; i++) P[i] = A[i]; write(); return; }
      const h = Math.min(dt, 1 / 30), n = 2, hs = h / n;
      for (let s = 1; s <= n; s++) {
        const f = s / n;
        for (let i = 0; i < cols * 3; i++) P[i] = A0[i] + (A[i] - A0[i]) * f;
        for (let i = cols; i < N; i++) {
          const o = i * 3;
          for (let q = 0; q < 3; q++) { const v = (P[o + q] - Q[o + q]) * damp; Q[o + q] = P[o + q]; P[o + q] += v; }
          P[o + 1] -= (gravity - lift) * hs * hs;
        }
        for (let it = 0; it < 2; it++) {
          for (let r = 1; r < R1; r++) for (let c = 0; c < cols; c++) {
            const o = (r * cols + c) * 3, u = o - cols * 3, l = L[r];
            let x = P[o] + (P[u] + DW[o] * l - P[o]) * k, y = P[o + 1] + (P[u + 1] + DW[o + 1] * l - P[o + 1]) * k, z = P[o + 2] + (P[u + 2] + DW[o + 2] * l - P[o + 2]) * k;
            const dx = x - P[u], dy = y - P[u + 1], dz = z - P[u + 2], dl = Math.hypot(dx, dy, dz) || 1e-6, g = l / dl;
            P[o] = P[u] + dx * g; P[o + 1] = P[u + 1] + dy * g; P[o + 2] = P[u + 2] + dz * g;
          }
          for (let r = 1; r < R1; r++) for (let c = 0; c < pairs; c++) {
            const a = (r * cols + c) * 3, b = (r * cols + (c + 1) % cols) * 3, w = W[r * cols + c];
            const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], dl = Math.hypot(dx, dy, dz) || 1e-6;
            const want = dl < 0.6 * w ? 0.6 * w : dl > 1.12 * w ? 1.12 * w : dl;
            if (want !== dl) { const g = 0.5 * (dl - want) / dl; P[a] += dx * g; P[a + 1] += dy * g; P[a + 2] += dz * g; P[b] -= dx * g; P[b + 1] -= dy * g; P[b + 2] -= dz * g; }
          }
          for (let i = cols; i < N; i++) {
            const o = i * 3;
            for (const sh of shapes) {
              const ax = sh.a[0], ay = sh.a[1], az = sh.a[2], ex = sh.b[0] - ax, ey = sh.b[1] - ay, ez = sh.b[2] - az, ee = ex * ex + ey * ey + ez * ez;
              const t = ee > 1e-9 ? Math.min(1, Math.max(0, ((P[o] - ax) * ex + (P[o + 1] - ay) * ey + (P[o + 2] - az) * ez) / ee)) : 0;
              const dx = P[o] - ax - ex * t, dy = P[o + 1] - ay - ey * t, dz = P[o + 2] - az - ez * t, d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < sh.r * sh.r && d2 > 1e-10) { const g = sh.r / Math.sqrt(d2); P[o] = ax + ex * t + dx * g; P[o + 1] = ay + ey * t + dy * g; P[o + 2] = az + ez * t + dz * g; }
            }
            if (P[o + 1] < floor) P[o + 1] = floor;
          }
        }
      }
      A0.set(A);
      write();
    },
  };
}

// ── surfaces ──────────────────────────────────────────────────────────────
export const TILE = { wool: 0.14, linen: 0.16, bronze: 0.5, glaze: 0.42, skin: 0.3, engraved: 0.5 };
const MEAN = 0.8;                       // what a tile's grey comes to, on the whole
const kept = new Map();
const asTile = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t; };
// a tile; `soft` < 1 is the same tile with that share of its light and dark left (a surface less worn)
const tile = (name, soft = 1) => {
  const key = soft < 1 ? `${name}:${soft}` : name;
  if (!kept.has(key)) kept.set(key, soft < 1 ? tile(name).then((t) => t && softened(t, soft)) : new Promise((res) => {
    new THREE.TextureLoader().load(new URL(`./art/v1/${name}.webp`, import.meta.url).href, (t) => res(asTile(t)), undefined, () => res(null));
  }));
  return kept.get(key);
};
function softened(t, soft) {
  const im = t.image, c = document.createElement('canvas'), g = c.getContext('2d'), grey = Math.round(MEAN * 255);
  c.width = im.width; c.height = im.height;
  g.fillStyle = `rgb(${grey},${grey},${grey})`; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = soft; g.drawImage(im, 0, 0);
  return asTile(new THREE.CanvasTexture(c));
}
// every tile asked for so far has arrived (or failed to)
export const settled = () => Promise.all([...kept.values()]);
// A material that wears one of the tiles: its colour is multiplied by the tile, and (relief > 0) the tile
// is its relief too. Until the tile has arrived it is its plain colour, dimmed by as much as the tile will.
export function surfaced(mat, name, relief = 0, soft = 1) {
  mat.color.multiplyScalar(MEAN);
  tile(name, soft).then((t) => {
    if (!t) return;
    mat.color.multiplyScalar(1 / MEAN); mat.map = t;
    if (relief) { mat.bumpMap = t; mat.bumpScale = relief; }
    mat.needsUpdate = true;
  });
  return mat;
}
export const shade = (hex, k) => { const c = new THREE.Color(hex); return k >= 0 ? c.lerp(new THREE.Color('#ffffff'), k) : c.multiplyScalar(1 + k); };

// What things are made of. On a small machine (`lite`) the plain kind of each: no relief, no second coat.
export function stuff(lite = false) {
  const made = (o, more = null) => (lite || !more ? new THREE.MeshStandardMaterial(o) : new THREE.MeshPhysicalMaterial({ ...o, ...more }));
  const rel = (k) => (lite ? 0 : k);
  return {
    wool: (color, o = {}) => surfaced(made({ color, roughness: 0.95, metalness: 0, ...o }, { sheen: 0.25, sheenRoughness: 0.5, sheenColor: shade(color, 0.2) }), 'wool', rel(1.6)),
    linen: (color, o = {}) => surfaced(made({ color, roughness: 0.9, metalness: 0, ...o }), 'linen', rel(1.8)),
    leather: (color, o = {}) => surfaced(made({ color, roughness: 0.66, metalness: 0, ...o }), 'skin', rel(1.4)),
    skin: (color, o = {}) => surfaced(made({ color, roughness: 0.6, metalness: 0, ...o }), 'skin', rel(0.5)),
    bronze: (color, { relief = 1, soft = 1, ...o } = {}) => surfaced(made({ color, roughness: 0.36, metalness: 1, ...o }), 'bronze', rel(relief), soft),
    ceramic: (color, o = {}) => surfaced(made({ color, roughness: 0.34, metalness: 0, ...o }, { clearcoat: 0.6, clearcoatRoughness: 0.22 }), 'glaze', rel(0.5)),
    engraved: (color, o = {}) => surfaced(made({ color, roughness: 0.4, metalness: 0, ...o }, { clearcoat: 0.4, clearcoatRoughness: 0.3 }), 'engraved', rel(2)),
    // a shell: a hard coat over it, and colours that move as it turns
    chitin: (color, o = {}) => surfaced(made({ color, roughness: 0.4, metalness: 0, ...o }, { clearcoat: 0.85, clearcoatRoughness: 0.2, iridescence: 0.5, iridescenceIOR: 1.35, iridescenceThicknessRange: [120, 420] }), 'skin', rel(0.35), 0.5),
    plain: (color, o = {}) => made({ color, roughness: 0.6, metalness: 0, ...o }),
    glow: (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    // the air round a light: laid a little larger over what glows
    halo: (color, opacity = 0.22) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}
