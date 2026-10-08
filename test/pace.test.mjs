// pace.js — which vsyncs draw. Run: node test/pace.test.mjs
import assert from 'node:assert';
import { due, setFps, takeDrawn, stats, _reset } from '../src/pace.js';

let passed = 0;
const ok = (name, fn) => { _reset(); fn(); passed += 1; console.log('  ✓ ' + name); };

// Feed n vsyncs of `ms` each, asking once per vsync; returns the pattern drawn.
const run = (n, ms, from = 0) => {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(due(from + i * ms) ? 1 : 0);
  return out;
};

ok('with no ceiling, every vsync draws', () => {
  assert.deepEqual(run(10, 16.7), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
});

ok('30 on a 60Hz display is every other vsync, evenly', () => {
  run(40, 16.667);                 // learn the display
  setFps(30);
  const p = run(12, 16.667, 40 * 16.667);
  assert.equal(p.filter(Boolean).length, 6);
  for (let i = 1; i < p.length; i++) assert.notEqual(p[i], p[i - 1], 'strictly alternating: ' + p.join(''));
});

ok('30 on a 120Hz panel is every fourth vsync; 60 there is every second', () => {
  run(60, 8.333);
  setFps(30);
  assert.equal(stats().divisor, 4);
  setFps(60);
  assert.equal(stats().divisor, 2);
});

ok('two loops asking with one timestamp get one answer', () => {
  setFps(30);
  run(40, 16.667);
  const t = 41 * 16.667;
  const a = due(t), b = due(t), c = due(t);
  assert.equal(a, b); assert.equal(b, c);
});

ok('a missed vsync draws at the next one rather than waiting a whole slot', () => {
  run(40, 16.667);
  setFps(30);
  let t = 40 * 16.667;
  // settle into the cadence
  for (let i = 0; i < 6; i++) { t += 16.667; due(t); }
  // one late frame: 33ms passes in one callback
  t += 33.3;
  const drewLate = due(t);
  t += 16.667;
  const next = due(t);
  assert.ok(drewLate || next, 'drew within one vsync of the slot');
});

ok('the judge sees drawn-frame intervals, not the cheap skipped ones', () => {
  run(40, 16.667);
  setFps(30);
  takeDrawn();
  run(60, 16.667, 40 * 16.667);
  const d = takeDrawn();
  assert.ok(d.intervals.length >= 25 && d.intervals.length <= 31, String(d.intervals.length));
  assert.ok(d.intervals.every((x) => Math.abs(x - 33.3) < 1), 'every drawn interval is two vsyncs');
  assert.ok(Math.abs(d.slotMs - 33.3) < 1);
});

ok('a machine at a steady two vsyncs is load, not a 30Hz display', () => {
  // One delta in twenty a single vsync puts the tenth percentile at 33.3ms.
  // Taken as the display, it made every drawn frame's slot two vsyncs long and
  // the governor never saw the machine as slow (gfx.test.mjs, 2026-10-08).
  for (let i = 1, t = 0; i <= 240; i++) { t += i % 20 === 0 ? 16.667 : 33.333; due(t); }
  assert.ok(Math.abs(stats().refresh - 16.667) < 0.5, 'the refresh estimate followed the load: ' + stats().refresh);
  assert.ok(Math.abs(takeDrawn().slotMs - 16.667) < 0.5, 'the judge is told a slot of two vsyncs');
  // ...and a real 50Hz panel is still read as one
  _reset();
  run(60, 20);
  assert.ok(Math.abs(stats().refresh - 20) < 0.1, 'a 50Hz display is no longer recognised: ' + stats().refresh);
});

ok('a hidden tab is not a stall and does not break the cadence', () => {
  setFps(30);
  run(40, 16.667);
  takeDrawn();
  assert.equal(due(40 * 16.667 + 5000), true, 'draws at once on return');
  assert.equal(takeDrawn().stalls, 0);
});

ok('a 400ms freeze is counted as a stall', () => {
  run(10, 16.667);
  takeDrawn();
  due(10 * 16.667 + 400);
  assert.equal(takeDrawn().stalls, 1);
});

console.log(`\n${passed} checks passed.`);
