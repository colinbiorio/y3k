// ============================================================================
// glass-select.js — y3k'S DROPDOWN. Every <select> on the site was the
// browser's own: a grey system list dropped over frosted glass and liquid
// metal. This wears a select in the room's glass instead — a button showing
// the choice, and a list of the options under it, each with a line of
// description where there is one, a filter when there are many, and, where
// asked for, a way to type a choice the list does not have.
//
// THE SELECT STAYS THE SOURCE OF TRUTH. It is kept (hidden) in the page; the
// list writes its value and fires its 'change', and whatever already read or
// set it — Settings, y3kode's toolbar — goes on working unchanged. Setting its
// value from code, or replacing its options, redraws the button.
//
//   glassSelect(select, {
//     describe: (option) => string,        a line under each option (default: data-desc)
//     other: { label, placeholder, pick(text) }   "Another model…", typed
//   }) -> the wrapper element, in the select's place
// ============================================================================

const FILTER_FROM = 9;   // options before the list grows a filter

export function glassSelect(sel, { describe = null, other = null } = {}) {
  if (!sel || sel.__glass) return sel?.__glass || null;
  const doc = sel.ownerDocument || document;
  const wrap = doc.createElement('span');
  wrap.className = 'gs';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'gs-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  if (sel.title) btn.title = sel.title;
  const text = doc.createElement('span');
  text.className = 'gs-text';
  const chev = doc.createElement('span');
  chev.className = 'gs-chev';
  chev.setAttribute('aria-hidden', 'true');
  chev.textContent = '⌄';
  btn.append(text, chev);
  if (sel.parentNode) sel.parentNode.replaceChild(wrap, sel);
  sel.classList.add('gs-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  wrap.append(sel, btn);
  sel.__glass = wrap;

  const desc = (o) => (describe ? describe(o) : o.dataset?.desc) || '';
  // its options, read live each time (a select whose list is replaced is still this one)
  const optionsOf = () => (sel.options ? [...sel.options] : [...(sel.children || sel.childNodes || [])].filter((n) => n.tagName === 'OPTION'));
  const current = () => { const os = optionsOf(); return os.find((o) => o.selected) || os.find((o) => o.value === sel.value) || os[0] || null; };
  function refresh() {
    const o = current();
    const t = o ? o.textContent : '';
    if (text.textContent !== t) text.textContent = t;
    btn.disabled = !!sel.disabled;
  }
  refresh();
  // value set from code redraws the button (no 'change' fires for that)
  const proto = typeof HTMLSelectElement === 'function' ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value') : null;
  if (proto?.set) {
    Object.defineProperty(sel, 'value', { configurable: true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); refresh(); } });
  }
  sel.addEventListener('change', refresh);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  }

  let pop = null, active = -1, rows = [], typing = false;
  function close({ focus = false } = {}) {
    if (!pop) return;
    pop.remove(); pop = null; rows = []; active = -1; typing = false;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', place);
    if (focus) btn.focus();
  }
  function outside(e) { if (pop && !pop.contains(e.target) && !wrap.contains(e.target)) close(); }
  function pick(value) {
    if (sel.value !== value) {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close({ focus: true });
  }
  function place() {
    if (!pop) return;
    const r = btn.getBoundingClientRect();
    const w = Math.max(r.width, 230);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    pop.style.minWidth = w + 'px';
    pop.style.left = left + 'px';
    const below = window.innerHeight - r.bottom - 12;
    if (below < 220 && r.top > below) { pop.style.top = ''; pop.style.bottom = (window.innerHeight - r.top + 6) + 'px'; pop.style.maxHeight = Math.max(160, r.top - 18) + 'px'; }
    else { pop.style.bottom = ''; pop.style.top = (r.bottom + 6) + 'px'; pop.style.maxHeight = Math.max(160, below) + 'px'; }
  }
  function highlight(i) {
    active = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((r, k) => r.classList.toggle('active', k === active));
    rows[active]?.scrollIntoView?.({ block: 'nearest' });
  }
  function build(filter = '') {
    const list = pop.querySelector('.gs-list');
    list.textContent = '';
    rows = [];
    const f = filter.trim().toLowerCase();
    for (const o of optionsOf()) {
      if (o.hidden) continue;
      const d = desc(o);
      if (f && !(o.textContent.toLowerCase().includes(f) || d.toLowerCase().includes(f) || o.value.toLowerCase().includes(f))) continue;
      const row = doc.createElement('div');
      row.className = 'gs-opt' + (o.selected ? ' on' : '') + (o.disabled ? ' off' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(o.selected));
      const t = doc.createElement('span');
      t.className = 'gs-label';
      t.textContent = o.textContent;
      row.append(t);
      if (d) { const ds = doc.createElement('span'); ds.className = 'gs-desc'; ds.textContent = d; row.append(ds); }
      if (!o.disabled) {
        row.addEventListener('click', () => pick(o.value));
        row.addEventListener('pointermove', () => highlight(rows.indexOf(row)));
        rows.push(row);
      }
      list.append(row);
    }
    if (other) {
      const row = doc.createElement('div');
      row.className = 'gs-opt gs-other';
      row.setAttribute('role', 'option');
      row.textContent = other.label || 'Another…';
      row.addEventListener('click', () => askOther());
      row.addEventListener('pointermove', () => highlight(rows.indexOf(row)));
      rows.push(row);
      list.append(row);
    }
    if (!rows.length) { const none = doc.createElement('div'); none.className = 'gs-none'; none.textContent = 'Nothing matches'; list.append(none); }
    const on = rows.findIndex((r) => r.classList.contains('on'));
    highlight(on >= 0 ? on : 0);
  }
  // "Another model…": the row becomes a field; Enter takes what was typed
  function askOther() {
    const row = rows[rows.length - 1];
    if (!row || typing) return;
    typing = true;
    row.textContent = '';
    const input = doc.createElement('input');
    input.className = 'gs-input';
    input.placeholder = other.placeholder || '';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const v = input.value.trim(); if (v) { close({ focus: true }); other.pick(v); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ focus: true }); }
    });
    row.append(input);
    input.focus();
  }
  function open() {
    if (pop || sel.disabled) return;
    pop = doc.createElement('div');
    pop.className = 'gs-pop';
    pop.setAttribute('role', 'listbox');
    const many = optionsOf().length >= FILTER_FROM;
    if (many) {
      const f = doc.createElement('input');
      f.className = 'gs-filter';
      f.placeholder = 'Filter…';
      f.spellcheck = false;
      f.autocomplete = 'off';
      f.addEventListener('input', () => build(f.value));
      f.addEventListener('keydown', keys);
      pop.append(f);
    }
    const list = doc.createElement('div');
    list.className = 'gs-list';
    pop.append(list);
    pop.addEventListener('keydown', keys);
    doc.body.append(pop);
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    build();
    place();
    (pop.querySelector('.gs-filter') || btn).focus();
    doc.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', place);
  }
  function keys(e) {
    if (!pop || typing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); rows[active]?.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ focus: true }); }
    else if (e.key === 'Tab') close();
  }
  btn.addEventListener('click', () => (pop ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (pop) { keys(e); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  });
  return wrap;
}

// Every <select> under `root` that is not yet glass. Settings calls this once
// it has built its panes.
export function glassSelectAll(root, opts) {
  for (const sel of root.querySelectorAll('select')) if (!sel.__glass) glassSelect(sel, opts);
}
