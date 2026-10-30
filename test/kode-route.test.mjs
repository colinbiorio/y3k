// KODE FROM ANYWHERE ON THE SITE (2026-10-30). The line that reads as an ask
// for the coder (src/kode-route.mjs, pure), and the page's rule around it:
// a permission card every time outside the room, the mode untouched, the
// line said in the room's own composer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kodeLine, NAMED, KODE_LINE_MAX } from '../src/kode-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ✓ ' + name); };

ok('kode named outright is a line for kode, the name taken off', () => {
  assert.deepEqual(kodeLine('kode: fix the login'), { text: 'fix the login', why: 'named' });
  assert.deepEqual(kodeLine('/kode fix the login'), { text: 'fix the login', why: 'named' });
  assert.deepEqual(kodeLine('hey kode, what is in this folder'), { text: 'what is in this folder', why: 'named' });
  assert.equal(kodeLine('kode is lovely'), null, 'a bare kode needs a colon or a comma after it');
  assert.deepEqual(kodeLine('@kode run the tests'), { text: 'run the tests', why: 'named' });
  assert.equal(kodeLine('kode:'), null, 'the name alone is no line');
  assert.equal(kodeLine('kodeine is a drug'), null, 'a word that starts with the name is not the name');
  assert.ok(NAMED.test('Kode — hello'));
});

ok('the words of coding — a verb of making with a thing of code — are a line for kode', () => {
  for (const t of ['fix the bug in the login page', 'add a test for the parser', 'build me a feature that shows the weather on the homepage',
    'can you refactor styles.css', 'push the branch and open a pr', 'run the suite', 'rename `foo` to `bar`', 'deploy the site', 'fix the build']) {
    assert.equal(kodeLine(t)?.why, 'words', t);
    assert.equal(kodeLine(t)?.text, t);
  }
});

ok('conversation stays with the presence', () => {
  for (const t of ['fix my bike', 'I love this feature', 'what does this function do?', 'how are you today', 'make me a sandwich',
    'let\'s build a life together', 'the test was hard', 'I will fix this and run the race', 'run with me tomorrow', '', '   ']) {
    assert.equal(kodeLine(t), null, JSON.stringify(t));
  }
  assert.equal(kodeLine('fix the ' + 'code '.repeat(KODE_LINE_MAX)), null, 'a line past the cap is nobody\'s');
});

// --- the page ----------------------------------------------------------------
const main = read('src/main.js'), social = read('src/social.js'), view = read('src/code/code-view.js'), consent = read('src/consent.js');
ok('the chat bar asks before a line goes to kode, after the kommands and before the life and the game', () => {
  const i = main.indexOf("  const k = text ? runKommand(text) : null;");
  const r = main.indexOf("  if (text && !chatImageB64 && kodeHere()) {");
  const l = main.indexOf("social.lifeHear?.(text)");
  assert.ok(i > 0 && r > i && l > r, 'the order of the branches');
  assert.match(main, /if \(line\) \{ askKode\(text, line\); return; \}/);
  assert.match(main, /if \(line && document\.body\.classList\.contains\('in-code'\)\) \{[^\n]*social\.kodeSay\(line\.text\); return; \}/, 'in the room the line simply goes to kode');
  assert.match(main, /function kodeHere\(\) \{ try \{ return hasDesktopBridge\(\) \|\| !!savedPairing\(\); \} catch \{ return false; \} \}/, 'only where kode is paired');
  assert.match(main, /const a = await consent\(\{ kind: 'kode-say', always: false,/, 'a permission every time: no always');
  assert.match(main, /if \(a === null\) \{ chatInput\.value = text; autoGrow\(chatInput\); return; \}/, 'Esc keeps the line in the box');
  assert.match(main, /if \(busy\) \{ queueMessage\(text, null, false\); return; \}\n  handle\(text, null\);\n\}/, 'no: to the presence as any line');
  assert.match(main, /import \{ kodeLine \} from '\.\/kode-route\.mjs';/);
});
ok('a consent card may have no always, and its cancel is an answer', () => {
  assert.match(consent, /acts\.append\(bCancel, bOnce\);\n\s+if \(always !== false\) acts\.append\(bAlways\);/);
  assert.match(consent, /bCancel\.addEventListener\('click', \(\) => done\(false\)\);/);
  assert.match(consent, /scrim\.addEventListener\('click', \(e\) => \{ if \(e\.target === scrim\) done\(null\); \}\);/);
});
ok('the line is said in the room\'s own composer, to the coder, in the mode chosen there', () => {
  assert.match(social, /async function kodeSay\(text\) \{\n\s+if \(view !== 'code'\) showView\('code'\);/);
  assert.match(social, /twentyHear: \(t\) => twenty\.hear\(t\), kodeSay,/);
  assert.match(view, /say: \(text\) => sayFromSite\(text\),/);
  assert.match(view, /if \(continuing\) await continuing\.catch\(\(\) => false\);\n\s+const s = currentSession\(\);/, 'after the room has picked up where it was');
  assert.match(view, /talkTo = 'coder';\n\s+setDraft\(t\);\n\s+await send\(s, dockUi\.ta\);/, 'as if typed: the composer\'s own send');
  assert.ok(!/sayFromSite[\s\S]*setMode\(/.test(view.slice(view.indexOf('async function sayFromSite'), view.indexOf('function onWheel'))), 'the mode is never touched');
  assert.match(view, /if \(pendingSay && !ended\) \{ const t = pendingSay; pendingSay = null; talkTo = 'coder'; setDraft\(t\); send\(s, d\.ta\); \}/, 'a line waits for the first conversation');
});
console.log(`${n} checks passed`);
