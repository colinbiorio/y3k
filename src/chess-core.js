// Chess, minimally: replay a list of UCI moves into a position, and emit FEN.
// This is NOT a rules engine — Lichess is the referee and every move that
// reaches us has already been judged legal. All we do is apply moves we are
// told happened, which needs only the three special cases (castling, en
// passant, promotion) and none of the hard parts (checks, pins, legality).
// Pure and dependency-free so the browser renders from it and the server
// prompts from it — one implementation, imported by both.

// Board: 64 cells in FEN order — index 0 = a8, 63 = h1. White pieces are
// uppercase (KQRBNP), black lowercase, empty = null.

export function startState() {
  const board = new Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    board[f] = back[f];                    // rank 8, black
    board[8 + f] = 'p';
    board[48 + f] = 'P';
    board[56 + f] = back[f].toUpperCase(); // rank 1, white
  }
  return {
    board,
    turn: 'w',
    castling: { K: true, Q: true, k: true, q: true },
    ep: null,        // en-passant target square index, or null
    half: 0,         // halfmove clock (for FEN completeness)
    full: 1,
  };
}

export const sq = (name) => {
  const file = name.charCodeAt(0) - 97;        // a-h
  const rank = name.charCodeAt(1) - 49;        // 1-8 (0-indexed)
  return (7 - rank) * 8 + file;
};
export const sqName = (i) => String.fromCharCode(97 + (i % 8)) + String(8 - Math.floor(i / 8));

// Apply one pre-validated UCI move ("e2e4", "e7e8q", castling as the king's
// two-square hop "e1g1"). Mutates and returns the state.
export function applyUci(st, uci) {
  const from = sq(uci.slice(0, 2)), to = sq(uci.slice(2, 4));
  const promo = uci[4] || null;
  const piece = st.board[from];
  if (!piece) return st; // out-of-sync guard: never throw mid-render
  const isPawn = piece === 'p' || piece === 'P';
  const capture = st.board[to] != null;

  // en passant: a pawn slides diagonally onto an empty square — the captured
  // pawn is BEHIND the target, not on it
  if (isPawn && to === st.ep && !capture) {
    st.board[to + (piece === 'P' ? 8 : -8)] = null;
  }

  // castling: the king moves two files; the rook teleports past it
  if ((piece === 'K' || piece === 'k') && Math.abs((to % 8) - (from % 8)) === 2) {
    const rank = Math.floor(from / 8) * 8;
    if (to % 8 === 6) { st.board[rank + 5] = st.board[rank + 7]; st.board[rank + 7] = null; } // O-O
    else { st.board[rank + 3] = st.board[rank + 0]; st.board[rank + 0] = null; }              // O-O-O
  }

  st.board[to] = promo ? (piece === 'P' ? promo.toUpperCase() : promo.toLowerCase()) : piece;
  st.board[from] = null;

  // castling rights fall away when the king or a rook first moves — or when a
  // rook is captured at home
  if (piece === 'K') { st.castling.K = st.castling.Q = false; }
  if (piece === 'k') { st.castling.k = st.castling.q = false; }
  for (const [square, right] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) {
    if (from === square || to === square) st.castling[right] = false;
  }

  // a double pawn push exposes the square it hopped over
  st.ep = isPawn && Math.abs(to - from) === 16 ? (from + to) / 2 : null;
  st.half = isPawn || capture ? 0 : st.half + 1;
  if (st.turn === 'b') st.full += 1;
  st.turn = st.turn === 'w' ? 'b' : 'w';
  return st;
}

// Replay a Lichess move list ("e2e4 e7e5 …") from the start.
export function stateFromMoves(moves) {
  const st = startState();
  const list = String(moves || '').trim().split(/\s+/).filter(Boolean);
  for (const m of list) applyUci(st, m);
  return st;
}

export function fenOf(st) {
  let placement = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { placement += empty; empty = 0; }
      placement += p;
    }
    if (empty) placement += empty;
    if (r < 7) placement += '/';
  }
  const rights = (st.castling.K ? 'K' : '') + (st.castling.Q ? 'Q' : '')
    + (st.castling.k ? 'k' : '') + (st.castling.q ? 'q' : '');
  return `${placement} ${st.turn} ${rights || '-'} ${st.ep != null ? sqName(st.ep) : '-'} ${st.half} ${st.full}`;
}
