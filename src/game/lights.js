// lights.js — THE VOID'S THREE LIGHTS, as numbers (void.js draws them; the
// controls sheet names them). Each: the sky's top and its horizon, the light's
// colour, how much of it and where it comes from, how wide the horizon's band
// is, the floor an inch down and its lattice lines, how much of a mirror the
// water is seen from straight above (f0), the motes (solid in a pale sky,
// added light in a dark one), the stars, and the light a body is seen by:
// one soft light from above (key), the sky wrapped round it (env), and at
// night a little of the sky's own colour on every side (fill), without which
// a body between the eye and the glow is only its outline.
export const LIGHTS = {
  pale: { zenith: '#93adc6', horizon: '#f3f6f9', glow: '#ffffff', glowAmt: 0.30, glowDir: [0.32, 0.30, -0.9], band: 2.6,
    floor: '#dfe7ee', line: '#8fa5ba', lineAmt: 0.55, f0: 0.34, mote: '#ffffff', moteSolid: 1, stars: 0, key: '#ffffff', keyAmt: 1.5, env: 1.0, fill: ['#ffffff', '#dfe7ee'], fillAmt: 0 },
  dusk: { zenith: '#39406e', horizon: '#f2c3a0', glow: '#ffd9b0', glowAmt: 0.42, glowDir: [-0.5, 0.12, -0.86], band: 3.4,
    floor: '#8e8492', line: '#f1cdb4', lineAmt: 0.5, f0: 0.42, mote: '#ffe2c4', moteSolid: 0, stars: 0.25, key: '#ffc49a', keyAmt: 1.7, env: 0.9, fill: ['#b9a7c9', '#e8b89a'], fillAmt: 0.5 },
  night: { zenith: '#04060c', horizon: '#1b2c44', glow: '#5a7ea8', glowAmt: 0.22, glowDir: [0.2, 0.1, -0.97], band: 4.2,
    floor: '#0c1119', line: '#5f86b0', lineAmt: 0.6, f0: 0.5, mote: '#bcd8ff', moteSolid: 0, stars: 1, key: '#9fc0ff', keyAmt: 1.1, env: 1.6, fill: ['#7f9fd6', '#2a4468'], fillAmt: 3 },
};
export const LIGHT_NAMES = Object.keys(LIGHTS);
