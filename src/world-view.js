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

export function createWorldView({ getAccount, toast }) {
  let grid = null;
  let renderer = null, scene = null, camera = null;
  let raf = 0, pollTimer = 0;
  let state = null;          // { me, near, edits, now } from the server
  let skew = 0;              // serverNow - clientNow, so all clocks agree
  let editMap = new Map();   // "x,z" → { h?, mat? }
  let ground = null, water = null;
  let bodyMeshes = [];       // { mesh, society, index }
  let center = null;         // the window's current center (rebuilt when far)
  let azimuth = 0.65, dist = 46, pitch = 0.9;
  let leading = false;
  let disposed = [];

  const now = () => Date.now() + skew;

  // ---- data -----------------------------------------------------------------

  async function fetchHere() {
    try {
      const r = await fetch('/api/world/here').then((x) => x.json());
      if (r.error) { if (grid) rootEl.querySelector('.world-note')?.replaceChildren(document.createTextNode(r.error)); return; }
      skew = r.now - Date.now();
      state = r;
      editMap = new Map((r.edits || []).map((e) => [`${e.x},${e.z}`, e]));
      if (!scene) buildScene();
      rebuildGroundIfNeeded(true);
      rebuildBodies();
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
  function rebuildGroundIfNeeded(force) {
    if (!state) return;
    const a = anchorAt({ course: state.me.course }, now());
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
  const VOX_PER_BODY = 26;
  function rebuildBodies() {
    for (const b of bodyMeshes) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    bodyMeshes = [];
    const societies = [
      { ...state.me, mine: true, awake: true },
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
    const me = { course: state.me.course, bodies: state.me.bodies };
    const a = anchorAt(me, t);
    rebuildGroundIfNeeded(false);
    // every body, mine and neighbors', animated by the same pure math
    const positions = new Map();
    positions.set('me', bodyPositions(me, t, true));
    for (const n of state.near || []) positions.set(n.handle, bodyPositions(n, t, n.awake));
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
      const moving = a.moving ? ` — walking to (${wrap(Math.round(state.me.course.toX))}, ${wrap(Math.round(state.me.course.toZ))})` : '';
      status.textContent = `(${Math.round(a.x)}, ${Math.round(a.z)})${moving}`;
    }
  }

  // Lead mode: click the ground, the society walks there — 2 blocks a second,
  // everyone watching sees the same walk from the same clock.
  async function onGroundClick(e) {
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
    list.innerHTML = rows || '<div class="world-nearrow muted">no other society within sight — the planet is wide</div>';
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
    bodyMeshes = []; state = null; center = null; grid = null;
  }

  return { open, close };
}
