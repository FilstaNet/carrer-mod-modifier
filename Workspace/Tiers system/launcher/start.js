'use strict';
// Starts the ORIGINAL, unmodified game and attaches the Tier B injector to its main process.
// usage: node launcher/start.js ["C:\path\to\RL Career Hub.exe"]
//
// How: the exe is started with --inspect=<port> (Electron fuse EnableNodeCliInspectArguments is on). We connect to that
// local port, wait until the game has loaded its engine/league.js (this happens only AFTER you pass the normal beta gate),
// wrap the engine in memory, then close the inspector port again. No game file is edited. (Plain NODE_OPTIONS=--require
// is ignored by this exe when launched normally, so src/injector/main-hook.js is kept only for node-mode tests.)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const DEFAULT_EXE = path.join(__dirname, '..', '..', '..', 'Original Mode', 'RL Career Hub', 'RL Career Hub.exe');
const exe = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_EXE;
const PORT = Number(process.env.BTIER_PORT) || 9339;
const LOG = process.env.BTIER_LOG || path.join(process.env.TEMP || '.', 'btier-injector.log');
const WAIT_MS = 20 * 60 * 1000; // how long we wait for you to pass the gate
const UI = path.join(__dirname, '..', 'src', 'ui', 'tier-ui.js');
const PROBE = process.argv.includes('--probe'); // diagnostics only, injects nothing

if (!fs.existsSync(exe)) { console.error('Game exe not found: ' + exe); process.exit(1); }
const say = (m) => { console.log(m); try { fs.appendFileSync(LOG, new Date().toISOString() + ' launcher: ' + m + '\n'); } catch (e) { /* ignore */ } };

// Runs inside the game's main process. Returns a short status string.
function remoteCode() {
  const inj = path.join(__dirname, '..', 'src', 'engine', 'btier-state.js').replace(/\\/g, '/');
  return `(function () {
    const req = (typeof require === 'function' ? require : (process.mainModule && process.mainModule.require.bind(process.mainModule)));
    if (!req) return 'no-require';
    const Module = req('module');
    const keys = Object.keys(Module._cache);
    const lk = keys.find((k) => /engine[\\\\/]league\\.js$/.test(k));
    if (${PROBE}) return JSON.stringify({ node: process.version, modules: keys.length, league: !!lk, type: process.type });
    if (!lk) return 'wait';
    const engine = Module._cache[lk].exports;
    if (engine.__btier) return 'already';
    const ek = keys.find((k) => /engine[\\\\/]events\\.js$/.test(k));
    const fs = req('fs');
    const log = (m) => { try { fs.appendFileSync(${JSON.stringify(LOG)}, new Date().toISOString() + ' ' + m + '\\n'); } catch (e) {} };
    try {
      const { wrapEngine } = req(${JSON.stringify(inj)});
      wrapEngine(engine, { log, events: ek ? Module._cache[ek].exports : null });
      log('hooked engine (generateLeague, advance, startNextSeason) via inspector; events module ' + (ek ? 'found' : 'MISSING'));
      try { // self-check inside the real runtime on a throw-away league (never saved, never touches the loaded career)
        const dir = req('path').dirname(lk);
        const real = JSON.parse(fs.readFileSync(req('path').join(dir, '..', 'data', 'rlcs-2027.json'), 'utf8'));
        let sd = 1; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const st = engine.generateLeague({ teamName: real.regions[0].teams[0].name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rnd);
        log('selfcheck: teams ' + st.teams.length + ', tier B teams ' + st.teams.filter((t) => t.tier === 'B').length + ', regions ' + st.regions.length + ', cups ' + (st.tierB && st.tierB.cups.length));
      } catch (e) { log('selfcheck failed: ' + e.stack); }
      try { // renderer side: TIER A/B switch. Injected into the game window each time its page finishes loading (works after the beta gate too).
        const { app, BrowserWindow } = req('electron');
        const ui = fs.readFileSync(${JSON.stringify(UI)}, 'utf8');
        const inject = (wc) => { try { if (/renderer.index.html/.test(wc.getURL())) wc.executeJavaScript(ui).catch((e) => log('ui inject failed: ' + e.message)); } catch (e) { log('ui inject error: ' + e.message); } };
        const watch = (w) => { inject(w.webContents); w.webContents.on('did-finish-load', () => inject(w.webContents)); };
        BrowserWindow.getAllWindows().forEach(watch);
        app.on('browser-window-created', (e, w) => w.webContents.on('did-finish-load', () => inject(w.webContents)));
        log('ui hook installed');
      } catch (e) { log('ui hook failed: ' + e.stack); }
      try { req('inspector').close(); } catch (e) {}
      return 'wrapped';
    } catch (e) { log('hook failed: ' + e.stack); return 'error: ' + e.message; }
  })()`;
}

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try { const list = await getJson(`http://127.0.0.1:${PORT}/json/list`); if (list[0] && list[0].webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl; } catch (e) { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('inspector port did not open');
}

(async () => {
  say('starting ' + exe + ' (inspector 127.0.0.1:' + PORT + ', log ' + LOG + ')');
  spawn(exe, ['--inspect=' + PORT], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref();
  const ws = new WebSocket(await connect());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('websocket failed')); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const call = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalRemote = async () => { const r = await call('Runtime.evaluate', { expression: remoteCode(), includeCommandLineAPI: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r); };

  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < WAIT_MS) {
    let s;
    try { s = await evalRemote(); } catch (e) { s = 'error: ' + e.message; }
    if (s !== last) { say('status: ' + s); last = s; }
    if (PROBE || s === 'wrapped' || s === 'already' || String(s).startsWith('error') || s === 'no-require') break;
    await sleep(3000);
  }
  say(last === 'wrapped' ? 'Tier B injector is active. You can start a new career.' : 'finished with status: ' + last);
  try { ws.close(); } catch (e) { /* ignore */ }
  process.exit(last === 'wrapped' || PROBE ? 0 : 1);
})().catch((e) => { say('failed: ' + e.message); process.exit(1); });
