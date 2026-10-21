// THE WHOLE SUITE, IN ONE SITTING. Every test/*.test.mjs, each in a node
// process of its own, a few at a time. The suite used to be one `&&` chain in
// package.json: one file at a time, and the first red file hid every file
// after it. This runs them all, says each file's verdict as it lands, and ends
// with the slowest files and every failure's own output, so one run shows
// everything that is wrong.
//
//   npm test                        every file, half this computer's cores at a time
//   npm test -- world               only the files whose names hold "world"
//   npm test -- world.test.mjs      just that file (node test/world.test.mjs works too)
//   npm run test:serial             one file at a time, each one's output as it runs
//   TEST_JOBS=8 npm test            eight at a time (or: npm test -- --jobs 8)
//   TEST_TIMEOUT=600 npm test       how long one file may run, in seconds
//
// A new test file is found by its name alone, test/<name>.test.mjs: there is
// no list to add it to.
//
// Each file runs in its own process group, and whatever it leaves behind when
// it ends is stopped. A file that threw before its `finally` used to leave its
// server.mjs running for good (three were still listening nine days later).
// No dependencies, Node 20.6 and up, like the server.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = join(ROOT, 'test');
// Process groups are how a file's leftovers are found; Windows has none, so
// there only the file itself can be stopped.
const GROUPS = process.platform !== 'win32';

// --- what to run -------------------------------------------------------------

const HELP = `usage: npm test -- [name ...] [--jobs N] [--timeout S] [--verbose] [--list]

  name          run only the files whose names hold it ("world", "code-"),
                or exactly the one named ("world.test.mjs", "test/world.test.mjs")
  --jobs, -j    how many files at a time (TEST_JOBS; default half the cores)
  --timeout     seconds one file may run before it is stopped (TEST_TIMEOUT; 300)
  --verbose, -v every file's output, not only the failures'
  --list        print the files that would run, and run nothing`;

const args = process.argv.slice(2);
const opt = { jobs: process.env.TEST_JOBS, timeout: process.env.TEST_TIMEOUT, verbose: false, list: false, names: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i]);
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '-v' || a === '--verbose') opt.verbose = true;
  else if (a === '--list') opt.list = true;
  else if (a === '-j' || a.startsWith('--jobs')) opt.jobs = value();
  else if (/^-j\d+$/.test(a)) opt.jobs = a.slice(2);
  else if (a.startsWith('--timeout')) opt.timeout = value();
  else if (a.startsWith('-')) { console.error(`unknown option ${a}\n\n${HELP}`); process.exit(2); }
  else opt.names.push(a);
}
const whole = (n, what) => {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) { console.error(`${what} must be a whole number above 0, not "${n}"`); process.exit(2); }
  return v;
};
const JOBS = opt.jobs == null || opt.jobs === '' ? Math.max(1, Math.floor(availableParallelism() / 2)) : whole(opt.jobs, 'TEST_JOBS / --jobs');
const TIMEOUT_MS = (opt.timeout == null || opt.timeout === '' ? 300 : whole(opt.timeout, 'TEST_TIMEOUT / --timeout')) * 1000;

const every = readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.mjs')).sort();
// A name that is a whole file name picks that one file; any other name picks
// every file it appears in.
const picked = (f) => opt.names.length === 0 || opt.names.some((n) => {
  const b = basename(n);
  return b.endsWith('.mjs') ? f === b : f.includes(b);
});
const files = every.filter(picked);
if (!files.length) {
  console.error(`no test file matches ${opt.names.map((n) => `"${n}"`).join(' or ')} (${every.length} in test/)`);
  process.exit(1);
}
if (opt.list) { for (const f of files) console.log('test/' + f); process.exit(0); }

// The longest files start first, so the run is not left waiting on one that
// began last. How long each took is kept from the last run in the system's
// temp folder; a file with no time yet goes by its size.
const TIMES = join(tmpdir(), 'y3k-test-times.json');
let before = {};
try { before = JSON.parse(readFileSync(TIMES, 'utf8')); } catch { /* the first run here */ }
const guess = (f) => before[f] ?? statSync(join(TEST_DIR, f)).size / 1000;
const queue = files.slice().sort((a, b) => guess(b) - guess(a));
const AT_ONCE = Math.min(JOBS, files.length);
// One file at a time, its output is shown as it runs, the way the old chain
// showed it; side by side, each file's output is held until it ends.
const LIVE = AT_ONCE === 1;

// --- running one file --------------------------------------------------------

const running = new Map();   // pid -> child
const groupAlive = (pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } };
const stop = (child, signal = 'SIGKILL') => {
  try { if (GROUPS) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* already gone */ }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runFile(file) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const out = [];
    let timedOut = false;
    let exit = null;
    let settled = false;
    const child = spawn(process.execPath, [join('test', file)], {
      cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: GROUPS,
    });
    running.set(child.pid, child);
    const take = (into) => (b) => { out.push(b); if (LIVE) into.write(b); };
    child.stdout.on('data', take(process.stdout));
    child.stderr.on('data', take(process.stderr));
    const timer = setTimeout(() => { timedOut = true; stop(child); }, TIMEOUT_MS);
    const done = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const ms = performance.now() - t0;
      // Anything still in its group is something the file started and did not
      // stop: given a moment to finish going (a server sent SIGTERM just before
      // the file exited), then stopped.
      let left = false;
      if (GROUPS && child.pid) {
        for (let i = 0; i < 20 && groupAlive(child.pid); i++) await sleep(50);
        if (groupAlive(child.pid)) { left = true; stop(child); }
      }
      running.delete(child.pid);
      resolve({ file, ms, out: Buffer.concat(out).toString('utf8'), timedOut, left, code: null, signal: null, ...exit });
    };
    child.on('error', (err) => { out.push(Buffer.from(String(err.stack || err) + '\n')); done(); });
    // 'exit', not 'close': a leftover holding the file's stdout would keep
    // 'close' from ever coming, and the run would wait on it for good. What the
    // file wrote last may still be in its pipes, so 'close' gets a second.
    child.on('exit', (code, signal) => {
      exit = { code, signal };
      const wait = setTimeout(done, 1000);
      child.once('close', () => { clearTimeout(wait); done(); });
    });
  });
}

// --- the run -----------------------------------------------------------------

const sec = (ms) => (ms / 1000).toFixed(2) + ' s';
// every file ends by saying how many of its checks passed: "212 checks passed."
const checksIn = (out) => {
  const m = [...out.matchAll(/^(\d+) (?:[\w ]*? )?passed\b/gm)].at(-1);
  return m ? Number(m[1]) : null;
};
const failed = (r) => r.code !== 0 || r.timedOut;
const why = (r) => (r.timedOut ? `stopped after ${TIMEOUT_MS / 1000} s` : r.signal ? `killed by ${r.signal}` : `exit ${r.code}`);

const width = Math.max(...files.map((f) => f.length));
const results = [];
let next = 0;
const t0 = performance.now();

console.log(`${files.length} test file${files.length === 1 ? '' : 's'}, ${AT_ONCE} at a time\n`);

async function worker() {
  while (next < queue.length) {
    const file = queue[next++];
    if (LIVE) console.log(`── test/${file}`);
    const r = await runFile(file);
    results.push(r);
    const n = checksIn(r.out);
    const note = [failed(r) ? why(r) : n != null ? `${n} checks` : '', r.left ? 'left a process running; stopped it' : ''].filter(Boolean).join(', ');
    const line = `${failed(r) ? '✗' : '✓'} ${file.padEnd(width)}  ${sec(r.ms).padStart(7)}  ${note}`;
    console.log(LIVE ? line + '\n' : line);
    if (opt.verbose && !LIVE) console.log(indent(r.out) + '\n');
  }
}

const indent = (s) => s.replace(/\n+$/, '').split('\n').map((l) => '    ' + l).join('\n');
// The end of a failure's output is where its error is; a long one is cut from
// the top so the error is never what scrolls away.
const tail = (s, n = 150) => {
  const lines = s.replace(/\n+$/, '').split('\n');
  return (lines.length > n ? [`… ${lines.length - n} earlier lines`, ...lines.slice(-n)] : lines).join('\n');
};

// Stopped from outside (Ctrl-C, CI cancelling): stop every file still running,
// with its group, so nothing is left behind.
const abandon = (signal) => {
  for (const child of running.values()) stop(child);
  console.log(`\n${signal}: stopped ${running.size} running file${running.size === 1 ? '' : 's'}; ${results.length} of ${files.length} had finished.`);
  process.exit(130);
};
process.on('SIGINT', () => abandon('SIGINT'));
process.on('SIGTERM', () => abandon('SIGTERM'));
process.on('SIGHUP', () => abandon('SIGHUP'));
process.on('exit', () => { for (const child of running.values()) stop(child); });

await Promise.all(Array.from({ length: AT_ONCE }, worker));
const wall = performance.now() - t0;

// kept for the next run's order; a file that failed is timed too
try {
  const times = { ...before };
  for (const r of results) times[r.file] = Math.round(r.ms);
  writeFileSync(TIMES + '.tmp', JSON.stringify(times));
  renameSync(TIMES + '.tmp', TIMES);
} catch { /* the order is only a hint */ }

const bad = results.filter(failed);
const work = results.reduce((s, r) => s + r.ms, 0);
if (files.length > 1) {
  console.log('\nslowest:');
  for (const r of results.slice().sort((a, b) => b.ms - a.ms).slice(0, 8)) console.log(`  ${sec(r.ms).padStart(7)}  ${r.file}`);
}
for (const r of bad) {
  console.log(`\n──── ✗ test/${r.file}: ${why(r)} after ${sec(r.ms)} ────`);
  // shown in full as it ran; here only its end, beside the verdict
  console.log(LIVE ? tail(r.out, 30) : tail(r.out));
}
const checks = results.reduce((s, r) => s + (checksIn(r.out) || 0), 0);
console.log(`\n${bad.length ? `✗ ${bad.length} of ${results.length} files failed: ${bad.map((r) => r.file).join(', ')}` : `✓ all ${results.length} files passed`}`
  + ` (${checks} checks) in ${sec(wall)}, ${AT_ONCE} at a time; ${sec(work)} of work.`);
// exitCode, not exit(): on a pipe, process.exit can cut off what is still
// being written, and the end of this report is the part that matters
process.exitCode = bad.length ? 1 : 0;
