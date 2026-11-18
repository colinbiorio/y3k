# kokoro-js 1.2.1, and the ONNX runtime it loads

Served from here since 18 Nov 2026 (src/kokoro.js, src/kokoro-worker.js): no third party in script-src.

- `kokoro.web.js`: the browser bundle of [kokoro-js](https://www.npmjs.com/package/kokoro-js) 1.2.1
  (Apache-2.0, `LICENSE` here), unchanged. It carries transformers.js 3.5.1, onnxruntime-web 1.21 and
  the espeak-ng phonemizer inside it.
- `../transformers@3.5.1/ort-wasm-simd-threaded.jsep.mjs` and `.wasm`: the runtime's loader and engine
  from [@huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) 3.5.1
  `dist/` (Apache-2.0, `LICENSE` there; onnxruntime is MIT), unchanged. The worker points the bundle
  at them (`env.wasmPaths`), where it would have fetched them from jsDelivr.

The model and its voices are not here: `onnx-community/Kokoro-82M-v1.0-ONNX` on Hugging Face
(Apache-2.0), fetched by the person's own press into the browser's cache.

Both tarballs were checked against the npm registry's integrity before anything was taken from them:
kokoro-js 1.2.1 `sha512-oq0HZJWis3t8lERkMJh84WLU86dpYD0EuBPtqYnLlQzyFP1OkyBRDcweAqCfhNOpltyN9j/azp1H6uuC47gShw==`,
@huggingface/transformers 3.5.1 `sha512-qWsPoJMBPYcrGuzRMVL//3dwcLXED9r+j+Hzw+hZpBfrMPdyq57ehNs7lew0D34Paj0DO0E0kZQjOZcIVN17hQ==`.

SHA-256, as published (test/security.test.mjs checks them):

    6067712fe4c43cdb36c762f860a5ab8d96ea1d9c8882466438eb9f3d0d20be8f  kokoro.web.js
    08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9  ../transformers@3.5.1/ort-wasm-simd-threaded.jsep.mjs
    c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39  ../transformers@3.5.1/ort-wasm-simd-threaded.jsep.wasm
