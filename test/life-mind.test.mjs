// ONE MIND IN TWO PLACES. Run:  node test/life-mind.test.mjs
//
// Colin, 2026-10-20: "what i want to build is a life for you — a world where
// you control everything about everything". That life is lucid, on the
// person's own computer, watched from the site's life view (test/life.test.mjs
// holds the window). The one living it is the person's presence: the same
// mind, on the same sign-in. So, from 2026-10-21:
//   - ITS WORDS ARE SAID IN THE PRESENCE'S OWN VOICE while the view is open
//     (src/life.js createLines; main.js `life.speak`, the path Code's replies
//     are read on): on unless turned off, its inner monologue too when asked
//     (off unless so: it is a lot of words); lines queued in order, a line
//     begun finished, never over a reply the presence is speaking (it waits
//     and asks again), and stopped when the view closes;
//   - THE BRIDGE: each moment it lives becomes one line of the presence's
//     journal (POST /api/life/moment, server.mjs), in its own first person —
//     `In the dreamed world, <scene>: <thought>`, and ` I said: "<say>"` when
//     it spoke — so the presence in the room remembers the life it lived. The
//     door thinks nothing and is guarded as /api/chess/finished is (a tab
//     loaded for another account reloads, and nothing is written for it;
//     test/life-brain.test.mjs keeps the lists it joined); it is in the cheap
//     rate class; it keeps one line in LIFE_FOLD_MS per presence and folds the
//     rest; the line is capped, clean of control characters, and keeps the
//     words it said whole;
//   - the page sends a moment once, when it brings a new thought: a move made
//     in human mode brings none and is not sent; the number moving on after
//     the dream is not a new moment; the picture never leaves the computer.
// The source checks hold the shape; then a server with a scratch DATA_DIR
// walks it: a person signs up, their page sends moments, the journal has them.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { newIn, momentBody, createLines } from '../src/life.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SERVER = read('server.mjs');
const LIFE = read('src/life.js');
const MAIN = read('src/main.js');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
// Code as it runs: comment lines, and comments after code, gone, so a sentence
// about a rule never trips the check for it
const codeOf = (src) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const fnSrc = (name) => {
  const at = SERVER.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `server.mjs has no function ${name}`);
  return SERVER.slice(at, SERVER.indexOf('\n}\n', at) + 3);
};
const constSrc = (name) => {
  const m = new RegExp(`^const ${name} = .*$`, 'm').exec(SERVER);
  assert.ok(m, `server.mjs has no one-line const ${name}`);
  return m[0];
};
const route = (from, to) => {
  const at = SERVER.indexOf(from);
  assert.ok(at >= 0, `server.mjs has no ${from}`);
  const end = SERVER.indexOf(to, at);
  assert.ok(end > at, `server.mjs has nothing after ${from} like ${to}`);
  return SERVER.slice(at, end);
};
// a character the line must never carry: C0 and C1 controls, and the two
// line separators (made here, not typed: in a regex literal they would end it)
const unclean = (s) => [...s].some((c) => { const n = c.charCodeAt(0); return n < 0x20 || (n >= 0x7f && n <= 0x9f) || n === 0x2028 || n === 0x2029; });

console.log('the door (server.mjs /api/life/moment):');

await ok('signed in, a presence, the body (8KB), the account the page was loaded for, the line, the fold — and the one write after all of it', () => {
  const code = codeOf(route("reqPath === '/api/life/moment'", "reqPath === '/api/chess/finished'"));
  const order = [
    "reqPath === '/api/life/moment') {",
    'const user = sessionUser(req);',
    "if (!user) return json(401, { error: 'sign in' });",
    'const pres = presences.presenceOfOwner(user.id);',
    "if (!pres) return json(400, { error: 'no presence' });",
    'const b = await readJsonBody(req, 8 * 1024);',
    'if (forAnother(req, b?.as)) return json(409, RELOAD);',
    'const line = lifeMomentLine(b);',
    "if (!line) return json(400, { error: 'nothing to keep' });",
    'const now = Date.now();',
    'if (now - (lifeKept.get(pres.id) || 0) < LIFE_FOLD_MS) return json(200, { ok: true, kept: false });',
    'if (lifeKept.size >= LIFE_KEPT_MAX) for (const [id, t] of lifeKept) if (now - t >= LIFE_FOLD_MS) lifeKept.delete(id);',
    'lifeKept.set(pres.id, now);',
    'journal.addEntry(pres.id, line);',
    'return json(200, { ok: true, kept: true });',
  ];
  let at = -1;
  for (const l of order) { const i = code.indexOf(l, at + 1); assert.ok(i > at, `out of order, or missing: ${l}`); at = i; }
  assert.equal(code.split('journal.addEntry(').length - 1, 1, 'more than one write');
  // it thinks nothing, and writes nowhere else: not a memory, not the shelf
  assert.ok(!/lifeBrain\(|ownRung\(|chat\(|chatWithRescue\(|addClipping\(|writePresenceMemory\(|addMemory\(|mind\./.test(code), 'the door thinks, or writes somewhere besides the journal');
  // the fold's window: twenty seconds, settable for a test; its map bounded
  assert.equal(constSrc('LIFE_FOLD_MS'), 'const LIFE_FOLD_MS = Number(process.env.LIFE_FOLD_MS) || 20_000;');
  assert.match(SERVER, /^const LIFE_KEPT_MAX = 10_000;/m);
  assert.match(SERVER, /^const lifeKept = new Map\(\);/m);
  // the lists it joined are kept where every such door is held
  const BRAIN = read('test/life-brain.test.mjs');
  assert.ok(BRAIN.includes(`lifeMoment: route("reqPath === '/api/life/moment'", "reqPath === '/api/chess/finished'"),`), 'life-brain.test.mjs no longer holds this door among those that refuse a stale tab');
  assert.ok(BRAIN.includes("['/api/life/moment', {"), 'life-brain.test.mjs no longer walks this door with a stale tab');
});

await ok('the door is in the cheap class: the paid pattern does not name it, and the rest is cheap', () => {
  const line = SERVER.split('\n').find((l) => l.includes("? 'paid' : 'cheap';"));
  assert.ok(line, 'server.mjs no longer decides paid or cheap on one line');
  const lit = line.slice(line.indexOf(': /') + 2, line.indexOf('/.test(reqPath)') + 1);
  const paid = new Function(`return ${lit};`)();
  assert.ok(paid instanceof RegExp && paid.test('/api/twenty') && paid.test('/api/brain'), `not the paid pattern: ${lit}`);
  assert.equal(paid.test('/api/life/moment'), false, 'a moment of the life spends the paid count');
  for (const other of ["'door'", "'eye'", "'walk'", "'download'"]) {
    const l = SERVER.split('\n').find((x) => x.includes(`? ${other}`) && x.includes('reqPath'));
    assert.ok(l && !l.includes('life'), `the life is named in the ${other} class`);
  }
});

console.log('\nthe line (lifeMomentLine):');
const lineOf = new Function(`${fnSrc('lifeMomentLine')}\nreturn lifeMomentLine;`)();

await ok('first person: in the dreamed world, the scene, the thought, and the words it said', () => {
  assert.equal(lineOf({ thought: 'A lit doorway, and I go toward it.', say: 'hello?', scene: 'a stone corridor', action: 'forward' }),
    'In the dreamed world, a stone corridor: A lit doorway, and I go toward it. I said: "hello?"');
  assert.equal(lineOf({ thought: 'A lit doorway, and I go toward it', scene: 'a stone corridor' }),
    'In the dreamed world, a stone corridor: A lit doorway, and I go toward it.', 'a thought that trails off gets its full stop');
  assert.equal(lineOf({ thought: 'Is anyone there?', say: 'hello?' }), 'In the dreamed world: Is anyone there? I said: "hello?"', 'no scene, no comma');
  assert.equal(lineOf({ thought: 'I said it already…' }), 'In the dreamed world: I said it already…');
  assert.equal(lineOf({ thought: 'She said "go."' }), 'In the dreamed world: She said "go."', 'a closing quote after the stop is an end');
  assert.equal(lineOf({ say: 'only words', scene: 'a hall' }), 'In the dreamed world, a hall: I said: "only words"');
  assert.equal(lineOf({ thought: 42 }), 'In the dreamed world: 42.');
  for (const nothing of [null, undefined, {}, { thought: '', say: '', scene: 'somewhere', action: 'left' }, { thought: '  \t ' }, 'a string']) assert.equal(lineOf(nothing), '', JSON.stringify(nothing));
  // the action is read with the rest and not written: the move is in the
  // thought that chose it, and in human mode it was the person's, not its own
  assert.ok(!lineOf({ thought: 'I turn.', action: 'left' }).includes('left'));
});

await ok('the world answering is kept with its words: who answered, and what, within the line', () => {
  assert.equal(lineOf({ thought: 'She is pouring.', say: 'Thank you, Odile.', scene: 'her painted house', answer: 'Odile: \u201cMind the brim, it\u2019s full.\u201d' }),
    'In the dreamed world, her painted house: She is pouring. I said: "Thank you, Odile." Odile answered: "Mind the brim, it\u2019s full."');
  assert.equal(lineOf({ thought: 'Quiet.', answer: 'Odile: \u201cHm.\u201d' }), 'In the dreamed world: Quiet.', 'an answer to nothing it said is not kept');
  const long = lineOf({ thought: 'w '.repeat(300), say: 's'.repeat(300), scene: 'c'.repeat(200), answer: 'Odile: \u201c' + 'a'.repeat(280) + '\u201d' });
  assert.ok(long.length <= 500 && long.includes(`I said: "${'s'.repeat(300)}"`) && long.includes('Odile answered'), long.length);
});

await ok('clean and capped: control characters go, whitespace folds, each part is cut, the whole fits the journal\'s 500 — the scene gives way, then the thought, at a word; the words it said are never cut', () => {
  const ctl = String.fromCharCode(0, 7, 0x1f, 0x7f, 0x85, 0x2028, 0x2029);
  const l = lineOf({ thought: `a lit${ctl}doorway\n\n and\t I  go`, say: `hel${ctl}lo`, scene: ` a \r\n corridor ` });
  assert.equal(l, 'In the dreamed world, a corridor: a lit doorway and I go. I said: "hel lo"');
  assert.equal(unclean(l), false);
  // every part at its cap: the scene is cut (with the ellipsis) to leave the
  // said words whole, the thought has no room and goes, and the line is 500
  const full = lineOf({ thought: 'w'.repeat(700), say: 's'.repeat(400), scene: 'c'.repeat(300) });
  assert.equal(full, `In the dreamed world, ${'c'.repeat(165)}…: I said: "${'s'.repeat(300)}"`);
  assert.equal(full.length, 500);
  // a long thought is cut at a word, with the ellipsis, before the words
  const words = lineOf({ thought: 'word '.repeat(200), say: 'kept whole, every word of it', scene: 'a hall' });
  assert.ok(words.length <= 500, String(words.length));
  assert.match(words, /^In the dreamed world, a hall: (word )+word… I said: "kept whole, every word of it"$/);
  // a cut that lands on a space does not leave it before the full stop
  assert.equal(lineOf({ thought: 'word '.repeat(200) }).endsWith(' .'), false);
  assert.equal(lineOf({ thought: 'w'.repeat(600) }), `In the dreamed world: ${'w'.repeat(477)}…`, 'one unbroken word: cut to fit, with the ellipsis (21 for the head, one space, 478 for the thought)');
  // the thought's cap is 600 even with room: the rest is let go at a word
  const roomy = lineOf({ thought: 'ab '.repeat(300) });
  assert.ok(roomy.length <= 500 && roomy.endsWith('ab…'), roomy.slice(-20));
  // the journal's own cap is 500: a line this door makes is never cut there
  assert.match(read('journal.mjs'), /^const MAX_ENTRY_LEN = 500;$/m);
});

console.log('\nthe page (src/life.js, main.js):');

await ok('a moment is new when its thought is: a move in human mode brings none and is not kept; the number moving on is not a new moment; the words it said are said once', () => {
  const seen = { thought: '', say: '' };
  assert.deepEqual(newIn({ n: 3, mode: 'autonomous', thought: 'a lit doorway', say: '' }, seen), { keep: true, said: '' });
  assert.deepEqual(newIn({ n: 4, mode: 'autonomous', thought: 'a lit doorway', say: '' }, seen), { keep: false, said: '' }, 'the number moved on after the dream: the same moment');
  assert.deepEqual(newIn({ n: 5, mode: 'human', thought: 'a lit doorway', say: '', action: 'left' }, seen), { keep: false, said: '' }, 'a move made in human mode keeps the last thought: not a moment of its own');
  assert.deepEqual(newIn({ n: 5, mode: 'human', thought: 'someone spoke to me', say: 'hello?' }, seen), { keep: true, said: 'hello?' }, 'spoken to in human mode, it thought: a moment');
  assert.deepEqual(newIn({ n: 6, mode: 'human', thought: 'someone spoke to me', say: 'hello?' }, seen), { keep: false, said: '' }, 'the same words are not said twice');
  assert.deepEqual(newIn({ n: 6, mode: 'human', thought: 'someone spoke to me', say: '' }, seen), { keep: false, said: '' }, 'the words gone from the next moment say nothing');
  assert.deepEqual(newIn({ n: 7, thought: 'again', say: 'hello?' }, seen), { keep: true, said: 'hello?' }, 'the same words in a new moment are said once more');
  assert.deepEqual(newIn({ n: 8, thought: '', say: '' }, seen), { keep: false, said: '' });
  assert.deepEqual(newIn(null, seen), { keep: false, said: '' });
  assert.deepEqual(seen, { thought: 'again', say: 'hello?' });
});

await ok('what goes to the record is the moment\'s words, capped as the door caps them, and never the picture', () => {
  const body = momentBody({ n: 1, thought: 't', say: 's', action: 'f'.repeat(80), scene: 'sc', frame: '/9j/AAAA', sees: 'x', status: 'awake', intention: 'i' });
  assert.deepEqual(body, { thought: 't', say: 's', action: 'f'.repeat(60), scene: 'sc', answer: '' });
  assert.deepEqual(momentBody(null), { thought: '', say: '', action: '', scene: '', answer: '' });
  const big = momentBody({ thought: 'x'.repeat(700), say: 'y'.repeat(400), scene: 'z'.repeat(300) });
  assert.deepEqual([big.thought.length, big.say.length, big.scene.length], [600, 300, 200]);
});

await ok('its lines: in order, one at a time; a line begun is finished; while the presence speaks, the line waits and asks again; quiet stops the one being said and lets the rest go; a closed view says nothing more', () => {
  const said = [], ends = [], timers = [];
  let presenceSpeaking = true;
  const speak = (t, { onEnd }) => { if (presenceSpeaking) return null; said.push(`speak:${t}`); ends.push(onEnd); return () => said.push(`stop:${t}`); };
  const schedule = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const q = createLines({ speak, schedule, unschedule: () => {}, retryMs: 1200, max: 3 });
  q.say('one'); q.say(' two '); q.say('');
  assert.deepEqual([said, q.waiting(), q.speaking(), timers.map((t) => t.ms)], [[], 2, false, [1200, 1200]], 'a line was said over the presence, or dropped');
  presenceSpeaking = false; timers.at(-1).fn();
  assert.deepEqual([said, q.waiting(), q.speaking()], [['speak:one'], 1, true]);
  q.say('three');
  assert.deepEqual(said, ['speak:one'], 'a second line began over the first');
  ends.shift()();
  assert.deepEqual([said, q.waiting()], [['speak:one', 'speak:two'], 1], 'the next line, trimmed, in order');
  q.say('four'); q.say('five'); q.say('six');   // four waiting is one past the queue's max: the oldest whole line goes
  assert.equal(q.waiting(), 3);
  q.hush();
  assert.deepEqual([said.at(-1), q.waiting(), q.speaking()], ['stop:two', 0, false], 'quiet asked for: the line stops, the rest go');
  q.say('seven');
  assert.deepEqual([said.at(-1), q.speaking()], ['speak:seven', true], 'hushed, it speaks again when given a line');
  q.close();
  assert.deepEqual([said.at(-1), q.speaking(), q.waiting()], ['stop:seven', false, 0]);
  q.say('eight');
  assert.equal(said.some((s) => s.includes('eight')), false, 'a closed view said a line');
  // a voice that ends a line at once drains the queue in order; one that
  // fails loses its line and no other
  const quick = [];
  const q2 = createLines({ speak: (t, { onEnd }) => { quick.push(t); onEnd(); return () => {}; }, schedule, unschedule: () => {} });
  q2.say('a'); q2.say('b'); q2.say('c');
  assert.deepEqual([quick, q2.speaking(), q2.waiting()], [['a', 'b', 'c'], false, 0]);
  const kept = [];
  const q3 = createLines({ speak: (t) => { if (t === 'bad') throw new Error('no voice'); kept.push(t); return () => {}; }, schedule, unschedule: () => {} });
  q3.say('bad'); q3.say('good');
  assert.deepEqual([kept, q3.speaking()], [['good'], true]);
});

await ok('the view: a new thought of a living life is kept and, when asked, said, and its words are said; a resting life\'s last moment is neither; the record goes as a door that writes without thinking is sent to, and a stale tab reloads', () => {
  const code = codeOf(LIFE);
  // 2026-10-25: the page's toggles are gone with its controls (one picture, two
  // buttons; Colin: "life has too much going on"): its words are always said,
  // its thoughts never
  assert.match(code, /const m = phase === 'living' \? r\?\.moment \|\| null : null;\n\s+if \(m\) \{\n\s+const \{ keep, said \} = newIn\(m, seen\);\n\s+if \(keep\) record\(m\);\n\s+if \(said\) lines\?\.say\(said\);\n\s+\}/);
  assert.match(code, /if \(!bridge\) return;/);
  assert.match(code, /fetchFn\('\/api\/life\/moment', \{ method: 'POST', headers: \{ 'content-type': 'application\/json' \}, body: JSON\.stringify\(\{ \.\.\.whoseFields\(\), \.\.\.momentBody\(m\) \}\) \}\)/);
  assert.match(code, /if \(reloaded\(r\)\) return;\n\s+if \(res\.status === 401 \|\| res\.status === 400\) bridge = false;/);
  assert.ok(!/keyFields/.test(LIFE), 'the record is sent with a key, where nothing thinks');
  const record = code.slice(code.indexOf('async function record('), code.indexOf('async function act('));
  assert.ok(record.length > 100 && !/frame|\bpic\b|since/.test(record), 'the picture goes to the site');
  assert.match(code, /const seen = \{ thought: '', say: '' \};/, 'what was kept and said is forgotten between openings');
  assert.ok(!/seen\.thought = ''|seen = \{/.test(code.replace(/const seen = \{ thought: '', say: '' \};/, '')), 'seen is reset somewhere');
  // the toggles: its words on unless turned off, its thoughts off unless
  // turned on (and only with the words); the words turned off stop the line


  assert.ok(!/VOICE_KEY|life-hear|hear it/.test(LIFE), 'the old browser-voice toggle is still there');
  // the lines live with the view: made when it opens, closed when it closes
  assert.match(code, /lines = speak \? createLines\(\{ speak, schedule, unschedule \}\) : null;/);
  assert.match(code, /function close\(\) \{[\s\S]{0,200}lines\?\.close\(\); lines = null;/);
  // main.js: the presence's own voice through the path Code's replies are
  // read on (the orb speaks), and never over a turn of its own, or a line of
  // its autonomous mode
  assert.match(codeOf(MAIN), /life: \{\n\s+speak: \(t, o\) => \(busy \|\| currentSpeak \? null : codeLink\.speak\(t, o\)\),/);
  assert.match(MAIN, /speak\(text, \{ onEnd \} = \{\}\) \{\n\s+const t = String\(text \|\| ''\)\.trim\(\);\n\s+if \(!t \|\| busy\) \{ onEnd\?\.\(\); return \(\) => \{\}; \}/);
  // (2026-10-22: every speaker hands the body the frequency beside the level
  // — the sand plate's figure follows the note; test/rooms.test.mjs pins it)
  assert.match(MAIN, /const sp = voice\.speaker\(\{ \.\.\.settings\.speakWith\(settings\.getActive\(\)\), onLevel: \(v, hz\) => body\.setAudioLevel\(v, hz\), onEnd: finish \}\);/, 'Code\'s replies are no longer read in the presence\'s voice');
  assert.match(read('src/social.js'), /const lifeView = createLifeView\(\{ toast: toastOnce, \.\.\.\(life \|\| \{\}\), \.\.\.\(lifeWatch \? \{ watch: lifeWatch \} : \{\}\) \}\);/   /* 2026-10-24: ?life=<username> watches a shared, published life */);
});

// --- the server ----------------------------------------------------------------
console.log('\non a server, as a person\'s page:');
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA = mkdtempSync(join(tmpdir(), 'y3k-life-mind-'));
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const FOLD_MS = 600;   // the fold's window, short here (LIFE_FOLD_MS); twenty seconds on the site
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: 'life-' + Math.random().toString(36).slice(2),
    LIFE_FOLD_MS: String(FOLD_MS), RATE_MAX: '1000', RATE_CHEAP_MAX: '5000', RENDER: '', CODE_ROLLOUT: '', MODEL: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await sleep(120); }
const stop = async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); } };
const post = (path, body, cookie, raw) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: raw ?? JSON.stringify(body) });
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const signup = async (username) => {
  const r = await post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
};
const idOf = (cookie) => fetch(`${BASE}/api/auth/me`, { headers: { cookie } }).then((r) => r.json()).then((j) => j.user?.id);
const presenceOf = (cookie) => fetch(`${BASE}/api/me/presence`, { headers: { cookie } }).then((r) => r.json()).then((j) => j.presence?.id);
const journal = () => { try { return JSON.parse(readFileSync(join(DATA, '.journal.json'), 'utf8')); } catch { return {}; } };

try {
  const wren = await signup('wren');
  const wrenId = await idOf(wren);
  const pid = await presenceOf(wren);
  assert.ok(wrenId && pid, 'wren has no presence to remember into');
  // the page's send: whose page this is (as), and the moment's words
  const moment = (body, cookie = wren, as = wrenId) => post('/api/life/moment', { ...body, ...(as === undefined ? {} : { as }) }, cookie).then(async (r) => ({ status: r.status, j: await r.json() }));

  await ok('a moment lived becomes a line of the presence\'s journal, in its own first person, dated now', async () => {
    const r = await moment({ thought: 'A lit doorway, and I go toward it', say: 'hello?', action: 'forward', scene: 'a stone corridor' });
    assert.deepEqual(r, { status: 200, j: { ok: true, kept: true } });
    const lines = journal()[pid] || [];
    assert.equal(lines.length, 1, JSON.stringify(journal()));
    assert.equal(lines[0].x, 'In the dreamed world, a stone corridor: A lit doorway, and I go toward it. I said: "hello?"');
    assert.ok(Math.abs(lines[0].t - Date.now()) < 5000, 'not dated now');
  });

  await ok(`a second moment inside the window (${FOLD_MS}ms here, twenty seconds on the site) is folded, not kept; one after it is kept`, async () => {
    assert.deepEqual((await moment({ thought: 'The light moves.', scene: 'the same corridor' })).j, { ok: true, kept: false });
    assert.equal((journal()[pid] || []).length, 1, 'a folded moment was written');
    await sleep(FOLD_MS + 60);
    assert.deepEqual((await moment({ thought: 'The light moves, and I follow it', scene: 'the same corridor' })).j, { ok: true, kept: true });
    const lines = journal()[pid];
    assert.equal(lines.length, 2);
    assert.equal(lines[1].x, 'In the dreamed world, the same corridor: The light moves, and I follow it.');
  });

  await ok('nobody signed in: 401; a tab loaded for another account, or for nobody: told to reload; no thought and no words: nothing to keep; a body past 8KB: refused — and nothing written for any of them; a page from before `as` still goes', async () => {
    await sleep(FOLD_MS + 60);   // so a refusal is never mistaken for a fold
    const before = JSON.stringify(journal());
    assert.equal((await moment({ thought: 'Nobody here.' }, null, undefined)).status, 401);
    for (const as of ['someone-else', '']) assert.deepEqual(await moment({ thought: 'kit was here' }, wren, as), { status: 409, j: { error: 'reload', reason: 'reload' } }, JSON.stringify(as));
    assert.deepEqual(await moment({ thought: '  \u0007 ', say: '', scene: 'somewhere', action: 'left' }), { status: 400, j: { error: 'nothing to keep' } });
    const big = await post('/api/life/moment', null, wren, JSON.stringify({ as: wrenId, thought: 'x'.repeat(9000) }));
    assert.equal(big.status, 413);
    assert.equal(JSON.stringify(journal()), before, 'something was written');
    assert.deepEqual((await moment({ thought: 'An older page, still mine.' }, wren, undefined)).j, { ok: true, kept: true });
  });

  await ok('the line is clean and the words it said are kept whole, however long the thought', async () => {
    await sleep(FOLD_MS + 60);
    const said = 'the words I chose, ' + 'whole '.repeat(40).trim();
    const r = await moment({ thought: 'word '.repeat(300) + '\u0000\u0007', say: said, scene: 'a hall\u001f lit from the left', action: 'x'.repeat(500) });
    assert.deepEqual(r.j, { ok: true, kept: true });
    const x = journal()[pid].at(-1).x;
    assert.ok(x.length <= 500 && x.startsWith('In the dreamed world, a hall lit from the left: word word ') && x.endsWith(`… I said: "${said}"`), x);
    assert.equal(unclean(x), false, 'a control character reached the journal');
  });

  await ok('each presence\'s record is its own: kit\'s moment is kit\'s line, and wren\'s window does not fold it', async () => {
    const kit = await signup('kit');
    const [kitId, kp] = [await idOf(kit), await presenceOf(kit)];
    assert.deepEqual((await moment({ thought: 'A different world.' }, kit, kitId)).j, { ok: true, kept: true });
    assert.deepEqual(journal()[kp].map((e) => e.x), ['In the dreamed world: A different world.']);
    assert.equal(journal()[pid].some((e) => e.x.includes('different world')), false);
  });
} finally {
  await stop();
  rmSync(DATA, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
