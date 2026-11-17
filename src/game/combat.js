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
// THE BOTS: machines that hover over the water and shoot bolts of plasma, at
// five levels (LEVELS): how much they take, how fast they move, how often and
// how well they shoot (bursts, leading a moving body), whether they slip a
// cast. Never a presence's people: things.
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
  if (able) {
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
  const guardUp = able && !!hands.guard && R.mode === 'held';
  if (guardUp && !c.guard.up) { c.guard.t = 0; c.events.push({ type: 'guard', at: [...hand] }); }
  c.guard.up = guardUp; c.guard.t += dt;
  if (guardUp) { c.face = Math.max(c.face, 0.1); c.faceYaw = aimYaw; }
  c.slow = guardUp || R.mode === 'charging';

  // ---- in steps
  const n = Math.max(1, Math.ceil(dt / STEP - 1e-9)), h = dt / n;
  for (let i = 0; i < n; i++) step(c, h, body, aim, aimYaw, world, creative);
  c.bots = c.bots.filter((b) => b.mode !== 'broken');
  return c;
}

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
    b.t += h; b.hitT = Math.max(0, b.hitT - h);
    if (b.mode === 'rise') {
      const u = Math.min(1, b.t / RISE);
      b.p[1] = -0.8 + (b.alt + 0.8) * (1 - (1 - u) * (1 - u));
      if (u >= 1) b.mode = 'fight';
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
    want[1] = (b.alt + 0.25 * Math.sin(1.3 * b.t + b.phase) - b.p[1]) * 3;
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
    const ease = 1 - Math.exp(-(b.dodgeT > 0 ? 18 : 4) * h);
    for (let j = 0; j < 3; j++) b.v[j] += (want[j] - b.v[j]) * ease;
    const next = [b.p[0] + b.v[0] * h, Math.max(0.6, b.p[1] + b.v[1] * h), b.p[2] + b.v[2] * h];
    if (world?.solid?.(next)) { b.v[0] *= -0.3; b.v[2] *= -0.3; } else b.p = next;
    // shooting: a burst every so often, each bolt at where the body will be when it gets there (as well as this level can)
    if (P.down > 0 || dist > L.range[1] + 10) continue;
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

  // ---- the bolts
  const top = [body.p[0], body.p[1] + 1.55, body.p[2]], foot = [body.p[0], body.p[1] + 0.3, body.p[2]];
  const keep = [];
  for (const x of c.bolts) {
    const was = [...x.p];
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
        if (b.mode === 'broken' || b.mode === 'rise') continue;
        if (segPoint(was, x.p, b.p) < b.r + 0.1) { hit(c, b, x.damage, was, 'parry', 6); gone = true; break; }
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
  m(c.ring.p); for (const b of c.bots) m(b.p); for (const x of c.bolts) m(x.p);
}
