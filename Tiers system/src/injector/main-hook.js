'use strict';
// Loaded into the game's main process via NODE_OPTIONS=--require. Never edits game files:
// it only wraps the engine module's exported functions after the game has loaded it.
// If anything fails it logs and leaves the game exactly as it was.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const LOG = process.env.BTIER_LOG || path.join(process.env.TEMP || process.env.TMPDIR || '.', 'btier-injector.log');
const log = (m) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch (e) { /* logging must never break the game */ } };

// NODE_OPTIONS reaches every Electron process; only the main process has the engine.
if (process.versions && process.versions.electron && process.type && process.type !== 'browser') return;

log('injector loaded (pid ' + process.pid + ')');
try {
  const { wrapEngine } = require('../engine/btier-state');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const exp = origLoad.apply(this, arguments);
    try {
      if (/(^|[\\/])league(\.js)?$/.test(request) && exp && typeof exp.generateLeague === 'function' && !exp.__btier) {
        let events = null;
        try { events = require(path.join(path.dirname(Module._resolveFilename(request, parent)), 'events.js')); } catch (e) { log('events module not found: ' + e.message); }
        wrapEngine(exp, { log, events });
        log('hooked engine.generateLeague via require("' + request + '")');
      }
    } catch (e) { log('hook error: ' + e.stack); }
    return exp;
  };
} catch (e) { log('injector failed to start: ' + e.stack); }
