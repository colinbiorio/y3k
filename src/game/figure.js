// figure.js — A BODY, DRAWN: one of the five kinds, as the person chose it
// (kinds.js says what may be chosen; ./bodies/ draws each).
//
// Every body is made of arithmetic like everything else in the void (no model
// file, nothing to download but a few small grey tiles for its surfaces), and
// every one answers to the same few things, so the view need not know which
// it is holding:
//
//   group                 what is put in the scene (it stays at the origin)
//   look                  how high its eyes are: where the eye behind it looks
//   update(body, dt, at)  one frame; answers where a foot came down ([x, z])
//   land(speed)           a landing: the knees take it
//   setEnv(k)             the void's own light on it (more of it in the dark)
//   dispose()
//
// A body faces +Z and its left is +X.
import { cleanKind, cleanLook } from './kinds.js';
import { createHuman } from './bodies/human.js';
import { createRobot } from './bodies/robot.js';
import { createMantis } from './bodies/mantis.js';
import { createOctopus } from './bodies/octopus.js';
import { createLight } from './bodies/light.js';

const MAKE = { human: createHuman, robot: createRobot, mantis: createMantis, octopus: createOctopus, light: createLight };

export function createFigure({ kind, look = null, lite = false } = {}) {
  const k = MAKE[cleanKind(kind)] ? cleanKind(kind) : 'human';
  return MAKE[k](cleanLook(k, look), { lite });
}
