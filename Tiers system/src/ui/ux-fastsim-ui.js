// "Fast sim" switch in the career menu, under Dark mode. On: "Sim match" plays the whole series at once and opens the Full time screen
// (the quick sim of older game versions) instead of the game-by-game Sim match window. "Play match" and "Continue sim" are not touched.
// Stored in this browser profile (localStorage); no game file is edited.
(function () {
  'use strict';
  if (window.__uxFastSim) return;
  if (typeof careerDarkButtonHtml !== 'function' || typeof C !== 'function') return;
  window.__uxFastSim = true;
  const KEY = 'uxFastSim';
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode: off */ }
  const save = () => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* not kept */ } };
  const origBtn = careerDarkButtonHtml;
  careerDarkButtonHtml = function () { // eslint-disable-line no-global-assign
    return origBtn.apply(this, arguments) + '\n        <button type="button" class="header-quiet career-dark-toggle" data-action="ux-fastsim" aria-pressed="' + on + '" title="' + esc(tl(on ? 'Turn off fast sim' : 'Turn on fast sim')) + '">' + esc(tl('Fast sim')) + '</button>';
  };
  let busy = false;
  document.addEventListener('click', async (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action="ux-fastsim"],[data-action="sim-my"]'); if (!a) return;
    if (a.dataset.action === 'ux-fastsim') { e.stopImmediatePropagation(); on = !on; save(); if (typeof render === 'function') render(); return; }
    if (!on || busy) return;
    const id = parseInt(a.dataset.id, 10), fx = (C().fixtures || []).find((f) => f.id === id);
    if (!fx || fx.played || fx.simmingGames) return; // a series already begun game by game goes on in the game's own window
    e.stopImmediatePropagation(); busy = true;
    try {
      if (typeof closeModal === 'function') closeModal();
      const r = await window.hub.simMyMatch(id);
      if (r && r.ok === false) { if (typeof showToast === 'function') showToast(r.error || tl('The game could not be simulated.'), 'error'); }
      else if (r) S = r;
      const done = (C().fixtures || []).find((f) => f.id === id);
      if (done && done.played && typeof openFullTime === 'function') openFullTime(id); else if (typeof render === 'function') render();
    } catch (err) { if (typeof showToast === 'function') showToast(tl('The game could not be simulated.'), 'error'); } finally { busy = false; }
  }, true);
})();
