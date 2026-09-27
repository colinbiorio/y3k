#!/usr/bin/env node
// y3kode, the companion: runs the engine on this computer so the y3kode screen
// at yearthreethousand.com can drive YOUR coding tools, in folders YOU trust, on
// YOUR own sign-ins. Nothing here talks to yearthreethousand.com.
//
// The command is `y3kode`, or `y3k-code` — the same program under either name.
//
//   y3kode                   start, and open y3kode in your browser
//   y3kode --pair <code>     start, and let the y3k page that gave you this
//                            command connect by itself (see below)
//   y3kode --no-open         start without opening the browser
//   y3kode --port 47821      use this port
//   y3kode status            what is paired and trusted
//   y3kode doctor            which coding tools are installed and signed in
//   y3kode revoke            disconnect every paired browser
//   y3kode key set <tool>    use an API key for a tool instead of its sign-in
//                            (or an open model's key, for OpenCode)
//   y3kode key clear <tool>  back to the tool's own sign-in
//   y3kode forget <folder>   stop trusting a folder
//
// Each coding tool runs on its own sign-in on this computer — the `claude`,
// `codex login`, `gemini` or `opencode auth login` you already did. There is
// nothing to switch on (`signin on|off` is still understood, and says so).
//
// `--pair <code>` is how the site's one-click start works: the y3k page makes
// an 8-character code, puts it at the end of the command it copies for you, and
// watches for this engine. Running that command in your own terminal is the yes
// that pairing otherwise asks for (CODE.md, line 7), so the code is taken as
// already approved — once, for 15 minutes — and no browser tab is opened: the
// page you copied it from is already the one that connects.
//
// Development only: --dev --origin http://localhost:8080 (allow a local site).
//
// The `y3k-code` command itself is bin/y3k-code.cjs, which checks the Node
// version before this file's syntax is ever parsed.

import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { configDir, createStore } from '../store.mjs';
import { createEngine, VERSION } from '../engine.mjs';
import { createPairing, normalizeCode, PRE_TTL } from '../pair.mjs';
import { createHttp } from '../http.mjs';
import { createConsentDesk } from '../consent.mjs';
import { PROVIDERS, isProvider, isKeyTarget, checkKey, keyChosen, keyChoice } from '../providers.mjs';
import { inspectFolder } from '../workspace.mjs';

const SITE = 'https://yearthreethousand.com';
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const opts = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--port', '--origin', '--site', '--pair'].includes(argv[i - 1]));
const cmd = positional[0] || 'start';

process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); });
const say = (s = '') => process.stdout.write(s + '\n');
const fail = (s) => { process.stderr.write(`y3kode: ${s}\n`); process.exit(1); };

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
    case 'revoke': pairing.revokeAll(); say('Every paired browser is disconnected. Pair again from y3kode.'); return;
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
      say('y3kode — run your own coding tools on your own computer, from yearthreethousand.com.');
      say('Usage: y3kode [start|status|doctor|revoke|key set <tool>|key clear <tool>|forget <folder>]');
      say('       y3kode --pair <code>   (the command y3kode copies for you)');
      say('       (`y3k-code` is the same command.)');
  }
}

async function start() {
  const dev = flag('--dev');
  const origins = dev ? opts('--origin') : [];
  if (!dev && opts('--origin').length) fail('--origin only works with --dev.');
  const site = dev && opt('--site') ? opt('--site') : SITE;
  const preCode = flag('--pair') ? normalizeCode(opt('--pair')) : null;
  if (flag('--pair') && !preCode) fail('that is not a y3kode pairing code. Copy the command from y3kode again.');
  const open = !flag('--no-open');

  let port = 0;
  let pairedHere = false;
  // Every question is asked here AND on the approval page; the first answer wins.
  const desk = createConsentDesk({ timeoutMs: 120000, approveUrl: () => (port ? `http://127.0.0.1:${port}/approve` : null) });
  const engine = createEngine({ store, consent: desk.ask, onNotice: (t) => say(`  · ${t}`) });
  const http = createHttp({
    engine, pairing, origins, desk,
    onPairCode: (code, why) => say(`\n  ${why === 'expired' ? 'That code expired' : why === 'declined' ? 'Not paired' : 'Too many wrong tries'} — the new code is ${fmt(code)}\n`),
    onPaired: ({ origin, agent, preapproved }) => {
      pairedHere = true;
      say(`\n  Connected to ${origin} (${agent}).${preapproved ? ' You can go back to your browser — y3kode is ready there.' : ''}`);
    },
    log: (s) => say(`  ${s}`),
  });
  const portArg = opt('--port');
  port = await http.listen(portArg ? Number(portArg) : undefined);
  const approveUrl = `http://127.0.0.1:${port}/approve`;
  const pairLink = (code) => `${site}/#y3k-code=${port}-${code}`;

  // While nobody is paired, a fresh code a little before the shown one runs
  // out (the old one keeps working until it does), so the terminal never
  // shows a dead code — before, a new one appeared only after a failed try.
  const keepFresh = () => {
    const t = setInterval(() => {
      if (pairedHere || pairing.list().length) { clearInterval(t); return; }
      if (pairing.code && pairing.codeExpires - Date.now() > 45000) return;
      const c = pairing.issueCode({ keep: true });
      say(`\n  A fresh code, as the last one runs out: ${fmt(c)}`);
      say(`  Open: ${pairLink(c)}\n`);
    }, 15000);
    t.unref?.();
  };

  say('');
  say(`  y3kode ${VERSION} is running on this computer (127.0.0.1:${port}).`);
  say('');
  if (preCode) {
    // The one-click start: the page that gave out this command is watching
    // for this engine and pairs with the code by itself. No tab is opened —
    // that page is the tab.
    pairing.preapprove(preCode);
    say('  Leave this window open — the y3k page you copied this from connects by itself.');
    // If that page never came (closed, another browser), fall back to pairing
    // by hand rather than leave a window that silently waits for nothing.
    setTimeout(() => {
      if (pairedHere || pairing.list().length) return;
      const code = pairing.issueCode();
      say('\n  The y3k page did not connect. To connect by hand, open:');
      say(`  ${pairLink(code)}`);
      say(`  or type this code in y3kode: ${fmt(code)}\n`);
      keepFresh();
    }, PRE_TTL + 1000).unref?.();
  } else if (pairing.list().length) {
    // Already paired: open y3k Code itself, not a pairing link — the browser
    // that paired before still holds its token, and a fresh code tab every
    // start just left a second room open beside the first.
    const code = pairing.issueCode();
    const link = `${site}/#code`;
    say(`  ${open ? 'Opening' : 'Open'} y3kode: ${link}`);
    say(`  Another browser? Type this code in y3kode: ${fmt(code)}`);
    if (open) openBrowser(link);
  } else {
    const code = pairing.issueCode();
    const link = pairLink(code);
    say(`  Open: ${link}`);
    say(`  or type this code in y3kode: ${fmt(code)}`);
    if (open) openBrowser(link);
    keepFresh();
  }
  say('');
  if (preCode) say('  Anything else that needs your yes — a folder, a connector — is asked here,');
  else say('  Before a page connects, and before any folder is trusted, you are asked here —');
  say(`  or in the approval window: ${approveUrl}`);
  say(`  Settings and the activity log: ${store.dir}`);
  say('  Press Ctrl+C to stop; every coding session stops with it.');
  if (dev) say(`  (dev: also allowing ${origins.join(', ') || 'no extra origins'})`);
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
  const keyed = Object.keys(PROVIDERS).filter((id) => keyChosen(id, cfg));
  say(`Settings: ${store.dir}`);
  say(`Paired browsers: ${paired.length}${paired.map((p) => `\n  ${p.origin} (${p.agent}) — last used ${new Date(p.lastUsed).toLocaleString()}`).join('')}`);
  say(`Trusted folders: ${folders.length}${folders.map(([p, r]) => `\n  ${p}${r.mode ? ` — ${r.mode}` : ''}${r.provider ? ` · ${r.provider}` : ''}`).join('')}`);
  say(`Keys set: ${Object.keys(store.secrets()).join(', ') || 'none'}`);
  say(`Signing in: each tool's own sign-in${keyed.length ? ` — except ${keyed.map((id) => PROVIDERS[id].label).join(', ')}, on the key you chose` : ''}`);
}

async function doctor() {
  const engine = createEngine({ store, consent: async () => false });
  const list = await engine.detectAll();
  say(`y3kode ${VERSION}, node ${process.version}, ${platform()}`);
  const word = { ok: 'ready', 'signed-out': 'not signed in', 'needs-key': 'needs a key', unknown: 'sign-in not checked' };
  for (const p of list) {
    if (!p.installed) { say(`  ${p.label.padEnd(12)} not installed — ${p.install || 'see the vendor'}`); continue; }
    const how = p.method === 'apiKey' ? 'on your API key' : p.id === 'opencode' ? 'on its own sign-ins and your keys' : 'on its own sign-in';
    say(`  ${p.label.padEnd(12)} installed${p.version ? ` (${p.version})` : ''}, ${how}: ${word[p.auth] || p.auth}${p.auth === 'signed-out' ? ` — run \`${p.loginCommand}\`` : ''}${p.ready ? '' : ' — coming soon in y3kode'}`);
  }
  engine.shutdown();
  process.exit(0);
}

async function key() {
  const [, action, provider] = positional;
  if (!['set', 'clear'].includes(action) || !provider) fail('usage: y3kode key set <tool> | key clear <tool>');
  if (!isKeyTarget(provider)) fail(`unknown tool: ${provider}. Known: ${Object.keys(PROVIDERS).join(', ')}, openrouter, kimi, deepseek, qwen, glm, xai, mistral, groq`);
  // For Claude Code, Codex and Gemini CLI a key replaces the tool's own sign-in,
  // by the person's choice (providers.mjs); clearing it goes back.
  const tool = isProvider(provider) && provider !== 'opencode' ? PROVIDERS[provider] : null;
  if (action === 'clear') {
    store.setSecret(provider, null);
    if (tool) store.setConfig({ auth: keyChoice(store.config(), provider, false) });
    say(`Removed the ${provider} key.${tool ? ` ${tool.label} is back on its own sign-in.` : ''}`);
    return;
  }
  const k = checkKey(provider, await readSecret(`Paste your ${provider} API key (it is not shown): `));
  if (k.error) fail(k.error);
  store.setSecret(provider, k.key);
  if (tool) store.setConfig({ auth: keyChoice(store.config(), provider, true) });
  say(`Saved, readable only by you, in ${store.dir}. It is never sent to yearthreethousand.com.`);
  if (tool) say(`${tool.label} will use this key instead of your sign-in. To go back: y3kode key clear ${provider}`);
}

// Kept so an old habit (or an old note) still gets an answer: there is nothing
// to switch — every tool runs on its own sign-in unless a key was chosen for it.
function signin() {
  say('y3kode always uses each coding tool\'s own sign-in on this computer — there is nothing to switch on or off.');
  for (const id of ['claude', 'codex', 'gemini', 'opencode']) say(`  ${PROVIDERS[id].label.padEnd(12)} sign in with \`${PROVIDERS[id].login}\``);
  say('To use an API key for one of them instead: y3kode key set <tool>.');
}

main().catch((err) => fail(String(err?.message || err)));
