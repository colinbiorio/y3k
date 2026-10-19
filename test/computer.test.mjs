// YOUR ORB, USING YOUR COMPUTER (2026-10-19). The engine's verbs
// (y3k-code/computer.mjs) and the page's loop (src/computer.js), with every
// outside thing faked: no screen is captured and no key is pressed here.
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComputer, checkAction, parseKey, script, ACTIONS, MAX_TYPE, IDLE_MS } from '../y3k-code/computer.mjs';
import { createComputerUse, goalOf } from '../src/computer.js';
import { COMMANDS, EVENTS } from '../y3k-code/protocol.mjs';
import { KINDS, describe } from '../y3k-code/consent.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const SHOT = { w: 1280, h: 720, screenW: 1920, screenH: 1080 };

await ok('one language: the commands, events and the question are known to the engine', () => {
  for (const c of ['computer.status', 'computer.look', 'computer.act', 'computer.stop']) assert.ok(COMMANDS[c], c);
  for (const e of ['computer.action', 'computer.stopped']) assert.ok(EVENTS.includes(e), e);
  assert.ok(KINDS.includes('computer.control'));
  assert.match(describe('computer.control'), /Esc/);
});

await ok('an action is checked against the last picture, and its position becomes screen points', () => {
  assert.match(checkAction({ action: 'fly' }, SHOT).error, /Unknown action/);
  assert.match(checkAction({ action: 'click', x: 10, y: 10 }, null).error, /Look first/);
  assert.match(checkAction({ action: 'click', x: 2000, y: 10 }, SHOT).error, /not on the picture/);
  const c = checkAction({ action: 'click', x: 640, y: 360, label: 'Send\u0007' }, SHOT).action;
  assert.deepEqual([c.x, c.y], [960, 540]);
  assert.equal(c.label, 'Send ');
  assert.match(checkAction({ action: 'type', text: 'x'.repeat(MAX_TYPE + 1) }, SHOT).error, /At most/);
  assert.match(checkAction({ action: 'scroll', x: 1, y: 1, dy: 99 }, SHOT).error, /Scroll by/);
  assert.match(checkAction({ action: 'key', key: 'hyper+q' }, SHOT).error, /A key like/);
});

await ok('keys: named keys, characters and modifiers, nothing else', () => {
  assert.deepEqual(parseKey('return'), { code: 36, using: [] });
  assert.deepEqual(parseKey('cmd+t'), { char: 't', using: ['command down'] });
  assert.deepEqual(parseKey('cmd+shift+tab'), { code: 48, using: ['command down', 'shift down'] });
  assert.equal(parseKey('rm -rf'), null);
  assert.equal(parseKey(''), null);
});

await ok('the script for each action is CoreGraphics or System Events, and text is quoted, never spliced', () => {
  const c = script(checkAction({ action: 'double', x: 10, y: 10 }, SHOT).action);
  assert.match(c, /CGEventCreateMouseEvent/);
  assert.equal((c.match(/CGEventPost/g) || []).length, 5, 'move, down, up, down, up');
  const t = script(checkAction({ action: 'type', text: '"); doShellScript("rm' }, SHOT).action);
  assert.equal(t, `Application('System Events').keystroke(${JSON.stringify('"); doShellScript("rm')});`);
  for (const a of ACTIONS) assert.ok(typeof script({ action: a, x: 1, y: 1, dy: 1, text: 'a', parsed: { code: 36, using: [] } }) === 'string');
});

const fakeRun = (log) => async (bin, args) => {
  log.push([bin, ...args].join(' ').slice(0, 80));
  if (bin === 'sips' && args.includes('pixelWidth')) return { code: 0, stdout: 'pixelWidth: 1280\npixelHeight: 720\n', stderr: '' };
  if (bin === 'osascript' && String(args[3]).includes('NSScreen')) return { code: 0, stdout: '{"w":1920,"h":1080}\n', stderr: '' };
  if (bin === 'screencapture') { const { writeFileSync } = await import('node:fs'); writeFileSync(args.at(-1), 'jpegbytes'); }
  return { code: 0, stdout: '', stderr: '' };
};

await ok('nothing happens until the computer says yes, and the yes is asked once, then again after idling', async () => {
  const events = [], log = [];
  let asked = 0, answer = false, t = 1000;
  const c = createComputer({ ask: async () => { asked += 1; return answer; }, emit: (e) => events.push(e), tmpDir: mkdtempSync(join(tmpdir(), 'cmp-')), os: 'darwin', runner: fakeRun(log), now: () => t, wait: async () => {} });
  const no = await c.look();
  assert.equal(no.code, 'declined');
  assert.equal(log.length, 0, 'nothing ran on a no');
  answer = true;
  const yes = await c.look();
  assert.equal(yes.ok, true);
  assert.equal(yes.image, Buffer.from('jpegbytes').toString('base64'));
  await c.act({ action: 'click', x: 640, y: 360, label: 'Send' });
  assert.equal(asked, 2, 'asked again only after the no');
  const shown = events.find((e) => e.type === 'computer.action');
  assert.deepEqual([shown.action, shown.x, shown.y, shown.label], ['click', 960, 540, 'Send']);
  t += IDLE_MS + 1;
  await c.act({ action: 'move', x: 1, y: 1 });
  assert.equal(asked, 3, 'an idle yes is asked again');
});

await ok('stop is immediate and sticky, and other systems are told plainly', async () => {
  const events = [];
  const c = createComputer({ ask: async () => true, emit: (e) => events.push(e), tmpDir: mkdtempSync(join(tmpdir(), 'cmp-')), os: 'darwin', runner: fakeRun([]), wait: async () => {} });
  await c.look();
  c.stop();
  assert.ok(events.some((e) => e.type === 'computer.stopped'));
  assert.equal((await c.act({ action: 'click', x: 1, y: 1 })).code, 'stopped');
  const w = createComputer({ ask: async () => true, emit: () => {}, tmpDir: tmpdir(), os: 'win32' });
  assert.equal((await w.look()).code, 'unsupported');
});

await ok('the page: "do:" and "use my computer to" start it; ordinary sentences do not', () => {
  assert.equal(goalOf('do: open my calendar'), 'open my calendar');
  assert.equal(goalOf('please use my computer to play jazz'), 'play jazz');
  assert.equal(goalOf('do you like jazz?'), null);
  assert.equal(goalOf('I do: sometimes'), null);
});

const pageWith = (steps, { status = { ok: true, able: true } } = {}) => {
  const cmds = [], said = [];
  const cmd = async (o) => { cmds.push(o.cmd); if (o.cmd === 'computer.status') return status; if (o.cmd === 'computer.look') return { ok: true, image: 'img', w: 1280, h: 720 }; return { ok: true }; };
  const fetchFn = async () => ({ json: async () => ({ ok: true, step: steps.shift() }) });
  return { cmds, said, use: createComputerUse({ cmd, fetchFn, onSay: (s) => said.push(s) }) };
};

await ok('the loop: look, think, act, until it is done, and it says what it does', async () => {
  const p = pageWith([{ action: 'click', x: 1, y: 2, label: 'Calendar', say: 'opening your calendar' }, { action: 'done', say: 'it is open' }]);
  const r = await p.use.run('open my calendar');
  assert.equal(r.done, true);
  assert.deepEqual(p.cmds, ['computer.status', 'computer.look', 'computer.act', 'computer.look']);
  assert.deepEqual(p.said, ['opening your calendar', 'it is open']);
});

await ok('the loop stops when the presence asks, and when there is no y3kode or no Mac', async () => {
  const a = pageWith([{ action: 'ask', say: 'which account?' }]);
  assert.equal((await a.use.run('send it')).asked, true);
  assert.ok(!a.cmds.includes('computer.act'), 'an ask acts on nothing');
  const off = pageWith([], { status: { ok: false, code: 'offline' } });
  await off.use.run('x');
  assert.match(off.said[0], /y3k app/);
  const pc = pageWith([], { status: { ok: true, able: false } });
  await pc.use.run('x');
  assert.match(pc.said[0], /macOS/);
});

console.log(`\n${passed} checks passed.`);
