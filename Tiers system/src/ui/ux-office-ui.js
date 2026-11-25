// Office tab round (injected after ux-season-ui.js; wraps the game's own globals, no game file is edited):
//  - top bar "Window" cell: countdown (the Office banner already gets it from ux-ui.js)
//  - Board expectations card -> clickable, opens a detailed window (objectives, patience, soft goals, board feedback)
//  - Media offers / Betting tiles: themed header banner + compact scrollable list (offers / upcoming matches with odds)
//  - Inbox: All / Important / Starred / Archive tabs, star + archive buttons (stored in this browser's localStorage per career)
(function () {
  'use strict';
  if (window.__uxOfficeUI) return;
  if (typeof boardTileHtml !== 'function' || typeof mediaTileHtml !== 'function' || typeof betsTileHtml !== 'function' || typeof inboxPaneHtml !== 'function' ||
      typeof topbarHtml !== 'function' || typeof BIG_LISTS !== 'object' || typeof C !== 'function') return;
  window.__uxOfficeUI = true;

  const st = document.createElement('style');
  st.textContent =
    // media / betting tiles: hero filling the tile body (tile size and grid untouched)
    '.tile.content.ux-tile{position:relative;overflow:hidden}.ux-hero{position:absolute;left:0;right:0;bottom:0;top:54px;display:flex;flex-direction:column;color:var(--text);background:var(--card,var(--panel-2));--ux-acc:var(--red)}' +
    '.ux-hero.bets{--ux-acc:var(--teal,#1fa38a)}' +
    // clean look: flat surface, accent only on the kicker and odds, no heavy gradients or white discs
    '.ux-hero .ux-kick{color:var(--ux-acc);opacity:1}.ux-hero .ux-sm{color:var(--text-dim);opacity:1}.ux-hero .ux-odds{background:transparent;color:var(--ux-acc);border:1px solid var(--ux-acc);padding:1px 9px}' +
    '.ux-hero .ux-arrow{background:transparent;color:var(--text-dim);width:30px;height:30px;font-size:24px}.ux-hero .ux-arrow:hover{background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text)}' +
    '.ux-hero .ux-dots i{background:color-mix(in srgb,var(--text) 25%,transparent)}.ux-hero .ux-dots i.on{background:var(--ux-acc)}.ux-hero .ux-blist{background:color-mix(in srgb,var(--text) 5%,transparent)}.ux-hero .ux-row:hover{background:color-mix(in srgb,var(--text) 9%,transparent)}' +
    '.ux-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 46px;text-align:center;cursor:pointer}' +
    '.ux-logo{display:grid;place-items:center;width:64px;height:64px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px var(--rule);overflow:hidden;flex:none}.ux-logo img,.ux-logo .crest{max-width:52px;max-height:52px}' +
    '.ux-kick{font-size:var(--f-micro);font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.85}.ux-name{font-size:var(--f-lg);font-weight:800;line-height:1.1}.ux-sm{font-size:var(--f-small);opacity:.9;font-weight:600}' +
    '.ux-offer{max-width:34ch;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ux-pills{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:2px}' +
    '.ux-pill{font-size:var(--f-small);font-weight:800;padding:3px 12px;border-radius:999px;background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text-dim)}.ux-pill.fee{background:var(--ux-acc);color:#fff}' +
    '.ux-cta{font-size:var(--f-micro);font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ux-acc);margin-top:4px;opacity:.85}.ux-stage:hover .ux-cta{opacity:1}' +
    '.ux-vs{display:flex;align-items:center;justify-content:center;gap:18px}.ux-side{display:flex;flex-direction:column;align-items:center;gap:4px;font-weight:800;font-size:var(--f-small)}.ux-side .crest{width:54px;height:54px}.ux-odds{background:rgba(0,0,0,.35);padding:2px 10px;border-radius:999px}' +
    '.ux-arrow{position:absolute;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:22px;line-height:1;cursor:pointer;z-index:2}.ux-arrow.l{left:8px}.ux-arrow.r{right:8px}.ux-arrow:hover{background:rgba(0,0,0,.6)}' +
    '.ux-dots{display:flex;gap:5px;justify-content:center;padding-bottom:6px;flex:none}.ux-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.4)}.ux-dots i.on{background:#fff}' +
    '.ux-blist{flex:none;max-height:38%;overflow:hidden;background:rgba(0,0,0,.28)}.ux-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;font-size:var(--f-small);cursor:pointer}.ux-row:hover{background:rgba(255,255,255,.12)}.ux-row .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.ux-row .v{font-weight:800;white-space:nowrap}' +
    '.tile.board.ux-click{cursor:pointer}.ux-more{font-size:var(--f-small);font-weight:800;color:var(--red);letter-spacing:.06em;text-transform:uppercase;margin-top:8px}' +
    // board window
    '.ux-bw{max-width:980px;margin:0 auto;padding:4px 4px 28px;display:flex;flex-direction:column;gap:16px}.ux-card{background:var(--card,var(--panel-2));border-radius:var(--r-sm);padding:16px 20px}' +
    '.ux-h{font-size:var(--f-label);font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--red);margin-bottom:10px}.ux-bar{height:12px;border-radius:6px;background:color-mix(in srgb,var(--text) 12%,transparent);overflow:hidden}.ux-bar i{display:block;height:100%}' +
    '.ux-bar i.good{background:var(--green)}.ux-bar i.warn{background:#e6a817}.ux-bar i.bad{background:var(--red)}.ux-st.met{color:var(--green)}.ux-st.miss{color:var(--red)}.ux-st.next{color:#e6a817}.ux-st{font-weight:800}' +
    '.ux-fb{padding:10px 0;border-bottom:1px solid var(--rule)}.ux-fb:last-child{border:0}.ux-fb small{color:var(--text-dim);font-weight:700}.ux-fb p{margin:4px 0 0;line-height:1.45}' +
    // inbox
    '.ux-ibtabs{display:flex;gap:6px;padding:8px 22px;flex-wrap:wrap;border-bottom:1px solid var(--rule)}.ux-ibtabs .n{opacity:.7;margin-left:4px}.ux-ibtabs .ptab{color:#eef1f5;opacity:.7;background:transparent;border-bottom:2px solid transparent}.ux-ibtabs .ptab.active{opacity:1;border-bottom-color:#fff}' +
    '.ux-ib-tools{display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px}.ux-star{color:#e6a817;font-size:22px;line-height:1;margin-right:6px;vertical-align:-2px}.ux-ib-tools .btn{font-size:var(--f-label)}.ux-ib-tools .btn:first-child{font-size:18px}.ux-ib-tools .btn.on{background:#e6a817;color:#14161b}';
  document.head.appendChild(st);

  const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const inDays = (n) => (n <= 0 ? tl('today') : n === 1 ? tl('tomorrow') : tl('in {n} days', { n }));
  const tmk = (x) => (typeof tm === 'function' ? tm(x) : x);

  // ---- top bar window cell ----
  const origTop = topbarHtml;
  topbarHtml = function () { // eslint-disable-line no-global-assign
    const html = origTop.apply(this, arguments);
    try {
      const w = !isPlayerMode() && S.econ && S.econ.window; if (!w) return html;
      const cur = C().currentDate;
      if (!w.open && w.nextOpens) return html.replace('<span class="win-closed">' + tl('window shut') + '</span>', '<span class="win-closed">' + esc(tl('window shut')) + ' &middot; ' + esc(tl('opens {when}', { when: inDays(daysTo(cur, w.nextOpens)) })) + '</span>');
      if (w.open && w.closesOn) return html.replace(/(<span class="win-open">[\s\S]*?)(<\/span>)/, '$1 &middot; ' + esc(tl('closes {when}', { when: inDays(daysTo(cur, w.closesOn)) })) + '$2');
    } catch (e) { /* keep original */ }
    return html;
  };

  // ---- Board expectations: the game's own window (beta.33). A Tier B club gets B-Tier Cup and regional-table targets in its two result tabs ----
  // (the engine side, btier-board.js, adds boardDetail.tierB; the other tabs are the game's own).
  const origBTName = boardTileName, origBTBlurb = boardTileBlurb, origBDHtml = boardDetailHtml;
  const bDet = () => (S && S.boardDetail && S.boardDetail.tierB) || null;
  boardTileName = function (k) { // eslint-disable-line no-global-assign
    if (bDet()) { if (k === 'domestic') return tl('B-Tier Cups'); if (k === 'continental') return tl('Promotion race'); }
    return origBTName.apply(this, arguments);
  };
  boardTileBlurb = function (k) { // eslint-disable-line no-global-assign
    if (bDet()) { if (k === 'domestic') return tl('Your results at the B-Tier Cups.'); if (k === 'continental') return tl('Your place in the regional Tier B table: the way up to Tier A.'); }
    return origBTBlurb.apply(this, arguments);
  };
  boardDetailHtml = function (d, key) { // eslint-disable-line no-global-assign
    const b = d && d.tierB;
    if (!b || (key !== 'domestic' && key !== 'continental')) return origBDHtml.apply(this, arguments);
    const st = d[key].status, pr = boardPriority(d.levels[key]);
    let body;
    if (key === 'domestic') {
      body = '<div class="bd-list">' + (b.cups.length ? b.cups.map((c) => bdRow(c.status, '<b>' + esc(tl('{event}: top {n}', { event: c.name, n: c.target })) + '</b>', c.done ? (c.placement ? esc(tl('Finished {place}', { place: bdPlace(c.placement) })) : esc(tl('Did not qualify'))) : esc(tl('To play')))).join('')
        : bdRow('none', esc(tl('No cup targets this season.')), null)) + '</div>';
    } else {
      body = '<div class="bd-list">' + (b.table ? bdRow(st, '<b>' + esc(tl('Regional table: top {n}', { n: b.table.target })) + '</b>', b.table.rank ? '<b>' + bdPlace(b.table.rank) + '</b>' : null)
        : bdRow('none', esc(tl('The board sets no table target for a club of your strength.')), null)) + '</div>';
    }
    return '<div class="fac-d-head"><div class="fac-d-name">' + esc(boardTileName(key)) + '</div><div class="fac-d-tag bd-tag-' + (pr ? pr.n : 'x') + '">' + esc(pr ? tl('{priority} priority', { priority: pr.label }) : tl('Not judged')) + '</div></div><div class="fac-d-sub">' + esc(boardTileBlurb(key)) + '</div>' + body;
  };

  // ---- Media offers / Betting tiles: hero like the News widget (one main item, arrows left/right) ----
  const hi = { media: 0, bets: 0 };
  const wrap = (n, len) => ((n % len) + len) % len;
  const arrows = (k, len) => len > 1 ? '<button type="button" class="ux-arrow l" data-action="ux-hero" data-k="' + k + '" data-d="-1" aria-label="' + esc(tl('Previous')) + '">&#8249;</button><button type="button" class="ux-arrow r" data-action="ux-hero" data-k="' + k + '" data-d="1" aria-label="' + esc(tl('Next')) + '">&#8250;</button>' : '';
  const dots = (k, len) => len > 1 ? '<div class="ux-dots">' + Array.from({ length: Math.min(len, 12) }, (_, i) => '<i' + (i === hi[k] ? ' class="on"' : '') + '></i>').join('') + '</div>' : '';
  const putHero = (html, cls, inner) => html.replace(/<div class="tile content ([^"]*)"/, (m, c) => '<div class="tile content ' + c + ' ux-tile"')
    .replace(/(<div class="tile-body">)[\s\S]*?(<\/div>\s*<\/div>\s*)$/, (m, a, z) => a + '<div class="ux-hero ' + cls + '">' + inner + '</div>' + z);
  const origMedia = mediaTileHtml;
  mediaTileHtml = function () { // eslint-disable-line no-global-assign
    const html = origMedia.apply(this, arguments);
    let offers = []; try { offers = mediaOffers(); } catch (e) { /* none */ }
    if (!offers.length) return putHero(html, '', '<div class="ux-stage"><div class="ux-name">' + esc(tl('No offers on the board.')) + '</div></div>');
    hi.media = wrap(hi.media, offers.length);
    const o = offers[hi.media];
    let mark = ''; try { mark = brandMarkHtml(o); } catch (e) { /* no mark */ }
    const days = (typeof mediaDaysLeft === 'function') ? mediaDaysLeft(o) : null;
    return putHero(html, '', '<div class="ux-stage" data-action="ux-media-open" data-id="' + o.id + '">' + arrows('media', offers.length) +
      '<div class="ux-kick">' + esc(o.accepted ? tl('Accepted') : tl('Sponsorship offer')) + '</div><div class="ux-logo">' + mark + '</div><div class="ux-name">' + esc(o.brandName || tl(o.short)) + '</div>' +
      '<div class="ux-sm ux-offer">' + esc(tl(o.short)) + '</div>' +
      '<div class="ux-pills"><span class="ux-pill fee">' + fmtMoney(o.fee) + '</span>' + (days != null ? '<span class="ux-pill">' + esc(tln('{n} day left', '{n} days left', days)) + '</span>' : '') + '</div>' +
      '<div class="ux-cta">' + esc(o.accepted ? tl('View deal') : tl('Review offer')) + ' &rarr;</div></div>' + dots('media', offers.length));
  };
  const origBets = betsTileHtml;
  betsTileHtml = function () { // eslint-disable-line no-global-assign
    const html = origBets.apply(this, arguments);
    let cards = []; try { cards = betBook().cards.filter((c) => c.kind === 'match'); } catch (e) { /* none */ }
    if (!cards.length) return putHero(html, 'bets', '<div class="ux-stage"><div class="ux-name">' + esc(tl('Nothing to bet on today.')) + '</div></div>');
    hi.bets = wrap(hi.bets, cards.length);
    const c = cards[hi.bets], h = teamById(c.homeId), a = teamById(c.awayId);
    const side = (t, id) => '<div class="ux-side">' + (t ? crest(t, 'small') : '') + '<span>' + esc(t ? t.abbrev || t.name : '?') + '</span><span class="ux-odds">' + betOddsText(c.odds[id]) + '</span></div>';
    const rest = cards.map((x, i) => [x, i]).filter(([, i]) => i !== hi.bets).slice(0, 4).map(([x, i]) => {
      const th = teamById(x.homeId), ta = teamById(x.awayId);
      return '<div class="ux-row" data-action="ux-bet-open" data-key="' + esc(betKeyOf(x)) + '"><span class="t">' + esc((th ? th.abbrev || th.name : '?') + ' v ' + (ta ? ta.abbrev || ta.name : '?')) + '</span><span class="v">' + betOddsText(x.odds[x.homeId]) + ' / ' + betOddsText(x.odds[x.awayId]) + '</span></div>';
    }).join('');
    return putHero(html, 'bets', '<div class="ux-stage" data-action="ux-bet-open" data-key="' + esc(betKeyOf(c)) + '">' + arrows('bets', cards.length) +
      '<div class="ux-kick">' + esc((c.eventName || tl('Match')) + ' · ' + fmtDayMonth(c.date)) + '</div><div class="ux-vs">' + side(h, c.homeId) + '<span class="ux-name">v</span>' + side(a, c.awayId) + '</div></div>' + dots('bets', cards.length) +
      (rest ? '<div class="ux-blist">' + rest + '</div>' : ''));
  };

  // ---- Inbox tabs ----
  const KEY = () => 'uxInbox:' + C().userTeamId + ':' + C().startDate;
  let store = null, storeKey = '';
  const load = () => {
    if (store && storeKey === KEY()) return store;
    storeKey = KEY(); store = { star: [], arch: [] };
    try { const raw = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (raw) store = { star: raw.star || [], arch: raw.arch || [] }; } catch (e) { /* no storage */ }
    return store;
  };
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) { /* no storage */ } };
  const IMPORTANT = new Set(['board', 'objectives', 'review', 'offer_in', 'fee_accepted', 'contract_expiring', 'contract_rejected', 'morale_angry', 'morale_wantsout', 'intl_offer', 'promise_broken']);
  const isImportant = (m) => { try { if (msgNeedsYou(m, C())) return true; } catch (e) { /* ignore */ } return IMPORTANT.has(m.type); };
  const TABS = [['all', 'All'], ['important', 'Important'], ['starred', 'Starred'], ['archive', 'Archive']];
  let ibTab = 'all';
  const bucket = (m, tab, s) => {
    const arch = s.arch.indexOf(m.id) >= 0;
    if (tab === 'archive') return arch;
    if (arch) return false;
    return tab === 'important' ? isImportant(m) : tab === 'starred' ? s.star.indexOf(m.id) >= 0 : true;
  };
  { const sx = document.createElement('style'); sx.textContent = '.ib-row.ux-imp .ib-mark{box-shadow:0 0 0 2px #e6a817;color:#e6a817}.ib-row.ux-imp.unread .ib-mark{background:#e6a817!important;color:#15181f!important;font-weight:900}.ib-row.ux-imp.unread{background:color-mix(in srgb,#e6a817 14%,transparent)}'; document.head.appendChild(sx); }
  const origPane = inboxPaneHtml;
  inboxPaneHtml = function () { // eslint-disable-line no-global-assign
    const c = C(), s = load(), all = c.inbox || [];
    const tabs = '<div class="ptabs ux-ibtabs">' + TABS.map(([k, n]) => '<button type="button" class="ptab' + (k === ibTab ? ' active' : '') + '" data-action="ux-ib-tab" data-tab="' + k + '">' + esc(tl(n)) +
      '<span class="n">' + all.filter((m) => bucket(m, k, s)).length + '</span></button>').join('') + '</div>';
    const shown = all.filter((m) => bucket(m, ibTab, s));
    if (!shown.length) return tabs + '<div class="ib-split"><div class="ib-empty">' + esc(ibTab === 'all' ? tl('Nothing waiting.') : ibTab === 'important' ? tl('Nothing important right now.') : ibTab === 'starred' ? tl('No starred messages. Open a message and press Star.') : tl('The archive is empty.')) + '</div></div>';
    c.inbox = shown;
    let html;
    try { html = origPane.apply(this, arguments); } finally { c.inbox = all; }
    const open = typeof inboxOpenId !== 'undefined' ? inboxOpenId : null;
    const starred = s.star.indexOf(open) >= 0, arch = s.arch.indexOf(open) >= 0;
    const tools = '<div class="ux-ib-tools"><button type="button" class="btn sm ghost' + (starred ? ' on' : '') + '" data-action="ux-ib-star" data-mid="' + open + '">&#9733; ' + esc(starred ? tl('Starred') : tl('Star')) + '</button>' +
      '<button type="button" class="btn sm ghost" data-action="ux-ib-arch" data-mid="' + open + '">' + esc(arch ? tl('Move to inbox') : tl('Archive')) + '</button></div>';
    html = html.replace('<div class="ib-read-body">', tools + '<div class="ib-read-body">');
    // important messages stand out in every tab: a yellow ring on the mark, filled yellow with "!" while unread
    const imp = new Set(all.filter(isImportant).map((m) => m.id));
    html = html.replace(/<div class="(ib-row[^"]*)"( data-action="inbox-open" data-mid="(\d+)"[^>]*>)<span class="ib-mark([^"]*)" aria-hidden="true">([^<]*)<\/span>/g, (m0, cls, mid, id, mark, inner) =>
      (imp.has(Number(id)) ? '<div class="' + cls + ' ux-imp"' + mid + '<span class="ib-mark' + mark + '" aria-hidden="true">' + (inner || '!') + '</span>' : m0));
    html = html.replace(/(<div class="ib-row[^"]*" data-action="inbox-open" data-mid="(\d+)"[^>]*>)/g, (m0, tag, id) => tag + (s.star.indexOf(Number(id)) >= 0 ? '<span class="ux-star" title="' + esc(tl('Starred')) + '">&#9733;</span>' : ''));
    return tabs + html;
  };
  const origRows = inboxRowsHtml;
  inboxRowsHtml = function () { // eslint-disable-line no-global-assign
    const c = C(), s = load(), all = c.inbox || [];
    c.inbox = all.filter((m) => s.arch.indexOf(m.id) < 0);
    try { return origRows.apply(this, arguments); } finally { c.inbox = all; }
  };

  // Opening a message (or the Inbox tab) marks only the message on screen as read, not the whole inbox: tell the engine which one before the game's own call
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action="inbox-open"],[data-action="tab"][data-tab="inbox"]'); if (!a) return;
    const box = C().inbox || [];
    const id = a.dataset.action === 'inbox-open' ? Number(a.dataset.mid) : (typeof inboxOpenId !== 'undefined' && box.some((m) => m.id === inboxOpenId) ? inboxOpenId : (box[box.length - 1] || {}).id);
    if (id != null) window.hub.placeBet({ kind: 'uxc:' + JSON.stringify({ a: 'inboxonly', id }), ref: 0, teamId: 0, stake: 0 });
  }, true);
  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const a = t.closest('[data-action^="ux-"]'); if (!a) return;
    const act = a.dataset.action;
    if (['ux-media-open', 'ux-bet-open', 'ux-hero', 'ux-ib-tab', 'ux-ib-star', 'ux-ib-arch'].indexOf(act) < 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (act === 'ux-media-open') { mediaPick = Number(a.dataset.id); bigList = 'media'; officeOpen = false; windowJustOpened = true; render(); return; }
    if (act === 'ux-bet-open') { betPick = a.dataset.key; betSide = null; bigList = 'bets'; officeOpen = false; windowJustOpened = true; render(); return; }
    if (act === 'ux-hero') { hi[a.dataset.k] += Number(a.dataset.d); render(); return; }
    const s = load();
    if (act === 'ux-ib-tab') ibTab = a.dataset.tab;
    else {
      const id = Number(a.dataset.mid), list = act === 'ux-ib-star' ? s.star : s.arch, i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      save();
    }
    render();
  }, true);
  try { render(); } catch (e) { /* no career open yet */ }
})();
