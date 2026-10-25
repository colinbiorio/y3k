// A PICTURE DROPPED IN KODE GOES TO THE CODER (2026-10-25). Colin: "i can't
// drag photos into y3kode because they go to chat instead -- make sure that
// when you're draggin a photo into y3kode, the photo gets added to the coding
// conversation unless it's explicitly dropped in the chat bar".
//
// Where a drop goes (src/kode-drop.js dropTarget, on fake events); what a
// coder is handed as it is (fitsAsIs, against the adapters and the engine);
// what kode does with a drop (the view itself, under test/fakes/mini-dom.mjs:
// lit while a picture is over the room, a thumbnail in the composer that can
// be taken off, carried by session.send to y3kode and to nothing else, held
// for the first message when there is no conversation, refused by one that
// has ended); and the lines in main.js, code-view.js and styles.css that put
// it there.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropTarget, hasFiles, fitsAsIs, KODE_KINDS, KODE_B64_MAX } from '../src/kode-drop.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('\nwhere a drop goes (dropTarget):');

// A stand-in page: dropTarget reads only a node's id and its parent.
const el = (id, parentNode) => ({ nodeType: 1, id, parentNode });
const doc = { nodeType: 9, parentNode: null };
const html = el('', doc);
const body = el('', html);
const chat = el('chat', body);                 // the chat bar (#chat)
const chatBox = el('', chat);
const chatInput = el('chat-input', chatBox);
const chatWords = { nodeType: 3, parentNode: chatInput };   // a text node under the pointer
const chatPlus = el('chat-upload', chatBox);
const room = el('', body);                     // .code-root
const pane = el('', room);
const composer = el('', pane);
const transcript = el('', pane);
const stage = el('stage', body);               // the orb's column
const history = el('chat-history', body);      // the chat's history, not the bar
const ev = (target) => ({ target, dataTransfer: { types: ['Files'] } });

await ok('outside kode every drop is the chat\'s, wherever it lands (nothing changes there)', () => {
  for (const state of [{ inCode: false }, {}, null, undefined]) {
    for (const t of [chatInput, chatWords, composer, transcript, stage, body, null, undefined]) {
      assert.equal(dropTarget(ev(t), state), 'chat', JSON.stringify(state));
    }
    assert.equal(dropTarget({}, state), 'chat');
    assert.equal(dropTarget(null, state), 'chat');
  }
});
await ok('in kode, a drop on the chat bar is the chat\'s: #chat and anything in it, a text node too', () => {
  for (const t of [chat, chatBox, chatInput, chatWords, chatPlus]) assert.equal(dropTarget(ev(t), { inCode: true }), 'chat');
});
await ok('in kode, anywhere else is the coder\'s: the pane, the composer, the transcript, the orb\'s column, the page itself', () => {
  for (const t of [room, pane, composer, transcript, stage, body, html, doc, history]) assert.equal(dropTarget(ev(t), { inCode: true }), 'kode');
  // an id that only starts like the bar's is not the bar
  assert.equal(dropTarget(ev(el('chatter', body)), { inCode: true }), 'kode');
  assert.equal(dropTarget(ev(el('chat-history', body)), { inCode: true }), 'kode');
  // no target to read: not the chat bar, so the coder's
  assert.equal(dropTarget({}, { inCode: true }), 'kode');
  assert.equal(dropTarget(null, { inCode: true }), 'kode');
});
await ok('only a drag carrying files is anyone\'s (hasFiles)', () => {
  assert.equal(hasFiles({ dataTransfer: { types: ['Files'] } }), true);
  assert.equal(hasFiles({ dataTransfer: { types: ['text/uri-list', 'Files'] } }), true);
  assert.equal(hasFiles({ dataTransfer: { types: { 0: 'Files', length: 1 } } }), true, 'a DOMStringList, as older browsers hand it');
  assert.equal(hasFiles({ dataTransfer: { types: ['text/plain', 'text/html'] } }), false, 'words dragged from the page');
  assert.equal(hasFiles({ dataTransfer: {} }), false);
  assert.equal(hasFiles({}), false);
  assert.equal(hasFiles(null), false);
});

console.log('\nwhat a coder is handed as it is (fitsAsIs):');

await ok('PNG, JPEG, GIF and WebP — the four every adapter takes, and the engine\'s own check', () => {
  for (const a of ['claude', 'codex', 'opencode', 'acp']) {
    assert.ok(read(`y3k-code/adapters/${a}.mjs`).includes(String.raw`/^image\/(png|jpeg|gif|webp)$/`), `${a} takes other kinds now`);
  }
  assert.equal(KODE_KINDS.source, String.raw`^image\/(png|jpeg|gif|webp)$`);
  for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) assert.ok(fitsAsIs({ type: t, size: 1000 }), t);
  for (const t of ['image/heic', 'image/heif', 'image/avif', 'image/svg+xml', 'image/bmp', 'image/tiff', 'text/plain', '']) assert.ok(!fitsAsIs({ type: t, size: 1000 }), t);
  assert.ok(!fitsAsIs(null) && !fitsAsIs(undefined) && !fitsAsIs({ size: 10 }));
});
await ok('under Anthropic\'s 5MB of base64, which is under what the engine takes', () => {
  assert.equal(KODE_B64_MAX, 5 * 1024 * 1024);
  // 3,932,160 bytes are exactly 5MB of base64; one more is past it
  assert.ok(fitsAsIs({ type: 'image/png', size: 3932160 }));
  assert.ok(!fitsAsIs({ type: 'image/png', size: 3932161 }));
  assert.ok(!fitsAsIs({ type: 'image/jpeg', size: 5 * 1024 * 1024 }), 'the old 5MB-of-file gate let this through to a refusal');
  const engine = read('y3k-code/engine.mjs');
  const max = Number(/const MAX_IMAGE_B64 = ([\d_]+);/.exec(engine)[1].replace(/_/g, ''));
  assert.ok(KODE_B64_MAX <= max, `${KODE_B64_MAX} > the engine's ${max}`);
  assert.match(engine, /const MAX_IMAGES = 4;/, 'the composer\'s four at most');
});

// --- the view itself ---------------------------------------------------------------
console.log('\nwhat kode does with a drop (the view, under a stand-in DOM):');
const { installDom } = await import('./fakes/mini-dom.mjs');
installDom();
{
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  const tick = () => { for (const f of frames.splice(0)) f(0); };
  const settle = async (n = 8) => { for (let k = 0; k < n; k++) { tick(); await new Promise((r) => setTimeout(r, 0)); } };
  // the window's listeners, by type, so a drag can be fired at them
  const won = {};
  const sent = [];
  globalThis.window = {
    addEventListener: (t, fn) => { (won[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { won[t] = (won[t] || []).filter((f) => f !== fn); },
    dispatchEvent() {},
    // the desktop app's bridge: every command the view sends lands here
    y3kCode: { cmd: async (o) => { sent.push(o); return { ok: true }; }, onEvent: () => () => {}, since: async () => [] },
  };
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => { this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`; this.onload?.(); });
    }
  };
  // the keys' selectors are lists ('input, select, …'); the stand-in matches one at a time
  const proto = Object.getPrototypeOf(document.createElement('div'));
  const matchOne = proto.matches;
  proto.matches = function (sel) { return sel.split(',').some((one) => matchOne.call(this, one)); };

  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const png = (name = 'shot.png') => new File([PNG], name, { type: 'image/png' });
  const roomEl = () => document.body.children.filter((c) => c.classList.contains('code-root') && !c.classList.contains('leaving')).pop();
  const $ = (sel) => roomEl().querySelector(sel);
  const $$ = (sel) => roomEl().querySelectorAll(sel);
  // a drag as the browser hands it to the window's listeners
  const drag = (type, target, files = []) => {
    const e = { type, target, relatedTarget: null, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; },
      dataTransfer: { types: ['Files'], files, dropEffect: 'move' } };   // neither of the view's answers
    for (const fn of (won[type] || []).slice()) fn(e);
    return e;
  };
  // the chat bar, as the page has it
  const chatBar = document.createElement('div');
  chatBar.setAttribute('id', 'chat');
  const chatField = document.createElement('textarea');
  chatBar.appendChild(chatField);
  document.body.appendChild(chatBar);
  document.body.classList.add('in-code');

  // Each view is opened first and its session started after: the engine's
  // hello ends any session the page held before it that it does not list.
  const toasts = [];
  const viewWith = async (tag) => (await import(`../src/code/code-view.js?${tag}`)).createCodeView({ toast: (t) => toasts.push(t), link: { companion: () => ({ name: 'Orion' }), talk: () => {} } });

  await ok('a picture over the room lights the composer and is taken as a copy; over the chat bar kode leaves it alone', async () => {
    const cv = await viewWith('take');
    cv.open();
    await settle();
    cv._feed({ sid: 'd1', type: 'session.started', provider: 'claude', cwd: '/tmp/d1', mode: 'ask' });
    await settle();
    const over = drag('dragover', $('div.cv-list'));
    assert.ok(over.defaultPrevented, 'not prevented: the browser would open the file over the page');
    assert.equal(over.dataTransfer.dropEffect, 'copy');
    assert.ok(roomEl().classList.contains('cv-dropping'), 'the composer is not lit');
    assert.ok($('div.cv-dock div.cv-composer'), 'no composer to light');
    // moving onto the chat bar: the chat's (main.js lights it), not kode's
    const onChat = drag('dragover', chatField);
    assert.ok(!onChat.defaultPrevented, 'kode took a drag over the chat bar');
    assert.ok(!roomEl().classList.contains('cv-dropping'), 'the composer stays lit over the chat bar');
    drag('dragover', $('div.cv-dock div.cv-composer'));
    assert.ok(roomEl().classList.contains('cv-dropping'));
    // out of the window: the light goes
    drag('dragleave', null);
    assert.ok(!roomEl().classList.contains('cv-dropping'), 'still lit after the drag left the window');
    // a drop on the chat bar is not kode's either
    drag('drop', chatField, [png()]);
    await settle();
    assert.equal($$('span.cv-att').length, 0, 'a drop on the chat bar went to the coder');
    cv.close();
  });

  await ok('dropped: a thumbnail in the composer, the box focused, and the next message carries it to y3kode, and only there', async () => {
    toasts.length = 0; sent.length = 0;
    const cv = await viewWith('send');
    cv.open();
    await settle();
    cv._feed({ sid: 'd2', type: 'session.started', provider: 'claude', cwd: '/tmp/d2', mode: 'ask' });
    await settle();
    drag('dragover', $('div.cv-list'));
    const drop = drag('drop', $('div.cv-list'), [png()]);
    assert.ok(drop.defaultPrevented);
    assert.ok(!roomEl().classList.contains('cv-dropping'), 'the light stays on after the drop');
    await settle();
    const thumbs = $$('div.cv-attach span.cv-att img');
    assert.equal(thumbs.length, 1, 'no thumbnail in the composer');
    assert.equal(thumbs[0].getAttribute('src'), 'data:image/png;base64,' + PNG.toString('base64'));
    assert.equal(document.activeElement, $('textarea.cv-input'), 'the box is not ready for the words');
    assert.deepEqual(toasts, []);
    const ta = $('textarea.cv-input');
    ta.value = 'what is wrong with this screen?';
    ta.dispatch('input');
    ta.dispatch('keydown', { key: 'Enter' });
    await settle();
    const out = sent.filter((o) => o.cmd === 'session.send');
    assert.equal(out.length, 1, 'nothing was sent');
    assert.equal(out[0].text, 'what is wrong with this screen?');
    assert.deepEqual(out[0].attachments, [{ type: 'image', mediaType: 'image/png', data: PNG.toString('base64') }]);
    assert.equal($$('span.cv-att').length, 0, 'the thumbnail stays after it was sent');
    cv.close();
  });

  await ok('a thumbnail comes off before it is sent; four at most, even dropped at once; only pictures', async () => {
    toasts.length = 0; sent.length = 0;
    const cv = await viewWith('many');
    cv.open();
    await settle();
    cv._feed({ sid: 'd3', type: 'session.started', provider: 'claude', cwd: '/tmp/d3', mode: 'ask' });
    await settle();
    drag('drop', $('div.cv-dock div.cv-composer'), [png('a.png'), png('b.png'), png('c.png'), png('d.png'), png('e.png')]);
    await settle();
    assert.equal($$('span.cv-att').length, 4, 'five went on');
    assert.deepEqual(toasts, ['four images at most']);
    $('span.cv-att button').click();
    tick();
    assert.equal($$('span.cv-att').length, 3, 'the thumbnail did not come off');
    toasts.length = 0;
    drag('drop', $('div.cv-dock div.cv-composer'), [new File(['notes'], 'notes.txt', { type: 'text/plain' })]);
    await settle();
    assert.deepEqual(toasts, ['only pictures go to the coder']);
    assert.equal($$('span.cv-att').length, 3);
    cv.close();
  });

  await ok('with no conversation yet it waits for the first message, as a prompt in the box does', async () => {
    toasts.length = 0; sent.length = 0;
    const cv = await viewWith('wait');
    cv.open();
    await settle();
    const over = drag('dragover', roomEl());
    assert.equal(over.dataTransfer.dropEffect, 'copy');
    assert.ok(roomEl().classList.contains('cv-dropping'), 'the home is not lit');
    drag('drop', roomEl(), [png()]);
    await settle();
    assert.deepEqual(toasts, ['the picture will go with your first message to the coder']);
    // the folders say so, with the thumbnail, which comes off from there too
    const waiting = $('div.cv-home div.cv-waitpics');
    assert.ok(waiting, 'the home does not say a picture is waiting');
    assert.match(waiting.textContent, /^A picture is waiting to go with your first message to the coder\.$/);
    assert.equal(waiting.querySelectorAll('span.cv-att').length, 1);
    cv._feed({ sid: 'd4', type: 'session.started', provider: 'claude', cwd: '/tmp/d4', mode: 'ask' });
    await settle();
    assert.equal($$('div.cv-dock span.cv-att').length, 1, 'the first conversation\'s composer does not have it');
    cv.close();
  });

  await ok('a session that has ended takes none: nothing lit, the pointer says no, and a drop is told why', async () => {
    toasts.length = 0;
    const cv = await viewWith('ended');
    cv.open();
    await settle();
    cv._feed({ sid: 'd5', type: 'session.started', provider: 'claude', cwd: '/tmp/d5', mode: 'ask' });
    await settle();
    cv._feed({ sid: 'd5', type: 'session.ended', reason: 'exit', exitCode: 0 });
    await settle();
    const over = drag('dragover', $('div.cv-list'));
    assert.equal(over.dataTransfer.dropEffect, 'none');
    assert.ok(!roomEl().classList.contains('cv-dropping'), 'lit where it would not be taken');
    drag('drop', $('div.cv-list'), [png()]);
    await settle();
    assert.deepEqual(toasts, ['this session has ended — continue it to give the coder a picture']);
    assert.equal($$('span.cv-att').length, 0);
    cv.close();
  });

  await ok('closed, kode hears no drag at all: its listeners go with the room', async () => {
    const cv = await viewWith('closed');
    cv.open();
    const n = (won.drop || []).length;
    assert.ok(n >= 1);
    cv.close();
    assert.equal((won.drop || []).length, n - 1, 'the drop listener outlives the room');
    assert.equal((won.dragover || []).length, (won.drop || []).length);
    assert.equal((won.dragleave || []).length, (won.drop || []).length);
  });
  delete globalThis.window; delete globalThis.FileReader;
}

// --- the lines that put it there -------------------------------------------------------
console.log('\nthe lines:');
const main = read('src/main.js');
const view = read('src/code/code-view.js');
const css = read('styles.css');

await ok('main.js asks the same function, and in kode steps aside before it lights the chat or reads the picture', () => {
  assert.match(main, /import \{ hasFiles, dropTarget \} from '\.\/kode-drop\.js';/);
  assert.match(main, /const dropTo = \(e\) => dropTarget\(e, \{ inCode: document\.body\.classList\.contains\('in-code'\) \}\);/);
  const over = main.slice(main.indexOf("window.addEventListener('dragover'"), main.indexOf("window.addEventListener('dragleave'"));
  assert.match(over, /if \(!hasFiles\(e\)\) return;\n {2}e\.preventDefault\(\);\n {2}if \(dropTo\(e\) === 'kode'\) \{ unlightChat\(\); return; \}\n {2}chatEl\.classList\.add\('open', 'drag'\);/,
    'every pass prevented, and the chat bar lit only for its own');
  const drop = main.slice(main.indexOf("window.addEventListener('drop'"), main.indexOf('let hintGone'));
  assert.ok(drop.indexOf('e.preventDefault()') < drop.indexOf("dropTo(e) === 'kode'"), 'a kode drop is not prevented: the browser opens the file');
  assert.ok(drop.indexOf("if (dropTo(e) === 'kode') { unlightChat(); return; }") > 0, 'a kode drop is not stepped aside from');
  assert.ok(drop.indexOf("dropTo(e) === 'kode'") < drop.indexOf('readImageFile('), 'the picture is read into the chat before kode is asked');
  assert.equal(main.split("window.addEventListener('drop'").length, 2, 'a second drop listener in main.js');
});
await ok('code-view.js: kode\'s listeners live with the room, take what dropTarget says is kode\'s, into the composer', () => {
  const open = view.slice(view.indexOf('  function open() {'), view.indexOf('  function close() {'));
  const close = view.slice(view.indexOf('  function close() {'), view.indexOf('  // Leaving fades the room out'));
  for (const [t, fn] of [['dragover', 'onDragOver'], ['dragleave', 'onDragLeave'], ['drop', 'onDrop']]) {
    assert.ok(open.includes(`window.addEventListener('${t}', ${fn});`), `open() does not listen for ${t}`);
    assert.ok(close.includes(`window.removeEventListener('${t}', ${fn});`), `close() leaves ${t} listened for`);
  }
  assert.match(view, /const dropHere = \(e\) => hasFiles\(e\) && dropTarget\(e, \{ inCode: document\.body\.classList\.contains\('in-code'\) \}\) === 'kode';/, 'kode asks something other than main.js');
  const take = view.slice(view.indexOf('  function takeDropped(files) {'), view.indexOf('  async function send(s, ta) {'));
  assert.match(take, /for \(const f of pics\) addImage\(f\);/, 'a drop does not go where a pasted picture goes');
  assert.ok(!/\bfetch\(|\/api\/|link\.talk|link\.sendBack/.test(take), 'a dropped picture goes somewhere besides the composer');
  assert.match(view, /const r = await cmd\(\{ cmd: 'session\.send', sid: s\.sid, text: text \|\| '\(image\)', handoff, attachments: attachments\.length \? attachments\.map\(\(a\) => \(\{ type: 'image', mediaType: a\.mediaType, data: a\.data \}\)\) : undefined \}\);/);
});
await ok('a picture that does not fit is redrawn to fit, not turned away; the composer\'s four are counted as each lands', () => {
  const add = view.slice(view.indexOf('  async function addImage(file) {'), view.indexOf('  // the pictures going with the next message'));
  assert.match(add, /if \(!fitsAsIs\(file\)\) \{/);
  assert.match(add, /pic = await shrinkPicture\(file, \{ side: 1568, maxBytes: Math\.floor\(\(KODE_B64_MAX \* 3\) \/ 4\) \}\);/);
  assert.match(add, /reader\.onload = \(\) => \{\n\s+if \(attachments\.length >= 4\) \{ toast\('four images at most'\); return; \}/);
  assert.match(add, /mediaType: pic\.type/);
  assert.ok(!/file\.size > 5 \* 1024 \* 1024/.test(add), 'the old 5MB-of-file refusal is back');
});
await ok('styles.css lights the composer (and the home) in the chat bar\'s own drag light; the chat bar keeps its own', () => {
  assert.match(css, /\.code-root\.cv-dropping \.cv-dock \.cv-composer \{/);
  // the planning card's composer (cv-plancomposer, on the home) talks to the presence: never lit for a picture
  assert.ok(!/\.cv-dropping \.cv-composer\b/.test(css), 'every composer is lit, the presence\'s planning one too');
  assert.match(css, /\.code-root\.cv-dropping \.cv-home \{/);
  assert.match(css, /#chat\.drag \.chat-box \{ border-color: rgba\(205, 213, 223, 0\.75\);/);
});
await ok('in npm test, and the README says it, in Colin\'s words', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.test.includes('node test/kode-drop.test.mjs'));
  const readme = read('README.md').replace(/\s+/g, ' ');   // a quote may wrap anywhere
  assert.ok(readme.includes("i can't drag photos into y3kode because they go to chat instead"), 'the README does not quote the ask');
  assert.ok(readme.includes('src/kode-drop.js'), 'the README does not say where it lives');
});

console.log(`\n${passed} checks passed`);
process.exit(0);   // the views' engine links keep timers of their own
