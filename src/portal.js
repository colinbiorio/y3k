// THE PORTAL — a way through to 4irden, which is the other world Colin keeps.
//
// A simple tree in unimat at the top bar's left end (Colin, 2026-10-20: "let's
// change the airden glyph from the portal to just a simple tree in unimat").
// It used to be an oval of light with 4irden live behind it, an iframe of the
// far site clipped to the disc, and, for anyone who pasted a view link into
// Settings, their own garden's picture. A tree needs none of that, so all of
// it went: the frame (a whole second site's worth of JavaScript), the glitter
// canvases, and the share link with its setting.
//
// WHERE A CLICK LANDS IS STILL YOUR OWN GARDEN. The click opens a real window
// on 4irden.com, which is first-party there and so has its ordinary storage,
// with your sign-in token in it: you arrive in your own garden, signed in, and
// nothing on either side had to read the other's session.

// RUNNING BOTH AT ONCE. The two sites are separate deploys, so the only way to
// exercise the crossing locally is to point this at a local 4irden. The override
// accepts LOCALHOST ONLY — this value is handed to window.open(), and a query
// parameter that could name any origin is an open redirect with extra steps.
const DEFAULT_HOME = 'https://4irden.com';
const HOME = (() => {
  try {
    const q = new URL(location.href).searchParams.get('airden');
    if (!q) return DEFAULT_HOME;
    const u = new URL(q);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return local ? u.origin : DEFAULT_HOME;
  } catch { return DEFAULT_HOME; }
})();

export function createPortal() {
  const el = document.getElementById('portal');
  if (!el) return { destroy() {} };
  const go = () => {
    const w = Math.min(560, Math.round(screen.availWidth * 0.42));
    const h = Math.min(900, Math.round(screen.availHeight * 0.86));
    const left = Math.round((screen.availLeft || 0) + (screen.availWidth - w) / 2);
    const top = Math.round((screen.availTop || 0) + (screen.availHeight - h) / 2);
    window.open(HOME, 'airden-portal',
      `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
  };
  el.addEventListener('click', go);
  return { destroy() { el.removeEventListener('click', go); } };
}
