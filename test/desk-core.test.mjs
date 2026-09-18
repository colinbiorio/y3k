// THE DESK'S ARITHMETIC, held to the original. test/desk-golden.json was made by
// running y3trading's own Python (risk.py, paper.py, analytics.py) in its own
// venv on fixed inputs; every function here must reproduce it to 1e-9.
// Run: node test/desk-core.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as D from '../desk-core.mjs';

const G = JSON.parse(readFileSync(new URL('./desk-golden.json', import.meta.url), 'utf8'));
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs python ${b}`);
const sameObj = (a, b, what) => { assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), what + ': fields'); for (const k of Object.keys(b)) typeof b[k] === 'number' ? close(a[k], b[k], what + '.' + k) : assert.equal(a[k], b[k], what + '.' + k); };

console.log('\nthe defaults are the original\'s:');
ok('every numeric default matches DEFAULT_AGENT_CONFIG', () => {
  for (const k of Object.keys(D.DEFAULTS)) close(D.DEFAULTS[k], G.cfg[k], 'cfg.' + k);
});

console.log('\nrisk:');
ok('plan_trade — six cases including the three refusals', () => {
  for (const c of G.plan) {
    const [side, entry, atr, eq, mx] = c.in;
    const p = D.planTrade(side, entry, atr, eq, D.DEFAULTS, { maxNotional: mx });
    if (c.out === null) assert.equal(p, null, 'python refused ' + JSON.stringify(c.in) + ' and we did not');
    else { assert.ok(p, 'we refused ' + JSON.stringify(c.in) + ' and python did not'); sameObj(p, c.out, 'plan ' + JSON.stringify(c.in)); }
  }
});
ok('update_trailing_stop — activates, ratchets, never loosens, ignores a dead ATR', () => {
  for (const c of G.trail) close(D.trailStop(...c.in), c.out, 'trail ' + JSON.stringify(c.in));
});
ok('portfolio_has_room — count cap, risk cap with its 1e-9 grace, no equity', () => {
  for (const c of G.room) assert.equal(D.portfolioHasRoom(...c.in), c.out, 'room ' + JSON.stringify(c.in));
});
ok('drawdown_halt — at, above, below the line, and no high-water mark', () => {
  for (const c of G.halt) assert.equal(D.drawdownHalt(...c.in), c.out, 'halt ' + JSON.stringify(c.in));
});

console.log('\nthe paper broker:');
ok('fills slip against you and charge the fee on the notional, for all four verbs', () => {
  for (const c of G.fill) sameObj(D.fill(...c.in), c.out, 'fill ' + JSON.stringify(c.in));
});

console.log('\nanalytics:');
ok('trade_stats reproduces every field, rounding included', () => { sameObj(D.tradeStats(G.ledger), G.tradeStats, 'tradeStats'); });
ok('trade_stats of nothing is the empty shape', () => { sameObj(D.tradeStats([]), G.tradeStatsEmpty, 'empty'); });
ok('equity_stats reproduces drawdown, sharpe, sortino and a CAGR over a floor-days span', () => {
  sameObj(D.equityStats(G.equityPoints, 10000), G.equityStats, 'equityStats');
  sameObj(D.equityStats(G.equityPoints.slice(0, 1), 10000), G.equityStatsOne, 'one point');
});
ok('breakdown_by groups, rounds, and sorts by pnl descending', () => {
  const bySym = D.breakdownBy(G.ledger, 'symbol'), byCls = D.breakdownBy(G.ledger, 'assetClass');
  assert.equal(bySym.length, G.bySymbol.length);
  G.bySymbol.forEach((row, i) => sameObj(bySym[i], row, 'bySymbol[' + i + ']'));
  // python keyed the class column asset_class; ours is assetClass — same numbers
  G.byClass.forEach((row, i) => { const r = byCls[i]; assert.equal(r.assetClass, row.asset_class); close(r.trades, row.trades, 'cls.trades'); close(r.win_rate, row.win_rate, 'cls.win_rate'); close(r.pnl, row.pnl, 'cls.pnl'); });
});

console.log('\nthe small print:');
ok("pyRound is Python's round: half to even on the scaled value", () => {
  assert.equal(D.pyRound(0.5), 0); assert.equal(D.pyRound(1.5), 2); assert.equal(D.pyRound(2.5), 2);
  assert.equal(D.pyRound(2.675, 2), 2.67);   // the classic: 2.675 is below the tie in binary, python says 2.67
  assert.equal(D.pyRound(33.333333, 2), 33.33); assert.equal(D.pyRound(-60, 2), -60);
});
ok('nothing in here can place an order or reach the network', () => {
  const src = readFileSync(new URL('../desk-core.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/fetch\(|https?:|process\.env|import /.test(src), 'the arithmetic module imports or reaches out');
});

console.log('\n' + passed + ' checks passed.\n');
