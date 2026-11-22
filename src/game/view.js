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
// five: the shelter, the house, the workshop, the tower and the hall) or with the build key (the kind last
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
import { createInput, wireInput, loadBindings, keyLabel, padLabel, DOES, ABOARD } from './input.js';
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
import { createPlinthArt } from './buildings/plinth.js';
import { createBlueprint } from './blueprint.js';
import { glyphSvg, BAR } from './glyphs.js';
import { createWorkshopArt } from './buildings/workshop.js';
import { createTowerArt } from './buildings/tower.js';
import { createHallArt } from './buildings/hall.js';
import { SHIPS, KIND as SHIP_KIND, placeShip, stepShip, nearShip, shipGap, board, carry, leave, carryOn, setThrottle, lightLine, THROTTLE } from './ships.js';
import { GLOBE, midOf, roundOf, wentRound, comeOut } from './wrap.js';
import { createSkiffArt } from './ships/skiff.js';
import { createDartArt } from './ships/dart.js';
import { createDhowArt } from './ships/dhow.js';
import { createArkArt } from './ships/ark.js';
import { createCarrierArt } from './ships/carrier.js';
import { createCombat, stepCombat, spawnBot, clearBots, shiftCombat, chooseWeapon, nextWeapon, LEVELS, PLAYER, WEAPONS } from './combat.js';
import { createFightArt } from './fight.js';
import { createLightArt } from './light.js';
import { createIsland } from './island/island.js';
import { loadIsland, createGround } from './island/ground.js';
import { trunksNear } from './island/life.js';
import { SHAPE } from './island/lordhowe-shape.js';

const PITCH = [-1.25, 1.2];             // how far down and up the eye may look
const SHOULDER = 0.3;                   // the eye stands this far to the body's right (and looks at it as high as its own eyes: figure.look)
const POSE = { pitch: -0.05, every: 200 };     // the body sheet: how the eye is tipped while it looks at the body, and how often (ms) the page is asked where the sheet is      // the body sheet: the eye nearly level; a body is this much taller than its eyes; where on it the eye looks; how wide it is taken to be
const FOV = 55;
const ISLAND_URL = 'src/game/island/lordhowe.bin';
// ?sky=true (exactly) in the address: the island under the true sky (sky.js; SOLAR.md step 2), not yet the island's own.
// The question is asked here, in the view's own lines, so that a page without the switch reads no file of the sky's.
const skyAsked = (search) => { try { return new URLSearchParams(search || '').get('sky') === 'true'; } catch { return false; } };
const TRUE_SKY = skyAsked(globalThis.location?.search);
let SKY = null;                         // sky.js itself, fetched the first time the island is come to with the switch on: a page without the switch never reads it
const FAR = { void: 20000, island: 45000 };   // how far the eye sees: the island's needs Ball's Pyramid, 28 km off
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const worn = (st) => st.kind + ' ' + JSON.stringify(st.looks[st.kind]);
const LEARNED = 14;        // seconds of moving after which the standing hint is put away
// the island's middle: its flat map is a globe laid flat about it (wrap.js, until the planets are built)
const MID = midOf(SHAPE.extent);
const IDLE = { move: [0, 0], look: [0, 0], zoom: 0, jump: false, jumpPressed: false, dash: false, flyToggle: false, sprint: false, walk: false, up: false, down: false, modeToggle: false, menu: false, device: 'keys',
  attack: false, attackPressed: false, whirl: false, guard: false, guardPressed: false, bind: false, bindPressed: false, spawn: false };
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
const SHIPQ = new THREE.Quaternion(), SHIPE = new THREE.Euler(), YAWQ = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
// the whole body turned about its feet: over backward when struck down (k: 0 standing, 1 lying), and leaning
// sideways (roll, radians; + to its right) as it runs along a wall; aboard a ship, turned as the ship is (its nose up or
// down, its bank: ships.js posePoint carries the seat round with it)
function tip(figure, at, yaw, k, roll = 0, ship = null) {
  const g = figure.group, turned = !!ship && (Math.abs(ship.tilt || 0) > 1e-3 || Math.abs(ship.bank || 0) > 1e-3);
  if (k < 1e-3 && Math.abs(roll) < 1e-3 && !turned) { if (g.position.lengthSq() > 0 || g.quaternion.w < 1) { g.position.set(0, 0, 0); g.quaternion.identity(); } return; }
  TIPA.set(-Math.cos(yaw), 0, Math.sin(yaw));
  TIP.setFromAxisAngle(TIPA, 1.38 * k);
  TIPA.set(Math.sin(yaw), 0, Math.cos(yaw));
  ROLL.setFromAxisAngle(TIPA, roll); TIP.premultiply(ROLL);
  if (turned) { SHIPE.set(ship.tilt || 0, ship.yaw, ship.bank || 0, 'YXZ'); SHIPQ.setFromEuler(SHIPE); YAWQ.setFromAxisAngle(UPV, -ship.yaw); SHIPQ.multiply(YAWQ); TIP.premultiply(SHIPQ); }
  TIPV.set(at[0], at[1], at[2]).applyQuaternion(TIP);
  g.quaternion.copy(TIP); g.position.set(at[0] - TIPV.x, at[1] - TIPV.y, at[2] - TIPV.z);
}

// what stays for the next visit: the canvas and its programs, the void, the figure, the body where it stood
let kept = null;
function stage(lite, st) {
  if (kept && (kept.renderer.getContext().isContextLost() || kept.lite !== lite)) {
    kept.figure.dispose(); kept.fight?.dispose(); kept.void.dispose(); kept.renderer.dispose(); kept.renderer.domElement.remove();
    kept = { body: kept.body, worlds: kept.worlds, at: kept.at, island: kept.island, combat: kept.combat, eye: kept.eye, clock: kept.clock, ms: kept.ms, learned: kept.learned, fine: kept.fine, rs: kept.rs, aboard: kept.aboard };
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
    kept = { body: createBody({ yaw: Math.PI }), worlds: { void: createWorld(), island: createWorld() }, at: {}, combat: createCombat({ seed: (Math.random() * 1e9) | 0 }), eye: null, clock: 0, ms: 16.7, learned: 0, fine: createWatch(), rs: null, ...(kept || {}), renderer, lite, void: v, figure, camera, worn: worn(st), size: null, arts: new Map(), shipArts: new Map(), aboard: null, indoor: 1, fallen: 0, place: 'void' };
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
  let last = 0, wake = 0, sayUntil = 0, standing = '', menuShut = 0, saveT = 0, locked = false, touch = false, still = 0, beckonAt = 0;
  let hand = 0;                     // how fine it is drawn (fine.js): a person's own choice of fewer pixels (0: none)
  const offs = [];
  const pos = [0, 0, 0];
  const $ = (sel) => root?.querySelector(sel);

  const save = () => { if (st) saveState(storage, st); };
  const focusCanvas = () => { try { K?.renderer.domElement.focus({ preventScroll: true }); } catch { /* it still draws */ } };
  function say(text, seconds = 4) { const el = $('.game-hint'); if (!el) return; el.textContent = text; el.hidden = !text; sayUntil = text ? performance.now() + seconds * 1000 : 0; seatHint(); }
  // WHERE THE HINT STANDS, MEASURED (Colin, 19 Nov 2026, with a picture: the pill over the bottom bar). A formula for the
  // chat bar's seat was off by its own height when the bottom rail was folded, and on a phone the line under the bar met
  // the bar's second row: so what is there is measured, and the line stands 8px clear of it, under the top's things on a
  // phone (the bar, its lists, the top grip), over the foot's on a wider screen (the chat bar, the grip, the air mark, the
  // thumbs' buttons where they are under it). Asked again whenever it says something, and twice a second while it shows.
  let seatAt = 0;
  function seatHint() {
    const hintEl = $('.game-hint'), panel = $('.game-plan'), el = panel && !panel.hidden ? panel : hintEl;
    if (!el || el.hidden || !root) return;
    seatAt = performance.now();
    const shown = (e) => { if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const me = el.getBoundingClientRect(), across = (r) => r.left < me.right && me.left < r.right;
    if (matchMedia('(max-width: 560px)').matches) {
      let top = 0;
      for (const sel of ['.game-bar', '.nav-collapse-top', '.game-foes']) { const r = shown(root.querySelector(sel) || document.querySelector(sel)); if (r && r.top < innerHeight / 2) top = Math.max(top, r.bottom); }
      if (top) root.style.setProperty('--hint-t', `${Math.round(top + 8)}px`);
    } else {
      let low = innerHeight;
      for (const sel of ['#chat .chat-menu', '#chat .chat-box', '.nav-collapse-bottom', '#chat-air', '.game-touch']) {
        const r = shown(document.querySelector(sel));
        if (r && r.bottom > innerHeight / 2 && (sel !== '.game-touch' || across(r))) low = Math.min(low, r.top);
      }
      if (low < innerHeight) root.style.setProperty('--hint-b', `${Math.round(innerHeight - low + 8)}px`);
    }
    if (tipAt) tipOver();                              // the line has moved: is the bar's word standing on it now?
  }
  // the line that stands when nothing else is being said
  // the standing line is for the first steps: once the body has been moved for a while it is put away
  // (the controls button and its key stay), until the page is opened again
  function hint() {
    if (chooser?.isOpen()) return '';                 // the body is what is looked at: nothing is said over its feet
    if (plan) return '';                              // the blueprint's own panel says what may be done
    const b = input.bindings, k = (id) => keyLabel(b.keys[id][0] || b.keys[id][1]) || '—';
    // in the light: how to come out of it (its speed and distance are on the line at the top)
    const L = K.body.light;
    if (L) return L.phase === 'go' ? `steer where you look · 1 to 9 or ${input.device === 'pad' ? 'the stick back' : k('back')} to come out of the light` : '';
    // aboard a ship, its own short line, as long as the body is in its seat
    if (K.aboard && !touch) return input.device === 'pad' ? `left stick drives · ${padLabel(b.pad.jump) || '—'} rises · ${padLabel(b.pad.down) || '—'} sinks · ${padLabel(b.pad.sprint) || '—'} held, the throttle · ${padLabel(b.pad.board) || '—'} steps off`
      : `${k('forward')} drives · it turns where you look · ${k('jump')} rises · ${k('down')} sinks · ${k('sprint')} held, the throttle · 1 to 9 set it, 0 lightspeed · ${k('back')} brakes · ${k('board')} steps off`;
    if (touch || K.learned > LEARNED) return '';
    if (input.device === 'pad') return `left stick moves · ${padLabel(b.pad.jump) || '—'} jumps, held longer rises higher · ${padLabel(b.pad.dash) || '—'} dashes · ${padLabel(b.pad.menu) || '—'} for the controls`;
    return `${locked ? 'esc frees the pointer · ' : 'click to look around · '}${k('forward')} ${k('left')} ${k('back')} ${k('right')} move · ${k('jump')} jumps, held longer rises higher · ${k('dash')} dashes · ${k('menu')} for the controls`;
  }
  function showMode() {
    const el = $('#game-mode'); if (!el) return;
    barGlyph(el, BAR.mode(K.body.mode), K.body.mode); el.setAttribute('aria-pressed', String(K.body.mode === 'creative'));
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
    wire?.release(); input.clear(); hideTip(); menu.open();        // (a sheet takes the pointer from the bar: its word would never hear it leave)
  }
  function openBody() {
    if (!chooser || chooser.isOpen() || menu.isOpen() || performance.now() - menuShut < 250) return;
    wire?.release(); input.clear(); hideTip(); turned = 0; chooser.open();
    if (!st.bodyMet) { st.bodyMet = true; save(); beckon(); }
    beckonAt = 0; if ($('.game-hint')?.textContent === BECKON) say('', 0);      // found: the line has done its work
  }
  // a first visitor is pointed to the body sheet: its button breathes, and once, a few seconds in, a line says what it
  // is for; both stop for good once the sheet has been opened (state.js bodyMet)
  const BECKON = 'five kinds of body, and this is one · the body button makes it yours';
  function beckon() { $('#game-body-open')?.classList.toggle('beckon', !st.bodyMet); }
  // ---- THE BAR IN GLYPHS (glyphs.js BAR; Colin, 19 Nov 2026: "this bar still needs to be turned into glyphs"). Each button
  // is its glyph, poured in unimat by the same mount the rail's glyphs use (../mercury-buttons.js; until the pour lands, or
  // where there is no WebGL2, the drawing stands in), and its word: the button's name, shown under it on hover, on focus,
  // and to a finger when held (a finger cannot hover; the press that showed the word does not also press the button).
  const barFace = (glyph) => `<span class="game-barg" data-glyph="${glyph}">${glyphSvg(glyph)}</span>`;
  const barPoured = new Map();          // button id -> { el, h }
  // a button's word, and its glyph drawn again (and poured again) only when it is another
  function barGlyph(btn, glyph, word) {
    btn.setAttribute('aria-label', word);
    if (tipAt === btn) placeTip();
    const g = btn.querySelector('.game-barg'); if (!g || g.dataset.glyph === glyph) return;
    const was = barPoured.get(btn.id); if (was) { try { was.h.destroy(); } catch { /* gone */ } barPoured.delete(btn.id); }
    g.classList.remove('mercury'); g.dataset.glyph = glyph; g.innerHTML = glyphSvg(glyph);
    pourBar();
  }
  function pourBar() {
    if (!root || !document.body.classList.contains('merc-sdf')) return;   // the liquid is off here: the drawings stand as they are
    const todo = [...root.querySelectorAll('.game-barg:not(.mercury)')];
    if (!todo.length) return;
    import('../mercury-buttons.js').then(({ mount }) => {
      todo.forEach((el, i) => {
        const id = el.parentElement?.id;
        if (!root || !el.isConnected || !id || barPoured.has(id)) return;
        el.classList.add('mercury');                                       // its own drawing stands in until the bake lands
        let h = null;
        // a bright floor and less of the glass let through: silver that reads on a pale sky as on the night (the sheet's glyphs stand on a dark sheet and keep 0.16)
        try { h = mount(el, { svgEl: el.querySelector('svg'), size: 24, thicken: 1.3, rim: 0.04, envFloor: 0.4, trans: 0.55, seed: 41 + i * 5.3 }); } catch { h = null; }
        if (h) barPoured.set(id, { el, h }); else el.classList.remove('mercury');
      });
    }).catch(() => { /* the drawings stand on their own */ });
  }
  function unpourBar() { clearInterval(lookT); lookT = 0; for (const { h } of barPoured.values()) { try { h.destroy(); } catch { /* gone */ } } barPoured.clear(); blank.clear(); }
  // THE BAR IS NEVER BLANK. A glyph's pour is the liquid's business (the drawing stands in while its bake lands), but one
  // whose pour cannot be seen (the liquid's canvas lost, as a starved machine loses it: seen once, the whole page's metal
  // gone and the bar with it) would be an empty seat in the only bar there is. So the glyphs are looked at: all of them
  // 2, 4 and 6 s after the bar is poured, then one a second; one that shows nothing twice running wears its own drawing
  // (`bare`, styles.css) until its pour is seen again. Looked at through a 12 px copy: the liquid's own canvas is not read.
  let lookT = 0, lookN = 0, lookC = null;
  const blank = new Map();              // button id -> how many looks running it showed nothing
  function lookAt(b) {
    const g = b.querySelector('.game-barg'); if (!g || !g.offsetWidth) return;
    if (!g.classList.contains('mercury')) { b.classList.remove('bare'); blank.delete(b.id); return; }   // not poured: its drawing already stands
    let seen = false;
    try {
      const c = g.querySelector('canvas.mercury-blob');
      if (c && c.width) {
        lookC ||= Object.assign(document.createElement('canvas'), { width: 12, height: 12 }).getContext('2d', { willReadFrequently: true });
        lookC.clearRect(0, 0, 12, 12); lookC.drawImage(c, 0, 0, 12, 12);
        const d = lookC.getImageData(0, 0, 12, 12).data; let k = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 20) k++;
        seen = k >= 3;
      }
    } catch { seen = true; }            // it cannot be looked at here: the pour is left as it is
    const n = seen ? 0 : (blank.get(b.id) || 0) + 1;
    blank.set(b.id, n); b.classList.toggle('bare', n >= 2);
  }
  function lookBar() {
    const bs = root ? [...root.querySelectorAll('.game-barb')] : []; if (!bs.length) return;
    lookN += 1;
    if (lookN <= 6) { if (lookN % 2 === 0) bs.forEach(lookAt); } else lookAt(bs[lookN % bs.length]);
  }
  // THE WORD, under the glyph it names: one tip for the bar, standing outside it (a glass inside the bar's glass could only
  // blur the bar, not the picture). The mouse's hover and the keyboard's focus show it; held by a finger it shows and the
  // press does nothing else; tapped, it shows a moment too, so a phone learns the bar as it is used.
  let tipAt = null, tipBy = '', tipT = 0;
  // the word put where it stands; asked again when its button's word changes or a list opens under it (which must not
  // also keep it there: a tap's word goes after its moment, so only showTip touches the clock)
  function placeTip() {
    const t = $('.game-tip'), b = tipAt; if (!t || !b) return;
    t.textContent = b.getAttribute('aria-label') || '';
    // under the bar, not just the glyph: with a list open the word would stand on the list. And clear of the bright edge
    // where the page's top band meets its hole (it is drawn over the world): between the bar and the edge where it fits,
    // else just inside the hole
    const r = b.getBoundingClientRect(), under = b.closest('.game-bar')?.getBoundingClientRect() || r, w = t.offsetWidth, h = t.offsetHeight;
    const hole = $('.game-room')?.getBoundingClientRect();
    let top = Math.max(r.bottom, under.bottom) + 4;
    if (hole && top + h > hole.top - 4 && top < hole.top + 8) top = hole.top + 8;
    t.style.left = `${Math.round(Math.min(innerWidth - w - 6, Math.max(6, r.left + r.width / 2 - w / 2)))}px`;
    t.style.top = `${Math.round(top)}px`;
    t.classList.add('on');
    tipOver();
  }
  function showTip(b, by) { if (!b) return; clearTimeout(tipT); tipAt = b; tipBy = by; placeTip(); }
  // a line the word would stand on gives way while it is said (on a phone the hint is under the bar too); asked again
  // whenever the hint is seated, since a list opening under the word moves the hint to where the word is
  function tipOver() {
    const t = $('.game-tip'); if (!t || !root) return;
    const on = t.classList.contains('on'), a = on ? t.getBoundingClientRect() : null;
    for (const el of root.querySelectorAll('.game-hint, .game-foes, .game-light')) {
      const q = on && !el.hidden ? el.getBoundingClientRect() : null;
      el.classList.toggle('under-tip', !!q && q.width > 0 && a.left < q.right && q.left < a.right && a.top < q.bottom && q.top < a.bottom);
    }
  }
  // a list opened or shut under a shown word: the word moves to stay under the bar
  function reTip() { placeTip(); }
  function hideTip(ms = 0) { clearTimeout(tipT); tipT = setTimeout(() => { $('.game-tip')?.classList.remove('on'); tipAt = null; tipBy = ''; tipOver(); }, ms); }
  function wireWords(bar, on) {
    if (!bar) return;
    let holdT = 0, held = null;
    const barb = (e) => e.target.closest?.('.game-barb');
    on(bar, 'pointerover', (e) => { const b = barb(e); if (b && e.pointerType === 'mouse') showTip(b, 'hover'); });
    on(bar, 'pointerout', (e) => { const b = barb(e); if (b && e.pointerType === 'mouse' && !b.contains(e.relatedTarget) && tipBy === 'hover') hideTip(); });
    on(bar, 'focusin', (e) => { const b = barb(e); if (b && b.matches(':focus-visible')) showTip(b, 'focus'); });
    on(bar, 'focusout', () => { if (tipBy === 'focus') hideTip(); });
    on(bar, 'pointerdown', (e) => {
      held = null; clearTimeout(holdT);
      const b = barb(e); if (!b || e.pointerType === 'mouse') return;
      holdT = setTimeout(() => { held = b; showTip(b, 'touch'); }, 380);
    });
    on(bar, 'pointerup', (e) => {
      clearTimeout(holdT);
      const b = barb(e); if (!b || e.pointerType === 'mouse') return;
      if (held !== b) showTip(b, 'touch');
      hideTip(held === b ? 1100 : 900);
    });
    on(bar, 'pointercancel', () => { clearTimeout(holdT); if (tipBy === 'touch') hideTip(600); });
    // the long press is not also a press
    on(bar, 'click', (e) => { const b = barb(e); if (b && held === b) { e.preventDefault(); e.stopImmediatePropagation(); } held = null; }, true);
    on(bar, 'contextmenu', (e) => { if (barb(e)) e.preventDefault(); });
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
    try { v = K.place === 'island' ? createIsland({ renderer: K.renderer, lite: true, light: st.light, ground: K.island.ground, shape: SHAPE, sky: SKY }) : createVoid({ renderer: K.renderer, lite: true, light: st.light }); made = createFigure({ kind: st.kind, look: st.looks[st.kind], lite: true }); } catch (e) { console.error('[void] the plain picture could not be made', e); v?.dispose(); return; }
    K.figure.dispose(); K.fight.dispose(); K.void.dispose();
    for (const art of K.arts.values()) art.dispose();
    K.arts.clear(); dropGround();
    for (const art of K.shipArts.values()) art.dispose();
    K.shipArts.clear();
    v.scene.add(made.group, K.hearth); made.setEnv(LIGHTS[v.light].env);
    K.void = v; K.figure = made; K.lite = true; K.worn = worn(st); K.size = null; standT = 0;
    K.fight = createFightArt(v.scene, { lite: true }); K.fight.setDrop((x, z, a) => K.void.drop(x, z, a));
    shown(K.body, pos); made.update(K.body, 0, pos);
    size();
  }

  // the build key: near a building's door it is taken down; else the kind last chosen goes up in front of the body
  const ARRIVE = { shelter: 'walk in through its door', house: 'up the steps and in; its ladder climbs to the loft', workshop: 'its glass wall slides open as you come; the kiln is at the back', tower: 'in at its door; the stair climbs the wall to the dome', hall: 'up its stairs to the door on top; the hangar is under them' };
  function said(r) {
    const key = keyLabel(input.bindings.keys.build[0] || input.bindings.keys.build[1]) || 'build';
    if (r.did === 'up') say(`${r.base === 'level' ? 'the ground is levelled, and ' : r.base === 'platform' ? 'a platform rises, and on it ' : ''}a ${r.b.kind} goes up · ${ARRIVE[r.b.kind]} · ${touch ? 'build' : key} again near it takes it down`, 6);
    else if (r.did === 'down') say(`the ${r.b.kind} comes down`, 3);
    else if (r.did === 'blocked') say(`too near the ${r.b.kind}: step away from it and build`, 4);
    else if (r.did === 'steep') say(r.rises ? `the ground rises ${r.fall.toFixed(1)} m behind it here: face downhill, or find flatter ground` : `the ground falls ${r.fall.toFixed(1)} m under it here: find flatter ground to build`, 4);
  }
  function buildHere(kind = null) {
    if (plan && !kind) { planEnd(); return; }                                     // the build key again puts the blueprint away
    if (K.aboard || K.body.flying || !K.body.grounded || K.body.climbing) { say(K.aboard ? 'step off the ship to build' : 'stand on the ground to build'); return; }
    if (!kind) { const near = K.world.near(K.body.p); if (near) { planEnd(); said(K.world.toggle(K.body, st.building)); return; } }
    planStart(kind || st.building);
  }
  // THE HAND THAT HOLDS (bodies/common.js holdArm; Colin, 19 Nov 2026: "it'd be nice if the character actually held the
  // weapon in its hand instead of just rendering it close to their hand"): what the weapon in hand is doing says what
  // the right arm does, eased so nothing snaps: carried (the forearm forward, the fist upright, the fingers closed on it),
  // put out along the eye's line (a bow drawn, a flame sent, a lash, the shield), raised (a bell rung, a ring spun up);
  // while the ring is away the hand is open and follows it a little.
  const HOLD = { carry: 0, reach: 0, lift: 0, aim: [0, 0, 1], closed: false }, GRIP = { p: new THREE.Vector3(), q: new THREE.Quaternion(), reach: 0 };
  function holding(dt) {
    const C = K.combat, R = C.ring, w = C.weapon, aim = [AIM.x, AIM.y, AIM.z];
    let t = { carry: 1, reach: 0, lift: 0, aim, closed: true };
    if (C.player.down > 0 || K.aboard) t = { carry: 0, reach: 0, lift: 0, aim, closed: false };
    else if (C.guard.up) t = { carry: 0, reach: 1, lift: 0, aim: [Math.sin(C.faceYaw), 0.05, Math.cos(C.faceYaw)], closed: true };
    else if (w === 'ring') {
      if (R.mode === 'out' || R.mode === 'back' || R.mode === 'whirl' || R.mode === 'slam') t = { carry: 0.2, reach: 0.55, lift: 0, aim, closed: false };
      else if (R.mode === 'charging') t.lift = R.charge;
    } else if (w === 'bow') { if (C.bow.mode === 'drawing') t = { carry: 0, reach: 1, lift: 0, aim, closed: true }; }
    else if (w === 'bell') { if (C.bell.mode === 'ringing') t.lift = 0.3 + 0.7 * C.bell.power; }
    else if (w === 'thread') { const Th = C.thread; if (Th.mode === 'spinning') t.lift = 0.4 + 0.6 * Th.power; else if (Th.mode !== 'held' || Th.snare != null) t = { carry: 0.3, reach: 0.8, lift: 0, aim, closed: true }; }
    else if (w === 'torch') { const To = C.torch; if (To.mode === 'flame') t = { carry: 0, reach: 1, lift: 0, aim: To.dir || aim, closed: true }; }
    const k = 1 - Math.exp(-12 * dt);
    HOLD.carry += (t.carry - HOLD.carry) * k; HOLD.reach += (t.reach - HOLD.reach) * k; HOLD.lift += (t.lift - HOLD.lift) * k; HOLD.closed = t.closed;
    for (let i = 0; i < 3; i++) HOLD.aim[i] += (t.aim[i] - HOLD.aim[i]) * Math.min(1, k * 1.6);
    return HOLD;
  }
  // THE BLUEPRINT (blueprint.js; Colin, 19 Nov 2026: "preview a blueprint/holograph of where the item will be placed with
  // an option to confirm placement", and on uneven ground "an option to level the ground around it or build a flat
  // platform"). Chosen, a building is shown as light where it would go: out along the eye's way from the body, nearest
  // with the eye at rest and further as it looks up, its door to the body, turned by the turn key a quarter of a quarter
  // at a time. Its colour says whether it may go up there; the panel says why not, and on uneven ground offers the two
  // ways. It is put there with a click, the place key (Enter) or the panel; the build key again, or the menu key, leaves it.
  let plan = null;                 // { kind, turn, choice: 'level' | 'platform', at, r } while a blueprint is shown
  const PLAN = { reach: 26, lift: 0.55, rest: -0.1, turn: Math.PI / 4 };
  function planStart(kind) {
    st.building = kind; save(); listBuilds(false);
    plan = { kind, turn: 0, choice: 'level', at: null, r: null, said: '' };
    say('', 0); planPanel(true); planStep();
  }
  function planEnd() { if (!plan) return; plan = null; K.blue?.hide(); planPanel(false); }
  // where it would go, from the body and the eye, and what may be done there
  function planStep() {
    if (!plan) return;
    const k = KINDS[plan.kind], b0 = k.place(K.body), near = Math.hypot(b0.x - K.body.p[0], b0.z - K.body.p[2]);
    const out = clamp((K.eye.pitch - PLAN.rest) / PLAN.lift, 0, 1), d = near + PLAN.reach * out * out;
    const fx = -Math.sin(K.eye.yaw), fz = -Math.cos(K.eye.yaw);
    plan.at = { x: K.body.p[0] + fx * d, z: K.body.p[2] + fz * d, yaw: Math.atan2(-fx, -fz) + plan.turn * PLAN.turn };
    const r = K.world.site(K.body, plan.kind, plan.at); plan.r = r;
    const b = r.did === 'blocked' ? r.at : { ...r.b };
    if (r.did === 'steep' && plan.choice === 'platform' && r.platform) b.y = r.platform.top;      // shown on the platform it would have
    if (!K.blue) K.blue = createBlueprint(K.void.scene, { arts: ARTS, lite: K.lite });
    K.blue.show(plan.kind, b, r.did, K.world.ground ? (x, z) => K.world.ground.height(x, z) : null);
    planPanel(true);
  }
  // put it there, as the panel and the keys say
  function planPlace(choice = null) {
    if (!plan || !plan.r) return;
    if (choice) plan.choice = choice;
    const r = plan.r;
    if (r.did === 'blocked') { planSay(`too near the ${r.b.kind}: turn it, or look further off`); return; }
    if (r.did === 'steep' && !r[plan.choice]) { planSay(plan.choice === 'level' ? 'too steep to level here: a platform, or flatter ground' : 'too steep for a platform here: level it, or find flatter ground'); return; }
    const res = K.world.build(K.body, plan.kind, { at: plan.at, base: r.did === 'steep' ? plan.choice : null });
    planEnd(); said(res);
  }
  function planSay(text) { if (!plan) return; plan.said = text; plan.saidAt = performance.now(); planPanel(true); }
  // the panel: what it is and what may be done, the keys for it; on uneven ground, the two ways
  function planPanel(show) {
    const el = $('.game-plan'); if (!el) return;
    if (!show || !plan) { el.hidden = true; return; }
    const b = input.bindings, k = (id, i = 0) => keyLabel(b.keys[id][i] || b.keys[id][1 - i]) || '';
    const r = plan.r, did = r ? r.did : 'up', steep = did === 'steep';
    if (plan.said && performance.now() - plan.saidAt > 3500) plan.said = '';
    const line = plan.said || (did === 'blocked' ? `too near the ${r.b.kind} · turn it, or look further off`
      : steep ? `the ground ${r.rises ? 'rises' : 'falls'} ${r.fall.toFixed(1)} m across it · level it, or raise it on a platform`
        : `the ${plan.kind} · look up to put it further off · it goes up where it shows`);
    const key = `${plan.kind}|${did}|${plan.choice}|${line}|${!!r?.level}|${!!r?.platform}|${touch}`;
    el.hidden = false; el.dataset.did = did;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const kb = (t) => (t && !touch ? `<kbd>${esc(t)}</kbd>` : '');
    const btn = (act, text, keys, extra = '') => `<button type="button" class="game-plan-btn${extra}" data-plan="${act}">${glyphSvg(act, 18)}<span>${esc(text)}</span>${kb(keys)}</button>`;
    el.innerHTML = `<p class="game-plan-say" role="status">${esc(line)}</p>
      ${steep ? `<div class="game-plan-row">${btn('level', 'level the ground', '1', `${plan.choice === 'level' ? ' on' : ''}${r.level ? '' : ' off'}`)}${btn('platform', 'build a platform', '2', `${plan.choice === 'platform' ? ' on' : ''}${r.platform ? '' : ' off'}`)}</div>` : ''}
      <div class="game-plan-row">${btn('turn', 'turn', k('board'))}${btn('place', steep ? (plan.choice === 'level' ? 'level and build' : 'raise and build') : 'build here', 'enter', ` main${did === 'blocked' || (steep && !r[plan.choice]) ? ' off' : ''}`)}${btn('cancel', 'cancel', k('menu', 1) || k('menu'))}</div>`;
    seatHint();
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // the platforms and the blueprint live in the scene: they go with it
  function dropGround() { for (const a of (K.plinths || new Map()).values()) a.dispose(); K.plinths?.clear(); K.blue?.dispose(); K.blue = null; planEnd(); }
  // the bar's build list: the five, those not made yet greyed; near a building, the first line takes it down
  // the key that does a list's item at once (input.js SHORT), shown on its button where there are keys
  const capOf = (id) => { const c = !touch && input?.bindings.keys[id]?.find(Boolean); return c ? `<kbd class="game-cap">${keyLabel(c)}</kbd>` : ''; };
  function listBuilds(show) {
    const el = $('#game-build-list'), btn = $('#game-build'); if (!el || !btn) return;
    const open = show ?? el.hidden;
    if (open) {
      listBots(false); listShips(false);
      const near = K.world.near(K.body.p);
      el.innerHTML = (near ? `<button type="button" class="login-alt game-build-down" data-build="down">take down the ${near.kind}</button>` : '')
        + BUILDINGS.map((b) => `<button type="button" class="login-alt${b.kind === st.building ? ' on' : ''}" data-build="${b.kind}"${b.ready ? '' : ' disabled aria-disabled="true"'}>${b.label}${b.ready ? capOf('build_' + b.kind) : '<small>to come</small>'}</button>`).join('');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); reTip();
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
      // the true sky's own files are read only where the address asks for it; if they cannot be, the island keeps the sky it had
      if (name === 'island' && TRUE_SKY && !SKY) { try { SKY = await import('./sky.js'); } catch (e) { console.error('[island] the true sky could not be fetched', e); } }
      if (!root) return;
      const made = name === 'island' ? createIsland({ renderer: K.renderer, lite: K.lite, light: st.light, ground: K.island.ground, shape: SHAPE, sky: SKY }) : createVoid({ renderer: K.renderer, lite: K.lite, light: st.light });
      if (K.aboard) { leave(K.aboard, K.body); K.aboard = null; }
      K.at[K.place] = { p: [...K.body.p], yaw: K.body.yaw };
      K.void.scene.remove(K.figure.group, K.hearth);
      for (const art of K.shipArts.values()) art.dispose();
      K.shipArts.clear();
      for (const art of K.arts.values()) art.dispose();
      K.arts.clear(); dropGround(); K.fight.dispose(); clearBots(K.combat); K.combat.bolts = []; K.combat.events.length = 0;
      K.void.dispose();
      K.void = made; K.place = name; K.world = K.worlds[name]; K.body.world = K.world;
      made.scene.add(K.figure.group, K.hearth);
      K.fight = createFightArt(made.scene, { lite: K.lite }); K.fight.setDrop((x, z, a) => K.void.drop(x, z, a));
      const back = K.at[name], a = SHAPE.arrive;
      if (back) { K.body.p = [...back.p]; K.body.yaw = back.yaw; }
      else if (name === 'island') { K.body.p = [a.x, K.island.ground.floor(a.x, a.z), a.z]; K.body.yaw = a.facing; }
      else { K.body.p = [0, 0, 0]; K.body.yaw = Math.PI; }
      K.body.v = [0, 0, 0]; K.body.was = [...K.body.p]; K.body.light = null; K.body.grounded = true; K.body.rising = false; K.body.wallrun = null; K.body.climbing = false;
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
      listBuilds(false); listShips(false); listWeapons(false);
      const n = K.combat.bots.length;
      el.innerHTML = LEVELS.map((L, i) => `<button type="button" class="login-alt${i + 1 === st.level ? ' on' : ''}" data-bot="${i + 1}">${i + 1} · ${L.name}<small>${['easy', 'steady', 'quick', 'hard', 'fierce'][i]}</small></button>`).join('')
        + (n ? `<button type="button" class="login-alt game-build-down" data-bot="clear">clear them (${n})</button>` : '');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); reTip();
  }
  // ---- the weapons (stage 5): the bar's list of the five (those not made yet greyed); T, or the list, changes the one in hand
  function listWeapons(show) {
    const el = $('#game-weapon-list'), btn = $('#game-weapons'); if (!el || !btn) return;
    const open = show ?? el.hidden;
    if (open) {
      listBuilds(false); listBots(false); listShips(false);
      el.innerHTML = WEAPONS.map((w) => `<button type="button" class="login-alt${w.id === K.combat.weapon ? ' on' : ''}" data-weapon="${w.id}"${w.ready ? '' : ' disabled aria-disabled="true"'}>${w.label}${w.ready ? capOf('take_' + w.id) : '<small>to come</small>'}</button>`).join('');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); reTip();
  }
  const weaponWords = (w) => {
    const next = `${actKey('weapon')} the ${nextWeapon(w)}`;
    if (w === 'bow') return `the bow · ${actKey('attack')} looses an arrow, held it draws harder and goes through · ${actKey('whirl')} a volley · drawn in the air, it holds you up · ${next}`;
    if (w === 'bell') return `the bell · ${actKey('attack')} strikes it, held it tolls further and stuns · ${actKey('whirl')} a peal · struck in the air, it rings out below · ${next}`;
    if (w === 'thread') return `the thread · ${actKey('attack')} lashes it out, held it reaches further and snares · ${actKey('whirl')} a circle overhead · in the air, a line that catches and draws you in · ${next}`;
    if (w === 'torch') return `the torch · ${actKey('attack')} throws an ember that sets the ground alight, held it streams a flame (a machine heated all the way flares) · ${actKey('whirl')} a wall of fire · in the air, held, it bears you up · ${next}`;
    return `the ring · ${actKey('attack')} casts it, held it spins up · ${actKey('whirl')} whirls · in the air it slams · ${next}`;
  };
  const WORDS = { ring: ['cast', 'Cast the ring', 'whirl', 'Whirl'], bow: ['loose', 'Loose an arrow', 'volley', 'A volley'], bell: ['strike', 'Strike the bell', 'peal', 'A peal'], thread: ['lash', 'Lash the thread', 'circle', 'A circle overhead'], torch: ['flame', 'Throw an ember, or hold for the flame', 'wall', 'A wall of fire'] };
  // a phone's buttons say what the weapon in hand does
  function labelWeapon() {
    const [c1, c2, w1, w2] = WORDS[K?.combat?.weapon] || WORDS.ring, cast = $('#game-t-cast'), whirl = $('#game-t-whirl');
    if (cast) { cast.textContent = c1; cast.setAttribute('aria-label', c2); }
    if (whirl) { whirl.textContent = w1; whirl.setAttribute('aria-label', w2); }
    const bar = $('#game-weapons'); if (bar) barGlyph(bar, BAR.weapons(K?.combat?.weapon), `weapons · the ${K?.combat?.weapon || 'ring'}`);
  }
  function takeWeapon(w) {
    if (!chooseWeapon(K.combat, w)) return;
    st.weapon = K.combat.weapon; save(); labelWeapon();
    say(weaponWords(st.weapon), 6);
  }
  const actKey = (id) => (touch ? { attack: (WORDS[K?.combat?.weapon] || WORDS.ring)[0], whirl: (WORDS[K?.combat?.weapon] || WORDS.ring)[2], guard: 'guard', bind: 'bind', spawn: 'bots', board: 'ships', weapon: 'weapons' }[id] : input.device === 'pad' ? padLabel(input.bindings.pad[id]) : keyLabel(input.bindings.keys[id][0] || input.bindings.keys[id][1])) || id;

  // ---- the ships (stage 4). The bar's ships list: the five (those not made yet greyed); near one, a line to board it;
  // aboard, one to step off; with one put, one to send it away. One ship is put at a time, in front of the body.
  const floorAt = (x, z) => (K.world.ground ? Math.max(0, K.world.ground.height(x, z)) : 0);
  function listShips(show) {
    const el = $('#game-ship-list'), btn = $('#game-ships'); if (!el || !btn) return;
    const open = show ?? el.hidden;
    if (open) {
      listBuilds(false); listBots(false); listWeapons(false);
      const near = !K.aboard && nearShip(K.world.ships, K.body.p), any = K.world.ships[0];
      el.innerHTML = (K.aboard ? `<button type="button" class="login-alt game-build-down" data-ship="leave">step off the ${K.aboard.kind}</button>` : '')
        + (near ? `<button type="button" class="login-alt game-build-down" data-ship="board">board the ${near.kind}</button>` : '')
        + SHIPS.map((sh) => `<button type="button" class="login-alt" data-ship="${sh.kind}"${sh.ready ? '' : ' disabled aria-disabled="true"'}>${sh.label}${sh.ready ? capOf('call_' + sh.kind) : '<small>to come</small>'}</button>`).join('')
        + (any && !K.aboard ? `<button type="button" class="login-alt game-build-down" data-ship="away">send the ${any.kind} away</button>` : '');
    }
    el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); reTip();
  }
  function putShip(kind) {
    if (K.aboard) { say(`you are aboard the ${K.aboard.kind}`, 3); return; }
    // called from anywhere: on the ground, in the air, on the water or on a deck (in the air it comes to the body's height)
    const aloft = K.body.flying || !K.body.grounded;
    K.world.ships = [placeShip(K.body, floorAt, kind)];
    nearSaid = K.world.ships[0];   // this says how to board it: the hint near its seat is not said over it at once
    const up = { dhow: 'takes you up to its helm', ark: 'lifts you up into its dome', carrier: 'lifts you up to its helm' }[kind] || 'boards it';
    const where = { skiff: 'in front of', ark: 'ahead of', carrier: 'ahead of' }[kind] || 'beside';
    say(`${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} comes ${aloft ? 'up' : 'down'} ${where} you · ${actKey('board')} ${up}`, 5);
  }
  function boardOrLeave() {
    if (K.body.light) return;                          // in the light there is no ship to step into
    if (K.aboard) { const s = K.aboard; leave(s, K.body); K.aboard = null; say(`you step off the ${s.kind}`, 2); return; }
    const s = nearShip(K.world.ships, K.body.p);
    if (!s) { const far = K.world.ships[0]; if (far) say(`the ${far.kind} is ${Math.round(shipGap(far, K.body.p))} m off · come near it to board`, 3); return; }
    board(s, K.body); K.aboard = s;
    say(`aboard the ${s.kind} · ${touch ? 'the stick drives it' : `${actKey('forward')} drives it`} · it turns where you look · ${actKey('jump')} rises · ${actKey('down')} sinks · ${touch ? 'the gauge is its throttle' : `${actKey('sprint')} held opens the throttle (1 to 9 set it, 0 is lightspeed)`} · ${actKey('board')} steps off`, 8);
  }
  // the ships drawn, and those let be coasting to a stop
  const SHIP_ARTS = { skiff: createSkiffArt, dart: createDartArt, dhow: createDhowArt, ark: createArkArt, carrier: createCarrierArt };
  let shipWake = 0, nearSaid = null, throttleTo = null, thrShown = -1, wheelQuiet = 1, wheelGate = false;
  // COMING OUT OF THE LIGHT, AND GOING ROUND (wrap.js; Colin, 19 Nov 2026: "when you exit lightspeed, you should always
  // continue going forward, and in front of you, there's the island. like, a globe"). A ship that has gone round comes
  // out with the island's middle straight ahead (under the veil, so it is not seen put there), flying on toward it; in
  // the void there is nothing to come to, and it only comes down to where the water can be seen. These two are all of
  // the globe there is in the view: with a real globe to fly round, they go.
  function outOfLight(sh) {
    const L = sh.light;
    if (!L || L.phase !== 'out' || L.placed) return;
    L.placed = true; L.round = wentRound(L.dist);
    if (!L.round) return;                                // a short hop: it is where it is
    const to = K.place === 'island' ? comeOut(sh.p, sh.yaw, MID) : [sh.p[0], Math.min(sh.p[1], GLOBE.high), sh.p[2]];
    K.eye.at.x += to[0] - sh.p[0]; K.eye.at.y += to[1] - sh.p[1]; K.eye.at.z += to[2] - sh.p[2];
    sh.p = to;
  }
  function globe() {
    if (K.place !== 'island') return;
    const p = K.aboard ? K.aboard.p : K.body.p, far = roundOf(p[0], p[2], MID);
    if (!far) return;
    if (K.aboard) { K.aboard.p[0] -= far[0]; K.aboard.p[2] -= far[1]; }
    shift(K.body, far[0], far[1]); K.eye.at.x -= far[0]; K.eye.at.z -= far[1];
  }
  // the wheel is a ship's throttle: a notch for every hundred of its turning (a mouse's click, a short stroke of two
  // fingers). A stroke stops at 9: only one begun there (after a moment's rest) goes on to the light
  function wheelThrottle(sh, turned, dt) {
    wheelQuiet += dt;
    if (!turned) return;
    const thr = sh.light && sh.light.phase !== 'out' ? 10 : sh.thr || 0;
    if (wheelQuiet > 0.3) wheelGate = thr >= THROTTLE.notches;
    wheelQuiet = 0;
    setThrottle(sh, clamp(thr - turned / 100, 0, wheelGate ? 10 : THROTTLE.notches));
  }
  // the throttle's gauge: shown aboard while it is open (or sprint is held, or the light is about the ship); a drag on it
  // sets it (the pointer free), the wheel too (ships.js THROTTLE)
  function gauge(inp) {
    const el = $('.game-throttle'); if (!el) return;
    const sh = K.aboard, thr = sh ? (sh.light && sh.light.phase !== 'out' ? 10 : sh.thr || 0) : 0, show = !!sh && (touch || thr > 0.01 || !!sh.light || !!inp?.sprintHeld);
    if (el.hidden === show) el.hidden = !show;
    if (!show || Math.abs(thr - thrShown) < 0.01) return;
    thrShown = thr; el.style.setProperty('--thr', (thr / 10).toFixed(3)); el.classList.toggle('light', thr >= 10); el.setAttribute('aria-valuenow', String(Math.round(thr)));
    const n = el.querySelector('.game-throttle-n'); if (n) n.textContent = thr >= 10 ? 'c' : thr >= 0.5 ? String(Math.round(thr)) : '';
  }
  // the ships no one flies: they slow to a hover and ride it (ships.js), and a body standing on one goes with it
  function drift(dt) {
    for (const sh of K.world.ships) {
      if (sh === K.aboard) continue;
      const was = [...sh.p], wasYaw = sh.yaw, wasBob = sh.bob || 0;
      stepShip(sh, { move: [0, 0], yaw: sh.yaw - Math.PI, pitch: 0 }, dt, { floorAt, solid: (q) => K.world.solid(q) });
      if (K.body.on === sh && !K.body.light && K.body.p[1] - (K.body.floorY ?? 0) < 4) carryOn(sh, K.body, was, wasYaw, wasBob);
    }
  }
  function ships(dt) {
    const V = K.void, seen = new Set();
    for (const sh of K.world.ships) {
      let art = K.shipArts.get(sh);
      if (!art) { art = (SHIP_ARTS[sh.kind] || createSkiffArt)({ lite: K.lite }); K.shipArts.set(sh, art); V.scene.add(art.group); }
      seen.add(sh);
      art.update(sh, { t: K.clock, dt, aboard: sh === K.aboard, night: V.air ? V.air.state.night : LIGHTS[V.light].stars });
      // low and quick over the water, it drags a wake from its stern
      const v = Math.hypot(sh.v[0], sh.v[2]), lowOver = sh.p[1] - floorAt(sh.p[0], sh.p[2]);
      if (sh === K.aboard && v > 4 && lowOver < 2.4 && (shipWake -= dt) <= 0) {
        const back = SHIP_KIND[sh.kind].length / 2 + 0.1, bx = sh.p[0] - Math.sin(sh.yaw) * back, bz = sh.p[2] - Math.cos(sh.yaw) * back;
        if (K.world.wet(bx, bz)) V.drop(bx, bz, Math.min(0.5, 0.12 + v * 0.012) * (1 - lowOver / 2.6));
        shipWake = 0.05;
      }
    }
    for (const [sh, art] of K.shipArts) if (!seen.has(sh)) { V.scene.remove(art.group); art.dispose(); K.shipArts.delete(sh); }
    // coming near a ship (any part of it), the hint says how to board it (once each time)
    const near = !K.aboard && nearShip(K.world.ships, K.body.p);
    if (near && near !== nearSaid) say(`${actKey('board')} boards the ${near.kind}`, 3);
    nearSaid = near || null;
  }
  // a bot of a level comes up out of the water ahead, where the eye looks
  function callBot(level = st.level) {
    const b = spawnBot(K.combat, K.body, K.eye.yaw, level);
    if (!b) { say('twelve is as many as the void holds at once', 3); return; }
    const w = K.combat.weapon, does = { bow: ['looses an arrow, held it draws harder', 'a volley'], bell: ['strikes the bell, held it tolls', 'a peal'], thread: ['lashes the thread, held it snares', 'a circle overhead'], torch: ['throws an ember, held it streams a flame', 'a wall of fire'] }[w] || ['casts the ring, held it spins up', 'whirls'];
    say(`a ${b.L.name} rises (level ${b.level}) · ${actKey('attack')} ${does[0]} · ${actKey('whirl')} ${does[1]} · ${actKey('guard')} guards · ${actKey('bind')} held binds it`, 6);
  }
  let hurtT = 0, foes = '', hpShown = -1, lightT = 0, lightSaid = '';
  function fought(e) {
    if (e.type === 'hurt') hurtT = Math.min(1, hurtT + 0.35 + e.damage / 30);
    else if (e.type === 'down') say('struck down · you stand again in a moment', PLAYER.down);
    else if (e.type === 'rise') say('standing again', 2);
  }
  // what the fight shows over the picture: the mark the ring goes for, how much the body has left, a flush when it is hit
  function hud(dt) {
    const C = K.combat, live = C.bots.length, hudEl = $('.game-hud'); if (!hudEl) return;
    const engaged = live > 0 || C.ring.mode !== 'held' || C.guard.up || C.bow.mode === 'drawing' || C.bell.mode === 'ringing' || C.torch.mode !== 'held' || C.fires.length > 0;
    hudEl.classList.toggle('on', !stand && (locked || engaged));
    hudEl.style.setProperty('--charge', C.ring.mode === 'charging' ? C.ring.charge.toFixed(2) : C.bow.mode === 'drawing' ? C.bow.draw.toFixed(2) : C.bell.mode === 'ringing' ? C.bell.power.toFixed(2) : '0');
    hudEl.classList.toggle('guard', C.guard.up);
    const hp = Math.round(C.player.hp), showHp = K.body.mode === 'survival' && (live > 0 || hp < PLAYER.hp);
    if (hp !== hpShown) { hpShown = hp; hudEl.style.setProperty('--hp', (hp / PLAYER.hp).toFixed(3)); }
    hudEl.classList.toggle('hp', showHp);
    hurtT = Math.max(0, hurtT - dt * 1.6);
    hudEl.style.setProperty('--hurt', hurtT.toFixed(3));
    hudEl.classList.toggle('down', C.player.down > 0);
    const line = K.body.light ? '' : live || C.broken ? `${live ? `${live} bot${live > 1 ? 's' : ''}` : 'no bots'} · ${C.broken} broken` : '';
    if (line !== foes) { foes = line; const el = $('.game-foes'); if (el) { el.textContent = line; el.hidden = !line; } }
  }

  // what stands, drawn: a drawing for each building, kept while it stands; and the light a body inside is seen by
  const SUN = new THREE.Vector3(), skyCol = new THREE.Color(), sunCol = new THREE.Color(), hearthCol = new THREE.Color(0.5, 0.62, 1.0);
  const ARTS = { shelter: createShelterArt, house: createHouseArt, workshop: createWorkshopArt, tower: createTowerArt, hall: createHallArt };
  function builds(dt) {
    const V = K.void, L = LIGHTS[V.light], seen = new Set(), A = V.air ? V.air.state : null;      // A: the true sky's own light, where it is drawn
    SUN.copy(V.key.position).sub(V.key.target.position).normalize();
    if (A) { sunCol.copy(A.sunCol); skyCol.copy(A.skyCol); }
    else { sunCol.set(L.key).multiplyScalar(L.keyAmt); skyCol.set(L.horizon).lerp(new THREE.Color(L.zenith), 0.5).multiplyScalar(0.55 * L.env); }
    let flame = 0, flameAt = null, fireCol = hearthCol, best = Infinity;
    for (const b of K.world.buildings) {
      let art = K.arts.get(b);
      if (!art) { art = ARTS[b.kind]({ lite: K.lite }); K.arts.set(b, art); V.scene.add(art.group); }
      seen.add(b);
      const k = KINDS[b.kind], [dx, dz] = k.door(b), inIt = K.world.within(b, K.body.p);
      const near = k.opens ? k.opens(b, K.body.p) : Math.hypot(K.body.p[0] - dx, K.body.p[2] - dz) < 2.6 || inIt;
      const r = art.update(b, { t: K.clock, dt, sun: [SUN.x, SUN.y, SUN.z], sunCol, sky: skyCol, near, hearthCol, night: A ? A.night : L.stars });
      // the light of the fire nearest the body (one light for all of them: a light that came and went would make every material again)
      const at = art.flameAt.clone().applyMatrix4(art.group.matrixWorld), d = at.distanceTo(new THREE.Vector3(K.body.p[0], K.body.p[1], K.body.p[2])) - (inIt ? 100 : 0);
      if (r.flame > 0 && d < best) { best = d; flame = r.flame; flameAt = at; fireCol = art.fireCol || hearthCol; }
    }
    for (const [b, art] of K.arts) if (!seen.has(b)) { V.scene.remove(art.group); art.dispose(); K.arts.delete(b); }
    // the platforms under buildings (buildings/plinth.js), risen as far as each is
    K.plinths ||= new Map();
    for (const b of K.world.buildings) if (b.plinth) { let a = K.plinths.get(b); if (!a) { a = createPlinthArt({ lite: K.lite }); K.plinths.set(b, a); V.scene.add(a.group); } a.update(b); }
    for (const [b, a] of K.plinths) if (!seen.has(b)) { V.scene.remove(a.group); a.dispose(); K.plinths.delete(b); }
    // the fire's light; and inside, the body seen by what gets in (the sun's own patch, or the shade)
    K.hearth.intensity = 2.2 * flame;
    if (flameAt) { K.hearth.position.copy(flameAt); K.hearth.color.copy(fireCol); }
    const inside = K.world.inside(K.body.p), head = [K.body.p[0], K.body.p[1] + BODY.tall * 0.8, K.body.p[2]];
    const want = inside ? 0.12 + 0.88 * K.world.sunAt(head, [SUN.x, SUN.y, SUN.z]) : 1;
    K.indoor += (want - K.indoor) * ease(5, dt);
    V.setIndoor(K.indoor);
    K.figure.setEnv((A ? A.env : LIGHTS[V.light].env) * (0.3 + 0.7 * K.indoor));
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
      // aboard a ship the wheel is its throttle; the eye's zoom keeps its keys
      if (K.aboard) { wheelThrottle(K.aboard, inp.wheel || 0, dt); if (inp.wheel) { const z = inp.zoom - inp.wheel * 0.0016; inp.zoom = Math.abs(z) < 1e-9 ? 0 : z; } }
      if (inp.zoom) { st.zoom = clamp(st.zoom * Math.exp(inp.zoom), ZOOM.min, ZOOM.max); saveT = now + 600; }
      if (inp.modeToggle) modeTo(body.mode === 'survival' ? 'creative' : 'survival');
      if (inp.build) buildHere();
      if (plan) {
        // the blueprint takes the hands that would cast, turn a ship's seat and open the controls: place, turn, leave
        if (inp.board) { plan.turn = (plan.turn + 1) % 8; inp.board = false; }
        if (inp.menu) { planEnd(); inp.menu = false; }
        if (plan && inp.whirl && plan.r?.did === 'steep') { plan.choice = plan.choice === 'level' ? 'platform' : 'level'; inp.whirl = false; }
        if (plan && inp.attackPressed) planPlace();
        inp.attack = inp.attackPressed = inp.whirl = false;
      }
      if (inp.spawn) callBot();
      if (inp.weapon) takeWeapon(nextWeapon(K.combat.weapon));
      if (inp.board) boardOrLeave();
      // one key each: a weapon in hand, a building's blueprint, a ship called down (input.js SHORT), as the bar's lists do;
      // while a blueprint is shown only a building's key acts (that building is shown instead: 1 and 2 are the blueprint's)
      // aboard a ship some of them are its throttle instead (input.js ABOARD: 1 to 9, and the light)
      for (const id of inp.shortcuts || []) {
        if (K.aboard && ABOARD[id]) { setThrottle(K.aboard, ABOARD[id]); continue; }
        if (body.light) continue;
        const [what, kind] = DOES[id]; if (plan && what !== 'build') continue; if (what === 'weapon') takeWeapon(kind); else if (what === 'build') buildHere(kind); else putShip(kind);
      }
      if (inp.menu) openMenu();
      K.world.update(dt);
      if (plan) planStep();
      // struck down, the body does nothing; spinning the ring up or guarding, it walks
      const C = K.combat, down = C.player.down > 0;
      drift(dt);
      if (K.aboard) {
        // aboard: the ship flies under the hands, and the body sits in it
        if (throttleTo != null) { setThrottle(K.aboard, throttleTo); throttleTo = null; }
        stepShip(K.aboard, { move: inp.move, yaw: eye.yaw, pitch: eye.pitch, up: inp.up, down: inp.down, sprint: inp.sprintHeld ?? inp.sprint }, dt, { floorAt, solid: (q) => K.world.solid(q) });
        outOfLight(K.aboard);
        carry(K.aboard, body);
      } else advance(body, { ...(down ? IDLE : C.slow ? { ...inp, walk: true, sprint: false } : inp), yaw: eye.yaw, pitch: eye.pitch }, dt);
      body.light = K.aboard?.light || null;          // the light is the ship's: the eye, the line and the drawing read it here
      globe();
      // what the body did, on the water
      for (const e of body.events.splice(0)) {
        const at = e.at || body.p;
        const wet = K.world.wet(at[0], at[2]) && at[1] < 0.05;
        if (e.type === 'jump') { if (wet) V.drop(at[0], at[2], 0.2); }
        else if (e.type === 'land') { figure.land(e.speed); if (wet) { V.drop(at[0], at[2], clamp(0.12 + 0.045 * e.speed, 0.12, 0.6)); if (e.speed > 5) V.drop(at[0] + 0.05, at[2] - 0.03, 0.25); } }
        else if (e.type === 'dash') wake = 0;
        else if (e.type === 'fly') { showMode(); if (e.tapped) say('you let go of the air', 2); }
        else if (e.type === 'light' && (e.on === 'go' || e.home) && K.world.wet(at[0], at[2]) && at[1] < 8) V.drop(at[0], at[2], e.home ? 0.45 : 0.6);   // the water rings under where it sets out and where it comes home
      }
      // the fight: the ring and the bots, once the body has moved (aimed along the eye's line as it was drawn last)
      camera.getWorldDirection(AIM);
      stepCombat(C, dt, { body, aim: { from: [camera.position.x, camera.position.y, camera.position.z], dir: [AIM.x, AIM.y, AIM.z] },
        hands: down || K.aboard || body.light ? {} : { attack: inp.attack, attackPressed: inp.attackPressed, guard: inp.guard, guardPressed: inp.guardPressed, sweep: inp.whirl, bind: inp.bind, bindPressed: inp.bindPressed },
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
    if (!paused && figure.hold) figure.hold(holding(dt));
    for (const [x, z] of figure.update(body, paused ? 0 : dt, pos)) if (pos[1] < 0.05 && K.world.wet(x, z)) V.drop(x, z, 0.1 + 0.012 * Math.hypot(body.v[0], body.v[2]));
    // struck down: the body goes over backward where it stood, and comes up again
    K.fallen += ((K.combat.player.down > 0 ? 1 : 0) - K.fallen) * ease(K.combat.player.down > 0 ? 7 : 4, dt);
    // along a wall the body leans into it (its right side toward a wall on its right)
    const wr = body.wallrun, lean = wr ? -0.42 * Math.sign(wr.n[0] * -Math.cos(body.yaw) + wr.n[1] * Math.sin(body.yaw)) : 0;
    K.lean = (K.lean || 0) + (lean - (K.lean || 0)) * ease(12, dt);
    tip(figure, pos, body.yaw, K.fallen, K.lean, K.aboard);
    // far from where the numbers began, they begin again under the body
    const far = K.place === 'island' ? null : rebase(body.p[0], body.p[2]);
    if (far) { K.origin = [(K.origin?.[0] || 0) + far[0], (K.origin?.[1] || 0) + far[1]]; shift(body, far[0], far[1]); V.rebase(far[0], far[1]); K.world.shift(far[0], far[1]); shiftCombat(K.combat, far[0], far[1]); K.fight.shift(far[0], far[1]); eye.at.x -= far[0]; eye.at.z -= far[1]; shown(body, pos); figure.update(body, 0, pos); tip(figure, pos, body.yaw, K.fallen, K.lean || 0, K.aboard); }

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
    else if (body.light && body.light.phase !== 'gather') eye.at.set(tx, ty, tz);     // in the light the eye keeps up at once
    else { const kh = ease(16, dt), kv = ease(10, dt); eye.at.x += (tx - eye.at.x) * kh; eye.at.z += (tz - eye.at.z) * kh; eye.at.y += (ty - eye.at.y) * kv; }
    // a ship at its throttle's top would leave the eye behind (a skiff at 288 m/s, eighteen metres): it pulls ahead of
    // the eye by a third of how far back the eye stands, and no more
    if (K.aboard && !stand) {
      const lx = tx - eye.at.x, ly = ty - eye.at.y, lz = tz - eye.at.z, lag = Math.hypot(lx, ly, lz), most = 0.33 * Math.max(st.zoom, SHIP_KIND[K.aboard.kind].view);
      if (lag > most) { const k = 1 - most / lag; eye.at.x += lx * k; eye.at.y += ly * k; eye.at.z += lz * k; }
    }
    const sy = Math.sin(eye.yaw), cy = Math.cos(eye.yaw);
    const along = (p) => { const c = Math.cos(p); return [-sy * c, Math.sin(p), -cy * c]; };
    const zoomNow = K.aboard ? Math.max(st.zoom, SHIP_KIND[K.aboard.kind].view) : st.zoom;          // aboard, the eye stands back enough for the ship
    let d = zoomNow + ((stand ? stand.d : zoomNow) - zoomNow) * u;
    // running along a wall on the eye's right, the eye stands off the body's other shoulder (the wall would bring it in close)
    const onWall = body.wallrun, flip = onWall && onWall.n[0] * cy - onWall.n[1] * sy < 0 ? -1 : 1;
    eye.side = (eye.side ?? 1) + (flip - (eye.side ?? 1)) * ease(onWall ? 14 : 5, dt);
    eye.wall = (eye.wall || 0) + ((onWall ? 1 : 0) - (eye.wall || 0)) * ease(onWall ? 9 : 2.5, dt);     // and steps a metre out from it
    // a building in the way: the eye comes in rather than go into a wall or a dome; where that would leave it too near
    // the body (its back to a wall), the eye rises instead and looks down over it
    const from = [eye.at.x, eye.at.y, eye.at.z], walls = (K.world.buildings.length || K.world.ground || K.world.ships.length) && !stand;
    // the lowest the eye goes: over the water, or inside a building over the floor the body stands on
    const indoors = walls && K.world.inside(body.p), lowest = indoors ? Math.max(WATER, body.floorY ?? 0) : WATER;
    const room = (p, dd) => { const f = along(p), s0 = eye.side * (SHOULDER * Math.min(1, dd / 4) + eye.wall); return dd * K.world.eye(from, [from[0] - f[0] * dd + cy * s0, Math.max(lowest + 0.1, from[1] - f[1] * dd), from[2] - f[2] * dd - sy * s0], K.aboard); };
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
    const fov = FOV + 12 * smooth(SPRINT + 1, 46, Math.hypot(body.v[0], body.v[2])) + (K.aboard ? 9 * Math.min(1, (K.aboard.thr || 0) / THROTTLE.notches) : 0) + 20 * (body.light ? body.light.frac : 0);    // the view opens a little at speed (a ship's throttle too), and more toward light
    eye.fov += (fov - eye.fov) * ease(6, dt);
    if (Math.abs(camera.fov - eye.fov) > 0.02) { camera.fov = eye.fov; camera.updateProjectionMatrix(); }
    // the picture is slid so the body stands in what the sheet leaves (the mirror's eye takes the same slide: void.js copies this one's projection)
    if (stand) { const cv = K.renderer.domElement; camera.setViewOffset(cv.clientWidth || 1, cv.clientHeight || 1, stand.x * u, stand.y * u, cv.clientWidth || 1, cv.clientHeight || 1); }
    camera.updateMatrixWorld();

    builds(dt);
    ships(paused ? 0 : dt);
    if (V.live && !paused) V.live(dt, K.clock, body, K.world);   // the island's palms, birds, woodhens and turtles
    // the fist, from the body's own bones: what is in hand is drawn in it, and leaves from it (combat.js handOf)
    let fist = null;
    if (figure.grip && figure.group.visible && !K.aboard) {
      figure.grip.getWorldPosition(GRIP.p); figure.grip.getWorldQuaternion(GRIP.q); GRIP.reach = HOLD.reach; fist = GRIP;
      body.grip = [GRIP.p.x, GRIP.p.y, GRIP.p.z];
    } else body.grip = null;
    K.fight.update(K.combat, paused ? 0 : dt, camera, body, fist);
    if (body.light || K.lightArt) {
      if (K.lightArt?.scene !== V.scene) { K.lightArt?.dispose(); K.lightArt = createLightArt(V.scene, { lite: K.lite }); }
      const sh = K.aboard, len = sh ? SHIP_KIND[sh.kind].length : 0;                 // about a ship, the light is the ship's size
      K.lightArt.update(body.light, { camera, at: sh ? [sh.p[0], sh.p[1] + (sh.bob || 0), sh.p[2]] : [pos[0], pos[1] + figure.look * 0.8, pos[2]], dt: paused ? 0 : dt, eyeD: eye.d, reach: sh ? len : 6, size: sh ? Math.max(1, len / 5) : 1 });
    }
    gauge(paused ? null : inp);
    if (now > lightT) { lightT = now + 120; const line = lightLine(body.light, K.place === 'island' && body.light?.round ? 'the island ahead' : ''); if (line !== lightSaid) { lightSaid = line; const el = $('.game-light'); if (el) { el.textContent = line; el.hidden = !line; } } }
    K.blue?.update(paused ? 0 : dt);
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
    if (beckonAt && now > beckonAt && !sayUntil) { beckonAt = 0; if (!st.bodyMet && !chooser?.isOpen() && !menu?.isOpen()) say(BECKON, 7); }
    if (!sayUntil) { const h = hint(); if (h !== standing) { standing = h; const el = $('.game-hint'); if (el) { el.textContent = h; el.hidden = !h; seatHint(); } } } else standing = '';
    if (now - seatAt > 500) seatHint();
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
    chooseWeapon(K.combat, st.weapon); K.combat.events.length = 0;
    setMode(K.body, st.mode);
    input = createInput(loadBindings(storage));
    touch = !!globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    root = document.createElement('div');
    root.className = 'game-root';
    root.innerHTML = `
      <div class="game-canvas"></div>
      <div class="world-bar game-bar">
        <button type="button" id="game-mode" class="login-alt game-barb game-mode" aria-pressed="false" aria-label="${BAR.mode(st.mode)}" aria-description="survival or creative">${barFace(BAR.mode(st.mode))}</button>
        <button type="button" id="game-body-open" class="login-alt game-barb" aria-haspopup="dialog" aria-label="body" aria-description="who you are here: five kinds of body">${barFace(BAR.body)}</button>
        <button type="button" id="game-build" class="login-alt game-barb" aria-expanded="false" aria-controls="game-build-list" aria-label="build" aria-description="put up a building, a few steps in front of you">${barFace(BAR.build)}</button>
        <button type="button" id="game-weapons" class="login-alt game-barb" aria-expanded="false" aria-controls="game-weapon-list" aria-label="weapons" aria-description="the weapon in hand: the ring, the bow, the bell, the thread or the torch">${barFace(BAR.weapons(st.weapon))}</button>
        <button type="button" id="game-bots" class="login-alt game-barb" aria-expanded="false" aria-controls="game-bot-list" aria-label="bots" aria-description="call up a bot to fight, at one of five levels">${barFace(BAR.bots)}</button>
        <button type="button" id="game-ships" class="login-alt game-barb" aria-expanded="false" aria-controls="game-ship-list" aria-label="ships" aria-description="a ship in front of you, to board and fly">${barFace(BAR.ships)}</button>
        <button type="button" id="game-controls" class="login-alt game-barb" aria-haspopup="dialog" aria-label="controls" aria-description="every key and button, the mode, the light, and the map">${barFace(BAR.controls)}</button>
        ${toSocieties ? `<button type="button" id="game-societies" class="login-alt game-barb" aria-label="the societies" aria-description="the world that was here first">${barFace(BAR.societies)}</button>` : ''}
        <div class="game-build" id="game-build-list" role="group" aria-label="what to build" hidden></div>
        <div class="game-build game-weapons" id="game-weapon-list" role="group" aria-label="the weapon in hand" hidden></div>
        <div class="game-build game-bots" id="game-bot-list" role="group" aria-label="a bot to fight, by level" hidden></div>
        <div class="game-build game-ships" id="game-ship-list" role="group" aria-label="a ship to fly" hidden></div>
      </div>
      <div class="game-hud" aria-hidden="true"><i class="game-reticle"></i><div class="game-hp"><i></i></div><i class="game-hurt"></i></div>
      <div class="game-foes" role="status" hidden></div>
      <div class="game-light" role="status" hidden></div>
      <div class="game-throttle" role="slider" aria-label="throttle" aria-valuemin="0" aria-valuemax="10" hidden><div class="game-throttle-track"><div class="game-throttle-fill"></div></div><span class="game-throttle-c">c</span><b class="game-throttle-n"></b></div>
      <i class="game-room" aria-hidden="true"></i>
      <div class="game-hint" role="status" hidden></div>
      <div class="game-tip" aria-hidden="true"></div>
      <div class="game-plan" role="group" aria-label="where the building goes" hidden></div>
      <div class="game-touch"${touch ? '' : ' hidden'}>
        <button type="button" id="game-t-sink" class="game-tbtn" aria-label="Sink" hidden>sink</button>
        <div class="game-tfight"><button type="button" id="game-t-guard" class="game-tbtn" aria-label="Guard">guard</button><button type="button" id="game-t-whirl" class="game-tbtn" aria-label="Whirl">whirl</button><button type="button" id="game-t-bind" class="game-tbtn" aria-label="The binding">bind</button><button type="button" id="game-t-cast" class="game-tbtn" aria-label="Cast the ring">cast</button></div>
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
    // the throttle's gauge, dragged (a mouse with the pointer free, or a finger): its height is the throttle, its top the light
    { const g = $('.game-throttle'); let dragT = false;
      const at = (e) => { const r = g.querySelector('.game-throttle-track').getBoundingClientRect(), u = clamp((r.bottom - e.clientY) / (r.height || 1), 0, 1); throttleTo = u > 0.96 ? 10 : Math.round(u * 10 * 2) / 2; };
      if (g) {
        on(g, 'pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); dragT = true; try { g.setPointerCapture(e.pointerId); } catch { /* it still sets */ } at(e); });
        on(g, 'pointermove', (e) => { if (dragT) at(e); });
        on(g, 'pointerup', () => { dragT = false; }); on(g, 'pointercancel', () => { dragT = false; });
        on(g, 'mousedown', (e) => e.stopPropagation());
      } }
    // a bar button pressed with the mouse hands the focus back to the canvas, so the jump key is the body's again
    const press = (sel, fn) => { const el = $(sel); if (el) on(el, 'click', (e) => { if (e.detail > 0) focusCanvas(); fn(); }); };
    press('#game-mode', () => modeTo(K.body.mode === 'survival' ? 'creative' : 'survival'));
    press('#game-controls', openMenu);
    press('#game-body-open', openBody);
    press('#game-build', () => { if (!menu.isOpen() && !chooser.isOpen()) listBuilds(); });
    // the blueprint's panel, and its keys: Enter puts it there, 1 and 2 choose how uneven ground is made fit
    { const el = $('.game-plan');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-plan]'); if (!btn || !plan) return;
        if (e.detail > 0) focusCanvas();
        const a = btn.dataset.plan;
        if (a === 'place') planPlace(); else if (a === 'cancel') planEnd(); else if (a === 'turn') { plan.turn = (plan.turn + 1) % 8; planStep(); }
        else if (a === 'level' || a === 'platform') { plan.choice = a; planStep(); }
      });
      on(window, 'keydown', (e) => {
        if (!plan || !root || root.inert || menu.isOpen() || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); planPlace(); }
        else if ((e.code === 'Digit1' || e.code === 'Numpad1') && plan.r?.did === 'steep') { plan.choice = 'level'; planStep(); }
        else if ((e.code === 'Digit2' || e.code === 'Numpad2') && plan.r?.did === 'steep') { plan.choice = 'platform'; planStep(); }
      }); }
    { const el = $('#game-build-list');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-build]'); if (!btn || btn.disabled) return;
        if (e.detail > 0) focusCanvas();
        const k = btn.dataset.build; listBuilds(false);
        if (k === 'down') { planEnd(); said(K.world.toggle(K.body, st.building)); } else buildHere(k);
      });
      on(el, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); listBuilds(false); $('#game-build')?.focus(); } });
      on(holder, 'pointerdown', () => { listBuilds(false); listBots(false); listShips(false); listWeapons(false); }); }
    press('#game-weapons', () => { if (!menu.isOpen() && !chooser.isOpen()) listWeapons(); });
    { const el = $('#game-weapon-list');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-weapon]'); if (!btn || btn.disabled) return;
        if (e.detail > 0) focusCanvas();
        listWeapons(false); takeWeapon(btn.dataset.weapon);
      });
      on(el, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); listWeapons(false); $('#game-weapons')?.focus(); } }); }
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
    press('#game-ships', () => { if (!menu.isOpen() && !chooser.isOpen()) listShips(); });
    { const el = $('#game-ship-list');
      on(el, 'click', (e) => {
        const btn = e.target.closest?.('[data-ship]'); if (!btn || btn.disabled) return;
        if (e.detail > 0) focusCanvas();
        const k = btn.dataset.ship; listShips(false);
        if (k === 'board' || k === 'leave') boardOrLeave();
        else if (k === 'away') { const n = K.world.ships[0]; K.world.ships = []; if (n) say(`the ${n.kind} lifts away`, 2); }
        else putShip(k);
      });
      on(el, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); listShips(false); $('#game-ships')?.focus(); } }); }
    press('#game-societies', () => toSocieties?.());
    for (const [sel, action] of [['#game-t-jump', 'jump'], ['#game-t-dash', 'dash'], ['#game-t-sink', 'down'], ['#game-t-cast', 'attack'], ['#game-t-whirl', 'whirl'], ['#game-t-guard', 'guard'], ['#game-t-bind', 'bind']]) {
      const el = $(sel); if (!el) continue;
      on(el, 'pointerdown', (e) => { e.preventDefault(); input.hold(action, true); try { el.setPointerCapture?.(e.pointerId); } catch { /* it still lifts */ } });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) on(el, ev, () => input.hold(action, false));
      on(el, 'contextmenu', (e) => e.preventDefault());
    }
    labelWeapon(); beckon(); beckonAt = st.bodyMet ? 0 : performance.now() + 6000;
    wireWords($('.game-bar'), on); pourBar(); lookN = 0; lookT = setInterval(lookBar, 1000);
    on(holder, 'pointerdown', (e) => { if (e.pointerType === 'touch' && !touch) { touch = true; $('.game-touch').hidden = false; standing = ' '; } });
    ro = new ResizeObserver(size); ro.observe(holder); size();
    // read only, for whoever is checking the game from outside it (a test's browser, the console). `seen` is where the body's middle is on the canvas, in px
    const seen = () => { const cv = K.renderer.domElement, v = new THREE.Vector3(pos[0], pos[1] + (K.size ? K.size.tall / 2 : K.figure.look), pos[2]).project(K.camera); return [Math.round(((v.x + 1) / 2) * cv.clientWidth), Math.round(((1 - v.y) / 2) * cv.clientHeight)]; };
    (globalThis.Y3K ||= {}).game = { read: () => (K ? { p: [...K.body.p], v: [...K.body.v], mode: K.body.mode, flying: K.body.flying, grounded: K.body.grounded,
      dashing: K.body.dashT > 0, lightspeed: K.body.light ? { phase: K.body.light.phase, v: K.body.light.v, dist: K.body.light.dist, frac: Math.round(K.body.light.frac * 1000) / 1000, veil: Math.round(K.body.light.veil * 1000) / 1000, line: $('.game-light')?.textContent || '' } : null, yaw: K.eye.yaw, pitch: K.eye.pitch, zoom: st.zoom, light: st.light, device: input.device, open: !!root, ms: Math.round(K.ms * 10) / 10,
      fine: K.rs ? { ratio: K.rs[Math.min(K.fine.level, K.rs.length - 1)], level: K.fine.level, steps: K.rs.length, plain: K.lite, trying: K.fine.why, trials: K.fine.trials, mean: Math.round(K.fine.mean * 10) / 10, px: [K.renderer.domElement.width, K.renderer.domElement.height] } : null,
      kind: st.kind, look: { ...st.looks[st.kind] }, posing: !!chooser?.isOpen(), facing: K.body.yaw, seen: seen(), gauge: !$('.game-throttle')?.hidden,
      sky: K.void.air ? K.void.air.read() : null,                 // the true sky's numbers, where it is drawn (sky.js)
      plan: plan ? { kind: plan.kind, did: plan.r?.did, choice: plan.choice, turn: plan.turn, at: plan.at && { x: Math.round(plan.at.x * 100) / 100, z: Math.round(plan.at.z * 100) / 100, yaw: Math.round(plan.at.yaw * 1000) / 1000 },
        y: plan.r?.b ? Math.round((plan.r.b.y || 0) * 100) / 100 : 0, level: !!plan.r?.level, platform: !!plan.r?.platform, shown: K.blue?.shown || null, panel: !$('.game-plan')?.hidden } : null,
      world: { buildings: K.world.buildings.map((b) => ({ kind: b.kind, x: b.x, y: b.y || 0, z: b.z, yaw: b.yaw, t: b.t, down: b.down, base: b.base || null,
        flat: b.flat ? { level: Math.round(b.flat.level * 100) / 100, k: Math.round(b.flat.k * 100) / 100, blend: Math.round(b.flat.blend * 10) / 10 } : null,
        plinth: b.plinth ? { top: Math.round(b.plinth.top * 100) / 100, foot: Math.round(b.plinth.foot * 100) / 100, steps: b.plinth.steps, rose: Math.round(b.plinth.rose * 100) / 100 } : null, built: !!(KINDS[b.kind].phase(b).rest >= 1), open: Math.round((K.arts.get(b)?.open ?? 0) * 100) / 100 })), inside: K.world.inside(K.body.p)?.kind || null, indoor: Math.round(K.indoor * 100) / 100, eyeD: Math.round(K.eye.d * 100) / 100,
        climbing: !!K.body.climbing, wallrun: !!K.body.wallrun, place: K.place, origin: K.origin || [0, 0], aboard: !!K.aboard, seated: !!K.body.seated, on: K.body.on?.kind || null,
        ships: K.world.ships.map((sh) => ({ kind: sh.kind, p: sh.p.map((v) => Math.round(v * 100) / 100), yaw: Math.round(sh.yaw * 1000) / 1000, tilt: Math.round((sh.tilt || 0) * 1000) / 1000, bank: Math.round((sh.bank || 0) * 1000) / 1000, thr: Math.round((sh.thr || 0) * 100) / 100, jet: (sh.jet || [0, 0, -1]).map((v) => Math.round(v * 1000) / 1000), lift: Math.round((sh.lift || 0) * 100) / 100, gear: Math.round((sh.gear ?? 1) * 100) / 100, speed: Math.round(Math.hypot(...sh.v) * 100) / 100 })), depth: Math.round((K.body.depth || 0) * 100) / 100, swim: !!K.body.swim,
        ground: K.world.ground ? Math.round(K.world.ground.height(K.body.p[0], K.body.p[2]) * 100) / 100 : 0, life: K.void.life ? K.void.life.counts() : null, choice: st.building, hidden: !!K.eye.hide, eye: K.camera.position.toArray().map((v) => Math.round(v * 100) / 100) },
      fist: K.body.grip ? K.body.grip.map((v) => Math.round(v * 1000) / 1000) : null, held: K.fight.held?.() || null, hold: { carry: Math.round(HOLD.carry * 100) / 100, reach: Math.round(HOLD.reach * 100) / 100, closed: HOLD.closed },
      fight: { weapon: K.combat.weapon, bow: K.combat.bow.mode, draw: Math.round(K.combat.bow.draw * 100) / 100, bell: K.combat.bell.mode,
        thread: K.combat.thread.mode, spin: Math.round(K.combat.thread.power * 100) / 100, snare: K.combat.thread.snare, torch: K.combat.torch.mode, reach: K.combat.torch.mode === 'flame' ? Math.round(K.combat.torch.reach * 10) / 10 : 0, fires: K.combat.fires.length, flared: K.combat.flared, embers: K.combat.bolts.filter((x) => x.kind === 'ember').length, power: Math.round(K.combat.bell.power * 100) / 100, tones: K.combat.tones.length, rang: K.combat.bell.rang, ring: K.combat.ring.mode, charge: Math.round(K.combat.ring.charge * 100) / 100, guard: K.combat.guard.up, hp: Math.round(K.combat.player.hp), down: K.combat.player.down > 0, broken: K.combat.broken, turned: K.combat.turned, level: st.level, bolts: K.combat.bolts.length,
        bots: K.combat.bots.map((b) => ({ id: b.id, level: b.level, hp: b.hp, max: b.max, mode: b.mode, heat: Math.round(b.heat * 100) / 100, p: b.p.map((v) => Math.round(v * 100) / 100), over: K.world.ground ? Math.round((b.p[1] - Math.max(0, K.world.ground.height(b.p[0], b.p[2]))) * 100) / 100 : b.p[1] })), ringAt: K.combat.ring.p.map((v) => Math.round(v * 100) / 100) } } : null) };
    globalThis.Y3K.game.sky = () => K?.void?.air || null;      // the true sky itself, where it is drawn: the probes read its tables
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
    unpourBar();
    chooser?.off(); chooser = null; pose = 0; stand = null; K?.camera?.clearViewOffset();
    for (const f of offs.splice(0)) f();
    save();
    if (K?.renderer) { K.renderer.domElement.remove(); K.renderer.setSize(1, 1, false); K.void.resize(1, 1, 1); }
    root.remove(); root = null;
    document.body.classList.remove('in-void');
  }

  return { open, close, isOpen: () => !!root };
}
