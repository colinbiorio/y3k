// WHAT EACH THING LOOKS LIKE, in one place.
//
// The world draws a forge, a dome, a panel, a cart; the build window has to
// show the same forge, dome, panel and cart as a wireframe you can turn over in
// your hands before you ask for one. Two drawings of the same thing drift the
// first time someone reshapes a roof, so there is one: every kind is built
// here, and both the ground and the window call this.
//
// Shapes are given THREE rather than importing it, so this file can be loaded
// anywhere (the window's own little scene, the world's big one) without two
// copies of the library and without deciding where it comes from.
//
// ONE MESH PER BUILDING (2026-10-22). Colin: "tons of room to work on the
// world" (2026-10-19); "go crazy. build us something amazing" (2026-10-22).
// Seen from the god view the forge was a brown box under a pyramid, the ai
// forge and a storage unit were the same grey cube at two sizes, and nothing
// on the ground had a door, a window or a light. Each kind is a silhouette
// now — a roof, a door, windows, a chimney or a mast — made of boxes, wedges
// and a dome, and the whole building is compiled into ONE geometry with a
// colour and a glow per vertex: one draw call where a forge was two to seven,
// however many pieces it is made of. A window's glow is a per-vertex colour
// the world's shader turns up at dusk (skyLamp, world-view.js); the build
// window shows the same geometry as coloured wire. What a building IS has not
// moved: the forge is wooden, the solar forge a small green dome, the ai forge
// small and steel, exactly as world.mjs tells the presence.
//
// A LITTLE VARIATION, SEEDED FROM WHERE IT STANDS. A roof a touch higher, a
// chimney on the other side, a wall a shade warmer: hash2 of the building's
// own column (variationAt), so every screen draws the same forge and no two
// forges on the planet are quite the same forge. The preview has no column and
// gets the middle of every range.

import { hash2 } from './world-core.js';

export const CATALOG_ORDER = ['panel', 'stone storage', 'metal storage', 'wood storage', 'cart', 'rover', 'sprite'];

// The palette. Lighter than real timber and real stone on purpose: a brown
// building on brown ground is a building nobody can see.
const TIMBER = 0xa8774a, TIMBER_DARK = 0x7a4f2c, TIMBER_DEEP = 0x5a391d, RIDGE = 0x8d5c33;
const STONE = 0x8a8d90, STONE_LIGHT = 0xa2a5a9, STONE_DARK = 0x6c6a66, MORTAR = 0x6f7275;
const STEEL = 0x8d949c, STEEL_LIGHT = 0xb6bec8, STEEL_DARK = 0x5f666e, HATCH = 0x6b7480;
const DOME = 0x2c6b48, DRUM = 0x6b7a70, DRUM_BAND = 0x7f8f84, LENS = 0x1a3a2a;
const DOOR = 0x2b2219, DOOR_STEEL = 0x2a2e34, GLASS = 0x0f1830, CELL = 0x24396b, FRAME = 0x2b2f36, WHEEL = 0x33383f;
// what glows, and how hard at night (k): lamplight in every window, the
// forge's ember, the ai forge's cool slits and beacon, a free panel's wait
const WARM = 0xffb25a, EMBER = 0xff7a2a, COOL = 0x9fd0ff, LENS_GLOW = 0x6fe3b0, PANEL_WAIT = 0x3b78d6, PANEL_DARK = 0x1b3b6b;

// 0..1, the same on every screen: hash2 of the building's column and a key.
// A thing with no column (the build window's preview) gets a half, the middle
// of every range, so the preview is the plain one.
export function variationAt(x, z, k) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0.5;
  return hash2(Math.round(x), Math.round(z), 2600 + k);
}

// A pitched roof: a wedge with its ridge along x, its base at y = 0 and its
// apex at y = h. Five faces — two slopes, two gables, no underside (it sits on
// walls). Non-indexed, so every face keeps its own flat normal.
function gableGeo(THREE, w, h, d) {
  const x = w / 2, z = d / 2;
  const P = [
    // front slope (+z), counter-clockwise seen from outside
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
    // back slope (-z)
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
    // the gable ends
    x, 0, z, x, 0, -z, x, h, 0,
    -x, 0, -z, -x, 0, z, -x, h, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  return g;
}

// THE COMPILER. Every piece is placed (applyMatrix4), made flat-shaded and
// unindexed, and copied into one position/normal/colour/glow buffer. Colours
// go through THREE.Color so the hex is managed the way a material's colour
// is (sRGB in, linear in the buffer): a vertex-coloured wall is the same
// brown a MeshLambertMaterial({ color }) would have been.
function compile(THREE, parts) {
  const flat = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) p.geo.dispose();
    g.computeVertexNormals();
    return [g, p];
  });
  const n = flat.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glo = new Float32Array(n * 3);
  const c = new THREE.Color(), e = new THREE.Color();
  let o = 0;
  for (const [g, p] of flat) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    c.setHex(p.color).multiplyScalar(p.shade);
    e.setHex(p.glow).multiplyScalar(p.k);
    for (let i = 0; i < k; i++) {
      const j = (o + i) * 3;
      col[j] = c.r; col[j + 1] = c.g; col[j + 2] = c.b;
      glo[j] = e.r; glo[j + 1] = e.g; glo[j + 2] = e.b;
    }
    o += k;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glo, 3));
  return geo;
}

// The builder a kind draws with: pieces at a place (x, y, z; rx, ry, rz;
// shade), each with a colour and, if it glows, a [glow colour, strength].
function builder(THREE, b = {}) {
  const parts = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const put = (geo, color, at = {}, lit = null) => {
    e.set(at.rx || 0, at.ry || 0, at.rz || 0);
    q.setFromEuler(e);
    v.set(at.x || 0, at.y || 0, at.z || 0);
    geo.applyMatrix4(m.compose(v, q, s));
    parts.push({ geo, color, shade: at.shade || 1, glow: lit ? lit[0] : 0, k: lit ? lit[1] : 0 });
  };
  return {
    box: (w, h, d, color, at, lit) => put(new THREE.BoxGeometry(w, h, d), color, at, lit),
    cyl: (rt, rb, h, n, color, at, lit) => put(new THREE.CylinderGeometry(rt, rb, h, n), color, at, lit),
    dome: (r, color, at, lit) => put(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color, at, lit),
    gable: (w, h, d, color, at, lit) => put(gableGeo(THREE, w, h, d), color, at, lit),
    r: (k) => variationAt(b.x, b.z, k),                       // this building's own numbers
    pick: (k, lo, hi) => lo + variationAt(b.x, b.z, k) * (hi - lo),
    done: () => compile(THREE, parts),
  };
}

function box(THREE, w, h, d, color, y, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...extra }));
  m.position.y = y;
  return m;
}

// ---- the kinds -----------------------------------------------------------------
// +z is the front: the side the door is on, and the side the god view's
// default eye (south-east of the society) sees. Windows go round all four
// sides, so an orbit never shows a blank house.

// THE FORGE: a timber hall under a pitched roof, a stone chimney whose mouth
// glows with the fire that makes storage units, a door with a lit lintel, and
// a window on every side. Wooden, as world.mjs says.
function forge(B) {
  const roofH = B.pick(1, 0.78, 1.08), chimneyX = B.r(2) < 0.5 ? -0.72 : 0.72;
  const doorX = B.pick(3, -0.25, 0.25), wall = B.pick(4, 0.94, 1.06);
  B.box(2.3, 0.2, 2.0, STONE_DARK, { y: 0.1 });                                  // plinth
  B.box(2.1, 1.3, 1.8, TIMBER, { y: 0.85, shade: wall });                       // walls
  B.box(2.14, 0.05, 1.84, TIMBER_DARK, { y: 0.6 });                              // plank lines
  B.box(2.14, 0.05, 1.84, TIMBER_DARK, { y: 1.05 });
  for (const px of [-1, 1]) for (const pz of [-0.85, 0.85]) B.box(0.16, 1.34, 0.16, TIMBER_DEEP, { x: px, y: 0.87, z: pz });   // corner posts
  B.gable(2.5, roofH, 2.3, TIMBER_DARK, { y: 1.5 });
  B.box(2.56, 0.08, 0.18, RIDGE, { y: 1.5 + roofH });                            // ridge cap
  const top = 1.5 + roofH + 0.3;
  B.box(0.36, top - 1.2, 0.36, STONE_LIGHT, { x: chimneyX, y: (1.2 + top) / 2, z: -0.5 });   // chimney
  B.box(0.42, 0.08, 0.42, STONE_DARK, { x: chimneyX, y: top, z: -0.5 });
  B.box(0.24, 0.06, 0.24, EMBER, { x: chimneyX, y: top + 0.03, z: -0.5 }, [EMBER, 0.9]);  // its mouth
  B.box(0.5, 0.82, 0.08, DOOR, { x: doorX, y: 0.61, z: 0.92 });                  // door
  B.box(0.5, 0.07, 0.06, WARM, { x: doorX, y: 1.08, z: 0.93 }, [WARM, 0.8]);     // its lit lintel
  B.box(0.3, 0.3, 0.07, WARM, { x: doorX + (doorX < 0 ? 0.72 : -0.72), y: 1.0, z: 0.925 }, [WARM, 1]);   // windows
  for (const wx of [-0.55, 0.55]) B.box(0.3, 0.3, 0.07, WARM, { x: wx, y: 1.0, z: -0.925 }, [WARM, 1]);
  for (const sx of [-1.075, 1.075]) B.box(0.07, 0.3, 0.3, WARM, { x: sx, y: 1.0, z: 0.1 }, [WARM, 1]);
}

// THE SOLAR FORGE: the small green dome, on a stone drum now, with a door, a
// ring of portholes, a lens on top that glows the dome's own green, and a
// little panel on a mast beside it — it is where panels are made.
function solarforge(B) {
  const drumH = B.pick(1, 0.5, 0.65), mast = B.r(2) < 0.5 ? -1 : 1;
  const ports = 3 + Math.floor(B.r(3) * 3), tint = B.pick(4, 0.94, 1.06);
  B.box(0.8, 0.1, 0.4, STONE, { y: 0.05, z: 1.5 });                              // the step
  B.cyl(1.3, 1.36, drumH, 12, DRUM, { y: drumH / 2 });
  B.cyl(1.33, 1.33, 0.08, 12, DRUM_BAND, { y: drumH - 0.04 });
  B.dome(1.25, DOME, { y: drumH, shade: tint });
  B.box(0.34, 0.1, 0.34, LENS, { y: drumH + 1.28 }, [LENS_GLOW, 0.7]);           // the lens
  B.box(0.56, 0.78, 0.1, DOOR, { y: 0.39, z: 1.3 });
  for (let i = 0; i < ports; i++) {
    const a = Math.PI / 2 + ((i + 1) * Math.PI * 2) / (ports + 1);             // round the back, never over the door
    B.box(0.26, 0.26, 0.1, WARM, { x: Math.cos(a) * 1.3, y: drumH * 0.55, z: Math.sin(a) * 1.3, ry: Math.PI / 2 - a }, [WARM, 0.7]);
  }
  B.box(0.3, 0.08, 0.3, STEEL_DARK, { x: mast * 1.55, y: 0.04, z: -0.5 });      // the mast and its panel
  B.box(0.08, 1.2, 0.08, STEEL_DARK, { x: mast * 1.55, y: 0.6, z: -0.5 });
  B.box(0.7, 0.05, 0.45, GLASS, { x: mast * 1.55, y: 1.25, z: -0.5, rx: -0.5 }, [PANEL_DARK, 0.3]);
}

// THE AI FORGE: small and steel — a ribbed block under a stepped roof, a cool
// slit of light down its face and round its sides, and a beacon on a mast,
// since it is where a new mind's body is made.
function aiforge(B) {
  const mast = B.r(1) < 0.5 ? -1 : 1, slit = B.r(2) < 0.5 ? -1 : 1, tint = B.pick(3, 0.94, 1.06);
  B.box(1.9, 0.14, 1.9, STEEL_DARK, { y: 0.07 });
  B.box(1.7, 2.0, 1.7, STEEL, { y: 1.14, shade: tint });
  for (const rx of [-0.5, 0.5]) for (const rz of [-0.86, 0.86]) B.box(0.08, 1.9, 0.05, STEEL_LIGHT, { x: rx, y: 1.14, z: rz });   // ribs
  for (const sx of [-0.86, 0.86]) B.box(0.05, 1.9, 0.08, STEEL_LIGHT, { x: sx, y: 1.14 });
  B.box(1.9, 0.16, 1.9, STEEL_LIGHT, { y: 2.22 });                               // the roof, stepped
  B.box(1.2, 0.14, 1.2, STEEL, { y: 2.37, shade: 1.08 });
  B.box(0.08, 0.8, 0.08, STEEL_DARK, { x: mast * 0.6, y: 2.84, z: -0.6 });       // mast
  B.box(0.14, 0.14, 0.14, COOL, { x: mast * 0.6, y: 3.3, z: -0.6 }, [COOL, 0.8]); // beacon
  B.box(0.62, 1.0, 0.08, DOOR_STEEL, { x: -slit * 0.3, y: 0.64, z: 0.86 });      // door
  B.box(0.62, 0.05, 0.06, COOL, { x: -slit * 0.3, y: 1.17, z: 0.87 }, [COOL, 0.5]);
  B.box(0.14, 1.1, 0.07, COOL, { x: slit * 0.5, y: 1.4, z: 0.865 }, [COOL, 0.35]); // the slits (0.35: at 0.9 they were white bars by night, at 0.5 still the brightest thing in the close view)
  for (const sx of [-0.865, 0.865]) B.box(0.07, 0.14, 1.0, COOL, { x: sx, y: 1.7 }, [COOL, 0.28]);
  B.box(1.0, 0.14, 0.07, COOL, { y: 1.7, z: -0.865 }, [COOL, 0.28]);
}

// STORAGE, three ways: a stone bin with blocks stacked on its lid, a ribbed
// steel container with a hatch and a status light, a log crib under a little
// shingled roof. The material is the building.
function storage(B, b) {
  const tint = B.pick(1, 0.94, 1.06);
  if (b.of === 'metal') {
    B.box(1.5, 1.0, 1.5, STEEL, { y: 0.5, shade: tint });
    for (const rx of [-0.5, 0, 0.5]) for (const rz of [-0.76, 0.76]) B.box(0.06, 0.96, 0.05, STEEL_LIGHT, { x: rx, y: 0.5, z: rz });
    B.box(1.62, 0.14, 1.62, STEEL_LIGHT, { y: 1.07 });
    B.box(0.6, 0.7, 0.05, HATCH, { y: 0.42, z: 0.775 });
    B.box(0.1, 0.1, 0.06, COOL, { x: 0.6, y: 0.85, z: 0.78 }, [0x4a6aff, 0.8]);
    return;
  }
  if (b.of === 'wood') {
    for (let layer = 0; layer < 2; layer++) {
      const y = 0.14 + layer * 0.52;
      for (const z of [-0.62, 0.62]) B.box(1.6, 0.26, 0.26, TIMBER, { y, z, shade: 0.96 + layer * 0.06 });
      for (const x of [-0.62, 0.62]) B.box(0.26, 0.26, 1.6, TIMBER_DARK, { x, y: y + 0.26, shade: 0.96 + layer * 0.06 });
    }
    for (const px of [-0.78, 0.78]) for (const pz of [-0.78, 0.78]) B.box(0.14, 1.4, 0.14, TIMBER_DEEP, { x: px, y: 0.7, z: pz });
    B.gable(1.9, 0.38, 1.8, TIMBER_DARK, { y: 1.4, shade: tint });
    return;
  }
  B.box(1.5, 0.9, 1.5, STONE, { y: 0.45, shade: tint });
  for (const y of [0.3, 0.6]) B.box(1.52, 0.04, 1.52, MORTAR, { y });
  B.box(1.62, 0.14, 1.62, STONE_LIGHT, { y: 0.97 });
  for (let i = 0; i < 3; i++) {
    B.box(0.3, 0.26, 0.3, STONE_LIGHT, { x: B.pick(10 + i, -0.5, 0.5), y: 1.17, z: B.pick(20 + i, -0.5, 0.5), ry: B.pick(30 + i, 0, 0.8), shade: 0.92 + i * 0.05 });
  }
}

// A SOLAR PANEL: dark glass tilted to the sky, in six cells on a low frame.
// An empty one glows faintly — it is waiting for a sprite that does not exist
// yet — and one with a sprite on it keeps only the glass's own sheen.
function panel(B, b, dy = 0) {
  const lit = b.free ? [PANEL_WAIT, 0.55] : [PANEL_DARK, 0.18];
  B.box(1.4, 0.26, 0.8, FRAME, { y: dy + 0.13 });
  B.box(1.7, 0.08, 1.15, GLASS, { y: dy + 0.36, rx: -0.32 }, lit);
  // the cells lie on the tilted glass: a point (lx, 0.045, lz) on its top
  // face, turned by the same -0.32 about x
  const cs = Math.cos(0.32), sn = Math.sin(0.32);
  for (const lx of [-0.56, 0, 0.56]) for (const lz of [-0.29, 0.29]) {
    B.box(0.5, 0.02, 0.5, CELL, { x: lx, y: dy + 0.36 + 0.045 * cs + lz * sn, z: 0.045 * -sn + lz * cs, rx: -0.32 }, lit);
  }
}
export const PANEL_TOP = 0.42;   // where a sprite stands on its panel (the glass's middle, plus its thickness)

// THE SPRITE, as a thing you can build: the same figure the world's bodies
// are (SPRITE below), standing on the panel it will charge on.
function spriteShape(B) {
  panel(B, { free: false });
  for (const p of SPRITE.forms.grown) {
    const lit = p.k === 'eye' || p.k === 'lamp' ? [0x6f86c9, 1] : null;
    B.box(p.w, p.h, p.d, lit ? 0x6f86c9 : SPRITE.shell, { x: p.x || 0, y: PANEL_TOP + (p.hang ? p.y - p.h / 2 : p.y), z: p.z || 0 }, lit);
  }
}

// A CART or a ROVER: a bed on four wheels; the rover carries its own panel
// and a lamp.
function vehicle(B, b) {
  const rover = b.of === 'rover';
  B.box(rover ? 1.5 : 1.3, 0.5, rover ? 1.0 : 0.85, rover ? 0x7d8896 : 0x8a6134, { y: 0.42 });
  if (rover) {
    B.box(1.2, 0.07, 0.8, GLASS, { y: 0.72, rx: -0.2 }, [0x14294a, 0.7]);
    B.box(0.1, 0.1, 0.06, COOL, { y: 0.55, z: 0.52 }, [COOL, 0.6]);
  } else {
    for (const z of [-0.4, 0.4]) B.box(1.3, 0.08, 0.06, TIMBER_DARK, { y: 0.7, z });   // rails
    B.box(0.08, 0.06, 0.6, TIMBER_DEEP, { y: 0.35, z: 0.72 });                      // the tow bar
  }
  for (const dx of [-0.55, 0.55]) for (const dz of [-0.42, 0.42]) B.cyl(0.19, 0.19, 0.1, 8, WHEEL, { x: dx, y: 0.19, z: dz, rz: Math.PI / 2 });
}

// kind: 'forge' | 'solarforge' | 'aiforge' | 'vehicle' | 'storage' | 'panel' | 'sprite'
// b:    the built record (x, z, of, free, …) — only the fields a kind reads.
// One Group holding ONE Mesh: the compiled geometry, vertex-coloured, with a
// `glow` attribute the world's lamp hook reads (userData.lit says so).
export function shapeFor(THREE, kind, b = {}) {
  const g = new THREE.Group();
  const B = builder(THREE, b);
  if (kind === 'forge') forge(B);
  else if (kind === 'solarforge') solarforge(B);
  else if (kind === 'aiforge') aiforge(B);
  else if (kind === 'vehicle') vehicle(B, b);
  else if (kind === 'storage') storage(B, b);
  else if (kind === 'panel') panel(B, b);
  else if (kind === 'sprite') spriteShape(B);
  else return g;
  const mesh = new THREE.Mesh(B.done(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.lit = true;
  g.add(mesh);
  return g;
}

// ---- THE SPRITE'S BODY ---------------------------------------------------------
// WORLD.md: "compact clusters of luminous voxels whose glow carries the
// presence's scheme — recognizably kin to the orb, but small, grounded, and
// growable. Stages (seed → sprout → grown) add voxels and articulation." It
// was a fibonacci shell of twenty-six cubes: a small white cloud from the god
// view, with no front, no feet and no face. This is a figure — a few boxes:
// legs that hang from the hip and arms from the shoulder (the person's trick,
// below), a body, a head with two eyes, and a lamp in its chest — and the
// world draws every part of every sprite from ONE instanced mesh per part
// (world-view.js rebuildBodies), so a society of twelve costs the same seven
// draw calls as a society of three. The eyes and the lamp glow in the
// society's scheme; the shell is a dark slate that the scheme tints faintly,
// so the kinship with the orb is its light, as the design asked.
//   A SEED is a pod on the ground with a face and a lamp. A SPROUT is the grown
// figure without its arms, three quarters the size. GROWN has everything.
//   +z is the way it faces. `hang` parts have their origin at the top (the
// joint): `y` is the joint's height, `swing` the gait phase (legs antiphase,
// each arm opposite its own leg).
export const SPRITE = {
  shell: 0x3a3e47,
  forms: {
    seed: [
      { k: 'pod', w: 0.36, h: 0.3, d: 0.32, y: 0.15 },
      { k: 'eye', w: 0.07, h: 0.07, d: 0.04, x: -0.08, y: 0.19, z: 0.16 },
      { k: 'eye', w: 0.07, h: 0.07, d: 0.04, x: 0.08, y: 0.19, z: 0.16 },
      { k: 'lamp', w: 0.12, h: 0.09, d: 0.05, y: 0.07, z: 0.16 },
    ],
    grown: [
      { k: 'leg', w: 0.14, h: 0.3, d: 0.15, x: -0.11, y: 0.3, hang: true, swing: 0 },
      { k: 'leg', w: 0.14, h: 0.3, d: 0.15, x: 0.11, y: 0.3, hang: true, swing: Math.PI },
      { k: 'body', w: 0.42, h: 0.42, d: 0.28, y: 0.51 },
      { k: 'arm', w: 0.11, h: 0.34, d: 0.12, x: -0.27, y: 0.7, hang: true, swing: Math.PI, arm: true },
      { k: 'arm', w: 0.11, h: 0.34, d: 0.12, x: 0.27, y: 0.7, hang: true, swing: 0, arm: true },
      { k: 'head', w: 0.38, h: 0.34, d: 0.36, y: 0.92, head: true },
      { k: 'eye', w: 0.07, h: 0.07, d: 0.04, x: -0.09, y: 0.95, z: 0.18, head: true },
      { k: 'eye', w: 0.07, h: 0.07, d: 0.04, x: 0.09, y: 0.95, z: 0.18, head: true },
      { k: 'lamp', w: 0.16, h: 0.13, d: 0.05, y: 0.56, z: 0.15 },
    ],
  },
  scale: { seed: 1, sprout: 0.74, grown: 1 },
  height: { seed: 0.3, sprout: 0.81, grown: 1.09 },
  eye: 0.95,          // where the ride camera stands in a grown one: in the head, below its top
  curl: 0.26,         // how far a sleeping figure sinks when its legs fold under it
};
SPRITE.forms.sprout = SPRITE.forms.grown.filter((p) => !p.arm);
export const SPRITE_STRIDE = 0.9;   // one full stride of the small legs, in blocks walked

// A PERSON. The human who walks in — Colin: "humanoid characters that the
// human user can play as also, to join you in there", "based in human reality
// so that we can relate to it". So a 1.75-block figure in matte cloth, not a
// glowing orb: seven boxes — torso, head, two arms hung from the shoulders, two
// legs hung from the hips — and one small lamp in the owner's scheme, so whose
// it is reads from across the ground the way a sprite's glow does.
//   THE LEGS HANG FROM THE HIP. A box pivots about its own centre, so a leg
// swung by rotating the mesh scissors through the ground and the torso (the
// fauna in world-view.js pivot about the centre and get away with it only
// because their legs are short). The geometry is translated so the box's local
// origin is its TOP; then the mesh sits at hip height and a rotation about x is
// a real swing from the hip. Same for the arms, from the shoulder.
export const PERSON_HEIGHT = 1.75;
export const PERSON_EYE = 1.60;      // where the first-person camera stands — a head, not a hub
const HIP = 0.85, SHOULDER = 1.38;

function limb(THREE, w, len, d, color) {
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, -len / 2, 0);                  // origin at the top: it hangs
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
}

export function personFor(THREE, b = {}) {
  const g = new THREE.Group();
  const cloth = b.cloth ?? 0x6e6a75, skin = b.skin ?? 0xc9b8a8, trouser = b.trouser ?? 0x4f4b56;
  const torso = box(THREE, 0.46, 0.68, 0.28, cloth, HIP + 0.34);
  const head = box(THREE, 0.30, 0.30, 0.30, skin, PERSON_HEIGHT - 0.15);
  const legL = limb(THREE, 0.18, HIP, 0.22, trouser); legL.position.set(-0.11, HIP, 0);
  const legR = limb(THREE, 0.18, HIP, 0.22, trouser); legR.position.set(0.11, HIP, 0);
  const armL = limb(THREE, 0.14, 0.62, 0.16, cloth); armL.position.set(-0.30, SHOULDER, 0);
  const armR = limb(THREE, 0.14, 0.62, 0.16, cloth); armR.position.set(0.30, SHOULDER, 0);
  // the lamp: one small cube at the chest in the owner's scheme, the only thing
  // on the figure that glows — it says whose person this is, and no more
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x181b20, emissive: b.lamp ?? 0xcfd6e0, emissiveIntensity: 1.1 }));
  lamp.position.set(0.12, HIP + 0.52, 0.16);
  for (const m of [torso, head, legL, legR, armL, armR, lamp]) g.add(m);
  // handles for the pose, so the gait never has to search the children
  g.userData.parts = { torso, head, legL, legR, armL, armR, lamp };
  return g;
}

// THE GAIT, as a pure function of DISTANCE WALKED — never of the clock. A body
// that stops must stop mid-stride wherever it is and not keep pumping its legs
// in place; and two screens that agree on where a person is must agree on
// which foot is forward, which they only can if the phase is a function of the
// same thing the position is. `walked` is the metres along the course; one
// full stride is a little over a block. Arms swing opposite to the legs.
// Operates on plain rotation objects, so it is testable without three.
export const STRIDE = 1.3;
export function posePerson(parts, walked, moving) {
  const ph = moving ? ((walked % STRIDE) / STRIDE) * Math.PI * 2 : 0;
  const swing = moving ? Math.sin(ph) * 0.55 : 0;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.7;
  parts.armR.rotation.x = swing * 0.7;
  // a little bob at each footfall, from the same phase
  const bob = moving ? Math.abs(Math.sin(ph)) * 0.05 : 0;
  parts.torso.position.y = HIP + 0.34 + bob;
  parts.head.position.y = PERSON_HEIGHT - 0.15 + bob;
  parts.lamp.position.y = HIP + 0.52 + bob;
  return ph;
}

// The same group, as lines: every mesh's material swapped for a wireframe.
// Emissive glow does not survive the swap, so a colour is chosen per mesh from
// what it had — the window shows form, not lighting. A compiled building
// carries its colours per vertex, and most of them are dark (slate, glass, a
// frame): drawn as they are, its wire was black on the window's black
// (2026-10-24). So the wire takes the MEAN of its vertex colours, in the
// kind's own hue, lifted to a brightness that reads.
export function asWireframe(THREE, group, color = null) {
  group.traverse((o) => {
    if (o.isMesh) {
      let c = color;
      const vc = o.geometry?.attributes?.color;
      if (c == null && vc) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < vc.count; i++) { r += vc.getX(i); g += vc.getY(i); b += vc.getZ(i); }
        const mean = new THREE.Color(r / vc.count, g / vc.count, b / vc.count);
        const lum = 0.2126 * mean.r + 0.7152 * mean.g + 0.0722 * mean.b;
        mean.multiplyScalar(0.45 / Math.max(0.02, lum));
        c = new THREE.Color(Math.min(1, mean.r), Math.min(1, mean.g), Math.min(1, mean.b));
      }
      if (c == null) c = o.material.emissive && o.material.emissiveIntensity > 0.5 ? o.material.emissive.getHex() : o.material.color.getHex();
      o.material = new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.9 });
    }
  });
  return group;
}

// What a build recipe produces on the ground, so the window can draw the
// finished thing: 'stone storage' → { kind: 'storage', of: 'stone' }.
export function producedBy(build) {
  if (!build) return { kind: 'panel' };
  return { kind: build.makes, of: build.of, free: build.makes === 'panel' };
}
