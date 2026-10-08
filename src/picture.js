// A PICTURE, MADE TO FIT (audit, 2026-10-08). The composer and the chat each
// carry a picture inside a body the server reads only so far, and a phone's
// photo is often more than that: 12 to 50 megapixels, 3 to 8MB, sometimes in a
// format (HEIC, AVIF) the server neither keeps nor labels right. So it is
// redrawn here, in the browser, before anything is sent.

import { isAnimated, mayAnimate } from './media-rules.mjs';

// Drawn onto a canvas at most `side` pixels on its long side, white under any
// transparency (a JPEG has none, and a transparent PNG would come out black),
// and encoded as a JPEG, smaller and coarser until it is `maxBytes` or less.
// The <img> decode keeps the photo's EXIF orientation, which a canvas copies.
// Returns a Blob, or null when this browser cannot decode the file (HEIC in
// Chrome, say) or no step makes it small enough.
const STEPS = [[1, 0.85], [1, 0.7], [0.75, 0.7], [0.5, 0.6]];   // [share of side, JPEG quality]
export async function shrinkPicture(file, { side, maxBytes }) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    for (const [share, quality] of STEPS) {
      const scale = Math.min(1, (side * share) / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) return blob;
    }
    return null;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

// Does this picked file move (src/media-rules.mjs walks it)? Its first bytes
// say whether it could, so a JPEG is never read whole for this.
export async function movingPicture(file) {
  try {
    if (!mayAnimate(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) return false;
    return isAnimated(new Uint8Array(await file.arrayBuffer()));
  } catch { return false; }   // unreadable here: the server walks it again before anyone is paid
}
