// ============================================================================
// FREQUENCIES — a room where real physics is the invariant.
//
// Colin, 9 Nov 2026: "a room in y3k where real physics is the invariant ...
// physically simulate the construction of a pyramid using only sound, and
// provide all of the exact details ... so that a physicist could verify".
// Two tabs under one glyph: THE PYRAMID (the Great Pyramid, 1:1, built course
// by course by the method the dossier sets out, with every number shown) and
// THE SANDBOX (a bed of sand and horns you place, sized by their physics).
// The maths is in src/frequencies/*.mjs (pure, tested); this file only draws
// it and takes the hand. The dossier is FREQUENCIES.md.
//
// In the round (17 Nov 2026). Colin: "i'd love to see the simulation as a 3d
// environment instead of a 2d one, with ability to pan, zoom, etc. ... it
// would also be cool if we could actually hear the frequencies being played
// and see where each sound is coming from." Both scenes are drawn in three
// dimensions at their true size on one stage (src/frequencies/stage.js, which
// this file loads only when the room opens, so that it stays importable
// without three.js), and the tone is played as it reaches the camera: every
// horn and its echo in the ground, with their true phases (acoustics.mjs
// hear(), sound.js). The waves are drawn slowed, on one clock (WAVE_HZ).
//
// Renders into #home-grid like the mine does. close() is idempotent.
// ============================================================================
import { AIR, splToPa, paToSpl, particleVelocity, mouthDiameterFor, acousticPower, inputPower, THROAT_MAX_DB, intensity, shockDistance,
  thresholdSpl, levitationSpl, absorptionDbPerM, wavelength, HORN_EFFICIENCY, GRAIN, mouthSpl, pressureAt, hear, stereo } from './frequencies/acoustics.mjs';
import { createBed, computeField, step, pour, addSand, takeSand, readings, presetPair, presetLattice, presetBlock, latticePitch } from './frequencies/sand.mjs';
import { PETRIE, BASE_M, HEIGHT_M, courseTable, totals, recipeFor, RECIPE, BINDER_SOLIDS_FRACTION, SET, strengthAt, hornPlan, schedule,
  LATTICE_HZ, STONE, TOP_MEAN_M, INCH } from './frequencies/pyramid.mjs';
import { go, turn } from './frequencies/orbit.mjs';
import { createSound } from './frequencies/sound.js';
import { sunAt, clock } from './frequencies/sun.mjs';
import { EPOCH } from './frequencies/night.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 1) => (Number.isFinite(x) ? Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const sig = (x, n = 3) => (Number.isFinite(x) ? Number(Number(x).toPrecision(n)).toLocaleString('en-US') : '—');
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// A horn, from what it is asked to do: its tone sets the mouth (the cut-off rule),
// its acoustic power sets the throat (the air's 170 dB limit at the throat), and
// its length follows (an exponential flare from throat to mouth). Size-accurate.
export function hornSpec(f, acousticW) {
  const mouthDiameter = mouthDiameterFor(f);
  const throatArea = acousticW / intensity(splToPa(THROAT_MAX_DB));
  const throatDiameter = 2 * Math.sqrt(throatArea / Math.PI);
  const mouthArea = Math.PI * (mouthDiameter / 2) ** 2;
  const ratio = Math.max(mouthArea / throatArea, 1.0001);
  const mouthDb = THROAT_MAX_DB - 10 * Math.log10(ratio);
  const length = (AIR.c / (4 * Math.PI * f)) * Math.log(ratio);   // exponential horn: m = 4πf_c/c, A = A_t e^(mx)
  return { f, acousticW, inputW: inputPower(acousticW), mouthDiameter, throatDiameter, mouthDb, length, throatDb: THROAT_MAX_DB, wavelength: wavelength(f) };
}

// The drawn waves' clock, in cycles a second: the shimmer on the sand and the fronts in the air
// both run on it, so that they meet. A tone of f Hz is shown f / WAVE_HZ times slower than it is.
export const WAVE_HZ = 0.5;
const BUILD_S = 30;                       // the whole build, played in thirty seconds
const HOURS_A_YEAR = 8766;

// Where the build stands after `years` of sound: the courses finished, the course being made
// (a schedule row, or null once all are done), how much of its aggregate has arrived (0..1),
// whether it is setting (and the hours of that left), and the height of the working surface.
export function buildAt(rows, years) {
  const hours = Math.max(0, years) * HOURS_A_YEAR;
  let built = 0;
  while (built < rows.length && rows[built].cumulativeHours <= hours) built++;
  const current = built < rows.length ? rows[built] : null;
  const into = hours - (built ? rows[built - 1].cumulativeHours : 0);
  const part = current ? clamp(into / current.moveHours, 0, 1) : 1;
  const setting = !!current && into > current.moveHours;
  const top = current ? current.bottom + current.thickness * part : built ? rows[built - 1].top : 0;
  return { built, current, part, setting, setLeft: setting ? Math.max(0, current.hours - into) : 0, top };
}

// The working course's horns as the plan sets them (FREQUENCIES.md §5): shoulder to shoulder
// along its four edges, as many on each as fit at the plan's spacing (the course's count, to
// within four; mouths never overlap), mouths just outside the edge and half a metre above the
// working surface, aimed straight across it and a little down (hornPlan's own line). x and y
// are metres from the pyramid's axis; z is above the surface.
export function courseHorns(row, plan) {
  const n = Math.max(1, Math.floor(row.side / plan.spacing + 1e-9)), out = [], edge = row.side / 2 + 0.1;
  for (const [ax, ay] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * row.side;
    out.push({ x: ax ? ax * edge : t, y: ay ? ay * edge : t, z: 0.5, aimX: -ax, aimY: -ay, aimZ: -0.3, mouthDb: plan.mouthDb, mouthDiameter: plan.mouthDiameter, phase: 0 });
  }
  return out;
}

const ICON = {
  tour: '<ellipse cx="12" cy="13.5" rx="8.4" ry="3.6"/><path d="M16.4 9.6l3 .9-1.2 2.7"/><path d="M12 4.6v5.2"/><circle cx="12" cy="4.2" r="0.6"/>',
  reset: '<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.25M4.6 4.4v4.2h4.2"/>',
  above: '<path d="M12 3.4v6.2M9.3 7 12 9.7 14.7 7M4 15.3l8-3.7 8 3.7-8 3.7z"/>',
  out: '<path d="M6 12h12"/>',
  in: '<path d="M12 6v12M6 12h12"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const VIEWS = [['tour', 'turn slowly around (a touch stops it)'], ['reset', 'back to the first view (0)'], ['above', 'look straight down'], ['out', 'farther (−)'], ['in', 'nearer (+)'], ['full', 'fill the screen (f)']];
const PYR_GO = [['whole', 'the whole'], ['course', 'the working course'], ['horns', 'beside the horns'], ['foot', 'from the foot']];
const TOOLS = [['look', 'the eye', 'drag to turn the view; tap a horn to hear it alone'], ['horn', 'place a horn', 'click the bed to place a horn; drag to aim it'],
  ['pour', 'pour binder', 'click the bed to pour a 1.27 m round of binder paste'], ['sand', 'tip sand', 'click or drag to tip sand'], ['erase', 'take away', 'click a horn to remove it, or the bed to dig']];
const SHOWS = [['sand', 'the sand'], ['spl', 'the level'], ['wind', 'the wind']];
const PRESETS = [['pair', 'a pair'], ['lattice', 'the lattice'], ['block', 'a block’s lattice'], ['clear', 'clear']];
const PYR_TILES = [['year', 'year'], ['course', 'course'], ['height', 'height built'], ['side', 'its side'], ['blocks', 'its blocks'],
  ['stone', 'its stone'], ['horns', 'its horns'], ['power', 'power in'], ['carry', 'to carry in'], ['set', 'to set']];
const SAND_TILES = [['tone', 'tone'], ['horns', 'horns'], ['loudest', 'loudest on the bed'], ['wind', 'surface wind'], ['moving', 'moving'],
  ['displaced', 'displaced'], ['time', 'sound so far'], ['ridges', 'ridges'], ['packing', 'packing'], ['binder', 'binder']];
const tilesHtml = (list) => list.map(([k, say]) => `<div class="freq-stat" data-stat="${k}"><span class="freq-k">${say}</span><b>—</b><small></small></div>`).join('');
const RADIUS = { pour: 0.635, sand: 0.5, erase: 0.3 };
// the sand's colour scales, as paint() in sandbox3d.js lays them (sRGB bytes)
const SPL_STOPS = [0, 0.25, 0.5, 0.75, 1].map((t) => [t, 20 + 235 * t, 24 + 160 * t * t, 60 + 60 * (1 - t)]);
const WIND_STOPS = [[0, 30, 50, 90], [0.333, 30, 90, 137], [0.334, 123, 160, 40], [1, 250, 240, 40]];
const gradient = (stops) => `linear-gradient(90deg, ${stops.map(([t, r, g, b]) => `rgb(${r | 0}, ${g | 0}, ${b | 0}) ${(t * 100).toFixed(1)}%`).join(', ')})`;

export function createFrequencies({ toast } = {}) {
  let grid = null, root = null, host = null, body = null, tab = 'pyramid', refs = {}, loadId = 0;
  // the sandbox
  let bed = null, horns = [], f = Math.round(LATTICE_HZ), powerW = 5000, tool = 'look', playing = false, speed = 10, show = 'sand';
  let spec = hornSpec(f, powerW), solo = -1, soloP = null, hearing = true, drag = null, lat = null, lastLat = 0, lastField = 0;
  let fieldDirty = true, hornsDirty = true, reliefDirty = true, paintDirty = true, soloDirty = true;
  // the pyramid
  let years = 2.2, pyrPlaying = false, pyrSound = false, rowShown = null, rowHorns = [], follow = false, tip = null;     // it opens with the method at work: about a third of the way up
  let sunHours = 8.25;               // …on a November morning, a quarter past eight by the sun (sun.mjs)
  const SUN_FROM = 0, SUN_TO = 24;     // the whole day and the night either side of it
  // both
  let tau = 0, volume = 0.4, heardDb = null, lastTiles = 0, forceTiles = true, stage = null, sand = null, pyr = null, failed = '', sound = null;
  let tour = false, lit = false, litN = 0, each = new Float32Array(1280), glowW = new Float32Array(1280), gainsNow = [0, 0, 0, 0];
  const plan = hornPlan({ mouthDb: 160 });
  const sched = schedule(plan);
  const rows = courseTable();
  const tot = totals(rows);

  function open(g) {
    if (root && root.isConnected) return;
    grid = g;
    if (!bed) bed = createBed({ width: 12, depth: 8, cell: 0.05 });
    if (!sound) { sound = createSound(); sound.volume(volume); }
    grid.innerHTML = '';
    root = document.createElement('div');
    root.className = 'freq-root';
    root.innerHTML = `
      <header class="freq-head">
        <div class="shaft-tabs freq-tabs" role="tablist" aria-label="frequencies">
          <button type="button" class="login-alt" role="tab" aria-selected="false" data-tab="pyramid">the pyramid</button>
          <button type="button" class="login-alt" role="tab" aria-selected="false" data-tab="sandbox">the sandbox</button>
        </div>
        <span class="muted shaft-lex">real physics is the invariant · <a href="https://github.com/colinbiorio/y3k/blob/main/FREQUENCIES.md" target="_blank" rel="noopener">the dossier</a></span>
      </header>
      <div class="freq-stage" data-tool="look">
        <div class="freq-hud freq-tl"><div class="freq-kick" data-hud="kick"></div><div class="freq-line" data-hud="line"></div></div>
        <div class="freq-hud freq-tr">${VIEWS.map(([k, say]) => `<button type="button" class="freq-icon" data-view="${k}" aria-label="${say}" title="${say}">${icon(k)}</button>`).join('')}</div>
        <div class="freq-hud freq-solo" data-hud="solo" hidden><span data-hud="solo-say"></span><button type="button" class="freq-pill-btn" data-act="all">all horns</button></div>
        <div class="freq-hud freq-bl">
          <div class="freq-scale" title="at the point looked at"><i data-hud="scale-bar"></i><span data-hud="scale-say"></span></div>
          <div class="freq-legend" data-hud="legend" hidden><span class="freq-k" data-hud="legend-say"></span><i data-hud="legend-bar"></i><span class="freq-ends"><span data-hud="legend-lo"></span><span data-hud="legend-hi"></span></span></div>
          <div class="freq-line" data-hud="slow"></div>
          <div class="freq-help">drag to turn · shift- or right-drag to slide · click, then scroll, or pinch to zoom · double-click to centre</div>
        </div>
        <div class="freq-hud freq-br"><div class="freq-ear"><canvas class="freq-scope" data-hud="scope" width="192" height="52" hidden title="left (blue) and right (amber), as played, slowed"></canvas><div class="freq-ear-say"><span class="freq-k">at your ear</span><b data-hud="ear">sound off</b></div></div></div>
        <div class="freq-wait" data-hud="wait"><span>drawing the room…</span></div>
      </div>
      <div class="freq-body"></div>`;
    grid.appendChild(root);
    host = root.querySelector('.freq-stage');
    body = root.querySelector('.freq-body');
    for (const e of root.querySelectorAll('[data-hud]')) refs[e.dataset.hud] = e;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    if (typeof window !== 'undefined' && window.Y3K) window.Y3K.frequencies = { read, screenOf: (p) => stage?.screenOf(p) || null, aim };
    load();
    render();
  }

  // the stage and its two scenes, loaded when the room first opens (three.js stays out of the site's first load)
  function load() {
    const my = ++loadId;
    import('./frequencies/stage.js').then((m) => {
      if (my !== loadId || !root) return;
      try {
        stage = m.createStage(host, { frame, hand });
        sand = m.createSandScene(stage, bed);
        pyr = m.createPyramidScene(stage, { rows: sched.rows, spec: hornSpec(LATTICE_HZ, plan.acoustic), reach: shockDistance(plan.surfaceDb, LATTICE_HZ), hours: sunHours });
      } catch (e) { try { stage?.dispose(); } catch { /* half made */ } stage = sand = pyr = null; throw e; }
      stage.use(tab === 'pyramid' ? pyr : sand);
      refs.wait.hidden = true;
      host.classList.add('ready');
      hornsDirty = reliefDirty = paintDirty = soloDirty = true; forceTiles = true; rowShown = null;
      kick();
    }).catch((e) => {
      if (my !== loadId || !root) return;
      failed = String(e?.message || e).slice(0, 160);
      refs.wait.innerHTML = `<span>This screen could not start the 3D stage (${esc(failed)}). The numbers below still hold, and the sound still plays.</span>`;
      kick();
    });
  }

  function close() {
    loadId++;
    quiet();
    try { stage?.dispose(); } catch { /* already gone */ }
    stage = sand = pyr = null;
    sound?.close(); sound = null;
    if (fbRaf) cancelAnimationFrame(fbRaf);
    fbRaf = 0;
    root?.remove();
    root = host = body = null; refs = {};
  }

  // everything that sounds or runs, stopped (a tab change, or leaving the room)
  function quiet() {
    playing = pyrPlaying = pyrSound = tour = follow = false; drag = null; solo = -1;
    if (tip) tip.on = false;
    shine(-1);
    sound?.stop();
    if (sand) { sand.plain = false; sand.cursor(null); }
  }

  // one frame: the stage asks for it; with no stage (no WebGL), the room keeps its own
  let fbRaf = 0, fbLast = 0;
  function kick() {
    if (stage) { stage.mark(); return; }
    if (fbRaf || !root) return;
    fbRaf = requestAnimationFrame(function run(now) {
      fbRaf = 0;
      if (!root || stage) return;
      const dt = fbLast ? Math.min((now - fbLast) / 1000, 0.1) : 1 / 60;
      fbLast = now;
      if (frame(now, dt)) fbRaf = requestAnimationFrame(run); else fbLast = 0;
    });
  }

  function render() {
    if (!root) return;
    for (const b of root.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    host.dataset.scene = tab;
    body.innerHTML = tab === 'pyramid' ? pyramidHtml() : sandboxHtml();
    refs.stats = {};
    for (const e of body.querySelectorAll('[data-stat]')) refs.stats[e.dataset.stat] = { v: e.querySelector('b'), s: e.querySelector('small') };
    refs.read = body.querySelector('[data-read="pyr"], [data-read="sand"]');
    refs.horns = body.querySelector('[data-read="horns"]');
    refs.years = body.querySelector('.freq-years');
    if (tab === 'sandbox') renderHorns();
    if (stage) stage.use(tab === 'pyramid' ? pyr : sand);
    hornsDirty = reliefDirty = paintDirty = soloDirty = true; forceTiles = true;
    sync(); kick();
  }

  function pyramidHtml() {
    const r = recipeFor(STONE.typicalBlockT * 1000);
    return `
      <section class="freq-panel" aria-label="the build">
        <div class="freq-bar">
          <div class="freq-group" role="group" aria-label="the build">
            <span class="freq-cap">the build</span>
            <button type="button" class="btn small freq-go" data-act="pyr-play">build</button>
            <input type="range" class="freq-years" min="0" max="${sched.years.toFixed(2)}" step="0.01" value="${years}" aria-label="years into the build" />
          </div>
          <div class="freq-group" role="group" aria-label="the sun">
            <span class="freq-cap">the sun</span>
            <input type="range" class="freq-sun" min="${SUN_FROM}" max="${SUN_TO}" step="0.05" value="${sunHours}" aria-label="the hour of the day, by the sun" />
            <span class="freq-sunsay" data-read="sun" title="the hour by the sun at Giza on 17 November, and how high the sun stands; at night, the stars as they stood in Khufu's reign">${sunSay()}</span>
          </div>
          <div class="freq-group" role="group" aria-label="the sound">
            <span class="freq-cap">the sound</span>
            <button type="button" class="disc-chip" data-act="pyr-sound">sound on</button>
            <input type="range" class="freq-vol" min="0" max="1" step="0.01" value="${volume}" aria-label="volume" />
          </div>
          <div class="freq-group" role="group" aria-label="go to">
            <span class="freq-cap">go to</span>
            ${PYR_GO.map(([k, say]) => `<button type="button" class="disc-chip" data-go="${k}">${say}</button>`).join('')}
            <button type="button" class="disc-chip" data-act="follow" aria-pressed="false" title="the eye rises with the course being made">follow the course</button>
          </div>
        </div>
        <div class="freq-stats">${tilesHtml(PYR_TILES)}</div>
        <p class="freq-read" data-read="pyr"></p>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>The Great Pyramid, 1:1, built by sound: what the physics allows</h4>
        <p class="muted">Petrie's survey is the pyramid: a base of <b>${fmt(BASE_M, 2)} m</b> (9068.8 in), an original height of <b>${fmt(HEIGHT_M, 2)} m</b> (5776 in), a face at <b>51° 52′</b>, and the level of every one of the <b>${PETRIE.courses} surviving courses</b> (his Plate 8; the first is ${fmt(58.6 * INCH, 2)} m thick, the 35th ${fmt(49.8 * INCH, 2)} m, the thinnest ${fmt(19.7 * INCH, 2)} m). From it: <b>${sig(tot.volume / 1e6, 3)} million m³</b> of stone, about <b>${sig(tot.mass / 1e9, 3)} million tonnes</b> at 2.3 t/m³, in about <b>${sig(tot.blocks / 1e6, 3)} million blocks</b> on a 1.27 m plan module. Nothing in this room lifts a block. Sound cannot: to hold a grain of stone against gravity in a standing wave takes <b>${fmt(levitationSpl(20000), 0)} dB</b> at 20 kHz and <b>${fmt(levitationSpl(LATTICE_HZ), 0)} dB</b> at the block-scale tone, past the ${THROAT_MAX_DB} dB at which air itself shocks. What sound can do, and this room does, is <b>move grains along the ground, heap them in a square lattice, pack them, and leave the binder to set</b>.</p>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>The method, in the numbers a physicist would check</h4>
        <ol class="freq-list freq-cards muted">
          <li><b>The tone.</b> Opposed horns make a standing wave; on the ground the grains gather where the air is still, every half wavelength (Kundt, 1866). For the block module of 1.27 m: <b>f = c / 2·1.27 m = ${fmt(LATTICE_HZ, 1)} Hz</b>, λ = ${fmt(wavelength(LATTICE_HZ), 2)} m. Two pairs crossed lay a square lattice at the block pitch: the sand is both mould and block. The sandbox's "a block's lattice" shows it: lines of horns on four sides at 155 dB lay ridges 1.3 m apart in five minutes of sound.</li>
          <li><b>The horns.</b> Mouth circumference one wavelength at the tone (Olson, Beranek): <b>${fmt(plan.mouthDiameter * 100, 0)} cm</b> across. They stand shoulder to shoulder along the working course's edge, ${fmt(plan.spacing, 2)} m apart, mouths 0.5 m above the bed, aimed across it; each is driven to <b>${plan.mouthDb} dB at the mouth</b> (${sig(plan.acoustic / 1e3, 3)} kW acoustic, ~${sig(plan.input / 1e3, 3)} kW in at ${HORN_EFFICIENCY * 100} % efficiency; the throat at ${THROAT_MAX_DB} dB, the air's limit). The coherent line gives <b>${fmt(plan.surfaceDb, 1)} dB</b> at the bed one metre out: a surface air speed of ${sig(plan.uSurface, 3)} m/s rms, where a 0.25 mm limestone grain needs ${sig(2 * particleVelocity(splToPa(plan.thresholdDb)), 3)} m/s to move (incident ${fmt(plan.thresholdDb, 1)} dB).</li>
          <li><b>The rate.</b> Bagnold's law for sand carried by wind, at the effective friction velocity u* = u/8: <b>${sig(plan.flux * 1000, 3)} g per metre of front per second</b>. The first course (${fmt(rows[0].side, 1)} m a side, ${fmt(4 * rows[0].side, 0)} m of front, ${sched.rows[0].horns} horns, ${sig(sched.rows[0].inputMW, 3)} MW in) takes ${fmt(sched.rows[0].moveHours, 0)} hours to carry in and ${fmt(sched.rows[0].setHours, 0)} hours to set. All ${rows.length} courses: <b>${sig(sched.years, 3)} years</b> of continuous sound.</li>
          <li><b>The stone.</b> Davidovits' re-agglomerated limestone, as he made it in 2006: per <b>${fmt(RECIPE.limestone, 0)} kg</b> of nummulitic limestone gently disaggregated in water, <b>${RECIPE.kaolinite} kg kaolinitic clay</b> (Giza's limestone carries its own), <b>${RECIPE.natron} kg natron</b> (Na₂CO₃), <b>${RECIPE.lime} kg slaked lime</b>, <b>${RECIPE.water} L water</b>; 18–20 % water stays in the set stone. Na₂CO₃ + Ca(OH)₂ → 2 NaOH + CaCO₃; NaOH with kaolinite → hydrosodalite and calcite. Binder solids ${fmt(BINDER_SOLIDS_FRACTION * 100, 2)} %. One 2.5 t block: ${fmt(r.limestone, 0)} kg limestone, ${fmt(r.kaolinite, 0)} kg clay, ${fmt(r.natron, 0)} kg natron, ${fmt(r.lime, 0)} kg lime, ${fmt(r.water, 0)} L water. The whole pyramid: ${sig(tot.mass * (RECIPE.natron / 4800) / 1e6, 3)} kt of natron, ${sig(tot.mass * (RECIPE.lime / 4800) / 1e6, 3)} kt of lime, ${sig(tot.mass * (RECIPE.water / 4800) / 1e9, 3)} million tonnes of water.</li>
          <li><b>The set.</b> Strength S(t) = ${SET.strengthMPa} MPa · (1 − e^(−t/${SET.tauHours} h)): walkable (${SET.walkableMPa} MPa) after ${fmt(-SET.tauHours * Math.log(1 - SET.walkableMPa / SET.strengthMPa), 0)} h, 90 % after ${fmt(-SET.tauHours * Math.log(0.1), 0)} h. The same horns' pressure on the bed (Γ = ${sig(2 * Math.SQRT2 * splToPa(plan.surfaceDb) / (GRAIN.calcite * 0.56 * 0.1 * 9.80665), 2)} g on the top 10 cm) packs the mix toward 0.64 before it sets.</li>
          <li><b>What sound does not do here.</b> It does not lift anything, and it does not climb: the grains, the water and the natron must be brought to the working course by other means (${sig(tot.mass / 1e9, 2)} million tonnes of them). It does not cut a casing joint of half a millimetre. And a tone this loud shocks ${fmt(shockDistance(plan.surfaceDb, LATTICE_HZ), 1)} m out, so each horn's work is within a few metres of it. The dossier says what is measured (T-I), what is our derivation (T-II), and what is hypothesis (T-III).</li>
        </ol>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>What you see and hear</h4>
        <ul class="freq-notes muted">
          <li><b>What is drawn</b> is Petrie's pyramid at its true size: every course its own thickness and side, its blocks on the 1.27 m module, lit by a low sun; the faint outline is the finished pyramid, and the figure at its corner is 1.75 m tall.</li>
          <li><b>The horns</b> stand shoulder to shoulder around the course being made, each at its true size, half a metre above the surface as it rises. The fronts leaving each line of horns are drawn ${fmt(LATTICE_HZ / WAVE_HZ, 0)} times slowed and fade within about ${fmt(shockDistance(plan.surfaceDb, LATTICE_HZ), 0)} m, where the tone shocks; the pattern breathing on the course is the plan's lattice (two crossed standing waves, nodes a block apart), drawn where that sound reaches. It is the plan, not a field solved for a thousand horns.</li>
          <li><b>What you hear</b> with the sound on is the working course's horns where the camera stands, every one with its true phase, scaled as in the sandbox (every 20 dB of the field is 10 dB at your speakers). They are played throughout, also while a course sets, when in the plan they would rest, so a paused build is never mute. The pyramid's body does not shadow the sound, and below the working course the room mirrors your height above it.</li>
          <li><b>Where the sound comes from:</b> while it sounds, each horn's mouth glows as much of what you hear is its own (its pressure at the camera over the loudest one's, to the power 1.5, so that the ones that carry the sound stand out). Stand behind a line of horns and its nearest are dim: they face away, and the line across the course, facing you, carries more. The scope beside the level draws the two channels as they are played, slowed.</li>
          <li><b>Follow the course</b> lifts the point you look at with the working surface as it rises; point at any course to read its number, its size and the year it was done.</li>
          <li><b>The build</b> plays the ${sig(sched.years, 3)} years of sound in ${BUILD_S} seconds; drag the years to go anywhere in it.</li>
        </ul>
      </section>`;
  }

  function sandboxHtml() {
    return `
      <section class="freq-panel" aria-label="the sandbox">
        <div class="freq-bar">
          <div class="freq-group" role="group" aria-label="the sound">
            <span class="freq-cap">the sound</span>
            <button type="button" class="btn small freq-go" data-act="play">sound on</button>
            <button type="button" class="disc-chip" data-act="hear" aria-pressed="true" title="play the tone where the camera stands">hear it</button>
            <input type="range" class="freq-vol" min="0" max="1" step="0.01" value="${volume}" aria-label="volume" />
          </div>
          <div class="freq-group" role="group" aria-label="the tone">
            <span class="freq-cap">the tone</span>
            <label class="freq-ctl"><input type="number" class="freq-f" min="20" max="20000" step="1" value="${f}" aria-label="tone, hertz" /> Hz</label>
            <label class="freq-ctl"><input type="number" class="freq-w" min="100" max="100000" step="100" value="${powerW}" aria-label="acoustic power, watts" /> W</label>
          </div>
          <div class="freq-group" role="group" aria-label="time speed">
            <span class="freq-cap">time</span>
            ${[1, 10, 60, 600].map((s) => `<button type="button" class="disc-chip" data-speed="${s}" aria-pressed="false">×${s}</button>`).join('')}
          </div>
          <div class="freq-group" role="group" aria-label="the hand">
            <span class="freq-cap">the hand</span>
            ${TOOLS.map(([k, say, title]) => `<button type="button" class="disc-chip" data-tool="${k}" aria-pressed="false" title="${title}">${say}</button>`).join('')}
          </div>
          <div class="freq-group" role="group" aria-label="colour by">
            <span class="freq-cap">colour by</span>
            ${SHOWS.map(([k, say]) => `<button type="button" class="disc-chip" data-show="${k}" aria-pressed="false">${say}</button>`).join('')}
          </div>
          <div class="freq-group" role="group" aria-label="arrangements">
            <span class="freq-cap">arrange</span>
            ${PRESETS.map(([k, say]) => `<button type="button" class="disc-chip" data-preset="${k}">${say}</button>`).join('')}
          </div>
        </div>
        <div class="freq-stats">${tilesHtml(SAND_TILES)}</div>
        <p class="freq-read muted freq-small" data-read="sand"></p>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>The horns on the bed</h4>
        <div data-read="horns"></div>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>What you see and hear</h4>
        <ul class="freq-notes muted">
          <li><b>What is drawn</b> is the model's own field at 1:1. The sand's colour is its height, damp or set (or, if you choose, the sound's level or the wind it makes at the surface); its shimmer is the pressure itself rising and falling, and the rings leaving each horn are its wavefronts, one wavelength apart.</li>
          <li><b>Slowed.</b> The waves are drawn at half a cycle a second, ${fmt(f / WAVE_HZ, 0)} times slower than the tone, so the eye can follow them; the sand moves at the speed you choose.</li>
          <li><b>What you hear</b> is the tone where the camera stands: every horn and its echo in the ground, added with their true phases, so where they cancel it goes quiet and where they meet it swells. Turn, and the sound turns with you.</li>
          <li><b>Conventions, not physics:</b> where a horn sits between your speakers is placed as a stereo recording places an instrument (no head is modelled), and the level is scaled for speakers: every 20 dB of the field is 10 dB at them, and 170 dB, where air itself shocks, is full volume. Low tones play faintly on small speakers; headphones tell it best.</li>
          <li><b>Where the sound comes from:</b> while it sounds, each horn's mouth glows as much of what you hear is its own (its pressure at the camera over the loudest one's, to the power 1.5, so that the ones that carry the sound stand out); a horn facing away is dim even near you. The scope beside the level draws the two channels as they are played, slowed.</li>
          <li><b>One horn alone.</b> With the eye chosen, tap a horn (or its number above) to hear only it and see only its waves; the sand still feels every horn.</li>
          <li><b>Drawn, not derived:</b> the driver behind each throat, the posts, and the glass tray (the sound takes no echo from it). Below about 110 Hz a mouth is wider than its half-metre mount and dips into the bed; the model treats each horn as a point at its mouth's centre.</li>
        </ul>
      </section>`;
  }

  function renderHorns() {
    if (!refs.horns) return;
    if (!horns.length) {
      refs.horns.innerHTML = `<p class="muted freq-small">none yet: pick "place a horn" and click the bed, or choose an arrangement. A horn is sized by its physics: the tone sets its mouth (circumference = λ), the power sets its throat (the air's ${THROAT_MAX_DB} dB limit), the flare follows.</p>`;
      return;
    }
    const deg = (h) => fmt((Math.atan2(h.aimY, h.aimX) * 180) / Math.PI, 0);
    refs.horns.innerHTML = `
      <p class="freq-spec">Every horn: ${fmt(f, 0)} Hz, cut-off ${fmt(f, 0)} Hz → mouth <b>${fmt(spec.mouthDiameter * 100, 0)} cm</b>, throat ${fmt(spec.throatDiameter * 100, 1)} cm at ${THROAT_MAX_DB} dB, flare ${fmt(spec.length * 100, 0)} cm long · <b>${fmt(spec.mouthDb, 1)} dB at the mouth</b> · ${sig(spec.acousticW / 1000, 3)} kW acoustic, ${sig(spec.inputW / 1000, 3)} kW in · shocks at ${fmt(shockDistance(spec.mouthDb, f), 1)} m · air absorption ${sig(absorptionDbPerM(f) * 1000, 2)} dB/km · mouths 0.5 m up.</p>
      <div class="freq-chips" role="group" aria-label="hear one horn alone">${horns.map((h, i) => `<button type="button" class="disc-chip freq-hornchip" data-horn="${i}" aria-pressed="false" title="hear horn ${i + 1} alone"><b>${i + 1}</b> ${fmt(h.x, 1)}, ${fmt(h.y, 1)} m · ${deg(h)}°</button>`).join('')}</div>`;
  }

  // the buttons' words and states, the solo pill, the colour legend
  function sync() {
    if (!root) return;
    const q = (s) => body.querySelector(s);
    const press = (b, on) => { if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
    if (tab === 'pyramid') {
      const p = q('[data-act="pyr-play"]');
      if (p) p.textContent = pyrPlaying ? 'pause' : years >= sched.years - 1e-6 ? 'build again' : years > 0 ? 'go on' : 'build';
      const s = q('[data-act="pyr-sound"]');
      if (s) { s.textContent = pyrSound ? 'sound off' : 'sound on'; s.classList.toggle('on', pyrSound); }
      press(q('[data-act="follow"]'), follow);
    } else {
      const p = q('[data-act="play"]');
      if (p) p.textContent = playing ? 'pause' : 'sound on';
      press(q('[data-act="hear"]'), hearing);
      for (const b of body.querySelectorAll('[data-tool]')) press(b, b.dataset.tool === tool);
      for (const b of body.querySelectorAll('[data-show]')) press(b, b.dataset.show === show);
      for (const b of body.querySelectorAll('[data-speed]')) press(b, Number(b.dataset.speed) === speed);
      for (const b of body.querySelectorAll('[data-horn]')) press(b, Number(b.dataset.horn) === solo);
    }
    const tb = root.querySelector('[data-view="tour"]');
    if (tb) { tb.classList.toggle('on', tour); tb.setAttribute('aria-pressed', String(tour)); }
    refs.solo.hidden = !(tab === 'sandbox' && solo >= 0);
    if (solo >= 0) refs['solo-say'].innerHTML = `horn <b>${solo + 1}</b> alone: its sound and its waves`;
    host.dataset.tool = tab === 'sandbox' ? tool : 'look';
    const leg = tab === 'sandbox' && show !== 'sand';
    refs.legend.hidden = !leg;
    if (leg) {
      refs['legend-say'].textContent = show === 'spl' ? 'the level on the bed' : 'the wind at the surface';
      refs['legend-bar'].style.background = gradient(show === 'spl' ? SPL_STOPS : WIND_STOPS);
      refs['legend-lo'].textContent = show === 'spl' ? '110 dB' : '0';
      refs['legend-hi'].textContent = show === 'spl' ? '170 dB' : `${sig(3 * bed.uT, 2)} m/s (a grain moves at ${sig(bed.uT, 2)})`;
    }
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || !root || !root.contains(b)) return;
    const d = b.dataset;
    if (d.tab) { if (d.tab !== tab) { quiet(); tab = d.tab; render(); } return; }
    if (d.view === 'tour') { tour = !tour; sync(); kick(); return; }
    if (d.view) { stage?.view(d.view); return; }
    if (d.go) { goTo(d.go); return; }
    if (d.tool) { tool = d.tool; sand?.cursor(null); if (stage) stage.canvas.style.cursor = ''; sync(); kick(); return; }
    if (d.show) { show = d.show; paintDirty = true; sync(); kick(); return; }
    if (d.speed) { speed = Number(d.speed) || 10; forceTiles = true; sync(); kick(); return; }
    if (d.preset) { preset(d.preset); return; }
    if (d.horn) { const i = Number(d.horn); setSolo(solo === i ? -1 : i); return; }
    if (d.act === 'play') {
      playing = !playing;
      if (playing && hearing) startSound(f); else if (!playing) sound?.stop();
      paintDirty = true; forceTiles = true; sync(); kick();
    } else if (d.act === 'hear') {
      hearing = !hearing;
      if (playing && hearing) startSound(f); else sound?.stop();
      sync(); kick();
    } else if (d.act === 'pyr-play') {
      if (!pyrPlaying && years >= sched.years - 1e-6) years = 0;
      pyrPlaying = !pyrPlaying; forceTiles = true; sync(); kick();
    } else if (d.act === 'pyr-sound') {
      pyrSound = !pyrSound;
      if (pyrSound) startSound(LATTICE_HZ); else sound?.stop();
      sync(); kick();
    } else if (d.act === 'follow') { follow = !follow; sync(); kick(); }
    else if (d.act === 'all') setSolo(-1);
  }
  // only from inside a click: browsers let sound begin then and not before
  function startSound(hz) {
    if (!sound) return;
    sound.volume(volume);
    if (!sound.start(hz)) toast?.('this browser cannot play sound here; the numbers still hold');
  }
  function onInput(ev) {
    const t = ev.target;
    if (t.classList.contains('freq-years')) { years = clamp(Number(t.value) || 0, 0, sched.years); forceTiles = true; sync(); kick(); }
    else if (t.classList.contains('freq-sun')) {
      sunHours = clamp(Number(t.value) || sunHours, SUN_FROM, SUN_TO);
      if (tab === 'pyramid') pyr?.sky(sunHours);
      const say = body?.querySelector('[data-read="sun"]'); if (say) say.textContent = sunSay();
    }
    else if (t.classList.contains('freq-vol')) { volume = clamp(Number(t.value), 0, 1); sound?.volume(volume); }
  }
  function onChange(ev) {
    const t = ev.target;
    if (t.classList.contains('freq-f')) { f = Math.max(20, Math.min(20000, Number(t.value) || f)); t.value = f; retune(); }
    else if (t.classList.contains('freq-w')) { powerW = Math.max(100, Math.min(100000, Number(t.value) || powerW)); t.value = powerW; retune(); }
  }
  function retune() {
    spec = hornSpec(f, powerW);
    for (const h of horns) { h.mouthDiameter = spec.mouthDiameter; h.mouthDb = spec.mouthDb; }
    sound?.tone(f);
    changed(); renderHorns(); sync();
  }
  function changed() { fieldDirty = hornsDirty = paintDirty = soloDirty = true; forceTiles = true; kick(); }

  function preset(p) {
    if (p === 'clear') { horns = []; bed = createBed({ width: 12, depth: 8, cell: 0.05 }); sand?.bed(bed); reliefDirty = true; }
    else if (p === 'pair') horns = presetPair(bed, { f, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter });
    else if (p === 'lattice') horns = presetLattice(bed, { f, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter });
    else if (p === 'block') {
      f = Math.round(LATTICE_HZ); powerW = 1600; spec = hornSpec(f, powerW);
      const fi = body.querySelector('.freq-f'), wi = body.querySelector('.freq-w');
      if (fi) fi.value = f;
      if (wi) wi.value = powerW;
      horns = presetBlock(bed, { mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter });
      sound?.tone(f);
      toast?.(`${horns.length} horns at ${f} Hz, ${fmt(spec.mouthDb, 0)} dB at the mouth: sound on, and watch the ridges come at the block pitch`);
    }
    solo = -1; lat = null;
    changed(); renderHorns(); sync();
  }

  function setSolo(i) { solo = i; soloDirty = hornsDirty = paintDirty = true; sync(); kick(); }

  // ---------------------------------------------------------------- the hand on the sandbox (the stage offers every press here first)
  const hand = {
    down(hit, ev) {
      if (tab !== 'sandbox' || tool === 'look' || ev.button !== 0 || ev.shiftKey || !hit || (hit.on !== 'bed' && hit.on !== 'horn')) return false;
      if (tool === 'erase' && hit.on === 'horn') { removeHorn(hit.horn); drag = null; return true; }
      if (tool === 'horn') {
        let i = hit.on === 'horn' ? hit.horn : -1;
        if (i < 0) { horns.push(newHorn(hit.x, hit.y)); i = horns.length - 1; renderHorns(); sync(); }
        drag = { tool, horn: i };
        if (sand) sand.plain = true;               // while aiming, the ray passes through horns to the bed
        changed();
        return true;
      }
      if (hit.on !== 'bed') return false;
      act(tool, hit.x, hit.y);
      drag = { tool, last: [hit.x, hit.y] };
      return true;
    },
    move(hit) {
      if (!drag || !hit || hit.on === 'ground') return;
      if (drag.tool === 'horn') { aim(horns[drag.horn], hit.x, hit.y); changed(); }
      else if (drag.tool !== 'pour' && Math.hypot(hit.x - drag.last[0], hit.y - drag.last[1]) >= 0.25) { act(drag.tool, hit.x, hit.y); drag.last = [hit.x, hit.y]; }
      cursorAt(hit);
    },
    up() {
      if (!drag) return;
      const was = drag.tool;
      drag = null;
      if (sand) sand.plain = false;
      if (was === 'horn') { fieldDirty = true; renderHorns(); sync(); }
      kick();
    },
    tap(hit) { if (tab === 'sandbox' && tool === 'look' && hit?.on === 'horn') setSolo(solo === hit.horn ? -1 : hit.horn); else if (tab === 'pyramid') courseAt(hit); },
    touch() { if (tour) { tour = false; sync(); } },             // a hand on the stage ends the tour
    hover(hit) { cursorAt(hit); courseAt(hit); },
  };
  // the course under the pointer, on the pyramid: its number, its size, and when it was done
  function courseAt(hit) {
    if (!pyr || !stage) return;
    if (!tip) tip = stage.label(pyr.labels, 'tip');
    const p = tab === 'pyramid' && hit?.point, b = p ? buildAt(sched.rows, years) : null;
    const row = p && p[1] > 0.01 && p[1] <= b.top + 0.01 ? sched.rows.find((r) => r.bottom <= p[1] && p[1] < r.bottom + r.thickness + 1e-6) : null;
    if (!row || (row.cumulativeHours > years * 8766 && row !== b.current)) { if (tip.on) { tip.on = false; stage.mark(); } return; }
    const done = row.cumulativeHours <= years * 8766;
    tip.say(`course ${row.course}: ${fmt(row.thickness, 2)} m thick, ${fmt(row.side, 1)} m a side, ${fmt(row.blocks, 0)} blocks · ${done ? `done in year ${fmt(row.cumulativeHours / 8766, 2)}` : 'being made'}`);
    tip.pos.set(p[0], p[1] + 1.2, p[2]); tip.on = true;
    stage.mark();
  }
  function newHorn(x, y) {
    const dx = bed.width / 2 - x, dy = bed.depth / 2 - y, L = Math.hypot(dx, dy);
    return { x, y, z: 0.5, aimX: L > 0.15 ? dx / L : 1, aimY: L > 0.15 ? dy / L : 0, aimZ: -0.25, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter, phase: 0 };
  }
  function aim(h, x, y) {
    if (!h) return;
    const dx = x - h.x, dy = y - h.y, L = Math.hypot(dx, dy);
    if (L > 0.15) { h.aimX = dx / L; h.aimY = dy / L; }
  }
  function removeHorn(i) {
    horns.splice(i, 1);
    if (solo === i) solo = -1; else if (solo > i) solo--;
    changed(); renderHorns(); sync();
  }
  function act(t, x, y) {
    if (t === 'pour') {
      pour(bed, x, y, 0.635);
      toast?.(`binder paste poured: a 1.27 m round, the block module; it sets over ${-SET.tauHours * Math.log(1 - SET.walkableMPa / SET.strengthMPa) | 0} hours`);
    } else if (t === 'sand') addSand(bed, x, y, 0.5, 0.2);
    else if (t === 'erase') takeSand(bed, x, y, 0.3, 0.1);
    reliefDirty = paintDirty = true; forceTiles = true; lat = null;
    kick();
  }
  function cursorAt(hit) {
    if (!sand || !stage || tab !== 'sandbox') return;
    const on = !!hit && (hit.on === 'bed' || hit.on === 'horn');
    stage.canvas.style.cursor = tool === 'look' ? (hit?.on === 'horn' ? 'pointer' : '') : on ? 'crosshair' : '';
    if (tool === 'look' || !on) sand.cursor(null);
    else sand.cursor(hit.x, hit.y, tool === 'horn' ? spec.mouthDiameter / 2 : RADIUS[tool]);
    stage.mark();
  }

  // the hour by the sun and how high the sun stands, or how far under the horizon
  function sunSay() {
    const e = sunAt(sunHours).elevation, t = clock(sunHours % 24);
    if (e >= 3) return `${t} · ${fmt(e, 0)}° up`;
    if (e > -1) return `${t} · ${sunHours < 12 ? 'sunrise' : 'sunset'}`;
    if (e > -18) return `${t} · ${fmt(-e, 0)}° down, twilight`;
    return `${t} · night, the stars of ${EPOCH.say}`;
  }

  // the eye put somewhere at once (target, dist, polar, az: any of them), for a look from outside
  function aim(v) {
    const o = (tab === 'pyramid' ? pyr : sand)?.orbit;
    if (!o || !stage) return false;
    tour = follow = false;
    go(o, v); o.now = { target: [...o.target], dist: o.dist, polar: o.polar, az: o.az }; o.rate = 0;
    stage.mark();
    return true;
  }

  // ---------------------------------------------------------------- the pyramid's places to go
  function lookFrom(o, eye, target) {
    const d = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]], dist = Math.hypot(d[0], d[1], d[2]);
    go(o, { target, dist, polar: Math.acos(d[1] / dist), az: Math.atan2(d[0], d[2]) });
  }
  function goTo(k) {
    if (!pyr || !stage) return;
    const o = pyr.orbit, b = buildAt(sched.rows, years), c = b.current;
    if (k === 'whole') { stage.view('reset'); return; }
    o.rate = 4;                                               // a slow glide there
    if (k === 'foot') lookFrom(o, [26, 1.7, BASE_M / 2 + 78], [0, 62, 0]);
    else if (!c) go(o, { target: [0, b.top, 0], dist: 48, polar: 1.05 });
    else if (k === 'course') { const q = Math.max(0, c.side / 2 - Math.min(14, c.side / 4)); go(o, { target: [q, b.top, q], dist: Math.max(22, Math.min(64, c.side * 0.5)), polar: 1.02, az: Math.PI / 4 }); }
    else if (k === 'horns') lookFrom(o, [6, b.top + 3.6, c.side / 2 + 5.5], [0, b.top + 0.3, c.side / 2 - 6]);
    stage.mark();
  }

  // ---------------------------------------------------------------- a frame (the stage calls it before it draws; true = keep drawing)
  function frame(now, dt) {
    if (!root) return false;
    if (tour) { const o = (tab === 'pyramid' ? pyr : sand)?.orbit; if (o) { turn(o, dt * 0.07, 0); o.rate = 0; } }    // once round in ninety seconds
    const live = tab === 'pyramid' ? framePyr(dt) : frameSand(now, dt);
    if (forceTiles || now - lastTiles > 200) { tiles(now); lastTiles = now; forceTiles = false; }
    earOut(); scaleBar(); scope();
    return live || tour;
  }
  // a bar of a round length, as long on the screen as it is at the point looked at
  function scaleBar() {
    const m = stage ? stage.scale() : 0, bar = refs['scale-bar'];
    if (!(m > 0) || !bar) return;
    const want = m * Math.min(120, host.clientWidth * 0.22), p = 10 ** Math.floor(Math.log10(want)), L = [5, 2, 1].map((k) => k * p).find((v) => v <= want) || p;
    const w = Math.round(L / m) + 'px';
    if (bar.style.width !== w) bar.style.width = w;
    hud('scale-say', L >= 1000 ? `${fmt(L / 1000, 1)} km` : L >= 1 ? `${fmt(L, 0)} m` : `${fmt(L * 100, 0)} cm`);
  }

  function frameSand(now, dt) {
    if (fieldDirty && (!drag || now - lastField > (horns.length > 8 ? 160 : 40))) {
      computeField(bed, horns, f);
      fieldDirty = false; lastField = now; paintDirty = soloDirty = true; forceTiles = true;
    }
    if (playing) {
      let simDt = Math.min(dt * speed, 30); const sub = 0.1; let n = 0;
      while (simDt > 0 && n < 40) { step(bed, Math.min(sub, simDt)); simDt -= sub; n++; }
      tau += dt * WAVE_HZ; reliefDirty = paintDirty = true;
    }
    if (solo >= horns.length) solo = -1;
    if (solo >= 0 && soloDirty) soloField();
    if (sand) {
      if (hornsDirty) { sand.horns(horns, spec, solo); hornsDirty = false; }
      if (reliefDirty) { sand.relief(); reliefDirty = false; }
      if (paintDirty) {
        const q = { show, waves: playing, tau, strength: clamp((wavelength(f) / bed.cell - 2) / 4, 0, 1) };
        if (solo >= 0 && soloP) { q.pr = soloP.pr; q.pi = soloP.pi; }
        sand.paint(q); paintDirty = false;
      }
      sand.fronts({ on: playing, lambda: wavelength(f), tau, solo });
    }
    listen(solo >= 0 ? [horns[solo]] : horns, f, bed.depth0, playing && hearing, solo);
    return playing || fieldDirty;
  }

  function framePyr(dt) {
    if (pyrPlaying) {
      years = Math.min(sched.years, years + dt * (sched.years / BUILD_S));
      if (years >= sched.years) { pyrPlaying = false; sync(); }
      if (refs.years) refs.years.value = String(years);
    }
    const b = buildAt(sched.rows, years);
    if (b.current !== rowShown) { rowShown = b.current; rowHorns = b.current ? courseHorns(b.current, plan) : []; }
    // following, the point looked at rises with the working surface (where the eye looks across, it stays)
    if (follow && pyr) { const o = pyr.orbit, want = b.top + 1.5; if (Math.abs(o.target[1] - want) > 0.01) { go(o, { target: [o.target[0], o.target[1] + (want - o.target[1]) * Math.min(1, dt * 2.5), o.target[2]] }); o.rate = 0; } }
    if (pyrSound) tau += dt * WAVE_HZ;
    const dressing = pyr?.set({ built: b.built, current: b.current, part: b.part, setPart: b.setting ? 1 - b.setLeft / b.current.setHours : 0, list: rowHorns, tau, sound: pyrSound });
    listen(rowHorns, LATTICE_HZ, b.top, pyrSound);
    return pyrPlaying || pyrSound || !!dressing || (follow && pyr && Math.abs(pyr.orbit.target[1] - b.top - 1.5) > 0.05);
  }

  // the alone horn's own field on the bed, for its waves on the sand
  function soloField() {
    const one = [horns[solo]], n = bed.nx * bed.ny;
    if (!soloP || soloP.pr.length !== n) soloP = { pr: new Float32Array(n), pi: new Float32Array(n) };
    for (let j = 0; j < bed.ny; j++) for (let i = 0; i < bed.nx; i++) {
      const q = pressureAt(one, f, (i + 0.5) * bed.cell, (j + 0.5) * bed.cell, 0), k = j * bed.nx + i;
      soloP.pr[k] = q.re; soloP.pi[k] = q.im;
    }
    soloDirty = false;
  }

  // ---------------------------------------------------------------- the tone at the camera
  function listen(list, hz, zero, on, soloAt = -1) {
    gainsNow = [0, 0, 0, 0];
    if (!on || !list.length) { heardDb = null; if (on) sound?.set(gainsNow); shine(-1); return; }
    if (each.length < list.length) each = new Float32Array(list.length * 2);
    const heard = hear(list, hz, earNow(zero), each);
    heardDb = heard.p > 0 ? paToSpl(heard.p) : null;
    gainsNow = stereo(heard);
    sound?.set(gainsNow);
    shine(list.length, soloAt);
  }
  // where the sound comes from, as light: each horn as bright as its own share of what is heard
  // at the camera (its pressure there over the loudest one's, to the power 1.5, so that the ones
  // that carry the sound stand out); n < 0 puts every horn out
  function shine(n, soloAt = -1) {
    const scene = tab === 'pyramid' ? pyr : sand;
    if (!scene) return;
    if (n < 0) { if (lit) { scene.glow(null); lit = false; litN = 0; } return; }
    const need = Math.max(n, soloAt + 1);
    if (glowW.length < need) glowW = new Float32Array(need * 2);
    glowW.fill(0);
    if (soloAt >= 0) glowW[soloAt] = 1;
    else {
      let top = 0;
      for (let i = 0; i < n; i++) if (each[i] > top) top = each[i];
      if (top > 0) for (let i = 0; i < n; i++) glowW[i] = Math.pow(each[i] / top, 1.5);
    }
    scene.glow(glowW); lit = true; litN = need;
  }
  // the two channels as they are played (left blue, right amber), on the slowed clock
  function scope() {
    const c = refs.scope;
    if (!c) return;
    const on = (tab === 'pyramid' ? pyrSound : playing && hearing) && heardDb != null;
    if (c.hidden === on) c.hidden = !on;
    if (!on) return;
    const g = c.getContext('2d'), w = c.width, h = c.height, [a, b, d, e] = gainsNow;
    const top = Math.max(Math.hypot(a, b), Math.hypot(d, e), 1e-9);
    g.clearRect(0, 0, w, h);
    g.lineWidth = 2.4; g.lineJoin = 'round';
    for (const [cc, ss, col] of [[a, b, 'rgba(150, 196, 255, 0.95)'], [d, e, 'rgba(255, 196, 120, 0.95)']]) {
      g.strokeStyle = col; g.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const th = (x / w) * 4 * Math.PI - 2 * Math.PI * tau, y = h / 2 - ((cc * Math.cos(th) + ss * Math.sin(th)) / top) * (h / 2 - 3);
        if (x) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  }
  // the listener: the camera's eye, its right hand along the ground, and its height above the
  // plane the sound meets (zero); below that plane the room mirrors it (a pyramid's flank)
  function earNow(zero) {
    const e = stage?.ear();
    if (!e) return tab === 'pyramid' ? { x: 0, y: BASE_M, z: 60, rx: 1, ry: 0, rz: 0 } : { x: bed.width / 2, y: bed.depth + 8, z: 4, rx: 1, ry: 0, rz: 0 };
    return { x: e.eye[0], y: e.eye[2], z: Math.max(0.05, Math.abs(e.eye[1] - zero)), rx: e.right[0], ry: e.right[2], rz: 0 };
  }
  function earOut() {
    if (!refs.ear) return;
    const on = tab === 'pyramid' ? pyrSound : playing && hearing;
    const t = !on ? 'sound off' : heardDb == null ? 'silent' : `${fmt(heardDb, 0)} dB`;
    if (refs.ear.textContent !== t) refs.ear.textContent = t;
  }

  // ---------------------------------------------------------------- the numbers, a few times a second
  function setStat(k, v, sub = '', warn = false) {
    const r = refs.stats?.[k];
    if (!r) return;
    if (r.v.textContent !== v) r.v.textContent = v;
    if (r.s.textContent !== sub) r.s.textContent = sub;
    r.s.classList.toggle('freq-warn', warn);
  }
  function hud(k, t) { const e = refs[k]; if (e && e.textContent !== t) e.textContent = t; }
  function tiles(now) {
    if (!root) return;
    const px = stage ? stage.read().px : null, hz = tab === 'pyramid' ? LATTICE_HZ : f;
    const sounding = tab === 'pyramid' ? pyrSound : playing && hearing;
    hud('slow', `waves drawn ${fmt(hz / WAVE_HZ, 0)}× slowed${sounding ? ' · the brighter a horn, the more of what you hear is its' : px ? ` · ${px[0]} × ${px[1]} px` : ''}`);
    if (tab === 'pyramid') {
      const b = buildAt(sched.rows, years), c = b.current, n = sched.rows.length;
      const phase = !c ? 'built' : b.setting ? `setting, ${fmt(b.setLeft, 0)} h to go` : `carrying in, ${fmt(b.part * 100, 0)} %`;
      setStat('year', fmt(years, 2), `of ${sig(sched.years, 3)} years of sound`);
      setStat('course', c ? `${c.course}` : `${n}`, c ? `of ${n} · ${phase}` : 'all built');
      setStat('height', `${fmt(b.top, 1)} m`, `of ${fmt(HEIGHT_M, 2)} m`);
      setStat('side', c ? `${fmt(c.side, 1)} m` : '—', c ? `${fmt(c.thickness, 2)} m thick` : '');
      setStat('blocks', c ? fmt(c.blocks, 0) : '—', c ? 'in this course, on the 1.27 m module' : '');
      setStat('horns', c ? fmt(c.horns, 0) : '—', c ? `${fmt(plan.mouthDiameter * 100, 0)} cm mouths at ${fmt(LATTICE_HZ, 1)} Hz` : '');
      setStat('power', c ? `${sig(c.inputMW, 3)} MW` : '—', c ? 'electrical, while it sounds' : '');
      setStat('stone', c ? `${sig(c.mass / 1000, 3)} t` : '—', c ? 'at 2.3 t/m³' : '');
      setStat('carry', c ? `${fmt(c.moveHours, 0)} h` : '—', c ? `at ${sig(plan.flux * 1000, 3)} g a metre of front a second` : '');
      setStat('set', c ? `${fmt(c.setHours, 0)} h` : '—', c ? `walkable after ${fmt(-SET.tauHours * Math.log(1 - SET.walkableMPa / SET.strengthMPa), 0)} h` : '');
      hud('kick', 'The Great Pyramid · 1:1');
      hud('line', c ? `year ${fmt(years, 2)} · course ${c.course} of ${n} · ${phase}` : `${n} courses, ${fmt(HEIGHT_M, 1)} m: built in ${sig(sched.years, 3)} years of sound`);
      if (refs.read) {
        const z = b.built ? sched.rows[b.built - 1].top : 0;
        refs.read.innerHTML = c
          ? `${fmt(years, 2)} y · course ${c.course} of ${n} (${fmt(c.thickness, 2)} m thick, ${fmt(c.side, 1)} m a side): ${fmt(c.blocks, 0)} blocks, ${c.horns} horns at ${fmt(LATTICE_HZ, 1)} Hz, ${sig(c.inputMW, 3)} MW in · ${fmt(z, 1)} m built`
          : `${fmt(years, 2)} y · ${n} courses, ${fmt(HEIGHT_M, 1)} m: done in ${sig(sched.years, 3)} years of sound`;
      }
      return;
    }
    const R = readings(bed), over = R.maxP > 0 ? paToSpl(R.maxP) : 0, lam = wavelength(f);
    if (now - lastLat > 500 || !lat) { lat = R.displaced > 50 ? latticePitch(bed) : null; lastLat = now; }
    setStat('tone', `${fmt(f, 0)} Hz`, `λ ${fmt(lam, 2)} m`);
    setStat('horns', `${horns.length}`, horns.length ? `${sig(spec.acousticW / 1000, 3)} kW each, ${fmt(spec.mouthDb, 1)} dB at the mouth` : 'none placed yet');
    setStat('loudest', horns.length ? `${fmt(over, 1)} dB` : '—', over > THROAT_MAX_DB ? 'shocks: the tone breaks up here' : `a grain moves past ${fmt(thresholdSpl(bed.grain, bed.rhoS), 1)} dB`, over > THROAT_MAX_DB);
    setStat('wind', `${sig(R.maxU, 3)} m/s`, `a grain moves at ${sig(bed.uT, 3)} m/s`);
    setStat('moving', `${fmt(R.mobileShare * 100, 0)} %`, 'of the bed');
    setStat('displaced', `${fmt(R.displaced, 0)} kg`, 'of sand moved');
    setStat('time', `${fmt(R.time, 0)} s`, playing ? `running at ×${speed}` : `paused · ×${speed}`);
    setStat('ridges', lat && lat.strength > 0.3 ? `${fmt(lat.pitch, 2)} m` : 'none yet', `apart · λ/2 = ${fmt(lam / 2, 2)} m`);
    setStat('packing', fmt(R.meanPhi, 3), 'mean; random close is 0.64');
    setStat('binder', R.wetCells ? `${R.setCells} of ${R.wetCells}` : 'none', R.wetCells ? 'wet cells set' : 'poured yet');
    hud('kick', `The sandbox · ${bed.width} × ${bed.depth} m`);
    hud('line', `${horns.length} horn${horns.length === 1 ? '' : 's'} at ${fmt(f, 0)} Hz · ${playing ? 'sounding' : 'silent'}${solo >= 0 ? ` · horn ${solo + 1} alone` : ''}`);
    if (refs.read) refs.read.textContent = `Sand ${fmt(R.hMin * 100, 0)}–${fmt(R.hMax * 100, 0)} cm deep · ${fmt(bed.grain * 1000, 2)} mm calcite grains in ${bed.cell * 100} cm cells; a grain moves at ${sig(bed.uT, 3)} m/s of surface wind (incident ${fmt(thresholdSpl(bed.grain, bed.rhoS), 1)} dB). The edges are walls; damp sand holds a face to 0.4 m; set stone holds everything.`;
  }

  // what the room is doing, for tests and for a look from outside (window.Y3K.frequencies.read())
  function read() {
    const b = buildAt(sched.rows, years), r3 = (x) => Math.round(x * 1000) / 1000;
    return { open: !!(root && root.isConnected), tab, loaded: !!stage, failed, stage: stage ? stage.read() : null, sound: sound ? sound.read() : null,
      years: r3(years), built: b.built, course: b.current ? b.current.course : null, rowHorns: rowHorns.length, pyrPlaying, pyrSound,
      playing, hearing, tool, show, speed, f, powerW, horns: horns.length, solo, heardDb: heardDb == null ? null : Math.round(heardDb * 10) / 10, tau: r3(tau),
      tour, lit: litN, bright: glowW.subarray(0, litN).filter((w) => w > 0.5).length, gains: gainsNow.map((g) => Math.round(g * 1e4) / 1e4), cased: !!pyr?.cased, hornsNear: !!pyr?.hornsNear, sun: { hours: r3(sunHours), elevation: r3(sunAt(sunHours).elevation) }, night: pyr ? pyr.night : null };
  }

  return { open, close, hornSpec };
}
