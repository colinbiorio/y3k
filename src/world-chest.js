// THE CHEST — the inventory window.
//
// Colin's spec: "a two-pane grid of all your materials on the left, items on
// the right (we don't have items yet but we will)". ALL your materials means
// all eleven the planet has, held or not — a chest that only shows what you
// happen to have tells you nothing about what you could go and get. Each tile
// says how many you hold, where (in the stores, in your sprites' hands), how
// rare it is on this planet and how far a sprite walks for it. The right pane
// is honest about items: there are none yet, and it says what is coming.
import { ALL_MATERIALS } from './ores.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createChestWindow({ toast } = {}) {
  const $ = (id) => document.getElementById(id);
  let modal, matsEl, itemsEl, sumEl;
  let materials = {}, stores = {}, hands = {}, lastKey = '';

  function tally(state) {
    stores = {}; hands = {};
    for (const b of state.built || []) for (const [k, q] of Object.entries(b.hold || {})) stores[k] = (stores[k] || 0) + (q || 0);
    for (const sp of state.sprites || []) for (const [k, q] of Object.entries(sp.inv || {})) hands[k] = (hands[k] || 0) + (q || 0);
  }
  // rarity 0–9 → one to five marks; a sprite's walk in the world's own words
  const rarityDots = (r) => { const n = Math.max(1, Math.min(5, Math.round((Number(r) || 0) / 2))); return '●'.repeat(n) + '○'.repeat(5 - n); };

  function render() {
    const keys = Object.keys(ALL_MATERIALS);
    const rows = keys.map((k) => {
      const s = stores[k] || 0, h = hands[k] || 0;
      const info = materials[k] || {};
      return { k, label: info.label || ALL_MATERIALS[k]?.label || k, color: info.color || ALL_MATERIALS[k]?.color || '#888',
        note: info.note || ALL_MATERIALS[k]?.note || '', rarity: info.rarity ?? 0, walk: info.walk || '', s, h, total: s + h };
    });
    // held first, most first; the rest alphabetical — what you have, then what is out there
    rows.sort((a, b) => (a.total && b.total) ? b.total - a.total : a.total ? -1 : b.total ? 1 : a.label.localeCompare(b.label));
    const key = JSON.stringify(rows.map((r) => [r.k, r.s, r.h]));
    if (key === lastKey) return;
    lastKey = key;
    const held = rows.filter((r) => r.total).length, total = rows.reduce((n, r) => n + r.total, 0);
    sumEl.textContent = total ? `${total} blocks · ${held} of ${rows.length} kinds` : 'nothing held yet — send a sprite out';
    matsEl.innerHTML = rows.map((r) =>
      `<div class="chest-tile${r.total ? '' : ' empty'}" title="${esc(r.note)}">` +
      `<span class="chest-top"><i class="mat-chip" style="--c:${esc(r.color)}"></i><span class="chest-label">${esc(r.label)}</span></span>` +
      `<span class="chest-count">${r.total}</span>` +
      `<span class="chest-where">${r.total ? `${r.s} in stores · ${r.h} in hands` : esc(r.walk || 'out there')}</span>` +
      `<span class="chest-rarity" title="how rare it is on this planet">${rarityDots(r.rarity)}</span>` +
      `</div>`).join('');
    itemsEl.innerHTML =
      `<div class="chest-none"><div class="chest-none-mark">◇</div>` +
      `<div>No items yet.</div>` +
      `<div class="muted">Materials are what the ground gives; items are what gets made from them. Tools, seeds, made things — they are coming, and they will land here.</div></div>`;
  }

  function mount() {
    modal = $('chest'); if (!modal) return;
    matsEl = modal.querySelector('.chest-materials'); itemsEl = modal.querySelector('.chest-items'); sumEl = modal.querySelector('.chest-sum');
    $('chest-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }
  function update(state) {
    if (!modal || !state) return;
    materials = state.materials || materials;
    tally(state);
    if (modal.hidden) { lastKey = ''; return; }
    render();
  }
  function open() { if (!modal) return; modal.hidden = false; lastKey = ''; render(); }
  function close() { if (modal) modal.hidden = true; }
  const toggle = () => (modal?.hidden ? open() : close());
  const isOpen = () => !!modal && !modal.hidden;
  return { mount, update, open, close, toggle, isOpen };
}
