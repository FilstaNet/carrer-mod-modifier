// Phase 8: TIER A / TIER B switch for the Standings card (Home) and the full Standings window.
// Runs in the game's renderer (injected from the main process, see launcher/start.js). The game's app.js is a classic script,
// so its top-level functions/state (S, C, standingsCardHtml, standWindowHtml, crest, esc, tl ...) are reachable from here.
// Tier A output is the game's own HTML with only the two buttons added; Tier B output is built here with the game's own classes.
(function () {
  'use strict';
  if (window.__btierUI) return;
  if (typeof standingsCardHtml !== 'function' || typeof standWindowHtml !== 'function' || typeof C !== 'function') return;
  window.__btierUI = true;

  let div = 'A'; // shared by the Home card and the full window
  let bView = 'table'; // table | scorers | assists | mvps | promo
  const VIEWS = [['table', 'Table'], ['scorers', 'Top scorers'], ['assists', 'Most assists'], ['mvps', 'Most MVPs'], ['promo', 'Promotion']];

  const st = document.createElement('style');
  st.textContent = '.btier-div{display:inline-flex;gap:6px;margin-left:14px;vertical-align:middle;font-size:12px}' +
    '.btier-div .ptab{cursor:pointer}.tbl td.pos.btier-up{box-shadow:inset 3px 0 0 #1fa05a}.tbl td.pos.btier-po{box-shadow:inset 3px 0 0 #2f6fe0}.sb-left{padding-top:0!important}.sb-left>:first-child{margin-top:18px}.sb-left thead th{padding-top:10px!important;background:var(--btier-sb,var(--panel-2))!important;z-index:3!important}.stand-event.btier-cup{position:static;display:flex;flex-direction:column;gap:14px;overflow:auto;height:100%}.stand-event.btier-cup .gfx{position:static;inset:auto;height:auto;min-height:300px;overflow:visible;width:100%}.tbl td.pos.btier-down{box-shadow:inset 3px 0 0 #d6293f}.btier-empty{padding:40px 20px;text-align:center;opacity:.75}.btier-sub{opacity:.7;font-size:12px;margin:6px 0}.btier-pr{margin:8px 0}';
  document.head.appendChild(st);

  let touched = false;
  const hasB = () => {
    try {
      const c = C(); const ok = !!(c && c.tierB && c.tierB.cups);
      if (ok && !touched) { touched = true; if (/_b$/.test(c.userRegion || '')) div = 'B'; } // a Tier B manager starts on their own division
      return ok;
    } catch (e) { return false; }
  };
  const region = () => { const r = C().userRegion || ''; return /_b$/.test(r) ? r : r + '_b'; };
  const teamsOf = (r) => C().teams.filter((t) => t.region === r);
  const regionName = (r) => { const x = (C().tierB.regions || []).find((q) => q.id === r); return x ? x.name : r; };
  const cupEvent = (c) => ({ id: c.id, kind: 'bcup', name: c.name, split: c.split, index: c.index, startDate: c.startDate, endDate: c.endDate, stage: c.stage,
    groups: c.groups || [], slots: c.slots || [], standings: c.standings || [], field: (c.field && c.field.length ? c.field : teamsOf(c.region).map((t) => t.id)), championId: c.championId, groupSize: 4, qualifierCount: (c.groups || []).length * 2 || 16, international: false, skipped: !!c.skipped });
  const bCups = () => { try { return hasB() ? C().tierB.cups.filter((c) => c.region === region()).map(cupEvent) : []; } catch (e) { return []; } };
  const liveCup = () => bCups().find((e) => e.stage === 'groups' || e.stage === 'playoffs') || null;
  const buttons = () => '<span class="ptabs btier-div">' + ['A', 'B'].map((d) =>
    '<button type="button" class="ptab' + (div === d ? ' active' : '') + '" data-action="btier-div" data-div="' + d + '">' + tl('TIER ' + d) + '</button>').join('') + '</span>';

  // Regional Tier B table for this season, same order rules as the engine (btier-season.js standings()).
  function table(r) {
    const tb = C().tierB;
    const rows = new Map(teamsOf(r).map((t) => [t.id, { t, points: 0, cups: 0, wins: 0, seconds: 0, best: 99, sum: 0, prize: 0, podiums: 0 }]));
    for (const h of tb.history || []) {
      if (h.region !== r || h.season !== tb.season) continue;
      for (const x of h.standings) {
        const o = rows.get(x.teamId); if (!o) continue;
        o.points += x.points; o.cups++; o.sum += x.placement; o.best = Math.min(o.best, x.placement); o.prize += x.prize || 0;
        if (x.placement <= 3) o.podiums++;
        if (x.placement === 1) o.wins++;
        if (x.placement === 2) o.seconds++;
      }
    }
    const prev = (tb.lastRanking && tb.lastRanking[r]) || {};
    return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.seconds - a.seconds || a.best - b.best ||
      (a.cups ? a.sum / a.cups : 99) - (b.cups ? b.sum / b.cups : 99) || (prev[b.t.id] || 0) - (prev[a.t.id] || 0) || a.t.id - b.t.id);
  }

  function tableHtml(limit) {
    const r = region(); const me = C().userTeamId;
    const all = table(r); const rows = limit ? all.slice(0, limit) : all;
    const body = rows.map((o, i) => '<tr class="' + (limit ? '' : 'clickrow ') + (o.t.id === me ? 'me' : '') + '"' + (limit ? '' : ' data-action="club-detail" data-team="' + o.t.id + '"') + '><td class="pos' + (i === 0 ? ' btier-up' : i < 5 ? ' btier-po' : '') + '">' + (i + 1) + '</td>' +
      '<td class="l"><div class="teamcell">' + crest(o.t, 'small') + ' <span class="tname">' + esc(o.t.name) + '</span></div></td>' +
      '<td>' + o.cups + '</td><td>' + (o.wins || '&mdash;') + '</td><td class="pts">' + o.points + '</td></tr>').join('');
    const pad = limit ? padRowsHtml(rows.length, limit, 5) : '';
    return '<div class="tbl-band">' + esc(tl('Tier B') + ' · ' + regionName(r)) + '</div>' +
      '<table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + tl('Team') + '</th><th>' + tl('Cups') + '</th><th>' + tl('Titles') + '</th><th>' + tl('Points') + '</th></tr></thead><tbody>' + body + pad + '</tbody></table>';
  }

  // Player leaderboards of the Tier B region only: the game's own function, fed with this region's players.
  function playersHtml(view, limit) {
    const ids = new Set(teamsOf(region()).map((t) => t.id));
    const real = alivePlayers;
    alivePlayers = () => real().filter((p) => ids.has(p.teamId)); // eslint-disable-line no-global-assign
    try {
      return leaderboardHtml(view, limit).replace(/<div class="tbl-band">[^<]*<\/div>/, '<div class="tbl-band">' + esc(tl('Tier B') + ' · ' + regionName(region())) + '</div>');
    } finally { alivePlayers = real; } // eslint-disable-line no-global-assign
  }

  // Promotion playoff: real fixtures from the engine, nothing is invented while it has not been drawn.
  function promoHtml() {
    const tb = C().tierB; const p = tb.promo && tb.promo.season === C().season ? tb.promo.regions[region()] : null;
    if (!p || !p.slots) return '<div class="btier-empty">' + tl('The promotion playoff is drawn when the season ends.') + '</div>';
    const nm = (id) => { const t = id != null ? teamById(id) : null; return t ? '<span class="sf-team">' + crest(t, 'small') + '<span>' + esc(t.name) + '</span></span>' : '<span class="sf-team tbd"><span>?</span></span>'; };
    const row = (s, label) => {
      const f = s.fixtureId != null ? (C().fixtures || []).find((x) => x.id === s.fixtureId) : null;
      const score = f && f.played ? '<span class="sf-score">' + f.homeWins + '<i>&ndash;</i>' + f.awayWins + '</span>' : '<span class="sf-vs">' + tl('vs') + '</span>';
      return '<div class="sf-day">' + esc(tl(label)) + ' · BO7</div><div class="sf-row">' + nm(s.teamA) + score + nm(s.teamB) + '</div>';
    };
    const by = (k) => p.slots.find((s) => s.id.endsWith(k));
    const rel = (p.relegated || []).map((id) => (teamById(id) || {}).name).filter(Boolean).map(esc).join(', ');
    return '<div class="btier-pr"><div class="btier-sub">' + esc(tl('Promoted directly') + ': ') + (teamById(p.direct) ? esc(teamById(p.direct).name) : '') + '</div>' +
      '<div class="sf-list">' + row(by('sf-1'), 'Semifinal 1') + row(by('sf-2'), 'Semifinal 2') + row(by('final'), 'Promotion final') + '</div>' +
      (p.winnerId != null ? '<div class="btier-sub">' + esc(tl('Promoted via playoff') + ': ' + (teamById(p.winnerId) || {}).name) + '</div>' : '') +
      (rel ? '<div class="btier-sub">' + esc(tl('Relegated from Tier A') + ': ') + rel + '</div>' : '') + '</div>';
  }

  // Playoff bracket of a cup (single elimination, top 8, or top 16 for old 32-team cups), drawn like the game's own bracket: boxes laid out on a fixed
  // canvas with thin connector lines running behind them (same brk-board drawn / brk-links / brk-cell classes).
  function cupBracketHtml(e) {
    const P = 'C' + e.id + 'P-';
    const CW = 330; const CH = 98; const PITCH = 130; const TOP = 80; const X = [24, 434, 844, 1254]; const BUS = 40;
    const W = X[(e.slots || []).some((x) => x.id === P + 'r16-1') ? 3 : 2] + CW + 80;
    const all = [['Round of 16', 'r16', 8], ['Quarterfinals', 'qf', 4], ['Semifinals', 'sf', 2], ['Final', 'final', 1]];
    const rounds = (e.slots || []).some((x) => x.id === P + 'r16-1') ? all : all.slice(1);
    const R = rounds.length; const n0 = rounds[0][2];
    const H = TOP + (n0 - 1) * PITCH + CH + 40;
    const cy = rounds.map(() => []);
    for (let i = 0; i < n0; i++) cy[0][i] = TOP + i * PITCH + CH / 2;
    for (let k = 1; k < R; k++) for (let i = 0; i < cy[k - 1].length / 2; i++) cy[k][i] = Math.round((cy[k - 1][2 * i] + cy[k - 1][2 * i + 1]) / 2);
    const paths = [];
    for (let k = 0; k < R - 1; k++) for (let i = 0; i < cy[k].length / 2; i++) {
      const x0 = X[k] + CW; const bx = x0 + BUS; const a1 = cy[k][2 * i]; const b1 = cy[k][2 * i + 1];
      paths.push('M' + x0 + ' ' + a1 + ' H' + bx, 'M' + x0 + ' ' + b1 + ' H' + bx, 'M' + bx + ' ' + a1 + ' V' + b1, 'M' + bx + ' ' + cy[k + 1][i] + ' H' + X[k + 1]);
    }
    const pct = (v, t) => (v / t * 100).toFixed(4) + '%';
    const side = (slot, id, cls) => {
      const t = id != null ? teamById(id) : null;
      const sc = id != null ? tieScore(slot, id) : null;
      return '<div class="brk-side ' + cls + (t ? ' clickrow' : '') + (slot.winner != null && slot.winner === id ? ' won' : '') + (id === C().userTeamId ? ' mine' : '') + (t ? '' : ' tbd') + '"' + (t ? ' data-action="club-detail" data-team="' + t.id + '"' : '') + '><span class="brk-crest">' + (t ? crest(t, 'small') : '') +
        '</span><span class="brk-name">' + esc(t ? t.name : tl('TBD')) + '</span><span class="brk-score">' + (sc ? sc.won : '&ndash;') + '</span></div>';
    };
    let cells = ''; let heads = '';
    rounds.forEach(([title, key, n], k) => {
      heads += '<div class="brk-head" style="left:' + pct(X[k], W) + '; top:' + pct(cy[k][0] - CH / 2, H) + '">' + esc(tl(title)) + '</div>';
      for (let i = 0; i < n; i++) {
        const slot = (e.slots || []).find((x) => x.id === P + (key === 'final' ? 'final' : key + '-' + (i + 1)));
        if (!slot) continue;
        cells += '<div class="brk-cell" style="left:' + pct(X[k], W) + '; top:' + pct(cy[k][i] - CH / 2, H) + '; width:' + pct(CW, W) + '; height:' + pct(CH, H) + '"><div class="brk-match"><div class="brk-letter">' +
          esc(tl(title)) + (n > 1 ? ' · ' + (i + 1) : '') + '</div><div class="brk-sides">' + side(slot, slot.teamA, 'one') + side(slot, slot.teamB, 'two') + '</div></div></div>';
      }
    });
    const svg = '<svg class="brk-links" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke"><path d="' + paths.join(' ') + '"></path></g></svg>';
    return '<div class="gfx gfx-bracket"><div class="gfx-title">' + esc(tl('PLAYOFFS')) + '</div><div class="gfx-event">' + esc(e.name) + '</div><div class="brk-board drawn" style="--brk-one:#3d4af2;--brk-one-ink:#fff;--brk-two:#e5635c;--brk-two-ink:#fff;aspect-ratio:' + W + ' / ' + H + '">' + svg + heads + cells + '</div></div>';
  }
  // Group tables of all 8 groups with clickable clubs: the game's own standGroupsTableHtml shows 4 groups, so two calls
  // (its letters A-D are extended to E-H for the second half).
  function groupTablesHtml(c) {
    if (typeof standGroupsTableHtml !== 'function' || (c.groups || []).length <= 4) return groupsArtHtml(c);
    if (typeof GROUP_LETTERS === 'object' && GROUP_LETTERS.length === 4) GROUP_LETTERS.push('E', 'F', 'G', 'H');
    const half = (groups, shift) => standGroupsTableHtml({ ...c, groups }).replace(/(<div class="sb-grouphead">[^<]*?)([A-D])(<\/div>)/g, (m, a, l, z) => a + (shift ? 'EFGH'['ABCD'.indexOf(l)] : l) + z);
    return half(c.groups.slice(0, 4), false) + half(c.groups.slice(4), true);
  }
  // The live cup is the default Tier B view while it runs (groups first, then the bracket), like the game's own event view.
  let autoFor = null;
  const viewsB = () => { const c = liveCup(); return c ? [['cup', c.name]].concat(VIEWS) : VIEWS; };
  function syncBView() {
    const c = liveCup();
    if (c) { if (autoFor !== c.id) { autoFor = c.id; bView = 'cup'; } } else { autoFor = null; if (bView === 'cup') bView = 'table'; }
  }
  function cupViewHtml(wide) {
    const c = liveCup();
    if (!c) return tableHtml(wide ? 0 : HOME_STAND_ROWS);
    if (!wide) return '<div class="stand-event btier-cup">' + (c.stage === 'playoffs' ? cupBracketHtml(c) : groupsArtHtml(c)) + '</div>';
    return '<div class="stand-event btier-cup">' + groupTablesHtml(c) + (c.stage === 'playoffs' ? '<div class="sb-bracket"><div class="sb-grouphead">' + tl('Playoffs') + '</div>' + cupBracketHtml(c) + '</div>' : '') + '</div>';
  }
  const bodyHtml = (limit) => (bView === 'cup' ? cupViewHtml(!limit) : bView === 'table' ? tableHtml(limit) : bView === 'promo' ? promoHtml() : playersHtml(bView, limit));

  // NEXT FIXTURES for Tier B: next day with unplayed B-Tier Cup (or playoff) matches in this region.
  function fixturesHtml() {
    const c = C(); const ids = new Set(teamsOf(region()).map((t) => t.id));
    const left = (c.fixtures || []).filter((f) => f.tierB && !f.played && ids.has(f.homeId) && ids.has(f.awayId)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    if (!left.length) {
      const nxt = (c.tierB.cups || []).filter((x) => x.region === region() && x.stage === 'pending')[0];
      return '<div class="sb-empty dark">' + (nxt ? esc(tl('Next: {event}, {date}.', { event: nxt.name, date: fmtDateShort(nxt.startDate) })) : tl('No fixtures yet.')) + '</div>';
    }
    const day = left[0].date; const me = c.userTeamId;
    const team = (id, r) => { const t = teamById(id); return '<span class="sf-team' + (r ? ' r' : '') + '">' + (t ? crest(t, 'small') : '') + '<span>' + esc(t ? t.name : '?') + '</span></span>'; };
    return '<div class="sf-list"><div class="sf-day">' + esc(fmtDateShort(day)) + '</div>' + left.filter((f) => f.date === day).map((f) =>
      '<div class="sf-row' + (f.homeId === me || f.awayId === me ? ' mine' : '') + '">' + team(f.homeId, false) + '<span class="sf-vs">' + tl('vs') + '</span>' + team(f.awayId, true) + '</div>').join('') + '</div>';
  }
  function headName() {
    const c = C(); const ids = new Set(teamsOf(region()).map((t) => t.id));
    const f = (c.fixtures || []).filter((x) => x.tierB && !x.played && ids.has(x.homeId)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!f) return tl('Season {n}', { n: c.season });
    if (f.promoId != null) return tl('Promotion playoff');
    const cup = (c.tierB.cups || []).find((x) => x.id === f.cupId);
    return cup ? cup.name : tl('Season {n}', { n: c.season });
  }

  // Tier A view = the game's own output, but its "All regions" leaderboards must not list Tier B club players.
  function tierAOnly(fn) {
    const real = alivePlayers;
    const c = C(); const ur = c.userRegion; // a Tier B manager's "Tier A" tab shows the Tier A home region, not their own B region
    if (/_b$/.test(ur || '')) c.userRegion = ur.slice(0, -2);
    // Player leaderboards: this Tier A region only (the game lists every region), never Tier B clubs.
    const ids = new Set(c.teams.filter((t) => t.region === c.userRegion).map((t) => t.id));
    const rName = ((c.regions || []).find((r) => r.id === c.userRegion) || {}).name || c.userRegion;
    const homes = (typeof S === 'object' && S && S.homes) || null;
    const homeOk = (p) => !homes || !homes[p.id] || homes[p.id] === c.userRegion || homes[p.id] === c.userRegion + '_b';
    alivePlayers = () => real().filter((p) => ids.has(p.teamId) && homeOk(p)); // eslint-disable-line no-global-assign
    try { return fn().replace(/<div class="tbl-band">[^<]*<\/div>/g, (m) => m.replace(/All regions/, esc(rName))); } finally { alivePlayers = real; c.userRegion = ur; } // eslint-disable-line no-global-assign
  }

  // Last two Tier A teams of the region = relegation zone: red marker on the left, like the teal qualification marker.
  function markRelegation(html) {
    if (html.indexOf('<th>' + tl('Opens') + '</th>') < 0) return html; // only the team table, not the player leaderboards
    const home = (C().userRegion || '').replace(/_b$/, '');
    const n = C().teams.filter((t) => t.region === home).length;
    if (n < 4) return html;
    return html.replace(/<td class="pos([^"]*)">(\d+)<\/td>/g, (m, cls, num) => (+num > n - 2 ? '<td class="pos' + cls + ' btier-down">' + num + '</td>' : m));
  }

  const origCard = standingsCardHtml;
  standingsCardHtml = function () { // eslint-disable-line no-global-assign
    if (!hasB()) return origCard();
    if (div === 'A') return markRelegation(tierAOnly(origCard)).replace('<div class="card-h">' + tl('Standings') + '</div>', '<div class="card-h">' + tl('Standings') + buttons() + '</div>');
    syncBView();
    return cardOpen('stand-card', 'stand-open') + '<div class="card-h">' + tl('Standings') + buttons() + '</div>' +
      panelTabsHtml(viewsB(), bView, 'btier-view', 'data-view') + '<div class="card-b stand-clip">' + bodyHtml(HOME_STAND_ROWS) + '</div></div>';
  };

  const origWin = standWindowHtml;
  standWindowHtml = function () { // eslint-disable-line no-global-assign
    if (!hasB()) return origWin();
    const title = '<div class="tb-title">' + tl('Standings') + '</div>';
    const h = div === 'A' ? markRelegation(tierAOnly(origWin)) : origWin();
    if (div === 'A') return h.replace(title, '<div class="tb-title">' + tl('Standings') + buttons() + '</div>');
    syncBView();
    const pick = viewsB().map((v) => '<button class="tb-item' + (v[0] === bView ? ' on' : '') + '" data-action="btier-view" data-view="' + v[0] + '"><span class="tb-name">' + esc(v[0] === 'cup' ? v[1] : tl(v[1])) + '</span></button>').join('');
    return '<div class="office-window ow-standings" role="dialog" aria-label="' + esc(tl('Standings')) + '"><div class="ow-panel"><div class="ow-body"><div class="ow-screen"><div class="two-blocks stand-screen">' +
      '<button class="ow-close tb-close" data-action="stand-close" aria-label="' + esc(tl('Close')) + '">&times;</button>' +
      '<div class="tb-light"><div class="tb-col"><div class="tb-title">' + tl('Standings') + buttons() + '</div><div class="tb-pick">' + pick + '</div></div><div class="sb-left">' + bodyHtml(0) + '</div></div>' +
      '<div class="tb-dark"><div class="tb-scroll"><div class="tb-head">' + esc(headName()) + '</div><div class="tb-sechead">' + tl('Next fixtures') + '</div>' + fixturesHtml() + '</div></div></div></div></div></div></div>';
  };


  // B-Tier Cups on the calendar: shown as events of the game's own calendar (list, month grid, detail with group stage).
  if (typeof calEventList === 'function' && typeof eventDayMap === 'function' && typeof calEventById === 'function') {
    const isBUser = () => /_b$/.test(C().userRegion || '');
    // Tier A manager: Tier A events only. Tier B manager: Tier B cups only.
    const cupEvents = () => (isBUser() ? bCups() : []);
    const byDate = (a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);

    const oList = calEventList;
    calEventList = function () { return isBUser() ? cupEvents() : oList(); }; // eslint-disable-line no-global-assign
    const oById = calEventById;
    calEventById = function (id) { return isBUser() ? cupEvents().find((e) => e.id === id) || null : oById(id); }; // eslint-disable-line no-global-assign
    const oNow = calEventNow;
    calEventNow = function () { // eslint-disable-line no-global-assign
      const cups = cupEvents();
      if (typeof calEvent === 'number' && cups.some((e) => e.id === calEvent)) return calEvent;
      if (isBUser()) { if (!cups.length) return null; const c = cups.find((e) => e.stage === 'groups' || e.stage === 'playoffs') || cups.find((e) => e.stage !== 'done') || cups[cups.length - 1]; return c.id; }
      return oNow();
    };
    const oDays = eventDayMap;
    eventDayMap = function () { // eslint-disable-line no-global-assign
      const m = isBUser() ? {} : oDays();
      for (const e of cupEvents()) {
        if (e.skipped) continue;
        let d = e.startDate;
        for (let i = 0; i < 40 && d <= e.endDate; i++) { m[d] = e; d = addDaysIso(d, 1); }
      }
      return m;
    };
    if (typeof nextEvent === 'function') {
      const oNext = nextEvent;
      nextEvent = function () { // eslint-disable-line no-global-assign
        if (!isBUser()) return oNext();
        return cupEvents().filter((e) => e.stage !== 'done' && e.endDate >= C().currentDate).sort(byDate)[0] || null;
      };
    }
    const oColour = eventColour;
    eventColour = function (e) { return e && e.kind === 'bcup' ? 'var(--teal)' : oColour(e); }; // eslint-disable-line no-global-assign
    const oShort = shortEventName;
    shortEventName = function (e) { return e && e.kind === 'bcup' ? 'B' + (e.index || '') : oShort(e); }; // eslint-disable-line no-global-assign
    const oMeaning = eventMeaningHtml;
    eventMeaningHtml = function (e) { // eslint-disable-line no-global-assign
      if (!e || e.kind !== 'bcup') return oMeaning(e);
      const mine = (e.standings || []).find((x) => x.teamId === C().userTeamId);
      const you = mine ? '<span class="ev-you ' + (mine.placement <= 3 ? 'good' : '') + '">' + esc(tl('You finished {place} · {pts} pts', { place: ordinal(mine.placement), pts: mine.points })) + '</span>' : '';
      return '<div class="ev-meaning"><div class="ev-meaning-l"><div class="ev-where">' + esc(regionName(region()) + ' · ' + teamsOf(region()).length + ' ' + tl('clubs')) + '</div><div class="ev-feeds">' +
        esc(tl('Placement banks Tier B points toward promotion.')) + '</div></div><div class="ev-meaning-r">' + you + '</div></div>';
    };
    const oGroups = groupsArtHtml;
    groupsArtHtml = function (e) { // eslint-disable-line no-global-assign
      if (e && e.kind === 'bcup' && !(e.groups || []).length) return '<div class="btier-empty">' + tl('The draw is made a week before the cup starts.') + '</div>';
      if (!e || e.kind !== 'bcup' || (e.groups || []).length <= 4) return oGroups(e);
      const second = oGroups({ ...e, groups: e.groups.slice(4) }).replace(/GROUP ([A-D])/g, (m, l) => 'GROUP ' + 'EFGH'['ABCD'.indexOf(l)]).replace(/<div class="gfx-title">.*?<\/div>/, '').replace(/<div class="gfx-event">.*?<\/div>/, ''); // the game labels 4 groups A-D
      return oGroups({ ...e, groups: e.groups.slice(0, 4) }) + second;
    };

    // Season -> Events tab for a Tier B manager: exactly the game's own layout (how-it-works line, one tab per event,
    // event panel with meaning box, group stage, bracket and final standings), fed with the six B-Tier Cups.
    if (typeof eventsViewHtml === 'function' && typeof eventTabsHtml === 'function' && typeof eventPanelHtml === 'function' && typeof pickedEvent === 'function') {
      const oEvents = eventsViewHtml;
      eventsViewHtml = function () { // eslint-disable-line no-global-assign
        if (!isBUser()) return oEvents();
        const evs = cupEvents().filter((e) => !e.skipped);
        if (!evs.length) return '<div class="tbl-note">' + tl('No events scheduled.') + '</div>';
        const how = '<div class="ev-how">' + tl('Six <b>B-Tier Cups</b> in {region} bank Tier B points. The season champion is promoted to Tier A; places 2 to 5 play the promotion playoff.', { region: esc(regionName(region())) }) + '</div>';
        return how + eventTabsHtml(evs, pickedEvent(evs)) + eventPanelHtml(pickedEvent(evs));
      };
    }
    if (typeof bracketArtHtml === 'function') {
      const oBr = bracketArtHtml;
      bracketArtHtml = function (e, a2) { // eslint-disable-line no-global-assign
        if (!e || e.kind !== 'bcup') return oBr(e, a2);
        return (e.slots || []).length ? cupBracketHtml(e) : '<div class="btier-empty">' + tl('The bracket is not drawn yet.') + '</div>';
      };
    }
    const st3 = document.createElement('style');
    st3.textContent = '.cal-cell.ev-bcup{background:color-mix(in srgb,var(--teal) 14%,transparent)}';
    document.head.appendChild(st3);
  }

  // New-career club select: TIER A / TIER B switch above the region picker (Tier B clubs arrive as extra regions eu_b, na_b ...).
  if (typeof preClubHtml === 'function') {
    let preDiv = 'A';
    const isBR = (r) => /_b$/.test(r.id);
    const inTier = () => (preRegions || []).map((r, i) => (isBR(r) === (preDiv === 'B') ? i : -1)).filter((i) => i >= 0);
    const origPre = preClubHtml;
    preClubHtml = function () { // eslint-disable-line no-global-assign
      const hasTierB = (preRegions || []).some(isBR);
      if (hasTierB && (!preRegions[preRegion] || isBR(preRegions[preRegion]) !== (preDiv === 'B'))) { const i = inTier()[0]; if (i != null) { preRegion = i; preClub = 0; } }
      let h = origPre();
      // Same card size for every club: a club without a logo keeps the (invisible) logo slot and its name is centred in the card.
      h = h.replace('<div class="pick-club">', '<div class="pick-club' + (/<div class="pick-crest"><\/div>/.test(h) ? ' btier-nologo' : '') + (((preClubNow() || {}).name || '').length > 22 ? ' btier-long' : '') + '">');
      if (!hasTierB) return h;
      const sw = '<div class="ptabs btier-pick">' + ['A', 'B'].map((d) => '<button type="button" class="ptab' + (preDiv === d ? ' active' : '') + '" data-action="btier-pre-div" data-div="' + d + '">' + tl('TIER ' + d) + '</button>').join('') + '</div>';
      return h.replace('<div class="pick-left">', '<div class="pick-left">' + sw);
    };
    const st2 = document.createElement('style');
    st2.textContent = '.pick-club-name{min-height:2.1em;display:flex;align-items:center;justify-content:center}.pick-club.btier-long .pick-club-name{font-size:calc(var(--f-screen) * .7);min-height:calc(var(--f-screen) * 2.1)}.pick-club.btier-nologo{padding-top:calc(26px + var(--f-screen) * 2.1 + 18px)}.pick-club.btier-nologo .pick-crest{visibility:hidden}.pick-club.btier-nologo .pick-club-name{position:absolute;top:50%;left:64px;right:64px;transform:translateY(-50%);min-height:0}.btier-pick{display:flex;gap:6px;margin:0 0 10px}.btier-pick .ptab{cursor:pointer;color:#cfd6dd}.btier-pick .ptab.active{color:#fff}';
    document.head.appendChild(st2);
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-action="btier-pre-div"],[data-action="pre-region"]');
      if (!el || !(preRegions || []).some(isBR)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (el.dataset.action === 'btier-pre-div') {
        const base = String((preRegions[preRegion] || {}).id || '').replace(/_b$/, '');
        preDiv = el.dataset.div;
        const idx = inTier(); const same = idx.find((i) => preRegions[i].id.replace(/_b$/, '') === base);
        preRegion = same != null ? same : idx[0]; preClub = 0;
      } else { // arrows cycle inside the selected division only
        const idx = inTier(); const at = Math.max(0, idx.indexOf(preRegion));
        preRegion = idx[(at + idx.length + (parseInt(el.dataset.step, 10) || 1)) % idx.length]; preClub = 0;
      }
      render();
    }, true);
  }

  // A Tier B manager is not in the Tier A events: their Home news must not tell Open stories (draws, champions).
  ['newsHeroHtml', 'pinnedStories', 'defaultRef'].forEach((name) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      let c = null;
      try { c = C(); } catch (e) { /* no career */ }
      if (!c || !c.tierB || !/_b$/.test(c.userRegion || '')) return orig.apply(this, arguments);
      const heads = S.headlines; const news = c.news;
      S.headlines = (heads || []).filter((h) => h.eventId == null);
      c.news = (news || []).filter((n) => n.eventId == null);
      try { return orig.apply(this, arguments); } finally { S.headlines = heads; c.news = news; }
    };
  });


  // ---- Season window for a Tier B manager: same look as the Tier A one, filled with the Tier B competition.
  const isBMgr = () => { try { return hasB() && /_b$/.test(C().userRegion || ''); } catch (e) { return false; } };
  function seasonTableHtml() {
    const r = region(); const me = C().userTeamId; const rows = table(r);
    const body = rows.map((o, i) => '<tr class="clickrow ' + (o.t.id === me ? 'me' : '') + '" data-action="club-detail" data-team="' + o.t.id + '"><td class="pos' + (i === 0 ? ' btier-up' : i < 5 ? ' btier-po' : '') + '">' + (i + 1) + '</td>' +
      '<td class="l"><div class="teamcell">' + crest(o.t, 'small') + ' <span class="tname">' + esc(o.t.name) + '</span></div></td><td>' + o.cups + '</td><td>' + (o.cups ? ordinal(o.best) : '&mdash;') + '</td><td>' + (o.podiums || '&mdash;') + '</td><td>' + (o.wins || '&mdash;') +
      '</td><td class="money">' + (o.prize ? fmtMoney(o.prize) : '&mdash;') + '</td><td class="pts">' + o.points + '</td></tr>').join('');
    return '<table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + tl('Team') + '</th><th>' + tl('Cups') + '</th><th>' + tl('Best') + '</th><th>' + tl('Podiums') + '</th><th>' + tl('Titles') + '</th><th class="money">' + tl('Prize money') + '</th><th>' + tl('Points') + '</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="tbl-note">' + esc(tl('Every B-Tier Cup banks Tier B points. The champion of the season is promoted to Tier A; places 2 to 5 play the promotion playoff.')) + '</div>';
  }
  if (typeof seasonRankingHtml === 'function') { const o = seasonRankingHtml; seasonRankingHtml = function () { return isBMgr() ? seasonTableHtml() : o(); }; } // eslint-disable-line no-global-assign
  if (typeof seasonHeadHtml === 'function' && typeof statLineHtml === 'function') {
    const o = seasonHeadHtml;
    seasonHeadHtml = function () { // eslint-disable-line no-global-assign
      if (!isBMgr()) return o();
      const c = C(); const rows = table(region()); const i = rows.findIndex((x) => x.t.id === c.userTeamId);
      const done = c.tierB.cups.filter((x) => x.region === region() && x.stage === 'done').length;
      return statLineHtml([{ v: tl('S{n}', { n: c.season }), k: tl('Season') }, { v: ordinal(i + 1), k: tl('Ranked') }, { v: i >= 0 ? rows[i].points : 0, k: tl('Tier B points') }, { v: done + ' / 6', k: tl('Cups played') }]);
    };
  }
  if (typeof BIG_LISTS === 'object' && BIG_LISTS.season) {
    const tabs = BIG_LISTS.season.tabs;
    BIG_LISTS.season.tabs = function () { const t = tabs(); return isBMgr() ? t.map((x) => (x[0] === 'table' ? [x[0], 'Tier B standings'] : x)) : t; };
  }

  // ---- Home: while a B-Tier Cup runs, a Tier B manager gets the same layout the game uses for a live event
  // (cup groups / bracket big on the right, news small at the bottom). Tier A managers keep the game's own logic.
  if (typeof homeHtml === 'function') {
    const o = homeHtml;
    homeHtml = function () { // eslint-disable-line no-global-assign
      if (!isBMgr()) return o();
      syncStandView();
      const on = !!liveCup();
      const big = on ? standingsCardHtml() : newsPanelHtml();
      const small = on ? newsPanelHtml() : standingsCardHtml();
      const po = on && liveCup().stage === 'playoffs'; // the bracket needs the whole right column: training moves under notifications/news
      return '<div class="grid-home' + (on ? ' event-on' : '') + '">\n    <div class="home-left">\n      ' + nextMatchCardHtml() + '\n      ' + (matchToday() ? '' : advanceCardHtml()) + '\n      <div class="home-pair">\n        ' + notificationsCardHtml() +
        '\n        ' + small + '\n      </div>' + (po ? '\n      ' + trainingTileHtml() : '') + '\n    </div>\n    <div class="home-right">\n      ' + big + (po ? '' : '\n      ' + trainingTileHtml()) + '\n    </div>\n  </div>';
    };
  }

  // ---- Club select: the Tier B regions get the map of their home region, in a lighter shade of its colour
  if (typeof preRegionMapHtml === 'function') {
    const o = preRegionMapHtml;
    preRegionMapHtml = function (id) { // eslint-disable-line no-global-assign
      if (!/_b$/.test(id || '')) return o(id);
      return o(id.slice(0, -2)).replace('data-rid="' + id.slice(0, -2) + '"', 'data-rid="' + id + '"');
    };
    const st4 = document.createElement('style');
    st4.textContent = '[data-rid="eu_b"]{--rc:#86a9e6}[data-rid="na_b"]{--rc:#e8977f}[data-rid="sam_b"]{--rc:#e6cb85}[data-rid="oce_b"]{--rc:#78c9b8}[data-rid="mena_b"]{--rc:#d2b46f}[data-rid="apac_b"]{--rc:#b894e6}[data-rid="ssa_b"]{--rc:#7fc791}';
    document.head.appendChild(st4);
  }

  // The sticky header must be as opaque as the window behind it: read that colour after every window render.
  if (typeof renderWindows === 'function') {
    const oRW = renderWindows;
    renderWindows = function () { // eslint-disable-line no-global-assign
      const r = oRW.apply(this, arguments);
      try {
        let el = document.querySelector('.sb-left');
        while (el && /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(getComputedStyle(el).backgroundColor)) el = el.parentElement;
        if (el) document.documentElement.style.setProperty('--btier-sb', getComputedStyle(el).backgroundColor);
      } catch (e) { /* keep the game's colour */ }
      return r;
    };
  }

  // Switching is a pure view change: no IPC, no career reload.
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-action="btier-div"],[data-action="btier-view"]');
    if (!el) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const open = typeof standWindowOpen !== 'undefined' && standWindowOpen;
    let back = false;
    if (el.dataset.action === 'btier-div') div = el.dataset.div;
    else { const ids = viewsB().map((v) => v[0]); back = ids.indexOf(el.dataset.view) < ids.indexOf(bView); bView = el.dataset.view; }
    if (open) renderWindows(); else render();
    // same slide the game plays when its own Standings tabs change
    if (el.dataset.action === 'btier-view' && typeof playPanelSlide === 'function') playPanelSlide(open ? '.sb-left' : '.stand-clip', back);
  }, true);
  try { render(); } catch (e) { /* no career open yet */ }
})();
