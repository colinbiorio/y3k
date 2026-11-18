// TRAVEL: THE THREE PLACES (Colin, 18 Nov 2026: "i want a screen that let's you
// travel between all three that is available from each!"). src/travel.js is
// the same file on yearthreethousand, univispira and airden; the tree at the top
// bar's left end opens it here. Run: node test/travel.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES, hereOf } from '../src/travel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

ok('three places, in one order on every site, each over https at its own domain', () => {
  assert.deepEqual(PLACES.map((p) => p.id), ['airden', 'y3k', 'univispira']);
  assert.deepEqual(PLACES.map((p) => p.url), ['https://4irden.com', 'https://yearthreethousand.com', 'https://univispira.org']);
  for (const p of PLACES) { assert.ok(p.name && p.line && p.host); assert.equal(new URL(p.url).hostname, p.host); }
});
ok('the page knows which of the three it is (www or not); anywhere else is none of them', () => {
  assert.equal(hereOf('yearthreethousand.com'), 'y3k');
  assert.equal(hereOf('www.univispira.org'), 'univispira');
  assert.equal(hereOf('4irden.com'), 'airden');
  assert.equal(hereOf('localhost', '/Users/someone/y3k-code/univispira-org/index.html'), 'univispira', 'a local copy of the univispira site');
  assert.equal(hereOf('example.com'), null);
});
ok('the screen: a dialog of the three, the one you are in said and not a link, the others links in a new tab; Escape, the close and the dark around close it; the keys stay inside', () => {
  const t = read('src/travel.js');
  assert.match(t, /wrap\.setAttribute\('role', 'dialog'\);\n\s+wrap\.setAttribute\('aria-modal', 'true'\);/);
  assert.match(t, /if \(!isHere\) \{ card\.href = p\.url; card\.target = '_blank'; card\.rel = 'noopener'; \}\n\s+else card\.setAttribute\('aria-current', 'page'\);/);
  assert.match(t, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); closeTravel\(\); return; \}/);
  assert.match(t, /wrap\.addEventListener\('click', \(e\) => \{ if \(e\.target === wrap\) closeTravel\(\); \}\);/);
  assert.ok(!/https?:\/\/(?!4irden\.com|yearthreethousand\.com|univispira\.org)[a-z]/i.test(t.replace(/\/\/.*$/gm, '')), 'nothing fetched from anywhere but the three');
  assert.ok(!/fetch\(|import\(|<img|url\(/.test(t), 'self-contained: no fetch, no pictures, no fonts of its own');
});
ok('the tree at the top bar\'s left end opens it (a local airden, for working on both, still goes straight there)', () => {
  const portal = read('src/portal.js');
  assert.match(portal, /^import \{ openTravel \} from '\.\/travel\.js';$/m);
  assert.match(portal, /const open = \(\) => \(HOME === DEFAULT_HOME \? openTravel\(\) : go\(\)\);\n\s+el\.addEventListener\('click', open\);/);
  assert.match(read('index.html'), /<button id="portal" class="portal" type="button" aria-label="Travel: airden, yearthreethousand, univispira" title="Travel: airden, univispira">/);
});

console.log(`\n${passed} checks passed.`);
