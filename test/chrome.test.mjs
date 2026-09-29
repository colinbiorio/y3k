// THE CHROME FITS A FINGER. Run: node test/chrome.test.mjs
//
// Three things that broke together on a phone, held here so they cannot drift
// back apart: the portal's place on the top bar, the box a thumb can land on,
// and the size the liquid pours its small marks at. Every number below was
// measured on a 375x812 touch viewport before the change it guards.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

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
  assert.ok(/const floor = p\.top - 12;/.test(hist) && /if \(floor < lane\.top \+ 46\) return lane;/.test(hist),
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

console.log('\n' + passed + ' checks passed.\n');
