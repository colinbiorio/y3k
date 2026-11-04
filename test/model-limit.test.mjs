// A SPENT MODEL IS NOT THE END OF A TURN (2026-11-04). Claude Code began to say
// "You've reached your Fable limit. Switch to another model, ..." when one
// model's share of the plan is used up. The engine's two limit patterns did not
// know the words, and nothing tried another model. These tests use a stand-in
// CLI that is spent on every model but the ones it is told have room.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { thinkWithClaude, LIMIT_HIT, MODEL_LIMIT, MODEL_FALLBACK } from '../y3k-code/brain.mjs';
import { LIMIT_TEXT } from '../y3k-code/keep.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const SPENT = "You've reached your Fable limit. Switch to another model, or manage usage credits at https://claude.ai/settings/usage?from=cc_cli_limit_message, to continue.";

const dir = mkdtempSync(join(tmpdir(), 'y3k-model-limit-'));
const calls = join(dir, 'calls.txt');
const stand = (room) => {
  const bin = join(dir, `claude-${room.join('-') || 'none'}`);
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, args.join(' ') + '\\n');
process.stdin.resume(); process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  const i = args.indexOf('--model');
  const model = i >= 0 ? args[i + 1] : 'default';
  const room = ${JSON.stringify(room)};
  const out = room.includes(model)
    ? { type: 'result', subtype: 'success', is_error: false, result: 'thought on ' + model, usage: { input_tokens: 5, output_tokens: 3 }, modelUsage: { ['claude-' + model]: {} } }
    : { type: 'result', subtype: 'success', is_error: true, result: ${JSON.stringify(SPENT)} };
  process.stdout.write(JSON.stringify(out) + '\\n');
  process.exit(out.is_error ? 1 : 0);
});
`);
  chmodSync(bin, 0o755);
  return bin;
};
const asked = () => readFileSync(calls, 'utf8').trim().split('\n').map((l) => { const a = l.split(' '); const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : 'default'; });
const think = (bin, model) => { writeFileSync(calls, ''); return thinkWithClaude({ bin, env: process.env, tmpDir: dir, system: 's', prompt: 'p', model }); };

console.log('\nthe words of a spent model:');

await ok('both limit patterns know the new words, and still know the old ones', () => {
  for (const re of [LIMIT_HIT, LIMIT_TEXT]) {
    assert.ok(re.test(SPENT), String(re));
    assert.ok(re.test("You've hit your session limit · resets 9pm (America/New_York)"), String(re));
  }
  assert.ok(MODEL_LIMIT.test(SPENT));
  assert.ok(!MODEL_LIMIT.test("You've hit your session limit · resets 9pm"), 'a plan-wide limit is not one model\'s');
  assert.ok(!LIMIT_HIT.test('the presence said nothing'));
});

console.log('\na turn that meets one model\'s limit:');

await ok('the account default spent: the next model thinks, and the turn says it fell back', async () => {
  const r = await think(stand(['opus']));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, 'thought on opus');
  assert.deepEqual(r.fallback, { from: 'default', to: 'opus' });
  assert.equal(r.speed.model, 'claude-opus');
  assert.deepEqual(asked(), ['default', 'opus']);
});

await ok('a chosen model spent: the others are asked in order, the chosen one first', async () => {
  const r = await think(stand(['sonnet']), 'opus');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.fallback, { from: 'opus', to: 'sonnet' });
  assert.deepEqual(asked(), ['opus', 'sonnet']);
});

await ok('a model with room is asked once, with no fallback', async () => {
  const r = await think(stand(['default']));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.fallback, undefined);
  assert.deepEqual(asked(), ['default']);
});

await ok('every model spent: the turn is the plan\'s limit, named, after asking each once', async () => {
  const r = await think(stand([]));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'limit');
  assert.deepEqual(asked(), ['default', ...MODEL_FALLBACK]);
});

console.log(`\n${passed} passed`);
