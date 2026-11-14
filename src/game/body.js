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
// The floor is y = 0, under one inch of still water (WATER). Everything moves
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
const COYOTE = 0.1, JUMP_BUFFER = 0.12; // a jump pressed just after the edge, or just before the ground

export function createBody(over = {}) {
  const s = {
    p: [0, 0, 0], v: [0, 0, 0], yaw: 0,
    mode: 'survival', grounded: true, flying: false, rising: false,
    dashT: 0, dashDir: [0, 0, 1], dashCool: 0, airDash: AIR_DASHES,
    coyote: COYOTE, buffer: 0, acc: 0, events: [],
    pending: { jumpPressed: false, dash: false, flyToggle: false },
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
    s.dashDir = d; s.dashT = DASH_TIME; s.dashCool = DASH_COOLDOWN; s.rising = false;
    if (!s.grounded && !s.flying) s.airDash--;
    ev.push({ type: 'dash', from: [s.p[0], s.p[1], s.p[2]], dir: d, air: !s.grounded });
  }
  if (s.dashT > 0) {
    const t = Math.min(dt, s.dashT), d = s.dashDir;
    s.p[0] += d[0] * DASH_SPEED * t; s.p[1] += d[1] * DASH_SPEED * t; s.p[2] += d[2] * DASH_SPEED * t;
    if (s.p[1] < 0) s.p[1] = 0;
    s.dashT -= dt;
    if (d[0] || d[2]) s.yaw = Math.atan2(d[0], d[2]);
    if (s.dashT <= 0) {
      // it ends at a sprint, not at a stop, and the fall begins again from rest
      const keep = s.flying ? FLY_SPRINT * 0.5 : SPRINT;
      s.v[0] = d[0] * keep; s.v[1] = s.flying ? d[1] * keep : 0; s.v[2] = d[2] * keep;
      if (s.p[1] <= 0 && !s.flying) { s.grounded = true; s.airDash = AIR_DASHES; }
    }
    return s;
  }

  // ---- flying (creative)
  if (s.flying) {
    const top = inp.sprint ? FLY_SPRINT : FLY, a = FLY_ACCEL * dt;
    s.v[0] = toward(s.v[0], w[0] * top, a); s.v[1] = toward(s.v[1], w[1] * top, a); s.v[2] = toward(s.v[2], w[2] * top, a);
    s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
    if (s.p[1] <= 0) {
      s.p[1] = 0; if (s.v[1] < 0) s.v[1] = 0;
      if (inp.down) { s.flying = false; s.grounded = true; s.airDash = AIR_DASHES; ev.push({ type: 'land', speed: 0 }); }
    }
    if (Math.hypot(s.v[0], s.v[2]) > 0.5) s.yaw = turnToward(s.yaw, Math.atan2(s.v[0], s.v[2]), TURN * dt);
    return s;
  }

  // ---- on foot
  const top = inp.walk ? WALK : inp.sprint ? SPRINT : RUN, a = (s.grounded ? GROUND_ACCEL : AIR_ACCEL) * dt;
  s.v[0] = toward(s.v[0], w[0] * top, a); s.v[2] = toward(s.v[2], w[2] * top, a);
  if (s.grounded) s.coyote = COYOTE; else if (s.coyote > 0) s.coyote -= dt;
  if (s.buffer > 0) {
    s.buffer -= dt;
    if (s.coyote > 0) {
      s.v[1] = JUMP_V0; s.grounded = false; s.rising = true; s.coyote = 0; s.buffer = 0;
      ev.push({ type: 'jump', at: [s.p[0], s.p[1], s.p[2]] });
    } else if (creative && inp.jumpPressed) {
      // a second jump in the air: creative takes off
      s.flying = true; s.rising = false; s.buffer = 0; s.v[1] = Math.max(s.v[1], 0);
      ev.push({ type: 'fly', on: true });
      return s;
    }
  }
  if (!s.grounded) {
    if (s.rising && (!inp.jump || s.v[1] <= 0)) s.rising = false;
    const g = G * (s.rising ? HOLD_GRAVITY : 1);
    s.p[1] += s.v[1] * dt - 0.5 * g * dt * dt;
    s.v[1] -= g * dt;
    if (s.p[1] <= 0 && s.v[1] <= 0) {
      ev.push({ type: 'land', speed: -s.v[1], at: [s.p[0], 0, s.p[2]] });
      s.p[1] = 0; s.v[1] = 0; s.grounded = true; s.rising = false; s.airDash = AIR_DASHES;
    }
  }
  s.p[0] += s.v[0] * dt; s.p[2] += s.v[2] * dt;
  if (Math.hypot(s.v[0], s.v[2]) > 0.3 && wm > 0.05) s.yaw = turnToward(s.yaw, Math.atan2(w[0], w[2]), TURN * dt);
  return s;
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

// The origin moved by (dx, dz) under the body (rings.js, rebase): the same place, in new numbers.
export function shift(s, dx, dz) { s.p[0] -= dx; s.p[2] -= dz; s.was[0] -= dx; s.was[2] -= dz; return s; }

// The mode's switch. Survival takes flight away where the body is: it falls.
export function setMode(s, mode) {
  s.mode = mode === 'creative' ? 'creative' : 'survival';
  if (s.mode !== 'creative' && s.flying) { s.flying = false; s.rising = false; s.grounded = s.p[1] <= 0; }
  return s.mode;
}
