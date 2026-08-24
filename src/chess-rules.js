// Full chess legality — generation and verdicts — so y3k can referee its own
// board. chess-core replays moves it is TOLD are legal; this module decides
// what IS legal, which is what lets a game run with no lichess account at all.
// Pure and dependency-free like its sibling; correctness is proven by perft
// (the standard move-count positions) rather than by trust.
//
// State shape is chess-core's: board[64] in FEN order (0 = a8, 63 = h1),
// white uppercase, turn 'w'|'b', castling {K,Q,k,q}, ep index or null,
// half/full move counters.

import { applyUci, sqName } from './chess-core.js';

const isWhite = (p) => p >= 'A' && p <= 'Z';
const ownside = (p, turn) => (turn === 'w' ? isWhite(p) : !isWhite(p));

export function cloneState(st) {
  return { board: st.board.slice(), turn: st.turn, castling: { ...st.castling }, ep: st.ep, half: st.half, full: st.full };
}

// Is `sq` attacked by `by` ('w'|'b')? Walks outward from the square — pawns,
// knights, king adjacency, then sliding rays to the first blocker.
export function attacked(board, sq, by) {
  const r = sq >> 3, f = sq & 7;
  const at = (rr, ff) => (rr < 0 || rr > 7 || ff < 0 || ff > 7) ? null : board[rr * 8 + ff];
  const enemy = (p, kinds) => p != null && (by === 'w' ? isWhite(p) : !isWhite(p)) && kinds.includes(p.toLowerCase());

  // pawns: a white pawn attacks toward row 0 (up the board), so it sits BELOW
  // the square it attacks — at r+1. Black mirrors.
  const pr = by === 'w' ? r + 1 : r - 1;
  if (enemy(at(pr, f - 1), 'p') || enemy(at(pr, f + 1), 'p')) return true;

  for (const [dr, df] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    if (enemy(at(r + dr, f + df), 'n')) return true;
  }
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
    if ((dr || df) && enemy(at(r + dr, f + df), 'k')) return true;
  }
  const RAYS = [[[-1, 0], [1, 0], [0, -1], [0, 1]], [[-1, -1], [-1, 1], [1, -1], [1, 1]]];
  for (let i = 0; i < 2; i++) {
    const kinds = i === 0 ? 'rq' : 'bq';
    for (const [dr, df] of RAYS[i]) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr <= 7 && ff >= 0 && ff <= 7) {
        const p = board[rr * 8 + ff];
        if (p != null) { if (enemy(p, kinds)) return true; break; }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}

const kingSq = (board, color) => board.indexOf(color === 'w' ? 'K' : 'k');
export const inCheck = (st, color = st.turn) => attacked(st.board, kingSq(st.board, color), color === 'w' ? 'b' : 'w');

// Every legal move in the position, as UCI. Pseudo-legal generation, then each
// candidate is played on a clone and kept only if the mover's king survives —
// pins, discovered checks and en-passant edge cases all fall out of that one
// honest test instead of special cases.
export function legalMoves(st) {
  const { board, turn } = st;
  const out = [];
  const push = (from, to, promo) => {
    const uci = sqName(from) + sqName(to) + (promo || '');
    const trial = applyUci(cloneState(st), uci);
    if (!attacked(trial.board, kingSq(trial.board, turn), turn === 'w' ? 'b' : 'w')) out.push(uci);
  };
  const pawnTo = (from, to) => {
    const lastRow = turn === 'w' ? 0 : 7;
    if (to >> 3 === lastRow) for (const promo of ['q', 'r', 'b', 'n']) push(from, to, promo);
    else push(from, to);
  };

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p == null || !ownside(p, turn)) continue;
    const r = sq >> 3, f = sq & 7;
    const kind = p.toLowerCase();

    if (kind === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const home = turn === 'w' ? 6 : 1;
      const one = (r + dir) * 8 + f;
      if (board[one] == null) {
        pawnTo(sq, one);
        const two = (r + 2 * dir) * 8 + f;
        if (r === home && board[two] == null) push(sq, two);
      }
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff < 0 || ff > 7) continue;
        const to = (r + dir) * 8 + ff;
        if (board[to] != null && !ownside(board[to], turn)) pawnTo(sq, to);
        else if (to === st.ep) push(sq, to); // en passant: the target is empty
      }
    } else if (kind === 'n' || kind === 'k') {
      const JUMPS = kind === 'n'
        ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
        : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      for (const [dr, df] of JUMPS) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const to = rr * 8 + ff;
        if (board[to] == null || !ownside(board[to], turn)) push(sq, to);
      }
      if (kind === 'k') {
        // castling: the flag says the pieces never moved; the board must agree,
        // the path must be clear, and the king may not cross an attacked square
        const row = turn === 'w' ? 7 : 0, base = row * 8;
        const foe = turn === 'w' ? 'b' : 'w';
        const rights = st.castling;
        const kShort = turn === 'w' ? rights.K : rights.k;
        const kLong = turn === 'w' ? rights.Q : rights.q;
        const rook = turn === 'w' ? 'R' : 'r';
        if (sq === base + 4 && !attacked(board, sq, foe)) {
          if (kShort && board[base + 7] === rook && board[base + 5] == null && board[base + 6] == null
            && !attacked(board, base + 5, foe) && !attacked(board, base + 6, foe)) push(sq, base + 6);
          if (kLong && board[base + 0] === rook && board[base + 1] == null && board[base + 2] == null && board[base + 3] == null
            && !attacked(board, base + 3, foe) && !attacked(board, base + 2, foe)) push(sq, base + 2);
        }
      }
    } else {
      const RAYS = kind === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
        : kind === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, df] of RAYS) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr <= 7 && ff >= 0 && ff <= 7) {
          const to = rr * 8 + ff;
          if (board[to] == null) push(sq, to);
          else { if (!ownside(board[to], turn)) push(sq, to); break; }
          rr += dr; ff += df;
        }
      }
    }
  }
  return out;
}

// The verdict on a position. { over: false } while play continues; otherwise
// { over: true, status, winner } where winner is 'white' | 'black' | null.
export function gameStatus(st) {
  if (legalMoves(st).length === 0) {
    if (inCheck(st)) return { over: true, status: 'checkmate', winner: st.turn === 'w' ? 'black' : 'white' };
    return { over: true, status: 'stalemate', winner: null };
  }
  if (st.half >= 100) return { over: true, status: '50-move rule', winner: null };
  // insufficient material, kept honest and simple: bare kings, or one minor
  // piece total on the board. (K+N vs K+N can technically mate by helpmate —
  // rare enough that casual play calls it dead.)
  const rest = st.board.filter((p) => p != null && p.toLowerCase() !== 'k');
  if (rest.length === 0 || (rest.length === 1 && 'bn'.includes(rest[0].toLowerCase()))) {
    return { over: true, status: 'insufficient material', winner: null };
  }
  return { over: false };
}
