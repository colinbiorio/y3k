// THE ISLAND'S GROUND (src/game/island/terrain.js, ground/, scripts/island/ground-textures.py, basis-worker.js): what can
// be held without a GPU. The maps are what the script says they are (seven layers, their sizes, the budget); each
// surface's colour is graded to what the island's own ground reflects; the shader's numbers and the script's are the
// same numbers; the shader's noise is life.js's (the palms grow by it); the transcoding worker is the site's own file.
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, vnoise } from '../src/game/island/life.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const terrain = read('src/game/island/terrain.js'), grading = JSON.parse(read('src/game/island/ground/ground.json'));
const LAYERS = ['sand', 'grass', 'litter', 'rock', 'cliff', 'shore', 'face'];
// a KTX2 file's head (Khronos KTX 2.0, section 3): its identifier, then vkFormat, typeSize, width, height, depth, layers, faces, levels, supercompression
function ktx2(file) {
  const b = readFileSync(join(ROOT, file)), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  assert.deepEqual([...b.subarray(0, 12)], [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a], file + ' is a KTX2 file');
  const u = (o) => v.getUint32(o, true);
  return { vkFormat: u(12), width: u(20), height: u(24), layers: u(32), faces: u(36), levels: u(40), scheme: u(44), bytes: b.byteLength };
}
const literal = (name) => JSON.parse(terrain.match(new RegExp(`export const ${name} = (\\[[^;]*\\]);`))[1]);

ok('the maps are seven layers each, 1024 (512 on the lighter path), every smaller level down to one texel, as Basis textures the GPU transcodes', () => {
  for (const [file, w, levels] of [['ground-colour.ktx2', 1024, 11], ['ground-surface.ktx2', 1024, 11], ['ground-colour-lite.ktx2', 512, 10], ['ground-surface-lite.ktx2', 512, 10]]) {
    const k = ktx2('src/game/island/ground/' + file);
    assert.equal(k.vkFormat, 0, file + ': a Basis texture (VK_FORMAT_UNDEFINED), transcoded on the machine to what its GPU reads');
    assert.deepEqual([k.width, k.height, k.layers, k.faces, k.levels], [w, w, 7, 1, levels], file);
  }
  // the colour as ETC1S (BasisLZ, scheme 1), the surface as UASTC with zstd (scheme 2): the script's choice
  assert.equal(ktx2('src/game/island/ground/ground-colour.ktx2').scheme, 1);
  assert.equal(ktx2('src/game/island/ground/ground-surface.ktx2').scheme, 2);
});

ok('they come in under the island\'s budget: about 25 MB in all, a phone\'s set a fraction of that', () => {
  const size = (f) => statSync(join(ROOT, 'src/game/island/ground', f)).size / 1e6;
  const full = size('ground-colour.ktx2') + size('ground-surface.ktx2'), lite = size('ground-colour-lite.ktx2') + size('ground-surface-lite.ktx2');
  assert.ok(full < 25, 'the full set: ' + full.toFixed(2) + ' MB');
  assert.ok(lite < 6, 'the lighter set: ' + lite.toFixed(2) + ' MB');
  console.log(`    the full set ${full.toFixed(2)} MB, the lighter ${lite.toFixed(2)} MB`);
});

ok('each surface is graded to what the island\'s own ground reflects (linear albedo, luminance)', () => {
  const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], by = Object.fromEntries(grading.layers.map((l) => [l.name, l]));
  assert.deepEqual(grading.layers.map((l) => l.name), LAYERS, 'the shader\'s order');
  // coral sand about half the light; basalt a tenth; grass and litter about a tenth in the visible, grass green over red
  const range = { sand: [0.48, 0.6], grass: [0.08, 0.14], litter: [0.06, 0.1], rock: [0.1, 0.15], cliff: [0.07, 0.12], shore: [0.12, 0.18], face: [0.08, 0.12] };
  for (const [name, [lo, hi]] of Object.entries(range)) { const y = Y(by[name].albedo_graded); assert.ok(y >= lo && y <= hi, `${name}: ${y.toFixed(3)} in ${lo}..${hi}`); }
  assert.ok(by.grass.albedo_graded[1] > 1.5 * by.grass.albedo_graded[0], 'grass is green');
  assert.ok(by.sand.albedo_graded[0] > by.sand.albedo_graded[2], 'coral sand is warm (cream), not grey');
  // the large-scale face keeps its scan's hue (one gain for all three channels): its rock grey, its plants green
  const g = by.face.gain; assert.ok(Math.abs(g[0] - g[2]) < 1e-6 && Math.abs(g[1] - g[2]) < 1e-6, 'one gain');
  for (const l of grading.layers) assert.ok(l.texels_over_one < 0.001, l.name + ': graded without clipping');
});

ok('the shader\'s mean colours are the graded ones (what is drawn before the maps come)', () => {
  const MEAN = literal('MEAN');
  grading.layers.forEach((l, i) => l.albedo_graded.forEach((x, c) => assert.ok(Math.abs(MEAN[i][c] - x) < 1.5e-3, `${l.name}[${c}]: ${MEAN[i][c]} against ${x}`)));
  const FINE = literal('FINE');
  grading.layers.forEach((l, i) => assert.ok(i === 0 ? Math.abs(FINE[i] - l.side_m / 8) < 1e-9 : Math.abs(FINE[i] - l.side_m) < 0.2, `${l.name}: read at its scan's own size (${l.side_m} m)`));
});

ok('the shader\'s cover noise is life.js\'s, hash for hash: the palms grow where the forest floor is drawn', () => {
  // the GLSL uses the same multipliers and shifts on unsigned 32-bit numbers as life.js's hash on Math.imul
  const glsl = terrain.match(/float lhHash\( int i, int j \) \{[^}]*\}/)[0];
  for (const n of ['374761393u', '668265263u', '1274126177u', '>> 13u', '>> 16u']) assert.ok(glsl.includes(n), 'GLSL hash: ' + n);
  // and that arithmetic, done as the GPU does it (unsigned, wrapping at 2^32), is life.js's own
  const gpu = (i, j) => { let h = (Math.imul(i >>> 0, 374761393) + Math.imul(j >>> 0, 668265263)) >>> 0; h = Math.imul((h ^ (h >>> 13)) >>> 0, 1274126177) >>> 0; h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; };
  for (const [i, j] of [[0, 0], [1, -1], [-81, 57], [-4000, 3000], [123456, -654321]]) assert.equal(gpu(i, j), hash(i, j), `hash(${i}, ${j})`);
  // the control texture holds the cover noise as life.js mixes it (70 m and 17 m), which cover() reads
  assert.match(terrain, /lhNoise\( xz \/ 70\.0 \) \* 0\.7 \+ lhNoise\( xz \/ 17\.0 \) \* 0\.3/);
  assert.match(read('src/game/island/life.js'), /const n = vnoise\(x \/ 70, z \/ 70\) \* 0\.7 \+ vnoise\(x \/ 17, z \/ 17\) \* 0\.3;/);
  assert.equal(typeof vnoise(0.5, 0.5), 'number');
});

ok('the maps are transcoded in a worker of the site\'s own file (a Blob worker keeps the page\'s policy, and the transcoder evaluates strings)', () => {
  const worker = read('src/game/island/basis-worker.js'), path = worker.match(/importScripts\( new URL\( '([^']+)'/)[1];
  assert.ok(existsSync(join(ROOT, 'src/game/island', path)), 'the transcoder it brings in is vendored: ' + path);
  assert.ok(existsSync(join(ROOT, 'src/game/island', path.replace('.js', '.wasm'))), 'and its binary');
  assert.match(worker, /^\/\/ basis-worker\.js — MADE BY scripts\/island\/basis-worker\.mjs/);
  assert.match(terrain, /new Worker\(file\)/, 'terrain.js makes its workers from that file');
  assert.ok(!/new Blob/.test(terrain), 'and from no Blob');
  // the page's policy is unchanged: no evaluated strings
  assert.ok(!/unsafe-eval'/.test(read('security.mjs').replace(/'wasm-unsafe-eval'/g, '')), 'the page still refuses evaluated strings');
});

ok('the land\'s own lines and sky share, and the shadow maps: what the shader reads is what the passes make', () => {
  assert.match(terrain, /lo = max\( lo, h - t \* uTan\.x \); up = max\( up, h - t \* uTan\.y \);/, 'both limbs of the key light\'s disc');
  assert.match(terrain, /LinearMipmapLinearFilter, magFilter: THREE\.LinearFilter[^\n]*generateMipmaps: true/, 'the data textures keep their smaller levels');
  assert.match(terrain, /depth\.compareFunction = THREE\.LessEqualCompare/, 'the maps compared by the GPU as they are read');
  assert.match(terrain, /uniform highp sampler2DShadow uIsleShade0;/);
  assert.match(terrain, /cam\.layers\.set\(CASCADES\.layer\)/, 'only what is put on their layer is drawn into them');
  assert.match(read('src/game/island/island.js'), /land\.userData\.isleLand = true/, 'the land casts into none (its shadow is its lines)');
  const C = JSON.parse(terrain.match(/export const CASCADES = (\{[^;]*\});/)[1].replace(/(\w+):/g, '"$1":'));
  assert.deepEqual(C.far, [15, 60, 220]); assert.ok(C.margin >= 14.5 / Math.tan((4 * Math.PI) / 180), 'a 14.5 m palm with the light 4 degrees up casts into a map from behind it');
});

console.log(`\n${passed} checks passed.`);
