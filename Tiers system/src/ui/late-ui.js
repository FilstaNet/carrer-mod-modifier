// Late game UI (LateGamePlan.md section 4.4): the "Facilities" sub-tab of the Club hub, the one-time difficulty-mode popup, and the locked state for Tier B.
// ux-club-ui.js calls window.__lateUI: html() for the tab body, opened() when the Club hub is entered. Everything talks to the engine through
// placeBet kind 'uxl:<json>' (src/engine/late-core.js). Read-only actions answer ok:false WITH data; a successful change answers with the new state.
(function () {
  'use strict';
  if (window.__lateUI) return;
  if (typeof showModal !== 'function' || typeof closeModal !== 'function' || typeof render !== 'function' || typeof showToast !== 'function' || typeof C !== 'function') return;
  window.__lateUI = {};

  const st = document.createElement('style');
  st.textContent =
    '.late-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}.late-stat{padding:8px 10px;border-radius:var(--r-sm,6px);background:color-mix(in srgb,var(--text) 7%,transparent)}.late-stat b{display:block;font-size:1.25em}.late-stat span{font-size:var(--f-small);opacity:.7;text-transform:uppercase;letter-spacing:.07em}' +
    '.late-warn{margin:8px 0;padding:8px 12px;border-left:3px solid var(--red);background:color-mix(in srgb,var(--red) 10%,transparent);border-radius:0 var(--r-sm,6px) var(--r-sm,6px) 0;font-size:var(--f-small)}' +
    '.late-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}.late-mode{cursor:pointer;text-align:left;padding:10px 12px;border-radius:var(--r-sm,6px);border:1px solid color-mix(in srgb,var(--text) 18%,transparent);background:transparent;color:inherit;font:inherit}.late-mode:hover{border-color:var(--accent,var(--red))}.late-mode.on{border-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 12%,transparent)}.late-mode b{display:block;margin-bottom:3px}.late-mode span{font-size:var(--f-small);opacity:.8;line-height:1.4;display:block}' +
    '.late-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.late-b{display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:var(--r,10px);border:1px solid color-mix(in srgb,var(--text) 14%,transparent);background:color-mix(in srgb,var(--text) 4%,transparent)}.late-b.locked{opacity:.55}.late-b-top{display:flex;gap:10px;align-items:center}.late-b-top h5{flex:1}.late-what{font-size:var(--f-small);opacity:.75;line-height:1.4}.late-fx{font-size:var(--f-small);line-height:1.4;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--text) 7%,transparent)}.late-fx i{display:block;font-style:normal;font-size:.85em;text-transform:uppercase;letter-spacing:.07em;opacity:.6}'+
    '.late-ico{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.95em;color:#fff;letter-spacing:.04em}' +
    '.late-b h5{margin:0 0 2px;font-size:1em}.late-tag{font-size:var(--f-small);opacity:.6;text-transform:uppercase;letter-spacing:.07em;margin-left:6px;font-weight:600}' +
    '.late-pips{display:inline-flex;gap:3px;margin-left:8px;vertical-align:middle}.late-pips i{width:12px;height:6px;border-radius:2px;background:color-mix(in srgb,var(--text) 18%,transparent)}.late-pips i.on{background:var(--accent,var(--red))}.late-pips i.next{background:color-mix(in srgb,var(--accent,var(--red)) 45%,transparent);animation:latePulse 1.4s ease-in-out infinite}@keyframes latePulse{50%{opacity:.35}}' +
    '.late-eff{font-size:var(--f-small);line-height:1.45}.late-eff.next{opacity:.75}.late-b{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.late-b:not(.locked):hover{transform:translateY(-3px);box-shadow:0 8px 20px rgba(0,0,0,.18);border-color:var(--accent,var(--red))}.late-buy .btn{position:relative;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}.late-buy .btn:not([disabled]):hover{transform:translateY(-1px) scale(1.03);box-shadow:0 0 0 2px var(--accent,var(--red)),0 6px 16px rgba(0,0,0,.25)}.late-buy .btn:not([disabled]):active{transform:scale(.97)}.late-buy .btn:not([disabled])::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);transition:left .5s ease}.late-buy .btn:not([disabled]):hover::after{left:130%}@media (prefers-reduced-motion:reduce){.late-b,.late-buy .btn,.late-buy .btn::after{transition:none!important}.late-b:not(.locked):hover,.late-buy .btn:not([disabled]):hover{transform:none}}.late-buy{margin-top:auto}.late-buy .btn{width:100%}.late-buy-p{display:flex;justify-content:space-between;margin-bottom:6px}.late-why{font-size:var(--f-small);opacity:.7;margin-top:4px}' +
    '.late-q{padding:8px 0;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)}.late-q:first-of-type{border-top:0}.late-bar{height:6px;border-radius:3px;background:color-mix(in srgb,var(--text) 14%,transparent);margin-top:6px;overflow:hidden}.late-bar i{display:block;height:100%;background:var(--accent,var(--red))}' +
    '';
  document.head.appendChild(st);

  const T = window.__lateTexts || {};
  const f = (str, v) => String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const bold = (str) => esc(str).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const hubAct = async (o) => window.hub.placeBet({ kind: 'uxl:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  const me = () => teamById(C().userTeamId);
  const money = (n) => fmtMoney(Math.round(n));
  const sec = (title, body) => '<div class="ux-cs"><h4>' + esc(title) + '</h4>' + body + '</div>';
  const how = (title, lines) => '<div class="ux-how"><div class="ux-how-h">' + esc(title) + '</div><ul>' + lines.map((l) => '<li>' + bold(l) + '</li>').join('') + '</ul></div>';

  // placeholder art: a tinted square with initials per building (real pictures are an open item for the user)
  const ART = { academy: ['AC', '#3b82f6'], scouting: ['SC', '#06b6d4'], wellbeing: ['WB', '#10b981'], analytics: ['AN', '#8b5cf6'], arena: ['AR', '#f59e0b'], fanzone: ['FZ', '#ec4899'], studio: ['ST', '#ef4444'], museum: ['MU', '#a8a29e'] };
  const MODES = Object.keys(T.modes || {}).map((k) => [k, T.modes[k].name, T.modes[k].text]);

  let view = null, viewKey = null, loading = false, busy = false, popupShown = false;
  const late = () => C().late || null;
  const mode = () => (late() && late().mode) || 'standard';
  const isTierB = () => { const t = me(); return !!t && /_b$/.test(t.region || ''); };
  const key = () => C().currentDate + '|' + ((me() || {}).budget | 0) + '|' + JSON.stringify(late() && late().clubs && late().clubs[C().userTeamId] ? late().clubs[C().userTeamId].queue : 0);

  async function load() {
    if (loading) return; loading = true;
    const k = key();
    try { const r = await hubAct({ a: 'facilities' }); view = r && r.list ? r : null; viewKey = k; } catch (e) { view = null; } finally { loading = false; }
    render();
  }

  async function act(req, ok) {
    if (busy) return; busy = true;
    try { const r = await hubAct(req); if (r && r.ok) { S = r; view = null; viewKey = null; if (ok) showToast(ok); } else showToast((r && r.error) || T.toastNo); } finally { busy = false; }
    render();
  }

  const modeBlock = () => {
    const chosen = !!(late() && late().modeChosen);
    if (chosen) { // locked: the rules never change in mid-game
      const m = MODES.find((x) => x[0] === mode()) || MODES[1];
      return '<div class="late-modes" style="grid-template-columns:1fr"><div class="late-mode on" style="cursor:default"><b>' + esc(m[1]) + ' · ' + esc(T.modeLocked) + '</b><span>' + esc(m[2]) + '</span></div></div>';
    }
    return '<div class="ux-cm">' + esc(T.modeIntro) + '</div>' +
      '<div class="late-modes">' + MODES.map(([k, n, d]) => '<button type="button" class="late-mode" data-action="late-mode" data-mode="' + k + '"><b>' + esc(n) + '</b><span>' + esc(d) + '</span></button>').join('') + '</div>';
  };

  const pips = (l, max, building) => '<span class="late-pips">' + Array.from({ length: max }, (_, i) => '<i class="' + (i < l ? 'on' : i === l && building ? 'next' : '') + '"></i>').join('') + '</span>';
  function cardHtml(b, v) {
    const [ab, col] = ART[b.id] || ['??', '#777'], tx = (T.buildings || {})[b.id] || {};
    const left = b.level >= b.max ? null : b.price;
    let why = '', can = b.canStart && left != null && (me().budget || 0) >= left;
    if (b.locked) why = b.locked; else if (b.level >= b.max) why = T.whyFull; else if (b.building) why = T.whyBusy; else if (v.hq < b.req) why = f(T.whyHq, { need: b.req, have: v.hq }); else if (v.queue.length >= 2) why = T.whyQueue; else if ((me().budget || 0) < left) why = T.whyMoney;
    const btn = b.level >= b.max ? '' : '<button type="button" class="btn" data-action="late-build" data-id="' + b.id + '"' + (can ? '' : ' disabled') + '>' + esc(f(b.level ? T.upgradeBtn : T.buildBtn, { n: b.level + 1 })) + '</button>';
    return '<div class="late-b' + (b.locked ? ' locked' : '') + '">' +
      '<div class="late-b-top"><div class="late-ico" style="background:' + col + '">' + ab + '</div><div><h5>' + esc(tx.name || b.name) + '</h5><span class="late-tag" style="margin:0">' + esc(tx.focus || b.focus) + '</span>' + pips(b.level, b.max, b.building) + '</div></div>' +
      '<div class="late-what">' + esc(tx.what || '') + '</div>' +
      '<div class="late-fx"><i>' + esc(T.now) + '</i>' + esc(b.level ? b.now : T.notBuilt) + '</div>' +
      (b.next && !b.locked ? '<div class="late-fx"><i>' + esc(T.next) + '</i>' + esc(b.next) + '</div>' : '') +
      '<div class="late-buy">' + (left != null && !b.locked ? '<div class="late-buy-p"><b>' + money(left) + '</b><span>' + esc(f(T.daysFmt, { n: b.days })) + '</span></div>' : '') + btn + (why && !can ? '<div class="late-why">' + esc(why) + '</div>' : '') + '</div></div>';
  }

  function queueHtml(v) {
    if (!v.queue.length) return '<div class="ux-cm">' + esc(T.queueEmpty) + '</div>';
    const today = Date.parse(C().currentDate);
    return v.queue.map((q) => {
      const total = Math.max(1, (Date.parse(q.end) - Date.parse(q.start)) / 86400000), done = Math.min(1, Math.max(0, (today - Date.parse(q.start)) / 86400000 / total)), b = v.list.find((x) => x.id === q.id) || {}, name = ((T.buildings || {})[q.id] || {}).name || b.name || q.id;
      const daysLeft = Math.max(0, Math.round((Date.parse(q.end) - today) / 86400000));
      return '<div class="late-q"><b>' + esc(name) + '</b> · ' + esc(f(T.levelFmt, { n: q.level })) + ' <span class="ux-cm">' + esc(f(T.daysLeft, { n: daysLeft })) + '</span><div class="late-bar"><i style="width:' + Math.round(done * 100) + '%"></i></div></div>';
    }).join('');
  }

  function locked(title, lines) { return [[sec(T.tab, how(title, lines))], []]; }

  // the body of the Facilities sub-tab: [left column, right column]
  window.__lateUI.html = function () {
    const t = me();
    if (!t) return locked(T.tab, T.noCareerLines);
    if (isTierB()) return locked(T.tierBTitle, T.tierBLines);
    if (C().sacked) return locked(T.tab, T.sackedLines);
    if (!late() || !late().unlocked) {
      const w = (late() && late().wins) || { major: 0, open: 0 }, rq = (late() && late().req) || { major: 2, open: 5 };
      return locked(T.gateTitle, T.gateLines.map((l) => f(l, { major: w.major, open: w.open, needMajor: rq.major, needOpen: rq.open })));
    }
    const k = key(); if (k !== viewKey && !loading) setTimeout(load, 0);
    if (!view) return [[sec(T.tab, '<div class="ux-cm">' + esc(T.loading) + '</div>')], []];
    const v = view;
    const sum = '<div class="late-sum"><div class="late-stat"><b>' + v.hq + ' / 6</b><span>' + esc(T.statHq) + '</span></div><div class="late-stat"><b>' + money(v.upkeep) + '</b><span>' + esc(T.statUpkeep) + '</span></div><div class="late-stat"><b>' + money(t.budget || 0) + '</b><span>' + esc(T.statBudget) + '</span></div></div>' +
      (v.unpaid ? '<div class="late-warn">' + esc((T.upkeepWarn || {})[mode()] || '') + '</div>' : '');
    const l = [sec(T.overview, sum + how(T.howTitle, T.how)), sec(T.queueTitle, queueHtml(v)), sec(T.modeTitle || 'Difficulty mode', modeBlock())];
    return [l, [sec(T.buildingsTitle, '<div class="late-grid">' + v.list.map((b) => cardHtml(b, v)).join('') + '</div>')]];
  };

  // first Club visit after the unlock: ask for the mode once per session (closing it keeps Standard)
  window.__lateUI.opened = function () {
    if (popupShown || isTierB() || C().sacked || !late() || !late().unlocked || late().modeChosen) return;
    popupShown = true;
    showModal('<div class="modal" style="max-width:760px"><div class="modal-h">' + esc(T.popupTitle) + '</div><div class="modal-b"><div class="ux-cm" style="margin-bottom:6px">' + esc(T.popupText) + '</div>' +
      '<div class="late-modes">' + MODES.map(([k, n, d]) => '<button type="button" class="late-mode" data-action="late-mode" data-mode="' + k + '" data-close="1"><b>' + esc(n) + '</b><span>' + esc(d) + '</span></button>').join('') + '</div>' +
      '<div class="btnrow"><button class="btn ghost" data-action="close-modal">' + esc(T.popupLater) + '</button></div></div></div>');
  };

  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action^="late-"]'); if (!a || a.disabled) return;
    e.stopImmediatePropagation();
    if (a.dataset.action === 'late-mode') { if (a.dataset.close) closeModal(); return void act({ a: 'mode', mode: a.dataset.mode }, f(T.toastMode, { m: ((T.modes || {})[a.dataset.mode] || {}).name || a.dataset.mode })); }
    if (a.dataset.action === 'late-build') return void act({ a: 'build', id: a.dataset.id }, T.toastBuild);
  }, true);
})();
