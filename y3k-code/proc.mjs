// Running the vendors' own command-line tools: finding them, giving them the
// person's environment (and nothing that is not theirs), reading their
// line-by-line output, and making sure none is ever left running.
//
// Generalised from local-claude-code.mjs, which keeps its own copy: the orb's
// bridge runs with every tool removed and is audited separately, and changes
// here must never loosen it.

import { spawn, execFile } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join } from 'node:path';

const IS_WIN = platform() === 'win32';

// Where each vendor's installer puts its binary, beyond PATH. An app started from
// the Dock gets a minimal PATH, so these are checked too.
export function candidateDirs(env = process.env) {
  const home = homedir();
  const dirs = [
    join(home, '.local', 'bin'), join(home, '.claude', 'local'), join(home, '.opencode', 'bin'),
    join(home, '.npm-global', 'bin'), join(home, '.bun', 'bin'), join(home, '.volta', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin',
  ];
  if (IS_WIN) dirs.push(join(env.APPDATA || '', 'npm'), join(env.LOCALAPPDATA || '', 'Programs'));
  return dirs;
}

// The absolute path of a binary, or null. `override` (from config) wins.
export function resolveBin(name, { env = process.env, override } = {}) {
  if (override) return existsSync(override) ? override : null;
  const exts = IS_WIN ? ['.exe', '.cmd', ''] : [''];
  const dirs = [...String(env.PATH || '').split(delimiter).filter(Boolean), ...candidateDirs(env)];
  for (const d of dirs) for (const x of exts) {
    const p = join(d, name + x);
    if (existsSync(p)) return p;
  }
  return null;
}

// Variables that tie a process to ANOTHER Claude Code session (the one the engine
// itself might be running inside, e.g. while it is being developed). A coding
// session must be its own, so these never reach a child.
const PARENT_SESSION = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_SESSION_INGRESS_TOKEN_FILE|CLAUDE_CODE_(SESSION_ID|REMOTE\w*|CHILD_SESSION|MESSAGING_\w+|ENTRYPOINT|CONTAINER_ID|WORKER_EPOCH|TEE_SDK_STDOUT|DIAGNOSTICS_FILE|SYNC_\w+|POST_FOR_SESSION_INGRESS\w*|USE_CCR_V2|ENVIRONMENT_RUNNER_VERSION|PROVIDER_MANAGED_BY_HOST|HOLD_UNANSWERED_PARKED_PERMISSION|BG_TASKS_REPORT_RUNNING|ARTIFACT_\w+|SESSION_ATTENDED|ACCOUNT_UUID|ORGANIZATION_UUID|USER_EMAIL))$/;

// The person's own environment for a vendor child, minus anything belonging to
// a parent session, minus `drop`, plus `set`. Keys for OTHER providers are
// removed by the adapter, which knows which ones are its own.
export function childEnv(base = process.env, { drop = [], dropPattern = null, set = {} } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (PARENT_SESSION.test(k)) continue;
    if (dropPattern && dropPattern.test(k)) continue;
    env[k] = v;
  }
  for (const k of drop) delete env[k];
  for (const [k, v] of Object.entries(set)) if (v != null) env[k] = String(v);
  return env;
}

// Every child still running, so none outlives the engine.
const live = new Set();
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.once(sig, reapAll);
}
export function reapAll() {
  for (const c of live) killTree(c, 'SIGKILL');
  live.clear();
}
export const liveCount = () => live.size;

// Spawned in its own process group (POSIX) so a whole tree — the CLI and
// anything it started — can be stopped at once.
export function spawnChild(bin, args, { cwd, env, stdio = ['pipe', 'pipe', 'pipe'] } = {}) {
  hook();
  const child = spawn(bin, args, { cwd, env, stdio, detached: !IS_WIN, windowsHide: true });
  live.add(child);
  child.once('exit', () => live.delete(child));
  child.once('error', () => live.delete(child));
  child.stdin?.on('error', () => {}); // a child that exits early must not crash the engine with EPIPE
  return child;
}

export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  try {
    if (IS_WIN) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
    else process.kill(-child.pid, signal);
  } catch { try { child.kill(signal); } catch { /* already gone */ } }
}

// SIGTERM, then SIGKILL if it has not closed in `ms`.
export function stopChild(child, ms = 5000) {
  if (!child || child.exitCode != null) return;
  killTree(child, 'SIGTERM');
  const t = setTimeout(() => killTree(child, 'SIGKILL'), ms);
  t.unref?.();
  child.once('exit', () => clearTimeout(t));
}

// One JSON value per line from a stream; broken lines are skipped, split UTF-8
// sequences are handled by setEncoding.
export function ndjson(stream, onValue, onBadLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let v;
      try { v = JSON.parse(line); } catch { onBadLine?.(line); continue; }
      onValue(v);
    }
  });
  stream.on('end', () => {
    const line = buf.trim();
    buf = '';
    if (!line) return;
    try { onValue(JSON.parse(line)); } catch { onBadLine?.(line); }
  });
}

// A private file for text that must not go on the command line (argv is
// readable by every process on the machine). Returns { path, remove }.
export function tempFile(dir, name, text) {
  const d = mkdtempSync(join(dir, 'f-'));
  const path = join(d, name);
  writeFileSync(path, text, { mode: 0o600 });
  return { path, remove: () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } };
}

// Run a short command to completion; resolves { code, stdout, stderr }.
export function run(bin, args, { cwd, env, timeout = 20000, input } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(bin, args, { cwd, env, windowsHide: true });
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: String(err?.message || err) });
    }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeout);
    child.stdout.setEncoding('utf8').on('data', (d) => { if (stdout.length < 4e6) stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 1e5) stderr += d; });
    child.on('error', (err) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(err?.message || err) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}
