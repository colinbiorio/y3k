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
- a `y3k://code` link (the site's *Open the y3k app*) opens it straight on Code
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

## Opening it from the site: `y3k://code`

The app owns the `y3k:` link scheme. The site's **Open the y3k app** button
points at `y3k://code`: the OS starts the app (or brings the running one
forward) and the window goes to y3k Code. The first time, the browser asks
whether to open y3k — that prompt is the browser's, and it is right to ask.

Exactly two links mean anything (`policy.deepLinkFor`): `y3k://code` opens Code,
and `y3k://` brings the window forward. Anything else — a path, a query, a
command, a pairing code — is ignored, because any page or email can name the
scheme. The window only ever goes to the site's own `#code`, built by the app
from its home address. When the window is already on the room, that is a
fragment move, not a reload: the room, the orb and every running session stay
as they are.

macOS delivers the link as `open-url` (heard before the app is ready, so a
link that launches it is not lost); Windows and Linux hand it to a second copy
of the app as an argument, which the single-instance lock turns into
`second-instance`. The installed app claims the scheme itself
(`app.setAsDefaultProtocolClient`, and `build.protocols` for the Info.plist and
the Linux desktop file); a development checkout does not, since it would claim
it for the bare Electron binary — try a link there with
`npm start -- y3k://code`.

The page can tell it is inside the app, and which version, from its user
agent: every window adds ` y3k-desktop/<version>` (1.1.0 now). An older shell,
without the Code bridge, has no such word, so the site can say *update the
app* instead of showing the browser's setup.

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
npm run build:win                 # → dist/y3k-win-x64.exe and y3k-win-arm64.exe
npm run build:linux               # → dist/y3k-linux-x86_64.AppImage and y3k-linux-arm64.AppImage
```

Every build is named `y3k-<os>-<arch>.<ext>` (`artifactName` in
`package.json`) — no version in the name, on purpose: the site links to each
one by that fixed name (see *Releasing it*).

The icon is generated, not drawn: `npm run icon` re-lays `../icon.png` on the
room's own near-black at every size that is needed, using nothing but node's
zlib. Rerun it if the wordmark changes.

**The build is not signed.** Without a paid Apple Developer ID there is no way
to sign or notarize it, so macOS stops the first launch on any machine but the
one that built it. Since macOS 15 (Sequoia) the old right-click → *Open* no
longer gets past it. What works now:

1. Drag **y3k** from the disk image into **Applications**, and open it once.
   macOS says it cannot check it (or that it is "damaged") — press **Done**.
2. Open **System Settings → Privacy & Security**, scroll down to the line about
   y3k being blocked, press **Open Anyway**, and confirm with your password or
   Touch ID. From then on it opens like any other app.

Or, in Terminal, in one line: `xattr -dr com.apple.quarantine /Applications/y3k.app`.

Gatekeeper's wording for an unsigned app — "damaged and can't be opened" — is a
lie, and it is the first thing anyone downloading this will see, so say so, with
the two steps above, wherever the download is offered. (On macOS 14 and older,
right-click → *Open* → *Open* still works.)

## Releasing it

`dist/` is gitignored: a 100MB disk image is not a thing a repo carries. The
built apps go on a GitHub release, and the release is the download.

Cutting one, from `desktop/`:

1. Bump `version` in `package.json` (and `package-lock.json`, which says it
   twice). The window's user agent carries it (` y3k-desktop/<version>`), and
   the site reads that to tell a current app from an old one, so a shell change
   without a bump is invisible to the page. `node test/desktop.test.mjs` pins
   the two files together.
**Or let GitHub build them:** Actions → *desktop app* → *Run workflow*
(`.github/workflows/desktop.yml`) builds all six on GitHub's Mac, Windows and
Linux machines and puts them on the release `desktop-v<version>` — steps 2
and 3 below, done for you.

2. `npm ci && npm run build && npm run build:win && npm run build:linux` →
   `dist/`: `y3k-mac-arm64.dmg`, `y3k-mac-x64.dmg` (and their `.zip`s),
   `y3k-win-x64.exe`, `y3k-win-arm64.exe`, `y3k-linux-x86_64.AppImage`,
   `y3k-linux-arm64.AppImage`.
3. Put it up as a draft:

```sh
gh release create v1.1.0 dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage --draft \
  --title "y3k 1.1.0" \
  --notes "A window onto the live site, with y3kode built in and y3k:// links. Unsigned: on first launch open it once, then System Settings → Privacy & Security → Open Anyway."
```

4. On a Mac, download the `.dmg` from the draft in Safari — so it arrives
   quarantined, the way everyone else's will — and go through the first-launch
   steps above. Open Code, pick a folder, reload with ⌘R, quit; click a
   `y3k://code` link in Safari with the app closed, and again with it open.
5. `gh release edit v1.1.0 --draft=false`.

Then `https://github.com/colinbiorio/y3k/releases/latest` is the download link
(for anyone but the founder, only if the repository's releases are public).

**The site's download button.** The y3kode screen opens with *y3kode is better
on desktop*: it works out what computer it is on (Mac Apple silicon or Intel,
Windows x64 or Arm, Linux x64 or Arm), picks that build, and offers the other
five. It needs one setting on the server — the folder the six files are in:

```sh
Y3K_APP_DOWNLOADS=https://github.com/colinbiorio/y3k/releases/latest/download
```

`latest/download/<name>` always serves the newest release's file of that name,
which is why the names carry no version. Unset, the button shows but says the
app is not published yet.

## Windows and Linux

`npm run build:win` and `npm run build:linux` are configured. The Linux build
has been packaged and run through the whole desktop smoke
(`ELECTRON_BIN=dist/linux-unpacked/y3k-desktop DSMOKE_PACKAGED=1`); Windows has
not been tried on a real machine, so treat it as untested — the `y3k://` link
included (an AppImage only registers it once integrated into the desktop). In the meantime those
machines have a better route anyway: Chrome and Edge will install the site
itself as an app from their own menu — same window, same icon, and live by
definition. That is what `manifest.webmanifest` at the repo root is for.
