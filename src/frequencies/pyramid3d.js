// ============================================================================
// The pyramid in the round (browser only: three.js), 1:1 from Petrie's survey:
// every course a slab of its own side and thickness, jointed at the block
// module, shaded where one course meets the next; the course being made as a
// slab that rises as its aggregate arrives, darker while damp and paler as it
// sets; the plan's horns shoulder to shoulder around it, each at its true size
// on a post from the ledge below, riding half a metre above the surface; the
// finished outline; and a person, 1.75 m, at a corner of the base. A low sun.
//
// While the sound is on, the fronts leave each line of horns a wavelength
// apart on the slowed clock and die out where the tone shocks; on the course,
// the plan's lattice (two crossed standing waves, nodes a block apart)
// breathes where that sound reaches. It is the plan, not a field solved for a
// thousand horns.
// ============================================================================
import * as THREE from 'three';
import { createOrbit } from './orbit.mjs';
import { wavelength } from './acoustics.mjs';
import { BASE_M, HEIGHT_M, STONE, LATTICE_HZ } from './pyramid.mjs';
import { rgb, lin, patch, hornGeometry, aimMatrix, bronze, glowing, withGlow } from './kit.js';

const HORNS = 1280, FRONTS = 48, LAMBDA = wavelength(LATTICE_HZ);
const M = new THREE.Matrix4(), C = new THREE.Color(), V = new THREE.Vector3(), S = new THREE.Vector3();
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const sideAt = (y) => BASE_M * (1 - y / HEIGHT_M);

export function createPyramidScene(stage, { rows, spec, reach = 9 }) {
  const group = new THREE.Group(), labels = [];

  // ---------------------------------------------------------------- the courses built
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rowOf = new Float32Array(rows.length), info = new Float32Array(rows.length * 3);
  for (let i = 0; i < rows.length; i++) {
    rowOf[i] = i;
    info.set([rows[i].bottom, rows[i].top, i + 1 < rows.length ? rows[i + 1].side / 2 : 0], i * 3);
  }
  box.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowOf, 1));
  box.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 3));
  const stone = patch(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: 0.3 }), 'stone', {
    uniforms: { uPitch: { value: STONE.blockPlanM } },
    vertexHead: 'attribute float aRow;\nattribute vec3 aInfo;\nvarying float vRow;\nvarying vec3 vInfo;\n', vertex: 'vRow = aRow; vInfo = aInfo;\n',
    fragmentHead: 'uniform float uPitch;\nvarying float vRow;\nvarying vec3 vInfo;\nfloat blockTone(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n',
    // the joints between blocks: a square grid on a course's top, upright joints on its face,
    // staggered course by course; and the shade where a riser meets the ledge below it, and
    // where a ledge meets the riser of the course above
    fragment: `
      vec3 fN = normalize(cross(dFdx(vWp), dFdy(vWp)));
      bool flat_ = abs(fN.y) > 0.5;
      vec2 bq = flat_ ? vWp.xz / uPitch : vec2((abs(fN.x) > 0.5 ? vWp.z : vWp.x) / uPitch + fract(vRow * 0.618034), 0.5);
      vec2 bw = max(fwidth(bq), vec2(1e-6));
      vec2 bl = 1.0 - min(abs(fract(bq - 0.5) - 0.5) / (bw * 1.2), 1.0);
      float bSeen = 1.0 - smoothstep(0.1, 0.45, flat_ ? max(bw.x, bw.y) : bw.x);
      float joint = (flat_ ? max(bl.x, bl.y) : bl.x) * bSeen;
      float nook = flat_ ? (vInfo.z > 0.0 ? smoothstep(0.0, 0.55, max(abs(vWp.x), abs(vWp.z)) - vInfo.z) : 1.0)
                         : smoothstep(0.0, 0.4, vWp.y - vInfo.x);
      diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * blockTone(floor(bq) + vRow * 17.0), bSeen) * (1.0 - 0.5 * joint) * mix(0.58, 1.0, nook);`,
  });
  const courses = new THREE.InstancedMesh(box, stone, rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], k = 1 + 0.04 * Math.sin(i * 12.9898) * (i % 2 ? 1 : -1), pale = r.surveyed ? 1 : 1.12;
    courses.setMatrixAt(i, M.makeScale(r.side, r.thickness, r.side).setPosition(0, r.bottom + r.thickness / 2, 0));
    courses.setColorAt(i, C.setRGB(lin(212) * k * pale, lin(192) * k * pale, lin(154) * k * pale));
  }
  courses.count = 0; courses.castShadow = true; courses.receiveShadow = true; courses.frustumCulled = false;
  group.add(courses);

  // ---------------------------------------------------------------- the course being made
  const wave = { uTau: { value: 0 }, uOn: { value: 0 }, uPitch: { value: STONE.blockPlanM }, uHalf: { value: 1 }, uReach: { value: reach },
    uSet: { value: 0 }, uDry: { value: rgb(214, 198, 162) } };
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), patch(new THREE.MeshStandardMaterial({ color: rgb(170, 140, 96), roughness: 0.97, metalness: 0, envMapIntensity: 0.25 }), 'working', {
    uniforms: wave,
    fragmentHead: 'uniform float uTau;\nuniform float uOn;\nuniform float uPitch;\nuniform float uHalf;\nuniform float uReach;\nuniform float uSet;\nuniform vec3 uDry;\n',
    fragment: `
      diffuseColor.rgb = mix(diffuseColor.rgb, uDry, uSet);
      vec3 sN = normalize(cross(dFdx(vWp), dFdy(vWp)));
      vec2 lq = vWp.xz / uPitch, lw = fwidth(lq);
      float lattice = 0.5 * (cos(3.14159265 * lq.x) + cos(3.14159265 * lq.y));
      float reached = exp(-max(uHalf - max(abs(vWp.x), abs(vWp.z)), 0.0) / uReach);
      float seen = uOn * step(0.5, abs(sN.y)) * reached * (1.0 - smoothstep(0.12, 0.55, max(lw.x, lw.y)));
      vec2 rq = abs(fract(lq + 0.5) - 0.5) / max(lw * 1.5, vec2(0.07));          // the ridges, where the air is still, a block apart
      float ridge = 1.0 - min(min(rq.x, rq.y), 1.0);
      diffuseColor.rgb *= (1.0 + seen * 0.34 * lattice * cos(6.2831853 * uTau)) * (1.0 + seen * 0.22 * ridge);`,
  }));
  slab.visible = false; slab.castShadow = true; slab.receiveShadow = true;
  group.add(slab);

  // ---------------------------------------------------------------- its horns, each on a post from the ledge below
  const mt = spec.mouthDiameter / 2, th = Math.min(spec.throatDiameter / 2, mt * 0.98), waist = th * Math.exp(Math.log(mt / th) * 0.45);
  const metal = glowing(bronze()); metal.roughness = 0.42;   // a thousand horns: a little less mirror, so their facets do not glitter
  const horns = new THREE.InstancedMesh(withGlow(hornGeometry(spec, 'mid'), HORNS), metal, HORNS);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: rgb(74, 78, 90), metalness: 0.7, roughness: 0.45, envMapIntensity: 0.8 }), HORNS);
  for (const m of [horns, posts]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; group.add(m); }

  // ---------------------------------------------------------------- the fronts leaving each line of horns: flat lines on the course,
  // as wide as a pixel or two at any distance (the vertex shader widens them with their depth)
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
  quad.setIndex([0, 2, 1, 0, 3, 2]);
  const frontU = { uColor: { value: rgb(176, 214, 255) }, uWidth: { value: 0.32 }, uPix: { value: 0.001 } };
  const fronts = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, uniforms: frontU,
    vertexShader: `uniform float uWidth; uniform float uPix; varying float vB; varying float vA;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 c = m * vec4(position.x, 0.0, 0.0, 1.0);
        vec3 across = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
        float w = max(uWidth, max(0.0, -(viewMatrix * c).z) * uPix);
        vA = position.z * 2.0;
        #ifdef USE_INSTANCING_COLOR
          vB = instanceColor.r;
        #else
          vB = 0.0;
        #endif
        gl_Position = projectionMatrix * viewMatrix * vec4(c.xyz + across * position.z * w, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vB; varying float vA;
      void main() {
        gl_FragColor = vec4(uColor * vB * exp(-5.0 * vA * vA), 1.0);
        #include <colorspace_fragment>
      }`,
  }), FRONTS);
  fronts.count = 0; fronts.frustumCulled = false; fronts.renderOrder = 5;
  fronts.setColorAt(0, C.setRGB(0, 0, 0));
  group.add(fronts);

  // ---------------------------------------------------------------- the finished outline, and a person
  { const b = BASE_M / 2, p = [];
    const corners = [[-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b]];
    for (let i = 0; i < 4; i++) p.push(...corners[i], ...corners[(i + 1) % 4], ...corners[i], 0, HEIGHT_M, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: rgb(236, 226, 206), transparent: true, opacity: 0.35, depthWrite: false }))); }
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.31, 4, 12), new THREE.MeshStandardMaterial({ color: rgb(236, 238, 246), roughness: 0.6, emissive: rgb(90, 100, 130) }));
  person.position.set(BASE_M / 2 + 4, 0.875, BASE_M / 2 + 4); person.castShadow = true;
  group.add(person);

  // the far side of the desert: a low ring of dunes rising beyond three kilometres, so the horizon is
  // land and not only haze (the picture's, not the survey's)
  { const n = 360, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const h = 18 + 30 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3)) * (0.55 + 0.45 * Math.sin(a * 11 + 0.4)) + 9 * Math.sin(a * 29 + 2.1) + 4 * Math.sin(a * 71);
      pos.push(c * 2900, -0.5, s * 2900, c * 3700, h, s * 3700, c * 4600, h * 0.55, s * 4600);
    }
    for (let i = 0; i < n; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: rgb(156, 128, 98), roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.2 }))); }

  const lBase = stage.label(labels).say(`${BASE_M.toFixed(2)} m`), lTop = stage.label(labels).say(`${HEIGHT_M.toFixed(2)} m`), lCourse = stage.label(labels, 'tag on'), lPerson = stage.label(labels).say('a person, 1.75 m');
  lBase.pos.set(0, 0, BASE_M / 2 + 9); lBase.on = true;
  lTop.pos.set(0, HEIGHT_M + 5, 0); lTop.on = true;
  lPerson.pos.set(BASE_M / 2 + 4, 4.6, BASE_M / 2 + 4); lPerson.on = true;

  // ---------------------------------------------------------------- where the build stands
  // built: how many courses are done; current: the course being made (a schedule row) or null;
  // part: how much of its aggregate has arrived, 0..1; setPart: how far it has set, 0..1; list:
  // its horns (x and y from the axis, z above the working surface); tau: the slowed clock;
  // sound: whether the tone is on.
  let top = 0, shownCourse = -1, shownTop = -1;
  function set({ built = 0, current = null, part = 0, setPart = 0, list = [], tau = 0, sound = false } = {}) {
    courses.count = built;
    slab.visible = !!current; lCourse.on = !!current;
    let nf = 0;
    if (current) {
      const t = Math.max(0.04, current.thickness * part);
      slab.scale.set(current.side, t, current.side); slab.position.set(0, current.bottom + t / 2, 0);
      top = current.bottom + t;
      lCourse.say(`course ${current.course}`); lCourse.pos.set(current.side / 2, top + 3, current.side / 2);
      if (shownCourse !== current.course || Math.abs(shownTop - top) > 0.005) {
        shownCourse = current.course; shownTop = top;
        const k = Math.min(list.length, HORNS);
        for (let i = 0; i < k; i++) {
          const h = list[i], y = top + h.z;
          horns.setMatrixAt(i, aimMatrix(M, h, h.x, y, h.y));
          V.set(h.aimX, h.aimZ || 0, h.aimY).normalize().multiplyScalar(-0.55 * spec.length);
          const up = y + V.y - waist - current.bottom;
          posts.setMatrixAt(i, up > 0.02 ? M.makeScale(1, up, 1).setPosition(h.x + V.x, current.bottom, h.y + V.z) : M.makeScale(0, 0, 0));
        }
        horns.count = posts.count = k;
        horns.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = true;
      }
      if (sound) {
        const far = Math.min(reach * 1.6, current.side * 0.98), edge = current.side / 2 + 0.1, ph = tau - Math.floor(tau);
        for (const [ax, ay] of SIDES) for (let k = 0; nf < FRONTS; k++) {
          const d = LAMBDA * (ph + k);
          if (d > far) break;
          const fade = (1 - d / far) ** 2 * Math.min(1, d / (0.2 * LAMBDA));
          M.makeRotationY(ax ? -Math.PI / 2 : 0).scale(S.set(current.side, 1, 1)).setPosition(ax ? ax * (edge - d) : 0, top + 0.04, ay ? ay * (edge - d) : 0);
          fronts.setMatrixAt(nf, M); fronts.setColorAt(nf, C.setRGB(fade * 0.6, 0, 0)); nf++;
        }
      }
    } else { top = built ? rows[built - 1].top : 0; horns.count = posts.count = 0; shownCourse = -1; }
    fronts.count = nf;
    if (nf) { fronts.instanceMatrix.needsUpdate = true; fronts.instanceColor.needsUpdate = true; frontU.uPix.value = stage.pix() * 3.2; }
    wave.uTau.value = tau; wave.uOn.value = sound && current ? 1 : 0; wave.uHalf.value = current ? current.side / 2 : 1; wave.uSet.value = setPart;
  }

  // each horn's share of what is heard where the camera stands, 0..1 (null: none)
  function glow(w) {
    const a = horns.geometry.attributes.aGlow;
    for (let i = 0; i < a.count; i++) a.array[i] = w && i < horns.count ? w[i] : 0;
    a.needsUpdate = true;
  }

  // where a ray lands: the pyramid as far as it is built (its ideal faces, and the working top), else the ground
  function hit(rc) {
    const o = rc.ray.origin, d = rc.ray.direction, b = BASE_M / 2, lean = BASE_M / (2 * HEIGHT_M);
    let best = Infinity;
    for (const [nx, nz] of SIDES) {
      const dn = nx * d.x + lean * d.y + nz * d.z;
      if (dn >= -1e-9) continue;
      const t = (b - (nx * o.x + lean * o.y + nz * o.z)) / dn, y = o.y + d.y * t, half = sideAt(y) / 2 + 0.01;
      if (t > 0 && t < best && y >= 0 && y <= top && Math.abs(nx ? o.z + d.z * t : o.x + d.x * t) <= half) best = t;
    }
    if (d.y < -1e-9) {
      const t = (top - o.y) / d.y, half = sideAt(top) / 2;
      if (t > 0 && t < best && top > 0 && Math.abs(o.x + d.x * t) <= half && Math.abs(o.z + d.z * t) <= half) best = t;
      const g = -o.y / d.y;
      if (g > 0 && g < best) best = g;
    }
    if (best === Infinity) return null;
    return { on: 'pyramid', point: [o.x + d.x * best, o.y + d.y * best, o.z + d.z * best] };
  }

  const sunDir = [Math.sin(0.7) * Math.cos(0.28), Math.sin(0.28), Math.cos(0.7) * Math.cos(0.28)];     // 16° up, from the south-east of the view
  return {
    name: 'pyr', group, labels,
    say: 'the Great Pyramid in three dimensions, at its true size, as far as the sound has built it',
    orbit: createOrbit({ target: [0, 52, 0], dist: 430, polar: 1.36, az: -0.62, fov: 40, minDist: 3, maxDist: 1600, minPolar: 0.02, maxPolar: 1.95, floor: 1.2,
      box: [[-450, 0, -450], [450, 160, 450]] }),
    fog: [900, 5200], far: 12000, cell: 10,
    sun: { center: [0, 40, 0], radius: 300, dir: sunDir, follow: true, least: 14, reach: 700, beyond: 900 },
    look: { top: rgb(20, 26, 58), mid: rgb(92, 84, 120), low: rgb(198, 158, 124), ground: rgb(150, 125, 96), line: rgb(132, 110, 86),
      sun: [rgb(255, 214, 172), 3.4], hemi: [rgb(120, 140, 200), rgb(118, 96, 72), 0.62], exposure: 1.0, glow: 1, grid: 0.4, dunes: 1 },
    hit, set, glow,
  };
}
