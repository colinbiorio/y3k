#!/usr/bin/env node
// ship.mjs — PUSH, WAIT FOR IT TO BE LIVE, RELOAD.
//
// Colin, 2026-10-24: "give yourself the ability to push changes to the website
// and reload lmao -- frictionless is the goal -- obviously only give that
// ability to me tho lmao".
//
//   npm run ship              push main (what is committed here) and wait for it
//   npm run ship -- 39        merge PR #39 into main (gh pr merge) and wait for it
//   npm run ship -- --watch   wait for whatever origin/main is now; push nothing
//
// Every push to main is a Render deploy (render.yaml, autoDeploy): the site
// answers 502 for a minute or three, then comes back on the new commit, which
// /api/health says (`commit`, server.mjs). This waits for that commit, twice
// in a row so a flapping deploy does not count, then reloads every tab of the
// site open in Safari or Chrome on this Mac (osascript; nothing if neither is
// running). The founder's page reloads itself as well, on any device
// (src/ship.js). ONLY HERE: the push needs this machine's git and gh sign-in,
// the reload is of this machine's browsers, and nothing is added to the site
// that anyone could call. Nothing is read from .env.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// THE REPO IS THE ONE THIS SCRIPT LIVES IN, wherever it is called from. It
// used to be whatever git repo the shell stood in: called by its full path
// from another project's folder it would have merged and pushed THERE. That
// matters because the one way to run it without a hand on every merge is by
// its full path, from anywhere (a permission rule names the command, not the
// folder; Colin, 2026-10-25: "please ensure that in the future, you are able
// to merge yourself").
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SITE = process.env.Y3K_SITE || 'https://yearthreethousand.com';
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
export const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** What one health answer means while waiting for `want`. Pure, so it is tested. */
export function judge(want, res) {
  if (!res || res.ok !== true) return 'down';            // no answer, or not 200: the deploy is in flight
  if (typeof res.commit !== 'string' || !res.commit) return 'blind';   // a server from before this script cannot say
  return res.commit === want ? 'live' : 'old';
}

export const SAY = {
  down: 'no answer: deploying',
  old: 'up, still the version before',
  blind: 'up, but this version cannot say which commit it is',
  live: 'live on the new commit',
};

/** Wait until the site answers on `want`. Returns { ok, ms, how }: how is
 *  'commit' (health named it), 'blind' (it went down and came back, from a
 *  version that cannot name its commit), or the last state seen on a timeout. */
export async function waitLive(want, { fetchFn = (...a) => fetch(...a), every = 5000, limit = 12 * 60 * 1000, now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  const t0 = now();
  let last = null, seenDown = false, liveRuns = 0;
  while (now() - t0 < limit) {
    let res = null;
    try {
      const r = await fetchFn(`${SITE}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      res = r.ok ? await r.json() : null;
    } catch { res = null; }
    const what = judge(want, res);
    if (what !== last) { log(`  ${fmt(now() - t0)}  ${SAY[what]}`); last = what; }
    if (what === 'down') seenDown = true;
    liveRuns = what === 'live' ? liveRuns + 1 : 0;
    if (liveRuns >= 2) return { ok: true, ms: now() - t0, how: 'commit' };
    if (what === 'blind' && seenDown) return { ok: true, ms: now() - t0, how: 'blind' };
    await sleep(every);
  }
  return { ok: false, ms: now() - t0, how: last };
}

// Safari reloads a tab by being given its own address again (no Develop-menu
// setting needed); Chrome has a reload verb.
export const RELOAD_SCRIPTS = (host) => ({
  Safari: `if application "Safari" is running then
  tell application "Safari"
    set n to 0
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains "${host}" then
          set URL of t to (URL of t)
          set n to n + 1
        end if
      end repeat
    end repeat
    return n
  end tell
end if
return 0`,
  'Google Chrome': `if application "Google Chrome" is running then
  tell application "Google Chrome"
    set n to 0
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains "${host}" then
          reload t
          set n to n + 1
        end if
      end repeat
    end repeat
    return n
  end tell
end if
return 0`,
});

/** Reload every tab of the site in Safari and Chrome on this Mac. Best effort: [{ app, tabs }]. */
export function reloadTabs(host = new URL(SITE).host, run = (args) => spawnSync('osascript', args, { encoding: 'utf8' }), platform = process.platform) {
  if (platform !== 'darwin') return [];
  const out = [];
  for (const [app, script] of Object.entries(RELOAD_SCRIPTS(host))) {
    const r = run(['-e', script]);
    const n = parseInt(String(r.stdout || '').trim(), 10);
    if (r.status === 0 && n > 0) out.push({ app, tabs: n });
  }
  return out;
}

async function main(argv) {
  const arg = argv[0];
  const root = sh('git', ['rev-parse', '--show-toplevel'], { cwd: REPO });
  const at = { cwd: root };
  let want;
  if (arg === '--watch') {
    sh('git', ['fetch', '-q', 'origin', 'main'], at);
    want = sh('git', ['rev-parse', 'origin/main'], at);
    console.log(`waiting for main as it is (${want.slice(0, 7)})`);
  } else if (/^\d+$/.test(arg || '')) {
    console.log(`merging #${arg}…`);
    const r = spawnSync('gh', ['pr', 'merge', arg, '--merge'], { ...at, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) { console.error((r.stderr || r.stdout || '').trim()); process.exit(1); }
    sh('git', ['fetch', '-q', 'origin', 'main'], at);
    want = sh('gh', ['pr', 'view', arg, '--json', 'mergeCommit', '--jq', '.mergeCommit.oid'], at);
    console.log(`merged as ${want.slice(0, 7)}`);
    // the main checkout here follows, when it is main and clean
    try {
      if (sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], at) === 'main' && !sh('git', ['status', '--porcelain'], at)) {
        sh('git', ['merge', '-q', '--ff-only', 'origin/main'], at);
        console.log('local main brought up to date');
      }
    } catch { /* it stays where it was; a merge is not this script's to force */ }
  } else if (arg) {
    console.error(`what is ${arg}? a PR number, --watch, or nothing (push main)`);
    process.exit(2);
  } else {
    const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], at);
    if (branch !== 'main') { console.error(`on ${branch}, not main: open a PR and ship its number, or ship --watch`); process.exit(2); }
    if (sh('git', ['status', '--porcelain'], at)) { console.error('uncommitted changes here: commit first'); process.exit(2); }
    console.log('pushing main…');
    sh('git', ['push', '-q', 'origin', 'main'], at);
    want = sh('git', ['rev-parse', 'HEAD'], at);
    console.log(`pushed ${want.slice(0, 7)}`);
  }
  const got = await waitLive(want);
  if (!got.ok) { console.error(`not live after ${fmt(got.ms)} (last: ${got.how}); Render's dashboard has the log`); process.exit(3); }
  console.log(`live in ${fmt(got.ms)}${got.how === 'blind' ? ' (it went down and came back; from now on the site says its commit)' : ''}`);
  const tabs = reloadTabs();
  console.log(tabs.length
    ? `reloaded ${tabs.map((t) => `${t.tabs} tab${t.tabs > 1 ? 's' : ''} in ${t.app}`).join(', ')}`
    : 'no tab of the site open in Safari or Chrome here (the founder\'s page reloads itself anyway)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.stderr?.trim?.() || e.message || e); process.exit(1); });
}
