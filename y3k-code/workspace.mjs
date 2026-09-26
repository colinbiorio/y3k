// Folders: which ones a session may run in, what to tell the person before they
// trust one, browsing for one, and git in it.
//
// Nothing runs in a folder until the person trusts it (CODE.md, line 4). Trust
// matters more than it looks: `claude -p` skips Claude Code's own trust dialog,
// and a repository can carry hooks and connector definitions that RUN COMMANDS
// the moment a coding tool opens it. So the trust card lists exactly those.

import { realpathSync, statSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, sep, basename, dirname } from 'node:path';
import { run } from './proc.mjs';

const IS_WIN = platform() === 'win32';

function real(p) {
  try { return realpathSync(p); } catch { return null; }
}

// Folders no session may run in, whatever the person clicks: the filesystem
// root, the home folder itself, dot-folders (~/.ssh, ~/.aws, …), the engine's own
// config, and the OS's app-data trees.
export function refusalFor(realPath, { configDir } = {}) {
  if (!realPath) return 'That folder does not exist.';
  const home = real(homedir()) || homedir();
  if (realPath === sep || /^[A-Za-z]:\\?$/.test(realPath)) return 'Not the whole disk — pick a project folder.';
  if (realPath === home) return 'Not your whole home folder — pick a project folder inside it.';
  if (realPath.split(/[\\/]/).some((seg) => seg.startsWith('.') && seg.length > 1)) return 'Hidden folders are off limits (they hold keys and settings).';
  if (configDir && (realPath === configDir || realPath.startsWith(configDir + sep))) return "That is y3k Code's own settings folder.";
  const appData = [join(home, 'Library'), join(home, 'AppData')];
  if (appData.some((d) => realPath === d || realPath.startsWith(d + sep))) return 'System and app-data folders are off limits.';
  try { if (!statSync(realPath).isDirectory()) return 'That is a file, not a folder.'; } catch { return 'That folder cannot be read.'; }
  return null;
}

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// What in this folder can run commands or change a coding tool's behaviour when
// it opens — the things the person should see before trusting it.
export function inspectFolder(p, opts = {}) {
  const r = real(p);
  const refused = refusalFor(r, opts);
  if (refused) return { real: r, refused, findings: [] };
  const findings = [];
  const add = (kind, file, detail) => findings.push({ kind, file, detail });
  for (const f of ['.claude/settings.json', '.claude/settings.local.json']) {
    const t = readText(join(r, f));
    if (!t) continue;
    try {
      const j = JSON.parse(t);
      if (j.hooks && Object.keys(j.hooks).length) add('hooks', f, `runs commands on ${Object.keys(j.hooks).join(', ')}`);
      if (j.permissions?.allow?.length) add('allow-rules', f, `pre-approves ${j.permissions.allow.slice(0, 5).join(', ')}${j.permissions.allow.length > 5 ? '…' : ''}`);
      if (j.env && Object.keys(j.env).length) add('env', f, `sets ${Object.keys(j.env).join(', ')}`);
    } catch { add('unreadable', f, 'could not be read as JSON'); }
  }
  const mcp = readText(join(r, '.mcp.json'));
  if (mcp) {
    try {
      const names = Object.keys(JSON.parse(mcp).mcpServers || {});
      if (names.length) add('connectors', '.mcp.json', `defines ${names.join(', ')}`);
    } catch { add('unreadable', '.mcp.json', 'could not be read as JSON'); }
  }
  if (existsSync(join(r, 'CLAUDE.md'))) add('instructions', 'CLAUDE.md', 'instructions every Claude session here will read');
  if (existsSync(join(r, 'AGENTS.md'))) add('instructions', 'AGENTS.md', 'instructions coding agents here will read');
  for (const d of ['.codex', '.gemini', '.opencode']) if (existsSync(join(r, d))) add('config', d + '/', 'settings for a coding tool');
  if (existsSync(join(r, 'opencode.json'))) add('config', 'opencode.json', 'settings for OpenCode');
  const gitCfg = readText(join(r, '.git', 'config'));
  if (/fsmonitor\s*=/.test(gitCfg)) add('git', '.git/config', 'core.fsmonitor runs a program on git status');
  if (/hooksPath\s*=/.test(gitCfg)) add('git', '.git/config', 'core.hooksPath points git hooks elsewhere');
  const hooksDir = join(r, '.git', 'hooks');
  try {
    const live = readdirSync(hooksDir).filter((f) => !f.endsWith('.sample'));
    if (live.length) add('git', '.git/hooks/', `active hooks: ${live.join(', ')}`);
  } catch { /* no git or no hooks */ }
  return { real: r, refused: null, findings, isGit: existsSync(join(r, '.git')), name: basename(r) };
}

// The home subtree, directories only, no dot-folders, no symlink escapes. For the
// companion, where there is no native folder dialog.
export function browse(p) {
  const home = real(homedir()) || homedir();
  const target = real(p || home);
  if (!target || !(target === home || target.startsWith(home + sep))) return { error: 'Only folders inside your home folder can be browsed.' };
  let entries = [];
  try {
    entries = readdirSync(target, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => {
        const full = join(target, d.name);
        const r = real(full);
        if (!r || !(r === home || r.startsWith(home + sep))) return null; // a symlink out of home
        try { if (!statSync(r).isDirectory()) return null; } catch { return null; }
        return { name: d.name, path: full, git: existsSync(join(r, '.git')) };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 500);
  } catch { return { error: 'That folder cannot be read.' }; }
  return { path: target, parent: target === home ? null : dirname(target), home, entries };
}

// git, always with the repository's own programs switched off: a trusted folder
// may still have an fsmonitor or hooks, and the engine's own status checks must
// never run them.
const GIT_SAFE = ['-c', 'core.fsmonitor=', '-c', `core.hooksPath=${IS_WIN ? 'NUL' : '/dev/null'}`, '-c', 'color.ui=false'];

export async function git(cwd, args, opts = {}) {
  return run('git', [...GIT_SAFE, ...args], { cwd, timeout: 20000, ...opts });
}

// `git status --porcelain=v2 --branch` → {branch, ahead, behind, files:[{path, index, work}]}
export async function gitStatus(cwd) {
  const r = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z']);
  if (r.code !== 0) return { error: r.stderr.trim().slice(0, 300) || 'not a git repository' };
  const out = { branch: null, ahead: 0, behind: 0, files: [] };
  for (const rec of r.stdout.split('\0')) {
    if (!rec) continue;
    if (rec.startsWith('# branch.head ')) out.branch = rec.slice(14);
    else if (rec.startsWith('# branch.ab ')) { const m = rec.match(/\+(\d+) -(\d+)/); if (m) { out.ahead = +m[1]; out.behind = +m[2]; } }
    else if (rec[0] === '1' || rec[0] === '2') { const f = rec.split(' '); out.files.push({ path: f.slice(8 + (rec[0] === '2' ? 1 : 0)).join(' '), index: f[1][0], work: f[1][1] }); }
    else if (rec[0] === '?') out.files.push({ path: rec.slice(2), index: '?', work: '?' });
  }
  return out;
}

export async function gitDiff(cwd, { path, staged } = {}) {
  const args = ['diff', '--no-color', '--no-ext-diff', '-U3'];
  if (staged) args.push('--cached');
  if (path) args.push('--', path);
  const r = await git(cwd, args);
  return r.code === 0 ? { patch: r.stdout } : { error: r.stderr.trim().slice(0, 300) };
}
