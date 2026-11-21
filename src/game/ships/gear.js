// gear.js — A SHIP'S LANDING GEAR, DRAWN (three.js). Colin, 19 Nov 2026: "landing gear would be sick". ../ships.js says
// where each kind's legs are and how far they are down (GEAR, s.gear: 0 folded away, 1 down); this draws a strut and a
// foot for each, hinged under the hull, folded back along it and put away in flight.
import * as THREE from 'three';

export function createGear(body, G, keel, mat) {
  const L = keel + G.len + G.y, geos = [], legs = [];            // from its hinge down to its foot
  const strut = new THREE.CylinderGeometry(G.r, G.r * 0.8, L, 10); strut.translate(0, -L / 2, 0);
  const foot = new THREE.CylinderGeometry(G.r * 3.2, G.r * 3.6, G.r * 1.2, 16); foot.translate(0, -L + G.r * 0.6, 0);
  const brace = new THREE.CylinderGeometry(G.r * 0.5, G.r * 0.5, L * 0.6, 8); brace.translate(0, -L * 0.3, 0); brace.rotateX(-0.5);
  geos.push(strut, foot, brace);
  for (const [x, z] of G.legs) {
    const p = new THREE.Group(); p.position.set(x, G.y, z);
    for (const g of [strut, foot, brace]) p.add(new THREE.Mesh(g, mat));
    body.add(p); legs.push(p);
  }
  return {
    geos,
    update(down = 0) { for (const p of legs) { p.visible = down > 0.02; p.rotation.x = (1 - down) * 1.5; } },
  };
}
