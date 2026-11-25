'use strict';
// Runs every test file in this folder; exit code 1 if any fails.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + f + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  if (!ok) console.log((r.stdout + r.stderr).split('\n').filter((l) => !/^\s+at /.test(l)).slice(-12).join('\n'));
}
console.log(failed ? failed + ' test file(s) failed' : 'all test files passed');
process.exit(failed ? 1 : 0);
