// menu.js — THE CONTROLS SHEET: the mode, every key and button and what it
// does, how fast the eye turns, the light. Colin, 13 Nov 2026: "should be
// options for both controller and keyboard/mouse, with a dedicated 'controls'
// menu option from inside 'world' tab."
//
// The sheet itself is in index.html (#game-menu), a .modal like the others,
// so the page's keeper of sheets (inert-hidden.js) gives it what it gives
// them: the page behind it goes still, the focus comes in and goes home,
// Escape closes it. This fills it and listens.
//
// Changing a key: press its box, then the key (or mouse button, or controller
// button) wanted there. While a box is listening the key is taken before
// anything else on the page can hear it, so the Escape that leaves a box as
// it was does not also close the sheet.
import { ACTIONS, defaults, bindKey, bindPad, keyLabel, padLabel, saveBindings, readPad } from './input.js';
import { LIGHT_NAMES } from './lights.js';
import { MODES } from './state.js';

export const MODE_LINES = {
  survival: 'a tap jumps; held, the jump rises to twice the height, and the ground still takes you back. a dash goes any way you lean, once more in the air.',
  creative: 'all of survival, and flight: the fly key, or a second jump in the air. jump climbs, sink comes down; on the water, sink lands.',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOT_WORDS = { 0: 'first key', 1: 'second key', pad: 'controller button' };

// what a box says, and what it says to someone who cannot see it
export function cellText(b, action, slot) {
  if (slot === 'pad') return padLabel(b.pad[action]) || '—';
  return keyLabel(b.keys[action][slot]) || '—';
}

export function createMenu({ doc = globalThis.document, win = globalThis.window, input, storage, getMode, setMode, getLight, setLight, onClose = () => {} } = {}) {
  const sheet = doc?.getElementById?.('game-menu'), bodyEl = doc?.getElementById?.('game-menu-body'), x = doc?.getElementById?.('game-menu-close');
  if (!sheet || !bodyEl) return { open() {}, close() {}, isOpen: () => false, off() {} };
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
  let listening = null;                 // { action, slot } while a box waits for its key
  let padRaf = 0, padWas = null, padId = '';
  const b = () => input.bindings;
  const keep = () => { saveBindings(storage, b()); input.setBindings(b()); };

  const seg = (name, values, now, label) => `<div class="game-seg" role="group" aria-label="${esc(label)}">${values.map((v) =>
    `<button type="button" class="game-segb${v === now ? ' on' : ''}" data-${name}="${esc(v)}" aria-pressed="${v === now}">${esc(v)}</button>`).join('')}</div>`;
  const box = (action, slot, label) => {
    const hear = listening && listening.action === action && String(listening.slot) === String(slot);
    const text = hear ? (slot === 'pad' ? 'press a button…' : 'press a key…') : cellText(b(), action, slot);
    return `<span role="cell"><button type="button" class="game-key${hear ? ' hearing' : ''}" data-act="${action}" data-slot="${slot}" aria-label="${esc(`${label}, ${SLOT_WORDS[slot]}: ${hear ? 'waiting' : (text === '—' ? 'none' : text)}. Press to change`)}">${esc(text)}</button></span>`;
  };
  function render() {
    const mode = getMode(), look = b().look;
    bodyEl.innerHTML = `
      <div class="sec"><h3>mode</h3>${seg('mode', MODES, mode, 'Mode')}<p class="muted game-line">${esc(MODE_LINES[mode])}</p></div>
      <div class="sec"><h3>controls</h3>
        <p class="muted game-line">press a box, then the key, mouse button or controller button you want there. backspace empties it; esc leaves it as it was.</p>
        <div class="game-binds" role="table" aria-label="Controls">
          <div class="game-bind game-bind-head" role="row"><span role="columnheader">to</span><span role="columnheader">key</span><span role="columnheader">or</span><span role="columnheader">controller</span></div>
          <div class="game-bind" role="row"><span class="game-act" role="cell">look</span><span class="game-fixed" role="cell">the mouse</span><span class="game-fixed" role="cell">a drag</span><span class="game-fixed" role="cell">right stick</span></div>
          ${ACTIONS.map((a) => `<div class="game-bind" role="row"><span class="game-act" role="cell">${esc(a.label)}${a.note ? `<small>${esc(a.note)}</small>` : ''}</span>${box(a.id, 0, a.label)}${box(a.id, 1, a.label)}${
            a.stick ? `<span class="game-fixed" role="cell">${esc(a.stick)}</span>` : box(a.id, 'pad', a.label)}</div>`).join('')}
        </div>
        <p class="muted game-line" id="game-pad-line"></p>
      </div>
      <div class="sec"><h3>looking</h3>
        <label class="game-range"><span>mouse</span><input type="range" id="game-look-mouse" min="0.2" max="3" step="0.05" value="${look.mouse}" aria-label="How fast the mouse turns the eye" /><output>${look.mouse.toFixed(2)}</output></label>
        <label class="game-range"><span>stick</span><input type="range" id="game-look-stick" min="0.2" max="3" step="0.05" value="${look.stick}" aria-label="How fast the stick turns the eye" /><output>${look.stick.toFixed(2)}</output></label>
        <label class="game-check"><input type="checkbox" id="game-look-invert" aria-label="Invert looking up and down"${look.invertY ? ' checked' : ''} /><span>invert up and down</span></label>
      </div>
      <div class="sec"><h3>the light</h3>${seg('light', LIGHT_NAMES, getLight(), 'The light')}</div>
      <div class="sec"><button type="button" class="login-alt" id="game-defaults">back to the defaults</button></div>`;
    padLine();
  }
  function padLine() {
    const el = bodyEl.querySelector('#game-pad-line');
    if (el) el.textContent = padId ? `a controller is heard: ${padId.slice(0, 80)}` : 'no controller heard yet: press any button on it and it will be.';
  }
  // re-render, and put the focus back on the box it was on
  function redraw(focus) {
    render();
    if (focus) bodyEl.querySelector(`.game-key[data-act="${focus.action}"][data-slot="${focus.slot}"]`)?.focus?.();
  }
  function stopListening(focus = listening) { listening = null; redraw(focus); }

  on(bodyEl, 'click', (e) => {
    const t = e.target.closest?.('button');
    if (!t) return;
    if (t.dataset.mode) { setMode(t.dataset.mode); listening = null; render(); bodyEl.querySelector(`[data-mode="${getMode()}"]`)?.focus?.(); return; }
    if (t.dataset.light) { setLight(t.dataset.light); listening = null; render(); bodyEl.querySelector(`[data-light="${getLight()}"]`)?.focus?.(); return; }
    if (t.id === 'game-defaults') { const d = defaults(); input.setBindings(d); saveBindings(storage, d); listening = null; render(); bodyEl.querySelector('#game-defaults')?.focus?.(); return; }
    if (t.dataset.act) {
      const slot = t.dataset.slot === 'pad' ? 'pad' : +t.dataset.slot, same = listening && listening.action === t.dataset.act && listening.slot === slot;
      listening = same ? null : { action: t.dataset.act, slot };
      redraw({ action: t.dataset.act, slot });
    }
  });
  on(bodyEl, 'input', (e) => {
    const t = e.target, look = b().look;
    if (t.id === 'game-look-mouse' || t.id === 'game-look-stick') {
      look[t.id === 'game-look-mouse' ? 'mouse' : 'stick'] = Math.min(3, Math.max(0.2, +t.value || 1));
      const out = t.parentElement?.querySelector('output'); if (out) out.textContent = (+t.value).toFixed(2);
      keep();
    } else if (t.id === 'game-look-invert') { look.invertY = !!t.checked; keep(); }
  });
  // a listening box takes the next key before the page hears it
  on(win, 'keydown', (e) => {
    if (!listening || sheet.hidden) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    const was = listening;
    if (e.code === 'Escape') { stopListening(was); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { if (was.slot === 'pad') bindPad(b(), was.action, -1); else bindKey(b(), was.action, was.slot, ''); keep(); stopListening(was); return; }
    if (was.slot === 'pad' || /^(Meta|OS)/.test(e.code) || !e.code) return;      // a key is not a controller's button; ⌘ is the machine's
    bindKey(b(), was.action, was.slot, e.code); keep(); stopListening(was);
  }, true);
  // and a mouse button other than the left one (the left one is how boxes are pressed)
  on(sheet, 'mousedown', (e) => {
    if (!listening || listening.slot === 'pad' || e.button === 0) return;
    e.preventDefault(); e.stopPropagation();
    const was = listening;
    bindKey(b(), was.action, was.slot, 'Mouse' + e.button); keep(); stopListening(was);
  }, true);
  on(sheet, 'contextmenu', (e) => { if (listening || e.target.closest?.('.game-key')) e.preventDefault(); });

  // the controller is asked each frame while the sheet is open: is one heard, and which button went down
  function padTick() {
    padRaf = win.requestAnimationFrame(padTick);
    const p = readPad(win.navigator), id = p ? p.id : '';
    if (id !== padId) { padId = id; padLine(); }
    if (p && listening && listening.slot === 'pad' && padWas) {
      const n = p.buttons.findIndex((down, i) => down && !padWas[i]);
      if (n >= 0) { const was = listening; bindPad(b(), was.action, n); keep(); stopListening(was); }
    }
    padWas = p ? p.buttons : null;
  }
  const close = () => {
    if (sheet.hidden) return;
    listening = null; sheet.hidden = true;
    win.cancelAnimationFrame(padRaf); padRaf = 0; padWas = null;
    onClose();
  };
  if (x) on(x, 'click', close);
  on(sheet, 'mousedown', (e) => { if (e.target === sheet && !listening) close(); });   // the dark round the sheet closes it, as on the other sheets
  return {
    open() { if (!sheet.hidden) return; listening = null; render(); sheet.hidden = false; padWas = null; padRaf = win.requestAnimationFrame(padTick); },
    close,
    isOpen: () => !sheet.hidden,
    render: () => { if (!sheet.hidden) render(); },
    off() { close(); for (const f of offs.splice(0)) f(); },
  };
}
