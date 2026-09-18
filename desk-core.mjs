// ============================================================================
// THE DESK'S ARITHMETIC — sizing, stops, room, the halt, the paper fill, and
// the numbers a trader actually reads.
//
// A faithful port of the three modules of y3trading that import nothing but
// the standard library: strategy/risk.py, broker/paper.py, services/analytics.py.
// "Faithful" is not a claim here, it is a test: test/desk-golden.json was
// produced by running the ORIGINAL Python, in its own venv, on fixed inputs,
// and every function below is held to those numbers to 1e-9. Where Python and
// JS differ in the small print — round() is half-to-even on the scaled value,
// timedelta.days floors — the Python behaviour is reproduced, not approximated.
//
// What this is FOR, in the original's own words: the signal engine finds
// where to trade; this decides how much, so that no single loss or cluster of
// losses can do outsized damage. Risk a fixed fraction of equity per trade.
// Size from the stop distance, not a dollar amount, so volatile assets get
// smaller positions on their own. Stops and targets in ATRs at 2:1, so a
// sub-50% win rate is still profitable. Trail once a trade runs. Cap total
// simultaneous risk and count. Halt on drawdown. Nothing here places an order.
// ============================================================================

export const DEFAULTS = Object.freeze({
  risk_per_trade: 0.01,        // 1% of equity at risk per trade
  max_portfolio_risk: 0.06,    // 6% at risk across everything open
  max_open_positions: 6,
  atr_stop_mult: 1.5,
  atr_target_mult: 3.0,        // 2:1 reward to risk
  trail_activate_atr: 1.5,     // trail once the trade has run this far
  trail_atr_mult: 2.0,         // ...and keep the stop this far behind
  entry_threshold: 0.45,
  max_drawdown_halt: 0.2,      // 20% off the high-water mark and the desk stops
  fee_bps: 5.0,
  slippage_bps: 2.0,
});

// Python's round(): half-to-even, applied to the scaled value.
// Python's round() is half-to-even on the EXACT binary value of x, not on
// x * 10^n. In floating point 2.675 * 100 lands on 267.5 exactly (the product
// rounds up to the representable tie), so any multiply-then-round says 2.68
// where Python says 2.67. So: take the double apart into mantissa * 2^e and do
// the division in integers, where a tie is a tie only when it truly is one.
const F64 = new DataView(new ArrayBuffer(8));
function decompose(a) { // a > 0, finite -> [mantissa (BigInt), exponent]: a === mantissa * 2^exponent
  F64.setFloat64(0, a);
  const hi = F64.getUint32(0), lo = F64.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (exp === 0) return [mant, -1074];
  return [mant | (1n << 52n), exp - 1075];
}
export function pyRound(x, n = 0) {
  if (!Number.isFinite(x) || x === 0) return x;
  const neg = x < 0, a = neg ? -x : x;
  const [m, e] = decompose(a);
  if (e >= 0) return x; // already an integer; nothing to round at n >= 0 decimals
  const scale = 10n ** BigInt(n);
  const num = m * scale, den = 1n << BigInt(-e);
  let q = num / den;
  const r2 = (num % den) * 2n;
  if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  if (q > 9007199254740992n) return Number(x.toFixed(n)); // past exact integers; toFixed is exact-value half-up, the closest fallback
  const out = Number(q) / Number(scale);
  return neg ? -out : out;
}
const safeDiv = (a, b, dflt = 0) => (b ? a / b : dflt);

// ---- risk ------------------------------------------------------------------
export function planTrade(side, entry, atr, equity, cfg = DEFAULTS, { maxNotional = null } = {}) {
  if (!(atr > 0) || !(entry > 0) || !(equity > 0)) return null;
  const stopDist = atr * cfg.atr_stop_mult, targetDist = atr * cfg.atr_target_mult;
  if (!(stopDist > 0)) return null;
  const stop = side === 'long' ? entry - stopDist : entry + stopDist;
  const target = side === 'long' ? entry + targetDist : entry - targetDist;
  if (stop <= 0 && side === 'long') return null;
  const riskPerUnit = Math.abs(entry - stop);
  if (!(riskPerUnit > 0)) return null;
  let qty = (equity * cfg.risk_per_trade) / riskPerUnit;
  if (maxNotional != null && qty * entry > maxNotional) qty = maxNotional / entry;
  if (!(qty > 0)) return null;
  return { side, qty, entry_price: entry, stop_price: stop, target_price: target, risk_amount: qty * riskPerUnit };
}
export function trailStop(side, entry, currentStop, price, atr, cfg = DEFAULTS) {
  if (!(atr > 0)) return currentStop;
  const activate = atr * cfg.trail_activate_atr, dist = atr * cfg.trail_atr_mult;
  if (side === 'long') { if (price - entry >= activate) return Math.max(price - dist, currentStop); }
  else if (entry - price >= activate) return Math.min(price + dist, currentStop);
  return currentStop;
}
export function portfolioHasRoom(openRisk, openCount, newRisk, equity, cfg = DEFAULTS) {
  if (openCount >= cfg.max_open_positions) return false;
  if (!(equity > 0)) return false;
  return (openRisk + newRisk) / equity <= cfg.max_portfolio_risk + 1e-9;
}
export function drawdownHalt(equity, highWaterMark, cfg = DEFAULTS) {
  if (!(highWaterMark > 0)) return false;
  return 1 - equity / highWaterMark >= cfg.max_drawdown_halt;
}

// ---- the paper broker ------------------------------------------------------
// The two costs that quietly kill naive strategies: a fee on every fill, and
// adverse slippage — buys fill a touch higher, sells a touch lower. Charged in
// the backtest AND the live loop, so an edge has to survive its costs first.
export function fill(side, qty, refPrice, { fee_bps = DEFAULTS.fee_bps, slippage_bps = DEFAULTS.slippage_bps } = {}) {
  const s = String(side).toLowerCase();
  const slip = slippage_bps / 10000, feeRate = fee_bps / 10000;
  const price = (s === 'buy' || s === 'long' || s === 'cover') ? refPrice * (1 + slip) : refPrice * (1 - slip);
  const notional = price * qty;
  return { side: s, qty, price, fee: notional * feeRate, notional };
}

// ---- analytics ---------------------------------------------------------------
// Trades: { pnl, returnR, entryTime, exitTime (ms), fees, symbol, assetClass }.
// Win rate is shown, but the headline truth is expectancy and profit factor —
// a 40% win rate with 2.5:1 winners beats 60% at 1:1, and these make that visible.
const EMPTY = Object.freeze({ total_trades: 0, wins: 0, losses: 0, win_rate: 0, total_pnl: 0, gross_profit: 0, gross_loss: 0, profit_factor: 0, avg_win: 0, avg_loss: 0, payoff_ratio: 0, expectancy: 0, expectancy_r: 0, best_trade: 0, worst_trade: 0, avg_hold_hours: 0, total_fees: 0 });
export function tradeStats(closed) {
  const n = closed.length;
  if (!n) return { ...EMPTY };
  const pnls = closed.map((t) => t.pnl), rs = closed.map((t) => t.returnR);
  const wins = pnls.filter((p) => p > 0), losses = pnls.filter((p) => p <= 0);
  const gp = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0), total = pnls.reduce((a, b) => a + b, 0);
  const avgWin = safeDiv(gp, wins.length), avgLoss = safeDiv(gl, losses.length);
  const holds = closed.filter((t) => t.exitTime && t.entryTime).map((t) => (t.exitTime - t.entryTime) / 1000);
  const avgHoldH = holds.length ? safeDiv(holds.reduce((a, b) => a + b, 0), holds.length) / 3600 : 0;
  return {
    total_trades: n, wins: wins.length, losses: losses.length,
    win_rate: pyRound(safeDiv(wins.length, n), 4),
    total_pnl: pyRound(total, 2), gross_profit: pyRound(gp, 2), gross_loss: pyRound(gl, 2),
    profit_factor: pyRound(safeDiv(gp, gl, 0), 3),
    avg_win: pyRound(avgWin, 2), avg_loss: pyRound(avgLoss, 2), payoff_ratio: pyRound(safeDiv(avgWin, avgLoss), 3),
    expectancy: pyRound(safeDiv(total, n), 2), expectancy_r: pyRound(safeDiv(rs.reduce((a, b) => a + b, 0), n), 3),
    best_trade: pyRound(Math.max(...pnls), 2), worst_trade: pyRound(Math.min(...pnls), 2),
    avg_hold_hours: pyRound(avgHoldH, 1), total_fees: pyRound(closed.reduce((a, t) => a + (t.fees || 0), 0), 2),
  };
}
// points: [[ms, equity], ...]
export function equityStats(points, startingEquity) {
  if (points.length < 2) {
    const cur = points.length ? points[points.length - 1][1] : startingEquity;
    return { current_equity: pyRound(cur, 2), starting_equity: pyRound(startingEquity, 2), total_return_pct: pyRound(safeDiv(cur - startingEquity, startingEquity) * 100, 2), max_drawdown_pct: 0, sharpe: 0, sortino: 0, cagr_pct: 0 };
  }
  const eq = points.map((p) => p[1]);
  const current = eq[eq.length - 1];
  let peak = eq[0], maxDd = 0;
  for (const e of eq) { peak = Math.max(peak, e); maxDd = Math.max(maxDd, safeDiv(peak - e, peak)); }
  const rets = [];
  for (let i = 1; i < eq.length; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
  const mean = safeDiv(rets.reduce((a, b) => a + b, 0), rets.length);
  let std = 0, dstd = 0;
  if (rets.length > 1) {
    std = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1));
    const down = rets.filter((r) => r < 0);
    dstd = Math.sqrt(down.length ? down.reduce((a, r) => a + r * r, 0) / down.length : 0);
  }
  const ann = Math.sqrt(252);
  const sharpe = std ? safeDiv(mean, std) * ann : 0, sortino = dstd ? safeDiv(mean, dstd) * ann : 0;
  // timedelta.days floors; then at least one day
  const spanDays = Math.max(Math.floor((points[points.length - 1][0] - points[0][0]) / 86400000), 1);
  const years = spanDays / 365.25;
  const cagr = (years > 0 && startingEquity > 0 && current > 0) ? Math.pow(current / startingEquity, 1 / years) - 1 : 0;
  return {
    current_equity: pyRound(current, 2), starting_equity: pyRound(startingEquity, 2),
    total_return_pct: pyRound(safeDiv(current - startingEquity, startingEquity) * 100, 2),
    max_drawdown_pct: pyRound(maxDd * 100, 2), sharpe: pyRound(sharpe, 2), sortino: pyRound(sortino, 2), cagr_pct: pyRound(cagr * 100, 2),
  };
}
export function breakdownBy(closed, key) {
  const groups = new Map();
  for (const t of closed) { const k = t[key]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const out = [];
  for (const [name, ts] of groups) {
    const wins = ts.filter((t) => t.pnl > 0).length;
    out.push({ [key]: name, trades: ts.length, win_rate: pyRound(safeDiv(wins, ts.length), 4), pnl: pyRound(ts.reduce((a, t) => a + t.pnl, 0), 2) });
  }
  // Python's sort is stable and this one is descending by pnl
  return out.sort((a, b) => b.pnl - a.pnl);
}
