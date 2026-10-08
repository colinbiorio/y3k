#!/usr/bin/env node
// A stand-in for `claude -p` as the founder's LOCAL BRAIN runs it, for the
// world's verbs (test/world-verbs.test.mjs, scripts/play-smoke.mjs). Whatever
// mode the beat is in, it answers the same way: a sentence and four world
// verbs (lead north, call across, name a way, send sprite 1 for coal). The
// same reply on an auto beat and on a play beat is the point: only play may
// move the world, and the test sees which one did. Every call is logged with
// its system prompt.
import { readFileSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const sysFile = args[args.indexOf('--system-prompt-file') + 1];
const system = sysFile ? readFileSync(sysFile, 'utf8') : '';
const LOG = process.env.FAKE_BRAIN_LOG;
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  if (LOG) appendFileSync(LOG, JSON.stringify({ system, input }) + '\n');
  const reply = '[calm orb] Coal first, then we will see what the north holds.'
    + ' <<go: north>> <<hail: we are new here, and we mean well>>'
    + ' <<way: we build our walls low, so the wind passes>> <<send: 1 for 4 coal>>';
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } } });
  out({ type: 'assistant', message: { model: 'claude-fake', content: [{ type: 'text', text: reply }] } });
  out({ type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', result: reply, usage: { input_tokens: 900, output_tokens: 80 } });
  setTimeout(() => process.exit(0), 20);
});
