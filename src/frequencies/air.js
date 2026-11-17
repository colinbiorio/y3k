// ============================================================================
// The air of the frequencies room (browser only: three.js): the colour of the
// sky in any direction, and the haze that lies between the eye and whatever it
// looks at, so far land fades into the sky behind it exactly. One set of
// uniforms, shared by the sky and by every material that asks for the haze.
//
// Both work in the screen's own colours, after tone mapping, as three.js lays
// its own fog: the sky is not tone-mapped, so it and the haze meet.
// ============================================================================
import * as THREE from 'three';

export function createAir() {
  return {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uWarm: { value: new THREE.Color() }, uCool: { value: new THREE.Color() },        // the horizon under the sun, and away from it
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunGlow: { value: 0 },
    // the haze: x, an even haze (per metre); y, a mist at the valley floor (per metre); z, how fast the
    // mist thins going up (metres); w, the height of the floor it lies on
    uHaze: { value: new THREE.Vector4(0, 0, 30, 0) },
  };
}

export const SKY_HEAD = `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uWarm; uniform vec3 uCool;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunGlow; uniform vec4 uHaze;
// the sky toward d (linear light): the horizon warm under the sun and cool away from it, the middle, the top, the sun's glow
vec3 skyAt(vec3 d) {
  float hl = length(d.xz), sl = length(uSunDir.xz);
  float toward = hl > 1e-4 && sl > 1e-4 ? 0.5 + 0.5 * dot(d.xz / hl, uSunDir.xz / sl) : 0.5;
  vec3 c = mix(mix(uCool, uWarm, toward * toward * toward), uMid, smoothstep(0.0, 0.07, d.y));
  c = mix(c, uTop, smoothstep(0.05, 0.5, d.y));
  float s = max(dot(d, uSunDir), 0.0);
  return c + uSunCol * uSunGlow * (0.22 * pow(s, 5.0) + 0.7 * pow(s, 80.0)) * smoothstep(-0.02, 0.01, d.y);
}
// how much of what lies t metres away, at height y1, seen from height y0, the air hides (0..1). The
// mist thins with height above the ground, and far ground has sunk under the Earth's curve: so y1
// is measured from where the ground would be, were the Earth flat.
float hazeOf(float y0, float y1, float t) {
  float k = uHaze.x * t;
  if (uHaze.y > 0.0) {
    float a = uHaze.y * exp(-(y0 - uHaze.w) / uHaze.z), b = (y1 - y0) / uHaze.z;
    k += abs(b) < 1e-3 ? a * t : a * t * (1.0 - exp(-b)) / b;
  }
  return 1.0 - exp(-k);
}
`;

// laid on after the colour has been turned to the screen's (where three.js lays its fog); vWp is the world point
export const HAZE = `
  {
    vec3 hzV = vWp - cameraPosition;
    float hzT = length(hzV);
    vec3 hzD = hzV / max(hzT, 1e-3);
    vec3 hzC = skyAt(normalize(vec3(hzD.x, max(hzD.y, 0.0) * 0.2, hzD.z)));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(hzC, 1.0)).rgb, hazeOf(cameraPosition.y, vWp.y + dot(vWp.xz, vWp.xz) / 12742000.0, hzT));
  }
`;
