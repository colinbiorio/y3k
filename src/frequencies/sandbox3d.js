// ============================================================================
// The sandbox in the round (browser only: three.js). Everything is at its true
// size: the bed's sand as a surface of its own heights (one vertex a cell), in
// a glass tray; every horn as its physics sizes it, on a post, aimed as the
// model aims it; and, while the sound is on, the tone's wavefronts leaving
// each mouth, a wavelength apart, on the same slowed clock as the pressure
// wave drawn on the sand, so that the two meet at the surface.
//
// Axes: the simulation's (x across, y deep, z up) are the scene's (X, Z, Y).
// The plane the sound meets is the bed as it was laid (bed.depth0 above the
// floor); a horn's mouth centre is h.z above that.
// ============================================================================
import * as THREE from 'three';
import { createOrbit } from './orbit.mjs';
import { paToSpl } from './acoustics.mjs';
import { SET, strengthAt } from './pyramid.mjs';
import { lin, rgb, merge, hornGeometry, aimMatrix, bronze } from './kit.js';

const GLASS = 0.72;           // the top of the tray's glass, m above the floor
const TUBE = 0.02;            // the arcs' tube as modelled; the shader redraws it at a width that reads
const ARCS = 320, SHELLS = 16;
export const FRONT_REACH = (lambda) => Math.min(9, 4 * lambda);     // how far from its mouth a front is followed, m
const M = new THREE.Matrix4(), C = new THREE.Color(), V = new THREE.Vector3();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A wavefront: light added to the picture, as bright as its instance says (the red of its colour).
function frontMaterial(shell) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: rgb(150, 196, 255) }, uWidth: { value: 0.008 }, uPix: { value: 0.001 } },
    vertexShader: `uniform float uWidth; uniform float uPix;
      varying float vB; varying vec3 vN; varying vec3 vV; varying float vZ;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        ${shell ? 'vec4 wp = m * vec4(position, 1.0);' : `vec4 wp = m * vec4(position - normal * ${TUBE.toFixed(3)}, 1.0);
        wp.xyz += normalize(mat3(m) * normal) * max(uWidth, max(0.0, -(viewMatrix * wp).z) * uPix);`}
        vN = mat3(m) * normal; vV = cameraPosition - wp.xyz; vZ = position.z;
        #ifdef USE_INSTANCING_COLOR
          vB = instanceColor.r;
        #else
          vB = 0.0;
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `uniform vec3 uColor;
      varying float vB; varying vec3 vN; varying vec3 vV; varying float vZ;
      void main() {
        ${shell ? `float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = vB * (0.035 + 0.6 * f * f * f + 0.35 * (1.0 - smoothstep(0.0, 0.035, vZ)));` : 'float a = vB;'}
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function createSandScene(stage, bed0) {
  let bed = bed0, list = [];
  const group = new THREE.Group(), labels = [];
  const { nx, ny, cell, width, depth } = bed, n = nx * ny;

  // ---------------------------------------------------------------- the sand: its surface, and its cut face down to the floor
  const sides = [
    { n: nx, at: (s) => (ny - 1) * nx + s, nrm: [0, 0, 1] },             // the near edge, x rising
    { n: ny, at: (s) => (ny - 1 - s) * nx + nx - 1, nrm: [1, 0, 0] },    // the right edge, y falling
    { n: nx, at: (s) => nx - 1 - s, nrm: [0, 0, -1] },                   // the far edge, x falling
    { n: ny, at: (s) => s * nx, nrm: [-1, 0, 0] },                       // the left edge, y rising
  ];
  const total = n + 4 * (nx + ny);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3).fill(0.5);
  const index = new Uint32Array((nx - 1) * (ny - 1) * 6 + (2 * (nx - 1) + 2 * (ny - 1)) * 6), src = [];
  const X = (i) => (i === 0 ? 0 : i === nx - 1 ? width : (i + 0.5) * cell), Z = (j) => (j === 0 ? 0 : j === ny - 1 ? depth : (j + 0.5) * cell);
  let q = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = X(i); pos[k + 2] = Z(j); nor[k + 1] = 1; }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + nx, c = a + 1, d = b + 1;
    index[q++] = a; index[q++] = b; index[q++] = c; index[q++] = c; index[q++] = b; index[q++] = d;
  }
  { let v = n;
    for (const S of sides) {
      for (let s = 0; s < S.n; s++) {
        const g = S.at(s) * 3, t = v + s * 2, b = t + 1;
        pos[t * 3] = pos[b * 3] = pos[g]; pos[t * 3 + 2] = pos[b * 3 + 2] = pos[g + 2];
        nor.set(S.nrm, t * 3); nor.set(S.nrm, b * 3);
        src.push(t, S.at(s));
        if (s < S.n - 1) { index[q++] = t; index[q++] = b; index[q++] = t + 2; index[q++] = t + 2; index[q++] = b; index[q++] = b + 2; }
      }
      v += S.n * 2;
    } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.25 }));
  sand.receiveShadow = true; sand.frustumCulled = false;
  group.add(sand);
  // each cell's own grain: a fixed speckle, so the sand is sand and not paint
  const grain = new Float32Array(n);
  for (let k = 0; k < n; k++) { let x = (k * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; grain[k] = 0.94 + 0.12 * ((x >>> 0) / 4294967296); }

  // the sand's heights, and which way each cell faces
  function relief() {
    const h = bed.h;
    for (let k = 0; k < n; k++) pos[k * 3 + 1] = h[k];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, L = i > 0, R = i < nx - 1, U = j > 0, D = j < ny - 1;
      const sx = (h[L ? k - 1 : k] - h[R ? k + 1 : k]) / ((L && R ? 2 : 1) * cell), sz = (h[U ? k - nx : k] - h[D ? k + nx : k]) / ((U && D ? 2 : 1) * cell);
      const m = 1 / Math.hypot(sx, 1, sz);
      nor[k * 3] = sx * m; nor[k * 3 + 1] = m; nor[k * 3 + 2] = sz * m;
    }
    for (let s = 0; s < src.length; s += 2) pos[src[s] * 3 + 1] = h[src[s + 1]];
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  }

  // What the sand is painted with. `show` is the old three maps (the sand itself, the level in dB,
  // the surface wind); over it, while the sound is on, the pressure wave as it stands at the slowed
  // clock's instant `tau` (in periods): lighter on a crest, darker in a trough, from the phasor the
  // field left in each cell (pr, pi; another pair may be given: one horn's alone).
  function paint({ show = 'sand', waves = false, tau = 0, strength = 1, pr = bed.pr, pi = bed.pi } = {}) {
    const { h, wet, setH, p, u, uT, depth0 } = bed;
    let top = 0;
    if (waves) for (let k = 0; k < n; k++) { const a = pr[k] * pr[k] + pi[k] * pi[k]; if (a > top) top = a; }
    top = Math.sqrt(top);
    const gain = waves && top > 0 ? (show === 'sand' ? 0.38 : 0.2) * strength : 0, co = Math.cos(2 * Math.PI * tau) / (top || 1), si = Math.sin(2 * Math.PI * tau) / (top || 1);
    for (let k = 0; k < n; k++) {
      let r, g, b, m = grain[k];
      if (show === 'spl') {
        const t = clamp01((paToSpl(p[k]) - 110) / 60);                  // 110..170 dB
        r = 20 + 235 * t; g = 24 + 160 * t * t; b = 60 + 60 * (1 - t);
      } else if (show === 'wind') {
        const t = clamp01(u[k] / (3 * uT)), over = u[k] > uT;
        r = over ? 60 + 190 * t : 30; g = over ? 120 + 120 * t : 50 + 120 * t; b = over ? 40 : 90 + 140 * t;
      } else {
        // the sand: height as light, damp as darker ochre, set as pale stone; where the wind is over the threshold, warmer
        const t = clamp01((h[k] - 0.1) / 0.6), damp = wet[k] > 0, setd = damp && strengthAt(setH[k]) >= SET.walkableMPa;
        if (setd) { r = 214 + 30 * t; g = 206 + 30 * t; b = 186 + 30 * t; }
        else if (damp) { r = 120 + 60 * t; g = 92 + 46 * t; b = 56 + 30 * t; }
        else { r = 160 + 80 * t; g = 136 + 70 * t; b = 92 + 60 * t; }
        if (u[k] > uT) { r = Math.min(255, r + 18); b = Math.max(0, b - 10); }
        const rise = (h[k] - depth0) / 0.05;                             // and what the sound has raised or dug, 5 cm the full swing
        m *= 1 + 0.12 * (rise < -1 ? -1 : rise > 1 ? 1 : rise);
      }
      if (gain) { const x = pr[k] * co - pi[k] * si; m *= 1 + gain * (x < 0 ? -Math.sqrt(-x) : Math.sqrt(x)); }
      col[k * 3] = lin(r) * m; col[k * 3 + 1] = lin(g) * m; col[k * 3 + 2] = lin(b) * m;
    }
    for (let s = 0; s < src.length; s += 2) {
      const t = src[s] * 3, g = src[s + 1] * 3;
      for (let c = 0; c < 3; c++) { col[t + c] = col[g + c] * 0.78; col[t + 3 + c] = col[g + c] * 0.46; }
    }
    geo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the tray: glass that holds the sand (the sound model takes no echo from it)
  { const w1 = new THREE.PlaneGeometry(width, GLASS), w2 = w1.clone(), w3 = new THREE.PlaneGeometry(depth, GLASS).rotateY(Math.PI / 2), w4 = w3.clone();
    w1.translate(width / 2, GLASS / 2, depth); w2.translate(width / 2, GLASS / 2, 0); w3.translate(width, GLASS / 2, depth / 2); w4.translate(0, GLASS / 2, depth / 2);
    const glass = new THREE.Mesh(merge([w1, w2, w3, w4]), new THREE.MeshBasicMaterial({ color: rgb(170, 200, 255), transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
    const box = new THREE.BoxGeometry(width, GLASS, depth);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: rgb(150, 172, 215), transparent: true, opacity: 0.6 }));
    box.dispose();
    rim.position.set(width / 2, GLASS / 2, depth / 2);
    group.add(glass, rim); }

  // ---------------------------------------------------------------- the horns, each on its post
  const brass = bronze(), steel = new THREE.MeshStandardMaterial({ color: rgb(74, 78, 90), metalness: 0.7, roughness: 0.45, envMapIntensity: 0.8 });
  const ONE = new THREE.Color(1, 1, 1), LIT = new THREE.Color(1.5, 1.42, 1.25), DIM = new THREE.Color(0.4, 0.4, 0.42);
  let hornMesh = null, postMesh = null, cap = 0, hornKey = '', spec = null;
  const tags = [];
  function horns(l, sp, solo = -1) {
    list = l; spec = sp;
    const key = [sp.mouthDiameter, sp.throatDiameter, sp.length].map((x) => x.toFixed(4)).join();
    if (key !== hornKey || list.length > cap) {
      for (const m of [hornMesh, postMesh]) if (m) { group.remove(m); m.geometry.dispose(); m.dispose(); }
      cap = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, list.length))));
      hornMesh = new THREE.InstancedMesh(hornGeometry(sp, true), brass, cap);
      postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10).translate(0, 0.5, 0), steel, cap);
      for (const m of [hornMesh, postMesh]) { m.castShadow = true; m.frustumCulled = false; group.add(m); }
      hornKey = key;
    }
    const mt = sp.mouthDiameter / 2, th = Math.min(sp.throatDiameter / 2, mt * 0.98), waist = th * Math.exp(Math.log(mt / th) * 0.45);
    for (let i = 0; i < list.length; i++) {
      const h = list[i], y = bed.depth0 + h.z;
      hornMesh.setMatrixAt(i, aimMatrix(M, h, h.x, y, h.y));
      hornMesh.setColorAt(i, solo < 0 ? ONE : i === solo ? LIT : DIM);
      // the post, from the floor to the flare's underside a little behind the mouth
      V.set(h.aimX, h.aimZ || 0, h.aimY).normalize().multiplyScalar(-0.55 * sp.length);
      const up = y + V.y - waist;
      postMesh.setMatrixAt(i, up > 0.02 ? M.makeScale(1, up, 1).setPosition(h.x + V.x, 0, h.y + V.z) : M.makeScale(0, 0, 0));
    }
    hornMesh.count = postMesh.count = list.length;
    hornMesh.instanceMatrix.needsUpdate = postMesh.instanceMatrix.needsUpdate = true;
    if (hornMesh.instanceColor) hornMesh.instanceColor.needsUpdate = true;
    // its number, over each horn (while they are few), or over the one heard alone
    for (let i = 0; i < Math.max(tags.length, list.length); i++) {
      const on = i < list.length && (list.length <= 12 || i === solo);
      if (on && !tags[i]) tags[i] = stage.label(labels, 'tag');
      const L = tags[i];
      if (!L) continue;
      L.on = on;
      if (on) { L.say(String(i + 1)); L.el.classList.toggle('on', i === solo); L.pos.set(list[i].x, bed.depth0 + list[i].z + mt + 0.2, list[i].y); }
    }
  }

  // ---------------------------------------------------------------- the wavefronts
  // Crests of the wave straight from each mouth: spheres about its centre, a wavelength apart, of
  // radius λ·(frac(tau + phase/2π) + n). Drawn as two arcs each (level and upright) over the half
  // the horn faces; with three horns or fewer, the half-sphere itself as well.
  const ring = new THREE.TorusGeometry(1, TUBE, 6, 64, Math.PI);
  const arcGeo = merge([ring.clone().rotateX(Math.PI / 2), ring.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))]);
  const arcs = new THREE.InstancedMesh(arcGeo, frontMaterial(false), ARCS);
  // with many horns, the level arc alone: forty-two upright ones are a cage, not a picture
  const levels = new THREE.InstancedMesh(new THREE.TorusGeometry(1, TUBE, 6, 64, Math.PI).rotateX(Math.PI / 2), arcs.material, ARCS);
  const shells = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), frontMaterial(true), SHELLS);
  for (const m of [arcs, levels, shells]) { m.setColorAt(0, C.setRGB(0, 0, 0)); m.count = 0; m.frustumCulled = false; m.renderOrder = 2; group.add(m); }
  function fronts({ on = false, lambda = 1, tau = 0, solo = -1 } = {}) {
    const shown = !on ? [] : solo >= 0 ? (list[solo] ? [list[solo]] : []) : list;
    const reach = FRONT_REACH(lambda), few = shown.length <= 3, dim = 1 / Math.sqrt(Math.max(1, shown.length / 3));
    const into = shown.length <= 6 ? arcs : levels;
    let a = 0, s = 0;
    for (const h of shown) {
      const mouth = h.mouthDiameter / 2, t = tau + (h.phase || 0) / (2 * Math.PI), fr = t - Math.floor(t);
      for (let k = 0; k < 6; k++) {
        const r = lambda * (fr + k);
        if (r >= reach) break;
        if (r < mouth * 0.5) continue;                                    // a crest is not drawn inside the horn
        // fainter as it spreads (the level falls as 1/r; the picture uses its root, to be seen), born softly, gone at the reach
        const far = r / reach, fade = (1 - far * far) * Math.min(1, r / (0.2 * lambda)) * dim, b = Math.sqrt(mouth / Math.max(r, mouth));
        aimMatrix(M, h, h.x, bed.depth0 + h.z, h.y, r);
        if (a < ARCS) { into.setMatrixAt(a, M); into.setColorAt(a, C.setRGB(fade * (0.28 + b), 0, 0)); a++; }
        if (few && s < SHELLS) { shells.setMatrixAt(s, M); shells.setColorAt(s, C.setRGB(fade * 0.6 * b, 0, 0)); s++; }
      }
    }
    arcs.count = into === arcs ? a : 0; levels.count = into === levels ? a : 0; shells.count = s;
    arcs.material.uniforms.uPix.value = stage.pix() * 0.8;
    for (const m of [into, shells]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- the tool's ring, and where a ray lands
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: rgb(255, 226, 150), transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false }));
  mark.renderOrder = 5; mark.visible = false; group.add(mark);
  const heightAt = (x, y) => bed.h[Math.max(0, Math.min(ny - 1, Math.floor(y / cell))) * nx + Math.max(0, Math.min(nx - 1, Math.floor(x / cell)))];
  function cursor(x = null, y = 0, r = 0.3) {
    mark.visible = x !== null;
    if (x !== null) { mark.position.set(x, heightAt(x, y) + 0.012, y); mark.scale.setScalar(Math.max(r, 0.02)); }
  }
  // the nearest horn the ray passes (unless `plain`), else the bed, else the ground
  function hit(rc) {
    const o = rc.ray.origin, d = rc.ray.direction;
    let best = -1, near = Infinity;
    if (!scene.plain) for (let i = 0; i < list.length; i++) {
      const h = list[i], R = Math.max(0.3, h.mouthDiameter / 2);
      V.set(h.x, bed.depth0 + h.z, h.y).sub(o);
      const along = V.dot(d), off = V.lengthSq() - along * along;
      if (along > 0 && off < R * R && along - Math.sqrt(R * R - off) < near) { near = along - Math.sqrt(R * R - off); best = i; }
    }
    if (best >= 0) { const h = list[best]; return { horn: best, on: 'horn', x: h.x, y: h.y, point: [h.x, bed.depth0 + h.z, h.y] }; }
    if (d.y > -1e-6) return null;
    for (const [Y, on] of [[bed.depth0, 'bed'], [0, 'ground']]) {
      const t = (Y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
      if (t <= 0 || (on === 'bed' && (x < 0 || x > width || z < 0 || z > depth))) continue;
      return { horn: -1, on, x, y: z, point: [x, Y, z] };
    }
    return null;
  }

  const wide = stage.label(labels).say(`${width} m`), deep = stage.label(labels).say(`${depth} m`);
  wide.pos.set(width / 2, 0, depth + 0.55); wide.on = true; deep.pos.set(width + 0.6, 0, depth / 2); deep.on = true;

  const scene = {
    name: 'sand', group, labels, plain: false,
    say: `the sandbox in three dimensions: a bed of sand ${width} by ${depth} metres in a glass tray, and the horns standing on it`,
    orbit: createOrbit({ target: [width / 2, 0.3, depth / 2 + 0.2], dist: 15.5, polar: 0.98, az: -0.42, fov: 40, minDist: 0.6, maxDist: 80, minPolar: 0.02, maxPolar: 1.5, box: [[-10, 0, -10], [width + 10, 3, depth + 10]] }),
    fog: [34, 230], far: 800, cell: 1,
    sun: { center: [width / 2, 0, depth / 2], radius: 11, dir: [0.62, 0.5, -0.6] },
    hit, horns, relief, paint, fronts, cursor,
    bed(b) { bed = b; },
  };
  relief(); paint();
  return scene;
}
