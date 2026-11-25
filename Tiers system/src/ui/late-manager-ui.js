// Manager tab of the Club hub: the manager's own career (clubs led, honours, milestones), not tied to one club.
// Read from C().uxManager (written by late-manager.js). Words come from window.__lateTexts.manager.
(function () {
  'use strict';
  if (window.__lateManagerUI) return;
  if (typeof C !== 'function' || !window.__lateTexts) return;
  const st = document.createElement('style');
  st.textContent = '.lmg-row{display:grid;grid-template-columns:minmax(0,2fr) repeat(3,minmax(64px,1fr)) minmax(80px,1fr);gap:8px;align-items:center;padding:9px 4px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent);text-align:center;white-space:nowrap}.lmg-row .l{text-align:left;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px;min-width:0}.lmg-h{border-top:0;font-size:var(--f-small);text-transform:uppercase;letter-spacing:.07em;color:var(--red);font-weight:700}' +
    '.lmg-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lmg-stat{padding:8px 4px;text-align:center}.lmg-stat b{display:block;font-size:1.4em}.lmg-stat small{opacity:.7}' +
    '.lmg-chips{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}.lmg-chip{padding:8px 14px;border-radius:999px;background:color-mix(in srgb,var(--text) 8%,transparent)}.lmg-chip b{font-size:1.15em;margin-right:4px}.lmg-hrow{display:grid;grid-template-columns:90px minmax(0,1.3fr) minmax(0,1.6fr) 110px 90px 130px;gap:12px;align-items:center;padding:12px 10px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.lmg-hrow.lmg-ns{border-top:3px solid color-mix(in srgb,var(--text) 38%,transparent)}.lmg-hrow.lmg-h{border-top:0;font-size:var(--f-small);text-transform:uppercase;letter-spacing:.07em;color:var(--red);font-weight:700}.lmg-link{color:var(--accent,var(--red));cursor:pointer;text-decoration:underline;text-underline-offset:3px}.lmg-link:hover{filter:brightness(1.2)}.lmg-mh{display:flex;justify-content:space-between;align-items:center}.lmg-x{background:transparent;border:0;color:inherit;font-size:28px;line-height:1;cursor:pointer;padding:0 6px;opacity:.7}.lmg-x:hover{opacity:1}.lmg-tabs{display:flex;gap:6px;margin:0 0 12px}.lmg-tabs button{padding:8px 18px;border-radius:6px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}.lmg-tabs button.on{background:var(--accent,var(--red));border-color:var(--accent,var(--red));color:#fff;font-weight:700}.lmg-stats4{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}.lmg-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}.lmg-seasons{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;align-items:start}.lmg-club-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:18px;align-items:start}.lmg-club-grid.one{grid-template-columns:minmax(0,1fr)}@media(max-width:900px){.lmg-club-grid{grid-template-columns:minmax(0,1fr)}}.lmg-click{cursor:pointer}.lmg-click:hover{background:color-mix(in srgb,var(--text) 6%,transparent)}.lmg-ms{display:flex;justify-content:space-between;gap:12px;padding:8px 4px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.lmg-ms.off{opacity:.5}.lmg-ms small{display:block;opacity:.75}';
  document.head.appendChild(st);
  const T = window.__lateTexts.manager || {};
  const f = (str, v) => String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const bold = (str) => esc(str).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const sec = (title, body) => '<div class="ux-cs"><h4>' + esc(title) + '</h4>' + body + '</div>';
  const how = (title, lines) => '<div class="ux-how"><div class="ux-how-h">' + esc(title) + '</div><ul>' + lines.map((l) => '<li>' + bold(l) + '</li>').join('') + '</ul></div>';
  const cm = (s) => '<div class="ux-cm">' + esc(s) + '</div>';
  const MS = [ // mirrors late-manager.js MILESTONES (names, points, followers); the state only keeps which ones were reached
    ['first', 'First trophy', 5, 1], ['titles5', '5 trophies', 10, 1], ['titles10', '10 trophies', 15, 2], ['titles25', '25 trophies', 25, 3], ['worlds', 'World champion', 15, 2],
    ['wins50', '50 series wins', 5, 0.5], ['wins100', '100 series wins', 10, 1], ['wins250', '250 series wins', 20, 2], ['seasons5', '5 seasons as manager', 5, 0.5], ['seasons10', '10 seasons as manager', 10, 1], ['clubs3', 'Trophies with 3 clubs', 20, 2],
  ];
  const years = (s) => (s.from === s.to ? f(T.yearFmt, { a: s.from }) : f(T.yearsFmt, { a: s.from, b: s.to }));
  function lifeHtml(m) {
    const seasons = m.stints.reduce((a, s) => a + s.seasons, 0), pm = C().managerPast || {}, won = pm.won || 0, lost = (pm.series || 0) - won;
    const stat = (v, l) => '<div class="lmg-stat"><b>' + esc(v) + '</b><small>' + esc(l) + '</small></div>';
    return '<div class="lmg-stats">' + stat(seasons, T.seasons) + stat(won + '–' + lost, T.series) + stat(m.honours.length, T.titles) + stat(m.stints.length, T.clubsLed) + stat(m.points, T.points) + stat(won, T.won) + '</div>';
  }
  function clubsHtml(m) {
    if (!m.stints.length) return cm(T.clubsEmpty);
    const head = '<div class="lmg-row lmg-h"><span class="l">' + esc(T.cClub) + '</span><span>' + esc(T.cYears) + '</span><span>' + esc(T.cSeries) + '</span><span>' + esc(T.cTitles) + '</span><span>' + esc(T.cEnd) + '</span></div>';
    return head + m.stints.slice().reverse().map((s) => { const t = teamById(s.teamId), end = s.end ? (s.end === 'sacked' ? T.sacked : T.moved) : s.sacked ? T.sacked : T.now; return '<div class="lmg-row lmg-click" data-action="lmg-club" data-team="' + s.teamId + '"><span class="l">' + (t ? crest(t, 'small') + ' ' : '') + esc(s.name) + '</span><span>' + esc(years(s)) + '</span><span>' + (() => { const w = s.w + (s.live ? s.live.w : 0), l = s.l + (s.live ? s.live.l : 0); return w || l ? w + '–' + l : '–'; })() + '</span><b>' + s.titles + '</b><span>' + esc(end) + '</span></div>'; }).join('');
  }
  function honoursHtml(m) {
    if (!m.honours.length) return cm(T.honoursEmpty);
    const by = {}; for (const h of m.honours) (by[h.club] || (by[h.club] = [])).push(h);
    return Object.keys(by).map((c) => '<div class="late-q lmg-click" data-action="lmg-club" data-team="' + by[c][0].teamId + '"><b>' + esc(c) + '</b> <span class="ux-cm">' + by[c].length + '</span><div class="ux-cm">' + esc(by[c].slice().reverse().map((h) => (((T.kinds || {})[h.k]) || h.k) + ' · S' + h.season).join('  |  ')) + '</div></div>').join('');
  }
  function msHtml(m) {
    return MS.map(([id, name, pts, fans]) => { const r = m.rewards[id]; return '<div class="lmg-ms' + (r ? '' : ' off') + '"><span><b>' + esc(name) + '</b><small>' + esc(r ? f(T.msDone, { s: r.season, c: r.club }) : T.msOpen) + '</small></span><span>' + esc(f(T.msReward, { p: pts }) + (fans ? f(T.msFans, { f: fans }) : '')) + '</span></div>'; }).join('');
  }
  const isTierB = () => { const t = teamById(C().userTeamId); return !!t && /_b$/.test(t.region || ''); };
  const act = (o) => window.hub.placeBet({ kind: 'uxm:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  let busy = false;
  async function send(req, okText) {
    if (busy) return; busy = true;
    try { const r = await act(req); if (r && r.ok) { S = r; if (okText) showToast(okText); } else showToast((r && r.error) || 'That is not possible.'); } finally { busy = false; }
    if (typeof render === 'function') render();
  }
  function offersHtml(m) {
    const open = (m.offers || []).filter((o) => o.status === 'open' && C().currentDate <= o.expires);
    const rep = '<div class="ux-cm">' + esc(f(T.repLine, { r: m.rep || 0, n: m.need || 0 })) + '</div>';
    if (isTierB()) return cm(T.offerTierB);
    if (!open.length) return rep + cm(T.offersEmpty);
    return rep + open.map((o) => { const t = teamById(o.teamId); return '<div class="late-q" style="padding:8px 0"><b>' + (t ? crest(t, 'small') + ' ' : '') + esc(o.name) + '</b> <span class="late-tag">' + esc((T.types || {})[o.type] || o.type) + '</span><div class="ux-cm">' + esc(o.why) + ' ' + esc(f(T.until, { d: o.expires })) + '</div><div style="margin-top:6px;display:flex;gap:8px"><button type="button" class="btn" data-action="lmg-accept" data-id="' + o.id + '" data-name="' + esc(o.name) + '">' + esc(T.accept) + '</button><button type="button" class="btn" data-action="lmg-decline" data-id="' + o.id + '">' + esc(T.decline) + '</button></div></div>'; }).join('');
  }
  let cm_ = { id: null, tab: 'overview' };
  function clubModal(id, tab) {
    const m = C().uxManager, t = teamById(id); if (!m || !t) return;
    cm_ = { id, tab: tab || (cm_.id === id ? cm_.tab : 'overview') };
    const sp = m.stints.filter((s) => s.teamId === id), hs = m.honours.filter((h) => h.teamId === id);
    const w = sp.reduce((a, s) => a + s.w + (s.live ? s.live.w : 0), 0), l = sp.reduce((a, s) => a + s.l + (s.live ? s.live.l : 0), 0);
    const end = (s) => (s.end ? (s.end === 'sacked' ? T.sacked : T.moved) : s.sacked ? T.sacked : T.now);
    const kindName = (k) => (T.kinds || {})[k] || k;
    const stat = (v, lab) => '<div class="lmg-stat"><b>' + esc(v) + '</b><small>' + esc(lab) + '</small></div>';
    const lg = window.__lateLegacyClub ? window.__lateLegacyClub(id) : null;
    const tabs = [['overview', T.tOverview], ['honours', T.tHonours]].concat(lg ? [['hof', T.tHof], ['records', T.tRecords]] : []);
    if (!tabs.some((x) => x[0] === cm_.tab)) cm_.tab = 'overview';
    let body = '';
    if (cm_.tab === 'overview') {
      const kinds = {}; hs.forEach((h) => { kinds[h.k] = (kinds[h.k] || 0) + 1; });
      body = '<div class="lmg-stats lmg-stats4">' + stat(sp.reduce((a, s) => a + s.seasons, 0), T.seasons) + stat(w || l ? w + '–' + l : '–', T.series) + stat(hs.length, T.titles) + stat(sp.length, T.spells) + '</div>' +
        '<div class="lmg-two"><div>' + sec(T.spellsTitle, sp.map((s) => '<div class="lmg-ms"><span><b>' + esc(years(s)) + '</b><small>' + esc(f(T.spellLine, { n: s.seasons, t: s.titles })) + '</small></span><span>' + esc(end(s)) + '</span></div>').join('')) + '</div>' +
        '<div>' + sec(T.honoursTitle, Object.keys(kinds).length ? Object.keys(kinds).map((k) => '<div class="lmg-ms"><span><b>' + esc(kindName(k)) + '</b></span><b>' + kinds[k] + '</b></div>').join('') : cm(T.honoursEmpty)) + '</div></div>';
    } else if (cm_.tab === 'honours') {
      const kinds = {}; hs.forEach((h) => { kinds[h.k] = (kinds[h.k] || 0) + 1; });
      const chips = '<div class="lmg-chips">' + Object.keys(kinds).map((k) => '<span class="lmg-chip"><b>' + kinds[k] + '</b> ' + esc(kindName(k)) + '</span>').join('') + '</div>';
      const head = '<div class="lmg-hrow lmg-h"><span>' + esc(T.cSeason) + '</span><span>' + esc(T.cTrophy) + '</span><span>' + esc(T.cEvent) + '</span><span>' + esc(T.cDate) + '</span><span>' + esc(T.cPoints) + '</span><span>' + esc(T.cPrize) + '</span></div>';
      const sorted = hs.slice().sort((a, b) => b.season - a.season || String(b.date || '').localeCompare(String(a.date || '')));
      const rows = sorted.map((h, i) => '<div class="lmg-hrow' + (i && sorted[i - 1].season !== h.season ? ' lmg-ns' : '') + '"><span><a class="lmg-link" data-action="lmg-goseason" data-s="' + h.season + '">' + esc(f(T.season, { n: h.season })) + '</a></span><span><b>' + esc(kindName(h.k)) + '</b></span><span>' + (h.id != null ? '<a class="lmg-link" data-action="lmg-goev" data-s="' + h.season + '" data-ev="' + h.id + '">' + esc(h.name || kindName(h.k)) + '</a>' : esc(h.name || '')) + '</span><span>' + esc(h.date ? fmtDateShort(h.date) : '–') + '</span><span>' + (h.points != null ? esc(h.points) : '–') + '</span><span>' + (h.prize ? esc(fmtMoney(h.prize)) : '–') + '</span></div>').join('');
      body = hs.length ? chips + '<div class="ux-cs">' + head + rows + '</div><div class="ux-cm" style="margin-top:6px">' + esc(T.honoursHint) + '</div>' : cm(T.honoursEmpty);
    } else if (cm_.tab === 'hof') body = lg.hof;
    else body = lg.records;
    showModal('<div class="modal lmg-modal" style="width:min(1400px,96vw);max-width:none;height:min(86vh,820px);display:flex;flex-direction:column"><div class="modal-h lmg-mh"><span>' + crest(t, 'small') + ' ' + esc(t.name) + '</span><button type="button" class="lmg-x" data-action="close-modal" aria-label="' + esc(T.close) + '">×</button></div><div class="modal-b" style="flex:1;min-height:0;display:flex;flex-direction:column"><div class="lmg-tabs">' + tabs.map(([k, n]) => '<button type="button" data-action="lmg-ctab" data-tab="' + k + '" class="' + (cm_.tab === k ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div><div style="overflow:auto;flex:1;min-height:0;padding-right:4px">' + body + '</div></div></div>');
  }
  document.addEventListener('click', (e) => {
    const c = e.target && e.target.closest && e.target.closest('[data-action="lmg-club"]');
    if (c) { e.stopImmediatePropagation(); return void clubModal(Number(c.dataset.team), 'overview'); }
    const go = e.target && e.target.closest && e.target.closest('[data-action="lmg-goev"],[data-action="lmg-goseason"]');
    if (go) {
      e.stopImmediatePropagation(); const s = Number(go.dataset.s), ev = Number(go.dataset.ev);
      if (typeof closeModal === 'function') closeModal();
      if (go.dataset.action === 'lmg-goev' && window.__uxGoEvent) window.__uxGoEvent(s, ev); else if (window.__uxGoSeason) window.__uxGoSeason(s);
      return;
    }
    const tb = e.target && e.target.closest && e.target.closest('[data-action="lmg-ctab"]');
    if (tb) { e.stopImmediatePropagation(); return void clubModal(cm_.id, tb.dataset.tab); }
    // a click outside the window (on the dimmed background) closes it
    const root = document.getElementById('modal-root');
    if (root && root.querySelector('.lmg-modal') && root.contains(e.target) && !e.target.closest('.modal')) { if (typeof closeModal === 'function') closeModal(); return; }
    const a = e.target && e.target.closest && e.target.closest('[data-action^="lmg-a"],[data-action="lmg-decline"]'); if (!a) return;
    e.stopImmediatePropagation();
    if (a.dataset.action === 'lmg-accept') return void send({ a: 'accept', id: Number(a.dataset.id) }, f(T.accepted, { n: a.dataset.name }));
    return void send({ a: 'decline', id: Number(a.dataset.id) }, T.declined);
  }, true);
  window.__lateManagerUI = {
    tab: T.tab || 'Manager',
    html() {
      const m = C().uxManager;
      if (!m) return [[], [sec(T.clubsTitle, cm(T.clubsEmpty))]];
      return [[sec(T.lifeTitle, lifeHtml(m)), sec(T.msTitle, msHtml(m))], [sec(T.offersTitle, offersHtml(m)), sec(T.clubsTitle, clubsHtml(m)), sec(T.honoursTitle, honoursHtml(m))]];
    },
  };
})();
