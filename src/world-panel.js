// THE CONTROL PANEL — the society's hands, in the person's hands.
//
// Every action the presence can take on its sprites, the owner can take too.
// That was the ask, and it is also the honest shape of this place: the mind and
// its host look at the same society and reach it the same way. Nothing here can
// do anything the presence could not do in a thought.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DIRS = ['', 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export function createControlPanel({ act, toast }) {
  let root = null;
  let selected = null;     // sprite number, 1-based
  let sprites = [];
  let materials = {};
  let bills = {};
  let built = [];          // panels, forges, storage units on the home ground
  let openStore = null;    // which storage unit's contents are showing
  let species = {};        // what this ground could be sown with

  function mount(parent) {
    root = document.createElement('div');
    root.className = 'hands';
    root.innerHTML = `
      <button type="button" class="hands-toggle login-alt">your hands</button>
      <div class="hands-body">
        <div class="hands-list"></div>
        <div class="hands-acts" hidden></div>
        <div class="hands-home"></div>
      </div>`;
    parent.appendChild(root);
    root.querySelector('.hands-toggle').addEventListener('click', () => {
      const b = root.querySelector('.hands-body');
      b.hidden = !b.hidden;
    });
    // one delegated listener for the whole panel — rows come and go every poll
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('hand-name')) { e.target.blur(); }
    });
    return root;
  }

  function onClick(e) {
    const row = e.target.closest('.hand-row');
    if (row && !e.target.classList.contains('hand-name')) {
      const n = Number(row.dataset.n);
      selected = selected === n ? null : n;
      render();
      return;
    }
    const store = e.target.closest('[data-store]');
    if (store) {
      const i = Number(store.dataset.store);
      openStore = openStore === i ? null : i;
      render();
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'stow') { run({ act: 'stow', ref: String(selected) }); return; }
    if (b.dataset.act === 'plant') {
      run({ act: 'plant', material: root.querySelector('.hand-seed')?.value });
      return;
    }
    const sp = sprites.find((s) => s.n === selected);
    if (!sp) return;
    if (b.dataset.act === 'home') { run({ act: 'home', ref: String(sp.n) }); return; }
    if (b.dataset.act === 'bill') { run({ act: 'send', ref: String(sp.n), bill: b.dataset.bill, toward: dirValue() }); return; }
    if (b.dataset.act === 'send') {
      const mat = root.querySelector('.hand-mat')?.value;
      const qtyRaw = root.querySelector('.hand-qty')?.value;
      if (!mat) return;
      run({ act: 'send', ref: String(sp.n), material: mat, qty: qtyRaw === 'max' ? 'max' : Number(qtyRaw) || 8, toward: dirValue() });
    }
  }

  function dirValue() { return root.querySelector('.hand-dir')?.value || null; }

  function onChange(e) {
    if (!e.target.classList.contains('hand-name')) return;
    const n = Number(e.target.closest('.hand-row').dataset.n);
    run({ act: 'name', ref: String(n), name: e.target.value.trim() });
  }

  async function run(body) {
    const r = await act(body);
    if (r?.error) { toast?.(r.error); return; }
    if (r?.built) built = r.built;
    if (r?.sprites) { sprites = r.sprites; render(); }
  }

  function update(next, matInfo, billInfo, builtInfo, speciesInfo) {
    if (builtInfo) built = builtInfo;
    if (speciesInfo) species = speciesInfo;
    // don't yank a name field out from under someone mid-edit
    const editing = root?.contains(document.activeElement) && document.activeElement.classList?.contains('hand-name');
    sprites = next || [];
    if (matInfo) materials = matInfo;
    if (billInfo) bills = billInfo;
    if (!editing) render();
  }

  function render() {
    if (!root) return;
    const list = root.querySelector('.hands-list');
    const acts = root.querySelector('.hands-acts');
    root.querySelector('.hands-toggle').textContent = `your hands · ${sprites.length}`;

    list.innerHTML = sprites.map((s) => {
      const state = !s.job ? 'home on its panel'
        : s.job.making ? `inside, making ${s.job.making} · ${s.job.doneIn > 90 ? Math.round(s.job.doneIn / 60) + 'h' : s.job.doneIn + 'm'} left`
        : s.job.phase === 'walk' ? `walking back · ${s.job.away} out`
        : `${s.job.looking} · ${s.job.walked} walked`;
      return `<div class="hand-row${s.n === selected ? ' on' : ''}" data-n="${s.n}">
        <input class="hand-name" value="${esc(s.name)}" maxlength="24" aria-label="name">
        <span class="hand-state">${esc(state)}</span>
        <span class="hand-carry">${s.carrying}/50</span>
      </div>`;
    }).join('') || '<div class="hand-empty muted">no sprites yet</div>';

    const sp = sprites.find((s) => s.n === selected);
    acts.hidden = !sp;
    if (!sp) { renderHome(); return; }

    const inv = Object.entries(sp.inv || {});
    const matOpts = Object.entries(materials)
      .map(([k, m]) => `<option value="${k}">${esc(m.label)} — ${esc(m.walk)}</option>`).join('');
    acts.innerHTML = `
      <div class="hand-inv">${inv.length
        ? inv.map(([k, v]) => `<span class="hand-chip"><i style="background:${esc(materials[k]?.color || '#888')}"></i>${v} ${esc(materials[k]?.label || k)}</span>`).join('')
        : '<span class="muted">carrying nothing</span>'}</div>
      ${sp.job ? `<div class="hand-line muted">out ${sp.job.away} blocks, ${sp.job.dug} dug</div>` : ''}
      <div class="hand-send">
        <select class="hand-mat" aria-label="material">${matOpts}</select>
        <input class="hand-qty" value="8" size="3" aria-label="how many">
        <select class="hand-dir" aria-label="direction">${DIRS.map((d) => `<option value="${d}">${d || 'anywhere'}</option>`).join('')}</select>
        <button type="button" class="create-go small" data-act="send">send</button>
      </div>
      <div class="hand-row2">
        ${Object.keys(bills).map((b) => `<button type="button" class="login-alt" data-act="bill" data-bill="${esc(b)}">${esc(b === 'sprite' ? 'forge a new sprite' : 'send for a ' + b)}</button>`).join('')}
        ${sp.carrying ? '<button type="button" class="login-alt" data-act="stow">put it in the stores</button>' : ''}
        <button type="button" class="login-alt" data-act="home">call home</button>
      </div>`;
    renderHome();
  }

  // What stands on the home ground. A storage unit opens to show what is in it.
  function renderHome() {
    const el = root.querySelector('.hands-home');
    if (!el) return;
    const stores = built.filter((b) => b.kind === 'storage');
    const panels = built.filter((b) => b.kind === 'panel');
    const freeP = panels.filter((p) => p.free).length;
    if (!built.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="hand-ground">
        <span class="hand-b">the forge</span><span class="hand-b">the solar forge</span><span class="hand-b">the ai forge</span>
        <span class="hand-b">${panels.length} panel${panels.length === 1 ? '' : 's'}${freeP ? ` · ${freeP} empty` : ''}</span>
      </div>
      ${Object.keys(species).length ? `<div class="hand-send">
        <select class="hand-seed" aria-label="what to sow">${Object.entries(species)
          .map(([k, sp]) => `<option value="${k}">${esc(sp.label)}${sp.wood ? ` — ${sp.wood} wood` : ''}</option>`).join('')}</select>
        <button type="button" class="login-alt" data-act="plant">plant it</button>
      </div>` : ''}
      ${stores.length ? stores.map((u, i) => `
        <div class="hand-store" data-store="${i}">
          <span>${esc(u.of || 'a')} storage · ${u.slots}/${u.maxSlots} slots</span>
          ${openStore === i ? `<div class="hand-inv">${Object.entries(u.hold || {}).length
            ? Object.entries(u.hold).map(([k, v]) => `<span class="hand-chip"><i style="background:${esc(materials[k]?.color || '#888')}"></i>${v} ${esc(materials[k]?.label || k)}</span>`).join('')
            : '<span class="muted">empty</span>'}</div>` : ''}
        </div>`).join('')
        : '<div class="hand-store muted">nowhere to put anything down yet</div>'}`;
  }

  return { mount, update, select: (n) => { selected = n; render(); }, selected: () => selected };
}
