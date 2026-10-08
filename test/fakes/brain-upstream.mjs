// The three brain providers, faked, each failing the way it really does:
// Anthropic, OpenAI and OpenRouter answer from here instead of the network.
// Preloaded into a spawned server (node --import) by test/upstream-why.test.mjs,
// and only when FAKE_BRAIN_LOG is set; every call that would have left the
// machine is appended to that file as one JSON line.
//
// The key says how it fails. Each refusal's message carries the key itself, as
// OpenAI's "Incorrect API key provided: sk-proj-****abcd" does, so the test can
// show that no provider's words reach the page.
import { appendFileSync } from 'node:fs';

const HOSTS = new Set(['api.anthropic.com', 'api.openai.com', 'openrouter.ai']);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (lines) => new Response(lines.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const anthropicError = (status, type, message) => json(status, { type: 'error', error: { type, message } });
const openaiError = (status, type, code, message) => json(status, { error: { message, type, param: null, code } });

export function isUpstream(url) {
  try { return HOSTS.has(new URL(String(url)).host); } catch { return false; }
}

export async function upstream(url, init = {}) {
  const u = new URL(String(url));
  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const key = h['x-api-key'] || String(h.authorization || '').replace(/^Bearer /, '');
  const body = init.body ? JSON.parse(init.body) : null;
  if (process.env.FAKE_BRAIN_LOG) appendFileSync(process.env.FAKE_BRAIN_LOG, JSON.stringify({ host: u.host, path: u.pathname, key, stream: !!body?.stream, t: Date.now() }) + '\n');

  if (u.host === 'api.anthropic.com') {
    // No answer at all: a connection that fails, as undici's fetch does (a
    // TypeError with its cause), and a request that runs out of time. The
    // site's own key is one key for the whole run, so a word in the
    // conversation does it there.
    if (key.startsWith('sk-ant-unplugged') || JSON.stringify(body?.messages || '').includes('unplug the line')) {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ECONNREFUSED (${key})`), { code: 'ECONNREFUSED' }) });
    }
    if (key.startsWith('sk-ant-slow')) throw new DOMException(`The operation was aborted due to timeout (${key})`, 'TimeoutError');
    if (key.startsWith('sk-ant-revoked')) return anthropicError(401, 'authentication_error', `invalid x-api-key ${key}`);
    if (key.startsWith('sk-ant-broke')) return anthropicError(400, 'invalid_request_error', `Your credit balance is too low to access the Anthropic API (${key}). Please go to Plans & Billing to upgrade or purchase credits.`);
    if (key.startsWith('sk-ant-busy')) return anthropicError(529, 'overloaded_error', `Overloaded (${key})`);
    if (key.startsWith('sk-ant-gone')) return anthropicError(404, 'not_found_error', `model: ${body?.model} (${key})`);
    // A stream that starts, says a few words, and then is cut by the provider.
    if (key.startsWith('sk-ant-midway') && body?.stream) {
      return sse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"[calm] I was just about to "}}\n\n',
        `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: `Overloaded (${key})` } })}\n\n`,
      ]);
    }
    // A stream that ends with no words (a deep think that spent the budget),
    // then a rescue that takes its time: longer than the route's ping interval
    // in the test (BRAIN_PING_MS), so a ping has to arrive while it runs.
    if (key.startsWith('sk-ant-wordless')) {
      if (body?.stream) {
        return sse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]);
      }
      await new Promise((r) => setTimeout(r, 700));
      return json(200, { content: [{ type: 'text', text: '[calm] Found the words.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 4 } });
    }
    return anthropicError(500, 'api_error', 'no script for this key');
  }

  if (u.host === 'api.openai.com') {
    if (key === 'sk-quota') return openaiError(429, 'insufficient_quota', 'insufficient_quota', `You exceeded your current quota, please check your plan and billing details (${key}).`);
    // The real rate-limit message ends with a link to the billing page.
    if (key === 'sk-fast') return openaiError(429, 'requests', 'rate_limit_exceeded', `Rate limit reached for model-x on requests per min (RPM): Limit 3, Used 3, Requested 1 (${key}). You can increase your rate limit by adding a payment method at https://platform.openai.com/account/billing.`);
    // A key that works, whose project may not use the model it asked for.
    if (key === 'sk-noaccess') return openaiError(403, 'invalid_request_error', 'model_not_found', `Project \`proj_x\` does not have access to model \`${body?.model}\` (${key})`);
    return openaiError(401, 'invalid_request_error', 'invalid_api_key', `Incorrect API key provided: ${key}.`);
  }

  // openrouter.ai
  if (key === 'sk-or-broke') return json(402, { error: { code: 402, message: `Insufficient credits (${key}). Add more using https://openrouter.ai/credits` } });
  // A key that has spent the limit its owner set on it.
  if (key === 'sk-or-capped') return json(403, { error: { code: 403, message: `Key limit exceeded (total limit) (${key}). Manage it using https://openrouter.ai/settings/keys` } });
  return json(401, { error: { code: 401, message: `No auth credentials found (${key})` } });
}

if (process.env.FAKE_BRAIN_LOG) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (isUpstream(url) ? upstream(url, init) : real(url, init));
}
