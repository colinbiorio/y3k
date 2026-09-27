#!/usr/bin/env node
// The `y3kode` command (and `y3k-code`, the same). A few lines of plain CommonJS that check the Node
// version BEFORE any of the engine is loaded, then hand over to y3k-code.mjs.
//
// Why a separate file: the engine is ES modules written for Node 20.6+. On an
// older Node the first thing a person saw was a SyntaxError or an
// ERR_UNKNOWN_FILE_EXTENSION from deep inside it — true, and useless to someone
// who just pasted the command y3k Code gave them. This file uses nothing newer
// than Node 12 can parse, so on any Node old enough to matter it gets far
// enough to say what to do instead.
//
// `node y3k-code/bin/y3k-code.mjs` still works as it always did; it just skips
// this check.
'use strict';

var MIN = [20, 6];
var have = String(process.versions.node || '0.0.0').split('.').map(Number);
if (have[0] < MIN[0] || (have[0] === MIN[0] && have[1] < MIN[1])) {
  process.stderr.write(
    '\ny3kode needs Node.js ' + MIN.join('.') + ' or newer; this computer has ' + process.version + '.\n'
    + 'Install Node.js 20 or newer: https://nodejs.org\n'
    + 'Then run the same command again.\n\n'
  );
  process.exit(1);
}

var path = require('path');
var url = require('url');
// A file URL, not a path: import() of a bare C:\ path fails on Windows.
import(url.pathToFileURL(path.join(__dirname, 'y3k-code.mjs')).href).catch(function (err) {
  process.stderr.write('y3kode: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(1);
});
