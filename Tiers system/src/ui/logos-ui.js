// Tier B club logos: the game has no logo for these clubs, so crests are drawn from src/teams_logos/output_logos
// (svg per club, matched by club NAME, so a replacement club keeps working). window.__btierLogos = {club name: svg text}.
(function () {
  'use strict';
  const L = window.__btierLogos;
  if (window.__logosUI || !L || typeof logoSrc !== 'function' || typeof crest !== 'function') return;
  window.__logosUI = true;
  const origSrc = logoSrc, origCrest = crest;
  // eslint-disable-next-line no-global-assign
  logoSrc = function (l) {
    if (typeof l === 'string' && l.startsWith('btier:')) { const s = L[l.slice(6)]; return s ? 'data:image/svg+xml;utf8,' + encodeURIComponent(s) : ''; }
    return origSrc.apply(this, arguments);
  };
  // eslint-disable-next-line no-global-assign
  crest = function (t, cls) {
    if (t && !t.logo && !t.national && L[t.name]) // by name, not tier: a promoted club keeps its crest
      t = Object.assign({}, t, { logo: 'btier:' + t.name });
    return origCrest.call(this, t, cls);
  };
  try { render(); } catch (e) { /* no career open yet */ }
})();
