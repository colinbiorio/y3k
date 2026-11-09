// EVERY FIELD SAYS WHAT IT IS. Run:  node test/field-names.test.mjs
//
// A screen-reader pass over the live site as a guest (8 Nov 2026, /tmp/pw-probe/names.mjs: the browser's own
// accessibility tree at each screen a guest walks to): every control had a name but four fields, the sign-in card's
// email, username and password and the API key in Settings. Each sits in a <label> with no words of its own, for
// its look; a label gives the field its name, so the name was the label's: nothing, and the placeholder that says
// what the field is was never read ("edit text, secure"). Twenty-three fields are made so, in the page and in the
// views (two of them menus). Each has an aria-label in the words its placeholder (or the line above it) shows, and a field whose
// placeholder changes takes its name along.
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SOURCES = ['index.html', ...walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js')).map((p) => relative(ROOT, p))];

// a field alone in its label: <label …><input …/></label>, <label …><textarea …></textarea></label>,
// <label …><select …>…</select></label>, the label saying nothing else (a checkbox's words after it name it)
const wrapped = () => SOURCES.flatMap((f) => {
  const src = read(f), out = [];
  for (const m of src.matchAll(/<label\b[^>]*>\s*<(input|textarea|select)\b([^>]*)>/g)) {
    const tag = m[1], at = m.index + m[0].length;
    const end = tag === 'input' ? at : src.indexOf(`</${tag}>`, at) + tag.length + 3;
    const said = src.slice(end, src.indexOf('</label>', end)).replace(/<[^>]*>/g, '').replace(/['"+\s]/g, '');   // the view's joins aside
    if (!said) out.push({ f, tag, attrs: m[2], id: (m[2].match(/\bid="([^"]+)"/) || [])[1] });
  }
  return out;
});

console.log('every field says what it is:');

ok('a field alone in its label has a name of its own (aria-label or aria-labelledby)', () => {
  const all = wrapped();
  assert.ok(all.length >= 23, `the fields alone in a label were not all found (${all.length})`);
  const nameless = all.filter((x) => !/\baria-label(ledby)?="[^"]+"/.test(x.attrs));
  assert.deepEqual(nameless.map((x) => `${x.f} #${x.id}`), [], 'a screen reader says only "edit text" for these');
});

ok('the sign-in card names its three fields in the words it shows', () => {
  const html = read('index.html');
  for (const [id, said] of [['login-email', 'email'], ['login-user', 'username'], ['login-pass', 'password']]) {
    const tag = html.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    assert.match(tag, new RegExp(`aria-label="${said}"`), `#${id}`);
    assert.match(tag, new RegExp(`placeholder="${said}"`), `#${id}: its name is not the word it shows`);
  }
});

ok('a field whose placeholder changes takes its name along', () => {
  const ids = new Set(wrapped().map((x) => x.id).filter(Boolean));
  let changes = 0;
  for (const f of SOURCES.filter((f) => f.endsWith('.js'))) {
    const src = read(f);
    const vars = new Map([...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\$\('([^']+)'\)/g)].map((m) => [m[1], m[2]]));
    for (const m of src.matchAll(/(\$\('([^']+)'\)|\b(\w+))\.placeholder\s*=[^\n]*\n([^\n]*)/g)) {
      const id = m[2] || vars.get(m[3]);
      if (!ids.has(id)) continue;
      changes += 1;
      assert.match(m[4], /setAttribute\('aria-label'/, `${f}: #${id} changes what it asks for and keeps its old name`);
    }
  }
  assert.equal(changes, 5, "the five that change (sign-in's email, a live room's line, the closing password, the API key, the voice key) were not all found");
});

console.log(`\n${passed} checks passed.`);
