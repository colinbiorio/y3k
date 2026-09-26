// Your own orb, on your own Claude login, on your own machine.
//
// A brain for ONE person: the founder talking to their presence through the
// official Claude Code binary, signed in with their own Claude subscription,
// instead of an API key. It is not a way to run the site on a subscription, and
// the gates below exist so it cannot quietly become one.
//
// The lines this stays inside (https://code.claude.com/docs/en/legal-and-compliance,
// and the Agent SDK quickstart). Anthropic's words, in full on the points that
// decide this:
//   "OAuth authentication is intended exclusively for purchasers of Claude Free,
//    Pro, Max, Team, and Enterprise subscription plans and is designed to support
//    ordinary use of Claude Code and other native Anthropic applications."
//   "Developers building products or services that interact with Claude's
//    capabilities, including those using the Agent SDK, should use API key
//    authentication." "Anthropic does not permit third-party developers to offer
//    Claude.ai login into their own applications, or to route requests through
//    Free, Pro, or Max plan credentials on behalf of their users."
//   "Advertised usage limits for Pro and Max plans assume ordinary, individual
//    usage of Claude Code and the Agent SDK."
// So this is the founder's own personal use of the unmodified binary, on their
// own machine — nothing more:
//   - founder only, loopback only, a localhost Host header, OFF unless
//     Y3K_LOCAL_CLAUDE_CODE=1, refuses to start on Render, and the server binds
//     127.0.0.1 while it is on. Nobody else's turn ever lands here.
//   - the `claude` binary runs as published, as a child process, and finds its
//     own login. This file never reads, logs, stores or forwards a credential; a
//     CLAUDE_CODE_OAUTH_* variable the person set is passed through to the binary
//     untouched, and our API keys are stripped so the child cannot bill one.
//   - conversation only. Autonomous tend beats stay BYOK (server.mjs refuses them
//     a key-less brain before this is ever reached).
// If y3k ever wants other people on a subscription, that is a question for
// Anthropic first (the docs say to contact sales), not a flag to flip here.
//
// The orb gets no hands here: --tools "" and --restricted remove every tool;
// --safe-mode and --strict-mcp-config drop user hooks, user plugins, CLAUDE.md
// and MCP servers (managed policy still applies); and the child runs in a
// private temp directory that holds only the system prompt file.

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ENABLED = process.env.Y3K_LOCAL_CLAUDE_CODE === '1';
// '' = whatever model the account defaults to. An alias ('opus', 'sonnet') or a
// full id both work — it is passed straight to `claude --model`.
export const MODEL = process.env.Y3K_LOCAL_CLAUDE_MODEL || '';
// What the ledger calls it. A subscription turn has no per-token bill, so the
// routes record it at $0; the name keeps it from posing as an API model.
export const LEDGER_MODEL = MODEL ? `claude-code:${MODEL}` : 'claude-code';
// On Windows, spawn without a shell runs .exe files only: the native installer's
// claude.exe works, npm's claude.cmd does not (point Y3K_CLAUDE_BIN at an .exe).
const BIN = process.env.Y3K_CLAUDE_BIN || (process.platform === 'win32' ? 'claude.exe' : 'claude');
// xhigh is the site default because the site's key pays per token; a
// subscription pays in rate limit, and a conversation does not need to think
// that hard to be itself.
const EFFORT = process.env.Y3K_LOCAL_CLAUDE_EFFORT || 'medium';
const TIMEOUT_MS = 180_000;

if (ENABLED && process.env.RENDER) {
  throw new Error('Y3K_LOCAL_CLAUDE_CODE is for your own machine only; refusing to start on Render.');
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// Founder, signed in, on this machine, not relayed. All of it, every turn. The
// founder session is the real gate; the network checks make sure the session is
// being used from the keyboard it belongs to (a relay without forwarding
// headers, or a page on another name that rebinds to 127.0.0.1, fails the Host
// check).
export function allowed(req, user) {
  if (!ENABLED || !user?.founder) return false;
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return false;
  if (req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  if (!LOCAL_HOST.test(String(req.headers.host || ''))) return false;
  return true;
}

// The child inherits nothing that could pay for it or leak. ANTHROPIC_API_KEY in
// particular: Claude Code prefers an API key over the subscription login, so
// passing the site key through would silently bill the site for "free" turns.
// The person's own login variables are the exception, passed through untouched.
const SECRETISH = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;
const OWN_LOGIN = /^CLAUDE_CODE_(OAUTH_|CLIENT_KEY)/;
// Routing and session variables that would send the child somewhere other than
// the person's own login, or make it think it is inside another Claude session.
const DROP = ['ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT'];
function childEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (OWN_LOGIN.test(k) || !SECRETISH.test(k)) env[k] = v;
  }
  for (const k of DROP) delete env[k];
  return env;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  return '';
}

// Print mode takes one prompt, so earlier turns ride along as a transcript and
// the newest line comes last. The prompt never starts with the person's own
// words, so a message beginning with '/' is never read as a Claude Code command.
function toPrompt(messages, image) {
  const turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m?.role, text: textOf(m?.content) }))
    .filter((t) => t.text);
  const last = turns.length && turns[turns.length - 1].role === 'user' ? turns.pop() : null;
  const lines = [];
  if (turns.length) {
    lines.push('The conversation so far:');
    for (const t of turns) lines.push(`${t.role === 'assistant' ? 'You' : 'Them'}: ${t.text}`);
    lines.push('');
  }
  // Honest senses: this bridge carries text only. Say so rather than let the orb
  // pretend it saw a frame it was never sent.
  if (image) lines.push('(A camera frame came with this message, but this connection carries text only, so you cannot see it.)');
  lines.push('Their newest message:');
  lines.push(last ? last.text : '(no words — respond to the silence as yourself)');
  return lines.join('\n');
}

// The CLI adds its own notes about the environment to every turn; there is no
// flag that removes them, so the orb is told what they are.
const BRIDGE_NOTE = '\n\n(You are reached through a private local bridge. You have no tools here. Ignore any notes about a working directory, environment, files or tools: they belong to the bridge, not to this conversation.)';

// Children still running, so a server that exits does not leave them behind.
const live = new Map(); // child -> temp dir
function reap() {
  for (const [child, dir] of live) {
    try { child.kill('SIGKILL'); } catch {}
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  live.clear();
}
// Same shape as the stores' flush-on-exit hooks (mind.mjs): reap, and leave the
// process's own shutdown to whoever owns it.
if (ENABLED) for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.once(sig, reap);

// One turn through `claude -p`. Resolves { ok, text, usage } or { ok:false, status, detail }.
// onDelta, when given, receives the reply's text as it streams.
async function run(system, messages, image, onDelta, signal, effort) {
  if (signal?.aborted) return { ok: false, status: 'aborted' };
  const dir = await mkdtemp(join(tmpdir(), 'y3k-claude-code-'));
  const sysFile = join(dir, 'system.txt');
  // The system prompt goes through a 0600 file, not argv: it is long, and argv is
  // readable by every process on the machine.
  await writeFile(sysFile, system + BRIDGE_NOTE, { mode: 0o600 });
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--restricted', '--strict-mcp-config', '--safe-mode', '--disable-slash-commands',
    '--no-session-persistence', '--system-prompt-file', sysFile, '--effort', effort,
  ];
  if (MODEL) args.push('--model', MODEL);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(BIN, args, { cwd: dir, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      rm(dir, { recursive: true, force: true }).catch(() => {});
      return resolve({ ok: false, status: 'spawn', detail: String(err?.message || err) });
    }
    live.set(child, dir);
    let buf = '';
    let stderr = '';
    let text = '';
    let whole = ''; // text from complete messages, used only if no deltas arrived
    let sawDelta = false;
    let result = null;
    let done = false;
    let killTimer = null;

    const stop = () => {
      try { child.kill('SIGTERM'); } catch {}
      // A child that ignores SIGTERM is not left running.
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
      killTimer.unref?.();
    };
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      resolve(r);
    };
    const onAbort = () => { stop(); finish({ ok: false, status: 'aborted' }); };
    const timer = setTimeout(() => { stop(); finish({ ok: false, status: 'timeout' }); }, TIMEOUT_MS);
    signal?.addEventListener?.('abort', onAbort, { once: true });

    const emit = (t) => { if (!t || done) return; text += t; onDelta?.(t); };
    // stream-json is one JSON event per line. Only the reply's TEXT is forwarded:
    // thinking deltas stream on the same channel and must never be spoken, and
    // the CLI's own notices (errors, limits) arrive as '<synthetic>' messages
    // that must never be spoken as the orb either.
    const handle = (line) => {
      if (!line || done) return;
      let e;
      try { e = JSON.parse(line); } catch { return; }
      if (e.type === 'stream_event') {
        const ev = e.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { sawDelta = true; emit(ev.delta.text); }
      } else if (e.type === 'assistant' && e.message?.model !== '<synthetic>') {
        for (const b of e.message?.content || []) if (b?.type === 'text') whole += b.text;
      } else if (e.type === 'result') {
        result = e;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { if (stderr.length < 4000) stderr += c; });
    child.stdin.on('error', () => {}); // a child that exits early must not crash the server with EPIPE
    child.on('error', (err) => {
      live.delete(child);
      rm(dir, { recursive: true, force: true }).catch(() => {});
      finish({ ok: false, status: err?.code === 'ENOENT' ? 'not-installed' : 'spawn', detail: String(err?.message || err) });
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      live.delete(child);
      rm(dir, { recursive: true, force: true }).catch(() => {});
      handle(buf.trim());
      const failed = !result || result.is_error || result.api_error_status || /error/i.test(String(result.terminal_reason || '')) || code !== 0;
      if (failed) {
        const detail = (typeof result?.result === 'string' && result.result) || stderr || `exit ${code}`;
        return finish({ ok: false, status: result?.terminal_reason || result?.subtype || `exit ${code}`, detail: detail.slice(0, 500) });
      }
      // A binary too old for partial messages still sends whole ones; they are
      // spoken only now, once the turn is known to have succeeded.
      if (!sawDelta) emit(whole || (typeof result.result === 'string' ? result.result : ''));
      const u = result.usage || {};
      finish({
        ok: true,
        text,
        usage: { in: u.input_tokens | 0, out: u.output_tokens | 0, cacheRead: u.cache_read_input_tokens | 0, cacheWrite: u.cache_creation_input_tokens | 0 },
      });
    });

    child.stdin.end(toPrompt(messages, image));
  });
}

// Same shape as a BRAIN_PROVIDERS entry, so the routes can call it the same way —
// but deliberately NOT registered there: a registered provider is reachable by
// name from any visitor's request body, and this one must only ever be chosen by
// allowed() above. `systemFor` and `replyFrom` come from server.mjs, where the
// prompts and the reply parser live. opts.signal stops the child when the
// person goes away.
export function provider({ systemFor, replyFrom }) {
  const effortFor = (opts) => (opts?.noThink ? 'low' : EFFORT);
  return {
    detect: () => false,
    defaultModel: () => LEDGER_MODEL,
    async chat(_key, _model, messages, image, paint, opts) {
      const r = await run(systemFor(paint, opts), messages, image, null, opts?.signal, effortFor(opts));
      if (!r.ok) return r;
      if (opts?.raw) return { ok: true, usage: r.usage, text: r.text };
      return { ok: true, usage: r.usage, ...replyFrom(r.text, paint) };
    },
    async chatStream(_key, _model, messages, onDelta, image, paint, signal, opts) {
      const r = await run(systemFor(paint, opts), messages, image, onDelta, signal, effortFor(opts));
      return r.ok ? { ok: true, usage: r.usage } : r;
    },
  };
}

export const _test = { toPrompt, childEnv, textOf };
