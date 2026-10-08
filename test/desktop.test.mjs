// THE DESKTOP SHELL. Run: node test/desktop.test.mjs
//
// The shell is a hundred lines that open a window, and almost none of it is
// worth a test. Three things in it are: the two that decide what a page is
// allowed to do and where a link is allowed to go, and the one that decides
// whether the page gets thrown away. All three fail OPEN — a wrong answer hands
// the camera to somebody else, or leaves the window somewhere that is not us
// with no address bar to say so, or flashes an error over a working site.
//
// So the questions asked here are the ones a person testing by hand never
// thinks to ask: the host that CONTAINS ours, the userinfo field that READS
// like ours, the javascript: url, the aborted load that is not a failure. Each
// of those is one careless `startsWith` or one missing `=== -3` away.
//
// Also guarded: the shell grows exactly ONE way in, the local bridge for y3k
// Code (CODE.md) — a frozen window.y3kCode with three JSON functions, answered
// only for the site's own top frame. Node in the renderer, contextIsolation
// off, a second exposed object, or a channel that skips the frame check would
// each turn "a window onto the live site" into something else.
//
// And the one way the OS can reach in: a y3k:// link. It may say "open Code"
// or "come forward" and nothing more — never a path, a command or a code.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url);
const require = createRequire(import.meta.url);
const { ALLOWED, sameOrigin, mayUse, routeFor, mediaFor, isRealFailure, bridgeMay, deepLinkFor } = require('../desktop/policy.cjs');
const main = readFileSync(new URL('desktop/main.cjs', ROOT), 'utf8');
const preload = readFileSync(new URL('desktop/preload.cjs', ROOT), 'utf8');
const host = readFileSync(new URL('desktop/code-host.cjs', ROOT), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('desktop/package.json', ROOT), 'utf8'));
const server = readFileSync(new URL('server.mjs', ROOT), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', ROOT), 'utf8'));
const index = readFileSync(new URL('index.html', ROOT), 'utf8');

const HOME = 'https://yearthreethousand.com';
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// --- whose page is this -----------------------------------------------------
ok('our origin is ours, on any path', () => {
  for (const u of [HOME, HOME + '/', HOME + '/legal.html', HOME + '/?x=1#y']) {
    assert.equal(sameOrigin(u, HOME), true, u);
  }
});

ok('a look-alike host is not ours', () => {
  // Every one of these passes a substring or prefix test against our host.
  for (const u of [
    'https://yearthreethousand.com.evil.test/',       // ours as a subdomain of theirs
    'https://yearthreethousand.com@evil.test/',       // ours in the userinfo field
    'https://evil.test/https://yearthreethousand.com',
    'https://notyearthreethousand.com/',
    'https://sub.yearthreethousand.com/',             // a different origin, even if it is a relative
    'http://yearthreethousand.com/',                  // a different SCHEME is a different origin
    'https://yearthreethousand.com:8443/',            // and so is a different port
  ]) assert.equal(sameOrigin(u, HOME), false, u);
});

ok('nonsense is not ours, and does not throw', () => {
  for (const u of ['', 'about:blank', 'not a url', 'javascript:alert(1)', undefined, null]) {
    assert.equal(sameOrigin(u, HOME), false, String(u));
  }
});

// --- what a page may do -----------------------------------------------------
ok('our page may use the camera, full screen, pointer lock, copy', () => {
  for (const p of ['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write']) {
    assert.equal(mayUse(p, HOME + '/', HOME), true, p);
  }
});

ok('nobody else may, whatever they ask for', () => {
  for (const p of ALLOWED) assert.equal(mayUse(p, 'https://evil.test/', HOME), false, p);
});

ok('the permissions NOT named are refused, on our own page', () => {
  // The list grows with every Chromium bump. An allowlist means each new one
  // arrives refused; a denylist would let each new one straight through.
  for (const p of ['geolocation', 'notifications', 'midi', 'midiSysex', 'openExternal',
    'display-capture', 'clipboard-read', 'hid', 'serial', 'usb', 'idle-detection',
    'window-management', 'unknown-future-thing']) {
    assert.equal(mayUse(p, HOME + '/', HOME), false, p);
  }
});

// --- and what macOS is asked for --------------------------------------------
ok('a camera request raises only the camera prompt', () => {
  assert.deepEqual(mediaFor({ mediaTypes: ['video'] }), ['camera']);
});

ok('a microphone request raises only the microphone prompt', () => {
  assert.deepEqual(mediaFor({ mediaTypes: ['audio'] }), ['microphone']);
});

ok('both, when both are asked for, and each only once', () => {
  assert.deepEqual(mediaFor({ mediaTypes: ['video', 'audio', 'video'] }).sort(), ['camera', 'microphone']);
});

ok('an empty or missing list falls back to the camera alone', () => {
  // The site opens the camera far more often than the microphone, and guessing
  // wrong here costs one prompt, not a capability.
  for (const d of [{ mediaTypes: [] }, {}, null, undefined, { mediaTypes: 'video' }]) {
    assert.deepEqual(mediaFor(d), ['camera'], JSON.stringify(d));
  }
});

ok('a kind we do not know about adds no prompt beside the ones we do', () => {
  // New strings arrive with every Chromium bump. Mapping anything unrecognised
  // to the camera looks harmless — it agrees with the fallback when it is the
  // ONLY kind, which is why this has to be asked with a known kind beside it:
  // a request for the microphone must not also light the camera.
  assert.deepEqual(mediaFor({ mediaTypes: ['audio', 'screen'] }), ['microphone']);
  assert.deepEqual(mediaFor({ mediaTypes: ['screen'] }), ['camera']);   // …alone, the fallback
});

ok('the shell actually asks macOS, and only when the page does', () => {
  // Chromium inside Electron does not reliably raise the system prompt on its
  // own; without this the tracking fails with NotAllowedError and looks broken.
  //
  // Checked by POSITION, not by a distance regex — "within N characters of" is
  // a guard that fails the next time somebody writes a paragraph of comment
  // between the two lines, which is a test breaking for a reason that has
  // nothing to do with the thing it guards. Twice now in this repo.
  const asks = [...main.matchAll(/askForMediaAccess/g)].map((m) => m.index);
  assert.equal(asks.length, 1, 'macOS is asked in exactly one place');
  const handler = main.indexOf('setPermissionRequestHandler');
  const gate = main.indexOf('if (!mayUse(', handler);
  assert.ok(handler >= 0 && gate > handler, 'the page-level check opens the handler');
  assert.ok(asks[0] > gate,
    'the system prompt belongs behind the page-level check, not in front of it — '
    + 'and never at startup, where it would prompt before anyone turned tracking on');
});

// --- where a link goes ------------------------------------------------------
ok('our links stay, other http links go to the browser', () => {
  assert.equal(routeFor(HOME + '/world', HOME), 'stay');
  assert.equal(routeFor('https://github.com/colinbiorio/y3k', HOME), 'browser');
  assert.equal(routeFor('http://example.test/', HOME), 'browser');
});

ok('a scheme the OS would act on is dropped, never handed out', () => {
  // shell.openExternal on one of these is the shell asking the operating system
  // to run whatever the page named.
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<b>x',
    'ms-msdt:/id', 'vscode://x', 'smb://host/share', '']) {
    assert.equal(routeFor(u, HOME), 'drop', u);
  }
});

// --- when the page is thrown away -------------------------------------------
ok('an aborted load is not a failure', () => {
  assert.equal(isRealFailure(-3, true), false);   // ABORTED: a redirect, or a fast second nav
});

ok('a real main-frame failure is', () => {
  assert.equal(isRealFailure(-106, true), true);  // INTERNET_DISCONNECTED
  assert.equal(isRealFailure(-105, true), true);  // NAME_NOT_RESOLVED
});

ok('a subframe failing never replaces the page', () => {
  // The site embeds things — the portal, the reader. One of them failing is
  // not the room being unreachable.
  assert.equal(isRealFailure(-106, false), false);
});

// --- the shell stays a window -----------------------------------------------
ok('exactly one thing is injected into the page: the local bridge', () => {
  assert.equal((main.match(/\bpreload\s*:/g) || []).length, 1, 'one preload, no more');
  assert.ok(/preload: path\.join\(__dirname, 'preload\.cjs'\)/.test(main));
  assert.ok(/nodeIntegration:\s*false/.test(main), 'node must stay out of the renderer');
  assert.ok(/contextIsolation:\s*true/.test(main), 'context isolation must stay on');
  assert.ok(/sandbox:\s*true/.test(main), 'the renderer stays sandboxed');
  assert.ok(!/\bipcMain\b/.test(main), 'main.cjs opens no channel of its own');
});

ok('the bridge is one frozen object of three JSON functions', () => {
  assert.equal((preload.match(/exposeInMainWorld\(/g) || []).length, 1);
  assert.ok(/exposeInMainWorld\('y3kCode', Object\.freeze\(\{/.test(preload));
  const requires = [...preload.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ['electron'], 'nothing but electron');
  const channels = [...preload.matchAll(/'(y3k-code:[\w]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(channels, ['y3k-code:cmd', 'y3k-code:event', 'y3k-code:since']);
  const exposed = preload.slice(preload.indexOf('exposeInMainWorld('));
  assert.ok(!/ipcRenderer\s*[,}\]]|:\s*ipcRenderer\b(?!\.)/.test(exposed), 'ipcRenderer itself never reaches the page');
  assert.ok(!/\.send\(|sendSync|sendTo/.test(preload.replace(/^\s*\/\/.*$/gm, '')), 'the page only invokes, it never sends raw');
});

ok('only the site\'s own top frame may use the bridge', () => {
  assert.equal(bridgeMay({ frameUrl: `${HOME}/`, isMainFrame: true }, HOME), true);
  assert.equal(bridgeMay({ frameUrl: `${HOME}/reader.html`, isMainFrame: false }, HOME), false, 'not a frame inside it');
  assert.equal(bridgeMay({ frameUrl: 'https://yearthreethousand.com.evil.test/', isMainFrame: true }, HOME), false);
  assert.equal(bridgeMay({ frameUrl: 'https://yearthreethousand.com@evil.test/', isMainFrame: true }, HOME), false);
  assert.equal(bridgeMay({ frameUrl: 'data:text/html,offline', isMainFrame: true }, HOME), false, 'not the offline card');
  assert.equal(bridgeMay({}, HOME), false);
});

ok('every channel checks its sender before anything else', () => {
  const handlers = [...host.matchAll(/ipcMain\.handle\('([^']+)', async \(e[^)]*\) => \{\n\s*if \(!senderOk\(e\)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(handlers, ['y3k-code:cmd', 'y3k-code:since']);
  assert.equal((host.match(/ipcMain\.(handle|on)\(/g) || []).length, 2, 'no other channel');
  assert.ok(/e\.sender === w\.webContents/.test(host) && /f === w\.webContents\.mainFrame/.test(host));
});

ok('the engine asks natively, defaulting to no; the folder comes from the OS picker', () => {
  assert.ok(/buttons: \['Allow', "Don't allow"\], defaultId: 1, cancelId: 1/.test(host));
  assert.ok(/if \(obj\.cmd === 'workspace\.pick'\) return pick\(\);/.test(host));
  assert.ok(/showOpenDialog\(w, \{[^}]*openDirectory/.test(host));
  assert.ok(/utilityProcess\.fork\(enginePath\(\)/.test(host), 'the engine runs apart from the window and from main');
});

ok('quitting stops every coding tool first', () => {
  assert.ok(/app\.on\('before-quit', \(e\) => \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?stopAll\(\{ quit: true \}\)/.test(main));
});

ok('it points at the live site, and can be aimed at a local one', () => {
  assert.ok(main.includes("process.env.Y3K_URL || 'https://yearthreethousand.com'"));
});

ok('the mac build declares why it wants the camera', () => {
  // Without these strings macOS kills the app the instant it asks, and the
  // failure looks like the tracking being broken rather than the plist being
  // short a key.
  const info = pkg.build.mac.extendInfo;
  assert.ok(/camera|face|hands/i.test(info.NSCameraUsageDescription));
  assert.ok(/microphone|speak|listen/i.test(info.NSMicrophoneUsageDescription));
});

ok('everything the shell requires is packed, and nothing else', () => {
  // 555MB of node_modules is a dev dependency, not an app — but leave out a
  // file main.cjs REQUIRES and the app dies on launch with a stack trace, on
  // every machine but the one that built it. So: derive the list from the
  // requires rather than trusting it.
  const packed = pkg.build.files.slice().sort();
  assert.deepEqual(packed, ['code-host.cjs', 'main.cjs', 'package.json', 'policy.cjs', 'preload.cjs']);
  for (const [name, src] of [['main.cjs', main], ['code-host.cjs', host], ['preload.cjs', preload]]) {
    for (const [, req] of src.matchAll(/require\('\.\/([^']+)'\)/g)) assert.ok(packed.includes(req), `${name} requires ${req}, which is not packed`);
  }
  assert.ok(/path\.join\(__dirname, 'preload\.cjs'\)/.test(main) && packed.includes('preload.cjs'));
  assert.ok(!packed.includes('sign.cjs'), 'the build script is not part of the app');
  // the engine rides along as a resource, its code and nothing else
  const res = pkg.build.extraResources.find((r) => r.to === 'y3k-code');
  assert.ok(res && res.from === '../y3k-code' && res.filter.includes('**/*.mjs'));
  assert.ok(/path\.join\(process\.resourcesPath, 'y3k-code'\)/.test(host) && /path\.join\(dir, 'ipc-host\.mjs'\)/.test(host));
});

ok('a newer engine fetched since (engine.update) runs only when complete, and only from the app\'s own folder', () => {
  // where the engine looks, and what it may fetch from: this window's site, never a page's word
  assert.ok(/Y3K_SITE: siteOf\(home\), Y3K_ENGINE_DIR: enginesDir\(\)/.test(host));
  assert.ok(/const enginesDir = \(\) => path\.join\(app\.getPath\('userData'\), 'engine'\);/.test(host));
  // a version is a folder named x.y.z under that one, holding ipc-host.mjs, whose package.json says the same version
  assert.ok(/VERSION_RE\.test\(version\)/.test(host) && /versionIn\(dir\) === version/.test(host));
  // and it wins only over an older engine than the app carries
  assert.ok(/f && newer\(f\.version, versionIn\(bundledDir\(\)\) \|\| '0\.0\.0'\) \? f\.dir : bundledDir\(\)/.test(host));
  // the restart: the choice is kept, the old engine stops its tools, the next command starts the new one
  const restart = host.slice(host.indexOf('async function restartOn('), host.indexOf('async function restartOn(') + 700);
  assert.ok(/const f = fetched\(version\);\s*if \(!f \|\| restarting\) return;/.test(restart));
  assert.ok(restart.indexOf("'current.json'") < restart.indexOf('await stopAll()'));
  assert.ok(/m\.type === 'restart'\) \{ restartOn\(m\.version\)/.test(host), 'only the version rides in the message, never a path');
});

// --- the y3k:// link -----------------------------------------------------------
ok('a y3k:// link says "open Code" or "come forward", in exactly those spellings', () => {
  for (const u of ['y3k://code', 'y3k://code/', 'Y3K://CODE']) assert.equal(deepLinkFor(u), 'code', u);
  for (const u of ['y3k://', 'y3k:', 'y3k:///']) assert.equal(deepLinkFor(u), 'focus', u);
});

ok('anything else in a link means nothing — no path, command, code or credential rides in', () => {
  for (const u of ['y3k://code?cmd=rm%20-rf', 'y3k://code#y3k-code=47821-ABCD2345', 'y3k://code/../../etc', 'y3k://code/Users/me/repo',
    'y3k://pair/ABCD2345', 'y3k://evil.test', 'y3k:code', 'y3k://code@evil.test', 'y3k://me:pw@code', 'y3k://code:47821',
    ' y3k://code', 'y3k://code\n', 'y3k://code\u0000', 'https://yearthreethousand.com/#code', 'javascript:alert(1)', 'file:///etc/passwd',
    'y3k://' + 'code/'.repeat(20), '', null, undefined, 42, {}]) {
    assert.equal(deepLinkFor(u), null, JSON.stringify(u));
  }
});

ok('the link is heard before ready, on every platform, and only through deepLinkFor', () => {
  const ready = main.indexOf('app.whenReady()');
  const openUrl = main.indexOf("app.on('open-url'");
  assert.ok(openUrl > 0 && openUrl < ready, 'open-url is registered before ready (a link that launches the app on macOS comes first)');
  assert.ok(/app\.on\('open-url', \(e, url\) => \{ e\.preventDefault\(\); follow\(deepLinkFor\(url\)\); \}\);/.test(main));
  assert.ok(/app\.on\('second-instance', \(_e, argv\) => follow\(linkIn\(argv\) \|\| 'focus'\)\);/.test(main), 'Windows/Linux: a second copy hands over its argv');
  assert.ok(/linkIn\(process\.argv\)/.test(main), '…and the first copy reads its own');
  assert.ok(/\.map\(deepLinkFor\)/.test(main));
  assert.ok(/if \(app\.isPackaged\) app\.setAsDefaultProtocolClient\('y3k'\);/.test(main), 'claimed by the installed app, never by a dev Electron');
  assert.deepEqual(pkg.build.protocols, [{ name: 'y3k', schemes: ['y3k'] }], 'and declared to the OS by the build');
});

ok('a link can only move the window to the site\'s own #code, which the shell builds itself', () => {
  assert.ok(main.includes("const CODE_URL = (() => { const u = new URL(HOME); u.hash = 'code'; return u.href; })();"));
  const loads = [...main.matchAll(/\.loadURL\(([^)]*)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(loads)], ['CODE_URL', 'HOME', 'OFFLINE', 'first'], 'nothing else is ever loaded');
  assert.ok(/const first = pendingLink === 'code' \? CODE_URL : HOME;/.test(main));
  assert.ok(!/executeJavaScript|webContents\.send\(/.test(main), 'the page is never scripted or messaged from here');
});

ok('the page can tell this shell, and its version, from the user agent', () => {
  assert.equal(pkg.version, '1.3.0');   // 1.2: the engine can think for your presence (brain.complete); 1.3: it can update itself (engine.update)
  assert.ok(main.includes("const { version: VERSION } = require('./package.json');"));
  assert.ok(main.includes('w.webContents.setUserAgent(`${w.webContents.getUserAgent()} y3k-desktop/${VERSION}`);'));
  assert.ok(main.indexOf('setUserAgent(') < main.indexOf('w.loadURL(first)'), 'before the first load, so the page sees it from the start');
  const lock = JSON.parse(readFileSync(new URL('desktop/package-lock.json', ROOT), 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

ok('the login shell is read once, in the background at launch, not in front of each engine start', () => {
  assert.ok(host.includes('const envOnce = () => envRead || (envRead = shellEnv());'));
  assert.ok(/function createCodeHost\(\{ getWin, home \}\) \{\n\s*envOnce\(\);/.test(host), 'started when the host is made, at app ready');
  assert.ok(host.includes('const extra = await envOnce();'));
  assert.ok(!/await shellEnv\(\)/.test(host), 'never re-run per start');
});

// --- the site keeps the shell's folder to itself ----------------------------
ok('the static server refuses the desktop folder', () => {
  // Compared as a string. Mirroring a source line as a regex has broken this
  // repo's guards twice on escaping alone.
  assert.ok(server.includes('if (/^desktop(\\/|$)/i.test(rel))'), 'desktop/ must never be served');
});

ok('an ignored folder name is refused at ANY depth', () => {
  // desktop/node_modules is the case that broke the old first-segment-only
  // check: the ignored name is in the middle of the path.
  assert.ok(server.includes('if (rel.split(/[\\\\/]/).some((seg) => FOREIGN_DIRS.has(seg)))'));
});

ok('Y3Dos is ignored, so the server refuses it too', () => {
  const gi = readFileSync(new URL('.gitignore', ROOT), 'utf8');
  assert.ok(/^Y3Dos\/$/m.test(gi), 'the sibling project must be ignored the day it arrives');
});

// --- installable from a browser too -----------------------------------------
ok('the manifest names both icon sizes a browser asks for', () => {
  const sizes = manifest.icons.map((i) => i.sizes).sort();
  assert.deepEqual(sizes, ['192x192', '512x512']);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#04030a');
});

ok('the icons it names are actually there, and are those sizes', () => {
  // A manifest pointing at a missing or wrong-sized icon fails silently: the
  // browser just declines to offer the install.
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(icon.src.replace(/^\//, ''), ROOT));
    assert.equal(png.readUInt32BE(0), 0x89504e47, icon.src + ' is not a png');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
});

ok('the page links the manifest, and the server can serve it', () => {
  assert.ok(index.includes('<link rel="manifest" href="/manifest.webmanifest" />'));
  assert.ok(server.includes("'.webmanifest': 'application/manifest+json'"),
    'served as application/octet-stream, a manifest is ignored');
});

ok('there is no service worker anywhere near this site', () => {
  // The whole promise is that a refresh is the new code. A cache in front of
  // the app is the single most common reason a deploy goes out and nothing
  // changes — and the install prompt is not worth it.
  assert.ok(!/serviceWorker\s*\.\s*register/.test(index), 'no service worker on the page');
});

console.log(`\n${passed} checks passed.`);
