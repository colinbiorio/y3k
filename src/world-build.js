// THE HAMMER — the build window.
//
// Colin's spec, close to verbatim: a two-column window. LEFT, a square grid of
// the structures you could build, greyed out when you lack the items; sorted
// alphabetically, the buildable ones above the greyed ones. Select one and it
// shows the required items with a count of each. RIGHT, the structure itself
// as a wireframe you can turn on every axis, and the recipe read as
// "N material (●) + M material (●) → Structure".
//
// It never invents anything about the world. The recipes are BILL_OF and
// BUILDS from src/ores.js — the same tables the world builds from — and the
// shape in the window is the same shape the ground draws, through
// src/world-shapes.js. "Can I afford this" is computed from what the payload
// says is in your stores and your sprites' hands, honouring the one
// substitution the world honours (trona ← halite) and the one gate it enforces
// (a new sprite or a rover needs an empty panel first).
import { BUILDS, BILL_OF, SUBSTITUTES } from './ores.js';
import { shapeFor, asWireframe, producedBy, CATALOG_ORDER } from './world-shapes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hours = (ms) => { const h = ms / 3600e3; return h >= 24 ? (h === 24 ? 'a day' : `${Math.round(h / 24)} days`) : h === 1 ? 'an hour' : `${Math.round(h)} hours`; };
const AT = { forge: 'the forge', solarforge: 'the solar forge', aiforge: 'the ai forge' };

export function createBuildWindow({ THREE, act, toast, getSpriteRef }) {
  const $ = (id) => document.getElementById(id);
  let modal, gridEl, viewEl, titleEl, recipeEl, metaEl, goBtn, statusEl;
  let materials = {}, have = {}, freePanel = false, spriteCount = 0;
  let selected = null, lastGridKey = '';
  // the little scene on the right
  let pr = null, pscene = null, pcam = null, pgroup = null, praf = 0;
  let rx = 0.42, ry = 0.7, spinning = true, dragging = false, lx = 0, ly = 0;

  // ---- what you have, pooled: every store plus every pair of hands -----------
  function pooled(state) {
    const h = {};
    for (const b of state.built || []) for (const [k, q] of Object.entries(b.hold || {})) h[k] = (h[k] || 0) + (q || 0);
    for (const sp of state.sprites || []) for (const [k, q] of Object.entries(sp.inv || {})) h[k] = (h[k] || 0) + (q || 0);
    return h;
  }
  // one material's need against what is held, substitutes allowed to make up
  // the difference the way the world's own spendBill allows them
  function lineFor(mat, need) {
    let got = have[mat] || 0;
    let viaSub = 0;
    for (const alt of SUBSTITUTES[mat] || []) viaSub += have[alt] || 0;
    const ok = got + viaSub >= need;
    return { mat, need, got, viaSub: Math.max(0, Math.min(viaSub, need - got)), ok };
  }
  function afford(key) {
    const bill = BILL_OF[key] || {};
    const lines = Object.entries(bill).map(([m, n]) => lineFor(m, n));
    const build = BUILDS[key];
    const gate = build?.needsPanel ? (freePanel ? null : 'needs a solar panel standing empty') : null;
    return { ok: lines.every((l) => l.ok) && !gate, lines, gate };
  }
  function catalog() {
    const keys = CATALOG_ORDER.filter((k) => BUILDS[k]).concat(Object.keys(BUILDS).filter((k) => !CATALOG_ORDER.includes(k)));
    const rows = keys.map((key) => { const a = afford(key); return { key, label: labelOf(key), can: a.ok, a }; });
    // buildable first, then the greyed ones; alphabetical inside each
    rows.sort((x, y) => (x.can === y.can ? x.label.localeCompare(y.label) : x.can ? -1 : 1));
    return rows;
  }
  // "a solar panel" → "Solar panel": the window is a catalogue, not a sentence
  const labelOf = (key) => { const l = String(BUILDS[key]?.label || key).replace(/^an? /, ''); return l.charAt(0).toUpperCase() + l.slice(1); };
  const chip = (mat) => `<i class="mat-chip" style="--c:${esc(materials[mat]?.color || '#888')}" title="${esc(materials[mat]?.label || mat)}"></i>`;

  // ---- the grid ---------------------------------------------------------------
  function renderGrid() {
    const rows = catalog();
    const key = JSON.stringify(rows.map((r) => [r.key, r.can, r.a.lines.map((l) => [l.got, l.ok])]));
    if (key === lastGridKey) return;   // unchanged: no churn
    lastGridKey = key;
    gridEl.innerHTML = rows.map((r) =>
      `<button type="button" class="build-tile${r.can ? '' : ' dim'}${r.key === selected ? ' on' : ''}" role="option" aria-selected="${r.key === selected}" data-key="${esc(r.key)}">` +
      `<span class="tile-label">${esc(r.label)}</span>` +
      `<span class="tile-chips">${r.a.lines.map((l) => `<span class="tile-chip${l.ok ? '' : ' short'}">${chip(l.mat)}<b>${l.need}</b></span>`).join('')}</span>` +
      (r.a.gate ? `<span class="tile-gate">${esc(r.a.gate)}</span>` : '') +
      `</button>`).join('');
  }

  // ---- the detail ---------------------------------------------------------------
  function renderDetail() {
    if (!selected || !BUILDS[selected]) {
      titleEl.textContent = 'choose a structure'; titleEl.classList.add('muted');
      recipeEl.innerHTML = ''; metaEl.textContent = ''; goBtn.hidden = true; statusEl.textContent = '';
      showShape(null); return;
    }
    const build = BUILDS[selected], a = afford(selected);
    titleEl.textContent = labelOf(selected); titleEl.classList.remove('muted');
    recipeEl.innerHTML =
      `<div class="recipe-line">` +
      a.lines.map((l) => `<span class="recipe-term${l.ok ? '' : ' short'}"><b>${l.need}</b> ${esc(materials[l.mat]?.label || l.mat)} ${chip(l.mat)}` +
        `<small>${l.got}${l.viaSub ? `+${l.viaSub}` : ''} held</small></span>`).join('<span class="recipe-op">+</span>') +
      (a.lines.length ? '' : `<span class="recipe-term"><b>nothing</b> <small>only time</small></span>`) +
      `<span class="recipe-op">→</span><span class="recipe-out">${esc(labelOf(selected))}</span></div>`;
    metaEl.textContent = `made at ${AT[build.at] || build.at} · takes ${hours(build.ms)}` + (a.gate ? ` · ${a.gate}` : '');
    goBtn.hidden = !spriteCount;
    goBtn.disabled = !a.ok;
    const ref = getSpriteRef?.() || 1;
    goBtn.textContent = a.ok ? `have #${ref} build it` : 'not yet — see what is short';
    statusEl.textContent = '';
    showShape(producedBy(build));
  }

  // ---- the wireframe, spinnable on every axis ----------------------------------
  function ensurePreview() {
    if (pr || !THREE) return;
    pr = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    pr.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    pr.setSize(280, 280, false);
    pr.domElement.className = 'build-canvas';
    viewEl.appendChild(pr.domElement);
    pscene = new THREE.Scene();
    pcam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    pcam.position.set(0, 1.6, 6); pcam.lookAt(0, 0.7, 0);
    // drag turns it on both axes; let go and it drifts on its own again
    const el = pr.domElement;
    el.addEventListener('pointerdown', (e) => { dragging = true; spinning = false; lx = e.clientX; ly = e.clientY; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (!dragging) return; ry += (e.clientX - lx) * 0.012; rx += (e.clientY - ly) * 0.012; lx = e.clientX; ly = e.clientY; });
    const up = () => { dragging = false; setTimeout(() => { if (!dragging) spinning = true; }, 1800); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function showShape(prod) {
    ensurePreview();
    if (!pscene) return;
    if (pgroup) { pscene.remove(pgroup); pgroup.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); pgroup = null; }
    if (!prod) return;
    const g = asWireframe(THREE, shapeFor(THREE, prod.kind, prod));
    // centre it on its own middle so it turns about itself, and frame it
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    g.position.sub(c);
    const wrap = new THREE.Group(); wrap.add(g); pgroup = wrap; pscene.add(wrap);
    const r = Math.max(size.x, size.y, size.z, 1);
    pcam.position.set(0, r * 0.6, r * 2.6); pcam.lookAt(0, 0, 0);
  }
  function tick() {
    praf = requestAnimationFrame(tick);
    if (!pr || modal.hidden) return;
    if (pgroup) { if (spinning) ry += 0.007; pgroup.rotation.set(rx, ry, 0); }
    pr.render(pscene, pcam);
  }

  // ---- the window ---------------------------------------------------------------
  function mount() {
    modal = $('build'); if (!modal) return;
    gridEl = modal.querySelector('.build-grid'); viewEl = modal.querySelector('.build-view');
    titleEl = modal.querySelector('.build-title'); recipeEl = modal.querySelector('.build-recipe');
    metaEl = modal.querySelector('.build-meta'); goBtn = $('build-go'); statusEl = modal.querySelector('.build-status');
    gridEl.addEventListener('click', (e) => { const t = e.target.closest('.build-tile'); if (!t) return; select(t.dataset.key); });
    goBtn.addEventListener('click', async () => {
      if (!selected) return;
      const ref = String(getSpriteRef?.() || 1);
      goBtn.disabled = true; statusEl.textContent = 'sending…';
      const r = await act({ act: 'send', ref, bill: selected });
      goBtn.disabled = false;
      if (r?.error) { statusEl.textContent = r.error; return; }
      statusEl.textContent = `#${ref} set out to gather what ${labelOf(selected).toLowerCase()} is made of.`;
      toast?.(`#${ref} is building ${labelOf(selected).toLowerCase()}`);
    });
    $('build-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }
  function select(key) {
    selected = key;
    lastGridKey = '';   // the 'on' tile moved
    renderGrid(); renderDetail();
  }
  function update(state) {
    if (!modal || !state) return;
    materials = state.materials || materials;
    have = pooled(state);
    freePanel = (state.built || []).some((b) => b.kind === 'panel' && b.free);
    spriteCount = (state.sprites || []).length;
    if (modal.hidden) { lastGridKey = ''; return; }   // draw on open, not on every poll
    renderGrid(); renderDetail();
  }
  function open(key) {
    if (!modal) return;
    modal.hidden = false;
    if (key) selected = key;
    if (!selected) selected = catalog()[0]?.key || null;
    lastGridKey = '';
    renderGrid(); renderDetail();
    if (!praf) tick();
  }
  function close() { if (modal) modal.hidden = true; cancelAnimationFrame(praf); praf = 0; }
  const toggle = () => (modal?.hidden ? open() : close());
  const isOpen = () => !!modal && !modal.hidden;
  return { mount, update, open, close, toggle, isOpen };
}
