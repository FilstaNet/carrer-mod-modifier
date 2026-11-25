'use strict';
// Attaches the Tier B mod to a RUNNING game, from inside the game's main process. Shared by:
//  - launcher/start.js  (evaluates tryAttach() through the inspector port)
//  - tiers-shim.js      (direct launch: the shim lives in resources/app and polls tryAttach() itself)
// No game file is edited: it wraps the loaded engine module in memory and adds the UI code to each game page.
// tryAttach() returns 'wait' (engine not loaded yet, e.g. beta gate still open), 'already', 'wrapped', 'no-require',
// 'error: ...' or, with opts.probe, a JSON diagnostic string.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const SRC = path.join(__dirname, '..');
const LOGOS = path.join(SRC, 'teams_logos');
const UI = ['ui/tier-ui.js', 'engine/academy.js', 'ui/academy-ui.js', 'ui/matches-ui.js', 'ui/logos-ui.js', 'ui/ux-ui.js', 'ui/ux-season-ui.js', 'ui/ux-office-ui.js', 'ui/ux-social-ui.js', 'engine/ux-persona.js', 'ui/ux-bets-ui.js', 'engine/ux-bets-rules.js', 'ui/world-ui.js', 'ui/ux-club-ui.js', 'ui/ux-staff-ui.js', 'ui/late-texts.js', 'ui/late-ui.js', 'ui/late-host-ui.js', 'ui/late-legacy-ui.js', 'ui/late-manager-ui.js', 'ui/ux-awards-ui.js', 'ui/ux-update-ui.js', 'ui/ux-scrims-ui.js', 'ui/ux-thread-ui.js', 'ui/ux-fastsim-ui.js']
  .map((f) => path.join(SRC, f));

function tryAttach(opts = {}) {
  const LOG = opts.log || path.join(process.env.TEMP || '.', 'btier-injector.log');
  const log = (m) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch (e) { /* logging must never break the game */ } };
  const keys = Object.keys(Module._cache);
  const lk = keys.find((k) => /engine[\\/]league\.js$/.test(k));
  if (opts.probe) return JSON.stringify({ node: process.version, modules: keys.length, league: !!lk, type: process.type });
  if (!lk) return 'wait';
  const engine = Module._cache[lk].exports;
  if (engine.__btier) return 'already';
  const ek = keys.find((k) => /engine[\\/]events\.js$/.test(k));
  try {
    const { wrapEngine } = require(path.join(SRC, 'engine', 'btier-state.js'));
    const tk = keys.find((k) => /engine[\\/]titles\.js$/.test(k));
    wrapEngine(engine, { log, titles: tk ? Module._cache[tk].exports : null, events: ek ? Module._cache[ek].exports : null, brandsFile: path.join(path.dirname(lk), '..', 'data', 'media-brands.json') });
    log('hooked engine (generateLeague, advance, startNextSeason); events module ' + (ek ? 'found' : 'MISSING'));
    try { // World editor: Tier B teams and players editable like Tier A (btier-world.js wraps the game's world module in memory)
      const wk = keys.find((k) => /engine[\\/]world\.js$/.test(k));
      if (wk) { require(path.join(SRC, 'engine', 'btier-world.js')).wrapWorld(Module._cache[wk].exports, { log }); log('world editor: Tier B hooked'); } else log('world editor: engine/world.js not loaded, Tier B not editable');
    } catch (e) { log('world editor hook failed: ' + e.stack); }
    try { // self-check inside the real runtime on a throw-away league (never saved, never touches the loaded career)
      const real = JSON.parse(fs.readFileSync(path.join(path.dirname(lk), '..', 'data', 'rlcs-2027.json'), 'utf8'));
      let sd = 1; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      const st = engine.generateLeague({ teamName: real.regions[0].teams[0].name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rnd);
      log('selfcheck: teams ' + st.teams.length + ', tier B teams ' + st.teams.filter((t) => t.tier === 'B').length + ', regions ' + st.regions.length + ', cups ' + (st.tierB && st.tierB.cups.length));
    } catch (e) { log('selfcheck failed: ' + e.stack); }
    try { // renderer side: injected into the game window each time its page finishes loading (also after the beta gate)
      const { app, BrowserWindow } = require('electron');
      const [tierUi, acadSrc, acadUi, matchesUi, logosUi, uxUi, uxSeasonUi, uxOfficeUi, uxSocialUi, personaSrc, uxBetsUi, betRulesSrc, worldUi, clubUi, staffUi, lateTexts, lateUi, lateHostUi, lateLegacyUi, lateManagerUi, awardsUi, updateUi, scrimsUi, threadUi, fastSimUi] = UI.map((f) => fs.readFileSync(f, 'utf8'));
      // Tier B club logos (src/teams_logos): club name -> svg text; file = abbreviation without special characters
      const logoMap = {};
      try {
        const ab = JSON.parse(fs.readFileSync(path.join(LOGOS, 'tier_b_team_abbreviations.json'), 'utf8'));
        for (const k of Object.keys(ab)) {
          const f = [k, k.replace(/[^A-Za-z0-9]/g, '')].map((n) => path.join(LOGOS, 'output_logos', n + '.svg')).find((x) => fs.existsSync(x));
          if (f) logoMap[ab[k]] = fs.readFileSync(f, 'utf8');
        }
      } catch (e) { log('logos failed: ' + e.message); }
      let prize = {}; try { prize = require(path.join(SRC, 'engine', 'ux-prize.js'))(ek ? Module._cache[ek].exports : null); } catch (e) { log('prize tables failed: ' + e.message); }
      let worldBase = [];
      try {
        const ab = JSON.parse(fs.readFileSync(path.join(LOGOS, 'tier_b_team_abbreviations.json'), 'utf8')), byName = {};
        for (const k of Object.keys(ab)) byName[ab[k]] = k;
        worldBase = require(path.join(SRC, 'engine', 'btier-world.js')).editorRegions(undefined, engine.clubStars, byName);
      } catch (e) { log('world editor base failed: ' + e.message); }
      let worldExtraA = {};
      try {
        const ab = JSON.parse(fs.readFileSync(path.join(LOGOS, 'tier_b_team_abbreviations.json'), 'utf8')), byName = {};
        for (const k of Object.keys(ab)) byName[ab[k]] = k;
        const realFile = path.join(path.dirname(lk), '..', 'data', 'rlcs-2027.json');
        worldExtraA = require(path.join(SRC, 'engine', 'btier-world.js')).editorExtraA(JSON.parse(fs.readFileSync(realFile, 'utf8')), engine.clubStars, byName);
      } catch (e) { log('world editor extra Tier A failed: ' + e.message); }
      let modVer = '0.0.0'; try { modVer = require('../../version.json').version; } catch (e) { /* label only */ }
      // second version label under the game's own (same look): the Modifier's version
      const modLabel = '(function(){var g=document.querySelector(".version-label");if(!g||document.querySelector(".mod-version-label"))return;var e=document.createElement("div");e.className="version-label mod-version-label"+(g.classList.contains("version-label-frameless")?" version-label-frameless":"");e.style.top="34px";e.textContent="v' + modVer + ' Modifier";document.body.appendChild(e);})();';
      // academy.js is shared with the engine; in the page it is exposed as window.__academy
      const ui = 'window.__uxPrize=' + JSON.stringify(prize) + ';(function(){const module={exports:{}};' + personaSrc + ';window.__uxPersona=module.exports;})();(function(){const module={exports:{}};' + betRulesSrc + ';window.__uxBetRules=module.exports;})();window.__btierLogos=' + JSON.stringify(logoMap) + ';' + tierUi + ';(function(){const module={exports:{}};' + acadSrc + ';window.__academy=module.exports;})();' + acadUi + ';' + matchesUi + ';' + logosUi + ';' + uxUi + ';' + uxSeasonUi + ';' + uxOfficeUi + ';' + uxSocialUi + ';' + threadUi + ';' + uxBetsUi + ';window.__btierWorldBase=' + JSON.stringify(worldBase) + ';window.__btierWorldExtraA=' + JSON.stringify(worldExtraA) + ';' + worldUi + ';' + clubUi + ';' + staffUi + ';' + lateTexts + ';' + lateUi + ';' + lateHostUi + ';' + lateLegacyUi + ';' + lateManagerUi + ';' + awardsUi + ';' + scrimsUi + ';' + fastSimUi + ';' + updateUi + ';' + modLabel;
      const updater = require(path.join(SRC, 'engine', 'ux-update.js'));
      const inject = (wc) => { try { if (/renderer.index.html/.test(wc.getURL())) { updater.bridge(wc, log); wc.executeJavaScript(ui).catch((e) => log('ui inject failed: ' + e.message)); } } catch (e) { log('ui inject error: ' + e.message); } };
      const watch = (w) => { inject(w.webContents); w.webContents.on('did-finish-load', () => inject(w.webContents)); };
      BrowserWindow.getAllWindows().forEach(watch);
      app.on('browser-window-created', (e, w) => w.webContents.on('did-finish-load', () => inject(w.webContents)));
      log('ui hook installed');
    } catch (e) { log('ui hook failed: ' + e.stack); }
    if (opts.closeInspector) { try { require('inspector').close(); } catch (e) { /* not open */ } }
    return 'wrapped';
  } catch (e) { log('hook failed: ' + e.stack); return 'error: ' + e.message; }
}

module.exports = { tryAttach };
