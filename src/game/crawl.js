// crawl.js — HOW A BODY ON MANY ARMS CARRIES ITSELF: where the tip of each arm
// is, in the world's numbers, from how the body is moving. No page, no three;
// ./bodies/octopus.js lays an arm from the body down to each tip.
//
// The stride's first law holds here too (./gait.js): A TIP ON THE FLOOR STAYS
// WHERE IT WAS PUT. The body goes on over its planted tips. A tip left too far
// from where it would now stand lifts, and comes down ahead of the body. The
// tips are in two threes, every other one round the ring, and a three lifts
// only when the other is down and has borne the body a while: three are
// always on the floor, and the two take turns evenly.
//
// Faster than a crawl can carry it, the body lets go of the floor and jets:
// every tip is loose and goes with the body. In the air, in a dash and in
// flight they are loose as well. Back on the floor, all are put down at once.
import { stateOf } from './gait.js';

// ring: how far from the body's middle a tip stands at rest. reach: how far ahead of that it is put down
// at a full stride. swing: the longest a tip is in the air. lift: how high it goes. jet: the speeds a jet
// ends below and begins above.
export const CRAWL = { arms: 6, ring: 0.2, reach: 0.34, swing: 0.26, lift: 0.1, jet: [2.6, 3.2] };

// A tip: where it is on the floor (x, z), how high over it (y), whether it is planted (down), and how far
// through its swing it is when it is not (s).
export function createCrawl(over = {}) {
  const c = { ...CRAWL, ...over };
  return {
    c, speed: 0, state: 'crawl', jet: false, placed: null, since: [9, 9], falls: [],
    tips: Array.from({ length: c.arms }, () => ({ x: 0, y: 0, z: 0, down: false, s: 1, d: 0, fx: 0, fz: 0, T: c.swing, h: 0 })),
  };
}

// Where tip i stands with the body at rest over `at` and turned to `yaw`: [x, z]. The tips go round from
// the front by the left, none of them straight ahead.
export function homeOf(s, i, at, yaw, out = [0, 0]) {
  const a = (i + 0.5) * 2 * Math.PI / s.c.arms, lx = s.c.ring * Math.sin(a), lz = s.c.ring * Math.cos(a), cs = Math.cos(yaw), sn = Math.sin(yaw);
  out[0] = at[0] + lx * cs + lz * sn; out[1] = at[2] - lx * sn + lz * cs;
  return out;
}

// The origin was moved under the body: the tips go with it.
export function shiftCrawl(s, dx, dz) { for (const t of s.tips) { t.x += dx; t.z += dz; t.fx += dx; t.fz += dz; } }

const w = [0, 0];
// One frame. `body` as the stride is told it (v, yaw, flying, dashT, grounded); `at` is where it is. Answers
// the crawl, with `state` ('crawl', 'jet', 'air', 'dash', 'fly') and `falls`: where a tip came down this
// frame, in the world ([x, z]).
export function stepCrawl(s, body, at, dt) {
  const c = s.c, n = c.arms, h = Math.hypot(body.v[0], body.v[2]), st = stateOf(body);
  s.speed += (h - s.speed) * (1 - Math.exp(-12 * dt));
  s.jet = s.speed > c.jet[s.jet ? 0 : 1];
  s.state = st !== 'ground' ? st : s.jet ? 'jet' : 'crawl';
  s.falls.length = 0;
  // where a tip would now stand: its place at rest, and ahead of that by as much of a stride as the body's speed asks
  const k = Math.min(1, s.speed / 0.6), lead = c.reach * k, ux = h > 1e-6 ? body.v[0] / h : 0, uz = h > 1e-6 ? body.v[2] / h : 0;
  const want = (i) => { homeOf(s, i, at, body.yaw, w); w[0] += ux * lead; w[1] += uz * lead; return w; };
  if (s.state !== 'crawl') {                                                    // off the floor: the tips go with the body
    for (let i = 0; i < n; i++) { const t = s.tips[i]; want(i); t.x = w[0]; t.z = w[1]; t.y = 0; t.down = false; t.s = 1; }
    if (s.placed) s.placed = false;
    return s;
  }
  if (!s.placed) {                                                              // onto the floor: every tip is put down (and is heard, unless the body has only just been made)
    for (let i = 0; i < n; i++) { const t = s.tips[i]; want(i); t.x = w[0]; t.z = w[1]; t.y = 0; t.down = true; t.d = 0; if (s.placed === false) s.falls.push([t.x, t.z]); }
    s.placed = true; s.since[0] = s.since[1] = 9;
    return s;
  }
  // a planted tip is let go when it is this far from where it would stand; a swing takes this long
  const D = 1.8 * lead, T = Math.min(c.swing, 0.9 * c.reach / Math.max(s.speed, 0.6));
  const up = [false, false], far = [0, 0];
  for (let i = 0; i < n; i++) {
    const t = s.tips[i], g = i % 2; want(i);
    if (t.down) { t.d = Math.hypot(w[0] - t.x, w[1] - t.z); if (t.d > far[g]) far[g] = t.d; continue; }
    t.s += dt / t.T;                                                            // in the air: toward where it would stand now, so it comes down exactly there
    if (t.s >= 1) { t.x = w[0]; t.z = w[1]; t.y = 0; t.down = true; t.d = 0; s.falls.push([t.x, t.z]); continue; }
    const e = t.s * t.s * (3 - 2 * t.s);
    t.x = t.fx + (w[0] - t.fx) * e; t.z = t.fz + (w[1] - t.fz) * e; t.y = t.h * Math.sin(Math.PI * t.s); up[g] = true;
  }
  for (const g of [0, 1]) s.since[g] = up[g] ? 0 : s.since[g] + dt;
  // a three lifts when one of its tips has been left too far, the other three is down, and has been for
  // half of what it will stand (that is what keeps the two in turn). From a long stand the first step is
  // a short one; a few centimetres are not worth a step at all.
  const rest = Math.min(0.3, Math.max(0, (D / Math.max(s.speed, 1e-6) - T) / 2)), first = s.since[0] >= s.since[1] ? 0 : 1;
  for (const g of [first, 1 - first]) {
    if (up[0] || up[1] || s.since[1 - g] < rest || far[g] <= Math.max(0.05, s.since[g] > 0.6 && s.since[1 - g] > 0.6 ? 0.5 * D : D)) continue;
    for (let i = g; i < n; i += 2) {
      const t = s.tips[i]; if (t.d <= 0.02) continue;
      t.down = false; t.s = 0; t.fx = t.x; t.fz = t.z; t.T = T * (0.5 + 0.5 * Math.min(1, t.d / 0.3)); t.h = c.lift * Math.min(1, t.d / 0.2);
    }
    up[g] = true;
  }
  return s;
}
