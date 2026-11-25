// Academy Mode (renderer): Academy tile next to Training, purchase window (part 2), Academy window + session start (part 3).
// Runs in the game's renderer after src/engine/academy.js has been loaded as window.__academy (same rules as the engine, one source).
// Hidden completely when the club is not eligible (and in Player Career).
(function () {
  'use strict';
  if (window.__academyUI) return;
  const A = window.__academy;
  if (!A || typeof trainingTileHtml !== 'function' || typeof tileHtml !== 'function' || typeof showModal !== 'function') return;
  window.__academyUI = true;

  const st = document.createElement('style');
  st.textContent = '.acad-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.acad-row>.tile.tall{min-height:clamp(150px,15vh,230px)}' +
    '.modal.acad-buy{position:relative;min-width:340px}.acad-x{position:absolute;top:8px;right:8px;width:30px;height:30px;padding:0;line-height:1;z-index:6}' +
    '.acad-buy .modal-b{text-align:center}.acad-buy .btnrow{justify-content:center}.acad-price{font-size:var(--f-hero,36px);font-weight:700;margin:14px 0;text-align:center}.acad-err{color:#d6293f;margin:8px 0;min-height:1.2em}' +
    '.modal.acad-win{position:relative;width:min(96vw,780px);max-width:none;max-height:92vh;display:flex;flex-direction:column}' +
    '.acad-win .modal-b{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto}.acad-body{display:flex;flex-direction:column;gap:12px;flex:1;min-height:0}' +
    '.acad-body.off{opacity:.45;filter:grayscale(1);pointer-events:none}.acad-grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr);gap:14px;flex:1;min-height:0}' +
    '.acad-sec{background:var(--panel-2);border-radius:var(--r-sm);padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0}.acad-sec-h{font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red,#e0334c)}' +
    '.acad-slots{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0}.acad-tsq{min-height:0;padding:8px 10px 10px;border:0;font:inherit;color:inherit;gap:4px;justify-content:center;overflow:hidden}.acad-tsq:disabled{cursor:default}.acad-tsq:disabled:hover{transform:none}' +
    '.acad-tsq .tsq-hex{width:54px;height:58px;margin-top:0}.acad-tsq .tsq-face{margin-top:0}.acad-tsq .tsq-face .tsq-photo{width:52px;height:52px}.acad-tsq .tsq-num{width:24px;height:24px;bottom:6px;font-size:12px}.acad-tsq .tsq-label,.acad-tsq .tsq-name{font-size:.85em}.acad-tsq .tsq-name{font-weight:700;text-align:center}' +
    '.acad-foot{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.acad-slider{display:flex;align-items:center;gap:12px;flex:1;min-width:260px}.acad-slider input{flex:1}.acad-days{font-weight:700;min-width:90px}' +
    '.acad-warn{opacity:.8;font-size:.9em}.acad-info{display:flex;gap:28px;font-weight:700}.acad-note{color:#d6293f;min-height:1.2em}' +
    '.acad-layer{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:5;border-radius:inherit}.acad-card{background:var(--panel,#fff);color:inherit;border-radius:var(--r-sm);padding:18px;max-width:min(92%,560px);max-height:90%;overflow:auto;display:flex;flex-direction:column;gap:12px}' +
    '.acad-list{display:flex;flex-direction:column;gap:8px}.acad-line{display:grid;grid-template-columns:130px 1fr 1fr;align-items:center;gap:10px;background:var(--panel-2);border-radius:var(--r-sm);padding:8px 12px}' +
    '.acad-chip{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 10px;border:1px dashed var(--rule);border-radius:8px;background:transparent;font:inherit;color:inherit;cursor:pointer;min-width:0;text-align:left}' +
    '.acad-chip.has{border-style:solid;background:var(--card,var(--panel))}.acad-chip.picking{border-color:var(--red);border-style:solid}.acad-chip:disabled{cursor:default}.acad-chip .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}' +
    '.acad-chip .rt{margin-left:auto;font-weight:800}.acad-chip .plus{color:var(--text-dim);font-weight:700}.acad-chip .acad-face{width:28px;height:28px;font-size:12px;flex:none}' +
    '.acad-pick{width:100%;border-collapse:collapse;font-size:var(--f-small)}.acad-pick th{font-size:var(--f-micro);letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);text-align:left;padding:4px 8px}' +
    '.acad-pick td{padding:6px 8px;border-top:1px solid var(--rule)}.acad-pick tr.row{cursor:pointer}.acad-pick tr.row:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}.acad-pick .nm{display:flex;align-items:center;gap:8px;font-weight:700}.acad-pick .nm .acad-face{width:26px;height:26px;font-size:11px}' +
    '.acad-pick .tag{font-size:var(--f-micro);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--red)}.acad-pick-scroll{max-height:50vh;overflow:auto;margin:6px 0}.acad-card.wide{max-width:min(92vw,640px);width:640px}' +
    '.acad-card ul{margin:4px 0 0 18px;padding:0}.acad-card .tsq-choose-row{display:flex;flex-wrap:wrap;gap:8px}';
  document.head.appendChild(st);

  const mine = () => { try { const c = C(); return c && !(typeof isPlayerMode === 'function' && isPlayerMode()) ? c : null; } catch (e) { return null; } };
  const LABEL = { closed: 'Closed', open: 'Open', training: 'In Training' };
  const status = () => { const c = mine(); return c && c.season != null ? A.status(c) : 'hidden'; };

  const origTile = trainingTileHtml;
  // eslint-disable-next-line no-global-assign
  trainingTileHtml = function () {
    const base = origTile.apply(this, arguments);
    const s = status();
    if (s === 'hidden') return base;
    const tile = tileHtml({ title: tl('Academy'), desc: tl(LABEL[s]), icon: '&#9733;', action: 'academy-open', cls: 'tall' });
    return '<div class="acad-row">' + tile + base + '</div>';
  };

  // players away at the Academy cannot be picked for the game's Training
  if (typeof trainingHtml === 'function') {
    const origTrain = trainingHtml;
    // eslint-disable-next-line no-global-assign
    trainingHtml = function () {
      let h = origTrain.apply(this, arguments);
      try { const c = mine(); if (c) h = h.replace(/<button class="tsq-opt([^"]*)"([^>]*?) data-pid="(\d+)"/g, (m, cls, mid, id) => (A.inAcademy(c, parseInt(id, 10)) ? '<button class="tsq-opt' + cls + '" disabled title="' + esc(tl('Away at the Academy')) + '"' + mid + ' data-pid="' + id + '"' : m)); } catch (e) { /* plain picker */ }
      return h;
    };
  }

  const closeBtn = '<button type="button" class="btn ghost acad-x" data-action="close-modal" aria-label="' + '✕' + '">&#10005;</button>';
  const buyHtml = (err) => '<div class="modal acad-buy">' + closeBtn +
    '<div class="modal-h">' + tl('Academy') + '</div><div class="modal-b">' +
    '<div class="matchmeta">' + tl('Unlock the Academy for this season and send your players to train.') + '</div>' +
    '<div class="acad-price">' + esc(fmtMoney(A.price(C()))) + '</div><div class="acad-err">' + (err ? esc(err) : '') + '</div>' +
    '<div class="btnrow"><button class="btn primary" data-action="academy-buy">' + tl('Buy') + '</button></div></div></div>';

  // ---- Academy window (Open / In Training) ----
  const N = A.SECTIONS.length * 2;
  let draft = Array(N).fill(null); // player id per slot; UI-only until Start
  let days = A.MIN_DAYS;
  let picking = null; // slot index being chosen
  let confirming = false;
  let note = '';
  const squad = () => { const t = teamById(C().userTeamId); return (t ? t.playerIds : []).map(playerById).filter((p) => p && !p.retired && !p.isUser); };
  const sess = () => (C().academy && C().academy.session && C().academy.session.active ? C().academy.session : null);
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

  function slotHtml(i, locked) {
    const id = locked ? sess().slots[i] : draft[i];
    const p = id != null ? playerById(id) : null;
    const dis = locked ? ' disabled' : '';
    const open = '<button type="button" class="acad-chip' + (p ? ' has' : '') + (picking === i ? ' picking' : '') + '" data-action="academy-slot" data-slot="' + i + '"' + dis + '>';
    if (!p) return open + '<span class="plus">+</span><span class="nm">' + tl('Add player') + '</span></button>';
    return open + faceHtml(p.name, p.id, 'acad-face') + '<span class="nm">' + esc(p.name) + '</span><span class="rt">' + p.rating + '</span></button>';
  }

  function layerHtml() {
    if (picking != null) {
      const where = {}; draft.forEach((id, i) => { if (id != null && i !== picking) where[id] = A.SECTIONS[i >> 1]; });
      const flag = (p) => { try { const n = nationOf(p.id); return n ? flagHtml(n, '') : ''; } catch (e) { return ''; } };
      const pot = (p) => { try { const v = viewOf(p.id); return v && v.potKnown ? v.potLo + '&ndash;' + v.potHi : '&mdash;'; } catch (e) { return '&mdash;'; } };
      const mood = (p) => { try { return typeof moodLabelOf === 'function' ? moodLabelOf(p.id) : ''; } catch (e) { return ''; } };
      const rows = squad().slice().sort((x, y) => y.rating - x.rating).map((p) => '<tr class="row" data-action="academy-pick" data-pid="' + p.id + '"><td><div class="nm">' + faceHtml(p.name, p.id, 'acad-face') + '<span>' + esc(p.name) + '</span></div></td><td>' + flag(p) + '</td><td>' + (p.age || '&mdash;') +
        '</td><td><b>' + p.rating + '</b></td><td>' + pot(p) + '</td><td>' + mood(p) + '</td><td>' + (where[p.id] ? '<span class="tag">' + esc(tl('In {section}', { section: tl(where[p.id]) })) + '</span>' : '') + '</td></tr>').join('');
      return '<div class="acad-layer"><div class="acad-card wide"><div class="tsq-choose-h">' + tl('Who goes to {section}?', { section: esc(tl(A.SECTIONS[picking >> 1])) }) + '</div>' +
        '<div class="acad-pick-scroll"><table class="acad-pick"><thead><tr><th>' + tl('Player') + '</th><th>' + tl('Nation') + '</th><th>' + tl('Age') + '</th><th>' + tl('Rating') + '</th><th>' + tl('Potential') + '</th><th>' + tl('Mood') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="btnrow">' + (draft[picking] != null ? '<button class="btn ghost sm" data-action="academy-pick" data-pid="">' + tl('Remove') + '</button>' : '') + '<button class="btn ghost sm" data-action="academy-pickcancel">' + tl('Cancel') + '</button></div></div></div>';
    }
    if (confirming) {
      const names = [...new Set(draft.filter((x) => x != null))].map((id) => esc(playerById(id).name));
      const ms = A.missed(C(), days);
      const list = ms.length
        ? '<ul>' + ms.map((m) => '<li>' + esc(m.name) + ' (' + esc(m.startDate) + ' &ndash; ' + esc(m.endDate) + ')' + (m.unconfirmed ? ' <i>' + tl('if the club takes part') + '</i>' : '') + '</li>').join('') + '</ul>'
        : '<div>' + tl('No competitions overlap with this training period.') + '</div>';
      return '<div class="acad-layer"><div class="acad-card"><div class="modal-h">' + tl('Send these players to the Academy?') + '</div>' +
        '<div>' + tl('They will be unavailable for {n} days.', { n: days }) + '</div><div><b>' + names.join(', ') + '</b></div>' +
        '<div><b>' + tl('Competitions they will miss') + '</b>' + list + '</div>' +
        '<div class="btnrow"><button class="btn primary" data-action="academy-confirm">' + tl('Send to Academy') + '</button><button class="btn ghost" data-action="academy-cancel">' + tl('Cancel') + '</button></div></div></div>';
    }
    return '';
  }

  function windowHtml() {
    const s = sess();
    const locked = !!s;
    const grid = A.SECTIONS.map((name, k) => '<div class="acad-line"><div class="acad-sec-h">' + esc(tl(name)) + '</div>' + slotHtml(2 * k, locked) + slotHtml(2 * k + 1, locked) + '</div>').join('');
    const warn = '<div class="acad-warn">' + tl('Assigned players cannot take part in tournaments while their Academy training is in progress.') + '</div>';
    const dd = locked ? s.days : days, dis = locked ? ' disabled' : '';
    const ctl = '<div class="acad-foot"><div class="acad-slider"><span>' + tl('Duration') + '</span><input type="range" id="acad-days" min="' + A.MIN_DAYS + '" max="' + A.MAX_DAYS + '" step="1" value="' + dd + '"' + dis + '><span class="acad-days" id="acad-days-l">' + dd + ' ' + tl('days') + '</span></div>' +
      '<button class="btn primary" data-action="academy-start"' + dis + '>' + tl('Start') + '</button></div>';
    let info = '';
    if (s) {
      const done = Math.max(0, Math.min(s.days, daysBetween(s.start, C().currentDate)));
      info = '<div class="acad-info"><span>' + tl('Running: {n} days', { n: done }) + '</span><span>' + tl('Remaining: {n} days', { n: s.days - done }) + '</span><span>' + tl('Total: {n} days', { n: s.days }) + '</span></div>';
    }
    return '<div class="modal acad-win">' + closeBtn + '<div class="modal-h">' + tl('ACADEMY') + '</div><div class="modal-b">' +
      '<div class="acad-body' + (locked ? ' off' : '') + '"' + (locked ? ' aria-disabled="true"' : '') + '><div class="acad-list">' + grid + '</div>' + warn +
      '<div class="acad-note">' + esc(note) + '</div>' + ctl + '</div>' + info + '</div>' + layerHtml() + '</div>';
  }
  const showWin = () => showModal(windowHtml());

  // Training -> Begin training: once the game has run the sessions (its handler replaces S), close the Training window too.
  document.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('[data-action="run-training"]'))) return;
    const before = S; let n = 0;
    const t = setInterval(() => {
      if (S !== before) { clearInterval(t); if (typeof bigList !== 'undefined' && bigList === 'training') { bigList = null; render(); } } else if (++n > 40) clearInterval(t);
    }, 100);
  });

  const ACTIONS =['open', 'buy', 'slot', 'pick', 'pickcancel', 'start', 'confirm', 'cancel'].map((a) => '[data-action="academy-' + a + '"]').join(',');
  document.addEventListener('click', async (e) => {
    const el = e.target.closest && e.target.closest(ACTIONS);
    if (!el) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const act = el.dataset.action;
    if (act === 'academy-open') {
      const s = status();
      if (s === 'closed') showModal(buyHtml());
      else if (s !== 'hidden') { picking = null; confirming = false; note = ''; showWin(); }
      return;
    }
    if (act === 'academy-buy') {
      // the engine takes the money (academy.js buy) through the game's own set-training channel, which also saves the career
      const r = await window.hub.setTraining({ index: 'academy-buy' });
      if (r && r.ok && r.career) { S = r; closeModal(); render(); return; }
      if (r && r.career) S = r;
      const why = r && r.reason === 'funds' ? tl('Not enough money to buy the Academy.') : r && r.reason === 'already-bought' ? tl('The Academy is already open this season.') : tl('The Academy cannot be bought now.');
      showModal(buyHtml(why));
      return;
    }
    if (status() !== 'open') return; // a running session locks every control
    if (act === 'academy-slot') { picking = parseInt(el.dataset.slot, 10); note = ''; }
    else if (act === 'academy-pick') { draft[picking] = el.dataset.pid === '' ? null : parseInt(el.dataset.pid, 10); picking = null; }
    else if (act === 'academy-pickcancel') picking = null;
    else if (act === 'academy-cancel') confirming = false;
    else if (act === 'academy-start') {
      if (!draft.some((x) => x != null)) note = tl('Assign at least one player before starting.'); else { note = ''; confirming = true; }
    } else if (act === 'academy-confirm') {
      const r = await window.hub.setTraining({ index: 'academy-start', pid: { days, slots: draft } });
      confirming = false;
      if (r && r.career) S = r;
      if (r && r.ok) { draft = Array(N).fill(null); closeModal(); render(); return; }
      note = r && r.reason === 'training' && r.error ? r.error : tl('The Academy session could not be started.');
    }
    showWin();
  }, true);

  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'acad-days' || status() !== 'open') return;
    days = Math.max(A.MIN_DAYS, Math.min(A.MAX_DAYS, parseInt(e.target.value, 10) || A.MIN_DAYS));
    const l = document.getElementById('acad-days-l'); if (l) l.textContent = days + ' ' + tl('days');
  });

  try { render(); } catch (e) { /* no career open yet */ }
})();
