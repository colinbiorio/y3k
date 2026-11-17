// ============================================================================
// The pyramid in the round (browser only: three.js), 1:1 from Petrie's survey:
// every course a slab of its own side and thickness, jointed at the block
// module, shaded where one course meets the next; the course being made as a
// slab that rises as its aggregate arrives, darker while damp and paler as it
// sets; the plan's horns shoulder to shoulder around it, each at its true size
// on a post from the ledge below, riding half a metre above the surface; the
// finished outline; and a person, 1.75 m, at a corner of the base. A low
// morning sun, and the land round it all (land.js) under the morning's haze.
// When the last course is in, the casing is dressed from the top down: the
// pyramid white, as it stood.
//
// While the sound is on, the fronts leave each line of horns a wavelength
// apart on the slowed clock and die out where the tone shocks; on the course,
// the plan's lattice (two crossed standing waves, nodes a block apart)
// breathes where that sound reaches. It is the plan, not a field solved for a
// thousand horns.
// ============================================================================
import * as THREE from 'three';
import { createOrbit, ringDistance } from './orbit.mjs';
import { wavelength } from './acoustics.mjs';
import { BASE_M, HEIGHT_M, STONE, LATTICE_HZ } from './pyramid.mjs';
import { rgb, lin, patch, hazed, hornGeometry, aimMatrix, bronze, glowing, withGlow } from './kit.js';
import { createLand } from './land.js';
import { ELDERS, RIVER, heightAt } from './giza.mjs';
import { DRY_SLOPE } from './sand.mjs';
import { sunAt, sunDirection, lightFor } from './sun.mjs';

const HORNS = 1280, FRONTS = 48, LAMBDA = wavelength(LATTICE_HZ), HORN_NEAR = 40;      // m: nearer than this, the horns in their finer facets
const M = new THREE.Matrix4(), C = new THREE.Color(), V = new THREE.Vector3(), S = new THREE.Vector3();
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const sideAt = (y) => BASE_M * (1 - y / HEIGHT_M);

// the light at an hour of the day, by the sun (sun.mjs): the stage's look, and the sun's direction
export function skyAt(hours) {
  const at = sunAt(hours), L = lightFor(at.elevation), c = (v) => rgb(...v.map((x) => Math.round(x)));
  return { at, dir: sunDirection(at), look: { top: c(L.top), mid: c(L.mid), low: c(L.low), warm: c(L.warm), sun: [c(L.sun), L.power],
    hemi: [c(L.hemi[0]), c(L.hemi[1]), L.hemi[2]], env: L.env, exposure: L.exposure, glow: L.glow } };
}

export function createPyramidScene(stage, { rows, spec, reach = 9, hours = 8.25 }) {
  const group = new THREE.Group(), labels = [], air = stage.air;

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
    air, uniforms: { uPitch: { value: STONE.blockPlanM } },
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

  // ---------------------------------------------------------------- the casing, once the last course is in
  // White Tura limestone on the ideal faces (Petrie's 230.35 m and 146.71 m), in the courses' own
  // bands. Its joints were half a millimetre (Petrie), so they are only the faintest lines close by.
  // When the build is done it is dressed from the top down, a course at a time, over DRESS_S
  // seconds of the clock on the wall. Drawn, not simulated (the dossier's §5 leaves the casing out);
  // no pyramidion of the Great Pyramid survives, so the apex is in the casing's own stone, as the
  // one found beside Sneferu's Red Pyramid is.
  const DRESS_S = 4, still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const casingU = { uFront: { value: HEIGHT_M + 1 }, uFresh: { value: 0 } };
  const casing = new THREE.Mesh((() => {
    const pos = [], band = [], b2 = BASE_M / 2, half = (y) => b2 * Math.max(0, 1 - y / HEIGHT_M);
    const quad = (a, b, c, d) => { for (const v of [a, b, d, a, d, c]) pos.push(...v); };      // a b along the foot, c d above them
    for (let i = 0; i < rows.length; i++) {
      const y0 = rows[i].bottom, y1 = Math.min(rows[i].top, HEIGHT_M), h0 = half(y0), h1 = half(y1);
      for (const [nx, nz] of SIDES) {
        // seen from outside, going anticlockwise round the pyramid from above: left foot, right foot
        const tx = nz, tz = -nx;
        quad([nx * h0 - tx * h0, y0, nz * h0 - tz * h0], [nx * h0 + tx * h0, y0, nz * h0 + tz * h0],
             [nx * h1 - tx * h1, y1, nz * h1 - tz * h1], [nx * h1 + tx * h1, y1, nz * h1 + tz * h1]);
        for (let k = 0; k < 6; k++) band.push(i, y0, y1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aBand', new THREE.Float32BufferAttribute(band, 3));
    g.computeVertexNormals();
    return g;
  })(), patch(new THREE.MeshStandardMaterial({ color: rgb(230, 222, 204), roughness: 0.42, metalness: 0, envMapIntensity: 0.2 }), 'casing', {
    air, uniforms: casingU,
    vertexHead: 'attribute vec3 aBand;\nvarying vec3 vBand;\n', vertex: 'vBand = aBand;\n',
    fragmentHead: `uniform float uFront; uniform float uFresh; varying vec3 vBand;
      float caseTone(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float caseNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(caseTone(i), caseTone(i + vec2(1.0, 0.0)), u.x), mix(caseTone(i + vec2(0.0, 1.0)), caseTone(i + vec2(1.0, 1.0)), u.x), u.y); }\n`,
    // dressed down to the front only; a bed joint at each course's foot and upright joints a block
    // apart, staggered course by course, hairlines a pixel at most and gone once a pixel is wider than
    // a few centimetres; each course and each block a shade of its own (the courses read as faint bands
    // from afar, as the Bent Pyramid's casing does); the stone's own mottle close by; sand blown against
    // its foot; the face just dressed a little brighter
    fragment: `
      if (vWp.y < uFront - 0.001) discard;
      vec3 cN = normalize(cross(dFdx(vWp), dFdy(vWp)));
      float bw = 1.5 + fract(sin(vBand.x * 12.9898) * 43758.5453);
      float uq = (abs(cN.x) > abs(cN.z) ? vWp.z : vWp.x) / bw + fract(vBand.x * 0.618034);
      float py = max(fwidth(vWp.y), 1e-5), pu = max(fwidth(uq) * bw, 1e-5);
      float bed = (1.0 - smoothstep(0.0, py * 1.2, vWp.y - vBand.y)) * (1.0 - smoothstep(0.02, 0.08, py));
      float rise = (1.0 - min(abs(fract(uq - 0.5) - 0.5) * bw / (pu * 1.2), 1.0)) * (1.0 - smoothstep(0.02, 0.08, pu));
      float bandSeen = 1.0 - smoothstep(0.25, 0.6, py / max(vBand.z - vBand.y, 0.05));
      float tone = 1.0 + bandSeen * 0.05 * (caseTone(vec2(vBand.x, 3.7)) - 0.5) + 0.07 * (caseTone(vec2(floor(uq), vBand.x)) - 0.5) * (1.0 - smoothstep(0.1, 0.5, pu));
      tone *= 1.0 + 0.06 * (caseNoise(vec2(uq * bw, vWp.y) / 0.45) - 0.5) * (1.0 - smoothstep(0.02, 0.1, max(py, pu)));
      diffuseColor.rgb *= (1.0 - 0.2 * max(bed, rise)) * tone;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.47, 0.3), 0.22 * (1.0 - smoothstep(0.0, 9.0, vWp.y)));
      totalEmissiveRadiance += vec3(1.0, 0.93, 0.8) * uFresh * 0.35 * (1.0 - smoothstep(0.0, 2.5, vWp.y - uFront));`,
  }));
  casing.visible = false; casing.castShadow = true; casing.receiveShadow = true;
  group.add(casing);

  // ---------------------------------------------------------------- the course being made
  // While its aggregate arrives (part 0..1) the sand is dry, and the sound heaps it where the air is
  // still, a block apart: ridges that rise first and that the cells then fill toward (as far in
  // from the horns as their sound reaches: the plan's, §5). The low sun shades each ridge's lee.
  // Where the air moves, between the ridges, grains hop and catch the light while the tone sounds.
  // Then the binder: the cells go dark and wet and mirror the sky, and dry in patches to stone,
  // the ridges left as the joints between the blocks.
  const wave = { uTau: { value: 0 }, uOn: { value: 0 }, uPitch: { value: STONE.blockPlanM }, uHalf: { value: 1 }, uReach: { value: reach },
    uPart: { value: 0 }, uWet: { value: 0 }, uSet: { value: 0 }, uTime: { value: 0 },
    uSand: { value: rgb(206, 188, 152) }, uPaste: { value: rgb(134, 118, 96) }, uDry: { value: rgb(214, 198, 162) } };
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), patch(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }), 'working', {
    air, uniforms: wave,
    fragmentHead: `uniform float uTau; uniform float uOn; uniform float uPitch; uniform float uHalf; uniform float uReach;
      uniform float uPart; uniform float uWet; uniform float uSet; uniform float uTime; uniform vec3 uSand; uniform vec3 uPaste; uniform vec3 uDry;
      float wh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float wn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), u.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), u.x), u.y); }\n`,
    fragment: `
      vec3 sN = normalize(cross(dFdx(vWp), dFdy(vWp)));
      float onTop = step(0.5, abs(sN.y));
      vec2 lq = vWp.xz / uPitch, lw = fwidth(lq);
      float lwm = max(lw.x, lw.y), px = lwm * uPitch, close = 1.0 - smoothstep(0.1, 0.45, lwm);
      float reached = exp(-max(uHalf - max(abs(vWp.x), abs(vWp.z)), 0.0) / uReach);
      // how far, and to which side, the nearest still line lies across x and across z (the lines at whole
      // blocks): a still line is not ruled, so it wanders a few centimetres
      vec2 off = fract(lq + 0.5 + 0.025 * vec2(sin(vWp.z * 2.3 + 1.7 * wn(vWp.zx / 1.9)), sin(vWp.x * 2.1 + 1.7 * wn(vWp.xz / 2.1)))) - 0.5, cd = abs(off) * uPitch;
      // the binder, once the sand is in: wet, then drying to stone from the course's edges inward, in ragged fronts
      float inward = clamp(max(uHalf - max(abs(vWp.x), abs(vWp.z)), 0.0) / max(uHalf, 1.0), 0.0, 1.0);
      float dryAt = 0.1 + 0.5 * inward + 0.3 * wn(vWp.xz / 8.0 + 3.7), dry = smoothstep(dryAt - 0.05, dryAt + 0.05, uSet);
      float stone = uWet * dry;
      // the ridges: heaps at dry sand's angle of repose (34°, sand.mjs), so half again as wide as they are tall; up first,
      // then the cells fill toward their tops; level once stone. Seen only while a ridge is a few pixels wide.
      float A = 0.12 * smoothstep(0.0, 0.3, uPart) * (1.0 - 0.7 * smoothstep(0.5, 1.0, uPart)) * reached * onTop * (1.0 - stone)
              * (0.75 + 0.5 * wn(vWp.xz / 0.8 + 11.0));
      float wb = max(A / ${DRY_SLOPE.toFixed(4)}, 1e-4), seenR = smoothstep(1.0, 3.0, wb / px);
      float rx = max(0.0, 1.0 - cd.x / wb), rz = max(0.0, 1.0 - cd.y / wb), hr = max(rx, rz), hp = A * hr;
      // the low sun's shade on a ridge's lee and beyond it, across x and across z
      vec3 sd = normalize(uSunDir);
      vec2 up = vec2(sd.x > 0.0 ? 1.0 - fract(lq.x) : fract(lq.x), sd.z > 0.0 ? 1.0 - fract(lq.y) : fract(lq.y)) * uPitch;
      vec2 rise = up * sd.y / max(abs(sd.xz), vec2(1e-3));
      float shade = max(clamp((A - hp - rise.x) / 0.012, 0.0, 1.0), clamp((A - hp - rise.y) / 0.012, 0.0, 1.0)) * seenR;
      float wet = uWet * (1.0 - dry) * (1.0 - 0.55 * hr * seenR);
      float grain = px < 0.02 ? (1.0 - smoothstep(0.006, 0.02, px)) * (wh(floor(vWp.xz / 0.012)) - 0.5) : 0.0;
      vec3 c = uSand * (0.94 + 0.08 * wn(vWp.xz / 3.1) + 0.06 * hr * seenR + 0.1 * grain);
      c = mix(c, uPaste * (0.9 + 0.15 * wn(vWp.xz / 1.7)), wet);
      c = mix(c, uDry * (0.95 + 0.07 * wn(vWp.xz / 2.3)), stone);
      // the joints where the ridges were, once it is stone (a pixel wide at most, as on the courses built)
      vec2 jl = 1.0 - min(cd / uPitch / max(lw * 1.2, vec2(1e-5)), vec2(1.0));
      c *= 1.0 - 0.45 * max(jl.x, jl.y) * close * stone * onTop;
      // the sound on the course: the plan's lattice breathing on the slowed clock, where it reaches
      c *= 1.0 + uOn * onTop * reached * close * 0.16 * 0.5 * (cos(3.14159265 * lq.x) + cos(3.14159265 * lq.y)) * cos(6.2831853 * uTau);
      c *= (1.0 - 0.5 * shade) * (1.0 - 0.18 * (A / 0.12) * (1.0 - seenR));
      diffuseColor.rgb = c;`,
    normal: `
      {
        // a ridge's two faces, at the angle of repose
        vec2 g = rx >= rz ? vec2(rx > 0.0 ? -${DRY_SLOPE.toFixed(4)} * sign(off.x) * tanh(cd.x / (0.22 * wb)) : 0.0, 0.0)
                          : vec2(0.0, rz > 0.0 ? -${DRY_SLOPE.toFixed(4)} * sign(off.y) * tanh(cd.y / (0.22 * wb)) : 0.0);
        g *= seenR * step(1e-4, A);
        normal = normalize(normal + mat3(viewMatrix) * vec3(-g.x, 0.0, -g.y));
        roughnessFactor = mix(roughnessFactor, 0.3, wet);
        // grains hopping where the air moves, catching the sun and losing it, close by, while the tone sounds
        float mob = uOn * reached * onTop * (1.0 - uWet) * smoothstep(0.08, 0.3, min(cd.x, cd.y)) * (1.0 - smoothstep(0.012, 0.03, px));
        if (mob > 0.0) {
          vec2 gq = vWp.xz / 0.03, gc = floor(gq);
          float glint = step(0.84, wh(gc + 3.3)) * smoothstep(0.32, 0.08, length(fract(gq) - 0.5))
                      * pow(max(0.0, sin(uTime * (5.0 + 9.0 * wh(gc + 7.1)) + 6.2831853 * wh(gc))), 24.0);
          totalEmissiveRadiance += uSunCol * glint * mob * 1.4;
        }
      }`,
    post: `
      if (wet * onTop > 0.0) {
        vec3 wv = normalize(vWp - cameraPosition);
        float fres = 0.02 + 0.98 * pow(1.0 - clamp(-wv.y, 0.0, 1.0), 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(skyAt(reflect(wv, vec3(0.0, 1.0, 0.0))), 1.0)).rgb, wet * onTop * fres * 0.5);
      }`,
  }));
  slab.visible = false; slab.castShadow = true; slab.receiveShadow = true;
  group.add(slab);

  // ---------------------------------------------------------------- its horns, each on a post from the ledge below
  const mt = spec.mouthDiameter / 2, th = Math.min(spec.throatDiameter / 2, mt * 0.98), waist = th * Math.exp(Math.log(mt / th) * 0.45);
  const metal = glowing(bronze(), air); metal.roughness = 0.42;   // a thousand horns: a little less mirror, so their facets do not glitter
  const horns = new THREE.InstancedMesh(withGlow(hornGeometry(spec, 'mid'), HORNS), metal, HORNS);
  // farther off, the same horns in fewer facets (a thousand of them are most of what is drawn): one set of places and one of light
  const farGeo = withGlow(hornGeometry(spec, false), HORNS);
  farGeo.setAttribute('aGlow', horns.geometry.getAttribute('aGlow'));
  const hornsFar = new THREE.InstancedMesh(farGeo, metal, HORNS);
  hornsFar.instanceMatrix = horns.instanceMatrix;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0),
    hazed(new THREE.MeshStandardMaterial({ color: rgb(74, 78, 90), metalness: 0.7, roughness: 0.45, envMapIntensity: 0.8 }), 'post', air), HORNS);
  for (const m of [horns, hornsFar, posts]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; group.add(m); }

  // ---------------------------------------------------------------- the fronts leaving each line of horns: flat lines on the course,
  // as wide as a pixel or two at any distance (the vertex shader widens them with their depth)
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
  quad.setIndex([0, 2, 1, 0, 3, 2]);
  const frontU = { uColor: { value: rgb(176, 214, 255) }, uWidth: { value: 0.24 }, uPix: { value: 0.001 } };
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

  // ---------------------------------------------------------------- the finished outline (until the casing stands on it), and a person
  let outline = null;
  { const b = BASE_M / 2, p = [];
    const corners = [[-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b]];
    for (let i = 0; i < 4; i++) p.push(...corners[i], ...corners[(i + 1) % 4], ...corners[i], 0, HEIGHT_M, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    outline = new THREE.LineSegments(g, hazed(new THREE.LineBasicMaterial({ color: rgb(236, 226, 206), transparent: true, opacity: 0.35, depthWrite: false }), 'outline', air));
    group.add(outline); }
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.31, 4, 12), hazed(new THREE.MeshStandardMaterial({ color: rgb(236, 238, 246), roughness: 0.6, emissive: rgb(90, 100, 130) }), 'person', air));
  person.position.set(BASE_M / 2 + 4, 0.875, BASE_M / 2 + 4); person.castShadow = true;
  group.add(person);

  // the land, the valley, the river and the elder pyramids on the southern horizon (land.js), with their names
  const land = createLand(air);
  group.add(land.group);
  const far = (say, x, y, z) => { const L = stage.label(labels, 'far').say(say); L.pos.set(x, y, z); L.on = true; return L; };
  // (the two at Dahshur stand nearly in a line from here: one name for both)
  const km = (e) => Math.round(Math.hypot(e.x, e.z) / 1000), [dj, red, bent] = ELDERS;
  // (Djoser's is always the eastern, left of them looking south: its name stands to the left of its stem)
  far(`${dj.name} · ${km(dj)} km`, dj.x, heightAt(dj.x, dj.z) + dj.height, dj.z).el.classList.add('west');
  far(`Sneferu’s Red and Bent, at Dahshur · ${km(red)}, ${km(bent)} km`, red.x, heightAt(red.x, red.z) + red.height, red.z).el.classList.add('east');
  { const z = -2600, x = RIVER[2][0] + ((RIVER[3][0] - RIVER[2][0]) * (z - RIVER[2][1])) / (RIVER[3][1] - RIVER[2][1]) + 210 * Math.sin(z / 2300 + 1.1) + 80 * Math.sin(z / 870);
    far('the Nile', x, heightAt(x, z) + 30, z); }

  const lBase = stage.label(labels).say(`${BASE_M.toFixed(2)} m`), lTop = stage.label(labels).say(`${HEIGHT_M.toFixed(2)} m`), lCourse = stage.label(labels, 'tag on'), lPerson = stage.label(labels).say('a person, 1.75 m');
  lBase.pos.set(0, 0, BASE_M / 2 + 9); lBase.on = true;
  lTop.pos.set(0, HEIGHT_M + 5, 0); lTop.on = true;
  lPerson.pos.set(BASE_M / 2 + 4, 4.6, BASE_M / 2 + 4); lPerson.on = true;

  // ---------------------------------------------------------------- where the build stands
  // built: how many courses are done; current: the course being made (a schedule row) or null;
  // part: how much of its aggregate has arrived, 0..1; setPart: how far it has set, 0..1; list:
  // its horns (x and y from the axis, z above the working surface); tau: the slowed clock;
  // sound: whether the tone is on. True while the casing is being dressed (the stage keeps drawing).
  let top = 0, shownCourse = -1, shownTop = -1, doneAt = 0;
  function set({ built = 0, current = null, part = 0, setPart = 0, list = [], tau = 0, sound = false } = {}) {
    const done = !current && built >= rows.length;
    let dressing = false;
    if (done) {
      // the front steps down a course at a time; the courses below it are as built, undressed
      const now = performance.now();
      if (!doneAt) doneAt = now;
      const r = still ? 1 : Math.min(1, (now - doneAt) / (DRESS_S * 1000)), yf = HEIGHT_M * (1 - r);
      let k = rows.length;
      while (k > 0 && rows[k - 1].top > yf + 1e-6) k--;
      courses.count = k; casingU.uFront.value = k ? rows[k - 1].top : 0;
      dressing = r < 1; casingU.uFresh.value = dressing ? 1 : 0;
    } else { doneAt = 0; courses.count = built; }
    casing.visible = done; outline.visible = !done;
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
        horns.count = hornsFar.count = posts.count = k;
        horns.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = true;
      }
      const near = ringDistance(stage.ear().eye, current.side / 2 + 0.1, top + 0.5) < HORN_NEAR;
      horns.visible = near; hornsFar.visible = !near;
      if (sound) {
        const far = Math.min(reach * 1.6, current.side * 0.98), edge = current.side / 2 + 0.1, ph = tau - Math.floor(tau);
        for (const [ax, ay] of SIDES) for (let k = 0; nf < FRONTS; k++) {
          const d = LAMBDA * (ph + k);
          if (d > far) break;
          const fade = (1 - d / far) ** 2 * Math.min(1, d / (0.2 * LAMBDA));
          M.makeRotationY(ax ? -Math.PI / 2 : 0).scale(S.set(current.side, 1, 1)).setPosition(ax ? ax * (edge - d) : 0, top + 0.04, ay ? ay * (edge - d) : 0);
          fronts.setMatrixAt(nf, M); fronts.setColorAt(nf, C.setRGB(fade * 0.45, 0, 0)); nf++;
        }
      }
    } else { top = built ? rows[built - 1].top : 0; horns.count = hornsFar.count = posts.count = 0; shownCourse = -1; }
    fronts.count = nf;
    if (nf) { fronts.instanceMatrix.needsUpdate = true; fronts.instanceColor.needsUpdate = true; frontU.uPix.value = stage.pix() * 3.2; }
    wave.uTau.value = tau; wave.uOn.value = sound && current ? 1 : 0; wave.uHalf.value = current ? current.side / 2 : 1;
    wave.uPart.value = current ? part : 0; wave.uWet.value = current && setPart > 0 ? 1 : 0; wave.uSet.value = setPart; wave.uTime.value = (performance.now() / 1000) % 600;
    return dressing;
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

  const first = skyAt(hours);         // the sun where the room opens: a November morning's, a quarter past eight by the sun
  return {
    name: 'pyr', group, labels,
    say: 'the Great Pyramid in three dimensions, at its true size, as far as the sound has built it',
    orbit: createOrbit({ target: [0, 52, 0], dist: 430, polar: 1.36, az: -0.62, fov: 40, minDist: 3, maxDist: 1600, minPolar: 0.02, maxPolar: 1.95, floor: 1.2,
      box: [[-450, 0, -450], [450, 160, 450]] }),
    fog: [900, 5200], far: 60000, cell: 10, land: true,
    // the morning's air: an even haze, a tenth of the light lost every kilometre or so, and a mist on the valley floor
    haze: [1 / 16000, 1 / 4200, 30, -42],
    sun: { center: [0, 40, 0], radius: 300, dir: first.dir, follow: true, least: 14, reach: 700, beyond: 900 },
    look: { ...first.look, ground: rgb(150, 125, 96), line: rgb(132, 110, 86), grid: 0, dunes: 0 },
    hit, set, glow, lite: (on) => land.lite(on),
    // the sun to an hour of the day (by the sun): the sky, the light and the shadows follow
    sky(h) { const k = skyAt(h); stage.sky(k.look, k.dir); return k.at; }, get cased() { return casing.visible && casingU.uFront.value <= 0; },
    get hornsNear() { return horns.visible && horns.count > 0; },
  };
}
