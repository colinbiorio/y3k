// GitHub, through the person's own `gh` sign-in: list their repositories and
// clone one onto this computer. y3k Code never holds a GitHub token — `gh`
// does, the way it always has — and a cloned folder is not trusted until the
// person says so on the trust card, like any other.

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { resolveBin, run } from './proc.mjs';

export const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
export const cloneBase = () => join(homedir(), 'y3k-code');

export async function ghStatus(env = process.env) {
  const bin = resolveBin('gh', { env });
  if (!bin) return { installed: false, signedIn: false };
  const r = await run(bin, ['auth', 'status', '--hostname', 'github.com'], { env, timeout: 15000 });
  return { installed: true, signedIn: r.code === 0, bin };
}

// Their own repositories (newest first), or a search across GitHub.
export async function listRepos({ env = process.env, q } = {}) {
  const st = await ghStatus(env);
  if (!st.installed) return { error: 'GitHub CLI (gh) is not installed.', code: 'no-gh', install: 'https://cli.github.com' };
  if (!st.signedIn) return { error: 'Sign in to GitHub with `gh auth login` in a terminal.', code: 'gh-signed-out' };
  const query = String(q || '').trim().slice(0, 200);
  const args = query
    ? ['search', 'repos', query, '--json', 'fullName,description,visibility,updatedAt', '--limit', '50']
    : ['repo', 'list', '--json', 'nameWithOwner,description,isPrivate,updatedAt,primaryLanguage', '--limit', '100'];
  const r = await run(st.bin, args, { env, timeout: 30000 });
  if (r.code !== 0) return { error: r.stderr.trim().split('\n').pop()?.slice(0, 300) || 'gh failed' };
  let rows;
  try { rows = JSON.parse(r.stdout); } catch { return { error: 'gh answered in a way y3k Code could not read.' }; }
  return {
    repos: (Array.isArray(rows) ? rows : []).map((x) => ({
      repo: x.nameWithOwner || x.fullName,
      description: String(x.description || '').slice(0, 300),
      private: x.isPrivate ?? (x.visibility ? x.visibility !== 'public' : false),
      updated: x.updatedAt ? Date.parse(x.updatedAt) : null,
      language: x.primaryLanguage?.name || null,
    })).filter((x) => REPO_RE.test(x.repo || '')),
  };
}

// A free folder under ~/y3k-code for this repository.
export function cloneDest(repo, base = cloneBase()) {
  const name = repo.split('/')[1].replace(/\.git$/, '');
  let d = join(base, name);
  for (let i = 2; existsSync(d); i++) d = join(base, `${name}-${i}`);
  return d;
}

export async function clone({ env = process.env, repo, dest } = {}) {
  if (!REPO_RE.test(String(repo || ''))) return { error: 'That is not a GitHub repository name (owner/name).' };
  const st = await ghStatus(env);
  if (!st.installed) return { error: 'GitHub CLI (gh) is not installed.', code: 'no-gh' };
  const base = cloneBase();
  const target = dest || cloneDest(repo, base);
  if (!(target === base || target.startsWith(base + sep)) || existsSync(target)) return { error: 'Clones go into a new folder inside ~/y3k-code.' };
  mkdirSync(base, { recursive: true });
  const r = await run(st.bin, ['repo', 'clone', repo, target], { env, timeout: 15 * 60 * 1000 });
  if (r.code !== 0) return { error: r.stderr.trim().split('\n').pop()?.slice(0, 300) || 'The clone failed.' };
  return { path: target };
}
