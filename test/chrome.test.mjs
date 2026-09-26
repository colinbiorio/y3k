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

console.log('\n' + passed + ' checks passed.\n');
