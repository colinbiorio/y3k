MediaPipe Tasks Vision 1.0.1 (@mediapipe/tasks-vision@1.0.1 from the npm registry,
Apache-2.0 — see LICENSE; the package names its licence but carries no copy, so
this is the Apache Software Foundation's text), served from here instead of
jsDelivr so no script on the site comes from a third party (y3k-code/RELEASE.md).
The tarball was checked against the registry's integrity before anything was
taken from it: sha512-rvRE2FmAZ6ZxKSw7wq+e+jQDpN3t1B/tD2mJz9SmAzb1msoDkd4dMoE4wAh8Z30Um0PQwLiHr9QtomhmXk3aUQ==

Only what the site loads: `vision_bundle.mjs` (what the importmaps in index.html
and eye.html point at), and in `wasm/` the two engines `FilesetResolver` chooses
between, with their loaders: `vision_wasm_internal` (browsers with WebAssembly
SIMD) and `vision_wasm_nosimd_internal` (the rest). Left out: the CommonJS and
plain-script bundles, the source maps, the type declarations, and the
`vision_wasm_module_internal` pair (for a module worker, which this site does
not use). Files are byte-for-byte the published package (sha-256):

    d885630c297c0b20b1fe86096cb06291c4c8080876f27852e724f24ac603713f  vision_bundle.mjs
    e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73  wasm/vision_wasm_internal.js
    8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886  wasm/vision_wasm_internal.wasm
    e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658  wasm/vision_wasm_nosimd_internal.js
    a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192  wasm/vision_wasm_nosimd_internal.wasm

How it travels: the server sends `.wasm` as `application/wasm` (so the browser
can compile it while it streams) and compresses it like text. Brotli at quality
5 makes the 11.76 MB engine 2.86 MB in about 0.2 s (jsDelivr sent 3.05 MB);
quality 11 would make it 2.40 MB but costs about 19 s of a core, so files this
large are not polished (delivery.mjs, POLISH_MAX). `/src/vendor/` is held for a
year: the version is in the path, so a path's content never changes.

Still fetched from elsewhere: the face and hand models (data, not scripts),
from Google's mediapipe-models folder; and the library still tries to tell
Google each time a landmarker is made, which src/perceive.js refuses (THE
BEACON). Vendoring changes neither.

To upgrade: a new folder with the new version in its name, the same five files
from the registry's tarball (checked against its integrity), and the version in
the importmaps of index.html and eye.html, WASM_BASE in src/perceive.js and
src/eye.js, and VISION_PKG in security.mjs, which test/security.test.mjs holds
together.
