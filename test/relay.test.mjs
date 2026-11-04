// THE RELAY (0.3.20). The real bin, in a scratch store, hands over to a stub "9.0.1". The stub, as a
// handed-over engine that updates, relays "9.0.2" back and exits RELAY_CODE. The first process must
// start 9.0.2 itself: both stubs are its children, so no chain of waiters grows.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RELAY_CODE, writeRelay, takeRelay, NEEDED } from '../y3k-code/update.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const here = dirname(fileURLToPath(import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'y3k-relay-'));
const out = join(home, 'chain.jsonl');

function stub(version, then, where = 'engine') {
  const dir = join(home, where, version);
  for (const f of NEEDED) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), f.endsWith('.json') ? '{}' : ''); }
  writeFileSync(join(dir, 'bin', 'y3k-code.mjs'), `
import { appendFileSync } from 'node:fs';
import { writeRelay, RELAY_CODE } from ${JSON.stringify(join(here, '..', 'y3k-code', 'update.mjs'))};
appendFileSync(${JSON.stringify(out)}, JSON.stringify({ v: ${JSON.stringify(version)}, ppid: process.ppid, relay: !!process.env.Y3K_CODE_RELAY }) + '\\n');
${then ? `writeRelay(process.env.Y3K_CODE_RELAY, { version: ${JSON.stringify(then)}, dir: ${JSON.stringify(join(home, 'later', then))} }, ['start', '--no-open']); process.exit(RELAY_CODE);` : 'process.exit(0);'}
`);
}

console.log('\nthe relay:');

await ok('writeRelay / takeRelay round-trip, once, and refuse a bad version', () => {
  const f = join(home, 'r.json');
  writeRelay(f, { version: '1.2.3', dir: '/x' }, ['start']);
  assert.deepEqual(takeRelay(f), { next: { version: '1.2.3', dir: '/x' }, args: ['start'] });
  assert.equal(takeRelay(f), null, 'taken once');
  writeFileSync(f, JSON.stringify({ version: '../evil', dir: '/x', args: [] }));
  assert.equal(takeRelay(f), null);
});

await ok('two updates in a row leave one waiter: both versions are children of the first process', () => {
  stub('9.0.1', '9.0.2');
  stub('9.0.2', null, 'later');   // fetched by the update: not yet among the installed ones the bin starts from
  const r = spawnSync(process.execPath, [join(here, '..', 'y3k-code', 'bin', 'y3k-code.mjs'), 'start', '--no-open'],
    { env: { ...process.env, Y3K_CODE_HOME: home, Y3K_CODE_HANDED_OVER: '', Y3K_CODE_RELAY: '' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const chain = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(chain.map((c) => c.v), ['9.0.1', '9.0.2']);
  assert.equal(chain[0].ppid, chain[1].ppid, '9.0.2 was started by the same first process, not by 9.0.1');
  assert.ok(chain.every((c) => c.relay));
  assert.equal(RELAY_CODE, 75);
});

console.log(`\n${passed} passed`);
