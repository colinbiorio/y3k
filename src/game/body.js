// body.js — HOW A BODY MOVES IN THE WORLD. Pure numbers: no page, no three.
//
// Colin, 13 Nov 2026 (GAME.md): "characters should be able to fly, but only in
// 'creative' mode, in 'survival', there should just be tap to jump or hold to
// jump higher -- allowing the character to defy gravity by 2x, but still be
// affected. there should be omnidirectional dash options."
//
//   · A TAP is a real jump under the real gravity (9.81 m/s²): 1.5 m.
//   · HELD while rising, the pull is halved, so held all the way up the same
//     push reaches exactly twice the height (v²/2g with g halved). Let go and
//     the whole pull is back at once; it cannot be taken up again in that jump.
//   · A DASH goes any way the stick or keys point (no direction: the way the
//     body faces), on the ground or once in the air; flying, it goes up and
//     down as well. For its quarter second the fall waits.
//   · FLIGHT is creative's alone: its key, or a second jump in the air.
//
// The floor is y = 0, under one inch of still water (WATER), unless the world
// (world.js) has put something there: given s.world, a body is pushed out of
// its walls, stands on its floors and keeps its head under its ceilings, every
// step (s.world.solve answers the floor under it, and says when a ladder is
// in front of the body: s.climb). On a ladder, pushed toward it, the body
// climbs; pushed away, it climbs down; let alone, it hangs; a jump lets go;
// at the top it steps off onto what the ladder leans on.
//
// A WALL RUN (Colin, 17 Nov: "a third feature -- wall run"): in the air, going
// fast enough across the ground, high enough, along a wall rather than at it
// or away, the hands still pushing, the body takes to the wall (s.world.wall
// says where one is, and which way it faces) and runs along it at 7.4 m/s or
// more, the pull on it a fifth of the whole, for a second and a half at most.
// A jump leaps off it, out and up, the air's dash given back; letting go, the
// wall's end, the time, the ground or the sink key end it and it falls. The
// same wall again (one facing within 60 degrees of it) waits for the ground,
// another may be run at once, so a body can go from wall to wall. Everything moves
// in fixed steps of 1/120 s (advance), so the same hands give the same jump
// at any frame rate, and a jump's arc is integrated exactly (p += v·dt −
// ½g·dt²), not approximately.

export const WATER = 0.0254;            // one inch, in metres
export const G = 9.81;                  // m/s²
export const JUMP_APEX = 1.5;           // m, a tap
export const JUMP_V0 = Math.sqrt(2 * G * JUMP_APEX);
export const HOLD_GRAVITY = 0.5;        // held while rising: half the pull
export const WALK = 1.7, RUN = 5.6, SPRINT = 8.6;          // m/s
export const GROUND_ACCEL = 48, AIR_ACCEL = 14;            // m/s²
export const DASH_SPEED = 26, DASH_TIME = 0.24, DASH_COOLDOWN = 0.55;   // 6.24 m
export const AIR_DASHES = 1;            // one in the air, given back on landing
export const FLY = 14, FLY_SPRINT = 48, FLY_ACCEL = 60;
export const TURN = 14;                 // rad/s, the body coming round to its heading
export const STEP = 1 / 120;
export const CLIMB = 1.4;               // m/s up or down a ladder
export const SWIM = { speed: 2.2, sprint: 3.4, jump: 0.55 };   // in deep water (the island's sea): m/s, and a jump's share of a jump
export const WALL = {
  reach: 0.22,                          // m past the body's side: a wall this near may be run along
  speed: 3.4, height: 0.55,             // to take to one: m/s across the ground, and m over what it stands on, at least
  time: 1.5,                            // s on one wall, at most
  gravity: 0.2,                         // the share of the pull on a body running along a wall
  lift: 1.7,                            // m/s upward as it takes to the wall
  along: 7.4,                           // m/s along it, at least
  hold: 0.8,                            // m/s into it: it keeps to the wall's face
  off: [6.0, 6.4],                      // a jump off: m/s out from the wall, and up
  same: 0.5,                            // a wall facing within 60 degrees of the last one run is the same wall: the ground first
};
// LIGHTSPEED (Colin, 19 Nov 2026: "when holding spacebar, the speed should get exponentially faster until you reach
// the speed of light. obviously not really gonna work in our tiny simulated environment, but just give us a handy way
// to enter lightspeed travel for now -- like you can go as far as you want in any direction but once you release
// spacebar you'll just end up back at the island"). The jump held on past the top of a held jump (HOLD seconds from
// the press, still in the air: a held jump tops out at 1.1 s), or held FLY_HOLD while flying, gathers the light (GATHER seconds: let go then and nothing comes of it, the body only
// hung a moment). Then the body goes the way the eye looks, steered by it (TURN), its speed doubling every 0.31 s from
// V0 until, RISE seconds in, it is the speed of light. Let go, and it is brought home: back along a line to where it
// set out, in HOME seconds. The world is small, so the body itself goes no further than REACH from where it set out
// (lifted LIFT clear of the ground as it goes); the rest of the way is counted (s.light.dist) and drawn (light.js),
// not travelled. The eye's own rest, a little down, steers it level: its pitch counts only past DEAD either way.
// Under a roof (inside a building) the light does not gather: a held jump there is only a jump.
// On foot it no longer gathers at all (Colin, 19 Nov 2026: "for lightspeed travel i really only meant when you're in a
// ship -- and since spacebar moves the ship up, shift should be the speed button, not spacebar -- character flying
// spacebar means go up, shift means go faster"): a held jump only rises higher, and flying, a held jump only climbs.
export const LIGHT = { c: 299792458, v0: 40, rise: 7, gather: 0.4, hold: 1.25, flyHold: 0.8, reach: 2400, lift: 140, turn: 2.4, home: 1.7, dead: 0.15 };
const LIGHT_K = Math.log(LIGHT.c / LIGHT.v0) / LIGHT.rise;
// Flying, a second tap of the jump this soon after the first lets go of the air (Colin, 19 Nov: "double spacebar to
// drop down from flying would be nice"): the body falls from there.
export const TAP_TWICE = 0.32;
const COYOTE = 0.1, JUMP_BUFFER = 0.12; // a jump pressed just after the edge, or just before the ground
const STEP_UP = 0.35;                   // a step taken without a jump; a floor further down than this is fallen to
// the world's say in this step: the body pushed out of what is solid, and the floor under it (0: the water's floor)
const settle = (s) => (s.floorY = s.world ? s.world.solve(s) : 0);   // kept: what the body is over (combat.js: a slam needs height)

export function createBody(over = {}) {
  const s = {
    p: [0, 0, 0], v: [0, 0, 0], yaw: 0,
    mode: 'survival', grounded: true, flying: false, rising: false,
    dashT: 0, dashDir: [0, 0, 1], dashCool: 0, airDash: AIR_DASHES,
    coyote: COYOTE, buffer: 0, acc: 0, events: [],
    pending: { jumpPressed: false, dash: false, flyToggle: false }, climb: null, climbing: false, wallrun: null, lastWall: null,
    ...over,
  };
  if (!over.was) s.was = [s.p[0], s.p[1], s.p[2]];   // where it was a step ago (shown, below)
  return s;
}

// The way the hands point, in the world. The camera looks along −Z at yaw 0
// and yaw turns it left; `move` is [right, forward]. Flying, forward follows
// the camera's pitch and up/down are added, so the answer has a height.
export function wish(inp, flying = false) {
  const sy = Math.sin(inp.yaw || 0), cy = Math.cos(inp.yaw || 0);
  let mx = inp.move?.[0] || 0, mz = inp.move?.[1] || 0;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }
  if (!flying) return [cy * mx - sy * mz, 0, -sy * mx - cy * mz];
  const cp = Math.cos(inp.pitch || 0), sp = Math.sin(inp.pitch || 0);
  const lift = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
  const w = [cy * mx - sy * cp * mz, sp * mz + lift, -sy * mx - cy * cp * mz];
  const m3 = Math.hypot(w[0], w[1], w[2]);
  return m3 > 1 ? [w[0] / m3, w[1] / m3, w[2] / m3] : w;
}

const toward = (a, b, max) => (Math.abs(b - a) <= max ? b : a + Math.sign(b - a) * max);
const turnToward = (a, b, max) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= max ? b : a + Math.sign(d) * max;
};

// One fixed step. `inp`: { move:[right, forward], yaw, pitch, jump (held),
// jumpPressed, dash, flyToggle (the three edges), sprint, walk, up, down }.
export function stepBody(s, inp, dt = STEP) {
  const ev = s.events, creative = s.mode === 'creative';
  // the jump held: how long, and whether it is still the hold that began this jump
  s.heldT = inp.jump ? (s.heldT || 0) + dt : 0;
  if (!inp.jump) s.hold = false;
  if (s.light) { stepLight(s, inp, dt, ev); return s; }    // gathering, going or coming home, the body is the light's
  if (!creative && s.flying) s.flying = false;             // flight is creative's alone
  if (inp.flyToggle && creative) {
    s.flying = !s.flying;
    if (s.flying) { s.grounded = false; s.rising = false; }
    ev.push({ type: 'fly', on: s.flying });
  }
  if (inp.jumpPressed) s.buffer = JUMP_BUFFER;
  const w = wish(inp, s.flying);
  const wm = Math.hypot(w[0], w[1], w[2]);

  // ---- the dash
  if (s.dashCool > 0) s.dashCool -= dt;
  if (inp.dash && s.dashT <= 0 && s.dashCool <= 0 && (s.grounded || s.flying || s.airDash > 0)) {
    const d = wm > 0.2 ? [w[0] / wm, w[1] / wm, w[2] / wm] : [Math.sin(s.yaw), 0, Math.cos(s.yaw)];
    s.dashDir = d; s.dashT = DASH_TIME; s.dashCool = DASH_COOLDOWN; s.rising = false; s.climbing = false;
    if (s.wallrun) { s.lastWall = s.wallrun.n; s.wallrun = null; ev.push({ type: 'wallrun', on: false }); }
    if (!s.grounded && !s.flying) s.airDash--;
    ev.push({ type: 'dash', from: [s.p[0], s.p[1], s.p[2]], dir: d, air: !s.grounded });
  }
  if (s.dashT > 0) {
    const t = Math.min(dt, s.dashT), d = s.dashDir;
    s.p[0] += d[0] * DASH_SPEED * t; s.p[1] += d[1] * DASH_SPEED * t; s.p[2] += d[2] * DASH_SPEED * t;
    const f = settle(s);
    if (s.p[1] < f) s.p[1] = f;
    s.dashT -= dt;
    if (d[0] || d[2]) s.yaw = Math.atan2(d[0], d[2]);
    if (s.dashT <= 0) {
      // it ends at a sprint, not at a stop, and the fall begins again from rest
      const keep = s.flying ? FLY_SPRINT * 0.5 : SPRINT;
      s.v[0] = d[0] * keep; s.v[1] = s.flying ? d[1] * keep : 0; s.v[2] = d[2] * keep;
      if (s.p[1] <= f && !s.flying) { s.grounded = true; s.airDash = AIR_DASHES; }
    }
    return s;
  }

  // ---- flying (creative): a second tap soon after the first lets go of the air; held, the jump climbs (and sprint is faster)
  if (s.flying) {
    if (s.tapT > 0) s.tapT -= dt;
    if (inp.jumpPressed) {
      if (s.tapT > 0) { s.flying = false; s.tapT = 0; s.buffer = 0; s.rising = false; s.grounded = false; s.coyote = 0; ev.push({ type: 'fly', on: false, tapped: true }); }
      else s.tapT = TAP_TWICE;
    }
  }
  if (s.flying) {
    const top = inp.sprint ? FLY_SPRINT : FLY, a = FLY_ACCEL * dt;
    s.v[0] = toward(s.v[0], w[0] * top, a); s.v[1] = toward(s.v[1], w[1] * top, a); s.v[2] = toward(s.v[2], w[2] * top, a);
    s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
    const f = settle(s);
    if (s.p[1] <= f) {
      s.p[1] = f; if (s.v[1] < 0) s.v[1] = 0;
      if (inp.down) { s.flying = false; s.grounded = true; s.airDash = AIR_DASHES; ev.push({ type: 'land', speed: 0 }); }
    }
    if (Math.hypot(s.v[0], s.v[2]) > 0.5) s.yaw = turnToward(s.yaw, Math.atan2(s.v[0], s.v[2]), TURN * dt);
    return s;
  }

  // ---- a ladder
  const L = s.climb;
  if (L) {
    const into = w[0] * L.dir[0] + w[2] * L.dir[1], atTop = s.p[1] >= L.top - 0.05;
    if (!s.climbing && ((into > 0.35 && !atTop) || (into < -0.35 && atTop && s.grounded))) { s.climbing = true; ev.push({ type: 'climb', on: true }); }
    if (s.climbing && inp.jumpPressed) {
      // let go: a little hop back from it
      s.climbing = false; s.grounded = false; s.rising = false; s.buffer = 0;
      s.v[0] = -L.dir[0] * 2.2; s.v[2] = -L.dir[1] * 2.2; s.v[1] = 2.0;
      ev.push({ type: 'climb', on: false });
    } else if (s.climbing) {
      const up = into > 0.35 ? 1 : into < -0.35 ? -1 : 0;
      // near the top the body goes over the ladder's head as it climbs (and back over its face coming down from there)
      const near = Math.max(0, Math.min(1, (s.p[1] - (L.top - 0.4)) / 0.4)), over = up * CLIMB * near;
      s.v[0] = L.dir[0] * (over + 0.4); s.v[2] = L.dir[1] * (over + 0.4); s.v[1] = up * CLIMB;     // the 0.4: held to it
      s.p[0] += s.v[0] * dt; s.p[2] += s.v[2] * dt; s.p[1] += s.v[1] * dt;
      s.grounded = false; s.rising = false; s.airDash = AIR_DASHES; s.buffer = 0; s.coyote = 0;
      s.yaw = turnToward(s.yaw, Math.atan2(L.dir[0], L.dir[1]), TURN * dt);
      const f = settle(s);
      if (s.p[1] >= L.top) { s.p[1] = L.top; s.climbing = false; s.grounded = true; s.v[1] = 0; ev.push({ type: 'climb', on: false }); }
      else if (up < 0 && s.p[1] <= f) { s.p[1] = f; s.climbing = false; s.grounded = true; s.v[1] = 0; ev.push({ type: 'climb', on: false }); }
      else if (!s.climb) { s.climbing = false; ev.push({ type: 'climb', on: false }); }                  // off its side: it falls
      return s;
    }
  } else if (s.climbing) s.climbing = false;

  // ---- a wall run
  if ((s.wallrun || !s.grounded) && s.world?.wall && wallRun(s, inp, w, wm, dt, ev)) return s;

  // ---- on foot (or swimming: slower, and a jump is a kick up out of the water)
  const top = s.swim ? (inp.sprint ? SWIM.sprint : SWIM.speed) : inp.walk ? WALK : inp.sprint ? SPRINT : RUN, a = (s.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
  s.v[0] = toward(s.v[0], w[0] * top, a); s.v[2] = toward(s.v[2], w[2] * top, a);
  if (s.grounded) s.coyote = COYOTE; else if (s.coyote > 0) s.coyote -= dt;
  if (s.buffer > 0) {
    s.buffer -= dt;
    if (s.coyote > 0) {
      s.v[1] = JUMP_V0 * (s.swim ? SWIM.jump : 1); s.grounded = false; s.rising = !s.swim; s.coyote = 0; s.buffer = 0;
      s.hold = !!inp.jump && !s.swim;
      ev.push({ type: 'jump', at: [s.p[0], s.p[1], s.p[2]] });
    } else if (creative && inp.jumpPressed) {
      // a second jump in the air: creative takes off (the tap that did it is not the first of a double tap)
      s.flying = true; s.rising = false; s.buffer = 0; s.v[1] = Math.max(s.v[1], 0); s.tapT = 0; s.hold = false;
      ev.push({ type: 'fly', on: true });
      return s;
    }
  }
  if (!s.grounded) {
    if (s.rising && (!inp.jump || s.v[1] <= 0)) s.rising = false;
    const g = G * (s.rising ? HOLD_GRAVITY : 1);
    s.p[1] += s.v[1] * dt - 0.5 * g * dt * dt;
    s.v[1] -= g * dt;
  }
  s.p[0] += s.v[0] * dt; s.p[2] += s.v[2] * dt;
  const f = settle(s);
  if (!s.grounded && s.p[1] <= f && s.v[1] <= 0) {
    ev.push({ type: 'land', speed: -s.v[1], at: [s.p[0], f, s.p[2]] });
    s.p[1] = f; s.v[1] = 0; s.grounded = true; s.rising = false; s.airDash = AIR_DASHES; s.lastWall = null; s.hold = false;
  } else if (s.grounded) {
    // walking: up a step or down one; further down than a step, it falls
    if (s.p[1] - f <= STEP_UP) s.p[1] = f;
    else { s.grounded = false; s.coyote = COYOTE; }
  }
  if (Math.hypot(s.v[0], s.v[2]) > 0.3 && wm > 0.05) s.yaw = turnToward(s.yaw, Math.atan2(w[0], w[2]), TURN * dt);
  return s;
}

// One step of a wall run, or of taking to a wall. Answers whether the step was the wall's (else the body goes on as
// it was, in the air).
function wallRun(s, inp, w, wm, dt, ev) {
  const near = s.world.wall(s.p);                     // { n: [x, z] out of the wall toward the body, d } or null
  if (!s.wallrun) {
    if (!near || inp.down || s.climbing || wm < 0.3) return false;
    const hv = Math.hypot(s.v[0], s.v[2]);
    if (hv < WALL.speed || s.p[1] - (s.floorY ?? 0) < WALL.height) return false;
    const into = (s.v[0] * near.n[0] + s.v[2] * near.n[1]) / hv;     // −1 straight at it, +1 straight away from it
    if (into > 0.15 || into < -0.92) return false;
    if (s.lastWall && s.lastWall[0] * near.n[0] + s.lastWall[1] * near.n[1] > WALL.same) return false;
    const t = [-near.n[1], near.n[0]];
    s.wallrun = { n: near.n, t: 0, dir: Math.sign(s.v[0] * t[0] + s.v[2] * t[1]) || 1 };
    s.v[1] = Math.min(WALL.lift, Math.max(s.v[1], 0.6 * WALL.lift)); s.rising = false; s.airDash = AIR_DASHES;   // a jump's rise is not carried up the wall
    ev.push({ type: 'wallrun', on: true, n: [...near.n], at: [s.p[0], s.p[1], s.p[2]] });
  }
  const W = s.wallrun, t = [-W.n[1] * W.dir, W.n[0] * W.dir];
  if (inp.jumpPressed) {
    // a leap off it: on along it, out from it and up (held, the jump rises further, as any jump does)
    const keep = 0.85 * Math.max(WALL.along, s.v[0] * t[0] + s.v[2] * t[1]);
    s.v[0] = t[0] * keep + W.n[0] * WALL.off[0]; s.v[2] = t[1] * keep + W.n[1] * WALL.off[0]; s.v[1] = WALL.off[1];
    s.lastWall = W.n; s.wallrun = null; s.rising = true; s.buffer = 0; s.coyote = 0; s.airDash = AIR_DASHES;
    s.yaw = Math.atan2(s.v[0], s.v[2]);
    ev.push({ type: 'walljump', at: [s.p[0], s.p[1], s.p[2]] });
    return false;
  }
  const holding = wm > 0.2 && w[0] * W.n[0] + w[2] * W.n[1] < 0.5;     // the hands not pulling away from it
  if (!near || W.t >= WALL.time || inp.down || !holding || near.n[0] * W.n[0] + near.n[1] * W.n[1] < 0.7) {
    s.lastWall = W.n; s.wallrun = null;
    ev.push({ type: 'wallrun', on: false });
    return false;
  }
  W.t += dt; W.n = near.n;
  const sp = Math.max(WALL.along, s.v[0] * t[0] + s.v[2] * t[1]), g = G * WALL.gravity;
  s.v[0] = t[0] * sp - W.n[0] * WALL.hold; s.v[2] = t[1] * sp - W.n[1] * WALL.hold;
  s.p[1] += s.v[1] * dt - 0.5 * g * dt * dt; s.v[1] -= g * dt;
  s.p[0] += s.v[0] * dt; s.p[2] += s.v[2] * dt;
  const f = settle(s);
  if (s.p[1] <= f && s.v[1] <= 0) {
    ev.push({ type: 'land', speed: -s.v[1], at: [s.p[0], f, s.p[2]] });
    s.p[1] = f; s.v[1] = 0; s.grounded = true; s.rising = false; s.airDash = AIR_DASHES; s.lastWall = null; s.wallrun = null;
    ev.push({ type: 'wallrun', on: false });
  }
  s.yaw = turnToward(s.yaw, Math.atan2(t[0], t[1]), TURN * dt);
  return true;
}

// A frame of any length, in fixed steps. What was pressed this frame (the
// edges) is heard by the first step only, so a press is one press.
export function advance(s, inp, dt) {
  s.acc += Math.min(dt, 0.25);          // a stalled tab does not come back as one long fall
  // a press that arrives on a frame too short to hold a step waits for the next step
  const q = s.pending;
  q.jumpPressed = q.jumpPressed || !!inp.jumpPressed; q.dash = q.dash || !!inp.dash; q.flyToggle = q.flyToggle || !!inp.flyToggle;
  while (s.acc >= STEP) {
    s.was[0] = s.p[0]; s.was[1] = s.p[1]; s.was[2] = s.p[2];
    stepBody(s, { ...inp, ...q }, STEP);
    q.jumpPressed = q.dash = q.flyToggle = false;
    s.acc -= STEP;
  }
  return s;
}

// Where to draw it. The body moves in steps of its own and a screen's frames
// fall between them, so what is drawn is the place part way from the last step
// to this one: at any frame rate the body glides and does not judder.
export function shown(s, out = [0, 0, 0]) {
  const a = Math.min(1, s.acc / STEP);
  for (let i = 0; i < 3; i++) out[i] = s.was[i] + (s.p[i] - s.was[i]) * a;
  return out;
}

// The origin moved by (dx, dz) under the body (rings.js, rebase): the same place, in new numbers (and the light's
// places with it: where it set out from, and where it was let go).
export function shift(s, dx, dz) {
  s.p[0] -= dx; s.p[2] -= dz; s.was[0] -= dx; s.was[2] -= dz;
  for (const q of [s.light?.from, s.light?.back]) if (q) { q[0] -= dx; q[2] -= dz; }
  return s;
}

// ---- lightspeed (LIGHT, above)
// the way the eye looks, as a direction (its pitch past DEAD either way)
function eyeWay(inp) {
  const p0 = inp.pitch || 0, pt = Math.sign(p0) * Math.max(0, Math.abs(p0) - LIGHT.dead), c = Math.cos(pt), y = inp.yaw || 0;
  return [-Math.sin(y) * c, Math.sin(pt), -Math.cos(y) * c];
}
// a way swung toward another by at most `max` radians
function swing(a, b, max) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), ang = Math.acos(d);
  if (ang <= max) return [b[0], b[1], b[2]];
  const k = max / ang, m = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], n = Math.hypot(m[0], m[1], m[2]) || 1;
  return [m[0] / n, m[1] / n, m[2] / n];
}
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// what is under a point to the light: the island's ground (or the sea's level over it), or the void's water
const lightFloor = (s, x, z) => (s.world?.ground ? Math.max(0, s.world.ground.height(x, z)) : 0);
function beginLight(s, ev) {
  s.light = { phase: 'gather', t: 0, gatherT: LIGHT.gather, v: 0, dist: 0, dir: [Math.sin(s.yaw), 0, Math.cos(s.yaw)], from: null, back: null, wasFlying: s.flying, frac: 0, veil: 0, u: 0 };
  s.v = [0, 0, 0]; s.dashT = 0; s.rising = false; s.hold = false; s.wallrun = null; s.climbing = false;
  ev.push({ type: 'light', on: 'gather', at: [s.p[0], s.p[1], s.p[2]] });
}
function stepLight(s, inp, dt, ev) {
  const L = s.light, want = eyeWay(inp);
  L.t += dt; s.grounded = false; s.coyote = 0; s.buffer = 0;
  if (L.phase === 'gather') {
    s.v[0] = s.v[1] = s.v[2] = 0;                       // the fall waits while the light gathers
    if (!inp.jump) { s.light = null; s.flying = L.wasFlying && s.mode === 'creative'; ev.push({ type: 'light', on: false, at: [s.p[0], s.p[1], s.p[2]] }); return; }
    if (L.t >= L.gatherT) {
      L.phase = 'go'; L.t = 0; L.from = [s.p[0], s.p[1], s.p[2]]; L.dir = want; L.v = LIGHT.v0; s.flying = true;
      ev.push({ type: 'light', on: 'go', at: [...L.from] });
    }
    return;
  }
  if (L.phase === 'go') {
    if (!inp.jump) {
      L.phase = 'home'; L.t = 0; L.back = [s.p[0], s.p[1], s.p[2]]; L.out = L.dist; L.vOut = L.v; L.fracOut = L.frac; L.veilOut = L.veil;
      ev.push({ type: 'light', on: 'home', dist: L.dist, at: [s.p[0], s.p[1], s.p[2]] });
      return;
    }
    L.dir = swing(L.dir, want, LIGHT.turn * dt);
    L.v = Math.min(LIGHT.c, LIGHT.v0 * Math.exp(LIGHT_K * L.t));
    L.dist += L.v * dt;
    L.frac = Math.log(L.v / LIGHT.v0) / Math.log(LIGHT.c / LIGHT.v0);
    L.veil = smooth01(0.06, 0.32, L.frac);
    // the body itself: along the way and up, clear of what is under it, no further than REACH from where it set out
    const go = Math.min(L.v, 1500) * dt, o = [s.p[0] - L.from[0] + L.dir[0] * go, s.p[1] - L.from[1] + L.dir[1] * go, s.p[2] - L.from[2] + L.dir[2] * go];
    const r = Math.hypot(o[0], o[1], o[2]);
    if (r > LIGHT.reach) for (let i = 0; i < 3; i++) o[i] *= LIGHT.reach / r;
    s.p = [L.from[0] + o[0], L.from[1] + o[1], L.from[2] + o[2]];
    s.p[1] = Math.max(s.p[1], L.from[1] + LIGHT.lift * smooth01(0, 1.4, L.t), lightFloor(s, s.p[0], s.p[2]) + 2);
    const k = Math.min(L.v, FLY_SPRINT); s.v = [L.dir[0] * k, L.dir[1] * k, L.dir[2] * k];
    if (Math.hypot(L.dir[0], L.dir[2]) > 0.05) s.yaw = Math.atan2(L.dir[0], L.dir[2]);
    return;
  }
  // coming home: back along a line to where it set out, its speed, its distance and the veil all falling away
  const u = Math.min(1, L.t / LIGHT.home), e = ease(u);
  L.u = u; L.dist = L.out * (1 - e); L.v = L.vOut * (1 - e); L.frac = L.fracOut * (1 - smooth01(0, 0.8, u)); L.veil = L.veilOut * (1 - smooth01(0.1, 0.7, u));
  s.p = [L.back[0] + (L.from[0] - L.back[0]) * e, L.back[1] + (L.from[1] - L.back[1]) * e, L.back[2] + (L.from[2] - L.back[2]) * e];
  s.p[1] = Math.max(s.p[1], lightFloor(s, s.p[0], s.p[2]) + 2 * (1 - smooth01(0.7, 1, u)));
  s.v = [0, 0, 0];
  if (u >= 1) {
    s.p = [...L.from]; s.light = null; s.flying = L.wasFlying && s.mode === 'creative'; s.rising = false; s.airDash = AIR_DASHES; s.hold = false; s.heldT = 0;
    ev.push({ type: 'light', on: false, home: true, at: [s.p[0], s.p[1], s.p[2]] });
  }
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
export function lightLine(L) {
  if (!L) return '';
  if (L.phase === 'gather') return 'the light gathers · let go to stay';
  if (L.phase === 'home') return `coming home · ${lightFar(L.dist)}`;
  const v = L.v, speed = v >= LIGHT.c ? 'the speed of light' : v >= LIGHT.c * 0.01 ? `${(v / LIGHT.c).toFixed(v >= LIGHT.c * 0.1 ? 2 : 3)} c` : v >= 1000 ? `${num(v / 1000)} km/s` : `${Math.round(v)} m/s`;
  const mark = MARKS.find(([m]) => L.dist >= m);
  return `lightspeed · ${speed} · ${lightFar(L.dist)} out${mark ? ' · ' + mark[1] : ''}`;
}

// The mode's switch. Survival takes flight away where the body is: it falls.
export function setMode(s, mode) {
  s.mode = mode === 'creative' ? 'creative' : 'survival';
  if (s.mode !== 'creative' && s.flying) { s.flying = false; s.rising = false; s.grounded = s.p[1] <= (s.world ? s.world.solve(s) : 0); }
  return s.mode;
}
