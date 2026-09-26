#!/usr/bin/env node
// A stand-in for npm: `npm install -g <pkg>` prints a line and succeeds.
import { appendFileSync } from 'node:fs';
if (process.env.FAKE_NPM_LOG) appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
console.log(`added 1 package: ${process.argv.slice(2).join(' ')}`);
process.exit(0);
