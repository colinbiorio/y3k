// HOW THE FEED'S ANSWERS TRAVEL. Server-only (every root .mjs is refused by
// the static server).
//
// An open feed asks again every ten seconds, and every answer went out whole:
// no validator, so the same page was sent again unchanged, and never
// compressed. Measured on a throwaway server holding 140 posts (one of them
// 20,000 words long, a few of a few thousand): 238 KB a poll, about 86 MB an
// hour for one open tab, on a phone's data plan as much as anywhere. The
// site's files learned this in delivery.mjs; these answers now do the same,
// with delivery.mjs's own pieces:
//
//  - every answer carries a strong ETag, the hash of its bytes, and a page
//    that already holds those bytes gets a 304 with no body. The tag is of
//    what THIS viewer is sent (their own votes, their blocks), so a 304 can
//    never hand anyone another person's page;
//  - an answer of a kilobyte or more goes brotli- or gzip-compressed when the
//    browser takes it;
//  - `private`: a cache between the person and us must not keep a page that
//    carries their votes. Their own browser may, and asks again each time.
//
// Compressed at a quick level and never polished, as delivery.mjs polishes the
// site's files: a feed page lives for seconds, and on a small instance one
// busy core is everyone's.

import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { etagOf, negotiate, notModified, tagFor, MIN_COMPRESS_BYTES } from './delivery.mjs';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
// Quality 5, as delivery.mjs's first copy of a file: a few milliseconds for a
// page of the feed, where 11 costs a hundred times that for a tenth less.
const BR_QUICK = (n) => ({ params: {
  [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: n,
  [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
} });
const GZIP = { level: 6 };

// The last few compressed answers, by tag and encoding. Everyone who is not
// signed in is sent the same page of the feed, and a new post reaches every
// one of their polls within ten seconds: this makes that one compression, not
// one each. Bounded by count and by bytes, oldest out first.
const recent = new Map();
const RECENT_MAX = 32;
const RECENT_BYTES = 4 * 1024 * 1024;
let recentBytes = 0;
const making = new Map();

function squeeze(data, etag, enc) {
  const key = etag + enc;
  const hit = recent.get(key);
  if (hit) { recent.delete(key); recent.set(key, hit); return Promise.resolve(hit); }
  if (making.has(key)) return making.get(key);
  const p = (enc === 'br' ? brotli(data, BR_QUICK(data.length)) : gzip(data, GZIP))
    .then((buf) => {
      recent.set(key, buf);
      recentBytes += buf.length;
      for (const [k, v] of recent) {
        if (recent.size <= RECENT_MAX && recentBytes <= RECENT_BYTES) break;
        recent.delete(k);
        recentBytes -= v.length;
      }
      return buf;
    })
    .finally(() => making.delete(key));
  making.set(key, p);
  return p;
}

// `obj` as the answer to `req`: { status, body, headers }, for the caller to
// send with its own headers (server.mjs's send(), which adds the security
// headers every answer carries). Status is 200, or 304 when the page already
// holds exactly these bytes. Only for answers that are the same whenever the
// same thing is asked: an error goes out the ordinary way.
export async function jsonAnswer(req, obj, type = 'application/json; charset=utf-8') {
  const data = Buffer.from(JSON.stringify(obj));
  const etag = etagOf(data);
  const always = { 'Cache-Control': 'private, no-cache', Vary: 'Accept-Encoding' };
  // never by the clock: these answers have no date of their own (Infinity
  // makes If-Modified-Since match nothing)
  const held = notModified(req, etag, Infinity);
  if (held) return { status: 304, body: '', headers: { ...always, ETag: held } };
  const enc = data.length >= MIN_COMPRESS_BYTES ? negotiate(req.headers['accept-encoding']) : null;
  const body = enc ? await squeeze(data, etag, enc) : data;
  return {
    status: 200,
    body,
    headers: {
      ...always,
      'content-type': type,
      ETag: tagFor(etag, enc, true),
      'Content-Length': body.length,
      ...(enc ? { 'Content-Encoding': enc } : {}),
    },
  };
}
