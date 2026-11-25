'use strict';
// The injector maps the UI file list to variables by position: a file added to UI without a matching variable shifts every later file (and drops the last).
const assert = require('assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'injector', 'inproc.js'), 'utf8');
const files = src.match(/const UI = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim()).filter(Boolean);
const names = src.match(/const \[([^\]]*)\] = UI\.map/)[1].split(',').map((s) => s.trim());
assert.strictEqual(names.length, files.length, 'UI list has ' + files.length + ' files but ' + names.length + ' variables');
const concat = src.split('\n').find((l) => /const ui = 'window\.__uxPrize/.test(l));
for (const n of names) if (!/^(acadSrc|personaSrc|betRulesSrc)$/.test(n)) assert(concat.includes("' + " + n + " + '") || concat.includes(n + " + ';'"), 'variable ' + n + ' is never injected');
console.log('inproc ui list ok (' + files.length + ' files)');
