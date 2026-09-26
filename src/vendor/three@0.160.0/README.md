three.js r160 (three@0.160.0 from the npm registry, MIT — see LICENSE), served
from here instead of unpkg so no script on the site comes from a third party.
Only what the site imports: `build/three.module.js`, and in `examples/jsm/`
RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass and what those
import (ShaderPass, MaskPass, Pass, CopyShader, LuminosityHighPassShader).
Files are byte-for-byte the published package. To upgrade: a new folder with the
new version in its name (the path is cached forever), and a new importmap line.
