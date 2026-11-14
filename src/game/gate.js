// gate.js — THE WORLD TAB'S DOOR. The tab holds two worlds for now: the void
// (the game: GAME.md) and the societies (the world that was here first, kept
// whole and one press away). It opens on the one the person was last in; the
// first time, the void.
//
// The void's code is fetched the first time it is wanted and not before, so
// the page's start does not pay for a game nobody has opened. If the void
// cannot be drawn on this machine (no canvas to be had), the door says so and
// opens the societies instead, and the next visit tries again.
import { loadWhich, saveWhich } from './state.js';

const pageStore = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function createWorldGate({ societies, loadVoid = () => import('./view.js'), toast = () => {}, storage = pageStore() } = {}) {
  let which = loadWhich(storage), grid = null, isOpen = false, view = null, token = 0;
  async function openVoid() {
    const mine = ++token;
    grid.innerHTML = '';
    try {
      if (!view) { const m = await loadVoid(); view = view || m.createGameView({ toast, storage, toSocieties: () => go('societies') }); }
      if (mine !== token || !isOpen || which !== 'void') return;     // they left, or chose the other world, while it was fetched
      view.open(grid);
    } catch (err) {
      try { view?.close(); } catch { /* it never opened */ }
      if (mine !== token || !isOpen) return;
      globalThis.console?.warn?.('the void could not open:', err);
      which = 'societies';                                           // for this visit only: not kept
      toast('the void could not be drawn here. the societies instead.');
      societies.open(grid);
    }
  }
  function show() { if (which === 'void') openVoid(); else { token += 1; societies.open(grid); } }
  function hide() { token += 1; try { view?.close(); } catch { /* gone already */ } societies.close(); }
  function open(g) {
    grid = g;
    if (isOpen) return;                                              // the rail's world glyph, pressed while the world is open
    isOpen = true; show();
  }
  function close() { const was = isOpen; isOpen = false; if (was) hide(); else societies.close(); }
  function go(next) {
    const to = next === 'societies' ? 'societies' : 'void';
    if (to === which && isOpen) return;
    which = to; saveWhich(storage, which);
    if (isOpen) { hide(); show(); }
  }
  return { open, close, go, which: () => which, isOpen: () => isOpen };
}
