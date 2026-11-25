// World editor: Tier B regions (EU B, NA B, ...) next to the Tier A ones, edited exactly like Tier A (club name / tag / colours / logo,
// swap players, custom players). The game's openWorld() loads the Tier A base; the Tier B base is added here (data: window.__btierWorldBase,
// supplied by the injector). Saving and applying edits is handled in the main process by src/engine/btier-world.js.
(function () {
  'use strict';
  if (window.__uxWorldUI) return;
  if (typeof openWorld !== 'function') return;
  window.__uxWorldUI = true;
  const origOpen = openWorld;
  openWorld = async function () { // eslint-disable-line no-global-assign
    const r = await origOpen.apply(this, arguments);
    try {
      const add = window.__btierWorldBase;
      const extra = window.__btierWorldExtraA; // the 16 extra Tier A clubs of each region: a region has 32
      if (typeof wEd !== 'undefined' && wEd && Array.isArray(wEd.base) && extra) {
        for (const r of wEd.base) { const x = extra[r.id]; if (Array.isArray(x) && x.length && !r.teams.some((t) => t.name === x[0].name)) r.teams = r.teams.concat(JSON.parse(JSON.stringify(x))); }
        render();
      }
      if (typeof wEd !== 'undefined' && wEd && Array.isArray(wEd.base) && Array.isArray(add) && add.length && !wEd.base.some((x) => /_b$/.test(x.id))) {
        wEd.base = wEd.base.concat(JSON.parse(JSON.stringify(add)));
        render();
      }
    } catch (e) { /* editor stays Tier A only */ }
    return r;
  };
})();
