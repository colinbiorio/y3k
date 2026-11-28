#!/usr/bin/env node
// rocks-build.mjs — THE ISLAND'S ROCKS AND THE BEACH'S THINGS, as the page carries them: scanned models from Poly Haven
// (polyhaven.com, CC0: no rights reserved; credited all the same), each cut down to a few levels of detail, and what
// rock-textures.py needs to give every level the whole scan's shape in its light.
//
//   node scripts/island/rocks-build.mjs fetch <downloads>                       # the scans (2k glTF), from Poly Haven's API
//   node scripts/island/rocks-build.mjs make <downloads> <work> <out> --meshopt <dir>   # the meshes; then rock-textures.py
//
// <out> is src/game/island/rocks/. Needs the meshoptimizer package (MIT, npm; `--meshopt` is its folder: the repo itself
// depends on nothing) and curl (fetch). What `make` writes:
//
//   <out>/rocks.bin      'ROK1', then, deflated: a head (JSON: each model's name, scan, size, texture layer and its levels)
//                        and each level's points (16 bits a coordinate over the model's own box), normals (8 bits),
//                        texture coordinates (16 bits) and triangles (16 bits)
//   <work>/<name>-frame.f32, <work>/rocks-bake.json   for rock-textures.py: at each texel of the model's own picture, the
//                        whole scan's normal and tangent there (its triangles drawn in their texture's own space)
//
// WHY ITS OWN FILE. The page reads no glTF (three's loader is not among the game's files); a rock is a few thousand
// points, and this is a quarter of a megabyte for all of them.
//
// HOW A SCAN IS CUT DOWN. meshoptimizer's simplifier (edge collapses that keep the scan's own points and its texture's
// seams) to about 3,000 triangles, 600 and 120: the nearest for a rock within a few of its own lengths, the last for one a
// few pixels high. Its fine shape is not lost: rock-textures.py turns the scan's normal map into one in the model's own
// space (from the frames written here), which any level reads by the same texture coordinates; a level's own triangles
// are only its outline.
//
// WHICH SCANS (judged against photographs of Lord Howe: the basalt talus under Mount Lidgbird's walls is angular blocks,
// its boulder shores sea-rounded grey cobbles and boulders, black where wet; the beaches clean coral sand with a few
// bleached sticks, a shell, a lump of coral):
//   block    boulder_01               1.3 x 1.8 x 1.0 m   a jagged, fractured boulder: the talus's blocks
//   slab     namaqualand_boulder_03   2.4 x 3.1 x 1.5 m   a great angular block, flat-faced: the largest near the walls, the shore's ledges
//   chunk    rock_07                  0.17 x 0.32 x 0.14  a blocky fragment: the smaller talus
//   boulder  namaqualand_boulder_06   0.7 x 1.2 x 0.65 m  a rounded boulder: the boulder shores
//   cobble   namaqualand_boulder_05   1.4 x 0.75 x 0.5 m  a rounded, flatter one: the shores, the lagoon's edge
//   stick    dead_quiver_branch_01    0.44 m              a bleached, forked branch
//   log      dead_tree_trunk          3.05 m              a drift log
//   shell    lambis_shell             0.14 m              a spider conch
//   coral    stone_01                 0.15 m              a pitted lump: coral rubble
// (their colours are not the island's: rock-textures.py grades each to it.)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// name, Poly Haven id, the triangles each level is cut to, its texture layer and its cell there ([column, row, cells a
// side]: the beach's small things share one layer, a quarter each), the texels a side its frame is drawn at
export const MODELS = [
  { name: 'block', id: 'boulder_01', lods: [3200, 640, 130], layer: 0, cell: [0, 0, 1], bake: 2048 },
  { name: 'slab', id: 'namaqualand_boulder_03', lods: [3200, 640, 130], layer: 1, cell: [0, 0, 1], bake: 2048 },
  { name: 'chunk', id: 'rock_07', lods: [1800, 360, 90], layer: 2, cell: [0, 0, 1], bake: 2048 },
  { name: 'boulder', id: 'namaqualand_boulder_06', lods: [2400, 480, 110], layer: 3, cell: [0, 0, 1], bake: 2048 },
  { name: 'cobble', id: 'namaqualand_boulder_05', lods: [2200, 440, 100], layer: 4, cell: [0, 0, 1], bake: 2048 },
  { name: 'stick', id: 'dead_quiver_branch_01', lods: [700, 160], layer: 5, cell: [0, 0, 2], bake: 1024 },
  { name: 'log', id: 'dead_tree_trunk', lods: [1600, 320], layer: 5, cell: [1, 0, 2], bake: 1024 },
  { name: 'shell', id: 'lambis_shell', lods: [900, 200], layer: 5, cell: [0, 1, 2], bake: 1024 },
  { name: 'coral', id: 'stone_01', lods: [700, 160], layer: 5, cell: [1, 1, 2], bake: 1024 },
];
export const LAYERS = 6;

const argv = process.argv.slice(2), opt = (name, or) => (argv.includes('--' + name) ? argv[argv.indexOf('--' + name) + 1] : or);

// ---- fetch: each scan's 2k glTF with its buffer and its pictures, through curl, with a manifest (urls, sizes, sha256)
function fetchAll(dl) {
  const ua = 'y3k-island-rocks (open-source game; Poly Haven credited)';
  const get = (url) => execFileSync('curl', ['-sS', '-f', '-m', '600', '-A', ua, url], { maxBuffer: 1 << 30 });
  const manifest = { source: 'Poly Haven (polyhaven.com), CC0 1.0', assets: {} };
  for (const { id } of MODELS) {
    const g = JSON.parse(get(`https://api.polyhaven.com/files/${id}`).toString('utf8')).gltf['2k'].gltf, got = {};
    mkdirSync(join(dl, id, 'textures'), { recursive: true });
    for (const [rel, f] of [[`${id}.gltf`, g], ...Object.entries(g.include)]) {
      const data = get(f.url); writeFileSync(join(dl, id, rel), data);
      got[rel] = { url: f.url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    }
    manifest.assets[id] = { page: `https://polyhaven.com/a/${id}`, files: got };
    console.log(id, Math.round(Object.values(got).reduce((a, f) => a + f.bytes, 0) / 1024), 'KB');
  }
  writeFileSync(join(dl, 'manifest.json'), JSON.stringify(manifest, null, 1));
}

// ---- a glTF's one mesh: its points, normals, texture coordinates (glTF's: v down the picture) and triangles
function readModel(dl, id) {
  const g = JSON.parse(readFileSync(join(dl, id, `${id}.gltf`), 'utf8')), bin = readFileSync(join(dl, id, g.buffers[0].uri));
  const node = g.nodes.find((n) => n.mesh !== undefined), prim = g.meshes[node.mesh].primitives[0];
  if (node.translation || node.rotation || node.scale || node.matrix) throw new Error(`${id}: its node is moved; not handled`);
  const acc = (i, n, T) => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView], off = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * T.BYTES_PER_ELEMENT;
    const out = new T(a.count * n), dv = new DataView(bin.buffer, off);
    const rd = T === Float32Array ? (o) => dv.getFloat32(o, true) : T === Uint32Array ? (o) => dv.getUint32(o, true) : (o) => dv.getUint16(o, true);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = rd(k * stride + c * T.BYTES_PER_ELEMENT);
    return out;
  };
  const ia = g.accessors[prim.indices], idx = Uint32Array.from(acc(prim.indices, 1, ia.componentType === 5125 ? Uint32Array : Uint16Array));
  return { pos: acc(prim.attributes.POSITION, 3, Float32Array), nor: acc(prim.attributes.NORMAL, 3, Float32Array), uv: acc(prim.attributes.TEXCOORD_0, 2, Float32Array), idx };
}

// ---- the whole scan drawn in its texture's own space: at each texel its normal there, and its tangent (along the
// picture's u; the bitangent is up the picture, as an OpenGL normal map has it: against glTF's v), 7 numbers a texel:
// normal, tangent, the bitangent's hand (0 where no triangle is)
function frame(m, R) {
  const out = new Float32Array(R * R * 7), { pos, nor, uv, idx } = m;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = uv[2 * a] * R, ay = uv[2 * a + 1] * R, bx = uv[2 * b] * R, by = uv[2 * b + 1] * R, cx = uv[2 * c] * R, cy = uv[2 * c + 1] * R;
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) continue;
    // the triangle's own tangent and bitangent (its points' change along u, and against v)
    const e1 = [pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]], e2 = [pos[3 * c] - pos[3 * a], pos[3 * c + 1] - pos[3 * a + 1], pos[3 * c + 2] - pos[3 * a + 2]];
    const du1 = bx - ax, dv1 = by - ay, du2 = cx - ax, dv2 = cy - ay;
    const T = [0, 1, 2].map((k) => (e1[k] * dv2 - e2[k] * dv1) / det), B = [0, 1, 2].map((k) => -(e2[k] * du1 - e1[k] * du2) / det);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(R - 1, Math.ceil(Math.max(ax, bx, cx) + 0.5));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5)), y1 = Math.min(R - 1, Math.ceil(Math.max(ay, by, cy) + 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let wb = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / det, wc = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / det, wa = 1 - wb - wc;
      // (a texel whose middle is just outside a triangle at its picture's edge still takes it: half a texel's leave)
      const e = 0.5 / Math.sqrt(Math.abs(det));
      if (wa < -e || wb < -e || wc < -e) continue;
      const o = (y * R + x) * 7, inside = wa >= 0 && wb >= 0 && wc >= 0;
      if (out[o + 6] !== 0 && !inside) continue;                  // (one already drawn from inside its own triangle stays)
      let nx = nor[3 * a] * wa + nor[3 * b] * wb + nor[3 * c] * wc, ny = nor[3 * a + 1] * wa + nor[3 * b + 1] * wb + nor[3 * c + 1] * wc, nz = nor[3 * a + 2] * wa + nor[3 * b + 2] * wb + nor[3 * c + 2] * wc;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const d = T[0] * nx + T[1] * ny + T[2] * nz; let tx = T[0] - nx * d, ty = T[1] - ny * d, tz = T[2] - nz * d;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const hand = (ny * tz - nz * ty) * B[0] + (nz * tx - nx * tz) * B[1] + (nx * ty - ny * tx) * B[2] < 0 ? -1 : 1;
      out[o] = nx; out[o + 1] = ny; out[o + 2] = nz; out[o + 3] = tx; out[o + 4] = ty; out[o + 5] = tz; out[o + 6] = hand;
    }
  }
  return out;
}

// ---- one level: the scan's triangles cut to `target`, its points gathered
function level(S, m, target, last) {
  const attrs = new Float32Array((m.pos.length / 3) * 2); attrs.set(m.uv);
  // (the texture coordinates weigh in the collapses, so the picture is not dragged across the rock; the last level may
  // cross its seams: it is a few pixels high)
  const [idx, err] = S.simplifyWithAttributes(m.idx, m.pos, 3, attrs, 2, [0.6, 0.6], null, target * 3, 1.0, last ? ['Prune', 'Permissive'] : ['Prune']);
  const map = new Map(), pos = [], nor = [], uv = [], out = new Uint16Array(idx.length);
  for (let k = 0; k < idx.length; k++) {
    let v = map.get(idx[k]);
    if (v === undefined) { v = map.size; map.set(idx[k], v); const s = idx[k]; pos.push(m.pos[3 * s], m.pos[3 * s + 1], m.pos[3 * s + 2]); nor.push(m.nor[3 * s], m.nor[3 * s + 1], m.nor[3 * s + 2]); uv.push(m.uv[2 * s], m.uv[2 * s + 1]); }
    out[k] = v;
  }
  if (map.size > 65535) throw new Error('a level has more points than 16 bits count');
  return { pos, nor, uv, idx: out, err };
}

async function make(dl, work, out) {
  const dir = opt('meshopt', '');
  if (!dir || !existsSync(join(dir, 'meshopt_simplifier.js'))) throw new Error('--meshopt <the meshoptimizer package\'s folder> is needed (npm install meshoptimizer, anywhere)');
  const { MeshoptSimplifier: S } = await import(pathToFileURL(join(dir, 'meshopt_simplifier.js')).href); await S.ready;
  mkdirSync(work, { recursive: true }); mkdirSync(out, { recursive: true });
  const head = { models: [], layers: LAYERS }, blobs = [], bake = { models: [] };
  let at = 0;
  const put = (typed) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), pad = (4 - (b.length % 4)) % 4; blobs.push(b, Buffer.alloc(pad)); const was = at; at += b.length + pad; return was; };
  for (const M of MODELS) {
    const m = readModel(dl, M.id), n = m.pos.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { const v = m.pos[3 * k + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
    let uvLo = Infinity, uvHi = -Infinity; for (const v of m.uv) { if (v < uvLo) uvLo = v; if (v > uvHi) uvHi = v; }
    if (uvLo < -1e-4 || uvHi > 1 + 1e-4) throw new Error(`${M.id}: its texture coordinates leave the picture (${uvLo}, ${uvHi})`);
    writeFileSync(join(work, `${M.name}-frame.f32`), Buffer.from(frame(m, M.bake).buffer));
    const [cx, cy, cn] = M.cell, lods = [];
    M.lods.forEach((target, li) => {
      const L = level(S, m, target, li === M.lods.length - 1 && M.lods.length > 2), nv = L.pos.length / 3;
      const P = new Uint16Array(nv * 3), N = new Int8Array(nv * 4), U = new Uint16Array(nv * 2);
      for (let k = 0; k < nv; k++) {
        for (let c = 0; c < 3; c++) { P[3 * k + c] = Math.round(((L.pos[3 * k + c] - min[c]) / (max[c] - min[c])) * 65535); N[4 * k + c] = Math.round(Math.max(-1, Math.min(1, L.nor[3 * k + c])) * 127); }
        // into its cell of its layer, and v up the picture (rock-textures.py's pictures go to the GPU first row lowest)
        const u = (cx + Math.min(1, Math.max(0, L.uv[2 * k]))) / cn, v = (cy + Math.min(1, Math.max(0, L.uv[2 * k + 1]))) / cn;
        U[2 * k] = Math.round(u * 65535); U[2 * k + 1] = Math.round((1 - v) * 65535);
      }
      lods.push({ verts: nv, tris: L.idx.length / 3, pos: put(P), nor: put(N), uv: put(U), idx: put(L.idx), error: +L.err.toFixed(4) });
    });
    head.models.push({ name: M.name, scan: M.id, layer: M.layer, min: min.map((v) => +v.toFixed(5)), max: max.map((v) => +v.toFixed(5)), lods });
    bake.models.push({ name: M.name, scan: M.id, layer: M.layer, cell: M.cell, bake: M.bake, frame: `${M.name}-frame.f32` });
    console.log(M.name.padEnd(8), M.id.padEnd(24), `${m.idx.length / 3} triangles ->`, lods.map((l) => `${l.tris} (${l.verts} points, error ${l.error})`).join(', '), '| size', max.map((v, c) => (v - min[c]).toFixed(2)).join(' x '));
  }
  const hj = Buffer.from(JSON.stringify(head), 'utf8'), pad = Buffer.alloc((4 - (hj.length % 4)) % 4, 0x20), len = Buffer.alloc(4); len.writeUInt32LE(hj.length + pad.length);
  const body = deflateSync(Buffer.concat([len, hj, pad, ...blobs]), { level: 9 });
  writeFileSync(join(out, 'rocks.bin'), Buffer.concat([Buffer.from('ROK1'), body]));
  writeFileSync(join(work, 'rocks-bake.json'), JSON.stringify(bake, null, 1));
  console.log(join(out, 'rocks.bin'), 4 + body.length, 'bytes (', at, 'before deflate )');
}

if (argv[0] === 'fetch' && argv[1]) fetchAll(argv[1]);
else if (argv[0] === 'make' && argv[3]) await make(argv[1], argv[2], argv[3]);
else { console.log('node scripts/island/rocks-build.mjs fetch <downloads> | make <downloads> <work> <out> --meshopt <dir>'); process.exit(2); }
