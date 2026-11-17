// ============================================================================
// The stars over the pyramid (browser only: three.js): every star of the
// Bright Star Catalogue the eye finds under a dark sky (to the sixth
// magnitude), where they stood in Khufu's reign (night.mjs),
// drawn at the sky's distance (beyond everything), each as bright as its
// magnitude and the colour of its B−V, fading in as the sun goes down and
// dimmed by the air near the horizon. A few carry their names.
// ============================================================================
import * as THREE from 'three';
import { PACKED, MOVING, NAMED, COUNT } from './bsc.js';
import { decodeStars, precess, YEARS, atEpoch, sunLongitude, sunRA, obliquity, NOVEMBER_17, siderealAt, direction, limit, seen, bvColour, EXTINCTION } from './night.mjs';
import { lin } from './kit.js';

const FAR = 30000;      // m: where a name is laid, from the eye, toward its star
// the names the night shows (when the star is up, seen, and not behind the pyramid)
const NAMES = [['thuban', null], ['polaris', null], ['alnilam', 'Orion’s belt'], ['sirius', 'Sirius'], ['alcyone', 'the Pleiades'], ['canopus', 'Canopus'],
  ['capella', 'Capella'], ['aldebaran', 'Aldebaran'], ['vega', 'Vega'], ['arcturus', 'Arcturus']];

export function createStarfield(stage, labels) {
  const n = COUNT, S = decodeStars(PACKED, MOVING, COUNT), place = new Float32Array(n * 2), mag = S.mag, col = new Float32Array(n * 3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [ra, dec] = atEpoch(S.ra[i], S.dec[i], S.pa[i], S.pd[i]);
    place[i * 2] = ra; place[i * 2 + 1] = dec;
    const c = bvColour(S.bv[i]);
    col.set([lin(c[0]), lin(c[1]), lin(c[2])], i * 3);
  }
  const raSun = sunRA(sunLongitude(NOVEMBER_17), obliquity(YEARS / 100));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const u = { uLimit: { value: -9 }, uNight: { value: 0 }, uPix: { value: 1 }, uExt: { value: EXTINCTION } };
  const points = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aMag; attribute vec3 aColor; uniform float uLimit; uniform float uNight; uniform float uPix; uniform float uExt; varying vec3 vC;
      void main() {
        vec3 d = normalize(position);
        float s = max(d.y, 0.0), X = 1.0 / (s + 0.025 * exp(-11.0 * s));
        float m = aMag + uExt * (X - 1.0);
        float on = smoothstep(uLimit + 0.5, uLimit - 0.5, m) * step(0.0, d.y) * uNight;
        // the eye's sense of a star's brightness is gentler than its light: half the magnitude scale's steepness
        vC = aColor * clamp(pow(10.0, -0.2 * (m - 1.0)), 0.0, 2.4) * on;
        vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(d, 1.0);
        gl_Position = p.xyww;                      // at the sky's distance: behind everything drawn
        gl_PointSize = on > 0.003 ? uPix * mix(2.0, 5.2, clamp((4.0 - m) / 5.0, 0.0, 1.0)) : 0.0;
      }`,
    fragmentShader: `varying vec3 vC;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        gl_FragColor = vec4(vC * exp(-2.6 * r2), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  points.frustumCulled = false; points.renderOrder = -9; points.visible = false;

  const named = NAMES.map(([key, say]) => {
    const i = NAMED[key], dec = place[i * 2 + 1];
    const text = say || (key === 'thuban' ? 'Thuban, the pole star then' : `Polaris, then ${Math.round(90 - dec)}° from the pole`);
    const L = stage.label(labels, 'star').say(text);
    return { key, i, L, dir: new THREE.Vector3(), up: false };
  });

  // the galaxy's north pole and its centre (J2000; IAU 1958, Reid and Brunthaler 2004), carried to the epoch
  const galPole = precess(192.85948, 27.12825, YEARS / 100), galCentre = precess(266.405, -28.93617, YEARS / 100);
  let shown = 0, lim = -9, glow = 0, gp = [0, 1, 0], gc = [1, 0, 0];
  const applyGlow = () => { stage.air.uGalPole.value.set(...gp); stage.air.uGalCentre.value.set(...gc); stage.air.uGalGlow.value = glow; };
  // the sky at an hour by the sun, with the sun at a height: where every star stands, and how many are seen
  function at(hours, sunElevation) {
    const lst = siderealAt(hours, raSun);
    lim = limit(sunElevation); shown = 0;
    for (let i = 0; i < n; i++) {
      const d = direction(place[i * 2], place[i * 2 + 1], lst);
      pos[i * 3] = d[0]; pos[i * 3 + 1] = d[1]; pos[i * 3 + 2] = d[2];
      if (seen(mag[i], (Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI, sunElevation)) shown++;
    }
    g.attributes.position.needsUpdate = true;
    gp = direction(galPole[0], galPole[1], lst); gc = direction(galCentre[0], galCentre[1], lst);
    glow = Math.max(0, Math.min(1, (-sunElevation - 10) / 8));     // the Milky Way shows once the twilight is nearly gone
    applyGlow();
    u.uLimit.value = lim; u.uNight.value = Math.max(0, Math.min(1, (-sunElevation - 2) / 4));
    points.visible = u.uNight.value > 0;
    for (const s of named) {
      s.dir.set(pos[s.i * 3], pos[s.i * 3 + 1], pos[s.i * 3 + 2]);
      s.up = points.visible && s.dir.y > Math.sin((5 * Math.PI) / 180) && seen(mag[s.i] - 0.5, (Math.asin(s.dir.y) * 180) / Math.PI, sunElevation);
    }
  }
  // each frame: the names laid toward their stars from where the eye is, unless the pyramid stands in the way
  const E = new THREE.Vector3();
  function frame(eye, blocked) {
    u.uPix.value = stage.ratio;
    E.set(eye[0], eye[1], eye[2]);
    for (const s of named) {
      s.L.on = s.up && !blocked(E, s.dir);
      if (s.L.on) s.L.pos.copy(s.dir).multiplyScalar(FAR).add(E);
    }
  }
  const read = () => ({ limit: Math.round(lim * 100) / 100, shown, milkyWay: Math.round(glow * 100) / 100, names: named.filter((s) => s.L.on).map((s) => s.key) });
  return { points, at, frame, read, applyGlow };
}
