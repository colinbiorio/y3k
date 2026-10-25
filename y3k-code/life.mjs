// LIFE, ON THIS COMPUTER. Colin, 2026-10-20: "add it as a new glyph on
// yearthreethousand.com ... add your new mode with name 'life' on the top
// right." What "it" is: lucid (~/y3k-code/lucid), a life inside a dreamed
// world. Claude, on the person's own Claude sign-in, looks at a picture that
// SD-Turbo dreamed and chooses what to do; the next picture is dreamed from
// that choice. y3kode runs it here (`lucid.py --serve`, one line of JSON per
// moment) and hands the page what lucid's own window would show.
//
// THE LINES IT KEEPS
//  - Local only, like everything y3kode does: lucid runs on this computer, the
//    page asks this engine how the life is (life.state), and this engine sends
//    nothing about it to yearthreethousand.com. (The page sends each moment's
//    words to the presence's own journal there, never the picture: src/life.js,
//    2026-10-21.)
//  - Asked first, on this computer (consent 'life.run', a native dialog in the
//    y3k app), once each time y3kode starts: a life thinks on the person's
//    plan about once every few seconds while it runs, and dreams on this
//    computer's graphics chip.
//  - Its own sign-in, never a key: the brain is started without any
//    ANTHROPIC_API_KEY in its environment, so a life never bills a key it
//    happened to find (claudeEnv, subscription).
//  - It rests when nobody watches: if no page has asked how it is for
//    IDLE_MS, it is stopped. A life running all night on someone's plan,
//    unseen, would be no gift.
//  - What reaches it is what lucid's window allows: the mode, a move, a line
//    spoken to it, the pace, stop.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnChild, stopChild, ndjson } from './proc.mjs';
import { claudeEnv } from './adapters/claude.mjs';

export const IDLE_MS = 10 * 60 * 1000;
export const MOVES = ['forward', 'back', 'left', 'right', 'up', 'down', 'stay'];
const LOG_LINES = 12;
const MAX_FRAME = 2 * 1024 * 1024;   // a 512px JPEG is ~60KB; anything near this is not a picture

// Where lucid is: Y3K_LUCID, else the folder y3kode was told (config.life.dir),
// else ~/y3k-code/lucid; and whether it can run (its venv's Python and its script).
export function lucidAt({ env = process.env, config = {}, home = homedir(), platform = process.platform } = {}) {
  const dir = env.Y3K_LUCID || config?.life?.dir || join(home, 'y3k-code', 'lucid');
  const python = platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python');
  const script = join(dir, 'lucid.py');
  return { dir, python, script, installed: existsSync(python) && existsSync(script) };
}

// One command from the page, checked against what lucid's window allows. → the
// line to send, or null.
export function lineFor(c) {
  if (!c || typeof c !== 'object') return null;
  switch (c.do) {
    case 'toggle': return { do: 'toggle' };
    // (`to` from the page: the protocol keeps `mode` for kode's permission modes)
    case 'mode': return c.to === 'human' || c.to === 'autonomous' ? { do: 'mode', mode: c.to } : null;
    case 'move': return MOVES.includes(c.move) ? { do: 'move', move: c.move } : null;
    case 'say': {
      const text = typeof c.text === 'string' ? c.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 500) : '';
      return text ? { do: 'say', text } : null;
    }
    case 'pace': return Number.isFinite(c.delta) && c.delta !== 0 ? { do: 'pace', delta: Math.max(-5, Math.min(5, c.delta)) } : null;
    default: return null;
  }
}

// Y3K_LUCID_ARGS: lucid's own flags, for a computer that wants them (`--dream
// none` with no graphics chip to dream on, `--effort medium`) or a test that
// must not touch the real life (`--brain scripted --life /tmp/x`). Set in the
// environment y3kode starts in, so only the person at the computer sets it.
// Words only: no shell, so nothing in it can do anything but be an argument.
export function extraArgs(env = process.env) {
  return String(env.Y3K_LUCID_ARGS || '').split(/\s+/).filter((a) => /^[\w./~=:-]{1,200}$/.test(a)).slice(0, 20);
}

export function createLife({ ask, audit, env = process.env, config = () => ({}), spawn = spawnChild, now = () => Date.now(), every = setInterval, clear = clearInterval, idleMs = IDLE_MS } = {}) {
  let child = null;
  let hello = null;          // lucid's first line: where the life is kept, its moment, brain, mode
  let moment = null;         // the newest moment, as the window would draw it (no picture)
  let frame = null;          // the newest picture, base64 JPEG
  let frameN = 0;            // how many pictures have come, so a page asks only for a new one
  let log = [];              // stderr's last lines, for when it stops on its own
  let ended = null;          // how the last run ended: { code, why }
  let lastSeen = 0;
  let allowed = false;       // asked on this computer, once each time y3kode starts
  let asking = null;

  const at = () => lucidAt({ env, config: config() });
  const running = () => !!child && child.exitCode == null && child.signalCode == null;

  // the watchdog: a life nobody has looked at for idleMs rests
  const watch = every(() => {
    if (running() && now() - lastSeen > idleMs) stop('it rested when nobody was watching');
  }, Math.min(30000, idleMs));
  watch.unref?.();

  function status() {
    const where = at();
    return { ok: true, installed: where.installed, running: running(), dir: where.dir, ...(ended && !running() ? { ended } : {}) };
  }

  // Where the life publishes (lucid's life/publish.json): the site the page came
  // from, with the key the site made for the account. Only https, or a local
  // server; only a key of the site's shape. Nothing else is ever written there.
  function publishFile(where, publish) {
    const file = join(where.dir, 'life', 'publish.json');
    const to = typeof publish?.to === 'string' ? publish.to.replace(/\/+$/, '') : '';
    const key = typeof publish?.key === 'string' ? publish.key : '';
    const okTo = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(to) || /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(to);
    if (!okTo || !/^y3kl_[0-9a-f]{48}$/.test(key)) return false;
    mkdirSync(join(where.dir, 'life'), { recursive: true });
    writeFileSync(file, JSON.stringify({ to, key }));
    return true;
  }

  async function start({ fresh = false, publish = null } = {}) {
    const where = at();
    if (!where.installed) return { ok: false, code: 'not-installed', error: `lucid is not on this computer (looked in ${where.dir}).`, dir: where.dir };
    if (running()) { lastSeen = now(); return { ok: true, running: true }; }
    if (!allowed) {
      if (!asking) asking = Promise.resolve(ask('life.run', {})).finally(() => { asking = null; });
      if (!(await asking)) return { ok: false, code: 'declined', error: 'Not allowed on the computer.' };
      allowed = true;
    }
    if (running()) return { ok: true, running: true };   // two pages asked at once
    hello = null; moment = null; frame = null; log = []; ended = null;
    let published = false;
    if (publish) { try { published = publishFile(where, publish); } catch { published = false; } }
    const args = [where.script, '--serve', ...extraArgs(env), ...(fresh ? ['--new'] : [])];
    child = spawn(where.python, args, { cwd: where.dir, env: claudeEnv(env, { auth: 'subscription' }) });
    lastSeen = now();
    audit?.write('life.start', { dir: where.dir, fresh: !!fresh, published });
    const me = child;
    ndjson(me.stdout, (v) => {
      if (me !== child || !v || typeof v !== 'object') return;
      if (v.type === 'hello') hello = { life: String(v.life || ''), moment: v.moment | 0, brain: String(v.brain || ''), mode: v.mode === 'human' ? 'human' : 'autonomous', pace: Number(v.pace) || null };
      else if (v.type === 'moment') {
        const { frame: pic, type, ...rest } = v;
        moment = rest;
        if (typeof pic === 'string' && pic.length < MAX_FRAME) { frame = pic; frameN += 1; }
      }
    });
    me.stderr?.setEncoding('utf8').on('data', (d) => {
      log = log.concat(String(d).split('\n').filter((l) => l.trim())).slice(-LOG_LINES);
    });
    me.once('exit', (code, signal) => {
      if (me !== child) return;
      ended = ended || { code: code ?? null, why: signal ? `lucid was stopped (${signal})` : code === 0 ? 'it rested' : `lucid stopped on its own (exit ${code})` };
      audit?.write('life.end', ended);
    });
    me.once('error', (err) => { if (me === child) ended = { code: null, why: `could not start lucid: ${err.message}` }; });
    return { ok: true, running: true };
  }

  // What the page shows: the newest moment, and the picture only when it is
  // newer than the one the page has (since). Asking is also being seen.
  function state({ since = -1 } = {}) {
    lastSeen = now();
    const s = status();
    const out = { ...s, frameN, ...(hello ? { hello } : {}), ...(moment ? { moment } : {}) };
    if (frame && frameN > since) out.frame = frame;
    if (!s.running && log.length) out.log = log;
    return out;
  }

  function act(c) {
    if (!running()) return { ok: false, code: 'not-running', error: 'The life is not running.' };
    const line = lineFor(c);
    if (!line) return { ok: false, code: 'invalid', error: 'Not something the life can be asked.' };
    try { child.stdin.write(JSON.stringify(line) + '\n'); } catch { return { ok: false, code: 'gone', error: 'The life is not listening.' }; }
    lastSeen = now();
    audit?.write('life.do', { do: line.do, ...(line.move ? { move: line.move } : {}), ...(line.mode ? { mode: line.mode } : {}), ...(line.text ? { chars: line.text.length } : {}) });
    return { ok: true };
  }

  // a life lived by another process on this computer (lucid --live, the door,
  // which holds life/lock with its pid): told to stop the way its own hand
  // would, through life/door.json; nothing is killed
  function stopThroughTheDoor(why) {
    const where = at();
    let pid = 0;
    try { pid = parseInt(readFileSync(join(where.dir, 'life', 'lock'), 'utf8'), 10); } catch { return false; }
    if (!pid) return false;
    try { process.kill(pid, 0); } catch { return false; }   // a stale lock is nobody
    try { writeFileSync(join(where.dir, 'life', 'door.json'), JSON.stringify({ who: 'stop', since: Date.now() / 1000, by: 'y3kode', why })); } catch { return false; }
    audit?.write('life.stop', { why, door: true });
    return true;
  }

  function stop(why = 'you let it rest') {
    if (!running()) return { ok: true, running: false, ...(stopThroughTheDoor(why) ? { door: true } : {}) };
    ended = { code: null, why };
    // asked first, the way lucid's window is closed; forced only if it has not
    // gone a few seconds later (a dream mid-step finishes; the life is saved
    // as it goes either way)
    const me = child;
    try { me.stdin.write(JSON.stringify({ do: 'stop' }) + '\n'); me.stdin.end(); } catch { /* gone */ }
    const force = setTimeout(() => { if (me.exitCode == null && me.signalCode == null) stopChild(me, 4000); }, 6000);
    force.unref?.();
    audit?.write('life.stop', { why });
    return { ok: true, running: false };
  }

  function dispose() { clear(watch); stop('y3kode stopped'); }

  return { status, start, state, act, stop, dispose };
}
