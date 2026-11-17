// ============================================================================
// The land round the pyramid, drawn (browser only: three.js): giza.mjs's shape
// as one wide mesh of rings about the pyramid, finest at its foot and coarser
// out to the horizon, coloured by what is there: sand and bare limestone on the
// plateau, the beds of the scarp, the valley's fields and palms, water that
// mirrors the sky, the hills across the valley; and the three elder pyramids,
// cased as they were then. All of it under the room's haze (air.js).
// ============================================================================
import * as THREE from 'three';
import * as G from './giza.mjs';
import { patch, lin } from './kit.js';

const f1 = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const vec3 = (r, g, b) => `vec3(${lin(r).toFixed(4)}, ${lin(g).toFixed(4)}, ${lin(b).toFixed(4)})`;     // a screen's colour, as light
const points = (name, line) => `const vec2 ${name}[${line.length}] = vec2[](${line.map(([x, z]) => `vec2(${f1(x)}, ${f1(z)})`).join(', ')});`;
// for a north-to-south line: how far from it, and where it crosses a Z (the same as giza.mjs's)
const lineFns = (name, n) => `
float d${name}(vec2 p) { float d = 1e9; for (int i = 0; i < ${n - 1}; i++) d = min(d, segD(p, ${name}[i], ${name}[i + 1])); return d; }
float x${name}(float z) {
  if (z <= ${name}[0].y) return ${name}[0].x;
  for (int i = 0; i < ${n - 1}; i++) if (z <= ${name}[i + 1].y) return mix(${name}[i].x, ${name}[i + 1].x, (z - ${name}[i].y) / max(${name}[i + 1].y - ${name}[i].y, 1e-3));
  return ${name}[${n - 1}].x;
}`;

const HEAD = `
uniform float uLite;
varying float vUp;
varying vec3 vEdge;
${points('RV', G.RIVER)}
${points('BR', G.BRANCH)}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
${lineFns('RV', G.RIVER.length)}
${lineFns('BR', G.BRANCH.length)}
float lh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ln(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), u.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), u.x), u.y); }
// the slope of the noise ln(p / s), metres of rise a metre
vec2 lgrad(vec2 p, float s) { float e = s * 0.05; return vec2(ln((p + vec2(e, 0.0)) / s) - ln((p - vec2(e, 0.0)) / s), ln((p + vec2(0.0, e)) / s) - ln((p - vec2(0.0, e)) / s)) / (2.0 * e); }
`;

// What is where comes with the mesh's points (vEdge: metres past the desert's edge, past the hills'
// edge, and from the water), as the heights do, so colour and shape agree; only near the water's
// edge is the distance worked out again, exactly, for a clean bank. Each part is coloured only
// where it can be seen.
const COLOUR = `
  vec2 P = vWp.xz;
  // metres a pixel spans here (plain, when the stage is turned down: as if every pixel were far, so the fine detail is left out)
  float rr = length(P), px = uLite > 0.5 ? 60.0 : max(max(fwidth(P.x), fwidth(P.y)), 1e-3);
  float vly = 0.55 * smoothstep(-15.0, 45.0, vEdge.x) + 0.45 * smoothstep(20.0, 220.0, vEdge.x);
  float hill = smoothstep(-300.0, 500.0, vEdge.y);
  float slope = 1.0 - clamp(vUp, 0.0, 1.0), n1 = ln(P / 820.0);
  vec3 land = vec3(0.0);
  float bare = 0.0, near = 0.0, wet = 0.0, dw = vEdge.z;
  // the desert: sand, a little darker where gravel lies on it and paler where the limestone shows
  // through, near the pyramid; finer grain only where a pixel is small enough to hold it; the beds of the scarp
  if (vly < 0.999) {
    float n2 = ln(P / 61.0 + 4.3), n3 = px < 4.0 ? mix(ln(P / 7.0 + 1.7), 0.5, smoothstep(1.0, 4.0, px)) : 0.5;
    land = ${vec3(212, 184, 142)} * (0.9 + 0.1 * n1 + 0.08 * n2 + 0.1 * n3);
    float gravel = smoothstep(0.55, 0.75, 0.7 * ln(P / 430.0 + 3.3) + 0.3 * n2);
    land = mix(land, ${vec3(170, 128, 88)} * (0.92 + 0.16 * n3), gravel * 0.45);
    if (rr < 2200.0 && px < 12.0) bare = smoothstep(0.66, 0.8, 0.55 * ln(P / 47.0 + 7.1) + 0.45 * ln(P / 13.0 + 2.9)) * (1.0 - smoothstep(600.0, 2200.0, rr)) * (1.0 - smoothstep(3.0, 12.0, px));
    land = mix(land, ${vec3(200, 186, 160)} * (0.9 + 0.15 * n3), bare * 0.55);
    float beds = mix(0.5 + 0.5 * sin(vWp.y * 2.1 + 3.0 * n2), 0.5, smoothstep(0.4, 1.4, fwidth(vWp.y) * 2.1));
    land = mix(land, ${vec3(190, 172, 142)} * (0.82 + 0.24 * beds), smoothstep(0.03, 0.1, slope) * (1.0 - smoothstep(0.8, 1.0, vly)));
    // close by, grains and grit: a speck of its own every few centimetres, gone before it could shimmer
    near = (1.0 - smoothstep(0.015, 0.06, px)) * (1.0 - vly);
    if (near > 0.0) land *= 1.0 + near * (0.24 * (lh(floor(P / 0.06)) - 0.5) + 0.14 * (ln(P / 0.6 + 3.1) - 0.5));
  }
  // the valley: fields in a grid turned a little, each in strips, dykes between; palms in small groves,
  // in lines along some dykes, and crowding the water
  if (vly > 0.001) {
    vec2 fq = mat2(0.978, -0.208, 0.208, 0.978) * P / vec2(130.0, 84.0);
    fq.x += 0.37 * floor(fq.y);
    vec2 fc = floor(fq), ff = fract(fq), fe = min(ff, 1.0 - ff) * vec2(130.0, 84.0);
    float pick = lh(fc + 17.0), far = smoothstep(10.0, 45.0, px);
    vec3 crop = pick < 0.26 ? ${vec3(92, 124, 56)} : pick < 0.5 ? ${vec3(76, 110, 48)} : pick < 0.64 ? ${vec3(110, 128, 64)} : pick < 0.78 ? ${vec3(122, 112, 76)} : pick < 0.9 ? ${vec3(90, 96, 62)} : ${vec3(136, 134, 84)};
    float strip = floor(ff.y * (3.0 + floor(4.0 * lh(fc + 3.0))));
    crop *= (0.94 + 0.12 * lh(fc + strip * 7.0 + 1.0)) * (0.93 + 0.14 * ln(P / 23.0));
    crop = mix(crop, ${vec3(88, 102, 58)}, far);
    if (px < 12.0) crop = mix(crop, ${vec3(70, 74, 52)}, (1.0 - smoothstep(1.5, 3.5 + px, min(fe.x, fe.y))) * (1.0 - smoothstep(3.0, 12.0, px)) * 0.75);
    if (dw < 400.0 && vly > 0.5) {
      float wob = 210.0 * sin(P.y / 2300.0 + 1.1) + 80.0 * sin(P.y / 870.0);
      dw = min(min(dRV(vec2(P.x - wob, P.y)) - ${f1(G.RIVER_HALF)}, dBR(P) - ${f1(G.BRANCH_HALF)}), length(P - vec2(${f1(G.BASIN.x)}, ${f1(G.BASIN.z)})) - ${f1(G.BASIN.r)});
    }
    wet = (1.0 - smoothstep(-px, px, dw)) * step(0.999, vly) * (1.0 - hill);
    float grove = max(smoothstep(0.74, 0.8, 0.55 * ln(P / 140.0 + 2.2) + 0.45 * ln(P / 37.0)),
                      dw < 200.0 ? smoothstep(0.42, 0.58, ln(P / 29.0 + 5.0)) * (1.0 - smoothstep(20.0, 200.0, dw)) : 0.0);
    grove = max(grove, step(0.8, lh(fc + 41.0)) * (1.0 - smoothstep(4.0, 9.0, fe.y)) * step(0.5, ln(P / 11.0 + 1.3)));
    crop = mix(crop, ${vec3(40, 60, 32)} * mix(0.75 + 0.5 * ln(P / 7.0), 1.0, smoothstep(2.0, 8.0, px)), grove * (1.0 - far * 0.4));
    vec3 floor_ = mix(crop, ${vec3(44, 56, 50)}, wet);
    land = vly >= 0.999 ? floor_ : mix(land, floor_, vly);
  }
  // across the valley, the hills: pale limestone, darker where steep
  if (hill > 0.0) land = mix(land, mix(${vec3(206, 186, 152)}, ${vec3(150, 128, 102)}, smoothstep(0.08, 0.3, slope)) * (0.9 + 0.2 * n1), hill * (1.0 - wet));
  diffuseColor.rgb = land;`;

// the sand's own small shape, close by: hummocks a few metres across, and wind ripples a hand apart
// running east and west (the wind is from the north), steeper on their lee; faded before a pixel
// could not hold them
const BUMPS = `
  if (near > 0.0 || px < 0.4) {
    float hum = (1.0 - smoothstep(0.08, 0.4, px)) * (1.0 - vly);
    vec2 g = hum * (0.05 * lgrad(P + 5.0, 0.8) + 0.16 * lgrad(P, 2.3) + 0.4 * lgrad(P + 31.0, 9.0));
    float rq = 6.2832 * (P.y / 0.15 + 2.4 * ln(P / 1.9) + 0.7 * ln(P / 0.43 + 7.0));
    float rip = (1.0 - smoothstep(0.03, 0.06, fwidth(P.y))) * (1.0 - smoothstep(0.08, 0.16, fwidth(P.x))) * (1.0 - vly) * (1.0 - smoothstep(0.45, 0.7, bare));
    g.y += rip * 0.2 * (cos(rq) + 0.6 * cos(2.0 * rq));
    normal = normalize(normal + mat3(viewMatrix) * vec3(-g.x, 0.0, -g.y));
  }`;

// water mirrors the sky (after the colour is the screen's, as the sky is drawn); a little stirred
const WATER = `
  if (wet > 0.0) {
    vec3 wv = normalize(vWp - cameraPosition);
    vec3 wn = normalize(vec3(0.05 * (ln(P / 19.0) - 0.5), 1.0, 0.05 * (ln(P / 19.0 + 9.0) - 0.5)));
    vec3 wr = reflect(wv, wn); wr.y = abs(wr.y);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(-wv, wn), 0.0, 1.0), 5.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(skyAt(wr), 1.0)).rgb, wet * fres);
  }`;

export function createLand(air) {
  const group = new THREE.Group(), uLite = { value: 0 };
  const radii = G.rings(), seg = 320, nr = radii.length, cols = seg + 1;
  const pos = new Float32Array(nr * cols * 3), edge = new Float32Array(nr * cols * 3), idx = [];
  for (let i = 0; i < nr; i++) for (let k = 0; k < cols; k++) {
    const a = ((k % seg) / seg) * Math.PI * 2, x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i], at = (i * cols + k) * 3;
    pos.set([x, G.heightAt(x, z), z], at);
    edge.set([G.across(G.DESERT_EDGE, x, z), G.across(G.HILLS_EDGE, x, z), G.fromWater(x, z)], at);
  }
  for (let i = 0; i + 1 < nr; i++) for (let k = 0; k < seg; k++) {
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, envMapIntensity: 0.12 }), 'land', {
    air, uniforms: { uLite }, vertexHead: 'attribute vec3 aEdge;\nvarying float vUp;\nvarying vec3 vEdge;\n', vertex: 'vUp = objectNormal.y; vEdge = aEdge;\n', fragmentHead: HEAD, fragment: COLOUR, normal: BUMPS, post: WATER,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true; ground.frustumCulled = false;
  group.add(ground);

  // the elders, cased in white limestone; the Earth's curve sinks them a little
  const stone = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color(lin(232), lin(224), lin(206)), roughness: 0.8, metalness: 0, envMapIntensity: 0.2 }), 'elder', { air });
  for (const e of G.ELDERS) {
    const parts = [], [w, d] = e.base;
    const frustum = (b0, b1, y0, y1) => {                     // half-sides at the bottom and the top, square in plan, then stretched
      const g = new THREE.CylinderGeometry(b1 * Math.SQRT2, b0 * Math.SQRT2, y1 - y0, 4, 1).rotateY(Math.PI / 4).translate(0, (y0 + y1) / 2, 0);
      return g.toNonIndexed();
    };
    if (e.kind === 'step') {
      const n = e.steps, tier = e.height / n, lean = tier * 0.29;
      for (let i = 0; i < n; i++) { const h0 = w / 2 - i * (lean + 4), h1 = h0 - lean; parts.push(frustum(h0, h1, i * tier, (i + 1) * tier)); }
    } else if (e.kind === 'bent') {
      const half = w / 2, k = half - e.knee / Math.tan((54.45 * Math.PI) / 180);
      parts.push(frustum(half, k, 0, e.knee), frustum(k, 0.01, e.knee, e.height));
    } else parts.push(frustum(w / 2, 0.01, 0, e.height));
    for (const g of parts) {
      g.scale(1, 1, d / w); g.computeVertexNormals();
      const m = new THREE.Mesh(g, stone);
      m.position.set(e.x, G.heightAt(e.x, e.z), e.z);
      group.add(m);
    }
  }
  return { group, material: mat, lite: (on) => { uLite.value = on ? 1 : 0; } };
}
