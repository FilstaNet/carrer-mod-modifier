// Betting menu round, renderer side (injected after ux-social-ui.js; wraps the game's own betSlipHtml):
// picking a match shows Basic / Advanced markets (priced and settled by src/engine/ux-bets.js). One pick per market, picks from different
// markets combine into one bet (odds multiply). Only picks that contradict or duplicate each other (e.g. winner + correct score) replace each other.
// A single Match-winner pick is still the game's own 'match' bet; everything else goes through the same hub.placeBet as kind 'mk:<codes>'.
// Combined odds come from the engine (joint chance of the picks), asked through a quote call; Parlay tab = 2-4 different matches; History tab = the
// whole betting archive with filters and bankroll analytics; the settled list under the slip is gone. Events (outrights) keep the game's slip.
(function () {
  'use strict';
  if (window.__uxBetsUI) return;
  if (typeof betSlipHtml !== 'function' || typeof betOpenHtml !== 'function' || typeof betBook !== 'function') return;
  window.__uxBetsUI = true;
  const MAX_LEGS = 4, MAX_PARLAY = 4;

  const st = document.createElement('style');
  st.textContent =
    // fixed-size window: nothing scrolls or drifts except the lists inside it
    '.office-window.ow-bets .ow-screen{overflow:hidden}.two-blocks.bets-screen{grid-template-columns:minmax(0,1fr) minmax(540px,52%);height:100%;max-height:min(100%,900px);overflow:hidden;align-items:stretch}' +
    '.bets-screen .tb-light{overflow:auto;min-height:0}.bets-screen .tb-scroll:has(.ux-slip){display:flex;flex-direction:column;overflow:hidden}' +
    '.ux-slip{display:flex;flex-direction:column;flex:1;min-height:0;gap:10px}.ux-fixed{flex:none;display:grid;gap:10px}' +
    '.ux-mode{display:flex;gap:4px}.ux-mode button{flex:1;border:0;font:inherit;font-size:var(--f-label);font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:10px 12px;cursor:pointer;background:rgba(255,255,255,.06);color:inherit;border-bottom:3px solid transparent}' +
    '.ux-mode button.on{background:rgba(255,255,255,.14);border-bottom-color:var(--accent)}.ux-mode small{display:block;font-size:var(--f-micro);font-weight:600;letter-spacing:.04em;text-transform:none;opacity:.7;margin-top:2px}' +
    '.ux-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px;padding-right:4px}.ux-mk{border-top:1px solid rgba(255,255,255,.12);padding:8px 0}' +
    '.ux-mk-h{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;background:transparent;color:inherit;font:inherit;font-weight:800;letter-spacing:.04em;text-align:left;cursor:pointer;padding:6px 0}' +
    '.ux-mk-h i{font-style:normal;opacity:.6;font-size:var(--f-small)}.ux-mk-h .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-left:8px}.ux-mk-n{font-size:var(--f-small);color:var(--text-dim);margin:0 0 6px}' +
    '.ux-opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:3px;margin-top:4px}.ux-opts .bt-runner{padding:8px 10px}' +
    // the slip bar is its own block under the scrolling list (not floating over it), so nothing shows through
    '.ux-slipbar{flex:none;padding:12px 4px 4px;border-top:2px solid var(--accent);display:grid;gap:8px;background:rgba(0,0,0,.18)}' +
    '.ux-picks{display:grid;gap:3px;max-height:96px;overflow:auto}.ux-pick{display:flex;justify-content:space-between;gap:12px;font-size:var(--f-small);font-weight:700}.ux-pick span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ux-pick b{white-space:nowrap}' +
    '.ux-total{display:flex;justify-content:space-between;font-weight:800}.ux-none{opacity:.7}' +
    '.ux-views{display:flex;gap:4px;flex:none}.ux-views button{flex:1;border:0;font:inherit;font-size:var(--f-label);font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:9px 10px;cursor:pointer;background:transparent;color:inherit;opacity:.65;border-bottom:2px solid rgba(255,255,255,.18)}' +
    '.ux-views button.on{opacity:1;border-bottom-color:var(--accent)}' +
    '.ux-warn{flex:none;padding:7px 10px;font-size:var(--f-small);font-weight:700;border-left:3px solid #e6a817;background:rgba(230,168,23,.14)}.ux-warn.bad{border-left-color:var(--red);background:rgba(220,60,60,.18)}' +
    '.ux-err{color:var(--red);font-size:var(--f-small);font-weight:700}.ux-pl{display:grid;gap:3px;padding:8px 0;border-top:1px solid rgba(255,255,255,.12)}.ux-pl-h{display:flex;justify-content:space-between;gap:10px;font-size:var(--f-small);color:var(--text-dim);font-weight:700}' +
    '.ux-pl-t{font-weight:800}.ux-pl .ux-opts{grid-template-columns:1fr 1fr;margin-top:2px}.ux-opt[disabled]{opacity:.45;cursor:not-allowed}' +
    '.ux-hs{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;margin:2px 0 6px}.ux-hs .c{background:rgba(255,255,255,.07);padding:7px 9px}.ux-hs .v{font-size:var(--f-lg);font-weight:800;line-height:1.1}.ux-hs .k{font-size:var(--f-micro);letter-spacing:.1em;text-transform:uppercase;opacity:.7;font-weight:700}.ux-hs .v.up{color:var(--green)}.ux-hs .v.down{color:var(--red)}' +
    '.ux-hf{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:6px 0}.ux-hf select{font:inherit;font-size:var(--f-small);padding:6px 8px;background:rgba(255,255,255,.08);color:inherit;border:1px solid rgba(255,255,255,.2)}.ux-hf select option{color:#111}' +
    '.ux-st{width:100%;border-collapse:collapse;font-size:var(--f-small)}.ux-st th,.ux-st td{padding:4px 6px;text-align:right}.ux-st th:first-child,.ux-st td:first-child{text-align:left}.ux-st th{font-size:var(--f-micro);letter-spacing:.1em;text-transform:uppercase;opacity:.7}' +
    '.ux-hr{border-top:1px solid rgba(255,255,255,.12);padding:7px 0;display:grid;gap:2px}.ux-hr-m{display:flex;justify-content:space-between;gap:10px;font-weight:700;font-size:var(--f-small)}.ux-hr-m span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}.ux-hr-s{display:flex;justify-content:space-between;gap:10px;font-size:var(--f-micro);opacity:.7}' +
    '.ux-hr .won{color:var(--green)}.ux-hr .lost{color:var(--red)}.ux-hr .void,.ux-hr .open{opacity:.8}.ux-hl{font-size:var(--f-micro);opacity:.85;padding-left:10px}.ux-hl.won{color:var(--green)}.ux-hl.lost{color:var(--red)}' +
    '.ux-h3{font-size:var(--f-micro);letter-spacing:.14em;text-transform:uppercase;opacity:.7;font-weight:800;margin:8px 0 2px}.ux-more{width:100%;padding:8px;margin-top:6px;border:0;cursor:pointer;font:inherit;font-weight:800;background:rgba(255,255,255,.1);color:inherit}' +
    '@media (max-height:760px){.ux-picks{max-height:52px}.ux-slipbar{gap:5px;padding-top:8px}.ux-slipbar .bt-stake-in{padding:5px 10px;font-size:var(--f-body)}.ux-slipbar .bt-place{padding:8px 14px}}';
  document.head.appendChild(st);

  let mode = 'basic', picks = {}, selFor = null; const toggled = {};
  let view = 'match', quote = null, pquote = null, parlay = {}, hist = null, histKey = '', hf = { status: 'all', season: 'all', comp: 'all', team: 'all', n: 60 };
  const hub = () => window.hub;
  const auditOf = () => { try { return betBook().audit || null; } catch (e) { return null; } };
  const card = () => { try { return betCardByKey(betPick); } catch (e) { return null; } };
  const isOpen = (m, i) => (toggled[m.id] != null ? toggled[m.id] : m.group === 'basic' || i < 4);
  const stakeNum = () => Math.max(0, Math.round(Number(String(betStake).replace(/[^0-9]/g, '')) || 0));
  const legs = () => Object.values(picks);
  const sigOf = () => (selFor || '') + '|' + legs().map((p) => p.code).sort((a, b) => a - b).join(',');
  const total = () => { const L = legs(); if (L.length === 1) return L[0].odds; return quote && quote.sig === sigOf() && quote.odds ? quote.odds : null; };
  async function askQuote() { // combined odds are priced by the engine from the joint chance of the picks
    const L = legs(), c = card(); if (L.length < 2 || !c) { quote = null; return; }
    const sig = sigOf(); quote = { sig, pending: true };
    let r = null; try { r = await hub().placeBet({ kind: 'mkq:' + L.map((p) => p.code).join(','), ref: c.ref, teamId: 0, stake: 0 }); } catch (e) { r = null; }
    if (sigOf() !== sig) return;
    quote = { sig, ...((r && r.quote) || { error: 'No quote.' }) }; refresh();
  }
  const pairs = () => Object.values(parlay);
  const psig = () => pairs().map((p) => p.ref + '.' + p.code).sort().join(',');
  const ptotal = () => (pquote && pquote.sig === psig() && pquote.odds ? pquote.odds : null);
  async function askParlay() {
    const P = pairs(); if (P.length < 2) { pquote = null; return; }
    const sig = psig(); pquote = { sig, pending: true };
    let r = null; try { r = await hub().placeBet({ kind: 'mpq:' + P.map((p) => p.ref + '.' + p.code).join(','), ref: 0, teamId: 0, stake: 0 }); } catch (e) { r = null; }
    if (psig() !== sig) return;
    pquote = { sig, ...((r && r.quote) || { error: 'No quote.' }) }; refresh();
  }
  async function loadHistory() {
    const bb = betBook(), key = (bb.open || []).length + ':' + bb.staked + ':' + bb.returned + ':' + (S && S.career ? S.career.currentDate : '');
    if (hist && histKey === key) return; histKey = key;
    try { const r = await hub().placeBet({ kind: 'mkh', ref: 0, teamId: 0, stake: 0 }); if (r && r.history) { hist = r.history; refresh(); } } catch (e) { /* keep the old archive */ }
  }
  const money = (n) => (n < 0 ? '-' : '') + fmtMoney(Math.abs(Math.round(n)));
  const pct = (v) => (v == null ? '&mdash;' : (v * 100).toFixed(1) + '%');
  const viewBar = () => '<div class="ux-views">' + [['match', 'Match'], ['parlay', 'Parlay'], ['history', 'History']].map(([k, t]) => '<button type="button" class="' + (view === k ? 'on' : '') + '" data-action="ux-bet-view" data-view="' + k + '">' + esc(tl(t)) + '</button>').join('') + '</div>';
  const warnHtml = () => {
    const a = auditOf(); if (!a) return '';
    if (a.frozenUntil) return '<div class="ux-warn bad">' + esc(tl('RLCS Integrity has frozen your betting until {date}.', { date: a.frozenUntil })) + '</div>';
    if (a.level === 'high') return '<div class="ux-warn bad" title="' + esc((a.reasons || []).join(' ')) + '">' + esc(tl('Integrity watch: high. An audit may follow.')) + '</div>';
    if (a.level === 'elevated') return '<div class="ux-warn" title="' + esc((a.reasons || []).join(' ')) + '">' + esc(tl('Integrity watch: your betting is getting noticed.')) + '</div>';
    return '';
  };
  const frozen = () => { const a = auditOf(); return !!(a && a.frozenUntil); };
  const refresh = () => { if (typeof renderWindows === 'function') renderWindows(); else render(); };

  const origSlip = betSlipHtml;
  betSlipHtml = function (c) { // eslint-disable-line no-global-assign
    if (!c || c.kind !== 'match' || !c.markets) return origSlip.apply(this, arguments);
    if (selFor !== c.ref) { picks = {}; selFor = c.ref; }
    const book = betBook(), home = teamById(c.homeId), away = teamById(c.awayId);
    const list = c.markets.filter((m) => m.group === mode);
    const markets = list.map((m, i) => {
      const open = isOpen(m, i), chosen = picks[m.id];
      const opts = open ? '<div class="ux-opts">' + m.options.map((o) => {
        const k = m.id + ':' + o.code;
        return '<button type="button" class="bt-runner ux-opt' + (chosen && chosen.k === k ? ' on' : '') + '" data-action="ux-bet-sel" data-k="' + k + '" data-m="' + esc(m.id) + '"><span class="bt-runner-name">' + esc(o.label) + '</span><span class="bt-runner-odds">' + betOddsText(o.odds) + '</span></button>';
      }).join('') + '</div>' + (m.note ? '<div class="ux-mk-n">' + esc(tl(m.note)) + '</div>' : '') : '';
      return '<section class="ux-mk"><button type="button" class="ux-mk-h" data-action="ux-mk-toggle" data-id="' + esc(m.id) + '" data-d="' + (m.group === 'basic' || i < 4 ? 1 : 0) + '"><span>' + esc(tl(m.title)) + (chosen ? '<span class="dot"></span>' : '') + '</span><i>' + (open ? '&#9662;' : '&#9656;') + '</i></button>' + opts + '</section>';
    }).join('');
    const L = legs(), amt = stakeNum(), odds = total(), q = L.length > 1 && quote && quote.sig === sigOf() ? quote : null, ok = L.length > 0 && odds != null && !frozen() && amt >= book.min && amt <= Math.min(book.budget, Math.max(book.min, Math.floor(book.budget * 0.25)));
    const pickRows = L.length ? L.map((p) => '<div class="ux-pick"><span>' + esc(p.label) + '</span><b>' + betOddsText(p.odds) + '</b></div>').join('') : '<div class="ux-pick ux-none"><span>' + esc(tl('Pick one option per market. Picks from different markets combine (up to {n}).', { n: MAX_LEGS })) + '</span></div>';
    const bar = '<div class="ux-slipbar"><div class="ux-picks">' + pickRows + '</div>' +
      (L.length > 1 ? '<div class="ux-total"><span>' + esc(tl('Combined odds ({n} picks)', { n: L.length })) + '</span><span>' + (odds != null ? betOddsText(odds) : '&hellip;') + '</span></div>' + (q && q.error ? '<div class="ux-err">' + esc(tl(q.error)) + '</div>' : '') : '') +
      '<div class="bt-stake"><label class="bt-stake-k" for="ux-bet-stake">' + esc(tl('Stake')) + '</label><input id="ux-bet-stake" class="bt-stake-in" type="text" inputmode="numeric" value="' + esc(betStake) + '" placeholder="' + book.min + '" autocomplete="off"><div class="bt-stake-out ux-out">' +
      (L.length && amt && odds != null ? esc(tl('Returns {money}', { money: fmtMoney(Math.round(amt * odds)) })) : esc(tl('Minimum {money}', { money: fmtMoney(book.min) }))) + '</div></div>' +
      '<button class="bt-place ux-place" type="button"' + (ok ? '' : ' disabled') + ' data-action="ux-bet-place">' + (amt ? esc(tl('Place {money}', { money: fmtMoney(amt) })) : esc(tl('Place bet'))) + '</button>' +
      '<div class="bt-budget">' + esc(tl('Transfer budget {money}', { money: fmtMoney(book.budget) })) + '</div></div>';
    return '<div class="bt-slip ux-slip"><div class="ux-fixed"><div class="bt-slip-head"><div class="bt-slip-kind">' + esc(c.eventName || tl('Match')) + '</div><div class="bt-slip-title">' + esc(tl('{home} v {away}', { home: home ? home.name : '?', away: away ? away.name : '?' })) + '</div></div>' +
      '<div class="ux-mode"><button type="button" class="' + (mode === 'basic' ? 'on' : '') + '" data-action="ux-bet-mode" data-mode="basic">' + esc(tl('Basic')) + '<small>' + esc(tl('Quick bets')) + '</small></button>' +
      '<button type="button" class="' + (mode === 'advanced' ? 'on' : '') + '" data-action="ux-bet-mode" data-mode="advanced">' + esc(tl('Advanced')) + '<small>' + esc(tl('Every market')) + '</small></button></div></div>' +
      '<div class="ux-body">' + markets + betOpenHtml() + '</div>' + bar + '</div>';
  };

  // ---- running bets only (the settled list moved to the History tab) ----
  betOpenHtml = function () { // eslint-disable-line no-global-assign
    const open = betBook().open || []; if (!open.length) return '';
    const rows = open.map((b) => {
      const t = teamById(b.teamId), legsHtml = (b.legs || []).map((l) => '<div class="ux-hl' + (l.settled ? (l.won ? ' won' : l.won === false ? ' lost' : '') : '') + '">' + (l.settled ? (l.won ? '&#10003; ' : l.won === false ? '&#10007; ' : '&ndash; ') : '&bull; ') + esc(l.label) + '</div>').join('');
      return '<div class="bt-open-row"><span class="bt-open-team">' + esc(b.parlay ? tl('Parlay') : t ? t.name : '?') + '</span><span class="bt-open-note">' + esc(b.label) + '</span><span class="bt-open-odds">' + fmtMoney(b.stake) + ' @ ' + betOddsText(b.odds) + '</span></div>' + (b.parlay ? legsHtml : '');
    }).join('');
    return '<div class="bt-open"><div class="bt-open-k">' + esc(tl('Running')) + '</div>' + rows + '</div>';
  };

  // ---- Parlay: one winner pick on each of 2-4 different matches ----
  function parlayHtml() {
    const book = betBook(), P = pairs(), amt = stakeNum(), odds = ptotal(), q = P.length > 1 && pquote && pquote.sig === psig() ? pquote : null;
    const cap = Math.min(book.budget, Math.max(book.min, Math.floor(book.budget * 0.25)));
    const ok = P.length >= 2 && odds != null && !frozen() && amt >= book.min && amt <= cap;
    const openRefs = new Set((book.open || []).flatMap((b) => (b.parlay ? b.legs.filter((l) => !l.settled).map((l) => l.ref) : [b.ref])));
    const rows = (book.cards || []).filter((c) => c.kind === 'match' && c.markets).map((c) => {
      const h = teamById(c.homeId), a = teamById(c.awayId), w = c.markets.find((m) => m.id === 'winner'), taken = openRefs.has(c.ref), sel = parlay[c.ref];
      const btn = (o, t) => '<button type="button" class="bt-runner ux-opt' + (sel && sel.code === o.code ? ' on' : '') + '"' + (taken ? ' disabled' : '') + ' data-action="ux-bet-pl-sel" data-ref="' + c.ref + '" data-code="' + o.code + '"><span class="bt-runner-name">' + esc(t ? t.name : '?') + '</span><span class="bt-runner-odds">' + betOddsText(o.odds) + '</span></button>';
      return '<section class="ux-pl"><div class="ux-pl-h"><span>' + esc(c.eventName || tl('Match')) + '</span><span>' + esc(fmtDayMonth(c.date)) + '</span></div><div class="ux-opts">' + btn(w.options[0], h) + btn(w.options[1], a) + '</div></section>';
    }).join('') || '<div class="ux-none">' + esc(tl('Nothing to bet on today.')) + '</div>';
    const pickRows = P.length ? P.map((p) => '<div class="ux-pick"><span>' + esc(p.label) + '</span><b>' + betOddsText(p.odds) + '</b></div>').join('') : '<div class="ux-pick ux-none"><span>' + esc(tl('Pick a winner in 2 to {n} different matches.', { n: MAX_PARLAY })) + '</span></div>';
    const bar = '<div class="ux-slipbar"><div class="ux-picks">' + pickRows + '</div>' +
      (P.length > 1 ? '<div class="ux-total"><span>' + esc(tl('Parlay multiplier ({n} legs)', { n: P.length })) + '</span><span>' + (odds != null ? betOddsText(odds) : '&hellip;') + '</span></div>' + (q && q.error ? '<div class="ux-err">' + esc(tl(q.error)) + '</div>' : '') : '') +
      '<div class="bt-stake"><label class="bt-stake-k" for="ux-bet-stake">' + esc(tl('Stake')) + '</label><input id="ux-bet-stake" class="bt-stake-in" type="text" inputmode="numeric" value="' + esc(betStake) + '" placeholder="' + book.min + '" autocomplete="off"><div class="bt-stake-out ux-out">' +
      (P.length > 1 && amt && odds != null ? esc(tl('Returns {money}', { money: fmtMoney(Math.round(amt * odds)) })) : esc(tl('Minimum {money}', { money: fmtMoney(book.min) }))) + '</div></div>' +
      '<button class="bt-place ux-place" type="button"' + (ok ? '' : ' disabled') + ' data-action="ux-bet-pl-place">' + (amt ? esc(tl('Place {money}', { money: fmtMoney(amt) })) : esc(tl('Place parlay'))) + '</button>' +
      '<div class="bt-budget">' + esc(tl('Transfer budget {money}', { money: fmtMoney(book.budget) })) + '</div></div>';
    return '<div class="bt-slip ux-slip"><div class="ux-fixed">' + viewBar() + warnHtml() + '</div><div class="ux-body">' + rows + betOpenHtml() + '</div>' + bar + '</div>';
  }

  // ---- History: the whole archive, filterable, with bankroll analytics ----
  function historyHtml() {
    loadHistory();
    const shell = (body) => '<div class="bt-slip ux-slip"><div class="ux-fixed">' + viewBar() + warnHtml() + '</div><div class="ux-body">' + body + '</div></div>';
    if (!hist) return shell('<div class="ux-none" style="padding:18px">' + esc(tl('Loading…')) + '</div>');
    const s = hist.stats, chip = (v, k, cls) => '<div class="c"><div class="v ' + (cls || '') + '">' + v + '</div><div class="k">' + esc(tl(k)) + '</div></div>';
    const sel = (key, label, opts) => '<select class="ux-hfs" data-k="' + key + '" aria-label="' + esc(tl(label)) + '"><option value="all">' + esc(tl(label)) + '</option>' + opts.map(([v, t]) => '<option value="' + esc(String(v)) + '"' + (String(hf[key]) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
    const list = hist.entries.filter((e) => (hf.status === 'all' || e.status === hf.status) && (hf.season === 'all' || String(e.season) === hf.season) && (hf.comp === 'all' || e.comp === hf.comp) && (hf.team === 'all' || e.teams.indexOf(hf.team) >= 0));
    const done = list.filter((e) => e.status === 'won' || e.status === 'lost'), staked = done.reduce((a, e) => a + e.stake, 0), back = done.reduce((a, e) => a + e.returned, 0);
    const res = (e) => e.status === 'won' ? '+' + fmtMoney(e.returned - e.stake) : e.status === 'lost' ? '-' + fmtMoney(e.stake) : e.status === 'void' ? tl('void') : tl('running');
    const rows = list.slice(0, hf.n).map((e) => '<div class="ux-hr"><div class="ux-hr-m"><span>' + esc(e.label) + '</span><span class="' + e.status + '">' + esc(res(e)) + '</span></div>' +
      '<div class="ux-hr-s"><span>' + esc((e.comp ? e.comp + ' · ' : '') + (e.settled || e.placed)) + '</span><span>' + fmtMoney(e.stake) + ' @ ' + betOddsText(e.odds) + '</span></div>' +
      (e.legs && e.legs.length ? e.legs.map((l) => '<div class="ux-hl' + (l.won ? ' won' : l.won === false ? ' lost' : '') + '">' + (l.settled ? (l.won ? '&#10003; ' : l.won === false ? '&#10007; ' : '&ndash; ') : '&bull; ') + esc(l.label) + (l.won === false && l.actual ? ' &rarr; ' + esc(l.actual) : '') + '</div>').join('') : e.status === 'lost' ? '<div class="ux-hl lost">' + esc(tl('Your pick')) + ': ' + esc(e.label) + (e.actual ? ' &rarr; ' + esc(e.actual) : '') + '</div>' : '') + '</div>').join('');
    const seasons = s.seasons.length ? '<table class="ux-st"><thead><tr><th>' + esc(tl('Season')) + '</th><th>' + esc(tl('Bets')) + '</th><th>' + esc(tl('Won')) + '</th><th>' + esc(tl('Staked')) + '</th><th>' + esc(tl('Profit')) + '</th></tr></thead><tbody>' +
      s.seasons.map((x) => '<tr><td>' + (x.season != null ? esc(tl('Season {n}', { n: x.season })) : esc(tl('Earlier'))) + '</td><td>' + x.bets + '</td><td>' + x.wins + '</td><td>' + fmtMoney(x.staked) + '</td><td class="' + (x.profit >= 0 ? 'won' : 'lost') + '">' + money(x.profit) + '</td></tr>').join('') + '</tbody></table>' : '';
    const stk = s.currentStreak > 0 ? tl('{n} wins', { n: s.currentStreak }) : s.currentStreak < 0 ? tl('{n} losses', { n: -s.currentStreak }) : '&mdash;';
    return shell('<div class="ux-hs">' + chip(s.settled, 'Settled') + chip(pct(s.winRate), 'Win rate') + chip(s.roi == null ? '&mdash;' : (s.roi >= 0 ? '+' : '') + (s.roi * 100).toFixed(1) + '%', 'ROI', s.roi > 0 ? 'up' : s.roi < 0 ? 'down' : '') + chip(money(s.profit), 'Profit', s.profit > 0 ? 'up' : s.profit < 0 ? 'down' : '') +
      chip(s.bestStreak + ' / ' + s.worstStreak, 'Best win / loss streak') + chip(stk, 'Current streak') + chip(s.underdog ? betOddsText(s.underdog.odds) : '&mdash;', 'Biggest underdog hit') + chip(s.biggestWin ? money(s.biggestWin.profit) : '&mdash;', 'Biggest win') + '</div>' +
      (seasons ? '<div class="ux-h3">' + esc(tl('Season by season')) + '</div>' + seasons : '') +
      '<div class="ux-h3">' + esc(tl('Archive')) + ' (' + list.length + ')</div><div class="ux-hf">' +
      sel('status', 'Result', [['won', tl('Won')], ['lost', tl('Lost')], ['void', tl('Voided')], ['open', tl('Running')]]) + sel('season', 'Season', hist.seasons.map((x) => [x, tl('Season {n}', { n: x })])) +
      sel('comp', 'Competition', hist.comps.map((x) => [x, x])) + sel('team', 'Team', hist.teams.map((x) => [x, x])) + '</div>' +
      (done.length && list.length !== hist.entries.length ? '<div class="ux-hr-s"><span>' + esc(tl('Filtered: {n} settled', { n: done.length })) + '</span><span>' + fmtMoney(staked) + ' &rarr; ' + fmtMoney(back) + ' (' + money(back - staked) + ')</span></div>' : '') +
      (rows || '<div class="ux-none" style="padding:12px 0">' + esc(tl('No bets match.')) + '</div>') + (list.length > hf.n ? '<button type="button" class="ux-more" data-action="ux-bet-more">' + esc(tl('Show more')) + '</button>' : ''));
  }

  const matchSlip = betSlipHtml;
  betSlipHtml = function (c) { // eslint-disable-line no-global-assign
    if (view === 'history') return historyHtml();
    if (view === 'parlay') return parlayHtml();
    const h = matchSlip.apply(this, arguments);
    const bar = viewBar() + warnHtml();
    if (h.indexOf('<div class="ux-fixed">') >= 0) return h.replace('<div class="ux-fixed">', '<div class="ux-fixed">' + bar);
    return '<div class="bt-slip ux-slip"><div class="ux-fixed">' + bar + '</div><div class="ux-body">' + h + '</div></div>';
  };

  document.addEventListener('change', (e) => {
    const t = e.target; if (!t || !t.classList || !t.classList.contains('ux-hfs')) return;
    e.stopImmediatePropagation(); hf[t.dataset.k] = t.value; hf.n = 60; refresh();
  }, true);

  document.addEventListener('click', async (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-action^="ux-bet-"],[data-action="ux-mk-toggle"]');
    if (!a) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const act = a.dataset.action, c = card();
    const keep = () => { const b = document.querySelector('.ux-body'); return b ? b.scrollTop : 0; };
    const top = keep(), restore = () => { const b = document.querySelector('.ux-body'); if (b) b.scrollTop = top; };
    if (act === 'ux-bet-mode') { mode = a.dataset.mode; refresh(); return; }
    if (act === 'ux-bet-view') { view = a.dataset.view; refresh(); return; }
    if (act === 'ux-bet-more') { hf.n += 60; refresh(); return; }
    if (act === 'ux-bet-pl-sel') {
      const ref = Number(a.dataset.ref), code = Number(a.dataset.code), cc = (betBook().cards || []).find((x) => x.ref === ref), m = cc && cc.markets.find((x) => x.id === 'winner'), o = m && m.options.find((x) => x.code === code);
      if (!o) return;
      if (parlay[ref] && parlay[ref].code === code) delete parlay[ref];
      else {
        if (!parlay[ref] && Object.keys(parlay).length >= MAX_PARLAY) { showToast(tl('A parlay can have up to {n} legs.', { n: MAX_PARLAY })); return; }
        const t = teamById(o.teamId);
        parlay[ref] = { ref, code, odds: o.odds, label: tl('{home} v {away}', { home: teamById(cc.homeId) ? teamById(cc.homeId).name : '?', away: teamById(cc.awayId) ? teamById(cc.awayId).name : '?' }) + ' · ' + (t ? t.name : '?') };
      }
      pquote = null; refresh(); restore(); askParlay(); return;
    }
    if (act === 'ux-bet-pl-place') {
      const P = pairs(); if (P.length < 2 || ptotal() == null) return;
      const r = await hub().placeBet({ kind: 'mp:' + P.map((p) => p.ref + '.' + p.code).join(','), ref: 0, teamId: 0, stake: stakeNum() });
      if (r && r.ok === false) { showToast(r.error || tl('That bet was refused.')); return; }
      S = r; betStake = ''; parlay = {}; pquote = null; hist = null;
      showToast(tl('On at {odds}.', { odds: Number(r.bet.odds).toFixed(2) }));
      refresh(); return;
    }
    if (act === 'ux-mk-toggle') { const id = a.dataset.id; const def = a.dataset.d === '1'; toggled[id] = toggled[id] != null ? !toggled[id] : !def; refresh(); restore(); return; }
    if (!c) return;
    if (act === 'ux-bet-sel') {
      const m = c.markets.find((x) => x.id === a.dataset.m), o = m && m.options.find((x) => m.id + ':' + x.code === a.dataset.k);
      if (!o) return;
      if (picks[m.id] && picks[m.id].k === a.dataset.k) delete picks[m.id];
      else {
        // a pick that contradicts or duplicates an earlier one replaces it
        const R = window.__uxBetRules, side = m.id === 'hteam' ? 'h' : m.id === 'ateam' ? 'a' : o.teamId === c.homeId ? 'h' : o.teamId === c.awayId ? 'a' : null, nl = { market: m.id, pick: o.key, side };
        const dropped = Object.keys(picks).filter((id) => id !== m.id && R && R.clash(picks[id].leg, nl));
        dropped.forEach((id) => delete picks[id]);
        if (dropped.length) showToast(tl('Replaced {pick}: those picks cancel each other out.', { pick: dropped.map((id) => c.markets.find((x) => x.id === id).title).join(', ') }));
        if (Object.keys(picks).length >= MAX_LEGS) { showToast(tl('A combined bet can have up to {n} picks.', { n: MAX_LEGS })); return; }
        picks[m.id] = { leg: nl, k: a.dataset.k, market: m.id, code: o.code, teamId: o.teamId, native: !!m.native, odds: o.odds, label: tl(m.title) + ': ' + o.label };
      }
      quote = null; refresh(); restore(); askQuote(); return;
    }
    if (act === 'ux-bet-place') {
      const L = legs(); if (!L.length || total() == null) return;
      const single = L.length === 1 && L[0].native;
      const r = await window.hub.placeBet(single ? { kind: 'match', ref: c.ref, teamId: L[0].teamId, stake: stakeNum() } : { kind: 'mk:' + L.map((p) => p.code).join(','), ref: c.ref, teamId: 0, stake: stakeNum() });
      if (r && r.ok === false) { showToast(r.error || tl('That bet was refused.')); return; }
      S = r; betStake = ''; picks = {}; quote = null; hist = null;
      showToast(tl('On at {odds}.', { odds: Number(r.bet.odds).toFixed(2) }));
      refresh();
    }
  }, true);
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t || t.id !== 'ux-bet-stake') return;
    e.stopImmediatePropagation();
    betStake = String(t.value || '').replace(/[^0-9]/g, ''); if (betStake !== t.value) t.value = betStake;
    const book = betBook(), amt = stakeNum(), par = view === 'parlay', n = par ? pairs().length : legs().length;
    const out = document.querySelector('.ux-out'), btn = document.querySelector('.ux-place');
    const od = par ? ptotal() : total(), cap = Math.min(book.budget, Math.max(book.min, Math.floor(book.budget * 0.25)));
    if (out) out.textContent = n && amt && od != null ? tl('Returns {money}', { money: fmtMoney(Math.round(amt * od)) }) : tl('Minimum {money}', { money: fmtMoney(book.min) });
    if (btn) { btn.disabled = !(n >= (par ? 2 : 1) && od != null && !frozen() && amt >= book.min && amt <= cap); btn.textContent = amt ? tl('Place {money}', { money: fmtMoney(amt) }) : tl(par ? 'Place parlay' : 'Place bet'); }
  }, true);
  try { render(); } catch (e) { /* no career open yet */ }
})();
