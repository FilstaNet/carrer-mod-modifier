// Late game phase 3 UI (LateGamePlan.md 6.0): the "Hosting" sub-tab of the Club hub (plan / run your own cup series) and the circuit table as an extra tab
// next to Tier A / Tier B in Standings (tier-ui.js asks window.__lateCircuit()). Words come from window.__lateTexts.host (src/ui/late-texts.js).
// State is read straight from the career state (C().late.host); actions go through placeBet 'uxl:<json>' (late-host.js), dates come from 'uxc' windows.
(function () {
  'use strict';
  if (window.__lateHostUI) return;
  if (typeof showToast !== 'function' || typeof render !== 'function' || typeof C !== 'function' || !window.__lateTexts) return;
  const st = document.createElement('style');
  st.textContent = '.late-seg{display:flex;gap:0}.late-seg button{flex:1;padding:8px 10px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}.late-seg button:first-child{border-radius:6px 0 0 6px}.late-seg button:last-child{border-radius:0 6px 6px 0;border-left:0}.late-seg button.on{background:var(--accent,var(--red));border-color:var(--accent,var(--red));color:#fff;font-weight:700}.late-bidrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}.late-money{display:inline-flex;align-items:center;gap:4px;padding:0 10px;height:38px;border-radius:6px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:color-mix(in srgb,var(--text) 6%,transparent)}.late-money input{width:110px;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;outline:0;-moz-appearance:textfield}.late-money input::-webkit-outer-spin-button,.late-money input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.late-chip{height:38px;padding:0 12px;border-radius:6px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}.late-chip:hover{border-color:var(--accent,var(--red))}.late-datebtn{text-align:left;justify-content:flex-start}.late-pick-ok{cursor:pointer;box-shadow:inset 0 0 0 2px #1fa05a}.late-pick-ok:hover{background:color-mix(in srgb,#1fa05a 18%,transparent)}.late-pick-no{opacity:.5}.late-pick-sel{background:color-mix(in srgb,var(--accent,var(--red)) 30%,transparent)}.late-form{display:grid;gap:10px}.late-form label{display:grid;gap:4px;font-size:var(--f-small)}.late-form input,.late-form select{padding:6px 8px;border-radius:6px;border:1px solid color-mix(in srgb,var(--text) 20%,transparent);background:transparent;color:inherit;font:inherit}';
  document.head.appendChild(st);
  const T = window.__lateTexts.host || {};
  const f = (str, v) => String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const bold = (str) => esc(str).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const sec = (title, body) => '<div class="ux-cs"><h4>' + esc(title) + '</h4>' + body + '</div>';
  const how = (title, lines) => '<div class="ux-how"><div class="ux-how-h">' + esc(title) + '</div><ul>' + lines.map((l) => '<li>' + bold(l) + '</li>').join('') + '</ul></div>';
  const act = (o) => window.hub.placeBet({ kind: 'uxl:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  const me = () => teamById(C().userTeamId);
  const money = (n) => fmtMoney(Math.round(n));
  const late = () => C().late || null;
  const circuits = () => ((late() && late().host && late().host.circuits) || []);
  const current = () => { const l = circuits().filter((c) => c.stage !== 'cancelled'); return l.length ? l[l.length - 1] : null; };
  const isTierB = () => { const t = me(); return !!t && /_b$/.test(t.region || ''); };
  const arenaLevel = () => { const l = late(); const c = l && l.clubs && l.clubs[C().userTeamId]; return (c && c.build && c.build.arena) | 0; };

  let wins = null, busyIv = [], myDays = new Set(), winsKey = '', loading = false, busy = false;
  let off = null, offKey = '', offLoading = false; const bidAmt = {};
  const O = T.official || {};
  const form = { name: '', n: 3, stops: [], finals: '', prize: '', finalsPrize: '' };
  const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  async function loadWindows() {
    if (loading) return; loading = true; const k = C().currentDate + '|' + JSON.stringify(circuits().map((c) => c.stage));
    try { const r = await window.hub.placeBet({ kind: 'uxc:' + JSON.stringify({ a: 'windows', len: 3, count: 400, all: true }), ref: 0, teamId: 0, stake: 0 }); wins = r && r.windows ? r.windows : []; busyIv = (r && r.busy) || []; myDays = new Set((r && r.mine) || []); winsKey = k; } catch (e) { wins = []; } finally { loading = false; }
    render();
  }
  async function send(req, okText) {
    if (busy) return; busy = true;
    try { const r = await act(req); if (r && r.ok) { S = r; wins = null; if (okText) showToast(okText); } else showToast((r && r.error) || 'That is not possible.'); } finally { busy = false; }
    render();
  }

  const statusOf = (s) => (T.status || {})[s] || s;
  const teamName = (id) => { const t = teamById(id); return t ? t.name : '?'; };

  // points table with one column per stop; the user's club is highlighted
  function tableHtml(c, limit) {
    const ids = Object.keys(c.points || {}).map(Number); if (!ids.includes(C().userTeamId)) ids.push(C().userTeamId);
    const rows = ids.map((id) => ({ id, p: c.points[id] || 0 })).sort((a, b) => b.p - a.p || a.id - b.id).slice(0, limit || 60);
    if (!rows.some((r) => r.p)) return '<div class="sb-empty">' + esc(T.noPoints) + '</div>';
    const cell = (s, id) => { const r = (s.result || []).find((x) => x.teamId === id); return r ? '<td>' + r.points + '</td>' : '<td>&ndash;</td>'; };
    return '<table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + esc(tl('Club')) + '</th>' + c.stops.map((s) => '<th>S' + s.no + '</th>').join('') + '<th>' + esc(T.pointsTitle) + '</th></tr></thead><tbody>' +
      rows.map((r, i) => { const t = teamById(r.id); return '<tr class="clickrow ' + (r.id === C().userTeamId ? 'me' : '') + '"' + (t ? ' data-action="club-detail" data-team="' + t.id + '"' : '') + '><td class="pos">' + (i + 1) + '</td><td class="l"><div class="teamcell">' + (t ? crest(t, 'small') + ' ' : '') + '<span class="tname">' + esc(teamName(r.id)) + '</span></div></td>' + c.stops.map((s) => cell(s, r.id)).join('') + '<td><b>' + r.p + '</b></td></tr>'; }).join('') + '</tbody></table>';
  }
  function scheduleHtml(c) {
    const row = (label, x) => '<div class="late-q"><b>' + esc(label) + '</b> · ' + esc(x.start) + ' <span class="ux-cm">' + esc(statusOf(x.status)) + '</span></div>';
    return c.stops.map((s) => row('Stop ' + s.no, s)).join('') + row(T.fFinals, c.finals);
  }

  function runningHtml(c) {
    const started = c.stops.some((s) => s.status === 'live' || s.status === 'done') || c.finals.status !== 'planned';
    const champ = c.champion != null ? '<div class="ux-cm">' + esc(f(T.champion, { n: teamName(c.champion) })) + '</div>' : '';
    return [sec(T.runTitle + ' · ' + c.name, scheduleHtml(c) + '<div class="ux-cm">' + esc(f(T.tvLine, { m: money(c.tv || 0) })) + '</div>' + champ +
      (c.stage !== 'done' && !started ? '<div class="btnrow"><button type="button" class="btn ghost" data-action="lhost-cancel" data-id="' + c.id + '">' + esc(T.cancel) + '</button></div>' : '')),
    sec(T.pointsTitle, tableHtml(c, 20))];
  }

  function formHtml() {
    if (wins == null) { setTimeout(loadWindows, 0); return '<div class="ux-cm">' + esc(tl('Loading…')) + '</div>'; }
    const t = me(), b = t.budget || 0, lo = Math.max(40000, Math.round(b * 0.02)), hi = Math.round(b * 0.3), today = C().currentDate;
    const dateBtn = (field, i, cur, from) => '<button type="button" class="btn ghost late-datebtn" data-action="lhost-pick" data-field="' + field + '" data-i="' + i + '" data-from="' + from + '"' + (from === '9999' ? ' disabled' : '') + '>' + esc(cur || T.fPick) + '</button>';
    const afterStop = (i) => (i === 0 ? addD(today, 21) : form.stops[i - 1] ? addD(form.stops[i - 1], 7) : '9999');
    let h = '<div class="late-form"><label>' + esc(T.fName) + '<input type="text" maxlength="40" data-late-host="name" value="' + esc(form.name) + '" placeholder="' + esc(t.name) + ' Circuit"></label>' +
      '<label>' + esc(T.fStops) + '<div class="late-seg"><button type="button" data-action="lhost-n" data-n="3" class="' + (form.n === 3 ? 'on' : '') + '">' + esc(T.stops3) + '</button><button type="button" data-action="lhost-n" data-n="4" class="' + (form.n === 4 ? 'on' : '') + '">' + esc(T.stops4) + '</button></div></label>';
    for (let i = 0; i < form.n; i++) h += '<label>' + esc(f(T.fStopDate, { n: i + 1 })) + dateBtn('stop', i, form.stops[i], afterStop(i)) + '</label>';
    const last = form.stops[form.n - 1];
    h += '<label>' + esc(T.fFinals) + dateBtn('finals', 0, form.finals, last ? addD(last, 21) : '9999') + '</label>' +
      '<label>' + esc(T.fPrize) + ' <span class="ux-cm">' + esc(f(T.fRange, { lo: money(lo), hi: money(hi) })) + '</span><input type="number" min="0" step="5000" data-late-host="prize" value="' + esc(form.prize) + '"></label>' +
      '<label>' + esc(T.fFinalsPrize) + '<input type="number" min="0" step="5000" data-late-host="finalsPrize" value="' + esc(form.finalsPrize) + '"></label>' +
      '<button type="button" class="btn" data-action="lhost-create">' + esc(T.create) + '</button></div>';
    return h;
  }

  // ---- date picker: the game's own calendar look (.cb-grid, like Season -> Calendar) with every event shown; only valid start days can be clicked ----
  let pick = null; // { field: 'stop' | 'finals', i, from, month: 'YYYY-MM' }
  const pad = (n) => String(n).padStart(2, '0');
  const current0 = () => (pick.field === 'finals' ? form.finals : form.stops[pick.i]);
  function pickHtml() {
    const [y, m] = pick.month.split('-').map(Number), first = new Date(y, m - 1, 1, 12), dim = new Date(y, m, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const ok = new Set((wins || []).filter((d) => d >= pick.from)), map = typeof eventDayMap === 'function' ? eventDayMap() : {}, mine = new Set();
    for (const c of circuits()) if (c.stage !== 'cancelled') for (const x of c.stops.concat([c.finals])) if (x.status === 'planned') for (let k = 0; k < 3; k++) mine.add(addD(x.start, k));
    for (const s of form.stops.slice(0, form.n).concat([form.finals])) if (s) for (let k = 0; k < 3; k++) mine.add(addD(s, k));
    const near = (day) => busyIv.some(([a, b, k]) => { const mg = k === 'small' ? 1 : 4; return day >= addD(a, -mg) && day <= addD(b, mg); });
    const inIv = (day) => busyIv.some(([a, b]) => day >= a && day <= b);
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => '<div class="cb-dow">' + d + '</div>').join('');
    for (let i = 0; i < lead; i++) cells += '<div class="cb-cell out"></div>';
    for (let d = 1; d <= dim; d++) {
      const day = y + '-' + pad(m) + '-' + pad(d), e = map[day], good = ok.has(day), isMine = mine.has(day);
      const other = !e && !isMine && inIv(day), style = e ? ' style="--ec:' + (typeof calColour === 'function' ? calColour(e) : 'var(--gold,#e6a817)') + '"' : isMine ? ' style="--ec:var(--accent,var(--red))"' : other ? ' style="--ec:#8a8f98"' : '';
      const why = e ? e.name : isMine ? T.pickMine : good ? T.pickFree : other ? T.pickOther : myDays.has(day) ? T.pickMatch : near(day) ? T.pickNear : day < pick.from ? T.pickBusy : T.pickBusy;
      cells += '<div class="cb-cell' + (e || isMine || other ? ' ev' : '') + (day === C().currentDate ? ' today' : '') + (good ? ' late-pick-ok' : ' late-pick-no') + (current0() === day ? ' late-pick-sel' : '') + '"' + style +
        (good ? ' data-action="lhost-day" data-day="' + day + '" role="button" tabindex="0"' : '') + ' title="' + esc(why) + '"><span class="cb-num">' + d + '</span></div>';
    }
    const ms = y + '-' + pad(m), evs = (typeof calEventList === 'function' ? calEventList() : []).filter((e) => e.startDate && e.startDate.slice(0, 7) <= ms && (e.endDate || e.startDate).slice(0, 7) >= ms);
    const legend = evs.map((e) => '<div class="ux-cm"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:' + (typeof calColour === 'function' ? calColour(e) : '#e6a817') + '"></span>' + esc(e.name) + ' · ' + esc(e.startDate) + (e.endDate && e.endDate !== e.startDate ? ' – ' + esc(e.endDate) : '') + '</div>').join('');
    return '<div class="modal" style="max-width:680px"><div class="modal-h">' + esc(T.pickTitle) + '</div><div class="modal-b"><div class="cb-head"><button type="button" class="cb-nav" data-action="lhost-month" data-d="-1">&#8249;</button><div class="cb-month">' + esc(monthName(m - 1)) + ' ' + y + '</div><button type="button" class="cb-nav" data-action="lhost-month" data-d="1">&#8250;</button></div>' +
      '<div class="cb-grid">' + cells + '</div><div class="ux-cm" style="margin:8px 0">' + esc(T.pickHelp) + '</div>' + legend + '<div class="btnrow"><button type="button" class="btn ghost" data-action="close-modal">' + esc(T.pickClose) + '</button></div></div></div>';
  }
  function openPicker(el) {
    const cur = el.dataset.field === 'finals' ? form.finals : form.stops[Number(el.dataset.i)], from = el.dataset.from;
    const start = cur || (wins || []).find((d) => d >= from) || C().currentDate;
    pick = { field: el.dataset.field, i: Number(el.dataset.i), from, month: start.slice(0, 7) };
    showModal(pickHtml());
  }

  // ---- official events: bids (late-bids.js) ----
  const bidsList = () => ((late() && late().bids && late().bids.list) || []);
  const bidKey = () => C().currentDate + '|' + JSON.stringify(bidsList().map((b) => b.status));
  async function loadOfficial() {
    if (offLoading) return; offLoading = true; const k = bidKey();
    try { const r = await act({ a: 'official' }); off = r && r.targets ? r : null; offKey = k; } catch (e) { off = null; } finally { offLoading = false; }
    render();
  }
  function officialHtml() {
    if (arenaLevel() < 3) return sec(O.title, how(O.title, (O.lockedLines || []).map((x) => f(x, { n: arenaLevel() }))));
    if (bidKey() !== offKey && !offLoading) setTimeout(loadOfficial, 0);
    if (!off) return sec(O.title, '<div class="ux-cm">' + esc(tl('Loading…')) + '</div>');
    const st = (s, n) => f((O.status || {})[s] || s, { n });
    const rows = off.targets.map((t) => {
      const mine = bidsList().find((b) => b.key === t.key);
      let h = '<div class="late-q"><b>' + esc(t.name) + '</b> · ' + esc(t.start) + ' <span class="ux-cm">' + esc(st(mine ? mine.status : t.status, t.status === 'later' ? t.daysTo - off.win.open : 0)) + '</span>';
      if (mine && mine.status === 'placed') h += '<div class="ux-cm">' + esc(f(O.yourBid, { m: money(mine.amount) })) + '</div><div class="btnrow"><button type="button" class="btn ghost" data-action="lhost-unbid" data-key="' + t.key + '">' + esc(O.withdraw) + '</button></div>';
      else if (!mine && t.status === 'open' && !off.hosting) {
        if (bidAmt[t.key] == null) bidAmt[t.key] = t.min;
        h += '<div class="ux-cm">' + esc(f(O.range, { lo: money(t.min), hi: money(t.max) })) + ' · ' + esc(f(O.odds, { a: t.oddsMin, b: t.oddsMax })) + '</div>' +
          '<div class="late-bidrow"><button type="button" class="late-chip" data-action="lhost-bidset" data-key="' + t.key + '" data-v="' + t.min + '">' + esc(O.min) + '</button><span class="late-money">$<input type="number" step="10000" min="' + t.min + '" max="' + t.max + '" value="' + bidAmt[t.key] + '" data-lhost-bid="' + t.key + '"></span><button type="button" class="late-chip" data-action="lhost-bidset" data-key="' + t.key + '" data-v="' + t.max + '">' + esc(O.max) + '</button><button type="button" class="btn primary" data-action="lhost-bid" data-key="' + t.key + '">' + esc(O.bid) + '</button></div>';
      }
      return h + '</div>';
    }).join('');
    const past = bidsList().filter((b) => b.status !== 'placed').slice(-6).reverse().map((b) => '<div class="late-q"><b>' + esc(b.name) + '</b> <span class="ux-cm">' + esc(st(b.status, 0)) + (b.rivals && b.rivals.length ? ' · ' + esc(f(O.rivals, { s: b.score, r: b.rivals[0].name + ' ' + b.rivals[0].score })) : '') + '</span></div>').join('');
    return sec(O.title, how(O.title, (O.intro || []).map((x) => f(x, { open: off.win.open, close: off.win.close }))) + (off.hosting ? '<div class="late-warn" style="border-left-color:#1fa05a">' + esc(f(O.hosting, { name: (off.targets.find((t) => t.key === off.hosting) || {}).name || '' })) + '</div>' : '') + (rows || '<div class="ux-cm">' + esc(O.none) + '</div>')) + (past ? sec(O.pastTitle, past) : '');
  }

  window.__lateHostUI = {
    tab: T.tab || 'Hosting',
    // [left column, right column] of the Hosting sub-tab
    html() {
      const l = late();
      if (!me()) return [[], []];
      if (isTierB() || !l || !l.unlocked) return [[sec(T.tab, how(T.lockedTitle, T.lockedLines))], []];
      if (arenaLevel() < 2 && !current()) return [[sec(T.tab, how(T.arenaTitle, T.arenaLines.map((x) => f(x, { n: arenaLevel() }))))], []];
      const c = current(), open = c && (c.stage === 'planned' || c.stage === 'running');
      const left = [sec(T.tab, how(T.introTitle, T.intro)), officialHtml()];
      if (c) return [left, runningHtml(c)];
      return [left, [sec(T.formTitle, formHtml())]];
    },
  };

  // Standings tab (tier-ui.js): the latest circuit that was not cancelled
  // While a stop (or the Finals) runs, and the day after, the tab opens by itself with two views: the points table and the bracket of that stop.
  const invOf = (id) => (((C().uxClub || {}).inv) || []).find((v) => v.id === id) || null;
  const stopsOf = (c) => c.stops.map((s, i) => ({ x: s, label: 'Stop ' + (i + 1) })).concat([{ x: c.finals, label: T.fFinals || 'Finals' }]);
  const liveStop = (c) => { const d = C().currentDate; return stopsOf(c).map((o) => ({ ...o, inv: o.x.invId != null ? invOf(o.x.invId) : null })).find((o) => o.inv && (o.inv.stage === 'live' || (o.inv.stage === 'done' && o.inv.start <= d && d <= addD(o.inv.start, (o.inv.size === 16 ? 3 : 2) + 1)))) || null; };
  window.__lateCircuitInv = (id) => { const c = current(); return !!c && stopsOf(c).some((o) => o.x.invId === id); };
  let cview = 'table';
  const CVIEWS = [['table', 'Standings'], ['bracket', 'Bracket']];
  const scroll = (h) => '<div class="ux-cscroll">' + h + '</div>';
  window.__lateCircuit = () => {
    const c = current(); if (!c || isTierB()) return null;
    const lv = liveStop(c), br = lv && cview === 'bracket' && window.__uxInvBracket ? window.__uxInvBracket(lv.inv.id) : '';
    const html = () => (br || scroll(tableHtml(c, 0)));
    return { key: 'circuit' + c.id, live: lv ? 'circuit' + c.id + ':' + lv.inv.id : null, label: T.standTab || 'Circuit', name: lv ? c.name + ' · ' + lv.label : c.name, body: html, card: html, fixtures: () => scheduleHtml(c),
      tabs: lv ? () => panelTabsHtml(CVIEWS, cview, 'lhost-cview', 'data-view') : undefined,
      pick: lv ? () => CVIEWS.map((v) => '<button class="tb-item' + (v[0] === cview ? ' on' : '') + '" data-action="lhost-cview" data-view="' + v[0] + '"><span class="tb-name">' + esc(tl(v[1])) + '</span></button>').join('') : undefined };
  };
  st.textContent += '.stand-clip:has(.ux-cscroll){overflow-y:auto!important;scrollbar-width:thin}.teamcell{display:flex;align-items:center;gap:8px}.tbl tr.clickrow{cursor:pointer;transition:background .15s}.tbl tr.clickrow:hover .teamcell{transform:translateX(3px)}.teamcell{transition:transform .15s}';
  document.addEventListener('click', (ev0) => {
    const el = ev0.target.closest && ev0.target.closest('[data-action="lhost-cview"]'); if (!el) return;
    ev0.stopImmediatePropagation(); ev0.preventDefault(); cview = el.dataset.view;
    if (typeof standWindowOpen !== 'undefined' && standWindowOpen && typeof renderWindows === 'function') renderWindows(); else render();
  }, true);

  document.addEventListener('input', (e) => { const el = e.target; if (el && el.dataset && el.dataset.lhostBid) { bidAmt[el.dataset.lhostBid] = Number(el.value); return; } if (!el || !el.dataset || !el.dataset.lateHost) return; const k = el.dataset.lateHost; if (k === 'name' || k === 'prize' || k === 'finalsPrize') form[k] = el.value; });
  document.addEventListener('change', (e) => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.lateHost) return;
    const k = el.dataset.lateHost;
    if (k === 'n') { form.n = Number(el.value) === 4 ? 4 : 3; form.stops.length = form.n; render(); }
    else if (k === 'stop') { form.stops[Number(el.dataset.i)] = el.value; for (let j = Number(el.dataset.i) + 1; j < form.stops.length; j++) form.stops[j] = ''; form.finals = ''; render(); }
    else if (k === 'finals') { form.finals = el.value; }
  });
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action^="lhost-"]'); if (!a) return;
    e.stopImmediatePropagation();
    if (a.dataset.action === 'lhost-n') { form.n = Number(a.dataset.n) === 4 ? 4 : 3; form.stops.length = form.n; form.finals = ''; return void render(); }
    if (a.dataset.action === 'lhost-bidset') { bidAmt[a.dataset.key] = Number(a.dataset.v); return void render(); }
    if (a.dataset.action === 'lhost-bid') return void send({ a: 'bid', key: a.dataset.key, amount: bidAmt[a.dataset.key] }, O.placedOk);
    if (a.dataset.action === 'lhost-unbid') return void send({ a: 'bid_withdraw', key: a.dataset.key }, O.withdrawn);
    if (a.dataset.action === 'lhost-pick') return void openPicker(a);
    if (a.dataset.action === 'lhost-month' && pick) { const [y, m] = pick.month.split('-').map(Number), n = new Date(y, m - 1 + Number(a.dataset.d), 1, 12); pick.month = n.getFullYear() + '-' + pad(n.getMonth() + 1); return void showModal(pickHtml()); }
    if (a.dataset.action === 'lhost-day' && pick) {
      if (pick.field === 'finals') form.finals = a.dataset.day; else { form.stops[pick.i] = a.dataset.day; for (let j = pick.i + 1; j < form.stops.length; j++) form.stops[j] = ''; form.finals = ''; }
      pick = null; closeModal(); return void render();
    }
    if (a.dataset.action === 'lhost-create') return void send({ a: 'circuit', name: form.name, stops: form.stops.slice(0, form.n), finalsStart: form.finals, prize: Number(form.prize), finalsPrize: Number(form.finalsPrize) }, T.creating);
    if (a.dataset.action === 'lhost-cancel') return void send({ a: 'circuit_cancel', id: Number(a.dataset.id) }, T.cancelled);
  }, true);
})();
