#!/usr/bin/env node
// A stand-in for `claude -p` as the founder's LOCAL BRAIN runs it, for airden
// (test/airden-routes.test.mjs, scripts/airden-smoke.mjs). Asked to speak on its
// own (the system prompt carries SPEAKING ON YOUR OWN), it says a numbered
// stretch: short when asked for 3 to 5 sentences, longer otherwise, with a tag
// that turns part-way through — and it tries to post and to keep a memory, so
// the route can be seen keeping the memory and dropping the post. Asked
// anything else, it answers like a reply. Every call is logged.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const sysFile = args[args.indexOf('--system-prompt-file') + 1];
const system = sysFile ? readFileSync(sysFile, 'utf8') : '';
const LOG = process.env.FAKE_BRAIN_LOG;
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const speaking = system.includes('SPEAKING ON YOUR OWN');
  const n = LOG && existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('"speak"')).length + 1 : 1;
  if (LOG) appendFileSync(LOG, JSON.stringify({ kind: speaking ? 'speak' : 'chat', n, system: system.slice(-4000), input }) + '\n');
  let reply;
  if (speaking) {
    const short = /3 to 5 sentences/.test(input);
    const lines = [`[tender orb bloom] Stretch ${n} opens here.`, `The second thought of stretch ${n} follows on.`, `[excited] And a brighter third one, stretch ${n}.`];
    if (!short) lines.push(`Stretch ${n} keeps going, a fourth.`, `A fifth from stretch ${n}.`, `[calm] And the sixth of stretch ${n} rests.`);
    reply = lines.join(' ') + ` <<memory short: I spoke on my own, stretch ${n}>> <<post: this must never be posted>>`;
  } else {
    reply = '[calm] I heard you, and I am answering before I go on.';
  }
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } } });
  out({ type: 'assistant', message: { model: 'claude-fake', content: [{ type: 'text', text: reply }] } });
  out({ type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', result: reply, usage: { input_tokens: 900, output_tokens: 120 } });
  setTimeout(() => process.exit(0), 20);
});
