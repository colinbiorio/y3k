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

// RUNNING BOTH AT ONCE. The two sites are separate deploys, so the only way to
// exercise the crossing locally is to point this at a local 4irden. The override
// accepts LOCALHOST ONLY — this value is handed to window.open() and to an <img>
// src, and a query parameter that could name any origin is an open redirect with
// extra steps.
const DEFAULT_HOME = 'https://4irden.com';
const HOME = (() => {
  try {
    const q = new URL(location.href).searchParams.get('airden');
    if (!q) return DEFAULT_HOME;
    const u = new URL(q);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    return local ? u.origin : DEFAULT_HOME;
  } catch { return DEFAULT_HOME; }
})();
// Where a share link is kept. Per-browser rather than per-account on purpose:
// it is a capability URL, and the place for one of those is the machine its
// owner is sitting at, not a row on a server that then has to be trusted with it.
const LINK_KEY = 'y3k.portal.share';
const REFRESH_MS = 60000;          // the picture is cached 45s on the far side

export function portalLink() {
  try { return localStorage.getItem(LINK_KEY) || ''; } catch { return ''; }
}
// Accepts the whole URL or the bare token — people paste whichever they have.
export function setPortalLink(value) {
  const raw = String(value || '').trim();
  let token = '';
  if (raw) {
    const m = /\/share\/([A-Za-z0-9._-]+?)(?:\.svg)?(?:[?#]|$)/.exec(raw);
    token = m ? m[1] : (/^s\d+(?:\.[A-Za-z0-9_-]+){6}$/.test(raw) ? raw : '');
    if (!token) return false;
  }
  try { if (token) localStorage.setItem(LINK_KEY, token); else localStorage.removeItem(LINK_KEY); } catch { return false; }
  window.dispatchEvent(new CustomEvent('portal-link'));
  return true;
}
export const portalSrc = (token) => `${HOME}/share/${token}.svg`;

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

  // THE FAR SIDE, WHEN THERE IS A LINK TO IT.
  //   An <img>, not a frame. That one substitution deletes every problem in the
  // comment at the top of this file at once: an image opens no third-party
  // browsing context, so there is no partitioned storage to be empty; it needs
  // no CORS; and it runs no script, so 4irden's page is not loaded into this
  // origin at all. What arrives is a picture of the garden, drawn on 4irden's
  // side out of numbers, and nothing else can come with it.
  //   The link is a capability. It is never sent anywhere but to 4irden, which
  // issued it, and it lives in this browser.
  let shot = null, timer = 0;
  function showShare(token) {
    if (!shot) {
      shot = document.createElement('img');
      shot.className = 'portal-shot';
      shot.alt = '';                       // decorative: the disc is the label
      shot.decoding = 'async';
      shot.referrerPolicy = 'no-referrer';
      // A dead link falls through to 4irden's SPA catch-all, which answers HTML
      // with a 200 — an <img> cannot render that, so onerror IS the liveness
      // check, and a link revoked on the far side quietly becomes a door again.
      shot.addEventListener('error', () => { stopShare(); lightFrame(); });
      shot.addEventListener('load', () => el.classList.add('lit'), { once: true });
      view.parentElement.insertBefore(shot, view);
    }
    view.src = 'about:blank';
    el.classList.add('shared');
    const draw = () => { shot.src = portalSrc(token) + '?t=' + Math.floor(Date.now() / REFRESH_MS); };
    draw();
    clearInterval(timer);
    // only while it is actually on screen and in the room — a portal nobody is
    // looking at should not be asking another service for a picture
    timer = setInterval(() => {
      if (document.body.classList.contains('in-home') && !document.hidden) draw();
    }, REFRESH_MS);
  }
  function stopShare() {
    clearInterval(timer); timer = 0;
    if (shot) { shot.remove(); shot = null; }
    el.classList.remove('shared', 'lit');
  }

  let lit = false;
  function lightFrame() {
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
  function light() {
    const token = portalLink();
    if (token) showShare(token); else lightFrame();
  }
  window.addEventListener('portal-link', () => {
    stopShare(); lit = false; view.src = 'about:blank'; light();
  });

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
    destroy() { stopShare(); view.src = 'about:blank'; el.classList.remove('lit'); },
  };
}
