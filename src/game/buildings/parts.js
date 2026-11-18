// buildings/parts.js — WHAT A BUILDING IS MADE OF, GATHERED: the shapes the
// drawings of the buildings are put together from (boxes, flat shapes with
// holes, quads), and the gatherer that makes them one geometry, each piece
// saying what it is made of (aPart) and when it goes up (aStage).
import * as THREE from 'three';

// what a building is made of, gathered into one geometry
export function gatherer() {
  const P = [], N = [], U = [], A = [], S = [];
  const put = (g, part, stage) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const p = ng.attributes.position, n = ng.attributes.normal, uv = ng.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); A.push(part); S.push(stage);
    }
    if (ng !== g) ng.dispose();
    g.dispose();
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); g.setAttribute('aStage', new THREE.Float32BufferAttribute(S, 1));
    return g;
  };
  return { put, geometry };
}
// a box between two corners; its uv runs along its longest side (a timber's grain)
export function boxG(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const dims = [x1 - x0, y1 - y0, z1 - z0], long = dims.indexOf(Math.max(...dims));
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)], other = [0, 1, 2].filter((k) => k !== long);
    uv.setXY(i, c[long] + dims[long] / 2, c[other[0]] + c[other[1]]);
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
// a flat shape in the X–Y plane (with holes), as thick as z1 − z0, its uv in metres
export function slabG(points, holes, z0, z1) {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, z0);
  return g;
}
export const circle = (cx, cy, r) => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); return p; };
export const rect = (x0, y0, x1, y1) => { const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.lineTo(x0, y0); return p; };
// a quad of four corners (anticlockwise seen from its front), as two triangles, uv given per corner
export function quadG(a, b, c, d, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const g = new THREE.BufferGeometry(), pos = [...a, ...b, ...c, ...a, ...c, ...d], uv = [...uvs[0], ...uvs[1], ...uvs[2], ...uvs[0], ...uvs[2], ...uvs[3]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

