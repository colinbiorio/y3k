// chooser.js — THE BODY SHEET: which of the five kinds of body the person is,
// and how it looks. Colin, 13 Nov 2026: "5 different types of customizable
// characters ... all should have 5 different types of customization, with 5
// subset levels".
//
// The sheet itself is in index.html (#game-body), a .modal like the others,
// so the page's keeper of sheets (inert-hidden.js) gives it what it gives
// them: the page behind it goes still, the focus comes in and goes home,
// Escape closes it. Unlike the others it does not cover what it is about: the
// body stands in what the sheet leaves of the canvas, turned to face the
// person, and is made again as it is chosen (view.js).
//
// Each row is a group of five where one is chosen: Tab goes from row to row,
// the arrow keys go along a row and choose as they go.
import { KINDS, kindOf, freshLook, randomLook, swatchOf } from './kinds.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the picture a kind was drawn from
export const cardOf = (id) => new URL(`./art/v1/${kindOf(id).id}.webp`, import.meta.url).href;

// which of `options` a key goes to from `now` (the arrows go round), or null for a key that is not one of them
export function stepTo(options, now, key) {
  const n = options.length, i = Math.max(0, options.indexOf(now));
  if (key === 'ArrowRight' || key === 'ArrowDown') return options[(i + 1) % n];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return options[(i + n - 1) % n];
  if (key === 'Home') return options[0];
  if (key === 'End') return options[n - 1];
  return null;
}
// what the sheet shows for a kind as it looks: its five choices, the five options of each, the one that is on,
// and the colours of the options that are colours
export function rowsOf(kind, look) {
  const k = kindOf(kind);
  return k.choices.map((c) => ({ id: c.id, options: c.options.map((o) => ({ id: o, on: look?.[c.id] === o, swatch: swatchOf(k.id, c.id, o) })) }));
}

// WHERE THE BODY STANDS WHILE THE SHEET IS OPEN. The sheet takes one side of the room (its right, or its foot on
// a phone); the body is shown in the larger of what is left beside it and what is left over it. `canvas`, `room`
// and `sheet` are rectangles on the page ({ left, top, right, bottom }): the canvas is the whole picture, the room
// is the part of it that is seen (the page's frame stands over the rest).
// Answers how far the picture is slid ([x, y] in px: the body, which is at its middle, goes left by x and up by
// y) and how far back the eye stands for a body `tall` and `wide` (metres) to fit.
export const FILL = [0.86, 0.9];          // how much of the height and of the width of what is left a body may take
export function standIn(canvas, room, sheet, { fov = 55, tall = 1.8, wide = 1.4 } = {}) {
  const W = canvas.right - canvas.left, H = canvas.bottom - canvas.top;
  if (!(W > 0) || !(H > 0)) return { x: 0, y: 0, d: 4 };
  const R = { x0: Math.max(canvas.left, room.left), x1: Math.min(canvas.right, room.right), y0: Math.max(canvas.top, room.top), y1: Math.min(canvas.bottom, room.bottom) };
  const area = (r) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  const all = area(R) > 0 ? R : { x0: canvas.left, x1: canvas.right, y0: canvas.top, y1: canvas.bottom };        // a room that is not there: the canvas
  const beside = { ...all, x1: Math.max(all.x0, Math.min(all.x1, sheet.left)) }, over = { ...all, y1: Math.max(all.y0, Math.min(all.y1, sheet.top)) };
  let r = area(beside) >= area(over) ? beside : over;
  if (!(area(r) > 0)) r = all;                                                                                   // the sheet is over all of it: the middle
  const w = r.x1 - r.x0, h = r.y1 - r.y0, t = Math.tan((fov * Math.PI) / 360);
  const d = Math.max((tall * H) / (2 * t * FILL[0] * h), (wide * H) / (2 * t * FILL[1] * w));
  return { x: (canvas.left + canvas.right) / 2 - (r.x0 + r.x1) / 2, y: (canvas.top + canvas.bottom) / 2 - (r.y0 + r.y1) / 2, d: Math.min(16, Math.max(1.6, d)) };
}

// `get()` answers { kind, look } as they are now; `set(kind, look)` makes the body again (a null look: as that kind
// was last made to look); `turn(by)` turns it where it stands, by so many radians to its left.
export function createChooser({ doc = globalThis.document, get, set, turn = () => {}, onClose = () => {} } = {}) {
  const sheet = doc?.getElementById?.('game-body'), bodyEl = doc?.getElementById?.('game-body-body'), x = doc?.getElementById?.('game-body-close');
  if (!sheet || !bodyEl) return { open() {}, close() {}, isOpen: () => false, rect: () => null, off() {} };
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
  const radio = (cls, data, isOn, inner) => `<button type="button" role="radio" class="${cls}${isOn ? ' on' : ''}" ${data} aria-checked="${isOn}" tabindex="${isOn ? 0 : -1}">${inner}</button>`;

  // the five kinds are drawn once (their pictures are not fetched again at every choice), the rows at every choice
  function frame() {
    bodyEl.innerHTML = `
      <div class="body-kinds" role="radiogroup" aria-label="Kind of body">${KINDS.map((k) =>
        radio('body-kind', `data-kind="${esc(k.id)}"`, false, `<img src="${esc(cardOf(k.id))}" alt="" width="300" height="400" decoding="async" /><span>${esc(k.id)}</span>`)).join('')}</div>
      <p class="muted game-line body-line" id="game-body-line"></p>
      <div id="game-body-rows"></div>
      <div class="body-foot">
        <button type="button" class="login-alt" id="game-body-left" aria-label="Turn the body to its left">‹ turn</button>
        <button type="button" class="login-alt" id="game-body-right" aria-label="Turn the body to its right">turn ›</button>
        <button type="button" class="login-alt" id="game-body-random">surprise me</button>
        <button type="button" class="login-alt" id="game-body-fresh">as it came</button>
      </div>`;
  }
  function render() {
    const { kind, look } = get(), k = kindOf(kind);
    for (const el of bodyEl.querySelectorAll('.body-kind')) {
      const isOn = el.dataset.kind === k.id;
      el.classList.toggle('on', isOn); el.setAttribute('aria-checked', String(isOn)); el.tabIndex = isOn ? 0 : -1;
    }
    const line = bodyEl.querySelector('#game-body-line'); if (line) line.textContent = k.line;
    const rows = bodyEl.querySelector('#game-body-rows'); if (!rows) return;
    rows.innerHTML = rowsOf(k.id, look).map((r) => `<div class="body-row"><span class="body-label" id="game-body-l-${esc(r.id)}">${esc(r.id)}</span>
      <div class="body-opts" role="radiogroup" aria-labelledby="game-body-l-${esc(r.id)}">${r.options.map((o) =>
        radio(`body-opt${o.swatch ? ' dotted' : ''}`, `data-choice="${esc(r.id)}" data-option="${esc(o.id)}"`, o.on, `${o.swatch ? `<i class="body-dot" data-swatch="${esc(o.swatch.join(' '))}"></i>` : ''}<span>${esc(o.id)}</span>`)).join('')}</div></div>`).join('');
    // the colours are put on by the page's own hand: a style written into markup is not always let through
    for (const el of rows.querySelectorAll('[data-swatch]')) { const [a, b] = el.dataset.swatch.split(' '); el.style.background = b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a; }
  }
  // choose, draw again, and put the focus back on what was chosen
  function choose(kind, look, focus) {
    set(kind, look); render();
    if (focus) bodyEl.querySelector(focus)?.focus?.();
  }
  const pick = (t) => {
    const now = get();
    if (t.dataset.kind) choose(t.dataset.kind, null, `.body-kind[data-kind="${t.dataset.kind}"]`);
    else if (t.dataset.choice) choose(now.kind, { ...now.look, [t.dataset.choice]: t.dataset.option }, `.body-opt[data-choice="${t.dataset.choice}"][data-option="${t.dataset.option}"]`);
  };
  on(bodyEl, 'click', (e) => {
    const t = e.target.closest?.('button'); if (!t) return;
    if (t.dataset.kind || t.dataset.choice) { pick(t); return; }
    const now = get();
    if (t.id === 'game-body-random') choose(now.kind, randomLook(now.kind), '#game-body-random');
    else if (t.id === 'game-body-fresh') choose(now.kind, freshLook(now.kind), '#game-body-fresh');
    else if (t.id === 'game-body-left') turn(Math.PI / 4);
    else if (t.id === 'game-body-right') turn(-Math.PI / 4);
  });
  // along a row by the arrows, choosing as they go
  on(bodyEl, 'keydown', (e) => {
    const t = e.target.closest?.('[role="radio"]'); if (!t) return;
    const all = [...t.parentElement.querySelectorAll('[role="radio"]')], ids = all.map((el) => el.dataset.kind || el.dataset.option);
    const to = stepTo(ids, t.dataset.kind || t.dataset.option, e.key);
    if (to === null) return;
    e.preventDefault(); pick(all[ids.indexOf(to)]);
  });
  const close = () => { if (sheet.hidden) return; sheet.hidden = true; onClose(); };
  if (x) on(x, 'click', close);
  return {
    open() { if (!sheet.hidden) return; frame(); render(); sheet.hidden = false; },
    close,
    isOpen: () => !sheet.hidden,
    // where the sheet is on the page (view.js stands the body in what it leaves)
    rect: () => sheet.querySelector('.sheet')?.getBoundingClientRect?.() || null,
    off() { close(); for (const f of offs.splice(0)) f(); },
  };
}
