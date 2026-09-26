// Where the engine keeps what it must remember on this machine: which folders
// the person trusted and the mode they chose for each, their keys, the paired
// browsers, their connectors, the session index and the audit log.
//
// Everything is written atomically (temp file, then rename) and readable only by
// the person (0600 files in a 0700 directory). Nothing here is ever sent to
// yearthreethousand.com (CODE.md, lines 2 and 3).

import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function configDir(env = process.env) {
  if (env.Y3K_CODE_HOME) return env.Y3K_CODE_HOME;
  const home = homedir();
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'y3k-code');
  if (platform() === 'win32') return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'y3k-code');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'y3k-code');
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* windows */ }
  return dir;
}

export function readJson(file, fallback) {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
}

export function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* windows */ }
}

// A small typed view over the directory. Each file is loaded lazily and cached.
export function createStore(dir = configDir()) {
  ensureDir(dir);
  for (const sub of ['sessions', 'audit', 'tmp']) ensureDir(join(dir, sub));
  const cache = new Map();
  const file = (name) => join(dir, name);
  const get = (name, fallback) => {
    if (!cache.has(name)) cache.set(name, readJson(file(name), fallback));
    return cache.get(name);
  };
  const put = (name, value) => { cache.set(name, value); writeJsonAtomic(file(name), value); };

  return {
    dir,
    tmpDir: join(dir, 'tmp'),
    sessionsDir: join(dir, 'sessions'),
    auditDir: join(dir, 'audit'),
    config: () => get('config.json', {}),
    setConfig: (patch) => put('config.json', { ...get('config.json', {}), ...patch }),
    folders: () => get('folders.json', {}),
    setFolder: (real, patch) => { const f = { ...get('folders.json', {}) }; f[real] = { ...(f[real] || {}), ...patch }; put('folders.json', f); return f[real]; },
    forgetFolder: (real) => { const f = { ...get('folders.json', {}) }; delete f[real]; put('folders.json', f); },
    // Keys are kept apart from everything else so a support paste of config.json
    // can never carry one.
    secrets: () => get('secrets.json', {}),
    setSecret: (provider, key) => { const s = { ...get('secrets.json', {}) }; if (key) s[provider] = key; else delete s[provider]; put('secrets.json', s); },
    tokens: () => get('tokens.json', {}),
    setTokens: (t) => put('tokens.json', t),
    mcp: () => get('mcp.json', { mcpServers: {} }),
    setMcp: (m) => put('mcp.json', m),
    exists: (name) => existsSync(file(name)),
  };
}
