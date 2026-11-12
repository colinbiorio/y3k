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
// Renders into #home-grid like the mine does. close() is idempotent.
// ============================================================================
import { AIR, splToPa, paToSpl, particleVelocity, mouthDiameterFor, acousticPower, inputPower, THROAT_MAX_DB, intensity, shockDistance,
  thresholdSpl, levitationSpl, absorptionDbPerM, wavelength, HORN_EFFICIENCY, GRAIN, mouthSpl } from './frequencies/acoustics.mjs';
import { createBed, computeField, step, pour, addSand, readings, presetPair, presetLattice, presetBlock, latticePitch } from './frequencies/sand.mjs';
import { PETRIE, BASE_M, HEIGHT_M, courseTable, totals, recipeFor, RECIPE, BINDER_SOLIDS_FRACTION, SET, strengthAt, hornPlan, schedule,
  LATTICE_HZ, STONE, TOP_MEAN_M, INCH } from './frequencies/pyramid.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 1) => (Number.isFinite(x) ? Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const sig = (x, n = 3) => (Number.isFinite(x) ? Number(Number(x).toPrecision(n)).toLocaleString('en-US') : '—');

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

export function createFrequencies({ toast } = {}) {
  let grid = null, root = null, tab = 'pyramid';
  let raf = 0;
  // the sandbox
  let bed = null, horns = [], f = Math.round(LATTICE_HZ), powerW = 5000, tool = 'horn', playing = false, speed = 10, show = 'sand', fieldDirty = true;
  let lastT = 0;
  // the pyramid
  let years = 0, pyrPlaying = false, pyrLast = 0;
  const plan = hornPlan({ mouthDb: 160 });
  const sched = schedule(plan);
  const rows = courseTable();
  const tot = totals(rows);

  // ---------------------------------------------------------------- the frame
  function open(g) {
    grid = g;
    if (root && root.isConnected) return;
    grid.innerHTML = '';
    root = document.createElement('div');
    root.className = 'freq-root';
    grid.appendChild(root);
    render();
  }
  function close() {
    cancelAnimationFrame(raf); raf = 0; playing = false; pyrPlaying = false;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }
  function render() {
    if (!root) return;
    root.innerHTML = `
      <div class="freq-head">
        <div class="shaft-tabs" role="tablist" aria-label="frequencies">
          <button type="button" class="login-alt${tab === 'pyramid' ? ' on' : ''}" role="tab" aria-selected="${tab === 'pyramid'}" data-tab="pyramid">the pyramid</button>
          <button type="button" class="login-alt${tab === 'sandbox' ? ' on' : ''}" role="tab" aria-selected="${tab === 'sandbox'}" data-tab="sandbox">the sandbox</button>
        </div>
        <span class="muted shaft-lex">real physics is the invariant · <a href="https://github.com/colinbiorio/y3k/blob/main/FREQUENCIES.md" target="_blank" rel="noopener">the dossier</a></span>
      </div>
      <div class="freq-body"></div>`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; cancelAnimationFrame(raf); raf = 0; render(); }));
    if (tab === 'pyramid') renderPyramid(root.querySelector('.freq-body')); else renderSandbox(root.querySelector('.freq-body'));
  }

  // ---------------------------------------------------------------- the pyramid
  function renderPyramid(el) {
    const r = recipeFor(STONE.typicalBlockT * 1000);
    el.innerHTML = `
      <section class="shaft-sec freq-sec">
        <h4>The Great Pyramid, 1:1, built by sound: what the physics allows</h4>
        <p class="muted">Petrie's survey is the pyramid: a base of <b>${fmt(BASE_M, 2)} m</b> (9068.8 in), an original height of <b>${fmt(HEIGHT_M, 2)} m</b> (5776 in), a face at <b>51° 52′</b>, and the level of every one of the <b>${PETRIE.courses} surviving courses</b> (his Plate 8; the first is ${fmt(58.6 * INCH, 2)} m thick, the 35th ${fmt(49.8 * INCH, 2)} m, the thinnest ${fmt(19.7 * INCH, 2)} m). From it: <b>${sig(tot.volume / 1e6, 3)} million m³</b> of stone, about <b>${sig(tot.mass / 1e9, 3)} million tonnes</b> at 2.3 t/m³, in about <b>${sig(tot.blocks / 1e6, 3)} million blocks</b> on a 1.27 m plan module. Nothing in this room lifts a block. Sound cannot: to hold a grain of stone against gravity in a standing wave takes <b>${fmt(levitationSpl(20000), 0)} dB</b> at 20 kHz and <b>${fmt(levitationSpl(LATTICE_HZ), 0)} dB</b> at the block-scale tone, past the ${THROAT_MAX_DB} dB at which air itself shocks. What sound can do, and this room does, is <b>move grains along the ground, heap them in a square lattice, pack them, and leave the binder to set</b>.</p>
        <canvas class="freq-pyr" width="900" height="620" aria-label="the pyramid rising, course by course"></canvas>
        <div class="freq-row">
          <button type="button" class="btn small" data-act="pyr-play">${pyrPlaying ? 'pause' : 'build'}</button>
          <input type="range" class="freq-years" min="0" max="${sched.years.toFixed(2)}" step="0.01" value="${years}" aria-label="years into the build" />
          <span class="freq-read" data-read="pyr"></span>
        </div>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>The method, in the numbers a physicist would check</h4>
        <ol class="freq-list muted">
          <li><b>The tone.</b> Opposed horns make a standing wave; on the ground the grains gather where the air is still, every half wavelength (Kundt, 1866). For the block module of 1.27 m: <b>f = c / 2·1.27 m = ${fmt(LATTICE_HZ, 1)} Hz</b>, λ = ${fmt(wavelength(LATTICE_HZ), 2)} m. Two pairs crossed lay a square lattice at the block pitch: the sand is both mould and block. The sandbox's "a block's lattice" shows it: lines of horns on four sides at 155 dB lay ridges 1.3 m apart in five minutes of sound.</li>
          <li><b>The horns.</b> Mouth circumference one wavelength at the tone (Olson, Beranek): <b>${fmt(plan.mouthDiameter * 100, 0)} cm</b> across. They stand shoulder to shoulder along the working course's edge, ${fmt(plan.spacing, 2)} m apart, mouths 0.5 m above the bed, aimed across it; each is driven to <b>${plan.mouthDb} dB at the mouth</b> (${sig(plan.acoustic / 1e3, 3)} kW acoustic, ~${sig(plan.input / 1e3, 3)} kW in at ${HORN_EFFICIENCY * 100} % efficiency; the throat at ${THROAT_MAX_DB} dB, the air's limit). The coherent line gives <b>${fmt(plan.surfaceDb, 1)} dB</b> at the bed one metre out: a surface air speed of ${sig(plan.uSurface, 3)} m/s rms, where a 0.25 mm limestone grain needs ${sig(2 * particleVelocity(splToPa(plan.thresholdDb)), 3)} m/s to move (incident ${fmt(plan.thresholdDb, 1)} dB).</li>
          <li><b>The rate.</b> Bagnold's law for sand carried by wind, at the effective friction velocity u* = u/8: <b>${sig(plan.flux * 1000, 3)} g per metre of front per second</b>. The first course (${fmt(rows[0].side, 1)} m a side, ${fmt(4 * rows[0].side, 0)} m of front, ${sched.rows[0].horns} horns, ${sig(sched.rows[0].inputMW, 3)} MW in) takes ${fmt(sched.rows[0].moveHours, 0)} hours to carry in and ${fmt(sched.rows[0].setHours, 0)} hours to set. All ${rows.length} courses: <b>${sig(sched.years, 3)} years</b> of continuous sound.</li>
          <li><b>The stone.</b> Davidovits' re-agglomerated limestone, as he made it in 2006: per <b>${fmt(RECIPE.limestone, 0)} kg</b> of nummulitic limestone gently disaggregated in water, <b>${RECIPE.kaolinite} kg kaolinitic clay</b> (Giza's limestone carries its own), <b>${RECIPE.natron} kg natron</b> (Na₂CO₃), <b>${RECIPE.lime} kg slaked lime</b>, <b>${RECIPE.water} L water</b>; 18–20 % water stays in the set stone. Na₂CO₃ + Ca(OH)₂ → 2 NaOH + CaCO₃; NaOH with kaolinite → hydrosodalite and calcite. Binder solids ${fmt(BINDER_SOLIDS_FRACTION * 100, 2)} %. One 2.5 t block: ${fmt(r.limestone, 0)} kg limestone, ${fmt(r.kaolinite, 0)} kg clay, ${fmt(r.natron, 0)} kg natron, ${fmt(r.lime, 0)} kg lime, ${fmt(r.water, 0)} L water. The whole pyramid: ${sig(tot.mass * (RECIPE.natron / 4800) / 1e6, 3)} kt of natron, ${sig(tot.mass * (RECIPE.lime / 4800) / 1e6, 3)} kt of lime, ${sig(tot.mass * (RECIPE.water / 4800) / 1e9, 3)} million tonnes of water.</li>
          <li><b>The set.</b> Strength S(t) = ${SET.strengthMPa} MPa · (1 − e^(−t/${SET.tauHours} h)): walkable (${SET.walkableMPa} MPa) after ${fmt(-SET.tauHours * Math.log(1 - SET.walkableMPa / SET.strengthMPa), 0)} h, 90 % after ${fmt(-SET.tauHours * Math.log(0.1), 0)} h. The same horns' pressure on the bed (Γ = ${sig(2 * Math.SQRT2 * splToPa(plan.surfaceDb) / (GRAIN.calcite * 0.56 * 0.1 * 9.80665), 2)} g on the top 10 cm) packs the mix toward 0.64 before it sets.</li>
          <li><b>What sound does not do here.</b> It does not lift anything, and it does not climb: the grains, the water and the natron must be brought to the working course by other means (${sig(tot.mass / 1e9, 2)} million tonnes of them). It does not cut a casing joint of half a millimetre. And a tone this loud shocks ${fmt(shockDistance(plan.surfaceDb, LATTICE_HZ), 1)} m out, so each horn's work is within a few metres of it. The dossier says what is measured (T-I), what is our derivation (T-II), and what is hypothesis (T-III).</li>
        </ol>
      </section>`;
    const canvas = el.querySelector('.freq-pyr');
    const slider = el.querySelector('.freq-years');
    slider.addEventListener('input', () => { years = Number(slider.value); drawPyramid(canvas, el); });
    el.querySelector('[data-act="pyr-play"]').addEventListener('click', (e) => { pyrPlaying = !pyrPlaying; e.target.textContent = pyrPlaying ? 'pause' : 'build'; if (pyrPlaying) { pyrLast = performance.now(); loopPyramid(canvas, el, slider); } });
    drawPyramid(canvas, el);
  }
  function loopPyramid(canvas, el, slider) {
    if (!pyrPlaying || !root) return;
    const now = performance.now();
    years = Math.min(sched.years, years + ((now - pyrLast) / 1000) * (sched.years / 30));   // the whole build in thirty seconds
    pyrLast = now;
    slider.value = years.toFixed(2);
    drawPyramid(canvas, el);
    if (years >= sched.years) { pyrPlaying = false; const b = el.querySelector('[data-act="pyr-play"]'); if (b) b.textContent = 'build'; return; }
    raf = requestAnimationFrame(() => loopPyramid(canvas, el, slider));
  }
  function drawPyramid(canvas, el) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const scale = (W - 80) / BASE_M;                      // px per metre
    const x0 = 40, yBase = H - 40;
    const hours = years * 8766;
    const built = sched.rows.filter((r) => r.cumulativeHours <= hours);
    const current = sched.rows.find((r) => r.cumulativeHours > hours) || null;
    // the outline
    ctx.strokeStyle = 'rgba(205,213,223,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0 + BASE_M * scale, yBase); ctx.lineTo(x0 + (BASE_M * scale) / 2, yBase - HEIGHT_M * scale); ctx.closePath(); ctx.stroke();
    // the courses built
    for (const r of built) {
      const y1 = yBase - r.top * scale, y0 = yBase - r.bottom * scale;
      const s0 = r.side * scale, s1 = Math.max(0, (r.side - (r.thickness * 2) / Math.tan((51.87 * Math.PI) / 180)) * scale);
      ctx.fillStyle = r.surveyed ? 'rgba(222, 206, 170, 0.92)' : 'rgba(222, 206, 170, 0.5)';
      ctx.beginPath(); ctx.moveTo(x0 + (BASE_M * scale - s0) / 2, y0); ctx.lineTo(x0 + (BASE_M * scale + s0) / 2, y0); ctx.lineTo(x0 + (BASE_M * scale + s1) / 2, y1); ctx.lineTo(x0 + (BASE_M * scale - s1) / 2, y1); ctx.closePath(); ctx.fill();
    }
    // the working course and its horns
    if (current) {
      const y0 = yBase - current.bottom * scale, s0 = current.side * scale;
      ctx.fillStyle = 'rgba(255, 220, 120, 0.55)';
      ctx.fillRect(x0 + (BASE_M * scale - s0) / 2, y0 - 3, s0, 3);
      // the horns: every mouth along the visible edge, to scale (a dot each if too small)
      const n = Math.max(1, Math.floor(current.side / plan.spacing));
      ctx.fillStyle = 'rgba(205, 213, 223, 0.9)';
      const hw = Math.max(1, plan.mouthDiameter * scale);
      for (let i = 0; i < n; i++) ctx.fillRect(x0 + (BASE_M * scale - s0) / 2 + i * plan.spacing * scale, y0 - 3 - Math.max(2, 0.5 * scale), hw * 0.8, Math.max(2, 0.5 * scale));
    }
    // the ground and the scale
    ctx.strokeStyle = 'rgba(205,213,223,0.6)'; ctx.beginPath(); ctx.moveTo(20, yBase + 0.5); ctx.lineTo(W - 20, yBase + 0.5); ctx.stroke();
    ctx.fillStyle = '#9aa2b0'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('0', x0 - 4, yBase + 16); ctx.fillText(fmt(BASE_M, 1) + ' m', x0 + BASE_M * scale - 36, yBase + 16);
    ctx.fillText(fmt(HEIGHT_M, 1) + ' m', x0 + (BASE_M * scale) / 2 + 8, yBase - HEIGHT_M * scale + 4);
    const read = el.querySelector('[data-read="pyr"]');
    const z = built.length ? built[built.length - 1].top : 0;
    if (read) read.textContent = current
      ? `${fmt(years, 2)} y · course ${current.course} of ${sched.rows.length} (${fmt(current.thickness, 2)} m thick, ${fmt(current.side, 1)} m a side): ${fmt(current.blocks, 0)} blocks, ${current.horns} horns at ${fmt(LATTICE_HZ, 1)} Hz, ${sig(current.inputMW, 3)} MW in · ${fmt(z, 1)} m built`
      : `${fmt(years, 2)} y · ${sched.rows.length} courses, ${fmt(HEIGHT_M, 1)} m: done in ${sig(sched.years, 3)} years of sound`;
  }

  // ---------------------------------------------------------------- the sandbox
  function ensureBed() {
    if (!bed) { bed = createBed({ width: 12, depth: 8, cell: 0.05 }); horns = []; fieldDirty = true; }
  }
  function renderSandbox(el) {
    ensureBed();
    el.innerHTML = `
      <section class="shaft-sec freq-sec">
        <div class="freq-tools" role="toolbar" aria-label="sandbox tools">
          <label class="freq-ctl">tone <input type="number" class="freq-f" min="20" max="20000" step="1" value="${f}" aria-label="tone, hertz" /> Hz</label>
          <label class="freq-ctl">horn power <input type="number" class="freq-w" min="100" max="100000" step="100" value="${powerW}" aria-label="acoustic power, watts" /> W</label>
          <span class="freq-seg" role="group" aria-label="tool">
            ${['horn', 'pour', 'sand', 'erase'].map((t) => `<button type="button" class="disc-chip${tool === t ? ' on' : ''}" data-tool="${t}">${t === 'horn' ? 'place a horn' : t === 'pour' ? 'pour binder' : t === 'sand' ? 'tip sand' : 'take away'}</button>`).join('')}
          </span>
          <span class="freq-seg" role="group" aria-label="show">
            ${['sand', 'spl', 'wind'].map((t) => `<button type="button" class="disc-chip${show === t ? ' on' : ''}" data-show="${t}">${t === 'sand' ? 'the sand' : t === 'spl' ? 'the level' : 'the wind'}</button>`).join('')}
          </span>
          <span class="freq-seg" role="group" aria-label="arrangements">
            <button type="button" class="disc-chip" data-preset="pair">a pair</button>
            <button type="button" class="disc-chip" data-preset="lattice">the lattice</button>
            <button type="button" class="disc-chip" data-preset="block">a block's lattice</button>
            <button type="button" class="disc-chip" data-preset="clear">clear</button>
          </span>
          <span class="freq-seg">
            <button type="button" class="btn small" data-act="play">${playing ? 'pause' : 'sound on'}</button>
            <select class="freq-speed glass-select" aria-label="time speed">${[1, 10, 60, 600].map((s) => `<option value="${s}"${s === speed ? ' selected' : ''}>×${s}</option>`).join('')}</select>
          </span>
        </div>
        <canvas class="freq-sand" width="960" height="640" aria-label="a bed of sand twelve metres by eight, seen from above; horns to scale"></canvas>
        <div class="muted freq-small">Click to use the tool; drag from a horn to aim it. Bed ${bed.width} × ${bed.depth} m, ${bed.cell * 100} cm cells, ${fmt(bed.grain * 1000, 2)} mm calcite grains; a grain moves at ${sig(bed.uT, 3)} m/s of surface wind (incident ${fmt(thresholdSpl(bed.grain, bed.rhoS), 1)} dB). Edges are walls. Damp sand holds a face to 0.4 m; set stone holds everything.</div>
        <div class="freq-read" data-read="sand"></div>
      </section>
      <section class="shaft-sec freq-sec">
        <h4>The horns on the bed</h4>
        <div class="freq-horns muted"></div>
      </section>`;
    const canvas = el.querySelector('.freq-sand');
    el.querySelector('.freq-f').addEventListener('change', (e) => { f = Math.max(20, Math.min(20000, Number(e.target.value) || f)); e.target.value = f; resizeHorns(); fieldDirty = true; draw(canvas, el); });
    el.querySelector('.freq-w').addEventListener('change', (e) => { powerW = Math.max(100, Math.min(100000, Number(e.target.value) || powerW)); e.target.value = powerW; resizeHorns(); fieldDirty = true; draw(canvas, el); });
    el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; el.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); }));
    el.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { show = b.dataset.show; el.querySelectorAll('[data-show]').forEach((x) => x.classList.toggle('on', x === b)); draw(canvas, el); }));
    el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      const spec = hornSpec(f, powerW);
      if (b.dataset.preset === 'clear') { horns = []; bed = createBed({ width: 12, depth: 8, cell: 0.05 }); }
      else if (b.dataset.preset === 'pair') horns = presetPair(bed, { f, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter });
      else if (b.dataset.preset === 'block') {
        // the plan's working course in small: lines of horns on all four sides at the lattice tone, at 1.6 kW each
        // (155 dB mouths), so that the bed stays under the 170 dB shock limit and the middle is still above threshold
        f = Math.round(LATTICE_HZ); powerW = 1600;
        const bs = hornSpec(f, powerW);
        el.querySelector('.freq-f').value = f; el.querySelector('.freq-w').value = powerW;
        horns = presetBlock(bed, { mouthDb: bs.mouthDb, mouthDiameter: bs.mouthDiameter });
        toast?.(`${horns.length} horns at ${f} Hz, ${fmt(bs.mouthDb, 0)} dB at the mouth: sound on, and watch the ridges come at the block pitch`);
      } else horns = presetLattice(bed, { f, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter });
      fieldDirty = true; draw(canvas, el);
    }));
    el.querySelector('[data-act="play"]').addEventListener('click', (e) => { playing = !playing; e.target.textContent = playing ? 'pause' : 'sound on'; if (playing) { lastT = performance.now(); loopSand(canvas, el); } });
    el.querySelector('.freq-speed').addEventListener('change', (e) => { speed = Number(e.target.value) || 10; });
    // the hand on the bed
    let drag = null;
    const pos = (ev) => { const r = canvas.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * canvas.width, py = ((ev.clientY - r.top) / r.height) * canvas.height; return { x: (px / canvas.width) * bed.width, y: (py / canvas.height) * bed.depth }; };
    canvas.addEventListener('pointerdown', (ev) => {
      const { x, y } = pos(ev);
      const near = horns.findIndex((h) => Math.hypot(h.x - x, h.y - y) < Math.max(0.3, h.mouthDiameter / 2));
      if (tool === 'erase') { if (near >= 0) { horns.splice(near, 1); fieldDirty = true; } else { const k = Math.floor(y / bed.cell) * bed.nx + Math.floor(x / bed.cell); if (bed.h[k] !== undefined) { bed.h[k] = Math.max(0, bed.h[k] - 0.1); } } draw(canvas, el); return; }
      if (near >= 0) { drag = near; canvas.setPointerCapture(ev.pointerId); return; }
      if (tool === 'horn') { const spec = hornSpec(f, powerW); horns.push({ x, y, z: 0.5, aimX: 1, aimY: 0, aimZ: -0.25, mouthDb: spec.mouthDb, mouthDiameter: spec.mouthDiameter, phase: 0 }); drag = horns.length - 1; canvas.setPointerCapture(ev.pointerId); fieldDirty = true; }
      else if (tool === 'pour') { pour(bed, x, y, 0.635); toast?.(`binder paste poured: a 1.27 m round, the block module; it sets over ${-SET.tauHours * Math.log(1 - SET.walkableMPa / SET.strengthMPa) | 0} hours`); }
      else if (tool === 'sand') addSand(bed, x, y, 0.5, 0.2);
      draw(canvas, el);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (drag === null) return;
      const { x, y } = pos(ev); const h = horns[drag]; if (!h) return;
      const dx = x - h.x, dy = y - h.y;
      if (Math.hypot(dx, dy) > 0.15) { const l = Math.hypot(dx, dy); h.aimX = dx / l; h.aimY = dy / l; fieldDirty = true; draw(canvas, el); }
    });
    const up = () => { drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    draw(canvas, el);
  }
  function resizeHorns() {
    const spec = hornSpec(f, powerW);
    for (const h of horns) { h.mouthDiameter = spec.mouthDiameter; h.mouthDb = spec.mouthDb; }
  }
  function loopSand(canvas, el) {
    if (!playing || !root || tab !== 'sandbox') return;
    const now = performance.now();
    let simDt = Math.min(((now - lastT) / 1000) * speed, 30);
    lastT = now;
    if (fieldDirty) { computeField(bed, horns, f); fieldDirty = false; }
    const sub = 0.1;
    let n = 0;
    while (simDt > 0 && n < 40) { step(bed, Math.min(sub, simDt)); simDt -= sub; n++; }
    draw(canvas, el);
    raf = requestAnimationFrame(() => loopSand(canvas, el));
  }
  function draw(canvas, el) {
    if (!bed) return;
    if (fieldDirty) { computeField(bed, horns, f); fieldDirty = false; }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, sx = W / bed.width, sy = H / bed.depth;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const uT = bed.uT;
    for (let py = 0; py < H; py++) {
      const j = Math.min(bed.ny - 1, Math.floor((py / H) * bed.ny));
      for (let px = 0; px < W; px++) {
        const i = Math.min(bed.nx - 1, Math.floor((px / W) * bed.nx));
        const k = j * bed.nx + i, o = (py * W + px) * 4;
        let r, g, b;
        if (show === 'spl') {
          const t = Math.max(0, Math.min(1, (paToSpl(bed.p[k]) - 110) / 60));   // 110..170 dB
          r = 20 + 235 * t; g = 24 + 160 * t * t; b = 60 + 60 * (1 - t);
        } else if (show === 'wind') {
          const t = Math.max(0, Math.min(1, bed.u[k] / (3 * uT)));
          const over = bed.u[k] > uT;
          r = over ? 60 + 190 * t : 30; g = over ? 120 + 120 * t : 50 + 120 * t; b = over ? 40 : 90 + 140 * t;
        } else {
          // the sand: height as light, damp as darker ochre, set as pale stone; the quiet zones faintly marked
          const t = Math.max(0, Math.min(1, (bed.h[k] - 0.1) / 0.6));
          const wet = bed.wet[k] > 0, setd = wet && strengthAt(bed.setH[k]) >= SET.walkableMPa;
          if (setd) { r = 214 + 30 * t; g = 206 + 30 * t; b = 186 + 30 * t; }
          else if (wet) { r = 120 + 60 * t; g = 92 + 46 * t; b = 56 + 30 * t; }
          else { r = 160 + 80 * t; g = 136 + 70 * t; b = 92 + 60 * t; }
          if (bed.u[k] > uT) { r = Math.min(255, r + 18); b = Math.max(0, b - 10); }
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // the horns, to scale: throat to mouth as an exponential flare, the mouth as the bell's rim
    const spec = hornSpec(f, powerW);
    for (const h of horns) {
      const ax = h.aimX, ay = h.aimY, nx = -ay, ny = ax;
      const L = spec.length, mt = h.mouthDiameter / 2, th = spec.throatDiameter / 2;
      ctx.beginPath();
      const pts = [];
      for (let s = 0; s <= 1; s += 0.1) { const w = th * Math.exp(Math.log(mt / th) * s); pts.push([h.x - ax * L * (1 - s), h.y - ay * L * (1 - s), w]); }
      ctx.moveTo((pts[0][0] + nx * pts[0][2]) * sx, (pts[0][1] + ny * pts[0][2]) * sy);
      for (const [x, y, w] of pts) ctx.lineTo((x + nx * w) * sx, (y + ny * w) * sy);
      for (const [x, y, w] of pts.slice().reverse()) ctx.lineTo((x - nx * w) * sx, (y - ny * w) * sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(205, 213, 223, 0.85)'; ctx.fill();
      ctx.strokeStyle = 'rgba(30, 32, 38, 0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      // the mouth's rim
      ctx.beginPath(); ctx.moveTo((h.x + nx * mt) * sx, (h.y + ny * mt) * sy); ctx.lineTo((h.x - nx * mt) * sx, (h.y - ny * mt) * sy); ctx.strokeStyle = '#1e2026'; ctx.lineWidth = 3; ctx.stroke();
      // three arcs of the tone, one wavelength apart
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let n = 1; n <= 3; n++) { const rr = n * spec.wavelength * 0.5; ctx.beginPath(); ctx.arc(h.x * sx, h.y * sy, rr * sx, Math.atan2(ay, ax) - 0.6, Math.atan2(ay, ax) + 0.6); ctx.stroke(); }
    }
    // the scale bar: one metre, and the block module
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(16, H - 22, 1 * sx, 3); ctx.font = '12px system-ui, sans-serif'; ctx.fillText('1 m', 16, H - 28);
    ctx.fillStyle = 'rgba(255, 220, 120, 0.85)'; ctx.fillRect(16 + 1.3 * sx, H - 22, STONE.blockPlanM * sx, 3); ctx.fillText('1.27 m, the block', 16 + 1.3 * sx, H - 28);
    // readings
    const R = readings(bed);
    const read = el.querySelector('[data-read="sand"]');
    const over = R.maxP > 0 ? paToSpl(R.maxP) : 0;
    const lat = R.displaced > 50 ? latticePitch(bed) : null;
    const ridgeLine = lat && lat.strength > 0.3 ? ` · <b>ridges ${fmt(lat.pitch, 2)} m apart</b> (λ/2 = ${fmt(wavelength(f) / 2, 2)} m)` : '';
    if (read) read.innerHTML = `<b>${fmt(R.time, 0)} s</b> of sound · ${horns.length} horn${horns.length === 1 ? '' : 's'} at ${f} Hz (λ ${fmt(wavelength(f), 2)} m) · loudest on the bed <b>${fmt(over, 1)} dB</b>${over > THROAT_MAX_DB ? ' <span class="freq-warn">(shocks: the tone breaks up here)</span>' : ''} · surface wind up to ${sig(R.maxU, 3)} m/s · <b>${fmt(R.mobileShare * 100, 0)} %</b> of the bed is moving · ${fmt(R.displaced, 0)} kg displaced · sand ${fmt(R.hMin * 100, 0)}–${fmt(R.hMax * 100, 0)} cm · packing ${fmt(R.meanPhi, 3)} · ${R.wetCells ? `${R.setCells} of ${R.wetCells} wet cells set` : 'no binder poured'}${ridgeLine}`;
    const list = el.querySelector('.freq-horns');
    if (list) list.innerHTML = horns.length ? horns.map((h, i) => `<div class="freq-horn">horn ${i + 1}: at (${fmt(h.x, 2)}, ${fmt(h.y, 2)}) m, mouth 0.5 m up, aimed ${fmt((Math.atan2(h.aimY, h.aimX) * 180) / Math.PI, 0)}° · ${f} Hz, cut-off ${fmt(f, 0)} Hz → mouth <b>${fmt(spec.mouthDiameter * 100, 0)} cm</b>, throat ${fmt(spec.throatDiameter * 100, 1)} cm at ${THROAT_MAX_DB} dB, flare ${fmt(spec.length * 100, 0)} cm long · <b>${fmt(spec.mouthDb, 1)} dB at the mouth</b> · ${sig(spec.acousticW / 1000, 3)} kW acoustic, ${sig(spec.inputW / 1000, 3)} kW in · shocks at ${fmt(shockDistance(spec.mouthDb, f), 1)} m · air absorption ${sig(absorptionDbPerM(f) * 1000, 2)} dB/km</div>`).join('')
      : 'none yet: pick "place a horn" and click the bed, or choose an arrangement. A horn is sized by its physics: the tone sets its mouth (circumference = λ), the power sets its throat (the air\'s 170 dB limit), the flare follows.';
  }

  return { open, close, hornSpec };
}
