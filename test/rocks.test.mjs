// THE ISLAND'S ROCKS AND THE BEACH'S THINGS (src/game/island/rocks.js; stones.js draws them, terrain.js and water.js the
// water's edge they stand in): what can be held without a GPU. Where the rocks lie (talus only under the walls, boulders
// only on the boulder shores, nothing on the lagoon's clean sand but its sparse wrack), the same every time; every rock
// seated in the ground; the counts and the bounds; the models' file against the module's own measures; the shaders'
// numbers are the module's.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROCKS, MODELS, DIMS, LONGEST, ROUND, FOOT, fit, farOf, reachOf, rockField, fieldAt, rocksIn, wrackIn, placeOf, blocksNear, clearOfPalms } from '../src/game/island/rocks.js';
import { palmsNear } from '../src/game/island/life.js';
import { parseHead, heightsOf, createGround, HEAD } from '../src/game/island/ground.js';
import { SHAPE } from '../src/game/island/lordhowe-shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const bytes = new Uint8Array(readFileSync(join(ROOT, 'src/game/island/lordhowe.bin')));
const head = parseHead(bytes), ground = createGround(head, heightsOf(head, inflateSync(bytes.subarray(HEAD))));
const F = rockField(ground, SHAPE), a = ground.hts.main, W = F.w, H = F.h, S = F.S;
// a constant of a module that node cannot load (it draws: three), read from its text
const constOf = (text, name) => new Function('return ' + text.match(new RegExp(`(?:export )?const ${name} = (\\{[^;]*\\}|\\[[^;]*\\]);`))[1])();
// the places looked at: under Mount Lidgbird's west wall and on the boulder shore below it; under Mount Gower; the
// lagoon's beach (clean coral sand); the north's cliffs
const LIDGBIRD = [-262, 2400], SHORE = [-314, 2406], GOWER = [-480, 3900], LAGOON = [-300, -1400, -200, -1200];
const around = ([x, z], r) => [x - r, z - r, x + r, z + r];
const key = (r) => `${r.id}:${r.x.toFixed(4)}:${r.z.toFixed(4)}:${r.size.toFixed(4)}:${r.model}`;
// a field's most within d metres of a point (one of a family may lie a little outside its field: it is its great one's)
const mostNear = (which, x, z, d) => { let m = 0; for (const r of [0, 0.5, 1]) for (let q = 0; q < 8; q++) m = Math.max(m, fieldAt(F, x + Math.cos(q * 0.7854) * d * r, z + Math.sin(q * 0.7854) * d * r)[which]); return m; };

ok('the field: a wall is steep and high; talus lies only below a wall, within its reach; a rocky shore only at the water', () => {
  const slope = (k) => Math.hypot(a[k + 1] - a[k - 1], a[k + W] - a[k - W]) / (2 * S);
  let walls = 0, talus = 0, shore = 0, south = 0;
  const R = Math.ceil(ROCKS.reach / S);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    if (F.wall[k]) { walls += 1; assert.ok(slope(k) > ROCKS.wall && a[k] >= ROCKS.wallMin, `a wall at ${i}, ${j}`); if (F.z0 + j * S > 1000) south += 1; }
    if (F.talus[k]) {
      talus += 1;
      let under = false;
      for (let dj = -R; dj <= R && !under; dj++) for (let di = -R; di <= R; di++) { const q = k + dj * W + di; if (q >= 0 && q < W * H && F.wall[q] && Math.hypot(di, dj) * S < ROCKS.reach && a[q] - a[k] >= ROCKS.drop) { under = true; break; } }
      assert.ok(under, `talus at ${i}, ${j} with no wall over it within ${ROCKS.reach} m`);
      assert.ok(!F.wall[k] && a[k] >= -2, 'not on the wall itself, not under the sea');
    }
    if (F.shore[k]) { shore += 1; assert.ok(a[k] >= -3 && a[k] <= 6, `a rocky shore at ${a[k].toFixed(1)} m`); }
  }
  assert.ok(walls > 5000 && walls < 11000, 'wall points: ' + walls);
  assert.ok(south > 0.6 * walls, 'most of the walls are the southern mountains\': ' + south + ' of ' + walls);
  assert.ok(talus > walls && talus < 3 * walls, 'talus points: ' + talus);
  assert.ok(shore > 5000 && shore < 14000, 'rocky shore points: ' + shore);
  // the lagoon's beach is not a rocky shore; the shore under Lidgbird is, and its talus comes down to it
  assert.equal(fieldAt(F, -252, -1296).shore, 0); assert.equal(fieldAt(F, -252, -1296).talus, 0);
  assert.ok(fieldAt(F, ...SHORE).shore > 0.9 && fieldAt(F, ...LIDGBIRD).talus > 0.3);
  console.log(`    ${walls} wall points (${south} in the south), ${talus} of talus, ${shore} of rocky shore, of the grid's ${W * H}`);
});

ok('the same block in the same place every time: a rectangle asked twice, asked as its quarters, and asked for its great ones alone', () => {
  for (const [x0, z0, x1, z1] of [around(LIDGBIRD, 40), around(SHORE, 30), LAGOON]) {
    const xm = Math.round((x0 + x1) / 2) + 0.37, zm = Math.round((z0 + z1) / 2) - 1.21;
    for (const list of [(p, q, r, s) => rocksIn(F, ground, p, q, r, s), (p, q, r, s) => wrackIn(F, ground, p, q, r, s)]) {
      const whole = list(x0, z0, x1, z1);
      assert.deepEqual(list(x0, z0, x1, z1), whole, 'asked twice');
      const parts = [...list(x0, z0, xm, zm), ...list(xm, z0, x1, zm), ...list(x0, zm, xm, z1), ...list(xm, zm, x1, z1)];
      assert.deepEqual(parts.map(key).sort(), whole.map(key).sort(), 'as its quarters');
      assert.equal(new Set(whole.map(key)).size, whole.length, 'no rock twice');
    }
    const whole = rocksIn(F, ground, x0, z0, x1, z1);
    for (const min of [0.5, 0.7, 1.2]) assert.deepEqual(rocksIn(F, ground, x0, z0, x1, z1, min).map(key).sort(), whole.filter((r) => r.size >= min).map(key).sort(), 'the great ones alone, from ' + min + ' m');
  }
});

ok('talus only under the walls and boulders only on the boulder shores, in their band of height; nothing on the lagoon\'s clean sand but its sparse wrack', () => {
  const seen = { talus: 0, scree: 0, shore: 0, cobbles: 0, ledge: 0 };
  for (const at of [LIDGBIRD, SHORE, GOWER]) for (const r of rocksIn(F, ground, ...around(at, 60))) {
    seen[r.kind] += 1;
    if (r.kind === 'talus' || r.kind === 'scree') {
      assert.ok(mostNear('talus', r.x, r.z, 10) >= 0.03, `a ${r.kind} block at ${r.x.toFixed(0)}, ${r.z.toFixed(0)} away from any talus`);
      assert.ok(r.y >= -0.9, 'not under the sea');
      assert.ok(!ROUND.has(r.model), 'what falls from a wall is angular');
    } else {
      assert.ok(mostNear('shore', r.x, r.z, 3.5) >= 0.06, `a ${r.kind} boulder at ${r.x.toFixed(0)}, ${r.z.toFixed(0)} away from any rocky shore`);
      assert.ok(r.y >= ROCKS.shoreBand[0] && r.y <= ROCKS.shoreBand[1] + 0.4, `a ${r.kind} boulder at ${r.y.toFixed(2)} m`);
    }
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, 'some ' + k);
  // the lagoon's beach: no rock at all, nothing in a body's way; the wrack line and the rubble at the water, sparse
  const [x0, z0, x1, z1] = LAGOON, long = z1 - z0;
  assert.equal(rocksIn(F, ground, x0, z0, x1, z1).length, 0, 'no rock on the lagoon\'s beach');
  assert.equal(blocksNear(F, ground, -252, -1296).length, 0);
  const wrack = wrackIn(F, ground, x0, z0, x1, z1), line = wrack.filter((r) => r.kind === 'wrack'), rubble = wrack.filter((r) => r.kind === 'rubble');
  assert.equal(line.length + rubble.length, wrack.length);
  assert.ok(line.length > 0.2 * long && line.length < long, `the wrack line: ${line.length} things along ${long} m of beach`);
  assert.ok(line.filter((r) => r.model === 'log').length <= 2, 'a drift log once in a long way');
  for (const r of wrack) {
    assert.ok(r.y >= -0.35 && r.y <= 1.3, 'at the water\'s edge: ' + r.y.toFixed(2));
    assert.ok(['coral', 'shell', 'stick', 'log'].includes(r.model));
    assert.ok(r.size <= (r.model === 'log' ? 3.4 : r.model === 'stick' ? 1.05 : 0.22) + 1e-9, `${r.model} ${r.size.toFixed(2)} m`);
    if (r.kind === 'rubble') assert.ok(r.y < 0.14 && r.model !== 'stick' && r.model !== 'log');
    // (the line lies a hand over the swash's reach there, wandering: never below the reach, never a pace over it)
    else { const over = r.y - reachOf(fieldAt(F, r.x, r.z).sd); assert.ok(over > -0.02 && over < 0.22, 'the line over the reach: ' + over.toFixed(3)); }
  }
  console.log(`    under the walls and on the shore: ${JSON.stringify(seen)}; the lagoon's beach, ${long} m of it: ${line.length} things on the wrack line, ${rubble.length} of rubble at the water`);
});

ok('every rock is seated: on the ground\'s own height, its upright near the ground\'s own normal, a fifth to three fifths of its height sunk along it', () => {
  const M = new Float32Array(16);
  let n = 0, deepest = 0, shallowest = 1, leanMost = 0;
  for (const r of [...rocksIn(F, ground, ...around(LIDGBIRD, 45)), ...rocksIn(F, ground, ...around(SHORE, 30)), ...wrackIn(F, ground, ...LAGOON)]) {
    n += 1;
    assert.equal(r.y, ground.height(r.x, r.z), 'on the ground');
    assert.ok(r.sink >= 0.2 - 1e-9 && r.sink <= 0.62 + 1e-9, 'sunk ' + r.sink.toFixed(2)); deepest = Math.max(deepest, r.sink); shallowest = Math.min(shallowest, r.sink);
    placeOf(r, M);
    const col = (c) => [M[4 * c], M[4 * c + 1], M[4 * c + 2]], dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], len = (p) => Math.hypot(...p);
    const X = col(0), Y = col(1), Z = col(2), k = r.size / LONGEST[r.model];
    // its three sides at the scan's own proportions times its stretch, square to one another, not mirrored
    for (const [c, v] of [[0, X], [1, Y], [2, Z]]) assert.ok(Math.abs(len(v) - k * r.stretch[c]) < 1e-4 * (1 + k), 'side ' + c);
    assert.ok(Math.abs(dot(X, Y)) < 1e-4 * len(X) * len(Y) + 1e-9 && Math.abs(dot(X, Z)) < 1e-4 * len(X) * len(Z) + 1e-9 && Math.abs(dot(Y, Z)) < 1e-4 * len(Y) * len(Z) + 1e-9, 'square');
    assert.ok(dot([X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]], Z) > 0, 'not mirrored');
    // its upright: the model's up as it lies, or its along, or its up turned over
    const U = (r.roll === 1 ? Z : r.roll === 2 ? Y.map((v) => -v) : Y).map((v, _, w) => v / len(w)), nl = Math.hypot(r.slope[0], 1, r.slope[1]), N = [-r.slope[0] / nl, 1 / nl, -r.slope[1] / nl];
    assert.ok(U[1] > 0.38, 'it stands up');
    assert.ok(dot(U, N) > 0.8, 'near the ground\'s normal: ' + dot(U, N).toFixed(3)); leanMost = Math.max(leanMost, Math.acos(Math.min(1, dot(U, N))));
    // the scan's box (it stands on y = 0, its middle over the origin) as it lies: along its upright, from what is sunk to its top
    const D = DIMS[r.model]; let lo = 1e9, hi = -1e9;
    for (const sx of [-0.5, 0.5]) for (const sy of [0, 1]) for (const sz of [-0.5, 0.5]) {
      const p = [M[12] + X[0] * D[0] * sx + Y[0] * D[1] * sy + Z[0] * D[2] * sz - r.x, M[13] + X[1] * D[0] * sx + Y[1] * D[1] * sy + Z[1] * D[2] * sz - r.y, M[14] + X[2] * D[0] * sx + Y[2] * D[1] * sy + Z[2] * D[2] * sz - r.z];
      lo = Math.min(lo, dot(p, U)); hi = Math.max(hi, dot(p, U));
    }
    assert.ok(Math.abs(lo + r.sink * r.tall) < 2e-3 * (1 + r.tall) && Math.abs(hi - (1 - r.sink) * r.tall) < 2e-3 * (1 + r.tall), `${r.model} roll ${r.roll}: from ${lo.toFixed(3)} to ${hi.toFixed(3)}, tall ${r.tall.toFixed(3)}, sunk ${r.sink.toFixed(2)}`);
  }
  assert.ok(n > 2000, 'rocks looked at: ' + n);
  console.log(`    ${n} rocks and things: sunk ${shallowest.toFixed(2)} to ${deepest.toFixed(2)} of their height, the most any leans from the ground's normal ${(leanMost * 180 / Math.PI).toFixed(0)} degrees`);
});

ok('the counts and the bounds: the island\'s rocks by kind, no block larger than its field allows, a sea-rounded scan never over 1.5 of its true size nor on its end, what is in a body\'s way', () => {
  const e = SHAPE.extent, T = 64, n = { talus: 0, scree: 0, shore: 0, cobbles: 0, ledge: 0 }, wr = { wrack: 0, rubble: 0 }; let most = 0, great = 0, rusty = 0, round = 0;
  for (let z = Math.floor(e.z0 / T) * T; z < e.z1; z += T) for (let x = Math.floor(e.x0 / T) * T; x < e.x1; x += T) {
    const l = rocksIn(F, ground, x, z, x + T, z + T); most = Math.max(most, l.length);
    for (const r of l) {
      n[r.kind] += 1; if (r.size >= 1.2) great += 1;
      const top = r.kind === 'ledge' ? 6.0 : r.kind === 'talus' ? 1 + ROCKS.great : r.kind === 'shore' ? 2.4 : ROCKS.small * 2.6;
      if (!(r.size >= ROCKS.small - 1e-9 && r.size <= top + 1e-9)) assert.fail(`${r.kind} ${r.model} of ${r.size.toFixed(2)} m`);
      if (ROUND.has(r.model)) { round += 1; if (r.rust > ROCKS.scoured * 0.8 + 1e-9) rusty += 1; if (r.size > ROCKS.scale * LONGEST[r.model] + 1e-9 || (r.model === 'boulder' && r.roll === 1)) assert.fail(`a rounded ${r.model} of ${r.size.toFixed(2)} m, roll ${r.roll}`); }
      if (!(r.tint >= 0.62 && r.tint <= 1.08 && r.rust >= 0 && r.rust <= 0.8)) assert.fail('shade ' + r.tint + ', rust ' + r.rust);
    }
    for (const r of wrackIn(F, ground, x, z, x + T, z + T)) wr[r.kind] += 1;
  }
  const all = Object.values(n).reduce((p, q) => p + q, 0);
  assert.ok(n.talus > 150000 && n.talus < 400000, 'talus blocks: ' + n.talus);
  assert.ok(n.scree > 25000 && n.scree < 110000, 'scree: ' + n.scree);
  assert.ok(n.shore > 600000 && n.shore < 1700000, 'shore boulders: ' + n.shore);
  assert.ok(n.cobbles > 200000 && n.cobbles < 600000, 'cobbles: ' + n.cobbles);
  assert.ok(n.ledge > 500 && n.ledge < 5000, 'ledges: ' + n.ledge);
  assert.ok(great > 30000 && great < 150000, 'great ones (1.2 m and over): ' + great);
  assert.ok(wr.wrack > 4000 && wr.wrack < 25000 && wr.rubble > 10000 && wr.rubble < 80000, 'the beaches\' things: ' + JSON.stringify(wr));
  assert.equal(rusty, 0, 'a sea-rounded rock keeps a third of the lean toward rust');
  assert.equal(fit('boulder', 9), ROCKS.scale * LONGEST.boulder); assert.equal(fit('cobble', 1), 1); assert.equal(fit('slab', 9), 9);
  // how far off a rock is drawn: by its length, a pebble a few tens of metres, a great block across the lagoon
  assert.ok(farOf(ROCKS.small) < 60 && farOf(1) > 400 && farOf(1 + ROCKS.great) > 2000);
  for (let s = 0.3; s < 5.6; s += 0.1) assert.ok(farOf(s + 0.1) > farOf(s));
  // what is in a body's way under the wall: the great ones only, each a trunk-like round (life.js's), none a ledge
  const blocks = blocksNear(F, ground, ...LIDGBIRD), near = rocksIn(F, ground, ...around(LIDGBIRD, 9)).filter((r) => r.size >= ROCKS.solid && r.kind !== 'ledge' && Math.hypot(r.x - LIDGBIRD[0], r.z - LIDGBIRD[1]) <= 6);
  assert.equal(blocks.length, near.length); assert.ok(blocks.length > 0 && blocks.every((b) => b.r >= 0.34 * ROCKS.solid - 1e-9 && b.h > 0));
  // no great block where a palm's trunk stands
  const p = palmsNear(ground, -60, -1296, 40)[0];
  assert.equal(clearOfPalms(ground, { x: p.x, z: p.z, size: 2 }), false); assert.equal(clearOfPalms(ground, { x: p.x + 300, z: 9000, size: 2 }), true);
  console.log(`    ${all} rocks on the island (${JSON.stringify(n)}), ${great} of them 1.2 m and over, at most ${most} in a ${T} m square; ${round} sea-rounded; on the beaches ${wr.wrack} things on the wrack lines and ${wr.rubble} of rubble`);
});

ok('the models\' file is the module\'s: the nine scans by name and order, each one\'s box the module\'s own measures, standing on its foot, three levels (two for the beach\'s things) each coarser than the last; the files within their budget', () => {
  const raw = new Uint8Array(readFileSync(join(ROOT, 'src/game/island/rocks/rocks.bin')));
  assert.equal(String.fromCharCode(...raw.subarray(0, 4)), 'ROK1');
  const body = inflateSync(raw.subarray(4)), n = new DataView(body.buffer, body.byteOffset).getUint32(0, true), file = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + n)));
  const json = JSON.parse(read('src/game/island/rocks/rocks.json'));
  assert.deepEqual(file.models.map((m) => m.name), MODELS); assert.deepEqual(json.models.map((m) => m.name), MODELS);
  const wrack = new Set(['stick', 'log', 'shell', 'coral']);
  for (const m of file.models) {
    const D = DIMS[m.name];
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(m.max[c] - m.min[c] - D[c]) < 0.006, `${m.name}'s side ${c}: ${(m.max[c] - m.min[c]).toFixed(3)} against ${D[c]}`);
    // (as scanned: its foot within three centimetres of y = 0, its middle within an eighth of its length of the origin)
    assert.ok(Math.abs(m.min[1]) < 0.03, m.name + ' stands on y = 0: ' + m.min[1]);
    for (const c of [0, 2]) assert.ok(Math.abs(m.min[c] + m.max[c]) / 2 < 0.125 * D[c], `${m.name}'s middle near the origin (${c}): ${((m.min[c] + m.max[c]) / 2).toFixed(3)}`);
    assert.equal(m.lods.length, wrack.has(m.name) ? 2 : 3);
    for (let l = 1; l < m.lods.length; l++) assert.ok(m.lods[l].tris < 0.5 * m.lods[l - 1].tris, m.name + '\'s level ' + l);
    assert.ok(m.lods[0].tris <= 3200 && m.lods[m.lods.length - 1].tris <= 330 && m.lods.every((l) => l.verts < 65536), m.name + '\'s triangles');
    assert.ok(m.layer >= 0 && m.layer < json.layers);
  }
  assert.equal(LONGEST.slab, 3.07); assert.equal(LONGEST.boulder, 1.21); assert.equal(LONGEST.cobble, 1.36);
  // (every scan is Poly Haven's, CC0, named in the record beside the files)
  for (const m of json.models) assert.match(m.page, /^https:\/\/polyhaven\.com\/a\/[a-z0-9_]+$/);
  const size = (f) => statSync(join(ROOT, 'src/game/island/rocks', f)).size, full = size('rocks.bin') + size('rocks-colour.ktx2') + size('rocks-surface.ktx2'), lite = size('rocks.bin') + size('rocks-colour-lite.ktx2') + size('rocks-surface-lite.ktx2');
  assert.ok(full < 3.5e6 && lite < 1.2e6, `the rocks' files: ${full} bytes, a phone's ${lite}`);
  console.log(`    ${file.models.map((m) => m.name + ' ' + m.lods.map((l) => l.tris).join('/')).join(', ')}; ${(full / 1e6).toFixed(2)} MB, a phone's ${(lite / 1e6).toFixed(2)} MB`);
});

ok('the shaders\' numbers are the module\'s: the swash\'s reach, the open shore, the wet rock and the wet sand, the foot\'s colours, the boulder shore\'s own wrack; and the water\'s edge on a boulder shore is not a beach\'s', () => {
  const rocks = read('src/game/island/rocks.js'), stones = read('src/game/island/stones.js'), terrain = read('src/game/island/terrain.js'), water = read('src/game/island/water.js');
  // the swash's reach: rocks.js reachOf (the wrack line lies by it) and water.js seaReach (the land's wet line, the rocks')
  assert.match(water, /float seaReach\( vec4 m \) \{ return mix\( 0\.08, 0\.34, smoothstep\( -700\.0, -60\.0, m\.x \) \); \}/);
  assert.match(rocks, /reachOf = \(sd\) => 0\.08 \+ \(0\.34 - 0\.08\) \* sm\(-700, -60, sd\)/);
  assert.equal(reachOf(-700), 0.08); assert.ok(Math.abs(reachOf(-60) - 0.34) < 1e-12 && Math.abs(reachOf(-380) - 0.21) < 1e-12);
  // the rocks read the same sea as the land does: one text of the map and the swash, in both
  assert.match(stones, /import \{ SEA_EDGE_GLSL \} from '\.\/water\.js'/); assert.match(water, /export const SEA_EDGE_GLSL = `[^`]*\$\{MAP_AT\}\s*\$\{SWASH\}`/); assert.match(water, /\$\{MAP_AT\}\n\/\/ the swell over open water/); assert.match(water, /\n\$\{SWASH\}\n\/\/ foam's lace/);
  // a shore open to the swell: where rocks.js lays its boulders thickest and where stones.js lets the spray wet them
  assert.match(rocks, /const open = sm\(-420, -90, sd\[k\]\)/); assert.match(stones, /open = smoothstep\( -420\.0, -90\.0, sm\.x \)/);
  // wet rock keeps what wet sand keeps (terrain.js WET's first); its numbers reach the shader as the module's
  const WET = constOf(stones, 'WET'), wetGround = constOf(terrain, 'WET');
  assert.equal(WET.dark, wetGround[0]); assert.ok(WET.dark > 0.4 && WET.dark < 0.5 && WET.gloss[1] < WET.gloss[0] && WET.gloss[0] < 0.4 && WET.hand < WET.spray);
  for (const k of ['WET.hand', 'WET.spray', 'WET.dark', 'WET.gloss[0]', 'WET.gloss[1]', 'WET.collar[0]', 'WET.collar[1]', 'WET.foam']) assert.ok(stones.includes('${num(' + k + ')}'), k + ' in the shader');
  // what climbs a rock's foot is the ground's own colour there (terrain.js's surfaces' means, to within a fifth)
  const MEAN = constOf(terrain, 'MEAN'), LAYERS = constOf(terrain, 'LAYERS');
  for (const [name, c] of Object.entries(FOOT)) { const m = MEAN[LAYERS.indexOf(name)]; for (let q = 0; q < 3; q++) assert.ok(Math.abs(c[q] - m[q]) <= 0.2 * m[q], `${name}'s foot against the ground's mean`); }
  // a boulder shore keeps its own: no wrack line where the land draws pebbles and the floor rubble (the field's 0.3)
  assert.match(rocks, /if \(f\.shore > 0\.3\) continue;/); assert.match(terrain, /rocky > 0\.3 \? 0\.72 \+ 0\.28 \* rocky : 0\.0/);
  // the swash's front lace is a beach's: the lagoon's beach is gentler than FRONT.slope and keeps it; the boulder shore
  // under Lidgbird is steeper than three times that, and has none (there it was a white wire along the shore)
  const FRONT = constOf(terrain, 'FRONT'), FOAM = constOf(terrain, 'FOAM');
  const steep = (x, z) => Math.hypot(...ground.slope(x, z, 2));
  assert.ok(steep(-252, -1296) < FRONT.slope, 'the lagoon\'s beach: ' + steep(-252, -1296).toFixed(3));
  assert.ok(steep(-315.5, 2404) > 3 * FRONT.slope, 'the boulder shore: ' + steep(-315.5, 2404).toFixed(3));
  assert.match(terrain, /\* \( 1\.0 - smoothstep\( \$\{num\(FRONT\.slope\)\}, \$\{num\(3 \* FRONT\.slope\)\}, isleSlope \) \)/);
  // the white water near the eye is never a flat sheet: the lace's measure held under where it closes (seaLace covers
  // all from 1 / 1.12 of its measure less its ramp), its oldest a web and a veil; from afar, as it was
  assert.ok(FOAM.most < 0.7 && FOAM.web[0] < FOAM.web[1] && FOAM.web[1] < 0.8 && FOAM.veil < 1 && FOAM.outer < 1 && FOAM.near < FOAM.far);
  assert.match(water, /seaBroke = m\.x < 0\.0 \? 1\.0 : smoothstep\( 1\.0, 2\.2, br \);/); assert.match(terrain, /wIn = mix\( wIn, min\( body \+ edge, \$\{num\(FOAM\.most\)\} \), laceNear \);/);
  console.log(`    the lagoon's beach slopes ${steep(-252, -1296).toFixed(3)}, the boulder shore under Lidgbird ${steep(-315.5, 2404).toFixed(2)}; the front's lace fades from ${FRONT.slope} to ${(3 * FRONT.slope).toFixed(2)}`);
});

console.log(`\n${passed} checks passed.`);
