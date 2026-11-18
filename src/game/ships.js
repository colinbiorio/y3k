// ships.js — THE SHIPS, AS NUMBERS: where one is put, how it flies under the
// hands, where its pilot sits, how a body gets aboard and off. No page, no
// three (the suite runs it); ships/ draws them (skiff.js, dart.js, dhow.js, ark.js, carrier.js).
//
// GAME.md, stage 4: "The five ships: a skiff, a dart, a dhow, an ark, a
// carrier. From one seat to a carrier. Boarded and flown in the void, so they
// are ready when there is somewhere to go." The skiff's brief: "a one-seat open
// craft about five metres long, shaped like a slim reed canoe: a white glazed
// ceramic hull with bronze ribs, an open seat behind a low glass windscreen,
// two small outrigger fins on thin struts, one glowing plasma ring engine at
// the stern." The dart's: "a fast two-seat craft about eleven metres long,
// shaped like a spearpoint: a narrow bronze hull with fine engraved lines, a
// long clear canopy over two seats in tandem, short swept wings of pale alloy,
// two slim plasma engines." The dhow's: "a cargo ship about twenty-eight
// metres long: a wide rounded belly of timber ribs and ceramic plating, a
// raised stern cabin with round windows, two tall folding sails of golden
// solar foil rigged like a lateen sailing boat, a ring of plasma engines under
// the stern." The ark's: "an exploring ship about eighty metres long: a long
// spine of pale alloy and stone-grey ceramic, a slowly turning ring habitat
// round its middle with gardens under glass, a rounded prow with an
// observatory dome of brass and glass, four plasma engines in a cross at the
// stern." The carrier's: "a vast carrier about four hundred metres long, like a
// floating stepped temple: broad terraces of pale stone-like ceramic stacked
// into a long ziggurat, hangar mouths along its sides with tiny craft beside
// them for scale, slender towers, two enormous sails of golden solar foil, a
// row of large plasma ring engines at the stern."
//
// A ship's frame is a body's: its front is +Z, its left +X, and its yaw is
// atan2(x, z) of the way it points. Flown, it turns toward where the eye looks;
// forward drives it along its heading (and up or down as the eye looks up or
// down), back brakes and backs it, left and right slide it, jump lifts it, sink
// lowers it, sprint opens it up. Let be, it slows to a hover where it is. It
// rides no lower than its keel over the water or the ground, and what is solid
// (a building, a hill) stops it.

export const SHIPS = [
  { kind: 'skiff', label: 'skiff', ready: true }, { kind: 'dart', label: 'dart', ready: true }, { kind: 'dhow', label: 'dhow', ready: true },
  { kind: 'ark', label: 'ark', ready: true }, { kind: 'carrier', label: 'carrier', ready: true },
];
export const SKIFF = {
  length: 5.0, beam: 0.95,
  keel: 0.42,                       // m: from its middle down to its keel (it rides no lower)
  hover: 1.0,                       // m: its middle over the water where it is put
  seat: [0, 0.02, -0.55],           // where the pilot's feet are reckoned from (its hips sit a little over), in its frame
  speed: 24, boost: 46, back: 0.4, slide: 8, climb: 9,
  accel: 18, turn: 2.6,             // m/s/s toward the speed asked; rad/s toward the eye's way
  board: 3.2,                       // m: within this of its seat, the board key takes it (it comes down in reach)
  put: [0, 3.4],                    // m: where it is put from the body: to its left, and ahead
  edges: [[1.3, -0.18, -0.95], [-1.3, -0.18, -0.95]],   // what else of it meets what is solid (its outriggers' tips)
  view: 8.5,                        // m: the eye stands at least this far back aboard
  reach: 2.5,                       // m: how far above or below its seat a body may be and still take it
};
export const DART = {
  length: 11.0, beam: 1.3,
  keel: 0.55, hover: 1.4,
  seat: [0, -0.25, 1.7],            // the front seat of the two (the pilot's), low under the canopy; the other behind it
  rear: [0, -0.25, 0.35],
  speed: 42, boost: 96, back: 0.3, slide: 10, climb: 14,
  accel: 30, turn: 2.0,
  board: 3.6, put: [2.6, -1.3],     // beside the body, its cockpit at the body's shoulder
  edges: [[2.95, 0.08, -3.7], [-2.95, 0.08, -3.7]],   // its wingtips
  view: 13, reach: 2.5,
};
export const DHOW = {
  length: 28, beam: 7,
  keel: 1.8, hover: 3.0,
  seat: [0, 4.75, -8.2],            // the helm: on the stern cabin's roof, at its front, looking over the deck and the sails
  speed: 20, boost: 38, back: 0.25, slide: 3, climb: 4,
  accel: 6, turn: 0.8,              // heavy: slow to come up to speed, slow to turn
  board: 9, reach: 8.5, put: [8.5, 8], // beside the body, its stern alongside; boarded from the water, up to the helm
  edges: [[3.4, 0.5, 0], [-3.4, 0.5, 0], [0, 15.5, 3], [0, 10.5, -4.5], [0, 2.8, 13.6], [0, 3, -13.8]],   // its sides, mastheads, prow, stern
  view: 34,
};
// the ark's ring (round the spine, its axis the ship's +Z), its dome on the prow, its four engines in a cross at the stern;
// what of them meets what is solid: the ring's rim all round (eight points), the dome's top, the engines' outer rims
const ARK_RING = { r: 12, tube: 2.2, z: -4, turn: (2 * Math.PI) / 60 }, ARK_DOME = { at: [0, 3.2, 29], r: 2.8 }, ARK_ENGINES = { off: 6, r: 1.25, z0: -37, z1: -29 };
const ARK_RIM = ARK_RING.r + ARK_RING.tube;
export const ARK = {
  length: 80, beam: 2 * ARK_RIM,
  spine: 2.6,                       // m: the spine's radius
  ring: ARK_RING,                   // the habitat: its radius to the tube's middle, the tube's, where it stands along the spine, its turn (once a minute)
  dome: ARK_DOME, engines: ARK_ENGINES,
  keel: ARK_RIM + 0.4, hover: 16,       // its ring's foot rides clear of the water
  seat: [0, 3.65, 29.4],            // the helm: inside the dome, looking out ahead over the prow
  speed: 28, boost: 70, back: 0.2, slide: 2.5, climb: 5,
  accel: 4, turn: 0.5,              // the heaviest yet: the slowest to come up to speed and to turn
  // put ahead of the body, pointing its way, far enough off to be seen whole (its ring's top inside the eye's view); boarded
  // from the water near its stern, from where it was called: the board key lifts the body up into the dome
  door: [0, 0, -40], board: 32, reach: 22, put: [0, 68],
  edges: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [ARK_RIM * Math.cos((k * Math.PI) / 4), ARK_RIM * Math.sin((k * Math.PI) / 4), ARK_RING.z]),
    [0, ARK_DOME.at[1] + ARK_DOME.r, ARK_DOME.at[2]],
    ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => [x * (ARK_ENGINES.off + ARK_ENGINES.r), y * (ARK_ENGINES.off + ARK_ENGINES.r), ARK_ENGINES.z0]),
  ],
  view: 95,
};
// the carrier: five terraces stacked into a stepped temple, each set in from the one below, the last BOW metres of each
// narrowing to its prow; two masts with their sails on the top terrace; four slender towers; five ring engines astern
const CARRIER_TERRACES = [
  { hw: 60, z0: -200, z1: 200, y0: -20, y1: -8 }, { hw: 50, z0: -188, z1: 182, y0: -8, y1: 2 }, { hw: 40, z0: -176, z1: 164, y0: 2, y1: 12 },
  { hw: 30, z0: -162, z1: 144, y0: 12, y1: 22 }, { hw: 20, z0: -148, z1: 122, y0: 22, y1: 30 },
];
const CARRIER_MASTS = [{ z: 50 }, { z: -70 }].map((m) => ({ ...m, foot: 30, top: 150, yard: 145, boom: 50, wide: 42, narrow: 32 }));
const CARRIER_TOWERS = [[24, 60, 22, 85], [-24, 60, 22, 85], [14, -130, 30, 105], [-14, -130, 30, 105]].map(([x, z, y0, y1]) => ({ x, z, y0, y1 }));
const CARRIER_ENGINES = { xs: [-40, -20, 0, 20, 40], y: -14, z: -207, r: 6 };
export const CARRIER = {
  length: 400, beam: 120, bow: 70, bowNarrow: 0.25,
  terraces: CARRIER_TERRACES, masts: CARRIER_MASTS, towers: CARRIER_TOWERS, engines: CARRIER_ENGINES,
  keel: 21, hover: 30,              // its lowest terrace's underside rides clear of the water
  seat: [0, 30.6, 108],             // the helm: in a pavilion at the front of the top terrace, looking out over the prow
  speed: 18, boost: 45, back: 0.15, slide: 1.5, climb: 3,
  accel: 1.8, turn: 0.2,            // the slowest of all, a temple under way
  // put far ahead of the body, pointing its way, so the eye sees it whole (its sails' tops inside the view); boarded from
  // anywhere within a few hundred metres of its stern: the board key lifts the body up to its helm
  door: [0, 0, -212], board: 280, reach: 140, put: [0, 450],
  edges: [
    ...[-200, -145, -90, -35, 20, 75, 130].flatMap((z) => [[60, -20, z], [-60, -20, z]]), [15, -20, 200], [-15, -20, 200],
    ...CARRIER_MASTS.flatMap((m) => [[0, m.top, m.z], [m.wide, m.yard, m.z], [-m.wide, m.yard, m.z]]),
    ...CARRIER_TOWERS.map((t) => [t.x, t.y1, t.z]),
    [CARRIER_ENGINES.xs[0] - CARRIER_ENGINES.r, CARRIER_ENGINES.y, CARRIER_ENGINES.z], [CARRIER_ENGINES.xs[4] + CARRIER_ENGINES.r, CARRIER_ENGINES.y, CARRIER_ENGINES.z],
  ],
  view: 540,
};
export const KIND = { skiff: SKIFF, dart: DART, dhow: DHOW, ark: ARK, carrier: CARRIER };
const kindOf = (s) => KIND[s.kind] || SKIFF;
const toward = (a, b, max) => (Math.abs(b - a) <= max ? b : a + Math.sign(b - a) * max);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
export const cleanShip = (k) => (SHIPS.some((s) => s.kind === k && s.ready) ? k : 'skiff');

// its heading's way, its left, and a point of its own frame (x left, y up, z ahead) in the world, by its yaw alone
export const ahead = (s) => [Math.sin(s.yaw), 0, Math.cos(s.yaw)];
export const leftOf = (s) => [Math.cos(s.yaw), 0, -Math.sin(s.yaw)];
export function shipPoint(s, [x, y, z]) { const c = Math.cos(s.yaw), n = Math.sin(s.yaw); return [s.p[0] + c * x + n * z, s.p[1] + y, s.p[2] - n * x + c * z]; }
export const seatAt = (s) => shipPoint(s, kindOf(s).seat);
export const doorAt = (s) => shipPoint(s, kindOf(s).door || kindOf(s).seat);   // where it is boarded from: its seat, or (the ark) its door

// put by the body (its seat in reach), pointing the way it faces, riding at its hover over what is under it
export function placeShip(body, floorAt = () => 0, kind = 'skiff') {
  const k = cleanShip(kind), S = KIND[k], [side, fwd] = S.put, c = Math.cos(body.yaw), n = Math.sin(body.yaw);
  const x = body.p[0] + n * fwd + c * side, z = body.p[2] + c * fwd - n * side;
  return { kind: k, p: [x, floorAt(x, z) + S.hover, z], v: [0, 0, 0], yaw: body.yaw, bank: 0, tilt: 0, thrust: 0, t: 0 };
}

// One step of a ship under the hands (inp: move [right, forward], yaw and pitch of the eye, up, down, sprint), over a
// floor (floorAt(x, z): the water's or the ground's height there) and against what is solid (solid([x, y, z])).
export function stepShip(s, inp, dt, { floorAt = () => 0, solid = () => false } = {}) {
  const S = kindOf(s);
  s.t += dt;
  const was = s.yaw;
  // its heading turns toward where the eye looks (the eye looks along −Z at its yaw 0: the way a body faces is that plus π)
  const want = wrap(inp.yaw + Math.PI);
  s.yaw = wrap(s.yaw + toward(0, wrap(want - s.yaw), S.turn * dt));
  const f = ahead(s), l = leftOf(s), mx = inp.move?.[0] || 0, mz0 = inp.move?.[1] || 0, mz = mz0 < 0 ? mz0 * S.back : mz0;
  // (the eye's pitch climbs it only past a little either way: the eye's own rest, a little down, flies it level)
  const pitch = Math.sign(inp.pitch || 0) * Math.max(0, Math.abs(inp.pitch || 0) - 0.15);
  const top = inp.sprint ? S.boost : S.speed, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const lift = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * S.climb;
  const target = [f[0] * cp * mz * top - l[0] * mx * S.slide, sp * mz * top + lift, f[2] * cp * mz * top - l[2] * mx * S.slide];
  const a = S.accel * dt * (inp.sprint ? 1.6 : 1);
  for (let i = 0; i < 3; i++) s.v[i] = toward(s.v[i], target[i], a);
  // what is solid stops it: its middle, its bow and stern, its edges (outriggers', wings' tips), looked at every fifth of a
  // metre of its way, so a quick ship does not pass through a thin wall between two steps
  const h = S.length * 0.48, pts = [[0, 0, 0], [0, 0.1, h], [0, 0.1, -h], ...S.edges];
  const n = Math.max(1, Math.ceil((Math.hypot(s.v[0], s.v[1], s.v[2]) * dt) / 0.2)), from = [...s.p];
  for (let i = 1; i <= n; i++) {
    const at = { p: [from[0] + (s.v[0] * dt * i) / n, from[1] + (s.v[1] * dt * i) / n, from[2] + (s.v[2] * dt * i) / n], yaw: s.yaw };
    if (pts.some((q) => solid(shipPoint(at, q)))) { for (let k = 0; k < 3; k++) s.v[k] *= -0.2; break; }
    s.p = at.p;
  }
  // never lower than its keel over the water or the ground
  const low = floorAt(s.p[0], s.p[2]) + S.keel;
  if (s.p[1] < low) { s.p[1] = low; if (s.v[1] < 0) s.v[1] = 0; }
  // how it looks doing it: banked into a turn, tipped as it climbs or drops, its engine as bright as it is driven
  const turnRate = dt > 0 ? wrap(s.yaw - was) / dt : 0, k = (r) => 1 - Math.exp(-r * dt);
  s.bank += (Math.max(-0.55, Math.min(0.55, -turnRate * 0.22 * Math.min(1, Math.hypot(s.v[0], s.v[2]) / 6) - mx * 0.12)) - s.bank) * k(5);
  s.tilt += (Math.max(-0.35, Math.min(0.35, -s.v[1] * 0.035)) - s.tilt) * k(5);
  s.thrust += (Math.min(1.4, Math.abs(mz) * (inp.sprint ? 1.4 : 1) + 0.25 * Math.abs(lift) / S.climb + 0.1 * Math.abs(mx)) - s.thrust) * k(4);
  return s;
}

// the nearest ship whose seat (or door) a body is near enough to take (on its way to it, not far below or above it)
export function nearShip(ships, p) {
  let best = null, bd = Infinity;
  for (const s of ships) {
    const q = doorAt(s), d = Math.hypot(q[0] - p[0], q[2] - p[2]);
    if (d < kindOf(s).board && d < bd && Math.abs(q[1] - p[1]) < kindOf(s).reach) { bd = d; best = s; }
  }
  return best;
}
// taking the seat: the body goes where the seat is and is carried with it
export function board(s, body) {
  body.seated = s; body.flying = false; body.wallrun = null; body.climbing = false; body.dashT = 0; body.rising = false;
  body.grounded = true; body.v = [0, 0, 0];
  carry(s, body);
}
// where a body aboard is: in the seat, facing the way the ship points, still
export function carry(s, body) {
  const q = seatAt(s);
  body.p = [...q]; body.was = [...q]; body.acc = 0; body.yaw = s.yaw;
}
// stepping off: to its left side, as high as the seat (the body falls from there to whatever is under it)
export function leave(s, body) {
  const l = leftOf(s), q = seatAt(s);
  body.seated = null; body.grounded = false; body.coyote = 0;
  body.p = [q[0] + l[0] * 1.3, q[1], q[2] + l[2] * 1.3]; body.was = [...body.p]; body.acc = 0;
  body.v = [s.v[0] * 0.5, Math.max(0, s.v[1] * 0.5), s.v[2] * 0.5];
}
