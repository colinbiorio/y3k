// THE CHROME FITS A FINGER. Run: node test/chrome.test.mjs
//
// Three things that broke together on a phone, held here so they cannot drift
// back apart: the portal's place on the top bar, the box a thumb can land on,
// and the size the liquid pours its small marks at. Every number below was
// measured on a 375x812 touch viewport before the change it guards.
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const css = readFileSync(new URL('styles.css', ROOT), 'utf8');
const mount = readFileSync(new URL('src/mercury-mount.js', ROOT), 'utf8').replace(/\/\/[^\n]*/g, '');
const hist = readFileSync(new URL('src/history.js', ROOT), 'utf8').replace(/\/\/[^\n]*/g, '');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
// A rule, by its selector, asserted to exist — a slice from a missing anchor
// runs to the end of the file and passes everything inside it.
const rule = (sel) => {
  const i = css.indexOf('\n' + sel + ' {'); assert.ok(i > 0, `no rule for ${sel}`);
  const j = css.indexOf('\n}', i); assert.ok(j > i, `unterminated rule for ${sel}`);
  return css.slice(i, j);
};

console.log('\nthe portal, on the top bar:');

ok('it sits in the top bar and rides the bar\'s own slide', () => {
  const p = rule('#portal');
  // it used to be bottom-left, where on a phone it sat ON the search glyph
  assert.ok(!/\bbottom:/.test(p), 'the portal is anchored to the bottom again — it will land on the phone\'s search glyph');
  // the SAME expression the bar folds by (translateY(--hole-t - --rail-w)), plus its own centring
  assert.ok(/top: calc\(var\(--hole-t\) - var\(--rail-w\) \+ \(var\(--rail-w\) - var\(--portal-d\)\) \/ 2\);/.test(p),
    'the portal does not fold with the top bar — it will be left hanging in the room when the bar goes');
  assert.ok(/left: calc\(var\(--hole-l\) \+ 8px\);/.test(p), 'the portal is not at the bar\'s left end');
  assert.ok(/transition:[^;]*\btop 0\.42s/.test(p) && !/transition:[^;]*\bbottom/.test(p), 'the slide is not animated on the axis it now moves on');
});

ok('a thumb can hit it on a phone, and it stays under the bar on a desktop', () => {
  const p = rule('#portal');
  assert.ok(/--portal-d: max\(44px, calc\(var\(--rail-w\) - 20px\)\);/.test(p), 'the disc has no floor — a 58px phone bar would give it 38px');
  assert.ok(/width: var\(--portal-d\); height: var\(--portal-d\);/.test(p), 'the disc is not sized by --portal-d');
});

ok('it is drawn ABOVE the bar\'s glass', () => {
  const z = +(rule('#portal').match(/z-index: (\d+)/) || [])[1];
  const sheet = +(rule('#nav-sheet').match(/z-index: (\d+)/) || [])[1];
  assert.ok(z > 0 && sheet > 0, 'cannot read the two z-indexes');
  assert.ok(z > sheet, `the portal (z ${z}) is under the nav glass (z ${sheet}) — it would be a blur behind frost`);
});

// (2026-10-20: it used to step 18px right of the portal alone; with life at
// the bar's right end it is centred again, and capped to the gap instead)
ok('on a phone the wordmark sits between the tree and life, never wider than the gap', () => {
  const i = css.indexOf('@media (max-width: 560px) { .home-brand {'); assert.ok(i > 0, 'the phone brand rule is gone');
  const blk = css.slice(i, css.indexOf('} }', i));
  assert.ok(/left: 50%;/.test(blk) && !/50% \+ 18px/.test(blk), 'the wordmark is off centre on a phone — with a glyph at each end it would crowd life');
  // the gap: 100vw less both rails, each glyph (44px at the rail + 8) and 6px clear of each; the name is 2048:699
  assert.ok(/--brand-h: min\(calc\(\(var\(--rail-w\) - 16px\) \* 1\.5\), calc\(\(100vw - 2 \* var\(--rail-w\) - 116px\) \/ 2\.93\)\);/.test(css),
    'the phone wordmark is not capped to the gap between the tree and life — on a 375px phone it will cover one of them');
});

ok('the conversation still measures the portal, and knows it moved', () => {
  assert.ok(/function portalRect\(\)/.test(hist) && /function duck\(lane\)/.test(hist), 'the portal-dodge is gone rather than left inert');
  assert.ok(/const floor = p\.top - 12;/.test(hist) && /if \(floor < lane\.top \+ 46\) continue;/.test(hist),
    'duck() no longer bails when the portal is above the lane — it would clamp the lane\'s floor to the top of the screen');
});

console.log('\nthe box a thumb can land on:');

ok('every small control is 44px on a touch screen, without moving', () => {
  const i = css.indexOf('@media (pointer: coarse), (hover: none) {'); assert.ok(i > 0, 'the coarse-pointer block is gone');
  const blk = css.slice(i, css.indexOf('\n}', i));
  assert.ok(/\.nav-collapse, \.nav-collapse-right, \.nav-collapse-top, \.nav-collapse-bottom \{ width: 44px; height: 44px; \}/.test(blk), 'the collapse arrows are 40px boxes again');
  assert.ok(/\.chat-fold \{ width: 44px; height: 44px; \}/.test(blk), 'the fold dashes are 26px boxes again');
  assert.ok(/#back-to-home \{ min-height: 44px; \}/.test(blk), 'back-to-home is 36px tall again');
  // the chat's + lives in a width-budgeted row: reach from a ::before, not the box
  assert.ok(/\.chat-upload \{ width: 32px; height: 32px; position: relative; \}/.test(blk), 'the + has no anchor for its reach');
  assert.ok(/\.chat-upload::before \{ content: ''; position: absolute; inset: -6px;/.test(blk), 'the + has no reach — 32px is under the floor and growing the box breaks the row');
});

ok('the fold dash is right-aligned by its MEASURED width', () => {
  // 26 on a desktop, 44 on a phone; a written-down 26 pushes the right-hand
  // dash 18px into the room on every phone
  assert.ok(/const foldSize = \(f\) => f\?\.offsetWidth \|\| 26;/.test(hist), 'the fold size is written down again');
  assert.ok(/L\.y3k\.x \+ L\.y3k\.w - foldSize\(folds\[0\]\)/.test(hist), 'the right-hand dash is not aligned by its measured width');
  assert.ok(!/FOLD_SZ/.test(hist), 'the constant is back');
});

console.log('\nthe size the liquid pours at:');

ok('the rail\'s phone correction is applied to the rail, and to nothing else', () => {
  // 0.33 = 0.72 * 39/86 folds the 2.2x desktop rail back to a phone's 39px
  // reference. It was applied to every scalable mark — the S(26) arrows poured
  // at 15px of ink, the S(44) mic at 25. Small chrome never had a 2.2x to fold.
  assert.ok(/const RAIL_BASE = 60;/.test(mount), 'nothing separates rail marks from small chrome');
  assert.ok(/return \{ rail: \(phone \? 0\.33 : 1\) \* clamp, small: \(phone \? 0\.72 : 1\) \* clamp \};/.test(mount),
    'uiScale hands back one factor — the rail\'s correction hits everything again');
  assert.ok(/h\.setSize\(base \* \(base >= RAIL_BASE \? k\.rail : k\.small\)\)/.test(mount), 'fitChrome does not pick the factor by base size');
  // and off a phone the two are identical, so the desktop is untouched by construction
  assert.ok(/const clamp = Math\.max\(0\.62, Math\.min\(1, fit\)\);/.test(mount), 'the shared clamp is gone — the two regimes could disagree on a desktop');
});

console.log('\nthe chat bar says which mode is on (2026-09-29):');

const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const tend = readFileSync(new URL('src/tend.js', ROOT), 'utf8').replace(/\/\/[^\n]*/g, '');
const portal = readFileSync(new URL('src/portal.js', ROOT), 'utf8');

ok('a red dot above each mark whose mode is on — camera, voice, dance, komputer — and no single blinker', () => {
  for (const sel of ['#chat-camera.active::after', '#chat.cam-live #chat-camera::after', '#chat-voice.active::after',
    'body.dancing #chat-dance::after', 'body.alive:not(.dancing) #brain-toggle::after'])
    assert.ok(css.includes(sel), `nothing lights a dot for ${sel}`);
  // the camera's dot follows the LENS, not the button: the room can be reading your head with it dark
  assert.ok(/#chat\.cam-live #chat-camera::after/.test(css), 'the camera dot only follows the button — a live lens could show nothing');
  assert.ok(!/id="rec-dot"/.test(html) && !/\.rec-dot\b/.test(css), 'the old single blinker is still there');
  assert.ok(!/#chat::before/.test(css), 'the rainbow ring behind the bar is still drawn');
  assert.ok(css.includes(':root[data-motion="less"] #chat-voice.active::after'), 'the dots blink for someone who asked for less motion');
});

ok('every glyph is one lowercase word, and the mind is the komputer', () => {
  const want = { 'nav-profile': 'profile', 'nav-feed': 'feed', 'nav-post': 'post', broadcast: 'broadcast', 'nav-live': 'live', 'nav-search': 'search',
    'nav-settings': 'settings', 'nav-code': 'kode', 'nav-world': 'world', 'nav-games': 'game', 'nav-mine': 'mine', 'nav-frequencies': 'frequencies', 'nav-orb': 'orb',
    'brain-toggle': 'komputer', 'chat-dance': 'dance', 'chat-camera': 'camera', 'chat-voice': 'voice' };
  for (const [id, name] of Object.entries(want)) {
    const tag = (html.match(new RegExp('<button id="' + id + '"[^>]*>')) || [''])[0];
    assert.ok(tag.includes('title="' + name + '"') && tag.includes('aria-label="' + name + '"'), `${id} is not called ${name}: ${tag}`);
  }
  assert.ok(!/title="Mind"/.test(html), 'the mind is still called Mind');
});

ok('turning a dance off lets the presence choose how it comes to rest', () => {
  assert.ok(/if \(kind === 'dance'\) restAfterDance\(\);/.test(tend), 'ending a dance does not ask for a last gesture');
  const bow = tend.slice(tend.indexOf('async function restAfterDance()'), tend.indexOf('async function restAfterDance()') + 2200);
  assert.ok(/safeCall\(text, 'dance'\)/.test(bow), 'the rest is not one dance turn');
  assert.ok(/applyTurn\(\{ \.\.\.r, score: null, speech: '' \}, gen, h\)/.test(bow), 'the rest can start a score or speak');
  assert.ok(/if \(!r\?\.available \|\| alive \|\| gen !== getGen\(\)\) return;/.test(bow), 'a rest arriving after a new waking would overwrite it');
});

console.log('\nthe top bar\'s two ends: a tree and a moon (2026-10-20):');

// Colin: "change the airden glyph from the portal to just a simple tree in
// unimat ... add your new mode with name 'life' on the top right ... y3k logo
// should be on top though in y3kode, as should airden and life" and "keep the
// chat bar but only when the nav bar is expanded -- no floating chat bar".
ok('the portal is a tree and life a moon, each poured in unimat at its end of the top bar', () => {
  assert.ok(/id="portal-mark" class="portal-mark mercury"/.test(html) && /id="life-mark" class="life-mark mercury"/.test(html), 'a mark is missing');
  assert.ok(!/air_logo\.png/.test(html.slice(html.indexOf('<button id="portal"'))), "4irden's old mark is back on the portal");
  for (const id of ['portal-mark', 'life-mark']) assert.ok(mount.includes(`['${id}',`), `${id} is not poured in unimat`);
  assert.ok(/svgEl: svgOf\(el\), size: base/.test(mount), 'the marks are not poured from their own drawings');
  const life = rule('#nav-life');
  assert.ok(/right: calc\(var\(--hole-r\) \+ 8px\);/.test(life), "life is not at the bar's right end");
  assert.ok(/top: calc\(var\(--hole-t\) - var\(--rail-w\) \+ \(var\(--rail-w\) - var\(--portal-d\)\) \/ 2\);/.test(life), 'life does not fold with the top bar');
});

ok('y3kode keeps the name, the tree and the moon on top, and the chat bar whatever the bottom bar does (it is the coder\'s composer since 2026-10-29)', () => {
  assert.ok(/body\.panel-open:is\(\.in-code, \.in-life\):not\(\.gated\):not\(\.viewing\) :is\(#portal, #nav-life\) \{ opacity: 1; pointer-events: auto; \}/.test(css), 'the tree and the moon leave y3kode');
  assert.ok(/body\.panel-open\.in-code:not\(\.gated\) \.home-brand \{ opacity: 1; pointer-events: auto; \}/.test(css), 'the name leaves y3kode');
  assert.ok(/body\.panel-open\.in-code\.nav-collapsed-top \.home-brand \{ opacity: 0; pointer-events: none; \}/.test(css), 'the name floats over the coder when the bar folds');
  assert.ok(/body\.panel-open\.in-code:not\(\.gated\) #chat \{ opacity: 1; pointer-events: auto; \}/.test(css), 'the chat bar is the coder\'s composer in y3kode, folded bar or not (THE FRESH LOOK)');
  assert.ok(!/body\.panel-open\.in-code:not\(\.nav-collapsed-bottom\)/.test(css), 'the chat bar must not go with the bottom bar in y3kode again: it is the one composer');
  assert.ok(!/body\.panel-open\.in-code\.nav-collapsed-bottom[^{]*#chat \{ opacity: 1/.test(css), 'a floating chat bar in y3kode');
  // and the metal follows the same rules: a canvas poured for nobody costs every frame
  assert.ok(/\(b\.contains\('in-code'\) && !b\.contains\('nav-collapsed-top'\)\)/.test(mount), 'the name pours in y3kode with its bar folded');
  assert.ok(/\|\| b\.contains\('in-code'\)\);/.test(mount), 'the chat pours in y3kode whatever the bar does (it is the coder\'s composer)');
  assert.ok(!/\(b\.contains\('in-code'\) && !b\.contains\('nav-collapsed-bottom'\)\)/.test(mount), 'the chat must not go with the bottom bar in y3kode again');
});

console.log('\nwhat the review of 2026-10-02 found:');

// A stand-in element: attributes, classes and listeners, nothing else.
const fakeEl = () => {
  const attrs = {}, cls = new Set(), on = {};
  return {
    attrs, cls,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k] ?? null,
    classList: { toggle: (c, f) => { if (f ?? !cls.has(c)) cls.add(c); else cls.delete(c); }, add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    addEventListener: (t, fn) => { on[t] = fn; },
    removeEventListener: (t, fn) => { if (on[t] === fn) delete on[t]; },
    fire: (t) => on[t]?.(),
    querySelector: () => null,
  };
};

await (async () => {
  // with noopener, window.open answers null whether or not the window opened,
  // so the "blocked? open a tab" fallback ran on every click: two 4irdens
  const disc = fakeEl();
  const view = fakeEl();
  disc.querySelector = (sel) => (sel === '#portal-view' ? view : null);
  const opened = [];
  const g = globalThis;
  const saved = Object.fromEntries(['document', 'window', 'screen', 'matchMedia', 'MutationObserver'].map((k) => [k, g[k]]));
  g.document = { getElementById: (id) => (id === 'portal' ? disc : null), body: { className: 'in-home', classList: { contains: (c) => c === 'in-home' } },
    documentElement: { dataset: {} }, hidden: false, addEventListener() {}, removeEventListener() {} };
  g.window = { open: (...a) => { opened.push(a); return null; }, addEventListener() {}, removeEventListener() {} };
  g.screen = { availWidth: 1440, availHeight: 900, availLeft: 0, availTop: 0 };
  g.matchMedia = () => ({ matches: false });
  g.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const { createPortal } = await import('../src/portal.js');
    const p = createPortal();
    disc.fire('click');
    // (18 Nov 2026) the tree opens the screen of the three places (travel.js, its own test), which goes to 4irden by a
    // link in a new tab: a click opens no window of its own any more, so the old double-window trap cannot come back
    ok('a click on the tree opens no window: it opens the three places (travel.js)', () => {
      assert.equal(opened.length, 0, 'a click opened ' + opened.length + ' windows: ' + JSON.stringify(opened));
    });
    p.destroy();
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete g[k]; else g[k] = v; }
  }
})();

await (async () => {
  // the camera and voice toggles said nothing but their names to a screen
  // reader; the lease code is cut out of main.js and run against stand-ins
  const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
  const at = (name) => { const i = main.search(new RegExp('\\n(async )?function ' + name + '\\(')); assert.ok(i >= 0, name + ' is gone from main.js'); return i; };
  const fn = (name) => main.slice(at(name), main.indexOf('\n}\n', at(name)) + 3);
  const line = (name) => main.slice(at(name), main.indexOf('\n', at(name) + 1));
  const els = { 'chat-camera': fakeEl(), 'chat-voice': fakeEl(), chat: fakeEl() };
  let lens = false, grant = true;
  const rig = new Function('d', `
    const { $, camera, perceive, syncHands, voice, armListen, document } = d;
    const camOwners = new Set();
    let opening = null, camViewWanted = false, voiceMode = false, lastInterim = '', dictation = null;   // dictation: y3kode's lease on the microphone (main.js)
    ${['wantCam', 'dropCam', 'applyCam'].map(fn).join('\n')}
    ${line('startVoiceMode')}
    ${line('stopVoiceMode')}
    return { wantCam, dropCam, startVoiceMode, stopVoiceMode };
  `)({
    $: (id) => els[id] || null,
    camera: { isOn: () => lens, on: async () => { lens = grant; return grant; }, off: () => { lens = false; } },
    perceive: { sync() {} }, syncHands() {}, armListen() {},
    voice: { stopListening() {}, releaseMic() {} },
    document: { body: { classList: { toggle() {} } } },
  });
  const cam = els['chat-camera'].attrs, mic = els['chat-voice'].attrs;
  const seen = [];
  await rig.wantCam('track');                        // the room's head tracking, by itself at load
  seen.push([cam['aria-pressed'], cam['aria-label']]);
  await rig.wantCam('chat');                         // the button: let the presence see me
  seen.push([cam['aria-pressed'], cam['aria-label']]);
  rig.dropCam('chat'); rig.dropCam('track');
  seen.push([cam['aria-pressed'], cam['aria-label']]);
  grant = false;
  await rig.wantCam('chat');                         // permission denied
  seen.push([cam['aria-pressed'], cam['aria-label']]);
  ok('the camera says pressed only when the presence may see you, and says when the lens is open for tracking', () => {
    assert.deepEqual(seen, [['false', 'camera (on for tracking)'], ['true', 'camera'], ['false', 'camera'], ['false', 'camera']]);
  });
  ok('the voice toggle says the mode, not the listen', () => {
    rig.startVoiceMode();
    assert.equal(mic['aria-pressed'], 'true');
    rig.stopVoiceMode();
    assert.equal(mic['aria-pressed'], 'false');
    const listen = main.slice(main.indexOf('onListeningChange:'), main.indexOf('onLevel:', main.indexOf('onListeningChange:')));
    assert.ok(listen.length > 0 && !/aria-pressed/.test(listen), 'the per-listen flash sets the pressed state — it goes dark mid-conversation');
    for (const id of ['chat-camera', 'chat-voice'])
      assert.ok(/aria-pressed="false"/.test((html.match(new RegExp('<button id="' + id + '"[^>]*>')) || [''])[0]), id + ' is not a toggle before the script runs');
  });
})();

console.log('\nthe camera and the microphone together:');

// Colin, 2026-11-27: "mic and camera don't seem to be able to be served at the
// same time". Seen in Chromium with a stand-in camera and microphone: with a
// spoken conversation on, pressing the camera opened the lens and, 460 ms
// later, sent the camera's own greeting turn — and every turn closes the
// microphone. The mic's mark then looked off for the whole reply, so pressing
// it "back on" switched the conversation off.
await (async () => {
  const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
  const at = (name) => { const i = main.search(new RegExp('\\n(async )?function ' + name + '\\(')); assert.ok(i >= 0, name + ' is gone from main.js'); return i; };
  const fn = (name) => main.slice(at(name), main.indexOf('\n}\n', at(name)) + 3);
  const els = { 'chat-camera': fakeEl(), 'chat-voice': fakeEl(), chat: fakeEl() };
  let lens = false, hearing = false;
  const toasts = [];
  const rig = new Function('d', `
    const { $, camera, perceive, syncHands, voice, toast, document } = d;
    const camOwners = new Set();
    let opening = null, camViewWanted = false, voiceMode = false;
    ${['wantCam', 'dropCam', 'applyCam', 'camEnded', 'camMayGreet'].map(fn).join('\n')}
    return { wantCam, dropCam, camEnded, camMayGreet, owners: camOwners, voiceMode: (v) => { voiceMode = v; } };
  `)({
    $: (id) => els[id] || null,
    camera: { isOn: () => lens, on: async () => { lens = true; return true; }, off: () => { lens = false; } },
    perceive: { sync() {} }, syncHands() {},
    voice: { isListening: () => hearing },
    toast: (said) => toasts.push(said),
    document: { body: { classList: { toggle() {} } } },
  });
  const cam = els['chat-camera'].attrs;
  await rig.wantCam('chat');
  ok('the camera coming on speaks for itself only when the microphone is not the person\'s', () => {
    assert.equal(rig.camMayGreet(), true, 'pressed with no microphone on: the presence should look up');
    rig.voiceMode(true);
    assert.equal(rig.camMayGreet(), false, 'a spoken conversation is on, and the camera would take its microphone for a whole turn');
    rig.voiceMode(false); hearing = true;
    assert.equal(rig.camMayGreet(), false, 'a microphone opened by a hand is someone speaking too');
    hearing = false;
    assert.equal(rig.camMayGreet(), true);
  });
  // (this file's ok() does not wait: every await is taken out here, and only the looking is inside)
  rig.dropCam('chat'); await rig.wantCam('track');             // the lens is open for the room's tracking only
  const trackOnly = [lens, rig.camMayGreet()];
  await rig.wantCam('chat'); lens = false;
  const shut = rig.camMayGreet();
  lens = true;
  ok('"you can see me now" is not said when the chat no longer holds the camera, or the lens is shut', () => {
    assert.deepEqual(trackOnly, [true, false], 'the greeting would say the presence can see, with no picture beside it');
    assert.equal(shut, false);
  });
  ok('the greeting asks first, on every try, and re-reads the lease', () => {
    const click = main.slice(main.indexOf("$('chat-camera').addEventListener('click'"), main.indexOf("$('cam-min').addEventListener"));
    const greet = click.slice(click.indexOf('const greet = () => {'), click.indexOf('setTimeout(greet, 200)'));
    assert.ok(greet.length > 100, 'the greeting cannot be located in the camera button');
    const ask = greet.indexOf('if (!camMayGreet()) return;'), send = greet.indexOf("handle('(I just turned my camera on");
    assert.ok(ask > 0 && send > ask, 'the camera\'s greeting is sent without asking whether the microphone is the person\'s');
    assert.ok(greet.indexOf("if (!camera.isOn() || !camOwners.has('chat')) return;") >= 0 && greet.indexOf("if (!camera.isOn() || !camOwners.has('chat')) return;") < greet.indexOf('if (busy)'), 'a lease given back while a turn was running is not noticed');
    // waiting out a turn comes BEFORE the question, so the answer is read when it matters
    assert.ok(greet.indexOf('if (busy)') < ask, 'the question is asked before the turn in flight has ended, and its answer goes stale');
  });
  const held = [[...rig.owners].sort(), cam['aria-pressed']];
  lens = false;                                                // the track ended: unplugged, taken, or stopped from the browser's bar
  rig.camEnded();
  const after = [rig.owners.size, cam['aria-pressed']];
  lens = true; await rig.wantCam('track'); lens = false;       // tracking alone, and it ends too
  rig.camEnded();
  ok('a lens that closes on its own lets every lease go, darkens the button and says what happened', () => {
    assert.deepEqual(held, [['chat', 'track'], 'true']);
    assert.equal(after[0], 0, 'a lease is still held on a camera that is not there');
    assert.equal(after[1], 'false', 'the button goes on saying the presence can see');
    assert.equal(toasts.length, 2);
    assert.match(toasts[0], /cannot see you now/);
    assert.match(toasts[0], /Press the camera to open it again/);
    // tracking alone: the other sentence, and nothing about being seen
    assert.ok(!/see you/.test(toasts[1]) && /Settings/.test(toasts[1]), toasts[1]);
    assert.ok(/createCamera\(\$\('cam'\), \{ onEnded: \(\) => camEnded\(\) \}\)/.test(main), 'the camera is not told whom to tell');
  });
})();

// THE CAMERA ITSELF (src/camera.js), against a stand-in device.
await (async () => {
  const g = globalThis;
  const saved = { navigator: Object.getOwnPropertyDescriptor(g, 'navigator'), window: g.window, document: g.document };
  const mkTrack = (kind) => { const hs = {}; const t = { kind, readyState: 'live', stopped: 0, stop() { t.stopped++; t.readyState = 'ended'; }, addEventListener(ev, f) { (hs[ev] = hs[ev] || []).push(f); }, end() { t.readyState = 'ended'; for (const f of hs.ended || []) f(); } }; return t; };
  const mkStream = () => { const tracks = [mkTrack('video')]; return { tracks, getTracks: () => tracks, getVideoTracks: () => tracks.filter((t) => t.kind === 'video') }; };
  const opened = [];
  let playFails = false;
  Object.defineProperty(g, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { const s = mkStream(); opened.push(s); return s; } } } });
  g.window = {}; g.document = { documentElement: { dataset: {} } };
  try {
    const { createCamera } = await import('../src/camera.js?standin');
    const video = () => ({ srcObject: null, classList: { add() {}, remove() {} }, async play() { if (playFails) throw new Error('NotAllowedError'); } });
    await (async () => {
      const told = [];
      const camera = createCamera(video(), { onEnded: () => told.push('ended') });
      assert.equal(camera.isOn(), false);
      assert.equal(await camera.on(), true);
      ok('on is a live track, not a kept object', () => {
        assert.equal(camera.isOn(), true);
        opened[0].tracks[0].readyState = 'ended';             // the device went, and no event has come yet
        assert.equal(camera.isOn(), false, 'the camera says it is on with no live track behind it');
        opened[0].tracks[0].readyState = 'live';
      });
      opened[0].tracks[0].end();                               // ...and now the browser says so
      ok('a track that ends by itself closes the camera and tells the room, once', () => {
        assert.equal(camera.isOn(), false);
        assert.deepEqual(told, ['ended']);
        assert.equal(opened[0].tracks[0].stopped, 1, 'the ended stream is still held');
      });
      assert.equal(await camera.on(), true);
      ok('and it opens again afterwards, on a new stream', () => {
        assert.equal(opened.length, 2, 'a dead stream was "already on", so nothing could open it again');
        assert.equal(camera.isOn(), true);
      });
      camera.off();
      opened[1].tracks[0].end();                               // a stream closed on purpose ending later is not news
      ok('a camera closed on purpose tells nobody when its old track ends', () => {
        assert.deepEqual(told, ['ended']);
        assert.equal(opened[1].tracks[0].stopped, 1);
      });
    })();
    await (async () => {
      playFails = true;
      const camera = createCamera(video());
      const before = opened.length;
      const r = await camera.on();
      ok('a stream that opened and could not be shown is closed, not orphaned with the light on', () => {
        assert.equal(r, false);
        assert.equal(opened.length, before + 1);
        assert.equal(opened.at(-1).tracks[0].stopped, 1, 'the device is still held by a stream nothing can stop');
        assert.equal(camera.isOn(), false);
      });
      playFails = false;
    })();
  } finally {
    if (saved.navigator) Object.defineProperty(g, 'navigator', saved.navigator); else delete g.navigator;
    if (saved.window === undefined) delete g.window; else g.window = saved.window;
    if (saved.document === undefined) delete g.document; else g.document = saved.document;
  }
})();

ok('the mic\'s dot holds while the conversation is on and the presence is speaking', () => {
  const css = readFileSync(new URL('styles.css', ROOT), 'utf8');
  // the rule: pressed (the mode) and not active (the listen) still shows a dot, steady
  const m = css.match(/#chat-voice\[aria-pressed="true"\]:not\(\.active\)::after\s*\{([^}]*)\}/);
  assert.ok(m, 'between listens the microphone\'s mark looks switched off, and pressing it to get it back switches it off');
  const op = Number((m[1].match(/opacity:\s*([\d.]+)/) || [])[1]);
  assert.ok(op >= 0.4 && op < 1, 'the waiting dot is invisible, or cannot be told from the listening one: ' + op);
  assert.ok(!/animation/.test(m[1]), 'the waiting dot blinks like the listening one');
  // and the listening rule still wins while listening (it must come from .active, with its blink)
  assert.ok(/#chat-voice\.active::after,[\s\S]{0,200}\{ opacity: 1; animation: rec-blink/.test(css), 'the listening dot lost its blink');
});

console.log('\nwhat the page hides stays hidden:');

// A class or id rule that sets display outranks the browser's own [hidden]
// rule, so an element hidden in the markup shows anyway unless its own
// [hidden] rule says otherwise. QA, 2026-10-08: the sign-in card showed the
// signup boxes, and Settings showed the delete box before it was asked for.
ok('every element hidden in the markup has a [hidden] rule beside any display rule of its own', () => {
  const files = ['index.html'];
  const walk = (d) => { for (const f of readdirSync(new URL(d, ROOT))) { const p = d + f; if (statSync(new URL(p, ROOT)).isDirectory()) walk(p + '/'); else if (/\.(js|html)$/.test(f)) files.push(p); } };
  walk('src/');
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(',').map((x) => x.trim()), body: m[2] }));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, ROOT), 'utf8');
    for (const [tag] of src.matchAll(/<[a-z][a-z0-9-]*\b[^<>]*?\shidden\b[^<>]*>/g)) {
      const id = /\bid="([\w-]+)"/.exec(tag)?.[1];
      const names = [...(id ? ['#' + id] : []), ...(/\bclass="([^"]+)"/.exec(tag)?.[1] || '').split(/\s+/).filter(Boolean).map((c) => '.' + c)];
      const shown = names.filter((n) => rules.some((r) => r.sels.includes(n) && /(^|[;\s])display\s*:\s*(?!none)[a-z-]+/.test(r.body)));
      const guarded = names.some((n) => rules.some((r) => r.sels.some((x) => x.startsWith(n + '[hidden]')) && /display\s*:\s*none/.test(r.body)));
      if (shown.length && !guarded) bad.push(`${f}: ${shown.join(' ')}`);
    }
  }
  assert.deepEqual(bad, [], 'shown although hidden');
});

console.log('\n' + passed + ' checks passed.\n');
