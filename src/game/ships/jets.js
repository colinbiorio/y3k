// jets.js — A SHIP'S THRUSTERS, TURNED (three.js). Colin, 19 Nov 2026: "make the thrusters point in the direction that
// the ship is moving". ../ships.js says which way a ship's exhaust goes, in its own frame (s.jet: astern is [0, 0, -1],
// straight down as it hangs still). Each drawing keeps an engine's mount where it was (its ring on its pylons) and puts
// what turns in a pivot where the nozzle is: a smaller ring gimballed in the mount, the plasma in it, its glow and its
// streak, the exhaust going out along the pivot's -Z. This turns the pivots.
import * as THREE from 'three';

const BACK = new THREE.Vector3(0, 0, -1), DIR = new THREE.Vector3();
export function jetPivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
export function aimJets(pivots, jet) {
  if (jet) DIR.set(jet[0], jet[1], jet[2]); else DIR.copy(BACK);
  if (DIR.lengthSq() < 1e-6) DIR.copy(BACK); else DIR.normalize();
  for (const p of pivots) p.quaternion.setFromUnitVectors(BACK, DIR);
}
