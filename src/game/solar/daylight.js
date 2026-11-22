// daylight.js — WHAT THE SKY GIVES A PLACE AT AN INSTANT, as numbers: where the Sun is seen (ephemeris.js sky():
// apparent, lifted by the air), how much of its light is left when it arrives and what colour (air.js), how much the
// sky adds, and how bright the scene is to an eye looking a given way; and since the night was made (night.js), the
// same for the Moon and the planets, the night's own glow, and which light is the key. No page and no three in it:
// sky.js draws from these numbers and the tests check them.
//
// The world's frame is the island's (GAME.md): x east, y up, z south. Lights are in lux, luminances in cd/m2,
// each as three numbers (red, green, blue: "were the light white"); air.js `luminance()` makes one of the three.
//
// `sky`, `direct` and `level` (and `toward()`) are the Sun's alone, as they were for the first part: what the day's
// tests measure. What the picture is lit by is in `fill` (the whole sky on level ground), `key` (the brightest light
// that comes straight) and `ground` (everything on level ground), and `towardAll()` is the whole sky along a look.
import { sky as skyOf } from './ephemeris.js';
import { BODIES } from './bodies.js';
import { sunIlluminance, sunThrough, skyIrradiance, skyRay, luminance, meter, keyFor, skyHold, EYE } from './air.js';
import { createNight, magLux, bvColour, planetColour, MOON_BV } from './night.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const STEP = 0.25;                            // degrees of the Sun's height between two workings of the sky's irradiance
const GROUND = 0.18;                          // how much of the light the land and sea give back, taken together (the photographer's average scene)
// the heights the sky's irradiance is kept for (km): it changes little with height near the ground
const READS = new Array(15).fill(0), WEIGHTS = new Array(15).fill(1);
const rung = (km) => (km < 0.05 ? 0.002 : km < 0.2 ? 0.1 : km < 0.6 ? 0.35 : km < 1.5 ? 1 : km < 4 ? 2.5 : km < 10 ? 6 : km < 30 ? 18 : 50);
export const PLANETS = Object.freeze(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
// how often the slower parts are worked out again, in seconds of the world's clock: the planets, the night's glow (its
// Milky Way and zodiacal light turn a quarter of a degree a minute), and the stars' own light on the ground
const EVERY = Object.freeze({ planets: 0.5, glow: 5, stars: 60 });
// a light worth a sky table of its own: its sky's light on level ground more than this share of all of it
export const MATTERS = 1e-3;

export function createDaylight({ lat, lon, stars = null }) {
  const seen = {}, opts = { ids: ['sun', 'moon'], height: 0 }, seenP = {}, optsP = { ids: PLANETS, height: 0 };
  const kept = new Map(), ray = [0, 0, 0, 1, 1, 1], d = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], night = createNight({ lat, lon, stars });
  const moonCol = bvColour(MOON_BV, [0, 0, 0]);
  const light = () => ({ id: '', alt: 0, az: 0, lifted: 0, radius: 0, dir: [0, 1, 0], trueDir: [0, 1, 0], lux: 0, colour: [1, 1, 1], magnitude: NaN, distance: 0, direct: [0, 0, 0] });
  const L = {
    when: NaN, height: 0,                      // the instant (UTC ms) and the eye's height (km above the sea)
    alt: 0, az: 0, lifted: 0, radius: 0.2666,  // the Sun as seen: degrees above the horizon (lifted by the air, by `lifted`), from north through east; its disc's radius
    sun: [0, 1, 0], trueSun: [0, 1, 0],        // toward where it is seen, and toward where it is (world frame, unit)
    lux: 0,                                    // its illuminance above the air, on a plane facing it
    sunDistance: 0,                            // km
    refraction: 1,                             // how much of the sea-level lift the air at this height still gives
    direct: [0, 0, 0],                         // what arrives of the Sun through the air (lux, on a plane facing it), by how much of the disc clears the horizon
    sky: [0, 0, 0],                            // the Sun's sky's light on level ground (lux)
    level: [0, 0, 0],                          // the Sun and its sky together on level ground (lux)
    // the Moon: as the Sun, and its phase (the lit fraction), phase angle, the bright limb's position angle and the
    // zenith's (degrees), and its sky's light on level ground
    moon: { ...light(), id: 'moon', phase: 0, phaseAngle: 0, limb: 0, zenith: 0, sky: [0, 0, 0] },
    planets: PLANETS.map((id) => ({ ...light(), id, colour: planetColour(id, [0, 0, 0]) })),
    night: night.state,                        // the night's own glow (night.js): on level ground, its mean, the Sun's ecliptic longitude
    fill: [0, 0, 0],                           // the whole sky's light on level ground: the Sun's sky, the Moon's, the night's own glow and the stars
    key: null,                                 // the light that comes straight and gives the most: the Sun, the Moon, or a planet (one of the records above)
    ground: [0, 0, 0],                         // everything on level ground: the whole sky and every light that comes straight
  };
  L.key = L.moon;
  // the sky's irradiance for a light of illuminance 1, at one height of the light: worked out once and kept
  function irradiance(km, altStep) {
    const key = km + ':' + altStep;
    let v = kept.get(key);
    if (!v) { v = skyIrradiance(km, Math.sin(altStep * STEP * D2R), [0, 0, 0]); kept.set(key, v); if (kept.size > 600) kept.delete(kept.keys().next().value); }
    return v;
  }
  // its value between the two kept heights on either side (its logarithm runs nearly straight), times a light of `lux`
  function skyLight(km, alt, lux, colour, out) {
    const x = alt / STEP, i = Math.floor(x), f = x - i, h = rung(km), lo = irradiance(h, i), hi = irradiance(h, i + 1);
    for (let c = 0; c < 3; c += 1) out[c] = lux * colour[c] * (lo[c] > 0 && hi[c] > 0 ? Math.exp(Math.log(lo[c]) * (1 - f) + Math.log(hi[c]) * f) : lo[c] * (1 - f) + hi[c] * f);
    return out;
  }
  // a body's place from sky()'s record, into one of the records above
  function place(rec, r, km, lux, colour) {
    rec.alt = r.alt; rec.az = r.az; rec.lifted = r.lifted; rec.radius = r.diameter / 2; rec.magnitude = r.magnitude; rec.distance = r.distance; rec.lux = lux;
    rec.dir[0] = r.east; rec.dir[1] = r.up; rec.dir[2] = -r.north;
    const t = (r.alt - r.lifted) * D2R, z = r.az * D2R, ct = Math.cos(t);
    rec.trueDir[0] = ct * Math.sin(z); rec.trueDir[1] = Math.sin(t); rec.trueDir[2] = -ct * Math.cos(z);
    sunThrough(km, r.up, Math.max(rec.radius, 1e-4), rec.direct);
    for (let c = 0; c < 3; c += 1) { rec.colour[c] = colour[c]; rec.direct[c] *= lux * colour[c]; }
  }
  const WHITE = [1, 1, 1];
  let planetsAt = NaN, glowAt = NaN, starsAt = NaN;
  return {
    light: L,
    night,
    // the sky's place and light at `when` (UTC ms) for an eye `metres` above the sea. Cheap: every frame.
    at(when, metres = 0) {
      opts.height = Math.max(0, metres); optsP.height = opts.height;
      const ms = +when, all = skyOf(lat, lon, ms, seen, opts), r = all.sun, km = Math.max(0.0005, metres / 1000);
      L.when = ms; L.height = km; L.alt = r.alt; L.az = r.az; L.lifted = r.lifted; L.radius = r.diameter / 2; L.sunDistance = r.distance;
      L.sun[0] = r.east; L.sun[1] = r.up; L.sun[2] = -r.north;
      const t = (r.alt - r.lifted) * D2R, z = r.az * D2R, ct = Math.cos(t);
      L.trueSun[0] = ct * Math.sin(z); L.trueSun[1] = Math.sin(t); L.trueSun[2] = -ct * Math.cos(z);
      L.lux = sunIlluminance(r.distance);
      L.refraction = Math.exp(-opts.height / (1000 * BODIES.earth.atmosphere.scaleHeight));
      sunThrough(km, r.up, L.radius, L.direct);
      for (let c = 0; c < 3; c += 1) L.direct[c] *= L.lux;
      // the sky's part, between the two kept heights of the Sun on either side (its logarithm runs nearly straight)
      skyLight(km, r.alt, L.lux, WHITE, L.sky);
      const up = Math.max(0, r.up);
      for (let c = 0; c < 3; c += 1) L.level[c] = L.sky[c] + L.direct[c] * up;
      // the Moon: its light from its magnitude (the clockwork's phase law), its colour, through the air; its sky's
      const m = all.moon, M = L.moon;
      place(M, m, km, magLux(m.magnitude), moonCol);
      M.phase = m.phase; M.phaseAngle = m.phaseAngle; M.limb = m.limb; M.zenith = m.zenith;
      if (m.alt > -12) skyLight(km, m.alt, M.lux, moonCol, M.sky); else M.sky[0] = M.sky[1] = M.sky[2] = 0;
      // the planets, twice a second
      if (!(Math.abs(ms - planetsAt) < EVERY.planets * 1000)) {
        const P = skyOf(lat, lon, ms, seenP, optsP);
        for (const rec of L.planets) { const q = P[rec.id]; place(rec, q, km, Number.isFinite(q.magnitude) ? magLux(q.magnitude) : 0, rec.colour); }
        planetsAt = ms;
      }
      // the night's own glow, every few seconds (and the stars' light on the ground, every minute)
      if (!(Math.abs(ms - glowAt) < EVERY.glow * 1000) || Math.abs(km - night.state.km) > 0.05 * Math.max(km, 0.05)) {
        const withStars = !(Math.abs(ms - starsAt) < EVERY.stars * 1000);
        night.at(ms, km, null, withStars); glowAt = ms; if (withStars) starsAt = ms;
      }
      // the key: whichever light gives most on a plane facing it
      if (luminance(L.direct) > 0) L.key = SUN_KEY(L);
      else { let key = M, best = luminance(M.direct); for (const p of L.planets) { const e = luminance(p.direct); if (e > best) { best = e; key = p; } } L.key = key; }
      // the whole sky on level ground, and everything on it
      for (let c = 0; c < 3; c += 1) {
        L.fill[c] = L.sky[c] + M.sky[c] + night.state.level[c];
        let g = L.fill[c] + L.direct[c] * up + M.direct[c] * Math.max(0, M.dir[1]);
        for (const p of L.planets) g += p.direct[c] * Math.max(0, p.dir[1]);
        L.ground[c] = g;
      }
      return L;
    },
    // the Sun's sky's luminance toward a direction (world frame, unit), cd/m2 in three colours
    toward(dir, out = [0, 0, 0], n = 16) {
      skyRay(L.height, dir, L.sun, n, ray);
      out[0] = ray[0] * L.lux; out[1] = ray[1] * L.lux; out[2] = ray[2] * L.lux;
      return out;
    },
    // the whole sky's luminance toward a direction: the Sun's sky, the Moon's (where it matters) and the night's glow
    towardAll(dir, out = [0, 0, 0], n = 16) {
      this.toward(dir, out, n);
      const M = L.moon;
      if (M.alt > -12 && luminance(M.sky) > MATTERS * luminance(L.fill)) { skyRay(L.height, dir, M.dir, n, ray); for (let c = 0; c < 3; c += 1) out[c] += ray[c] * M.lux * M.colour[c]; }
      night.glowAt(dir, b);
      for (let c = 0; c < 3; c += 1) out[c] += b[c];
      return out;
    },
    // the luminance of what stands on the ground, to an eye looking along `forward`: an average scene (it gives back
    // 18% of what falls on it), lit as its best-lit face is: level ground, or what faces the eye. So with a low Sun
    // at the eye's back the scene is the bright thing it is, and nothing in it is shown brighter than the screen
    groundLuminance(forward = null) {
      const kd = L.key.dir, kl = L.key.direct;
      let cos = Math.max(0, kd[1]);
      if (forward) { const n = Math.hypot(forward[0], forward[2]) || 1; cos = Math.max(cos, -(kd[0] * forward[0] + kd[2] * forward[2]) / n); }
      return (luminance(L.fill) + luminance(kl) * cos) * GROUND / Math.PI;
    },
    // how bright the scene is to an eye: fifteen looks across what it sees (forward, right and up are the eye's own
    // axes, tanX and tanY the half-width and half-height of its view), the sky where a look clears the horizon and
    // the ground where it does not, read as a camera's centre-weighted meter reads them: what the eye looks at counts
    // most, so looking at the land shows the land, and looking up shows the sky. And the eye is never so open that
    // the sky it has in view is, taken together, shown past seven tenths of the screen's white: facing a low Sun it
    // narrows, as eyes do, and the land in front goes dark rather than the sunset white.
    scene(forward, right, up, tanX, tanY, curve = EYE.curve) {
      const g = this.groundLuminance(forward); let k = 0, sky = 0, n = 0;
      for (let j = -1; j <= 1; j += 1) for (let i = -2; i <= 2; i += 1) {
        const x = i * 0.4, y = j * 0.6;
        d[0] = forward[0] + right[0] * x * tanX + up[0] * y * tanY; d[1] = forward[1] + right[1] * x * tanX + up[1] * y * tanY; d[2] = forward[2] + right[2] * x * tanX + up[2] * y * tanY;
        const len = Math.hypot(d[0], d[1], d[2]); d[0] /= len; d[1] /= len; d[2] /= len;
        if (d[1] > 0.004) { const l = luminance(this.towardAll(d, a, 10)); READS[k] = l; sky += l; n += 1; } else READS[k] = g;
        WEIGHTS[k] = Math.exp(-(x * x + y * y) / 0.5); k += 1;
      }
      const read = meter(READS, WEIGHTS);
      return n ? Math.max(read, keyFor(read, curve) * sky / n / skyHold(curve)) : read;
    },
  };
}
// the Sun as the key: a record shaped like the others', read from the Sun's own fields
const SUN_KEYS = new WeakMap();
function SUN_KEY(L) {
  let k = SUN_KEYS.get(L);
  if (!k) { k = { id: 'sun', get alt() { return L.alt; }, get az() { return L.az; }, get radius() { return L.radius; }, get dir() { return L.sun; }, get trueDir() { return L.trueSun; }, get direct() { return L.direct; }, get lux() { return L.lux; }, colour: [1, 1, 1] }; SUN_KEYS.set(L, k); }
  return k;
}
export { STEP, GROUND, R2D };
