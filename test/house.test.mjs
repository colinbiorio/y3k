// THE HOUSE ALLOWANCE. Run:  node test/house.test.mjs
//
// These prove the arithmetic in house.mjs. The hole they guard was live: any
// account — and an account is an email and a password — could spend the site's
// Anthropic key at Opus/xhigh with no ceiling but a per-IP rate counter. (The
// route wiring and the voice gates are exercised against a running server; see
// the commit that added this file.)
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'y3k-house-'));
process.env.HOUSE_DAILY_USD = '1';
process.env.HOUSE_GLOBAL_DAILY_USD = '3';
process.env.HOUSE_TURN_HOLD_USD = '0.4';
process.env.HOUSE_DAILY_VOICE_CHARS = '100';
process.env.HOUSE_GLOBAL_DAILY_VOICE_CHARS = '250';
const house = await import('../house.mjs');

let passed = 0;
const ok = (name, fn) => { house._test.reset(); fn(); passed += 1; console.log('  ✓ ' + name); };
const alice = { id: 'u-alice', founder: false };
const founder = { id: 'u-colin', founder: true };
const acct = (i) => ({ id: 'u-' + i, founder: false });
const turn = (user, actual) => { const h = house.brainHold(user); house.brainSettle(user, h, actual); house.brainRelease(user); };

console.log('the house brain, per account:');

ok('nobody signed out spends the house key', () => {
  assert.equal(house.brainRefusal(null), 'signed-out');
});

ok('an account is stopped once its day is spent', () => {
  for (let i = 0; i < 3; i++) { assert.equal(house.brainRefusal(alice), null, `turn ${i}`); turn(alice, 0.3); }
  assert.equal(house.brainRefusal(alice), null); // $0.90 < $1: one more
  turn(alice, 0.3);
  assert.equal(house.brainRefusal(alice), 'account', 'the fifth turn is refused');
});

ok('one turn in flight per account, so a burst cannot run past the cap', () => {
  house.brainHold(alice);
  assert.equal(house.brainRefusal(alice), 'busy');
  house.brainRelease(alice);
  assert.equal(house.brainRefusal(alice), null);
});

ok('a stream closed early keeps its hold, so closing the tab is not free', () => {
  for (let i = 0; i < 3; i++) { house.brainHold(alice); house.brainRelease(alice); } // never settled
  assert.equal(house.brainRefusal(alice), 'account');
});

ok('a turn that reported no usage keeps its hold; a refused call is refunded', () => {
  const h1 = house.brainHold(alice); house.brainSettle(alice, h1, null); house.brainRelease(alice);
  assert.equal(house.view(alice).brain.spentUsd, 0.4);
  const h2 = house.brainHold(alice); house.brainSettle(alice, h2, 0); house.brainRelease(alice);
  assert.equal(house.view(alice).brain.spentUsd, 0.4);
});

ok('the founder is never metered and never busy', () => {
  for (let i = 0; i < 20; i++) turn(founder, 5);
  house.brainHold(founder);
  assert.equal(house.brainRefusal(founder), null);
  assert.equal(house.brainHold(founder), 0);
});

console.log('the house brain, the whole site:');

ok('fresh accounts cannot drain the site: the day has a ceiling across all of them', () => {
  // $3 site ceiling at $0.90 a turn: accounts 0-3 are served, then the site rests.
  for (let i = 0; i < 4; i++) { assert.equal(house.brainRefusal(acct(i)), null, `account ${i}`); turn(acct(i), 0.9); }
  assert.equal(house.brainRefusal(acct(99)), 'site', 'a brand-new account is refused');
  assert.equal(house.brainRefusal(founder), null, 'the founder is not');
  assert.equal(house.view(acct(99)).brain.siteResting, true);
});

console.log('the house voice:');

ok('speech is charged by its characters, before the call', () => {
  assert.ok(house.voiceTake(alice, 60));
  assert.ok(house.voiceTake(alice, 40));
  assert.equal(house.voiceTake(alice, 1), false, 'the 101st character is refused');
});

ok('a refused request does not eat the allowance; a failed call gives it back', () => {
  assert.equal(house.voiceTake(alice, 150), false);
  assert.ok(house.voiceTake(alice, 100));
  house.voiceRefund(alice, 100);
  assert.ok(house.voiceTake(alice, 100), 'refunded in full');
});

ok('the site has a voice ceiling too', () => {
  assert.ok(house.voiceTake(acct(1), 100));
  assert.ok(house.voiceTake(acct(2), 100));
  assert.equal(house.voiceTake(acct(3), 100), false, '250 across the site');
  assert.ok(house.voiceTake(founder, 1e6));
});

ok('signed-out never speaks on the house', () => {
  assert.equal(house.voiceTake(null, 1), false);
});

console.log('what the house key is shown:');

ok('an ordinary conversation passes through untouched', () => {
  const msgs = [{ role: 'assistant', content: 'welcome back' }, { role: 'user', content: 'hi' }];
  assert.strictEqual(house.trimForHouse(msgs), msgs);
});

ok('only the recent conversation, opening on the person', () => {
  const msgs = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(10) + i }));
  const t = house.trimForHouse(msgs);
  assert.ok(t.length <= 40, `kept ${t.length}`);
  assert.equal(t[0].role, 'user');
  assert.deepEqual(t[t.length - 1], msgs[msgs.length - 1], 'the newest turn always survives');
});

ok('a flood of text is cut from the oldest end', () => {
  const big = 'y'.repeat(50000);
  const msgs = [{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'user', content: big }, { role: 'assistant', content: 'short' }, { role: 'user', content: 'hi' }];
  const t = house.trimForHouse(msgs);
  assert.ok(t.reduce((n, m) => n + m.content.length, 0) <= 120000);
  assert.equal(t[t.length - 1].content, 'hi');
  assert.equal(t[0].role, 'user');
});

ok('even the newest message is capped, keeping its end', () => {
  const t = house.trimForHouse([{ role: 'user', content: 'a'.repeat(900000) + 'THE END' }]);
  assert.equal(t.length, 1);
  assert.ok(t[0].content.length <= 120000);
  assert.ok(t[0].content.endsWith('THE END'));
});

console.log(`\n${passed} passed`);
