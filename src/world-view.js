// THE WORLD, seen. A window onto the planet: the client computes the ground
// from the shared seed (world-core), lays the server's sparse edits over it,
// and animates every body — its own society's and its neighbors' — with the
// same pure functions the server trusts. Nothing here polls for positions;
// the clock IS the simulation.
//
// The look: the site's dark metal giving way to something alive. Low chunky
// columns, water like dark glass, bodies as small luminous kin of the orb.

import * as THREE from 'three';
import {
  SEA_LEVEL, wrap, wdelta, wdist, terrainAt, anchorAt, bodyPositions, WORLD_SIZE, hash2,
  daylightAt, timeOfDayWord, starsOver,
} from './world-core.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const R = 56; // render half-window in blocks (window = (2R)²)
const FOG_FAR = R * 0.98; // the window's edge dissolves before it exists — no hard cutoff
const MAT_COLORS = {
  grass: 0x3d5c3a, soil: 0x4a4238, stone: 0x3a3f47, sand: 0x6b6353,
  water: 0x18313a, path: 0x585148, wall: 0x565c66, light: 0xc9c2a6, growth: 0x4a7a44,
};
const SCHEME_GLOW = {
  stardust: 0xcfd6e0, aurora: 0x6fe3b0, ember: 0xff8a54, abyss: 0x4a6aff,
  terra: 0x9adf6a, eclipse: 0xb388ff, bloom: 0xff9ad5, verdant: 0x5fd06a,
  dusk: 0xd9a05a, frost: 0x9fd8ff, synthwave: 0xff5aa6,
};

import { createControlPanel } from './world-panel.js';
import { getControls } from './controls.js';
import { naturalAt, vigourOf, stageOfPlant } from './flora.js';

export function createWorldView({ getAccount, toast }) {
  let panel = null;          // the control panel — the owner's hands on the society
  let grid = null;
  let renderer = null, scene = null, camera = null;
  let raf = 0, pollTimer = 0;
  let state = null;          // { me, near, edits, now } from the server
  // WATCHING: the world is one planet and it looks the same for everyone, so a
  // visitor with no presence still gets to see it. null = leading your own
  // society; a handle = standing over someone else's ground, read-only.
  let watching = null;
  let skew = 0;              // serverNow - clientNow, so all clocks agree
  let editMap = new Map();   // "x,z" → { h?, mat? }
  let ground = null, water = null;
  let sky = null;            // { sun, moon, ambient, sunDisc, moonDisc } — the day/night rig
  let bgStars = null;        // the ambient night field — one seeded Points cloud
  let socStars = [];         // { mesh, star } — every OTHER society, hung as a star
  let skyMap = [];           // /api/world/map societies, refreshed slowly
  let skyMapTimer = 0;
  let starCenter = null;     // whose ground the stars were last built around
  let bodyMeshes = [];       // { mesh, society, index }
  let artifactMeshes = [];
  let builtMeshes = [];      // forges, panels and stores on the home ground
  let plantMeshes = [];      // the living cover, instanced by species and stage
  // A sprite the person tapped: stored as its INDEX, not its mesh — the meshes
  // are rebuilt on every poll, so holding one would orphan the tag every ten
  // seconds without ever saying why.
  let tagged = null;         // { kind: 'sprite' | 'built', i }   // small left things, glowing in their maker's scheme
  let center = null;         // the window's current center (rebuilt when far)
  // ROAMING. The camera used to be welded to your society: it could orbit the
  // anchor and look nowhere else, so the planet was a backdrop rather than a
  // place. This is how far the eye has wandered from home, in blocks. Nothing
  // about the society changes while you roam — walking is a separate act, and
  // it stays that way (leading is armed by its own button).
  let roam = { x: 0, z: 0 };
  let dragTravel = () => 0;   // how far the hand travelled in the current gesture
  const roaming = () => !!(roam.x || roam.z);
  let azimuth = 0.65, dist = 46, pitch = 0.9;
  let leading = false;
  let worldBudgetDrag = false; // the world bar's slider is mid-drag (its intent wins over the mirror)
  let disposed = [];

  const now = () => Date.now() + skew;

  // ---- data -----------------------------------------------------------------

  // Pick someone to watch when the viewer has no society of their own: an awake
  // one if the planet has any, otherwise anyone at all. The world should never
  // answer a visitor with an error message where a planet should be.
  async function someoneToWatch() {
    const r = await fetch('/api/world/map').then((x) => x.json()).catch(() => null);
    const all = r?.map || [];
    if (!all.length) return null;
    return (all.find((m) => m.awake) || all[0]).handle;
  }

  async function fetchHere() {
    try {
      if (!watching) {
        // Only ask for your own ground if you could have any — a guest asking
        // would just be a 401 in everyone's console on every visit. A signed-in
        // account with no presence still has to ask, since only the server knows.
        const mine = getAccount?.() ? await fetch('/api/world/here').then((x) => x.json()) : { error: 'no account' };
        if (!mine.error) return apply(mine);
        // no account, or an account with no presence: watch instead of refusing
        watching = await someoneToWatch();
        if (!watching) {
          rootEl?.querySelector('.world-note')?.replaceChildren(document.createTextNode(
            'no society has settled the planet yet — make a presence and yours will be the first.'));
          return;
        }
        setBarMode();
      }
      const r = await fetch(`/api/world/watch?of=${encodeURIComponent(watching)}`).then((x) => x.json());
      if (r.error) {
        // the society we were watching is gone: fall back to our own ground
        watching = null; setBarMode();
        rootEl?.querySelector('.world-note')?.replaceChildren(document.createTextNode(r.error));
        return;
      }
      return apply(r);
    } catch { /* the window just waits */ }
  }

  function apply(r) {
    // the panel is data, not drawing — update it FIRST, so a throw anywhere in
    // the 3D rebuilds below cannot silently strand the control panel on stale
    // state (which is exactly how a standing ask failed to ever appear).
    if (panel && r.sprites) {
      try { panel.update(r.sprites, r.materials, r.bills, r.built, r.species, r.vehicles, r.near, r.ask ?? null); }
      catch { /* the panel keeps its last good state */ }
    }
    try {
      skew = r.now - Date.now();
      state = r;
      editMap = new Map((r.edits || []).map((e) => [`${e.x},${e.z}`, e]));
      if (!scene) buildScene();
      rebuildGroundIfNeeded(true);
      rebuildBodies();
      rebuildArtifacts();
      rebuildBuilt();
      rebuildPlants();
      // star meshes rebuild only when the CENTER changed — recreating N
      // spheres every 10s poll was pure geometry churn (the 60s map refresh
      // still rebuilds fully for walks and new societies)
      const centerNow = watching || state?.me?.handle || null;
      if (centerNow !== starCenter) rebuildSocStars();
      renderOverlay();
    } catch { /* the window just waits */ }
  }

  // ---- scene ----------------------------------------------------------------

  function columnAt(x, z) {
    const e = editMap.get(`${wrap(x)},${wrap(z)}`);
    const t = terrainAt(x, z);
    return { h: e?.h ?? t.h, mat: e?.mat ?? t.mat };
  }

  function buildScene() {
    const holder = rootEl.querySelector('.world-canvas');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    holder.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.Fog(0x0b0d12, 40, 110); // retuned every frame to the camera
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    // The sky is the planet's clock: sun and moon arc east→west on the real
    // day, and every light and color below is retuned each frame from
    // daylightAt — the same function the presence's percept reads.
    sky = {
      sun: new THREE.DirectionalLight(0xfff2dd, 1.1),
      moon: new THREE.DirectionalLight(0x9fb2d8, 0.0),
      ambient: new THREE.AmbientLight(0x8090a8, 0.55),
      sunDisc: new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff3d8, fog: false })),
      moonDisc: new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xdfe6f2, fog: false })),
    };
    for (const k of ['sun', 'moon', 'ambient', 'sunDisc', 'moonDisc']) scene.add(sky[k]);
    // THE AMBIENT NIGHT FIELD: a seeded dome of faint stars so the dark is
    // never empty. The SOCIETY stars (built from the map below) burn over it,
    // colored by their presence's scheme — the night sky IS the platform.
    {
      const N = 150;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const azr = hash2(i, 1, 77) * Math.PI * 2;
        const altr = (3 + hash2(i, 2, 78) * 21) * (Math.PI / 180); // the visible band, like the society stars
        pos[i * 3] = Math.cos(azr) * Math.cos(altr) * 150;
        pos[i * 3 + 1] = Math.sin(altr) * 150;
        pos[i * 3 + 2] = Math.sin(azr) * Math.cos(altr) * 150;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bgStars = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xcfd6e8, size: 1.6, sizeAttenuation: false, fog: false,
        transparent: true, opacity: 0, depthWrite: false,
      }));
      scene.add(bgStars);
    }
    sizeToHolder();
    // THE HANDS OF THIS WORLD (all of it switchable in gear → Controls).
    //   one finger / left drag — ORBIT: turn your head, the eye stays put
    //   two fingers, or a trackpad's two-finger scroll — PAN: the eye roams
    //     the planet while the society stays exactly where it is (leading is
    //     its own armed button, so a drag can never march anybody anywhere)
    //   pinch, or ctrl+scroll — ZOOM. A trackpad's two-finger drag arrives as
    //     a WHEEL event, so panning has to live there and zoom moves to the
    //     pinch, which is what a trackpad pinch already sends. A phone had no
    //     way to zoom at all before this.
    //   arrow keys or WASD — roam, for anyone who would rather not drag
    //   shift+drag / right-drag — whichever of orbit and pan the single-finger
    //     drag is NOT doing right now
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map();                 // live pointers, for the two-finger gestures
    let mode = null;                       // 'pan' | 'orbit'
    let lx = 0, ly = 0, pinch0 = 0, dist0 = 0, movedPx = 0;
    // Screen directions on the ground plane, from the camera's own bearing.
    const groundBasis = () => ({
      rx: Math.sin(azimuth), rz: -Math.cos(azimuth),      // screen right
      fx: -Math.cos(azimuth), fz: -Math.sin(azimuth),     // screen up (away from the eye)
    });
    // DOWN CARRIES YOU FORWARD by default — two fingers pushed away from you
    // move the eye away from you, the way a trackpad scrolls a page. Invert it
    // in Controls and the ground sticks to your fingers instead.
    function panBy(dxPx, dyPx) {
      const b = groundBasis();
      const k = dist * 0.0022;             // farther out, a drag covers more ground
      const sign = getControls().invert ? -1 : 1;
      roam.x = wrap(roam.x + sign * (dxPx * b.rx + dyPx * b.fx) * k);
      roam.z = wrap(roam.z + sign * (dxPx * b.rz + dyPx * b.fz) * k);
      rebuildGroundIfNeeded();             // cheap: early-outs until the window is stale
    }
    dragTravel = () => movedPx;
    const twoFinger = () => [...pts.values()].slice(0, 2);
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* a nicety */ }
      if (pts.size === 2) {
        const [a, b] = twoFinger();
        mode = getControls().swap ? 'orbit' : 'pan';   // two fingers do the other thing
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist;
        lx = (a.x + b.x) / 2; ly = (a.y + b.y) / 2;
        return;
      }
      // one pointer: the primary gesture, or its opposite with shift / right
      const primary = getControls().swap ? 'pan' : 'orbit';
      const other = primary === 'pan' ? 'orbit' : 'pan';
      mode = (e.button === 2 || e.shiftKey) ? other : primary;
      movedPx = 0;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const [a, b] = twoFinger();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 8 && gap > 8) dist = Math.max(16, Math.min(FOG_FAR * 1.1, dist0 * (pinch0 / gap)));
        if (mode === 'pan') {
          panBy(mx - lx, my - ly);
        } else {
          azimuth -= (mx - lx) * 0.005;
          pitch = Math.max(0.15, Math.min(1.35, pitch + (my - ly) * 0.004));
        }
        lx = mx; ly = my;
        return;
      }
      const dx = e.clientX - lx, dy = e.clientY - ly;
      movedPx += Math.abs(dx) + Math.abs(dy);
      lx = e.clientX; ly = e.clientY;
      if (mode === 'orbit') {
        azimuth -= dx * 0.005;
        pitch = Math.max(0.15, Math.min(1.35, pitch + dy * 0.004)); // 0.15: low enough to look up at the night's stars
      } else if (mode === 'pan') {
        panBy(dx, dy);
      }
    });
    const liftPointer = (e) => { pts.delete(e.pointerId); if (!pts.size) mode = null; else if (pts.size === 1) { const [a] = twoFinger(); lx = a.x; ly = a.y; mode = 'pan'; } };
    window.addEventListener('pointerup', liftPointer);
    window.addEventListener('pointercancel', liftPointer);
    el.addEventListener('contextmenu', (e) => e.preventDefault());   // right-drag is orbit, not a menu
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      // A trackpad pinch arrives as ctrl+wheel; so does a browser zoom gesture.
      // Everything else is two fingers travelling, which is a pan now.
      const pinching = e.ctrlKey || getControls().swap;
      if (pinching) { dist = Math.max(16, Math.min(FOG_FAR * 1.1, dist + e.deltaY * 0.05)); return; }
      panBy(-e.deltaX, -e.deltaY);
    }, { passive: false });
    // the keyboard roams too — and never while someone is typing into a field
    window.addEventListener('keydown', (e) => {
      if (!rootEl || rootEl.hidden) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const step = 26;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') panBy(step, 0);
      else if (k === 'arrowright' || k === 'd') panBy(-step, 0);
      else if (k === 'arrowup' || k === 'w') panBy(0, step);
      else if (k === 'arrowdown' || k === 's') panBy(0, -step);
      else return;
      e.preventDefault();
    });
    el.addEventListener('click', onGroundClick);
    loop();
  }

  function sizeToHolder() {
    const holder = rootEl?.querySelector('.world-canvas');
    if (!holder || !renderer) return;
    const w = holder.clientWidth || 600, h = holder.clientHeight || 480;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // The ground window: one instanced box per column, rebuilt when the society
  // has walked far enough that the old window no longer holds it.
  // Where the window is centered: your society walks and the camera follows it;
  // a watcher stands still over the ground they chose.
  function homeAnchor() {
    if (state?.me) return anchorAt({ course: state.me.course }, now());
    return { x: state?.at?.x || 0, z: state?.at?.z || 0, moving: false };
  }
  function centerAnchor() {
    const a = homeAnchor();
    if (!roaming()) return a;
    return { x: wrap(a.x + roam.x), z: wrap(a.z + roam.z), moving: a.moving };
  }

  function rebuildGroundIfNeeded(force) {
    if (!state) return;
    const a = centerAnchor();
    if (!force && center && Math.hypot(wdelta(center.x, a.x), wdelta(center.z, a.z)) < 10) return;
    const recentered = !center || center.x !== Math.round(a.x) || center.z !== Math.round(a.z);
    center = { x: Math.round(a.x), z: Math.round(a.z) };
    // plant positions are baked into their instance matrices, so they have to
    // be rebuilt whenever the window they were baked against moves — and
    // SYNCHRONOUSLY: this runs mid-frame, and a deferred rebuild let the frame
    // render stale matrices against the new center, teleporting every tree by
    // the recenter delta for one visible frame on each step of a walk.
    if (recentered && plantMeshes.length) rebuildPlants();
    if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.dispose(); }
    if (water) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }
    const side = 2 * R;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    ground = new THREE.InstancedMesh(geo, mat, side * side);
    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    let i = 0;
    for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) {
      const wx = center.x + dx, wz = center.z + dz;
      const c = columnAt(wx, wz);
      const h = Math.max(c.h, 1);
      m4.makeScale(1, h, 1);
      m4.setPosition(dx, h / 2, dz);
      ground.setMatrixAt(i, m4);
      // subtle per-column shade so the ground reads as ground, not as a grid
      const jitter = 0.92 + ((wx * 7919 + wz * 104729) % 13) / 13 * 0.16;
      color.setHex(MAT_COLORS[c.mat] || MAT_COLORS.soil).multiplyScalar(jitter);
      ground.setColorAt(i, color);
      i++;
    }
    ground.instanceMatrix.needsUpdate = true;
    if (ground.instanceColor) ground.instanceColor.needsUpdate = true;
    scene.add(ground);
    water = new THREE.Mesh(
      new THREE.PlaneGeometry(side, side),
      new THREE.MeshLambertMaterial({ color: 0x1c4152, transparent: true, opacity: 0.72 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = SEA_LEVEL + 0.35;
    scene.add(water);
  }

  // Bodies: voxel MINI-ORBS — a fibonacci shell of tiny glowing cubes,
  // seeded per body, rotating slowly and breathing. The orb's child,
  // pixelated, in the world's own material.
  // Left things: a small glowing octahedron in the maker's scheme — visible
  // from a distance, legible up close through the percept and the rail.
  // The home ground, as Colin described it: a wooden forge, a small green dome,
  // a small steel building, crates, and the panels the sprites charge on. These
  // are the first things here that a society MADE rather than found, so they
  // are drawn as objects with shape rather than as glow.
  function rebuildBuilt() {
    for (const m of builtMeshes) { scene.remove(m.mesh); m.mesh.geometry.dispose(); disposeMat(m.mesh.material); }
    builtMeshes = [];
    if (!scene) return;
    for (const b of state?.built || []) {
      const g = new THREE.Group();
      if (b.kind === 'forge') {
        // lighter than real timber on purpose: a brown building on brown
        // ground is a building nobody can see
        g.add(box(2, 1.5, 2, 0xa8774a, 0.75));
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4),
          new THREE.MeshLambertMaterial({ color: 0x7a4f2c }));
        roof.position.y = 1.5 + 0.45; roof.rotation.y = Math.PI / 4;   // ON the walls, not inside them
        g.add(roof);
      } else if (b.kind === 'solarforge') {
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(1.25, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: 0x2c6b48, emissive: 0x0d2a1b, emissiveIntensity: 0.9 }),
        );
        g.add(dome);
      } else if (b.kind === 'aiforge') {
        g.add(box(1.7, 2.2, 1.7, 0x8d949c, 1.1));
        const cap = box(1.9, 0.16, 1.9, 0xb6bec8, 2.2);
        g.add(cap);
      } else if (b.kind === 'vehicle') {
        const rover = b.of === 'rover';
        g.add(box(rover ? 1.5 : 1.3, 0.5, rover ? 1.0 : 0.85, rover ? 0x7d8896 : 0x8a6134, 0.42));
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
      } else if (b.kind === 'storage') {
        g.add(box(1.5, 1.15, 1.5, b.of === 'metal' ? 0x8f99a6 : 0x8a8d90, 0.58));
        const lid = box(1.62, 0.14, 1.62, b.of === 'metal' ? 0xaab4c0 : 0xa2a5a9, 1.2);
        g.add(lid);
      } else if (b.kind === 'panel') {
        // dark glass on a low frame, tilted to the sky. An empty one glows
        // faintly — it is waiting for a sprite that does not exist yet.
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 0.1, 1.15),
          new THREE.MeshLambertMaterial({ color: 0x0f1830, emissive: b.free ? 0x1b3b6b : 0x0a1224, emissiveIntensity: b.free ? 0.85 : 0.4 }),
        );
        glass.rotation.x = -0.32; glass.position.y = 0.34;
        g.add(glass);
        g.add(box(1.5, 0.3, 0.9, 0x2b2f36, 0.15));
      }
      scene.add(g);
      builtMeshes.push({ mesh: g, b });
    }
  }
  function box(w, h, d, color, y) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.y = y;
    return m;
  }
  const disposeMat = (m) => (Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose());

  // The living cover. Ground plants are little tufts; trees are a trunk and a
  // crown sized by how grown they are, so a felled stump coming back is
  // something you can watch happen over days rather than read in a list.
  function rebuildPlants() {
    for (const m of plantMeshes) { scene.remove(m.mesh); m.mesh.geometry.dispose(); disposeMat(m.mesh.material); }
    plantMeshes = [];
    if (!scene || !center) return;
    const sp = state?.species || {};
    // the cover is computed here from the same seed the server uses; only the
    // stumps and the sown seeds had to travel
    const cut = new Map((state?.flora?.felled || []).map((f) => [`${f.x},${f.z}`, f.t]));
    const sown = new Map((state?.flora?.planted || []).map((f) => [`${f.x},${f.z}`, f]));
    // the same rule the server keeps: nothing grows where something stands, so
    // a forge and its panels are not swallowed by the wood around them
    // mirrors world.mjs CLEAR_R: a panel is cleared wider than the rest, because
    // a solar panel in the shade of a pine is not a solar panel
    const cleared = new Set();
    for (const b of state?.built || []) {
      const r = b.kind === 'panel' ? 3 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) cleared.add(`${wrap(b.x + dx)},${wrap(b.z + dz)}`);
    }
    const now = Date.now() + skew;
    const grouped = new Map();                       // one instanced mesh per species+stage
    const PR = 34;                                   // plants are drawn nearer than the ground
    for (let dz = -PR; dz <= PR; dz++) {
      for (let dx = -PR; dx <= PR; dx++) {
        const x = wrap(center.x + dx), z = wrap(center.z + dz);
        const key = `${x},${z}`;
        if (cleared.has(key)) continue;
        let species = null, stage = 'mature', vig = 1;
        const seed = sown.get(key);
        if (seed) {
          species = seed.key; vig = vigourOf(species, x, z);
          stage = stageOfPlant(species, seed.t, now, vig);
        } else {
          const nat = naturalAt(x, z);
          if (!nat) continue;
          species = nat.key; vig = nat.vigour;
          const t0 = cut.get(key);
          if (t0) stage = stageOfPlant(species, t0, now, vig);
        }
        // ground cover is texture: sample it. anything with wood in it is a
        // place a sprite could be sent, so it is drawn whole. The sample
        // lattice is ABSOLUTE (x, z), never window-relative: the window
        // recenters on a walking society, and a window-relative lattice made
        // the whole moss field re-pick itself and travel with the walkers.
        // (WORLD_SIZE is divisible by 4, so the lattice survives the wrap.)
        const meta = sp[species];
        if (!meta) continue;
        if (!meta.wood && ((x & 3) || (z & 3))) continue;
        const k = `${species}|${stage}`;
        if (!grouped.has(k)) grouped.set(k, []);
        // No count cap: the old first-700-in-scan-order cap was window-anchored
        // too, so in a dense forest the drawn set's edge crawled along with the
        // walk — trees "moving". The window itself (69² columns, instanced) is
        // the honest bound.
        grouped.get(k).push({ x, z });
      }
    }
    for (const [k, list] of grouped) {
      const [key, stage] = k.split('|');
      const meta = sp[key];
      const form = FORMS[key];
      if (!meta || !form) continue;
      const grow = stage === 'mature' ? 1 : stage === 'sapling' ? 0.55 : stage === 'sprout' ? 0.25 : 0.1;
      // one instanced mesh per PART per species+stage: a tree is a trunk and a
      // crown, and drawing it as a single cone was drawing a shape, not a tree
      for (const part of form) {
        const geo = geoFor(part);
        const mesh = new THREE.InstancedMesh(
          geo,
          new THREE.MeshLambertMaterial({ color: new THREE.Color(part.c === 'leaf' ? meta.color : part.c) }),
          list.length,
        );
        const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion();
        const e = new THREE.Euler(), sc = new THREE.Vector3();
        list.forEach((p, i) => {
          const gh = columnAt(Math.round(p.x), Math.round(p.z)).h;
          const base = Math.max(gh, SEA_LEVEL);
          // a seeded turn and a little variation in size, so a wood is trees
          // rather than one tree stamped four hundred times
          const r = hash2(p.x, p.z, 61);
          const r2 = hash2(p.x, p.z, 62);
          const g = grow * (0.82 + r2 * 0.36);
          e.set(part.flip ? Math.PI : 0, r * Math.PI * 2, 0);
          q.setFromEuler(e);
          sc.set(g, g, g);
          pos.set(
            wdelta(center.x, p.x) + (part.dx || 0) * g,
            base + part.y * g,
            wdelta(center.z, p.z) + (part.dz || 0) * g,
          );
          m4.compose(pos, q, sc);
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        plantMeshes.push({ mesh });
      }
    }
  }

  // Trunks and crowns, in the world's own blocky idiom but with the parts a
  // real plant actually has. Heights are for a grown one; everything scales.
  // 'leaf' takes the species colour from the server; anything else is bark.
  const BARK = 0x584231, DRYBARK = 0x4d4033;
  const FORMS = {
    moss:      [{ g: 'box', w: 0.52, h: 0.1, y: 0.05, c: 'leaf' }],
    grass:     [{ g: 'box', w: 0.13, h: 0.36, y: 0.18, c: 'leaf' },
                { g: 'box', w: 0.09, h: 0.26, y: 0.13, c: 'leaf', dx: 0.15, dz: 0.11 }],
    scrub:     [{ g: 'cyl', w: 0.08, h: 0.36, y: 0.18, c: DRYBARK },
                { g: 'crown', w: 0.44, h: 0.5, y: 0.58, c: 'leaf' }],
    cactus:    [{ g: 'cyl', w: 0.16, h: 1.1, y: 0.55, c: 'leaf' },
                { g: 'cyl', w: 0.09, h: 0.42, y: 0.78, c: 'leaf', dx: 0.23 }],
    // a conifer carries its crown high: the lowest branches start about a third
    // of the way up, and the bare trunk under them is most of what says "tree"
    pine:      [{ g: 'cyl', w: 0.15, h: 2.6, y: 1.3, c: BARK },
                { g: 'cone', w: 0.8, h: 1.7, y: 2.0, c: 'leaf' },
                { g: 'cone', w: 0.52, h: 1.3, y: 3.0, c: 'leaf' }],
    broadleaf: [{ g: 'cyl', w: 0.19, h: 2.3, y: 1.15, c: BARK },
                { g: 'crown', w: 1.3, h: 1.45, y: 2.85, c: 'leaf' },
                { g: 'crown', w: 0.8, h: 0.9, y: 2.2, c: 'leaf', dx: 0.55 }],
    palm:      [{ g: 'cyl', w: 0.12, h: 3.0, y: 1.5, c: BARK },
                { g: 'cone', w: 1.05, h: 0.55, y: 3.05, c: 'leaf', flip: true }],
  };
  const geoCache = new Map();
  function geoFor(part) {
    const key = `${part.g}|${part.w}|${part.h}`;
    if (geoCache.has(key)) return geoCache.get(key);
    const g = part.g === 'cone' ? new THREE.ConeGeometry(part.w, part.h, 6)
      : part.g === 'cyl' ? new THREE.CylinderGeometry(part.w * 0.78, part.w, part.h, 6)
        : part.g === 'crown' ? new THREE.SphereGeometry(part.w, 8, 6)
          : new THREE.BoxGeometry(part.w, part.h, part.w);
    if (part.g === 'crown') g.scale(1, part.h / part.w, 1);   // crowns are wider than tall
    geoCache.set(key, g);
    return g;
  }

  // heights mirror src/flora.js; the client draws, the server decides
  const SPECIES_H = { moss: 0.12, grass: 0.3, scrub: 0.9, cactus: 1.1, pine: 3.4, broadleaf: 4.2, palm: 3.8 };

  function rebuildArtifacts() {
    for (const m of artifactMeshes) { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); }
    artifactMeshes = [];
    if (!scene) return;
    for (const art of state?.artifacts || []) {
      const glow = SCHEME_GLOW[art.scheme] || SCHEME_GLOW.stardust;
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34),
        new THREE.MeshLambertMaterial({ color: 0x181b20, emissive: glow, emissiveIntensity: 0.7 }),
      );
      scene.add(mesh);
      artifactMeshes.push({ mesh, art });
    }
  }

  const VOX_PER_BODY = 26;
  function rebuildBodies() {
    for (const b of bodyMeshes) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    bodyMeshes = [];
    const societies = [
      ...(state.me ? [{ ...state.me, mine: true, awake: true }] : []),
      ...(state.near || []).map((n) => ({ ...n, mine: false })),
    ];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (const soc of societies) {
      const glow = SCHEME_GLOW[soc.scheme] || SCHEME_GLOW.stardust;
      for (let i = 0; i < (soc.bodies || []).length; i++) {
        const body = soc.bodies[i];
        const shellR = body.stage === 'grown' ? 0.62 : body.stage === 'sprout' ? 0.48 : 0.36;
        const vox = 0.14 + shellR * 0.16;
        const mesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(vox, vox, vox),
          new THREE.MeshLambertMaterial({ color: 0x181b20, emissive: glow, emissiveIntensity: soc.awake ? 0.9 : 0.2 }),
          VOX_PER_BODY,
        );
        const m4 = new THREE.Matrix4();
        for (let v = 0; v < VOX_PER_BODY; v++) {
          const y = 1 - (v / (VOX_PER_BODY - 1)) * 2;
          const rad = Math.sqrt(1 - y * y);
          const th = golden * v + (body.seed % 100) * 0.063; // each body's shell is its own
          const jit = 0.86 + (((body.seed + v * 37) % 13) / 13) * 0.3;
          m4.setPosition(Math.cos(th) * rad * shellR * jit, y * shellR * jit, Math.sin(th) * rad * shellR * jit);
          mesh.setMatrixAt(v, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        bodyMeshes.push({ mesh, society: soc, index: i, spin: 0.25 + ((body.seed % 7) / 7) * 0.3 });
      }
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!state || !renderer) return;
    try { frame(); } catch (e) { if (!loop.warned) { console.error('[world] frame:', e); loop.warned = true; } }
  }
  // THE SOCIETY STARS. Every other society on the planet, hung as a small
  // glowing mark in the true direction it lies — nearer is higher. Rebuilt
  // from the slow map poll; the frame loop only places, fades and twinkles.
  async function refreshSkyMap() {
    try {
      const r = await fetch('/api/world/map').then((x) => x.json());
      skyMap = r?.map || [];
      rebuildSocStars();
    } catch { /* the sky keeps its last stars */ }
  }
  function rebuildSocStars() {
    for (const st of socStars) { scene?.remove(st.mesh); st.mesh.geometry.dispose(); st.mesh.material.dispose(); }
    socStars = [];
    if (!scene) return;
    const centerHandle = watching || state?.me?.handle;
    starCenter = centerHandle || null;
    for (const soc of skyMap) {
      if (!soc.handle || soc.handle === centerHandle) continue; // you are HERE, not overhead
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshBasicMaterial({
          color: SCHEME_GLOW[soc.scheme] || SCHEME_GLOW.stardust,
          fog: false, transparent: true, opacity: 0,
        }),
      );
      scene.add(mesh);
      socStars.push({ mesh, soc });
    }
  }

  // The three keys of the sky, lerped by the sun's height: night is moonlit
  // rather than void (the world stays watchable), day is steel-blue rather
  // than candy, and the twilight band warms both edges.
  const SKY_NIGHT = new THREE.Color(0x05070d), SKY_DAY = new THREE.Color(0x6f87a3), SKY_DUSK = new THREE.Color(0x4a3030);
  const AMB_NIGHT = new THREE.Color(0x40507a), AMB_DAY = new THREE.Color(0x8090a8);
  const WATER_NIGHT = new THREE.Color(0x122a35), WATER_DAY = new THREE.Color(0x1c4152);
  const skyColor = new THREE.Color();
  function lightSky(a, t) {
    if (!sky) return null;
    const dl = daylightAt(a.x, t);
    const twilight = Math.max(0, 1 - Math.abs(dl.elev) / 0.3);
    skyColor.copy(SKY_NIGHT).lerp(SKY_DAY, dl.light).lerp(SKY_DUSK, twilight * 0.55);
    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);
    // the sun arcs east (+x) to west; the moon rides the opposite arc
    const ang = (dl.frac - 0.25) * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    sky.sun.position.set(sx * 80, sy * 80, 18);
    sky.sun.intensity = 0.05 + dl.light * 1.15;
    sky.moon.position.set(-sx * 80, -sy * 80, 18);
    sky.moon.intensity = 0.04 + (1 - dl.light) * 0.26;
    sky.ambient.intensity = 0.18 + dl.light * 0.42;
    sky.ambient.color.copy(AMB_NIGHT).lerp(AMB_DAY, dl.light);
    if (water) water.material.color.copy(WATER_NIGHT).lerp(WATER_DAY, dl.light);
    // the discs hang over the window's center, far enough to read as sky
    const cx = wdelta(center.x, a.x), cz = wdelta(center.z, a.z);
    sky.sunDisc.position.set(cx + sx * 130, 8 + sy * 130, cz + 26);
    sky.sunDisc.visible = dl.elev > -0.06;
    sky.moonDisc.position.set(cx - sx * 130, 8 - sy * 130, cz + 26);
    sky.moonDisc.visible = dl.elev < 0.06;
    // the stars come up as the sun goes well under, and hang in WORLD
    // directions around the window's center — orbiting the camera pans
    // across a fixed sky, like standing anywhere does
    const nightness = Math.max(0, Math.min(1, (-dl.elev - 0.05) / 0.25));
    if (bgStars) {
      bgStars.material.opacity = nightness * 0.55;
      bgStars.visible = nightness > 0.01;
      bgStars.position.set(cx, 8, cz);
    }
    if (socStars.length && nightness <= 0.01) {
      // full day: one pass to hide, then nothing — the old path allocated and
      // sorted every frame for stars nobody could see
      if (!socStars.hidden) { for (const st of socStars) st.mesh.visible = false; socStars.hidden = true; }
    } else if (socStars.length) {
      socStars.hidden = false;
      const byHandle = new Map();
      for (const sv of starsOver(a.x, a.z, socStars.map((st) => st.soc))) byHandle.set(sv.handle, sv);
      for (let i = 0; i < socStars.length; i++) {
        const st = socStars[i], sv = byHandle.get(st.soc.handle);
        if (!sv) { st.mesh.visible = false; continue; }
        st.mesh.position.set(
          cx + Math.cos(sv.az) * Math.cos(sv.alt) * 142,
          8 + Math.sin(sv.alt) * 142,
          cz + Math.sin(sv.az) * Math.cos(sv.alt) * 142,
        );
        // awake burns bright and breathes; asleep is a faint steady coal
        const tw = st.soc.awake ? 0.75 + 0.25 * Math.sin(t / 300 + i * 2.7) : 0.28;
        st.mesh.material.opacity = nightness * tw;
        st.mesh.visible = nightness > 0.01;
        const sc = st.soc.awake ? 1 + 0.18 * Math.sin(t / 450 + i) : 0.8;
        st.mesh.scale.setScalar(sc);
      }
    }
    return dl;
  }

  function frame() {
    const t = now();
    const me = state.me ? { course: state.me.course, bodies: state.me.bodies } : null;
    const a = centerAnchor();
    rebuildGroundIfNeeded(false);
    const dl = lightSky(a, t);
    // every body, mine and neighbors', animated by the same pure math
    const positions = new Map();
    if (me) positions.set('me', bodyPositions(me, t, true));
    for (const n of state.near || []) positions.set(n.handle, bodyPositions(n, t, n.awake));
    for (const bm of builtMeshes) {
      // a column of height h has its top surface at exactly h, which is what
      // the plants already sit on. Buildings were being lifted half a block
      // above it and floating.
      const gh = columnAt(Math.round(bm.b.x), Math.round(bm.b.z)).h;
      bm.mesh.position.set(wdelta(center.x, bm.b.x), Math.max(gh, SEA_LEVEL), wdelta(center.z, bm.b.z));
    }
    // the name tag rides above whichever sprite was tapped — after the bodies
    // have been placed this frame, so it never trails them by a frame
    const tagEl = rootEl?.querySelector('#world-tag');
    if (tagEl) {
      const info = tagTextFor(tagged);
      const p = info ? spriteScreenPos(info.at) : null;
      if (!p) tagEl.hidden = true;
      else {
        tagEl.hidden = false;
        tagEl.textContent = info.text;
        tagEl.style.left = `${p.x}px`;
        tagEl.style.top = `${p.y - 14}px`;
      }
    }
    for (const am of artifactMeshes) {
      const gh = columnAt(Math.round(am.art.x), Math.round(am.art.z)).h;
      am.mesh.position.set(wdelta(center.x, am.art.x), Math.max(gh, SEA_LEVEL) + 0.8 + Math.sin(t / 1000 + am.art.x) * 0.1, wdelta(center.z, am.art.z));
      am.mesh.rotation.y = t / 1000 * 0.4;
    }
    for (const bm of bodyMeshes) {
      const list = positions.get(bm.society.mine ? 'me' : bm.society.handle);
      const p = list?.[bm.index];
      if (!p) continue;
      const gh = columnAt(Math.round(p.x), Math.round(p.z)).h;
      // positions are global; the scene is centered on the window
      bm.mesh.position.set(wdelta(center.x, p.x), Math.max(gh, SEA_LEVEL) + 1.0, wdelta(center.z, p.z));
      const slow = p.drowsing ? 0.18 : 1;
      bm.mesh.rotation.y = t / 1000 * bm.spin * slow;
      bm.mesh.rotation.x = Math.sin(t / 1000 * 0.3 * slow + bm.index) * 0.2;
      const breathe = 0.88 + Math.sin(t / 1000 * (p.drowsing ? 0.5 : 1.6) + bm.index * 2.1) * 0.12;
      bm.mesh.scale.setScalar(breathe);
      bm.mesh.material.emissiveIntensity = (bm.society.awake ? 0.9 : 0.2) * breathe;
    }
    // the camera keeps the society in frame, orbiting on the owner's drag
    const cx = wdelta(center.x, a.x), cz = wdelta(center.z, a.z);
    const camX = cx + Math.cos(azimuth) * dist * Math.cos(pitch * 0.6);
    const camZ = cz + Math.sin(azimuth) * dist * Math.cos(pitch * 0.6);
    // the low pitch floor (for the night sky) can put the eye below a tall
    // ridge at far zoom — never let the camera sink into the ground it stands on
    const camGround = columnAt(Math.round(center.x + camX), Math.round(center.z + camZ)).h;
    camera.position.set(camX, Math.max(12 + Math.sin(pitch) * dist * 0.8, camGround + 3), camZ);
    camera.lookAt(cx, 8, cz);
    // Fog is measured from the CAMERA. Tuned to it every frame: the ground in
    // view stays clear at any zoom, and the window's edge is always dissolved
    // before it can show a hard cutoff.
    scene.fog.near = dist * 0.9;
    scene.fog.far = dist + R * 0.92;
    renderer.render(scene, camera);
    // self-healing size: the fullscreen layout settles whenever it settles
    const holder = rootEl?.querySelector('.world-canvas');
    if (holder && renderer && (renderer.domElement.width !== Math.round(holder.clientWidth * renderer.getPixelRatio()))) {
      sizeToHolder();
    }
    // the mark and budget mirror the one life's real state (home DOM is truth)
    const wakeBtn = rootEl?.querySelector('#world-wake');
    if (wakeBtn) {
      // only a WORLD-place waking lights this mark: an orb waking has no hands
      // here, and a glow that said otherwise would be a lie about the split
      const aliveHere = document.body.classList.contains('alive-world');
      wakeBtn.classList.toggle('alive', aliveHere);
      wakeBtn.title = aliveHere ? 'let them rest' : 'wake them here';
    }
    const wSlider = rootEl?.querySelector('#world-budget-slider');
    const wLabel = rootEl?.querySelector('#world-budget');
    const homeSlider = $('tend-budget-slider');
    if (wSlider && homeSlider && !worldBudgetDrag) {
      wSlider.max = homeSlider.max;
      wSlider.value = homeSlider.value;
    }
    if (wLabel) wLabel.textContent = $('tend-budget')?.textContent || '—';
    // the status line tracks the walk without a re-render
    const status = rootEl?.querySelector('#world-status');
    if (status) {
      const moving = (state.me && a.moving) ? ` — walking to (${wrap(Math.round(state.me.course.toX))}, ${wrap(Math.round(state.me.course.toZ))})` : '';
      const who = watching ? `watching @${watching} · ` : '';
      const hour = dl ? ` · ${timeOfDayWord(dl.frac)}` : '';
      // ROAMING: say plainly that the eye is away from home and how far, and
      // name the ground under it — the two things you want while exploring.
      let away = '';
      if (roaming()) {
        const h = homeAnchor();
        const blocks = Math.round(wdist(a.x, a.z, h.x, h.z));
        const t = terrainAt(Math.round(a.x), Math.round(a.z));
        const ground = t.h < SEA_LEVEL ? 'water' : t.mat;
        away = ` · ${ground} · ${blocks} blocks from home`;
      }
      status.textContent = `${who}(${Math.round(a.x)}, ${Math.round(a.z)})${moving}${hour}${away}`;
      syncHomeButton();
    }
  }

  // Lead mode: click the ground, the society walks there — 2 blocks a second,
  // everyone watching sees the same walk from the same clock.
  // Tap a sprite and its name floats above it. Picked by projecting each body
  // to the screen rather than raycasting its cubes — the bodies are instanced
  // meshes of 26 little boxes each, and their centers are what a finger means.
  // Where a sprite is on screen, computed from where it IS rather than from
  // where its mesh currently sits. Meshes are rebuilt on every poll and only
  // repositioned on the next animation frame, so reading their transforms means
  // reading the origin for whichever frame falls in that gap.
  function spriteScreenPos(sp) {
    if (!renderer || !camera || !center) return null;
    const gh = columnAt(Math.round(sp.x), Math.round(sp.z)).h;
    const v = new THREE.Vector3(
      wdelta(center.x, sp.x), Math.max(gh, SEA_LEVEL) + 1.0, wdelta(center.z, sp.z),
    ).project(camera);
    if (v.z > 1) return null;                      // behind the camera
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height, rect };
  }

  // Everything tappable on the ground: your sprites first, then what you built.
  // A sprite standing on its panel should read as the sprite, since that is the
  // thing you can send somewhere.
  function pickThing(e) {
    if (!renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = 46;
    (state?.sprites || []).forEach((sp, i) => {
      const p = spriteScreenPos(sp);
      if (!p) return;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) { bestD = d; best = { kind: 'sprite', i }; }
    });
    if (best) return best;
    (state?.built || []).forEach((b, i) => {
      const p = spriteScreenPos(b);
      if (!p) return;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) { bestD = d; best = { kind: 'built', i }; }
    });
    return best;
  }

  // What a tag says about whatever was tapped.
  function tagTextFor(t) {
    if (!t) return null;
    if (t.kind === 'sprite') {
      const sp = (state?.sprites || [])[t.i];
      return sp ? { at: sp, text: `${sp.name}${sp.carrying ? ` · ${sp.carrying}/50` : ''}` } : null;
    }
    const b = (state?.built || [])[t.i];
    if (!b) return null;
    const names = { forge: 'the forge', solarforge: 'the solar forge', aiforge: 'the ai forge' };
    if (b.kind === 'storage') {
      const held = Object.values(b.hold || {}).reduce((a, n) => a + n, 0);
      return { at: b, text: `${b.of} storage · ${held ? `${held} blocks, ${b.slots}/${b.maxSlots} slots` : 'empty'}` };
    }
    if (b.kind === 'panel') return { at: b, text: b.free ? 'a solar panel · empty' : 'a solar panel' };
    if (b.kind === 'vehicle') return { at: b, text: `${b.of}${b.hitched == null ? ' · unhitched' : ' · in use'}` };
    return { at: b, text: names[b.kind] || b.kind };
  }

  async function onGroundClick(e) {
    // A DRAG IS NOT A TAP. Panning ends with a click event like any other
    // pointer sequence, and with lead armed that would have marched the whole
    // society to wherever the hand happened to stop.
    if (dragTravel() > 6) return;
    // a tap on a sprite names it before it ever means "walk there"
    const tapped = pickThing(e);
    if (tapped) {
      const same = tagged && tagged.kind === tapped.kind && tagged.i === tapped.i;
      tagged = same ? null : tapped;
      if (tapped.kind === 'sprite') panel?.select(same ? null : tapped.i + 1);
      else if (!same && (state?.built || [])[tapped.i]?.kind === 'storage') {
        // tapping a unit in the world opens the same unit in the panel
        const idx = (state.built || []).filter((b) => b.kind === 'storage').indexOf(state.built[tapped.i]);
        panel?.openStorage(idx);
      }
      return;
    }
    if (tagged != null) { tagged = null; const t = rootEl?.querySelector('#world-tag'); if (t) t.hidden = true; }
    if (!leading || !state) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(ground, false)[0];
    if (!hit) return;
    const toX = wrap(center.x + Math.round(hit.point.x));
    const toZ = wrap(center.z + Math.round(hit.point.z));
    leading = false;
    rootEl.querySelector('#world-lead')?.classList.remove('on');
    const r = await fetch('/api/world/lead', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toX, toZ }),
    }).then((x) => x.json()).catch(() => ({ error: 'could not reach the world' }));
    if (r.error) { toast?.(r.error); return; }
    state.me.course = r.course;
    skew = r.now - Date.now();
  }

  // ---- overlay ---------------------------------------------------------------

  let lastOverlay = '';   // the overlay as last drawn; the 10s poll must not rebuild it unchanged
  function renderOverlay() {
    const list = rootEl?.querySelector('#world-near');
    if (!list) return;
    const rows = (state.near || []).map((n) =>
      `<div class="world-nearrow">@${esc(n.handle)} · ${n.awake ? 'awake' : 'sleeping'}</div>`).join('');
    // words that carried recently, newest last, fading as they age — the
    // watchers hear what crossed the open ground
    const now = Date.now();
    const voices = (state.voices || []).map((v) => {
      const age = Math.min(1, (now - v.t) / (15 * 60 * 1000));
      const mins = Math.max(0, Math.round((now - v.t) / 60000));
      return `<div class="world-voice" style="opacity:${(1 - age * 0.65).toFixed(2)}">@${esc(v.from)} → @${esc(v.to)}: “${esc(v.text)}”<i> · ${mins < 1 ? 'just now' : mins + 'm ago'}</i></div>`;
    }).join('');
    // how this people lives — the one thing here that outlasts its maker's
    // attention, so it stands on the rail while voices fade above it
    const ways = (state.ways || []).map((w) =>
      `<div class="world-way">${esc(w.text)}<i>${w.by && watching ? ` · @${esc(w.by)}` : ''}${w.own === false && w.from ? ` · learned from @${esc(w.from)}` : ''}${w.held > 1 ? ` · ${w.held} societies live by it` : ''}</i></div>`).join('');
    const waysLabel = watching ? 'ways lived here' : 'your people live by';
    const emptyNear = watching
      ? '<div class="world-nearrow muted">no society within sight of this ground</div>'
      : '<div class="world-nearrow muted">no other society within sight — the planet is wide</div>';
    // an identical overlay leaves the DOM alone — a rebuilt node drops its
    // liquid ring, and the sweep that re-pours it is what flashes the rails
    const html = (rows || emptyNear)
      + voices + (ways ? `<div class="world-ways"><i>${waysLabel}</i>${ways}</div>` : '');
    if (html === lastOverlay) return;
    lastOverlay = html;
    list.innerHTML = html;
  }

  // A watcher gets no verbs — not because the buttons would be refused (they
  // would), but because offering them would be a lie about whose world this is.
  function setBarMode() {
    const wake = rootEl?.querySelector('#world-wake');
    const lead = rootEl?.querySelector('#world-lead');
    if (!wake || !lead) return;
    const isWatching = !!watching;
    wake.hidden = isWatching;
    lead.hidden = isWatching;
    const ws = rootEl?.querySelector('#world-budget-slider');
    const wb = rootEl?.querySelector('#world-budget');
    if (ws) ws.hidden = isWatching;
    if (wb) wb.hidden = isWatching;
    const hands = rootEl?.querySelector('.hands');
    if (hands) hands.hidden = isWatching;
    if (isWatching) { leading = false; lead.classList.remove('on'); }
  }

  function goHome() {
    const wasWatching = watching;
    roam = { x: 0, z: 0 };
    watching = null;
    setBarMode();
    rebuildGroundIfNeeded(true);   // the window snaps back to the society at once
    if (wasWatching) fetchHere();  // and we need our own ground again, not theirs
    syncHomeButton();
  }
  function syncHomeButton() {
    const b = rootEl?.querySelector('#world-home');
    if (b) b.hidden = !(roaming() || watching);
  }

  // The planet drawn small: land, water, and height, sampled straight from the
  // same pure terrain function the ground is built from. Cached — the shape of
  // a world never changes.
  let terrainTile = null;
  function terrainMap(S) {
    if (terrainTile && terrainTile.width === S) return terrainTile;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const t = terrainAt(Math.round((px / S) * WORLD_SIZE), Math.round((py / S) * WORLD_SIZE));
        const i = (py * S + px) * 4;
        let r, gg, b;
        if (t.h < SEA_LEVEL) {
          const deep = Math.max(0, Math.min(1, (SEA_LEVEL - t.h) / SEA_LEVEL));
          r = 26 - deep * 12; gg = 52 - deep * 24; b = 86 - deep * 30;      // shelf → deep
        } else {
          const rise = Math.max(0, Math.min(1, (t.h - SEA_LEVEL) / 16));    // lowland → ridge
          const base = t.mat === 'sand' ? [122, 112, 84]
            : t.mat === 'stone' ? [92, 96, 104]
              : t.mat === 'soil' ? [78, 74, 58]
                : [58, 84, 58];                                             // grass
          r = base[0] + rise * 46; gg = base[1] + rise * 44; b = base[2] + rise * 44;
        }
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    terrainTile = c;
    return c;
  }

  async function showMap() {
    const r = await fetch('/api/world/map').then((x) => x.json()).catch(() => null);
    const cv = rootEl?.querySelector('#world-map');
    if (!r?.map || !cv) return;
    cv.hidden = !cv.hidden;
    if (cv.hidden) return;
    const g = cv.getContext('2d');
    const S = cv.width;
    // THE LAND ITSELF. The map used to be a day/night gradient with dots on
    // it: no coast, no ranges, nothing to navigate BY. The planet is a pure
    // function, so the client can simply draw it — once per session, into an
    // offscreen tile that every later opening reuses.
    g.drawImage(terrainMap(S), 0, 0);
    // THE TERMINATOR over it: each column is a longitude, so the band of
    // night crosses the world and every society sits in its own true hour.
    const tNow = now();
    for (let px = 0; px < S; px++) {
      const l = daylightAt((px / S) * WORLD_SIZE, tNow).light;
      g.fillStyle = `rgba(6, 8, 14, ${(0.62 * (1 - l)).toFixed(3)})`;
      g.fillRect(px, 0, 1, S);
    }
    const myHandle = state?.me?.handle;
    for (const s of r.map) {
      const x = (s.x / r.size) * S, y = (s.z / r.size) * S;
      g.beginPath();
      g.arc(x, y, s.handle === myHandle ? 3.5 : 2.2, 0, Math.PI * 2);
      g.fillStyle = s.handle === myHandle ? '#eceef2' : s.awake ? '#6fe3b0' : '#4a5160';
      g.fill();
    }
    // WHERE THE EYE IS, which is not always where the society is: a ring the
    // dots cannot be confused with, so roaming never loses you.
    const eye = centerAnchor();
    const ex = (wrap(eye.x) / r.size) * S, ey = (wrap(eye.z) / r.size) * S;
    g.beginPath();
    g.arc(ex, ey, 6, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(236,238,242,0.9)'; g.lineWidth = 1.5; g.stroke();
    g.beginPath();
    g.moveTo(ex - 9, ey); g.lineTo(ex - 3, ey); g.moveTo(ex + 3, ey); g.lineTo(ex + 9, ey);
    g.moveTo(ex, ey - 9); g.lineTo(ex, ey - 3); g.moveTo(ex, ey + 3); g.lineTo(ex, ey + 9);
    g.stroke();
    // clicking a society takes you to its ground — how anyone travels the
    // planet without owning a body on it
    cv.onclick = (e) => {
      const b = cv.getBoundingClientRect();
      const mx = ((e.clientX - b.left) / b.width) * r.size;
      const mz = ((e.clientY - b.top) / b.height) * r.size;
      let best = null, bestD = Infinity;
      for (const soc of r.map) {
        const d = Math.hypot(soc.x - mx, soc.z - mz);
        if (d < bestD) { bestD = d; best = soc; }
      }
      if (best && bestD <= r.size / 12) {
        if (best.handle === state?.me?.handle) { goHome(); cv.hidden = true; return; }
        watching = best.handle;
        roam = { x: 0, z: 0 };            // stand over THEIR ground, not an offset from ours
        setBarMode();
        cv.hidden = true;
        center = null; // force the ground to rebuild around the new place
        fetchHere();
        syncHomeButton();
        return;
      }
      // EMPTY GROUND IS A DESTINATION TOO. The map was only ever a list of
      // societies you could jump between; now any point on the planet can be
      // looked at, which is what makes it a map rather than a directory.
      const h = homeAnchor();
      roam = { x: wrap(mx - h.x), z: wrap(mz - h.z) };
      cv.hidden = true;
      rebuildGroundIfNeeded(true);
      syncHomeButton();
      toast?.('looking at (' + Math.round(mx) + ', ' + Math.round(mz) + ') — “home” brings you back.');
    };
  }

  // ---- lifecycle -------------------------------------------------------------

  let rootEl = null;
  function open(g) {
    grid = g;
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'world-root';
    rootEl = root;
    root.innerHTML = `
      <div class="world-canvas"></div>
      <div class="world-bar">
        <span id="world-status" class="world-status">…</span>
        <button type="button" id="world-wake" class="world-univi" aria-label="Mind — wake or rest" title="wake them">
          <img src="univi.png" alt="" />
        </button>
        <input id="world-budget-slider" type="range" min="0" max="20" step="0.05" value="0" aria-label="Budget to think with" />
        <span id="world-budget" class="world-budget">—</span>
        <button type="button" id="world-lead" class="login-alt">lead them</button>
        <button type="button" id="world-showmap" class="login-alt">the map</button>
        <button type="button" id="world-home" class="login-alt" hidden>home</button>
      </div>
      <canvas id="world-map" width="230" height="230" hidden></canvas>
      <div id="world-near" class="world-near"></div>
      <div id="world-tag" class="world-tag" hidden></div>
      <div class="world-note muted"></div>`;
    // On BODY, not the grid: the home panel carries transforms, and a
    // transformed ancestor quietly turns position:fixed into a small box.
    document.body.appendChild(root);
    root.querySelector('#world-lead').addEventListener('click', () => {
      leading = !leading;
      root.querySelector('#world-lead').classList.toggle('on', leading);
      if (leading) toast?.('tap the ground — they will walk there together.');
    });
    root.querySelector('#world-showmap').addEventListener('click', showMap);
    // THE WAY HOME. Wherever the eye has wandered — roamed across the planet
    // or gone to stand over somebody else's ground — this brings it back to
    // your own society in one press.
    root.querySelector('#world-home').addEventListener('click', () => goHome());
    // the panel is the owner's, so it is built only when there is a society to
    // command — a watcher is looking, not leading
    panel = createControlPanel({
      toast,
      act: (body) => fetch('/api/world/sprite', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }).then((x) => x.json()).catch(() => ({ error: 'the world did not answer' })),
    });
    panel.mount(root);
    setBarMode();
    // The society's mind is the presence, and the presence's waking is the
    // univispira — one switch for one life, reachable from its world. The
    // real controls live in the home DOM whatever view is open; the mark and
    // slider here PROXY them (dispatching the same events a hand would), and
    // frame() mirrors their state back, so there is exactly one budget and one
    // waking however many rooms show a handle on them.
    root.querySelector('#world-wake').addEventListener('click', () => {
      const mark = $('brain-toggle');
      if (!mark) { toast?.('sign in — the univispira wakes it.'); return; }
      mark.click();
    });
    const wSlider = root.querySelector('#world-budget-slider');
    const forwardBudget = (kind) => {
      const home = $('tend-budget-slider');
      if (!home) { toast?.('sign in — the budget is the mind\'s.'); return; }
      worldBudgetDrag = kind === 'input';
      home.value = wSlider.value;
      home.dispatchEvent(new Event(kind, { bubbles: true }));
    };
    wSlider.addEventListener('input', () => forwardBudget('input'));
    wSlider.addEventListener('change', () => forwardBudget('change'));
    // change never fires when a drag releases at its starting value — commit
    // on the release itself so the mirror (and the home popup's hold) unstick
    const releaseProxy = () => { if (worldBudgetDrag) forwardBudget('change'); };
    wSlider.addEventListener('pointerup', releaseProxy);
    wSlider.addEventListener('keyup', releaseProxy);
    wSlider.addEventListener('blur', releaseProxy);
    fetchHere();
    clearInterval(pollTimer);
    pollTimer = setInterval(fetchHere, 10000); // heartbeat + edits + neighbors
    refreshSkyMap();
    clearInterval(skyMapTimer);
    skyMapTimer = setInterval(refreshSkyMap, 60000); // societies drift slowly; so may their stars
    window.addEventListener('resize', sizeToHolder);
  }

  function close() {
    clearInterval(pollTimer); pollTimer = 0;
    clearInterval(skyMapTimer); skyMapTimer = 0;
    rootEl?.remove(); rootEl = null;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', sizeToHolder);
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
    for (const b of bodyMeshes) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    for (const m of plantMeshes) { m.mesh.geometry.dispose(); disposeMat(m.mesh.material); }
    for (const m of builtMeshes) { m.mesh.geometry?.dispose?.(); disposeMat(m.mesh.material); }
    for (const m of artifactMeshes) { m.mesh.geometry.dispose(); m.mesh.material.dispose(); }
    if (ground) { ground.geometry.dispose(); ground.material.dispose(); }
    if (water) { water.geometry.dispose(); water.material.dispose(); }
    if (sky) { sky.sunDisc.geometry.dispose(); sky.sunDisc.material.dispose(); sky.moonDisc.geometry.dispose(); sky.moonDisc.material.dispose(); }
    if (bgStars) { bgStars.geometry.dispose(); bgStars.material.dispose(); bgStars = null; }
    for (const st of socStars) { st.mesh.geometry.dispose(); st.mesh.material.dispose(); }
    socStars = []; skyMap = [];
    renderer = null; scene = null; camera = null; ground = null; water = null; sky = null;
    bodyMeshes = []; artifactMeshes = []; builtMeshes = []; plantMeshes = []; tagged = null; state = null; center = null; grid = null;
  }

  return { open, close };
}
