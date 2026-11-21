// light.mjs — the light times that will govern travel: from the Earth to the Moon, the Sun and each planet, at
// their nearest and farthest in this century. Prints the table SOLAR.md carries. A journey at c takes this long.
//
//   node scripts/solar/light.mjs
import { position, relative, fromTT } from '../../src/game/solar/ephemeris.js';
import { C } from '../../src/game/solar/bodies.js';

const J2000 = 2451545, a = [0, 0, 0], b = [0, 0, 0];
const span = (seconds) => { const s = Math.round(seconds); return seconds < 100 ? seconds.toFixed(3) + ' s' : s < 3600 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')} min ${String(s % 60).padStart(2, '0')} s`; };
const day = (jd) => new Date(fromTT(jd)).toISOString().slice(0, 10);
// the least and greatest of f over 2000-2100: every dip and every crest found at `step` days is closed in on, and
// the deepest and the highest kept (the Moon's closest perigees differ by a few kilometres: one coarse look is not enough)
function extremes(f, step) {
  const close = (jd0, sign) => { let jd = jd0, v = f(jd), h = step; while (h > 1e-5) { h /= 2; for (const t of [jd - h, jd + h]) { const w = f(t); if (sign * (w - v) > 0) { v = w; jd = t; } } } return [v, jd]; };
  let lo = [Infinity, 0], hi = [-Infinity, 0], p2 = f(J2000 - 0.5 - step), p1 = f(J2000 - 0.5);
  for (let jd = J2000 - 0.5 + step; jd <= J2000 + 36525; jd += step) {
    const v = f(jd);
    if (p1 <= p2 && p1 <= v) { const c = close(jd - step, -1); if (c[0] < lo[0]) lo = c; }
    if (p1 >= p2 && p1 >= v) { const c = close(jd - step, 1); if (c[0] > hi[0]) hi = c; }
    p2 = p1; p1 = v;
  }
  return [lo, hi];
}
const far = (id) => (jd) => { const t = fromTT(jd); position('earth', t, a); position(id, t, b); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };
const rows = [['moon', (jd) => { relative('moon', fromTT(jd), a); return Math.hypot(a[0], a[1], a[2]); }, 0.25], ...['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].map((id) => [id, far(id), 1])];
console.log('| from the Earth to | nearest (km) | light time | on | farthest (km) | light time | on |\n|---|---|---|---|---|---|---|');
for (const [id, f, step] of rows) {
  const [[n, tn], [x, tx]] = extremes(f, step);
  console.log(`| ${id === 'sun' ? 'the Sun' : id === 'moon' ? 'the Moon' : id[0].toUpperCase() + id.slice(1)} | ${Math.round(n).toLocaleString('en-US')} | ${span(n / C)} | ${day(tn)} | ${Math.round(x).toLocaleString('en-US')} | ${span(x / C)} | ${day(tx)} |`);
}
