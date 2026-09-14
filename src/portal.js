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
//   ⚠ AND MOSTLY IT WILL BE THE FRONT DOOR. I first wrote here that this hung
// on 4irden's SameSite cookie policy. It does not — I had not read that
// codebase yet, and it does not use cookies at all. 4irden authenticates with
// an HMAC-signed BEARER TOKEN (backend/server.py, bind_request_identity) that
// its web build keeps in localStorage.
//   Which makes the real constraint third-party STORAGE PARTITIONING, and that
// is worse: Safari and Firefox partition a framed origin's localStorage by
// default, so the 4irden inside this circle reads an empty store, finds no
// token, and boots signed out. Chrome does not partition yet and is heading
// there. Nothing on the y3k side can change that, and nothing should — an app
// that could reach into another origin's storage is the bug, not the feature.
//   Its API cannot be the way round either, and correctly so: every /gardens
// route is behind that same middleware and answers 401 without a token.
//   So a genuinely PERSONAL live view needs 4irden to offer one deliberately —
// a signed, revocable share link the user generates there and pastes here,
// rendering a read-only view of their own garden. That works in every browser,
// crosses no auth boundary, and is the user's explicit choice rather than a
// side effect of being logged in somewhere else.
//   THOUGH GOING THROUGH ALREADY SOLVES IT. The click opens a real window on
// 4irden.com, which is FIRST-PARTY there and therefore has the ordinary,
// unpartitioned localStorage with your token in it — so you land in your own
// garden, signed in, with nothing changed on either side. The preview behind
// the glass is the far place seen through a doorway; stepping through is how
// you actually arrive.
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

  // THROUGH IT, IN A WINDOW OF ITS OWN — and this is the whole answer to the
  // problem the comment above describes, not a nicer way to present it.
  //
  // A popup is a TOP-LEVEL browsing context. The frame in the portal is a third
  // party and gets a partitioned, empty localStorage, which is why it can only
  // ever show 4irden's front door. A window opened this way is first-party on
  // 4irden.com: same storage the site sees when you visit it directly, so the
  // bearer token is right there and you arrive already signed in, looking at
  // your own garden. No change to 4irden, no share link, no cookie policy —
  // the browser was never the obstacle, the FRAME was.
  //
  // Sized and placed like something that came through a door rather than a tab:
  // a tall portrait window, centred on whichever screen the app is on.
  el.addEventListener('click', () => {
    const w = Math.min(560, Math.round(screen.availWidth * 0.42));
    const h = Math.min(900, Math.round(screen.availHeight * 0.86));
    // screenX/availLeft so it lands on the display y3k is on, not always the primary
    const left = Math.round((screen.availLeft || 0) + (screen.availWidth - w) / 2);
    const top = Math.round((screen.availTop || 0) + (screen.availHeight - h) / 2);
    const win = window.open(HOME, 'airden-portal',
      `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
    // a blocked popup is not a dead end: fall back to the tab rather than
    // swallowing the click
    if (!win) window.open(HOME, '_blank', 'noopener,noreferrer');
    else win.focus();
  });

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
