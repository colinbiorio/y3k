// THE CHECKLIST — the sprites' task list.
//
// Colin's spec: "task list for the sprites contains a well organized, tactile
// task list with all of the abilities for your sprites." So: every sprite down
// the left, and for the one you pick, every single thing it can be asked to do
// as a row you can act on right there — with what it is doing NOW at the top,
// marked as in hand. Nothing here is new power: each row goes through the same
// act:'…' door the hands panel uses, so the mind and its host still reach the
// society the same way. The rows are the abilities; the panel is the summary.
import { BUILDS } from './ores.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIRS = ['', 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const labelOf = (key) => { const l = String(BUILDS[key]?.label || key).replace(/^an? /, ''); return l.charAt(0).toUpperCase() + l.slice(1); };

export function createTasksWindow({ act, toast, onSelect } = {}) {
  const $ = (id) => document.getElementById(id);
  let modal, railEl, listEl, headEl, statusEl;
  let sprites = [], materials = {}, species = {}, vehicles = {}, built = [], neighbours = [], myAsk = null;
  let selected = null, lastKey = '';

  const sel = () => sprites.find((s) => s.n === selected) || sprites[0] || null;
  const idleRigs = () => built.filter((b) => b.kind === 'vehicle' && b.hitched == null).map((b) => b.of);
  const doing = (s) => !s.job ? 'home on its panel'
    : s.job.making ? `making ${s.job.making} · ${s.job.doneIn > 90 ? Math.round(s.job.doneIn / 60) + 'h' : s.job.doneIn + 'm'} left`
    : s.job.phase === 'walk' ? `walking back · ${s.job.away} out`
    : `${s.job.looking} · ${s.job.walked} walked`;

  const matOpts = (cls) => Object.entries(materials).map(([k, m]) => `<option value="${k}">${esc(m.label)}${cls === 'send' && m.walk ? ` — ${esc(m.walk)}` : ''}</option>`).join('');

  function render() {
    const s = sel();
    const key = JSON.stringify([sprites, built, neighbours, myAsk, selected, Object.keys(species), Object.keys(materials)]);
    if (key === lastKey) return;
    lastKey = key;
    railEl.innerHTML = sprites.map((sp) =>
      `<button type="button" class="task-sprite${s && sp.n === s.n ? ' on' : ''}" data-n="${sp.n}">` +
      `<span class="task-sprite-name">${esc(sp.name)}</span><span class="task-sprite-state">${esc(doing(sp))}</span>` +
      `<span class="task-sprite-carry">${sp.carrying}/${sp.capacity || 50}</span></button>`).join('') +
      `<button type="button" class="task-sprite task-society${selected === 'society' ? ' on' : ''}" data-n="society">` +
      `<span class="task-sprite-name">your people</span><span class="task-sprite-state">what the whole society asks and sows</span></button>`;
    if (selected === 'society') { renderSociety(); return; }
    if (!s) { headEl.textContent = 'no sprites yet'; listEl.innerHTML = ''; return; }
    headEl.innerHTML = `<b>${esc(s.name)}</b> <span class="muted">· ${esc(doing(s))}</span>`;
    const home = !s.job;
    const row = (title, body, { on = false, off = false } = {}) =>
      `<div class="task-row${on ? ' doing' : ''}${off ? ' off' : ''}"><span class="task-mark"></span><div class="task-body"><div class="task-title">${title}</div>${body}</div></div>`;
    listEl.innerHTML = [
      // what it is doing now sits first, ticked
      s.job ? row('Doing now', `<div class="task-line">${esc(doing(s))}${s.job.dug ? ` · ${s.job.dug} dug` : ''}</div>` +
        `<div class="task-acts"><button type="button" class="login-alt" data-act="home">call it home</button></div>`, { on: true }) : '',
      row('Go and find a material', `<div class="task-acts">` +
        `<select class="t-mat" aria-label="material">${matOpts('send')}</select>` +
        `<input class="t-qty" value="8" size="3" aria-label="how many"> ` +
        `<select class="t-dir" aria-label="direction">${DIRS.map((d) => `<option value="${d}">${d || 'anywhere'}</option>`).join('')}</select>` +
        `<button type="button" class="create-go small" data-act="send">send</button></div>` +
        `<div class="task-line muted">it senses 27 blocks around itself and sinks test pits for what is buried</div>`, { off: !home }),
      row('Build something', `<div class="task-acts wrap">${Object.keys(BUILDS).map((b) =>
        `<button type="button" class="login-alt" data-act="bill" data-bill="${esc(b)}">${esc(labelOf(b))}</button>`).join('')}</div>` +
        `<div class="task-line muted">it gathers what the thing is made of — drawing first on your stores — and builds it at the right forge</div>`, { off: !home }),
      row('Carry something to a neighbour', neighbours.length
        ? `<div class="task-acts"><select class="t-gmat" aria-label="what">${matOpts('give')}</select><input class="t-gqty" value="1" size="3" aria-label="how many"> ` +
          `<select class="t-to" aria-label="to whom">${neighbours.map((n) => `<option value="${esc(n.handle)}">@${esc(n.handle)}</option>`).join('')}</select>` +
          `<button type="button" class="login-alt" data-act="give">carry it over</button></div>`
        : `<div class="task-line muted">no society within sight — the only way a material crosses between peoples</div>`, { off: !home || !neighbours.length }),
      row('Hitch a vehicle', s.vehicle
        ? `<div class="task-line">hauling ${esc(vehicles[s.vehicle]?.label || s.vehicle)} · ${s.speed} blocks a second at this load</div>` +
          (home ? `<div class="task-acts"><button type="button" class="login-alt" data-act="hitch">let it go</button></div>` : '')
        : idleRigs().length
          ? `<div class="task-acts">${idleRigs().map((k) => `<button type="button" class="login-alt" data-act="hitch" data-kind="${esc(k)}">hitch ${esc(vehicles[k]?.label || k)}</button>`).join('')}</div>`
          : `<div class="task-line muted">nothing in the yard to hitch — build a cart or a rover</div>`, { on: !!s.vehicle, off: !home && !s.vehicle }),
      row('Put what it carries in the stores', s.carrying
        ? `<div class="task-line">${Object.entries(s.inv || {}).map(([k, v]) => `${v} ${esc(materials[k]?.label || k)}`).join(', ')}</div>` +
          `<div class="task-acts"><button type="button" class="login-alt" data-act="stow">put it down</button></div>`
        : `<div class="task-line muted">its hands are empty</div>`, { off: !s.carrying || !home }),
      row('Take something from the stores', (() => {
        const units = built.filter((b) => b.kind === 'storage');
        const chips = units.flatMap((u, i) => Object.entries(u.hold || {}).map(([k, v]) =>
          `<button type="button" class="hand-chip give" data-act="draw" data-mat="${esc(k)}" data-qty="${v}" title="from ${esc(u.of || 'a')} storage">` +
          `<i style="background:${esc(materials[k]?.color || '#888')}"></i>${v} ${esc(materials[k]?.label || k)} <b>→</b></button>`));
        if (!units.length) return `<div class="task-line muted">nowhere to take anything from yet — build a storage unit</div>`;
        if (!chips.length) return `<div class="task-line muted">the stores are empty</div>`;
        return `<div class="task-acts wrap">${chips.join('')}</div><div class="task-line muted">tap one and it goes into its hands — only while it is home</div>`;
      })(), { off: !home || !built.some((b) => b.kind === 'storage' && Object.keys(b.hold || {}).length) }),
      row('Sow a seed where it stands', Object.keys(species).length
        ? `<div class="task-acts"><select class="t-seed" aria-label="what to sow">${Object.entries(species).map(([k, sp]) => `<option value="${k}">${esc(sp.label)}${sp.wood ? ` — ${sp.wood} wood` : ''}</option>`).join('')}</select>` +
          `<button type="button" class="login-alt" data-act="sow">sow it</button></div>` +
          `<div class="task-line muted">it grows on the real clock and refuses where it cannot live</div>`
        : `<div class="task-line muted">nothing here can be sown yet</div>`, { off: !Object.keys(species).length }),
      row('Give it a name', `<div class="task-acts"><input class="t-name" value="${esc(s.name)}" maxlength="24" aria-label="name"><button type="button" class="login-alt" data-act="name">name it</button></div>`),
      row('Call it home', `<div class="task-acts"><button type="button" class="login-alt" data-act="home">${home ? 'it is home' : 'call home'}</button></div>`, { off: home }),
    ].join('');
  }

  function renderSociety() {
    headEl.innerHTML = `<b>your people</b> <span class="muted">· ${sprites.length} sprites</span>`;
    listEl.innerHTML =
      `<div class="task-row${myAsk ? ' doing' : ''}"><span class="task-mark"></span><div class="task-body"><div class="task-title">Say what your people need</div>` +
      (myAsk ? `<div class="task-line">you are asking for <b>${esc(myAsk)}</b> — every society in sight can see it</div><div class="task-acts"><button type="button" class="login-alt" data-act="unask">stop asking</button></div>`
        : `<div class="task-acts"><select class="t-askmat" aria-label="what you need">${matOpts('ask')}</select><button type="button" class="login-alt" data-act="ask">say we need it</button></div>`) +
      `<div class="task-line muted">one need at a time; a neighbour with it can carry it over</div></div></div>` +
      `<div class="task-row"><span class="task-mark"></span><div class="task-body"><div class="task-title">Plant on the home ground</div>` +
      (Object.keys(species).length
        ? `<div class="task-acts"><select class="t-seed" aria-label="what to sow">${Object.entries(species).map(([k, sp]) => `<option value="${k}">${esc(sp.label)}${sp.wood ? ` — ${sp.wood} wood` : ''}</option>`).join('')}</select><button type="button" class="login-alt" data-act="plant">plant it</button></div>`
        : `<div class="task-line muted">nothing here can be sown yet</div>`) +
      `<div class="task-line muted">wood is the only thing on this planet that grows back</div></div></div>`;
  }

  async function run(body) {
    statusEl.textContent = '…';
    const r = await act(body);
    statusEl.textContent = r?.error ? r.error : (r?.ok === false ? 'it did not go' : 'done');
    if (!r?.error) lastKey = '';   // the next poll redraws with the new state
    return r;
  }

  function mount() {
    modal = $('tasks'); if (!modal) return;
    railEl = modal.querySelector('.tasks-rail'); listEl = modal.querySelector('.tasks-list');
    headEl = modal.querySelector('.tasks-head'); statusEl = modal.querySelector('.tasks-status');
    $('tasks-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    railEl.addEventListener('click', (e) => {
      const b = e.target.closest('.task-sprite'); if (!b) return;
      selected = b.dataset.n === 'society' ? 'society' : Number(b.dataset.n);
      if (selected !== 'society') onSelect?.(selected);
      lastKey = ''; render();
    });
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const s = sel(); const ref = s ? String(s.n) : null;
      const q = (c) => listEl.querySelector(c);
      const a = b.dataset.act;
      if (a === 'send') run({ act: 'send', ref, material: q('.t-mat')?.value, qty: Number(q('.t-qty')?.value) || 8, toward: q('.t-dir')?.value || null });
      else if (a === 'bill') run({ act: 'send', ref, bill: b.dataset.bill });
      else if (a === 'give') run({ act: 'give', ref, name: q('.t-to')?.value, material: q('.t-gmat')?.value, qty: Number(q('.t-gqty')?.value) || 1 });
      else if (a === 'hitch') run({ act: 'hitch', ref, material: b.dataset.kind || null });
      else if (a === 'stow') run({ act: 'stow', ref });
      else if (a === 'draw') run({ act: 'draw', ref, material: b.dataset.mat, qty: Number(b.dataset.qty) || undefined });
      else if (a === 'sow') run({ act: 'plant', ref, material: q('.t-seed')?.value });
      else if (a === 'plant') run({ act: 'plant', material: q('.t-seed')?.value });
      else if (a === 'name') run({ act: 'name', ref, name: q('.t-name')?.value });
      else if (a === 'home') run({ act: 'home', ref });
      else if (a === 'ask') run({ act: 'ask', material: q('.t-askmat')?.value });
      else if (a === 'unask') run({ act: 'ask', material: 'nothing' });
    });
  }
  function update(state) {
    if (!modal || !state) return;
    sprites = state.sprites || []; materials = state.materials || materials; species = state.species || species;
    vehicles = state.vehicles || vehicles; built = state.built || []; neighbours = state.near || []; myAsk = state.ask ?? null;
    if (selected === null && sprites.length) selected = sprites[0].n;
    if (modal.hidden) { lastKey = ''; return; }
    render();
  }
  function open(n) { if (!modal) return; if (n) selected = n; modal.hidden = false; lastKey = ''; render(); }
  function close() { if (modal) modal.hidden = true; }
  const toggle = () => (modal?.hidden ? open() : close());
  const isOpen = () => !!modal && !modal.hidden;
  return { mount, update, open, close, toggle, isOpen, select: (n) => { selected = n; lastKey = ''; if (!modal?.hidden) render(); } };
}
