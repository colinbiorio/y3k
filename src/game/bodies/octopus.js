// octopus.js — THE OCTOPUS: eight arms and a collar of glass.
//
// The fourth of the five kinds (../kinds.js); its five choices are mantle,
// skin, marks, arms and collar. It is on no legs. It stands on six of its
// arms and crawls on them, three tips always on the floor (../crawl.js); the
// other two hang at its sides. Faster than a crawl can carry it, it lets go
// of the floor and jets, mantle first, its arms streaming behind.
//
// An arm is one length of itself, from the body to its end. It goes down to
// where it meets the floor, and what is left over is rolled up there: so a
// long reach unrolls the curl, and standing close rolls it up again.
//
// The picture it was drawn from is ../art/v1/octopus.webp. Ancient: the
// animal. Now: the brass. To come: glass worn in the air by one of the sea.
import * as THREE from 'three';
import { HIDE } from '../kinds.js';
import { createCrawl, stepCrawl, shiftCrawl } from '../crawl.js';
import { loft, ball, hoop, placed, kit, tube, pipe, panel, on, cloth, stuff, TILE } from '../shape.js';
import { bodyOf, node, wide, capsules, carried } from './common.js';

const PI = Math.PI, TAU = 2 * PI, sat = (x) => Math.min(1, Math.max(0, x)), smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// the arms it stands on: how high it stands, how thick they are, how much of each is left to roll up at the
// floor, and what the crawl is told (../crawl.js)
const ARMS = {
  standing: { H: 0.74, thick: 1, spare: 0.33, crawl: { ring: 0.26 } },
  curled: { H: 0.7, thick: 1, spare: 0.46, crawl: { ring: 0.27 } },
  long: { H: 0.92, thick: 0.88, spare: 0.34, crawl: { ring: 0.28, reach: 0.4 } },
  stout: { H: 0.58, thick: 1.3, spare: 0.28, crawl: { ring: 0.27, reach: 0.3 } },
  webbed: { H: 0.74, thick: 1, spare: 0.33, crawl: { ring: 0.26 }, web: true },
};
// the body between the arms and the mantle: shoulders, and a neck for the collar
const COLUMN = [[-0.05, 0.085, 0.085], [-0.01, 0.132, 0.12], [0.04, 0.138, 0.122], [0.085, 0.108, 0.1], [0.12, 0.09, 0.09], [0.17, 0.078, 0.078]];
// the mantle, from the neck up (it leans back): its sections, its face flatter than its back, and how high
// the dome over the last of them is (in that section's half-widths)
const MANTLES = {
  dome: [[[0, 0.084, [0.088, 0.084]], [0.06, 0.096, [0.102, 0.09], 0.004], [0.14, 0.112, [0.1, 0.112]], [0.23, 0.127, [0.106, 0.128], -0.008], [0.31, 0.124, [0.104, 0.126], -0.012]], 1],
  round: [[[0, 0.088, [0.09, 0.088]], [0.05, 0.114, [0.112, 0.104], 0.004], [0.12, 0.142, [0.124, 0.138]], [0.19, 0.152, [0.13, 0.152], -0.006], [0.23, 0.15, [0.128, 0.15], -0.008]], 0.86],
  point: [[[0, 0.084, [0.088, 0.084]], [0.06, 0.096, [0.102, 0.09], 0.004], [0.14, 0.112, [0.1, 0.112]], [0.24, 0.118, [0.1, 0.122], -0.012], [0.34, 0.094, [0.08, 0.1], -0.03], [0.44, 0.06, [0.05, 0.064], -0.06], [0.52, 0.03, [0.027, 0.032], -0.095]], 1.6],
};
const LEAN = -0.3;
// an arm it stands on: how many rings it is drawn with (closer together toward its end), and round it
const N = 40, SEG = 10, CROWD = 1.7, along = (t) => 1 - (1 - t) ** CROWD;
// how tightly its end is rolled (the radius there), and how much wider the roll is for each metre further from the end
const ROLL = [0.02, 0.168];
const FLOOR = 0.004;

// the suckers: two rows of pale rings down the side of an arm that faces what it holds
function suckers() {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = 128; c.height = 32;
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#fff'; g.lineWidth = 3.2;
  for (const [x, y] of [[23, 8], [41, 24]]) { g.beginPath(); g.arc(x, y, 5.4, 0, TAU); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.anisotropy = 4;
  return t;
}
// a tube's surface, laid by how far along the arm each ring is (ms, metres) and how thick it is there (rs):
// the skin's tile down it, and the suckers at a spacing that keeps them round
function skinned(t, seg, ms, rs) {
  const m = seg + 1, n = ms.length, uv = t.geo.attributes.uv.array, uv1 = new Float32Array(n * m * 2);
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i) v += (ms[i] - ms[i - 1]) / (1.57 * 0.5 * (rs[i] + rs[i - 1]));
    for (let j = 0; j < m; j++) { const o = (i * m + j) * 2; uv[o + 1] = ms[i] / TILE.skin; uv1[o] = j / seg; uv1[o + 1] = v; }
  }
  t.geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return t;
}

export function createOctopus(look, { lite = false } = {}) {
  const A = ARMS[look.arms] || ARMS.standing, H = A.H, kt = A.thick, kw = 0.6 + 0.4 * kt;
  const S = stuff(lite), K = kit(), felt = capsules(1), held = carried(), cloths = [];
  const [main, second] = HIDE[look.skin] || HIDE.teal, rings = suckers();
  const C = createCrawl(A.crawl);
  const group = new THREE.Group(), rig = node(group), tilt = node(rig, [0, H, 0]), body = node(tilt), mantle = node(body, [0, 0.1, 0]);
  const M = {
    skin: S.skin(main, { roughness: 0.42 }), arm: S.skin(main, { roughness: 0.42, emissive: second, emissiveIntensity: 0.4, emissiveMap: rings }),
    eye: S.plain('#d6d3a4', { roughness: 0.2 }), pupil: S.plain('#0d0f12', { roughness: 0.15 }), mark: S.glow(second),
  };

  // ── the body: shoulders and a neck; the mantle over them, leaning back; two eyes at its foot
  const [MANT, CAP] = MANTLES[look.mantle] || MANTLES.dome, last = MANT[MANT.length - 1], top = last[0], side = on(MANT);
  const crown = CAP * Math.min(last[1], (last[2][0] + last[2][1]) / 2), full = top + 0.9 * crown;
  // a point on the mantle, the dome over its last section too: (how high, the angle round it, how far off it)
  const dome = (y, th, lift = 0) => {
    if (y <= top) return side(y, th, lift);
    const a = Math.asin(Math.min(1, (y - top) / crown)), c = Math.cos(a), p = side(top, th, lift * c);
    return [p[0] * c, y + lift * Math.sin(a), last[3] + (p[2] - last[3]) * c];
  };
  K.put(body, M.skin, loft(wide(COLUMN, kw), { seg: 20, cap: [0.5, 0.3], tile: TILE.skin }));
  K.put(mantle, M.skin, loft(MANT, { seg: 24, sub: 4, cap: [0.3, CAP], tile: TILE.skin }));
  for (const sd of [1, -1]) {
    const th = PI / 2 - sd * 0.74, at = side(0.07, th, -0.016), turn = [-LEAN, PI / 2 - th, 0], put = (mat, geo, l) => K.put(mantle, mat, placed(placed(geo, l), at, turn));
    put(M.skin, ball([0.056, 0.05, 0.036], 16), [0, 0, 0]);
    put(M.eye, ball([0.036, 0.031, 0.03], 14), [0, 0, 0.018]);
    put(M.pupil, ball([0.021, 0.0062, 0.007], 10), [0, 0, 0.0435]);
    put(M.skin, ball([0.043, 0.02, 0.034], 12), [0, 0.025, 0.016]);
    put(M.skin, ball([0.041, 0.015, 0.032], 12), [0, -0.026, 0.015]);
  }
  // ── its marks: light of its second colour, on the mantle
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const spot = (y, th, r) => K.put(mantle, M.mark, placed(ball([r, r, r], 6), dome(y, th)));
  const line = (pts) => K.put(mantle, M.mark, pipe(pts, { radius: () => 0.0022, seg: 4 }));
  if (look.marks === 'spots') {
    for (let i = 0; i < 38; i++) { const high = i < 24; spot(full * (high ? 0.45 + 0.55 * rnd() : 0.06 + 0.3 * rnd()), PI / 2 + (rnd() - 0.5) * (high ? 3.6 : 2.4), 0.0032 + 0.0045 * rnd() * rnd()); }
  } else if (look.marks === 'rings') {
    for (let i = 0; i < 10; i++) { const y = full * (0.3 + 0.6 * rnd()), th = PI / 2 + (rnd() - 0.5) * 4.6, r = 0.011 + 0.009 * rnd(); line(Array.from({ length: 13 }, (_, k) => dome(y + r * Math.sin(k * TAU / 12), th + r * Math.cos(k * TAU / 12) / 0.11, 0.0012))); }
  } else if (look.marks === 'bands') {
    for (const f of [0.5, 0.72, 0.94]) K.put(mantle, M.mark, panel(MANT, { y: [top * f - 0.004, top * f + 0.004], th: [PI / 2 + 1, PI / 2 + TAU - 1], lift: 0.0012, rows: 1, cols: 30, rim: false }));
  } else if (look.marks === 'stars') {
    for (let i = 0; i < 13; i++) {
      const y = full * (0.25 + 0.65 * rnd()), th = PI / 2 + (rnd() - 0.5) * 4.6, r = 0.009 + 0.006 * rnd(), turn = rnd() * PI;
      for (let k = 0; k < 3; k++) { const a = turn + k * PI / 3, dy = r * Math.sin(a), dth = r * Math.cos(a) / 0.11; line([dome(y - dy, th - dth, 0.0012), dome(y, th, 0.0018), dome(y + dy, th + dth, 0.0012)]); }
    }
  }

  // ── what it wears round its neck: it rests behind and hangs in front
  const glassy = look.collar === 'glass', collar = node(body, glassy ? [0, 0.105, 0.03] : [0, 0.09, 0.012]), brass = () => S.bronze('#c79a55', { soft: 0.4, relief: 0.4, roughness: 0.3 });
  collar.rotation.x = glassy ? 0.35 : 0.16;
  if (glassy) {
    // a ring of brass with three clasps, and a band of glass standing on it
    const m = brass(), glass = K.mat(new THREE.MeshStandardMaterial({ color: '#dff4ff', transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0, depthWrite: false, side: THREE.DoubleSide }));
    K.put(collar, m, hoop(0.152, 0.011, [1, 1], 40));
    for (const a of [PI / 2, PI / 2 + 1.9, PI / 2 - 1.9]) K.put(collar, m, placed(loft([[-0.016, 0.013, 0.008, 0, 5], [0.016, 0.013, 0.008, 0, 5]], { seg: 8, cap: [0.25, 0.25] }), [0.156 * Math.cos(a), 0, 0.156 * Math.sin(a)], [0, PI / 2 - a, 0]));
    K.put(collar, glass, loft([[0.006, 0.153, 0.153], [0.052, 0.16, 0.16]], { seg: 40, sub: 1, cap: [0, 0] }));
    K.put(collar, K.mat(new THREE.MeshStandardMaterial({ color: '#f4fbff', transparent: true, opacity: 0.6, roughness: 0.04, metalness: 0, depthWrite: false })), placed(hoop(0.16, 0.0022, [1, 1], 40), [0, 0.052, 0]));
  } else if (look.collar === 'woven') {
    K.put(collar, S.wool('#8f7150'), hoop(0.122 * kw, 0.026, [1, 1], 32));
  } else if (look.collar === 'shells') {
    K.put(collar, S.wool('#6e5a44'), hoop(0.118 * kw, 0.004, [1, 1], 32));
    const shell = S.ceramic('#efe4cf');
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? 0.014 : 0.019; K.put(collar, shell, placed(ball([r, r * 0.55, r * 0.8], 10), [0.126 * kw * Math.cos(a), -0.004, 0.126 * kw * Math.sin(a)], [0.5, PI / 2 - a, 0])); }
  } else if (look.collar === 'torque') {
    // open in front, a knob at each end
    const m = brass(), pts = Array.from({ length: 33 }, (_, i) => { const a = PI / 2 + 0.5 + i * (TAU - 1) / 32; return [0.125 * kw * Math.cos(a), 0, 0.125 * kw * Math.sin(a)]; });
    K.put(collar, m, pipe(pts, { radius: (u) => 0.008 + 0.006 * Math.sin(PI * u), seg: 8 }, [0, 1, 0]));
    for (const p of [pts[0], pts[32]]) K.put(collar, m, placed(ball([0.016, 0.016, 0.016], 10), p));
  }

  felt.capsule(body, [0, -0.05, 0], body, [0, 0.1, 0], 0.11 * kw); felt.capsule(body, [0, -0.1, 0], body, [0, -0.6, 0], 0.12 * kw);

  // ── the six it stands on. Each is laid in the world's numbers, every frame.
  const R0 = 0.085 * kw, RY = 0.02, thick = (x) => kt * (0.007 + 0.038 * (1 - x) ** 0.55), RG = thick(0.72), END = ROLL[0] * kt;
  const L = 1.03 * Math.hypot(H + RY - RG, C.c.ring - R0) + A.spare;
  const ms = Float32Array.from({ length: N }, (_, i) => L * along(i / (N - 1))), rs = ms.map((m) => thick(m / L));
  const legs = Array.from({ length: C.c.arms }, (_, i) => {
    const a = (i + 0.5) * TAU / C.c.arms, t = skinned(tube(N, { seg: SEG, radius: (u) => thick(along(u)) }), SEG, ms, rs);
    K.own(group, t.geo, M.arm, { cull: false });
    return { t, lx: Math.sin(a), lz: Math.cos(a), d: [0, 0], T: [0, -1, 0], set: false, at: i * 1.9, F: new Float32Array(N * 3), Q: new Float32Array(N * 3) };
  });
  // the way down from the body to where it meets the floor, measured (a curve, in so many pieces)
  const BZ = 16, bx = new Float32Array(BZ + 1), by = new Float32Array(BZ + 1), bz = new Float32Array(BZ + 1), bl = new Float32Array(BZ + 1);
  // On the floor: from the body (R, leaving it along rd) down to G, and the rest of its length rolled up
  // from there in the way `d` points: tighter toward its end. A reach unrolls it; past its length it stretches.
  function planted(leg, tip, R, rd, out) {
    const gx = tip.x, gy = tip.y + RG + FLOOR, gz = tip.z, dx = leg.d[0], dz = leg.d[1];
    const D = Math.hypot(gx - R[0], gy - R[1], gz - R[2]), k1 = 0.6 * D, k2 = Math.min(0.14, 0.3 * D);
    const ax = R[0] + rd[0] * k1, ay = R[1] + rd[1] * k1, az = R[2] + rd[2] * k1, cx = gx - dx * k2, cz = gz - dz * k2;
    let len = 0;
    for (let k = 0; k <= BZ; k++) {
      const u = k / BZ, v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
      bx[k] = b0 * R[0] + b1 * ax + b2 * cx + b3 * gx; by[k] = b0 * R[1] + b1 * ay + (b2 + b3) * gy; bz[k] = b0 * R[2] + b1 * az + b2 * cz + b3 * gz;
      if (k) len += Math.hypot(bx[k] - bx[k - 1], by[k] - by[k - 1], bz[k] - bz[k - 1]);
      bl[k] = len;
    }
    const stretch = Math.max(1, (len + 0.07) / L);
    let k = 1, th = 0, px = gx, py = gy, pz = gz, was = len;
    for (let i = 0; i < N; i++) {
      const a = ms[i] * stretch, o = i * 3;
      if (a <= len) {
        while (k < BZ && bl[k] < a) k++;
        const f = (a - bl[k - 1]) / Math.max(1e-9, bl[k] - bl[k - 1]);
        out[o] = bx[k - 1] + (bx[k] - bx[k - 1]) * f; out[o + 1] = by[k - 1] + (by[k] - by[k - 1]) * f; out[o + 2] = bz[k - 1] + (bz[k] - bz[k - 1]) * f;
      } else {
        const ds = a - was, bend = ds / (END + ROLL[1] * Math.max(0, L - 0.5 * (a + was) / stretch)), tm = th + bend / 2, c = ds * Math.cos(tm);
        px += c * dx; py += ds * Math.sin(tm); pz += c * dz; th += bend; was = a;
        out[o] = px; out[o + 1] = py; out[o + 2] = pz;
      }
    }
  }
  // Loose: from the body, turning from the way it leaves it to the way it trails (leg.T); a wave runs down
  // it, and its end is rolled outward (toward n).
  function loose(leg, R, rd, nx, ny, nz, wave, t, out) {
    const T = leg.T;
    let px = R[0], py = R[1], pz = R[2];
    out[0] = px; out[1] = py; out[2] = pz;
    for (let i = 1; i < N; i++) {
      const x = ms[i] / L, ds = ms[i] - ms[i - 1], e = smooth(0, 0.3, x), o = i * 3;
      let ux = rd[0] + (T[0] - rd[0]) * e, uy = rd[1] + (T[1] - rd[1]) * e, uz = rd[2] + (T[2] - rd[2]) * e, l = Math.hypot(ux, uy, uz) || 1;
      ux /= l; uy /= l; uz /= l;
      const q = nx * ux + ny * uy + nz * uz;
      let mx = nx - q * ux, my = ny - q * uy, mz = nz - q * uz; l = Math.hypot(mx, my, mz) || 1; mx /= l; my /= l; mz /= l;
      const end = sat((x - 0.62) / 0.38), turn = wave * x * Math.sin(t - 7 * x + leg.at) + 3.6 * end * end, c = Math.cos(turn), s = Math.sin(turn);
      px += ds * (c * ux + s * mx); py += ds * (c * uy + s * my); pz += ds * (c * uz + s * mz);
      if (py < rs[i] + FLOOR) py = rs[i] + FLOOR;
      out[o] = px; out[o + 1] = py; out[o + 2] = pz;
    }
  }

  // ── the two that hang at its sides: chains, drawn as arms
  const hang = [1, -1].map((sd) => {
    const c = cloth({ anchor: body, cols: 1, rows: 10, top: [[sd * 0.128 * kw, 0.035, 0.012]], dir: (_, r) => [sd * (0.5 - 0.085 * r), -1, 0.06], len: 0.062, stiff: 0.3, gravity: 5 });
    const slim = (u) => kt * (0.005 + 0.024 * (1 - u) ** 0.8), far = Float32Array.from({ length: 11 }, (_, i) => 0.062 * i), fat = far.map((m) => slim(m / 0.62));
    const t = skinned(tube(11, { seg: 7, radius: slim }), 7, far, fat), link = { cloth: c, stiff: 0.3 };
    K.own(group, t.geo, M.arm, { cull: false }); cloths.push(link);
    return { c, t, sd, link };
  });

  // ── how it carries itself
  const R = [0, 0, 0], rd = [0, 0, 0], pose = { falls: [], speed: 0, state: 'crawl' };
  let t = 0, stream = 0, ride = H, crouch = 0, pitch = 0, bank = 0, was = null, beat = 0, yaw = 0, heard = 0;
  const self = {
    group, scale: 1, world: held.world, capsule: felt.capsule, shapes: felt.shapes,
    land(speed) { crouch = Math.min(0.25, Math.max(crouch, 0.04 * speed)); },
    // One frame: where its tips are (the crawl), how it holds itself, and every arm laid. Answers the pose,
    // with `falls`: where a tip came down this frame, in the world ([x, z]).
    step(b, dt, at) {
      held.moved(at, dt);
      stepCrawl(C, b, at, dt);
      t += dt;
      const st = C.state, off = st !== 'crawl', hv = Math.hypot(b.v[0], b.v[2]), k = (r) => 1 - Math.exp(-r * dt), cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      stream += ((off ? 1 : 0) - stream) * k(10); if (Math.abs(stream - (off ? 1 : 0)) < 0.002) stream = off ? 1 : 0;
      crouch *= Math.exp(-8 * dt);
      const jet = st === 'jet' || st === 'dash' ? 1 : st === 'fly' ? smooth(2, 13, hv) : 0;
      ride += ((st === 'jet' ? 0.46 : st === 'dash' ? 0.52 : st === 'crawl' ? H - 0.07 * Math.min(1, C.speed / 2.5) : H) - ride) * k(9);
      pitch += ((st === 'air' ? 0.1 : jet ? 1.3 * jet : Math.min(0.15, 0.05 * C.speed)) - pitch) * k(8);
      if (was !== null && dt > 0) { let d = b.yaw - was; d -= TAU * Math.round(d / TAU); bank += (Math.min(0.32, Math.max(-0.32, (d / dt) * C.speed * 0.045)) - bank) * k(7); }
      was = b.yaw;
      // a jet is a beat: the arms part as it draws in, and close as it drives
      beat += dt * TAU * 1.6 * jet; const part = jet * (0.5 - 0.5 * Math.cos(beat)), breath = Math.sin(1.3 * t);
      rig.position.set(at[0], at[1], at[2]); rig.rotation.y = b.yaw; yaw = b.yaw;
      tilt.position.y = ride - crouch + 0.006 * breath * (1 - stream); tilt.rotation.set(pitch, 0, -bank);
      mantle.rotation.x = LEAN * (1 - 0.85 * jet); mantle.scale.set(1 + 0.012 * breath + 0.05 * part, 1 - 0.008 * breath - 0.03 * part, 1 + 0.012 * breath + 0.05 * part);
      rig.updateMatrixWorld(true);

      const e = body.matrixWorld.elements, fall = st === 'air' ? sat(-b.v[1] / 7) : 0, flow = sat(hv / 7), ux = hv > 1e-6 ? b.v[0] / hv : 0, uz = hv > 1e-6 ? b.v[2] / hv : 0;
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i], tip = C.tips[i], lx = leg.lx, lz = leg.lz, ox = lx * cs + lz * sn, oz = -lx * sn + lz * cs;          // (ox, oz): outward from the body, on the floor
        const x = R0 * lx, z = R0 * lz, qx = 0.1 * lx, qz = 0.1 * lz, ql = Math.hypot(qx, 1, qz);
        R[0] = e[0] * x + e[4] * RY + e[8] * z + e[12]; R[1] = e[1] * x + e[5] * RY + e[9] * z + e[13]; R[2] = e[2] * x + e[6] * RY + e[10] * z + e[14];
        rd[0] = (e[0] * qx - e[4] + e[8] * qz) / ql; rd[1] = (e[1] * qx - e[5] + e[9] * qz) / ql; rd[2] = (e[2] * qx - e[6] + e[10] * qz) / ql;
        // the roll at the floor points the way the arm reached; it is turned only while the tip is up
        if (!tip.down || !leg.set) {
          const hx = tip.x - R[0], hz = tip.z - R[2], hl = Math.hypot(hx, hz), w = hl > 1e-6 ? 1.2 * Math.min(1, hl / 0.25) / hl : 0;
          let dx = ox + hx * w, dz = oz + hz * w; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          const g = leg.set ? k(12) : 1; dx = leg.d[0] + (dx - leg.d[0]) * g; dz = leg.d[1] + (dz - leg.d[1]) * g;
          const l = Math.hypot(dx, dz) || 1; leg.d[0] = dx / l; leg.d[1] = dz / l;
        }
        // the way a loose arm trails: back along the way it goes, and down; spread when it falls or draws in
        const spread = 0.1 + 0.8 * fall + 0.3 * part, g = leg.set ? k(9) : 1, T = leg.T;
        let tx = -1.25 * flow * ux + spread * ox, ty = -(1 - 0.9 * flow) * (1 - 0.6 * fall), tz = -1.25 * flow * uz + spread * oz; const tl = Math.hypot(tx, ty, tz) || 1;
        T[0] += (tx / tl - T[0]) * g; T[1] += (ty / tl - T[1]) * g; T[2] += (tz / tl - T[2]) * g;
        leg.set = true;
        if (stream < 1) planted(leg, tip, R, rd, leg.F);
        if (stream > 0) {
          const nl = Math.hypot(ox, 0.35, oz);
          loose(leg, R, rd, ox / nl, 0.35 / nl, oz / nl, 0.25 + 0.2 * jet, 1.6 * TAU * t, leg.Q);
          if (stream < 1) for (let j = 0; j < N * 3; j++) leg.F[j] += (leg.Q[j] - leg.F[j]) * stream;
        }
        leg.t.set(stream < 1 ? leg.F : leg.Q, [-ox, 0, -oz]);
      }
      for (const a of hang) a.link.stiff = 0.3 - 0.2 * stream;
      pose.falls.length = 0; pose.speed = C.speed; pose.state = st;
      for (const f of C.falls) if (heard++ % 2 === 0) pose.falls.push([f[0], f[1]]);          // every other one rings the water: six tips are many
      return pose;
    },
  };
  held.world.push({ shift(dx, dy, dz) { shiftCrawl(C, dx, dz); } });

  K.build();
  const fig = bodyOf(self, K, {
    eye: H + 0.21, cloths,
    frame() { for (const a of hang) a.t.set(a.c.points, [-a.sd * Math.cos(yaw), 0, a.sd * Math.sin(yaw)]); },          // their suckers face the body
  });
  const end = fig.dispose;
  fig.dispose = () => { end(); rings.dispose(); };
  return fig;
}
