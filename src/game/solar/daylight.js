// daylight.js — WHAT THE SUN AND THE AIR GIVE A PLACE AT AN INSTANT, as numbers: where the Sun is seen
// (ephemeris.js sky(): apparent, lifted by the air), how much of its light is left when it arrives and what colour
// (air.js), how much the sky adds, and how bright the scene is to an eye looking a given way. No page and no three
// in it: sky.js draws from these numbers and the tests check them.
//
// The world's frame is the island's (GAME.md): x east, y up, z south. Lights are in lux, luminances in cd/m2,
// each as three numbers (red, green, blue: "were the light white"); air.js `luminance()` makes one of the three.
import { sky as skyOf } from './ephemeris.js';
import { BODIES } from './bodies.js';
import { sunIlluminance, sunThrough, skyIrradiance, skyRay, luminance, meter, keyFor, skyHold, EYE } from './air.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const STEP = 0.25;                            // degrees of the Sun's height between two workings of the sky's irradiance
const GROUND = 0.18;                          // how much of the light the land and sea give back, taken together (the photographer's average scene)
// the heights the sky's irradiance is kept for (km): it changes little with height near the ground
const READS = new Array(15).fill(0), WEIGHTS = new Array(15).fill(1);
const rung = (km) => (km < 0.05 ? 0.002 : km < 0.2 ? 0.1 : km < 0.6 ? 0.35 : km < 1.5 ? 1 : km < 4 ? 2.5 : km < 10 ? 6 : km < 30 ? 18 : 50);

export function createDaylight({ lat, lon }) {
  const seen = {}, opts = { ids: ['sun'], height: 0 }, kept = new Map(), ray = [0, 0, 0, 1, 1, 1], d = [0, 0, 0], a = [0, 0, 0];
  const L = {
    when: NaN, height: 0,                      // the instant (UTC ms) and the eye's height (km above the sea)
    alt: 0, az: 0, lifted: 0, radius: 0.2666,  // the Sun as seen: degrees above the horizon (lifted by the air, by `lifted`), from north through east; its disc's radius
    sun: [0, 1, 0], trueSun: [0, 1, 0],        // toward where it is seen, and toward where it is (world frame, unit)
    lux: 0,                                    // its illuminance above the air, on a plane facing it
    refraction: 1,                             // how much of the sea-level lift the air at this height still gives
    direct: [0, 0, 0],                         // what arrives through the air (lux, on a plane facing it), by how much of the disc clears the horizon
    sky: [0, 0, 0],                            // the sky's light on level ground (lux)
    level: [0, 0, 0],                          // Sun and sky together on level ground (lux)
  };
  // the sky's irradiance for a Sun of illuminance 1, at one height of the Sun: worked out once and kept
  function irradiance(km, altStep) {
    const key = km + ':' + altStep;
    let v = kept.get(key);
    if (!v) { v = skyIrradiance(km, Math.sin(altStep * STEP * D2R), [0, 0, 0]); kept.set(key, v); if (kept.size > 400) kept.delete(kept.keys().next().value); }
    return v;
  }
  return {
    light: L,
    // the Sun's place and light at `when` (UTC ms) for an eye `metres` above the sea. Cheap: every frame.
    at(when, metres = 0) {
      opts.height = Math.max(0, metres);
      const r = skyOf(lat, lon, when, seen, opts).sun, km = Math.max(0.0005, metres / 1000);
      L.when = +when; L.height = km; L.alt = r.alt; L.az = r.az; L.lifted = r.lifted; L.radius = r.diameter / 2;
      L.sun[0] = r.east; L.sun[1] = r.up; L.sun[2] = -r.north;
      const t = (r.alt - r.lifted) * D2R, z = r.az * D2R, ct = Math.cos(t);
      L.trueSun[0] = ct * Math.sin(z); L.trueSun[1] = Math.sin(t); L.trueSun[2] = -ct * Math.cos(z);
      L.lux = sunIlluminance(r.distance);
      L.refraction = Math.exp(-opts.height / (1000 * BODIES.earth.atmosphere.scaleHeight));
      sunThrough(km, r.up, L.radius, L.direct);
      for (let c = 0; c < 3; c += 1) L.direct[c] *= L.lux;
      // the sky's part, between the two kept heights of the Sun on either side (its logarithm runs nearly straight)
      const x = r.alt / STEP, i = Math.floor(x), f = x - i, h = rung(km), lo = irradiance(h, i), hi = irradiance(h, i + 1), up = Math.max(0, r.up);
      for (let c = 0; c < 3; c += 1) {
        L.sky[c] = L.lux * (lo[c] > 0 && hi[c] > 0 ? Math.exp(Math.log(lo[c]) * (1 - f) + Math.log(hi[c]) * f) : lo[c] * (1 - f) + hi[c] * f);
        L.level[c] = L.sky[c] + L.direct[c] * up;
      }
      return L;
    },
    // the sky's luminance toward a direction (world frame, unit), cd/m2 in three colours
    toward(dir, out = [0, 0, 0], n = 16) {
      skyRay(L.height, dir, L.sun, n, ray);
      out[0] = ray[0] * L.lux; out[1] = ray[1] * L.lux; out[2] = ray[2] * L.lux;
      return out;
    },
    // the luminance of what stands on the ground, to an eye looking along `forward`: an average scene (it gives back
    // 18% of what falls on it), lit as its best-lit face is: level ground, or what faces the eye. So with a low Sun
    // at the eye's back the scene is the bright thing it is, and nothing in it is shown brighter than the screen
    groundLuminance(forward = null) {
      let cos = Math.max(0, L.sun[1]);
      if (forward) { const n = Math.hypot(forward[0], forward[2]) || 1; cos = Math.max(cos, -(L.sun[0] * forward[0] + L.sun[2] * forward[2]) / n); }
      return (luminance(L.sky) + luminance(L.direct) * cos) * GROUND / Math.PI;
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
        if (d[1] > 0.004) { const l = luminance(this.toward(d, a, 10)); READS[k] = l; sky += l; n += 1; } else READS[k] = g;
        WEIGHTS[k] = Math.exp(-(x * x + y * y) / 0.5); k += 1;
      }
      const read = meter(READS, WEIGHTS);
      return n ? Math.max(read, keyFor(read, curve) * sky / n / skyHold(curve)) : read;
    },
  };
}
export { STEP, GROUND, R2D };
