// WHAT A POST'S MEDIA MAY BE, AND WHAT A CHAT TURN MAY CARRY, said once for
// both ends. The composer (src/social.js) and the chat (src/main.js) check a
// file against these before anything is uploaded; the server (media.mjs, and
// the /api/posts and /api/brain routes in server.mjs) holds every request to
// the same numbers. Shared, so it lives in src/ and imports nothing.
//
// Why it is one file (audit, 2026-10-08): the two ends had drifted apart, and
// a person only ever found out after the upload. The composer promised
// ten-minute videos and never looked at a file's size, while the server kept
// 24MB at most and said so after a paid screening call on the poster's key.
// The chat let a 3MB picture through to routes that read 1MB, and the turn
// went on as words alone.

export const MB = 1024 * 1024;

// Per file, decoded. Video is the one that decides whether the disk survives
// (media.mjs keeps 500MB for everyone), which is why it is not minutes.
export const MEDIA_CAPS = Object.freeze({ image: 3 * MB, video: 24 * MB, audio: 16 * MB });
export const MAX_MEDIA = 20;                 // files in one post
// The whole JSON body of one post. Files travel as base64, 4/3 of their size,
// so this is about 48MB of files, posters and text included.
export const POST_BODY_MAX = 64 * MB;
// What a post may carry in all, said in the units a person picks files in.
export const POST_MEDIA_MB = Math.floor((POST_BODY_MAX * 3) / 4 / MB);

// A chat turn's whole body, as /api/brain and /api/brain/stream read it, and
// the base64 an attached picture may take of it. The rest is the window of
// conversation (twelve turns) and the key.
export const BRAIN_BODY_MAX = 1 * MB;
export const CHAT_IMAGE_MAX = 700_000;

const mb = (n) => `${Math.round(n / MB)}MB`;
// The refusal for a file over its kind's cap. The composer says it when the
// file is picked, and the server says the same words if one arrives anyway.
export function tooLarge(kind) {
  if (kind === 'video') return `that video is over ${mb(MEDIA_CAPS.video)}, the limit for one clip. Trim it or save it at a lower quality`;
  if (kind === 'audio') return `that sound is over ${mb(MEDIA_CAPS.audio)}, the limit for one file`;
  return `that image is over ${mb(MEDIA_CAPS.image)}, the limit for one picture`;
}
export const POST_TOO_LARGE = `a post can carry about ${POST_MEDIA_MB}MB of media in all. Remove something`;

// AN ANIMATED PICTURE CANNOT BE SCREENED, SO IT IS NOT POSTED. The judge
// (moderation.mjs) looks at one still. An animated GIF, PNG or WebP then plays
// every frame to everyone in the feed, by itself, and only the first was ever
// looked at; an APNG's default image need not be one of the frames a browser
// plays at all. Judging every frame would mean a decoder this server does not
// have and a paid call per frame on the poster's key, so they are refused: by
// the composer when one is picked, and by the server before any screening.
export const ANIMATED = "animated images can't be posted, because only a still image can be screened";

// Does this file (a Uint8Array; a Buffer is one) move? Each format is walked
// by its own structure, never searched for bytes: the letters of 'acTL' can
// turn up inside compressed pixels. A GIF, PNG or WebP that cannot be walked
// (cut short, or not what it says) counts as moving, so a malformed one is
// refused rather than let through. Anything else (JPEG, sound, video) is not
// a picture that animates, and answers false.
export function isAnimated(b) {
  const f = mayAnimate(b);
  return f === 'gif' ? gifMoves(b) : f === 'png' ? pngMoves(b) : f === 'webp' ? webpMoves(b) : false;
}
// Could a file starting with these bytes move at all? Its first twelve are
// enough to say, so the composer reads a whole file only when it could.
export function mayAnimate(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  return null;
}
const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));

// GIF: count the images. NETSCAPE2.0 (the loop block) is not the sign: a GIF
// without it still plays its frames once and stays on the last, which can be
// any of them. Two image descriptors is two frames.
function gifMoves(b) {
  const n = b.length;
  if (n < 13) return true;
  let p = 13;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));     // the global colour table
  let frames = 0;
  // past the image's data: sub-blocks, each a length and that many bytes, to a zero
  const skipBlocks = (q) => {
    while (q < n) { const len = b[q]; q += 1; if (len === 0) return q; q += len; }
    return -1;
  };
  for (;;) {
    // The end of the bytes at a block boundary is a still that lacks its
    // trailer, which some encoders leave off; there is nothing after it to play.
    if (p >= n || b[p] === 0x3b) return frames !== 1;
    if (b[p] === 0x21) {                                  // an extension: its label, then sub-blocks
      p = skipBlocks(p + 2);
      if (p < 0) return true;
    } else if (b[p] === 0x2c) {                           // an image descriptor: a frame
      frames += 1;
      if (frames > 1 || p + 10 > n) return true;
      const packed = b[p + 9];
      p += 10;
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1)); // its local colour table
      p = skipBlocks(p + 1);                              // past the LZW code size, the data
      if (p < 0) return true;
    } else {
      return true;                                        // not a GIF block: unreadable
    }
  }
}

// PNG: walk the chunks to IEND. Any of the three APNG chunks, wherever it sits,
// means a browser will play frames the still (IDAT) does not show.
function pngMoves(b) {
  const n = b.length;
  let p = 8;
  while (p + 8 <= n) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    const type = ascii(b, p + 4, p + 8);
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return true;
    if (type === 'IEND') return false;
    p += 12 + len;                                        // length, type, data, CRC
  }
  return true;                                            // cut short before IEND
}

// WebP: the extended header's animation flag, and the chunks an animation is
// made of (ANIM, ANMF), wherever they sit. RIFF sizes are little-endian, and a
// chunk of odd length is padded by one byte.
function webpMoves(b) {
  const riff = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
  const end = Math.min(b.length, 8 + riff);
  let p = 12;
  if (p + 8 <= end && ascii(b, p, p + 4) === 'VP8X' && p + 9 <= end && (b[p + 8] & 0x02)) return true;
  while (p + 8 <= end) {
    const type = ascii(b, p, p + 4);
    const len = (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24)) >>> 0;
    if (type === 'ANIM' || type === 'ANMF') return true;
    p += 8 + len + (len & 1);
  }
  return p !== end;                                       // a chunk ran past the end
}
