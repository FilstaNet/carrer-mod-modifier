'use strict';
// Self-update of the Modifier from the latest GitHub release (its .exe asset).
// Used by the Setup-tab bridge (main process). Nothing installs without a click.
// Windows lets a running exe be renamed but not overwritten, so: current -> .old, new -> current.
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'FilstaNet/carrer-mod-modifier';
const DIR = path.join(process.env.LOCALAPPDATA || require('os').tmpdir(), 'RLCareerHubTiersMod');
const FILE = path.join(DIR, 'settings.json');
const PREFIX = '__btier_upd__';

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } };
const write = (o) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.assign(read(), o))); };
const isAuto = () => read().auto !== false;
const current = () => { try { return require('../../version.json').version; } catch (e) { return '0.0.0'; } };
const nums = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
const isNewer = (a, b) => { const x = nums(a), y = nums(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

const get = (url, accept, hops = 0) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'tiers-mod-updater', Accept: accept }, timeout: 15000 }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) { r.resume(); return resolve(get(new URL(r.headers.location, url).href, accept, hops + 1)); }
    if (r.statusCode !== 200) { r.resume(); return reject(new Error('GitHub answered ' + r.statusCode)); }
    resolve(r);
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timed out')); });
});

async function check() {
  const r = await get('https://api.github.com/repos/' + REPO + '/releases/latest', 'application/vnd.github+json');
  let body = ''; for await (const c of r) body += c;
  const j = JSON.parse(body);
  const a = (j.assets || []).find((x) => /\.exe$/i.test(x.name) && String(x.browser_download_url).startsWith('https://github.com/' + REPO + '/releases/download/'));
  const latest = String(j.tag_name || '').replace(/^v/, '');
  return { current: current(), latest, newer: !!a && isNewer(latest, current()) && read().applied !== latest, url: a && a.browser_download_url, size: a && a.size };
}

// The Modifier exe to replace: the one that started us (set by the stub), else one next to the game. null = unknown.
function target(gameDir) {
  if (process.env.TIERSMOD_EXE) return process.env.TIERSMOD_EXE;
  try { const f = fs.readdirSync(gameDir).find((n) => /(modifier|tiers)\.exe$/i.test(n)); return f ? path.join(gameDir, f) : null; } catch (e) { return null; }
}

async function apply(info, exePath) {
  if (!exePath) throw new Error('Modifier .exe not found next to the game');
  const tmp = exePath + '.new';
  try {
    const r = await get(info.url, '*/*');
    await new Promise((ok, no) => { const w = fs.createWriteStream(tmp); r.pipe(w); w.on('finish', ok); w.on('error', no); r.on('error', no); });
    const head = Buffer.alloc(2), fd = fs.openSync(tmp, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    if (fs.statSync(tmp).size !== info.size || head.toString() !== 'MZ') throw new Error('download is incomplete');
    try { fs.unlinkSync(exePath + '.old'); } catch (e) { /* still locked or absent */ }
    fs.renameSync(exePath, exePath + '.old');
    try { fs.renameSync(tmp, exePath); } catch (e) { fs.renameSync(exePath + '.old', exePath); throw e; }
    write({ applied: info.latest });
  } catch (e) { try { fs.unlinkSync(tmp); } catch (x) { /* nothing to clean */ } throw e; }
}

// ---- Setup-tab bridge (main process). The page talks to us through console messages; we answer with executeJavaScript. ----
const S = { current: current(), auto: true, phase: 'idle', latest: '', msg: '' };
const wcs = new Set();
let busy = false, launched = false;
const push = () => { for (const wc of wcs) { try { if (!wc.isDestroyed()) wc.executeJavaScript('window.__btierUpd&&window.__btierUpd.set(' + JSON.stringify(S) + ')').catch(() => {}); } catch (e) { /* page gone */ } } };
const set = (o) => { Object.assign(S, o); push(); };

// Never installs on its own: 'launch' only checks (when the box is ticked), and the page shows a popup. Installing needs a click ('apply').
async function run(mode, log) { // 'check' | 'apply' | 'launch'
  if (busy) return;
  busy = true;
  try {
    if (mode === 'launch' && !isAuto()) { busy = false; return; }
    set({ phase: 'checking', msg: '' });
    const info = await check();
    set({ latest: info.latest, phase: info.newer ? 'available' : 'uptodate' });
    if (info.newer && mode === 'apply') {
      set({ phase: 'downloading' });
      await apply(info, target(path.dirname(process.execPath)));
      set({ phase: 'done' });
      log('updated Modifier to ' + info.latest);
    }
  } catch (e) {
    const denied = e.code === 'EPERM' || e.code === 'EACCES';
    set({ phase: 'error', msg: denied ? 'Windows does not allow writing to the folder of the Modifier (probably Program Files). Download ' + S.latest + ' from github.com/' + REPO + '/releases and replace the .exe, or move the game out of Program Files.' : e.message });
    log('update failed: ' + e.message);
  }
  busy = false;
}

function bridge(wc, log) {
  if (wcs.has(wc)) return;
  wcs.add(wc);
  wc.on('console-message', (e, level, message) => {
    const m = typeof e.message === 'string' ? e.message : message;
    if (typeof m !== 'string' || !m.startsWith(PREFIX)) return;
    let c; try { c = JSON.parse(m.slice(PREFIX.length)); } catch (x) { return; }
    if (c.cmd === 'hello') { S.auto = isAuto(); push(); if (!launched) { launched = true; run('launch', log); } }
    else if (c.cmd === 'auto') { write({ auto: !!c.value }); set({ auto: !!c.value }); }
    else if (c.cmd === 'check' || c.cmd === 'apply') run(c.cmd, log);
  });
}

module.exports = { check, apply, target, isAuto, bridge, isNewer };
