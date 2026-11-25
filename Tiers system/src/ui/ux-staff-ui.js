// Staff tab on the Scouting screen (Transfers > Scouts): hire and fire scouts. The work is done by src/engine/ux-staff.js (rpc staffinfo / staffhire / stafffire).
(function () {
  'use strict';
  if (window.__uxStaffUI) return;
  if (typeof scoutWindowHtml !== 'function' || typeof render !== 'function' || typeof esc !== 'function' || typeof fmtMoney !== 'function') return;
  window.__uxStaffUI = true;

  const st = document.createElement('style');
  st.textContent =
    '.ux-st-tabs{display:flex;gap:6px;margin:8px 0 10px}.ux-st-tab{border:0;cursor:pointer;font:inherit;font-weight:800;font-size:var(--f-small);padding:6px 14px;background:color-mix(in srgb,var(--text) 12%,transparent);color:inherit}' +
    '.ux-st-tab.on{background:var(--red);color:#fff}' +
    '.ux-st-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:6px;background:color-mix(in srgb,var(--text) 7%,transparent)}' +
    '.ux-st-row small{display:block;opacity:.7}.ux-st-h{font-weight:800;margin:14px 0 8px}.ux-st-sum{opacity:.8;margin-bottom:8px}';
  document.head.appendChild(st);

  const hubAct = async (o) => window.hub.placeBet({ kind: 'uxc:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  let tab = 'scouting', info = null, busy = false;

  async function load() { try { const r = await hubAct({ a: 'staffinfo' }); if (r && r.scouts) info = r; } catch (e) { /* the screen shows what it has */ } render(); }

  const tabs = () => '<div class="ux-st-tabs">' + [['scouting', tl('Scouting')], ['staff', tl('Staff')]].map((t) => '<button class="ux-st-tab' + (tab === t[0] ? ' on' : '') + '" data-action="ux-staff-tab" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>').join('') + '</div>';

  function staffHtml() {
    const i = info;
    const body = !i ? '<div class="sr-none">' + esc(tl('Loading…')) + '</div>' :
      '<div class="ux-st-sum">' + esc(tl('{n} of {max} scouts', { n: i.scouts.length, max: i.max })) + ' &middot; ' + esc(tl('{money} wage room / week', { money: fmtMoney(i.room) })) + '</div>' +
      '<div class="ux-st-h">' + esc(tl('Your scouts')) + '</div>' +
      (i.scouts.map((x) => '<div class="ux-st-row"><span><b>' + esc(x.name) + '</b><small>' + esc(i.skills[x.skill].label + ' · ' + fmtMoney(x.wage) + '/wk · ' + (x.busy ? tl('Out on a job') : tl('Available'))) + '</small></span>' +
        '<button class="ux-cb ghost" data-action="ux-staff-fire" data-id="' + x.id + '"' + (x.busy ? ' disabled' : '') + '>' + esc(tl('Fire')) + '</button></div>').join('') || '<div class="sr-none">' + esc(tl('No scouts on the books.')) + '</div>') +
      '<div class="ux-st-h">' + esc(tl('Scouts looking for work')) + '</div>' +
      (i.pool.map((c) => '<div class="ux-st-row"><span><b>' + esc(c.name) + '</b><small>' + esc(i.skills[c.skill].label + ' · ' + fmtMoney(c.wage) + '/wk') + '</small></span>' +
        '<button class="ux-cb" data-action="ux-staff-hire" data-id="' + c.cid + '"' + (i.scouts.length >= i.max || c.wage > i.room ? ' disabled' : '') + '>' + esc(tl('Hire')) + '</button></div>').join('') || '<div class="sr-none">' + esc(tl('Nobody is looking for work right now.')) + '</div>');
    return '<div class="two-blocks search-screen"><button class="ow-close tb-close" data-action="big-close" aria-label="' + esc(tl('Close')) + '">&times;</button><div class="tb-light"><div class="tb-col"><div class="tb-title">' + esc(tl('Scouting')) + '</div>' + tabs() + '</div><div class="sr-cards" style="display:block;overflow:auto">' + body + '</div></div><div class="tb-dark"><div class="tb-scroll"><div class="scout-extra-k">' +
      esc(tl('Rookies are cheap and slow, veterans cost more and finish reports sooner. Each scout lets you run one scouting job at a time.')) + '</div></div></div></div>';
  }

  // the game counts a fixed 3 scout slots; the club may have fewer or more (up to 3) scouts
  const fixSlots = () => { if (S && S.scouting && Array.isArray(S.scouting.staff)) S.scouting.slots = S.scouting.staff.length; };
  const oScout = scoutWindowHtml;
  scoutWindowHtml = function () { // eslint-disable-line no-global-assign
    fixSlots();
    if (tab === 'staff') return staffHtml();
    return oScout.apply(this, arguments).replace(/(<div class="tb-title">[^<]*<\/div>)/, '$1' + tabs());
  };
  if (typeof transfersHtml === 'function') { const oT = transfersHtml; transfersHtml = function () { fixSlots(); return oT.apply(this, arguments); }; } // eslint-disable-line no-global-assign

  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action^="ux-staff-"],[data-action="big-close"]'); if (!a) return;
    const k = a.dataset.action;
    if (k === 'big-close') { tab = 'scouting'; return; } // the game closes the window itself
    e.stopImmediatePropagation();
    if (k === 'ux-staff-tab') { tab = a.dataset.tab; if (tab === 'staff') load(); else render(); return; }
    if (busy || a.disabled) return; busy = true;
    hubAct({ a: k === 'ux-staff-hire' ? 'staffhire' : 'stafffire', [k === 'ux-staff-hire' ? 'cid' : 'id']: Number(a.dataset.id) })
      .then((r) => { if (r && r.ok) { S = r; showToast(k === 'ux-staff-hire' ? tl('Scout hired.') : tl('Scout let go.')); } else showToast((r && r.error) || tl('That is not possible.')); })
      .finally(() => { busy = false; load(); });
  }, true);
})();
