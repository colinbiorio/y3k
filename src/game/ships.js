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
  accel: 24, turn: 2.6,             // m/s/s toward the speed asked; rad/s toward the eye's way at most
  spin: 22,                         // rad/s/s: how quickly its turning comes on and goes off (HANDLING, below)
  board: 3.2,                       // m: within this of any part of it, the board key takes its seat (it comes down in reach)
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
  accel: 35, turn: 2.2, spin: 12,
  board: 3.6, put: [2.6, -1.3],     // beside the body, its cockpit at the body's shoulder
  edges: [[2.95, 0.08, -3.7], [-2.95, 0.08, -3.7]],   // its wingtips
  view: 13, reach: 2.5,
};
// the dhow's hull at u (0 the stern, 1 the prow): half its width, its sheer (the deck's edge), its depth, its deck
// (ships/dhow.js draws it from these; shipBoxes stands a body on it)
export const DHOW_HULL = {
  halfW: (u) => 3.5 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.7),
  sheer: (u) => 0.9 + 2.1 * Math.max(0, (u - 0.6) / 0.4) ** 2 + 1.5 * Math.max(0, (0.25 - u) / 0.25) ** 2,
  depth: (u) => 2.6 * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * u)), 0.5),
};
DHOW_HULL.deck = (u) => DHOW_HULL.sheer(u) - 0.18;
export const DHOW = {
  length: 28, beam: 7,
  keel: 1.8, hover: 3.0,
  seat: [0, 4.75, -8.2],            // the helm: on the stern cabin's roof, at its front, looking over the deck and the sails
  speed: 30, boost: 64, back: 0.3, slide: 6, climb: 8,
  accel: 19, turn: 1.35, spin: 4.5, // heavy: longer to come up to speed and into a turn than the small ones, never sluggish
  board: 6, reach: 8.5, put: [8.5, 8], // beside the body, its stern alongside; boarded from beside it, up to the helm
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
  speed: 46, boost: 110, back: 0.3, slide: 8, climb: 10,
  accel: 23, turn: 0.95, spin: 2.4, // heavier: longer still to come up to speed and into a turn
  // put ahead of the body, pointing its way, far enough off to be seen whole (its ring's top inside the eye's view); boarded
  // from anywhere near it (from where it was called too): the board key lifts the body up into the dome
  door: [0, 0, -40], board: 36, reach: 22, put: [0, 68],
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
// …and eight under it, let into its lowest terrace's underside, that hold it up (four along each side)
const CARRIER_UNDER = [-150, -60, 30, 110].flatMap((z) => [[28, z], [-28, z]]);
export const CARRIER = {
  length: 400, beam: 120, bow: 70, bowNarrow: 0.25,
  terraces: CARRIER_TERRACES, masts: CARRIER_MASTS, towers: CARRIER_TOWERS, engines: CARRIER_ENGINES, under: CARRIER_UNDER, underR: 5,
  keel: 21, hover: 30,              // its lowest terrace's underside rides clear of the water
  seat: [0, 30.6, 108],             // the helm: in a pavilion at the front of the top terrace, looking out over the prow
  speed: 72, boost: 170, back: 0.3, slide: 12, climb: 14,
  accel: 29, turn: 0.7, spin: 1.4,  // the weightiest, a temple under way: the longest to its speed and into a turn, and quick enough for its size
  // put far ahead of the body, pointing its way, so the eye sees it whole (its sails' tops inside the view); boarded from
  // anywhere within a few hundred metres of it (from where it was called too): the board key lifts the body up to its helm
  door: [0, 0, -212], board: 260, reach: 140, put: [0, 450],
  edges: [
    ...[-200, -145, -90, -35, 20, 75, 130].flatMap((z) => [[60, -20, z], [-60, -20, z]]), [15, -20, 200], [-15, -20, 200],
    ...CARRIER_MASTS.flatMap((m) => [[0, m.top, m.z], [m.wide, m.yard, m.z], [-m.wide, m.yard, m.z]]),
    ...CARRIER_TOWERS.map((t) => [t.x, t.y1, t.z]),
    [CARRIER_ENGINES.xs[0] - CARRIER_ENGINES.r, CARRIER_ENGINES.y, CARRIER_ENGINES.z], [CARRIER_ENGINES.xs[4] + CARRIER_ENGINES.r, CARRIER_ENGINES.y, CARRIER_ENGINES.z],
  ],
  view: 540,
};
export const KIND = { skiff: SKIFF, dart: DART, dhow: DHOW, ark: ARK, carrier: CARRIER };
// HOW EACH SIZE HANDLES (Colin, 19 Nov 2026: "the larger the ship gets, the harder it is to move"). A bigger ship is
// weightier, never sluggish: faster across the ground (it has its own length to cover: the carrier crosses its 400 m in
// under six seconds), longer to come up to its speed (a second for the skiff, two and a half for the carrier) and
// longer into a turn, its turning coming on and going off at its `spin` (so it swings into a turn and out of it onto
// the way the eye looks, never past it: a quarter turn takes the skiff 0.7 s, the carrier 2.7 s). It slows harder than
// it speeds up (BRAKE): let go at its speed, every one of them is still within two seconds.
export const BRAKE = 1.6;
// how much each rides up and down on its hover, and how quickly, as it waits (none under way). It is the ship's own
// (s.bob), so its drawing and what of it a body stands on rise and fall together.
export const BOB = { skiff: [0.03, 1.6], dart: [0.03, 1.4], dhow: [0.06, 0.9], ark: [0.15, 0.4], carrier: [0.4, 0.25] };
const kindOf = (s) => KIND[s.kind] || SKIFF;
const toward = (a, b, max) => (Math.abs(b - a) <= max ? b : a + Math.sign(b - a) * max);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
export const cleanShip = (k) => (SHIPS.some((s) => s.kind === k && s.ready) ? k : 'skiff');

// its heading's way, its left, and a point of its own frame (x left, y up, z ahead) in the world, by its yaw alone
export const ahead = (s) => [Math.sin(s.yaw), 0, Math.cos(s.yaw)];
export const leftOf = (s) => [Math.cos(s.yaw), 0, -Math.sin(s.yaw)];
export function shipPoint(s, [x, y, z]) { const c = Math.cos(s.yaw), n = Math.sin(s.yaw); return [s.p[0] + c * x + n * z, s.p[1] + y, s.p[2] - n * x + c * z]; }
// …and turned as it is turned: its bank (about its length), its tilt (nose down is +: three's x), its heading: three's
// 'YXZ', as the drawings turn it (ships/*.js), riding on its bob. Where its pilot sits is this (a ship pointing straight
// up carries its helm straight up with it)
export function posePoint(s, [x, y, z]) {
  const cb = Math.cos(s.bank || 0), sb = Math.sin(s.bank || 0), ct = Math.cos(s.tilt || 0), st = Math.sin(s.tilt || 0), c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  const x1 = x * cb - y * sb, y1 = x * sb + y * cb, y2 = y1 * ct - z * st, z2 = y1 * st + z * ct;
  return [s.p[0] + c * x1 + n * z2, s.p[1] + (s.bob || 0) + y2, s.p[2] - n * x1 + c * z2];
}
// the way its nose points
export const noseOf = (s) => { const cp = Math.cos(s.tilt || 0); return [Math.sin(s.yaw) * cp, -Math.sin(s.tilt || 0), Math.cos(s.yaw) * cp]; };
export const seatAt = (s) => posePoint(s, kindOf(s).seat);
export const doorAt = (s) => shipPoint(s, kindOf(s).door || kindOf(s).seat);   // where it is boarded from: its seat, or (the ark) its door

// CLIMB AND DIVE, AND THE BANK (Colin, 19 Nov 2026: "ships should be able to go straight up -- the angle of
// incline/decline seems quite limited, but it would be better if they could actually go up and down. and when they
// turn, the ship should rotate with it like a plane would"). Driven, a ship's nose comes up or down toward where the eye
// looks (past a little either way), PITCH_GAIN times as steep, so the eye's furthest up or down is straight up or down;
// it comes round at its turn a second at most, and let be, it comes level. It goes the way its nose points. Turning under
// way it banks as a plane does (the tangent of its bank is its speed times its turn over g), up to its own BANK (the
// small ones steeper than the big), never so far that its side would touch the water, and it levels out of it.
export const PITCH_GAIN = 1.5;
export const BANK = { skiff: 1.1, dart: 1.3, dhow: 0.75, ark: 0.7, carrier: 0.55 };
// THE THRUSTERS POINT THE WAY THE SHIP IS DRIVEN (Colin, 19 Nov 2026: "make the thrusters point in the direction that
// the ship is moving, and for the giant carrier, perhaps add some to the bottom of the craft too"). What drives a ship
// is what holds it up and what sends it the way asked of it: up, and JET_PUSH times the speed asked over its own. s.jet
// is the way its exhaust goes for that, in its own frame (astern is [0, 0, -1]): straight down as it hangs still, back
// and a little down under way, astern at its throttle's top and in the light, down and aside as it rises or slides, and
// never upward. Its nozzles turn no further from astern than its SWIVEL (the skiff's right down; the great ones' part of
// the way: the carrier has thrusters under it for the rest), and swing there at JET_RATE, not at once. s.lift is how
// hard what holds it up works (those thrusters under the carrier are as bright): most as it rises, some as it hangs
// still, less as its speed carries it, least as it sinks.
export const SWIVEL = { skiff: Math.PI / 2, dart: 1.2, dhow: 1.0, ark: 0.75, carrier: 0.6 };
export const JET_PUSH = 3, JET_RATE = 3.5;
// LANDING GEAR (Colin, 19 Nov 2026: "landing gear would be sick"). Each kind's legs: where they hinge under it (y, and
// each [x, z]), how far their feet reach below its keel (len), how thick (r). s.gear is how far down they are: they come
// down (GEAR_TIME s) when it is slow and low over the water or the ground, and fold away as it flies off. Down, it
// rides no lower than its feet: sunk onto the ground, it stands on them.
export const GEAR = {
  skiff: { len: 0.45, y: -0.3, r: 0.028, legs: [[0.3, 1.2], [-0.3, 1.2], [0, -1.6]] },
  dart: { len: 0.7, y: -0.3, r: 0.04, legs: [[0, 3.2], [0.5, -2.6], [-0.5, -2.6]] },
  dhow: { len: 1.0, y: -1.0, r: 0.09, legs: [[1.8, 4], [-1.8, 4], [1.8, -6], [-1.8, -6]] },
  ark: { len: 1.0, y: -2.3, r: 0.26, legs: [[1.6, 21], [-1.6, 21], [1.6, -24], [-1.6, -24]] },
  carrier: { len: 6, y: -20, r: 1.1, legs: [-170, -80, 10, 100].flatMap((z) => [[46, z], [-46, z]]) },
};
export const GEAR_TIME = 1.2;
// should its legs be down: slow, and its keel within a few leg-lengths of what is under it
export const gearWanted = (S, G, over, speed) => over < 3 * G.len + 2 && speed < 0.6 * S.speed;
// a way in the world (a direction, not a place) in a ship's own frame, turned as it is turned: posePoint, undone
export function toPose(s, [X, Y, Z]) {
  const cb = Math.cos(s.bank || 0), sb = Math.sin(s.bank || 0), ct = Math.cos(s.tilt || 0), st = Math.sin(s.tilt || 0), c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  const x1 = c * X - n * Z, z2 = n * X + c * Z, y1 = Y * ct + z2 * st;
  return [x1 * cb + y1 * sb, -x1 * sb + y1 * cb, -Y * st + z2 * ct];
}
// a way swung toward another by at most `max` radians (two nearly opposite: by way of astern)
function swing(a, b, max) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.8) { b = [0, 0, -1]; d = -a[2]; }
  const ang = Math.acos(Math.max(-1, Math.min(1, d)));
  if (ang <= max) return [b[0], b[1], b[2]];
  const k = max / ang, sn = Math.sin(ang), wa = Math.sin((1 - k) * ang) / sn, wb = Math.sin(k * ang) / sn;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}
// the way a ship's exhaust would go to push it along `push` (the world's), kept within its swivel of astern
export function jetFor(s, push) {
  const d = toPose(s, push), n = Math.hypot(d[0], d[1], d[2]);
  if (!(n > 1e-9)) return [0, 0, -1];
  const j = [-d[0] / n, -d[1] / n, -d[2] / n], most = SWIVEL[s.kind] ?? 1, off = Math.acos(Math.max(-1, Math.min(1, -j[2])));
  if (off <= most) return j;
  const side = Math.hypot(j[0], j[1]);
  if (side < 1e-6) return [0, 0, -1];                    // asked to push it straight back: its nozzles stay astern
  const k = Math.sin(most) / side;
  return [j[0] * k, j[1] * k, -Math.cos(most)];
}

// put by the body (near enough to board), pointing the way it faces, riding at its hover over what is under it; called
// from the air (Colin, 19 Nov 2026: "remove necessity to be on the ground to call a ship"), it comes to the body's height
// instead (its seat about level with the body's feet), and waits there
export function placeShip(body, floorAt = () => 0, kind = 'skiff') {
  const k = cleanShip(kind), S = KIND[k], [side, fwd] = S.put, c = Math.cos(body.yaw), n = Math.sin(body.yaw);
  const x = body.p[0] + n * fwd + c * side, z = body.p[2] + c * fwd - n * side, low = floorAt(x, z) + S.hover;
  return { kind: k, p: [x, Math.max(low, (body.p[1] || 0) - S.seat[1]), z], v: [0, 0, 0], yaw: body.yaw, spin: 0, bank: 0, tilt: 0, thrust: 0, t: 0, bob: 0, thr: 0, light: null, jet: jetFor({ kind: k, yaw: body.yaw }, [0, 1, 0]), lift: 0.5, gear: 1 };
}

// THE THROTTLE (Colin, 19 Nov 2026: "for speed -- let's actually do this right. when you hold down shift, speed should
// increase, and a throttle should show up which you can control with mouse -- but also, you should be able to hit digit to
// control speed -- 0 being lightspeed and 1 being just above the non-shift speed"). s.thr runs from 0 (the ship's own
// speed, as forward drives it) through the notches 1 to 9, each the same share faster than the last (9 is TOP times its own
// speed), to 10: the light. Held, sprint opens it RISE notches a second (SLOW past 9, so the light is not come to by
// accident); let go, it stays where it is. Above nothing it flies the ship on where its nose points with no hand on
// forward; back cuts it to nothing, a brake. The digits, the wheel and the gauge set it (view.js).
export const THROTTLE = { top: 12, rise: 3, slow: 0.8, notches: 9 };
export const speedAt = (S, thr) => S.speed * Math.pow(THROTTLE.top, Math.min(THROTTLE.notches, Math.max(0, thr || 0)) / THROTTLE.notches);
// LIGHTSPEED, aboard alone (Colin, 19 Nov 2026: "for lightspeed travel i really only meant when you're in a ship"; and of
// coming out of it: "you should always continue going forward, and in front of you, there's the island. like, a globe").
// The throttle at its top (0, the wheel or the gauge to its top, sprint held past 9) gathers the light about the ship
// (GATHER s; brought down then, nothing comes of it). Then it goes where its nose points, steered as ever, its speed from
// the throttle's top doubling and doubling until RISE s in it is the speed of light: C, exactly, in real metres a real
// second, and no faster. His standing rule (13 Nov 2026) is that far journeys take the time light takes ("they'll have
// to actually wait the time it takes for light to travel ... no skipping"): so what it counts (s.light.dist) is the true
// way gone at that speed, in real time (as far as the Sun: 8.3 minutes), and nothing here shortens it.
// Brought down again (a digit, back, the wheel, the gauge) it comes OUT: on along its heading, level, its speed falling
// over OUT s to the throttle's, the veil lifting and the streaks running out ahead.
// Until there is a real globe to fly round, the ship itself goes no faster than CAP nor higher than CEIL in the light,
// and where it comes out on a small flat map is the view's and wrap.js's (the map as a globe), so no number is ever
// huge; the rest of the way is counted and drawn (light.js), not travelled.
export const LIGHT = { c: 299792458, rise: 7, gather: 0.4, out: 2.4, cap: 1500, lift: 140, ceil: 60000 };
const ease01 = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the throttle set (0 to 10; 10 is the light)
export function setThrottle(s, to) {
  const t = Math.max(0, Math.min(10, +to || 0));
  if (t >= 10) { s.thr = 10; if (!s.light || s.light.phase === 'out') s.light = { phase: 'gather', t: 0, gatherT: LIGHT.gather, v: 0, dist: s.light?.dist || 0, dir: noseOf(s), frac: 0, veil: 0, u: 0 }; return s; }
  s.thr = t;
  const L = s.light;
  if (L && L.phase === 'gather') s.light = null;
  else if (L && L.phase === 'go') { L.phase = 'out'; L.t = 0; L.vOut = L.v; L.fracOut = L.frac; L.veilOut = L.veil; L.placed = false; }
  return s;
}
function stepLight(s, S, dt) {
  const L = s.light;
  L.t += dt;
  if (L.phase === 'gather') {
    if (L.t >= L.gatherT) { L.phase = 'go'; L.t = 0; L.y0 = s.p[1]; L.v0 = Math.max(speedAt(S, THROTTLE.notches), Math.hypot(...s.v)); L.k = Math.log(LIGHT.c / L.v0) / LIGHT.rise; L.v = L.v0; }
    return;
  }
  if (L.phase === 'go') {
    L.v = Math.min(LIGHT.c, L.v0 * Math.exp(L.k * L.t));
    L.frac = Math.log(L.v / L.v0) / Math.log(LIGHT.c / L.v0); L.veil = smooth01(0.06, 0.32, L.frac);
  } else {
    const u = Math.min(1, L.t / LIGHT.out), e = ease01(u), to = speedAt(S, Math.min(s.thr || 0, THROTTLE.notches));
    L.u = u; L.v = Math.exp(Math.log(L.vOut) + (Math.log(to) - Math.log(L.vOut)) * e);
    L.frac = L.fracOut * (1 - smooth01(0, 0.8, u)); L.veil = L.veilOut * (1 - smooth01(0.1, 0.7, u));
    if (u >= 1) { s.light = null; return; }
  }
  L.dist += L.v * dt;
}
// what the light says, in a line: how fast, how far out, and the farthest thing of ours it has come as far as
const MARKS = [[4.017e16, 'as far as Proxima Centauri'], [4.5e12, 'past Neptune\'s orbit'], [7.78e11, 'as far as Jupiter\'s orbit'], [1.496e11, 'as far as the Sun'], [3.844e8, 'past the Moon']];
const num = (x, f = 1) => x.toLocaleString('en-US', { maximumFractionDigits: x < 10 ? f : 0 });
export function lightFar(d) {
  const ls = d / LIGHT.c;
  if (d < 1000) return `${Math.round(d)} m`;
  if (ls < 1) return `${num(d / 1000)} km`;
  if (ls < 60) return `${num(ls)} light-second${ls < 1.05 ? '' : 's'}`;
  if (ls < 3600) return `${num(ls / 60)} light-minute${ls < 63 ? '' : 's'}`;
  if (ls < 86400) return `${num(ls / 3600)} light-hour${ls < 3780 ? '' : 's'}`;
  if (ls < 31557600) return `${num(ls / 86400)} light-day${ls < 90720 ? '' : 's'}`;
  return `${num(ls / 31557600, 2)} light-years`;
}
export function lightLine(L, ahead = '') {
  if (!L) return '';
  if (L.phase === 'gather') return 'the light gathers';
  if (L.phase === 'out') return `out of the light · ${lightFar(L.dist)} flown${ahead ? ' · ' + ahead : ''}`;
  const v = L.v, speed = v >= LIGHT.c ? 'the speed of light' : v >= LIGHT.c * 0.01 ? `${(v / LIGHT.c).toFixed(v >= LIGHT.c * 0.1 ? 2 : 3)} c` : v >= 1000 ? `${num(v / 1000)} km/s` : `${Math.round(v)} m/s`;
  const mark = MARKS.find(([m]) => L.dist >= m);
  return `lightspeed · ${speed} · ${lightFar(L.dist)} out${mark ? ' · ' + mark[1] : ''}`;
}

// One step of a ship under the hands (inp: move [right, forward], yaw and pitch of the eye, up, down, sprint), over a
// floor (floorAt(x, z): the water's or the ground's height there) and against what is solid (solid([x, y, z])).
export function stepShip(s, inp, dt, { floorAt = () => 0, solid = () => false } = {}) {
  const S = kindOf(s);
  s.t += dt;
  const was = s.yaw;
  // its heading turns toward where the eye looks (the eye looks along −Z at its yaw 0: the way a body faces is that plus
  // π): as fast as its turn, but never faster than lets its spin stop it on that way, and the turning comes on and goes
  // off at its spin
  const want = wrap(inp.yaw + Math.PI), err = wrap(want - s.yaw), spin = S.spin || S.turn * 10;
  s.spin = toward(s.spin || 0, Math.sign(err) * Math.min(S.turn, Math.sqrt(2 * spin * Math.abs(err))), spin * dt);
  if (Math.abs(err) <= Math.abs(s.spin * dt) + 1e-9 && s.spin * err >= 0) { s.yaw = want; s.spin = 0; }
  else s.yaw = wrap(s.yaw + s.spin * dt);
  const f = ahead(s), l = leftOf(s), mx = inp.move?.[0] || 0, mz0 = inp.move?.[1] || 0;
  // the throttle (THROTTLE, below): held, sprint opens it, slower past 9, and at its top the light gathers; back cuts it
  // (and the light) to nothing
  if (mz0 < -0.2 && ((s.thr || 0) > 0 || s.light)) setThrottle(s, 0);
  else if (inp.sprint && (!s.light || s.light.phase === 'out')) setThrottle(s, (s.thr || 0) + dt * ((s.thr || 0) < THROTTLE.notches ? THROTTLE.rise : THROTTLE.slow));
  const thr = s.thr || 0, L = s.light, cruise = thr > 0 || !!L, mz = cruise ? 1 : mz0 < 0 ? mz0 * S.back : mz0;
  // its nose: toward the eye's pitch (past the eye's own rest, a little down, which flies it level) while it is driven
  // ahead, level when it is not (and as it comes out of the light); it goes the way its nose points (backing, level)
  const p0 = inp.pitch || 0, aim = Math.sign(p0) * Math.min(Math.PI / 2, Math.max(0, Math.abs(p0) - 0.15) * PITCH_GAIN);
  s.tilt = -toward(-(s.tilt || 0), mz > 0 && L?.phase !== 'out' ? aim * Math.min(1, mz) : 0, S.turn * dt);
  const nose = noseOf(s), top = speedAt(S, thr);
  const lift = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * S.climb;
  const h = S.length * 0.48;
  let asked = [0, 0, 0];                                 // the speed asked of it (its thrusters point for it, below)
  if (L) stepLight(s, S, dt);
  if (L && L.phase !== 'gather') {
    // in the light: the way its nose points (coming out, level along its heading), no faster than CAP itself; through what
    // is solid (it is light), lifted clear as it goes, never under the ground
    const way = L.phase === 'go' ? nose : f, v = Math.min(L.v, LIGHT.cap);
    L.dir = way; s.v = [way[0] * v, way[1] * v, way[2] * v]; asked = s.v;
    s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
    if (L.phase === 'go') s.p[1] = Math.min(LIGHT.ceil, Math.max(s.p[1], L.y0 + LIGHT.lift * smooth01(0, 1.4, L.t)));
  } else {
    const go = mz > 0 ? nose : f;
    const target = [go[0] * mz * top - l[0] * mx * S.slide, go[1] * mz * top + lift, go[2] * mz * top - l[2] * mx * S.slide];
    asked = target;
    // as quick to its speed at any throttle (a faster speed asks a harder push), and as quick to slow from it
    const a = S.accel * dt * Math.max(1, top / S.speed, Math.hypot(s.v[0], s.v[1], s.v[2]) / S.speed);
    for (let i = 0; i < 3; i++) s.v[i] = toward(s.v[i], target[i], (Math.abs(target[i]) < Math.abs(s.v[i]) || target[i] * s.v[i] < 0 ? BRAKE : 1) * a);
    // what is solid stops it: its middle, its bow and stern, its edges (outriggers', wings' tips), turned as it is turned,
    // looked at every fifth of a metre of its way, so a quick ship does not pass through a thin wall between two steps
    const pts = [[0, 0, 0], [0, 0.1, h], [0, 0.1, -h], ...S.edges];
    const n = Math.min(400, Math.max(1, Math.ceil((Math.hypot(s.v[0], s.v[1], s.v[2]) * dt) / 0.2))), from = [...s.p];
    for (let i = 1; i <= n; i++) {
      const at = { p: [from[0] + (s.v[0] * dt * i) / n, from[1] + (s.v[1] * dt * i) / n, from[2] + (s.v[2] * dt * i) / n], yaw: s.yaw, tilt: s.tilt, bank: s.bank };
      if (pts.some((q) => solid(posePoint(at, q)))) { for (let k = 0; k < 3; k++) s.v[k] *= -0.2; break; }
      s.p = at.p;
    }
  }
  // never lower than its keel over the water or the ground; nose up or down, its stern or its bow is what is lowest
  const floor = floorAt(s.p[0], s.p[2]), G = GEAR[s.kind] || GEAR.skiff;
  s.gear = toward(s.gear ?? 1, gearWanted(S, G, s.p[1] - floor - S.keel, Math.hypot(s.v[0], s.v[1], s.v[2])) ? 1 : 0, dt / GEAR_TIME);
  const low = floor + Math.max(S.keel * Math.abs(Math.cos(s.tilt)), h * Math.abs(Math.sin(s.tilt))) + G.len * s.gear;
  if (s.p[1] < low) { s.p[1] = low; if (s.v[1] < 0) s.v[1] = 0; }
  // banked into a turn as a plane is, and out of it; its engine as bright as it is driven
  const turnRate = dt > 0 ? wrap(s.yaw - was) / dt : 0, k = (r) => 1 - Math.exp(-r * dt);
  const room = Math.asin(Math.min(1, Math.max(0, (s.p[1] - floor) / (S.beam / 2)))), most = Math.min(BANK[s.kind] || 1, room);
  const bank = -Math.atan((Math.hypot(s.v[0], s.v[2]) * turnRate) / 9.8) - mx * 0.12;
  s.bank += (Math.max(-most, Math.min(most, bank)) - s.bank) * k(Math.max(1.2, Math.min(5, S.spin * 0.8)));
  s.thrust += (Math.min(1.4, Math.abs(mz) * (1 + 0.4 * Math.min(1, thr / THROTTLE.notches) + (L ? 0.4 : 0)) + 0.25 * Math.abs(lift) / S.climb + 0.1 * Math.abs(mx)) - s.thrust) * k(4);
  // its thrusters: against what holds it up and what sends it the way asked (never pushing it down), swung there
  const push = [(JET_PUSH * asked[0]) / S.speed, Math.max(0.15, 1 + (JET_PUSH * asked[1]) / S.speed), (JET_PUSH * asked[2]) / S.speed];
  s.jet = swing(s.jet || [0, 0, -1], jetFor(s, push), JET_RATE * dt);
  const rising = Math.max(0, s.v[1]) / S.climb, under = 1 - Math.min(1, Math.hypot(s.v[0], s.v[2]) / S.speed);
  s.lift = (s.lift || 0) + (Math.min(1.4, inp.down ? 0.08 : 0.3 + 0.25 * under + (inp.up ? 0.5 : 0) + 0.5 * Math.min(1, rising)) - (s.lift || 0)) * k(3);
  const [amp, rate] = BOB[s.kind] || BOB.skiff; s.bob = amp * Math.sin(s.t * rate) * (1 - Math.min(1, s.thrust));
  return s;
}

// WHAT OF A SHIP IS SOLID (Colin, 19 Nov 2026: "ships are able to be flown through and not stood on"): boxes in its own
// frame (x left, y up, z ahead; solids.js stands a body on them and keeps it out of them): its hull with its deck on
// top, and what stands on the deck. A body stands on a deck and walks it, is carried as the ship moves (carryOn), and
// walking, flying or falling, does not go through a hull. Bank and tilt are the drawing's: a ship is solid level.
const box = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });
const sym = (hx, y0, y1, z0, z1) => box(-hx, hx, y0, y1, z0, z1);
const SOLID = {};
function slices(n, z0, z1, at) { const out = []; for (let i = 0; i < n; i++) { const a = z0 + ((z1 - z0) * i) / n, b = z0 + ((z1 - z0) * (i + 1)) / n; out.push(at((i + 0.5) / n, a, b)); } return out; }
export function shipBoxes(kind) {
  if (SOLID[kind]) return SOLID[kind];
  let B;
  if (kind === 'dart') {
    // its lozenge hull (half 0.65 wide, 0.42 high at most), the canopy over the cockpit, the two swept wings
    const hw = (u) => (u >= 0.4 ? 0.65 * (1 - ((u - 0.4) / 0.6) ** 2) : 0.65 - 0.3 * ((0.4 - u) / 0.4) ** 2);
    B = [...slices(8, -5.5, 5.5, (u, a, b) => sym(Math.max(0.12, hw(u)), -(0.62 * hw(u) + 0.02), 0.62 * hw(u) + 0.02, a, b)),
      sym(0.42, 0.2, 0.62, -0.95, 2.95),
      ...[1, -1].flatMap((sd) => [box(sd > 0 ? 0.5 : -1.7, sd > 0 ? 1.7 : -0.5, -0.04, 0.16, -3.8, -1.55), box(sd > 0 ? 1.7 : -2.95, sd > 0 ? 2.95 : -1.7, 0, 0.18, -4.15, -2.9)])];
  } else if (kind === 'dhow') {
    // its belly in slices along it, each as wide as the hull there and topped by the deck; the stern cabin, whose roof
    // holds the helm; the two masts
    const H = DHOW_HULL, L = DHOW.length, U0 = -L / 2;
    B = [...slices(40, U0, U0 + L, (u, a, b) => sym(H.halfW(u) * 0.97, H.sheer(u) - H.depth(u), H.deck(u), a, b)),
      sym(2.05, H.deck(0.05), DHOW.seat[1] - 0.04, U0 + 0.55, DHOW.seat[2] + 0.9),
      sym(0.22, 0, 16, 2.78, 3.22), sym(0.22, 0, 11, -4.72, -4.28)];
  } else if (kind === 'ark') {
    // its spine (a walk along its crest, wider below), the floor of its dome on the prow, its ring all round (a ring is the
    // same turned, so it is solid standing still), its four engines in a cross
    const R = ARK.ring, E = ARK.engines, D = ARK.dome;
    B = [sym(1.2, 1.0, ARK.spine - 0.1, -31, 32), sym(ARK.spine - 0.2, -ARK.spine + 0.2, 1.0, -31, 32),
      sym(D.r - 0.4, 1.0, ARK.seat[1] - 0.2, D.at[2] - 2.5, D.at[2] + 2.5),
      ...[...Array(16)].map((_, k) => { const a = (k * Math.PI) / 8, x = R.r * Math.cos(a), y = R.r * Math.sin(a); return box(x - 2.4, x + 2.4, y - 2.4, y + 2.4, R.z - R.tube, R.z + R.tube); }),
      ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => box(x * E.off - E.r, x * E.off + E.r, y * E.off - E.r, y * E.off + E.r, E.z0, E.z1))];
  } else if (kind === 'carrier') {
    // its five terraces, each narrowing over its last BOW metres to its prow (in four steps), its masts, its towers, its engines
    const C = CARRIER;
    B = C.terraces.flatMap((t) => [sym(t.hw, t.y0, t.y1, t.z0, t.z1 - C.bow),
      ...slices(4, t.z1 - C.bow, t.z1, (u, a, b) => sym(t.hw * (1 - (1 - C.bowNarrow) * u), t.y0, t.y1, a, b))]);
    B.push(...C.masts.map((m) => box(-1.5, 1.5, m.foot, m.top, m.z - 1.5, m.z + 1.5)), ...C.towers.map((t) => box(t.x - 2.5, t.x + 2.5, t.y0, t.y1, t.z - 2.5, t.z + 2.5)),
      ...C.engines.xs.map((x) => box(x - C.engines.r, x + C.engines.r, C.engines.y - C.engines.r, C.engines.y + C.engines.r, C.engines.z - 5, C.engines.z + 5)));
  } else {
    // the skiff: its open hull in slices, to its gunwale
    const L = SKIFF.length, hw = (u) => (SKIFF.beam / 2) * Math.pow(Math.sin(Math.PI * u), 0.6), sh = (u) => 0.15 + 0.34 * Math.abs(2 * u - 1) ** 3;
    B = slices(6, -L / 2, L / 2, (u, a, b) => sym(Math.max(0.1, hw(u)), -SKIFF.keel, sh(u), a, b));
  }
  return (SOLID[kind] = B);
}
// a world point in a ship's frame (its middle, riding on its bob), and back
export function toShip(s, p) { const c = Math.cos(s.yaw), n = Math.sin(s.yaw), dx = p[0] - s.p[0], dz = p[2] - s.p[2]; return [c * dx - n * dz, p[1] - s.p[1] - (s.bob || 0), n * dx + c * dz]; }
export function fromShip(s, [x, y, z]) { const c = Math.cos(s.yaw), n = Math.sin(s.yaw); return [s.p[0] + c * x + n * z, s.p[1] + (s.bob || 0) + y, s.p[2] - n * x + c * z]; }
// a body standing on a ship that has moved (from `was` and `wasYaw` to where it is) goes with it: along, round and up
export function carryOn(s, body, was, wasYaw, wasBob = 0) {
  const turn = s.yaw - wasYaw, c = Math.cos(turn), n = Math.sin(turn);
  for (const q of [body.p, body.was]) {
    if (!q) continue;
    const dx = q[0] - was[0], dz = q[2] - was[2];
    q[0] = s.p[0] + c * dx + n * dz; q[2] = s.p[2] - n * dx + c * dz; q[1] += s.p[1] + (s.bob || 0) - was[1] - wasBob;
  }
  body.yaw += turn;
  return body;
}

// BOARDING IS NEARNESS (Colin, 19 Nov 2026: "there shouldn't be any prevention 'walk to the ship's stern to board it' --
// it should always just be about proximity to the ship"): how far a point is from the nearest part of a ship (its solid
// boxes, below), and the nearest ship a body is within `board` metres of, from any side, over it, under it or on it
export function shipGap(s, p) {
  const q = toShip(s, p);
  let best = Infinity;
  for (const b of shipBoxes(s.kind)) {
    const dx = Math.max(b.x0 - q[0], 0, q[0] - b.x1), dy = Math.max(b.y0 - q[1], 0, q[1] - b.y1), dz = Math.max(b.z0 - q[2], 0, q[2] - b.z1);
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export function nearShip(ships, p) {
  let best = null, bd = Infinity;
  for (const s of ships) {
    const d = shipGap(s, p);
    if (d <= kindOf(s).board && d < bd) { bd = d; best = s; }
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
  body.seated = null; body.grounded = false; body.coyote = 0; s.thr = 0; s.light = null;
  body.p = [q[0] + l[0] * 1.3, q[1], q[2] + l[2] * 1.3]; body.was = [...body.p]; body.acc = 0;
  body.v = [s.v[0] * 0.5, Math.max(0, s.v[1] * 0.5), s.v[2] * 0.5];
}
