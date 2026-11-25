// Club tab (main tabs, between Season and Socials): Invitationals, 1v1 / 2v2 / crew showdowns and squad synergy.
// All the work is done by src/engine/ux-club.js; this file only builds the screens and sends actions through the game's place-bet channel
// (kind 'uxc:<json>'), the one call the game's main process forwards untouched. State is read from the career (S.career.uxClub).
(function () {
  'use strict';
  if (window.__uxClubUI) return;
  if (typeof squadMoraleHtml !== 'function' || typeof topbarHtml !== 'function' || typeof tabInnerHtml !== 'function' || typeof render !== 'function' || typeof showModal !== 'function' || typeof C !== 'function') return;
  window.__uxClubUI = true;

  const st = document.createElement('style');
  st.textContent =
    '.ux-club-modal{max-width:920px;width:94vw}.ux-club-body{max-height:70vh;overflow:auto;padding-right:6px}' +
    // full-screen tab: sections flow into as many columns as fit, so the width is used instead of left blank
    '.ux-club-page{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}.ux-col{display:flex;flex-direction:column;gap:16px;min-width:0}.ux-club-page .ux-cs{margin:0}.ux-cp-tabs{margin-bottom:14px}.ux-club-card{overflow:visible}' +
    '@media (max-width:900px){.ux-club-page{grid-template-columns:minmax(0,1fr)}}' +
    // lists no longer scroll on their own: the Club page is the single scroll area
    '.ux-scr{display:block}' +
    // custom dropdown (replaces the native select list)
    '.ux-dd{position:relative}.ux-ddb{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;font:inherit;font-weight:700;padding:7px 10px;background:color-mix(in srgb,var(--text) 8%,transparent);color:inherit;border:1px solid var(--rule);cursor:pointer;text-align:left;transition:border-color .15s,background .15s}' +
    '.ux-ddb::after{content:"";width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.7;transition:transform .2s;flex:none}.ux-dd.open .ux-ddb::after{transform:rotate(225deg) translateY(-2px)}' +
    '.ux-ddb:hover,.ux-dd.open .ux-ddb{border-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 10%,transparent)}' +
    '.ux-ddl{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;max-height:260px;overflow:auto;scrollbar-width:thin;background:var(--panel-2,#1c2430);border:1px solid color-mix(in srgb,var(--accent,var(--red)) 45%,var(--rule));border-radius:var(--r-sm,6px);box-shadow:0 14px 34px rgba(0,0,0,.45);padding:4px}' +
    '.ux-dd.open .ux-ddl{display:block;animation:uxDd .16s ease-out}@keyframes uxDd{from{opacity:0;transform:translateY(-6px)}}' +
    '.ux-ddo{display:block;width:100%;text-align:left;font:inherit;font-weight:600;padding:7px 10px;border:0;border-left:3px solid transparent;background:transparent;color:inherit;cursor:pointer;border-radius:3px;transition:background .12s,padding-left .12s}' +
    '.ux-ddo:hover{background:color-mix(in srgb,var(--accent,var(--red)) 16%,transparent);padding-left:14px}.ux-ddo.on{border-left-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 10%,transparent)}' +
    '.ux-cs:has(.ux-dd.open){position:relative;z-index:20}' +
    '.ux-dds{position:sticky;top:-4px;z-index:1;display:block;width:100%;box-sizing:border-box;margin:0 0 4px;font:inherit;font-weight:600;padding:7px 10px;background:var(--panel-2,#1c2430);color:inherit;border:1px solid var(--rule);outline:0}.ux-dds:focus{border-color:var(--accent,var(--red))}' +
    // reactive motion: panels rise in once per visit, rows nudge on hover, buttons lift
    '@keyframes uxIn{from{opacity:0;transform:translateY(10px)}}@keyframes uxGrow{from{width:0}}' +
    '.ux-in .ux-cs{animation:uxIn .42s cubic-bezier(.2,.7,.2,1) both}.ux-in .ux-col:nth-child(2) .ux-cs{animation-delay:.08s}.ux-in .ux-cs:nth-child(2){animation-delay:.14s}.ux-in .ux-bar2 i{animation:uxGrow .9s ease-out both}' +
    '.ux-cs{border-left:3px solid transparent;transition:border-color .25s,box-shadow .25s}.ux-cs:hover{border-left-color:var(--accent,var(--red));box-shadow:0 8px 22px rgba(0,0,0,.2)}' +
    '.ux-cr{transition:background .15s,transform .15s}.ux-cr:hover{background:color-mix(in srgb,var(--accent,var(--red)) 8%,transparent);transform:translateX(3px)}' +
    '.ux-cb{transition:filter .15s,transform .15s,box-shadow .15s}.ux-cb:hover:not([disabled]){filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}.ux-cb:active{transform:none}' +
    '@media (prefers-reduced-motion:reduce){.ux-in .ux-cs,.ux-in .ux-bar2 i,.ux-dd.open .ux-ddl{animation:none}}' +
    '.ux-cs{margin:0 0 16px;padding:12px 14px;background:color-mix(in srgb,var(--text) 6%,transparent);border-radius:var(--r-sm,6px)}' +
    '.ux-cs h4{margin:0 0 8px;font-size:var(--f-label);letter-spacing:.12em;text-transform:uppercase;color:var(--red)}.ux-cg{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:6px 0}' +
    '.ux-cg label{display:grid;gap:3px;font-size:var(--f-small);font-weight:700}.ux-cg input,.ux-cg select{font:inherit;padding:6px 8px;background:color-mix(in srgb,var(--text) 8%,transparent);color:inherit;border:1px solid var(--rule)}.ux-cg select option{color:#111}' +
    '.ux-cl{display:grid;gap:2px;max-height:220px;overflow:auto;border:1px solid var(--rule);padding:4px}.ux-cl label{display:flex;gap:8px;align-items:center;font-size:var(--f-small);padding:2px 4px}.ux-cl label.no{opacity:.45}.ux-cl small{margin-left:auto;opacity:.7}' +
    '.ux-cr{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--rule);font-size:var(--f-small)}.ux-cr:first-of-type{border-top:0}.ux-cr b{font-weight:800}.ux-cr small{opacity:.7;display:block}' +
    '.ux-cb{border:0;cursor:pointer;font:inherit;font-weight:800;font-size:var(--f-small);padding:7px 12px;background:var(--red);color:#fff}.ux-cb.ghost{background:color-mix(in srgb,var(--text) 12%,transparent);color:inherit}.ux-cb[disabled]{opacity:.4;cursor:not-allowed}' +
    '.ux-cm{font-size:var(--f-small);color:var(--text-dim);margin:4px 0}.ux-bar2{height:8px;background:color-mix(in srgb,var(--text) 12%,transparent);border-radius:4px;overflow:hidden}.ux-bar2 i{display:block;height:100%;background:var(--red)}';
  st.textContent +=
    '.ux-club-page{overflow-y:auto;padding-right:8px;scrollbar-width:thin}' +
    '.ux-how{margin:8px 0 12px;padding:10px 14px;border-left:3px solid var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 8%,transparent);border-radius:0 var(--r-sm,6px) var(--r-sm,6px) 0}' +
    '.ux-how-h{font-size:var(--f-label);font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}.ux-how ul{margin:0;padding-left:18px;display:grid;gap:5px;font-size:var(--f-small);line-height:1.45}.ux-how li::marker{color:var(--accent,var(--red))}' +
    '.ux-sub{margin:14px 0 4px;font-size:var(--f-label);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim)}' +
    '.ux-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.ux-cr.ux-mine{background:color-mix(in srgb,var(--accent,var(--red)) 10%,transparent)}' +
    '.ux-fin{margin:12px 0 4px;border:1px solid var(--rule);border-radius:var(--r-sm,6px);overflow:hidden}.ux-fin-h{padding:8px 12px;font-size:var(--f-label);font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:color-mix(in srgb,var(--text) 7%,transparent)}' +
    '.ux-fl{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:9px 12px;border-top:1px solid var(--rule)}.ux-fl small{display:block;color:var(--text-dim);font-size:var(--f-small);line-height:1.4;margin-top:2px;max-width:60ch}.ux-fl strong{font-size:1.1em;white-space:nowrap}' +
    '.ux-fl strong.neg,.ux-neg{color:var(--red)}.ux-fl strong.pos,.ux-pos{color:var(--green,#3fb950)}.ux-fl.tot{background:color-mix(in srgb,var(--accent,var(--red)) 10%,transparent)}.ux-fl.tot strong{font-size:1.25em}' +
    '.ux-sp{display:flex;gap:10px;align-items:center;padding:4px 0;font-size:var(--f-small)}.ux-sp em{margin-left:auto;font-style:normal;font-weight:800;color:var(--green,#3fb950)}' +
    '.ux-cb.big{padding:11px 22px;font-size:var(--f-body)}' +
    // events tab: larger type and more room
    '.ux-ev{margin-top:10px;gap:22px}.ux-ev .ux-col{gap:22px}.ux-ev .ux-cs{padding:20px 22px}.ux-ev .ux-cs h4{font-size:var(--f-body);margin-bottom:12px}' +
    '.ux-ev .ux-cg{gap:12px;margin:12px 0}.ux-ev .ux-cg label,.ux-ev .ux-cr,.ux-ev .ux-cm,.ux-ev .ux-cl label{font-size:var(--f-body)}.ux-ev .ux-cg input,.ux-ev .ux-ddb{padding:10px 12px;font-size:var(--f-body)}' +
    '.ux-ev .ux-cl{max-height:320px;padding:6px}.ux-ev .ux-cl label{padding:6px 8px}.ux-ev .ux-cr small{font-size:var(--f-small)}.ux-ev .ux-cm{line-height:1.5}' +
    // squad synergy
    '.ux-chem{display:flex;gap:16px;align-items:center;margin-bottom:10px}.ux-big{display:flex;flex-direction:column;align-items:center;min-width:84px;padding:8px 12px;border-radius:var(--r-sm,6px);background:color-mix(in srgb,var(--text) 8%,transparent)}.ux-big strong{font-size:1.7em;line-height:1}.ux-big span{font-size:var(--f-small);opacity:.7;text-transform:uppercase;letter-spacing:.08em}' +
    '.ux-big.pos{color:var(--green,#3fb950)}.ux-big.neg{color:var(--red)}' +
  document.head.appendChild(st);

  const hubAct = async (o) => window.hub.placeBet({ kind: 'uxc:' + JSON.stringify(o), ref: 0, teamId: 0, stake: 0 });
  const club = () => (C().uxClub || { inv: [], shows: [], chem: {}, log: [] });
  const me = () => teamById(C().userTeamId);
  const baseReg = (t) => String(t.region || '').replace(/_b$/, '');
  const inScope = (x, scope) => scope !== 'region' || baseReg(x) === baseReg(me());
  const scopeOpts = (cur) => o('global', 'Global (all regions)', cur) + o('region', 'My region (' + baseReg(me()).toUpperCase() + ')', cur);
  const isA = () => me() && !/_b$/.test(me().region || '');
  const player = (id) => (C().players || []).find((p) => p.id === id);
  const money = (n) => fmtMoney(Math.round(n));
  const o = (v, t, sel) => '<option value="' + esc(String(v)) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
  let sub = 'events', loading = false, wins4 = null, wins1 = null, pv = null, busy = false;
  const form = { scope: 'global', size: 8, prize: 0, start: '', name: '', invitees: [], sponsors: [0, 1, 2] };
  const sf = { scope: 'global', mode: '1v1', start: '', prize: 0 };
  // showmatches: pairs hold 'me' | 't<teamId>' | 'p<playerId>' | '' per side
  let evTab = 'show', smpv = null, smSeq = 0, dp = null;
  const smf = { mode: '3v3', n: 2, prize: 10000, start: '', sponsors: [0, 1, 2], pairs: [0, 1, 2, 3].map(() => ({ a: '', b: '', bo: 3 })) };
  const wd = { inv: null, show: null, sm: null }; // valid start days + busy days per event kind, for the date picker
  const MECH = (p) => { const h = window.__uxPersona ? window.__uxPersona.hash('mech:' + p.name) % 100 : 99; return h < 12 ? 6 : h < 35 ? 3 : h < 70 ? 0 : -3; }; // same trait as the engine

  async function refreshWindows() {
    // every valid start day (not just one a week) with the busy intervals, so the date picker can show the whole calendar; Invitationals keep 4 free days, showdowns 1, showmatches only their own day
    const get = async (o) => { const r = (await hubAct({ a: 'windows', count: 400, all: true, ...o })) || {}; return { wins: r.windows || [], busy: r.busy || [], mine: new Set(r.mine || []) }; };
    wd.inv = await get({ len: 4 }); wd.show = await get({ len: 1 }); wd.sm = await get({ len: 1, margin: 0 });
    wins4 = wd.inv.wins; wins1 = wd.show.wins;
    if (!form.start || !wins4.includes(form.start)) form.start = wins4[0] || '';
    if (!sf.start || !wins1.includes(sf.start)) sf.start = wins1[0] || '';
    if (!smf.start || !wd.sm.wins.includes(smf.start)) smf.start = wd.sm.wins[0] || '';
  }
  async function refreshSmPreview() {
    const my = ++smSeq, pairs = smPairs();
    if (!isA() || !pairs) { smpv = null; return; }
    const r = await hubAct({ a: 'smplan', mode: smf.mode, prize: smf.prize, pairs });
    if (my === smSeq) { smpv = r && r.preview ? r.preview : null; draw(); }
  }
  // the engine's side objects from the dropdown values; null while a side is still empty
  const toSide = (v) => (v === 'me' ? { me: true } : /^t\d+$/.test(v) ? { t: Number(v.slice(1)) } : /^p\d+$/.test(v) ? { p: Number(v.slice(1)) } : null);
  function smPairs() {
    const out = smf.pairs.slice(0, smf.n).map((p) => ({ a: toSide(p.a), b: toSide(p.b), bo: p.bo }));
    return out.every((p) => p.a && p.b) ? out : null;
  }
  async function refreshPreview() {
    if (!isA()) return;
    const r = await hubAct({ a: 'preview', size: form.size, scope: form.scope, prize: form.prize, invitees: form.invitees });
    pv = r && r.preview ? r.preview : null; draw();
  }

  // ---------- tabs ----------
  const tabs = () => [['events', 'Events'], ['synergy', 'Squad synergy']].concat(window.__lateManagerUI ? [['manager', 'Manager']] : []).concat(window.__lateUI ? [['facilities', 'Facilities']] : []).concat(window.__lateHostUI ? [['hosting', 'Hosting']] : []).concat(window.__lateLegacyUI ? [['legacy', 'Legacy']] : []); // Facilities: late-ui.js, Hosting: late-host-ui.js

  // ---------- shared pieces ----------
  const bold = (s) => esc(tl(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const how = (title, lines) => '<div class="ux-how"><div class="ux-how-h">' + esc(tl(title)) + '</div><ul>' + lines.map((l) => '<li>' + bold(l) + '</li>').join('') + '</ul></div>';

  // ---------- Events ----------
  function eventsHtml() {
    const c = C(), u = club(), t = me(), can = isA() && (t.followers || 0) >= 60000 && t.budget >= 600000;
    const lo = Math.max(40000, Math.round(t.budget * 0.02)), hi = Math.round(t.budget * 0.3);
    if (!form.prize) form.prize = Math.min(hi, Math.max(lo, Math.round(t.budget * 0.08 / 5000) * 5000));
    if (!sf.prize) sf.prize = Math.max(10000, Math.round(t.budget * 0.02 / 5000) * 5000);
    const running = u.inv.filter((x) => x.stage !== 'done' && x.stage !== 'cancelled');
    const accepts = (id) => !(pv && pv.declined && pv.declined.includes(id));
    const teams = c.teams.filter((x) => x.id !== t.id && !x.nation && x.region && inScope(x, form.scope)).sort((a, b) => (b.followers || 0) - (a.followers || 0));
    const list = teams.map((x) => '<label class="' + (accepts(x.id) ? '' : 'no') + '"><input type="checkbox" data-action="ux-club-inv" data-id="' + x.id + '"' + (form.invitees.includes(x.id) ? ' checked' : '') + '>' + esc(x.name) + '<small>' + (/_b$/.test(x.region) ? 'Tier B · ' : '') + Math.round((x.followers || 0) / 1000) + 'K followers' + (accepts(x.id) ? '' : ' · declines') + '</small></label>').join('');
    const offers = (pv && pv.offers) || [];
    const sponsors = offers.map((s, i) => '<label class="ux-sp"><input type="checkbox" data-action="ux-club-spon" data-i="' + i + '"' + (form.sponsors.includes(i) ? ' checked' : '') + '><span>' + esc(s.role) + ': <b>' + esc(s.name) + '</b></span><em>+' + money(s.fee) + '</em></label>').join('') || '<div class="ux-cm">' + esc(tl('Offers appear once the field is set.')) + '</div>';

    // what the event costs and earns, line by line, from the same numbers the engine uses
    const prize = Number(form.prize) || 0, ops = pv ? pv.ops : null;
    const spon = offers.reduce((a, s, i) => a + (form.sponsors.includes(i) ? s.fee : 0), 0), gate = pv ? Math.round(prize * 0.25 * pv.mult / 500) * 500 : null;
    const fl = (name, desc, amt) => '<div class="ux-fl"><div><b>' + esc(tl(name)) + '</b><small>' + bold(desc) + '</small></div><strong class="' + (amt < 0 ? 'neg' : 'pos') + '">' + (amt == null ? '…' : (amt < 0 ? '−' : '+') + money(Math.abs(amt))) + '</strong></div>';
    const finance = pv ? '<div class="ux-fin"><div class="ux-fin-h">' + esc(tl('What this costs and earns')) + '</div>' +
      fl('Prize pool', 'You **pay it now**. It is shared between all ' + form.size + ' clubs by final placement (champion ' + (form.size === 16 ? '30%' : '40%') + '). Your club plays too, so you win a share back.', -prize) +
      fl('Running costs', 'You **pay now**: venue, production and staff.', -ops) +
      fl('Sponsors', 'They **pay you now** the fee shown, for each one ticked below.', spon) +
      fl('Gate and streaming', 'Paid to you **when the event ends**: ticket and stream income, about a quarter of the prize pool, more with big-name clubs.', gate) +
      '<div class="ux-fl tot"><div><b>' + esc(tl('Net, before any prize money you win')) + '</b><small>' + esc(tl('Your club also gains followers after the event.')) + '</small></div><strong class="' + (spon + gate - prize - ops < 0 ? 'neg' : 'pos') + '">' + (spon + gate - prize - ops < 0 ? '−' : '+') + money(Math.abs(spon + gate - prize - ops)) + '</strong></div></div>' : '';

    const hostBox = !isA() ? '<div class="ux-cm">' + esc(tl('Only Tier A clubs can host an Invitational.')) + '</div>'
      : !can ? '<div class="ux-cm">' + esc(tl('Hosting unlocks at 60,000 followers and a $600K budget.')) + '</div>'
      : running.map((run) => '<div class="ux-cr"><span><b>' + esc(run.name) + '</b><small>' + esc(run.size + ' clubs · ' + money(run.prize) + ' prize pool · ' + run.start + ' · ' + run.stage) + '</small></span>' + '<span><button class="ux-cb ghost" data-action="ux-club-inv-view" data-id="' + run.id + '">' + esc(tl('View')) + '</button> ' + (run.stage === 'scheduled' ? '<button class="ux-cb ghost" data-action="ux-club-cancel" data-id="' + run.id + '">' + esc(tl('Cancel')) + '</button>' : '') + '</span></div>').join('') + (running.length >= 2 ? '<div class="ux-cm">' + esc(tl('Two Invitationals are running: the limit.')) + '</div>' :
        (running.length ? '<div class="ux-cm" style="margin-top:8px">' + esc(tl('You can host a second one on another date.')) + '</div>' : '') +
        '<div class="ux-cm">' + bold('You are the **host and organiser**: you pay for the event up front and earn it back from sponsors, the gate and your own results.') + '</div>' +
        '<div class="ux-cg"><label>' + esc(tl('Name')) + '<input data-club="name" value="' + esc(form.name) + '" placeholder="' + esc(t.name) + ' Invitational"></label>' +
        '<label>' + esc(tl('Field')) + '<select data-club="scope">' + scopeOpts(form.scope) + '</select></label>' +
        '<label>' + esc(tl('Size')) + '<select data-club="size">' + o(8, '8 clubs', form.size) + o(16, '16 clubs', form.size) + '</select></label>' +
        '<label>' + esc(tl('Date')) + dateBtn('inv', form.start) + '</label>' +
        '<label>' + esc(tl('Prize pool')) + ' (' + money(lo) + ' - ' + money(hi) + ')<input data-club="prize" inputmode="numeric" value="' + form.prize + '"></label></div>' +
        '<div class="ux-cm">' + esc(tl('Invite clubs (the rest of the field is filled with clubs that accept):')) + ' <b>' + form.invitees.length + '/' + (form.size - 1) + '</b></div><div class="ux-cl">' + list + '</div>' +
        '<div class="ux-cm" style="margin-top:12px">' + esc(tl('Event sponsors')) + '</div>' + sponsors + finance +
        '<div style="margin-top:14px"><button class="ux-cb big" data-action="ux-club-host"' + (form.start ? '' : ' disabled') + '>' + esc(tl('Host Invitational')) + '</button></div>');
    const past = u.inv.filter((x) => x.stage === 'done').slice().reverse().map((x) => { const ch = teamById(x.championId); return '<div class="ux-cr"><span><b>' + esc(x.name) + '</b><small>' + esc((ch ? ch.name : '?') + ' won · ' + x.size + ' clubs · ' + x.start) + '</small></span><span><b class="' + (x.result && x.result.profit < 0 ? 'ux-neg' : 'ux-pos') + '">' + (x.result ? (x.result.profit >= 0 ? '+' : '−') + money(Math.abs(x.result.profit)) + '</b> ' : '</b>') + '<button class="ux-cb ghost" data-action="ux-club-inv-view" data-id="' + x.id + '">' + esc(tl('Results')) + '</button></span></div>'; }).join('');
    // showdowns
    const mine = (c.players || []).filter((p) => p.teamId === t.id && !p.isUser).sort((a, b) => (b.rating + MECH(b)) - (a.rating + MECH(a)));
    const sPrize = Number(sf.prize) || 0;
    const showForm = '<div class="ux-cm">' + bold('A one-day exhibition at your club. You **pay the prize pool plus $15K now**; your entry plays for a share of it and you receive **broadcast income (40% of the pool)** when it ends.') + '</div>' +
      '<div class="ux-cg"><label>' + esc(tl('Field')) + '<select data-club="sscope">' + scopeOpts(sf.scope) + '</select></label><label>' + esc(tl('Event')) + '<select data-club="smode">' + o('1v1', '1v1 Showdown (16 players)', sf.mode) + o('2v2', '2v2 Showdown (8 duos)', sf.mode) + o('crew', 'Crew Battle (8 clubs, 3 duels)', sf.mode) + '</select></label>' +
      '<label>' + esc(tl('Date')) + dateBtn('show', sf.start) + '</label>' +
      '<label>' + esc(tl('Prize pool')) + '<input data-club="sprize" inputmode="numeric" value="' + sf.prize + '"></label></div>' +
      '<div class="ux-fin"><div class="ux-fl"><div><b>' + esc(tl('You pay now')) + '</b><small>' + esc(tl('Prize pool + $15K running costs')) + '</small></div><strong class="neg" data-sp="pay">−' + money(sPrize + 15000) + '</strong></div>' +
      '<div class="ux-fl"><div><b>' + esc(tl('Broadcast income')) + '</b><small>' + esc(tl('Paid to you when the event ends')) + '</small></div><strong class="pos" data-sp="inc">+' + money(Math.round(sPrize * 0.4 / 100) * 100) + '</strong></div></div>' +
      '<div class="ux-cm">' + esc(tl('Your entry is your 1v1 / 2v2 squad from the Squad tab (crew battle: your three best, you always among them), checked again on the day; the best fit solo players fill any gap. Gifted solo players (+3 / +6 mechanics) shine in 1v1 and 2v2.')) + '</div>' +
      mine.map((p) => '<div class="ux-cr"><span>' + esc(p.name) + '<small>' + p.rating + ' OVR</small></span><b>' + (MECH(p) >= 6 ? esc(tl('Gifted solo player')) : MECH(p) >= 3 ? esc(tl('Mechanical')) : '') + '</b></div>').join('') +
      '<div style="margin-top:12px"><button class="ux-cb big" data-action="ux-club-show"' + (sf.start ? '' : ' disabled') + '>' + esc(tl('Schedule event')) + '</button></div>';
    const shows = u.shows.slice().reverse().map((x) => '<div class="ux-cr"><span><b>' + esc(x.name) + '</b><small>' + esc(x.start + ' · ' + money(x.prize) + ' prize pool') + (x.done && x.result ? esc(' · ' + x.result.champion + ' won') : '') + '</small></span><small>' + (x.done ? esc(tl('Done')) : esc(tl('Scheduled'))) + '</small></div>').join('');
    // Tier A clubs get two tabs here: the showdown form and the showmatch form
    const head = isA() ? '<div class="ptabs ux-cp-tabs">' + [['show', 'Off-season showdowns'], ['smatch', 'Showmatches']].map(([k, t]) => '<button type="button" class="ptab' + (evTab === k ? ' active' : '') + '" data-action="ux-club-evtab" data-t="' + k + '">' + esc(tl(t)) + '</button>').join('') + '</div>' : '<h4>' + esc(tl('Off-season showdowns')) + '</h4>';
    const right = isA() && evTab === 'smatch' ? smatchHtml() : showForm + (shows ? '<div style="margin-top:12px">' + shows + '</div>' : '');
    return [['<div class="ux-cs"><h4>' + esc(tl('Club-hosted Invitational')) + '</h4>' + hostBox + '</div>'],
      ['<div class="ux-cs">' + head + right + '</div>',
        past ? '<div class="ux-cs"><h4>' + esc(tl('Past Invitationals')) + '</h4>' + past + '</div>' : '', isA() ? '' : invitesHtml()]];
  }

  // ---------- showmatch invitations (any club): they arrive in the inbox; Tier B clubs also see them here ----------
  const answerBtns = (id) => '<button class="ux-cb" data-action="ux-club-smi" data-id="' + id + '" data-yes="1">' + esc(tl('Accept')) + '</button> <button class="ux-cb ghost" data-action="ux-club-smi" data-id="' + id + '" data-yes="0">' + esc(tl('Decline')) + '</button>';
  function invitesHtml() {
    const u = club(), open = (u.smInv || []).filter((v) => v.status === 'open'), taken = (u.smatch || []).filter((x) => x.invite).slice().reverse();
    const rows = open.map((v) => '<div class="ux-cr"><span><b>' + esc(v.oppName + ' · ' + v.mode) + '</b><small>' + esc(tl('{d} · taking part pays {p}, a win {m} (+$1K clean sweep, +$1K upset) · answer by {e}', { d: v.start, p: money(v.part), m: money(v.fee), e: v.expires })) + '</small></span><span>' + answerBtns(v.id) + '</span></div>').join('') +
      taken.map((x) => '<div class="ux-cr"><span><b>' + esc(x.name) + '</b><small>' + esc(x.start + ' · ' + money(x.prize) + (x.done && x.result ? ' · ' + (x.result.myWins ? tl('Won') : tl('Lost')) + ' ' + money(x.result.myPrize) : '')) + '</small></span><span><small>' + esc(x.done ? tl('Done') : tl('Accepted')) + '</small> <button class="ux-cb ghost" data-action="ux-club-sm-view" data-id="' + x.id + '">' + esc(tl(x.done ? 'Results' : 'Matches')) + '</button></span></div>').join('');
    return '<div class="ux-cs"><h4>' + esc(tl('Showmatch invitations')) + '</h4>' + (rows || '<div class="ux-cm">' + esc(tl('Nothing right now. Clubs invite you to an exhibition every few weeks (in your inbox too). Participate to get paid, win to get even more.')) + '</div>') + '</div>';
  }

  // ---------- Showmatches (Tier A): single matches or a series on one day, no bracket ----------
  const dateBtn = (f, cur) => '<button type="button" class="ux-ddb" data-action="ux-club-dp" data-f="' + f + '"><span>' + esc(cur || tl('Pick a date')) + '</span></button>';
  const flRow = (name, desc, amt, tot) => '<div class="ux-fl' + (tot ? ' tot' : '') + '"><div><b>' + esc(tl(name)) + '</b><small>' + bold(desc) + '</small></div><strong class="' + (amt < 0 ? 'neg' : 'pos') + '">' + (amt == null ? '…' : (amt < 0 ? '−' : '+') + money(Math.abs(amt))) + '</strong></div>';
  const sideName = (sd) => (sd.me ? (me() || {}).name + (smf.mode === '3v3' ? '' : ' (you)') : sd.t != null ? (teamById(sd.t) || {}).name || '?' : (player(sd.p) || {}).name || '?');
  // the clubs (3v3, 2v2) or players (1v1) of the user's tier and region
  function smCandidates() {
    const mt = me(), tier = (t) => t && !/_b$/.test(t.region || '') && baseReg(t) === baseReg(mt) && t.id !== mt.id && !t.nation;
    const clubs = (C().teams || []).filter(tier).sort((a, b) => (b.followers || 0) - (a.followers || 0));
    if (smf.mode !== '1v1') return clubs.map((t) => ({ v: 't' + t.id, label: t.name + ' · ' + Math.round((t.followers || 0) / 1000) + 'K' }));
    const ids = new Set(clubs.map((t) => t.id));
    return (C().players || []).filter((p) => ids.has(p.teamId) && !p.retired && !p.absence).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id).map((p) => ({ v: 'p' + p.id, label: p.name + ' · ' + (teamById(p.teamId) || {}).name + ' · ' + p.rating + ' OVR' }));
  }
  function smatchHtml() {
    const t = me(), cands = smCandidates(), taken = new Set(smf.pairs.slice(0, smf.n).flatMap((p) => [p.a, p.b]).filter(Boolean));
    const sel = (key, cur) => '<select data-club="' + key + '">' + o('', tl('Pick…'), cur) + (taken.has('me') && cur !== 'me' ? '' : o('me', smf.mode === '1v1' ? tl('Your player') : tl('Your club'), cur)) +
      cands.filter((c) => c.v === cur || !taken.has(c.v)).map((c) => o(c.v, c.label, cur)).join('') + '</select>';
    // the small unlabeled dropdown between the two sides is the length of that match's series
    const boSel = (i, cur) => '<select data-club="smBO' + i + '">' + [1, 3, 5, 7].map((n) => o(n, 'BO' + n, cur)).join('') + '</select>';
    const pairs = smf.pairs.slice(0, smf.n).map((p, i) => '<div class="ux-cg" style="grid-template-columns:1fr 92px 1fr;align-items:end"><label>' + esc(tl('Match {n}', { n: i + 1 })) + ' · ' + esc(tl('side A')) + sel('smA' + i, p.a) + '</label><div>' + boSel(i, p.bo) + '</div><label>' + esc(tl('side B')) + sel('smB' + i, p.b) + '</label></div>').join('');
    const prize = Number(smf.prize) || 0, pay = smf.n * (prize + 3000), spon = smpv ? smpv.offers.reduce((a, s, i) => a + (smf.sponsors.includes(i) ? s.fee : 0), 0) : 0;
    const sponsors = smpv ? smpv.offers.map((s, i) => '<label class="ux-sp"><input type="checkbox" data-action="ux-club-ssp" data-i="' + i + '"' + (smf.sponsors.includes(i) ? ' checked' : '') + '><span>' + esc(s.role) + ': <b>' + esc(s.name) + '</b></span><em>+' + money(s.fee) + '</em></label>').join('') : '<div class="ux-cm">' + esc(tl('Offers appear once every side is set.')) + '</div>';
    const fin = '<div class="ux-fin">' + flRow('You pay now', 'Prize pool of every match (' + smf.n + ' × ' + money(prize) + ') + $3K running costs per match. The winner of a match takes its prize pool.', -pay) +
      flRow('Sponsors', 'They **pay you now** the fee shown, for each one ticked.', spon) +
      flRow('Broadcast income', 'Paid to you **when the matches are over**.', smpv ? smpv.gate : null) +
      '<div class="ux-fl"><div><b>' + esc(tl('Followers')) + '</b><small>' + esc(tl('Your club gains followers once the matches are played, more with big names.')) + '</small></div><strong class="pos">' + (smpv ? '+' + smpv.growth.toLocaleString('en') : '…') + '</strong></div></div>';
    const mine = (C().uxClub && C().uxClub.smatch || []).slice().reverse().map((x) => {
      const scheduled = !x.done, can = scheduled && !x.live && !x.invite && (Date.parse(x.start + 'T12:00:00Z') - Date.parse(C().currentDate + 'T12:00:00Z')) / 864e5 >= 3;
      return '<div class="ux-cr"><span><b>' + esc(x.name) + '</b><small>' + esc(x.start + ' · ' + money(x.prize) + ' per match') + (x.cancelled ? esc(' · ' + tl('Cancelled')) : '') + '</small></span><span><small>' + esc(x.done ? tl(x.cancelled ? 'Cancelled' : 'Done') : tl('Scheduled')) + '</small>' +
        '<button class="ux-cb ghost" data-action="ux-club-sm-view" data-id="' + x.id + '">' + esc(tl(x.done ? 'Results' : 'Matches')) + '</button>' + (can ? ' <button class="ux-cb ghost" data-action="ux-club-sm-cancel" data-id="' + x.id + '">' + esc(tl('Cancel')) + '</button>' : '') + '</span></div>';
    }).join('');
    return '<div class="ux-cm">' + bold('Exhibition matches at your club, **5K to 20K per match**. Pick the two sides of each match; every match is a best of 1, 3, 5 or 7 (your pick) and all of them are played on the day you choose. There is no bracket: just a prize pool, sponsors and followers.') + '</div>' +
      '<div class="ux-cg"><label>' + esc(tl('Format')) + '<select data-club="smmode">' + o('3v3', '3v3 (clubs)', smf.mode) + o('2v2', '2v2 (duos)', smf.mode) + o('1v1', '1v1 (players)', smf.mode) + '</select></label>' +
      '<label>' + esc(tl('Matches')) + '<select data-club="smn">' + [1, 2, 3, 4].map((n) => o(n, n === 1 ? tl('Single showmatch') : tl('{n} matches', { n }), smf.n)).join('') + '</select></label>' +
      '<label>' + esc(tl('Date')) + dateBtn('sm', smf.start) + '</label>' +
      '<label>' + esc(tl('Prize pool per match')) + '<input data-club="smprize" inputmode="numeric" value="' + smf.prize + '"></label></div>' +
      '<div class="ux-cm">' + esc(smf.mode === '1v1' ? tl('1v1: pick players from the Tier A clubs of your region.') : tl('Pick clubs from your tier and region.')) + ' ' + esc(tl('Your club or player can take one slot.')) + ' ' + esc(tl('A showmatch can not share a day with another tournament or event, but can be the day before or after.')) + '</div>' +
      pairs + '<div class="ux-cm" style="margin-top:12px">' + esc(tl('Sponsors')) + '</div>' + sponsors + fin +
      '<div style="margin-top:12px"><button class="ux-cb big" data-action="ux-club-sm"' + (smf.start ? '' : ' disabled') + '>' + esc(tl('Schedule showmatches')) + '</button></div>' + (mine ? '<div style="margin-top:12px">' + mine + '</div>' : '');
  }
  // one card per match: who plays and, once played, who won (also the main view of the event on its day and in the calendar)
  function smCards(x) {
    const side = (n, s, w) => '<div class="ux-sm-side' + (w ? ' win' : '') + '"><span>' + esc(n) + '</span><b>' + (s == null ? '' : s) + '</b></div>';
    const r = x.result;
    const cards = r ? r.matches.map((m) => '<div class="ux-sm' + (m.mine ? ' mine' : '') + '">' + side(m.a, m.sa, m.sa > m.sb) + side(m.b, m.sb, m.sb > m.sa) + '<div class="ux-cm">' + esc(tl('Best of {n}', { n: m.bo }) + ' · ' + money(m.prize) + (m.forfeit ? ' · ' + tl('forfeit') : '')) + '</div></div>').join('')
      : (x.live ? x.live.pairs.map((p) => ({ a: p.A.name, b: p.B.name, bo: p.bo })) : x.pairs.map((p) => ({ a: sideName(p.a), b: sideName(p.b), bo: p.bo }))).map((m) => '<div class="ux-sm">' + side(m.a, null) + side(m.b, null) + '<div class="ux-cm">' + esc(tl('Best of {n}', { n: m.bo || 3 })) + '</div></div>').join('');
    const bon = r && x.invite ? r.matches.flatMap((m) => m.bonuses || []).map((b) => tl(b.label) + ' +' + money(b.amount)).join(' · ') : '';
    const foot = r && x.invite ? '<div class="ux-cm">' + esc(tl('Prize {m} · followers +{f}', { m: money(r.myPrize), f: r.growth.toLocaleString('en') }) + (bon ? ' · ' + bon : '')) + '</div>'
      : r ? '<div class="ux-cm">' + esc(tl('Broadcast {b} · sponsors {s} · followers +{f} · net {n}', { b: money(r.gate), s: money(r.sponsorIncome), f: r.growth.toLocaleString('en'), n: money(r.profit) })) + (r.myWins ? ' · ' + esc(tl('Your prize {m}', { m: money(r.myPrize) })) : '') + '</div>' : '';
    return '<div class="ux-cs"><h4>' + esc(x.name) + ' · ' + esc(x.start) + '</h4><div class="ux-sm-grid">' + cards + '</div>' + foot + '</div>';
  }
  function smModal(id) {
    const x = (C().uxClub && C().uxClub.smatch || []).find((v) => v.id === id); if (!x) return;
    showModal('<div class="modal ux-club-modal" style="max-width:900px"><div class="modal-h">' + esc(x.name) + '</div><div class="modal-b"><div class="ux-club-body">' + smCards(x) + '</div><div class="btnrow"><button class="btn ghost" data-action="close-modal">' + esc(tl('Close')) + '</button></div></div></div>');
  }

  // ---------- date picker: the game's calendar look (like Hosting -> circuits), every event shown, only free start days can be clicked ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const dpCur = (f) => (f === 'inv' ? form.start : f === 'show' ? sf.start : smf.start);
  function dpHtml() {
    const d0 = wd[dp.f]; if (!d0) return '';
    const [y, m] = dp.month.split('-').map(Number), lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
    const ok = new Set(d0.wins), map = typeof eventDayMap === 'function' ? eventDayMap() : {}, margin = dp.f === 'sm' ? 0 : dp.f === 'show' ? 1 : 4, cur = dpCur(dp.f), today = C().currentDate;
    const near = (day) => d0.busy.some(([a, b, k]) => { const mg = k === 'tiny' ? 0 : k === 'small' ? Math.min(1, margin) : margin; return day >= addDays(a, -mg) && day <= addDays(b, mg); });
    const inIv = (day) => d0.busy.some(([a, b]) => day >= a && day <= b);
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => '<div class="cb-dow">' + d + '</div>').join('') + '<div class="cb-cell out"></div>'.repeat(lead);
    for (let d = 1; d <= dim; d++) {
      const day = y + '-' + pad2(m) + '-' + pad2(d), e = map[day], good = ok.has(day), other = !e && inIv(day);
      const style = e ? ' style="--ec:' + (typeof calColour === 'function' ? calColour(e) : 'var(--gold,#e6a817)') + '"' : other ? ' style="--ec:#8a8f98"' : '';
      const why = e ? e.name : good ? tl('Free: your event can be here') : other ? tl('Other tournament (not in your calendar)') : d0.mine.has(day) ? tl('You have a match here') : near(day) ? tl('Too close to another event') : day < addDays(today, 7) ? tl('Too soon: events need a week of notice') : tl('Not available');
      cells += '<div class="cb-cell' + (e || other ? ' ev' : '') + (day === today ? ' today' : '') + (good ? ' late-pick-ok' : ' late-pick-no') + (cur === day ? ' late-pick-sel' : '') + '"' + style + (good ? ' data-action="ux-club-dpd" data-day="' + day + '" role="button" tabindex="0"' : '') + ' title="' + esc(why) + '"><span class="cb-num">' + d + '</span></div>';
    }
    const ms = y + '-' + pad2(m), evs = (typeof calEventList === 'function' ? calEventList() : []).filter((e) => e.startDate && e.startDate.slice(0, 7) <= ms && (e.endDate || e.startDate).slice(0, 7) >= ms);
    const legend = evs.map((e) => '<div class="ux-cm"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:' + (typeof calColour === 'function' ? calColour(e) : '#e6a817') + '"></span>' + esc(e.name) + ' · ' + esc(e.startDate) + (e.endDate && e.endDate !== e.startDate ? ' – ' + esc(e.endDate) : '') + '</div>').join('');
    const help = dp.f === 'sm' ? 'Green outlined days are free. A showmatch needs its own day, but can be the day before or after another event.' : dp.f === 'show' ? 'Green outlined days are free (1 free day kept around other events).' : 'Green outlined days can start your event (4 free days around other events).';
    return '<div class="modal" style="max-width:680px"><div class="modal-h">' + esc(tl('Pick a date')) + '</div><div class="modal-b"><div class="cb-head"><button type="button" class="cb-nav" data-action="ux-club-dpm" data-d="-1">&#8249;</button><div class="cb-month">' + esc(typeof monthName === 'function' ? monthName(m - 1) : m) + ' ' + y + '</div><button type="button" class="cb-nav" data-action="ux-club-dpm" data-d="1">&#8250;</button></div>' +
      '<div class="cb-grid">' + cells + '</div><div class="ux-cm" style="margin:8px 0">' + esc(tl(help)) + ' ' + esc(tl('Coloured days have events, like in Season → Calendar.')) + '</div>' + legend + '<div class="btnrow"><button type="button" class="btn ghost" data-action="close-modal">' + esc(tl('Close')) + '</button></div></div></div>';
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  // ---------- Squad synergy ----------
  function synergyHtml() {
    const c = C(), u = club(), t = me(), d = c.currentDate, ch = u.chem[t.id];
    const days = ch ? Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(ch.since + 'T12:00:00Z')) / 86400000) : 0;
    const mod = days < 21 ? -3 * (1 - days / 21) : days < 90 ? 0 : Math.min(2.5, (days - 90) / 275 * 2.5);
    const label = days < 21 ? 'Adjusting' : days < 90 ? 'Settled' : days < 270 ? 'In sync' : 'Cohesive';
    const chem = '<div class="ux-cs"><h4>' + esc(tl('Roster chemistry')) + '</h4><div class="ux-chem"><div class="ux-big ' + (mod < -0.05 ? 'neg' : mod > 0.05 ? 'pos' : '') + '"><strong>' + (mod > 0.05 ? '+' : mod < -0.05 ? '−' : '±') + Math.abs(mod).toFixed(1) + '</strong><span>' + esc(tl('rating')) + '</span></div><div><b>' + esc(tl(label)) + '</b><div class="ux-cm">' + esc(tl('Your three-man core has played together for {n} days.', { n: days })) + '</div></div></div>' +
      '<div class="ux-bar2"><i style="width:' + Math.min(100, days / 3.65) + '%"></i></div>' +
      how('What chemistry does', ['A **new lineup plays worse for about three weeks** (up to −3 rating, less consistent).', 'After about three months the penalty is gone; a trio that stays together for a year builds **up to +2.5 rating** on every player, which helps underdogs beat fresh superteams.', 'Changing **one** of the three keeps part of the chemistry; changing most of them resets it.']) + '</div>';
    return [[chem], []];
  }

  let fresh = true, wasClub = false;
  const col = (x) => '<div class="ux-col">' + [].concat(x).join('') + '</div>';
  // the game's native <select> pops a white OS list; swap each one for a themed dropdown (same data-club key, value kept in data-value)
  const ddHtml = (h) => h.replace(/<select data-club="(\w+)">([\s\S]*?)<\/select>/g, (m, k, opts) => {
    const items = [...opts.matchAll(/<option value="([^"]*)"( selected)?>([\s\S]*?)<\/option>/g)], cur = items.find((x) => x[2]) || items[0];
    return '<div class="ux-dd" data-club="' + k + '" data-value="' + (cur ? cur[1] : '') + '"><button type="button" class="ux-ddb" data-action="ux-club-dd"><span>' + (cur ? cur[3] : '') + '</span></button><div class="ux-ddl">' +
      (/^sm[AB]\d$/.test(k) ? '<input class="ux-dds" data-dds placeholder="' + esc(tl('Type to search…')) + '" autocomplete="off">' : '') + // showmatch sides: club / player lists are long
      items.map((x) => '<button type="button" class="ux-ddo' + (x === cur ? ' on' : '') + '" data-action="ux-club-pick" data-v="' + x[1] + '">' + x[3] + '</button>').join('') + '</div></div>';
  });
  function pageHtml() {
    let L, R;
    if (sub === 'events') [L, R] = eventsHtml();
    else if (sub === 'manager' && window.__lateManagerUI) [L, R] = window.__lateManagerUI.html();
    else if (sub === 'facilities' && window.__lateUI) [L, R] = window.__lateUI.html();
    else if (sub === 'hosting' && window.__lateHostUI) [L, R] = window.__lateHostUI.html();
    else if (sub === 'legacy' && window.__lateLegacyUI) [L, R] = window.__lateLegacyUI.html();
    else [L, R] = synergyHtml();
    const cls = 'ux-club-page ux-sub-' + sub + (sub === 'events' ? ' ux-ev' : '') + (fresh ? ' ux-in' : ''); fresh = false;
    return '<div class="card ux-club-card"><div class="card-h">' + esc(tl('Club')) + '</div><div class="card-b"><div class="ptabs ux-cp-tabs">' +
      tabs().map(([k, t]) => '<button type="button" class="ptab' + (sub === k ? ' active' : '') + '" data-action="ux-club-tab" data-tab="' + k + '">' + esc(tl(t)) + '</button>').join('') +
      '</div>' + ddHtml('<div class="' + cls + '">' + col(L) + col(R) + '</div>') + '</div></div>';
  }
  // the hub page itself does not scroll, so the Club content is its own scroll area, sized to what is left of the window
  let keepTop = 0;
  const fit = () => {
    const p = document.querySelector('.ux-club-page'); if (!p) return;
    p.style.maxHeight = Math.max(240, window.innerHeight - p.getBoundingClientRect().top - 16) + 'px';
    if (keepTop) { p.scrollTop = keepTop; keepTop = 0; }
  };
  window.addEventListener('resize', fit);
  const draw = () => { if (tab !== 'club') return; const p = document.querySelector('.ux-club-page'); keepTop = p && !fresh ? p.scrollTop : 0; render(); };
  async function load() {
    if (loading || wins4) return; loading = true;
    try {
      await refreshWindows();
    } finally { loading = false; }
    draw(); refreshPreview(); refreshSmPreview();
  }

  async function act(req, ok) {
    if (busy) return false; busy = true; let good = false;
    try { const r = await hubAct(req); if (r && r.ok) { good = true; S = r; wins4 = null; wins1 = null; pv = null; smpv = null; if (ok) showToast(ok); } else showToast((r && r.error) || tl('That is not possible.')); } finally { busy = false; }
    draw(); await load();
    return good;
  }

  // who is where in a hosted Invitational: champion, finalist, eliminated in which round, still in, or the invited field before the draw
  const RANK = { r16: 0, quarter: 1, semi: 2, final: 3 }, ROUND = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
  function invTableHtml(e) {
    const h = e.hosted, slots = e.slots || [], done = h.stage === 'done';
    const fmt = esc(tl('Single elimination · best of 3, final best of 5'));
    let rows;
    if (done && h.standings) rows = h.standings.map((r) => ({ id: r.teamId, label: r.placement === 1 ? tl('Champion') : r.placement === 2 ? tl('Runner-up') : tl('Out in the {r}', { r: tl(r.placement <= 4 ? 'semi-finals' : r.placement <= 8 ? 'quarter-finals' : 'round of 16') }), extra: money(r.prize), n: r.placement }));
    else if (!slots.length) rows = e.field.map((id, i) => ({ id, label: id === C().userTeamId ? tl('Host') : tl('Invited'), extra: '', n: i + 1 }));
    else {
      rows = e.field.map((id) => {
        let best = -1, out = false, champ = false;
        for (const x of slots) if (x.teamA === id || x.teamB === id) { best = Math.max(best, RANK[x.stage]); if (x.winner != null && x.winner !== id) out = true; if (x.stage === 'final' && x.winner === id) champ = true; }
        const label = champ ? tl('Champion') : out ? (best === 3 ? tl('Runner-up') : tl('Out in the {r}', { r: tl(ROUND[best]).toLowerCase() })) : best >= 0 ? tl('Still in: {r}', { r: tl(ROUND[best]) }) : tl('Waiting for the draw');
        return { id, label, extra: '', score: champ ? 100 : out ? best * 10 : 50 + best * 10 + 5 };
      }).sort((x, y) => y.score - x.score);
      rows.forEach((r, i) => { r.n = i + 1; });
    }
    return '<div class="ux-cs"><h4>' + esc(tl('Standings')) + '</h4><div class="ux-cm">' + fmt + '</div>' +
      rows.map((r) => '<div class="ux-cr"><span>' + r.n + '. <b>' + esc((teamById(r.id) || {}).name || '?') + '</b>' + (r.id === C().userTeamId ? ' ★' : '') + '<small>' + esc(r.label) + '</small></span><b>' + esc(r.extra) + '</b></div>').join('') + '</div>';
  }
  function invModal(id) {
    const e = typeof calEventById === 'function' ? calEventById(id) : null; if (!e || e.kind !== 'invite') return;
    showModal('<div class="modal ux-club-modal" style="max-width:1100px"><div class="modal-h">' + esc(e.name) + '</div><div class="modal-b"><div class="ux-club-body">' + invTableHtml(e) + (typeof bracketArtHtml === 'function' ? bracketArtHtml(e) : '') +
      '</div><div class="btnrow"><button class="btn ghost" data-action="close-modal">' + esc(tl('Close')) + '</button></div></div></div>');
  }

  // ---------- calendar: hosted Invitationals and showdowns appear as events of the game's own calendar ----------
  if (typeof calEventList === 'function' && typeof eventDayMap === 'function' && typeof calEventById === 'function') {
    const addD = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    const smEvent = (x) => ({ id: x.id, kind: 'smatch', club: true, name: x.name, split: 0, index: 0, startDate: x.start, endDate: x.start, stage: 'pending', groups: [], slots: [], field: [], standings: [], hosted: x });
    const clubEvents = () => {
      const u = club();
      if (!isA()) return (u.smatch || []).filter((x) => !x.cancelled).map(smEvent); // Tier B: only accepted showmatch invitations
      return u.inv.filter((x) => x.stage !== 'cancelled').map((x) => ({ id: x.id, kind: 'invite', club: true, name: x.name, split: 0, index: 0, startDate: x.start, endDate: addD(x.start, x.size === 16 ? 3 : 2), stage: 'pending',
        groups: [], slots: x.slots || [], field: x.field, standings: (x.standings || []).map((r) => ({ ...r, points: 0 })), championId: x.championId, hosted: x }))
        .concat(u.shows.map((x) => ({ id: x.id, kind: 'show', club: true, name: x.name, split: 0, index: 0, startDate: x.start, endDate: x.start, stage: 'pending', groups: [], slots: [], field: [], standings: [], hosted: x })))
        .concat((u.smatch || []).filter((x) => !x.cancelled).map(smEvent));
    };
    // Statistics of the running event, like the Tier A / Tier B Standings tabs: bracket, results, top scorers, assists, MVPs.
    const INV_VIEWS = [['bracket', 'Bracket'], ['results', 'Results'], ['scorers', 'Top scorers'], ['assists', 'Most assists'], ['mvps', 'Most MVPs']];
    let invView = 'bracket';
    const evPlayed = (e) => (C().fixtures || []).filter((f) => f.invId === e.id && f.played);
    const invBoard = (e, kind, limit) => {
      const cnt = {};
      for (const f of evPlayed(e)) { if (kind === 'mvps') { if (f.mvpId != null && f.mvpId >= 0) cnt[f.mvpId] = (cnt[f.mvpId] || 0) + 1; } else for (const id of (kind === 'scorers' ? f.scorerIds : f.assistIds) || []) cnt[id] = (cnt[id] || 0) + 1; }
      const rows = Object.entries(cnt).map(([id, n]) => ({ p: player(Number(id)), n })).filter((x) => x.p).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name)).slice(0, limit || 30);
      if (!rows.length) return '<div class="sb-empty">' + esc(tl('Nothing recorded yet. Stats appear as matches are played.')) + '</div>';
      const me0 = C().userTeamId;
      return '<table class="tbl roomy"><thead><tr><th class="pos">#</th><th class="l">' + esc(tl('Player')) + '</th><th>' + esc(tl(kind === 'scorers' ? 'Goals' : kind === 'assists' ? 'Assists' : 'MVPs')) + '</th><th class="l">' + esc(tl('Club')) + '</th></tr></thead><tbody>' +
        rows.map((x, i) => { const t = teamById(x.p.teamId); return '<tr class="' + (x.p.teamId === me0 ? 'me' : '') + '"><td class="pos">' + (i + 1) + '</td><td class="l"><b>' + esc(x.p.name) + '</b></td><td><b>' + x.n + '</b></td><td class="l">' + (t ? esc(t.name) : '') + '</td></tr>'; }).join('') + '</tbody></table>';
    };
    const invResults = (e, limit) => {
      const list = evPlayed(e).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id).slice(0, limit || 60);
      if (!list.length) return '<div class="sb-empty">' + esc(tl('No matches played yet.')) + '</div>';
      return '<div class="sf-list">' + list.map((f) => { const H = teamById(f.homeId), A = teamById(f.awayId), hw = (f.homeWins || 0) > (f.awayWins || 0);
        return '<div class="sf-row' + (f.homeId === C().userTeamId || f.awayId === C().userTeamId ? ' mine' : '') + '"><span class="sf-team' + (hw ? ' won' : '') + '">' + (H ? crest(H, 'small') : '') + '<span>' + esc(H ? H.name : '?') + '</span></span><span class="sf-score">' + (f.homeWins || 0) + '<i>&ndash;</i>' + (f.awayWins || 0) + '</span><span class="sf-team r' + (hw ? '' : ' won') + '">' + (A ? crest(A, 'small') : '') + '<span>' + esc(A ? A.name : '?') + '</span></span></div>'; }).join('') + '</div>';
    };
    document.addEventListener('click', (ev0) => {
      const el = ev0.target.closest && ev0.target.closest('[data-action="ux-inv-view"]'); if (!el) return;
      ev0.stopImmediatePropagation(); ev0.preventDefault();
      invView = el.dataset.view;
      if (typeof standWindowOpen !== 'undefined' && standWindowOpen && typeof renderWindows === 'function') renderWindows(); else render();
    }, true);
    // Standings gets an extra tab (tier-ui.js) while a hosted Invitational runs, or on the day of a hosted showdown.
    // An event view lasts one day longer than the event: the day after, the finished bracket is still on the Home.
    const yday = () => addD(C().currentDate, -1);
    window.__uxInvBracket = (id) => { const e = clubEvents().find((q) => q.kind === 'invite' && q.id === id); return e ? '<div class="stand-event btier-cup">' + bracketArtHtml(e) + '</div>' : ''; }; // for the circuit tab (late-host-ui.js)
    window.__uxHosted = () => {
      const u = club(), today = C().currentDate, y = yday(), smToday = (u.smatch || []).find((v) => (v.start === today || v.start === y) && !v.cancelled);
      const invLive = (v) => v.stage === 'live' || (v.stage === 'done' && v.start <= today && today <= addD(v.start, (v.size === 16 ? 3 : 2) + 1));
      const x = isA() ? u.inv.find(invLive) || u.shows.find((v) => v.start === today || v.start === y) || smToday : smToday; // Tier B: only a showmatch invitation
      if (!x) return null;
      const e = clubEvents().find((q) => q.id === x.id && q.kind === (x.kind === 'smatch' ? 'smatch' : x.mode ? 'show' : 'invite')); if (!e) return null;
      const inv = e.kind === 'invite', cur = inv ? invView : 'bracket', circuit = inv && !!(window.__lateCircuitInv && window.__lateCircuitInv(e.id)); // a circuit stop belongs to the Circuit tab
      const content = (limit) => (cur === 'bracket' ? '<div class="stand-event btier-cup">' + bracketArtHtml(e) + '</div>' : cur === 'results' ? invResults(e, limit) : invBoard(e, cur, limit));
      return { circuit, key: e.kind + e.id, label: e.kind === 'invite' ? 'Invitational' : e.kind === 'smatch' ? 'Showmatch' : 'Showdown', name: e.name, body: () => content(0), card: () => content(8),
        tabs: () => (inv ? panelTabsHtml(INV_VIEWS, cur, 'ux-inv-view', 'data-view') : ''),
        pick: () => (inv ? INV_VIEWS.map((v) => '<button class="tb-item' + (v[0] === cur ? ' on' : '') + '" data-action="ux-inv-view" data-view="' + v[0] + '"><span class="tb-name">' + esc(tl(v[1])) + '</span></button>').join('') : ''), fixtures: () => (e.kind === 'invite' && typeof standFixturesHtml === 'function' ? standFixturesHtml(e) : '<div class="sb-empty dark">' + esc(tl('Played in one day. The results are on the left.')) + '</div>') };
    };
    // Home: while the hosted event runs the page gets the layout the game uses for a live Open (big Standings card with the bracket, news small).
    if (typeof homeHtml === 'function' && typeof standingsCardHtml === 'function' && typeof newsPanelHtml === 'function') {
      const oHome = homeHtml;
      homeHtml = function () { // eslint-disable-line no-global-assign
        let h = null; try { h = window.__uxHosted && window.__uxHosted(); } catch (e) { h = null; }
        if (!h || (typeof liveEvent === 'function' && liveEvent())) return oHome.apply(this, arguments);
        return ['<div class="grid-home event-on"><div class="home-left">', nextMatchCardHtml(), matchToday() ? '' : advanceCardHtml(), '<div class="home-pair">', notificationsCardHtml(), newsPanelHtml(), '</div>', trainingTileHtml(), '</div><div class="home-right">', standingsCardHtml(), '</div></div>'].join('');
      };
    }
    const oList = calEventList;
    calEventList = function () { return oList.apply(this, arguments).concat(clubEvents()).sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0)); }; // eslint-disable-line no-global-assign
    const oById = calEventById;
    calEventById = function (id) { return oById.apply(this, arguments) || clubEvents().find((e) => e.id === id) || null; }; // eslint-disable-line no-global-assign
    const oDays = eventDayMap;
    eventDayMap = function () { // eslint-disable-line no-global-assign
      const m = oDays.apply(this, arguments);
      for (const e of clubEvents()) { let d = e.startDate; for (let i = 0; i < 6 && d <= e.endDate; i++) { if (!m[d]) m[d] = e; d = addD(d, 1); } }
      return m;
    };
    const oNow = calEventNow;
    calEventNow = function () { // eslint-disable-line no-global-assign
      if (typeof calEvent === 'number' && clubEvents().some((e) => e.id === calEvent)) return calEvent; // the game would otherwise fall back to the current event
      return oNow.apply(this, arguments);
    };
    const oColour = eventColour;
    eventColour = function (e) { return e && e.club ? 'var(--gold,#e6a817)' : oColour.apply(this, arguments); }; // eslint-disable-line no-global-assign
    const oShort = shortEventName;
    shortEventName = function (e) { return e && e.club ? (e.kind === 'invite' ? 'INV' : e.kind === 'smatch' ? 'SM' : e.hosted.mode === 'crew' ? 'CREW' : e.hosted.mode) : oShort.apply(this, arguments); }; // eslint-disable-line no-global-assign
    const oMeaning = eventMeaningHtml;
    eventMeaningHtml = function (e) { // eslint-disable-line no-global-assign
      if (!e || !e.club) return oMeaning.apply(this, arguments);
      const h = e.hosted, res = h.result;
      if (e.kind === 'smatch') return '<div class="ev-meaning"><div class="ev-meaning-l"><div class="ev-where">' + esc(tl('Showmatch hosted by your club')) + '</div><div class="ev-feeds">' + esc(h.n + ' × ' + h.mode + ' · ' + tl('prize pool') + ' ' + money(h.prize) + ' ' + tl('per match') + (h.sponsors && h.sponsors.length ? ' · ' + h.sponsors.map((x) => x.name).join(', ') : '')) + '</div></div><div class="ev-meaning-r">' + (res ? '<span class="ev-you ' + (res.profit >= 0 ? 'good' : '') + '">' + esc(tl('Net {m}', { m: money(res.profit) })) + '</span>' : '') + '</div></div>' + smCards(h);
      const right = e.kind === 'invite' ? (res ? '<span class="ev-you ' + (res.profit >= 0 ? 'good' : '') + '">' + esc(tl('Net {m}', { m: money(res.profit) })) + '</span>' : '') : (res ? '<span class="ev-you">' + esc(tl('{n} won', { n: res.champion })) + '</span>' : '');
      const line = e.kind === 'invite' ? h.size + ' ' + tl('clubs') + ' · ' + tl('prize pool') + ' ' + money(h.prize) + (h.sponsors && h.sponsors.length ? ' · ' + h.sponsors.map((x) => x.name).join(', ') : '') : tl('Hosted by your club') + ' · ' + tl('prize pool') + ' ' + money(h.prize);
      return '<div class="ev-meaning"><div class="ev-meaning-l"><div class="ev-where">' + esc(tl('Hosted by your club')) + '</div><div class="ev-feeds">' + esc(line) + '</div></div><div class="ev-meaning-r">' + right + '</div></div>' +
        (e.kind === 'invite' ? invTableHtml(e) + '<button type="button" class="ux-cb" data-action="ux-club-inv-view" data-id="' + e.id + '">' + esc(tl('Open full bracket')) + '</button>' : bracketArtHtml(e));
    };
    const oGroups = groupsArtHtml;
    groupsArtHtml = function (e) { return e && e.club ? '' : oGroups.apply(this, arguments); }; // eslint-disable-line no-global-assign
    if (typeof bracketArtHtml === 'function') {
      const oBr = bracketArtHtml;
      bracketArtHtml = function (e) { // eslint-disable-line no-global-assign
        if (!e || !e.club) return oBr.apply(this, arguments);
        if (e.kind === 'smatch') return smCards(e.hosted);
        if (e.kind === 'show') {
          const r = e.hosted.result; if (!r) return '<div class="btier-empty">' + esc(tl('Played on the day. Results appear here.')) + '</div>';
          // one card per match: the two sides with their scores (winner highlighted), and for a crew battle the three duels underneath
          const side = (n, s, w) => '<div class="ux-sm-side' + (w ? ' win' : '') + '"><span>' + esc(n) + '</span><b>' + s + '</b></div>';
          const duels = (m) => (m.duels ? '<div class="ux-sm-duels">' + m.duels.map((d) => '<div class="ux-sm-d"><span class="' + (d.sa > d.sb ? 'w' : '') + '">' + esc(d.a) + '</span><i>' + d.sa + ' – ' + d.sb + '</i><span class="r ' + (d.sb > d.sa ? 'w' : '') + '">' + esc(d.b) + '</span></div>').join('') + '</div>' : '');
          const title = (i) => { const left = r.rounds.length - i; return left === 1 ? 'Final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals' : 'Round ' + (i + 1); };
          return r.rounds.map((rd, i) => '<div class="ux-cs"><h4>' + esc(tl(title(i))) + '</h4><div class="ux-sm-grid">' + rd.map((m) => '<div class="ux-sm' + (m.mine ? ' mine' : '') + '">' + side(m.a, m.sa, m.sa > m.sb) + side(m.b, m.sb, m.sb > m.sa) + duels(m) + '</div>').join('') + '</div></div>').join('');
        }
        if (!(e.slots || []).length) return '<div class="btier-empty">' + esc(tl('The bracket is drawn two days before the start.')) + '</div>';
        if (e.kind === 'invite') return '<div class="stand-event btier-cup">' + oBr({ kind: 'bcup', id: e.id, slots: e.slots.map((x) => ({ ...x, id: x.id.replace('I' + e.id + '-', 'C' + e.id + 'P-') })) }) + '</div>';
        const stages = ['r16', 'quarter', 'semi', 'final'];
        return stages.map((st2) => { const sl = e.slots.filter((x) => x.stage === st2); return sl.length ? '<div class="ux-cs"><h4>' + esc(tl(st2 === 'r16' ? 'Round of 16' : st2 === 'quarter' ? 'Quarter-finals' : st2 === 'semi' ? 'Semi-finals' : 'Final')) + '</h4>' +
          sl.map((x) => '<div class="ux-cr"><span>' + esc((teamById(x.teamA) || {}).name || '?') + ' v ' + esc((teamById(x.teamB) || {}).name || '?') + '</span><b>' + (x.winner != null ? esc((teamById(x.winner) || {}).name || '') : '') + '</b></div>').join('') + '</div>' : ''; }).join('');
      };
    }
  }

  // The match card names what is being played ("Esports World Cup", "Test Invitational", "Promotion group"), never the league name.
  if (typeof compOf === 'function') {
    const oComp = compOf;
    compOf = function (f) { // eslint-disable-line no-global-assign
      try {
        const c = C();
        if (f && f.invId != null) { const x = ((c.uxClub || {}).inv || []).find((v) => v.id === f.invId); if (x) return { id: -1, kind: 'scrim', name: x.name }; }
        if (f && f.xevId != null) { const x = ((c.uxMajors || {}).events || []).find((v) => v.id === f.xevId); if (x) return { id: -1, kind: 'scrim', name: x.name }; }
        if (f && f.promoId != null) return { id: -1, kind: 'scrim', name: tl('Promotion group') };
        if (f && f.cupId != null) { const x = ((c.tierB || {}).cups || []).find((v) => v.id === f.cupId); if (x) return { id: -1, kind: 'scrim', name: x.name }; }
      } catch (e) { /* fall back to the game's label */ }
      return oComp.apply(this, arguments);
    };
  }

  // ---------- showdown results ----------
  // the results are longer than the Standings panel: they scroll on their own, with the scroll bar hidden (wheel / touch / drag still work)
  st.textContent += '.stand-event:has(.ux-sm-grid){max-height:calc(100vh - 170px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}.stand-event:has(.ux-sm-grid)::-webkit-scrollbar{display:none;width:0;height:0}' +
    '.ux-sm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}' +
    '.ux-sm{background:var(--panel,#1c2330);border:1px solid var(--rule);border-left:3px solid var(--rule);border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:2px}.ux-sm.mine{border-left-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 9%,var(--panel,#1c2330))}' +
    '.ux-sm-side{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;color:var(--text-dim)}.ux-sm-side span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ux-sm-side b{font-size:var(--f-lg,18px);min-width:1.4em;text-align:right}' +
    '.ux-sm-side.win{color:var(--text);font-weight:800}.ux-sm-side.win b{color:var(--green,#3fb950)}' +
    '.ux-sm-duels{margin-top:6px;padding-top:6px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:3px;font-size:var(--f-small)}' +
    '.ux-sm-d{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;color:var(--text-dim)}.ux-sm-d span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ux-sm-d span.r{text-align:right}.ux-sm-d span.w{color:var(--text);font-weight:700}.ux-sm-d i{font-style:normal;font-weight:800;color:var(--text)}' + '';
  // ---------- Squad tab: synergy meter next to squad morale ----------
  st.textContent +='.panel-meta:has(.ux-synrow){max-width:none}.ux-synrow{display:flex;flex-wrap:nowrap;gap:110px;justify-content:flex-end;align-items:flex-start;padding-right:10px}.ux-synrow>.meter-wrap{display:flex;flex-direction:column;gap:7px;flex:none;width:230px;margin:0;text-align:left}.ux-synrow .meter-label,.ux-synrow .meter-value{text-align:left;padding:0;margin:0}.ux-synrow .meter{width:100%;margin:0}' +
    '.ux-fmt{display:inline-flex;gap:6px;margin-left:16px;vertical-align:middle}.ux-fmt button{font:inherit;font-size:var(--f-small);font-weight:800;letter-spacing:.08em;padding:4px 12px;border-radius:999px;border:1px solid var(--rule);background:transparent;color:var(--text-dim);cursor:pointer;transition:background .15s,color .15s,border-color .15s}' +
    '.ux-fmt button:hover{color:var(--text)}.ux-fmt button.on{color:var(--text);border-color:var(--accent,var(--red));background:color-mix(in srgb,var(--accent,var(--red)) 18%,transparent)}' +
    '.ux-fmt-hit{cursor:pointer;border-radius:10px}.ux-fmt-hit.held{outline:2px solid var(--accent,var(--red));outline-offset:2px}.ux-fmt-hit .pcard{pointer-events:none}.ux-fmt-hit[draggable=true]{cursor:grab}.ux-fmt-hit.dragging{opacity:.45}.ux-fmt-hit.drop-target{outline:2px dashed var(--accent,var(--red));outline-offset:2px}.ux-fmt-help{margin:4px 0 12px;color:var(--text-dim);font-size:var(--f-small)}.ux-fmt-row{cursor:pointer}.ux-fmt-row:hover td{background:color-mix(in srgb,var(--accent,var(--red)) 8%,transparent)}.ux-fmt-row.on td{background:color-mix(in srgb,var(--accent,var(--red)) 16%,transparent)}';
  // ---- squad formats: 3v3 is the game's own lineup; 2v2 and 1v1 each get their own, smaller squad (used by the showdowns) ----
  const FMT = { '3v3': 3, '2v2': 2, '1v1': 1 };
  let fmtSel = '3v3';
  const fmtPicks = (f) => {
    const mine = (C().players || []).filter((p) => p.teamId === C().userTeamId && !p.retired && !p.absence).sort((a, b) => (b.rating + MECH(b)) - (a.rating + MECH(a)) || a.id - b.id);
    const saved = (((C().uxClub || {}).lineups || {})[f] || []).filter((id) => mine.some((p) => p.id === id));
    return saved.concat(mine.map((p) => p.id).filter((id) => !saved.includes(id))).slice(0, FMT[f]);
  };
  window.__uxFmtPicks = fmtPicks; // the scrim match card / preview read the 2v2 / 1v1 squads through this
  const fmtChips = () => '<span class="ux-fmt" role="group" aria-label="' + esc(tl('Squad format')) + '">' + Object.keys(FMT).map((f) => '<button type="button" class="' + (fmtSel === f ? 'on' : '') + '" data-action="ux-fmt" data-fmt="' + f + '" title="' + esc(tl('{n} places', { n: FMT[f] })) + '">' + f + '</button>').join('') + '</span>';
  let fmtHold = null; // a starter picked up, waiting for the substitute he swaps with
  function fmtBody() {
    const picks = fmtPicks(fmtSel), n = FMT[fmtSel], t = teamById(C().userTeamId);
    const keys = n === 2 ? ['diag-l', 'diag-r'] : ['back'], opt = { draggable: false };
    const slots = keys.map((k, i) => '<div class="slot ' + k + '" data-slot="' + k + '"><div class="ux-fmt-hit' + (picks[i] != null && picks[i] === fmtHold ? ' held' : '') + '"' + (picks[i] != null ? ' draggable="true"' : '') + ' data-action="ux-fmt-pick" data-pid="' + (picks[i] != null ? picks[i] : '') + '" data-on="1">' + (picks[i] != null ? playerCardHtml(picks[i], 'on-pitch', opt) : '<div class="pcard empty">' + esc(tl('Nobody fit')) + '</div>') + '</div></div>').join('');
    const bench = t.playerIds.filter((id) => !picks.includes(id)).map((id) => '<div class="ux-fmt-hit" draggable="true" data-action="ux-fmt-pick" data-pid="' + id + '">' + playerCardHtml(id, 'on-bench', opt) + '</div>').join('') || '<div class="bench-empty">' + esc(tl('No substitutes.')) + '</div>';
    return '<div class="squad-pitch ux-fmt-pitch"><div class="bench-col"><div class="bench-head">' + esc(tl('Substitutes')) + '</div><div class="bench-list">' + bench + '</div><div class="bench-hint">' + esc(tl(n === 1 ? 'Click a substitute to put him on the pitch' : 'Click a starter, then a substitute, to swap them')) + '</div></div>' +
      '<div class="pitch-wrap"><div class="pitch">' + pitchChromeHtml() + slots + '</div></div></div><div class="panel-note"><b>' + esc(fmtSel) + '</b> ' + esc(tl('takes {n} player(s). The hosted {f} showdowns use this squad.', { n, f: fmtSel })) + '</div>';
  }
  // drag and drop like the 3v3 pitch: starter <-> starter swaps places, starter <-> substitute swaps them
  let fmtDrag = null;
  // a drop anywhere on the pitch counts for the nearest place, so a slightly missed card still works
  const pidOf = (el) => (el.dataset.pid === undefined || el.dataset.pid === '' ? null : Number(el.dataset.pid)); // player id 0 is a real player
  const hitOf = (e) => {
    const t = e.target.closest && e.target.closest('.ux-fmt-hit'); if (t) return t;
    if (fmtDrag == null || !(e.target.closest && e.target.closest('.ux-fmt-pitch .pitch'))) return null;
    let best = null, bd = 1e9;
    document.querySelectorAll('.ux-fmt-pitch .slot').forEach((s) => { const r = s.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)); if (d < bd) { bd = d; best = s; } });
    return best && best.querySelector('.ux-fmt-hit');
  };
  const clearHits = () => document.querySelectorAll('.ux-fmt-hit.dragging,.ux-fmt-hit.drop-target').forEach((x) => x.classList.remove('dragging', 'drop-target'));
  document.addEventListener('dragstart', (e) => {
    const h = hitOf(e); if (!h) return;
    fmtDrag = pidOf(h); if (fmtDrag == null) { e.preventDefault(); return; }
    h.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(fmtDrag)); } catch (x) { /* ignore */ }
  }, true);
  document.addEventListener('dragover', (e) => {
    const h = hitOf(e); if (!h || fmtDrag == null) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearHits(); h.classList.add('drop-target');
  }, true);
  document.addEventListener('dragend', () => { fmtDrag = null; clearHits(); }, true);
  document.addEventListener('drop', (e) => {
    const h = hitOf(e); if (!h || fmtDrag == null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const from = fmtDrag, to = pidOf(h); fmtDrag = null; clearHits();
    const cur = fmtPicks(fmtSel), fi = cur.indexOf(from), ti = to == null ? -1 : cur.indexOf(to);
    if (to == null || from === to || (fi < 0 && ti < 0)) return;
    const next = cur.slice();
    if (fi >= 0 && ti >= 0) { next[fi] = to; next[ti] = from; } else if (fi >= 0) next[fi] = to; else next[ti] = from;
    hubAct({ a: 'lineup', fmt: fmtSel, ids: next }).then((r) => { if (r && r.ok) S = r; render(); });
  }, true);
  if (typeof fifaPanelHtml === 'function') {
    const oFifa = fifaPanelHtml;
    fifaPanelHtml = function (o) { // eslint-disable-line no-global-assign
      try {
        const t = teamById(C().userTeamId);
        if (o && t && o.title === esc(t.name) && o.meta != null && typeof squadSide !== 'undefined' && squadSide !== 'nation' && tab === 'squad') o = { ...o, title: o.title + fmtChips(), body: fmtSel === '3v3' ? o.body : fmtBody() };
      } catch (e) { /* keep the game's own panel */ }
      return oFifa.call(this, o);
    };
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-action="ux-fmt"],[data-action="ux-fmt-pick"]'); if (!el) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (el.dataset.action === 'ux-fmt') { fmtSel = el.dataset.fmt; render(); return; }
      const id = pidOf(el), cur = fmtPicks(fmtSel), starter = cur.includes(id);
      if (id == null) return;
      if (starter) { fmtHold = fmtHold === id ? null : (FMT[fmtSel] === 1 ? null : id); render(); return; } // 1v1 has one place: nothing to pick first
      const out = FMT[fmtSel] === 1 ? cur[0] : fmtHold;
      if (out == null) { showToast(tl('Click the starter you want to replace first.')); return; }
      fmtHold = null;
      hubAct({ a: 'lineup', fmt: fmtSel, ids: cur.map((x) => (x === out ? id : x)) }).then((r) => { if (r && r.ok) S = r; render(); });
    }, true);
  }
  const origMorale = squadMoraleHtml;
  squadMoraleHtml = function (team) { // eslint-disable-line no-global-assign
    const html = origMorale.apply(this, arguments);
    try {
      const ch = team && team.id === C().userTeamId ? club().chem[team.id] : null;
      if (!ch) return html;
      const d = Math.round((Date.parse(C().currentDate + 'T12:00:00Z') - Date.parse(ch.since + 'T12:00:00Z')) / 86400000);
      const mod = d < 21 ? -3 * (1 - d / 21) : d < 90 ? 0 : Math.min(2.5, (d - 90) / 275 * 2.5);
      const [cls, name] = d < 21 ? ['restless', 'Adjusting'] : d < 90 ? ['settled', 'Settled'] : d < 270 ? ['happy', 'In sync'] : ['happy', 'Cohesive'];
      const tip = tl('Your three-man core has played together for {n} days.', { n: d }) + ' ' + tl('Rating effect: {m}. A new lineup plays worse for about three weeks; a trio that stays together builds up to +2.5.', { m: (mod > 0 ? '+' : '') + mod.toFixed(1) });
      const syn = '<div class="meter-wrap"><div class="meter-label">' + esc(tl('Synergy')) + '</div><div class="meter" title="' + esc(tip) + '"><div class="meter-fill ' + cls + '" style="width:' + Math.round((mod + 3) / 5.5 * 100) + '%;"></div></div>' +
        '<div class="meter-value ' + cls + '">' + esc(tl(name)) + ' · ' + (mod > 0.05 ? '+' : mod < -0.05 ? '−' : '±') + Math.abs(mod).toFixed(1) + '</div></div>';
      return '<div class="ux-synrow">' + html + syn + '</div>';
    } catch (e) { return html; }
  };

  // ---------- Player search: shortlist ("potential transfers") and Tier A / Tier B club groups ----------
  if (typeof searchFormHtml === 'function' && typeof searchResults === 'function' && typeof searchDetailHtml === 'function') {
    const watched = () => (C().uxClub && C().uxClub.watch) || [];
    const isWatched = (id) => watched().includes(id);
    const origForm = searchFormHtml;
    searchFormHtml = function () { // eslint-disable-line no-global-assign
      let html = origForm.apply(this, arguments);
      try {
        // transfer status: one more option
        html = html.replace(/(<select class="sf-select" data-sf="status">)([\s\S]*?)(<\/select>)/, (m, a, opts, z) => {
          const on = searchF.status === 'watch';
          return a + (on ? opts.replace(/ selected/g, '') : opts) + '<option value="watch"' + (on ? ' selected' : '') + '>' + esc(tl('Potential transfers')) + '</option>' + z;
        });
        // club: Tier A and Tier B in their own groups
        html = html.replace(/(<select class="sf-select" data-sf="club">)([\s\S]*?)(<\/select>)/, (m, a, opts, z) => {
          const items = [...opts.matchAll(/<option value="([^"]*)"( selected)?>([\s\S]*?)<\/option>/g)];
          const grp = { A: [], B: [] }, head = [];
          for (const it of items) { const t = it[1] === 'any' ? null : teamById(Number(it[1])); if (!t) head.push(it[0]); else grp[/_b$/.test(t.region || '') ? 'B' : 'A'].push(it[0]); }
          return a + head.join('') + '<optgroup label="' + esc(tl('Tier A clubs')) + '">' + grp.A.join('') + '</optgroup><optgroup label="' + esc(tl('Tier B clubs')) + '">' + grp.B.join('') + '</optgroup>' + z;
        });
      } catch (e) { /* keep the game's form */ }
      return html;
    };
    const origResults = searchResults;
    searchResults = function () { // eslint-disable-line no-global-assign
      if (searchF.status !== 'watch') return origResults.apply(this, arguments);
      searchF.status = 'any';
      try { const ids = new Set(watched()); return origResults.apply(this, arguments).filter((p) => ids.has(p.id)); } finally { searchF.status = 'watch'; }
    };
    const origDetail = searchDetailHtml;
    searchDetailHtml = function (p) { // eslint-disable-line no-global-assign
      const html = origDetail.apply(this, arguments);
      if (!p) return html;
      const w = isWatched(p.id);
      const btn = '<button class="sf-btn' + (w ? ' on' : '') + '" data-action="ux-watch" data-pid="' + p.id + '" title="' + esc(tl('Keep him on your shortlist; find him again with Transfer status: Potential transfers')) + '">' + esc(w ? tl('Remove from potential transfers') : tl('Add to potential transfers')) + '</button>';
      return html.replace(/(<div class="sr-acts">[\s\S]*?)(<\/div><button class="sf-btn wide")/, (m, a, z) => a + btn + z);
    };
    document.addEventListener('click', async (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-action="ux-watch"]'); if (!el) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const id = Number(el.dataset.pid), on = !isWatched(id);
      const r = await hubAct({ a: 'watch', playerId: id, on });
      if (r && r.ok) { S = r; showToast(on ? tl('Added to potential transfers') : tl('Removed from potential transfers')); render(); } else showToast((r && r.error) || tl('That is not possible.'));
    }, true);
  }

  // ---------- main tab: "Club" between Season and Socials (manager mode only) ----------
  const origTop = topbarHtml;
  topbarHtml = function () { // eslint-disable-line no-global-assign
    const h = origTop.apply(this, arguments);
    if (isPlayerMode()) return h;
    return h.replace(/<button class="[^"]*" data-action="tab" data-tab="socials">/, (m) => '<button class="' + (tab === 'club' ? 'active' : '') + '" data-action="tab" data-tab="club">' + esc(tl('Club')) + '</button>' + m);
  };
  const origInner = tabInnerHtml;
  tabInnerHtml = function () { // eslint-disable-line no-global-assign
    if (tab !== 'club') { wasClub = false; return origInner.apply(this, arguments); }
    if (!wasClub) { fresh = true; wasClub = true; if (window.__lateUI) setTimeout(window.__lateUI.opened, 0); } // late game: one-time mode popup
    if (isPlayerMode()) { tab = 'home'; return origInner.apply(this, arguments); }
    if (!wins4) setTimeout(load, 0);
    setTimeout(fit, 0);
    return pageHtml();
  };

  document.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('.ux-dd'))) closeDd();
    const a = e.target && e.target.closest && e.target.closest('[data-action^="ux-club-"]:not([data-action="ux-club-hist"])'); if (!a) return; // the Squad club tile (hist) wraps the club / nation arrows
    e.stopImmediatePropagation();
    const act0 = a.dataset.action, id = Number(a.dataset.id);
    if (act0 === 'ux-club-tab') { sub = a.dataset.tab; fresh = true; draw(); return; }
    if (act0 === 'ux-club-evtab') { evTab = a.dataset.t; if (evTab === 'smatch') refreshSmPreview(); draw(); return; }
    if (act0 === 'ux-club-dp') { const f = a.dataset.f, d0 = wd[f]; if (!d0) return; dp = { f, month: (dpCur(f) || d0.wins[0] || C().currentDate).slice(0, 7) }; showModal(dpHtml()); return; }
    if (act0 === 'ux-club-dpm' && dp) { const [y, m] = dp.month.split('-').map(Number), n = new Date(y, m - 1 + Number(a.dataset.d), 1, 12); dp.month = n.getFullYear() + '-' + pad2(n.getMonth() + 1); showModal(dpHtml()); return; }
    if (act0 === 'ux-club-dpd' && dp) { const v = a.dataset.day; if (dp.f === 'inv') form.start = v; else if (dp.f === 'show') sf.start = v; else smf.start = v; dp = null; closeModal(); draw(); return; }
    if (act0 === 'ux-club-ssp') { const i = Number(a.dataset.i); smf.sponsors = smf.sponsors.includes(i) ? smf.sponsors.filter((x) => x !== i) : smf.sponsors.concat(i); draw(); return; }
    if (act0 === 'ux-club-sm') { const pairs = smPairs(); if (!pairs) return void showToast(tl('Pick both sides of every match first.')); return void act({ a: 'smatch', mode: smf.mode, start: smf.start, prize: smf.prize, pairs, sponsors: smf.sponsors }, tl('Showmatches scheduled.')).then((good) => { if (good) { smf.pairs.forEach((p) => { p.a = ''; p.b = ''; }); draw(); } }); }
    if (act0 === 'ux-club-sm-view') { smModal(id); return; }
    if (act0 === 'ux-club-smi') { const yes = a.dataset.yes === '1'; return void act({ a: yes ? 'smaccept' : 'smdecline', id }, yes ? tl('Showmatch accepted.') : tl('Declined.')).then(() => render()); }
    if (act0 === 'ux-club-sm-cancel') return void act({ a: 'smcancel', id }, tl('Cancelled.'));
    if (act0 === 'ux-club-dd') { const dd = a.closest('.ux-dd'), was = dd.classList.contains('open'); closeDd(); if (!was) { dd.classList.add('open'); const q = dd.querySelector('[data-dds]'); if (q) { q.value = ''; filterDd(q); q.focus(); } } e.preventDefault(); return; }
    if (act0 === 'ux-club-pick') {
      const dd = a.closest('.ux-dd'); dd.dataset.value = a.dataset.v; dd.querySelector('.ux-ddb span').textContent = a.textContent;
      dd.querySelectorAll('.ux-ddo').forEach((x) => x.classList.toggle('on', x === a)); closeDd(); e.preventDefault(); setField(dd.dataset.club, a.dataset.v); return;
    }
    if (act0 === 'ux-club-inv') { const on = a.checked; form.invitees = form.invitees.filter((x) => x !== id); if (on && form.invitees.length < form.size - 1) form.invitees.push(id); else if (on) { showToast(tl('The field is full.')); } draw(); refreshPreview(); return; }
    if (act0 === 'ux-club-spon') { const i = Number(a.dataset.i); form.sponsors = form.sponsors.includes(i) ? form.sponsors.filter((x) => x !== i) : form.sponsors.concat(i); draw(); return; }
    if (act0 === 'ux-club-host') return void act({ a: 'host', scope: form.scope, size: form.size, start: form.start, prize: Number(form.prize), name: form.name, invitees: form.invitees, sponsors: form.sponsors }, tl('Invitational scheduled.'));
    if (act0 === 'ux-club-inv-view') { invModal(id); return; }
    if (act0 === 'ux-club-cancel') return void act({ a: 'cancelInv', id }, tl('Cancelled.'));
    if (act0 === 'ux-club-show') return void act({ a: 'show', scope: sf.scope, mode: sf.mode, start: sf.start, prize: Number(sf.prize) }, tl('Event scheduled.'));
  }, true);
  const closeDd = () => document.querySelectorAll('.ux-dd.open').forEach((x) => x.classList.remove('open'));
  // search box in a dropdown: hide the options that do not contain what was typed; Enter picks the first one left
  const filterDd = (q) => { const w = q.value.trim().toLowerCase(); q.parentNode.querySelectorAll('.ux-ddo').forEach((x) => { x.style.display = !w || x.dataset.v === '' || x.textContent.toLowerCase().includes(w) ? '' : 'none'; }); };
  document.addEventListener('input', (e) => { if (e.target && e.target.dataset && e.target.dataset.dds != null) filterDd(e.target); }, true);
  document.addEventListener('keydown', (e) => {
    const q = e.target; if (!q || !q.dataset || q.dataset.dds == null) return;
    if (e.key === 'Enter') { e.preventDefault(); const f = [...q.parentNode.querySelectorAll('.ux-ddo')].find((x) => x.style.display !== 'none' && x.dataset.v !== '') ; if (f) f.click(); }
    else if (e.key === 'Escape') closeDd();
  }, true);
  function setField(k, v) {
    if (k === 'scope') { form.scope = v; form.invitees = form.invitees.filter((id) => inScope(teamById(id), v)); refreshPreview(); draw(); }
    else if (k === 'sscope') sf.scope = v;
    else if (k === 'size') { form.size = Number(v); form.invitees = form.invitees.slice(0, form.size - 1); refreshPreview(); draw(); }
    else if (k === 'start') form.start = v; else if (k === 'prize') { form.prize = Number(String(v).replace(/[^0-9]/g, '')) || 0; refreshPreview(); }
    else if (k === 'name') form.name = v;
    else if (k === 'smode') { sf.mode = v; draw(); } else if (k === 'sstart') sf.start = v; else if (k === 'sprize') { sf.prize = Number(String(v).replace(/[^0-9]/g, '')) || 0; draw(); }
    // showmatches: format (resets the sides, they differ between clubs and players), number of matches, prize, and the two sides of each match
    else if (k === 'smmode') { smf.mode = v; smf.pairs.forEach((p) => { p.a = ''; p.b = ''; }); smpv = null; draw(); }
    else if (k === 'smn') { smf.n = Number(v); smpv = null; refreshSmPreview(); draw(); }
    else if (k === 'smprize') { smf.prize = Number(String(v).replace(/[^0-9]/g, '')) || 0; refreshSmPreview(); draw(); }
    else if (/^smBO\d$/.test(k)) { smf.pairs[Number(k[4])].bo = Number(v); draw(); }
    else if (/^sm[AB]\d$/.test(k)) { smf.pairs[Number(k[3])][k[2].toLowerCase()] = v; smpv = null; refreshSmPreview(); draw(); }
  }
  // live update while typing the showdown prize (no redraw: that would drop the input focus)
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t || !t.dataset || t.dataset.club !== 'sprize') return;
    sf.prize = Number(String(t.value).replace(/[^0-9]/g, '')) || 0;
    const pay = document.querySelector('[data-sp="pay"]'), inc = document.querySelector('[data-sp="inc"]');
    if (pay) pay.textContent = '−' + money(sf.prize + 15000); if (inc) inc.textContent = '+' + money(Math.round(sf.prize * 0.4 / 100) * 100);
  }, true);
  document.addEventListener('change', (e) => { const t = e.target, k = t && t.dataset && t.dataset.club; if (k) setField(k, t.value); }, true);
  // inbox: a showmatch invitation shows Accept / Decline under its message and counts as "needs you" until it is answered
  if (typeof msgActionsHtml === 'function' && typeof msgNeedsYou === 'function') {
    const oActions = msgActionsHtml, oNeeds = msgNeedsYou;
    const openInv = (m) => m && m.type === 'smatch_invite' && !m.resolved && ((C().uxClub || {}).smInv || []).find((v) => v.id === (m.data && m.data.inviteId) && v.status === 'open');
    msgActionsHtml = function (m) { const v = openInv(m); return v ? '<div class="btnrow" style="justify-content:flex-start;margin-top:8px">' + answerBtns(v.id).replace(/ux-cb ghost/, 'btn ghost sm').replace(/class="ux-cb"/, 'class="btn primary sm"') + '</div>' : oActions.apply(this, arguments); }; // eslint-disable-line no-global-assign
    msgNeedsYou = function (m) { return m && m.type === 'smatch_invite' ? !!openInv(m) : oNeeds.apply(this, arguments); }; // eslint-disable-line no-global-assign
  }
  try { render(); } catch (e) { /* no career open yet */ } // the tab bar was drawn before this wrapper existed
})();
