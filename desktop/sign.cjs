// ============================================================================
// sign.cjs — AD-HOC SIGN THE BUNDLE, because nobody here has a Developer ID.
//
// electron-builder finds no signing identity on this machine and says so, then
// packages the app anyway. What ships in that case is the stock Electron binary
// still carrying the signature the LINKER gave it: identifier "Electron",
// Info.plist not bound, no sealed resources. It launches — but nothing in the
// bundle we actually put there is covered by it.
//
// That matters for one thing in particular, and it is the thing this app exists
// for: THE CAMERA. macOS remembers camera consent against the app's code
// signature, and an app whose signature does not name it is an app whose
// consent has nothing stable to hang on. Signing ad-hoc costs nothing, needs no
// certificate, and gives the bundle its own identity —
//
//   before   Identifier=Electron   Info.plist=not bound   Sealed Resources=none
//   after    Identifier=com.yearthreethousand.y3k   Info.plist entries=31
//            Sealed Resources version=2 rules=13 files=10
//
// — which is what a person granting the camera is actually granting it to.
//
// This is NOT Gatekeeper. An ad-hoc signature is not a trusted one, and the
// first launch of a downloaded copy still needs a right-click → Open. Only a
// paid Developer ID fixes that, and it is a different decision.
//
// Runs as afterPack: the .app exists, the .dmg and .zip have not been built
// from it yet. Signing any later would sign a copy nobody downloads.
// ============================================================================

const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  // VERIFY, or this is a step that can quietly stop working. --strict, because
  // the loose check passes on a bundle whose resources are not sealed, which is
  // the exact state we are here to get out of.
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed  ${path.basename(context.appOutDir)}/${path.basename(app)}`);
};
