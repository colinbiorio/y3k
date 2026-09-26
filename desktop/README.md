# y3k on your machine

A window onto [yearthreethousand.com](https://yearthreethousand.com). Not a copy
of it.

That distinction is the entire design. The app holds no HTML, no JavaScript, no
shaders — it holds a window, and the window is pointed at the live site. Push to
`main`, Render deploys, press ⌘R, and you are on the new one. There is no build
to run, no release to cut, no version of this app that is older than the room it
opens onto.

## What it gives you that a tab does not

- the room fills the frame, with nothing above it
- y3k Code runs your own coding tools right here, with no companion to start
- the camera permission is the **app's** — granted once, not re-asked per tab
- its own icon, its own window, its own place in the dock
- full screen is a real full screen

## What it does not do

It does not update itself, because there is almost nothing in it to update — a
hundred lines that open a window. The part you actually want new arrives on its
own. If `main.cjs` changes, that is a new download, and it should be rare enough
to be worth mentioning.

There is also no auto-updater, no telemetry, and no crash reporter. The site
inside this window is byte-for-byte the site a browser gets, which means it can
never come to depend on being in here.

**The one exception is the local bridge** (CODE.md, HANDS.md). A single
preload (`preload.cjs`) puts one frozen object on the page, `window.y3kCode` —
`cmd`, `since`, `onEvent`, JSON in and out — so y3k Code can reach its engine on
this machine without a port or a pairing code. No Node, no `ipcRenderer`, no
file system reaches the page, and `code-host.cjs` answers only the site's own
top frame (`policy.bridgeMay`). The engine (`../y3k-code`, packed as a
resource) runs in an Electron utility process, started the first time the page
asks: a reload (⌘R) keeps every coding session running, and quitting the app
stops every coding tool before it goes. The folder a session runs in comes from
the OS's own picker, and every yes that matters — trusting a folder, adding a
connector — is a native dialog that defaults to *Don't allow*.
**Room → Stop every coding session** stops them all at once.

Try it against a local site with a stand-in coder:
`xvfb-run -a node scripts/code-desktop-smoke.mjs` from the repo root (set
`ELECTRON_BIN` if Electron is not in `desktop/node_modules`).

## Working on it

```sh
cd desktop
npm install                       # ~550MB of Electron, gitignored
npm start                         # opens the live site
Y3K_URL=http://localhost:5173 npm start   # …or your own server
```

`policy.cjs` holds the three decisions worth being careful about — what a page
may be granted, where a link may go, and whether a failed load should replace
the page. They are plain functions over strings so the repo's own suite can run
them: `node test/desktop.test.mjs`, from the root.

## Building it

```sh
npm run build                     # → dist/, a .dmg and a .zip per architecture
```

The icon is generated, not drawn: `npm run icon` re-lays `../icon.png` on the
room's own near-black at every size that is needed, using nothing but node's
zlib. Rerun it if the wordmark changes.

**The build is not signed.** Without a paid Apple Developer ID there is no way
to sign it, so the first launch on any machine but the one that built it needs
a right-click → *Open* → *Open* (or `xattr -dr com.apple.quarantine /Applications/y3k.app`).
Gatekeeper's wording for an unsigned app — "damaged and can't be opened" — is a
lie, and it is the first thing anyone downloading this will see, so say so
wherever the download is offered.

## Releasing it

`dist/` is gitignored: a 100MB disk image is not a thing a repo carries. The
built apps go on a GitHub release, and the release is the download.

```sh
gh release create v1.0.0 dist/*.dmg dist/*.zip \
  --title "y3k 1.0.0" \
  --notes "A window onto the live site. Unsigned: right-click → Open on first launch."
```

Then `https://github.com/colinbiorio/y3k/releases/latest` is the download link.

## Windows and Linux

`npm run build:win` and `npm run build:linux` are configured, but nothing has
been built or tried on either, so treat them as untested. In the meantime those
machines have a better route anyway: Chrome and Edge will install the site
itself as an app from their own menu — same window, same icon, and live by
definition. That is what `manifest.webmanifest` at the repo root is for.
