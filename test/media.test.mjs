// A POST'S MEDIA, FROM THE COMPOSER TO THE PLAYER. Run:  node test/media.test.mjs
//
// Five findings of the 2026-10-08 audit, each pinned where it lived:
//  - /media answered every request with the whole file, chunked, and no
//    length, so Safari and every iOS browser could not play a video or a sound
//    (they ask for bytes 0-1 and need a 206) and Chrome could not seek;
//  - a post's 64MB body was read whole before anything was asked of it, and a
//    few at once from one account took the server down;
//  - the 30s request timeout cut off the uploads the posts route is built for;
//  - the composer promised ten-minute videos and never looked at a file's
//    size, and the server refused it after a paid screening call; the chat let
//    3MB pictures through to routes that read 1MB, and dropped them in silence;
//  - an animated picture was screened on one frame and played every frame.
import assert from 'node:assert';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { deflateSync } from 'node:zlib';
import {
  MB, MEDIA_CAPS, MAX_MEDIA, POST_BODY_MAX, BRAIN_BODY_MAX, CHAT_IMAGE_MAX, ANIMATED, POST_TOO_LARGE, tooLarge, isAnimated, mayAnimate,
} from '../src/media-rules.mjs';
import { byteRange } from '../delivery.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const check = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// --- pictures, built byte by byte ----------------------------------------------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const chunk = (type, data = Buffer.alloc(0)) => {
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  return Buffer.concat([u32(data.length), td, u32(crc32(td))]);
};
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = chunk('IHDR', Buffer.concat([u32(1), u32(1), Buffer.from([8, 6, 0, 0, 0])]));
const IDAT = chunk('IDAT', deflateSync(Buffer.from([0, 200, 30, 30, 255])));
const fcTL = (seq) => chunk('fcTL', Buffer.concat([u32(seq), u32(1), u32(1), u32(0), u32(0), Buffer.from([0, 1, 0, 10, 0, 0])]));
const fdAT = (seq) => chunk('fdAT', Buffer.concat([u32(seq), deflateSync(Buffer.from([0, 0, 0, 0, 255]))]));
const png = (...chunks) => Buffer.concat([PNG_SIG, IHDR, ...chunks, chunk('IEND')]);
const stillPng = png(IDAT);

// GIF: a 1×1 picture with a two-colour table. One frame is its descriptor, its
// code size, its data and the zero that ends it.
const GIF_HEAD = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0]), Buffer.from([0, 0, 0, 255, 255, 255])]);
const GCE = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00]);
const FRAME = Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00]);
const NETSCAPE = Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0'), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])]);
const gif = (...parts) => Buffer.concat([GIF_HEAD, ...parts]);
const TRAILER = Buffer.from([0x3b]);

// WebP: RIFF chunks, little-endian sizes, odd ones padded.
const riffChunk = (type, data) => Buffer.concat([Buffer.from(type), Buffer.from(Uint32Array.of(data.length).buffer), data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
const webp = (...chunks) => { const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]); return Buffer.concat([Buffer.from('RIFF'), Buffer.from(Uint32Array.of(body.length).buffer), body]); };
const VP8 = riffChunk('VP8 ', Buffer.alloc(11, 0x2a));
const vp8x = (flags) => riffChunk('VP8X', Buffer.from([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

console.log('what moves, walked by each format\'s own structure:');

ok('a still GIF, PNG, WebP and a JPEG do not move', () => {
  assert.equal(isAnimated(gif(GCE, FRAME, TRAILER)), false);
  assert.equal(isAnimated(stillPng), false);
  assert.equal(isAnimated(webp(VP8)), false);
  assert.equal(isAnimated(webp(vp8x(0x10), VP8)), false, 'an extended header with only the alpha flag');
  assert.equal(isAnimated(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])), false);
});
ok('a GIF of two frames moves, with or without the loop block', () => {
  assert.equal(isAnimated(gif(GCE, FRAME, GCE, FRAME, TRAILER)), true, 'no NETSCAPE2.0: it plays once and rests on the last frame');
  assert.equal(isAnimated(gif(NETSCAPE, GCE, FRAME, GCE, FRAME, TRAILER)), true);
});
ok('a still GIF that lacks its trailer is still a still; one cut off mid-frame is refused', () => {
  assert.equal(isAnimated(gif(GCE, FRAME)), false);
  assert.equal(isAnimated(gif(GCE, FRAME.subarray(0, 12))), true);
  assert.equal(isAnimated(gif(GCE, Buffer.from([0x99]))), true, 'a block a GIF cannot have');
});
ok('an APNG moves, and so does one whose still is not among its frames', () => {
  assert.equal(isAnimated(png(chunk('acTL', Buffer.concat([u32(1), u32(0)])), fcTL(0), IDAT, fdAT(1))), true);
  assert.equal(isAnimated(png(chunk('acTL', Buffer.concat([u32(1), u32(0)])), IDAT, fcTL(0), fdAT(1))), true,
    'browsers play only the fdAT frame, which nobody screened');
  assert.equal(isAnimated(png(IDAT, fcTL(0))), true, 'an APNG chunk after the still counts too');
});
ok('the letters acTL inside a picture\'s data do not make it move', () => {
  assert.equal(isAnimated(png(chunk('IDAT', Buffer.from('xxacTLxxfcTLxx')))), false);
});
ok('a PNG cut off before IEND is refused', () => {
  assert.equal(isAnimated(stillPng.subarray(0, stillPng.length - 12)), true);
});
ok('an animated WebP moves, by its flag or by its frames', () => {
  assert.equal(isAnimated(webp(vp8x(0x02), riffChunk('ANIM', Buffer.alloc(6)), riffChunk('ANMF', Buffer.alloc(17)))), true);
  assert.equal(isAnimated(webp(vp8x(0x00), riffChunk('ANMF', Buffer.alloc(17)))), true, 'frames without the flag');
});
ok('only GIF, PNG and WebP could move at all, and twelve bytes say which', () => {
  assert.equal(mayAnimate(gif(GCE, FRAME).subarray(0, 12)), 'gif');
  assert.equal(mayAnimate(stillPng.subarray(0, 12)), 'png');
  assert.equal(mayAnimate(webp(VP8).subarray(0, 12)), 'webp');
  assert.equal(mayAnimate(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});

console.log('one byte range, as a player asks:');

ok('Safari\'s first question is answered', () => {
  assert.deepEqual(byteRange('bytes=0-1', 1000), { start: 0, end: 1 });
});
ok('to the end, the last n, and an end past the file', () => {
  assert.deepEqual(byteRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(byteRange('bytes=-300', 1000), { start: 700, end: 999 });
  assert.deepEqual(byteRange('bytes=-5000', 1000), { start: 0, end: 999 });
  assert.deepEqual(byteRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});
ok('past the end, backwards, or the last zero bytes: a 416', () => {
  assert.equal(byteRange('bytes=1000-', 1000), 'unsatisfiable');
  assert.equal(byteRange('bytes=1000-1001', 1000), 'unsatisfiable');
  assert.equal(byteRange('bytes=9-3', 1000), 'unsatisfiable');
  assert.equal(byteRange('bytes=-0', 1000), 'unsatisfiable');
});
ok('no range, several ranges, another unit or garbage: the whole file', () => {
  for (const h of [undefined, '', 'bytes=0-1,5-6', 'items=0-1', 'bytes=-', 'bytes=a-b', 'bytes 0-1']) assert.equal(byteRange(h, 1000), null, String(h));
});

console.log('the two ends hold the same numbers:');

ok('the composer and the server read their limits from one place', () => {
  const social = src('src/social.js');
  assert.match(social, /import \{ MEDIA_CAPS, MAX_MEDIA, POST_BODY_MAX, POST_TOO_LARGE, ANIMATED, tooLarge \} from '\.\/media-rules\.mjs';/);
  assert.ok(!/MAX_SOLO_VIDEO_SECONDS|ten minutes|const MAX_MEDIA = /.test(social), 'no ten-minute promise, no second copy of the count');
  assert.match(social, /else if \(file\.size > MEDIA_CAPS\[kind\]\) \{ said = tooLarge\(kind\); continue; \}/);
  assert.match(social, /\$\('compose-status'\)\.textContent = said;/, 'a refusal stays on screen');
  const media = src('media.mjs');
  assert.match(media, /import \{ MEDIA_CAPS, tooLarge, isAnimated, ANIMATED \} from '\.\/src\/media-rules\.mjs';/);
  assert.match(media, /const CAP_OF = MEDIA_CAPS;/);
  const server = src('server.mjs');
  assert.match(server, /const b = await readJsonBody\(req, POST_BODY_MAX\);/);
  assert.match(server, /b\.media\.slice\(0, MAX_MEDIA\)/);
  assert.equal((server.match(/= await readJsonBody\(req, BRAIN_BODY_MAX\);/g) || []).length, 2, 'both brain routes');
  assert.equal(MAX_MEDIA, 20);
});
ok('the largest file the composer takes fits in a post, and a picture fits the judge', () => {
  assert.ok(Math.ceil(MEDIA_CAPS.video / 3) * 4 + 200 * 1024 < POST_BODY_MAX, 'one whole clip and its poster');
  // Anthropic refuses an image over 5MB of base64; attachImage drops one over 6M characters
  assert.ok(Math.ceil(MEDIA_CAPS.image / 3) * 4 <= 5 * MB);
  assert.match(src('server.mjs'), /image\.length > 6_000_000/);
});
ok('a chat picture leaves the turn room for its conversation', () => {
  assert.ok(CHAT_IMAGE_MAX <= BRAIN_BODY_MAX * 0.7, `${CHAT_IMAGE_MAX} of ${BRAIN_BODY_MAX}`);
  const main = src('src/main.js');
  const read = main.slice(main.indexOf('async function readImageFile'), main.indexOf("$('chat-upload')"));
  assert.match(read, /Math\.ceil\(file\.size \/ 3\) \* 4 > CHAT_IMAGE_MAX/);
  assert.match(read, /shrinkPicture\(file, \{ side: 1568, maxBytes: Math\.floor\(\(CHAT_IMAGE_MAX \* 3\) \/ 4\) \}\)/);
  assert.ok(!/3 \* 1024 \* 1024/.test(read), 'the old 3MB gate is gone');
  assert.match(main, /respondStream\(text, \{ \.\.\.cb, image, attached: !!attachedImage,/);
  const brain = src('src/brain.js');
  assert.match(brain, /if \(attached && new Blob\(\[JSON\.stringify\(body\)\]\)\.size > BRAIN_BODY_MAX\) \{/);
  // the words come back to the box when nothing was sent, as for 'offline'
  assert.match(main, /unsent: !!result\?\.unsent,/, 'runReply carries it back to handle()');
  assert.match(main, /if \(\(r\?\.why === 'offline' \|\| r\?\.unsent\) && !priv && text && !text\.startsWith\('\('\)\) \{/);
});

// --- the chat's turn, with the network stubbed ---------------------------------
console.log('a picture attached to the chat is sent, or the person is told:');
{
  globalThis.localStorage = { getItem: (k) => (k === 'y3k.brain' ? JSON.stringify({ provider: 'anthropic', key: 'sk-ant-x', model: null }) : null), setItem() {}, removeItem() {} };
  const realFetch = globalThis.fetch;
  const sent = [];
  // The stream is turned away with nothing the page can name (a reason the
  // server could not give), which is the case brain.js asks again without
  // streaming; the second route answers.
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (String(url) === '/api/brain/stream') return new Response('{"error":"internal error"}', { status: 500, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ available: true, mood: 'calm', speech: '[calm] A harbour.' }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const brain = await import('../src/brain.js');
    const picture = 'A'.repeat(600_000);
    await check('an attached picture rides the fallback too, not only the stream', async () => {
      sent.length = 0;
      const r = await brain.respondStream('what is this?', { image: picture, attached: true });
      assert.equal(r.speech, 'A harbour.');
      assert.deepEqual(sent.map((s) => s.url), ['/api/brain/stream', '/api/brain']);
      assert.equal(sent[1].body.image, picture, 'the second route was sent words alone');
    });
    await check('a camera frame does not (it is the room looking, not a picture someone sent)', async () => {
      sent.length = 0;
      await brain.respondStream('and now?', { image: 'B'.repeat(1000), attached: false });
      assert.equal(sent[1].body.image, undefined);
    });
    await check('a picture that does not fit beside the conversation is not sent, and the person is told', async () => {
      sent.length = 0;
      const r = await brain.respondStream('this one?', { image: 'C'.repeat(BRAIN_BODY_MAX), attached: true });
      assert.equal(sent.length, 0, 'nothing went out');
      assert.equal(r.speech, brain.PICTURE_TOO_LARGE);
      assert.ok(r.local && r.notice && r.unsent, JSON.stringify({ ...r, speech: undefined }));
    });
  } finally { globalThis.fetch = realFetch; delete globalThis.localStorage; }
}

ok('the posts route asks everything it can before it reads, and looks before it pays', () => {
  const server = src('server.mjs');
  const route = server.slice(server.indexOf("if (req.method === 'POST' && reqPath === '/api/posts') {"), server.indexOf('// ===== Chess'));
  const at = (s) => { const i = route.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('if (declared > POST_BODY_MAX)') < at('readJsonBody('));
  assert.ok(at('slot = takeUpload(user.id') < at('readJsonBody('));
  assert.ok(at('} finally { slot?.release(); }') > at('readJsonBody('));
  assert.ok(at('media.checkMedia(item.data)') < at('moderateImage('), 'every file is checked before the first screening call');
  assert.ok(at('media.roomFor(user.id, incoming.length, total)') < at('moderateImage('));
});
ok('the request timeout is the post\'s, and every other route keeps 30s', () => {
  const server = src('server.mjs');
  assert.match(server, /server\.requestTimeout = POST_BODY_MS \+ 30_000;/);
  assert.match(server, /bodyDeadline\(req, req\.method === 'POST' && reqPath === '\/api\/posts' \? POST_BODY_MS : BODY_MS\);/);
  assert.match(server, /const BODY_MS = Number\(process\.env\.BODY_MS\) \|\| 30_000;/);
});

// --- media.mjs on a data folder of its own ---------------------------------------
console.log('the store looks before anyone is paid:');
{
  const DIR = mkdtempSync(join(tmpdir(), 'y3k-media-'));
  process.env.DATA_DIR = DIR;
  const media = await import('../media.mjs');
  const b64 = (buf) => buf.toString('base64');
  const sized = (head, n) => { const b = Buffer.alloc(n, 0x20); head.copy(b); return b; };
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const MP3 = Buffer.from('ID3\x04\0\0\0\0\0\0\0\0');
  try {
    ok('a file over its cap is refused by its kind, in the words the composer uses', () => {
      assert.deepEqual(media.checkMedia(b64(sized(WEBM, MEDIA_CAPS.video + 1))), { error: tooLarge('video') }, 'not "too large or malformed"');
      assert.deepEqual(media.checkMedia(b64(sized(WEBM, 30 * MB))), { error: tooLarge('video') });
      assert.deepEqual(media.checkMedia(b64(sized(MP3, MEDIA_CAPS.audio + 1))), { error: tooLarge('audio') });
      assert.deepEqual(media.checkMedia('data:image/jpeg;base64,' + b64(sized(JPEG, MEDIA_CAPS.image + 1))), { error: tooLarge('image') });
    });
    ok('at its cap it passes, and its size is counted without decoding', () => {
      assert.deepEqual(media.checkMedia(b64(sized(WEBM, MEDIA_CAPS.video))), { ext: 'webm', kind: 'video', bytes: MEDIA_CAPS.video });
      const wrapped = b64(sized(JPEG, 1000)).replace(/(.{76})/g, '$1\n');
      assert.deepEqual(media.checkMedia(wrapped), { ext: 'jpg', kind: 'image', bytes: 1000 }, 'line breaks are not bytes');
    });
    ok('an animated picture is refused, a still one is not', () => {
      assert.deepEqual(media.checkMedia(b64(gif(GCE, FRAME, GCE, FRAME, TRAILER))), { error: ANIMATED });
      assert.deepEqual(media.storeImage('someone', b64(png(chunk('acTL', Buffer.concat([u32(1), u32(0)])), IDAT, fcTL(0), fdAT(1)))), { error: ANIMATED });
      assert.equal(media.checkMedia(b64(stillPng)).kind, 'image');
      const put = media.storeImage('someone', b64(stillPng));
      assert.ok(put.id, JSON.stringify(put));
      const f = media.mediaFile(put.id);
      assert.equal(f.size, stillPng.length);
      assert.equal(f.mime, 'image/png');
      assert.equal(media.mediaFile('not-an-id'), null);
    });
    ok('what is not a file says so', () => {
      assert.equal(media.checkMedia('').error, 'empty file');
      assert.equal(media.checkMedia('%%%%').error, 'bad file data');
      assert.match(media.checkMedia(b64(Buffer.from('just some words, nothing else'))).error, /^unsupported file/);
    });
    ok('an account at its count, or a post past it, is told before it is screened', () => {
      assert.equal(media.roomFor('someone', 1, 10), null);
      assert.equal(media.roomFor('someone', 120, 10), 'you can upload 119 more files');
      assert.equal(media.roomFor('someone', 1, 600 * MB), 'the gallery is full right now');
    });
  } finally { rmSync(DIR, { recursive: true, force: true }); }
}

// --- on a running server --------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// The vision judge, faked inside the server (as in security.test.mjs): every
// picture is safe, and each look is one line in judge.log.
const JUDGE = `
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
const real = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') return real(url, opts);
  appendFileSync(join(process.env.DATA_DIR, 'judge.log'), 'look\\n');
  return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"safe": true, "reason": ""}' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};`;
const data = mkdtempSync(join(tmpdir(), 'y3k-media-run-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(JUDGE).toString('base64')}`, 'server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: data, FOUNDER_PASSWORD: '', ANTHROPIC_API_KEY: '', RENDER: '', BODY_MS: '1500', POST_BODY_MS: '8000' },
});
for (let i = 0; i < 150; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* booting */ } await sleep(150); }
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
async function signup(username) {
  const r = await post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
}
const looks = () => (existsSync(join(data, 'judge.log')) ? readFileSync(join(data, 'judge.log'), 'utf8').trim().split('\n').filter(Boolean).length : 0);
// A request by hand: headers that promise `length` bytes, then only `send` of them.
function partial(path, { cookie, length, send = '' }) {
  return new Promise((resolve) => {
    const out = { status: 0, body: '', closed: false, req: null, at: Date.now() };
    const req = request(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(length), ...(cookie ? { cookie } : {}) } }, (res) => {
      out.status = res.statusCode;
      res.on('data', (c) => { out.body += c; });
      res.on('end', () => resolve(out));
    });
    req.on('error', () => { out.closed = true; resolve(out); });
    req.on('close', () => { out.closed = true; });
    out.req = req;
    req.flushHeaders();
    if (send) req.write(send);
    out.held = req;
  });
}
const SAFE_JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('a harbour at dusk'), Buffer.alloc(32, 0x20)]).toString('base64');
const KEY = 'sk-ant-media-not-a-key';

try {
  const me = await signup('poster');
  const other = await signup('another');
  const third = await signup('athird');

  console.log('a video, played the way Safari plays it:');
  const clip = Buffer.alloc(20000);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(clip);
  for (let i = 4; i < clip.length; i++) clip[i] = i % 251;
  const made = await post('/api/posts', { text: 'a clip', key: KEY, media: [{ kind: 'video', data: clip.toString('base64'), poster: SAFE_JPEG }] }, me).then((r) => r.json());
  assert.equal(made.ok, true, JSON.stringify(made));
  const url = `${base}/media/${made.post.media[0].id}`;

  await check('the whole file says its length, that it takes ranges, and how long to keep it, once', async () => {
    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-length'), String(clip.length));
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    assert.equal(r.headers.get('transfer-encoding'), null, 'not chunked');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable', 'one Cache-Control, not no-cache beside it');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('content-type'), 'video/webm');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(clip));
  });
  await check('bytes 0-1 is a 206 of two bytes', async () => {
    const r = await fetch(url, { headers: { range: 'bytes=0-1' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), `bytes 0-1/${clip.length}`);
    assert.equal(r.headers.get('content-length'), '2');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(clip.subarray(0, 2)));
  });
  await check('a seek into the middle, and the last bytes', async () => {
    const mid = await fetch(url, { headers: { range: 'bytes=10000-10099' } });
    assert.equal(mid.status, 206);
    assert.ok(Buffer.from(await mid.arrayBuffer()).equals(clip.subarray(10000, 10100)));
    const tail = await fetch(url, { headers: { range: 'bytes=-16' } });
    assert.equal(tail.headers.get('content-range'), `bytes ${clip.length - 16}-${clip.length - 1}/${clip.length}`);
    assert.ok(Buffer.from(await tail.arrayBuffer()).equals(clip.subarray(-16)));
  });
  await check('a range past the end is a 416 that says the size', async () => {
    const r = await fetch(url, { headers: { range: `bytes=${clip.length}-` } });
    assert.equal(r.status, 416);
    assert.equal(r.headers.get('content-range'), `bytes */${clip.length}`);
  });
  await check('HEAD says it all and sends nothing; an unknown file is a 404', async () => {
    const r = await fetch(url, { method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-length'), String(clip.length));
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    assert.equal((await fetch(`${base}/media/00000000-0000-0000-0000-000000000000`)).status, 404);
  });

  console.log('a post\'s files are looked at before anyone is paid:');
  const before = looks();
  await check('a clip over 24MB is refused by its size, unscreened, and not called "blocked"', async () => {
    const big = Buffer.alloc(MEDIA_CAPS.video + 1024);
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(big);
    const r = await post('/api/posts', { text: '', key: KEY, media: [{ kind: 'image', data: SAFE_JPEG }, { kind: 'video', data: big.toString('base64'), poster: SAFE_JPEG }] }, me).then((x) => x.json());
    assert.deepEqual(r, { ok: false, reason: tooLarge('video') });
    assert.equal(looks(), before, 'not even the picture before it was screened');
  });
  await check('an animated GIF is refused the same way', async () => {
    const r = await post('/api/posts', { text: '', key: KEY, media: [{ kind: 'image', data: 'data:image/gif;base64,' + gif(NETSCAPE, GCE, FRAME, GCE, FRAME, TRAILER).toString('base64') }] }, me).then((x) => x.json());
    assert.deepEqual(r, { ok: false, reason: ANIMATED });
    assert.equal(looks(), before);
  });
  await check('a body that says it is over 64MB is refused before a byte of it is read', async () => {
    const r = await partial('/api/posts', { cookie: me, length: POST_BODY_MAX + 1 });
    assert.equal(r.status, 413);
    assert.equal(JSON.parse(r.body).reason, POST_TOO_LARGE);
  });

  console.log('uploads in flight:');
  // One account starts a 40MB post and stalls partway.
  const held = partial('/api/posts', { cookie: me, length: 40 * MB, send: '{"text":"' });
  await sleep(300);
  await check('the same account cannot start a second large one meanwhile', async () => {
    const r = await partial('/api/posts', { cookie: me, length: 2 * MB });
    assert.equal(r.status, 429);
    assert.match(JSON.parse(r.body).reason, /still uploading/);
  });
  await check('another account is turned away while the bodies in flight would pass one whole post', async () => {
    const r = await partial('/api/posts', { cookie: other, length: 30 * MB });
    assert.equal(r.status, 429);
    assert.match(JSON.parse(r.body).reason, /busy with other uploads/);
  });
  await check('one that fits beside it goes through, and a small post is never held up', async () => {
    const pad = 'x'.repeat(2 * MB);
    const r = await post('/api/posts', `{"text":"beside it","pad":"${pad}"}`, other).then((x) => x.json());
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.equal((await post('/api/posts', { text: 'small' }, me).then((x) => x.json())).ok, true, 'its own small post, while its large one is in flight');
  });
  await check('a stalled post is cut at its own deadline, and its place is given back', async () => {
    const r = await held;
    assert.ok(r.closed, 'the connection was closed');
    assert.ok(Date.now() - r.at >= 7500, `cut after ${Date.now() - r.at}ms, at the post's deadline, not the 1.5s of other routes`);
    const again = await post('/api/posts', `{"text":"again","pad":"${'y'.repeat(2 * MB)}"}`, me).then((x) => x.json());
    assert.equal(again.ok, true, JSON.stringify(again).slice(0, 200));
  });
  await check('any other route\'s body has its own shorter deadline', async () => {
    const t0 = Date.now();
    const r = await partial('/api/brain/stream', { cookie: third, length: 5000, send: '{"messages":' });
    assert.ok(r.closed && !r.status, 'cut, not answered');
    const took = Date.now() - t0;
    assert.ok(took >= 1300 && took < 7000, `cut after ${took}ms, well before a post's 8s`);
  });
  await check('a post that is slow but steady arrives', async () => {
    const body = Buffer.from(JSON.stringify({ text: 'slowly' }));
    const out = await new Promise((resolve) => {
      const req = request(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(body.length), cookie: third } }, (res) => {
        let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      req.on('error', (e) => resolve({ error: e.message }));
      req.flushHeaders();
      let i = 0;
      const drip = setInterval(() => { req.write(body.subarray(i, i + 2)); i += 2; if (i >= body.length) { clearInterval(drip); req.end(); } }, 2500 / (body.length / 2));
    });
    assert.equal(out.status, 200, JSON.stringify(out));
    assert.equal(JSON.parse(out.body).ok, true);
  });
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); }
  rmSync(data, { recursive: true, force: true });
}

console.log(`\n${passed} passed`);
