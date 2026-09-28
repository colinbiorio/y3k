three.js r160 (three@0.160.0 from the npm registry, MIT — see LICENSE), served
from here instead of unpkg so no script on the site comes from a third party.
Only what the site imports: `build/three.module.min.js` (what the importmap in
index.html points at), and in `examples/jsm/` RoomEnvironment, EffectComposer,
RenderPass, UnrealBloomPass and what those import (ShaderPass, MaskPass, Pass,
CopyShader, LuminosityHighPassShader). The addons import the bare 'three', so
they resolve through the same importmap line to the same one copy.
`build/three.module.js` is the same release unminified, kept for reading and
debugging: swap the importmap line back to use it. The minified build is 671KB
against 1,273KB (135KB against 201KB brotli), with the same 416 exports, and
the browser parses and compiles about half as much before the orb can start.
Files are byte-for-byte the published package. To upgrade: a new folder with the
new version in its name (the path is cached forever), and a new importmap line.
