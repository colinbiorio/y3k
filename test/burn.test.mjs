// THE BURN SWITCH (0.3.16): set only from kode (burn.set), kept in the engine's own store, read by
// ~/orion/bin/burn. A temporary store and home; no worker is started here.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBurn } from '../y3k-code/burn.mjs';
import { COMMANDS } from '../src/code/protocol.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const root = mkdtempSync(join(tmpdir(), 'y3k-burn-'));
const dir = join(root, 'store'), home = join(root, 'home');

console.log('\nthe burn switch:');

await ok('off until kode sets it; set writes the engine store, mode 0600', () => {
  const b = createBurn({ dir, home, now: () => 1000 });
  assert.equal(b.status().on, false);
  assert.equal(b.status().available, false, 'no ~/orion/bin/burn here');
  const r = b.set(true);
  assert.equal(r.on, true);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'burn.json'), 'utf8')), { on: true, since: 1000, by: 'kode' });
  assert.equal(statSync(join(dir, 'burn.json')).mode & 0o777, 0o600);
  assert.equal(b.set(false).on, false);
});

await ok('status reads the worker: running, resting, the last sessions', () => {
  mkdirSync(join(home, 'orion', 'burn'), { recursive: true });
  mkdirSync(join(home, 'orion', 'bin'), { recursive: true });
  writeFileSync(join(home, 'orion', 'bin', 'burn'), '');
  writeFileSync(join(home, 'orion', 'burn', 'worker.pid'), String(process.pid));
  writeFileSync(join(home, 'orion', 'burn', 'state.json'), JSON.stringify({ resume_at: 5000, sessions: [1, 2, 3, 4] }));
  const s = createBurn({ dir, home, now: () => 1000 }).status();
  assert.equal(s.available, true);
  assert.equal(s.running, true);
  assert.equal(s.resting, 5000 * 1000);
  assert.deepEqual(s.last, [2, 3, 4]);
});

await ok('the page may send burn.set and burn.status', () => {
  assert.ok(COMMANDS.includes('burn.set') && COMMANDS.includes('burn.status'));
});

console.log(`\n${passed} passed`);
