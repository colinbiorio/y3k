#!/usr/bin/env node
// M8 SPIKE — "bring a cloud session here". Run by hand, on your own machine,
// with your own Claude sign-in, against a claude.ai/code session you choose.
// It answers one question: can a local program ATTACH to a running cloud
// session through the unmodified `claude` binary in its streaming mode?
//
//   node scripts/code-cloud-spike.mjs <claude.ai/code URL or session id> --yes
//   node scripts/code-cloud-spike.mjs <…> --yes --send "what are you working on?"
//
// Read-only unless you pass --send: it attaches, prints every event type it
// sees for 30 seconds (does the history replay? do live events arrive?), then
// closes. With --send it also sends ONE message into that session — which the
// session will see as coming from you. Nothing else is done; nothing is saved.
//
// Tier B (a local copy) is interactive by design and stays in a terminal:
//   cd <a clean clone of the session's repository>
//   claude --teleport <session id>
// after which y3k Code can continue it like any local session (Past sessions →
// the teleported one, or session.resume with its id).

import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const ref = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--send');
const send = argv.includes('--send') ? argv[argv.indexOf('--send') + 1] : null;
if (!ref || !argv.includes('--yes')) {
  console.log('Usage: node scripts/code-cloud-spike.mjs <claude.ai/code URL or session id> --yes [--send "text"]');
  console.log('Attaches to that cloud session through `claude -p --cloud`, read-only unless --send.');
  process.exit(2);
}
const id = (/(session_[A-Za-z0-9]{10,64})/.exec(ref) || [])[1];
if (!id) { console.error('That does not look like a claude.ai/code session (session_…).'); process.exit(2); }

const args = ['-p', '--cloud', id, '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
console.log(`$ claude ${args.join(' ')}\n`);
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_SESSION_ID|CLAUDE_CODE_REMOTE\w*)$/.test(k)) delete env[k];
const child = spawn('claude', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
const seen = new Map();
let buf = '';
child.stdout.setEncoding('utf8').on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      const k = `${e.type}${e.subtype ? '/' + e.subtype : ''}${e.event?.type ? ':' + e.event.type : ''}`;
      seen.set(k, (seen.get(k) || 0) + 1);
      if (seen.get(k) === 1) console.log(`  first ${k}: ${line.slice(0, 220)}`);
    } catch { console.log(`  (not json) ${line.slice(0, 200)}`); }
  }
});
child.stderr.setEncoding('utf8').on('data', (d) => process.stderr.write(`  [stderr] ${d}`));
child.on('exit', (code) => {
  console.log(`\nexit ${code}. Event types seen:`);
  for (const [k, n] of seen) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log('\nTier A works if: it stays attached, a system/init names the cloud session, and (with --send) an assistant reply streams back.');
  process.exit(0);
});
if (send) setTimeout(() => child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: send }] }, parent_tool_use_id: null }) + '\n'), 3000);
setTimeout(() => { child.stdin.end(); setTimeout(() => child.kill('SIGTERM'), 3000); }, 30000);
