// view.js — THE VOID, ON THE PAGE: its canvas, the eye that follows the body,
// the frame, the bar, the hands.
//
// One frame, in order: the hands are read (input.js); the eye turns; the body
// moves (body.js, in steps of its own); what it did since the last frame
// (jumped, landed, dashed, took off) becomes rings on the water; the figure
// takes its pose (figure.js); the origin is moved under the body if it has
// gone far (rings.js, rebase); the water's mirror is drawn, then the void.
//
// The eye is a third person's: it looks at the body from behind and a little
// to one side, turned by the mouse or the right stick, moved in and out by
// the wheel. It never goes under the water.
//
// The canvas, the void and the figure are made once and kept: leaving the
// world tab hands back the drawing buffers (they are large) and stops the
// frame, and coming back finds the body standing where it was left.
import * as THREE from 'three';
import { createVoid } from './void.js';
import { createFigure } from './figure.js';
import { createBody, advance, shown, shift, setMode, WATER, SPRINT } from './body.js';
import { createInput, wireInput, loadBindings, keyLabel, padLabel } from './input.js';
import { rebase } from './rings.js';
import { LIGHTS } from './lights.js';
import { loadState, saveState, ZOOM } from './state.js';
import { createMenu } from './menu.js';

const DPR = { high: 2, mid: 1.5, low: 1.25, smooth: 1 };
const PITCH = [-1.25, 1.2];             // how far down and up the eye may look
const HEAD = 1.45;                      // the eye looks at the body this far over its feet
const SHOULDER = 0.3;                   // and stands this far to its right
const FOV = 55;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tierNow = () => globalThis.window?.Y3K?.gfx?.profile?.()?.tier || document.documentElement.dataset.gfx || '';
const LEARNED = 14;        // seconds of moving after which the standing hint is put away
const IDLE = { move: [0, 0], look: [0, 0], zoom: 0, jump: false, jumpPressed: false, dash: false, flyToggle: false, sprint: false, walk: false, up: false, down: false, modeToggle: false, menu: false, device: 'keys' };

// what stays for the next visit: the canvas and its programs, the void, the figure, the body where it stood
let kept = null;
function stage(lite, light) {
  if (kept && (kept.renderer.getContext().isContextLost() || kept.lite !== lite)) {
    kept.figure.dispose(); kept.void.dispose(); kept.renderer.dispose(); kept.renderer.domElement.remove();
    kept = { body: kept.body, eye: kept.eye, clock: kept.clock, ms: kept.ms, learned: kept.learned };
  }
  if (!kept?.renderer) {
    const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NoToneMapping;
    // the canvas takes the keys: it is focused when the void opens, so the jump key is the body's and not
    // a second press of whatever button brought the person here
    const cv = renderer.domElement; cv.tabIndex = 0; cv.setAttribute('role', 'application');
    cv.setAttribute('aria-label', 'the void: an endless still water. the keys move the body; the controls button lists them.');
    const v = createVoid({ renderer, lite, light });
    const figure = createFigure();
    v.scene.add(figure.group);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);
    camera.layers.enable(1);            // the sky's dome is on layer 1: this eye sees it, the mirror's does not
    // the body begins with its back to the eye, looking where the eye looks
    kept = { body: createBody({ yaw: Math.PI }), eye: null, clock: 0, ms: 16.7, learned: 0, ...(kept || {}), renderer, lite, void: v, figure, camera };
  }
  return kept;
}

export function createGameView({ toast = () => {}, toSocieties = null, storage = null } = {}) {
  let root = null, raf = 0, ro = null, wire = null, menu = null, K = null, input = null, st = null;
  let last = 0, wake = 0, sayUntil = 0, standing = '', menuShut = 0, saveT = 0, locked = false, touch = false, still = 0;
  const offs = [];
  const pos = [0, 0, 0];
  const $ = (sel) => root?.querySelector(sel);

  const save = () => { if (st) saveState(storage, st); };
  const focusCanvas = () => { try { K?.renderer.domElement.focus({ preventScroll: true }); } catch { /* it still draws */ } };
  function say(text, seconds = 4) { const el = $('.game-hint'); if (!el) return; el.textContent = text; el.hidden = !text; sayUntil = text ? performance.now() + seconds * 1000 : 0; }
  // the line that stands when nothing else is being said
  // the standing line is for the first steps: once the body has been moved for a while it is put away
  // (the controls button and its key stay), until the page is opened again
  function hint() {
    if (touch || K.learned > LEARNED) return '';
    const b = input.bindings, k = (id) => keyLabel(b.keys[id][0] || b.keys[id][1]) || '—';
    if (input.device === 'pad') return `left stick moves · ${padLabel(b.pad.jump) || '—'} jumps, held longer rises higher · ${padLabel(b.pad.dash) || '—'} dashes · ${padLabel(b.pad.menu) || '—'} for the controls`;
    return `${locked ? 'esc frees the pointer · ' : 'click to look around · '}${k('forward')} ${k('left')} ${k('back')} ${k('right')} move · ${k('jump')} jumps, held longer rises higher · ${k('dash')} dashes · ${k('menu')} for the controls`;
  }
  function showMode() {
    const el = $('#game-mode'); if (!el) return;
    el.textContent = K.body.mode; el.setAttribute('aria-pressed', String(K.body.mode === 'creative'));
    root.classList.toggle('creative', K.body.mode === 'creative');
    const sink = $('#game-t-sink'); if (sink) sink.hidden = !K.body.flying;
  }
  function modeTo(mode, tell = true) {
    st.mode = setMode(K.body, mode); save(); showMode(); menu?.render();
    if (!tell) return;
    const b = input.bindings;
    say(st.mode === 'creative'
      ? (touch ? 'creative: jump again in the air to fly' : `creative: ${input.device === 'pad' ? padLabel(b.pad.fly) : keyLabel(b.keys.fly[0] || b.keys.fly[1])} flies, or a second jump in the air`)
      : 'survival: the ground takes you back', 5);
  }
  function lightTo(name) { st.light = K.void.setLight(name); K.figure.setEnv(LIGHTS[st.light].env); root.dataset.light = st.light; still = 0; save(); }
  function openMenu() {
    if (!menu || menu.isOpen() || performance.now() - menuShut < 250) return;
    wire?.release(); input.clear(); menu.open();
  }

  function size() {
    const holder = $('.game-canvas'); if (!holder || !K) return;
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR[tierNow()] || 2);
    K.renderer.setPixelRatio(dpr); K.renderer.setSize(w, h, false);
    K.camera.aspect = w / h; K.camera.updateProjectionMatrix();
    K.void.resize(w, h, dpr);
    still = 0;                       // a canvas that changed size is blank until it is drawn again
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root || document.hidden) { last = 0; return; }
    if (last) K.ms += (now - last - K.ms) * 0.05;       // how long a frame takes, lately (read below)
    const dt = last ? clamp((now - last) / 1000, 0, 0.1) : 1 / 60; last = now;
    const { body, eye, camera, figure } = K, V = K.void;
    const paused = root.inert || menu.isOpen();        // a sheet is open over the game: it waits
    wire.poll();
    // …and a waiting picture is not drawn again (a frosted sheet over a live canvas re-blurs every frame: 32 ms a frame
    // at a phone's size, measured), except for the few frames after something it shows has changed
    if (!paused) still = 0; else if (++still > 4) return;
    const inp = paused ? IDLE : input.frame(dt);
    if (!paused) {
      K.clock += dt;
      eye.yaw += inp.look[0];
      if (eye.yaw > Math.PI) eye.yaw -= 2 * Math.PI; else if (eye.yaw < -Math.PI) eye.yaw += 2 * Math.PI;
      eye.pitch = clamp(eye.pitch + inp.look[1], PITCH[0], PITCH[1]);
      if (inp.zoom) { st.zoom = clamp(st.zoom * Math.exp(inp.zoom), ZOOM.min, ZOOM.max); saveT = now + 600; }
      if (inp.modeToggle) modeTo(body.mode === 'survival' ? 'creative' : 'survival');
      if (inp.menu) openMenu();
      advance(body, { ...inp, yaw: eye.yaw, pitch: eye.pitch }, dt);
      // what the body did, on the water
      for (const e of body.events.splice(0)) {
        const at = e.at || body.p;
        if (e.type === 'jump') V.drop(at[0], at[2], 0.2);
        else if (e.type === 'land') { figure.land(e.speed); V.drop(at[0], at[2], clamp(0.12 + 0.045 * e.speed, 0.12, 0.6)); if (e.speed > 5) V.drop(at[0] + 0.05, at[2] - 0.03, 0.25); }
        else if (e.type === 'dash') wake = 0;
        else if (e.type === 'fly') showMode();
      }
      // something fast and low drags a wake: a dash along the water, a flier skimming it
      const speed = Math.hypot(body.v[0], body.v[2]);
      const low = body.dashT > 0 ? body.p[1] < 0.6 : body.flying && body.p[1] < 1.6 && speed > 5;
      wake -= dt;
      if (low && wake <= 0) { V.drop(body.p[0], body.p[2], body.dashT > 0 ? 0.26 : 0.16 * (1 - body.p[1] / 1.6)); wake = body.dashT > 0 ? 0.04 : 0.09; }
    }
    shown(body, pos);
    for (const [x, z] of figure.update(body, paused ? 0 : dt, pos)) V.drop(x, z, 0.1 + 0.012 * Math.hypot(body.v[0], body.v[2]));
    // far from where the numbers began, they begin again under the body
    const far = rebase(body.p[0], body.p[2]);
    if (far) { shift(body, far[0], far[1]); V.rebase(far[0], far[1]); eye.at.x -= far[0]; eye.at.z -= far[1]; shown(body, pos); figure.update(body, 0, pos); }

    // the eye
    const tx = pos[0], ty = pos[1] + HEAD, tz = pos[2];
    if (!eye.has) { eye.at.set(tx, ty, tz); eye.has = true; eye.d = st.zoom; }
    else { const kh = ease(16, dt), kv = ease(10, dt); eye.at.x += (tx - eye.at.x) * kh; eye.at.z += (tz - eye.at.z) * kh; eye.at.y += (ty - eye.at.y) * kv; }
    const cp = Math.cos(eye.pitch), fy = Math.sin(eye.pitch), sy = Math.sin(eye.yaw), cy = Math.cos(eye.yaw);
    const fx = -sy * cp, fz = -cy * cp;
    let d = st.zoom;
    if (fy > 1e-4) d = Math.min(d, Math.max(0.5, (eye.at.y - (WATER + 0.14)) / fy));   // looking up: the eye comes in rather than go under the water
    eye.d = d < eye.d ? d : eye.d + (d - eye.d) * ease(8, dt);
    const side = SHOULDER * Math.min(1, eye.d / 4);
    camera.position.set(eye.at.x - fx * eye.d + cy * side, Math.max(WATER + 0.1, eye.at.y - fy * eye.d), eye.at.z - fz * eye.d - sy * side);
    camera.rotation.set(eye.pitch, eye.yaw, 0, 'YXZ');
    const fov = FOV + 12 * smooth(SPRINT + 1, 46, Math.hypot(body.v[0], body.v[2]));    // the view opens a little at speed
    eye.fov += (fov - eye.fov) * ease(6, dt);
    if (Math.abs(camera.fov - eye.fov) > 0.02) { camera.fov = eye.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    V.setScale(camera);
    V.update(K.clock, camera, [{ x: pos[0], z: pos[2], y: pos[1] }]);
    V.renderMirror(camera);
    K.renderer.render(V.scene, camera);

    if (!paused && Math.hypot(body.v[0], body.v[2]) > 1) K.learned += dt;
    if (sayUntil && now > sayUntil) sayUntil = 0;
    if (!sayUntil) { const h = hint(); if (h !== standing) { standing = h; const el = $('.game-hint'); if (el) { el.textContent = h; el.hidden = !h; } } } else standing = '';
    if (saveT && now > saveT) { saveT = 0; save(); }
  }

  function open() {
    if (root) return;
    const lite = ['low', 'smooth'].includes(tierNow());
    st = loadState(storage);
    K = stage(lite, st.light);                          // throws where a canvas cannot be had: the door (gate.js) answers that
    if (!K.eye) K.eye = { yaw: 0, pitch: -0.1, at: new THREE.Vector3(), has: false, d: st.zoom, fov: FOV };
    K.eye.has = false;
    setMode(K.body, st.mode);
    input = createInput(loadBindings(storage));
    touch = !!globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    root = document.createElement('div');
    root.className = 'game-root';
    root.innerHTML = `
      <div class="game-canvas"></div>
      <div class="world-bar game-bar">
        <button type="button" id="game-mode" class="login-alt game-mode" aria-pressed="false" title="survival or creative">survival</button>
        <button type="button" id="game-controls" class="login-alt" aria-haspopup="dialog">controls</button>
        ${toSocieties ? '<button type="button" id="game-societies" class="login-alt" title="the world that was here first">the societies</button>' : ''}
      </div>
      <div class="game-hint" role="status" hidden></div>
      <div class="game-touch"${touch ? '' : ' hidden'}>
        <button type="button" id="game-t-sink" class="game-tbtn" aria-label="Sink" hidden>sink</button>
        <button type="button" id="game-t-dash" class="game-tbtn" aria-label="Dash">dash</button>
        <button type="button" id="game-t-jump" class="game-tbtn game-tbtn-main" aria-label="Jump">jump</button>
      </div>`;
    // on the body, not the grid: the home panel carries transforms (as the societies' root does)
    document.body.appendChild(root);
    const holder = $('.game-canvas');
    holder.appendChild(K.renderer.domElement);
    root.dataset.light = st.light;
    K.figure.setEnv(LIGHTS[K.void.light].env);
    if (K.void.light !== st.light) lightTo(st.light);

    menu = createMenu({ input, storage, getMode: () => K.body.mode, setMode: (m) => modeTo(m, false), getLight: () => st.light, setLight: lightTo,
      onClose: () => { menuShut = performance.now(); input.clear(); standing = ''; } });
    wire = wireInput(input, { el: holder, paused: () => !root || root.inert || menu.isOpen(), onLock: (on) => { locked = on; root?.classList.toggle('locked', on); standing = ''; } });
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
    // a bar button pressed with the mouse hands the focus back to the canvas, so the jump key is the body's again
    const press = (sel, fn) => { const el = $(sel); if (el) on(el, 'click', (e) => { if (e.detail > 0) focusCanvas(); fn(); }); };
    press('#game-mode', () => modeTo(K.body.mode === 'survival' ? 'creative' : 'survival'));
    press('#game-controls', openMenu);
    press('#game-societies', () => toSocieties?.());
    for (const [sel, action] of [['#game-t-jump', 'jump'], ['#game-t-dash', 'dash'], ['#game-t-sink', 'down']]) {
      const el = $(sel); if (!el) continue;
      on(el, 'pointerdown', (e) => { e.preventDefault(); input.hold(action, true); try { el.setPointerCapture?.(e.pointerId); } catch { /* it still lifts */ } });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(el, ev, () => input.hold(action, false));
      on(el, 'contextmenu', (e) => e.preventDefault());
    }
    on(holder, 'pointerdown', (e) => { if (e.pointerType === 'touch' && !touch) { touch = true; $('.game-touch').hidden = false; standing = ' '; } });
    ro = new ResizeObserver(size); ro.observe(holder); size();
    // read only, for whoever is checking the game from outside it (a test's browser, the console)
    (globalThis.Y3K ||= {}).game = { read: () => (K ? { p: [...K.body.p], v: [...K.body.v], mode: K.body.mode, flying: K.body.flying, grounded: K.body.grounded,
      dashing: K.body.dashT > 0, yaw: K.eye.yaw, pitch: K.eye.pitch, zoom: st.zoom, light: st.light, device: input.device, open: !!root, ms: Math.round(K.ms * 10) / 10 } : null) };
    showMode();
    document.body.classList.add('in-void');        // styles.css: what the page puts away while the void is open
    focusCanvas();
    last = 0; standing = '';
    raf = requestAnimationFrame(frame);
  }

  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    ro?.disconnect(); ro = null;
    wire?.release(); wire?.off(); wire = null;
    menu?.off(); menu = null;
    for (const f of offs.splice(0)) f();
    save();
    if (K?.renderer) { K.renderer.domElement.remove(); K.renderer.setSize(1, 1, false); K.void.resize(1, 1, 1); }
    root.remove(); root = null;
    document.body.classList.remove('in-void');
  }

  return { open, close, isOpen: () => !!root };
}
