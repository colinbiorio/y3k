// ============================================================================
// platform.js — WHICH COMPUTER IS THIS? So the y3kode screen can offer the one
// desktop build that fits, already chosen, with the other five one click away.
//
// Browsers do not simply say. What each one does give:
//   · Chrome and Edge: User-Agent Client Hints — getHighEntropyValues() names
//     the platform and the CPU ('arm' or 'x86') outright. Sure.
//   · Linux browsers: the user agent string says x86_64 or aarch64. Sure.
//   · Windows, elsewhere: the string says x64 even on an Arm laptop (the
//     browser may itself be emulated), so x64 — which runs on both — not sure.
//   · Mac, elsewhere (Safari, Firefox): the string says "Intel Mac OS X" on
//     every Mac, Apple silicon included. The graphics driver's name is the
//     tell where a browser shares it: "Apple M2" or "Intel Iris". Safari hides
//     it ("Apple GPU"), and then it is a guess — Apple silicon, which every
//     Mac sold since 2021 has — marked not sure, with how to check.
//   · Phones and tablets have no desktop build at all.
// ============================================================================

const glRenderer = () => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();   // one borrowed context, handed straight back
    return name;
  } catch { return ''; }
};

// -> { os: 'mac'|'win'|'linux'|'ios'|'android'|null, arch: 'arm64'|'x64'|null, sure }
export async function detectPlatform({ nav = globalThis.navigator, renderer = glRenderer } = {}) {
  const ua = String(nav?.userAgent || '');
  const touchMac = /Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1;   // an iPad asking for the desktop site
  const os = /Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
    : /Mac OS X|Macintosh/.test(ua) ? 'mac'
    : /Windows/.test(ua) ? 'win'
    : /Linux|X11|CrOS/.test(ua) ? 'linux'
    : null;
  if (!os || os === 'ios' || os === 'android') return { os, arch: null, sure: !!os };

  // the browser that says outright
  try {
    const hints = await nav.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']);
    if (hints?.architecture === 'arm') return { os, arch: 'arm64', sure: true };
    if (hints?.architecture === 'x86') return { os, arch: 'x64', sure: true };
  } catch { /* not offered, or refused */ }

  if (os === 'linux') {
    if (/aarch64|arm64|armv8/i.test(ua)) return { os, arch: 'arm64', sure: true };
    if (/x86_64|amd64|x64/i.test(ua)) return { os, arch: 'x64', sure: true };
    return { os, arch: 'x64', sure: false };
  }
  if (os === 'win') {
    if (/\bARM64\b/i.test(ua)) return { os, arch: 'arm64', sure: true };
    return { os, arch: 'x64', sure: false };
  }
  // a Mac: the graphics driver's name, where the browser shares it
  const gpu = String(renderer() || '');
  if (/Apple M\d/i.test(gpu)) return { os, arch: 'arm64', sure: true };
  if (/Intel|AMD|Radeon|NVIDIA|GeForce/i.test(gpu)) return { os, arch: 'x64', sure: true };
  return { os, arch: 'arm64', sure: false };
}

// The build for this computer, from the site's list — or null.
export function pickBuild(builds, p) {
  if (!Array.isArray(builds) || !p?.os) return null;
  return builds.find((b) => b.os === p.os && b.arch === p.arch) || builds.find((b) => b.os === p.os) || null;
}

// How to be sure, when the guess is a guess.
export const HOW_TO_CHECK = {
  mac: 'To check: Apple menu → About This Mac. "Chip: Apple M…" is Apple silicon; "Processor: Intel" is Intel.',
  win: 'To check: Settings → System → About → System type. "ARM-based processor" is Windows on Arm.',
  linux: 'To check: run uname -m in a terminal. aarch64 is Arm; x86_64 is the other.',
};
// What the first launch will say, since the builds are not signed yet
// (desktop/README.md: say so wherever the download is offered).
export const FIRST_OPEN = {
  mac: 'The first time you open it, macOS says it can\'t check it. Press Done, then System Settings → Privacy & Security → Open Anyway.',
  win: 'If Windows says it protected your PC, press More info, then Run anyway.',
  linux: 'Make it runnable (chmod +x y3k-linux-*.AppImage), then open it.',
};
