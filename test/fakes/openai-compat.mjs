#!/usr/bin/env node
// A stand-in model on 127.0.0.1, speaking the OpenAI-compatible streaming
// chat API (and Ollama's /api/tags), for driving the REAL opencode binary with
// no model provider at all. Scripted per turn: step N answers the Nth tool
// round-trip after the last user message. Requests are logged to $MOCK_LOG.
//   node test/fakes/openai-compat.mjs <port> <script.json>
import { createServer } from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
const [port, scriptFile] = process.argv.slice(2);
let n = 0;
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.method === 'GET') {
      const j = req.url.startsWith('/api/tags') ? { models: [{ name: 'mock-coder' }] } : { object: 'list', data: [{ id: 'mock-coder', object: 'model' }] };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(j));
    }
    let q = {};
    try { q = JSON.parse(body); } catch { /* keep {} */ }
    if (process.env.MOCK_LOG) appendFileSync(process.env.MOCK_LOG, JSON.stringify({ path: req.url, tools: (q.tools || []).length, last: (q.messages || []).slice(-1)[0] }) + '\n');
    const script = JSON.parse(readFileSync(scriptFile, 'utf8'));
    const msgs = q.messages || [];
    let step;
    if (!(q.tools || []).length) step = { text: 'Mock title' };
    else {
      let lastUser = 0;
      msgs.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
      const k = msgs.slice(lastUser).filter((m) => m.role === 'tool').length;
      step = script.steps[Math.min(k, script.steps.length - 1)];
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const id = `chatcmpl-mock${n++}`;
    const send = (delta, finish = null, usage) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: q.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`);
    send({ role: 'assistant', content: '' });
    for (const w of (step.reasoning || '').split(' ').filter(Boolean)) send({ reasoning_content: w + ' ' });
    for (const w of (step.text || '').split(' ').filter(Boolean)) send({ content: w + ' ' });
    let finish = 'stop';
    if (step.tool) {
      const args = JSON.stringify(step.tool.args);
      send({ tool_calls: [{ index: 0, id: `call_${n++}`, type: 'function', function: { name: step.tool.name, arguments: '' } }] });
      send({ tool_calls: [{ index: 0, function: { arguments: args } }] });
      finish = 'tool_calls';
    }
    send({}, finish, { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280, prompt_tokens_details: { cached_tokens: 200 }, completion_tokens_details: { reasoning_tokens: 20 } });
    res.end('data: [DONE]\n\n');
  });
}).listen(Number(port), '127.0.0.1');
