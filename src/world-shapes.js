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
