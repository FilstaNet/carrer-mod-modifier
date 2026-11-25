// Late game phase 4 UI (LateGamePlan.md section 7): the "Legacy" sub-tab of the Club hub: Hall of Fame, club records, all-time rivals.
// Everything is read from the career state (C().late.clubs[userTeamId].legacy, written by late-legacy.js). Words come from window.__lateTexts.legacy.
(function () {
  'use strict';
  if (window.__lateLegacyUI) return;
  if (typeof C !== 'function' || !window.__lateTexts) return;
  const st = document.createElement('style');
  st.textContent = '.ux-club-page{scrollbar-width:none}.ux-club-page::-webkit-scrollbar{display:none}' +
    '.llg-rec{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(130px,auto);gap:18px;align-items:center;padding:10px 4px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.llg-rec:first-of-type{border-top:0}.llg-rec b{font-size:1.15em;text-align:right}.llg-who{white-space:nowrap;text-align:right}.llg-who b{display:block;font-size:1.05em;color:var(--accent,var(--red));text-align:right}.llg-who small{opacity:.7}' +
    '.llg-tabs{display:flex;gap:6px;margin:0 0 8px}.llg-tabs button{padding:6px 14px;border-radius:6px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}.llg-tabs button.on{background:var(--accent,var(--red));border-color:var(--accent,var(--red));color:#fff;font-weight:700}' +
    '.llg-rv{display:grid;grid-template-columns:28px minmax(0,2fr) repeat(4,minmax(72px,1fr));gap:8px;align-items:center;padding:9px 4px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent);text-align:center;white-space:nowrap}.llg-rv .l{text-align:left;overflow:hidden;text-overflow:ellipsis}.llg-rv .pos{text-align:left;opacity:.7}.llg-rvh{border-top:0;font-size:var(--f-small);text-transform:uppercase;letter-spacing:.07em;color:var(--red);font-weight:700}';
  document.head.appendChild(st);
  let recTab = 'season';
  const T = window.__lateTexts.legacy || {};
  const f = (str, v) => String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const bold = (str) => esc(str).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const sec = (title, body) => '<div class="ux-cs"><h4>' + esc(title) + '</h4>' + body + '</div>';
  const how = (title, lines) => '<div class="ux-how"><div class="ux-how-h">' + esc(title) + '</div><ul>' + lines.map((l) => '<li>' + bold(l) + '</li>').join('') + '</ul></div>';
  const me = () => teamById(C().userTeamId);
  const late = () => C().late || null;
  const isTierB = () => { const t = me(); return !!t && /_b$/.test(t.region || ''); };
  const legacy = () => { const l = late(), c = l && l.clubs && l.clubs[C().userTeamId]; return (c && c.legacy) || null; };

  // majors and opens won while managing THIS club (the manager's honours), not the career total
  const clubWins = () => { const m = C().uxManager; if (!m) return late() && late().wins; const id = C().userTeamId, hs = (m.honours || []).filter((h) => h.teamId === id); return { major: hs.filter((h) => h.k === 'major').length, open: hs.filter((h) => h.k === 'open').length }; };
  function hofHtml(d) {
    if (!d.hof.length) return '<div class="ux-cm">' + esc(T.hofEmpty) + '</div>';
    return d.hof.slice().reverse().map((h) => '<div class="late-q"><b>' + esc(h.name) + '</b> <span class="ux-cm">' + esc(f(T.hofLine, { seasons: h.seasons, titles: h.titles, mvps: h.mvps, goals: h.goals, peak: h.peak, season: h.season })) + '</span></div>').join('');
  }
  // who = 'Name' or 'Name · S1': the name stands out, the rest is small
  const row = (label, value, who) => { const i = String(who || '').indexOf(' · '), name = i < 0 ? String(who || '') : who.slice(0, i), meta = i < 0 ? '' : who.slice(i + 3); return '<div class="llg-rec"><span>' + esc(label) + '</span><b>' + esc(value) + '</b><span class="llg-who"><b>' + esc(name) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</span></div>'; };
  function recordsHtml(d) {
    const tabs = '<div class="llg-tabs"><button type="button" data-action="llg-tab" data-tab="season" class="' + (recTab === 'season' ? 'on' : '') + '">' + esc(T.tabSeason) + '</button><button type="button" data-action="llg-tab" data-tab="total" class="' + (recTab === 'total' ? 'on' : '') + '">' + esc(T.tabTotal) + '</button></div>';
    const w = clubWins();
    if (recTab === 'total') {
      const ps = Object.values(d.players), top = (k) => ps.slice().sort((x, y) => (y[k] || 0) - (x[k] || 0))[0];
      const rows = [['goals', T.totGoals], ['assists', T.totAssists], ['mvps', T.totMvps], ['saves', T.totSaves], ['wins', T.totWins]].map(([k, label]) => { const e = top(k); return e && e[k] > 0 ? row(label, e[k], e.name) : ''; }).join('');
      const tt = ps.slice().sort((x, y) => y.titles.length - x.titles.length)[0], ss = ps.slice().sort((x, y) => y.seasons - x.seasons)[0];
      const extra = (tt && tt.titles.length ? row(T.totTitles, tt.titles.length, tt.name) : '') + (ss && ss.seasons ? row(T.totSeasons, ss.seasons, ss.name) : '') + (w ? row(T.totStops, w.major + w.open, ' · ' + f(T.recTitlesLine, { major: w.major, open: w.open })) : '');
      return tabs + (rows + extra ? rows + extra + '<div class="ux-cm" style="margin-top:6px">' + esc(T.totNote) + '</div>' : '<div class="ux-cm">' + esc(T.recEmpty) + '</div>');
    }
    const rows = [['goals', T.recGoals], ['assists', T.recAssists], ['mvps', T.recMvps], ['saves', T.recSaves], ['wins', T.recWins]].filter(([k]) => d.best[k]).map(([k, label]) => row(label, d.best[k].v, d.best[k].name + ' · ' + f(T.season, { n: d.best[k].season }))).join('');
    const extra = (d.streak.best ? row(T.recStreak, d.streak.best, ' · ' + (d.streak.to || '')) : '') + (w ? row(T.recTitles, w.major + w.open, ' · ' + f(T.recTitlesLine, { major: w.major, open: w.open })) : '');
    return tabs + (rows + extra ? rows + extra : '<div class="ux-cm">' + esc(T.recEmpty) + '</div>');
  }
  function rivalsHtml(d) {
    const rows = Object.entries(d.h2h).map(([id, h]) => ({ id: Number(id), h, n: h.sw + h.sl })).filter((x) => teamById(x.id)).sort((a, b) => b.n - a.n || b.h.sw - a.h.sw).slice(0, 15);
    if (!rows.length) return '<div class="ux-cm">' + esc(T.rivalsEmpty) + '</div>';
    const head = '<div class="llg-rv llg-rvh"><span>#</span><span class="l">' + esc(tl('Club')) + '</span><span>' + esc(T.series) + '</span><span>' + esc(T.games) + '</span><span>' + esc(T.last) + '</span><span>' + esc(T.best) + '</span></div>';
    return head + rows.map((x, i) => { const t = teamById(x.id), h = x.h; return '<div class="llg-rv"><span class="pos">' + (i + 1) + '</span><span class="l">' + crest(t, 'small') + ' ' + esc(t.name) + (i < 3 && x.n >= 3 ? ' <span class="late-tag">' + esc(T.rival) + '</span>' : '') + '</span><b>' + h.sw + '–' + h.sl + '</b><span>' + h.gw + '–' + h.gl + '</span><span' + (h.last ? ' title="' + esc(h.last.date) + '"' : '') + '>' + (h.last ? esc((h.last.win ? 'W ' : 'L ') + h.last.w + '–' + h.last.l) : '') + '</span><span' + (h.best ? ' title="' + esc(h.best.date) + '"' : '') + '>' + (h.best ? esc(h.best.w + '–' + h.best.l) : '') + '</span></div>'; }).join('');
  }

  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action="llg-tab"]'); if (!a) return;
    e.stopImmediatePropagation(); recTab = a.dataset.tab === 'total' ? 'total' : 'season'; if (typeof render === 'function') render();
  }, true);

  // both record views without the tab switch (for the manager's club history window)
  function recordsBoth(d) {
    const ps = Object.values(d.players), top = (k) => ps.slice().sort((x, y) => (y[k] || 0) - (x[k] || 0))[0];
    const s = [['goals', T.recGoals], ['assists', T.recAssists], ['mvps', T.recMvps], ['saves', T.recSaves], ['wins', T.recWins]].filter(([k]) => d.best[k]).map(([k, label]) => row(label, d.best[k].v, d.best[k].name + ' · ' + f(T.season, { n: d.best[k].season }))).join('') + (d.streak.best ? row(T.recStreak, d.streak.best, ' · ' + (d.streak.to || '')) : '');
    const t = [['goals', T.totGoals], ['assists', T.totAssists], ['mvps', T.totMvps], ['saves', T.totSaves], ['wins', T.totWins]].map(([k, label]) => { const e = top(k); return e && e[k] > 0 ? row(label, e[k], e.name) : ''; }).join('');
    return (s + t) ? '<div class="ux-cm" style="margin:4px 0">' + esc(T.tabSeason) + '</div>' + s + '<div class="ux-cm" style="margin:8px 0 4px">' + esc(T.tabTotal) + '</div>' + t : '<div class="ux-cm">' + esc(T.recEmpty) + '</div>';
  }
  const clubLegacy = (teamId) => { const l = late(), c = l && l.clubs && l.clubs[teamId]; return (c && c.legacy) || null; };
  window.__lateLegacyClub = (teamId) => { const d = clubLegacy(teamId); return d ? { hof: sec(T.hofTitle, hofHtml(d)), records: sec(T.recordsTitle, recordsBoth(d)), rivals: sec(T.rivalsTitle, rivalsHtml(d)) } : null; };
  window.__lateLegacyUI = {
    tab: T.tab || 'Legacy',
    html() {
      const l = late();
      if (!me()) return [[], []];
      if (isTierB() || !l || !l.unlocked) return [[sec(T.tab, how(T.lockedTitle, T.lockedLines))], []];
      const d = legacy();
      if (!d) return [[sec(T.tab, how(T.introTitle, T.intro))], [sec(T.rivalsTitle, '<div class="ux-cm">' + esc(T.rivalsEmpty) + '</div>')]];
      return [[sec(T.tab, how(T.introTitle, T.intro) + '<div class="ux-cm">' + esc(f(T.since, { d: d.since })) + '</div>'), sec(T.hofTitle, hofHtml(d)), sec(T.recordsTitle, recordsHtml(d))], [sec(T.rivalsTitle, rivalsHtml(d))]];
    },
  };
})();
