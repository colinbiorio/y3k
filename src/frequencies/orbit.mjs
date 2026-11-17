// ============================================================================
// The eye of the frequencies room, as plain numbers: a point looked at, a
// distance, and two angles (az about the upright axis, polar down from it).
// Pure: no three.js and no page, so the tests hold it. The axes are the
// scene's: X to the right, Y up, Z toward the viewer when az = 0.
//
// An orbit holds the view that was ASKED for (target, dist, polar, az) and the
// view that is SHOWN (now), which settle() eases toward it a frame at a time.
// ============================================================================
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const copy = (v) => ({ target: [...v.target], dist: v.dist, polar: v.polar, az: v.az });

export function createOrbit(o = {}) {
  const v = { target: [0, 0, 0], dist: 10, polar: 1, az: 0, fov: 45, minDist: 0.5, maxDist: 100, minPolar: 0.02, maxPolar: 1.5, box: null, floor: null, ...o };
  v.target = [...v.target];
  v.home = copy(v);
  v.now = copy(v);
  return v;
}

// where the eye stands, for a view (the orbit itself, or its `now`)
export function pose(v) {
  const s = Math.sin(v.polar);
  return [v.target[0] + v.dist * s * Math.sin(v.az), v.target[1] + v.dist * Math.cos(v.polar), v.target[2] + v.dist * s * Math.cos(v.az)];
}
export const right = (v) => [Math.cos(v.az), 0, -Math.sin(v.az)];     // the eye's right hand, along the ground
export const ahead = (v) => [-Math.sin(v.az), 0, -Math.cos(v.az)];    // away from the eye, along the ground
// how many metres one pixel is, at the point looked at, in a view viewH pixels tall
export const metresPerPixel = (v, viewH) => (2 * v.dist * Math.tan((v.fov * Math.PI) / 360)) / viewH;

function hold(o) {
  o.dist = clamp(o.dist, o.minDist, o.maxDist);
  o.polar = clamp(o.polar, o.minPolar, o.maxPolar);
  if (o.box) for (let i = 0; i < 3; i++) o.target[i] = clamp(o.target[i], o.box[0][i], o.box[1][i]);
  if (Number.isFinite(o.floor)) {                      // the eye never goes below the floor, even looking up
    const c = (o.floor - o.target[1]) / o.dist;
    if (c > -1 && c < 1) o.polar = Math.min(o.polar, Math.acos(c));
  }
  return o;
}

// turn about the point looked at
export function turn(o, dAz, dPolar) { o.az += dAz; o.polar += dPolar; return hold(o); }

// slide: the ground goes with the hand (dx to the right and dy down, in pixels)
export function pan(o, dx, dy, viewH) {
  const m = metresPerPixel(o, viewH), r = right(o), a = ahead(o), k = 1 / Math.max(Math.cos(o.polar), 0.35);
  o.target[0] += (-r[0] * dx + a[0] * dy * k) * m;
  o.target[2] += (-r[2] * dx + a[2] * dy * k) * m;
  return hold(o);
}

// nearer (factor < 1) or farther; with a point given, that point stays where it is on the screen
// (the whole view shrinks toward it: eye, target and distance by the same factor)
export function zoom(o, factor, toward = null) {
  const d = clamp(o.dist * factor, o.minDist, o.maxDist), s = d / o.dist;
  if (toward) for (let i = 0; i < 3; i++) o.target[i] = toward[i] + (o.target[i] - toward[i]) * s;
  o.dist = d;
  return hold(o);
}
export function focus(o, point) { o.target = [...point]; return hold(o); }
// glide to a view: any of target, dist, polar and az (the rest stay as they are)
export function go(o, v) {
  if (v.target) o.target = [...v.target];
  for (const k of ['dist', 'polar', 'az']) if (Number.isFinite(v[k])) o[k] = v[k];
  return hold(o);
}
export function reset(o) { return Object.assign(o, copy(o.home)); }
export function above(o) { Object.assign(o, copy(o.home)); o.polar = o.minPolar; o.az = 0; return o; }

// one frame of easing; true while the shown view has not yet reached the asked one
export function settle(o, dt, rate = 14) {
  const n = o.now, a = 1 - Math.exp(-rate * Math.max(dt, 0)), scale = Math.max(o.dist, 1e-6);
  let rest = 0;
  for (let i = 0; i < 3; i++) { const d = o.target[i] - n.target[i]; n.target[i] += d * a; rest += Math.abs(d) / scale; }
  const dd = o.dist - n.dist; n.dist += dd * a; rest += Math.abs(dd) / scale;
  const dp = o.polar - n.polar; n.polar += dp * a; rest += Math.abs(dp);
  const da = wrap(o.az - n.az); n.az += da * a; rest += Math.abs(da);
  if (rest * (1 - a) >= 1e-4) return true;
  o.now = copy(o);
  return false;
}

// the keys: arrows turn, shift and arrows slide, + and - come nearer and go back, 0 is home
export function key(o, k, shift = false, viewH = 800) {
  const t = 0.12, p = 60;
  if (k === 'ArrowLeft') shift ? pan(o, p, 0, viewH) : turn(o, -t, 0);
  else if (k === 'ArrowRight') shift ? pan(o, -p, 0, viewH) : turn(o, t, 0);
  else if (k === 'ArrowUp') shift ? pan(o, 0, p, viewH) : turn(o, 0, -t);
  else if (k === 'ArrowDown') shift ? pan(o, 0, -p, viewH) : turn(o, 0, t);
  else if (k === '+' || k === '=') zoom(o, 0.8);
  else if (k === '-' || k === '_') zoom(o, 1.25);
  else if (k === '0' || k === 'Home') reset(o);
  else return false;
  return true;
}

// How finely the room is drawn: the screen's own pixels (never the site's graphics tier, which
// starts low and only steps down), up to MAX_RATIO device pixels a point and PIXELS a frame.
export const PIXELS = 8.3e6, MAX_RATIO = 3;
export const pixelRatio = (dpr, w, h, budget = PIXELS, most = MAX_RATIO) => Math.min(dpr > 0 ? dpr : 1, most, Math.sqrt(budget / Math.max(1, w * h)));

// What the stage can be turned down to when its frames are long, finest first: fewer pixels, then a
// coarser shadow, then no shadow and the land's fine detail left out. When to step is the frame watch's
// to decide (src/game/fine.js, the world's own: it tries the last step, keeps it only if the frames are
// clearly shorter there, and climbs back while they stay good). Never under half a pixel a point, nor above
// the screen's own.
export const LADDER = [{ share: 1, shadow: 2048, lite: false }, { share: 0.75, shadow: 2048, lite: false },
  { share: 0.5, shadow: 1024, lite: false }, { share: 0.5, shadow: 0, lite: true }];
export function ladder(dpr, w, h) {
  const top = pixelRatio(dpr, w, h);
  return LADDER.map((s) => ({ ratio: Math.min(top, Math.max(0.5, top * s.share)), shadow: s.shadow, lite: s.lite }));
}

// How far an eye is from the nearest horn of a ring of them: on the square of half-side `half` about the
// upright axis, at height `y`.
export function ringDistance(eye, half, y) {
  const dx = Math.abs(eye[0]), dz = Math.abs(eye[2]);
  const flat = dx < half && dz < half ? half - Math.max(dx, dz) : Math.hypot(Math.max(dx - half, 0), Math.max(dz - half, 0));
  return Math.hypot(flat, eye[1] - y);
}
