// Shared chess board rendering: the pure pieces both boards need. The solo
// view (src/chess.js) still carries its own closure-entangled renderer — the
// design review asked for one shared renderer, and this module is that
// direction's first step: the match view builds on it now; the solo view's
// extraction is deliberate follow-up work, not a risky drive-by.

import { sq } from './chess-core.js';

export const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_SET = { p: 8, n: 2, b: 2, r: 2, q: 1 };

// What each side has captured, read off the position: the other side's missing
// men, as their own glyphs, plus the point edge next to whoever holds it.
export function materialOf(board) {
  const left = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const pc of board) {
    if (!pc || pc.toLowerCase() === 'k') continue;
    left[pc === pc.toUpperCase() ? 'w' : 'b'][pc.toLowerCase()]++;
  }
  const taken = (side) => {
    const foe = side === 'w' ? 'b' : 'w';
    const out = []; let pts = 0;
    for (const k of ['q', 'r', 'b', 'n', 'p']) {
      const n = START_SET[k] - left[foe][k];
      for (let i = 0; i < n; i++) out.push(GLYPH[foe === 'w' ? k.toUpperCase() : k]);
      if (n > 0) pts += n * PIECE_VAL[k];
    }
    return { glyphs: out.join(''), pts };
  };
  const w = taken('w'), b = taken('b');
  const net = w.pts - b.pts;
  return {
    w: { glyphs: w.glyphs, edge: net > 0 ? '+' + net : '' },
    b: { glyphs: b.glyphs, edge: net < 0 ? '+' + (-net) : '' },
  };
}

// The 64 cells as HTML, using the same classes the solo board styles.
// lastMove is a UCI string or null; flip = false puts white at the bottom.
export function cellsHtml(st, { flip = false, lastMove = null, disabled = true } = {}) {
  const lastFrom = lastMove ? sq(lastMove.slice(0, 2)) : -1;
  const lastTo = lastMove ? sq(lastMove.slice(2, 4)) : -1;
  let cells = '';
  for (let i = 0; i < 64; i++) {
    const idx = flip ? 63 - i : i;
    const p = st.board[idx];
    const dark = (Math.floor(idx / 8) + idx) % 2 === 1;
    const cls = ['chess-sq', dark ? 'dark' : 'light',
      (idx === lastFrom || idx === lastTo) ? 'last' : ''].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-i="${idx}" ${disabled ? 'disabled' : ''}>`
      + (p ? `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p]}</span>` : '') + '</button>';
  }
  return cells;
}
