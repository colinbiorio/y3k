#!/usr/bin/env node
// y3k Code, end to end in a real browser: the site (temp data, founder signed
// in), the engine (in this process, with the fake `claude` and every "yes on
// your computer" answered yes), and Chromium. It pairs through the link the
// engine opens, picks a folder, chooses a mode, and then checks what the
// person would see:
//   the diff on the permission card BEFORE its buttons, the file untouched
//   until allowed, the amber dot on the laptop while it waits, green/red rows,
//   the context ring, the 5-hour and weekly bars, the cost, todos, a subagent
//   with its own tool nested inside, Esc stopping a turn, the orb still on
//   screen in its column, six glyphs on each rail, and no page errors.
//
//   node scripts/code-smoke.mjs [--shots <dir>] [--size 1440x900]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp } from '../y3k-code/http.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const [W, H] = (argv.includes('--size') ? argv[argv.indexOf('--size') + 1] : '1440x900').split('x').map(Number);
const PASSWORD = 'smoke-founder-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-smoke-'));
const repo = realpathSync(mkdtempSync(join(homedir(), 'y3k-smoke-repo-')));
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
execSync('git init -q && git -c user.email=s@s -c user.name=s add . && git -c user.email=s@s -c user.name=s commit -qm first', { cwd: repo });
mkdirSync(join(tmp, 'data'));
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;

// --- the site ---------------------------------------------------------------
// The founder's presence (orion) answers through the local brain, run by a
// stand-in `claude` (test/fakes/brain-claude.mjs): no model is called.
let serverLog = '';
async function bootSite() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '',
      Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'brain-claude.mjs'), RENDER: '' },
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return child;
}
// the founder is seeded on the first boot, orion on the next
let server = await bootSite();
await new Promise((r) => setTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await bootSite();

// --- the engine -----------------------------------------------------------------
const store = createStore(join(tmp, 'engine'));
store.setConfig({ signIn: true });
store.setFolder(repo, { trusted: true, trustedAt: Date.now(), lastUsed: Date.now(), name: repo.split('/').pop(), isGit: false });
let enginePort = 0;
const engine = createEngine({ store, consent: fixedConsent(true), env: { ...process.env, FAKE_CLAUDE_LOG: join(tmp, 'fake.log') }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') },
  door: () => (enginePort ? `http://127.0.0.1:${enginePort}` : null) });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const http = createHttp({ engine, pairing, origins: [SITE] });
enginePort = await http.listen(0);
const code = pairing.issueCode();

// --- the browser ------------------------------------------------------------------
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// three.js is served from src/vendor; any outside request (the camera's vision
// bundle, fonts, …) is refused at once rather than left to time out.
const threeDir = join(tmpdir(), 'y3k-smoke-three-0.160.0');
try { readFileSync(join(threeDir, 'package', 'package.json')); } catch {
  mkdirSync(threeDir, { recursive: true });
  execSync('npm pack three@0.160.0 --silent', { cwd: threeDir, stdio: 'ignore' });
  execSync('tar xzf three-0.160.0.tgz', { cwd: threeDir });
}
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
  const m = /^https:\/\/unpkg\.com\/three@0\.160\.0\/(.+)$/.exec(route.request().url());
  if (m) return route.fulfill({ path: join(threeDir, 'package', m[1].split('?')[0]), contentType: 'application/javascript' });
  return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && process.env.SMOKE_VERBOSE) console.log(`  (http ${r.status()} ${r.request().method()} ${r.url().replace(SITE, '')})`); });
await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };

try {
  await page.goto(`${SITE}/#y3k-code=${enginePort}-${code}`);
  await page.waitForFunction(() => !location.hash, null, { timeout: 5000 }).catch(() => {});
  check('the pairing code left the address bar at once', !(await page.evaluate(() => location.hash)).includes('y3k-code'));
  // sign in the way a person does, through the card
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 10000 });
  check('the founder signs in', true);

  await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 });
  check('the laptop shows for the founder', true);
  const rails = await page.evaluate(() => ['home-nav', 'home-nav-right'].map((id) => [...document.querySelectorAll(`#${id} .nav-btn`)].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id)));
  check('six glyphs on each rail', rails[0].length === 6 && rails[1].length === 6, JSON.stringify(rails));
  check('go live is on the left rail', rails[0].includes('broadcast') && !rails[1].includes('broadcast'));

  // the engine's link carried us straight into Code, which paired
  await page.waitForSelector('.cv-folderrow', { timeout: 20000 });
  check('paired through the link, with a yes on the computer', pairing.list().length === 1);
  await shot('1-folders');

  await page.click('.cv-folderrow');
  await page.waitForSelector('.cv-modecard.m-ask', { timeout: 5000 });
  check('a first visit to a folder asks for a mode', true);
  await shot('2-mode');
  await page.click('.cv-modecard.m-ask');
  await page.waitForSelector('.cv-input', { timeout: 8000 });
  check('the mode is remembered for the folder', store.folders()[repo]?.mode === 'ask');

  // the orb keeps its column
  const geo = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const pane = document.querySelector('.cv-pane').getBoundingClientRect();
    const cv = document.querySelector('#stage canvas')?.getBoundingClientRect();
    return { st: [st.left, st.width, st.height], pane: [pane.left, pane.right], cv: cv ? [cv.left, cv.width] : null, vw: innerWidth };
  });
  check('the orb has its own column to the right of the pane', geo.st[1] >= 230 && geo.st[1] <= 410 && geo.pane[1] <= geo.st[0] + 1, JSON.stringify(geo));
  check('the orb\'s canvas fills that column (so the orb is centred in it)', geo.cv && Math.abs(geo.cv[0] - geo.st[0]) < 2 && Math.abs(geo.cv[1] - geo.st[1]) < 2, JSON.stringify(geo.cv));

  // orion writes the coder a note; it waits, editable, for the first message
  await page.waitForSelector('.cv-notecard:not(.writing) .cv-noteta', { timeout: 10000 });
  const noteShown = await page.inputValue('.cv-notecard .cv-noteta');
  check('orion writes Claude a note, cleaned, for you to read first', /Colin is building y3k Code/.test(noteShown) && !/<<|HACKED|\[tender/.test(noteShown), noteShown);
  await page.fill('.cv-notecard .cv-noteta', noteShown + ' (edited)');
  await shot('3a-note');
  await page.fill('.cv-input', "Use the Edit tool to change the word 'world' to 'y3k' in hello.txt.");
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm:not(.done)', { timeout: 10000 });
  const card = await page.evaluate(() => {
    const pm = document.querySelector('.it.pm:not(.done)');
    const what = pm.querySelector('.pm-what');
    const acts = pm.querySelector('.pm-acts');
    return {
      del: [...pm.querySelectorAll('.df-del .df-code')].map((e) => e.textContent),
      add: [...pm.querySelectorAll('.df-add .df-code')].map((e) => e.textContent),
      diffFirst: !!(what && acts && (what.compareDocumentPosition(acts) & Node.DOCUMENT_POSITION_FOLLOWING)),
      q: pm.querySelector('.pm-q')?.textContent,
      dot: document.getElementById('nav-code').classList.contains('needs-you'),
    };
  });
  check('the card shows the change: − world, + y3k', card.del.join() === 'world' && card.add.join() === 'y3k', JSON.stringify(card));
  check('the change comes before the buttons', card.diffFirst);
  check('it says who wants what', /Claude wants to edit/.test(card.q || ''), card.q);
  check('the laptop wears the amber dot while it waits', card.dot);
  check('nothing has changed on disk while it asks', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\nworld\n');
  const firstIn = readFileSync(join(tmp, 'fake.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.kind === 'in' && x.msg.type === 'user');
  const sent = firstIn?.msg.message.content.find((b) => b.type === 'text')?.text || '';
  check('the note went to the coder with the first message, framed, as you left it', /^<context from="yearthreethousand" kind="companion-note" presence="orion">/.test(sent) && /\(edited\)/.test(sent) && /Use the Edit tool/.test(sent), sent.slice(0, 160));
  check('the note card is gone once the conversation starts', !(await page.$('.cv-notecard')));
  check('your message says it carried the note', /with a note from orion/.test(await page.textContent('.it.us')));
  await shot('3-permission');

  await page.focus('.cv-input');
  await page.keyboard.press('Enter'); // an empty Enter answers the waiting card
  await page.waitForSelector('.it.pm.done.pm-allow', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.mt-ctx .mt-num')?.textContent === '11%', null, { timeout: 8000 }).catch(() => {});
  const after = await page.evaluate(() => ({
    file: null,
    edit: !!document.querySelector('.it.tl.tk-edit.st-ok .df-add'),
    ctx: document.querySelector('.mt-ctx .mt-num')?.textContent,
    lims: [...document.querySelectorAll('.mt-lim')].map((e) => e.textContent),
    cost: document.querySelector('.mt-cost')?.textContent,
    dot: document.getElementById('nav-code').classList.contains('needs-you'),
    text: document.querySelector('.cv-list .it.as:last-of-type')?.textContent,
  }));
  check('allowed: the file changed', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n');
  check('the edit\'s card keeps its green/red diff', after.edit);
  check('context ring 11%', after.ctx === '11%', after.ctx);
  check('5-hour and weekly bars (a model\'s own weekly window is in the panel)', after.lims.length === 2 && /5h/.test(after.lims[0]) && /wk/.test(after.lims[1]), JSON.stringify(after.lims));
  check('cost, and who pays: the fake signs in with a Max plan, so it is covered', /^\$\d+\.\d\d · covered$/.test(after.cost || ''), after.cost);
  check('the dot goes when nothing waits', !after.dot);
  await shot('4-allowed');

  // THE CONTEXT PANEL: the ring opens it; the breakdown opens in it; Escape closes it
  await page.click('.mt-ctx');
  await page.waitForSelector('.cx-panel', { timeout: 5000 });
  const cx = await page.evaluate(() => {
    const p = document.querySelector('.cx-panel');
    const r = p.getBoundingClientRect();
    return { text: p.textContent, segs: p.querySelectorAll('.cx-seg').length, limits: [...p.querySelectorAll('.cx-limname')].map((e) => e.textContent), onScreen: r.top >= 0 && r.right <= innerWidth && r.width > 200 };
  });
  check('the ring opens the context panel: the window by part, until auto-compact, the plan by window', /Context window/.test(cx.text) && /\d+(\.\d)?k until auto-compact/.test(cx.text) && cx.segs >= 3 && cx.onScreen
    && JSON.stringify(cx.limits) === JSON.stringify(['5-hour limit', 'Weekly · all models', 'Weekly · Fable']) && /Plan usage limits · Max/.test(cx.text), JSON.stringify(cx));
  await page.click('.cx-panel .cx-more');
  await page.waitForSelector('.cx-panel .cx-parts', { timeout: 3000 });
  const parts = await page.evaluate(() => [...document.querySelectorAll('.cx-panel .cx-part .cx-name')].map((e) => e.textContent));
  check('the detailed breakdown lists every part, deferred too', parts.includes('Messages') && parts.includes('Free space') && parts.some((x) => /deferred/.test(x)), JSON.stringify(parts));
  await shot('4b-context-panel');
  await page.keyboard.press('Escape');
  check('Escape closes the panel, and stops nothing', !(await page.$('.cx-panel')) && !(await page.$('.it.sys.st-stopped')));

  // THE MODEL DROPDOWN, in y3k glass: every model with its line, and any other by name
  await page.click('.cv-controls .cv-sel .gs-btn');
  await page.waitForSelector('.gs-pop .gs-opt', { timeout: 3000 });
  const dd = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('.gs-pop .gs-opt:not(.gs-other) .gs-label')].map((e) => e.textContent),
    descs: document.querySelectorAll('.gs-pop .gs-desc').length,
    other: !!document.querySelector('.gs-pop .gs-other'),
    native: getComputedStyle(document.querySelector('.cv-controls select')).display,
  }));
  check('the model list is y3k glass: every model, a line under each, and "Another model…"', dd.opts.length >= 1 && dd.descs >= 1 && dd.other && dd.native === 'none', JSON.stringify(dd));
  await shot('4c-model-dropdown');
  await page.keyboard.press('Escape');
  check('Escape closes the list', !(await page.$('.gs-pop')));

  // the folder's changes, from the git chip
  await page.waitForSelector('.cv-gitbtn .cv-gitn', { timeout: 8000 });
  check('the git chip counts the changed file', (await page.textContent('.cv-gitbtn .cv-gitn')) === '1');
  await page.click('.cv-gitbtn');
  await page.click('.cv-change');
  await page.waitForSelector('.cv-diffs .df-add', { timeout: 8000 });
  check('the changes drawer shows the file\'s diff', (await page.textContent('.cv-diffs .df-add .df-code')) === 'y3k');
  await shot('4b-changes');
  await page.click('.cv-iconbtn[title="What y3k Code did on this computer"]');
  await page.waitForSelector('.cv-actrow', { timeout: 8000 });
  check('the activity drawer reads the local record', /Allowed Edit/.test(await page.textContent('.cv-drawer')));
  await page.click('.cv-iconbtn[title="Connectors"]');
  await page.waitForFunction(() => /Add a connector/.test(document.querySelector('.cv-drawer')?.textContent || ''), null, { timeout: 8000 });
  check('the connectors drawer opens', true);
  await page.click('.cv-drawerhead .cv-iconbtn');
  await page.click('.cv-iconbtn[title="Coding tools and keys"]');
  await page.waitForSelector('.cv-vias', { timeout: 8000 });
  const tools = await page.evaluate(() => ({ names: [...document.querySelectorAll('.cv-prov .cv-provhead b')].map((b) => b.textContent), vias: document.querySelectorAll('.cv-vias .cv-keyin').length }));
  check('the tools drawer lists every coding tool, and a key for each open-model provider', ['Claude Code', 'Codex', 'Gemini CLI', 'OpenCode'].every((n) => tools.names.includes(n)) && tools.vias === 8, JSON.stringify(tools));
  await shot('4c-tools');
  await page.click('.cv-drawerhead .cv-iconbtn');

  await page.fill('.cv-input', 'now plan it');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cv-todos', { timeout: 8000 });
  await page.waitForSelector('.it.tl.tk-task .tl-children .tk-search', { timeout: 8000 });
  const rich = await page.evaluate(() => ({
    todos: document.querySelector('.cv-todos summary')?.textContent,
    nested: document.querySelectorAll('.it.tl.tk-task .tl-children .it').length,
    code: document.querySelector('.cv-list .it.as:last-child .md-code')?.textContent,
    bullets: document.querySelectorAll('.cv-list .it.as:last-child li').length,
  }));
  check('todos: 1 of 3 done', /1 of 3 done/.test(rich.todos || ''), rich.todos);
  check('the subagent\'s tool and words are nested inside its card', rich.nested >= 2, String(rich.nested));
  check('markdown: inline code and a list', rich.code === 'the plan' && rich.bullets === 2, JSON.stringify(rich));
  await shot('5-rich');

  // who answers: the maker's mark and the model, at the composer's edge
  const who = await page.evaluate(() => ({ mark: !!document.querySelector('.cv-who .mk-anthropic'), name: document.querySelector('.cv-who .cv-whoname')?.textContent, orion: document.querySelector('.cv-who')?.classList.contains('orion') }));
  check('the composer shows who answers: Claude\'s mark, the model under it', who.mark && !!who.name && who.name !== 'Claude' && !who.orion, JSON.stringify(who));

  // THE CODER MOVES THE ORB: its `orb` tool, called the way Claude Code calls
  // it (the MCP config the engine handed the fake claude), reaches this page,
  // moves the orb, and the page's answer is what the coder hears back
  const spawnLine = readFileSync(join(tmp, 'fake.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.kind === 'spawn');
  const mcpCfg = JSON.parse(readFileSync(spawnLine.argv[spawnLine.argv.indexOf('--mcp-config') + 1], 'utf8')).mcpServers.y3k;
  const orbCall = async (kommand) => (await (await fetch(mcpCfg.url, { method: 'POST', headers: { ...mcpCfg.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'orb', arguments: { kommand } } }) })).json()).result;
  const moved = await orbCall('color/gold/form/heart/mood/excited');
  check('the coder moves the orb: the page did it, and said so back', !moved.isError && /^The orb moved: color\/gold\/form\/heart\/mood\/excited$/.test(moved.content[0].text), JSON.stringify(moved));
  const wrong = await orbCall('form/blob');
  check('words the orb does not know: the coder hears why, and what to try', wrong.isError && /no form called blob.*sphere/.test(wrong.content[0].text), JSON.stringify(wrong));
  await page.evaluate(async () => {
    const { createCodeView } = await import('/src/code/code-view.js');
    const cv = createCodeView(), sid = cv._state.active;
    cv._feed({ sid, type: 'tool.call', callId: 'orb1', name: 'mcp__y3k__orb', kind: 'mcp', title: 'y3k · orb', input: { kommand: 'color/gold/form/heart' }, preview: {} });
    cv._feed({ sid, type: 'tool.result', callId: 'orb1', status: 'ok', output: { text: 'The orb moved: color/gold/form/heart' } });
  });
  // drawn on the view's next frame, which is not always before this line runs
  await page.waitForSelector('.it.tl.orbcall', { timeout: 5000 }).catch(() => {});
  const bead = await page.evaluate(() => document.querySelector('.it.tl.orbcall')?.textContent || '');
  check('in the transcript it is a bead of the orb\'s colours, not a tool card', /moved the orb/.test(bead) && /color\/gold\/form\/heart/.test(bead), bead);
  await shot('5a-orb');

  // talk to orion from here: the coder does not see it, orion answers here.
  // Pressing the mark turns it into a small orb: orion alone, no hands on the computer
  await page.click('.cv-who');
  await page.waitForSelector('.cv-who.orion');
  await page.waitForTimeout(600);
  const mini = await page.evaluate(() => ({ name: document.querySelector('.cv-who .cv-whoname')?.textContent, orb: getComputedStyle(document.querySelector('.cv-who .cv-whoorb')).opacity, mark: getComputedStyle(document.querySelector('.cv-who .cv-whomark')).opacity, ph: document.querySelector('.cv-input').placeholder }));
  check('pressed, the mark turns into a small orb: orion, alone', mini.name === 'orion' && +mini.orb > 0.9 && +mini.mark < 0.1 && /orion/.test(mini.ph), JSON.stringify(mini));
  await shot('5b-orion-mini');
  await page.fill('.cv-input', 'orion, how is it going?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.or.or-you', { timeout: 5000 });
  await page.waitForSelector('.it.or.or-orion', { timeout: 20000 });
  const orionSaid = await page.textContent('.it.or.or-orion .or-text');
  check('talking to orion from Code: it answers here, not to the coder', /Colin is building/.test(orionSaid) && !readFileSync(join(tmp, 'fake.log'), 'utf8').includes('how is it going'), orionSaid);
  await page.hover('.it.or.or-orion');
  await page.click('.it.or.or-orion .pass');
  const passed = await page.evaluate(() => ({ text: document.querySelector('.cv-input').value, orion: document.querySelector('.cv-who')?.classList.contains('orion') }));
  check('pass to Claude puts orion\'s words in your message to Claude, unsent — and the mark is back', /Colin is building/.test(passed.text) && passed.orion === false, JSON.stringify(passed));
  await shot('5b-orion');
  await page.fill('.cv-input', '');

  await page.fill('.cv-input', 'go slow');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Working on it/.test(document.querySelector('.cv-list')?.textContent || ''), null, { timeout: 8000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.it.sys.st-stopped', { timeout: 8000 });
  check('Esc stops a running turn', true);

  const md = await page.evaluate(async () => {
    const { markdown } = await import('/src/code/render/markdown.js');
    const el = markdown('![x](https://evil.example/x.png) [bad](javascript:alert(1)) <img src=x onerror=alert(1)> [ok](https://example.com)\n\n```js\nconst a = "<b>";\n```');
    return { imgs: el.querySelectorAll('img').length, hrefs: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')), bold: el.querySelectorAll('b').length, code: el.querySelector('pre')?.textContent };
  });
  check('markdown never loads an image', md.imgs === 0, JSON.stringify(md));
  check('markdown links are http(s) only', md.hrefs.every((h) => /^https:/.test(h)) && md.hrefs.length === 2, JSON.stringify(md.hrefs));
  check('markup in a message stays text', md.bold === 0 && md.code === 'const a = "<b>";', JSON.stringify(md));

  // the line back: drafted here, read and sent by you, onto orion's shelf
  await page.click('.cv-tell');
  await page.waitForSelector('.cv-notecard.back .cv-noteta', { timeout: 5000 });
  const draft = await page.inputValue('.cv-notecard.back .cv-noteta');
  check('a factual line back is drafted', /^Coded with Claude .* in y3k-smoke-repo-\w+ for \d+ min: \d+ turns?, changed 1 file \(hello\.txt\)\.$/.test(draft), draft);
  await page.click('.cv-notecard.back .btn-allow');
  await page.waitForFunction(() => !document.querySelector('.cv-notecard.back'), null, { timeout: 5000 });
  const shelf = JSON.parse(readFileSync(join(tmp, 'data', '.clippings.json'), 'utf8'));
  const lines = Object.values(shelf).flat().map((c) => c.x);
  check('it lands on orion\'s shelf, labelled', lines.some((x) => x.startsWith('from y3k Code (a coding session): Coded with Claude')), JSON.stringify(lines.slice(-2)));

  // --- RENDERING: smooth, flicker-free, keeps your typing ----------------------------
  // Made-up events go in through the view's own path (the controller's _feed),
  // exactly as a stream from the engine would, and the page is watched as it
  // draws them. Counts and identities only: timings mean nothing under
  // SwiftShader on a shared machine.
  const drawn = await page.evaluate(async () => {
    const { createCodeView } = await import('/src/code/code-view.js');
    const { markdown } = await import('/src/code/render/markdown.js');
    const cv = createCodeView();
    const S = cv._state;
    const sid = S.active;
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const out = {};
    // 1. a reply streaming in: one element for its whole life, one rise
    const rises = new Map();
    const onRise = (e) => { if (/^(cv-rise|lg-in|lg-melt)$/.test(e.animationName)) rises.set(e.target, (rises.get(e.target) || 0) + 1); };
    document.addEventListener('animationstart', onRise, true);
    const id = 'msg_smoke_stream';
    const full = 'Streaming words arrive a few at a time, and **nothing** flickers.\n\n```js\nconst x = 1;\nfunction f() { return x; }\n```\n\n- one\n- two\n\nDone.';
    let el0 = null, replaced = 0;
    for (const w of full.match(/[\s\S]{1,5}/g)) {
      cv._feed({ sid, type: 'message.delta', id, block: 0, kind: 'text', text: w });
      await frame();
      const el = document.querySelector('.cv-list > .it.as:last-child');
      if (!el0) el0 = el; else if (el !== el0) replaced++;
    }
    cv._feed({ sid, type: 'message.end', id });
    await frame();
    await new Promise((r) => setTimeout(r, 400));
    document.removeEventListener('animationstart', onRise, true);
    out.stream = { replaced, rises: rises.get(el0) || 0, reRisen: [...rises.values()].filter((n) => n > 1).length, opacity: getComputedStyle(el0).opacity,
      same: el0.querySelector('.md')?.textContent === markdown(full).textContent, code: el0.querySelectorAll('.md-pre .tk-k').length };
    // 2. typing while meta events land: the same textarea, focus and caret
    const ta = document.querySelector('.cv-input');
    ta.focus();
    ta.value = 'half a thought';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.setSelectionRange(4, 4);
    const sel = document.querySelector('.cv-controls select');
    const other = 'smoke-bg';
    for (const e of [{ type: 'turn.started' }, { type: 'usage.context', used: 30000, limit: 200000 }, { type: 'todo.update', items: [{ content: 'a', status: 'in_progress', activeForm: 'doing a' }] },
      { type: 'usage.cost', totalUsd: 0.5 }, { type: 'git.status', branch: 'main', files: [] }, { type: 'session.state', state: 'running' },
      { sid: other, type: 'session.started', provider: 'claude', cwd: '/tmp/smoke-bg', mode: 'ask' },
      { sid: other, type: 'message.delta', id: 'bg1', block: 0, kind: 'text', text: 'elsewhere' }, { type: 'turn.ended', status: 'success' }]) {
      cv._feed({ sid, ...e });
      await frame();
    }
    out.composer = { same: document.querySelector('.cv-input') === ta, focused: document.activeElement === ta, caret: ta.selectionStart, value: ta.value,
      selectKept: document.querySelector('.cv-controls select') === sel,
      bgTab: !![...document.querySelectorAll('.cv-tab.unread')].find((t) => t.title.includes('/tmp/smoke-bg')) };
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 3. a long session opens in slices: a few items at once, the rest after
    const long = 'smoke-long';
    cv._feed({ sid: long, type: 'session.started', provider: 'claude', cwd: '/tmp/smoke-long', mode: 'ask' });
    for (let i = 0; i < 800; i++) {
      cv._feed({ sid: long, type: 'message.user', text: 'question ' + i });
      cv._feed({ sid: long, type: 'message.block', id: 'l' + i, block: 0, kind: 'text', text: `answer **${i}**\n\n\`\`\`js\nconst n = ${i};\n\`\`\`` });
      cv._feed({ sid: long, type: 'message.end', id: 'l' + i });
    }
    await frame();
    const tab = [...document.querySelectorAll('.cv-tab')].find((t) => t.title.includes('/tmp/smoke-long'));
    tab.click();
    const atOnce = document.querySelectorAll('.cv-list > .it').length;
    for (let k = 0; k < 200 && document.querySelectorAll('.cv-list > .it').length < 400; k++) await new Promise((r) => setTimeout(r, 50));
    const all = document.querySelectorAll('.cv-list > .it').length;
    const older = document.querySelector('.cv-older')?.textContent;
    document.querySelector('.cv-older')?.click();
    for (let k = 0; k < 200 && document.querySelectorAll('.cv-list > .it').length < 500; k++) await new Promise((r) => setTimeout(r, 50));
    out.long = { atOnce, all, older, paged: document.querySelectorAll('.cv-list > .it').length, first: document.querySelector('.cv-list > .it .us-text')?.textContent };
    // back to the real session; the made-up ones end
    [...document.querySelectorAll('.cv-tab')].find((t) => !/smoke-(long|bg)/.test(t.title) && !t.classList.contains('cv-new'))?.click();
    cv._feed({ sid: long, type: 'session.ended', reason: 'stopped' });
    cv._feed({ sid: other, type: 'session.ended', reason: 'stopped' });
    await frame();
    return out;
  });
  check('rendering: a streaming reply keeps one element from first word to last', drawn.stream.replaced === 0, JSON.stringify(drawn.stream));
  check('rendering: it rises in once, and nothing already on screen rises again', drawn.stream.rises <= 1 && drawn.stream.reRisen === 0, JSON.stringify(drawn.stream));
  check('rendering: it ends fully opaque, drawn as the whole text would be, its code coloured', drawn.stream.opacity === '1' && drawn.stream.same && drawn.stream.code >= 2, JSON.stringify(drawn.stream));
  check('rendering: typing survives meta events — same textarea, focus, caret, words', drawn.composer.same && drawn.composer.focused && drawn.composer.caret === 4 && drawn.composer.value === 'half a thought', JSON.stringify(drawn.composer));
  check('rendering: the toolbar is patched, not rebuilt (the model select is the same element)', drawn.composer.selectKept, JSON.stringify(drawn.composer));
  check('rendering: a session in another tab only lights its tab', drawn.composer.bgTab, JSON.stringify(drawn.composer));
  check('rendering: a long session opens with a few items at once, the rest in slices', drawn.long.atOnce <= 40 && drawn.long.all === 400, JSON.stringify(drawn.long));
  check('rendering: "show earlier" adds a page above, not everything', drawn.long.older === 'show 1200 earlier' && drawn.long.paged === 500 && drawn.long.first === 'question 550', JSON.stringify(drawn.long));
  await page.waitForSelector('.cv-list .it.tl.tk-edit', { timeout: 8000 });

  // leaving and coming back keeps the session
  await page.click('#nav-feed');
  await page.waitForFunction(() => !document.querySelector('.code-root'), null, { timeout: 5000 });
  const stageBack = await page.evaluate(() => [document.getElementById('stage').getBoundingClientRect().width, innerWidth]);
  check('leaving Code gives the orb the whole room again', stageBack[0] === stageBack[1], String(stageBack));
  await page.click('#nav-code');
  await page.waitForSelector('.cv-list .it.tl.tk-edit', { timeout: 8000 });
  check('coming back, the session is still there', true);

  await page.waitForTimeout(400);
  const csp = await page.evaluate(() => window.__csp);
  const codeErrors = errors.filter((e) => /code|y3k-code|127\.0\.0\.1/i.test(e));
  check('no page errors from Code', codeErrors.length === 0, codeErrors.join(' | '));
  check('no content-policy violations', csp.length === 0, csp.join(' | '));
  if (errors.length) console.log('  (other console errors:', errors.slice(0, 5).join(' | '), ')');
  await shot('6-final');

  // --- y3kode's front door (src/code/onboard.js) -------------------------------------
  // The glyph's name; a signed-out Claude Code shows how to sign in, never a key
  // field, while the open models still take theirs; the first-run card with its
  // two ways in; the copied command ending in --pair <CODE>; and, against a
  // second engine whose "yes on your computer" is held, the pairing screen
  // (which used to be painted over) and the approval window for a companion.
  console.log('\n  the front door:');
  const doorFrom = errors.length;
  const glyph = await page.evaluate(() => { const b = document.getElementById('nav-code'); return [b.title, b.getAttribute('aria-label')]; });
  check('the laptop glyph is called kode', glyph[0] === 'kode' && glyph[1] === 'kode', JSON.stringify(glyph));

  // Claude Code signed out, as the engine reports it (patched on the way back)
  const cmdUrl = `http://127.0.0.1:${enginePort}/v1/cmd`;
  await page.route(cmdUrl, async (route) => {
    const req = route.request();
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* not ours */ }
    if (req.method() !== 'POST' || !['provider.refresh', 'engine.hello'].includes(body.cmd)) return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    if (Array.isArray(j.providers)) j.providers = j.providers.map((x) => (x.id === 'claude' ? { ...x, auth: 'signed-out', loginCommand: 'claude', keySet: false } : x));
    const headers = { ...res.headers() };
    delete headers['content-length'];
    return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
  });
  await page.click('.cv-iconbtn[title="Coding tools and keys"]');
  await page.click('.cv-drawer > .cv-acts .btn');
  await page.waitForSelector('.cv-drawer .ob-signin', { timeout: 8000 });
  const claudeRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.cv-drawer .cv-prov')].find((r) => r.querySelector('.cv-provhead b')?.textContent === 'Claude Code');
    return row && { text: row.textContent, cmd: row.querySelector('.ob-signin code')?.textContent, inputs: row.querySelectorAll('input').length, useKey: !!row.querySelector('.ob-usekey') };
  });
  check('a signed-out Claude Code says how to sign in: `claude`', claudeRow?.cmd === 'claude' && /Sign in to Claude Code first: open Terminal, run claude, sign in, then come back/.test(claudeRow.text), JSON.stringify(claudeRow));
  check('…and shows no key field (only "Use an API key instead")', claudeRow?.inputs === 0 && claudeRow.useKey, JSON.stringify(claudeRow));
  const viaKeys = await page.evaluate(() => document.querySelectorAll('.cv-drawer .cv-vias .cv-keyin').length);
  check('the open models reached through OpenCode still ask for their key', viaKeys === 8, String(viaKeys));
  await shot('7-signin');
  await page.click('.cv-drawerhead .cv-iconbtn');
  await page.click('.cv-tab.cv-new');
  await page.waitForSelector('.ob-gate', { timeout: 8000 });
  const gate = await page.evaluate(() => ({ text: document.querySelector('.ob-gate')?.textContent, cont: !!document.querySelector('.ob-continue') }));
  check('the folder screen asks for the sign-in before a folder and a mode', /Sign in to Claude Code first/.test(gate.text || '') && !gate.cont, JSON.stringify(gate));
  await page.unroute(cmdUrl);
  await page.click('.ob-gate .ob-refresh');
  await page.waitForSelector('.ob-continue', { timeout: 8000 });
  const cont = await page.evaluate(() => ({ text: document.querySelector('.ob-continue')?.textContent, focused: document.activeElement?.classList.contains('ob-continue'), gate: !!document.querySelector('.ob-gate') }));
  check('signed in: one Continue, focused for Enter', /^Continue in y3k-smoke-repo-\w+ · Claude · ask/.test(cont.text || '') && cont.focused && !cont.gate, JSON.stringify(cont));
  await shot('8-continue');

  // first run: this browser disconnected
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await page.route(`${SITE}/api/code/setup`, (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, command: `npx -y ${SITE}/code/dl/SMOKETOKEN/y3k-code.tgz`, download: '/api/code/engine.tgz', appUrl: null, expiresAt: Date.now() + 86400000, node: '20.6',
      builds: [['mac', 'arm64', 'Mac · Apple silicon'], ['mac', 'x64', 'Mac · Intel'], ['win', 'x64', 'Windows'], ['win', 'arm64', 'Windows on Arm'], ['linux', 'x64', 'Linux'], ['linux', 'arm64', 'Linux on Arm']]
        .map(([os, arch, label]) => ({ os, arch, label, url: `https://dl.test/y3k-${os}-${arch}.bin` })) }) }));
  await page.click('.cv-iconbtn[title="Coding tools and keys"]');
  await page.click('.cv-drawer >> text=Disconnect this browser');
  await page.waitForSelector('.ob-first .ob-copystart', { timeout: 8000 });
  const first = await page.evaluate(() => ({
    app: document.querySelector('.ob-apppath')?.textContent, cmd: document.querySelector('.ob-cmdpath')?.textContent,
    buttons: [...document.querySelectorAll('.ob-first .btn-allow')].map((b) => b.textContent),
    open: [...document.querySelectorAll('.ob-apppath button')].some((b) => b.textContent === 'Open the y3k app'),
    dl: document.querySelector('.ob-apppath a.ob-dl')?.getAttribute('href'),
    here: document.querySelector('.ob-build[aria-pressed="true"]')?.textContent,
  }));
  check('first run: y3kode is better on desktop (this computer\'s build chosen), or one line for Terminal', /y3kode is better on desktop/.test(first.app || '') && /Or start it from Terminal/.test(first.cmd || '')
    && first.buttons.includes('Download for Linux') && first.dl === 'https://dl.test/y3k-linux-x64.bin' && first.here === 'Linuxthis computer'
    && first.open && first.buttons.includes('Copy the start command'), JSON.stringify(first));
  await shot('9-first-run');
  await page.click('.ob-copystart');
  await page.waitForSelector('.ob-after .ob-watch', { timeout: 8000 });
  const copiedCmd = await page.evaluate(async () => ({
    shown: document.querySelector('.ob-after .ob-cmd')?.textContent,
    clip: await navigator.clipboard.readText().catch((e) => 'unreadable: ' + e.message),
    steps: [...document.querySelectorAll('.ob-steps li')].map((li) => li.textContent),
    watch: document.querySelector('.ob-watch')?.textContent,
  }));
  const PAIRED = /^npx -y \S+\/code\/dl\/SMOKETOKEN\/y3k-code\.tgz --pair [ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
  check('Copy the start command copies it, ending in --pair <CODE>', PAIRED.test(copiedCmd.clip) && copiedCmd.clip === copiedCmd.shown, JSON.stringify(copiedCmd));
  check('then: Open Terminal · Paste · Press Return, and it waits by itself', copiedCmd.steps.length === 3 && /Open Terminal/.test(copiedCmd.steps[0]) && /Waiting for y3kode to start/.test(copiedCmd.watch || ''), JSON.stringify(copiedCmd.steps));
  await shot('10-copied');

  // a second engine, whose yes is held until this script gives it
  let answer = null;
  const store2 = createStore(join(tmp, 'engine2'));
  const engine2 = createEngine({ store: store2, consent: () => new Promise((res) => { answer = res; }), env: { ...process.env, FAKE_CLAUDE_LOG: join(tmp, 'fake2.log') }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') } });
  const pairing2 = createPairing({ load: store2.tokens, save: store2.setTokens });
  const http2 = createHttp({ engine: engine2, pairing: pairing2, origins: [SITE] });
  const port2 = await http2.listen(0);
  try {
    await page.goto(`${SITE}/#y3k-code=${port2}-${pairing2.issueCode()}`, { waitUntil: 'commit' });
    await page.waitForSelector('.ob-pairing .ob-approve', { timeout: 30000 });
    await page.waitForTimeout(800); // what used to paint over it came right after
    const asking = await page.evaluate(() => ({ title: document.querySelector('.ob-pairing .cv-title')?.textContent, btn: !!document.querySelector('.ob-pairing .ob-approve') }));
    check('the pairing screen stays up while the computer is asked', asking.title === 'Say yes on your computer' && asking.btn, JSON.stringify(asking));
    await shot('11-pairing');
    answer?.(true);
    await page.waitForSelector('.cv-pick', { timeout: 15000 });
    check('said yes on the computer: paired, on to the folders', pairing2.list().length === 1);
    const other = realpathSync(mkdtempSync(join(tmp, 'untrusted-')));
    const opening = engine2.handle({ cmd: 'workspace.open', path: other });
    await page.waitForSelector('.cv-banner .ob-ask .ob-approve', { timeout: 10000 });
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), page.click('.cv-banner .ob-ask .ob-approve')]);
    check('a consent pending on a companion opens its approval window', popup.url() === `http://127.0.0.1:${port2}/approve`, popup.url());
    await popup.close();
    await shot('12-approve');
    answer?.(false);
    await opening;
    await page.waitForFunction(() => !document.querySelector('.cv-banner .ob-ask'), null, { timeout: 8000 });
  } finally {
    engine2.shutdown();
    await http2.close();
  }
  // Probing a port nobody listens on is how the watch looks; the browser logs
  // each refusal. Anything else from the front door is a failure.
  const doorErrors = errors.slice(doorFrom).filter((e) => /code|y3k|127\.0\.0\.1/i.test(e) && !/127\.0\.0\.1:478\d\d\/v1\/hello.*(ERR_CONNECTION_REFUSED|Failed to fetch)|net::ERR_CONNECTION_REFUSED/.test(e));
  check('no page errors from the front door', doorErrors.length === 0, doorErrors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await shot('error').catch(() => {});
  if (errors.length) console.log('  console:', errors.slice(0, 8).join('\n    '));
  if (process.env.SMOKE_VERBOSE) console.log(serverLog.slice(-3000));
} finally {
  await browser.close().catch(() => {});
  engine.shutdown();
  await http.close();
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
