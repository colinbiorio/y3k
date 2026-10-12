#!/usr/bin/env node
// A stand-in for `claude -p` as the founder's LOCAL BRAIN runs it, for the
// recall smoke (scripts/recall-smoke.mjs). In a reflection (the system prompt
// carries A QUIET MOMENT) it says one quiet sentence. In any other moment it
// reaches into its journal for "the sea", so the smoke can watch what the
// recall brings back. Every call is logged with its whole system prompt, which
// is how the smoke sees what a reflection was shown.
import { readFileSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const sysFile = args[args.indexOf('--system-prompt-file') + 1];
const system = sysFile ? readFileSync(sysFile, 'utf8') : '';
const LOG = process.env.FAKE_BRAIN_LOG;
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const reflecting = system.includes('A QUIET MOMENT');
  if (LOG) appendFileSync(LOG, JSON.stringify({ kind: reflecting ? 'reflect' : 'other', system, input }) + '\n');
  const reply = reflecting
    ? '[calm] I sat with what came back.'
    : '[calm drift] I am reaching back for the sea. <<recall: the sea>>';
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } } });
  out({ type: 'assistant', message: { model: 'claude-fake', content: [{ type: 'text', text: reply }] } });
  out({ type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', result: reply, usage: { input_tokens: 900, output_tokens: 40 } });
  setTimeout(() => process.exit(0), 20);
});
