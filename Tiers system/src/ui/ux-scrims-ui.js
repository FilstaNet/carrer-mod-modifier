// Scrims (renderer): a Scrims tile under the Notifications panel on Home, and the Scrims window (Create a Scrim / Scrim History).
// All rules live in src/engine/ux-scrims.js; this file builds the screens and sends actions through the place-bet channel (kind 'uxs:<json>').
// Home: the tile is not added while a live event owns the Home layout (event-on), so a scrim never takes over the News panel.
(function () {
  'use strict';
  if (window.__uxScrimsUI) return;
  if (typeof homeHtml !== 'function' || typeof tileHtml !== 'function' || typeof notificationsCardHtml !== 'function' || typeof showModal !== 'function' || typeof C !== 'function') return;
  window.__uxScrimsUI = true;

  const st = document.createElement('style');
  st.textContent =
    // the left cell of the Home pair: Notifications is trimmed from the bottom so the tile (same height as Training) fits under it
    '.home-pair>.sc-col{display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0}' +
    '.sc-col>.card{flex:1 1 0;min-height:120px;overflow:hidden}.sc-col>.card>.card-b{overflow:auto;min-height:0}' +
    '.sc-col>.tile{flex:none;min-height:clamp(150px,15vh,230px)}' +
    '.modal.ux-scr-win{position:relative;width:min(96vw,860px);max-width:none;max-height:92vh;display:flex;flex-direction:column}' +
    '.ux-scr-win .modal-b{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px}.ux-scr-x{position:absolute;top:8px;right:8px;width:30px;height:30px;padding:0;line-height:1;z-index:6}' +
    '.ux-scr-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}@media (max-width:760px){.ux-scr-grid{grid-template-columns:minmax(0,1fr)}}' +
    '.ux-scr-sec{background:var(--panel-2);border-radius:var(--r-sm);padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}' +
    '.ux-scr-h{font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red,#e0334c);font-size:var(--f-label,12px)}' +
    '.ux-scr-opps{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto}' +
    '.ux-scr-opp{display:flex;align-items:center;gap:10px;padding:6px 8px;border:0;border-left:3px solid transparent;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:3px}' +
    '.ux-scr-opp:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}.ux-scr-opp.on{border-left-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 12%,transparent)}.ux-scr-opp b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ux-scr-opp small{opacity:.7}' +
    '.ux-scr-chips{display:flex;gap:6px;flex-wrap:wrap}.ux-scr-chip{border:1px solid var(--rule);background:transparent;color:inherit;font:inherit;font-weight:700;padding:6px 12px;cursor:pointer;border-radius:6px}' +
    '.ux-scr-chip.on{background:var(--red);border-color:var(--red);color:#fff}.ux-scr-chip:hover:not(.on){background:color-mix(in srgb,var(--text) 10%,transparent)}' +
    '.ux-scr-msg{min-height:1.3em;font-weight:700}.ux-scr-msg.bad{color:#d6293f}.ux-scr-msg.good{color:var(--green,#3fb950)}.ux-scr-dim{color:var(--text-dim);font-size:var(--f-small)}' +
    '.ux-scr-row{display:grid;grid-template-columns:96px minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:8px 10px;background:var(--panel-2);border-radius:var(--r-sm);border:0;color:inherit;font:inherit;text-align:left;width:100%}' +
    'button.ux-scr-row{cursor:pointer}button.ux-scr-row:hover{background:color-mix(in srgb,var(--text) 10%,var(--panel-2))}' +
    '.ux-scr-team{display:flex;align-items:center;gap:8px;min-width:0;font-weight:700}.ux-scr-team span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ux-scr-score{font-weight:800;min-width:64px;text-align:right}.ux-scr-score.w{color:var(--green,#3fb950)}.ux-scr-score.l{color:#d6293f}.ux-scr-pill{font-size:var(--f-micro,11px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.75}' +
    '.ux-scr-list{display:flex;flex-direction:column;gap:6px}.ux-scr-empty{padding:28px 12px;text-align:center;color:var(--text-dim)}.ux-scr-book{align-self:flex-start}';
  document.head.appendChild(st);

  const hubAct = (o) => window.hub.placeBet({ kind: 'uxs:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  const mine = () => { try { const c = C(); return c && c.userTeamId != null && !(typeof isPlayerMode === 'function' && isPlayerMode()) ? c : null; } catch (e) { return null; } };
  const me = () => teamById(C().userTeamId);
  const data = () => C().uxScrims || { list: [], history: [] };
  const FMTS = ['3v3', '2v2', '1v1'], BOS = [1, 3, 5, 7], WEEKS = [1, 2, 3], MAX_MONTH = 5;
  const form = { oppId: null, fmt: '3v3', bo: 3, weeks: 1 };
  let tab = 'create', msg = null;

  const top3 = (t) => { const r = (C().players || []).filter((p) => p.teamId === t.id && !p.retired).map((p) => p.rating).sort((a, b) => b - a).slice(0, 3); return r.length ? Math.round(r.reduce((x, y) => x + y, 0) / r.length) : 0; };
  const opponents = () => { const t = me(); return (C().teams || []).filter((x) => !x.nation && x.region === t.region && x.id !== t.id).sort((a, b) => top3(b) - top3(a) || (a.name < b.name ? -1 : 1)); };
  const scheduled = () => data().list.filter((x) => x.status === 'scheduled').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const monthCounts = () => { const m = {}; data().list.filter((x) => x.status === 'scheduled' || x.status === 'done').forEach((x) => { const k = x.date.slice(0, 7); m[k] = (m[k] || 0) + 1; }); return m; };
  const dateOf = (d) => (typeof fmtDate === 'function' ? fmtDate(d) : d);
  const name = (id) => { const t = teamById(id); return t ? t.name : '?'; };
  const crestOf = (id) => { const t = teamById(id); return t && typeof crest === 'function' ? crest(t, 'small') : ''; };

  // ---------- Home tile ----------
  const tile = () => {
    const s = scheduled(), n = s[0];
    return tileHtml({ title: tl('Scrims'), desc: n ? tl('{n} booked · next {date} vs {club}', { n: s.length, date: dateOf(n.date), club: esc(name(n.oppId)) }) : tl('Book a friendly series'), icon: '&#9876;', action: 'ux-scrims-open', cls: 'tall' });
  };
  const oHome = homeHtml;
  homeHtml = function () { // eslint-disable-line no-global-assign
    const h = oHome.apply(this, arguments);
    try {
      if (!mine() || h.indexOf('event-on') >= 0) return h; // a live event owns the Home layout: no tile, no takeover
      const n = notificationsCardHtml();
      if (!n || h.indexOf(n) < 0) return h;
      return h.replace(n, () => '<div class="sc-col">' + n + tile() + '</div>');
    } catch (e) { return h; }
  };

  // A 2v2 / 1v1 scrim is played with the smaller squad, so the match card ("Play" or "Watch") and the preview must read that squad, not the 3v3 starters.
  // The game's helpers take no fixture, so the card / preview builders record which fixture they are drawing.
  let curFx = null;
  // the user's squad for the fixture being drawn: a showdown fixture carries it (fx.sq), a scrim reads the Squad tab's 2v2 / 1v1 picks
  const smallOf = () => (!curFx ? null : curFx.showId != null && curFx.sq ? curFx.sq.mine : curFx.scrimId != null && (curFx.fmt === '2v2' || curFx.fmt === '1v1') && typeof window.__uxFmtPicks === 'function' ? window.__uxFmtPicks(curFx.fmt) : null);
  const drawing = (getFx, o) => function () { const prev = curFx; try { curFx = getFx(); } catch (e) { curFx = null; } try { return o.apply(this, arguments); } finally { curFx = prev; } };
  if (typeof squadStartingIds === 'function' && typeof previewPitchHtml === 'function') {
    const oStart = squadStartingIds;
    squadStartingIds = function (t) { // eslint-disable-line no-global-assign
      const ids = smallOf();
      return ids && t && t.id === C().userTeamId ? ids : oStart.apply(this, arguments);
    };
    const oPitch = previewPitchHtml;
    previewPitchHtml = function (ids) { // eslint-disable-line no-global-assign
      if (!smallOf()) return oPitch.apply(this, arguments);
      const keys = ids.length === 1 ? ['back'] : ['diag-l', 'diag-r'];
      const slots = keys.map((k, i) => '<div class="slot ' + k + '">' + (ids[i] == null ? '<div class="pcard empty">' + tl('Nobody fit') + '</div>' : playerCardHtml(ids[i], 'on-pitch', { draggable: false })) + '</div>').join('');
      return '<div class="squad-pitch flat-pitch"><div class="pitch-wrap"><div class="pitch">' + pitchChromeHtml() + slots + '</div></div></div>';
    };
    if (typeof nextUserFixture === 'function' && typeof nextMatchCardHtml === 'function') nextMatchCardHtml = drawing(() => nextUserFixture(), nextMatchCardHtml); // eslint-disable-line no-global-assign
    if (typeof previewFixture === 'function' && typeof matchPreviewHtml === 'function') matchPreviewHtml = drawing(() => previewFixture(), matchPreviewHtml); // eslint-disable-line no-global-assign
  }

  // The game labels a match by its event; a scrim has none, so it would read as the league ("RLCS").
  if (typeof compOf === 'function') {
    const oComp = compOf;
    compOf = function (f) { return f && f.showId != null ? { id: -1, kind: 'scrim', name: tl(f.smatch ? 'Showmatch' : 'Showdown') } : f && (f.scrimId != null || f.scrimView) ? { id: -1, kind: 'scrim', name: tl('Scrim') } : oComp.apply(this, arguments); }; // eslint-disable-line no-global-assign
  }

  // ---------- calendar: every booked and played scrim is a one-day entry ----------
  const scrimEvents = () => (!mine() ? [] : data().list.filter((x) => x.status === 'scheduled' || x.status === 'done').map((x) => ({ id: x.id, kind: 'scrim', scrim: true, sc: x, name: tl('Scrim') + ' · ' + name(x.oppId),
    split: 0, index: 0, startDate: x.date, endDate: x.date, stage: 'pending', groups: [], slots: [], field: [], standings: [] })));
  const isScrim = (e) => !!(e && e.scrim);
  if (typeof calEventList === 'function' && typeof eventDayMap === 'function' && typeof calEventById === 'function') {
    const oList = calEventList;
    // the legend lists every entry, so only the scrims close to today are in the list (all of them are on the grid)
    const near = (e) => Math.abs(Date.parse(e.startDate + 'T12:00:00Z') - Date.parse(C().currentDate + 'T12:00:00Z')) <= 45 * 86400000;
    calEventList = function () { return oList.apply(this, arguments).concat(scrimEvents().filter(near)).sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0)); }; // eslint-disable-line no-global-assign
    const oById = calEventById;
    calEventById = function (id) { return oById.apply(this, arguments) || scrimEvents().find((e) => e.id === id) || null; }; // eslint-disable-line no-global-assign
    const oDays = eventDayMap;
    eventDayMap = function () { // eslint-disable-line no-global-assign
      const m = oDays.apply(this, arguments);
      for (const e of scrimEvents()) if (!m[e.startDate]) m[e.startDate] = e; // never over a tournament; two scrims on a day show the first
      return m;
    };
    if (typeof calEventNow === 'function') {
      const oNow = calEventNow;
      calEventNow = function () { // eslint-disable-line no-global-assign
        if (typeof calEvent === 'number' && scrimEvents().some((e) => e.id === calEvent)) return calEvent;
        return oNow.apply(this, arguments);
      };
    }
    if (typeof eventColour === 'function') { const o = eventColour; eventColour = function (e) { return isScrim(e) ? 'var(--teal,#2aa7a0)' : o.apply(this, arguments); }; } // eslint-disable-line no-global-assign
    if (typeof shortEventName === 'function') { const o = shortEventName; shortEventName = function (e) { return isScrim(e) ? 'SCR' : o.apply(this, arguments); }; } // eslint-disable-line no-global-assign
    if (typeof groupsArtHtml === 'function') { const o = groupsArtHtml; groupsArtHtml = function (e) { return isScrim(e) ? '' : o.apply(this, arguments); }; } // eslint-disable-line no-global-assign
    if (typeof bracketArtHtml === 'function') { const o = bracketArtHtml; bracketArtHtml = function (e) { return isScrim(e) ? '' : o.apply(this, arguments); }; } // eslint-disable-line no-global-assign
    if (typeof eventMeaningHtml === 'function') {
      const o = eventMeaningHtml;
      eventMeaningHtml = function (e) { // eslint-disable-line no-global-assign
        if (!isScrim(e)) return o.apply(this, arguments);
        const x = e.sc, r = x.result, same = scrimEvents().filter((y) => y.startDate === e.startDate && y.id !== e.id);
        const right = r ? '<span class="ev-you ' + (r.won ? 'good' : '') + '">' + esc((r.won ? tl('Won') : tl('Lost')) + ' ' + r.a + '–' + r.b) + '</span>' : '';
        const btn = r ? '<button type="button" class="ux-scr-chip" data-action="ux-scrims-view" data-id="' + x.id + '">' + esc(tl('Open match')) + '</button>' : '<button type="button" class="ux-scr-chip" data-action="ux-scrims-open">' + esc(tl('Open Scrims')) + '</button>';
        return '<div class="ev-meaning"><div class="ev-meaning-l"><div class="ev-where">' + esc(tl('Scrim vs {club}', { club: name(x.oppId) })) + '</div><div class="ev-feeds">' + esc(x.fmt + ' · BO' + x.bo + (same.length ? ' · ' + tl('+{n} more that day', { n: same.length }) : '')) + '</div></div><div class="ev-meaning-r">' + right + '</div></div>' + btn;
      };
    }
  }

  // ---------- window ----------
  const closeBtn = '<button type="button" class="btn ghost ux-scr-x" data-action="close-modal" aria-label="Close">&#10005;</button>';
  const chips = (action, attr, items, cur, label) => '<div class="ux-scr-chips">' + items.map((v) => '<button type="button" class="ux-scr-chip' + (String(v) === String(cur) ? ' on' : '') + '" data-action="' + action + '" data-v="' + v + '">' + esc(label(v)) + '</button>').join('') + '</div>';
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

  function createHtml() {
    const opps = opponents();
    if (form.oppId == null || !opps.some((t) => t.id === form.oppId)) form.oppId = opps.length ? opps[0].id : null;
    const list = '<div class="ux-scr-opps">' + opps.map((t) => '<button type="button" class="ux-scr-opp' + (t.id === form.oppId ? ' on' : '') + '" data-action="ux-scrims-opp" data-id="' + t.id + '">' + (typeof crest === 'function' ? crest(t, 'small') : '') + '<b>' + esc(t.name) + '</b><small>' + top3(t) + '</small></button>').join('') + '</div>';
    const mc = monthCounts(), cur = C().currentDate, months = [0, 1, 2, 3].map((i) => addDays(cur, 30 * i).slice(0, 7)).filter((m, i, a) => a.indexOf(m) === i);
    const left = '<div class="ux-scr-sec"><div class="ux-scr-h">' + esc(tl('Opponent')) + '</div><div class="ux-scr-dim">' + esc(tl('Clubs of your region. Rating = their best three.')) + '</div>' + list + '</div>';
    const right = '<div class="ux-scr-sec"><div class="ux-scr-h">' + esc(tl('Match type')) + '</div>' + chips('ux-scrims-fmt', 'fmt', FMTS, form.fmt, (v) => v) +
      '<div class="ux-scr-h">' + esc(tl('Series')) + '</div>' + chips('ux-scrims-bo', 'bo', BOS, form.bo, (v) => 'BO' + v) +
      '<div class="ux-scr-h">' + esc(tl('When')) + '</div>' + chips('ux-scrims-wk', 'weeks', WEEKS, form.weeks, (v) => (v === 1 ? tl('In 1 week') : tl('In {n} weeks', { n: v }))) +
      '<div class="ux-scr-dim">' + esc(tl('Booked or played, a month holds at most {n} scrims and a day two; a full day moves the scrim to the next free one. Never on a tournament day.', { n: MAX_MONTH })) + '</div>' +
      '<div class="ux-scr-dim">' + months.map((m) => esc(m + ': ' + (mc[m] || 0) + '/' + MAX_MONTH)).join(' · ') + '</div>' +
      '<button type="button" class="btn primary ux-scr-book" data-action="ux-scrims-book"' + (form.oppId == null ? ' disabled' : '') + '>' + esc(tl('Book scrim')) + '</button>' +
      '<div class="ux-scr-msg' + (msg ? ' ' + msg.kind : '') + '">' + (msg ? esc(msg.text) : '') + '</div></div>';
    const up = scheduled();
    const upc = '<div class="ux-scr-sec"><div class="ux-scr-h">' + esc(tl('Booked scrims')) + '</div>' + (up.length ? '<div class="ux-scr-list">' + up.map((x) => '<div class="ux-scr-row" style="grid-template-columns:96px minmax(0,1fr) auto auto"><span>' + esc(dateOf(x.date)) + '</span><span class="ux-scr-team">' + crestOf(x.oppId) + '<span>' + esc(name(x.oppId)) + '</span></span><span class="ux-scr-pill">' + esc(x.fmt + ' · BO' + x.bo) + '</span>' +
      (x.date > cur && !x.fxId ? '<button type="button" class="btn ghost" data-action="ux-scrims-cancel" data-id="' + x.id + '">' + esc(tl('Cancel')) + '</button>' : '<span></span>') + '</div>').join('') + '</div>' : '<div class="ux-scr-dim">' + esc(tl('Nothing booked.')) + '</div>') + '</div>';
    return '<div class="ux-scr-grid">' + left + right + '</div>' + upc;
  }
  function historyHtml() {
    const h = data().history.slice().reverse();
    if (!h.length) return '<div class="ux-scr-empty">' + esc(tl('No scrims played yet.')) + '</div>';
    return '<div class="ux-scr-list">' + h.map((x) => '<button type="button" class="ux-scr-row" data-action="ux-scrims-view" data-id="' + x.id + '"><span>' + esc(dateOf(x.date)) + '</span><span class="ux-scr-team">' + crestOf(x.oppId) + '<span>' + esc(x.oppName || name(x.oppId)) + '</span></span><span class="ux-scr-pill">' + esc(x.fmt + ' · BO' + x.bo) + '</span><span class="ux-scr-score ' + (x.won ? 'w' : 'l') + '">' + x.a + '&ndash;' + x.b + '</span></button>').join('') + '</div>' +
      '<div class="ux-scr-dim">' + esc(tl('Click a scrim for every game and player line.')) + '</div>';
  }
  const tabs = () => (typeof panelTabsHtml === 'function' ? panelTabsHtml([['create', tl('Create a Scrim')], ['history', tl('Scrim History')]], tab, 'ux-scrims-tab', 'data-tab')
    : '<div class="ux-scr-chips">' + [['create', 'Create a Scrim'], ['history', 'Scrim History']].map((t) => '<button type="button" class="ux-scr-chip' + (tab === t[0] ? ' on' : '') + '" data-action="ux-scrims-tab" data-tab="' + t[0] + '">' + esc(tl(t[1])) + '</button>').join('') + '</div>');
  const winHtml = () => '<div class="modal ux-scr-win">' + closeBtn + '<div class="modal-h">' + esc(tl('Scrims')) + '</div><div class="modal-b">' + tabs() + (tab === 'create' ? createHtml() : historyHtml()) + '</div></div>';
  const show = () => showModal(winHtml());

  async function refresh() { try { const s = await window.hub.getState(); if (s && s.career) S = s; } catch (e) { /* keep the current view */ } }

  const ACTIONS = ['open', 'tab', 'opp', 'fmt', 'bo', 'wk', 'book', 'cancel', 'view'].map((a) => '[data-action="ux-scrims-' + a + '"]').join(',');
  document.addEventListener('click', async (e) => {
    const el = e.target.closest && e.target.closest(ACTIONS); if (!el) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const act = el.dataset.action.slice(10), v = el.dataset.v;
    if (act === 'open') { msg = null; show(); return; }
    if (act === 'tab') { tab = el.dataset.tab; show(); return; }
    if (act === 'opp') form.oppId = Number(el.dataset.id);
    else if (act === 'fmt') form.fmt = v;
    else if (act === 'bo') form.bo = Number(v);
    else if (act === 'wk') form.weeks = Number(v);
    else if (act === 'book') {
      const r = await hubAct({ a: 'book', oppId: form.oppId, fmt: form.fmt, bo: form.bo, weeks: form.weeks });
      if (r && r.ok) { S = r; msg = { kind: 'good', text: tl('Booked for {date}.', { date: dateOf(r.scrim ? r.scrim.date : '') }) + (r.shifted ? ' ' + tl('The day you asked for was full, so it moved on.') : '') }; render(); } else { msg = { kind: 'bad', text: (r && r.error) || tl('That is not possible.') }; await refresh(); }
    } else if (act === 'cancel') {
      const r = await hubAct({ a: 'cancel', id: Number(el.dataset.id) });
      if (r && r.ok) { S = r; render(); } else msg = { kind: 'bad', text: (r && r.error) || tl('That is not possible.') };
    } else if (act === 'view') {
      const h = data().history.find((x) => x.id === Number(el.dataset.id)); if (!h) return;
      // the full-time screen reads the fixture from the career: a copy is added for the view and removed again on close
      if (!C().fixtures.some((f) => f.id === h.fx.id)) C().fixtures.push(Object.assign({}, h.fx, { eventId: null, scrimView: true, userPlayed: true }));
      closeModal(); if (typeof openFullTime === 'function') openFullTime(h.fx.id); return;
    }
    show();
  }, true);
  document.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('[data-action="ft-close"]'))) return;
    try { const c = C(); if (c && c.fixtures.some((f) => f.scrimView)) c.fixtures = c.fixtures.filter((f) => !f.scrimView); } catch (x) { /* nothing to clean */ }
  }, true);

  try { render(); } catch (e) { /* no career open yet */ }
})();
