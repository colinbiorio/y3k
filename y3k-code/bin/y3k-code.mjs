#!/usr/bin/env node
// y3k Code, the companion: runs the engine on this computer so the y3k Code
// screen at yearthreethousand.com can drive YOUR coding tools, in folders YOU
// trust, with YOUR sign-ins and keys. Nothing here talks to yearthreethousand.com.
//
//   y3k-code                 start, and open y3k Code in your browser
//   y3k-code --no-open       start without opening the browser
//   y3k-code --port 47821    use this port
//   y3k-code status          what is paired and trusted
//   y3k-code doctor          which coding tools are installed and signed in
//   y3k-code revoke          disconnect every paired browser
//   y3k-code key set <provider> | key clear <provider>
//   y3k-code signin on|off   use your own Claude / ChatGPT sign-in (see below)
//   y3k-code forget <folder> stop trusting a folder
//
// Development only: --dev --origin http://localhost:8080 (allow a local site).

import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { configDir, createStore } from '../store.mjs';
import { createEngine, VERSION } from '../engine.mjs';
import { createPairing } from '../pair.mjs';
import { createHttp } from '../http.mjs';
import { terminalConsent } from '../consent.mjs';
import { PROVIDERS, isKeyTarget, checkKey, installCommand } from '../providers.mjs';
import { inspectFolder } from '../workspace.mjs';

const SITE = 'https://yearthreethousand.com';
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const opts = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--port', '--origin', '--site'].includes(argv[i - 1]));
const cmd = positional[0] || 'start';

process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); });
const say = (s = '') => process.stdout.write(s + '\n');
const fail = (s) => { process.stderr.write(`y3k-code: ${s}\n`); process.exit(1); };

const store = createStore(configDir());
const pairing = createPairing({ load: store.tokens, save: store.setTokens });

function openBrowser(url) {
  const p = platform();
  const [bin, args] = p === 'darwin' ? ['open', [url]] : p === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  execFile(bin, args, { windowsHide: true }, () => {});
}

function readSecret(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.setEncoding('utf8').on('data', (d) => { data += d; }).on('end', () => resolve(data.trim()));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
  });
}

async function main() {
  switch (cmd) {
    case 'start': return start();
    case 'status': return status();
    case 'doctor': return doctor();
    case 'revoke': pairing.revokeAll(); say('Every paired browser is disconnected. Pair again from y3k Code.'); return;
    case 'key': return key();
    case 'signin': return signin();
    case 'forget': {
      const info = inspectFolder(positional[1] || '', { configDir: store.dir });
      store.forgetFolder(info.real || positional[1]);
      say(`No longer trusted: ${info.real || positional[1]}`);
      return;
    }
    case 'version': case '--version': say(VERSION); return;
    case 'help': case '--help': default:
      say('y3k Code — run your own coding agents on your own computer, from yearthreethousand.com.');
      say('Usage: y3k-code [start|status|doctor|revoke|key set <provider>|key clear <provider>|signin on|off|forget <folder>]');
  }
}

async function start() {
  const dev = flag('--dev');
  const origins = dev ? opts('--origin') : [];
  if (!dev && opts('--origin').length) fail('--origin only works with --dev.');
  const site = dev && opt('--site') ? opt('--site') : SITE;
  const consent = terminalConsent({ timeoutMs: 120000 });
  const engine = createEngine({ store, consent, onNotice: (t) => say(`  · ${t}`) });
  const http = createHttp({
    engine, pairing, origins,
    onPairCode: (code, why) => say(`\n  ${why === 'expired' ? 'That code expired' : why === 'declined' ? 'Not paired' : 'Too many wrong tries'} — the new code is ${fmt(code)}\n`),
    log: (s) => say(`  ${s}`),
  });
  const portArg = opt('--port');
  const port = await http.listen(portArg ? Number(portArg) : undefined);
  const code = pairing.issueCode();
  const link = `${site}/#y3k-code=${port}-${code}`;
  say('');
  say(`  y3k Code ${VERSION} is running on this computer (127.0.0.1:${port}).`);
  say(`  Settings and the activity log: ${store.dir}`);
  say('');
  say(`  Open: ${link}`);
  say(`  or type this code in y3k Code: ${fmt(code)}`);
  say('');
  say('  You will be asked here before a page connects and before any folder is trusted.');
  say('  Press Ctrl+C to stop; every coding session stops with it.');
  if (dev) say(`  (dev: also allowing ${origins.join(', ') || 'no extra origins'})`);
  if (!flag('--no-open')) openBrowser(link);
  const stop = async () => {
    say('\n  Stopping…');
    engine.shutdown();
    await Promise.race([http.close(), new Promise((r) => setTimeout(r, 6000))]);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const fmt = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

function status() {
  const paired = pairing.list();
  const folders = Object.entries(store.folders()).filter(([, r]) => r.trusted);
  const cfg = store.config();
  say(`Settings: ${store.dir}`);
  say(`Paired browsers: ${paired.length}${paired.map((p) => `\n  ${p.origin} (${p.agent}) — last used ${new Date(p.lastUsed).toLocaleString()}`).join('')}`);
  say(`Trusted folders: ${folders.length}${folders.map(([p, r]) => `\n  ${p}${r.mode ? ` — ${r.mode}` : ''}`).join('')}`);
  say(`Keys set: ${Object.keys(store.secrets()).join(', ') || 'none'}`);
  say(`Own sign-in (Claude / ChatGPT): ${cfg.signIn ? 'on' : 'off'}`);
}

async function doctor() {
  const engine = createEngine({ store, consent: async () => false });
  const list = await engine.detectAll();
  say(`y3k Code ${VERSION}, node ${process.version}, ${platform()}`);
  for (const p of list) {
    const state = p.installed ? `installed${p.version ? ` (${p.version})` : ''}` : `not installed — ${p.install || 'see the vendor'}`;
    say(`  ${p.label.padEnd(12)} ${state}${p.account ? `, ${p.account.state}` : ''}${p.keySet ? ', key set' : ''}${p.ready ? '' : ' — coming soon in y3k Code'}`);
  }
  engine.shutdown();
  process.exit(0);
}

async function key() {
  const [, action, provider] = positional;
  if (!['set', 'clear'].includes(action) || !provider) fail('usage: y3k-code key set <provider> | key clear <provider>');
  if (!isKeyTarget(provider)) fail(`unknown provider: ${provider}. Known: ${Object.keys(PROVIDERS).join(', ')}, openrouter, kimi, deepseek, qwen, glm, xai, mistral, groq`);
  if (action === 'clear') { store.setSecret(provider, null); say(`Removed the ${provider} key.`); return; }
  const k = checkKey(provider, await readSecret(`Paste your ${provider} API key (it is not shown): `));
  if (k.error) fail(k.error);
  store.setSecret(provider, k.key);
  say(`Saved, readable only by you, in ${store.dir}. It is never sent to yearthreethousand.com.`);
}

function signin() {
  const v = positional[1];
  if (!['on', 'off'].includes(v)) fail('usage: y3k-code signin on|off');
  store.setConfig({ signIn: v === 'on' });
  if (v === 'on') {
    say('Your own Claude and ChatGPT sign-ins will be used when no API key is set.');
    say('y3k Code runs the vendors\' own unmodified tools with their own sign-in; it never reads your login.');
    say('Check each vendor\'s terms for your plan before relying on this. Gemini always uses an API key.');
    for (const id of ['claude', 'codex']) say(`  ${PROVIDERS[id].label}: sign in with \`${PROVIDERS[id].login}\`${installCommand(id) ? `; install with \`${installCommand(id)}\`` : ''}`);
  } else {
    say('Off: only API keys will be used.');
  }
}

main().catch((err) => fail(String(err?.message || err)));
