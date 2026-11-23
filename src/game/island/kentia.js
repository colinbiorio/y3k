// kentia.js — THE KENTIA PALM (Howea forsteriana), LORD HOWE'S OWN, AS NUMBERS. No page, no three: the suite holds it
// to the botanists' measures; plants.js builds its shapes from these numbers (its leaves leaflet by leaflet near the eye,
// its fronds as cards further off, and pictures of it from every side for the far forest).
//
// What it is (Flora of Australia; the Royal Botanic Gardens Victoria's horticultural flora; LLIFLE's palm encyclopedia;
// and the island's own photographs, looked at for this, never shipped):
//   · ONE TRUNK, solitary and erect, to 18 m in the forest and about 15 cm through, swollen at its foot; green and young
//     under the leaves, grey with age; its ring scars, one for every leaf it has dropped, oblique, raised, undulating;
//   · NO CROWNSHAFT: the leaves' bases wrap the top of the trunk and break down into brown fibres;
//   · its crown 3 to 7 m across: the youngest leaf a spear straight up, then the fronds held out and arching, the lower
//     ones level and drooping, the oldest hanging and browning before they fall;
//   · each frond PINNATE, 3 to 4 m: a long unarmed petiole, then the rachis with its leaflets, linear, up to 80 cm long
//     and 2 to 5 cm wide, dark green above and lighter below, a yellowish midrib, each folded down along it (reduplicate:
//     a roof, not a gutter); the two rows set "crowded, drooping, in a ^-shaped arrangement": they leave the rachis down
//     and outward and hang the more the older the frond. (The curly palm, H. belmoreana, holds its leaflets up in a V;
//     the Kentia's droop is its mark.)
//   · 3 to 8 flower spikes 1 to 2 m long hang from among the leaf bases; the fruit ripens red-brown over 3 to 4 years.
//
// The crown here is in its own frame: y up, the top of the trunk (where the fronds come from) at the origin. Lengths in
// metres, angles in radians unless a name says degrees.

export const KENTIA = {
  trunk: {
    foot: 0.105, mid: 0.072, top: 0.064,          // m: its radius at the foot (the swelling), along its length, under the leaves
    swell: 0.9,                                    // m: how high the foot's swelling reaches
    green: 1.1,                                    // m of young green trunk under the leaves
    ring: [0.028, 0.06],                           // m between the ring scars: low on the old trunk, high on the young
  },
  crown: {
    fronds: [14, 18],                              // how many open fronds a grown crown holds
    spear: 1.5,                                    // m: the unopened spear leaf, straight up from the middle
    sheath: 0.75, sheathR: 0.16,                   // m: the fibrous leaf bases about the top of the trunk, how high and how wide
  },
  frond: {
    petiole: [0.9, 1.25],                            // m of bare stalk before the first leaflets
    rachis: [2.0, 2.45],                           // m that bears leaflets
    leaflets: 46,                                  // a side
    long: 0.78,                                    // m: the longest leaflets (near the middle of the rachis)
    wide: 0.036,                                   // m: their width
    insertDeg: [52, 34],                           // degrees from the rachis, toward its tip, that a leaflet leaves it at: at its base, at its tip
    roofDeg: [36, 56],                             // degrees below the frond's own plane a leaflet leaves it at (the ^): a young frond, an old one
    droop: [0.5, 1.15],                            // how far (of its length) a leaflet's tip hangs below its straight line: young, old
    foldDeg: 17,                                   // the leaflet's fold along its midrib (each half off the flat)
    stiff: [0.3, 0.42],                            // the rachis's bend under its weight (rad a metre, at its most): young, old
  },
};

// a number for anything counted, the same every time: [0, 1) (life.js's hash, kept here so this file stands alone)
export function hash(i, j, k = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));       // 137.5 degrees: the turn between one leaf and the next

// A CROWN: its fronds, youngest first (age 0) to oldest (age 1), each its own way round (the golden turn), its rise at the
// base, its length, how stiff, how far it rolls about itself, and whether it is dead (browning, hanging). `young`: a palm
// of the understorey, its fronds rising from the ground (none hanging).
export function crownOf(seed, { young = false, dead: hangs = true } = {}) {
  const K = KENTIA, r = (k) => hash(seed, 31, k);
  const n = young ? 5 + Math.floor(3 * r(1)) : K.crown.fronds[0] + Math.floor((K.crown.fronds[1] - K.crown.fronds[0] + 1) * r(1));
  const dead = young || !hangs ? 0 : r(2) < 0.6 ? 1 : 2;
  const az0 = 6.2832 * r(3), fronds = [];
  for (let k = 0; k < n + dead; k++) {
    const age = n > 1 ? Math.min(1, k / (n - 1)) : 0, isDead = k >= n, j = (q) => hash(seed, 100 + k, q);
    // a young frond stands up; the older ones come out lower on the stem, lower, and bend more under their weight
    const rise = young ? (78 - 46 * age + 8 * (j(1) - 0.5)) * Math.PI / 180
      : isDead ? (-48 - 22 * j(1)) * Math.PI / 180 : (60 - 95 * age + 10 * (j(1) - 0.5)) * Math.PI / 180;
    const scale = young ? 0.55 + 0.2 * j(2) : 0.92 + 0.16 * j(2);
    fronds.push({
      k, age: isDead ? 1 : age, dead: isDead,
      az: az0 + k * GOLDEN + 0.18 * (j(3) - 0.5), rise,
      petiole: lerp(K.frond.petiole[0], K.frond.petiole[1], j(4)) * scale * (young ? 0.8 : 1),
      rachis: lerp(K.frond.rachis[0], K.frond.rachis[1], j(5)) * scale,
      stiff: lerp(K.frond.stiff[0], K.frond.stiff[1], isDead ? 1 : age) * (0.85 + 0.3 * j(6)) * (young ? 0.8 : 1),
      roll: 0.2 * (j(7) - 0.5),
      // where on the stem it comes from: the oldest lowest (m below the top), a little out from the middle
      drop: young ? 0.02 * k : 0.06 + 0.5 * (isDead ? 1.1 : age) * (0.8 + 0.4 * j(8)),
      seed: hash(seed, 200 + k, 0) * 1e6 | 0,
    });
  }
  return { seed, young, n, dead, fronds, spear: young ? 0.6 * K.crown.spear : K.crown.spear * (0.8 + 0.4 * r(4)) };
}

// THE SPINE of a frond: from where it leaves the stem out along its petiole and rachis, bending under its own weight (a
// cantilever: the more level a stretch of it lies the more it bends, and the more toward the tip, where it is thinnest),
// sampled every `step` metres. Each sample: its place, its way (t), its side (b: level, square to its way round the
// crown) and its up (n = b x t), and s, the metres along.
export function spineOf(f, step = 0.05) {
  const L = f.petiole + f.rachis, out = [];
  const c = Math.cos(f.az), sn = Math.sin(f.az), b = [-sn, 0, c];
  let th = f.rise, p = [c * (0.07 + 0.05 * Math.cos(f.rise)), -f.drop, sn * (0.07 + 0.05 * Math.cos(f.rise))];
  const n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    const t = [Math.cos(th) * c, Math.sin(th), Math.cos(th) * sn];
    // the frond rolls a little about itself toward its tip
    const roll = f.roll * (s / L), nn = cross(b, t), bb = add(b.map((v) => v * Math.cos(roll)), nn, Math.sin(roll)), nr = norm(cross(bb, t));
    out.push({ s, p: [...p], t, b: norm(bb), n: nr });
    // the bend: weight times lever, in the vertical plane; a frond past straight down does not bend further
    const k = f.stiff * Math.max(0, Math.cos(th)) * (0.45 + 1.1 * (s / L));
    th = Math.max(-1.45, th - k * (L / n));
    p = add(p, [Math.cos(th) * c, Math.sin(th), Math.cos(th) * sn], L / n);
  }
  return out;
}
// the spine at s metres along (between its samples)
export function spineAt(sp, s) {
  const L = sp[sp.length - 1].s, x = Math.max(0, Math.min(1, s / L)) * (sp.length - 1), i = Math.min(sp.length - 2, Math.floor(x)), f = x - i, a = sp[i], b = sp[i + 1];
  const mix = (u, v) => [lerp(u[0], v[0], f), lerp(u[1], v[1], f), lerp(u[2], v[2], f)];
  return { s, p: mix(a.p, b.p), t: norm(mix(a.t, b.t)), b: norm(mix(a.b, b.b)), n: norm(mix(a.n, b.n)) };
}

// how long the leaflets are along the rachis (x: 0 at its first leaflet, 1 at its tip): about half the longest at the
// base, the longest a third of the way out, a quarter at the tip
export function leafletLength(x) {
  return x < 0.36 ? 0.5 + 0.5 * Math.sin((Math.PI / 2) * (x / 0.36)) : 1 - 0.74 * Math.pow((x - 0.36) / 0.64, 1.5);
}
// a leaflet's width along it (u: 0 at the rachis, 1 at its tip): narrow where it joins, widest a fifth of the way out,
// then drawn out to a point (acuminate)
export const LEAFLET_RINGS = [0, 0.18, 0.5, 0.8, 1];
export function leafletWidth(u) {
  return u < 0.18 ? 0.45 + 0.55 * Math.sin((Math.PI / 2) * (u / 0.18)) : Math.max(0, 1 - Math.pow((u - 0.18) / 0.82, 1.35));
}

// THE LEAFLETS of a frond, both rows: where each leaves the rachis (s along the spine), its side (+1, -1), length and
// width, the angles it leaves at (insert: toward the tip, in the frond's plane; roof: down out of it) and how far its tip
// hangs (droop), and a number of its own (for its shade and its flutter). A dead frond's leaflets are shrunk and hang.
export function leafletsOf(f, count = KENTIA.frond.leaflets) {
  const F = KENTIA.frond, out = [];
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < count; i++) {
    const x = (i + 0.5 + 0.18 * (hash(f.seed, i, side + 5) - 0.5)) / count, q = hash(f.seed, i, side + 9);
    const len = F.long * leafletLength(x) * (0.9 + 0.2 * q) * (f.rachis / 2.35) * (f.dead ? 0.9 : 1);
    out.push({
      s: f.petiole + x * f.rachis, x, side, len,
      wide: F.wide * (1 - 0.35 * x) * (0.85 + 0.3 * hash(f.seed, i, side + 13)) * (f.dead ? 0.6 : 1),
      insert: lerp(F.insertDeg[0], F.insertDeg[1], x) * Math.PI / 180,
      roof: (lerp(F.roofDeg[0], F.roofDeg[1], f.age) + 8 * x + 6 * (q - 0.5)) * Math.PI / 180,
      droop: Math.min(1.6, lerp(F.droop[0], F.droop[1], f.age) + 0.3 * x + 0.1 * (q - 0.5) + (f.dead ? 0.25 : 0)),
      q,
    });
  }
  return out;
}

// ONE LEAFLET at u (0 at the rachis, 1 at its tip): its place, its way (d), the way across it (w, its width) and its face
// (n, the upper side: dark and glossy). It leaves the rachis toward the tip and down out of the frond's plane, and its
// way turns down toward the ground as it goes (it hangs: its own weight on a thin blade), so it keeps its length.
export function leafletAt(sp, lf, u, steps = 8) {
  const at = spineAt(sp, lf.s), side = lf.side;
  const out0 = add(at.b.map((v) => v * side * Math.cos(lf.roof)), at.n, -Math.sin(lf.roof));
  const d0 = norm(add(at.t.map((v) => v * Math.cos(lf.insert)), out0, Math.sin(lf.insert)));
  // the way at v along it: d0 bent toward straight down by the droop, more toward the tip
  const way = (v) => norm(add(d0, [0, -1, 0], lf.droop * 2.0 * v));
  let p = add(at.p, at.b, side * 0.008), n = Math.max(1, Math.round(steps * u));
  for (let i = 0; i < n; i++) p = add(p, way(((i + 0.5) / n) * u), (lf.len * u) / n);
  const d = way(u);
  // across it: the rachis's way, held square to the leaflet's own (a leaflet joins the rachis along its width)
  // (n = w x d always: where that would face down, w is turned the other way, so a blade's upper side is its front)
  let w = norm(add(at.t, d, -dot(at.t, d))), nrm = norm(cross(w, d));
  if (dot(nrm, at.n) + 0.3 * nrm[1] < 0) { nrm = nrm.map((v) => -v); w = w.map((v) => -v); }
  return { p, d, w, n: nrm };
}

// a crown's reach: how far its fronds go out (its radius, m) and down (below the top of the trunk), for its bounding
// shapes (the far pictures are taken of a sphere this size)
export function reachOf(crown) {
  let r = 0, low = 0, high = crown.spear;
  for (const f of crown.fronds) {
    const sp = spineOf(f, 0.1);
    for (const q of sp) { r = Math.max(r, Math.hypot(q.p[0], q.p[2])); low = Math.min(low, q.p[1]); high = Math.max(high, q.p[1]); }
    for (const lf of leafletsOf(f, 12)) { const e = leafletAt(sp, lf, 1, 4); r = Math.max(r, Math.hypot(e.p[0], e.p[2])); low = Math.min(low, e.p[1]); high = Math.max(high, e.p[1]); }
  }
  return { r, low, high };
}
