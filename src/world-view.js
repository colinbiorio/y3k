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
  SEA_LEVEL, wrap, wdelta, terrainAt, anchorAt, bodyPositions, WORLD_SIZE,
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
  let bodyMeshes = [];       // { mesh, society, index }
  let artifactMeshes = [];
  let builtMeshes = [];      // forges, panels and stores on the home ground
  // A sprite the person tapped: stored as its INDEX, not its mesh — the meshes
  // are rebuilt on every poll, so holding one would orphan the tag every ten
  // seconds without ever saying why.
  let tagged = null;   // small left things, glowing in their maker's scheme
  let center = null;         // the window's current center (rebuilt when far)
  let azimuth = 0.65, dist = 46, pitch = 0.9;
  let leading = false;
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
    try {
      skew = r.now - Date.now();
      state = r;
      editMap = new Map((r.edits || []).map((e) => [`${e.x},${e.z}`, e]));
      if (!scene) buildScene();
      rebuildGroundIfNeeded(true);
      rebuildBodies();
      rebuildArtifacts();
      rebuildBuilt();
      renderOverlay();
      if (panel && r.sprites) panel.update(r.sprites, r.materials, r.bills, r.built);
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
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(30, 50, 10);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x8090a8, 0.55));
    sizeToHolder();
    // drag orbits, wheel zooms — the same hands as the orb
    let dragging = false, lx = 0, ly = 0;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      azimuth -= (e.clientX - lx) * 0.005;
      pitch = Math.max(0.35, Math.min(1.35, pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(16, Math.min(FOG_FAR * 1.1, dist + e.deltaY * 0.05)); }, { passive: false });
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
  function centerAnchor() {
    if (state?.me) return anchorAt({ course: state.me.course }, now());
    return { x: state?.at?.x || 0, z: state?.at?.z || 0, moving: false };
  }

  function rebuildGroundIfNeeded(force) {
    if (!state) return;
    const a = centerAnchor();
    if (!force && center && Math.hypot(wdelta(center.x, a.x), wdelta(center.z, a.z)) < 10) return;
    center = { x: Math.round(a.x), z: Math.round(a.z) };
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
        roof.position.y = 1.2; roof.rotation.y = Math.PI / 4;
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
  function frame() {
    const t = now();
    const me = state.me ? { course: state.me.course, bodies: state.me.bodies } : null;
    const a = centerAnchor();
    rebuildGroundIfNeeded(false);
    // every body, mine and neighbors', animated by the same pure math
    const positions = new Map();
    if (me) positions.set('me', bodyPositions(me, t, true));
    for (const n of state.near || []) positions.set(n.handle, bodyPositions(n, t, n.awake));
    for (const bm of builtMeshes) {
      const gh = columnAt(Math.round(bm.b.x), Math.round(bm.b.z)).h;
      bm.mesh.position.set(wdelta(center.x, bm.b.x), Math.max(gh, SEA_LEVEL) + 0.5, wdelta(center.z, bm.b.z));
    }
    // the name tag rides above whichever sprite was tapped — after the bodies
    // have been placed this frame, so it never trails them by a frame
    const tagEl = rootEl?.querySelector('#world-tag');
    if (tagEl) {
      const sp = tagged == null ? null : (state?.sprites || [])[tagged];
      const p = sp ? spriteScreenPos(sp) : null;
      if (!p) tagEl.hidden = true;
      else {
        tagEl.hidden = false;
        tagEl.textContent = `${sp.name}${sp.carrying ? ` · ${sp.carrying}/50` : ''}`;
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
    camera.position.set(
      cx + Math.cos(azimuth) * dist * Math.cos(pitch * 0.6),
      12 + Math.sin(pitch) * dist * 0.8,
      cz + Math.sin(azimuth) * dist * Math.cos(pitch * 0.6),
    );
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
    // the wake control mirrors the one life's real state
    const wakeBtn = rootEl?.querySelector('#world-wake');
    if (wakeBtn) {
      const alive = document.body.classList.contains('alive');
      wakeBtn.textContent = alive ? 'let them rest' : 'wake them';
      wakeBtn.classList.toggle('alive', alive);
    }
    // the status line tracks the walk without a re-render
    const status = rootEl?.querySelector('#world-status');
    if (status) {
      const moving = (state.me && a.moving) ? ` — walking to (${wrap(Math.round(state.me.course.toX))}, ${wrap(Math.round(state.me.course.toZ))})` : '';
      const who = watching ? `watching @${watching} · ` : '';
      status.textContent = `${who}(${Math.round(a.x)}, ${Math.round(a.z)})${moving}`;
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

  function pickSprite(e) {
    const list = state?.sprites || [];
    if (!list.length || !renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = 46;
    list.forEach((sp, i) => {
      const p = spriteScreenPos(sp);
      if (!p) return;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  async function onGroundClick(e) {
    // a tap on a sprite names it before it ever means "walk there"
    const tapped = pickSprite(e);
    if (tapped != null) {
      tagged = tagged === tapped ? null : tapped;
      panel?.select(tagged == null ? null : tagged + 1);
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
    list.innerHTML = (rows || emptyNear)
      + voices + (ways ? `<div class="world-ways"><i>${waysLabel}</i>${ways}</div>` : '');
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
    const hands = rootEl?.querySelector('.hands');
    if (hands) hands.hidden = isWatching;
    if (isWatching) { leading = false; lead.classList.remove('on'); }
  }

  async function showMap() {
    const r = await fetch('/api/world/map').then((x) => x.json()).catch(() => null);
    const cv = rootEl?.querySelector('#world-map');
    if (!r?.map || !cv) return;
    cv.hidden = !cv.hidden;
    if (cv.hidden) return;
    const g = cv.getContext('2d');
    const S = cv.width;
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, S, S);
    const myHandle = state?.me?.handle;
    for (const s of r.map) {
      const x = (s.x / r.size) * S, y = (s.z / r.size) * S;
      g.beginPath();
      g.arc(x, y, s.handle === myHandle ? 3.5 : 2.2, 0, Math.PI * 2);
      g.fillStyle = s.handle === myHandle ? '#eceef2' : s.awake ? '#6fe3b0' : '#4a5160';
      g.fill();
    }
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
      if (!best || bestD > r.size / 12) return;
      if (best.handle === state?.me?.handle) watching = null; // home again
      else watching = best.handle;
      setBarMode();
      cv.hidden = true;
      center = null; // force the ground to rebuild around the new place
      fetchHere();
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
        <button type="button" id="world-wake" class="login-alt">wake them</button>
        <button type="button" id="world-lead" class="login-alt">lead them</button>
        <button type="button" id="world-showmap" class="login-alt">the map</button>
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
    // toggle lives in the home DOM whatever view is open; we press it from
    // here and mirror its state each frame (body.alive is the truth).
    root.querySelector('#world-wake').addEventListener('click', () => {
      const mark = $('brain-toggle');
      if (!mark) { toast?.('sign in — the univispira wakes it.'); return; }
      mark.click();
    });
    fetchHere();
    clearInterval(pollTimer);
    pollTimer = setInterval(fetchHere, 10000); // heartbeat + edits + neighbors
    window.addEventListener('resize', sizeToHolder);
  }

  function close() {
    clearInterval(pollTimer); pollTimer = 0;
    rootEl?.remove(); rootEl = null;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', sizeToHolder);
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
    for (const b of bodyMeshes) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    if (ground) { ground.geometry.dispose(); ground.material.dispose(); }
    if (water) { water.geometry.dispose(); water.material.dispose(); }
    renderer = null; scene = null; camera = null; ground = null; water = null;
    bodyMeshes = []; artifactMeshes = []; builtMeshes = []; tagged = null; state = null; center = null; grid = null;
  }

  return { open, close };
}
