// rings.js — WHAT A BODY DOES TO STILL WATER, in numbers. No page, no three.
//
// The water of the void is still (void.js); what moves on it is what a body
// does to it. Every footfall, landing and dash drops a RING: a short train of
// ripples riding outward at the speed shallow water gives it,
//
//     c = √(g·d) = √(9.81 × 0.0254) = 0.499 m/s   for one inch,
//
// thinning as it widens (energy over a growing circle) and dying away. A ring
// is a function of where and when, not a picture, so it is as sharp on any
// screen; the water's shader (void.js) is written from the same numbers as
// ring() here, and a test holds the two together.
import { WATER, G } from './body.js';

export const RIPPLE_SPEED = Math.sqrt(G * WATER);       // m/s
export const DROPS = 32;                                 // rings alive at once
export const RING = { width: 0.3, wavelength: 0.21, life: 2.4, born: 0.18, reach: 2.5, thin: 0.35, oldest: 9 };

// One ring's height and slope `r` metres from where it fell, `age` seconds on.
// `amp` is the steepest slope it could have.
export function ring(r, age, amp = 1) {
  if (!(age >= 0) || age > RING.oldest) return { h: 0, slope: 0 };
  const k = (2 * Math.PI) / RING.wavelength, s = r - RIPPLE_SPEED * age, w2 = RING.width * RING.width;
  if (Math.abs(s) > RING.reach * RING.width) return { h: 0, slope: 0 };
  const a = (amp / k) * Math.exp(-age / RING.life) * Math.min(1, age / RING.born) / Math.sqrt(1 + r / RING.thin);
  const g = Math.exp(-(s * s) / w2);
  return { h: a * g * Math.cos(k * s), slope: a * g * ((-2 * s) / w2 * Math.cos(k * s) - k * Math.sin(k * s)) };
}

// The last `n` drops: x, z, when, how hard. A new drop takes the oldest's place.
export function createDrops(n = DROPS) {
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) data[i * 4 + 2] = -1e4;
  let next = 0;
  return {
    data, n,
    add(x, z, t, amp) { data[next * 4] = x; data[next * 4 + 1] = z; data[next * 4 + 2] = t; data[next * 4 + 3] = amp; next = (next + 1) % n; },
    shift(dx, dz) { for (let i = 0; i < n; i++) { data[i * 4] -= dx; data[i * 4 + 1] -= dz; } },
  };
}

// THE FLOOR'S LATTICE, and how far is far. The floor an inch down carries a
// faint honeycomb, CELL metres flat to flat: in a void it is what says how far
// you have come. It repeats exactly over PERIOD, so when a body has gone far
// enough that single-precision numbers would start to grain (FAR), the origin
// is moved under it by whole periods and nothing on screen changes. The void
// has no edge; this is how the arithmetic has none either.
export const CELL = 1.5;
export const PERIOD = [CELL * 1000, CELL * Math.sqrt(3) * 577];   // 1500 m, 1499.03 m
export const FAR = 2048;
export function rebase(x, z) {
  if (Math.abs(x) < FAR && Math.abs(z) < FAR) return null;
  return [Math.round(x / PERIOD[0]) * PERIOD[0], Math.round(z / PERIOD[1]) * PERIOD[1]];
}
