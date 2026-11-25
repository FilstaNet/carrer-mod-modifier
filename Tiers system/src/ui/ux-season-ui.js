// Season tab round (injected after ux-ui.js; wraps the game's own globals, no game file is edited):
//  - Season plate (RLCS Season X): current stage, ranking points, season prize pool, season history selector
//  - Prize pool under the event name (Season window event panel + calendar detail)
//  - Final standings grouped in placement tiers (Top 1, Top 2, Top 4, ...), # column left blank
//  - Calendar: Today button (small card + big calendar)
//  - Standings Around the World: click a region's right-hand panel -> regional overview (Season window layout, with season selector)
(function () {
  'use strict';
  if (window.__uxSeasonUI) return;
  if (typeof seasonHtml !== 'function' || typeof eventPanelHtml !== 'function' || typeof eventResultsHtml !== 'function' || typeof C !== 'function') return;
  window.__uxSeasonUI = true;

  const st = document.createElement('style');
  st.textContent =
    '.season-plate .ux-plate{grid-column:1;grid-row:2;align-self:center;padding-bottom:6%;min-width:0}.season-plate .sp-mark{grid-column:2;grid-row:1/span 2}' +
    '.ux-pool{display:block;font-size:clamp(40px,5vw,84px);font-weight:800;line-height:1.05;letter-spacing:.01em;text-transform:uppercase;white-space:nowrap;color:var(--red);background:linear-gradient(90deg,var(--red) 0%,var(--red) 40%,transparent 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}' +
    '.ux-line{font-size:var(--f-body);color:var(--text-dim);font-weight:600}.ux-line b{color:var(--text);font-weight:800}' +
    '.ux-pc select,.ux-reg-bar select{font:inherit;font-weight:700;margin-top:4px;padding:5px 9px;border-radius:6px;border:1px solid var(--rule);background:var(--panel-2);color:var(--text);cursor:pointer}' +
    '.ux-prize{font-size:var(--f-screen);font-weight:800;color:var(--green);margin:4px 0 10px}' +
    '.tbl tbody tr.ux-tier td{padding:10px 10px 4px;font-size:var(--f-micro);font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--red);text-align:left;background:transparent!important}' +
    '.cal-today,.cb-today{margin-left:8px;font:inherit;font-size:var(--f-small);font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid var(--red);background:transparent;color:var(--red);cursor:pointer}.cal-today:hover,.cb-today:hover{background:var(--red);color:#fff}' +
    // season history: cleaner header, toolbar, tabs and match cards
    '.history-page{max-width:1100px;gap:12px}.history-header{padding-bottom:12px;border-bottom:1px solid var(--rule)}.history-header h2{font-size:var(--f-screen);font-weight:800;text-transform:uppercase;letter-spacing:.02em}' +
    '.history-filter span{font-size:var(--f-micro);font-weight:800;letter-spacing:.14em;text-transform:uppercase}.history-filter select{background:var(--panel-2);color:var(--text);border:1px solid var(--rule);min-height:38px;border-radius:8px;cursor:pointer}' +
    '.history-page .tabstrip{gap:6px;margin-bottom:0;border-bottom:1px solid var(--rule)}.history-page .tabstrip-tab{min-width:0;padding:9px 22px;background:transparent;color:var(--text-dim);border-radius:8px 8px 0 0}' +
    '.history-page .tabstrip-tab.on{background:var(--card);color:var(--text);border-bottom-color:var(--red)}.history-filters{padding:4px 0 2px}' +
    '.history-match{border-left:3px solid var(--red);margin-bottom:8px}.history-match summary{list-style:none}.history-match summary::-webkit-details-marker{display:none}' +
    '.history-scoreline{margin-top:6px}.history-scoreline>span:first-child,.history-scoreline>span:last-child{font-weight:700}.history-scoreline b{background:var(--panel-2);border-radius:8px;padding:4px 16px;font-size:var(--f-lg)}' +
    '.history-expand{font-size:var(--f-micro);letter-spacing:.1em;text-transform:uppercase}.history-section-title{font-size:var(--f-lg);color:var(--red);text-transform:uppercase;letter-spacing:.08em}.history-count{font-weight:600}' +
    '.world-screen .tb-dark{cursor:pointer}.ux-reg-hint{font-size:var(--f-small);color:var(--text-dim);margin:2px 0 10px}.ux-reg-bar{display:flex;gap:12px;align-items:center;margin:4px 0 12px;flex-wrap:wrap}';
  document.head.appendChild(st);

  const fullMoney = (n) => (typeof fmtFullMoney === 'function' ? fmtFullMoney(n) : fmtMoney(n));
  const PR = window.__uxPrize || null;
  const userRid = () => (typeof userRegionId === 'function' ? userRegionId() : null);
  const seasonsOf = (c) => Array.from(new Set((c.seasonHistory || []).map((x) => x.season).filter((n) => n < c.season))).sort((a, b) => b - a);

  // pool = sum of the game's own prize table over the places the event pays (falls back to what standings paid)
  function poolOf(e, rid) {
    const arr = PR && PR[(C().economy === 'real' ? 1 : 0) + ':' + e.kind + ':' + (e.kind === 'open' ? (e.regionId || rid || userRid() || '') : '')];
    if (arr) {
      let n = (e.standings || []).length || (e.field || []).length;
      if (!n) { try { n = placeholderField(e).length; } catch (x) { n = 16; } }
      return arr.slice(0, n || 16).reduce((a, b) => a + b, 0);
    }
    return (e.standings || []).reduce((a, s) => a + (s.prize || 0), 0) || null;
  }
  const prizeLine = (e, rid) => { const p = e && poolOf(e, rid); return p ? '<div class="ux-prize">' + esc(tl('Prize pool')) + ': ' + fullMoney(p) + '</div>' : ''; };

  // ---- prize pool under the event name ----
  const origEvPanel = eventPanelHtml;
  eventPanelHtml = function (ev) { // eslint-disable-line no-global-assign
    const html = origEvPanel.apply(this, arguments);
    return ev ? html.replace(/(<div class="ev-name">[\s\S]*?<\/div>)/, (m) => m + prizeLine(ev)) : html;
  };
  if (typeof calendarBigHtml === 'function' && typeof calEventById === 'function') {
    const o = calendarBigHtml;
    calendarBigHtml = function () { // eslint-disable-line no-global-assign
      const html = o.apply(this, arguments);
      let ev = null; try { ev = calEventById(calEventNow()); } catch (x) { /* none */ }
      return ev && ev.kind ? html.replace(/(<div class="cb-when">[\s\S]*?<\/div>)/, (m) => m + prizeLine(ev)) : html;
    };
  }

  // ---- final standings grouped in placement tiers ----
  const TIERS = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64];
  function groupedRowsHtml(standings, nameOf) {
    const me = C().userTeamId; let last = 0, out = '';
    for (const s of standings.slice().sort((a, b) => a.placement - b.placement)) {
      const t = teamById(s.teamId);
      const tier = TIERS.find((x) => s.placement <= x) || s.placement;
      const label = tier !== last ? tier : ''; last = tier;
      out += '<tr class="' + (t ? 'clickrow ' : '') + (s.teamId === me ? 'me' : '') + '"' + (t ? ' data-action="club-detail" data-team="' + s.teamId + '"' : '') + '><td class="pos">' + label + '</td><td class="l"><div class="teamcell">' + (t ? crest(t, 'small') : '') +
        ' <span class="tname">' + esc(t ? t.name : nameOf ? nameOf(s.teamId) : '?') + '</span></div></td><td class="pts">' + (s.points || 0) + '</td><td>' + (s.prize ? fmtMoney(s.prize) : '&mdash;') + '</td></tr>';
    }
    return out;
  }
  const groupedTable = (standings, nameOf) => '<div class="ev-results"><div class="ev-sechead">' + esc(tl('Final standings')) + '</div><table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + esc(tl('Club')) +
    '</th><th>' + esc(tl('Points')) + '</th><th>' + esc(tl('Prize')) + '</th></tr></thead><tbody>' + groupedRowsHtml(standings, nameOf) + '</tbody></table></div>';
  const origResults = eventResultsHtml;
  eventResultsHtml = function (ev) { // eslint-disable-line no-global-assign
    return ev && ev.standings && ev.standings.length ? groupedTable(ev.standings) : origResults.apply(this, arguments);
  };

  // ---- season plate ----
  const origSeason = seasonHtml;
  seasonHtml = function () { // eslint-disable-line no-global-assign
    const html = origSeason.apply(this, arguments);
    try {
      const c = C(), evs = c.events || [], me = c.userTeamId;
      const live = typeof liveEvent === 'function' ? liveEvent() : null;
      const next = live || evs.find((e) => e.stage !== 'done');
      const OS = window.__uxOpenSwiss, stage = (OS && live && OS.swissShown(live) && OS.swissOf(live) ? tl('Swiss stage') : { groups: tl('Group stage'), playoffs: tl('Playoffs') }[live && live.stage]) || '';
      let pool = 0, earned = 0;
      for (const e of evs) { pool += poolOf(e) || 0; const s = (e.standings || []).find((x) => x.teamId === me); if (s) earned += s.prize || 0; }
      const rankTxt = esc(tl('Ranking points')) + ': <b>' + ((c.ranking || {})[me] || 0) + '</b> &middot; ' + esc(ordinal(tablePos(me))) + ' ' + esc(tl('ranked'));
      const nextTxt = esc(live ? tl('Current stage') : tl('Next event')) + ': <b>' + (next ? esc(next.name) : esc(tl('Season complete'))) + '</b>' + (live ? ' &middot; ' + esc(stage) : next ? ' &middot; ' + esc(fmtDateShort((OS ? OS.dated(next) : next).startDate)) : '');
      const info = '<div class="ux-plate">' + (pool ? '<div class="ux-pool">' + esc(tl('Prize pool')) + ' ' + fullMoney(pool) + '</div>' : '') +
        '<div class="ux-line">' + rankTxt + '</div><div class="ux-line">' + nextTxt + '</div></div>';
      return html.replace(/(<div class="sp-big">[\s\S]*?<\/div>)/, (m) => m + info);
    } catch (x) { return html; }
  };

  // ---- calendar Today button ----
  const todayBtn = (cls) => '<button type="button" class="' + cls + '" data-action="ux-cal-today">' + esc(tl('Today')) + '</button>';
  if (typeof calendarCardHtml === 'function') {
    const o = calendarCardHtml;
    calendarCardHtml = function () { // eslint-disable-line no-global-assign
      return o.apply(this, arguments).replace(/(data-action="cal-next">[^<]*<\/button>)/, '$1' + todayBtn('cal-today'));
    };
  }
  if (typeof calMonthHeadHtml === 'function') {
    const o = calMonthHeadHtml;
    calMonthHeadHtml = function () { // eslint-disable-line no-global-assign
      return o.apply(this, arguments).replace(/(data-d="1"[^>]*>[^<]*<\/button>)/, '$1' + todayBtn('cb-today'));
    };
  }

  // ---- regional overview (World screen -> click the region panel) ----
  let uxReg = null; const recCache = {};
  const hasWorld = typeof worldHtml === 'function' && typeof BIG_LISTS === 'object' && BIG_LISTS.season;
  if (hasWorld) {
    const o = worldHtml;
    worldHtml = function () { // eslint-disable-line no-global-assign
      return o.apply(this, arguments).replace('<div class="tb-sechead">', '<div class="ux-reg-hint">' + esc(tl('Click this panel for the full regional overview')) + '</div><div class="tb-sechead">');
    };
    const B = BIG_LISTS.season, base = { title: B.title, sub: B.sub, tabs: B.tabs, render: B.render };
    const regName = () => ((allRegions().find((r) => r.id === uxReg.rid) || {}).name || uxReg.rid);
    const seasonNow = () => (uxReg.season == null ? C().season : uxReg.season);
    const eventsNow = () => {
      if (seasonNow() === C().season) return regionEventsOf(uxReg.rid).filter((e) => !e.skipped);
      const r = recCache[seasonNow()]; if (!r) return null;
      return (uxReg.rid === userRid() ? r.events : (r.regionEvents || {})[uxReg.rid]) || [];
    };
    const nameOf = (id) => { const r = recCache[seasonNow()]; return ((r && r.teams || []).find((x) => x.id === id) || {}).name || '?'; };
    B.title = function () { return uxReg ? tl('{region} · Season {n}', { region: regName(), n: seasonNow() }) : base.title.apply(B, arguments); };
    B.sub = function () {
      if (!uxReg) return base.sub.apply(B, arguments);
      const evs = eventsNow() || [];
      let pool = 0; for (const e of evs) pool += poolOf(e, uxReg.rid) || 0;
      return statLineHtml([{ v: evs.filter((e) => e.stage === 'done').length + ' / ' + evs.length, k: tl('Events played') }].concat(pool ? [{ v: fullMoney(pool), k: tl('Season prize pool') }] : []));
    };
    B.tabs = function () { return uxReg ? [['fixtures', 'Events'], ['table', 'Standings']] : base.tabs.apply(B, arguments); };
    B.render = function () {
      if (!uxReg) return base.render.apply(B, arguments);
      const c = C(), cur = seasonNow() === c.season;
      const bar = '<div class="ux-reg-bar"><span class="ux-reg-hint" style="margin:0">' + esc(tl('Season history')) + '</span><select id="ux-reg-season">' +
        [c.season].concat(seasonsOf(c)).map((n) => '<option value="' + n + '"' + (n === seasonNow() ? ' selected' : '') + '>' + esc(tl('Season {n}', { n })) + (n === c.season ? ' &middot; ' + esc(tl('current')) : '') + '</option>').join('') + '</select></div>';
      const evs = eventsNow();
      if (!evs) return bar + '<p class="tbl-note">' + esc(tl('Loading season…')) + '</p>';
      if (!evs.length) return bar + '<div class="tbl-note">' + esc(cur ? tl('No events yet.') : tl('This season was not archived')) + '</div>';
      if (leagueView !== 'table') {
        const pick = evs.find((e) => e.id === uxReg.ev) || evs.find((e) => typeof evLive === 'function' && evLive(e)) || evs.find((e) => e.stage !== 'done') || evs[evs.length - 1];
        const tabs = '<div class="evtabs">' + evs.map((e) => '<button class="evtab ' + (typeof evStatus === 'function' ? evStatus(e) : '') + (e.id === pick.id ? ' active' : '') + '" data-action="ux-reg-ev" data-ev="' + e.id + '"><span class="evtab-n">' + esc(typeof evShort === 'function' ? evShort(e) : e.name) + '</span></button>').join('') + '</div>';
        const when = pick.startDate ? fmtDateShort(pick.startDate) + (pick.endDate && pick.endDate !== pick.startDate ? ' &ndash; ' + fmtDateShort(pick.endDate) : '') : '';
        const champ = pick.championId != null ? '<div class="ev-feeds">' + esc(tl('Champion: {club}', { club: (teamById(pick.championId) || { name: nameOf(pick.championId) }).name })) + '</div>' : '';
        const body = (pick.standings || []).length ? groupedTable(pick.standings, nameOf) : '<div class="tbl-note">' + esc(tl('Not played yet.')) + '</div>';
        return bar + tabs + '<div class="ev-panel"><div class="ev-head"><div class="ev-name">' + esc(pick.name) + '</div><div class="ev-when">' + when + '</div></div>' + prizeLine(pick, uxReg.rid) + champ + body + '</div>';
      }
      if (cur) return bar + regionTableHtml(uxReg.rid);
      const rows = {};
      for (const e of evs.filter((x) => x.stage === 'done')) for (const s of (e.standings || [])) {
        const r = rows[s.teamId] || (rows[s.teamId] = { id: s.teamId, pts: 0, ev: 0, best: 99, titles: 0 });
        r.pts += s.points || 0; r.ev++; r.best = Math.min(r.best, s.placement); if (e.championId === s.teamId) r.titles++;
      }
      const list = Object.values(rows).sort((a, b) => b.pts - a.pts || a.best - b.best);
      return bar + '<table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + esc(tl('Team')) + '</th><th>' + esc(tl('Events')) + '</th><th>' + esc(tl('Best')) + '</th><th>' + esc(tl('Titles')) + '</th><th>' + esc(tl('Points')) + '</th></tr></thead><tbody>' +
        list.map((r, i) => { const t = teamById(r.id); return '<tr class="' + (r.id === c.userTeamId ? 'me' : '') + '"><td class="pos">' + (i + 1) + '</td><td class="l"><div class="teamcell">' + (t ? crest(t, 'small') : '') + ' <span class="tname">' + esc(t ? t.name : nameOf(r.id)) + '</span></div></td><td>' + r.ev + '</td><td>' + ordinal(r.best) + '</td><td>' + (r.titles || '&mdash;') + '</td><td class="pts">' + r.pts + '</td></tr>'; }).join('') + '</tbody></table>';
    };
  }
  const fetchSeason = (n) => {
    if (recCache[n]) return;
    const done = (r) => { recCache[n] = r; if (uxReg && bigList === 'season') render(); };
    window.hub.getSeasonHistory(n).then((r) => done(r && r.ok && r.record ? r.record : { events: [], regionEvents: {}, teams: [] })).catch(() => done({ events: [], regionEvents: {}, teams: [] }));
  };

  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const a = t.closest('[data-action]');
    if (a && (a.dataset.action === 'see-all' || a.dataset.action === 'big-close')) uxReg = null;
    if (a && a.dataset.action === 'ux-cal-today') {
      e.stopImmediatePropagation(); e.preventDefault();
      if (a.classList.contains('cb-today')) calBigOffset = 0; else calOffset = 0;
      render(); return;
    }
    if (a && a.dataset.action === 'ux-reg-ev') { e.stopImmediatePropagation(); if (uxReg) { uxReg.ev = Number(a.dataset.ev); render(); } return; }
    if (hasWorld && bigList === 'world' && t.closest('.tb-dark') && !t.closest('.ow-close') && !(a && a.dataset.action === 'club-detail')) {
      e.stopImmediatePropagation(); e.preventDefault();
      uxReg = { rid: worldRegionNow(), season: null, ev: null };
      bigList = 'season'; officeOpen = false; windowJustOpened = true;
      if (leagueView !== 'table') leagueView = 'fixtures';
      render();
    }
  }, true);
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t || !t.matches) return;
    if (t.matches('.ux-season-sel')) {
      const n = Number(t.value);
      if (n && n !== C().season) { e.stopImmediatePropagation(); openSeasonHistory(); loadHistorySeason(n); }
    } else if (t.id === 'ux-reg-season' && uxReg) {
      e.stopImmediatePropagation();
      uxReg.season = Number(t.value); uxReg.ev = null;
      if (uxReg.season !== C().season) fetchSeason(uxReg.season);
      render();
    }
  }, true);
  // entry points for other screens (Manager -> club history): open an archived event, or a whole season, in the game's own views
  window.__uxGoEvent = async (season, evId) => { // the game's own Matches window -> Season history -> Brackets, event chosen (same as the Club History modal does)
    openSeasonHistory();
    if (historySeason !== season) await loadHistorySeason(season);
    historyView = 'brackets'; historyRegion = 'mine'; historyEvent = String(evId); historyPage = 0;
    if (typeof renderHistoryChange === 'function') renderHistoryChange(); else render();
  };
  window.__uxGoSeason = (season) => { uxReg = null; openSeasonHistory(); if (season !== C().season) loadHistorySeason(season); };
  try { render(); } catch (e) { /* no career open yet */ }
})();
