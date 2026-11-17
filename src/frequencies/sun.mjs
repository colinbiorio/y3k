// ============================================================================
// The sun over Giza, as plain numbers (no three.js, no page: the tests hold
// it). Where the sun stands for a day of the year and an hour of local solar
// time, by the standard approximations (the declination by Spencer's series,
// 1971, good to a few hundredths of a degree; the hour angle fifteen degrees an
// hour from solar noon; sunrise and sunset with the usual allowance for the
// sun's half-width and the air's refraction): more than a picture needs. And the colours of the sky, the
// sun and the air for the sun's height: the picture's, keyed to how the light
// looks at each height, not derived. Degrees throughout; the scene's axes are
// X east, Z south, Y up.
// ============================================================================
export const GIZA = { lat: 29.97917, lon: 31.13417 };
export const DAY = 321;                    // 17 November, the day of the year the room's sky was first set
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function declination(day = DAY, hours = 12) {
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hours - 12) / 24);
  return deg(0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g));
}

// the sun's height above the horizon and its bearing from north (clockwise), at `hours` of solar time
export function sunAt(hours, day = DAY, lat = GIZA.lat) {
  const d = rad(declination(day, hours)), phi = rad(lat), h = rad(15 * (hours - 12));
  const elevation = deg(Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h)));
  const azimuth = (deg(Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(d) * Math.cos(phi))) + 540) % 360;
  return { elevation, azimuth };
}
// toward the sun, as the scene's unit vector
export function sunDirection({ elevation, azimuth }) {
  const e = rad(elevation), a = rad(azimuth);
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
// sunrise and sunset, in hours of solar time: the sun's upper edge on the horizon, refraction allowed for (−0.833°)
export function daylight(day = DAY, lat = GIZA.lat) {
  const d = rad(declination(day)), phi = rad(lat);
  const H = deg(Math.acos(clamp((Math.sin(rad(-0.833)) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)), -1, 1))) / 15;
  return [12 - H, 12 + H];
}
// a solar hour said as a clock would: 8.5 → "8:30"
export const clock = (hours) => { const m = Math.round(hours * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

// The light for the sun's height (screen colours, 0..255): the zenith, the middle of the sky, the horizon away
// from the sun and under it, the sun's own colour and strength (none once it is down), the sky's and the ground's
// light on things, how much of the room's reflections, and the exposure. Between two heights, a blend.
export const SKY = [
  { at: -18, top: [3, 5, 13], mid: [6, 8, 20], low: [12, 14, 28], warm: [13, 14, 29], sun: [255, 120, 60], power: 0, glow: 0, hemi: [[40, 50, 92], [16, 15, 20], 0.24], env: 0.1, exposure: 2.2 },
  { at: -12, top: [5, 8, 22], mid: [13, 16, 38], low: [25, 27, 50], warm: [40, 34, 56], sun: [255, 120, 60], power: 0, glow: 0.04, hemi: [[46, 56, 100], [24, 22, 28], 0.27], env: 0.15, exposure: 1.9 },
  { at: -8, top: [8, 12, 34], mid: [26, 30, 64], low: [46, 48, 80], warm: [92, 66, 82], sun: [255, 120, 60], power: 0, glow: 0.15, hemi: [[56, 66, 112], [34, 30, 36], 0.32], env: 0.25, exposure: 1.6 },
  { at: -4, top: [18, 28, 70], mid: [58, 60, 108], low: [104, 92, 124], warm: [214, 124, 92], sun: [255, 120, 60], power: 0, glow: 0.55, hemi: [[86, 96, 146], [64, 54, 56], 0.42], env: 0.4, exposure: 1.4 },
  { at: 0, top: [28, 46, 104], mid: [104, 100, 146], low: [184, 154, 160], warm: [255, 158, 92], sun: [255, 136, 66], power: 1.4, glow: 1, hemi: [[116, 118, 168], [116, 86, 66], 0.48], env: 0.6, exposure: 1.18 },
  { at: 5, top: [38, 66, 136], mid: [118, 128, 174], low: [204, 184, 180], warm: [255, 194, 138], sun: [255, 178, 116], power: 2.9, glow: 1, hemi: [[130, 150, 200], [150, 110, 80], 0.6], env: 0.85, exposure: 1.06 },
  { at: 16, top: [46, 86, 160], mid: [122, 154, 200], low: [204, 202, 202], warm: [246, 222, 186], sun: [255, 222, 186], power: 3.5, glow: 1, hemi: [[150, 176, 222], [150, 122, 90], 0.72], env: 1, exposure: 1 },
  { at: 30, top: [44, 88, 164], mid: [118, 152, 202], low: [200, 204, 210], warm: [236, 226, 204], sun: [255, 236, 212], power: 3.7, glow: 0.9, hemi: [[150, 180, 228], [158, 128, 94], 0.78], env: 1, exposure: 0.97 },
  { at: 60, top: [40, 88, 170], mid: [110, 150, 206], low: [196, 206, 216], warm: [226, 224, 214], sun: [255, 246, 232], power: 3.8, glow: 0.8, hemi: [[150, 182, 232], [160, 130, 96], 0.8], env: 1, exposure: 0.95 },
];
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
export function lightFor(elevation) {
  const e = clamp(elevation, SKY[0].at, SKY[SKY.length - 1].at);
  let i = 0;
  while (i < SKY.length - 2 && e > SKY[i + 1].at) i++;
  const a = SKY[i], b = SKY[i + 1], t = (e - a.at) / (b.at - a.at), s = t * t * (3 - 2 * t);
  return {
    top: mix3(a.top, b.top, s), mid: mix3(a.mid, b.mid, s), low: mix3(a.low, b.low, s), warm: mix3(a.warm, b.warm, s), sun: mix3(a.sun, b.sun, s),
    power: elevation <= -0.5 ? 0 : mix(a.power, b.power, s) * clamp((elevation + 0.5) / 1.5, 0, 1), glow: mix(a.glow, b.glow, s),
    hemi: [mix3(a.hemi[0], b.hemi[0], s), mix3(a.hemi[1], b.hemi[1], s), mix(a.hemi[2], b.hemi[2], s)], env: mix(a.env, b.env, s), exposure: mix(a.exposure, b.exposure, s),
  };
}
