// Renderer quality-of-life round (injected last, wraps the game's own globals; no game file is edited):
//  - alternating row shading on tables / lists, higher-contrast training-growth bars, cleaner player-search form (CSS)
//  - Advance card: transfer-window countdown; window banner: "(in X days)" while closed
//  - Standings card + window: "History" tab -> game's Season history screen
//  - Team tile (Squad, right panel): click opens a Club History modal (built from the archived seasons + Tier B cup history)
//  - My offers: status colours (green done, red rejected/expired/failed, amber pending/negotiating)
(function () {
  'use strict';
  if (window.__uxUI) return;
  if (typeof advanceCardHtml !== 'function' || typeof windowBannerHtml !== 'function' || typeof sideTileHtml !== 'function' ||
      typeof transfersHtml !== 'function' || typeof standingsCardHtml !== 'function' || typeof standWindowHtml !== 'function' || typeof C !== 'function') return;
  window.__uxUI = true;

  const st = document.createElement('style');
  st.textContent =
    // training growth bars: deep blue vs bright green (were two pale tints that blended)
    '.stand-event.btier-cup>*{flex-shrink:0}' +
    ':root{--xp-now:#1d5fe0;--xp-gain:#5be37d}' +
    // player search: the control is the only place a filter is shown (the repeated value strip is gone)
    '.sf-val{display:none}.sf-card{min-height:0;padding:16px 16px 18px}.sf-mid{padding:14px 0 0}' +
    // advance card countdown
    '.adv-win{padding:6px 14px;font-size:var(--f-small);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--rule)}' +
    '.adv-win.open{color:var(--green)}.adv-win.closed{color:#e6a817}' +
    // offers
    '.offer-sub.os-ok{color:var(--green);font-weight:800}.offer-sub.os-bad{color:var(--red);font-weight:800}.offer-sub.os-wait{color:#e6a817;font-weight:800}' +
    // standings history tab + club tile + club history modal
    '.ptab.ux-hist,.tb-item.ux-hist{margin-left:auto}.club-tile[data-action="ux-club-hist"]{cursor:pointer}' +
    '.ux-hist-modal{max-width:860px;width:92vw}.ux-hist-chips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0}' +
    '.ux-hist-chips .chip{text-align:center}.ux-hist-scroll{max-height:46vh;overflow:auto}';
  document.head.appendChild(st);

  const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const inDays = (n) => (n <= 0 ? tl('today') : n === 1 ? tl('tomorrow') : tl('in {n} days', { n }));
  const win = () => { try { return !isPlayerMode() && S && S.econ && S.econ.window; } catch (e) { return null; } };

  // ---- Advance card countdown ----
  const origAdv = advanceCardHtml;
  advanceCardHtml = function () { // eslint-disable-line no-global-assign
    const html = origAdv.apply(this, arguments);
    const w = win(), cur = C().currentDate;
    if (!w) return html;
    let cls = 'closed', txt;
    if (w.open) { cls = 'open'; txt = w.closesOn ? tl('Transfer window closes {when}', { when: inDays(daysTo(cur, w.closesOn)) }) : tl('Transfer window open'); }
    else txt = w.nextOpens ? tl('Transfer window opens {when}', { when: inDays(daysTo(cur, w.nextOpens)) }) : tl('Transfer window reopens after the season');
    return html.replace('<div class="card-b">', '<div class="adv-win ' + cls + '">' + esc(txt) + '</div><div class="card-b">');
  };

  // ---- window banner: countdown while closed ----
  const origBanner = windowBannerHtml;
  windowBannerHtml = function () { // eslint-disable-line no-global-assign
    const html = origBanner.apply(this, arguments);
    const w = win();
    if (!w || w.open || !w.nextOpens) return html;
    return html.replace(/<\/div>$/, ' (' + esc(inDays(daysTo(C().currentDate, w.nextOpens))) + ')</div>');
  };

  // ---- Standings: History tab (card + full window) ----
  const histLabel = () => esc(tl('History'));
  const origCard = standingsCardHtml;
  standingsCardHtml = function () { // eslint-disable-line no-global-assign
    const h = origCard.apply(this, arguments);
    if (h.indexOf('data-action="btier-view"') >= 0) return h; // Tier B home card: no History tab (it stays in the full window)
    return h.replace(/(<div class="ptabs">[\s\S]*?)(<\/div>)/,
      '$1<button type="button" class="ptab ux-hist" data-action="ux-history">' + histLabel() + '</button>$2');
  };
  const origWin = standWindowHtml;
  standWindowHtml = function () { // eslint-disable-line no-global-assign
    return origWin.apply(this, arguments).replace(/(<div class="tb-pick">[\s\S]*?)(<\/div>)/,
      '$1<button class="tb-item ux-hist" data-action="ux-history"><span class="tb-name">' + histLabel() + '</span></button>$2');
  };

  // ---- Team tile: click opens Club History ----
  const origTile = sideTileHtml;
  sideTileHtml = function () { // eslint-disable-line no-global-assign
    return origTile.apply(this, arguments).replace('<div class="tile club-tile', '<div data-action="ux-club-hist" role="button" tabindex="0" title="' + esc(tl('Club history')) + '" class="tile club-tile');
  };

  // ---- My offers: status colours ----
  const origTransfers = transfersHtml;
  transfersHtml = function () { // eslint-disable-line no-global-assign
    let html = origTransfers.apply(this, arguments);
    const cls = {
      'awaiting response': 'wait', 'FEE AGREED - negotiate contract': 'wait', 'player considering terms': 'wait',
      rejected: 'bad', expired: 'bad', 'talks collapsed': 'bad', completed: 'ok'
    };
    for (const k of Object.keys(cls)) {
      const t = tl(k), tag = '<div class="offer-sub">' + t + '</div>';
      html = html.split(tag).join('<div class="offer-sub os-' + cls[k] + '">' + t + '</div>');
    }
    return html;
  };

  // ---- Club History modal ----
  const standingOf = (ev, id) => (ev.standings || []).find((s) => s.teamId === id);
  async function openClubHistory() {
    const c = C(), team = teamById(c.userTeamId);
    if (!team) return;
    const shell = (body) => '<div class="modal ux-hist-modal"><div class="modal-h">' + esc(tl('Club history')) + '</div><div class="modal-b ux-hist">' + body +
      '<div class="btnrow"><button class="btn ghost" data-action="close-modal">' + esc(tl('Close')) + '</button></div></div></div>';
    showModal(shell('<div class="mx-empty" style="padding:30px;text-align:center">' + esc(tl('Loading…')) + '</div>'));
    const seasons = Array.from({ length: c.season }, (_, i) => i + 1);
    const recs = await Promise.all(seasons.map((n) => window.hub.getSeasonHistory(n).then((r) => (r && r.ok ? r.record : null)).catch(() => null)));
    const rows = [];
    seasons.forEach((n, i) => {
      const evs = ((recs[i] && recs[i].events) || []).filter((e) => e.stage === 'done').map((e) => ({ standing: standingOf(e, team.id), champ: e.championId === team.id }));
      for (const h of ((c.tierB && c.tierB.history) || [])) if (h.season === n) evs.push({ standing: standingOf(h, team.id), champ: h.championId === team.id });
      const mine = evs.filter((e) => e.standing);
      if (!mine.length) return;
      const places = mine.map((e) => e.standing.placement);
      rows.push({ season: n, league: (recs[i] && recs[i].leagueName) || '', events: mine.length, best: Math.min.apply(null, places), titles: mine.filter((e) => e.champ).length,
        podiums: places.filter((p) => p <= 3).length, prize: mine.reduce((a, e) => a + (e.standing.prize || 0), 0) });
    });
    const tot = rows.reduce((a, r) => ({ events: a.events + r.events, titles: a.titles + r.titles, prize: a.prize + r.prize, best: Math.min(a.best, r.best) }), { events: 0, titles: 0, prize: 0, best: 99 });
    const chip = (v, k) => '<div class="chip"><div class="v">' + v + '</div><div class="k">' + esc(tl(k)) + '</div></div>';
    const table = rows.length ? '<div class="ux-hist-scroll"><table class="tbl"><thead><tr><th class="l">' + esc(tl('Season')) + '</th><th>' + esc(tl('Events')) + '</th><th>' + esc(tl('Best')) + '</th><th>' +
      esc(tl('Podiums')) + '</th><th>' + esc(tl('Titles')) + '</th><th>' + esc(tl('Prize money')) + '</th></tr></thead><tbody>' +
      rows.slice().reverse().map((r) => '<tr><td class="l">' + esc(tl('Season {n}', { n: r.season })) + (r.league ? ' <span style="color:var(--text-dim)">&middot; ' + esc(r.league) + '</span>' : '') + '</td><td>' + r.events + '</td><td>' + ordinal(r.best) +
        '</td><td>' + (r.podiums || '&mdash;') + '</td><td>' + (r.titles || '&mdash;') + '</td><td class="money">' + (r.prize ? fmtMoney(r.prize) : '&mdash;') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="mx-empty" style="padding:24px;text-align:center;color:var(--text-dim)">' + esc(tl('No completed events yet.')) + '</div>';
    const hon = (c.honours || []).slice().reverse().map((h) => '<div class="honour-row">&#127942; ' + esc(h) + '</div>').join('');
    const html = shell('<div class="club-head" style="display:flex;align-items:center;gap:16px">' + crest(team, 'big') + '<div><div class="club-name">' + esc(team.name) + '</div><div class="club-league">' + esc(c.leagueName || '') + '</div></div></div>' +
      '<div class="ux-hist-chips">' + chip(rows.length, 'Seasons') + chip(tot.events, 'Events') + chip(tot.titles, 'Titles') + chip(rows.length ? ordinal(tot.best) : '&mdash;', 'Best finish') + chip(fmtMoney(tot.prize), 'Prize money') + '</div>' +
      table + (hon ? '<div class="stats-head" style="margin-top:14px">' + esc(tl('Honours')) + '</div>' + hon : ''));
    if (document.querySelector('#modal-root .ux-hist')) showModal(html);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-action="ux-history"],[data-action="ux-club-hist"]');
    if (!el || (e.target.closest('.side-arrow'))) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (el.dataset.action === 'ux-history') openSeasonHistory(); else openClubHistory();
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-action="ux-club-hist"]')) { e.preventDefault(); openClubHistory(); }
  }, true);
  // ---- Season history: "Winners" tab (every tournament winner of every season: A-Tier, B-Tier, custom/hosted events) ----
  if (typeof seasonHistoryHtml === 'function' && typeof tabStripHtml === 'function' && typeof renderHistoryChange === 'function') {
    // Season history > "Full History": every match of every season (A-Tier, B-Tier cups, hosted/custom events), or only the tournament winners.
    const wf = { a: true, b: true, c: true, w: false, m: false, s: true, g: true, p: true }; // kinds listed; w = winners only; m = my club only
    const baseRg = (id) => (id ? String(id).replace(/_b$/, '') : id); // Tier B regions are not a separate choice: the A-TIER / B-TIER ticks cover that
    let winRows = null, matchRows = null, evs = {}, byId = new Map(), loadingW = false, seasonSel = 'all', regionSel = 'all', page = 0;
    const PAGE = 40;
    st.textContent += '.ux-wf{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ux-wchk{display:inline-flex;gap:8px;align-items:center;padding:7px 14px;border:1px solid var(--rule);border-radius:999px;font-weight:800;font-size:var(--f-small);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;user-select:none;transition:background .15s,border-color .15s}' +
      '.ux-wchk:has(input:checked){background:color-mix(in srgb,var(--accent,var(--red)) 16%,transparent);border-color:var(--accent,var(--red))}.ux-wf .btn{margin-left:auto}' +
      '.ux-wtier{display:inline-block;padding:2px 9px;border-radius:999px;font-size:var(--f-micro);font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:color-mix(in srgb,var(--text) 10%,transparent)}.ux-wtier.a{color:var(--red)}.ux-wtier.b{color:#e6a817}.ux-wtier.c{color:var(--green)}' +
      '.ux-winners .history-header select,.ux-winners .history-header label{display:none}.ux-wf .ux-fh-sel{font:inherit;font-weight:700;padding:7px 10px;background:color-mix(in srgb,var(--text) 8%,transparent);color:inherit;border:1px solid var(--rule);border-radius:999px}' +
      '.ux-wf .ux-fh-sel{color-scheme:dark;min-width:170px}.ux-fh-sel option{background:#1c2430;color:#e8ecf2}' +
      '.ux-winners .history-page,.ux-winners .history-body{max-width:none}.ux-winners .history-table-wrap{overflow-x:auto}.ux-winners .tbl th,.ux-winners .tbl td{white-space:nowrap;padding-left:18px;padding-right:18px}.ux-winners .tbl th:first-child,.ux-winners .tbl td:first-child{padding-left:26px}' +
      '.ux-winners .tbl td:nth-child(2){min-width:240px}.ux-winners .tbl td:nth-child(3){min-width:130px}.ux-winners .tbl td:nth-child(4),.ux-winners .tbl td:nth-child(6){min-width:190px}.ux-winners .history-count{margin:14px 0 8px 26px}' +
      '.ux-fh-games{display:grid;gap:0;margin:14px auto 6px;max-width:520px;border-top:1px solid var(--rule)}.ux-fh-games>div{display:flex;justify-content:space-between;gap:24px;padding:11px 18px;border-bottom:1px solid var(--rule);font-weight:700}.ux-fh-games small{display:block;padding:10px 18px 0;color:var(--text-dim);font-weight:600}.ux-fh-mvp{text-align:center;margin:16px 0 6px}.ux-fh-modal .btnrow{margin-top:18px}' +
      '.ux-fh-modal.wide{max-width:1000px}.ux-ev-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:8px}.ux-ev-champ{font-weight:800;color:var(--gold,#e6a817)}.ux-ev-chips{margin:10px 0 14px}' +
      '.ux-ev-stand{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2px 18px}.ux-ev-stand>div{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 10px;border-radius:6px}.ux-ev-stand>div.me{background:color-mix(in srgb,var(--accent,var(--red)) 14%,transparent)}.ux-ev-stand .pl{text-align:center;font-weight:800}.ux-ev-stand .nm{display:flex;gap:10px;align-items:center;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ux-ev-stand .pz{color:var(--text-dim);font-weight:700}' +
      '.ux-ev-boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:6px}.ux-ev-board>div{display:flex;justify-content:space-between;padding:6px 10px;border-top:1px solid var(--rule)}' +
      '.ux-ev-stage{margin:16px 0 4px;padding:0 14px;font-size:var(--f-label);font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--red)}.ux-ev-m{display:grid;grid-template-columns:110px minmax(0,1fr) 110px minmax(0,1fr);gap:16px;align-items:center;padding:11px 14px;border-top:1px solid var(--rule)}.ux-ev-m .d{color:var(--text-dim);font-weight:700;white-space:nowrap}.ux-ev-m .h{text-align:right}.ux-ev-m .a{text-align:left}.ux-ev-m .h,.ux-ev-m .a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ux-ev-m .w{font-weight:800}.ux-ev-m .s{text-align:center;font-weight:800;white-space:nowrap}.ux-ev-m.me{background:color-mix(in srgb,var(--accent,var(--red)) 10%,transparent)}.ux-ev-m:hover{background:color-mix(in srgb,var(--accent,var(--red)) 8%,transparent)}' +
      '.ux-fh-row{cursor:pointer}.ux-fh-row:hover td{background:color-mix(in srgb,var(--accent,var(--red)) 8%,transparent)}.ux-fh-sc{text-align:center;font-weight:800;white-space:nowrap}' +
      '.ux-fh-link{background:none;border:0;padding:0;font:inherit;font-weight:700;color:var(--accent,var(--red));cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-align:left}' +
      '.ux-fh-score{display:grid;grid-template-columns:minmax(0,1fr) 130px minmax(0,1fr);align-items:center;margin:14px 0 4px;font-size:var(--f-screen);font-weight:800;line-height:1.15}.ux-fh-score .h{text-align:right;padding-right:6px}.ux-fh-score .a{text-align:left;padding-left:6px}.ux-fh-score .s{text-align:center;white-space:nowrap}.ux-fh-meta{text-align:center;color:var(--text-dim);font-weight:600;font-size:var(--f-small);margin-bottom:10px}' +
      '.ux-winners .tbl td:nth-child(4),.ux-winners .tbl th:nth-child(4){text-align:right!important}.ux-winners .tbl td:nth-child(5),.ux-winners .tbl th:nth-child(5){text-align:center!important;min-width:90px}.ux-winners .tbl td:nth-child(6),.ux-winners .tbl th:nth-child(6){text-align:left!important}' +
      '.ux-fh-big{display:flex;justify-content:center;align-items:center;gap:22px;font-size:var(--f-screen);font-weight:800;margin:10px 0 4px}.ux-fh-big small{display:block;font-size:var(--f-small);font-weight:600;color:var(--text-dim);text-align:center}.ux-fh-modal{max-width:860px;width:94vw}.ux-fh-body{max-height:64vh;overflow:auto;padding-right:6px}';
    const KIND = { a: 'A-Tier', b: 'B-Tier', c: 'Custom' };
    const STAGE = { swiss: 'Swiss stage', group: 'Group stage', playoff: 'Playoffs', final: 'Final', semi: 'Semi-final', quarter: 'Quarter-final', r16: 'Round of 16' };
    async function loadWinners() {
      if (loadingW) return; loadingW = true;
      try {
        const c = C(), out = [], ms = [], seen = new Set(), me = c.userTeamId; evs = {}; byId = new Map();
        const nameIn = (rec, id) => { const t = ((rec && rec.teams) || []).find((x) => x.id === id) || teamById(id); return t ? t.name : tl('Unknown club'); };
        const seasons = Array.from({ length: c.season }, (_, i) => i + 1);
        const recs = await Promise.all(seasons.map((n) => window.hub.getSeasonHistory(n).then((r) => (r && r.ok ? r.record : null)).catch(() => null)));
        const tb = c.tierB || {}, u = c.uxClub || {}, regName = {}; for (const r of tb.regions || []) regName[r.id] = r.name;
        const cupInfo = (id) => (tb.history || []).find((h) => h.cupId === id) || (tb.cups || []).find((x) => x.id === id);
        const seasonFor = (date) => { let best = c.season; recs.forEach((q, i) => { if (q && (q.events || []).length && (q.events || []).some((e) => e.startDate && e.startDate <= date)) best = i + 1; }); return best; };
        const addEv = (key, o) => { if (!evs[key]) evs[key] = o; return evs[key]; };
        seasons.forEach((n, i) => {
          const rec = recs[i]; if (!rec) return;
          const evIds = new Set();
          const regOf = (rid) => (rid === 'mine' ? rec.leagueName || tl('Your circuit') : (rec.regions || []).find((r) => r.id === rid)?.name || rid);
          const addA = (e, rid) => {
            evIds.add(e.id); const ek = 'a:' + n + ':' + e.id;
            addEv(ek, { key: ek, k: 'a', season: n, rg: rid === 'mine' ? c.userRegion : rid, name: e.name, comp: regOf(rid), start: e.startDate, end: e.endDate, champ: e.championId, standings: e.standings || [], rec, bracket: { season: n, region: rid, eid: e.id } });
            if (e.stage === 'done' && e.championId != null && !seen.has(ek)) { seen.add(ek); out.push({ k: 'a', season: n, date: e.endDate || '', name: e.name, comp: regOf(rid), winner: nameIn(rec, e.championId), id: e.championId, ek }); }
          };
          for (const e of rec.events || []) addA(e, 'mine');
          for (const r of rec.regions || []) for (const e of (rec.regionEvents || {})[r.id] || []) if (!evIds.has(e.id)) {
            addA(e, r.id);
            for (const s of e.slots || []) if (s.winner != null && s.teamA != null && s.teamB != null) {
              const aw = s.winner === s.teamA;
              ms.push({ id: 's' + n + ':' + s.id, season: n, date: e.startDate || '', k: 'a', ek: 'a:' + n + ':' + e.id, stage: s.stage, bo: s.bestOf, h: s.teamA, a: s.teamB, hw: aw ? s.winsW : s.winsL, aw: aw ? s.winsL : s.winsW, rec, mine: s.teamA === me || s.teamB === me });
            }
          }
          for (const f of rec.fixtures || []) {
            if (!f.played || f.homeId == null || f.awayId == null) continue;
            let k = 'a', ek = 'a:' + n + ':' + f.eventId;
            if (f.cupId != null) { k = 'b'; ek = 'b:' + f.cupId; const ci = cupInfo(f.cupId); addEv(ek, { key: ek, k: 'b', season: n, rg: ci && ci.region, name: ci ? ci.name : tl('B-Tier Cup'), comp: ci ? regName[ci.region] || ci.region : '', start: ci && ci.startDate, end: ci && ci.endDate, champ: ci ? ci.championId : null, standings: (ci && ci.standings) || [], rec }); }
            else if (f.promoId != null) { k = 'b'; ek = 'b:p' + f.promoId; addEv(ek, { key: ek, k: 'b', season: n, name: tl('Promotion group'), comp: '', standings: [], rec }); }
            else if (f.invId != null) { k = 'c'; ek = 'c:' + f.invId; const iv = (u.inv || []).find((x) => x.id === f.invId); addEv(ek, { key: ek, k: 'c', season: n, name: iv ? iv.name : tl('Invitational'), comp: tl('Hosted Invitational'), start: iv && iv.start, champ: iv ? iv.championId : null, standings: (iv && iv.standings) || [], rec }); }
            else if (f.xevId != null && ((c.uxMajors || {}).events || []).some((x) => x.id === f.xevId && x.swiss && x.openId != null)) { ek = 'a:' + n + ':' + ((c.uxMajors || {}).events || []).find((x) => x.id === f.xevId).openId; if (!evs[ek]) continue; } // the Swiss stage is part of its Open
            else if (f.xevId != null) { ek = 'a:x' + f.xevId; const xe = ((c.uxMajors || {}).events || []).find((x) => x.id === f.xevId); addEv(ek, { key: ek, k: 'a', season: n, name: xe ? xe.name : tl('Tournament'), comp: '', start: xe && xe.startDate, end: xe && xe.endDate, champ: xe ? xe.championId : null, standings: [], rec }); }
            else if (!evs[ek]) continue;
            ms.push({ id: 'f' + f.id, season: n, date: f.date || '', k, ek, stage: f.slotId === 'sw' ? 'swiss' : f.stage, bo: f.bestOf, h: f.homeId, a: f.awayId, hw: f.homeWins, aw: f.awayWins, gm: f.games || [], hg: f.homeGoals, ag: f.awayGoals, sc: f.scorerIds || [], as: f.assistIds || [], mvp: f.mvpId, compact: !!f.compact, rec, mine: f.homeId === me || f.awayId === me });
          }
        });
        for (const h of tb.history || []) {
          const t = teamById(h.championId), ek = 'b:' + h.cupId;
          addEv(ek, { key: ek, k: 'b', season: h.season, rg: h.region, name: h.name, comp: regName[h.region] || h.region, end: h.endDate, champ: h.championId, standings: h.standings || [], rec: recs[h.season - 1] });
          out.push({ k: 'b', season: h.season, date: h.endDate || '', name: h.name, comp: regName[h.region] || h.region, winner: t ? t.name : tl('Unknown club'), id: h.championId, ek });
        }
        for (const x of u.inv || []) if (x.stage === 'done' && x.championId != null) {
          const t = teamById(x.championId), ek = 'c:' + x.id, sn = seasonFor(x.start);
          addEv(ek, { key: ek, k: 'c', season: sn, name: x.name, comp: tl('Hosted Invitational'), start: x.start, champ: x.championId, standings: x.standings || [], rec: recs[sn - 1] });
          out.push({ k: 'c', season: sn, date: x.start, name: x.name, comp: tl('Hosted Invitational'), winner: t ? t.name : '?', id: x.championId, ek });
        }
        for (const x of u.shows || []) if (x.done && x.result) {
          const sn = seasonFor(x.start), ek = 's:' + x.id, R = x.result.rounds || [];
          addEv(ek, { key: ek, k: 'c', season: sn, name: x.name, comp: tl('Hosted showdown'), start: x.start, champName: x.result.champion, standings: (x.result.order || []).map((o, i) => ({ placement: i + 1, name: o.name, prize: o.prize })), rec: recs[sn - 1] });
          out.push({ k: 'c', season: sn, date: x.start, name: x.name, comp: tl('Hosted showdown'), winner: x.result.champion, id: null, ek });
          R.forEach((rd, ri) => rd.forEach((q, qi) => ms.push({ id: 'x' + x.id + ':' + ri + ':' + qi, season: sn, date: x.start, k: 'c', ek, stage: ri === R.length - 1 ? 'final' : ri === R.length - 2 ? 'semi' : ri === R.length - 3 ? 'quarter' : 'r16', bo: q.bo, hn: q.a, an: q.b, hw: q.sa, aw: q.sb, duels: q.duels, rec: recs[sn - 1], mine: !!q.mine })));
        }
        out.sort((a, b) => b.season - a.season || String(b.date).localeCompare(String(a.date)));
        ms.sort((a, b) => b.season - a.season || String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
        for (const m of ms) byId.set(m.id, m);
        winRows = out; matchRows = ms;
      } catch (e) { winRows = []; matchRows = []; }
      loadingW = false;
      if (bigList === 'history' && historyView === 'winners') renderHistoryChange();
    }
    const hn = (m) => (m.hn != null ? m.hn : nm(m, m.h)), an = (m) => (m.an != null ? m.an : nm(m, m.a));
    const nm = (m, id) => { const t = ((m.rec && m.rec.teams) || []).find((x) => x.id === id) || teamById(id); return t ? t.name : tl('Unknown club'); };
    const stageName = (s) => (s ? tl(STAGE[s] || String(s).charAt(0).toUpperCase() + String(s).slice(1)) : '');
    const evLink = (ek, name) => (ek ? '<button type="button" class="ux-fh-link" data-ux-ev="' + esc(ek) + '">' + esc(name) + '</button>' : esc(name));
    const winnersTable = (list) => '<div class="history-count">' + list.length + ' ' + esc(tl('tournaments')) + '</div><div class="history-table-wrap"><table class="tbl roomy"><thead><tr><th class="l">' + esc(tl('Season')) + '</th><th class="l">' + esc(tl('Tournament')) + '</th><th class="l">' + esc(tl('Competition')) + '</th><th class="l">' + esc(tl('Type')) + '</th><th class="l">' + esc(tl('Winner')) + '</th></tr></thead><tbody>' +
      list.map((r) => '<tr' + (r.id === C().userTeamId ? ' class="me"' : '') + '><td class="l">' + esc(tl('Season {n}', { n: r.season })) + '</td><td class="l">' + evLink(r.ek, r.name) + '</td><td class="l">' + esc(r.comp || '') + '</td><td class="l"><span class="ux-wtier ' + r.k + '">' + esc(tl(KIND[r.k])) + '</span></td><td class="l"><b>' + esc(r.winner) + '</b></td></tr>').join('') + '</tbody></table></div>';
    const matchesTable = (list) => {
      const pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.max(0, Math.min(page, pages - 1));
      const me = C().userTeamId;
      return '<div class="history-count">' + list.length + ' ' + esc(tl('matches')) + ' · ' + esc(tl('click a match for details')) + '</div><div class="history-table-wrap"><table class="tbl roomy"><thead><tr><th class="l">' + esc(tl('Date')) + '</th><th class="l">' + esc(tl('Tournament')) + '</th><th class="l">' + esc(tl('Stage')) + '</th><th class="l">' + esc(tl('Home')) + '</th><th>' + esc(tl('Score')) + '</th><th class="l">' + esc(tl('Away')) + '</th></tr></thead><tbody>' +
        list.slice(page * PAGE, (page + 1) * PAGE).map((m) => '<tr class="ux-fh-row' + (m.h === me || m.a === me ? ' me' : '') + '" tabindex="0" data-ux-match="' + esc(m.id) + '"><td class="l">' + esc(m.date ? fmtDateShort(m.date) : tl('Season {n}', { n: m.season })) + '</td><td class="l">' + evLink(m.ek, (evs[m.ek] || {}).name || '') + '</td><td class="l">' + esc(stageName(m.stage)) + '</td><td class="l">' + (m.hw > m.aw ? '<b>' + esc(hn(m)) + '</b>' : esc(hn(m))) + '</td><td class="ux-fh-sc">' + (m.hw ?? '–') + ' &ndash; ' + (m.aw ?? '–') + '</td><td class="l">' + (m.aw > m.hw ? '<b>' + esc(an(m)) + '</b>' : esc(an(m))) + '</td></tr>').join('') + '</tbody></table></div>' +
        (pages > 1 ? '<div class="history-pagination"><button class="btn" data-ux-page="' + (page - 1) + '"' + (page === 0 ? ' disabled' : '') + '>&larr; ' + esc(tl('Previous')) + '</button><span>' + esc(tl('Page {page} of {pages}', { page: page + 1, pages })) + '</span><button class="btn" data-ux-page="' + (page + 1) + '"' + (page + 1 >= pages ? ' disabled' : '') + '>' + esc(tl('Next')) + ' &rarr;</button></div>' : '');
    };
    const winnersBody = () => {
      if (!winRows || !matchRows) return '<p class="history-empty" role="status">' + esc(tl('Loading season…')) + '</p>';
      const kinds = (r) => wf[r.k] && (seasonSel === 'all' || String(r.season) === seasonSel) && (regionSel === 'all' || !(evs[r.ek] || {}).rg || baseRg((evs[r.ek] || {}).rg) === regionSel);
      if (wf.w) {
        const list = winRows.filter((r) => kinds(r) && (!wf.m || r.id === C().userTeamId));
        return list.length ? winnersTable(list) : '<p class="history-empty">' + esc(tl(winRows.length ? 'Nothing selected: tick at least one kind of tournament.' : 'No finished tournaments yet.')) + '</p>';
      }
      const stageOn = (r) => wf[r.stage === 'swiss' ? 's' : r.stage === 'group' ? 'g' : 'p']; // Swiss / group stage / everything after (playoffs)
      const list = matchRows.filter((r) => kinds(r) && stageOn(r) && (!wf.m || r.mine));
      return list.length ? matchesTable(list) : '<p class="history-empty">' + esc(tl(matchRows.length ? 'No matches for this selection.' : 'No finished matches yet.')) + '</p>';
    };
    const shell = (title, body, cls) => '<div class="modal ux-fh-modal' + (cls ? ' ' + cls : '') + '"><div class="modal-h">' + title + '</div><div class="modal-b"><div class="ux-fh-body">' + body + '</div><div class="btnrow"><button class="btn ghost" data-action="close-modal">' + esc(tl('Close')) + '</button></div></div></div>';
    function matchModal(id) {
      const m = byId.get(id); if (!m) return; const ev = evs[m.ek] || {};
      const pl = ((m.rec && m.rec.players) || []).find((p) => p.id === m.mvp);
      const games = (m.duels || []).map((d) => '<div><span>' + esc(d.a) + ' v ' + esc(d.b) + '</span><b>' + d.sa + ' &ndash; ' + d.sb + '</b></div>').join('') || (m.gm || []).map((g, i) => '<div><span>' + esc(tl(g.overtime ? 'Game {n} · OT' : 'Game {n}', { n: i + 1 })) + '</span><b>' + (g.homeGoals ?? '–') + ' &ndash; ' + (g.awayGoals ?? '–') + '</b></div>').join('');
      showModal(shell(esc(hn(m)) + ' v ' + esc(an(m)),
        '<div class="ux-fh-score"><div class="h">' + esc(hn(m)) + '</div><div class="s">' + (m.hw ?? '–') + ' &ndash; ' + (m.aw ?? '–') + '</div><div class="a">' + esc(an(m)) + '</div></div>' +
        '<div class="ux-fh-meta">' + esc([m.date ? fmtDateShort(m.date) : tl('Season {n}', { n: m.season }), stageName(m.stage), m.bo ? tl('Best of {n}', { n: m.bo }) : ''].filter(Boolean).join(' · ')) + '</div>' +
        '<p style="text-align:center">' + esc(tl('Tournament')) + ': ' + evLink(m.ek, ev.name || '') + (ev.comp ? ' <span class="mx-dim">· ' + esc(ev.comp) + '</span>' : '') + '</p>' +
        (games ? '<div class="ux-fh-games"><small>' + esc(m.duels ? tl('Duels') : tl('Goals · {home} / {away}', { home: hn(m), away: an(m) })) + '</small>' + games + '</div>' : '<p class="mx-dim" style="text-align:center">' + esc(tl(m.compact ? 'Game details are not kept for matches your club was not part of.' : 'No game-by-game scores were recorded for this match.')) + '</p>') +
        (pl ? '<p class="ux-fh-mvp">' + esc(tl('MVP')) + ': <b>' + esc(pl.name) + '</b></p>' : '')));
    }
    function eventModal(ek) {
      const ev = evs[ek]; if (!ev) return;
      const ms = (matchRows || []).filter((m) => m.ek === ek).slice().reverse(), me = C().userTeamId;
      const top = (ev.standings || []).slice().sort((a, b) => a.placement - b.placement);
      const champ = ev.champName || (ev.champ != null ? nm({ rec: ev.rec }, ev.champ) : '');
      const teamsN = new Set(ms.flatMap((m) => [m.h != null ? 't' + m.h : m.hn, m.a != null ? 't' + m.a : m.an])).size;
      const goals = ms.reduce((a, m) => a + (m.hg || 0) + (m.ag || 0), 0), pool = top.reduce((a, s) => a + (s.prize || 0), 0);
      const chip = (v, k) => '<div class="chip"><div class="v">' + esc(String(v)) + '</div><div class="k">' + esc(tl(k)) + '</div></div>';
      const logo = (id) => { try { const t = id != null ? teamById(id) : null; return t && typeof crest === 'function' ? crest(t, 'small') : ''; } catch (e) { return ''; } };
      const medal = (n) => (n === 1 ? '&#129351;' : n === 2 ? '&#129352;' : n === 3 ? '&#129353;' : n);
      // top performers from the matches whose goal data survived the archive
      const tally = (pick) => { const c = {}; for (const m of ms) for (const id of pick(m)) if (id != null && id >= 0) c[id] = (c[id] || 0) + 1; return Object.entries(c).map(([id, n]) => ({ p: ((ev.rec && ev.rec.players) || []).find((x) => x.id === Number(id)) || playerById(Number(id)), n })).filter((x) => x.p).sort((a, b) => b.n - a.n).slice(0, 5); };
      const board = (title, list) => (list.length ? '<div class="ux-ev-board"><h4>' + esc(tl(title)) + '</h4>' + list.map((x, i) => '<div><span>' + (i + 1) + '. ' + esc(x.p.name) + '</span><b>' + x.n + '</b></div>').join('') + '</div>' : '');
      const boards = board('Top scorers', tally((m) => m.sc)) + board('Most assists', tally((m) => m.as)) + board('Most MVPs', tally((m) => [m.mvp]));
      const stand = top.length ? '<h4>' + esc(tl('Final standings')) + '</h4><div class="ux-ev-stand">' + top.slice(0, 16).map((s) => '<div class="' + (s.teamId === me ? 'me' : '') + '"><span class="pl">' + medal(s.placement) + '</span><span class="nm">' + logo(s.teamId) + '<b>' + esc(s.name || nm({ rec: ev.rec }, s.teamId)) + '</b></span><span class="pz">' + (s.prize ? esc(fmtMoney(s.prize)) : '') + '</span></div>').join('') + '</div>' : '';
      const order = ['group', 'playoff', 'r16', 'quarter', 'semi', 'final'], rank = (m) => { const i = order.indexOf(m.stage); return i < 0 ? 99 : i; };
      const stages = []; for (const m of ms.slice().sort((a, b) => rank(a) - rank(b))) { let g = stages[stages.length - 1]; if (!g || g.k !== m.stage) stages.push(g = { k: m.stage, list: [] }); g.list.push(m); }
      const row = (m) => '<div class="ux-ev-m ux-fh-row' + (m.mine ? ' me' : '') + '" tabindex="0" data-ux-match="' + esc(m.id) + '"><span class="d">' + esc(m.date ? fmtDateShort(m.date) : '') + '</span><span class="h' + (m.hw > m.aw ? ' w' : '') + '">' + esc(hn(m)) + '</span><span class="s">' + (m.hw ?? '–') + ' &ndash; ' + (m.aw ?? '–') + '</span><span class="a' + (m.aw > m.hw ? ' w' : '') + '">' + esc(an(m)) + '</span></div>';
      showModal(shell(esc(ev.name),
        '<div class="ux-ev-head"><div class="mx-dim">' + esc([tl('Season {n}', { n: ev.season }), ev.comp, ev.start ? fmtDateShort(ev.start) + (ev.end ? ' – ' + fmtDateShort(ev.end) : '') : ''].filter(Boolean).join(' · ')) + '</div>' + (champ ? '<div class="ux-ev-champ">&#127942; ' + esc(tl('Champions: {club}', { club: champ })) + '</div>' : '') + '</div>' +
        '<div class="ux-hist-chips ux-ev-chips">' + chip(teamsN || '–', 'Teams') + chip(ms.length, 'Matches') + chip(goals || '–', 'Goals') + (pool ? chip(fmtMoney(pool), 'Prize pool') : '') + '</div>' +
        (ev.bracket ? '<p><button type="button" class="btn" data-ux-bracket="' + esc(ek) + '">' + esc(tl('Open bracket and groups')) + '</button></p>' : '') +
        stand + (boards ? '<div class="ux-ev-boards">' + boards + '</div>' : '') +
        '<h4>' + esc(tl('Matches')) + ' (' + ms.length + ')</h4>' + (stages.length ? stages.map((g) => '<div class="ux-ev-stage">' + esc(g.k ? stageName(g.k) : tl('Matches')) + '</div>' + g.list.map(row).join('')).join('') : '<p class="mx-dim">' + esc(tl('No matches recorded for this event.')) + '</p>'), 'wide'));
    }
    async function openBracket(ek) {
      const b = (evs[ek] || {}).bracket; if (!b) return;
      closeModal();
      if (historySeason !== b.season) await loadHistorySeason(b.season);
      historyView = 'brackets'; historyRegion = b.region; historyEvent = String(b.eid); historyPage = 0; renderHistoryChange();
    }
    const origSH = seasonHistoryHtml;
    seasonHistoryHtml = function () { // eslint-disable-line no-global-assign
      let html = origSH.apply(this, arguments);
      html = html.replace(/<button[^>]*data-view="stats"[^>]*>[^<]*<\/button>/, (m) => m + m.replace('data-view="stats"', 'data-view="winners"').replace(/class="tabstrip-tab( on)?"/, 'class="tabstrip-tab' + (historyView === 'winners' ? ' on' : '') + '"').replace(/>[^<]*</, '>' + esc(tl('Full History')) + '<'));
      if (historyView !== 'winners') return html;
      const chk = (k, label) => '<label class="ux-wchk"><input type="checkbox" data-ux-wf="' + k + '"' + (wf[k] ? ' checked' : '') + '>' + esc(tl(label || KIND[k])) + '</label>';
      const seasons = '<select class="ux-fh-sel" data-ux-season aria-label="' + esc(tl('Season')) + '"><option value="all">' + esc(tl('All seasons')) + '</option>' + Array.from({ length: C().season }, (_, i) => C().season - i).map((n) => '<option value="' + n + '"' + (seasonSel === String(n) ? ' selected' : '') + '>' + esc(tl('Season {n}', { n })) + '</option>').join('') + '</select>';
      const rgName = (id) => { const r = (C().regions || []).find((x) => x.id === id) || ((C().tierB || {}).regions || []).find((x) => x.id === id); return r ? r.name : id; };
      const regs = [...new Set(Object.values(evs).map((x) => baseRg(x.rg)).filter(Boolean))].sort((a, b) => (a === baseRg(C().userRegion) ? -1 : b === baseRg(C().userRegion) ? 1 : rgName(a).localeCompare(rgName(b))));
      const regionSelect = '<select class="ux-fh-sel" data-ux-region aria-label="' + esc(tl('Region')) + '"><option value="all">' + esc(tl('All regions')) + '</option>' + regs.map((r) => '<option value="' + esc(r) + '"' + (regionSel === r ? ' selected' : '') + '>' + esc(rgName(r)) + (r === baseRg(C().userRegion) ? ' (' + esc(tl('yours')) + ')' : '') + '</option>').join('') + '</select>';
      return html.replace('<div class="history-page">', '<div class="history-page ux-winners">')
        .replace(/<div class="history-filters">[\s\S]*$/, () => '<div class="history-filters ux-wf">' + seasons + regionSelect + chk('a') + chk('b') + chk('c') + chk('w', 'Winners') + chk('m', 'My club') + (wf.w ? '' : chk('s', 'Swiss stage') + chk('g', 'Group stage') + chk('p', 'Playoffs')) + '<button type="button" class="btn" data-action="ux-win-all">' + esc(tl('Toggle all')) + '</button></div><div class="history-body" tabindex="0" role="region" aria-label="' + esc(tl('Full History')) + '">' + winnersBody() + '</div></div>');
    };
    document.addEventListener('click', (e) => {
      const tg = e.target.closest && e.target.closest('[data-ux-ev],[data-ux-match],[data-ux-bracket],[data-ux-page],[data-action="history-view"][data-view="winners"],[data-action="ux-win-all"]');
      if (!tg) return;
      const d = tg.dataset;
      if (d.uxEv != null) { e.stopImmediatePropagation(); e.preventDefault(); eventModal(d.uxEv); return; }
      if (d.uxBracket != null) { e.stopImmediatePropagation(); e.preventDefault(); openBracket(d.uxBracket); return; }
      if (d.uxMatch != null) { e.stopImmediatePropagation(); e.preventDefault(); matchModal(d.uxMatch); return; }
      if (d.uxPage != null) { e.stopImmediatePropagation(); e.preventDefault(); page = Number(d.uxPage); renderHistoryChange(); return; }
      if (d.action === 'ux-win-all') { e.stopImmediatePropagation(); e.preventDefault(); const on = !(wf.a && wf.b && wf.c); wf.a = wf.b = wf.c = on; page = 0; renderHistoryChange(); return; }
      winRows = null; matchRows = null; page = 0; loadWinners(); // the game's own handler switches the view right after this
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('[data-ux-match]')) return;
      e.preventDefault(); matchModal(e.target.dataset.uxMatch);
    }, true);
    document.addEventListener('change', (e) => {
      const t = e.target, d = t && t.dataset; if (!d || bigList !== 'history') return;
      if (d.uxWf) { e.stopImmediatePropagation(); wf[d.uxWf] = t.checked; page = 0; renderHistoryChange(); }
      else if (d.uxRegion != null) { e.stopImmediatePropagation(); regionSel = t.value; page = 0; renderHistoryChange(); }
      else if (d.uxSeason != null) { e.stopImmediatePropagation(); seasonSel = t.value; page = 0; renderHistoryChange(); }
    }, true);
  }
  try { render(); } catch (e) { /* no career open yet */ }
})();
