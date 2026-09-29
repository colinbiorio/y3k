// WHICH COMPUTER IS THIS (src/code/platform.js), so y3kode's first screen can
// offer the desktop build that fits. Run: node test/code-platform.test.mjs
import assert from 'node:assert';
import { detectPlatform, pickBuild, HOW_TO_CHECK, FIRST_OPEN } from '../src/code/platform.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const nav = (userAgent, extra = {}) => ({ userAgent, maxTouchPoints: 0, ...extra });
const hints = (architecture) => ({ getHighEntropyValues: async () => ({ architecture, bitness: '64' }) });
const noGpu = () => '';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

console.log('which computer:');

await ok('Chrome and Edge say outright, through client hints — even on a Mac whose string says Intel', async () => {
  assert.deepEqual(await detectPlatform({ nav: nav(MAC, { userAgentData: hints('arm') }), renderer: noGpu }), { os: 'mac', arch: 'arm64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav(MAC, { userAgentData: hints('x86') }), renderer: noGpu }), { os: 'mac', arch: 'x64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav(WIN, { userAgentData: hints('arm') }), renderer: noGpu }), { os: 'win', arch: 'arm64', sure: true });
});

await ok('a Mac elsewhere: the graphics chip decides, and a hidden one is a guess of Apple silicon', async () => {
  assert.deepEqual(await detectPlatform({ nav: nav(MAC), renderer: () => 'Apple M3 Pro' }), { os: 'mac', arch: 'arm64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav(MAC), renderer: () => 'Intel(R) Iris(TM) Plus Graphics 655' }), { os: 'mac', arch: 'x64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav(MAC), renderer: () => 'Apple GPU' }), { os: 'mac', arch: 'arm64', sure: false });
  // hints that refuse are not a crash
  const refusing = { getHighEntropyValues: async () => { throw new Error('denied'); } };
  assert.deepEqual(await detectPlatform({ nav: nav(MAC, { userAgentData: refusing }), renderer: () => 'Apple M1' }), { os: 'mac', arch: 'arm64', sure: true });
});

await ok('Windows without hints is x64 — it runs on Arm too — and not sure; Linux reads its string', async () => {
  assert.deepEqual(await detectPlatform({ nav: nav(WIN), renderer: noGpu }), { os: 'win', arch: 'x64', sure: false });
  assert.deepEqual(await detectPlatform({ nav: nav('Mozilla/5.0 (Windows NT 10.0; ARM64) Firefox/131.0'), renderer: noGpu }), { os: 'win', arch: 'arm64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'), renderer: noGpu }), { os: 'linux', arch: 'x64', sure: true });
  assert.deepEqual(await detectPlatform({ nav: nav('Mozilla/5.0 (X11; Linux aarch64) Chrome/140.0'), renderer: noGpu }), { os: 'linux', arch: 'arm64', sure: true });
});

await ok('phones and tablets — an iPad asking for the desktop site included — have no desktop build', async () => {
  assert.equal((await detectPlatform({ nav: nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), renderer: noGpu })).os, 'ios');
  assert.equal((await detectPlatform({ nav: nav(MAC, { maxTouchPoints: 5 }), renderer: noGpu })).os, 'ios');
  assert.equal((await detectPlatform({ nav: nav('Mozilla/5.0 (Linux; Android 15; Pixel 9)'), renderer: noGpu })).os, 'android');
  assert.equal((await detectPlatform({ nav: nav('Node.js/22'), renderer: noGpu })).os, null);
});

await ok('the build for it: the exact one, else the same system, else none', () => {
  const builds = [{ os: 'mac', arch: 'arm64' }, { os: 'mac', arch: 'x64' }, { os: 'win', arch: 'x64' }];
  assert.equal(pickBuild(builds, { os: 'mac', arch: 'x64' }), builds[1]);
  assert.equal(pickBuild(builds, { os: 'win', arch: 'arm64' }), builds[2], 'no Arm build: the one that still runs');
  assert.equal(pickBuild(builds, { os: 'linux', arch: 'x64' }), null);
  assert.equal(pickBuild(builds, { os: 'ios', arch: null }), null);
  assert.equal(pickBuild(null, { os: 'mac', arch: 'arm64' }), null);
  for (const os of ['mac', 'win', 'linux']) assert.ok(HOW_TO_CHECK[os] && FIRST_OPEN[os], os + ' has no way to check, or no first-open note');
});

console.log(`\n${passed} checks passed.`);
