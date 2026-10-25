// ============================================================================
// kode-drop.js — A PICTURE DROPPED WHILE KODE IS OPEN GOES TO THE CODER.
//
// Colin, 2026-10-25: "i can't drag photos into y3kode because they go to chat
// instead -- make sure that when you're draggin a photo into y3kode, the photo
// gets added to the coding conversation unless it's explicitly dropped in the
// chat bar". A file dragged into the page used to open the chat and be read
// into the presence's next turn (main.js), wherever it was let go. Now, while
// kode is open, only a drop ON the chat bar (#chat) goes there; anywhere else
// it joins the composer's next message to the coder (code-view.js onDrop →
// addImage), which already carried pasted and picked pictures to y3kode on
// this computer and never to the site (CODE.md, line 2). Outside kode nothing
// changes. Pure, so the routing is tested on fake events
// (test/kode-drop.test.mjs).
// ============================================================================

// Does this drag carry files (not words, not a link dragged from the page)?
export const hasFiles = (e) => Array.from(e?.dataTransfer?.types || []).includes('Files');

// WHERE A DROP GOES: 'chat' or 'kode'.
//   e      the drag event; only its target is read
//   state  { inCode }: whether kode is open (body.in-code)
// The chat bar is #chat and everything inside it, walked up from the target
// (a text node under the pointer included). With the bottom bar folded the chat
// bar takes no pointer in kode (styles.css), so nothing under it is the target.
export function dropTarget(e, state) {
  if (!state?.inCode) return 'chat';
  for (let n = e?.target || null; n; n = n.parentNode) if (n.id === 'chat') return 'chat';
  return 'kode';
}

// WHAT A CODER IS HANDED AS IT IS. Every coder y3kode drives reads PNG, JPEG,
// GIF and WebP (y3k-code/adapters/*.mjs drop anything else), and Anthropic
// refuses an image over 5MB of base64 (test/media.test.mjs). Anything else, a
// phone's HEIC or a screenshot past that, is redrawn to fit before it is
// attached (code-view.js addImage, src/picture.js), as the chat's pictures are.
export const KODE_KINDS = /^image\/(png|jpeg|gif|webp)$/;
export const KODE_B64_MAX = 5 * 1024 * 1024;
export const fitsAsIs = (file) => !!file && KODE_KINDS.test(file.type || '') && Math.ceil((file.size || 0) / 3) * 4 <= KODE_B64_MAX;
