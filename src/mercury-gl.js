// Liquid mercury, the real way: a WebGL shader per glyph.
//
// The SVG-filter approach could melt edges, but true liquid chrome — crisp at
// any size, with reflection bands that FLOW along the shape — needs a fragment
// shader (the technique the Framer liquid-metal components use):
//   1. Each glyph is rasterized once into a HEIGHTMAP texture: a hard mask in
//      one channel, a heavily blurred "depth" field in another.
//   2. The shader reads depth → its gradient is the surface normal; smooth-
//      stepped mask = antialiased silhouette; near-edge = dark meniscus rim.
//   3. Chrome bands ride the depth's iso-contours and drift with time (summed
//      incommensurate sines — never loops), lit by a fixed key light with a
//      hot specular; the environment mirrors bright-above/dark-below.
//   4. The cursor bulges the liquid toward itself, but only inside the glyph.
//
// One shared WebGL context renders every glyph into an atlas; each button owns
// a small 2D canvas that blits its tile per frame (12 blits, trivial). If
// WebGL is unavailable, the caller keeps the SVG-filter look as the fallback.

const TILE = 144;          // atlas tile resolution per glyph (supersampled)
const FPS_EVERY = 1;       // draw every rAF (12 tiny tiles is nothing)

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;   // r: blurred depth · g: soft mask
uniform float uTime;
uniform vec2 uMouse;      // glyph-local uv; offscreen when not hovered
uniform float uHover;     // eased 0..1

void main() {
  vec2 uv = vUv;
  // The touch: liquid bulges toward the finger, only near the contact point.
  vec2 toM = uMouse - uv;
  float md2 = dot(toM, toM);
  uv += toM * (uHover * exp(-md2 * 18.0) * 0.10);

  vec4 t = texture2D(uTex, uv);
  float depth = t.r;
  float mask = t.g;
  float edge = smoothstep(0.35, 0.52, mask);
  if (edge < 0.004) { gl_FragColor = vec4(0.0); return; }

  // Surface normal from the depth gradient.
  float e = ${(1 / TILE).toFixed(5)};
  float hx = texture2D(uTex, uv + vec2(e, 0.0)).r - texture2D(uTex, uv - vec2(e, 0.0)).r;
  float hy = texture2D(uTex, uv + vec2(0.0, e)).r - texture2D(uTex, uv - vec2(0.0, e)).r;
  vec3 n = normalize(vec3(-hx * 4.4, -hy * 4.4, 1.0));

  // Chrome bands flowing along iso-contours — incommensurate drifts, no loop.
  float flow = sin(uv.x * 6.3 + uTime * 0.51) * 0.9 + sin(uv.y * 8.1 - uTime * 0.73) * 0.9;
  float band = sin(depth * 13.0 + flow + uTime * 0.8);
  float band2 = sin(depth * 26.0 - uTime * 0.55 + band * 1.3);
  float silver = 0.82 + 0.12 * band + 0.05 * band2;

  // The room, mirrored: bright above, dark floor below (hard-ish horizon).
  float env = clamp(0.5 + n.y * 0.85, 0.0, 1.0);
  env = env * env * (3.0 - 2.0 * env);
  silver *= 0.62 + 0.72 * env;

  // Key light + hot specular.
  vec3 L = normalize(vec3(-0.45, 0.62, 0.65));
  float ndl = max(dot(n, L), 0.0);
  silver *= 0.8 + 0.34 * ndl;
  float spec = pow(max(dot(n, L), 0.0), 16.0);

  vec3 col = vec3(silver * 0.955, silver * 0.975, min(1.0, silver * 1.01 + 0.012)) + spec * 1.0;

  // The meniscus: the last stretch before the edge turns near-black.
  float rim = smoothstep(0.36, 0.66, mask);
  col = mix(vec3(0.012, 0.016, 0.022), col, rim);

  gl_FragColor = vec4(col * edge, edge); // premultiplied
}`;

// --- glyph → heightmap -------------------------------------------------------
// Draw the glyph white-on-transparent at tile size, then build two channels:
// g = softly-blurred mask (antialiased edge + rim), r = heavily-blurred depth.
function boxBlur(src, w, h, radius, passes) {
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -radius; x <= radius; x++) acc += a[row + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (radius * 2 + 1);
        acc += a[row + Math.min(w - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (radius * 2 + 1);
        acc += b[Math.min(h - 1, y + radius + 1) * w + x] - b[Math.max(0, y - radius) * w + x];
      }
    }
  }
  return a;
}

async function glyphAlpha(el) {
  // el is an <svg> (icon) or <img> (the univispira). Returns TILE×TILE alpha 0..1.
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pad = TILE * 0.16;
  if (el.tagName.toLowerCase() === 'img') {
    if (!el.complete) await new Promise((res) => { el.onload = res; el.onerror = res; });
    const s = Math.min((TILE - pad * 2) / el.naturalWidth, (TILE - pad * 2) / el.naturalHeight);
    const w = el.naturalWidth * s, h = el.naturalHeight * s;
    // Thin marks need body: draw a few nudged copies (a poor man's dilate).
    for (const [ox, oy] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
      g.drawImage(el, (TILE - w) / 2 + ox, (TILE - h) / 2 + oy, w, h);
    }
  } else {
    // Clone the SVG standalone: solid white paint (the shared gradient/filter
    // urls don't resolve outside the document), no filters.
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('class');
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      if (node.getAttribute && node.getAttribute('fill') && node.getAttribute('fill') !== 'none') node.setAttribute('fill', '#fff');
      if (node.getAttribute && node.getAttribute('stroke') && node.getAttribute('stroke') !== 'none') node.setAttribute('stroke', '#fff');
      node.removeAttribute && node.removeAttribute('filter');
    }
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    URL.revokeObjectURL(url);
    g.drawImage(img, pad, pad, TILE - pad * 2, TILE - pad * 2);
  }
  const data = g.getImageData(0, 0, TILE, TILE).data;
  const alpha = new Float32Array(TILE * TILE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] / 255;
  return alpha;
}

function heightmapTexture(gl, alpha) {
  const soft = boxBlur(Float32Array.from(alpha), TILE, TILE, 2, 1);      // g: near-crisp mask
  const depth = boxBlur(Float32Array.from(alpha), TILE, TILE, 6, 2);    // r: rounded body
  const px = new Uint8Array(TILE * TILE * 4);
  for (let i = 0; i < TILE * TILE; i++) {
    px[i * 4] = Math.min(255, depth[i] * 255);
    px[i * 4 + 1] = Math.min(255, soft[i] * 255);
    px[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // Canvas pixels are top-first; GL textures are bottom-first — flip on upload
  // or every asymmetric glyph renders upside-down.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TILE, TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// --- the renderer ------------------------------------------------------------
export async function initMercuryGL() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hosts = [...document.querySelectorAll('.mercury')];
  if (!hosts.length) return false;

  const glCanvas = document.createElement('canvas');
  glCanvas.width = TILE; glCanvas.height = TILE;
  const gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return false;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[mercury-gl]', gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return false;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');
  const uHover = gl.getUniformLocation(prog, 'uHover');
  gl.viewport(0, 0, TILE, TILE);

  // Each glyph: heightmap texture + a 2D canvas standing in for the svg/img.
  const items = [];
  for (const host of hosts) {
    const src = host.querySelector('svg, img');
    if (!src) continue;
    // The broadcast on-air (red) icon keeps its own look — skip the live svg.
    if (src.classList.contains('bc-live')) continue;
    try {
      const alpha = await glyphAlpha(src);
      const tex = heightmapTexture(gl, alpha);
      const out = document.createElement('canvas');
      out.width = TILE; out.height = TILE;
      out.className = 'merc-canvas';
      // An <img> glyph (the univispira) has no width attribute — use its styled
      // 2x size, never naturalWidth (a 1663px canvas would swallow the screen).
      const wAttr = parseFloat(src.getAttribute('width')) || parseFloat(getComputedStyle(src).width) || 184;
      out.style.width = wAttr + 'px'; out.style.height = wAttr + 'px';
      src.style.display = 'none';
      host.appendChild(out);
      items.push({ host, out, octx: out.getContext('2d'), tex, hover: 0, mx: -9, my: -9 });
    } catch { /* this glyph keeps the SVG-filter fallback */ }
  }
  if (!items.length) return false;

  let mx = -1e4, my = -1e4;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

  const frame = (now) => {
    const t = reduced ? 0 : now / 1000;
    for (const it of items) {
      const r = it.out.getBoundingClientRect();
      if (!r.width) { requestAnimationFrame && 0; continue; }
      const inside = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
      it.hover += ((inside ? 1 : 0) - it.hover) * 0.18;
      if (inside) { it.mx = (mx - r.left) / r.width; it.my = 1 - (my - r.top) / r.height; }
      gl.bindTexture(gl.TEXTURE_2D, it.tex);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, it.mx, it.my);
      gl.uniform1f(uHover, it.hover);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      it.octx.clearRect(0, 0, TILE, TILE);
      it.octx.drawImage(glCanvas, 0, 0);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return true;
}
