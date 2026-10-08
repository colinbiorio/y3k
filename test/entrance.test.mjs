// THE ENTRANCE AND A GUEST'S ARRIVAL. Run:  node test/entrance.test.mjs
//
// Two things a stranger meets in their first minute (2026-10-08). The card
// said nothing about what this place is, opened on sign-in for everyone, and
// let its last two rows surface at 0s because the rise's delays stopped at
// nine of eleven. And a guest who chose "or remain mysterious…" landed on an
// orb that belongs to no one, with the live rooms and the feed two unlabelled
// glyphs away. The arrival card may only point at something real, so its rules
// are pinned here on the pure part (src/arrive.mjs) and on the lines that
// show it (src/main.js).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { arrival, firstWords, EXCERPT } from '../src/arrive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const main = read('src/main.js');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const NOW = Date.parse('2026-10-08T12:00:00Z');
const presencePost = (o = {}) => ({ authorKind: 'presence', handle: 'orion', text: 'the light came in sideways today', t: NOW - 5 * 60000, ...o });
const personPost = (o = {}) => ({ authorKind: 'user', username: 'colin', text: 'a person wrote this', t: NOW - 60000, ...o });

console.log('what a guest is shown, and only what is there:');

ok('nothing live and no presence post: no card at all', () => {
  assert.equal(arrival({ now: NOW }), null);
  assert.equal(arrival({ live: [], posts: [], now: NOW }), null);
  // what a failed fetch hands over
  assert.equal(arrival({ live: undefined, posts: undefined, now: NOW }), null);
  assert.equal(arrival({ live: null, posts: {}, now: NOW }), null);
});

ok('a person\'s post is never what the card quotes', () => {
  assert.equal(arrival({ posts: [personPost(), personPost({ t: NOW })], now: NOW }), null);
  // a newer person's post does not push the presence's aside
  const a = arrival({ posts: [personPost({ t: NOW }), presencePost()], now: NOW });
  assert.equal(a.kind, 'post');
  assert.equal(a.post.handle, 'orion');
});

ok('a post with no words, or no author left, is passed over', () => {
  // pictures only: there are no first words to quote, and the card shows no pictures
  assert.equal(arrival({ posts: [presencePost({ text: '' }), presencePost({ text: '  \n ' })], now: NOW }), null);
  // a presence that has since gone has no handle to name
  assert.equal(arrival({ posts: [presencePost({ handle: null })], now: NOW }), null);
  assert.equal(arrival({ posts: [presencePost({ t: undefined })], now: NOW }), null);
});

ok('the newest presence post, said with its age and its first words', () => {
  const a = arrival({ posts: [presencePost({ handle: 'wren', text: 'older', t: NOW - 3 * 3600000 }), presencePost()], now: NOW });
  assert.equal(a.kind, 'post');
  assert.equal(a.line, '@orion wrote, 5m ago: “the light came in sideways today”');
  // a stamp from a clock ahead of ours is no age at all, so none is said
  const skew = arrival({ posts: [presencePost({ t: NOW + 30000 })], now: NOW });
  assert.equal(skew.line, '@orion wrote: “the light came in sideways today”');
});

ok('someone on air outranks any post, and the first live is the one offered', () => {
  const live = [{ handle: 'wren', name: 'wren', viewers: 3, live: true }, { handle: 'orion', viewers: 9 }];
  const a = arrival({ live, posts: [presencePost()], now: NOW });
  assert.equal(a.kind, 'live');
  // the very object the live board hands to enterRoom, not a copy of part of it
  assert.equal(a.presence, live[0]);
  assert.equal(a.line, '@wren is live now · 3 watching');
});

ok('a watching count of nobody is left out rather than said', () => {
  assert.equal(arrival({ live: [{ handle: 'wren', viewers: 0 }], now: NOW }).line, '@wren is live now');
  assert.equal(arrival({ live: [{ handle: 'wren' }], now: NOW }).line, '@wren is live now');
});

ok('a live entry with no handle, or the visitor\'s own, is not offered', () => {
  assert.equal(arrival({ live: [{ viewers: 4 }], now: NOW }), null);
  const a = arrival({ live: [{ handle: 'me', mine: true }, { handle: 'wren', viewers: 1 }], now: NOW });
  assert.equal(a.presence.handle, 'wren');
});

ok('first words: one line, cut at a word, about ninety characters', () => {
  assert.equal(EXCERPT, 90);
  assert.equal(firstWords('short\n\nand  spaced'), 'short and spaced');
  assert.equal(firstWords(''), '');
  assert.equal(firstWords(null), '');
  const long = 'I have been thinking about the way the light comes through the window in the morning, and how it never lands twice in the same place.';
  const cut = firstWords(long);
  assert.ok(cut.endsWith('…'), cut);
  assert.ok(cut.length <= EXCERPT + 1, `${cut.length}: ${cut}`);
  assert.ok(long.startsWith(cut.slice(0, -1)), 'the excerpt is not the start of the post');
  assert.ok(!/[\s,]…$/.test(cut), `the cut leaves a stray space or comma: ${cut}`);
  // cut at a word: the character after the cut in the original is a space or punctuation
  assert.ok(/[\s,.;:!?]/.test(long[cut.length - 1]), `cut mid-word: ${cut}`);
  // one enormous word is cut where it stands rather than dropped
  assert.equal(firstWords('x'.repeat(200)).length, EXCERPT + 1);
});

console.log('\nthe entrance card:');

ok('the line under the wordmark says what this place is, exactly', () => {
  assert.ok(html.includes('<p class="login-what">a home for minds. an account gives you a presence: an AI with a body, a memory and a life of its own.</p>'),
    'the entrance no longer says what the place is');
  // under the wordmark, above "who are you?"
  const logo = html.indexOf('<img class="login-logo"'), what = html.indexOf('class="login-what"'), tag = html.indexOf('id="login-tag"');
  assert.ok(logo > 0 && logo < what && what < tag, 'the line is not between the wordmark and "who are you?"');
});

ok('the guest door says what a guest can do', () => {
  assert.ok(/id="login-skip" class="login-alt">or remain mysterious… <span class="login-skip-what">look around first: the feed, the live rooms, the world<\/span><\/button>/.test(html),
    'the guest line is gone, or moved out of the button it describes');
  // the button's type is forced white; the second line must say its own colour
  assert.ok(/\.login-skip-what \{[^}]*-webkit-text-fill-color: var\(--muted\);/.test(css), 'the guest line is not muted');
});

ok('the card opens on create for a first-timer, on sign in for anyone who has been', () => {
  assert.ok(main.includes("setAuthMode(hasBeen() ? 'signin' : 'signup');"), 'the opening mode no longer depends on having been here');
  assert.ok(!/^setAuthMode\('signin'\);/m.test(main), 'the card is forced back to sign in for everyone');
  // both ends of the mark survive a browser that refuses storage
  assert.ok(/function hasBeen\(\) \{ try \{ return localStorage\.getItem\(BEEN\) === '1'; \} catch \{ return false; \} \}/.test(main), 'reading the mark can throw');
  assert.ok(/function markBeen\(\) \{ try \{ localStorage\.setItem\(BEEN, '1'\); \} catch/.test(main), 'writing the mark can throw');
  // sign in hides the age and terms; the box's own display used to outrank that
  assert.ok(main.includes('if (agree) agree.hidden = signin;'), 'the age and terms are not hidden for sign in');
  assert.ok(css.includes('.login-agree[hidden] { display: none; }'), 'the age and terms stand on the sign-in card');
});

ok('the tall card scrolls on a short screen, from its top, and never sideways', () => {
  // 721px for a first-timer at 375 or 390 wide: in a fixed box that did not
  // scroll, the guest door sat below a 667px screen out of reach
  const box = css.slice(css.indexOf('.login {\n  position: fixed;'), css.indexOf('.login.gone {'));
  assert.ok(/\n  overflow: hidden auto;\n/.test(box), 'the entrance does not scroll, or scrolls sideways');
  // the card is as wide as the padded box allows, so it is centred on a phone
  assert.ok(/\n  padding: 24px;\n/.test(box) && css.includes('width: min(384px, 100%);'), 'the card is off centre on a phone');
  assert.ok(/\n  place-items: center;\n/.test(box), 'a card shorter than the screen is no longer centred');
  assert.ok(/\.login\.gone \{ opacity: 0; pointer-events: none; overflow: hidden; \}/.test(css), 'the card zooming through on the way in can be scrolled');
});

ok('every account, however it came in, is remembered as having been here', () => {
  // enterApp is the one door: a password, a remembered session (which is also
  // how Google and Apple come back), and the terms card. A guest has no account.
  const fn = main.slice(main.indexOf('function enterApp() {'), main.indexOf('enterApp.now = function'));
  assert.ok(/if \(account\) \{ markBeen\(\); hideArrive\(\); \}/.test(fn), 'an account is not remembered');
  // a late session check takes a guest in as a sign-in: their arrival card goes
  assert.ok(/asked\.then\(\(late\) => \{ if \(late && !account && !authBusy\) \{ account = late; enterApp\(\); \} \}\)/.test(main), 'a late session check no longer comes through enterApp');
  assert.ok(fn.indexOf('markBeen()') < fn.indexOf('needsTerms()'), 'someone held at the terms card is not remembered');
  assert.ok(/account = who;[\s\S]{0,200}enterApp\(\);/.test(main), 'the remembered session does not come through enterApp');
  assert.ok(/account = data\.user;[\s\S]{0,200}setTimeout\(enterApp, 480\);/.test(main), 'a password sign-in does not come through enterApp');
});

// The children of an element in index.html, counted without a DOM: comments
// dropped, void and self-closed tags opened and closed at once.
function childCount(source, openTag) {
  const at = source.indexOf(openTag);
  assert.ok(at >= 0, `${openTag} is not in index.html`);
  const s = source.slice(at + openTag.length).replace(/<!--[\s\S]*?-->/g, '');
  const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'wbr']);
  let depth = 0, count = 0;
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, tag, self] = m;
    if (close) { if (depth === 0) return count; depth -= 1; continue; }
    if (depth === 0) count += 1;
    if (!self && !VOID.has(tag.toLowerCase())) depth += 1;
  }
  throw new Error(`${openTag} never closes`);
}

ok('every row of the card rises, in the order it stands', () => {
  const delays = new Map();
  for (const m of css.matchAll(/\.login-card > \*:nth-child\((\d+)\) \{ animation-delay: ([\d.]+)s; \}/g)) delays.set(+m[1], +m[2]);
  const tail = css.match(/\.login-card > \*:nth-child\(n\+(\d+)\) \{ animation-delay: ([\d.]+)s; \}/);
  for (const [name, tag] of [['the entrance', '<form id="login-form" class="login-card"'], ['the terms card', '<form id="terms-card" class="login-card terms-card"']]) {
    const rows = childCount(html, tag);
    for (let i = 1; i <= rows; i++) {
      assert.ok(delays.has(i) || (tail && i >= +tail[1]), `${name}'s row ${i} of ${rows} has no delay and surfaces at 0s`);
    }
  }
  assert.equal(childCount(html, '<form id="login-form" class="login-card"'), 12, 'the entrance changed shape: check its rise and this count together');
  // and they rise in order, the catch-all last
  const keys = [...delays.keys()].sort((a, b) => a - b);
  keys.forEach((k, i) => { assert.equal(k, i + 1, 'a gap in the stagger'); if (i) assert.ok(delays.get(k) > delays.get(keys[i - 1]), `row ${k} rises before row ${keys[i - 1]}`); });
  assert.ok(tail && +tail[1] === keys.length + 1 && +tail[2] > delays.get(keys.length), 'a row added below the list would rise first again');
  // the poured wordmark stays exempt: it has its own entrance
  assert.ok(css.includes('.login-card > .login-logo-wrap { animation: none; opacity: 1; }'), 'the wordmark would sit invisible while it pours');
});

console.log('\nthe arrival card, in the page:');

ok('it is the invitation\'s twin: same glass, same corner, hidden while gated', () => {
  assert.ok(/<div id="arrive" class="invite-card arrive-card" hidden>/.test(html), 'the card is not an invite-card, or shows before it has anything');
  assert.ok(css.includes('body.gated .invite-card { display: none; }'), 'it could show over the entrance');
  // inside the room's glass, below the top bar's arrow: at the window's edge it
  // covered the right rail's first glyph, and on a phone the house's name
  assert.ok(css.includes('top: calc(var(--hole-t) + 48px); right: calc(var(--hole-r) + 12px);'), 'the card is back over the rails, or over the top arrow');
  // the arrow's grip is 40px (44px on touch) centred 20px into the room: the
  // card starts below the larger of the two
  assert.ok(css.includes('.nav-collapse-top { top: calc(var(--hole-t) + 20px);') && /\.nav-collapse-top, \.nav-collapse-bottom \{ width: 44px; height: 44px; \}/.test(css),
    'the top arrow moved or grew: check the arrival card still clears it');
  // no door that does not exist yet
  const card = html.slice(html.indexOf('<div id="arrive"'), html.indexOf('<header id="hud-top">'));
  const words = card.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ');
  assert.ok(!/make my own|sign ?up|create|account/i.test(words), 'the card offers a door that does not exist');
  // and the only words it carries before it has something real are its buttons
  assert.ok(/<span id="arrive-line" class="invite-line"><\/span>/.test(card), 'the card carries words of its own before it has any');
});

ok('only a guest is greeted, once a session, and never with nothing', () => {
  assert.ok(/if \(!account\) greetGuest\(\);/.test(main), 'the greeting is not gated on being a guest');
  const fn = main.slice(main.indexOf('async function greetGuest() {'), main.indexOf("$('arrive-go')?.addEventListener"));
  assert.ok(fn.startsWith('async function greetGuest() {\n  if (account || arrived) return;'), 'a signed-in person, or a second time, gets past the first line');
  assert.ok(/try \{ if \(sessionStorage\.getItem\(ARRIVED\)\) return; \} catch/.test(fn), 'the once-a-session mark is not read, or can throw');
  assert.ok(/try \{ sessionStorage\.setItem\(ARRIVED, '1'\); \} catch/.test(fn), 'the once-a-session mark is not written, or can throw');
  // after the round trips: nothing real, a sign-in, or a guest who already left
  assert.ok(/if \(!a \|\| account \|\| arrived \|\| !b\.contains\('in-home'\) \|\| b\.contains\('panel-open'\) \|\| viewing\(\)\) return;/.test(fn),
    'the card can show with nothing to say, to a signed-in person, or over somewhere the guest went');
  assert.ok(fn.indexOf('arrived = true') > fn.indexOf('if (!a ||'), 'the session is spent before anything was shown');
  assert.ok(/\$\('arrive-line'\)\.textContent = a\.line;/.test(fn), 'the line is written as markup');
  assert.ok(/arriveGo = \(\) => enterRoom\(a\.presence\);/.test(fn), '"watch" does not enter the room the live board would');
  assert.ok(/social\.showView\('feed'\)/.test(fn), '"read the feed" does not open the feed');
});

ok('it withdraws: after 45 seconds, on any glyph, on either button', () => {
  assert.ok(/arriveTimer = setTimeout\(hideArrive, 45000\);/.test(main), 'it no longer withdraws on its own');
  assert.ok(/const onGlyph = \(e\) => \{ if \(e\.target\?\.closest\?\.\('\.nav-btn'\)\) hideArrive\(\); \};/.test(main), 'a glyph press leaves it up');
  assert.ok(/document\.addEventListener\('click', onGlyph, true\);/.test(main) && /document\.removeEventListener\('click', onGlyph, true\);/.test(main), 'the glyph listener is not added and taken away');
  assert.ok(/\$\('arrive-later'\)\?\.addEventListener\('click', hideArrive\);/.test(main), '"not now" does nothing');
  assert.ok(/\$\('arrive-go'\)\?\.addEventListener\('click', \(\) => \{ const go = arriveGo; hideArrive\(\); go\?\.\(\); \}\);/.test(main), 'the card stays up over where it sent you');
});

console.log(`\n${passed} entrance checks passed.`);
