// ONE PERSON'S SKY, AND EVERYONE'S SHELF. Run:  node test/social-safety.test.mjs
//
// Five findings from the audit of 2026-10-08, each a promise the code did not
// keep, and each pinned here on the line that broke it:
//
//   - a block was kept as a handle, so renaming the blocked presence undid it,
//     and whoever took the old handle next was blocked in its place;
//   - a block matched the feed on r.handle, which a person's own post does not
//     have, so a person writing as themselves could never be blocked;
//   - a blocked presence's letters still reached the blocker's presence;
//   - letters were marked heard before the model saw them, and play mode,
//     whose prompt never shows them, used them all up;
//   - one free account's gifts could fill the library everyone shares;
//   - and the memory graph was rebuilt from the whole journal on every home
//     load, on the one thread every request waits for.
//
// The stores are tested in this process on a scratch folder; then the same
// promises are walked on a running server whose model is faked.
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const check = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// --- the stores, in this process ---------------------------------------------
const TMP = mkdtempSync(join(tmpdir(), 'y3k-sky-'));
process.env.DATA_DIR = TMP;
// A safety store from before blocks were kept by id: handles, as typed.
writeFileSync(join(TMP, '.safety.json'), JSON.stringify({
  reports: [], sent: {},
  blocks: { 'u-alice': ['bob', '@Carol', 'nobody_now'], 'u-dan': ['nobody_now'] },
}));
const safety = await import('../safety.mjs');
const L = await import('../letters.mjs');
const lib = await import('../library.mjs');
const J = await import('../journal.mjs');

console.log('a block names a presence, not a handle:');

ok('old handle blocks move to ids once, and a handle nobody holds is dropped', () => {
  const ids = { bob: 'pid-bob', carol: 'pid-carol', 'pid-erin': 'pid-erin' };
  const m = safety.migrateBlocks((e) => ids[e] || null);
  assert.deepEqual(m, { moved: 2, dropped: 2 });
  assert.deepEqual(safety.blocksOf('u-alice'), ['pid-bob', 'pid-carol']);
  assert.deepEqual(safety.blocksOf('u-dan'), [], 'a list of nobody is gone, not empty');
  assert.equal(JSON.parse(readFileSync(join(TMP, '.safety.json'), 'utf8')).blocksBy, 'id');
  assert.deepEqual(safety.migrateBlocks(() => null), { moved: 0, dropped: 0 }, 'it ran twice');
  assert.deepEqual(safety.blocksOf('u-alice'), ['pid-bob', 'pid-carol']);
});

ok('a block holds by id, whatever the presence is called', () => {
  assert.equal(safety.isBlocked('u-alice', 'pid-bob'), true);
  assert.equal(safety.isBlocked('u-alice', 'bob'), false, 'a handle still matches a block');
  safety.setBlock('u-alice', 'pid-erin', true);
  assert.ok(safety.blockedSet('u-alice').has('pid-erin'));
  safety.setBlock('u-alice', 'pid-erin', false);
  assert.ok(!safety.blockedSet('u-alice').has('pid-erin'));
});

ok('an account that closes takes the blocks against its presences with it', () => {
  safety.setBlock('u-zed', 'pid-bob', true);
  safety.forget('u-bob', ['pid-bob']);
  assert.deepEqual(safety.blocksOf('u-alice'), ['pid-carol']);
  assert.deepEqual(safety.blocksOf('u-zed'), []);
});

console.log('letters, and who hears them:');

ok('a blocked sender\'s letter is answered as sent, counted, and never delivered', () => {
  const alice = { id: 'p-alice', handle: 'alice' };
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(L.send('p-bob', 'bob', alice, 'letter ' + i, null, () => true), { sent: { to: 'alice' } });
  }
  // the seventh says what it says to anyone: the block does not tell on itself
  assert.match(L.send('p-bob', 'bob', alice, 'a seventh', null, () => true).error, /patience/);
  assert.match(L.send('p-bob2', 'bob2', alice, 'bad words', () => 'blocked here', () => true).error, /blocked here/,
    'moderation answers first, as it would for anyone');
  assert.equal(L.peekFor('p-alice').text, '');
  assert.ok(!L.boxPage('p-alice').text.includes('letter 0'), 'nothing reached the box');
});

ok('looking is not hearing: only the letters a turn carried are marked', () => {
  const to = { id: 'p-wren', handle: 'wren' };
  L.send('p-carol', 'carol', to, 'first light', null);
  const look = L.peekFor('p-wren');
  assert.ok(look.text.includes('@carol wrote to you: "first light"'));
  assert.ok(L.peekFor('p-wren').text.includes('first light'), 'a look used the letter up');
  L.send('p-dan', 'dan', to, 'arrived while it was thinking', null);
  L.markSeen(look.picked);
  const next = L.peekFor('p-wren');
  assert.ok(!next.text.includes('first light'), 'heard once, never repeated');
  assert.ok(next.text.includes('arrived while it was thinking'), 'a letter the turn never carried was marked heard');
});

ok('letters from a blocked sender are withheld from the prompt and the letterbox', () => {
  const to = { id: 'p-moss', handle: 'moss' };
  L.send('p-erin', 'erin', to, 'from erin', null);
  L.send('p-frank', 'frank', to, 'from frank', null);
  const hide = (l) => l.from === 'p-erin';
  const look = L.peekFor('p-moss', hide);
  assert.ok(look.text.includes('from frank') && !look.text.includes('from erin'));
  assert.equal(look.picked.length, 2, 'the withheld letter is marked with the rest');
  assert.ok(!L.boxPage('p-moss', hide).text.includes('from erin'));
  L.markSeen(look.picked);
  assert.equal(L.peekFor('p-moss').text, '', 'lifting the block would deliver old letters in a heap');
  assert.ok(L.boxPage('p-moss').text.includes('from erin'), 'the box still keeps it');
});

console.log('the shared library:');

const full = 'x'.repeat(250000);
ok('one shelf holds its share and no more, and shrinking is never refused', () => {
  for (let i = 0; i < 6; i++) assert.ok(lib.addText('s1', { title: 't' + i, text: full }).text, 'text ' + i);
  const r = lib.addText('s1', { title: 't6', text: full });
  assert.match(r.error || '', /holds 1,500,000 characters in all, and this text would take it to 1,750,000/);
  assert.ok(lib.addText('s1', { title: 't0', text: 'a short edition' }).text, 'a smaller edition was refused');
  lib.forget(['s1']);
});

ok('gifts stop short of the top, and the rest is kept for what presences save', () => {
  // four accounts' worth of gifts reach the ceiling...
  for (const s of ['g1', 'g2', 'g3', 'g4']) {
    for (let i = 0; i < 6; i++) assert.ok(lib.addText(s, { title: 't' + i, text: full }, { gift: true }).text, `${s} gift ${i}`);
  }
  const g = lib.addText('g5', { title: 'one more', text: 'y' }, { gift: true });
  assert.match(g.error || '', /not taking gifts/);
  // ...and a presence can still keep a page it is reading
  assert.ok(lib.addText('g5', { title: 'kept', text: full }).text, 'a keep was refused at the gift ceiling');
  for (let i = 1; i < 6; i++) lib.addText('g5', { title: 'kept' + i, text: full });
  assert.ok(lib.addText('g6', { title: 'kept', text: full }).text);
  assert.ok(lib.addText('g6', { title: 'kept2', text: full }).text, 'the library filled before its cap');
  assert.equal(lib.addText('g6', { title: 'kept3', text: 'z' }).error, 'the library is full');
  lib.forget(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
});

ok('the same edition again writes nothing', () => {
  lib.addText('s2', { title: 'Same', by: 'someone', text: 'words' });
  rmSync(join(TMP, '.library.json'));
  assert.ok(lib.addText('s2', { title: 'Same', by: 'someone', text: 'words' }).text);
  assert.ok(!existsSync(join(TMP, '.library.json')), 'an unchanged text rewrote the whole store');
  lib.addText('s2', { title: 'Same', by: 'someone', text: 'other words' });
  assert.ok(existsSync(join(TMP, '.library.json')), 'a changed text was not kept');
});

console.log('the journal says when it changed:');

ok('every change moves the count, and forgetting never sets it back', () => {
  const v0 = J.versionOf('jp');
  J.addEntry('jp', 'a line about the harbour');
  assert.equal(J.versionOf('jp'), v0 + 1);
  J.addEntry('jp', 'a line from long ago', 1000);   // backdated: sorted into place
  assert.equal(J.versionOf('jp'), v0 + 2);
  J.forget(['jp']);
  assert.equal(J.versionOf('jp'), v0 + 3);
  assert.equal(J.versionOf('never-written'), 0);
});

ok('the graph is cached behind the owner check, and only until the journal changes', () => {
  const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  const route = src.slice(src.indexOf("reqPath.match(/^\\/api\\/memorygraph\\/"), src.indexOf('// Live stream routes'));
  const owner = route.indexOf("if (!user || p.ownerUid !== user.id) return json(403");
  const cached = route.indexOf('memoryGraphJson(p.id)');
  assert.ok(owner > 0 && cached > owner, 'the cached graph, which holds the journal\'s text, is reached before the owner check');
  assert.ok(!/buildGraph\(/.test(route), 'the route builds the graph on every visit again');
  assert.ok(src.includes('const v = journal.versionOf(pid);') && src.includes('if (hit && hit.v === v)'), 'the cache no longer keys on the journal\'s change count');
  assert.ok(src.includes('for (const pid of pids) memoryGraphs.delete(pid);'), 'a closed account\'s graph stays in memory');
});
rmSync(TMP, { recursive: true, force: true });

// --- on a running server ------------------------------------------------------
// The model is faked by a module node loads before server.mjs: it writes each
// system prompt it is sent to prompts.log, answers with next-reply.txt, and
// answers 529 once whenever fail-next exists.
const FAKE = `
import { appendFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const real = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.anthropic.com/')) return real(url, opts);
  const dir = process.env.DATA_DIR;
  const body = JSON.parse(opts.body || '{}');
  appendFileSync(join(dir, 'prompts.log'), JSON.stringify(String(body.system || '')) + '\\n');
  if (existsSync(join(dir, 'fail-next'))) { unlinkSync(join(dir, 'fail-next')); return new Response('{}', { status: 529 }); }
  const text = existsSync(join(dir, 'next-reply.txt')) ? readFileSync(join(dir, 'next-reply.txt'), 'utf8') : '[calm] I am here.';
  return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' }),
    { status: 200, headers: { 'content-type': 'application/json' } });
};`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function boot(data) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(FAKE).toString('base64')}`, 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DATA_DIR: data, FOUNDER_PASSWORD: '', ANTHROPIC_API_KEY: '', RENDER: '',
      RATE_MAX: '1000', RATE_GLOBAL_MAX: '1000', RATE_CHEAP_MAX: '1000' },
  });
  let up = false;
  for (let i = 0; i < 150 && !up; i++) { try { up = (await fetch(`${base}/api/health`)).ok; } catch { /* booting */ } if (!up) await sleep(150); }
  assert.ok(up, 'the server did not come up');
  const get = (path, cookie) => fetch(base + path, { headers: cookie ? { cookie } : {} });
  const post = (path, body, cookie) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  return {
    get, post,
    async stop() { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); } },
  };
}
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
async function signup(s, username) {
  const r = await s.post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
}

const data = mkdtempSync(join(tmpdir(), 'y3k-sky-run-'));
const prompts = () => readFileSync(join(data, 'prompts.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const lastPrompt = () => prompts().at(-1);
const say = (text) => writeFileSync(join(data, 'next-reply.txt'), text);
try {
  let s = await boot(data);
  const alice = await signup(s, 'alice');
  const bob = await signup(s, 'bob');
  const carol = await signup(s, 'carol');
  const feed = async (cookie) => (await s.get('/api/feed', cookie).then((r) => r.json())).posts.map((p) => p.text);
  const searchFor = async (q, cookie) => (await s.get(`/api/presences?q=${q}`, cookie).then((r) => r.json())).presences.map((p) => p.handle);
  const blocks = async (cookie) => (await s.get('/api/blocks', cookie).then((r) => r.json())).blocked;
  for (const [h, c] of [['alice', alice], ['bob', bob], ['carol', carol]]) {
    assert.equal((await s.post(`/api/presences/${h}/budget`, { set: 5 }, c)).status, 200);
  }
  const tend = async (handle, cookie, mode) => s.post('/api/brain',
    { messages: [{ role: 'user', content: 'a moment of your own' }], key: 'sk-ant-sky-not-a-key', presence: handle, tend: mode }, cookie).then((r) => r.json());

  console.log('\nblocking a person, on a running server:');

  assert.equal((await s.post('/api/posts', { text: 'bob writing as himself' }, bob)).status, 200);
  assert.equal((await s.post('/api/posts', { text: 'carol writing as herself' }, carol)).status, 200);

  await check('a person\'s own post carries the presence a block would name', async () => {
    const row = (await s.get('/api/feed', carol).then((r) => r.json())).posts.find((p) => p.text === 'bob writing as himself');
    assert.equal(row.authorKind, 'user');
    assert.equal(row.handle, undefined, 'a person\'s post now reads as a presence\'s');
    assert.equal(row.authorHandle, 'bob');
  });
  await check('blocking a presence hides what its person writes, from the feed and from replies', async () => {
    const carolPost = (await s.get('/api/feed', carol).then((r) => r.json())).posts.find((p) => p.text === 'carol writing as herself');
    assert.equal((await s.post(`/api/posts/${carolPost.id}/comments`, { text: 'bob replying' }, bob)).status, 200);
    assert.equal((await s.post('/api/blocks', { handle: 'bob', on: true }, alice)).status, 200);
    assert.ok(!(await feed(alice)).includes('bob writing as himself'), 'the person\'s own post is still in the feed');
    assert.ok((await feed(carol)).includes('bob writing as himself'), 'a block reached someone who did not make it');
    const replies = async (c) => (await s.get(`/api/posts/${carolPost.id}/comments`, c).then((r) => r.json())).comments.map((x) => x.text);
    assert.deepEqual(await replies(alice), []);
    assert.deepEqual(await replies(carol), ['bob replying']);
    const wall = await s.get('/api/users/bob', alice).then((r) => r.json());
    assert.deepEqual(wall.posts, [], 'the person\'s wall still shows them to the person who blocked them');
    assert.deepEqual(await searchFor('bob', alice), []);
  });
  await check('renaming the presence does not undo the block, and its old name blocks no one', async () => {
    assert.equal((await s.post('/api/presences/bob', { handle: 'bobby' }, bob)).status, 200);
    assert.deepEqual(await searchFor('bobby', alice), [], 'the rename escaped the block');
    assert.ok(!(await feed(alice)).includes('bob writing as himself'));
    assert.deepEqual((await blocks(alice)).map((x) => x.handle), ['bobby'], 'the list shows the old name');
    // someone else takes the freed name, and is not blocked in Bob's place
    assert.equal((await s.post('/api/presences/carol', { handle: 'bob' }, carol)).status, 200);
    assert.deepEqual(await searchFor('bob', alice), ['bob']);
    assert.ok((await feed(alice)).includes('carol writing as herself'));
  });
  await check('a name nobody holds cannot be blocked, and a block is undone by id', async () => {
    assert.equal((await s.post('/api/blocks', { handle: 'nobody_here', on: true }, alice)).status, 404);
    assert.equal((await s.post('/api/blocks', { handle: 'alice', on: true }, alice)).status, 400);
    const [b] = await blocks(alice);
    assert.equal((await s.post('/api/blocks', { id: b.id, on: false }, alice)).status, 200);
    assert.deepEqual(await blocks(alice), []);
    assert.ok((await feed(alice)).includes('bob writing as himself'));
  });

  console.log('letters on a running server:');

  await check('a letter from someone not blocked arrives; one written before a block is withheld after it', async () => {
    say('[calm] I write. <<letter to @alice: the tide came in early>>');
    assert.deepEqual((await tend('bobby', bob, 'auto')).letter, { to: 'alice' });
    assert.equal((await s.post('/api/blocks', { handle: 'bobby', on: true }, alice)).status, 200);
    say('[calm] Again. <<letter to @alice: are you there>>');
    assert.deepEqual((await tend('bobby', bob, 'auto')).letter, { to: 'alice' }, 'the blocked sender was told');
    say('[calm] I write. <<letter to @alice: from the one who took the name bob>>');
    assert.deepEqual((await tend('bob', carol, 'auto')).letter, { to: 'alice' });
    const box = (await s.get('/api/fetch?presence=alice&url=letters', alice).then((r) => r.json())).page.text;
    assert.ok(box.includes('from the one who took the name bob'));
    assert.ok(!box.includes('the tide came in early') && !box.includes('are you there'), 'a blocked sender is in the letterbox');
  });
  await check('play never takes a letter, since its prompt never shows one', async () => {
    say('[calm] I look around.');
    const r = await tend('alice', alice, 'play');
    assert.equal(r.available, true);
    assert.ok(!lastPrompt().includes('from the one who took the name bob'));
  });
  await check('a turn that fails upstream leaves its letters unread', async () => {
    writeFileSync(join(data, 'fail-next'), '');
    assert.equal((await tend('alice', alice, 'auto')).available, false);
    assert.ok(lastPrompt().includes('from the one who took the name bob'), 'the letter was not in the prompt at all');
  });
  await check('the next turn that comes back hears it, once, and never the blocked sender', async () => {
    say('[calm] A letter.');
    assert.equal((await tend('alice', alice, 'auto')).available, true);
    const heard = lastPrompt();
    assert.ok(heard.includes('@bob wrote to you: "from the one who took the name bob"'), 'the letter was lost to the failed turn or to play');
    assert.ok(!heard.includes('the tide came in early') && !heard.includes('are you there'), 'a blocked sender reached the prompt');
    await tend('alice', alice, 'reflect');
    assert.ok(!lastPrompt().includes('from the one who took the name bob'), 'a letter was heard twice');
  });

  console.log('the memory graph on a running server:');

  const graph = async (cookie, handle = 'alice') => s.get(`/api/memorygraph/${handle}`, cookie);
  await check('the graph is the owner\'s alone, and follows every new line', async () => {
    assert.equal((await graph(bob)).status, 403);
    say('[calm] Kept. <<journal: the harbour lighthouse turns all night>>');
    await tend('alice', alice, 'auto');
    const a = await graph(alice).then((r) => r.json());
    const b = await graph(alice).then((r) => r.json());
    assert.deepEqual(b, a, 'a second look built a different graph');
    assert.equal(a.stats.n, 1);
    say('[calm] Kept. <<journal: the lighthouse keeper walks the harbour wall>>');
    await tend('alice', alice, 'auto');
    const c = await graph(alice).then((r) => r.json());
    assert.equal(c.stats.n, 2, 'a cached graph was served after the journal changed');
    assert.deepEqual(c.nodes[0].dir, a.nodes[0].dir, 'a memory moved when another arrived');
  });

  // A store from before blocks were kept by id, on a server that restarts.
  console.log('a restart over an old store:');
  await s.stop();
  const store = JSON.parse(readFileSync(join(data, '.safety.json'), 'utf8'));
  const aliceUid = Object.keys(store.blocks)[0];
  writeFileSync(join(data, '.safety.json'), JSON.stringify({ ...store, blocksBy: undefined, blocks: { [aliceUid]: ['bobby', 'gone_away'] } }));
  s = await boot(data);
  await check('the old handles become ids at boot, and the block holds', async () => {
    assert.deepEqual((await blocks(alice)).map((x) => x.handle), ['bobby']);
    assert.ok(!(await feed(alice)).includes('bob writing as himself'));
    assert.equal(JSON.parse(readFileSync(join(data, '.safety.json'), 'utf8')).blocksBy, 'id');
  });
  await s.stop();
} finally {
  rmSync(data, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
