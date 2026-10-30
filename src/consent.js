// consent.js — WHAT YOU AGREE TO BY PRESSING THE BUTTON.
//
// Colin, 2026-10-25: "in any situation where you want to ensure user safety,
// just add a note that explains what they are agreeing to by pushing the
// button, and then offer the 'change to always allow' 'allow just this time'
// or 'cancel' options, and add a corresponding field to TOS."
//
// One dialog for every such moment: a title, the note in plain words, and
// three answers. "Always allow" is remembered in this browser for that kind of
// moment and the dialog is not shown again for it (Settings can forget it);
// "allow just this time" allows once; "cancel" does nothing. Each kind has its
// field in the terms (legal.html, "What you agree to"), so the note and the
// terms say the same thing. Nothing here does the thing itself: the caller
// does, once this has answered.
const KEY = (kind) => `y3k.consent.${kind}`;

export function remembered(kind, store = localStorage) {
  try { return store.getItem(KEY(kind)) === 'always'; } catch { return false; }
}
export function forget(kind, store = localStorage) {
  try { store.removeItem(KEY(kind)); } catch { /* private window */ }
}
export function forgetAll(store = localStorage) {
  try { for (const k of Object.keys(store)) if (k.startsWith('y3k.consent.')) store.removeItem(k); } catch { /* */ }
}

/** → 'always' | 'once' | null. Remembered kinds answer 'always' without asking. */
export function consent({ kind, title, note, always = 'always allow', once = 'allow just this time', cancel = 'cancel', doc = null, store = null } = {}) {
  if (!kind) throw new Error('a consent has a kind');
  doc ??= globalThis.document; store ??= globalThis.localStorage;
  if (remembered(kind, store)) return Promise.resolve('always');
  return new Promise((resolve) => {
    const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const scrim = el('div', 'consent-scrim');
    const card = el('div', 'consent-card');
    card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
    const h = el('h3', 'consent-title', title); h.id = 'consent-title'; card.setAttribute('aria-labelledby', h.id);
    const p = el('p', 'consent-note', note);
    const acts = el('div', 'consent-acts');
    const bCancel = el('button', 'login-alt consent-cancel', cancel); bCancel.type = 'button';
    const bOnce = el('button', 'login-alt consent-once', once); bOnce.type = 'button';
    const bAlways = el('button', 'create-go consent-always', always); bAlways.type = 'button';
    const terms = el('a', 'consent-terms', 'the terms say the same'); terms.href = '/legal.html#terms'; terms.target = '_blank'; terms.rel = 'noopener';
    acts.append(bCancel, bOnce);
    if (always !== false) acts.append(bAlways);   // a question with no 'always' (kode from anywhere: a permission every time)
    card.append(h, p, acts, terms);
    scrim.append(card);
    const done = (answer) => {
      scrim.remove(); doc.removeEventListener('keydown', onKey, true);
      if (answer === 'always') { try { store.setItem(KEY(kind), 'always'); } catch { /* */ } }
      resolve(answer);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    bCancel.addEventListener('click', () => done(false));   // the cancel button is an answer (false); Esc and the scrim are none (null)
    bOnce.addEventListener('click', () => done('once'));
    bAlways.addEventListener('click', () => done('always'));
    scrim.addEventListener('click', (e) => { if (e.target === scrim) done(null); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(scrim);
    bCancel.focus();
  });
}
