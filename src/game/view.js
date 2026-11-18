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
// What stands in the void (world.js) is built from the bar's build list (the
// shelter, the house, the workshop and the tower, of the five) or with the build key (the kind last
// chosen), a few steps in front, its door toward the body.
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
import { createWorld, BODY, KINDS, BUILDINGS } from './world.js';
import { createShelterArt } from './buildings/shelter.js';
import { createHouseArt } from './buildings/house.js';
import { createWorkshopArt } from './buildings/workshop.js';
import { createTowerArt } from './buildings/tower.js';
import { createCombat, stepCombat, spawnBot, clearBots, shiftCombat, LEVELS, PLAYER } from './combat.js';
import { createFightArt } from './fight.js';
import { createIsland } from './island/island.js';
import { loadIsland, createGround } from './island/ground.js';
import { trunksNear } from './island/life.js';
import { SHAPE } from './island/lordhowe-shape.js';

const PITCH = [-1.25, 1.2];             // how far down and up the eye may look
const SHOULDER = 0.3;                   // the eye stands this far to the body's right (and looks at it as high as its own eyes: figure.look)
const POSE = { pitch: -0.05, every: 200 };     // the body sheet: how the eye is tipped while it looks at the body, and how often (ms) the page is asked where the sheet is      // the body sheet: the eye nearly level; a body is this much taller than its eyes; where on it the eye looks; how wide it is taken to be
const FOV = 55;
const ISLAND_URL = 'src/game/island/lordhowe.bin';
const FAR = { void: 20000, island: 45000 };   // how far the eye sees: the island's needs Ball's Pyramid, 28 km off
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const worn = (st) => st.kind + ' ' + JSON.stringify(st.looks[st.kind]);
const LEARNED = 14;        // seconds of moving after which the standing hint is put away
const IDLE = { move: [0, 0], look: [0, 0], zoom: 0, jump: false, jumpPressed: false, dash: false, flyToggle: false, sprint: false, walk: false, up: false, down: false, modeToggle: false, menu: false, device: 'keys',
  attack: false, attackPressed: false, whirl: false, guard: false, guardPressed: false, spawn: false };
const turnTo = (a, b, max) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) <= max ? b : a + Math.sign(d) * max; };

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

// the eye's line (the fight aims along it), and the fall's turn about the feet
const AIM = new THREE.Vector3(), TIP = new THREE.Quaternion(), ROLL = new THREE.Quaternion(), TIPV = new THREE.Vector3(), TIPA = new THREE.Vector3();
// the whole body turned about its feet: over backward when struck down (k: 0 standing, 1 lying), and leaning
// sideways (roll, radians; + to its right) as it runs along a wall
function tip(figure, at, yaw, k, roll = 0) {
  const g = figure.group;
  if (k < 1e-3 && Math.abs(roll) < 1e-3) { if (g.position.lengthSq() > 0 || g.quaternion.w < 1) { g.position.set(0, 0, 0); g.quaternion.identity(); } return; }
  TIPA.set(-Math.cos(yaw), 0, Math.sin(yaw));
  TIP.setFromAxisAngle(TIPA, 1.38 * k);
  TIPA.set(Math.sin(yaw), 0, Math.cos(yaw));
  ROLL.setFromAxisAngle(TIPA, roll); TIP.premultiply(ROLL);
  TIPV.set(at[0], at[1], at[2]).applyQuaternion(TIP);
  g.quaternion.copy(TIP); g.position.set(at[0] - TIPV.x, at[1] - TIPV.y, at[2] - TIPV.z);
}

// what stays for the next visit: the canvas and its programs, the void, the figure, the body where it stood
let kept = null;
function stage(lite, st) {
  if (kept && (kept.renderer.getContext().isContextLost() || kept.lite !== lite)) {
    kept.figure.dispose(); kept.fight?.dispose(); kept.void.dispose(); kept.renderer.dispose(); kept.renderer.domElement.remove();
    kept = { body: kept.body, worlds: kept.worlds, at: kept.at, island: kept.island, combat: kept.combat, eye: kept.eye, clock: kept.clock, ms: kept.ms, learned: kept.learned, fine: kept.fine, rs: kept.rs };
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
    kept = { body: createBody({ yaw: Math.PI }), worlds: { void: createWorld(), island: createWorld() }, at: {}, combat: createCombat({ seed: (Math.random() * 1e9) | 0 }), eye: null, clock: 0, ms: 16.7, learned: 0, fine: createWatch(), rs: null, ...(kept || {}), renderer, lite, void: v, figure, camera, worn: worn(st), size: null, arts: new Map(), indoor: 1, fallen: 0, place: 'void' };
    kept.world = kept.worlds.void;
    // the ring and the bots, drawn in the void's scene (combat.js's numbers are kept in kept.combat)
    kept.fight = createFightArt(v.scene, { lite }); kept.fight.setDrop((x, z, a) => kept.void.drop(x, z, a));
    // the hearths' light: always in the scene (a light that came and went would make every material be compiled again)
    kept.hearth = new THREE.PointLight(0x8fb4ff, 0, 7, 2);
    v.scene.add(kept.hearth);
  }
  kept.world = kept.worlds[kept.place]; kept.body.world = kept.world;
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
    try { v = K.place === 'island' ? createIsland({ renderer: K.renderer, lite: true, light: st.light, ground: K.island.ground, shape: SHAPE }) : createVoid({ renderer: K.renderer, lite: true, light: st.light }); made = createFigure({ kind: st.kind, look: st.looks[st.kind], lite: true }); } catch (e) { console.error('[void] the plain picture could not be made', e); v?.dispose(); return; }
    K.figure.dispose(); K.fight.dispose(); K.void.dispose();
    for (const art of K.arts.values()) art.dispose();
    K.arts.clear();
    v.scene.add(made.group, K.hearth); made.setEnv(LIGHTS[v.light].env);
    K.void = v; K.figure = made; K.lite = true; K.worn = worn(st); K.size = null; standT = 0;
    K.fight = createFightArt(v.scene, { lite: true }); K.fight.setDrop((x, z, a) => K.void.drop(x, z, a));
    shown(K.body, pos); made.update(K.body, 0, pos);
    size();
  }

  // the build key: near a building's door it is taken down; else the kind last chosen goes up in front of the body
  const ARRIVE = { shelter: 'walk in through its door', house: 'up the steps and in; its ladder climbs to the loft', workshop: 'its glass wall slides open as you come; the kiln is at the back', tower: 'in at its door; the stair climbs the wall to the dome' };
  function said(r) {
    const key = keyLabel(input.bindings.keys.build[0] || input.bindings.keys.build[1]) || 'build';
    if (r.did === 'up') say(`a ${r.b.kind} goes up · ${ARRIVE[r.b.kind]} · ${touch ? 'build' : key} again near it takes it down`, 6);
    else if (r.did === 'down') say(`the ${r.b.kind} comes down`, 3);
    else if (r.did === 'blocked') say(`too near the ${r.b.kind}: step away from it and build`, 4);
    else if (r.did === 'steep') say(r.rises ? `the ground rises ${r.fall.toFixed(1)} m behind it here: face downhill, or find flatter ground` : `the ground falls ${r.fall.toFixed(1)} m under it here: find flatter ground to build`, 4);
  }
  function buildHere(kind = null) {
    if (K.body.flying || !K.body.grounded || K.body.climbing) { say('stand on the ground to build'); return; }
    if (kind) { st.building = kind; save(); said(K.world.build(K.body, kind)); }
    else said(K.world.toggle(K.body, st.building));
  }
  // the bar's build list: the five, those not made yet greyed; near a building, the first line takes it down
  function listBuilds(show) {
    const el = $('#game-build-list'), btn = $('#game-build'); if (!el || !btn) return;
    const open = show ?? el.hidden;
    if (open) {
      listBots(false);
      const near = K.world.near(K.body.p);
      el.innerHTML = (near ? `<button type="button" class="login-alt game-build-down" data-build="down">take down the ${near.kind}</button>` : '')
        + BUILDINGS.map((b) => `<button type="button" class="login-alt${b.kind === st.building ? ' on' : ''}" data-build="${b.kind}"${b.ready ? '' : ' disabled aria-disabled="true"'}>${b.label}${b.ready ? '' : '<small>to come</small>'}</button>`).join('');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  }
  // ---- the places (the map tab): the void, or Lord Howe Island. Everything that lives in a scene goes to the new one;
  // each place keeps its own buildings and where the body last stood in it; the first time on the island, its beach
  let placing = null;
  async function placeTo(name, tell = true) {
    name = name === 'island' ? 'island' : 'void';
    if (!K || placing || name === K.place) return;
    placing = name;
    try {
      if (name === 'island' && !K.island) {
        say('the island is coming…', 30);
        const { head, hts } = await loadIsland(ISLAND_URL);
        K.island = { ground: createGround(head, hts) }; K.worlds.island.ground = K.island.ground;
        K.worlds.island.trunks = (x, z) => trunksNear(K.island.ground, x, z);
      }
      if (!root) return;
      const made = name === 'island' ? createIsland({ renderer: K.renderer, lite: K.lite, light: st.light, ground: K.island.ground, shape: SHAPE }) : createVoid({ renderer: K.renderer, lite: K.lite, light: st.light });
      K.at[K.place] = { p: [...K.body.p], yaw: K.body.yaw };
      K.void.scene.remove(K.figure.group, K.hearth);
      for (const art of K.arts.values()) art.dispose();
      K.arts.clear(); K.fight.dispose(); clearBots(K.combat); K.combat.bolts = []; K.combat.events.length = 0;
      K.void.dispose();
      K.void = made; K.place = name; K.world = K.worlds[name]; K.body.world = K.world;
      made.scene.add(K.figure.group, K.hearth);
      K.fight = createFightArt(made.scene, { lite: K.lite }); K.fight.setDrop((x, z, a) => K.void.drop(x, z, a));
      const back = K.at[name], a = SHAPE.arrive;
      if (back) { K.body.p = [...back.p]; K.body.yaw = back.yaw; }
      else if (name === 'island') { K.body.p = [a.x, K.island.ground.floor(a.x, a.z), a.z]; K.body.yaw = a.facing; }
      else { K.body.p = [0, 0, 0]; K.body.yaw = Math.PI; }
      K.body.v = [0, 0, 0]; K.body.was = [...K.body.p]; K.body.grounded = true; K.body.rising = false; K.body.wallrun = null; K.body.climbing = false;
      K.eye.yaw = K.body.yaw + Math.PI; K.eye.has = false;
      K.camera.far = FAR[name]; K.camera.updateProjectionMatrix();
      K.figure.setEnv(LIGHTS[st.light].env); root.dataset.place = name;
      st.place = name; save(); size(); still = 0;
      if (tell) say(name === 'island' ? `${SHAPE.name} · on the lagoon's beach, Mount Gower ahead · the map is under controls` : 'the void', name === 'island' ? 7 : 3);
    } catch (e) { console.error('[void] the island could not be opened', e); say('the island could not be opened here', 5); }
    finally { placing = null; }
  }

  // ---- the fight. The bar's bots list: the five levels (the one last chosen marked), and a line to clear them
  function listBots(show) {
    const el = $('#game-bot-list'), btn = $('#game-bots'); if (!el || !btn) return;
    const open = show ?? el.hidden;
    if (open) {
      listBuilds(false);
      const n = K.combat.bots.length;
      el.innerHTML = LEVELS.map((L, i) => `<button type="button" class="login-alt${i + 1 === st.level ? ' on' : ''}" data-bot="${i + 1}">${i + 1} · ${L.name}<small>${['easy', 'steady', 'quick', 'hard', 'fierce'][i]}</small></button>`).join('')
        + (n ? `<button type="button" class="login-alt game-build-down" data-bot="clear">clear them (${n})</button>` : '');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  }
  const actKey = (id) => (touch ? { attack: 'cast', whirl: 'whirl', guard: 'guard', spawn: 'bots' }[id] : input.device === 'pad' ? padLabel(input.bindings.pad[id]) : keyLabel(input.bindings.keys[id][0] || input.bindings.keys[id][1])) || id;
  // a bot of a level comes up out of the water ahead, where the eye looks
  function callBot(level = st.level) {
    const b = spawnBot(K.combat, K.body, K.eye.yaw, level);
    if (!b) { say('twelve is as many as the void holds at once', 3); return; }
    say(`a ${b.L.name} rises (level ${b.level}) · ${actKey('attack')} casts the ring, held it spins up · ${actKey('whirl')} whirls · ${actKey('guard')} guards`, 6);
  }
  let hurtT = 0, foes = '', hpShown = -1;
  function fought(e) {
    if (e.type === 'hurt') hurtT = Math.min(1, hurtT + 0.35 + e.damage / 30);
    else if (e.type === 'down') say('struck down · you stand again in a moment', PLAYER.down);
    else if (e.type === 'rise') say('standing again', 2);
  }
  // what the fight shows over the picture: the mark the ring goes for, how much the body has left, a flush when it is hit
  function hud(dt) {
    const C = K.combat, live = C.bots.length, hudEl = $('.game-hud'); if (!hudEl) return;
    const engaged = live > 0 || C.ring.mode !== 'held' || C.guard.up;
    hudEl.classList.toggle('on', !stand && (locked || engaged));
    hudEl.style.setProperty('--charge', C.ring.mode === 'charging' ? C.ring.charge.toFixed(2) : '0');
    hudEl.classList.toggle('guard', C.guard.up);
    const hp = Math.round(C.player.hp), showHp = K.body.mode === 'survival' && (live > 0 || hp < PLAYER.hp);
    if (hp !== hpShown) { hpShown = hp; hudEl.style.setProperty('--hp', (hp / PLAYER.hp).toFixed(3)); }
    hudEl.classList.toggle('hp', showHp);
    hurtT = Math.max(0, hurtT - dt * 1.6);
    hudEl.style.setProperty('--hurt', hurtT.toFixed(3));
    hudEl.classList.toggle('down', C.player.down > 0);
    const line = live || C.broken ? `${live ? `${live} bot${live > 1 ? 's' : ''}` : 'no bots'} · ${C.broken} broken` : '';
    if (line !== foes) { foes = line; const el = $('.game-foes'); if (el) { el.textContent = line; el.hidden = !line; } }
  }

  // what stands, drawn: a drawing for each building, kept while it stands; and the light a body inside is seen by
  const SUN = new THREE.Vector3(), skyCol = new THREE.Color(), sunCol = new THREE.Color(), hearthCol = new THREE.Color(0.5, 0.62, 1.0);
  const ARTS = { shelter: createShelterArt, house: createHouseArt, workshop: createWorkshopArt, tower: createTowerArt };
  function builds(dt) {
    const V = K.void, L = LIGHTS[V.light], seen = new Set();
    SUN.copy(V.key.position).sub(V.key.target.position).normalize();
    sunCol.set(L.key).multiplyScalar(L.keyAmt);
    skyCol.set(L.horizon).lerp(new THREE.Color(L.zenith), 0.5).multiplyScalar(0.55 * L.env);
    let flame = 0, flameAt = null, fireCol = hearthCol, best = Infinity;
    for (const b of K.world.buildings) {
      let art = K.arts.get(b);
      if (!art) { art = ARTS[b.kind]({ lite: K.lite }); K.arts.set(b, art); V.scene.add(art.group); }
      seen.add(b);
      const k = KINDS[b.kind], [dx, dz] = k.door(b), inIt = K.world.within(b, K.body.p);
      const near = k.opens ? k.opens(b, K.body.p) : Math.hypot(K.body.p[0] - dx, K.body.p[2] - dz) < 2.6 || inIt;
      const r = art.update(b, { t: K.clock, dt, sun: [SUN.x, SUN.y, SUN.z], sunCol, sky: skyCol, near, hearthCol, night: L.stars });
      // the light of the fire nearest the body (one light for all of them: a light that came and went would make every material again)
      const at = art.flameAt.clone().applyMatrix4(art.group.matrixWorld), d = at.distanceTo(new THREE.Vector3(K.body.p[0], K.body.p[1], K.body.p[2])) - (inIt ? 100 : 0);
      if (r.flame > 0 && d < best) { best = d; flame = r.flame; flameAt = at; fireCol = art.fireCol || hearthCol; }
    }
    for (const [b, art] of K.arts) if (!seen.has(b)) { V.scene.remove(art.group); art.dispose(); K.arts.delete(b); }
    // the fire's light; and inside, the body seen by what gets in (the sun's own patch, or the shade)
    K.hearth.intensity = 2.2 * flame;
    if (flameAt) { K.hearth.position.copy(flameAt); K.hearth.color.copy(fireCol); }
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
      if (inp.spawn) callBot();
      if (inp.menu) openMenu();
      K.world.update(dt);
      // struck down, the body does nothing; spinning the ring up or guarding, it walks
      const C = K.combat, down = C.player.down > 0;
      advance(body, { ...(down ? IDLE : C.slow ? { ...inp, walk: true, sprint: false } : inp), yaw: eye.yaw, pitch: eye.pitch }, dt);
      // what the body did, on the water
      for (const e of body.events.splice(0)) {
        const at = e.at || body.p;
        const wet = K.world.wet(at[0], at[2]) && at[1] < 0.05;
        if (e.type === 'jump') { if (wet) V.drop(at[0], at[2], 0.2); }
        else if (e.type === 'land') { figure.land(e.speed); if (wet) { V.drop(at[0], at[2], clamp(0.12 + 0.045 * e.speed, 0.12, 0.6)); if (e.speed > 5) V.drop(at[0] + 0.05, at[2] - 0.03, 0.25); } }
        else if (e.type === 'dash') wake = 0;
        else if (e.type === 'fly') showMode();
      }
      // the fight: the ring and the bots, once the body has moved (aimed along the eye's line as it was drawn last)
      camera.getWorldDirection(AIM);
      stepCombat(C, dt, { body, aim: { from: [camera.position.x, camera.position.y, camera.position.z], dir: [AIM.x, AIM.y, AIM.z] },
        hands: down ? {} : { attack: inp.attack, attackPressed: inp.attackPressed, guard: inp.guard, guardPressed: inp.guardPressed, sweep: inp.whirl },
        creative: body.mode === 'creative', world: K.world });
      const evs = C.events.splice(0);
      K.fight.events(evs);
      for (const e of evs) fought(e);
      if (C.face > 0 && !body.flying) body.yaw = turnTo(body.yaw, C.faceYaw, 16 * dt);
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
    // struck down: the body goes over backward where it stood, and comes up again
    K.fallen += ((K.combat.player.down > 0 ? 1 : 0) - K.fallen) * ease(K.combat.player.down > 0 ? 7 : 4, dt);
    // along a wall the body leans into it (its right side toward a wall on its right)
    const wr = body.wallrun, lean = wr ? -0.42 * Math.sign(wr.n[0] * -Math.cos(body.yaw) + wr.n[1] * Math.sin(body.yaw)) : 0;
    K.lean = (K.lean || 0) + (lean - (K.lean || 0)) * ease(12, dt);
    tip(figure, pos, body.yaw, K.fallen, K.lean);
    // far from where the numbers began, they begin again under the body
    const far = K.place === 'island' ? null : rebase(body.p[0], body.p[2]);
    if (far) { shift(body, far[0], far[1]); V.rebase(far[0], far[1]); K.world.shift(far[0], far[1]); shiftCombat(K.combat, far[0], far[1]); K.fight.shift(far[0], far[1]); eye.at.x -= far[0]; eye.at.z -= far[1]; shown(body, pos); figure.update(body, 0, pos); tip(figure, pos, body.yaw, K.fallen, K.lean || 0); }

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
    // running along a wall on the eye's right, the eye stands off the body's other shoulder (the wall would bring it in close)
    const onWall = body.wallrun, flip = onWall && onWall.n[0] * cy - onWall.n[1] * sy < 0 ? -1 : 1;
    eye.side = (eye.side ?? 1) + (flip - (eye.side ?? 1)) * ease(onWall ? 14 : 5, dt);
    eye.wall = (eye.wall || 0) + ((onWall ? 1 : 0) - (eye.wall || 0)) * ease(onWall ? 9 : 2.5, dt);     // and steps a metre out from it
    // a building in the way: the eye comes in rather than go into a wall or a dome; where that would leave it too near
    // the body (its back to a wall), the eye rises instead and looks down over it
    const from = [eye.at.x, eye.at.y, eye.at.z], walls = (K.world.buildings.length || K.world.ground) && !stand;
    // the lowest the eye goes: over the water, or inside a building over the floor the body stands on
    const indoors = walls && K.world.inside(body.p), lowest = indoors ? Math.max(WATER, body.floorY ?? 0) : WATER;
    const room = (p, dd) => { const f = along(p), s0 = eye.side * (SHOULDER * Math.min(1, dd / 4) + eye.wall); return dd * K.world.eye(from, [from[0] - f[0] * dd + cy * s0, Math.max(lowest + 0.1, from[1] - f[1] * dd), from[2] - f[2] * dd - sy * s0]); };
    let lift = 0;
    if (walls) {
      let best = room(pitch0, d);
      for (const l of [0.35, 0.7, 1.0]) { if (best >= Math.min(d, 1.3)) break; const dd = room(clamp(pitch0 - l, PITCH[0], PITCH[1]), d); if (dd > best + 0.05) { best = dd; lift = l; } }
      if (best < 0.6) lift = 0;               // nowhere gives it room: it stays just behind the head, looking where it was looking
    }
    eye.lift = (eye.lift || 0) + (lift - (eye.lift || 0)) * ease(6, dt);
    const pitch = clamp(pitch0 - eye.lift, PITCH[0], PITCH[1]), [fx, fy, fz] = along(pitch);
    let squeezed = false;
    if (walls) { const dd = Math.max(0.35, room(pitch, d)); squeezed = dd < d - 1e-3; d = dd; }
    if (fy > 1e-4 && (!K.world.ground || indoors)) d = Math.min(d, Math.max(0.5, (eye.at.y - (lowest + 0.14)) / fy));   // looking up: the eye comes in rather than go under the water or the floor (on the island the ground's own line keeps it out)
    eye.d = d < eye.d ? d : eye.d + (d - eye.d) * ease(8, dt);
    // an eye that a wall has brought within arm's length of the head would be inside the body: it is not drawn then
    // (until the eye has room again; with nothing built, as it always was)
    if (squeezed && eye.d < 0.65) eye.hide = true; else if (eye.d >= 0.65 || !walls) eye.hide = false;
    figure.group.visible = !eye.hide;
    const side = eye.side * (SHOULDER * Math.min(1, eye.d / 4) + eye.wall) * (1 - u);
    camera.position.set(eye.at.x - fx * eye.d + cy * side, Math.max(lowest + 0.1, eye.at.y - fy * eye.d), eye.at.z - fz * eye.d - sy * side);
    camera.rotation.set(pitch, eye.yaw, 0, 'YXZ');
    const fov = FOV + 12 * smooth(SPRINT + 1, 46, Math.hypot(body.v[0], body.v[2]));    // the view opens a little at speed
    eye.fov += (fov - eye.fov) * ease(6, dt);
    if (Math.abs(camera.fov - eye.fov) > 0.02) { camera.fov = eye.fov; camera.updateProjectionMatrix(); }
    // the picture is slid so the body stands in what the sheet leaves (the mirror's eye takes the same slide: void.js copies this one's projection)
    if (stand) { const cv = K.renderer.domElement; camera.setViewOffset(cv.clientWidth || 1, cv.clientHeight || 1, stand.x * u, stand.y * u, cv.clientWidth || 1, cv.clientHeight || 1); }
    camera.updateMatrixWorld();

    builds(dt);
    if (V.live && !paused) V.live(dt, K.clock, body, K.world);   // the island's palms, birds, woodhens and turtles
    K.fight.update(K.combat, paused ? 0 : dt, camera, body);
    hud(dt);
    V.setScale(camera);
    // the bodies' shades on the water: this one's, and the nearest bots' (four in all)
    const shades = [{ x: pos[0], z: pos[2], y: pos[1], k: figure.shade }];
    for (const b of K.combat.bots) { if (shades.length >= 4) break; if (b.mode === 'fight') shades.push({ x: b.p[0], z: b.p[2], y: b.p[1], k: 0.55 }); }
    V.update(K.clock, camera, shades);
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
        <button type="button" id="game-build" class="login-alt" aria-expanded="false" aria-controls="game-build-list" title="put up a building, a few steps in front of you">build</button>
        <button type="button" id="game-bots" class="login-alt" aria-expanded="false" aria-controls="game-bot-list" title="call up a bot to fight, at one of five levels">bots</button>
        <button type="button" id="game-controls" class="login-alt" aria-haspopup="dialog">controls</button>
        ${toSocieties ? '<button type="button" id="game-societies" class="login-alt" title="the world that was here first">the societies</button>' : ''}
        <div class="game-build" id="game-build-list" role="group" aria-label="what to build" hidden></div>
        <div class="game-build game-bots" id="game-bot-list" role="group" aria-label="a bot to fight, by level" hidden></div>
      </div>
      <div class="game-hud" aria-hidden="true"><i class="game-reticle"></i><div class="game-hp"><i></i></div><i class="game-hurt"></i></div>
      <div class="game-foes" role="status" hidden></div>
      <i class="game-room" aria-hidden="true"></i>
      <div class="game-hint" role="status" hidden></div>
      <div class="game-touch"${touch ? '' : ' hidden'}>
        <button type="button" id="game-t-sink" class="game-tbtn" aria-label="Sink" hidden>sink</button>
        <div class="game-tfight"><button type="button" id="game-t-guard" class="game-tbtn" aria-label="Guard">guard</button><button type="button" id="game-t-whirl" class="game-tbtn" aria-label="Whirl">whirl</button><button type="button" id="game-t-cast" class="game-tbtn" aria-label="Cast the ring">cast</button></div>
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
      getPlace: () => K.place, setPlace: (p) => { placeTo(p); }, where: () => (K.place === 'island' ? { p: [...K.body.p], yaw: K.body.yaw } : null),
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
    press('#game-build', () => { if (!menu.isOpen() && !chooser.isOpen()) listBuilds(); });
    { const el = $('#game-build-list');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-build]'); if (!btn || btn.disabled) return;
        if (e.detail > 0) focusCanvas();
        const k = btn.dataset.build; listBuilds(false);
        if (k === 'down') said(K.world.toggle(K.body, st.building)); else buildHere(k);
      });
      on(el, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); listBuilds(false); $('#game-build')?.focus(); } });
      on(holder, 'pointerdown', () => { listBuilds(false); listBots(false); }); }
    press('#game-bots', () => { if (!menu.isOpen() && !chooser.isOpen()) listBots(); });
    { const el = $('#game-bot-list');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-bot]'); if (!btn) return;
        if (e.detail > 0) focusCanvas();
        const k = btn.dataset.bot; listBots(false);
        if (k === 'clear') { const n = K.combat.bots.length; clearBots(K.combat); say(n ? `the ${n === 1 ? 'bot sinks' : `${n} bots sink`} back into the water` : 'no bots', 3); return; }
        st.level = Math.max(1, Math.min(5, +k || 1)); save(); callBot(st.level);
      });
      on(el, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); listBots(false); $('#game-bots')?.focus(); } }); }
    press('#game-societies', () => toSocieties?.());
    for (const [sel, action] of [['#game-t-jump', 'jump'], ['#game-t-dash', 'dash'], ['#game-t-sink', 'down'], ['#game-t-cast', 'attack'], ['#game-t-whirl', 'whirl'], ['#game-t-guard', 'guard']]) {
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
      world: { buildings: K.world.buildings.map((b) => ({ kind: b.kind, x: b.x, y: b.y || 0, z: b.z, yaw: b.yaw, t: b.t, down: b.down, built: !!(KINDS[b.kind].phase(b).rest >= 1), open: Math.round((K.arts.get(b)?.open ?? 0) * 100) / 100 })), inside: K.world.inside(K.body.p)?.kind || null, indoor: Math.round(K.indoor * 100) / 100, eyeD: Math.round(K.eye.d * 100) / 100,
        climbing: !!K.body.climbing, wallrun: !!K.body.wallrun, place: K.place, depth: Math.round((K.body.depth || 0) * 100) / 100, swim: !!K.body.swim,
        ground: K.world.ground ? Math.round(K.world.ground.height(K.body.p[0], K.body.p[2]) * 100) / 100 : 0, life: K.void.life ? K.void.life.counts() : null, choice: st.building, hidden: !!K.eye.hide, eye: K.camera.position.toArray().map((v) => Math.round(v * 100) / 100) },
      fight: { ring: K.combat.ring.mode, charge: Math.round(K.combat.ring.charge * 100) / 100, guard: K.combat.guard.up, hp: Math.round(K.combat.player.hp), down: K.combat.player.down > 0, broken: K.combat.broken, turned: K.combat.turned, level: st.level, bolts: K.combat.bolts.length,
        bots: K.combat.bots.map((b) => ({ id: b.id, level: b.level, hp: b.hp, max: b.max, mode: b.mode, p: b.p.map((v) => Math.round(v * 100) / 100), over: K.world.ground ? Math.round((b.p[1] - Math.max(0, K.world.ground.height(b.p[0], b.p[2]))) * 100) / 100 : b.p[1] })), ringAt: K.combat.ring.p.map((v) => Math.round(v * 100) / 100) } } : null) };
    showMode();
    document.body.classList.add('in-void');        // styles.css: what the page puts away while the void is open
    root.dataset.place = K.place;
    if (st.place !== K.place) placeTo(st.place, false);           // the island, where the person was last
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
