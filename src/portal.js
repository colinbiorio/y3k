// THE PORTAL — a way through to 4irden, which is the other world Colin keeps.
//
// It is deliberately not a link with an icon on it. The far side is actually in
// it: an iframe of 4irden.com, clipped to the circle and inert to the pointer,
// so the whole disc is one target and what turns behind the glass is the real
// site rather than a picture of one.
//
// WHOSE GARDEN YOU SEE IS THE BROWSER'S ANSWER, NOT OURS. y3k cannot read
// 4irden's session and must not try — different origin, and the whole point of
// that boundary. The frame carries whatever cookies the browser decides to send
// it, so a signed-in visitor gets their own garden and a stranger gets 4irden's
// front door. Both are honest; neither needs us to know anything about them.
//   ⚠ That decision is 4irden's cookie policy, not ours: a session cookie set
// SameSite=Lax or Strict — Lax being the browser default — is NOT sent into a
// cross-site frame, so a logged-in visitor would still see the signed-out page.
// Making it SameSite=None; Secure is a change on 4irden's side with a real CSRF
// tradeoff attached, which is Colin's call and not something to do quietly.
//
// The frame is loaded LAZILY, on first sight, and never on a phone: it is a
// whole second site's worth of JavaScript and an orb already owns the GPU.

const HOME = 'https://4irden.com';

export function createPortal() {
  const el = document.getElementById('portal');
  if (!el) return { destroy() {} };
  const view = el.querySelector('#portal-view');
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;

  // through it, in a new tab: leaving y3k entirely to look at a garden is not
  // what a portal is for — you should be able to come back by closing a tab
  el.addEventListener('click', () => window.open(HOME, '_blank', 'noopener,noreferrer'));

  let lit = false;
  function light() {
    if (lit || coarse || saveData) return;
    lit = true;
    // a load handler rather than a timer: the glass stays dark until there is
    // genuinely something behind it, so a blocked or slow frame reads as an
    // unlit portal instead of a white flash
    view.addEventListener('load', () => {
      if (view.src !== 'about:blank') el.classList.add('lit');
    }, { once: true });
    view.src = HOME;
  }

  // only once it is actually on screen, and only in the room
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && document.body.classList.contains('in-home')) { light(); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
  } else {
    setTimeout(() => { if (document.body.classList.contains('in-home')) light(); }, 2500);
  }

  return {
    el,
    destroy() { view.src = 'about:blank'; el.classList.remove('lit'); },
  };
}
