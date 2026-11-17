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
//
// How fine it is drawn is the void's own to decide (fine.js): the screen's own
// pixels, edges smoothed, turned down only when its own drawing is what makes
// the frames long. The page's guess at a tier (../gfx.js) is not read.
//
// What stands in the void (world.js) is built with the build key: the shelter,
// first of the five buildings, a few steps in front, its door toward the body.
// The body is pushed out of its walls and stands on its floor (body.js); the
// eye comes in rather than go through them; inside, the body is seen by the
// light that gets in (the hearth, the skylight, the doorway), and its steps
// make no rings on a dry floor.
//
// The body is one of five kinds (kinds.js), made by figure.js as the body
// sheet (chooser.js) says. While that sheet is open the game does not wait
// as it does under the controls: the hands are not read, the body turns to
// face the person, and the eye stands it in what the sheet leaves of the
// canvas.
import * as THREE from 'three';
import { createVoid } from './void.js';
import { createFigure } from './figure.js';
import { createBody, advance, shown, shift, setMode, WATER, SPRINT } from './body.js';
import { createInput, wireInput, loadBindings, keyLabel, padLabel } from './input.js';
import { rebase } from './rings.js';
import { LIGHTS } from './lights.js';
import { loadState, saveState, ZOOM } from './state.js';
import { cleanKind, cleanLook } from './kinds.js';
import { createMenu } from './menu.js';
import { createChooser, standIn } from './chooser.js';
import { ratios, createWatch, watch, rest, chosen } from './fine.js';
import { createWorld, BODY } from './world.js';
import { SHELTER, phase, doorWorld } from './shelter.js';
import { createShelterArt } from './buildings/shelter.js';

const PITCH = [-1.25, 1.2];             // how far down and up the eye may look
const SHOULDER = 0.3;                   // the eye stands this far to the body's right (and looks at it as high as its own eyes: figure.look)
const POSE = { pitch: -0.05, every: 200 };     // the body sheet: how the eye is tipped while it looks at the body, and how often (ms) the page is asked where the sheet is      // the body sheet: the eye nearly level; a body is this much taller than its eyes; where on it the eye looks; how wide it is taken to be
const FOV = 55;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const worn = (st) => st.kind + ' ' + JSON.stringify(st.looks[st.kind]);
const LEARNED = 14;        // seconds of moving after which the standing hint is put away
const IDLE = { move: [0, 0], look: [0, 0], zoom: 0, jump: false, jumpPressed: false, dash: false, flyToggle: false, sprint: false, walk: false, up: false, down: false, modeToggle: false, menu: false, device: 'keys' };

// how tall and how wide a body is as it stands at `at` (the body sheet fits the eye to it): the reach of what it
// is made of, measured when it is first looked at. Its lights in the air (points, sprites) are not counted.
function sized(figure, at) {
  const v = new THREE.Vector3(); let top = -Infinity, far = 0;
  figure.group.updateMatrixWorld(true);
  figure.group.traverse((o) => {
    const p = o.isMesh && o.visible ? o.geometry?.getAttribute('position') : null; if (!p) return;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > top) top = v.y; far = Math.max(far, Math.abs(v.x - at[0]), Math.abs(v.z - at[2])); }
  });
  const tall = top - at[1], ok = (x, lo, hi, or) => (Number.isFinite(x) && x > 0 ? Math.min(hi, Math.max(lo, x)) : or);
  return { tall: ok(tall, 0.8, 3.4, figure.look + 0.35), wide: ok(2 * far, 0.6, 3.4, 1.5) };
}

// what stays for the next visit: the canvas and its programs, the void, the figure, the body where it stood
let kept = null;
function stage(lite, st) {
  if (kept && (kept.renderer.getContext().isContextLost() || kept.lite !== lite)) {
    kept.figure.dispose(); kept.void.dispose(); kept.renderer.dispose(); kept.renderer.domElement.remove();
    kept = { body: kept.body, eye: kept.eye, clock: kept.clock, ms: kept.ms, learned: kept.learned, fine: kept.fine, rs: kept.rs };
  }
  if (!kept?.renderer) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });       // edges smoothed, whatever else is plain
    renderer.toneMapping = THREE.NoToneMapping;
    // the canvas takes the keys: it is focused when the void opens, so the jump key is the body's and not
    // a second press of whatever button brought the person here
    const cv = renderer.domElement; cv.tabIndex = 0; cv.setAttribute('role', 'application');
    cv.setAttribute('aria-label', 'the void: an endless still water. the keys move the body; the controls button lists them.');
    const v = createVoid({ renderer, lite, light: st.light });
    const figure = createFigure({ kind: st.kind, look: st.looks[st.kind], lite });
    v.scene.add(figure.group);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);
    camera.layers.enable(1);            // the sky's dome is on layer 1: this eye sees it, the mirror's does not
    // the body begins with its back to the eye, looking where the eye looks
    kept = { body: createBody({ yaw: Math.PI }), world: createWorld(), eye: null, clock: 0, ms: 16.7, learned: 0, fine: createWatch(), rs: null, ...(kept || {}), renderer, lite, void: v, figure, camera, worn: worn(st), size: null, arts: new Map(), indoor: 1 };
    // the hearths' light: always in the scene (a light that came and went would make every material be compiled again)
    kept.hearth = new THREE.PointLight(0x8fb4ff, 0, 7, 2);
    v.scene.add(kept.hearth);
  }
  kept.body.world = kept.world;
  return kept;
}

export function createGameView({ toast = () => {}, toSocieties = null, storage = null } = {}) {
  let root = null, raf = 0, ro = null, wire = null, menu = null, chooser = null, K = null, input = null, st = null;
  let pose = 0, turned = 0, stand = null, standT = 0;      // the body sheet: how far the eye has gone to it (0..1), how far its buttons have turned the body, where the body stands, when that is asked again
  let last = 0, wake = 0, sayUntil = 0, standing = '', menuShut = 0, saveT = 0, locked = false, touch = false, still = 0;
  let hand = 0;                     // how fine it is drawn (fine.js): a person's own choice of fewer pixels (0: none)
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
    if (chooser?.isOpen()) return '';                 // the body is what is looked at: nothing is said over its feet
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
  function openBody() {
    if (!chooser || chooser.isOpen() || menu.isOpen() || performance.now() - menuShut < 250) return;
    wire?.release(); input.clear(); turned = 0; chooser.open();
  }
  // the body, made again as it was chosen, standing where it stood. One that cannot be made leaves the one that was.
  function dress() {
    let made = null;
    try { made = createFigure({ kind: st.kind, look: st.looks[st.kind], lite: K.lite }); } catch (e) { console.error('[void] a body could not be made', e); toast('that body could not be made'); return false; }
    K.void.scene.remove(K.figure.group); K.figure.dispose();
    K.figure = made; K.worn = worn(st); K.size = null; standT = 0;
    K.void.scene.add(made.group); made.setEnv(LIGHTS[K.void.light].env);
    shown(K.body, pos); made.update(K.body, 0, pos); still = 0;
    return true;
  }
  // the body sheet's choice: a kind, and how it looks (a null look: as that kind was last made to look)
  function wear(kind, look) {
    const k = cleanKind(kind), was = { kind: st.kind, look: st.looks[k] };
    st.kind = k; if (look) st.looks[k] = cleanLook(k, look);
    if (worn(st) === K.worn) return;
    if (dress()) save(); else { st.kind = was.kind; st.looks[k] = was.look; }
  }
  // the same canvas, of plainer stuff: the watch asked for it (fine.js). The void and the body are made again;
  // one that cannot be made leaves what was.
  function plain() {
    let v = null, made = null;
    try { v = createVoid({ renderer: K.renderer, lite: true, light: st.light }); made = createFigure({ kind: st.kind, look: st.looks[st.kind], lite: true }); } catch (e) { console.error('[void] the plain picture could not be made', e); v?.dispose(); return; }
    K.figure.dispose(); K.void.dispose();
    for (const art of K.arts.values()) art.dispose();
    K.arts.clear();
    v.scene.add(made.group, K.hearth); made.setEnv(LIGHTS[v.light].env);
    K.void = v; K.figure = made; K.lite = true; K.worn = worn(st); K.size = null; standT = 0;
    shown(K.body, pos); made.update(K.body, 0, pos);
    size();
  }

  // the build key: a shelter in front of the body, or the one it is near taken down
  function buildHere() {
    if (K.body.flying || !K.body.grounded) { say('stand on the water to build'); return; }
    const r = K.world.toggle(K.body);
    if (r.did === 'up') say(touch ? 'a shelter goes up · walk in through its door · build again near it takes it down' : `a shelter goes up · walk in through its door · ${keyLabel(input.bindings.keys.build[0] || input.bindings.keys.build[1]) || 'build'} again near it takes it down`, 6);
    else say('the shelter comes down', 3);
  }
  // what stands, drawn: a drawing for each building, kept while it stands; and the light a body inside is seen by
  const SUN = new THREE.Vector3(), skyCol = new THREE.Color(), sunCol = new THREE.Color(), hearthCol = new THREE.Color(0.5, 0.62, 1.0);
  function builds(dt) {
    const V = K.void, L = LIGHTS[V.light], seen = new Set();
    SUN.copy(V.key.position).sub(V.key.target.position).normalize();
    sunCol.set(L.key).multiplyScalar(L.keyAmt);
    skyCol.set(L.horizon).lerp(new THREE.Color(L.zenith), 0.5).multiplyScalar(0.55 * L.env);
    let flame = 0, flameAt = null;
    for (const b of K.world.buildings) {
      let art = K.arts.get(b);
      if (!art) { art = createShelterArt({ lite: K.lite }); K.arts.set(b, art); V.scene.add(art.group); }
      seen.add(b);
      const [dx, dz] = doorWorld(b), near = Math.hypot(K.body.p[0] - dx, K.body.p[2] - dz) < 2.6 || !!K.world.inside(K.body.p);
      const r = art.update(b, { t: K.clock, dt, sun: [SUN.x, SUN.y, SUN.z], sunCol, sky: skyCol, near, hearthCol });
      if (r.flame > flame) { flame = r.flame; flameAt = art.flameAt.clone().applyMatrix4(art.group.matrixWorld); }
    }
    for (const [b, art] of K.arts) if (!seen.has(b)) { V.scene.remove(art.group); art.dispose(); K.arts.delete(b); }
    // the hearth's light; and inside, the body seen by what gets in (the sun's own patch, or the shade)
    K.hearth.intensity = 2.2 * flame;
    if (flameAt) K.hearth.position.copy(flameAt);
    const inside = K.world.inside(K.body.p), head = [K.body.p[0], K.body.p[1] + BODY.tall * 0.8, K.body.p[2]];
    const want = inside ? 0.12 + 0.88 * K.world.sunAt(head, [SUN.x, SUN.y, SUN.z]) : 1;
    K.indoor += (want - K.indoor) * ease(5, dt);
    V.setIndoor(K.indoor);
    K.figure.setEnv(LIGHTS[V.light].env * (0.3 + 0.7 * K.indoor));
  }

  function size() {
    const holder = $('.game-canvas'); if (!holder || !K) return;
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    K.rs = ratios(window.devicePixelRatio || 1, w, h, hand);
    const dpr = K.rs[Math.min(K.fine.level, K.rs.length - 1)];
    K.renderer.setPixelRatio(dpr); K.renderer.setSize(w, h, false);
    K.camera.aspect = w / h; K.camera.updateProjectionMatrix();
    K.void.resize(w, h, dpr);
    still = 0;                       // a canvas that changed size is blank until it is drawn again
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root || document.hidden) { last = 0; return; }
    if (last) K.ms += (now - last - K.ms) * 0.05;       // how long a frame takes, lately (read below)
    const since = last ? now - last : 0;
    const dt = last ? clamp((now - last) / 1000, 0, 0.1) : 1 / 60; last = now;
    const posing = chooser.isOpen();                   // the body sheet is open: the body stands to be looked at, and the hands are not read
    const paused = !posing && (root.inert || menu.isOpen());        // another sheet is open over the game: it waits
    wire.poll();
    // …and a waiting picture is not drawn again (a frosted sheet over a live canvas re-blurs every frame: 32 ms a frame
    // at a phone's size, measured), except for the few frames after something it shows has changed
    if (!paused) still = 0; else if (++still > 4) return;
    // how fine it is drawn (fine.js). The watch is told how long the frames are; what it changes, it changes
    // before this frame is drawn
    if (!since) { if (rest(K.fine) === 'ratio') size(); }
    else if (!paused && K.rs) { const did = watch(K.fine, since, K.rs); if (did === 'ratio') size(); else if (did === 'plain' && !K.lite) plain(); }
    const { body, eye, camera, figure } = K, V = K.void;
    const inp = paused || posing ? IDLE : input.frame(dt);
    if (!paused) {
      K.clock += dt;
      eye.yaw += inp.look[0];
      if (eye.yaw > Math.PI) eye.yaw -= 2 * Math.PI; else if (eye.yaw < -Math.PI) eye.yaw += 2 * Math.PI;
      eye.pitch = clamp(eye.pitch + inp.look[1], PITCH[0], PITCH[1]);
      if (inp.zoom) { st.zoom = clamp(st.zoom * Math.exp(inp.zoom), ZOOM.min, ZOOM.max); saveT = now + 600; }
      if (inp.modeToggle) modeTo(body.mode === 'survival' ? 'creative' : 'survival');
      if (inp.build) buildHere();
      if (inp.menu) openMenu();
      K.world.update(dt);
      advance(body, { ...inp, yaw: eye.yaw, pitch: eye.pitch }, dt);
      // what the body did, on the water
      for (const e of body.events.splice(0)) {
        const at = e.at || body.p;
        const wet = K.world.wet(at[0], at[2]) && at[1] < 0.05;
        if (e.type === 'jump') { if (wet) V.drop(at[0], at[2], 0.2); }
        else if (e.type === 'land') { figure.land(e.speed); if (wet) { V.drop(at[0], at[2], clamp(0.12 + 0.045 * e.speed, 0.12, 0.6)); if (e.speed > 5) V.drop(at[0] + 0.05, at[2] - 0.03, 0.25); } }
        else if (e.type === 'dash') wake = 0;
        else if (e.type === 'fly') showMode();
      }
      // something fast and low drags a wake: a dash along the water, a flier skimming it
      const speed = Math.hypot(body.v[0], body.v[2]);
      const low = body.dashT > 0 ? body.p[1] < 0.6 : body.flying && body.p[1] < 1.6 && speed > 5;
      wake -= dt;
      if (low && wake <= 0 && K.world.wet(body.p[0], body.p[2])) { V.drop(body.p[0], body.p[2], body.dashT > 0 ? 0.26 : 0.16 * (1 - body.p[1] / 1.6)); wake = body.dashT > 0 ? 0.04 : 0.09; }
    }
    // the body sheet: the eye goes to it and comes back; the body turns to face the person, and as the sheet's buttons turn it
    pose += ((posing ? 1 : 0) - pose) * ease(7, dt);
    if (posing) { let by = eye.yaw + turned - body.yaw; by -= 2 * Math.PI * Math.round(by / (2 * Math.PI)); body.yaw += by * ease(6, dt); }
    shown(body, pos);
    for (const [x, z] of figure.update(body, paused ? 0 : dt, pos)) if (pos[1] < 0.05 && K.world.wet(x, z)) V.drop(x, z, 0.1 + 0.012 * Math.hypot(body.v[0], body.v[2]));
    // far from where the numbers began, they begin again under the body
    const far = rebase(body.p[0], body.p[2]);
    if (far) { shift(body, far[0], far[1]); V.rebase(far[0], far[1]); K.world.shift(far[0], far[1]); eye.at.x -= far[0]; eye.at.z -= far[1]; shown(body, pos); figure.update(body, 0, pos); }

    // the eye. While the body sheet is open it stands back far enough for the whole body, level with its middle,
    // and the body is put in what the sheet leaves of the room
    if ((posing || stand) && !K.size) K.size = sized(figure, pos);
    if (posing) {
      if (!stand || now > standT) {
        standT = now + POSE.every;
        const sheet = chooser.rect(), cv = $('.game-canvas').getBoundingClientRect(), room = $('.game-room')?.getBoundingClientRect() || cv, bar = $('.game-bar')?.getBoundingClientRect();
        if (sheet) stand = standIn(cv, { left: room.left, right: room.right, bottom: room.bottom, top: Math.max(room.top, bar ? bar.bottom : room.top) }, sheet, { fov: FOV, tall: K.size.tall, wide: K.size.wide });
      }
    } else if (stand && pose < 0.002) { stand = null; pose = 0; camera.clearViewOffset(); }
    const u = stand ? pose : 0, pitch0 = eye.pitch + (POSE.pitch - eye.pitch) * u;
    const tx = pos[0], ty = pos[1] + figure.look + ((K.size ? K.size.tall / 2 : figure.look) - figure.look) * u, tz = pos[2];
    if (!eye.has) { eye.at.set(tx, ty, tz); eye.has = true; eye.d = st.zoom; }
    else { const kh = ease(16, dt), kv = ease(10, dt); eye.at.x += (tx - eye.at.x) * kh; eye.at.z += (tz - eye.at.z) * kh; eye.at.y += (ty - eye.at.y) * kv; }
    const sy = Math.sin(eye.yaw), cy = Math.cos(eye.yaw);
    const along = (p) => { const c = Math.cos(p); return [-sy * c, Math.sin(p), -cy * c]; };
    let d = st.zoom + ((stand ? stand.d : st.zoom) - st.zoom) * u;
    // a building in the way: the eye comes in rather than go into a wall or a dome; where that would leave it too near
    // the body (its back to a wall), the eye rises instead and looks down over it
    const from = [eye.at.x, eye.at.y, eye.at.z], walls = K.world.buildings.length && !stand;
    const room = (p, dd) => { const f = along(p), s0 = SHOULDER * Math.min(1, dd / 4); return dd * K.world.eye(from, [from[0] - f[0] * dd + cy * s0, Math.max(WATER + 0.1, from[1] - f[1] * dd), from[2] - f[2] * dd - sy * s0]); };
    let lift = 0;
    if (walls) {
      let best = room(pitch0, d);
      for (const l of [0.35, 0.7, 1.0]) { if (best >= Math.min(d, 1.3)) break; const dd = room(clamp(pitch0 - l, PITCH[0], PITCH[1]), d); if (dd > best + 0.05) { best = dd; lift = l; } }
    }
    eye.lift = (eye.lift || 0) + (lift - (eye.lift || 0)) * ease(6, dt);
    const pitch = clamp(pitch0 - eye.lift, PITCH[0], PITCH[1]), [fx, fy, fz] = along(pitch);
    let squeezed = false;
    if (walls) { const dd = Math.max(0.35, room(pitch, d)); squeezed = dd < d - 1e-3; d = dd; }
    if (fy > 1e-4) d = Math.min(d, Math.max(0.5, (eye.at.y - (WATER + 0.14)) / fy));   // looking up: the eye comes in rather than go under the water
    eye.d = d < eye.d ? d : eye.d + (d - eye.d) * ease(8, dt);
    // an eye that a wall has brought within arm's length of the head would be inside the body: it is not drawn then
    // (until the eye has room again; with nothing built, as it always was)
    if (squeezed && eye.d < 0.65) eye.hide = true; else if (eye.d >= 0.65 || !walls) eye.hide = false;
    figure.group.visible = !eye.hide;
    const side = SHOULDER * Math.min(1, eye.d / 4) * (1 - u);
    camera.position.set(eye.at.x - fx * eye.d + cy * side, Math.max(WATER + 0.1, eye.at.y - fy * eye.d), eye.at.z - fz * eye.d - sy * side);
    camera.rotation.set(pitch, eye.yaw, 0, 'YXZ');
    const fov = FOV + 12 * smooth(SPRINT + 1, 46, Math.hypot(body.v[0], body.v[2]));    // the view opens a little at speed
    eye.fov += (fov - eye.fov) * ease(6, dt);
    if (Math.abs(camera.fov - eye.fov) > 0.02) { camera.fov = eye.fov; camera.updateProjectionMatrix(); }
    // the picture is slid so the body stands in what the sheet leaves (the mirror's eye takes the same slide: void.js copies this one's projection)
    if (stand) { const cv = K.renderer.domElement; camera.setViewOffset(cv.clientWidth || 1, cv.clientHeight || 1, stand.x * u, stand.y * u, cv.clientWidth || 1, cv.clientHeight || 1); }
    camera.updateMatrixWorld();

    builds(dt);
    V.setScale(camera);
    V.update(K.clock, camera, [{ x: pos[0], z: pos[2], y: pos[1], k: figure.shade }]);
    V.renderMirror(camera);
    K.renderer.render(V.scene, camera);

    if (!paused && Math.hypot(body.v[0], body.v[2]) > 1) K.learned += dt;
    if (sayUntil && now > sayUntil) sayUntil = 0;
    if (!sayUntil) { const h = hint(); if (h !== standing) { standing = h; const el = $('.game-hint'); if (el) { el.textContent = h; el.hidden = !h; } } } else standing = '';
    if (saveT && now > saveT) { saveT = 0; save(); }
  }

  function open() {
    if (root) return;
    hand = chosen(globalThis.window?.Y3K?.gfx?.profile?.());      // a person's own choice of a lighter page; the page's guess is not asked
    const lite = !!hand || !!kept?.fine?.plain;
    st = loadState(storage);
    K = stage(lite, st);                                // throws where a canvas cannot be had: the door (gate.js) answers that
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
        <button type="button" id="game-body-open" class="login-alt" aria-haspopup="dialog" title="who you are here: five kinds of body">body</button>
        <button type="button" id="game-build" class="login-alt" title="a shelter, a few steps in front of you; near one, it is taken down">build</button>
        <button type="button" id="game-controls" class="login-alt" aria-haspopup="dialog">controls</button>
        ${toSocieties ? '<button type="button" id="game-societies" class="login-alt" title="the world that was here first">the societies</button>' : ''}
      </div>
      <i class="game-room" aria-hidden="true"></i>
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
    if (K.worn !== worn(st)) dress();                   // chosen somewhere else since it was last here

    menu = createMenu({ input, storage, getMode: () => K.body.mode, setMode: (m) => modeTo(m, false), getLight: () => st.light, setLight: lightTo,
      onClose: () => { menuShut = performance.now(); input.clear(); standing = ''; } });
    chooser = createChooser({ get: () => ({ kind: st.kind, look: st.looks[st.kind] }), set: wear, turn: (by) => { turned += by; },
      onClose: () => { menuShut = performance.now(); input.clear(); standing = ''; } });
    wire = wireInput(input, { el: holder, paused: () => !root || root.inert || menu.isOpen(), onLock: (on) => { locked = on; root?.classList.toggle('locked', on); standing = ''; } });
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
    // a bar button pressed with the mouse hands the focus back to the canvas, so the jump key is the body's again
    const press = (sel, fn) => { const el = $(sel); if (el) on(el, 'click', (e) => { if (e.detail > 0) focusCanvas(); fn(); }); };
    press('#game-mode', () => modeTo(K.body.mode === 'survival' ? 'creative' : 'survival'));
    press('#game-controls', openMenu);
    press('#game-body-open', openBody);
    press('#game-build', () => { if (!menu.isOpen() && !chooser.isOpen()) buildHere(); });
    press('#game-societies', () => toSocieties?.());
    for (const [sel, action] of [['#game-t-jump', 'jump'], ['#game-t-dash', 'dash'], ['#game-t-sink', 'down']]) {
      const el = $(sel); if (!el) continue;
      on(el, 'pointerdown', (e) => { e.preventDefault(); input.hold(action, true); try { el.setPointerCapture?.(e.pointerId); } catch { /* it still lifts */ } });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(el, ev, () => input.hold(action, false));
      on(el, 'contextmenu', (e) => e.preventDefault());
    }
    on(holder, 'pointerdown', (e) => { if (e.pointerType === 'touch' && !touch) { touch = true; $('.game-touch').hidden = false; standing = ' '; } });
    ro = new ResizeObserver(size); ro.observe(holder); size();
    // read only, for whoever is checking the game from outside it (a test's browser, the console). `seen` is where the body's middle is on the canvas, in px
    const seen = () => { const cv = K.renderer.domElement, v = new THREE.Vector3(pos[0], pos[1] + (K.size ? K.size.tall / 2 : K.figure.look), pos[2]).project(K.camera); return [Math.round(((v.x + 1) / 2) * cv.clientWidth), Math.round(((1 - v.y) / 2) * cv.clientHeight)]; };
    (globalThis.Y3K ||= {}).game = { read: () => (K ? { p: [...K.body.p], v: [...K.body.v], mode: K.body.mode, flying: K.body.flying, grounded: K.body.grounded,
      dashing: K.body.dashT > 0, yaw: K.eye.yaw, pitch: K.eye.pitch, zoom: st.zoom, light: st.light, device: input.device, open: !!root, ms: Math.round(K.ms * 10) / 10,
      fine: K.rs ? { ratio: K.rs[Math.min(K.fine.level, K.rs.length - 1)], level: K.fine.level, steps: K.rs.length, plain: K.lite, trying: K.fine.why, trials: K.fine.trials, mean: Math.round(K.fine.mean * 10) / 10, px: [K.renderer.domElement.width, K.renderer.domElement.height] } : null,
      kind: st.kind, look: { ...st.looks[st.kind] }, posing: !!chooser?.isOpen(), facing: K.body.yaw, seen: seen(),
      world: { buildings: K.world.buildings.map((b) => ({ kind: b.kind, x: b.x, z: b.z, yaw: b.yaw, t: b.t, down: b.down, built: !!(phase(b).rest >= 1) })), inside: !!K.world.inside(K.body.p), indoor: Math.round(K.indoor * 100) / 100, eyeD: Math.round(K.eye.d * 100) / 100 } } : null) };
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
    chooser?.off(); chooser = null; pose = 0; stand = null; K?.camera?.clearViewOffset();
    for (const f of offs.splice(0)) f();
    save();
    if (K?.renderer) { K.renderer.domElement.remove(); K.renderer.setSize(1, 1, false); K.void.resize(1, 1, 1); }
    root.remove(); root = null;
    document.body.classList.remove('in-void');
  }

  return { open, close, isOpen: () => !!root };
}
