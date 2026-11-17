// ============================================================================
// The frequencies room in the round: one WebGL stage that both of its scenes
// (the sandbox, the pyramid) are shown on. Browser only; the room loads this
// file when it opens, so the room itself stays importable without three.js.
//
// What the stage owns: the renderer (at the screen's own pixels, smoothed,
// tone-mapped, with a sun that casts shadows), the ground and its grid, the
// eye (orbit.mjs) and every way of moving it, the labels laid over the picture,
// and a loop that only draws while something is changing.
//
// The hand: a press is first offered to the room (hand.down); if the room does
// not take it, it moves the eye. Drag turns; shift-drag, right-drag or two
// fingers slide; the wheel or a pinch comes nearer to the point under the
// hand; a double click centres it. The wheel is only taken once the stage has
// been clicked (or the stage is full screen, or it is a pinch), so the page
// still scrolls past it.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, pose, right as rightOf, turn, pan, zoom, focus, reset, above, settle, key as orbitKey, pixelRatio } from './orbit.mjs';
import { patch, rgb } from './kit.js';

export { createSandScene } from './sandbox3d.js';
export { createPyramidScene } from './pyramid3d.js';

const KEYS = '. Drag to turn, shift and drag to slide, scroll to zoom; from the keys: arrows turn, shift and arrows slide, plus and minus zoom, zero returns, f fills the screen.';
const r3 = (x) => Math.round(x * 1000) / 1000;
// the stage as the sandbox shows it: the site's own dark, a cool key light, no sun in the sky;
// a scene may bring its own (s.look: any of these)
const STUDIO = { top: rgb(5, 3, 10), mid: rgb(12, 12, 22), low: rgb(24, 27, 40), ground: rgb(21, 22, 30), line: rgb(126, 134, 158),
  sun: [new THREE.Color(0xfff1dc), 3.1], hemi: [new THREE.Color(0xc4d2ff), new THREE.Color(0x30281e), 0.85], exposure: 1.0, glow: 0, grid: 1, dunes: 0 };

export function createStage(host, { frame = null, hand = {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'freq-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'the room in three dimensions' + KEYS);
  const labels = document.createElement('div');
  labels.className = 'freq-labels';
  labels.setAttribute('aria-hidden', 'true');
  host.prepend(canvas, labels);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(STUDIO.low.clone(), 40, 260);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1000);
  { const pm = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(renderer); scene.environment = pm.fromScene(room, 0.04).texture; room.dispose?.(); pm.dispose(); }

  // the sky: three bands (the horizon, where the ground's fog meets it; the middle; the top) and,
  // in a scene with a sun, its glow and its disc. Three.js lays fog on after tone mapping, in the
  // screen's own colour space; so the sky is not tone-mapped either, and the two meet exactly.
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, glow: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: skyU,
    vertexShader: `varying vec3 vD;
      void main() { vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.12, d.y));
        c = mix(c, top, smoothstep(0.12, 0.7, d.y));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * glow * (0.22 * pow(s, 5.0) + 0.7 * pow(s, 80.0) + 6.0 * smoothstep(0.99955, 0.99975, s)) * smoothstep(-0.02, 0.01, d.y);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // the ground: one plane with a grid of `cell` metres (every tenth line stronger), fading with distance
  const cell = { value: 1 }, line = { value: new THREE.Color() }, gridK = { value: 1 }, dunes = { value: 0 };
  const groundMat = new THREE.MeshStandardMaterial({ color: STUDIO.ground.clone(), roughness: 0.96, metalness: 0, envMapIntensity: 0.15 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), patch(groundMat, 'ground', {
    uniforms: { uCell: cell, uLine: line, uGrid: gridK, uDunes: dunes },
    fragmentHead: `uniform float uCell;\nuniform vec3 uLine;\nuniform float uGrid;\nuniform float uDunes;
      float gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gV(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), u.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), u.x), u.y); }\n`,
    fragment: `
      vec2 gq = vWp.xz / uCell, gw = max(fwidth(gq), vec2(1e-6));
      vec2 g1 = abs(fract(gq - 0.5) - 0.5) / (gw * 1.25);
      float gMinor = (1.0 - min(min(g1.x, g1.y), 1.0)) * (1.0 - smoothstep(0.08, 0.4, max(gw.x, gw.y)));
      vec2 g10 = abs(fract(gq / 10.0 - 0.5) - 0.5) / (gw / 10.0 * 1.7);
      float gMajor = (1.0 - min(min(g10.x, g10.y), 1.0)) * (1.0 - smoothstep(0.08, 0.4, max(gw.x, gw.y) / 10.0));
      // a scene of open ground (the desert) lays drifts of light and shade over it, metres to hundreds of metres across
      float drift = 0.5 * gV(vWp.xz * 0.0035) + 0.3 * gV(vWp.xz * 0.017 + 7.0) + 0.2 * gV(vWp.xz * 0.09 + 3.0);
      diffuseColor.rgb *= mix(1.0, 0.84 + 0.32 * drift, uDunes);
      diffuseColor.rgb = mix(diffuseColor.rgb, uLine, clamp((gMinor * 0.2 + gMajor * 0.5) * uGrid, 0.0, 1.0));`,
  }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(hemi, sun, sun.target);
  const sunDir = new THREE.Vector3();
  // the sun's shadow: around the scene's middle, or (a scene that asks it to follow) around the
  // point looked at, as wide as the view, so near things get fine shadows and far ones whole ones
  function aimSun() {
    const s = cur.sun, o = cur.orbit.now;
    const r = s.follow ? clamp(o.dist * 0.85, s.least || 10, s.radius) : s.radius, c = s.follow ? o.target : s.center;
    const up = s.reach || r * 2, cam = sun.shadow.camera;
    sun.target.position.set(c[0], c[1], c[2]);
    sun.position.set(c[0] + sunDir.x * up, c[1] + sunDir.y * up, c[2] + sunDir.z * up);
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5; cam.far = up + (s.beyond || r * 2);
    cam.updateProjectionMatrix();
    const texel = (2 * r) / sun.shadow.mapSize.x;
    sun.shadow.normalBias = texel * 1.4;
    sun.shadow.bias = -(texel * 0.35) / (cam.far - cam.near);
  }

  // ---------------------------------------------------------------- the scene shown
  let cur = null;
  function use(s) {
    if (cur === s) return;
    if (cur) { cur.group.visible = false; for (const L of cur.labels) L.el.style.display = 'none'; }
    cur = s;
    if (!s.group.parent) scene.add(s.group);
    s.group.visible = true;
    scene.fog.near = s.fog[0]; scene.fog.far = s.fog[1];
    cell.value = s.cell;
    const L = { ...STUDIO, ...(s.look || {}) };
    skyU.top.value.copy(L.top); skyU.mid.value.copy(L.mid); skyU.low.value.copy(L.low); scene.fog.color.copy(L.low);
    skyU.glow.value = L.glow; skyU.sunCol.value.copy(L.sun[0]);
    groundMat.color.copy(L.ground); line.value.copy(L.line); gridK.value = L.grid; dunes.value = L.dunes;
    sun.color.copy(L.sun[0]); sun.intensity = L.sun[1];
    hemi.color.copy(L.hemi[0]); hemi.groundColor.copy(L.hemi[1]); hemi.intensity = L.hemi[2];
    renderer.toneMappingExposure = L.exposure;
    sunDir.set(...s.sun.dir).normalize(); skyU.sunDir.value.copy(sunDir);
    if (!s.seen) {                                          // the first time a scene is shown, the eye comes in to it from afar
      s.seen = true;
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const n = s.orbit.now; n.dist = Math.min(n.dist * 2.2, s.orbit.maxDist); n.az -= 0.8; n.polar = Math.max(s.orbit.minPolar, n.polar - 0.22); s.orbit.rate = 2.2;
      }
    }
    aimSun();
    canvas.setAttribute('aria-label', s.say + KEYS);
    size();
  }
  function label(owner, cls = '') {
    const el = document.createElement('span');
    el.className = 'freq-label' + (cls ? ' ' + cls : '');
    el.style.display = 'none';
    labels.appendChild(el);
    const L = { el, pos: new THREE.Vector3(), on: false, say(t) { if (el.textContent !== t) el.textContent = t; return L; } };
    owner.push(L);
    return L;
  }
  const v = new THREE.Vector3();
  function place() {
    const w = host.clientWidth, h = host.clientHeight;
    for (const L of cur.labels) {
      let seen = L.on;
      if (seen) { v.copy(L.pos).project(camera); seen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; }
      L.el.style.display = seen ? '' : 'none';
      if (seen) L.el.style.transform = `translate(-50%, -50%) translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
  }

  // ---------------------------------------------------------------- its size: the screen's own pixels
  let ratio = 1;
  function size() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    ratio = pixelRatio(window.devicePixelRatio, w, h);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a narrow stage (a phone held upright) sees as wide as a 3:2 one would
    camera.fov = camera.aspect >= 1.5 ? 40 : clamp((2 * Math.atan((Math.tan((20 * Math.PI) / 180) * 1.5) / camera.aspect) * 180) / Math.PI, 40, 78);
    if (cur) cur.orbit.fov = camera.fov;
    mark();
  }
  const ro = new ResizeObserver(size);
  ro.observe(host);
  function full() {
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    const ask = host.requestFullscreen || host.webkitRequestFullscreen, leave = document.exitFullscreen || document.webkitExitFullscreen;
    if (el) leave?.call(document);
    else if (ask) Promise.resolve(ask.call(host)).catch(() => host.classList.toggle('full'));
    else host.classList.toggle('full');                    // where a page may not fill the screen (an iPhone), it fills the window
  }
  const isFull = () => (document.fullscreenElement || document.webkitFullscreenElement) === host || host.classList.contains('full');

  // ---------------------------------------------------------------- the loop: draws only while something changes
  let raf = 0, last = 0, dead = false, dirty = false, frames = 0;
  function mark() { dirty = true; if (!raf && !dead) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    if (dead || !cur) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now; dirty = false;
    const o = cur.orbit, moving = settle(o, dt, o.rate || 14), e = pose(o.now);
    if (!moving) o.rate = 0;
    camera.position.set(e[0], e[1], e[2]);
    camera.lookAt(o.now.target[0], o.now.target[1], o.now.target[2]);
    camera.near = clamp(o.now.dist * 0.02, 0.03, 20); camera.far = cur.far;
    camera.updateProjectionMatrix();
    if (cur.sun.follow) aimSun();
    const live = frame ? frame(now, dt) : false;
    renderer.render(scene, camera);
    place();
    frames++;
    if (moving || live || dirty) { if (!raf) raf = requestAnimationFrame(tick); } else last = 0;
  }

  // ---------------------------------------------------------------- the hand
  const fingers = new Map(), rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let mode = null, began = null, moved = 0, spread = 0, mid = null, byHand = false;
  function hitAt(ev) {
    if (!cur) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, camera);
    return cur.hit(rc);
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (!cur) return;
    byHand = true; canvas.focus({ preventScroll: true }); cur.orbit.rate = 0; hand.touch?.();
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* a pointer that cannot be held */ }
    ev.preventDefault();
    if (fingers.size === 2) {
      if (mode === 'tool') hand.up?.(null, ev);
      const [a, b] = [...fingers.values()];
      mode = 'pinch'; spread = Math.hypot(a.x - b.x, a.y - b.y); mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; moved = 99;
      return;
    }
    if (fingers.size > 2) return;
    began = performance.now(); moved = 0;
    mode = hand.down?.(hitAt(ev), ev) ? 'tool' : ev.button === 2 || ev.button === 1 || ev.shiftKey ? 'pan' : 'orbit';
    mark();
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = fingers.get(ev.pointerId);
    if (!cur) return;
    if (!p) { if (!fingers.size) hand.hover?.(hitAt(ev)); return; }
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y, o = cur.orbit, H = host.clientHeight;
    p.x = ev.clientX; p.y = ev.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (mode === 'tool') hand.move?.(hitAt(ev), ev);
    else if (mode === 'orbit') turn(o, -dx * 0.0055, -dy * 0.0055);
    else if (mode === 'pan') pan(o, dx, dy, H);
    else if (mode === 'pinch' && fingers.size === 2) {
      const [a, b] = [...fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (spread > 0 && d > 0) zoom(o, spread / d, hitAt({ clientX: m.x, clientY: m.y })?.point || null);
      pan(o, m.x - mid.x, m.y - mid.y, H);
      spread = d; mid = m;
    }
    mark();
  });
  const lift = (ev) => {
    if (!fingers.delete(ev.pointerId)) return;
    if (mode === 'tool') hand.up?.(hitAt(ev), ev);
    else if (mode !== 'pinch' && ev.type === 'pointerup' && moved < 6 && performance.now() - began < 600) hand.tap?.(hitAt(ev), ev);
    if (!fingers.size) mode = null; else if (mode === 'pinch') { mode = 'orbit'; moved = 99; }      // the finger left turns
    mark();
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', () => { if (!fingers.size) { hand.hover?.(null); if (byHand && document.activeElement === canvas && !isFull()) canvas.blur(); } });
  canvas.addEventListener('blur', () => { byHand = false; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('wheel', (ev) => {
    if (!cur || !(ev.ctrlKey || document.activeElement === canvas || isFull())) return;       // until the stage is taken up, the wheel scrolls the page
    ev.preventDefault(); cur.orbit.rate = 0; hand.touch?.();
    zoom(cur.orbit, Math.exp(ev.deltaY * (ev.deltaMode === 1 ? 16 : 1) * (ev.ctrlKey ? 0.01 : 0.0016)), hitAt(ev)?.point || null);
    mark();
  }, { passive: false });
  let pinched = 1;                                          // Safari's own trackpad pinch
  canvas.addEventListener('gesturestart', (ev) => { ev.preventDefault(); pinched = 1; });
  canvas.addEventListener('gesturechange', (ev) => { ev.preventDefault(); if (cur && ev.scale > 0) { zoom(cur.orbit, pinched / ev.scale); pinched = ev.scale; mark(); } });
  canvas.addEventListener('dblclick', (ev) => { const h = hitAt(ev); if (h?.point) { focus(cur.orbit, h.point); zoom(cur.orbit, 0.7); mark(); } });
  canvas.addEventListener('keydown', (ev) => {
    if (!cur || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (orbitKey(cur.orbit, ev.key, ev.shiftKey, host.clientHeight)) { ev.preventDefault(); cur.orbit.rate = 0; hand.touch?.(); mark(); }
    else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); full(); }
  });
  for (const n of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(n, size);

  function view(what) {
    if (!cur) return;
    const o = cur.orbit;
    o.rate = what === 'reset' || what === 'above' ? 5 : 0;                // a whole new view glides; a step nearer does not
    if (what === 'reset') reset(o); else if (what === 'above') above(o); else if (what === 'in') zoom(o, 0.7); else if (what === 'out') zoom(o, 1.4); else if (what === 'full') full();
    mark();
  }
  // where the listener is: the eye, and the direction of its right hand (the scene's axes)
  const ear = () => ({ eye: pose(cur.orbit.now), right: rightOf(cur.orbit.now) });
  const read = () => ({ scene: cur?.name || null, css: [host.clientWidth, host.clientHeight], px: [canvas.width, canvas.height], ratio: r3(ratio), dpr: window.devicePixelRatio,
    calls: renderer.info.render.calls, tris: renderer.info.render.triangles, frames, running: !!raf, full: isFull(),
    eye: cur ? pose(cur.orbit.now).map(r3) : null, target: cur ? cur.orbit.now.target.map(r3) : null, dist: cur ? r3(cur.orbit.now.dist) : null, polar: cur ? r3(cur.orbit.now.polar) : null, az: cur ? r3(cur.orbit.now.az) : null });
  function dispose() {
    dead = true; cancelAnimationFrame(raf); raf = 0; ro.disconnect();
    for (const n of ['fullscreenchange', 'webkitfullscreenchange']) document.removeEventListener(n, size);
    scene.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) m.dispose?.(); });
    scene.environment?.dispose?.();
    renderer.dispose(); renderer.forceContextLoss?.();
    canvas.remove(); labels.remove();
  }
  // how many metres one drawn pixel is, a metre from the eye
  const pix = () => (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.height);
  // where a point of the scene is on the stage, in CSS pixels from its top left (and its depth, -1..1)
  const screenOf = (p) => { v.set(p[0], p[1], p[2]).project(camera); return [(v.x * 0.5 + 0.5) * host.clientWidth, (-v.y * 0.5 + 0.5) * host.clientHeight, v.z]; };
  // metres per CSS pixel at the point looked at
  const scale = () => (cur ? (2 * cur.orbit.now.dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, host.clientHeight) : 0);
  return { canvas, use, label, mark, view, ear, pix, read, screenOf, scale, dispose, get ratio() { return ratio; } };
}
