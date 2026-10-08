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

ok('on a phone the wordmark steps aside for it', () => {
  const i = css.indexOf('@media (max-width: 560px) { .home-brand {'); assert.ok(i > 0, 'the phone brand rule is gone');
  const blk = css.slice(i, css.indexOf('} }', i));
  assert.ok(/left: calc\(50% \+ 18px\);/.test(blk), 'the wordmark is still centred on a phone — it will overlap the disc at the bar\'s left end');
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
    'nav-settings': 'settings', 'nav-code': 'kode', 'nav-world': 'world', 'nav-games': 'game', 'nav-mine': 'mine', 'nav-orb': 'orb',
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

console.log('\nthe portal is light (2026-09-29):');

ok('an oval of glitter drawn once, 4irden\'s mark poured on it, and its motion paused when it costs', () => {
  assert.ok(/class="portal-light"/.test(html) && /id="portal-mark" class="portal-mark mercury"/.test(html) && /src="air_logo\.png"/.test(html), 'the light or the mark is missing');
  assert.ok(/function sparkles\(kind, seed\)/.test(portal) && /light\.appendChild\(sparkles\(kind, seed\)\)/.test(portal), 'the glitter is not drawn');
  assert.ok(/\$\('portal-mark'\)/.test(mount) && /imageEl: img/.test(mount), 'the mark is not poured in unimat');
  // the moving parts move by transform and opacity only — never a repaint
  for (const k of ['portal-turn', 'portal-turn-back', 'portal-flicker', 'portal-breathe', 'portal-motes']) {
    const kf = css.slice(css.indexOf('@keyframes ' + k + ' '), css.indexOf('}', css.indexOf('@keyframes ' + k + ' ') + 20) + 40);
    assert.ok(kf.length > 20 && !/(width|height|left|top|filter|box-shadow|background)\s*:/.test(kf), `${k} animates something that repaints`);
  }
  assert.ok(/:root:is\(\[data-gfx="low"\], \[data-gfx="smooth"\], \[data-motion="less"\]\) \.portal-light > \*/.test(css), 'the cheap graphics modes do not pause the portal');
  assert.ok(/body:is\(\.panel-open, \.gated, \.viewing\) \.portal-light > \*/.test(css), 'the portal moves while nobody can see it');
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
    ok('one portal click opens one window, though window.open answers null', () => {
      assert.equal(opened.length, 1, 'a click opened ' + opened.length + ' windows: ' + JSON.stringify(opened));
      assert.equal(opened[0][1], 'airden-portal');
      assert.ok(/noopener,noreferrer$/.test(opened[0][2]), 'the window can reach back into y3k, or is told where it came from');
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
    let opening = null, camViewWanted = false, voiceMode = false, nudged = false, dictation = null;   // dictation: y3k Code's lease on the microphone (main.js)
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
