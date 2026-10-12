#!/usr/bin/env node
// BLOCKING A PERSON, in Chromium (audit, 2026-10-08). Three accounts on a site
// of their own. Bob writes a post as himself, and Alice blocks him from its ⋯,
// which a person's own post could not do before: it carried no handle to name.
// Then Bob renames his presence, which used to undo every block on him.
//   - Bob's post leaves Alice's feed when she blocks him, and stays gone after
//     the rename; Carol's stays
//   - Settings → Account lists the block under Bob's new name, @bobby, and
//     unblocking it there brings his post back
//
//   node scripts/blocks-smoke.mjs [--shots <dir>] [--port <n>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 47200 + Math.floor(Math.random() * 100);
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` (${detail})` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-blocks-'));
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: tmp, FOUNDER_PASSWORD: '', ANTHROPIC_API_KEY: '', Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '' },
});
for (let i = 0; i < 600; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const api = (path, body, cookie) => fetch(SITE + path, {
  method: body ? 'POST' : 'GET',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function signup(username) {
  const r = await api('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  if (!r.ok) throw new Error(`signup ${username}: ${r.status}`);
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(120000);   // a slow machine, drawing the orb in software
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const cards = () => page.evaluate(() => [...document.querySelectorAll('.post-card')].map((c) => c.textContent));
const openFeed = async () => {
  await page.click('#nav-feed', { timeout: 120000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.post-card')].some((c) => /carol writing as herself/.test(c.textContent)), null, { timeout: 120000 });
};

try {
  const alice = await signup('alice');
  const bob = await signup('bob');
  const carol = await signup('carol');
  await api('/api/posts', { text: 'bob writing as himself' }, bob);
  await api('/api/posts', { text: 'carol writing as herself' }, carol);
  const [name, value] = alice.split('=');
  await ctx.addCookies([{ name, value, url: SITE }]);

  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 300000 });

  console.log('blocking a person from their own post:');
  await openFeed();
  check('Bob\'s own post is in Alice\'s feed', (await cards()).some((t) => t.includes('bob writing as himself')));
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.accept(''); });
  const bobCard = page.locator('.post-card', { hasText: 'bob writing as himself' });
  await bobCard.locator('.post-flag').click({ timeout: 120000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('.post-card')].some((c) => /bob writing as himself/.test(c.textContent)), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot('1-blocked-from-his-own-post');
  check('the ⋯ offers to block him, by name', /block bob instead\. You will stop seeing their posts and replies, and they are not told\./.test(asked), asked);
  check('the card left the feed', !(await cards()).some((t) => t.includes('bob writing as himself')));
  const toast = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
  check('the toast says who was blocked', toast === 'Blocked bob.', toast);

  console.log('\nBob renames his presence:');
  const rn = await api('/api/presences/bob', { handle: 'bobby' }, bob);
  check('the rename went through', rn.status === 200, String(rn.status));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 300000 });
  await openFeed();
  await shot('2-feed-after-rename');
  const after = await cards();
  check('his post is still hidden from Alice', !after.some((t) => t.includes('bob writing as himself')));
  check('Carol\'s is not', after.some((t) => t.includes('carol writing as herself')));

  console.log('\nSettings → Account:');
  await page.click('#nav-settings', { timeout: 120000 });
  await page.click('.set-tab[data-pane="account"]', { timeout: 120000 });
  await page.waitForFunction(() => { const w = document.getElementById('acct-blocks-wrap'); return w && !w.hidden; }, null, { timeout: 60000 }).catch(() => {});
  await page.locator('#acct-blocks-wrap').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await shot('3-settings-blocked-under-new-name');
  const listed = await page.evaluate(() => document.getElementById('acct-blocks')?.textContent || '');
  check('the block is listed under Bob\'s new name', /@bobby/.test(listed) && !/@bob(?!by)/.test(listed), listed);
  const note = await page.evaluate(() => document.querySelector('#acct-blocks-wrap .muted')?.textContent || '');
  check('the note says the block holds through a rename', /The block holds if it changes its handle\./.test(note), note);
  await page.click('#acct-blocks button', { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('acct-blocks-wrap')?.hidden, null, { timeout: 60000 }).catch(() => {});
  check('unblocking empties the list', await page.evaluate(() => !!document.getElementById('acct-blocks-wrap')?.hidden));
  const feed = await (await api('/api/feed', null, alice)).json();
  check('his post is back in her feed', feed.posts.some((p) => p.text === 'bob writing as himself'));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'error.png') }).catch(() => {}); }
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failed` : '\nall good');
process.exit(failures ? 1 : 0);
