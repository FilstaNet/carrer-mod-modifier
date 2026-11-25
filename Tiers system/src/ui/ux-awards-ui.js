// Renderer side of: Kick-Off Weekend + Esports World Cup (calendar, Season -> Events, brackets),
// Tournament MVPs and Player of the Year (trophy room window, award counts on every player profile). Injected after ux-club-ui.js.
(function () {
  'use strict';
  if (window.__uxAwardsUI) return;
  if (typeof calEventList !== 'function' || typeof honoursViewHtml !== 'function' || typeof playerModalHtml !== 'function' || typeof showModal !== 'function' || typeof C !== 'function') return;
  window.__uxAwardsUI = true;

  const st = document.createElement('style');
  st.textContent =
    '.cal-cell.ev-kickoff{background:color-mix(in srgb,#e6a817 24%,transparent)}.cal-cell.ev-ewc{background:color-mix(in srgb,#9b6dff 24%,transparent)}.ux-evtag{font-size:var(--f-micro);font-weight:800;letter-spacing:.08em}' +
    '.ux-tt-btn{font:inherit;font-weight:800;font-size:var(--f-small);letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid var(--accent,var(--red));background:transparent;color:inherit;cursor:pointer;white-space:nowrap}' +
    '.ux-aw{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.ux-aw .chip{min-width:96px}' +
    '.ux-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:var(--f-micro);font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:color-mix(in srgb,var(--text) 10%,transparent)}';
  document.head.appendChild(st);

  const isB = () => /_b$/.test(C().userRegion || '');
  // The Swiss stage is not an event of its own: it is shown inside the Open it belongs to (its groups panel, its matches, its calendar days)
  const mjAll = () => ((C().uxMajors && C().uxMajors.events) || []).filter((e) => !e.skipped && !e.swiss);
  const swissOf = (open) => open && open.kind === 'open' ? ((C().uxMajors && C().uxMajors.events) || []).find((e) => e.swiss && e.openId === open.id && e.region === C().userRegion) || null : null;
  const mjEvents = () => (isB() ? [] : mjAll().filter((e) => e.season == null || e.season === C().season)); // a Tier B manager's calendar is the B-Tier Cups; only this season (older Kick-Offs / EWCs stay in the history, not on the calendar)
  const addD = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const isMj = (e) => !!(e && e.uxEv);
  const money = (n) => fmtMoney(Math.round(n));

  // ---------- calendar, Season -> Events, brackets ----------
  const sortByDate = (a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);
  const oList = calEventList;
  calEventList = function () { return oList.apply(this, arguments).concat(mjEvents()).sort(sortByDate); }; // eslint-disable-line no-global-assign
  const oById = calEventById;
  calEventById = function (id) { return oById.apply(this, arguments) || mjEvents().find((e) => e.id === id) || null; }; // eslint-disable-line no-global-assign
  const oDays = eventDayMap;
  eventDayMap = function () { // eslint-disable-line no-global-assign
    const m = oDays.apply(this, arguments);
    for (const e of mjEvents()) { let d = e.startDate; for (let i = 0; i < 8 && d <= e.endDate; i++) { if (!m[d]) m[d] = e; d = addD(d, 1); } }
    if (!isB()) for (const sw of (C().uxMajors && C().uxMajors.events) || []) { // the 2 Swiss days belong to their Open
      const open = sw.swiss && sw.region === C().userRegion ? (C().events || []).find((x) => x.id === sw.openId) : null;
      for (let d = open ? sw.startDate : null; d && d <= sw.endDate; d = addD(d, 1)) if (!m[d]) m[d] = open;
    }
    return m;
  };
  const oNow = calEventNow;
  calEventNow = function () { // eslint-disable-line no-global-assign
    if (typeof calEvent === 'number' && mjEvents().some((e) => e.id === calEvent)) return calEvent;
    const r = oNow.apply(this, arguments), live = mjEvents().find(evLive); // ours is the one running and the game has none live: open on it
    const picked = typeof calEvent === 'number' && (C().events || []).some((e) => e.id === calEvent);
    return live && !picked && !(C().events || []).some(evLive) ? live.id : r;
  };
  const oColour = eventColour;
  const MJ_COL = { kickoff: '#e6a817', ewc: '#9b6dff', swiss: '#2fb5a0' };
  const TAG = { kickoff: 'KO', ewc: 'EWC', swiss: 'SW' }; // fixed: the theme's --gold can be a grey
  eventColour = function (e) { return isMj(e) ? MJ_COL[e.kind] : oColour.apply(this, arguments); }; // eslint-disable-line no-global-assign
  if (typeof calBigGridHtml === 'function') {
    const oGrid = calBigGridHtml; // big calendar cells carry no event name: add KO / EWC to the cell
    calBigGridHtml = function () { // eslint-disable-line no-global-assign
      return oGrid.apply(this, arguments).replace(/(data-eid="(\d+)"[^>]*>[\s\S]*?<span class="cb-marks">)/g, (m, a, id) => {
        const e = mjEvents().find((x) => String(x.id) === id);
        return e ? a.replace('<span class="cb-marks">', '<span class="cb-marks"><b class="ux-evtag">' + (TAG[e.kind] || 'EWC') + '</b>') : m;
      });
    };
  }
  const oShort = shortEventName;
  shortEventName = function (e) { return isMj(e) ? (TAG[e.kind] || 'EWC') : oShort.apply(this, arguments); }; // eslint-disable-line no-global-assign
  const oMeaning = eventMeaningHtml;
  eventMeaningHtml = function (e) { // eslint-disable-line no-global-assign
    if (!isMj(e)) return oMeaning.apply(this, arguments);
    const k = e.kind === 'kickoff';
    const mine = (e.standings || []).find((x) => x.teamId === C().userTeamId);
    const you = mine ? '<span class="ev-you ' + (mine.placement <= 3 ? 'good' : '') + '">' + esc(tl('You finished {place} · {prize}', { place: ordinal(mine.placement), prize: money(mine.prize || 0) })) + '</span>'
      : (e.field || []).includes(C().userTeamId) ? '<span class="ev-you">' + esc(tl('Your club is in the field')) + '</span>' : '';
    const pool = (e.standings || []).reduce((a, x) => a + (x.prize || 0), 0);
    return '<div class="ev-meaning"><div class="ev-meaning-l"><div class="ev-where">' + esc((k ? tl('8 clubs · Tier A only') : tl('16 clubs · Tier A only')) + (pool ? ' · ' + tl('prize pool') + ' ' + money(pool) : '')) + '</div><div class="ev-feeds">' +
      esc(k ? tl('The 8 best Tier A clubs of last season open the year. Bo5 groups, Bo7 playoffs. Prize money only: no ranking points.') : tl("The top 16 Tier A clubs of this season's ranking. Bo5 groups, Bo7 playoffs. Prize money only: no ranking points.")) + '</div></div><div class="ev-meaning-r">' + you + '</div></div>';
  };
  // The Swiss stage is the first stage of its Open: until the Open has drawn its own groups, the Open's view shows it (same graphic as the group stage)
  const swissShown = (e) => e && e.kind === 'open' && !(e.groups || []).length && (e.stage === 'held' || e.stage === 'pending');
  const swDated = (e) => { const sw = e && e.kind === 'open' ? swissOf(e) : null; return sw && sw.startDate < e.startDate ? { ...e, startDate: sw.startDate } : e; };
  const swissOpen = () => (C().events || []).find((e) => swissShown(e) && swissOf(e) && (swissOf(e).sw || []).length) || null;
  const swissGfx = (open, sw) => {
    const me = C().userTeamId, rows = (g) => { const rec = g.sw.rec, seeds = g.sw.seeds, rank = seeds.slice().sort((a, b) => (rec[b].w - rec[a].w) || (rec[a].l - rec[b].l) || seeds.indexOf(a) - seeds.indexOf(b));
      return rank.map((id) => { const t = teamById(id), r = rec[id], idx = (sw.field || []).indexOf(id) + 1, st = r.w >= 3 ? 'q-up' : '';
        return '<div class="gfx-row ' + (id === me ? 'mine ' : '') + st + (r.l >= 3 ? ' out' : '') + '"><span class="gfx-tick">▸</span><span class="gfx-badge">' + (t ? crest(t, 'small') : '') + '</span><span class="gfx-name">' + esc(t ? t.name : '?') + '</span><span class="gfx-rec">' + r.w + '-' + r.l + '</span><span class="gfx-diff">' + (r.w >= 3 ? 'IN' : r.l >= 3 ? 'OUT' : '&mdash;') + '</span><span class="gfx-seed">' + esc(String(sw.region || '').toUpperCase() + (idx || '')) + '</span></div>'; }).join(''); };
    return '<div class="gfx gfx-groups" style="width:100%;max-width:100%;box-sizing:border-box"><div class="gfx-title">' + esc(tl('SWISS STAGE')) + '</div><div class="gfx-event">' + esc(open.name) + ' · ' + esc(tl('the top 8 of each group go through')) + '</div><div class="gfx-grid">' +
      sw.sw.map((g) => '<div class="gfx-group"><div class="gfx-grouphead"><span>' + esc(tl('GROUP')) + ' ' + g.key + '</span><span class="gfx-cols"><i>' + esc(tl('RECORD')) + '</i><i>' + esc(tl('STATUS')) + '</i><i>' + esc(tl('SEED')) + '</i></span></div>' + rows(g) + '</div>').join('') + '</div></div>';
  };
  // the full Standings window: same Swiss graphic instead of "the draw is not made yet", and the Swiss matches in Next fixtures
  // (.gfx fills its positioned parent, hence the sized wrapper in the window)
  if (typeof standGroupsTableHtml === 'function') { const oSG = standGroupsTableHtml; standGroupsTableHtml = function (e) { const sw = swissOf(e); return sw && swissShown(e) ? '<div style="position:relative;width:100%;height:720px">' + swissGfx(e, sw) + '</div>' : oSG.apply(this, arguments); }; } // eslint-disable-line no-global-assign
  if (typeof standFixturesHtml === 'function') {
    const oSF = standFixturesHtml;
    standFixturesHtml = function (e) { // eslint-disable-line no-global-assign
      const sw = e && swissShown(e) ? swissOf(e) : null;
      if (!sw) return oSF.apply(this, arguments);
      const slots = (C().fixtures || []).filter((f) => f.xevId === sw.id && (f.homeId === C().userTeamId || f.awayId === C().userTeamId)).map((f, i) => ({ id: 'E' + e.id + 'A-open' + (i + 1), stage: 'group', bestOf: f.bestOf, fixtureId: f.id, teamA: f.homeId, teamB: f.awayId }));
      return oSF.call(this, { ...e, slots });
    };
  }
  const oGroups = groupsArtHtml;
  groupsArtHtml = function (e) { // eslint-disable-line no-global-assign
    const swOpen = swissOf(e);
    if (swOpen && swissShown(e)) return swissGfx(e, swOpen); // the Swiss is the Open's first stage: same panel as its groups
    if (!isMj(e)) return oGroups.apply(this, arguments);
    if (!(e.groups || []).length) return '<div class="btier-empty">' + esc(tl('The draw is made two days before the start.')) + '</div>';
    return oGroups({ ...e, kind: 'bcup' }); // same group tables as the B-Tier Cups
  };
  if (typeof bracketArtHtml === 'function') {
    const oBr = bracketArtHtml;
    bracketArtHtml = function (e, a2) { // eslint-disable-line no-global-assign
      if (!isMj(e)) return oBr.apply(this, arguments);
      if (!(e.slots || []).length) return '<div class="btier-empty">' + esc(tl('The bracket is drawn two days before the start.')) + '</div>';
      if (e.kind === 'ewc') return oBr({ ...e, kind: 'bcup' }, a2); // top 8 single elimination, like a B-Tier Cup
      // Kick-Off Weekend: two semi-finals and a final
      const nm = (id) => { const t = id != null ? teamById(id) : null; return t ? '<span class="sf-team">' + crest(t, 'small') + '<span>' + esc(t.name) + '</span></span>' : '<span class="sf-team tbd"><span>?</span></span>'; };
      const row = (s, label) => {
        if (!s) return '';
        const f = s.fixtureId != null ? (C().fixtures || []).find((x) => x.id === s.fixtureId) : null;
        const score = f && f.played ? '<span class="sf-score">' + f.homeWins + '<i>&ndash;</i>' + f.awayWins + '</span>' : '<span class="sf-vs">' + esc(tl('vs')) + '</span>';
        return '<div class="sf-day">' + esc(tl(label)) + ' · Bo' + s.bestOf + '</div><div class="sf-row">' + nm(s.teamA) + score + nm(s.teamB) + '</div>';
      };
      const by = (k) => e.slots.find((s) => s.id.endsWith('P-' + k));
      return '<div class="sf-list">' + row(by('sf-1'), 'Semifinal 1') + row(by('sf-2'), 'Semifinal 2') + row(by('final'), 'Final') + '</div>';
    };
  }
  // Home (event layout) and the Standings card/window pick the running event from state.events only: let them see ours too
  const oLive = liveEvent;
  // an event view lasts one day longer than the event (the finished bracket stays on the Home the day after the final)
  const lingering = () => { const d = C().currentDate, e = lingering0(); return e ? Object.assign({}, e, { stage: 'playoffs' }) : null; }; // shown as the bracket, like a running playoff
  const lingering0 = () => { const d = C().currentDate; return (C().events || []).concat(mjEvents()).find((e) => e && e.stage === 'done' && !e.skipped && e.endDate && e.startDate <= d && d <= addDaysIso(e.endDate, 1) && !(e.swiss) && (e.groups || e.slots || []).length) || null; };
  liveEvent = function () { return oLive.apply(this, arguments) || swissOpen() || mjEvents().find(evLive) || lingering(); }; // eslint-disable-line no-global-assign
  const oComp = compOf; // match lists / next-match card name the competition from fixture.eventId
  compOf = function (f) { return oComp.apply(this, arguments) || (f && f.xevId != null ? mjAll().find((e) => e.id === f.xevId) || null : null); }; // eslint-disable-line no-global-assign
  const oStandEv = standEvent;
  standEvent = function () { return oStandEv.apply(this, arguments) || swissOpen() || mjEvents().find((e) => e.stage === 'groups' && (e.groups || []).length) || null; }; // eslint-disable-line no-global-assign
  const oNext = nextEvent;
  nextEvent = function () { // eslint-disable-line no-global-assign
    const a = oNext.apply(this, arguments), b = mjEvents().filter((e) => e.stage !== 'done' && e.endDate >= C().currentDate).sort(sortByDate)[0];
    return swDated(b && (!a || b.startDate < a.startDate) ? b : a);
  };
  // An Open with a Swiss stage (32 clubs) starts with the Swiss: its dates, its club count and its stage say so everywhere the Open is shown
  window.__uxOpenSwiss = { swissOf, swissShown, dated: (e) => swDated(e) };
  const oMeanOpen = eventMeaningHtml;
  eventMeaningHtml = function (e) { // eslint-disable-line no-global-assign
    const h = oMeanOpen.apply(this, arguments), sw = e && e.kind === 'open' ? swissOf(e) : null;
    if (!sw) return h;
    return h.replace(/16 clubs/, esc(tl('32 clubs'))).replace(/(<\/div>\s*<\/div>\s*<div class="ev-meaning-r">)/, ' ' + esc(tl('It starts with a Swiss stage: the 16 clubs that win 3 matches go through to the group stage.')) + '$1');
  };
  // the Swiss of any region's Open (the Season history shows other regions too), once it has run
  const swissFor = (openId, region) => ((C().uxMajors && C().uxMajors.events) || []).find((x) => x.swiss && x.openId === openId && x.region === region && (x.sw || []).length) || null;
  const swName = (id) => { const t = teamById(id); return esc(t ? t.name : tl('Unknown club')); };
  const swTables = (sw) => sw.sw.map((g) => { const rec = g.sw.rec, seeds = g.sw.seeds, rank = seeds.slice().sort((a, b) => (rec[b].w - rec[a].w) || (rec[a].l - rec[b].l) || seeds.indexOf(a) - seeds.indexOf(b));
    return '<section class="history-group"><h3>' + esc(tl('Swiss stage')) + ' · ' + esc(tl('Group {letter}', { letter: g.key })) + '</h3><table class="tbl"><thead><tr><th>' + esc(tl('Club')) + '</th><th>' + esc(tl('W')) + '</th><th>' + esc(tl('L')) + '</th><th>' + esc(tl('Status')) + '</th></tr></thead><tbody>' +
      rank.map((id) => '<tr' + (id === C().userTeamId ? ' class="me"' : '') + '><td>' + swName(id) + '</td><td>' + rec[id].w + '</td><td>' + rec[id].l + '</td><td>' + esc(rec[id].w >= 3 ? tl('Through') : rec[id].l >= 3 ? tl('Out') : '—') + '</td></tr>').join('') + '</tbody></table></section>'; }).join('');
  // Season history -> Brackets: the Swiss stage comes before the groups, and the clubs it knocked out close the standings
  if (typeof historyBracketsHtml === 'function') {
    const oHB = historyBracketsHtml;
    historyBracketsHtml = function () { // eslint-disable-line no-global-assign
      const h = oHB.apply(this, arguments);
      try {
        const e = historyEventNow(), rid = typeof historyRegion !== 'undefined' && historyRegion !== 'mine' ? historyRegion : C().userRegion, sw = e && e.kind === 'open' ? swissFor(e.id, rid) : null;
        if (!sw) return h;
        const out = (sw.standings || []).filter((x) => !x.through);
        const tail = out.length ? '<h2 class="history-section-title">' + esc(tl('Out in the Swiss stage')) + '</h2><table class="tbl"><thead><tr><th>' + esc(tl('Club')) + '</th><th>' + esc(tl('W')) + '</th><th>' + esc(tl('L')) + '</th></tr></thead><tbody>' +
          out.map((x) => '<tr' + (x.teamId === C().userTeamId ? ' class="me"' : '') + '><td>' + swName(x.teamId) + '</td><td>' + x.wins + '</td><td>' + x.losses + '</td></tr>').join('') + '</tbody></table>' : '';
        const first = '<h2 class="history-section-title">' + esc(tl('Swiss stage')) + '</h2><div class="history-groups">' + swTables(sw) + '</div>';
        const head = /<div class="history-event-head">[\s\S]*?<\/div>/;
        const dated = e.startDate && sw.startDate < e.startDate ? h.replace(fmtDateShort(e.startDate), fmtDateShort(sw.startDate)) : h; // the Open starts with its Swiss
        return (head.test(dated) ? dated.replace(head, (m) => m + first) : first + dated) + tail;
      } catch (x) { return h; }
    };
  }
  // Season -> Events panel: the Swiss stage above the group stage, and who it knocked out under the final standings
  let inPanel = false;
  const oPanelS = eventPanelHtml;
  eventPanelHtml = function (e) { inPanel = true; try { return oPanelS.call(this, swDated(e)); } finally { inPanel = false; } }; // eslint-disable-line no-global-assign
  const oGroupsS = groupsArtHtml;
  groupsArtHtml = function (e) { // eslint-disable-line no-global-assign
    const h = oGroupsS.apply(this, arguments), sw = inPanel && e && e.kind === 'open' && !swissShown(e) ? swissOf(e) : null;
    return sw && sw.stage === 'done' ? '<div style="position:relative;width:100%;height:720px;margin-bottom:14px">' + swissGfx(e, sw) + '</div>' + h : h;
  };
  const oResS = eventResultsHtml;
  eventResultsHtml = function (e) { // eslint-disable-line no-global-assign
    const h = oResS.apply(this, arguments), sw = inPanel && e && e.kind === 'open' ? swissOf(e) : null;
    if (!sw || sw.stage !== 'done') return h;
    const out = (sw.standings || []).filter((x) => !x.through);
    return h + (out.length ? '<div class="ev-results"><div class="ev-sechead">' + esc(tl('Out in the Swiss stage')) + '</div><table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + esc(tl('Club')) + '</th><th>' + esc(tl('Record')) + '</th></tr></thead><tbody>' +
      out.map((x, i) => '<tr class="' + (x.teamId === C().userTeamId ? 'me' : '') + '"><td class="pos">' + (x.band || 17 + i) + '</td><td class="l">' + swName(x.teamId) + '</td><td>' + x.wins + '-' + x.losses + '</td></tr>').join('') + '</tbody></table></div>' : '');
  };
  const oTabs = eventTabsHtml;
  eventTabsHtml = function (list) { return oTabs.apply(this, [(list || []).map(swDated)].concat([].slice.call(arguments, 1))); }; // eslint-disable-line no-global-assign
  const oListS = calEventList;
  calEventList = function () { return oListS.apply(this, arguments).map(swDated); }; // eslint-disable-line no-global-assign
  const oByIdS = calEventById;
  calEventById = function () { return swDated(oByIdS.apply(this, arguments)); }; // eslint-disable-line no-global-assign
  if (typeof eventsViewHtml === 'function') {
    const oEvents = eventsViewHtml;
    eventsViewHtml = function () { // eslint-disable-line no-global-assign
      const extra = mjEvents(), c = C();
      if (!extra.length || !(c.events || []).length) return oEvents.apply(this, arguments);
      const was = c.events; c.events = was.concat(extra).sort(sortByDate); // the game's own tab layout, fed with our events too
      try { return oEvents.apply(this, arguments); } finally { c.events = was; }
    };
  }

  // ---------- awards on profiles ----------
  const myPlayer = () => (C().players || []).find((p) => p.isUser) || null;
  const awardsOf = (id) => { const u = C().uxAwards || {}; return { mvp: (u.mvp || []).filter((m) => m.playerId === id).length, poty: (u.poty || []).filter((m) => m.playerId === id).length }; };
  const awardChips = (id) => { const a = awardsOf(id); return (a.mvp || a.poty) ? '<div class="statchips" style="justify-content:flex-start;margin:8px 0 4px"><div class="chip"><div class="v">' + a.mvp + '</div><div class="k">' + esc(tl('Tournament MVPs')) + '</div></div><div class="chip"><div class="v">' + a.poty + '</div><div class="k">' + esc(tl('Player of the Year')) + '</div></div></div>' : ''; };

  // the small Records tile prints statsViewHtml() and honoursViewHtml() back to back: leave that one alone, extend the full Honours screens
  let tileFlag = false;
  if (typeof statsViewHtml === 'function') { const oStats = statsViewHtml; statsViewHtml = function () { tileFlag = true; setTimeout(() => { tileFlag = false; }, 0); return oStats.apply(this, arguments); }; } // eslint-disable-line no-global-assign
  const oHon = honoursViewHtml;
  honoursViewHtml = function () { // eslint-disable-line no-global-assign
    const me = myPlayer();
    const tile = tileFlag; tileFlag = false;
    if (tile) return oHon.apply(this, arguments);
    const base = oHon.apply(this, arguments);
    // inside the Matches page the career card (matches-ui.js) has a Full profile button: the trophy room button goes next to it, the chips above it
    const btn = /<div style="margin-top:14px">(<button class="btn ghost sm" data-action="player-detail"[^>]*>[^<]*<[/]button>)<[/]div>/;
    if (me && btn.test(base)) return base.replace(btn, (m, b) => awardChips(me.id) + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' + b + '<button type="button" class="btn ghost sm" data-action="ux-awards-open">' + esc(tl('Trophy room')) + ' &rarr;</button></div>');
    return base + (me ? '<div class="stats-group">' + awardChips(me.id) +
      '<div style="margin-top:12px"><button type="button" class="ux-tt-btn" data-action="ux-awards-open">' + esc(tl('Trophy room: all MVPs and Players of the Year')) + ' &rarr;</button></div></div>' : '');
  };
  const oModal = playerModalHtml;
  playerModalHtml = function (p) { // eslint-disable-line no-global-assign
    const html = oModal.apply(this, arguments);
    if (!p) return html;
    const extra = awardChips(p.id);
    return extra ? html.replace('<div class="btnrow" style="margin-top:16px;">', () => extra + '<div class="btnrow" style="margin-top:16px;">') : html;
  };

  // ---------- trophy room ----------
  let awTab = 'mvp';
  function trophyHtml() {
    const u = C().uxAwards || { mvp: [], poty: [] }, me = C().userTeamId;
    const tabs = '<div class="ptabs">' + [['mvp', 'Tournament MVPs'], ['poty', 'Player of the Year']].map(([k, n]) => '<button type="button" class="ptab' + (awTab === k ? ' active' : '') + '" data-action="ux-awards-tab" data-tab="' + k + '">' + esc(tl(n)) + '</button>').join('') + '</div>';
    let body;
    if (awTab === 'poty') {
      const rows = (u.poty || []).slice().reverse().map((x) => '<tr' + (x.teamId === me ? ' class="me"' : '') + '><td class="l">' + esc(tl('Season {n}', { n: x.season })) + '</td><td class="l"><b>' + esc(x.name) + '</b></td><td class="l">' + esc(x.teamName) + '</td><td>' + x.score + '</td></tr>').join('');
      body = rows ? '<table class="tbl roomy"><thead><tr><th class="l">' + esc(tl('Season')) + '</th><th class="l">' + esc(tl('Player')) + '</th><th class="l">' + esc(tl('Club')) + '</th><th>' + esc(tl('Score')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="history-empty">' + esc(tl('Awarded when each season ends. Nobody yet.')) + '</p>';
    } else {
      const rows = (u.mvp || []).slice().reverse().map((x) => '<tr' + (x.teamId === me ? ' class="me"' : '') + '><td class="l">' + esc(tl('Season {n}', { n: x.season })) + '</td><td class="l">' + esc(x.event) + (x.region ? ' <small style="opacity:.7">· ' + esc(x.region) + '</small>' : '') + '</td><td class="l"><b>' + esc(x.name) + '</b>' + (x.modelled ? ' <span class="ux-tag" title="' + esc(tl('Simulated event: chosen from the placings and ratings')) + '">' + esc(tl('simulated')) + '</span>' : '') + '</td><td class="l">' + esc(x.teamName) + '</td></tr>').join('');
      body = rows ? '<table class="tbl roomy"><thead><tr><th class="l">' + esc(tl('Season')) + '</th><th class="l">' + esc(tl('Tournament')) + '</th><th class="l">' + esc(tl('MVP')) + '</th><th class="l">' + esc(tl('Club')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="history-empty">' + esc(tl('A Tournament MVP is crowned when each event ends.')) + '</p>';
    }
    return '<div class="history-page"><header class="history-header"><div><p>' + esc(tl('Tournament MVPs are picked from playoff teams by match stats; Player of the Year from the whole season.')) + '</p></div></header>' + tabs + '<div class="history-body" tabindex="0">' + body + '</div></div>';
  }
  if (typeof BIG_LISTS === 'object') BIG_LISTS.uxawards = { title: typeof tm === 'function' ? tm('Trophy room') : 'Trophy room', render: trophyHtml };

  // ---------- clicks ----------
  document.addEventListener('click', async (e) => {
    const t = e.target && e.target.closest && e.target.closest('[data-action="ux-awards-open"],[data-action="ux-awards-tab"]'); if (!t) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const act = t.dataset.action;
    if (act === 'ux-awards-open') { try { closeModal && closeModal(); } catch (x) { /* none */ } bigList = 'uxawards'; officeOpen = false; if (typeof standWindowOpen !== 'undefined') standWindowOpen = false; windowJustOpened = true; render(); return; }
    if (act === 'ux-awards-tab') { awTab = t.dataset.tab; render(); return; }
  }, true);

  try { render(); } catch (e) { /* no career open yet */ }
})();
