// WHY THE BRAIN DID NOT ANSWER, as one of a few fixed words.
//
// Every provider call already comes back { ok: false, status, detail } when it
// fails, and the server has always logged exactly what went wrong
// ("[upstream] byok openai 429 You exceeded your current quota…"). The page was
// told none of it: the stream said `error: 'unavailable'`, the plain route said
// `available: false`, and brain.js turned all of it into one line that sent the
// person to Settings → Brain. That line covered a revoked key, an account out of
// credit, a rate limit, a retired model, a provider having a bad hour, and a
// phone on a train that had simply lost its signal.
//
// So the server names the reason, from the status first and the provider's own
// text second, and sends only the word. The text itself never leaves the server
// log: a provider's message can echo part of the key ("Incorrect API key
// provided: sk-proj-****abcd"). The patterns on the text are kept narrow on
// purpose. Providers reword their errors, and when one is not recognised the
// answer is null, which the page reads as its old general line. A confident
// wrong line ("out of credit" for a per-minute limit) is worse than that.
//
//   key          the provider turned the key away (401, 403; a 400 that says
//                the API key is invalid)
//   credit       the account behind the key has no credit left, or the key has
//                spent what it was allowed (402; a 400 or 429 that says so, as
//                Anthropic and OpenAI do; OpenRouter's 403 "Key limit exceeded")
//   rate         the provider is limiting how often the key may be used (429)
//   model        the key cannot use the model that was asked for (404; a 400
//                or 403 that says so)
//   busy         the trouble is on the provider's side (408, 5xx, 529, and an
//                "overloaded" error in the middle of a stream)
//   unreachable  the site got no answer: the connection failed, timed out, or
//                broke partway
//
// Server-only. Two more reasons are the page's own (src/brain.js): 'dropped'
// (its own connection to the site went quiet or broke) and 'offline'.

export const UPSTREAM_WHYS = ['key', 'credit', 'rate', 'model', 'busy', 'unreachable'];

// OpenAI answers 429 for two different things, told apart only by the error's
// code: insufficient_quota (no money left) and rate_limit_exceeded (too fast).
// Its rate-limit message also ends with a link to the billing page, so on a
// 429 the rate wording is looked for BEFORE the money wording, and the explicit
// quota code before both.
const QUOTA_CODE = /insufficient_quota|exceeded your current quota/i;
const RATE = /rate.?limit/i;
// "Your credit balance is too low" (Anthropic, as a 400), "Insufficient
// credits" (OpenRouter), "check your plan and billing details" (OpenAI).
const CREDIT = /\bcredits?\b|\bbalance\b|\bbilling\b|payment required|insufficient funds/i;
// A 400 is the catch-all for a malformed request, so it only names the model
// when it says the model is the problem. "This model's maximum context length"
// is not that, and stays unrecognised.
const MODEL = /\bmodel\b[^.\n]{0,80}?\b(?:not found|does not exist|not available|not supported|unsupported|not a valid|invalid|unknown|deprecated|retired|no longer|do not have access|does not have access)\b|\b(?:invalid|unknown|unsupported|not a valid) model\b|no endpoints found/i;
const KEY = /api.?key[^.\n]{0,40}?\b(?:invalid|not valid|incorrect|malformed)\b|\b(?:invalid|incorrect|malformed) api.?key/i;
// A 401 or 403 is the key, except when it says otherwise: OpenRouter answers
// 403 when a moderated model flagged the input, and OpenAI when the request
// came from a country it does not serve. Neither is the key, and there is no
// line for either, so they stay unrecognised.
const NOT_KEY = /moderat|flagged|country|region|territory/i;
// Two more 403s are not the key either, and do have a line. OpenAI answers 403
// model_not_found ("Project `proj_x` does not have access to model `m-x`")
// when the key's project may not use the model chosen in Settings → Brain, and
// OpenRouter answers 403 "Key limit exceeded (total limit)" when the key has
// spent the limit its owner set on it. Both were said as a mistyped or revoked
// key, for a key that works, and airden and the komputer stopped on it.
const MODEL_REFUSED = /model_not_found|access to model/i;
const KEY_SPENT = /key limit exceeded/i;
// The middle of a stream, where there is no status: an error event, or the
// connection breaking. server.mjs puts the event's type (Anthropic) or code
// (OpenAI, OpenRouter) in front of its message, and these read it as the
// status the same refusal would have had before the stream began. OpenRouter's
// code already is that status. A prefix not listed here is not guessed at.
const CODE_STATUS = {
  invalid_request_error: 400, authentication_error: 401, permission_error: 403, not_found_error: 404,
  rate_limit_error: 429, api_error: 500, overloaded_error: 529,
  invalid_api_key: 401, insufficient_quota: 402, model_not_found: 404, rate_limit_exceeded: 429, server_error: 500,
};
const PREFIX = /^([a-z][a-z_]*|\d{3}):\s*/;
// …and with no prefix at all: words that say the provider's side, then a cut line
const STREAM_BUSY = /overloaded|internal server error|\b5\d\d\b/i;

function fromStatus(code, text) {
  if (code === 401 || code === 403) {
    if (MODEL_REFUSED.test(text)) return 'model';
    if (KEY_SPENT.test(text)) return 'credit';
    return NOT_KEY.test(text) ? null : 'key';
  }
  if (code === 402) return 'credit';
  if (code === 429) {
    if (QUOTA_CODE.test(text)) return 'credit';
    if (RATE.test(text)) return 'rate';
    return CREDIT.test(text) ? 'credit' : 'rate';
  }
  if (code === 404) return 'model';
  if (code === 400) {
    if (CREDIT.test(text) || QUOTA_CODE.test(text)) return 'credit';
    if (KEY.test(text)) return 'key';
    if (MODEL.test(text)) return 'model';
    return null;
  }
  if (code === 408 || (code >= 500 && code <= 599)) return 'busy';
  return null;
}

// → one of UPSTREAM_WHYS, or null when the failure is not one we can name.
export function upstreamWhy(out) {
  if (!out || out.ok) return null;
  const status = out.status;
  const text = String(out.detail || '');
  // a number, or OpenRouter's code from its 200-with-an-error envelope, which
  // can come as a string
  if (typeof status === 'number' || /^\d{3}$/.test(String(status))) return fromStatus(Number(status), text);
  // Statuses the providers set themselves (server.mjs BRAIN_PROVIDERS).
  if (status === 'network' || status === 'timeout') return 'unreachable';
  if (status === 'stream') {
    const pre = PREFIX.exec(text);
    if (pre) {
      const code = /^\d{3}$/.test(pre[1]) ? Number(pre[1]) : CODE_STATUS[pre[1]];
      return code ? fromStatus(code, text.slice(pre[0].length)) : null;
    }
    if (QUOTA_CODE.test(text)) return 'credit';
    if (STREAM_BUSY.test(text)) return 'busy';
    if (RATE.test(text)) return 'rate';
    // 'terminated', 'other side closed', an error event with no words at all
    return 'unreachable';
  }
  return null;
}
