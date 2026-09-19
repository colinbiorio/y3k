// ============================================================================
// y3k, as an app on your machine.
//
// IT IS A WINDOW ONTO THE LIVE SITE, and that is the whole design rather than a
// shortcut. Colin asked for something downloadable that still picks up every
// push on refresh, and those two things only hold together if the app does not
// carry a copy of the app. It carries a window. Push to main, Render deploys,
// press Cmd+R, and you are on the new one — no rebuild, no release, no version
// of this shell that is older than the room it opens onto. The server already
// sends everything no-cache, so a reload really is the new code.
//
// What it buys over a browser tab, which is the honest question:
//   - the room fills the frame, with no address bar over the top of it
//   - the camera permission is the APP's, granted once, not re-asked per tab
//   - it has its own icon, its own window, its own place in the dock
//   - full screen is a real full screen
//
// What it does not do: it does not update ITSELF. It has almost nothing to
// update — a hundred lines that open a window — and the thing you actually
// want new arrives on its own. If this file ever changes, that is a new
// download, and it should be rare enough to notice.
// ============================================================================

const { app, BrowserWindow, Menu, session, shell, dialog, systemPreferences } = require('electron');
const { mayUse, routeFor, mediaFor, isRealFailure } = require('./policy.cjs');

// Point it somewhere else to work against a local server:
//   Y3K_URL=http://localhost:5173 npm start
const HOME = process.env.Y3K_URL || 'https://yearthreethousand.com';

// A page for when the room cannot be reached. Not a browser error: those say
// nothing useful about a thing that is simply not answering yet, and they look
// like the app is broken rather than the network.
const OFFLINE = `data:text/html;charset=utf-8,${encodeURIComponent(`
<style>
  html,body{height:100%;margin:0;background:#04030a;color:#8e96a6;
    font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    display:grid;place-items:center;text-align:center;-webkit-app-region:drag}
  div{max-width:26rem;padding:0 2rem}
  b{display:block;color:#dfe4ee;font-weight:500;font-size:15px;margin-bottom:.6rem}
  code{color:#6f7686}
</style>
<div>
  <b>The room is not answering.</b>
  y3k lives on the web and this window is looking at it, so it needs a
  connection. Press <code>&#8984;R</code> to try again.
</div>`)}`;

let win = null;

function open() {
  // Held as a local as well as on `win`, because everything below is a callback
  // and `win` is null the moment the window closes. A load that fails WHILE the
  // window is going away is the ordinary case of that — closing a window mid
  // load is how a person cancels one — and reaching through the null there
  // would take the whole app down with a TypeError in the main process.
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'y3k',
    // The renderer's own clear colour, so the frame never flashes white on the
    // way in — the first paint of a dark room through a white window is the
    // cheapest way to make a good thing feel unfinished.
    backgroundColor: '#04030a',
    // The traffic lights float over the room instead of sitting on a bar above
    // it. The app has its own chrome; a second strip of grey would fight it.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // NOTHING IS INJECTED INTO THE PAGE. No preload, no bridge, no privileged
      // object on window. The site is the same site a browser gets, which means
      // it cannot come to depend on being in here, and this shell can never be
      // the reason something works at home and not on the web.
      //
      // And background throttling is left ON, which is the default and was
      // worth checking rather than overriding: a hidden window running a
      // particle field at full rate is a laptop getting warm in a bag. The one
      // reason to turn it off would be a frame loop that integrates whatever
      // gap it is handed — twenty seconds behind another window, then one
      // enormous step. This one does not: every dt the body reads is clamped
      // (0.1s, 0.25s, 0.032s at the three readers), and the single unclamped
      // use is uTime, an accumulator where a jump is just a later phase.
    },
  });
  win = w;

  w.loadURL(HOME);

  // THE WINDOW STAYS ON THE ROOM. A link to somewhere else opens in the real
  // browser, where a person has their tabs, their history and an address bar
  // they can read — the three things this window deliberately does not have.
  const away = (url) => { if (routeFor(url, HOME) === 'browser') shell.openExternal(url); };
  w.webContents.setWindowOpenHandler(({ url }) => { away(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => {
    if (routeFor(url, HOME) === 'stay') return;
    e.preventDefault();
    away(url);
  });

  // One line per load, so `y3k.app/Contents/MacOS/y3k` from a terminal tells you
  // which of the two pages you are looking at. It is the only thing this shell
  // does that a person might ever need to debug.
  w.webContents.on('did-finish-load', () => {
    console.log(`[y3k] loaded ${w.webContents.getURL().slice(0, 64)}`);
  });

  w.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isRealFailure(code, isMainFrame) || w.isDestroyed()) return;
    console.error(`[y3k] could not load ${url}: ${code} ${desc}`);
    w.loadURL(OFFLINE);
  });

  w.on('closed', () => { if (win === w) win = null; });
}

// Are we looking at the site, or at the offline card?
const onRoom = () => !!win && routeFor(win.webContents.getURL(), HOME) === 'stay';
const home = () => { if (!win) return; onRoom() ? win.webContents.reload() : win.loadURL(HOME); };

// A REAL MENU, because without one there is no copy, no paste, and no reload —
// and reload is how this app gets the new version of everything.
function menu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // On macOS the app menu carries Quit. Everywhere else nothing does unless
    // this is here, and an app you cannot quit from its own menu bar is a bug
    // that only shows up on the platform you did not build on.
    ...(mac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    {
      label: 'Room',
      submenu: [
        // RELOAD IS THE UPDATE BUTTON, so it has to work from both pages: on
        // the room it fetches the newest deploy, and on the offline card —
        // which is a data: url and would happily reload itself forever — it
        // goes home and tries again, which is what that card asks you to do.
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => home() },
        { label: 'Reload, ignoring caches', accelerator: 'CmdOrCtrl+Shift+R', click: () => (onRoom() ? win.webContents.reloadIgnoringCache() : home()) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Developer tools', accelerator: mac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => win?.webContents.toggleDevTools() },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Open y3k in a browser', click: () => shell.openExternal(HOME) },
        {
          label: 'About this window',
          // Guarded: on macOS the menu bar outlives the last window, and
          // showMessageBox with a null parent throws in the main process.
          click: () => win && dialog.showMessageBox(win, {
            type: 'info',
            message: 'y3k',
            detail: `This window opens ${HOME}.\n\nIt does not carry a copy of the app — it looks at the live one, so every deploy is here the moment you reload. There is nothing in this shell to keep up to date.`,
            buttons: ['Close'],
          }),
        },
      ],
    },
  ]));
}

// One window. Opening a second would be two rooms with one presence in them.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    // THE CAMERA, ONCE, FOR THE APP. The permission belongs to the application
    // rather than to a tab, so it is asked the first time the eye is opened and
    // remembered after — the main thing a browser cannot give this. Granted
    // only to our own origin. What counts as ours, and which permissions exist
    // at all, are decided in policy.cjs where the test suite can reach them;
    // this is the wiring, and it is set on the SESSION, which is one thing and
    // not one per window — so it goes here, before any window exists, rather
    // than being re-registered every time one opens.
    session.defaultSession.setPermissionRequestHandler(async (wc, permission, done, details) => {
      if (!mayUse(permission, details?.securityOrigin || wc.getURL(), HOME)) return done(false);
      if (permission !== 'media' || process.platform !== 'darwin') return done(true);
      // The page said yes; now macOS has to. Asked HERE rather than at startup,
      // so the system prompt appears the moment a person turns tracking on and
      // never before — the site is careful that nothing opens the camera until
      // it is asked to, and a shell that prompted on launch would undo that.
      const got = await Promise.all(mediaFor(details).map((m) => systemPreferences.askForMediaAccess(m)));
      done(got.every(Boolean));
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => (
      mayUse(permission, origin, HOME) || mayUse(permission, wc?.getURL?.() || '', HOME)
    ));
    menu();
    open();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
