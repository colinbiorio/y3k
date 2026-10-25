// THE APP, RIGHT OF THE NAME (2026-10-24). Colin: "can you add a 'y3k' logo --
// the same one used for the browser tab, as a download app glyph titled
// 'download' directly right of the yearthreethousand logo, but smaller and
// also individually spinnable".
//
// Where a press goes (src/download-glyph.js downloadTarget: the build for this
// computer, else the site's app page, else the newest release), how a press is
// told from a turn, that nothing new is asked of the site, and the lines that
// put the glyph beside the name, in the name's metal, on its own spin, and
// hidden wherever the name is.
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadTarget, wireDownloadGlyph, RELEASES, TURNED } from '../src/download-glyph.js';
import { appBuilds } from '../code-download.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const tick = () => new Promise((r) => setTimeout(r, 0));

const FOLDER = 'https://github.com/colinbiorio/y3k/releases/latest/download';
const MAC_ARM = { os: 'mac', arch: 'arm64', sure: true };

console.log('\nwhere a press goes (downloadTarget):');

await ok('the build for this computer, when the site lists one', () => {
  const setup = { appUrl: 'https://example.com/app', builds: appBuilds(FOLDER) };
  assert.equal(downloadTarget(setup, MAC_ARM), FOLDER + '/y3k-mac-arm64.dmg');
  assert.equal(downloadTarget(setup, { os: 'mac', arch: 'x64' }), FOLDER + '/y3k-mac-x64.dmg');
  assert.equal(downloadTarget(setup, { os: 'win', arch: 'x64' }), FOLDER + '/y3k-win-x64.exe');
  assert.equal(downloadTarget(setup, { os: 'linux', arch: 'arm64' }), FOLDER + '/y3k-linux-arm64.AppImage');
  // an arch the list does not have: that computer's other build (code/platform.js pickBuild)
  assert.equal(downloadTarget({ builds: [{ os: 'mac', arch: 'x64', url: 'https://x.test/intel.dmg' }] }, MAC_ARM), 'https://x.test/intel.dmg');
});
await ok('else the page the site says the app is on', () => {
  // Y3K_APP_DOWNLOADS unset: every build is listed with url null
  assert.equal(downloadTarget({ appUrl: 'https://example.com/app', builds: appBuilds(undefined) }, MAC_ARM), 'https://example.com/app');
  // a phone has no build of its own
  assert.equal(downloadTarget({ appUrl: 'https://example.com/app', builds: appBuilds(FOLDER) }, { os: 'ios', arch: null }), 'https://example.com/app');
});
await ok('else the newest release, whatever else is missing', () => {
  assert.equal(RELEASES, 'https://github.com/colinbiorio/y3k/releases/latest');
  for (const [s, p] of [[null, null], [undefined, MAC_ARM], [{}, MAC_ARM], [{ builds: appBuilds('') , appUrl: null }, MAC_ARM],
    [{ builds: appBuilds(FOLDER) }, null], [{ builds: appBuilds(FOLDER) }, { os: 'android', arch: null }], [{ builds: 'nonsense', appUrl: 7 }, MAC_ARM]]) {
    assert.equal(downloadTarget(s, p), RELEASES, JSON.stringify([s, p]));
  }
});
await ok('only an https address is ever opened', () => {
  const bad = ['javascript:alert(1)', 'http://example.com/y3k.dmg', 'data:text/html,hi', '//example.com/x', 'https://exa mple.com/x', 'https://x.test/"onload'];
  for (const u of bad) {
    assert.equal(downloadTarget({ builds: [{ os: 'mac', arch: 'arm64', url: u }] }, MAC_ARM), RELEASES, u);
    assert.equal(downloadTarget({ appUrl: u }, MAC_ARM), RELEASES, u);
  }
  assert.equal(downloadTarget({ builds: [{ os: 'mac', arch: 'arm64', url: 'http://x.test/a.dmg' }], appUrl: 'https://x.test/app' }, MAC_ARM), 'https://x.test/app');
});

console.log('\na press, a turn, the keyboard (wireDownloadGlyph):');

// A stand-in button and window: listeners by type, events with the fields read.
const rig = (opts = {}) => {
  const on = {}, won = {};
  const el = { addEventListener: (t, f) => { (on[t] ||= []).push(f); } };
  const win = { addEventListener: (t, f) => { (won[t] ||= []).push(f); } };
  const opened = [];
  let asked = 0, looked = 0;
  const h = wireDownloadGlyph({
    el, win, wait: opts.wait ?? 40,
    open: opts.open || ((url) => opened.push(url)),
    setup: opts.setup || (async () => { asked += 1; return { builds: appBuilds(FOLDER), appUrl: null }; }),
    platform: opts.platform || (async () => { looked += 1; return MAC_ARM; }),
  });
  const ev = (extra = {}) => { const e = { clientX: 100, clientY: 50, detail: 1, stopped: false, stopPropagation() { this.stopped = true; }, ...extra }; return e; };
  const fire = (t, e = ev()) => { for (const f of on[t] || []) f(e); return e; };
  const wfire = (t, e = ev()) => { for (const f of won[t] || []) f(e); return e; };
  return { h, on, won, opened, fire, wfire, ev, asked: () => asked, looked: () => looked };
};

await ok('a press opens one tab, to the build for this computer', async () => {
  const r = rig();
  r.fire('pointerenter');
  await tick(); await tick();
  r.fire('pointerdown'); r.wfire('pointerup');
  r.fire('click');
  await tick(); await tick();
  assert.deepEqual(r.opened, [FOLDER + '/y3k-mac-arm64.dmg']);
  assert.equal(r.asked(), 1, 'the site is asked once a press looks likely, and once only');
});
await ok('the tab is opened with no way back to this page (noopener, noreferrer)', async () => {
  const g = globalThis, saved = g.window, calls = [];
  g.window = { open: (...a) => { calls.push(a); return null; }, addEventListener() {} };
  try {
    const on = {};
    const el = { addEventListener: (t, f) => { (on[t] ||= []).push(f); } };
    wireDownloadGlyph({ el, setup: async () => null, platform: async () => null, wait: 10 });
    for (const f of on.click) f({ detail: 1 });
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(calls, [[RELEASES, '_blank', 'noopener,noreferrer']], 'window.open answers null with noopener: one call, never a second "blocked?" try');
  } finally { if (saved === undefined) delete g.window; else g.window = saved; }
});
await ok('a drag turns it and opens nothing; the next press still opens', async () => {
  const r = rig();
  r.fire('pointerdown', r.ev({ clientX: 100, clientY: 50 }));
  r.wfire('pointermove', r.ev({ clientX: 104, clientY: 51 }));
  r.wfire('pointermove', r.ev({ clientX: 140, clientY: 60 }));
  r.wfire('pointerup');
  r.fire('click');   // the spin captured the pointer, so the drag still clicks the button
  await tick(); await tick();
  assert.deepEqual(r.opened, [], 'a turn opened a tab');
  r.fire('pointerdown', r.ev({ clientX: 100, clientY: 50 }));
  r.wfire('pointermove', r.ev({ clientX: 102, clientY: 51 }));   // 3px of hand shake is still a press
  r.wfire('pointerup');
  r.fire('click');
  await tick(); await tick();
  assert.equal(r.opened.length, 1);
  assert.equal(TURNED, 5, 'a turn is told from a press the way the spin itself tells them');
  assert.ok(/spinTravel < 5\)/.test(read('src/mercury-buttons.js')), "the spin's own threshold moved: keep TURNED with it");
});
await ok('the keyboard opens it even straight after a turn (its click has no press)', async () => {
  const r = rig();
  r.fire('pointerdown'); r.wfire('pointermove', r.ev({ clientX: 160 })); r.wfire('pointerup');
  r.fire('click');
  r.fire('click', r.ev({ detail: 0 }));
  await tick(); await tick();
  assert.equal(r.opened.length, 1);
});
await ok('its press and its Enter or Space never reach the name, which spins and squeezes on its own', () => {
  const r = rig();
  assert.equal(r.fire('pointerdown').stopped, true, 'a press on the glyph would turn the name too');
  assert.equal(r.fire('keydown', r.ev({ key: 'Enter' })).stopped, true);
  assert.equal(r.fire('keydown', r.ev({ key: ' ' })).stopped, true);
  assert.equal(r.fire('keydown', r.ev({ key: 'Escape' })).stopped, false, 'only the two keys the name answers stop here');
  assert.ok(!r.on.pointerup && !r.on.pointercancel, "the release must reach the window: the spin's own pointerup listens there");
});
await ok('a site that did not answer is asked again; one that did is not', async () => {
  let n = 0;
  const r = rig({ setup: async () => { n += 1; return n === 1 ? null : { builds: appBuilds(FOLDER) }; } });
  r.fire('click');
  await tick(); await tick();
  assert.deepEqual(r.opened, [RELEASES], 'no answer: the newest release');
  r.fire('click');
  await tick(); await tick();
  r.fire('focus'); r.fire('pointerenter');
  await tick();
  assert.deepEqual(r.opened, [RELEASES, FOLDER + '/y3k-mac-arm64.dmg']);
  assert.equal(n, 2);
});
await ok('a press before the site answers waits a moment, then goes where it can', async () => {
  const r = rig({ setup: () => new Promise(() => {}), wait: 30 });
  r.fire('click');
  await new Promise((res) => setTimeout(res, 10));
  assert.deepEqual(r.opened, [], 'it did not wait at all');
  await new Promise((res) => setTimeout(res, 40));
  assert.deepEqual(r.opened, [RELEASES]);
});
await ok('a broken platform probe or setup is no answer, not an error', async () => {
  const r = rig({ setup: async () => { throw new Error('offline'); }, platform: () => { throw new Error('no gl'); } });
  r.fire('click');
  await tick(); await tick(); await tick();
  assert.deepEqual(r.opened, [RELEASES]);
  assert.equal(wireDownloadGlyph({ el: null }), null);
});

console.log('\nthe lines that put it there:');

const html = read('index.html');
const css = read('styles.css');
const mount = read('src/mercury-mount.js');
const main = read('src/main.js');
const glyph = read('src/download-glyph.js');

await ok('a button titled download, inside the name and right after its png, holding the tab\'s own icon.png', () => {
  assert.ok(html.includes('<link rel="icon" type="image/png" href="icon.png" />'), 'the browser tab no longer wears icon.png');
  const i = html.indexOf('<div id="home-brand" class="home-brand">');
  const j = html.indexOf('</div>', i);
  assert.ok(i > 0 && j > i, 'the name is gone');
  const brand = html.slice(i, j);
  const b = brand.indexOf('<button id="home-download" class="home-download" type="button" title="download" aria-label="download">');
  assert.ok(b > 0, 'the download glyph is not a button titled download inside the name');
  assert.ok(brand.indexOf('id="home-brand-img"') < b, 'it is not right of the name');
  assert.ok(/<img id="home-download-img" class="home-download-img" src="icon\.png" alt="" \/>/.test(brand), 'it is not the tab\'s icon.png');
});
await ok('it hangs off the name\'s ink, smaller, and sets nothing that would let it show where the name does not', () => {
  const rules = [...css.matchAll(/\n([^\n{}]*home-download[^\n{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 3, 'the glyph\'s rules are gone');
  for (const [, sel, body] of rules) {
    const own = sel.split(',').some((s) => /\.home-download(?!-img)|#home-download(?!-img)/.test(s));
    if (own) assert.ok(!/(^|[\s;])(opacity|pointer-events|visibility|display)\s*:/.test(body), `${sel.trim()} sets its own visibility: it would stop following the name`);
  }
  const box = css.slice(css.indexOf('\n.home-download {'), css.indexOf('}', css.indexOf('\n.home-download {')));
  assert.ok(/position: absolute;/.test(box), 'it is not placed against the name');
  assert.ok(/--dl-h: calc\(var\(--brand-h\) \* 0\.45 \* var\(--dl-k\)\);/.test(box), 'it is not sized from the name (45% of its box, its share when poured smaller)');
  assert.ok(/left: calc\(var\(--brand-h\) \* 2048 \/ 699 \* \(0\.5 \+ 0\.2896 \* var\(--dl-k\)\)/.test(box), 'it no longer starts where the name\'s ink ends');
  assert.ok(/body\.merc-sdf \.home-download-img \{ visibility: hidden; \}/.test(css), 'the plain png shows under the metal');
});
await ok('the name\'s own rules still hide it, and it follows them by being inside it', () => {
  assert.ok(css.includes('body:not(.in-home) .home-brand, body.panel-open .home-brand, body.gated .home-brand { opacity: 0; }'));
  assert.ok(css.includes('body:not(.in-home) .home-brand, body.panel-open .home-brand, body.gated .home-brand { pointer-events: none; }'));
  assert.ok(css.includes('body.panel-open.in-code.nav-collapsed-top .home-brand { opacity: 0; pointer-events: none; }'));
  // the room-drawn name takes its OWN canvas, not the glyph's
  assert.ok(/body\.brand-in-room #home-brand > canvas\.mercury-blob \{/.test(css), 'the glyph would vanish with the name into the room');
  assert.ok(read('src/body.js').includes("brandEl.querySelector(':scope > canvas.mercury-blob')"), 'the room would draw the glyph as the name');
});
await ok('poured in the name\'s metal on its own mount and its own spin, drawn when the name draws', () => {
  const at = mount.indexOf("const dl = document.getElementById('home-download');");
  assert.ok(at > 0, 'the glyph is not poured');
  const blk = mount.slice(at, mount.indexOf('\n      }\n', at));
  assert.ok(/const dlH = mount\(dl, \{/.test(blk), 'it is not a mount of its own');
  assert.ok(/imageEl: dlImg/.test(blk) && /spin3D: true/.test(blk) && /interactive: true/.test(blk), 'it does not spin');
  assert.ok(/visibleWhen: brandShown/.test(blk) && /still: coarse/.test(blk), 'it does not draw and rest with the name');
  assert.ok(/flowSpeed: 0\.12, viscosity: 3/.test(blk) && /bevel: 1\.5/.test(blk), 'it is not the name\'s metal');
  assert.ok(/scalable\.push\(\{ base: brandBase,/.test(blk) && /'--brand-k'/.test(blk), 'it does not scale with the name');
  assert.ok(mount.indexOf('const brandH = mount(brand, {') < at, 'it is poured before the name it scales with');
});
await ok('nothing new is asked of the site: the setup the y3kode screen reads, no fetch, no route', () => {
  assert.ok(!/\bfetch\s*\(/.test(glyph), 'download-glyph.js fetches');
  assert.ok(/wireDownloadGlyph\(\{ el: \$\('home-download'\), setup: \(\) => siteSetup\(\), platform: \(\) => detectPlatform\(\) \}\);/.test(main), 'main.js does not wire the glyph to the existing setup');
  // every ask for it in the page: kode's (main.js codeLink.setup) and Settings' (own-brain.js siteSetup)
  const src = readdirSync(join(ROOT, 'src'), { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => read(join('src', f))).join('\n');
  const asks = [...src.matchAll(/fetch(?:Fn)?\('\/api\/code\/setup'/g)].length;
  assert.equal(asks, 2, 'a new ask for the setup');
  const srv = read('server.mjs');
  assert.doesNotMatch(srv, /reqPath === '\/api\/(download|app)/, 'a route of its own');
});
await ok('in npm test, and the README says what it is', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.test.includes('node test/download-glyph.test.mjs'));
  const readme = read('README.md').replace(/\s+/g, ' ');   // a quote may wrap anywhere
  assert.ok(readme.includes('src/download-glyph.js'), 'the README does not say where it lives');
  assert.ok(readme.includes("as a download app glyph titled 'download'"), 'the README does not quote the ask');
});

console.log(`\n${passed} checks passed`);
