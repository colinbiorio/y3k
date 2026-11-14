// state.js — WHAT THE VOID KEEPS between visits, and which world the world tab
// opens on. Small, plain, and not believed when it is not what it should be.
import { LIGHT_NAMES } from './lights.js';

export const STATE_KEY = 'y3k.game.state';
export const WHICH_KEY = 'y3k.world.which';
export const MODES = ['survival', 'creative'];
export const ZOOM = { min: 2, max: 12, start: 5.5 };

export const freshState = () => ({ mode: 'survival', light: 'pale', zoom: ZOOM.start });

export function loadState(storage) {
  const s = freshState();
  let kept = null;
  try { kept = JSON.parse(storage?.getItem?.(STATE_KEY) || 'null'); } catch { kept = null; }
  if (!kept || typeof kept !== 'object') return s;
  if (MODES.includes(kept.mode)) s.mode = kept.mode;
  if (LIGHT_NAMES.includes(kept.light)) s.light = kept.light;
  if (Number.isFinite(kept.zoom)) s.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, kept.zoom));
  return s;
}
export function saveState(storage, s) {
  try { storage?.setItem?.(STATE_KEY, JSON.stringify({ mode: s.mode, light: s.light, zoom: Math.round(s.zoom * 100) / 100 })); return true; } catch { return false; }
}

// The world tab holds two worlds for now: the void (the game, new) and the
// societies (the world that was there first, kept whole). It opens on the one
// the person was last in; the first time, the void.
export function loadWhich(storage) {
  let w = '';
  try { w = storage?.getItem?.(WHICH_KEY) || ''; } catch { w = ''; }
  return w === 'societies' ? 'societies' : 'void';
}
export function saveWhich(storage, which) {
  try { storage?.setItem?.(WHICH_KEY, which === 'societies' ? 'societies' : 'void'); return true; } catch { return false; }
}
