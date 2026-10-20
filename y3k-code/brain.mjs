// YOUR PRESENCE, THINKING ON YOUR OWN SIGN-IN. The site asks this engine, through
// the page in your own browser (src/own-brain.js), for one turn of your
// presence's thinking: a system prompt and the conversation, flattened. The
// engine runs the coding client you installed and signed in to — today Claude
// Code — once, as published, on its own login, and hands back what it said.
// No key is involved and none is read: the client finds its own sign-in.
//
// EACH PERSON, ON THEIR OWN. Open to every account since 2026-10-12, on
// Colin's word after legal advice (he has written to Anthropic about it).
// The site sends a turn only to the page of the person whose presence it is
// (own-relay.mjs, WHO), that page hands it only to the engine on their own
// computer, and the engine runs it only on that person's own sign-in. The
// site never sees a credential and never pays for, resells or pools anyone's
// usage; the only limit on a turn is the person's own plan. Anthropic's terms
// on plan credentials: https://code.claude.com/docs/en/legal-and-compliance.
//
// NO HANDS. The orb thinks; it does not act. The child gets no tools (--tools ""
// and --restricted remove every one), no hooks, plugins, CLAUDE.md or MCP
// servers (--safe-mode, --strict-mcp-config), no slash commands, no session on
// disk, and an empty private folder to run in that holds only the system
// prompt. A presence's prompt carries its memory and what it has read, and a
// client with tools could be steered by either into this computer's files —
// which is why only a client with a verified tool-less mode is offered here.
//
// Asked once per client, on this computer (consent 'brain.own'), like
// everything else that spends what is yours.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { run } from './proc.mjs';
import { AUTH_FAIL, isModel, EFFORTS } from './adapters/claude.mjs';

// The clients that can think for a presence: those whose tool-less mode has
// been checked. Codex and Gemini CLI run tools from their own sandboxes, and
// their switches to turn every one of them off have not been verified yet.
export const THINKERS = ['claude'];
export const MAX_TEXT = 200000;
const TIMEOUT_MS = 180000;

// The CLI adds its own notes about the environment to every turn and there is
// no flag that removes them, so the orb is told what they are.
const BRIDGE_NOTE = '\n\n(You are reached through a private local bridge. You have no tools here. Ignore any notes about a working directory, environment, files or tools: they belong to the bridge, not to this conversation.)';

export function claudeArgs({ sysFile, model, effort, stream = false, image = false }) {
  // stream: the words as they are written (stream-json with partial messages),
  // so the page can start speaking at the first sentence instead of the last
  // (Colin, 2026-10-19: "don't wait to print the full message to start talking").
  // image: the turn goes in as one stream-json user message carrying the
  // camera frame and the words (that input needs stream-json output too).
  const out = stream || image ? ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'] : ['--output-format', 'json'];
  const args = ['-p', ...(image ? ['--input-format', 'stream-json'] : []), ...out,
    '--tools', '', '--restricted', '--strict-mcp-config', '--safe-mode', '--disable-slash-commands',
    '--no-session-persistence', '--system-prompt-file', sysFile];
  if (effort && EFFORTS.includes(effort)) args.push('--effort', effort);
  if (model && isModel(model)) args.push('--model', model);
  return args;
}

// The turn's result: the last line that is a result event. --output-format json
// prints just that; a stream (an older binary, a stand-in) ends with it.
export function resultOf(stdout) {
  const lines = String(stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const e = JSON.parse(lines[i]); if (e && e.type === 'result') return e; } catch { /* not this line */ }
  }
  return null;
}

// The text a stream-json line adds, if it is a text delta; '' otherwise.
export function deltaOf(line) {
  return tokenOf(line).text;
}

// What a stream-json line is, for the clock: a token of any kind (thinking
// counts: it is generated at the same speed and billed as output), and the
// text it adds, if any. → { token: boolean, text: string }
export function tokenOf(line) {
  try {
    const e = JSON.parse(line);
    const d = e?.type === 'stream_event' ? e.event : null;
    if (d?.type === 'content_block_delta') {
      const text = d.delta?.type === 'text_delta' && typeof d.delta.text === 'string' ? d.delta.text : '';
      return { token: true, text };
    }
  } catch { /* not JSON, or not ours */ }
  return { token: false, text: '' };
}

// HOW FAST IT THOUGHT (Colin, 2026-10-19: "could we display tokens per second
// and also figure out how to maximize that number?"). From the stream's own
// clock: when the process started, the first token of any kind, the first
// word, the last token. tps counts every output token (thinking included)
// over the time between the first token and the last, which is the model's
// own speed; firstMs and wordMs are the waits a person feels. Measured, not
// guessed: without a stream there is only the API's total time, so the rate
// is the rough one and says so.
export function speedOf({ startAt, firstAt, textAt, lastAt } = {}, res = {}) {
  const u = res?.usage || {};
  const out = u.output_tokens | 0;
  const think = u.output_tokens_details?.thinking_tokens | 0;
  const apiMs = Number.isFinite(res?.duration_api_ms) ? Math.round(res.duration_api_ms) : null;
  const ms = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round(b - a) : null);
  const genMs = ms(firstAt, lastAt);
  const s = { out, think, firstMs: ms(startAt, firstAt), wordMs: ms(startAt, textAt), genMs, apiMs, tps: null, rough: false };
  if (out > 1 && genMs >= 200) s.tps = Math.round(((out - 1) / genMs) * 10000) / 10;
  else if (out > 0 && apiMs > 0) { s.tps = Math.round((out / apiMs) * 10000) / 10; s.rough = true; }
  return s;
}

// run(), but reading stdout line by line as it arrives, so the text written so
// far reaches onPart while the turn is still going. Same result shape as run().
export function runStreaming(bin, args, { cwd, env, timeout = TIMEOUT_MS, input, onPart, now = () => performance.now() } = {}) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', line = '', said = '';
    // the turn's clock (speedOf): read here, as each line arrives, because the
    // lines themselves carry no times
    const times = { startAt: now(), firstAt: null, textAt: null, lastAt: null };
    let child;
    try { child = spawn(bin, args, { cwd, env, windowsHide: true }); }
    catch (err) { return resolve({ code: -1, stdout: '', stderr: String(err?.message || err), times }); }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeout);
    child.stdout.setEncoding('utf8').on('data', (d) => {
      if (stdout.length < 4e6) stdout += d;
      line += d;
      let nl;
      while ((nl = line.indexOf('\n')) >= 0) {
        const one = line.slice(0, nl); line = line.slice(nl + 1);
        const { token, text: add } = tokenOf(one);
        if (token) { const at = now(); times.firstAt ??= at; times.lastAt = at; if (add) times.textAt ??= at; }
        if (add && said.length < MAX_TEXT) { said += add; try { onPart?.(said); } catch { /* a listener never breaks the turn */ } }
      }
    });
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 1e5) stderr += d; });
    child.on('error', (err) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(err?.message || err), times }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr, times }); });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}

// One turn through `claude -p`. → { ok, text, usage, speed } | { ok: false, code, error }
// With onPart, the turn streams: onPart(textSoFar) as the words are written.
// THE EYE (2026-10-19). A camera frame (base64 JPEG) goes with the words as an
// image block, so the presence sees the person it is talking to on this path
// too; before, the bridge carried text only and the orb had to say the camera
// was not reaching it. A frame that is not plausible base64 JPEG, PNG, GIF or WebP is dropped.
export const MAX_IMAGE = 3 * 1024 * 1024;
// the media type from the first bytes, as server.mjs sniffMediaType does
const KINDS = [['/9j/', 'image/jpeg'], ['iVBORw0KGgo', 'image/png'], ['R0lGOD', 'image/gif'], ['UklGR', 'image/webp']];
export const mediaOf = (s) => (KINDS.find(([p]) => s.startsWith(p)) || [])[1] || null;
export const isImage = (s) => typeof s === 'string' && s.length > 100 && s.length <= MAX_IMAGE && !!mediaOf(s) && /^[A-Za-z0-9+/=]+$/.test(s);
export function imageTurn(prompt, image) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: mediaOf(image), data: image } },
    { type: 'text', text: String(prompt) },
  ] } }) + '\n';
}

export async function thinkWithClaude({ bin, env, tmpDir, system, prompt, model, effort, timeoutMs = TIMEOUT_MS, runner, onPart, image }) {
  mkdirSync(tmpDir, { recursive: true });
  const dir = mkdtempSync(join(tmpDir, 'brain-'));
  try {
    // the system prompt through a 0600 file, not argv (argv is readable by
    // every process on the machine, and this one carries a presence's memory)
    const sysFile = join(dir, 'system.txt');
    writeFileSync(sysFile, String(system) + BRIDGE_NOTE, { mode: 0o600 });
    const stream = typeof onPart === 'function';
    const seen = isImage(image);
    const go = runner || (stream || seen ? runStreaming : run);
    const input = seen ? imageTurn(prompt, image) : String(prompt);
    const r = await go(bin, claudeArgs({ sysFile, model, effort, stream, image: seen }), { cwd: dir, env, timeout: timeoutMs, input, onPart });
    const res = resultOf(r.stdout);
    const said = typeof res?.result === 'string' ? res.result : '';
    if (!res || res.is_error || r.code !== 0) {
      const why = said || r.stderr || `exit ${r.code}`;
      if (AUTH_FAIL.test(why)) return { ok: false, code: 'signed-out', error: 'Claude Code is signed out on this computer: run `claude`, then /login.' };
      return { ok: false, code: r.code === null || r.code === -1 ? 'failed' : 'refused', error: String(why).slice(0, 400) };
    }
    const u = res.usage || {};
    return { ok: true, text: said.slice(0, MAX_TEXT), usage: { in: u.input_tokens | 0, out: u.output_tokens | 0, cacheRead: u.cache_read_input_tokens | 0, cacheWrite: u.cache_creation_input_tokens | 0 },
      speed: { ...speedOf(r.times, res), model: typeof res.modelUsage === 'object' && res.modelUsage ? Object.keys(res.modelUsage)[0] || null : null } };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone already */ }
  }
}
