// combat.js — THE RING AND THE BOTS, AS NUMBERS. No page, no three: the suite
// runs it; fight.js draws it.
//
// Colin, 17 Nov 2026: "for this round, let's prioritize getting a plasma weapon
// generated with several ways to attack with it, getting a bot enemy that we
// can spawn in at varying difficulty". And from the first brief (13 Nov): "don't
// steal the lightsaber, but i do like plasma weapons -- make up 5 different
// plasma weapons of your choice."
//
// THE RING, the first of the five (GAME.md: a thread, a bow, a ring, a bell, a
// torch; none of them a blade). A bronze ring a forearm across, wound with a
// filament of contained plasma, held by the binding rather than by a hand, so
// every one of the five kinds of body can wield it. Five ways:
//
//   · CAST (the attack, a tap): thrown at what the eye looks at, or at the bot
//     nearest that line; it goes through what it meets and comes back. Pressed
//     again while it is out, it is called home and thrown again from the hand.
//   · CHARGED CAST (the attack held, then let go): spun up first, for as long as
//     it is held (to RING.charge s); it flies faster and further and strikes up
//     to two and a half times as hard.
//   · WHIRL (its own key): twice round the body at arm's length in under half a
//     second: everything within reach is struck and thrown back.
//   · SLAM (the attack in the air): the body is driven down; where it lands a
//     wave of plasma runs out over the water, hardest nearest.
//   · GUARD (held): the ring spins in front as a shield. A bolt from the front is
//     turned aside; one met just as the guard comes up (a parry) goes back at
//     whoever sent it, three times as hard. Pressed while the ring is out, the
//     guard calls it back.
//
// THE BOW, the second of the five (stage 5): a recurve of bronze limbs strung
// with a filament of plasma, held by the binding as the ring is. Four ways:
//
//   · LOOSE (the attack, a tap): an arrow of plasma where the eye looks (at the
//     bot nearest that line, if one is very near it), quick and light; arrows
//     fall a little as they fly.
//   · DRAWN (the attack held, then let go): drawn back for as long as it is held
//     (to BOW.draw s); the arrow flies faster and strikes harder, and drawn all
//     the way it passes through what it strikes to the next, up to three.
//   · VOLLEY (the whirl's key): five arrows at once, in a fan.
//   · DRAWN IN THE AIR: while the string is back in the air, the binding holds
//     the body up: it comes down slowly.
//   The guard is the ring's: it comes to it, whichever is in hand.
//
// THE BELL, the third of the five (stage 5): a hand bell of bronze with a clapper
// of plasma, held by the binding. Its tone goes out as a ring over the water
// (the cymatic patterns of the frequencies room, made a weapon): what hovers in
// its way as it passes is struck once and pushed out. A wall between stops it.
//
//   · STRIKE (the attack, a tap): a ring of its tone out to BELL.strike.radius.
//   · TOLL (the attack held, then let go): held, the tone builds (the water
//     shivers in rings round the body); let go, a great toll goes out further,
//     strikes harder and, tolled all the way, stuns: a bot struck neither moves
//     of itself nor shoots for a moment.
//   · PEAL (the whirl's key): three quick rings, one after another.
//   · RUNG IN THE AIR: the tone goes down, and rings out over the water from
//     under the body.
//   The guard is the ring's.
//
// THE THREAD, the fourth of the five (stage 5): a spindle of bronze wound with a
// filament of plasma, held by the binding. The filament pays out from it as a
// lash, a line of light drawn out along the eye's way and drawn back in: what it
// touches as it goes out is struck once, all of it, not only the first. Four ways:
//
//   · LASH (the attack, a tap): out to THREAD.lash.reach where the eye looks (at
//     the bot nearest that line, if one is near it) and back, in a third of a second.
//   · SNARE (the attack held, then let go): held, the spindle spins up; let go, the
//     lash goes further and strikes harder, and spun all the way it winds round the
//     first bot it meets: snared, the bot neither moves of itself nor shoots, the
//     thread burns it, and it is drawn in toward the body.
//   · CIRCLE (the whirl's key): swung round overhead three times, paid out as it
//     goes, a widening circle: each turn strikes once what is in its sweep.
//   · LINE (the attack, in the air): out ahead where the eye looks, it catches on
//     whatever is there (a wall, the land, the water) and draws the body to it, for
//     as long as the attack is held.
//   The guard is the ring's.
//
// THE BINDING (stage 5): the force. GAME.md: "The force is the binding. It
// comes from Colin's own theory, love as what binds: it pulls, holds, joins and
// lets go." Held (its own key), it reaches out along the eye's line to the bot
// nearest it and PULLS it in; while it is held the binding HOLDS it in front of
// the body, where the eye looks, and it can neither move nor shoot; let go, it
// is thrown (it LETS GO) where the eye looks (at another bot near that line, if
// there is one), and falls; flung into another bot,
// the two are JOINED: both struck as hard as it came, they tumble together into
// the water. Struck down there, or against a wall, a bot is hurt too, less.
// Only machines: never a presence's people.
//
// THE BOTS: machines that hover over the water and shoot bolts of plasma, at
// five levels (LEVELS): how much they take, how fast they move, how often and
// how well they shoot (bursts, leading a moving body), whether they slip a
// cast. Never a presence's people: things.
//
// On the island the bots rise out of the ground (or the sea) where they are
// called and hover over whatever is under them (world.ground), not over a
// sea level that may be deep inside a hill.
//
// The body is hurt only in survival; at nothing it is down for a moment, then
// stands again where it fell, whole. Everything moves in steps of at most
// 1/60 s, and what flies is tested along the whole of each step (a swept test),
// so nothing fast passes through what it should meet.
import { WATER } from './body.js';

export const RING = {
  r: 0.3,                                   // the ring's radius (its reach to what it meets, beside the bot's own)
  cast: { speed: 30, reach: 22, damage: 34 },
  charged: { speed: 46, reach: 34, damage: 85 },
  charge: 0.8,                              // s held to be spun up all the way
  tap: 0.16,                                // s: held less than this, it is a plain cast
  back: 38,                                 // m/s, coming home
  assist: 0.3,                              // rad: a bot this near the eye's line is what a cast goes for
  turn: 5,                                  // rad/s: how hard a cast bends after the bot it went for
  whirl: { time: 0.42, radius: 2.9, damage: 28, knock: 10 },
  slam: { min: 1.1, fall: 22, radius: 6.5, damage: 55, knock: 12 },
  guard: { arc: 1.25, parry: 0.24 },        // half the angle a guard covers (rad); how soon after raising it a bolt is a parry
};
export const BOW = {
  loose: { speed: 52, damage: 24, fall: 4 },
  drawn: { speed: 78, damage: 88, fall: 2, pierce: 3 },
  draw: 0.9,                                // s held to be drawn all the way
  tap: 0.14,                                // s: held less than this, it is a plain loose
  cool: 0.32,                               // s before it can be drawn again
  volley: { n: 5, spread: 0.09, speed: 46, damage: 18, cool: 1.1 },
  hover: -1.6,                              // m/s: drawn in the air, the body falls no faster than this
  assist: 0.12,                             // rad: a bot this near the eye's line is what an arrow goes for
  life: 2.2,                                // s an arrow flies
};
export const BELL = {
  strike: { radius: 9, speed: 20, damage: 22, knock: 7 },
  toll: { radius: 16, speed: 24, damage: 70, knock: 12, stun: 2.0 },
  hold: 1.0,                                // s held to toll it all the way
  tap: 0.16,                                // s: held less than this, it is a strike
  cool: 0.45,                               // s before it is struck again
  peal: { n: 3, gap: 0.18, radius: 7, speed: 20, damage: 14, knock: 5, cool: 1.4 },
  below: { radius: 7, speed: 20, damage: 40, knock: 10 },
  band: 0.5,                                // m: how thick the ring of its tone is, beside what it meets
  height: 3.5,                              // m: it strikes what hovers within this of where it rings
};
export const THREAD = {
  lash: { reach: 9, out: 0.13, back: 0.17, damage: 26, knock: 6 },
  snared: { reach: 15, damage: 52, knock: 2 },   // spun all the way: further, harder, and it winds round the first it meets
  spin: 0.8,                                // s held to spin it up all the way
  tap: 0.16,                                // s: held less than this, it is a plain lash
  cool: 0.35,                               // s before it goes out again
  width: 0.24,                              // m: how near the line a bot is struck, beside its own size
  snare: { time: 2.2, burn: 14, every: 0.25, pull: 5, near: 4 },   // s it holds; damage a second, dealt each quarter; m/s drawn in, to 4 m off
  circle: { turns: 3, time: 0.8, r0: 2.2, r1: 7.5, damage: 16, knock: 7, height: 3, cool: 1.2 },
  line: { reach: 22, speed: 17, time: 1.4, near: 1.6, cool: 0.5 },   // m it reaches; m/s it draws the body; s at most; m from where it caught
  assist: 0.22,                             // rad: a bot this near the eye's line is what a lash goes for
};
// the five plasma weapons (GAME.md's order), those made ready; the one in hand is kept between visits (state.js)
export const WEAPONS = [
  { id: 'thread', label: 'thread', ready: true }, { id: 'bow', label: 'bow', ready: true }, { id: 'ring', label: 'ring', ready: true },
  { id: 'bell', label: 'bell', ready: true }, { id: 'torch', label: 'torch', ready: false },
];
export const cleanWeapon = (w) => (WEAPONS.some((x) => x.id === w && x.ready) ? w : 'ring');
export const nextWeapon = (w) => { const R = WEAPONS.filter((x) => x.ready).map((x) => x.id), i = R.indexOf(w); return R[(i + 1) % R.length]; };
export const BINDING = {
  reach: 24,                                // m: as far as it reaches
  assist: 0.32,                             // rad: a bot this near the eye's line is what it takes
  pull: 16,                                 // m/s at most, coming in
  hold: 4.2,                                // m out along the eye's line: where it is held (up and to the left, holdAt)
  fling: 28,                                // m/s: let go, along the eye's line (and a little up)
  lift: 2.5,                                // m/s up, besides
  strike: 2.2,                              // flung into another, each is struck this much a m/s it came at (at 28: 62)
  plunge: 0.6,                              // into the water, the ground or a wall: this share of that
  flight: 2.2,                              // s a flung bot flies before it rights itself, if it meets nothing
  tumble: 1.1,                              // s two joined bots tumble together before they come apart
  fall: 9.8,                                // m/s/s: what is flung or tumbles falls
  turn: 4,                                  // rad/s: how hard a bot thrown at another bends after it
  rest: 0.45,                               // s after letting go before it reaches again
  miss: 0.3,                                // s it reaches out and comes back, when there is nothing to take
};
// the five levels of bot: hit points, speed (m/s), the distances it keeps, seconds between bursts, shots a burst,
// how much it leads a moving body (0..1), its aim's error (rad), the chance it slips a cast, its bolts, its size
export const LEVELS = [
  { name: 'drifter', hp: 40, speed: 2.8, range: [7, 12], every: 2.8, burst: 1, lead: 0, spread: 0.07, dodge: 0, bolt: { speed: 13, damage: 6 }, r: 0.55, colour: [0.35, 1.0, 0.72] },
  { name: 'scout', hp: 70, speed: 4.0, range: [7, 12], every: 2.5, burst: 1, lead: 0.3, spread: 0.05, dodge: 0.15, bolt: { speed: 16, damage: 8 }, r: 0.6, colour: [0.38, 0.72, 1.0] },
  { name: 'sentinel', hp: 100, speed: 5.4, range: [6, 11], every: 2.3, burst: 2, lead: 0.6, spread: 0.035, dodge: 0.3, bolt: { speed: 19, damage: 9 }, r: 0.66, colour: [1.0, 0.76, 0.28] },
  { name: 'hunter', hp: 140, speed: 6.8, range: [5, 10], every: 1.75, burst: 2, lead: 0.85, spread: 0.022, dodge: 0.45, bolt: { speed: 22, damage: 11 }, r: 0.72, colour: [1.0, 0.42, 0.2] },
  { name: 'warden', hp: 200, speed: 8.2, range: [5, 9], every: 1.5, burst: 3, lead: 1, spread: 0.014, dodge: 0.6, bolt: { speed: 26, damage: 12 }, r: 0.8, colour: [1.0, 0.22, 0.52] },
];
export const PLAYER = { hp: 100, regenAfter: 4, regen: 14, down: 2.6, mercy: 1.6, r: 0.38 };
export const MAX_BOTS = 12;
export const STEP = 1 / 60;
const RISE = 1.1;                           // s a bot takes to come up out of the water
const BOLT_LIFE = 3.2;

// ---- small vector arithmetic on [x, y, z]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const m = len(a) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a + (b - a) * t;
// how near a point comes to a segment (where something was a step ago, where it is now)
export function segPoint(a, b, p) {
  const ab = sub(b, a), ap = sub(p, a), L2 = dot(ab, ab), t = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(ap, ab) / L2)) : 0;
  return Math.hypot(a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]);
}
// how near two segments come (a bolt's step against a body's upright middle)
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return len(r);
  if (a <= 1e-12) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return Math.hypot(p1[0] + d1[0] * s - p2[0] - d2[0] * t, p1[1] + d1[1] * s - p2[1] - d2[1] * t, p1[2] + d1[2] * s - p2[2] - d2[2] * t);
}
// a body's forward and right, from its yaw (body.js: forward is (sin yaw, 0, cos yaw))
export const forwardOf = (yaw) => [Math.sin(yaw), 0, Math.cos(yaw)];
export const rightOf = (yaw) => [-Math.cos(yaw), 0, Math.sin(yaw)];
// where the ring is held: beside the body's right shoulder, a little in front
export function handOf(body) {
  const f = forwardOf(body.yaw), r = rightOf(body.yaw);
  return [body.p[0] + r[0] * 0.48 + f[0] * 0.12, body.p[1] + 1.28, body.p[2] + r[2] * 0.48 + f[2] * 0.12];
}
const chest = (body) => [body.p[0], body.p[1] + 1.1, body.p[2]];
// a seeded random (the same fight from the same seed: the suite's)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createCombat({ seed = 7 } = {}) {
  return {
    ring: { mode: 'held', p: [0, 1.3, 0], dir: [0, 0, 1], speed: 0, reach: 0, went: 0, damage: 0, charge: 0, held: 0, t: 0, target: null, struck: new Set(), spin: 0 },
    guard: { up: false, t: 9 },
    face: 0, faceYaw: 0,                    // how long the body is to keep facing where the eye looks (after a cast), and that way
    queue: null,                            // an attack pressed while the ring was away: it waits for the ring's return (briefly)
    bind: { mode: 'idle', target: null, t: 0, rest: 0, miss: 0, missDir: [0, 0, 1], joined: 0 },
    weapon: 'ring', bow: { mode: 'held', held: 0, draw: 0, cool: 0 }, bell: { mode: 'held', held: 0, power: 0, cool: 0, peal: 0, pealT: 0, rang: 0 }, tones: [],
    thread: { mode: 'held', held: 0, power: 0, cool: 0, t: 0, dir: [0, 0, 1], reach: 0, damage: 0, knock: 0, snaring: false, struck: new Set(), tip: null,
      snare: null, snareT: 0, burnT: 0, anchor: null, yaw0: 0, prevAng: null, turns: new Map() },
    bots: [], bolts: [], level: 1, broken: 0, turned: 0, ids: 1, rand: rng(seed), events: [],
    player: { hp: PLAYER.hp, hurt: 99, mercy: 0, down: 0 },
  };
}

// a bot of a level, come up out of the water `ahead` metres in front of where the eye looks (a little to one side)
export function spawnBot(c, body, yaw, level = c.level, ahead = 12) {
  if (c.bots.filter((b) => b.mode !== 'broken').length >= MAX_BOTS) return null;
  const L = LEVELS[Math.max(1, Math.min(5, level | 0)) - 1], f = [-Math.sin(yaw), 0, -Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const side = (c.rand() - 0.5) * 8;
  const b = {
    id: c.ids++, level: LEVELS.indexOf(L) + 1, L, r: L.r, hp: L.hp, max: L.hp, mode: 'rise', t: 0,
    p: [body.p[0] + f[0] * ahead + r[0] * side, -0.8, body.p[2] + f[2] * ahead + r[2] * side], v: [0, 0, 0],
    alt: 1.5 + c.rand() * 1.1, phase: c.rand() * 6.283, fire: 1.2 + c.rand() * L.every, burst: 0, burstT: 0,
    strafe: c.rand() < 0.5 ? -1 : 1, strafeT: 1.5 + c.rand() * 2.5, dodgeT: 0, dodgeDir: [0, 0, 0], armed: false, hitT: 0,
  };
  c.bots.push(b);
  c.events.push({ type: 'spawn', at: [b.p[0], 0, b.p[2]], level: b.level, id: b.id });
  return b;
}
export function clearBots(c) { for (const b of c.bots) if (b.mode !== 'broken') c.events.push({ type: 'gone', at: [...b.p], id: b.id, level: b.level }); c.bots = []; c.bolts = c.bolts.filter((x) => x.owner === 'player'); }

function hit(c, b, damage, from, kind, knock = 4) {
  if (b.mode === 'broken') return;
  b.hp -= damage; b.hitT = 0.16;
  const d = unit([b.p[0] - from[0], 0.25, b.p[2] - from[2]]);
  b.v[0] += d[0] * knock; b.v[1] += d[1] * knock * 0.5; b.v[2] += d[2] * knock;
  c.events.push({ type: 'hit', at: [...b.p], damage, kind, level: b.level, id: b.id });
  if (b.hp <= 0) {
    b.mode = 'broken'; c.broken++;
    c.events.push({ type: 'broken', at: [...b.p], v: [...b.v], level: b.level, id: b.id, r: b.r });
  }
}

// where a cast goes: at the bot nearest the eye's line (within RING.assist), else where the eye's line meets the water
// or reaches as far as the ring will go
function castAim(c, hand, aim, reach) {
  let best = null, ba = RING.assist;
  for (const b of c.bots) {
    if (b.mode === 'broken') continue;
    const to = sub(b.p, aim.from), d = len(to);
    if (d < 0.5 || len(sub(b.p, hand)) > reach + 8) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(to, aim.dir) / d)));
    if (a < ba) { ba = a; best = b; }
  }
  if (best) return { dir: unit(sub(best.p, hand)), target: best };
  let T = len(sub(hand, aim.from)) + reach;
  if (aim.dir[1] < -1e-3) T = Math.min(T, (aim.from[1] - WATER) / -aim.dir[1]);
  const P = [aim.from[0] + aim.dir[0] * T, aim.from[1] + aim.dir[1] * T, aim.from[2] + aim.dir[2] * T];
  return { dir: unit(sub(P, hand)), target: null };
}

// what the binding takes: the bot nearest the eye's line (within BINDING.assist), within its reach, at liberty
function bindAim(c, aim) {
  let best = null, ba = BINDING.assist;
  for (const b of c.bots) {
    if (b.mode !== 'fight') continue;
    const to = sub(b.p, aim.from), d = len(to);
    if (d < 0.5 || d > BINDING.reach + 6) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(to, aim.dir) / d)));
    if (a < ba) { ba = a; best = b; }
  }
  return best;
}
// where a bot let go is thrown: at another bot near the eye's line (as a cast goes for one), arced for its fall, and it
// bends after it as it flies; else along the eye's line, a little up. Answers { v, seek }
function flingVel(c, aim, held) {
  let best = null, ba = BINDING.assist;
  for (const b of c.bots) {
    if (b === held || b.mode === 'broken' || b.mode === 'rise') continue;
    const to = sub(b.p, aim.from), d = len(to);
    if (d < 0.5 || d > BINDING.reach * 2) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(to, aim.dir) / d)));
    if (a < ba) { ba = a; best = b; }
  }
  if (!best) return { v: [aim.dir[0] * BINDING.fling, aim.dir[1] * BINDING.fling + BINDING.lift, aim.dir[2] * BINDING.fling], seek: null };
  const to = sub(best.p, held.p), d = len(to), t = d / BINDING.fling, u = unit(to);
  return { v: [u[0] * BINDING.fling, u[1] * BINDING.fling + (BINDING.fall * t) / 2, u[2] * BINDING.fling], seek: best.id };
}
// where the binding holds what it has taken: out along the eye's line, up and to the left of the head (where the eye,
// over the right shoulder, sees it, and not behind the body), never under what it hovers over
export function holdAt(body, aim, floor = 0, r = 0.6) {
  const fl = Math.hypot(aim.dir[0], aim.dir[2]) || 1, left = [aim.dir[2] / fl, 0, -aim.dir[0] / fl], H = BINDING.hold;
  const p = [body.p[0] + aim.dir[0] * H + left[0] * 1.1, body.p[1] + 2.0 + aim.dir[1] * H, body.p[2] + aim.dir[2] * H + left[2] * 1.1];
  p[1] = Math.max(p[1], floor + r + 0.15);
  return p;
}
// the hand the binding goes out from: the left, as the ring is held at the right
export function leftHandOf(body) {
  const f = forwardOf(body.yaw), r = rightOf(body.yaw);
  return [body.p[0] - r[0] * 0.42 + f[0] * 0.2, body.p[1] + 1.18, body.p[2] - r[2] * 0.42 + f[2] * 0.2];
}

// the weapon in hand: the ring, or the bow. The ring, if it is out, is called home; nothing half done carries over
export function chooseWeapon(c, id) {
  const R = c.ring;
  if (!WEAPONS.some((x) => x.id === id && x.ready) || id === c.weapon) return false;   // one not made yet changes nothing
  const w = id;
  if (R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
  if (R.mode === 'charging' || R.mode === 'whirl') { R.mode = 'held'; R.charge = 0; }
  c.queue = null; c.bow.mode = 'held'; c.bow.held = 0; c.bow.draw = 0; c.bell.mode = 'held'; c.bell.held = 0; c.bell.power = 0; c.bell.peal = 0;
  letThreadGo(c);
  c.weapon = w; c.events.push({ type: 'weapon', id: w });
  return true;
}
// where an arrow goes: at the bot very near the eye's line (BOW.assist), where it will be when the arrow gets there, else
// where the eye looks, far off or on the water; arced for its fall either way
function arrowAim(c, hand, aim, speed, fall) {
  let best = null, ba = BOW.assist;
  for (const b of c.bots) {
    if (b.mode === 'broken' || b.mode === 'rise') continue;
    const to = sub(b.p, aim.from), d = len(to);
    if (d < 0.5 || d > speed * BOW.life) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(to, aim.dir) / d)));
    if (a < ba) { ba = a; best = b; }
  }
  let P;
  if (best) { const t = len(sub(best.p, hand)) / speed; P = [best.p[0] + best.v[0] * t, best.p[1] + best.v[1] * t, best.p[2] + best.v[2] * t]; }   // where it will be
  else {
    let T = 60;
    if (aim.dir[1] < -1e-3) T = Math.min(T, (aim.from[1] - WATER) / -aim.dir[1]);
    P = [aim.from[0] + aim.dir[0] * T, aim.from[1] + aim.dir[1] * T, aim.from[2] + aim.dir[2] * T];
  }
  const to = sub(P, hand), d = len(to), u = unit(to), t = d / speed;
  return { v: [u[0] * speed, u[1] * speed + (fall * t) / 2, u[2] * speed], target: best };
}
function loose(c, hand, aim, power) {
  const A = BOW.loose, B = BOW.drawn, speed = lerp(A.speed, B.speed, power), fall = lerp(A.fall, B.fall, power);
  const { v } = arrowAim(c, hand, aim, speed, fall);
  c.bolts.push({ p: [...hand], v, owner: 'player', kind: 'arrow', damage: Math.round(lerp(A.damage, B.damage, power)), life: BOW.life, fall, pierce: power >= 0.75 ? B.pierce : 1, struck: [], power });
  c.face = 0.3; c.faceYaw = Math.atan2(aim.dir[0], aim.dir[2]);
  c.events.push({ type: 'loose', at: [...hand], dir: unit(v), power });
}
function volley(c, hand, aim) {
  const V = BOW.volley, yaw = Math.atan2(aim.dir[0], aim.dir[2]), flat = Math.hypot(aim.dir[0], aim.dir[2]) || 1;
  for (let k = 0; k < V.n; k++) {
    const a = yaw + (k - (V.n - 1) / 2) * V.spread, d = [Math.sin(a) * flat, aim.dir[1], Math.cos(a) * flat];
    const { v } = arrowAim(c, hand, { from: aim.from, dir: d }, V.speed, BOW.loose.fall);
    c.bolts.push({ p: [...hand], v, owner: 'player', kind: 'arrow', damage: V.damage, life: BOW.life, fall: BOW.loose.fall, pierce: 1, struck: [], power: 0 });
  }
  c.face = 0.3; c.faceYaw = yaw;
  c.events.push({ type: 'volley', at: [...hand], n: V.n });
}

// whether a wall stands between two points (looked at every fifth of a metre, so a thin one is not missed)
function walled(world, a, b) {
  const d = len(sub(b, a)), n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) { const u = i / n; if (world.solid([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u])) return true; }
  return false;
}
// a ring of the bell's tone, from where it rings (on the water under the body, at the height of what it would strike)
function ring(c, at, T, power = 0, stun = 0) {
  c.tones.push({ at: [...at], r: 0.3, R: T.radius, speed: T.speed, damage: T.damage, knock: T.knock, stun, power, struck: new Set() });
  c.events.push({ type: 'toll', at: [...at], radius: T.radius, power });
}

// the thread let go of, whatever it was doing: a snared bot is freed a moment later
function letThreadGo(c) {
  const Th = c.thread;
  if (Th.snare != null) {
    const b = c.bots.find((x) => x.id === Th.snare);
    if (b && b.mode !== 'broken') b.stunT = Math.min(b.stunT || 0, 0.3);
    c.events.push({ type: 'unsnare', id: Th.snare });
  }
  Th.snare = null; Th.mode = 'held'; Th.held = 0; Th.power = 0; Th.anchor = null; Th.tip = null; Th.prevAng = null;
}
// the lash: out where the eye looks (at the bot very near that line, if one is), a line from the hand to its tip
function lash(c, hand, aim, power) {
  const Th = c.thread, A = THREAD.lash, B = THREAD.snared;
  Th.mode = 'out'; Th.t = 0; Th.struck = new Set(); Th.held = 0; Th.power = power;
  Th.reach = lerp(A.reach, B.reach, power); Th.damage = Math.round(lerp(A.damage, B.damage, power)); Th.knock = lerp(A.knock, B.knock, power);
  Th.snaring = power >= 0.99;
  let best = null, ba = THREAD.assist;
  for (const b of c.bots) {
    if (b.mode === 'broken' || b.mode === 'rise') continue;
    const to = sub(b.p, aim.from), d = len(to);
    if (d < 0.5 || len(sub(b.p, hand)) > Th.reach + b.r) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(to, aim.dir) / d)));
    if (a < ba) { ba = a; best = b; }
  }
  const far = len(sub(hand, aim.from)) + Th.reach;
  Th.dir = best ? unit(sub(best.p, hand)) : unit(sub([aim.from[0] + aim.dir[0] * far, aim.from[1] + aim.dir[1] * far, aim.from[2] + aim.dir[2] * far], hand));
  c.face = 0.3; c.faceYaw = Math.atan2(aim.dir[0], aim.dir[2]);
  c.events.push({ type: 'lash', at: [...hand], dir: [...Th.dir], power, reach: Th.reach });
}
// the line: out ahead where the eye looks, it catches on what is there (a wall, the land, the water); nothing in
// reach, it goes out and falls back, striking nothing
function lineOut(c, body, aim, world) {
  const Th = c.thread, L = THREAD.line, hand = handOf(body), from = aim.from, d0 = len(sub(hand, from));
  const at = (s) => [from[0] + aim.dir[0] * s, from[1] + aim.dir[1] * s, from[2] + aim.dir[2] * s];
  let caught = null;
  for (let s = d0 + 0.5; s <= d0 + L.reach; s += 0.25) {
    const p = at(s);
    if ((world?.solid && world.solid(p)) || p[1] <= floorUnder(world, p[0], p[2])) { caught = at(s - 0.3); break; }
  }
  if (!caught) {
    Th.mode = 'out'; Th.t = 0; Th.struck = new Set(); Th.reach = L.reach * 0.6; Th.damage = 0; Th.knock = 0; Th.snaring = false; Th.power = 0;
    Th.dir = unit(sub(at(d0 + L.reach), hand));
    c.events.push({ type: 'line-miss', at: [...hand], dir: [...Th.dir] });
    return;
  }
  Th.mode = 'line'; Th.anchor = caught; Th.t = 0;
  if (body.wallrun) { body.lastWall = body.wallrun.n; body.wallrun = null; }      // off the wall it was running along
  c.events.push({ type: 'line', at: [...hand], anchor: [...caught] });
}

function cast(c, hand, aim, power) {
  const R = c.ring, A = RING.cast, B = RING.charged;
  R.mode = 'out'; R.p = [...hand]; R.went = 0; R.struck = new Set(); R.charge = 0;
  R.speed = lerp(A.speed, B.speed, power); R.reach = lerp(A.reach, B.reach, power); R.damage = Math.round(lerp(A.damage, B.damage, power));
  const { dir, target } = castAim(c, hand, aim, R.reach);
  R.dir = dir; R.target = target; R.power = power;
  // a bot that may slip it decides now whether it will
  for (const b of c.bots) b.armed = b.mode !== 'broken' && c.rand() < b.L.dodge;
  c.face = 0.35; c.faceYaw = Math.atan2(aim.dir[0], aim.dir[2]);
  c.events.push({ type: 'cast', at: [...hand], dir: [...dir], power });
}

// One frame. ctx: { body (body.js), aim: { from, dir } (the eye and the way it looks), hands: { attack, attackPressed,
// guard, guardPressed, sweep } (input.js), creative, world: { solid(p) } or null }. Answers c; what happened is in c.events.
export function stepCombat(c, dt, ctx) {
  const { body, aim, creative = false, world = null } = ctx;
  let hands = ctx.hands || {};
  const P = c.player, R = c.ring;
  dt = Math.min(dt, 0.1);
  // ---- the body's own state: down, standing again, mending
  if (P.down > 0) {
    P.down -= dt;
    if (P.down <= 0) { P.down = 0; P.hp = PLAYER.hp; P.mercy = PLAYER.mercy; c.events.push({ type: 'rise', at: [...body.p] }); }
  }
  P.mercy = Math.max(0, P.mercy - dt); P.hurt += dt;
  if (creative) P.hp = PLAYER.hp;
  else if (P.down <= 0 && P.hurt > PLAYER.regenAfter && P.hp < PLAYER.hp) P.hp = Math.min(PLAYER.hp, P.hp + PLAYER.regen * dt);
  const able = P.down <= 0, hand = handOf(body), aimYaw = Math.atan2(aim.dir[0], aim.dir[2]);
  c.face = Math.max(0, c.face - dt);

  // ---- the hands
  const airborne = !body.grounded && !body.flying && !body.climbing && body.p[1] - (body.floorY ?? 0) > RING.slam.min;
  const W = c.bow;
  W.cool = Math.max(0, W.cool - dt);
  const Bl = c.bell;
  Bl.cool = Math.max(0, Bl.cool - dt);
  const Th = c.thread;
  Th.cool = Math.max(0, Th.cool - dt);
  if (able && c.weapon === 'bell') {
    // ---- the bell: pressed, its tone builds; let go, it is struck (a tap) or tolled; the whirl's key, a peal; in the air,
    // it rings out from below
    const here = [body.p[0], body.p[1] + 1.1, body.p[2]];
    if (hands.attackPressed && Bl.mode === 'held' && Bl.cool <= 0) { Bl.mode = 'ringing'; Bl.held = 0; Bl.power = 0; }
    if (Bl.mode === 'ringing') {
      Bl.held += dt;
      if (Bl.held > BELL.tap) Bl.power = Math.min(1, (Bl.held - BELL.tap) / BELL.hold);
      if (!hands.attack) {
        const p = Bl.held > BELL.tap ? Bl.power : 0, S = BELL.strike, T = BELL.toll;
        if (airborne) ring(c, [body.p[0], (body.floorY ?? 0) + 0.8, body.p[2]], BELL.below, p);
        else ring(c, here, { radius: lerp(S.radius, T.radius, p), speed: lerp(S.speed, T.speed, p), damage: Math.round(lerp(S.damage, T.damage, p)), knock: lerp(S.knock, T.knock, p) }, p, p >= 0.99 ? T.stun : 0);
        Bl.mode = 'held'; Bl.held = 0; Bl.power = 0; Bl.cool = BELL.cool; Bl.rang++;
      }
    }
    if (hands.sweep && Bl.mode === 'held' && Bl.cool <= 0 && Bl.peal <= 0) { Bl.peal = BELL.peal.n; Bl.pealT = 0; Bl.cool = BELL.peal.cool; }
    if (hands.guardPressed && R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
  } else if (able && c.weapon === 'thread') {
    // ---- the thread: pressed, the spindle spins up; let go, it lashes out (a tap) or further, snaring (spun all the
    // way); the whirl's key, a circle overhead; in the air, a line that catches and draws the body in while held
    if (hands.attackPressed && Th.mode === 'held' && Th.cool <= 0) {
      if (airborne) lineOut(c, body, aim, world);
      else { Th.mode = 'spinning'; Th.held = 0; Th.power = 0; }
    }
    if (Th.mode === 'spinning') {
      Th.held += dt;
      if (Th.held > THREAD.tap) Th.power = Math.min(1, (Th.held - THREAD.tap) / THREAD.spin);
      c.face = Math.max(c.face, 0.1); c.faceYaw = aimYaw;
      if (!hands.attack) lash(c, hand, aim, Th.held > THREAD.tap ? Th.power : 0);
    }
    if (Th.mode === 'line' && !hands.attack) { Th.mode = 'held'; Th.anchor = null; Th.cool = THREAD.line.cool; c.events.push({ type: 'line-off', at: [...body.p] }); }
    if (hands.sweep && (Th.mode === 'held' || Th.mode === 'spinning') && Th.cool <= 0) {
      Th.mode = 'circle'; Th.t = 0; Th.yaw0 = aimYaw; Th.prevAng = null; Th.turns = new Map(); Th.power = 0;
      c.face = 0.3; c.faceYaw = aimYaw;
      c.events.push({ type: 'circle', at: [...body.p] });
    }
    if (hands.guardPressed && R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
  } else if (able && c.weapon === 'bow') {
    // ---- the bow: pressed, it is drawn; let go, it looses (a tap, a plain arrow; held, a harder one); the whirl's key, a volley
    if (hands.attackPressed && W.mode === 'held' && W.cool <= 0) { W.mode = 'drawing'; W.held = 0; W.draw = 0; c.events.push({ type: 'nock', at: [...hand] }); }
    if (W.mode === 'drawing') {
      W.held += dt;
      if (W.held > BOW.tap) W.draw = Math.min(1, (W.held - BOW.tap) / BOW.draw);
      c.face = Math.max(c.face, 0.1); c.faceYaw = aimYaw;
      // drawn in the air, the binding holds the body up: it comes down slowly
      if (!body.grounded && !body.flying && !body.climbing && body.v[1] < BOW.hover) { body.v[1] = BOW.hover; body.rising = false; }
      if (!hands.attack) { loose(c, hand, aim, W.held > BOW.tap ? W.draw : 0); W.mode = 'held'; W.held = 0; W.draw = 0; W.cool = BOW.cool; }
    }
    if (hands.sweep && W.mode === 'held' && W.cool <= 0) { volley(c, hand, aim); W.cool = BOW.volley.cool; }
    if (hands.guardPressed && R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
  } else if (able) {
    // pressed while the ring is away, the attack calls it home (if it is still going out) and waits for it, a second at most
    if (hands.attackPressed && R.mode !== 'held' && R.mode !== 'charging' && R.mode !== 'slam') {
      if (R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
      c.queue = { t: 1, let: false };
    }
    if (c.queue) {
      c.queue.t -= dt; if (!hands.attack) c.queue.let = true;
      if (R.mode === 'held') { hands = { ...hands, attackPressed: true, attack: !c.queue.let }; c.queue = null; }
      else if (c.queue.t <= 0) c.queue = null;
    }
    if (hands.attackPressed && (R.mode === 'held')) {
      if (airborne) {
        R.mode = 'slam'; body.v[1] = Math.min(body.v[1], -RING.slam.fall); body.rising = false;
        if (body.wallrun) { body.lastWall = body.wallrun.n; body.wallrun = null; }      // off the wall it was running along
        c.events.push({ type: 'dive', at: [...body.p] });
      } else { R.mode = 'charging'; R.held = 0; R.charge = 0; }
    }
    if (R.mode === 'charging') {
      R.held += dt;
      if (R.held > RING.tap) R.charge = Math.min(1, (R.held - RING.tap) / RING.charge);
      c.face = Math.max(c.face, 0.1); c.faceYaw = aimYaw;
      if (!hands.attack) cast(c, hand, aim, R.held > RING.tap ? R.charge : 0);
    }
    if (hands.sweep && (R.mode === 'held' || R.mode === 'charging')) {
      R.mode = 'whirl'; R.t = 0; R.struck = new Set(); R.charge = 0; R.yaw0 = aimYaw;
      c.face = 0.3; c.faceYaw = aimYaw;
      c.events.push({ type: 'whirl', at: [...body.p] });
    }
    if (hands.guardPressed && R.mode === 'out') { R.mode = 'back'; c.events.push({ type: 'recall', at: [...R.p] }); }
  } else if (R.mode === 'charging' || R.mode === 'whirl' || R.mode === 'slam') R.mode = 'held';
  if (!able || c.weapon !== 'bow') { W.mode = 'held'; W.held = 0; W.draw = 0; }
  if (!able || c.weapon !== 'bell') { Bl.mode = 'held'; Bl.held = 0; Bl.power = 0; Bl.peal = 0; }
  if ((!able || c.weapon !== 'thread') && (Th.mode !== 'held' || Th.snare != null)) letThreadGo(c);
  // a peal: its rings one after another
  if (Bl.peal > 0) { Bl.pealT -= dt; if (Bl.pealT <= 0) { ring(c, [body.p[0], body.p[1] + 1.1, body.p[2]], BELL.peal); Bl.peal--; Bl.pealT = BELL.peal.gap; } }
  // ---- the binding: pressed, it takes what the eye looks at; held, it holds it; let go, it throws it
  const Bn = c.bind;
  Bn.rest = Math.max(0, Bn.rest - dt); Bn.miss = Math.max(0, Bn.miss - dt);
  const holding = Bn.target != null ? c.bots.find((b) => b.id === Bn.target && b.mode === 'bound') : null;
  if (Bn.mode === 'hold' && !holding) { Bn.mode = 'idle'; Bn.target = null; }      // broken in its hold, or gone
  if (able && hands.bindPressed && Bn.mode === 'idle' && Bn.rest <= 0) {
    const t = bindAim(c, aim);
    if (t) {
      Bn.mode = 'hold'; Bn.target = t.id; Bn.t = 0; t.mode = 'bound'; t.burst = 0; t.dodgeT = 0; t.armed = false;
      c.events.push({ type: 'bind', at: [...t.p], id: t.id, level: t.level });
    } else if (Bn.miss <= 0) { Bn.miss = BINDING.miss; Bn.missDir = [...aim.dir]; c.events.push({ type: 'bind-miss', at: leftHandOf(body), dir: [...aim.dir] }); }
  }
  if (Bn.mode === 'hold') {
    Bn.t += dt;
    if (!able || !hands.bind) {
      const t = c.bots.find((b) => b.id === Bn.target && b.mode === 'bound');
      if (t) {
        // let go: thrown where the eye looks (only dropped, if the body is struck down)
        const { v, seek } = able ? flingVel(c, aim, t) : { v: [0, 0, 0], seek: null };
        t.mode = 'flung'; t.v = v; t.flyT = BINDING.flight; t.seek = seek;
        c.events.push({ type: 'fling', at: [...t.p], id: t.id, v: [...v] });
      }
      Bn.mode = 'idle'; Bn.target = null; Bn.rest = BINDING.rest;
    }
  }
  const guardUp = able && !!hands.guard && R.mode === 'held';
  if (guardUp && !c.guard.up) { c.guard.t = 0; c.events.push({ type: 'guard', at: [...hand] }); }
  c.guard.up = guardUp; c.guard.t += dt;
  if (guardUp || Bn.mode === 'hold') { c.face = Math.max(c.face, 0.1); c.faceYaw = aimYaw; }
  c.slow = guardUp || R.mode === 'charging' || W.mode === 'drawing' || Bl.mode === 'ringing' || Th.mode === 'spinning' || Bn.mode === 'hold';      // the body walks while it holds, draws or spins up

  // ---- in steps
  const n = Math.max(1, Math.ceil(dt / STEP - 1e-9)), h = dt / n;
  for (let i = 0; i < n; i++) step(c, h, body, aim, aimYaw, world, creative);
  c.bots = c.bots.filter((b) => b.mode !== 'broken');
  return c;
}

// what a bot hovers over: the island's ground (or the sea's level over water), else the void's water
const floorUnder = (world, x, z) => (world?.ground ? Math.max(0, world.ground.height(x, z)) : 0);

function step(c, h, body, aim, aimYaw, world, creative) {
  const R = c.ring, P = c.player, hand = handOf(body);
  R.spin += h * (R.mode === 'held' ? 5 : R.mode === 'charging' ? 6 + 34 * R.charge : 30);
  // ---- the ring
  if (R.mode === 'held' || R.mode === 'charging') R.p = c.guard.up ? guardAt(body, aimYaw) : hand;
  else if (R.mode === 'out' || R.mode === 'back') {
    const was = [...R.p];
    if (R.mode === 'out') {
      if (R.target && R.target.mode !== 'broken') {
        // it bends after the bot it went for, as hard as RING.turn allows
        const want = unit(sub(R.target.p, R.p)), cosA = Math.max(-1, Math.min(1, dot(want, R.dir))), a = Math.acos(cosA), m = RING.turn * h;
        if (a > 1e-6) { const k = Math.min(1, m / a); R.dir = unit([R.dir[0] + (want[0] - R.dir[0]) * k, R.dir[1] + (want[1] - R.dir[1]) * k, R.dir[2] + (want[2] - R.dir[2]) * k]); }
      }
      const d = R.speed * h;
      R.p = [R.p[0] + R.dir[0] * d, R.p[1] + R.dir[1] * d, R.p[2] + R.dir[2] * d]; R.went += d;
      if (R.p[1] < WATER + 0.06) { R.p[1] = WATER + 0.06; R.mode = 'back'; c.events.push({ type: 'splash', at: [R.p[0], WATER, R.p[2]], size: 0.35 }); }
      else if (world?.solid?.(R.p)) { R.p = was; R.mode = 'back'; c.events.push({ type: 'spark', at: [...was] }); }
      else if (R.went >= R.reach) R.mode = 'back';
    } else {
      const to = sub(hand, R.p), d = len(to), s = RING.back * h;
      if (d <= Math.max(0.6, s)) { R.mode = 'held'; R.p = hand; c.events.push({ type: 'catch', at: [...hand] }); }
      else R.p = [R.p[0] + (to[0] / d) * s, R.p[1] + (to[1] / d) * s, R.p[2] + (to[2] / d) * s];
    }
    for (const b of c.bots) {
      if (b.mode === 'broken' || b.mode === 'rise' || R.struck.has(b.id)) continue;
      if (segPoint(was, R.p, b.p) < b.r + RING.r) { R.struck.add(b.id); hit(c, b, R.damage, was, R.power > 0.5 ? 'charged' : 'cast', 5 + 6 * (R.power || 0)); }
    }
  } else if (R.mode === 'whirl') {
    R.t += h;
    const u = Math.min(1, R.t / RING.whirl.time), a = R.yaw0 + Math.PI * 4 * u, rr = 1.6;
    R.p = [body.p[0] + Math.sin(a) * rr, body.p[1] + 1.05, body.p[2] + Math.cos(a) * rr];
    for (const b of c.bots) {
      if (b.mode === 'broken' || b.mode === 'rise' || R.struck.has(b.id)) continue;
      if (Math.hypot(b.p[0] - body.p[0], b.p[2] - body.p[2]) < RING.whirl.radius + b.r && Math.abs(b.p[1] - (body.p[1] + 1)) < 2.2) {
        R.struck.add(b.id); hit(c, b, RING.whirl.damage, body.p, 'whirl', RING.whirl.knock);
      }
    }
    if (u >= 1) { R.mode = 'held'; R.p = hand; }
  } else if (R.mode === 'slam') {
    R.p = [body.p[0], body.p[1] + 0.25, body.p[2]];
    body.v[1] = Math.min(body.v[1], -RING.slam.fall); body.rising = false;
    if (body.grounded || body.flying || body.climbing) {
      const at = [body.p[0], body.p[1], body.p[2]];
      c.events.push({ type: 'slam', at, radius: RING.slam.radius });
      for (const b of c.bots) {
        if (b.mode === 'broken') continue;
        const d = Math.hypot(b.p[0] - at[0], b.p[2] - at[2]);
        if (d < RING.slam.radius + b.r && b.p[1] - at[1] < 4) hit(c, b, Math.round(RING.slam.damage * (1 - 0.6 * Math.min(1, d / RING.slam.radius))), at, 'slam', RING.slam.knock);
      }
      R.mode = 'held'; R.p = hand;
    }
  }

  // ---- the bots
  const target = chest(body), live = c.bots.filter((b) => b.mode !== 'broken');
  for (const b of live) {
    const L = b.L;
    b.t += h; b.hitT = Math.max(0, b.hitT - h); b.stunT = Math.max(0, (b.stunT || 0) - h);
    if (b.mode === 'rise') {
      const u = Math.min(1, b.t / RISE);
      const g0 = floorUnder(world, b.p[0], b.p[2]);
      b.p[1] = g0 - 0.8 + (b.alt + 0.8) * (1 - (1 - u) * (1 - u));
      if (u >= 1) b.mode = 'fight';
      continue;
    }
    if (b.mode === 'bound') {
      // held by the binding: drawn in, then held where the eye looks; it neither moves of itself nor shoots
      const at = holdAt(body, aim, floorUnder(world, b.p[0], b.p[2]), b.r), to = sub(at, b.p), d = len(to);
      const s = Math.min(d, Math.max(BINDING.pull * h * Math.min(1, d / 2), d * (1 - Math.exp(-10 * h))));
      const next = d > 1e-6 ? [b.p[0] + (to[0] / d) * s, b.p[1] + (to[1] / d) * s, b.p[2] + (to[2] / d) * s] : b.p;
      if (!world?.solid?.(next)) b.p = next;
      b.v = [0, 0, 0];
      continue;
    }
    if (b.mode === 'flung' || b.mode === 'tumble') {
      const was = [...b.p];
      b.v[1] -= BINDING.fall * h; b.flyT -= h;
      const sought = b.mode === 'flung' && b.seek != null ? live.find((o) => o.id === b.seek && o.mode !== 'broken') : null;
      if (sought) {
        // thrown at another, it bends after it as hard as BINDING.turn allows, at the speed it has
        const sp = len(b.v), cur = unit(b.v), want = unit(sub(sought.p, b.p)), a = Math.acos(Math.max(-1, Math.min(1, dot(cur, want)))), k = a > 1e-6 ? Math.min(1, (BINDING.turn * h) / a) : 0;
        const nd = unit([cur[0] + (want[0] - cur[0]) * k, cur[1] + (want[1] - cur[1]) * k, cur[2] + (want[2] - cur[2]) * k]);
        b.v = [nd[0] * sp, nd[1] * sp, nd[2] * sp];
      }
      b.p = [b.p[0] + b.v[0] * h, b.p[1] + b.v[1] * h, b.p[2] + b.v[2] * h];
      const speed = len(b.v);
      if (b.mode === 'flung') {
        // flung into another: the two are joined, each struck as hard as it came, and tumble together
        const o = live.find((o) => o !== b && o.mode !== 'broken' && o.mode !== 'rise' && o.mode !== 'tumble' && segPoint(was, b.p, o.p) < b.r + o.r);
        if (o) {
          const dmg = Math.round(BINDING.strike * speed), v = [(b.v[0] + o.v[0]) * 0.35, Math.max(1.5, (b.v[1] + o.v[1]) * 0.35), (b.v[2] + o.v[2]) * 0.35];
          c.bind.joined++;
          c.events.push({ type: 'join', at: [(b.p[0] + o.p[0]) / 2, (b.p[1] + o.p[1]) / 2, (b.p[2] + o.p[2]) / 2], ids: [b.id, o.id], damage: dmg });
          for (const x of [b, o]) {
            if (c.bind.target === x.id) { c.bind.mode = 'idle'; c.bind.target = null; }
            hit(c, x, dmg, x === b ? was : b.p, 'join', 0);
            if (x.mode !== 'broken') { x.mode = 'tumble'; x.v = [...v]; x.flyT = BINDING.tumble; }
          }
          continue;
        }
      }
      const fl = floorUnder(world, b.p[0], b.p[2]);
      if (b.p[1] - b.r < fl || world?.solid?.(b.p)) {
        // into the water, the ground or a wall: struck too, less; and it rights itself
        const wet = b.p[1] - b.r < fl;
        if (wet) b.p[1] = fl + b.r; else b.p = was;
        hit(c, b, Math.round(BINDING.strike * speed * BINDING.plunge), wet ? [b.p[0], fl - 1, b.p[2]] : b.p, 'plunge', 0);
        c.events.push(wet ? { type: 'splash', at: [b.p[0], fl, b.p[2]], size: 0.25 + speed * 0.01 } : { type: 'spark', at: [...b.p] });
        if (b.mode !== 'broken') { b.mode = 'fight'; b.v = [b.v[0] * 0.2, 2, b.v[2] * 0.2]; b.fire = Math.max(b.fire, 1); b.seek = null; }
      } else if (b.flyT <= 0) { b.mode = 'fight'; b.seek = null; }
      continue;
    }
    const to = [target[0] - b.p[0], 0, target[2] - b.p[2]], dist = Math.hypot(to[0], to[2]) || 1e-6, dh = [to[0] / dist, 0, to[2] / dist];
    const tan = [-dh[2] * b.strafe, 0, dh[0] * b.strafe];
    b.strafeT -= h; if (b.strafeT <= 0) { b.strafe = -b.strafe; b.strafeT = 1.6 + c.rand() * 2.6; }
    let want = [0, 0, 0];
    const k = P.down > 0 ? 0.3 : 1;
    if (dist > L.range[1]) want = [dh[0] * L.speed, 0, dh[2] * L.speed];
    else if (dist < L.range[0]) want = [-dh[0] * L.speed, 0, -dh[2] * L.speed];
    want[0] += tan[0] * L.speed * 0.7 * k; want[2] += tan[2] * L.speed * 0.7 * k;
    for (const o of live) {           // they keep apart
      if (o === b) continue;
      const dx = b.p[0] - o.p[0], dz = b.p[2] - o.p[2], dd = Math.hypot(dx, dz);
      if (dd < 2.6 && dd > 1e-6) { want[0] += (dx / dd) * 3 * (2.6 - dd); want[2] += (dz / dd) * 3 * (2.6 - dd); }
    }
    const gy = floorUnder(world, b.p[0], b.p[2]);
    want[1] = (gy + b.alt + 0.25 * Math.sin(1.3 * b.t + b.phase) - b.p[1]) * 3;
    // a cast coming at it: one that was going to slip it does, sideways
    if (b.armed && R.mode === 'out' && b.dodgeT <= 0) {
      const rel = sub(b.p, R.p), ahead = dot(rel, R.dir), off = segPoint(R.p, [R.p[0] + R.dir[0] * 8, R.p[1] + R.dir[1] * 8, R.p[2] + R.dir[2] * 8], b.p);
      if (ahead > 0 && ahead < 7.5 && off < 1.6) {
        let side = [-R.dir[2], 0, R.dir[0]]; const sm = Math.hypot(side[0], side[2]) || 1; side = [side[0] / sm, 0, side[2] / sm];
        if (dot(side, rel) < 0) side = [-side[0], 0, -side[2]];
        b.dodgeT = 0.28; b.dodgeDir = side; b.armed = false;
        c.events.push({ type: 'dodge', at: [...b.p], id: b.id });
      }
    }
    if (b.dodgeT > 0) { b.dodgeT -= h; want = [b.dodgeDir[0] * 13, want[1], b.dodgeDir[2] * 13]; }
    if (b.stunT > 0) want = [0, want[1], 0];   // stunned by the toll: it only hovers
    const ease = 1 - Math.exp(-(b.dodgeT > 0 ? 18 : 4) * h);
    for (let j = 0; j < 3; j++) b.v[j] += (want[j] - b.v[j]) * ease;
    const next = [b.p[0] + b.v[0] * h, Math.max(floorUnder(world, b.p[0] + b.v[0] * h, b.p[2] + b.v[2] * h) + 0.6, b.p[1] + b.v[1] * h), b.p[2] + b.v[2] * h];
    if (world?.solid?.(next)) { b.v[0] *= -0.3; b.v[2] *= -0.3; } else b.p = next;
    // shooting: a burst every so often, each bolt at where the body will be when it gets there (as well as this level can)
    if (P.down > 0 || dist > L.range[1] + 10 || b.stunT > 0) continue;
    b.fire -= h;
    if (b.fire <= 0 && b.burst <= 0) { b.burst = L.burst; b.burstT = 0; b.fire = L.every * (0.8 + 0.4 * c.rand()); }
    if (b.burst > 0) {
      b.burstT -= h;
      if (b.burstT <= 0) {
        const eye = [b.p[0] + dh[0] * (b.r + 0.12), b.p[1], b.p[2] + dh[2] * (b.r + 0.12)], flight = len(sub(target, eye)) / L.bolt.speed;
        const at = [target[0] + body.v[0] * flight * L.lead, target[1] + body.v[1] * flight * L.lead * 0.5, target[2] + body.v[2] * flight * L.lead];
        let d = unit(sub(at, eye));
        d = unit([d[0] + (c.rand() - 0.5) * 2 * L.spread, d[1] + (c.rand() - 0.5) * 2 * L.spread, d[2] + (c.rand() - 0.5) * 2 * L.spread]);
        c.bolts.push({ p: eye, v: [d[0] * L.bolt.speed, d[1] * L.bolt.speed, d[2] * L.bolt.speed], owner: 'bot', from: b.id, level: b.level, damage: L.bolt.damage, life: BOLT_LIFE });
        c.events.push({ type: 'bolt', at: [...eye], level: b.level });
        b.burst--; b.burstT = 0.16;
      }
    }
  }

  // ---- the bell's tones: rings going out; each strikes once what hovers in its way as it passes (not behind a wall)
  for (const T of c.tones) {
    const was = T.r; T.r = Math.min(T.R, T.r + T.speed * h);
    for (const b of c.bots) {
      if (b.mode === 'broken' || b.mode === 'rise' || T.struck.has(b.id)) continue;
      const d = Math.hypot(b.p[0] - T.at[0], b.p[2] - T.at[2]);
      if (d < was - BELL.band - b.r || d > T.r + BELL.band + b.r || Math.abs(b.p[1] - T.at[1]) > BELL.height) continue;
      if (world?.solid && walled(world, T.at, b.p)) { T.struck.add(b.id); continue; }
      T.struck.add(b.id);
      hit(c, b, Math.round(T.damage * (1 - 0.35 * Math.min(1, d / T.R))), T.at, T.stun ? 'toll' : 'bell', T.knock);
      if (T.stun && b.mode !== 'broken') { b.stunT = T.stun; b.burst = 0; c.events.push({ type: 'stun', at: [...b.p], id: b.id }); }
    }
  }
  c.tones = c.tones.filter((T) => T.r < T.R);

  // ---- the thread: the lash going out and back, the circle overhead, the line drawing the body in, a snared bot
  const Th = c.thread;
  if (Th.mode === 'out') {
    const A = THREAD.lash;
    Th.t += h;
    const e = Th.t < A.out ? Th.t / A.out : Math.max(0, 1 - (Th.t - A.out) / A.back);
    const from = handOf(body), tip = [from[0] + Th.dir[0] * Th.reach * e, from[1] + Th.dir[1] * Th.reach * e, from[2] + Th.dir[2] * Th.reach * e];
    Th.tip = tip;
    // it strikes as it goes out, all along it, each bot once
    if (Th.damage > 0 && Th.t - h < A.out) {
      for (const b of c.bots) {
        if (b.mode === 'broken' || b.mode === 'rise' || Th.struck.has(b.id)) continue;
        if (segPoint(from, tip, b.p) > b.r + THREAD.width) continue;
        Th.struck.add(b.id);
        if (world?.solid && walled(world, from, b.p)) continue;
        hit(c, b, Th.damage, from, 'thread', Th.knock);
        if (Th.snaring && Th.snare == null && b.mode !== 'broken') {
          Th.snare = b.id; Th.snareT = THREAD.snare.time; Th.burnT = 0; b.stunT = THREAD.snare.time; b.burst = 0;
          c.events.push({ type: 'snare', at: [...b.p], id: b.id });
        }
      }
    }
    if (Th.t >= A.out + A.back) { Th.mode = 'held'; Th.cool = THREAD.cool; Th.tip = null; }
  } else if (Th.mode === 'circle') {
    const C = THREAD.circle;
    Th.t += h;
    const u = Math.min(1, Th.t / C.time), ang = Th.yaw0 + Math.PI * 2 * C.turns * u, r = lerp(C.r0, C.r1, u);
    const prev = Th.prevAng ?? Th.yaw0;
    Th.prevAng = ang;
    const top = [body.p[0], body.p[1] + 1.8, body.p[2]];
    for (const b of c.bots) {
      if (b.mode === 'broken' || b.mode === 'rise') continue;
      const dx = b.p[0] - body.p[0], dz = b.p[2] - body.p[2], d = Math.hypot(dx, dz);
      if (d > r + b.r + 0.4 || Math.abs(b.p[1] - top[1]) > C.height) continue;
      let k = (Math.atan2(dx, dz) - prev) % (Math.PI * 2); if (k < 0) k += Math.PI * 2;
      if (k > ang - prev) continue;                      // not swept past its bearing this step
      // which turn it is struck in: counted where the sweep crosses it, not where the step ends
      const turn = Math.min(C.turns - 1, Math.floor((prev + k - Th.yaw0) / (Math.PI * 2) + 1e-9));
      if ((Th.turns.get(b.id) ?? -1) >= turn) continue;  // once a turn
      Th.turns.set(b.id, turn);
      if (world?.solid && walled(world, top, b.p)) continue;
      hit(c, b, C.damage, top, 'thread', C.knock);
    }
    Th.tip = [body.p[0] + Math.sin(ang) * r, body.p[1] + 2.1, body.p[2] + Math.cos(ang) * r];
    if (Th.t >= C.time) { Th.mode = 'held'; Th.cool = C.cool; Th.tip = null; Th.prevAng = null; }
  } else if (Th.mode === 'line') {
    const L = THREAD.line;
    Th.t += h;
    const to = sub(Th.anchor, [body.p[0], body.p[1] + 1.0, body.p[2]]), d = len(to);
    if (d < L.near || Th.t > L.time || body.grounded || body.flying || body.climbing) {
      Th.mode = 'held'; Th.anchor = null; Th.cool = L.cool; c.events.push({ type: 'line-off', at: [...body.p] });
    } else { const v = unit(to); body.v = [v[0] * L.speed, v[1] * L.speed, v[2] * L.speed]; body.rising = false; }
  }
  // a snared bot: held where the thread holds it, burned each quarter second, drawn in toward the body
  if (Th.snare != null) {
    const b = c.bots.find((x) => x.id === Th.snare), S = THREAD.snare;
    if (!b || b.mode === 'broken' || (Th.snareT -= h) <= 0) {
      if (b && b.mode !== 'broken') b.stunT = Math.min(b.stunT || 0, 0.3);
      c.events.push({ type: 'unsnare', id: Th.snare }); Th.snare = null;
    } else {
      b.stunT = Math.max(b.stunT || 0, h * 2); b.burst = 0;
      const dx = body.p[0] - b.p[0], dz = body.p[2] - b.p[2], d = Math.hypot(dx, dz);
      if (d > S.near) { const m = Math.min(S.pull * h, d - S.near) / d; b.p[0] += dx * m; b.p[2] += dz * m; }
      Th.burnT += h;
      if (Th.burnT >= S.every) { Th.burnT -= S.every; hit(c, b, Math.round(S.burn * S.every), body.p, 'thread', 0); }
    }
  }

  // ---- the bolts
  const top = [body.p[0], body.p[1] + 1.55, body.p[2]], foot = [body.p[0], body.p[1] + 0.3, body.p[2]];
  const keep = [];
  for (const x of c.bolts) {
    const was = [...x.p];
    if (x.fall) x.v[1] -= x.fall * h;   // an arrow falls a little as it flies
    x.p = [x.p[0] + x.v[0] * h, x.p[1] + x.v[1] * h, x.p[2] + x.v[2] * h]; x.life -= h;
    let gone = false;
    if (x.owner === 'bot' && segSeg(was, x.p, foot, top) < PLAYER.r + 0.08 && P.down <= 0) {
      const g = c.guard, toward = unit([-x.v[0], 0, -x.v[2]]), facing = [Math.sin(aimYaw), 0, Math.cos(aimYaw)];
      if (g.up && dot(toward, facing) > Math.cos(RING.guard.arc)) {
        const sender = c.bots.find((b) => b.id === x.from && b.mode !== 'broken');
        if (g.t < RING.guard.parry && sender) {
          const d = unit(sub(sender.p, x.p)), s = len(x.v) * 1.4;
          x.v = [d[0] * s, d[1] * s, d[2] * s]; x.owner = 'player'; x.damage *= 3; x.life = BOLT_LIFE; x.target = sender.id;
          c.turned++; c.events.push({ type: 'parry', at: [...x.p] });
        } else {
          // turned aside: off the shield's face, upward and away
          const n = facing, vn = dot(x.v, n), s = len(x.v) * 0.7;
          const v = unit([x.v[0] - 2 * vn * n[0], Math.abs(x.v[1]) + 4, x.v[2] - 2 * vn * n[2]]);
          x.v = [v[0] * s, v[1] * s, v[2] * s]; x.owner = 'none'; x.life = 0.8;
          c.turned++; c.events.push({ type: 'deflect', at: [...x.p] });
        }
      } else {
        gone = true;
        c.events.push({ type: 'spark', at: [...x.p], level: x.level });
        if (!creative && P.mercy <= 0) {
          P.hp -= x.damage; P.hurt = 0;
          c.events.push({ type: 'hurt', damage: x.damage, from: [...was] });
          if (P.hp <= 0) { P.hp = 0; P.down = PLAYER.down; R.mode = R.mode === 'out' ? 'back' : 'held'; c.events.push({ type: 'down', at: [...body.p] }); }
        }
      }
    } else if (x.owner === 'player') {
      if (x.target) { const t = c.bots.find((b) => b.id === x.target && b.mode !== 'broken'); if (t) { const s = len(x.v), d = unit(sub(t.p, x.p)); x.v = [d[0] * s, d[1] * s, d[2] * s]; } }
      for (const b of c.bots) {
        if (b.mode === 'broken' || b.mode === 'rise' || x.struck?.includes(b.id)) continue;
        if (segPoint(was, x.p, b.p) < b.r + 0.1) {
          hit(c, b, x.damage, was, x.kind === 'arrow' ? (x.power >= 0.75 ? 'drawn' : 'arrow') : 'parry', x.kind === 'arrow' ? 3 + 5 * (x.power || 0) : 6);
          // a drawn arrow goes on through, to the next, as many as it pierces
          if (x.struck) { x.struck.push(b.id); x.pierce--; if (x.pierce > 0) continue; }
          gone = true; break;
        }
      }
    }
    if (!gone && x.p[1] < WATER) { gone = true; c.events.push({ type: 'splash', at: [x.p[0], WATER, x.p[2]], size: 0.12 }); }
    if (!gone && world?.solid?.(x.p)) { gone = true; c.events.push({ type: 'spark', at: [...was] }); }
    if (!gone && x.life > 0) keep.push(x);
  }
  c.bolts = keep;
}

// the shield's place: in front of the body, at the chest, facing where the eye looks
export function guardAt(body, yaw) { return [body.p[0] + Math.sin(yaw) * 0.75, body.p[1] + 1.15, body.p[2] + Math.cos(yaw) * 0.75]; }

// the origin moved by (dx, dz) under the body (rings.js, rebase): the same places in new numbers
export function shiftCombat(c, dx, dz) {
  const m = (p) => { p[0] -= dx; p[2] -= dz; };
  m(c.ring.p); for (const b of c.bots) m(b.p); for (const x of c.bolts) m(x.p); for (const T of c.tones) m(T.at);
  if (c.thread.anchor) m(c.thread.anchor); if (c.thread.tip) m(c.thread.tip);
}
