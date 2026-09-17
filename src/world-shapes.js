// WHAT EACH THING LOOKS LIKE, in one place.
//
// The world draws a forge, a dome, a panel, a cart; the build window has to
// show the same forge, dome, panel and cart as a wireframe you can turn over in
// your hands before you ask for one. Two drawings of the same thing drift the
// first time someone reshapes a roof, so there is one: every kind is built
// here, and both the ground and the window call this.
//
// Shapes are given THREE rather than importing it, so this file can be loaded
// anywhere (the window's own little scene, the world's big one) without two
// copies of the library and without deciding where it comes from.

export const CATALOG_ORDER = ['panel', 'stone storage', 'metal storage', 'wood storage', 'cart', 'rover', 'sprite'];

function box(THREE, w, h, d, color, y, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...extra }));
  m.position.y = y;
  return m;
}

// kind: 'forge' | 'solarforge' | 'aiforge' | 'vehicle' | 'storage' | 'panel' | 'sprite'
// b:    the built record (of, free, …) — only the fields a kind reads
export function shapeFor(THREE, kind, b = {}) {
  const g = new THREE.Group();
  if (kind === 'forge') {
    // lighter than real timber on purpose: a brown building on brown
    // ground is a building nobody can see
    g.add(box(THREE, 2, 1.5, 2, 0xa8774a, 0.75));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4),
      new THREE.MeshLambertMaterial({ color: 0x7a4f2c }));
    roof.position.y = 1.5 + 0.45; roof.rotation.y = Math.PI / 4;   // ON the walls, not inside them
    g.add(roof);
  } else if (kind === 'solarforge') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x2c6b48, emissive: 0x0d2a1b, emissiveIntensity: 0.9 }),
    );
    g.add(dome);
  } else if (kind === 'aiforge') {
    g.add(box(THREE, 1.7, 2.2, 1.7, 0x8d949c, 1.1));
    g.add(box(THREE, 1.9, 0.16, 1.9, 0xb6bec8, 2.2));
  } else if (kind === 'vehicle') {
    const rover = b.of === 'rover';
    g.add(box(THREE, rover ? 1.5 : 1.3, 0.5, rover ? 1.0 : 0.85, rover ? 0x7d8896 : 0x8a6134, 0.42));
    if (rover) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.8),
        new THREE.MeshLambertMaterial({ color: 0x0f1830, emissive: 0x14294a, emissiveIntensity: 0.7 }));
      p.position.y = 0.72; p.rotation.x = -0.2;
      g.add(p);
    }
    for (const dx of [-0.55, 0.55]) for (const dz of [-0.42, 0.42]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 8),
        new THREE.MeshLambertMaterial({ color: 0x33383f }));
      w.rotation.z = Math.PI / 2; w.position.set(dx, 0.19, dz);
      g.add(w);
    }
  } else if (kind === 'storage') {
    const metal = b.of === 'metal', wood = b.of === 'wood';
    g.add(box(THREE, 1.5, 1.15, 1.5, metal ? 0x8f99a6 : wood ? 0x8a6134 : 0x8a8d90, 0.58));
    g.add(box(THREE, 1.62, 0.14, 1.62, metal ? 0xaab4c0 : wood ? 0xa8774a : 0xa2a5a9, 1.2));
  } else if (kind === 'panel') {
    // dark glass on a low frame, tilted to the sky. An empty one glows
    // faintly — it is waiting for a sprite that does not exist yet.
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.1, 1.15),
      new THREE.MeshLambertMaterial({ color: 0x0f1830, emissive: b.free ? 0x1b3b6b : 0x0a1224, emissiveIntensity: b.free ? 0.85 : 0.4 }),
    );
    glass.rotation.x = -0.32; glass.position.y = 0.34;
    g.add(glass);
    g.add(box(THREE, 1.5, 0.3, 0.9, 0x2b2f36, 0.15));
  } else if (kind === 'sprite') {
    // a new sprite, as a thing you can build: the same mini-orb idea the
    // world's bodies use, a small glowing shell above a panel
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshLambertMaterial({ color: 0xdfe6f2, emissive: 0x6f86c9, emissiveIntensity: 0.9 }));
    core.position.y = 1.15;
    g.add(core);
    g.add(box(THREE, 1.5, 0.3, 0.9, 0x2b2f36, 0.15));
  }
  return g;
}

// A PERSON. The human who walks in — Colin: "humanoid characters that the
// human user can play as also, to join you in there", "based in human reality
// so that we can relate to it". So a 1.75-block figure in matte cloth, not a
// glowing orb: seven boxes — torso, head, two arms hung from the shoulders, two
// legs hung from the hips — and one small lamp in the owner's scheme, so whose
// it is reads from across the ground the way a sprite's glow does.
//   THE LEGS HANG FROM THE HIP. A box pivots about its own centre, so a leg
// swung by rotating the mesh scissors through the ground and the torso (the
// fauna in world-view.js pivot about the centre and get away with it only
// because their legs are short). The geometry is translated so the box's local
// origin is its TOP; then the mesh sits at hip height and a rotation about x is
// a real swing from the hip. Same for the arms, from the shoulder.
export const PERSON_HEIGHT = 1.75;
export const PERSON_EYE = 1.60;      // where the first-person camera stands — a head, not a hub
const HIP = 0.85, SHOULDER = 1.38;

function limb(THREE, w, len, d, color) {
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, -len / 2, 0);                  // origin at the top: it hangs
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
}

export function personFor(THREE, b = {}) {
  const g = new THREE.Group();
  const cloth = b.cloth ?? 0x6e6a75, skin = b.skin ?? 0xc9b8a8, trouser = b.trouser ?? 0x4f4b56;
  const torso = box(THREE, 0.46, 0.68, 0.28, cloth, HIP + 0.34);
  const head = box(THREE, 0.30, 0.30, 0.30, skin, PERSON_HEIGHT - 0.15);
  const legL = limb(THREE, 0.18, HIP, 0.22, trouser); legL.position.set(-0.11, HIP, 0);
  const legR = limb(THREE, 0.18, HIP, 0.22, trouser); legR.position.set(0.11, HIP, 0);
  const armL = limb(THREE, 0.14, 0.62, 0.16, cloth); armL.position.set(-0.30, SHOULDER, 0);
  const armR = limb(THREE, 0.14, 0.62, 0.16, cloth); armR.position.set(0.30, SHOULDER, 0);
  // the lamp: one small cube at the chest in the owner's scheme, the only thing
  // on the figure that glows — it says whose person this is, and no more
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x181b20, emissive: b.lamp ?? 0xcfd6e0, emissiveIntensity: 1.1 }));
  lamp.position.set(0.12, HIP + 0.52, 0.16);
  for (const m of [torso, head, legL, legR, armL, armR, lamp]) g.add(m);
  // handles for the pose, so the gait never has to search the children
  g.userData.parts = { torso, head, legL, legR, armL, armR, lamp };
  return g;
}

// THE GAIT, as a pure function of DISTANCE WALKED — never of the clock. A body
// that stops must stop mid-stride wherever it is and not keep pumping its legs
// in place; and two screens that agree on where a person is must agree on
// which foot is forward, which they only can if the phase is a function of the
// same thing the position is. `walked` is the metres along the course; one
// full stride is a little over a block. Arms swing opposite to the legs.
// Operates on plain rotation objects, so it is testable without three.
export const STRIDE = 1.3;
export function posePerson(parts, walked, moving) {
  const ph = moving ? ((walked % STRIDE) / STRIDE) * Math.PI * 2 : 0;
  const swing = moving ? Math.sin(ph) * 0.55 : 0;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.7;
  parts.armR.rotation.x = swing * 0.7;
  // a little bob at each footfall, from the same phase
  const bob = moving ? Math.abs(Math.sin(ph)) * 0.05 : 0;
  parts.torso.position.y = HIP + 0.34 + bob;
  parts.head.position.y = PERSON_HEIGHT - 0.15 + bob;
  parts.lamp.position.y = HIP + 0.52 + bob;
  return ph;
}

// The same group, as lines: every mesh's material swapped for a wireframe.
// Emissive glow does not survive the swap, so a colour is chosen per mesh from
// what it had — the window shows form, not lighting.
export function asWireframe(THREE, group, color = null) {
  group.traverse((o) => {
    if (o.isMesh) {
      const c = color ?? (o.material.emissive && o.material.emissiveIntensity > 0.5 ? o.material.emissive.getHex() : o.material.color.getHex());
      o.material = new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.9 });
    }
  });
  return group;
}

// What a build recipe produces on the ground, so the window can draw the
// finished thing: 'stone storage' → { kind: 'storage', of: 'stone' }.
export function producedBy(build) {
  if (!build) return { kind: 'panel' };
  return { kind: build.makes, of: build.of, free: build.makes === 'panel' };
}
