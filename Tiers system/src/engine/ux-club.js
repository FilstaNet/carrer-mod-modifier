'use strict';
// Club systems round (all additive; state lives in state.uxClub, created on demand so old saves load unchanged):
//   Invitationals (8/16 clubs, hosted + funded by the user's club), off-season 1v1 / 2v2 / crew-battle showdowns and roster chemistry.
// Hooks (installed before the Tier B wrapper, so they sit directly around the game's own functions):
//   advance:        chemistry modifiers are applied to player ratings for the duration of the game's own call and removed afterwards,
//                   then the daily tick runs (invitationals, showdowns).
//   simulateFixture: same chemistry modifiers for the user's own simulated series.
//   placeBet:       kind 'uxc:<json>' is the UI's action channel (the only IPC the game's main process forwards untouched).
const { hash } = require('./ux-persona');
const cups = require('./btier-cups');
const simcal = require('./ux-simcal');

const DAY = 86400000;
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mkRand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const money = (n) => { const a = Math.abs(Math.round(n)); return (n < 0 ? '-' : '') + (a >= 1e6 ? '$' + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : a >= 1000 ? '$' + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : '$' + a); };

// ---- tuning ----
const MAX_INV = 2; // hosted Invitationals running at once
const HOST_MIN_FOLLOWERS = 60000, HOST_MIN_BUDGET = 600000;
const MARGIN_HOST = 4, MARGIN_SMALL = 1; // free days kept around official events and other hosted events (Invitationals, circuit stops); streams / showdowns / scrims only keep 1
const CHEM_DIP_DAYS = 21, CHEM_FULL_DAYS = 365;
const SPONSORS = ['Voltline Energy', 'Northgate Mobile', 'Pixelforge Hardware', 'Auric Bank', 'Skyrail Airlines', 'Cobalt Drinks', 'Helix Streaming', 'Merrow Apparel', 'Tessel Insurance', 'Brightwave Telecom'];

const ensure = (state) => state.uxClub || (state.uxClub = { v: 1, inv: [], shows: [], chem: {}, seq: 0, lastPost: 0, log: [] });

// mechanics: a stable per-player trait. A few players are gifted solo players (worth little more in 3v3, a lot in 1v1 / 2v2).
function mech(p) { const h = hash('mech:' + p.name) % 100; return h < 12 ? 6 : h < 35 ? 3 : h < 70 ? 0 : -3; }
const soloScore = (p) => (p.rating || 0) + mech(p);

function create(engine, ev, opts = {}) {
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-club: ' + what + ' failed: ' + e.stack); return undefined; } };
  const team = (state, id) => engine.teamById(state, id);
  const player = (state, id) => engine.playerById(state, id);
  const user = (state) => team(state, state.userTeamId);
  const fmt = (n) => (engine.fmtMoney ? engine.fmtMoney(n) : money(n));
  const note = (state, type, title, body, data) => { state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type, title, link: 'inbox', body, ...(data ? { data } : {}) }); if (state.inbox.length > 120) state.inbox.splice(0, state.inbox.length - 120); };
  const ledger = (state, kind, amount, text) => { try { engine.pushLedger(state, kind, amount, text); } catch (e) { /* optional */ } };
  const moral = (p, d) => { p.morale = clamp(Math.round(((p.morale == null ? 70 : p.morale) + d) * 10) / 10, 0, 100); };
  const tierOf = (t) => (t && /_b$/.test(t.region || '') ? 'B' : 'A');
  // the three best players of a club regardless of who is injured today: the stable "core" chemistry is tracked on
  const core = (state, t) => (t.playerIds || []).map((id) => player(state, id)).filter(Boolean).sort((a, b) => b.rating - a.rating || a.id - b.id).slice(0, 3).map((p) => p.id);

  // ========================= calendar =========================
  // days that are taken: Tier A events, Tier B cups, the promotion-playoff period after the last event, hosted events, user matches
  function busy(state) {
    const iv = [];
    // third item = kind: 'official' (game events, Tier B cups, Kick-Off / EWC, promotion playoffs), 'hosted' (the user's own events), 'small' (streams / showdowns)
    for (const e of state.events || []) if (e.startDate && e.endDate) iv.push([e.startDate, e.endDate, 'official']);
    for (const c of (state.tierB && state.tierB.cups) || []) if (c.startDate && c.endDate) iv.push([c.startDate, c.endDate, 'official']);
    for (const c of (state.uxMajors && state.uxMajors.events) || []) if (!c.skipped && c.startDate && c.endDate) iv.push([c.startDate, c.endDate, 'official']);
    const ends = (state.events || []).map((e) => e.endDate).filter(Boolean).sort();
    if (ends.length) iv.push([ends[ends.length - 1], addDays(ends[ends.length - 1], 24), 'official']); // promotion playoffs
    const u = ensure(state);
    for (const x of u.inv) if (x.stage !== 'done' && x.stage !== 'cancelled') iv.push([x.start, addDays(x.start, x.size === 16 ? 3 : 2), 'hosted']);
    for (const x of u.shows) if (!x.done) iv.push([x.start, x.start, 'small']);
    for (const x of u.smatch || []) if (!x.done) iv.push([x.start, x.start, 'tiny']); // showmatches: only their own day is taken (the day before / after stays free)
    for (const c of (state.late && state.late.host && state.late.host.circuits) || []) for (const x of [...c.stops, c.finals]) if (x && x.status === 'planned') iv.push([x.start, addDays(x.start, 2), 'hosted']); // late-host.js circuit stops not yet created
    const mine = new Set((state.fixtures || []).filter((f) => !f.played && (f.homeId === state.userTeamId || f.awayId === state.userTeamId)).map((f) => f.date));
    return { iv, mine };
  }
  // margin: days that must stay free around other events. Default: more than one day long (Invitationals, circuit stops) = MARGIN_HOST, one day (streams) = MARGIN_SMALL.
  // A 'small' event (stream / showdown) only ever asks MARGIN_SMALL of the others.
  const marginOf = (len, margin) => (margin != null ? margin : len > 1 ? MARGIN_HOST : MARGIN_SMALL);
  const clash = (iv, mine, x, margin) => mine.has(x) || iv.some(([a, b, k]) => { const m = k === 'tiny' ? 0 : k === 'small' ? Math.min(margin, MARGIN_SMALL) : margin; return x >= addDays(a, -m) && x <= addDays(b, m); });
  function windows(state, len = 3, count = 8, margin, all) {
    const { iv, mine } = busy(state), out = [], m = marginOf(len, margin);
    for (let d = addDays(state.currentDate, 10); out.length < count && days(state.currentDate, d) < 400; d = addDays(d, 1)) {
      let ok = true;
      for (let k = 0; k < len && ok; k++) if (clash(iv, mine, addDays(d, k), m)) ok = false;
      if (ok) { out.push(d); if (!all) d = addDays(d, 6); }
    }
    return out;
  }
  const windowOk = (state, start, len, margin) => {
    if (!(start >= addDays(state.currentDate, 7))) return false;
    const { iv, mine } = busy(state), m = marginOf(len, margin);
    for (let k = 0; k < len; k++) if (clash(iv, mine, addDays(start, k), m)) return false;
    return true;
  };
  // a scrim booked in or next to the days: the user has to cancel it first (scrims are small events: 1 day)
  const scrimClash = (state, start, len) => ((state.uxScrims && state.uxScrims.list) || []).find((x) => x.status === 'scheduled' && x.date >= addDays(start, -MARGIN_SMALL) && x.date <= addDays(start, len - 1 + MARGIN_SMALL)) || null;
  const notFree = (state, start, len) => { const sc = scrimClash(state, start, len); return sc ? 'A scrim is booked on ' + sc.date + ': cancel it first.' : 'That date is not free: events, your matches or the promotion playoffs are in the way, and hosted events need ' + MARGIN_HOST + ' free days around other events.'; };

  // ========================= invitationals =========================
  const canHost = (state) => { const t = user(state); return !!t && tierOf(t) === 'A' && (t.followers || 0) >= HOST_MIN_FOLLOWERS && t.budget >= HOST_MIN_BUDGET; };
  // scope 'region' = the user's own region (Tier A and its Tier B clubs); anything else = global
  const baseRegion = (t) => String(t.region || '').replace(/_b$/, '');
  const inScope = (state, t, scope) => scope !== 'region' || baseRegion(t) === baseRegion(user(state));
  const pool = (state, scope) => state.teams.filter((t) => t.id !== state.userTeamId && !t.nation && t.region && inScope(state, t, scope));
  const willing = (state, host, t, prize) => tierOf(t) === 'B' || (t.followers || 0) <= (host.followers || 0) * (0.8 + clamp(prize / Math.max(1, host.budget * 0.08), 0, 2) * 0.6);

  // everything that is decided before money moves: size, field (declines replaced), costs, sponsor offers. Used by preview and host.
  function planInvitational(state, a) {
    const u = ensure(state), host = user(state);
    if (!canHost(state)) return { ok: false, error: 'Your club needs ' + HOST_MIN_FOLLOWERS.toLocaleString('en') + ' followers and ' + fmt(HOST_MIN_BUDGET) + ' to host an Invitational.' };
    const size = Number(a.size) === 16 ? 16 : 8, scope = a.scope === 'region' ? 'region' : 'global';
    const lo = Math.max(40000, Math.round(host.budget * 0.02)), hi = Math.round(host.budget * 0.3), prize = Math.round(Number(a.prize) || 0);
    const want = (Array.isArray(a.invitees) ? a.invitees : []).map(Number), declined = [], field = [];
    const forced = Array.isArray(a.forced) ? a.forced.map(Number).filter((id, i, arr) => id !== state.userTeamId && team(state, id) && arr.indexOf(id) === i) : null; // circuit finals: qualified clubs, no willingness check
    if (forced) field.push(...forced);
    else for (const id of want) { const t = team(state, id); if (!t || id === state.userTeamId || field.includes(id) || !inScope(state, t, scope)) continue; if (willing(state, host, t, prize)) field.push(id); else declined.push(id); }
    const rest = pool(state, scope).filter((t) => !field.includes(t.id) && willing(state, host, t, prize)).sort((x, y) => Math.abs((x.followers || 0) - (host.followers || 0)) - Math.abs((y.followers || 0) - (host.followers || 0)) || x.id - y.id);
    if (!forced) for (const t of rest) { if (field.length >= size - 1) break; field.push(t.id); }
    const ids = field.slice(0, size - 1), ops = Math.round(20000 + prize * 0.15);
    const avgFol = ids.length ? sum(ids.map((id) => team(state, id).followers || 0)) / ids.length : 0, mult = clamp(0.6 + avgFol / 300000, 0.6, 1.8);
    const offers = [['Title sponsor', 0.4], ['Presenting partner', 0.25], ['Official partner', 0.15]].map(([role, share], i) => ({ role, name: SPONSORS[(hash('inv:' + state.season + ':' + state.currentDate + ':' + i) + i * 3) % SPONSORS.length], fee: Math.round(prize * share * mult / 500) * 500 }));
    return { ok: true, size, scope, ids, declined, prize, lo, hi, ops, mult, offers, running: u.inv.filter((x) => x.stage !== 'done' && x.stage !== 'cancelled').length };
  }
  const previewInvitational = (state, a) => { const pl = planInvitational(state, a); return pl.ok ? { ok: false, preview: { size: pl.size, ids: pl.ids, declined: pl.declined, lo: pl.lo, hi: pl.hi, ops: pl.ops, offers: pl.offers, mult: pl.mult } } : pl; };

  function hostInvitational(state, a) {
    const u = ensure(state), host = user(state), pl = planInvitational(state, a);
    if (!pl.ok) return pl;
    const { size, scope, ids, declined, prize, lo, hi, ops, mult, offers } = pl;
    if (pl.running >= MAX_INV) return { ok: false, error: 'You can host at most ' + MAX_INV + ' Invitationals at once.' };
    const hl = size === 16 ? 4 : 3;
    if (!windowOk(state, a.start, hl) || scrimClash(state, a.start, hl)) return { ok: false, error: notFree(state, a.start, hl) };
    if (prize < lo || prize > hi) return { ok: false, error: 'The prize pool must be between ' + fmt(lo) + ' and ' + fmt(hi) + '.' };
    if (host.budget < prize + ops) return { ok: false, error: 'You can not fund that: prize pool and running costs are ' + fmt(prize + ops) + '.' };
    if (ids.length < size - 1) return { ok: false, error: 'Not enough clubs accept an invitation.' };
    const signed = (Array.isArray(a.sponsors) ? a.sponsors : []).map(Number).filter((i) => i >= 0 && i < offers.length);
    const sponsorIncome = sum(signed.map((i) => offers[i].fee));
    host.budget -= prize + ops; ledger(state, 'event', -(prize + ops), 'Invitational: prize pool and running costs');
    if (sponsorIncome) { host.budget += sponsorIncome; ledger(state, 'event', sponsorIncome, 'Invitational: sponsors'); }
    const inv = { id: state.nextId++, seq: ++u.seq, name: String(a.name || '').slice(0, 40) || host.name + ' Invitational', size, scope, start: a.start, stage: 'scheduled', field: [state.userTeamId].concat(ids), prize, ops, sponsors: signed.map((i) => offers[i]), sponsorIncome, offers, declined, mult, slots: null, seeds: null, standings: null, championId: null };
    u.inv.push(inv);
    note(state, 'news', inv.name + ' is on', size + ' clubs, ' + fmt(prize) + ' prize pool, starts ' + a.start + '. ' + (declined.length ? declined.length + ' invitation(s) declined and were replaced. ' : '') + (signed.length ? 'Sponsors signed: ' + inv.sponsors.map((x) => x.name).join(', ') + ' (' + fmt(sponsorIncome) + ').' : 'No sponsors signed.'));
    return { ok: true, inv };
  }
  const invBestOf = (inv, slot) => (slot.stage === 'final' ? 5 : 3);
  function invFixture(state, inv, slot) {
    const depth = ev.slotDepth(inv.slots, slot.id);
    const fx = { id: state.nextId++, eventId: inv.id, invId: inv.id, stage: slot.stage, slotId: slot.id, round: 0, homeId: slot.teamA, awayId: slot.teamB, date: addDays(inv.start, depth) < state.currentDate ? state.currentDate : addDays(inv.start, depth),
      played: false, overtime: false, userPlayed: false, bestOf: slot.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1 };
    slot.fixtureId = fx.id; state.fixtures.push(fx);
  }
  // After one of the user's Invitational matches the next one is handed over at once (same chaining the game does for its own events and
  // btier-state.js does for cups): read the result, open the next round, run days until the user's next match here, or stop when out / over.
  function chainInv(state, rand, fx, inv) {
    const mine = (f) => f && (f.homeId === state.userTeamId || f.awayId === state.userTeamId);
    const due = () => state.fixtures.find((f) => !f.played && f.invId === inv.id && mine(f) && f.date <= state.currentDate) || null;
    for (let i = 0; i < 8; i++) {
      stepInvitational(state, inv);
      const d = due(); if (d) return d;
      if (inv.stage === 'done' || ev.teamEliminated(inv.slots || [], state.userTeamId)) return null;
      const r = engine.advance(state, rand, 'day');
      if (r.stopped === 'matchday') { const f = engine.fixtureById(state, r.fixtureId); return f && f.invId === inv.id ? f : null; }
      if (r.stopped !== 'day') return null;
    }
    return null;
  }
  const resultOf = (state) => (slot) => { const f = engine.fixtureById(state, slot.fixtureId); return f && f.played ? (f.homeWins > f.awayWins ? f.homeId : f.awayId) : null; };
  function stepInvitational(state, inv) {
    if (inv.stage === 'done' || inv.stage === 'cancelled') return;
    if (inv.stage === 'scheduled') {
      if (addDays(inv.start, -2) > state.currentDate) return;
      const order = inv.field.slice().sort((a, b) => (team(state, b).followers || 0) - (team(state, a).followers || 0));
      const slots = cups.buildSingleElim16(ev, 'I' + inv.id, 3, 5, inv.size === 16 ? 32 : 16);
      for (const s of slots) s.bestOf = invBestOf(inv, s);
      inv.slots = slots; inv.seeds = order; inv.stage = 'live';
    }
    for (const s of inv.slots) { if (s.fixtureId == null || s.winner != null) continue; const w = resultOf(state)(s); if (w != null) ev.recordResult(inv.slots, s.id, w); }
    for (const s of ev.openSlots(inv.slots, inv.seeds)) invFixture(state, inv, s);
    if (ev.bracketComplete(inv.slots)) finishInvitational(state, inv);
  }
  function finishInvitational(state, inv) {
    const by = (id) => ev.slotById(inv.slots, 'I' + inv.id + '-' + id), lose = (s) => (s.winner === s.teamA ? s.teamB : s.teamA);
    const fin = by('final'), rank = (id) => inv.seeds.indexOf(id), pick = (ids) => ids.map((i) => lose(by(i))).sort((a, b) => rank(a) - rank(b));
    const order = [fin.winner, lose(fin), ...pick(['sf-1', 'sf-2']), ...pick(['qf-1', 'qf-2', 'qf-3', 'qf-4']), ...(inv.size === 16 ? pick(['r16-1', 'r16-2', 'r16-3', 'r16-4', 'r16-5', 'r16-6', 'r16-7', 'r16-8']) : [])];
    const shares = inv.size === 16 ? [0.3, 0.16, 0.08, 0.08, 0.04, 0.04, 0.04, 0.04, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02] : [0.4, 0.2, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05];
    const tot = sum(shares);
    inv.standings = order.map((teamId, i) => ({ teamId, placement: i + 1, prize: Math.round(inv.prize * shares[i] / tot / 100) * 100 }));
    inv.championId = order[0];
    for (const s of inv.standings) { const t = team(state, s.teamId); if (t) t.budget += s.prize; }
    const host = user(state), gate = Math.round(inv.prize * 0.25 * inv.mult / 500) * 500;
    host.budget += gate; ledger(state, 'event', gate, 'Invitational: gate and streaming');
    const growth = Math.round((host.followers || 0) * 0.02 + 4000 * inv.mult);
    host.followers = (host.followers || 0) + growth;
    for (const p of state.players) if (p.teamId === state.userTeamId) p.followers = Math.round((p.followers || 0) * 1.01);
    const mine = inv.standings.find((s) => s.teamId === state.userTeamId), back = (mine ? mine.prize : 0) + inv.sponsorIncome + gate, cost = inv.prize + inv.ops;
    inv.result = { gate, growth, back, cost, profit: back - cost };
    for (const f of state.fixtures) if (f.invId === inv.id && f.homeId !== state.userTeamId && f.awayId !== state.userTeamId) { f.games = []; f.scorerIds = []; f.assistIds = []; f.compact = true; }
    inv.stage = 'done';
    note(state, 'news', inv.name + ': ' + team(state, inv.championId).name + ' win it', 'Champion ' + team(state, inv.championId).name + '. Your club: ' + (mine ? '#' + mine.placement + ' (' + fmt(mine.prize) + ')' : 'out') + '.\nSponsors ' + fmt(inv.sponsorIncome) + ', gate ' + fmt(gate) + ', prize pool and costs ' + fmt(-cost) + ': net ' + fmt(inv.result.profit) + ' for the event. Followers +' + growth.toLocaleString('en') + '.');
  }

  // ========================= squad formats (3v3 is the game's own lineup; 2v2 and 1v1 are picked here) =========================
  const FORMAT_SIZE = { '2v2': 2, '1v1': 1 };
  const fit = (state) => (state.players || []).filter((p) => p.teamId === state.userTeamId && !p.retired && !p.absence).sort((x, y) => soloScore(y) - soloScore(x) || x.id - y.id);
  // the saved picks that are still valid, topped up with the club's best solo players
  function fmtLineup(state, fmt) {
    const n = FORMAT_SIZE[fmt]; if (!n) return [];
    const ok = fit(state), saved = ((ensure(state).lineups || {})[fmt] || []).filter((id, i, a) => a.indexOf(id) === i && ok.some((p) => p.id === id));
    return saved.concat(ok.map((p) => p.id).filter((id) => !saved.includes(id))).slice(0, n);
  }
  // a crew battle: the three best solo players, with the user's own player always among them (he takes the weakest place) so there is a duel to play
  function crewEntry(state) {
    const ids = fit(state).slice(0, 3).map((p) => p.id), me = state.userPlayerId;
    if (me != null && !ids.includes(me) && fit(state).some((p) => p.id === me)) ids[ids.length - 1] = me;
    return ids;
  }
  function setLineup(state, a) {
    const n = FORMAT_SIZE[a.fmt]; if (!n) return { ok: false, error: 'Unknown format.' };
    const mine = new Set((state.players || []).filter((p) => p.teamId === state.userTeamId && !p.retired).map((p) => p.id));
    const ids = (Array.isArray(a.ids) ? a.ids : []).map(Number).filter((id, i, arr) => mine.has(id) && arr.indexOf(id) === i).slice(0, n);
    const u = ensure(state); u.lineups = u.lineups || {}; u.lineups[a.fmt] = ids;
    return { ok: true };
  }

  // ========================= showdowns (1v1, 2v2, crew battle) =========================
  const SHOW = { '1v1': { field: 16, label: '1v1 Showdown' }, '2v2': { field: 8, label: '2v2 Showdown' }, crew: { field: 8, label: 'Crew Battle' } };
  function scheduleShowdown(state, a) {
    const u = ensure(state), host = user(state), mode = SHOW[a.mode] ? a.mode : null;
    if (!mode) return { ok: false, error: 'Unknown event type.' };
    if (!windowOk(state, a.start, 1)) return { ok: false, error: notFree(state, a.start, 1) };
    if (u.shows.some((x) => !x.done && x.start === a.start)) return { ok: false, error: 'You already have an event that day.' };
    // floors keep the range valid for small Tier B budgets (8% of a $90K budget is below $10K); affordability is checked below
    const lo = Math.max(5000, Math.round(host.budget * 0.005)), hi = Math.max(25000, Math.round(host.budget * 0.08)), prize = Math.round(Number(a.prize) || 0);
    if (prize < lo || prize > hi) return { ok: false, error: 'The prize pool must be between ' + fmt(lo) + ' and ' + fmt(hi) + '.' };
    const mine = fit(state);
    let entry = (Array.isArray(a.entry) ? a.entry : []).map(Number).filter((id) => mine.some((p) => p.id === id));
    const need = mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3;
    if (entry.length !== need) entry = mode === 'crew' ? crewEntry(state) : fmtLineup(state, mode); // 2v2 / 1v1: the squad picked for that format
    if (entry.length < need) return { ok: false, error: 'Not enough fit players.' };
    const cost = prize + 15000; if (host.budget < cost) return { ok: false, error: 'You can not fund that: ' + fmt(cost) + '.' };
    host.budget -= cost; ledger(state, 'event', -cost, SHOW[mode].label + ': prize pool and costs');
    const sh = { id: state.nextId++, seq: ++u.seq, mode, scope: a.scope === 'region' ? 'region' : 'global', name: SHOW[mode].label, start: a.start, prize, cost, entry, done: false };
    u.shows.push(sh);
    note(state, 'news', SHOW[mode].label + ' scheduled', 'On ' + a.start + ', prize pool ' + fmt(prize) + '. Entry: ' + entry.map((id) => player(state, id).name).join(', ') + '.');
    return { ok: true, show: sh };
  }
  // duel between two entrants (player or duo or crew member lists): returns the round score {a, b}. best of `n` rounds.
  function duelWin(r, ra, rb, n, state, idsA, idsB) { const pm = state ? simcal.gameWin(engine, state, idsA, idsB, mech) : null, p = pm != null ? pm : 1 / (1 + Math.pow(10, (rb - ra) / 9)), need = (n + 1) >> 1; let x = 0, y = 0; while (x < need && y < need) { if (r() < p) x++; else y++; } return { a: x, b: y }; }
  // A showdown runs as a bracket stored in sh.live. Every pairing the user's club is in is a real fixture (played in Rocket League or simulated, like a
  // scrim) when the user's own player is in the entry; all other pairings are simulated at once. The bracket advances whenever a fixture is decided (showDone).
  const showNeed = (mode) => (mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3);
  const entrant = (id, name, team, ps, score, mine) => ({ id, name, team, ids: ps.map((p) => p.id), score, mine: !!mine });
  function openShowdown(state, sh) {
    // the entry is the squad as it stands on the day (Squad tab picks for 2v2 / 1v1, the three best for a crew battle), not what it was when the event was booked
    const need = showNeed(sh.mode);
    const today = sh.mode === 'crew' ? crewEntry(state) : fmtLineup(state, sh.mode);
    if (today.length === need) sh.entry = today;
    const mine = sh.entry.map((id) => player(state, id));
    if (mine.some((p) => !p || p.teamId !== state.userTeamId)) { sh.done = true; sh.result = null; user(state).budget += sh.cost; note(state, 'news', sh.name + ' cancelled', 'An entrant left the club. Costs refunded.'); return false; }
    const ok = (p) => !p.retired && !p.absence && p.teamId >= 0;
    const byTeam = (t) => state.players.filter((p) => p.teamId === t.id && ok(p)).sort((a, b) => soloScore(b) - soloScore(a));
    const clubs = state.teams.filter((t) => t.id !== state.userTeamId && !t.nation && t.region && inScope(state, t, sh.scope)).map((t) => ({ t, ps: byTeam(t) })).filter((x) => x.ps.length >= 3);
    const me = state.userTeamId;
    let entrants;
    if (sh.mode === '1v1') {
      const top = clubs.map((x) => entrant('p' + x.ps[0].id, x.ps[0].name, x.t.id, [x.ps[0]], soloScore(x.ps[0]))).sort((a, b) => b.score - a.score).slice(0, 15);
      entrants = [entrant('p' + mine[0].id, mine[0].name, me, mine, soloScore(mine[0]), true), ...top];
    } else if (sh.mode === '2v2') {
      const duo = (ps) => ({ name: ps[0].name + ' & ' + ps[1].name, score: (soloScore(ps[0]) + soloScore(ps[1])) / 2 + 1 });
      const top = clubs.map((x) => entrant('t' + x.t.id, duo(x.ps).name, x.t.id, x.ps.slice(0, 2), duo(x.ps).score)).sort((a, b) => b.score - a.score).slice(0, 7);
      entrants = [entrant('t' + me, duo(mine).name, me, mine, duo(mine).score, true), ...top];
    } else {
      const crew = (ps) => sum(ps.slice(0, 3).map(soloScore)) / 3;
      const top = clubs.map((x) => entrant('t' + x.t.id, x.t.name, x.t.id, x.ps.slice(0, 3), crew(x.ps))).sort((a, b) => b.score - a.score).slice(0, 7);
      entrants = [entrant('t' + me, user(state).name, me, mine.slice(0, 3), crew(mine), true), ...top];
    }
    entrants.sort((a, b) => b.score - a.score);
    sh.live = { alive: entrants, rounds: [], placement: [], cur: null };
    return true;
  }
  function showFixture(state, sh, mineIds, oppIds, oppTeam, bo, f) {
    const fx = { id: state.nextId++, eventId: sh.id, showId: sh.id, stage: 'showdown', fmt: f, sq: { mine: mineIds.slice(), opp: oppIds.slice() }, round: 0, homeId: state.userTeamId, awayId: oppTeam, date: state.currentDate,
      played: false, overtime: false, userPlayed: false, bestOf: bo, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1 };
    state.fixtures.push(fx); return fx;
  }
  // the user's real series: null while it still has to be played, else its { home, away } series wins. A series left past its day is simulated.
  function seriesOf(state, rec, make) {
    let fx = rec.fxId != null ? engine.fixtureById(state, rec.fxId) : null;
    if (!fx) { fx = make(); rec.fxId = fx.id; return null; }
    if (!fx.played && fx.date < state.currentDate) engine.simulateFixture(state, fx);
    return fx.played ? { home: fx.homeWins, away: fx.awayWins } : null;
  }
  // false while the pairing waits for the user's match
  function resolvePair(state, sh, c, pi) {
    const L = sh.live, pr = c.pairs[pi], ent = (id) => L.alive.find((e) => e.id === id), A = ent(pr.a), B = ent(pr.b);
    const r = mkRand(hash('show:' + sh.id + ':' + c.idx + ':' + pi)), uid = state.userPlayerId;
    const me = A.mine ? A : B.mine ? B : null, opp = me === A ? B : A, mineIsA = me === A;
    const wins = (s) => (mineIsA ? [s.home, s.away] : [s.away, s.home]);
    if (sh.mode !== 'crew') {
      if (me) { // the user's club is in the pairing: a real fixture to play or watch (benched users watch), never a silent sim
        const s = seriesOf(state, pr, () => showFixture(state, sh, me.ids, opp.ids, opp.team, c.bo, sh.mode));
        if (!s) return false;
        [pr.sa, pr.sb] = wins(s);
      } else { const d = duelWin(r, A.score, B.score, c.bo, state, A.ids, B.ids); pr.sa = d.a; pr.sb = d.b; }
    } else {
      pr.duels = pr.duels || []; let sa = 0, sb = 0;
      for (let k = 0; k < 3; k++) {
        const d = pr.duels[k] || (pr.duels[k] = { a: player(state, A.ids[k]).name, b: player(state, B.ids[k]).name, sa: null, sb: null });
        if (d.sa == null) {
          if (me && (me.ids[k] === uid || !me.ids.includes(uid))) { // your own duel; a benched user gets all of their club's duels to watch
            const s = seriesOf(state, d, () => showFixture(state, sh, [me.ids.includes(uid) ? uid : me.ids[k]], [opp.ids[k]], opp.team, 3, '1v1'));
            if (!s) return false;
            [d.sa, d.sb] = wins(s);
          } else { const x = duelWin(r, soloScore(player(state, A.ids[k])), soloScore(player(state, B.ids[k])), 3, state, [A.ids[k]], [B.ids[k]]); d.sa = x.a; d.sb = x.b; }
        }
        if (d.sa > d.sb) sa++; else sb++;
      }
      pr.sa = sa; pr.sb = sb;
    }
    return true;
  }
  function stepShow(state, sh) {
    const L = sh.live; if (!L) return;
    for (let guard = 0; guard < 40; guard++) {
      if (!L.cur) {
        if (L.alive.length <= 1) return finishShow(state, sh);
        const n = L.alive.length;
        L.cur = { idx: L.rounds.length, bo: n === 2 ? 5 : 3, pairs: [] };
        for (let i = 0; i < n / 2; i++) L.cur.pairs.push({ a: L.alive[i].id, b: L.alive[n - 1 - i].id, sa: null, sb: null });
      }
      const c = L.cur; let waiting = false;
      c.pairs.forEach((pr, pi) => { if (pr.sa == null && !resolvePair(state, sh, c, pi)) waiting = true; });
      if (waiting) return;
      const ent = (id) => L.alive.find((e) => e.id === id), next = [], rd = [];
      for (const pr of c.pairs) {
        const A = ent(pr.a), B = ent(pr.b), wA = pr.sa > pr.sb;
        // a full match record: score, best-of, the clubs behind each side and, for crew battles, the three duels
        rd.push({ a: A.name, b: B.name, winner: wA ? A.name : B.name, sa: pr.sa, sb: pr.sb, bo: sh.mode === 'crew' ? 3 : c.bo, teamA: A.team, teamB: B.team, mine: !!(A.mine || B.mine), duels: pr.duels });
        next.push(wA ? A : B); L.placement.push(wA ? B : A);
      }
      L.rounds.push(rd); L.alive = next; L.cur = null;
    }
  }
  function finishShow(state, sh) {
    const L = sh.live, champ = L.alive[0], rounds = L.rounds, placement = L.placement.concat([champ]);
    const champPs = champ.ids.map((id) => player(state, id)).filter(Boolean), mine = sh.entry.map((id) => player(state, id)).filter(Boolean);
    const order = placement.reverse(), shares = order.map((_, i) => (i === 0 ? 0.45 : i === 1 ? 0.25 : i < 4 ? 0.1 : 0.025)), tot = sum(shares);
    const prizes = order.map((_, i) => Math.round(sh.prize * shares[i] / tot / 50) * 50);
    const host = user(state); let myPrize = 0, myPlace = null;
    order.forEach((e, i) => { const t = team(state, e.team); if (t) t.budget += prizes[i]; if (e.mine) { myPrize = prizes[i]; myPlace = i + 1; } });
    const gate = Math.round(sh.prize * 0.4 / 100) * 100; host.budget += gate; ledger(state, 'event', gate, sh.name + ': broadcast');
    for (const p of champPs) { p.followers = Math.round((p.followers || 0) * 1.04); moral(p, 6); }
    if (champ.mine) host.followers = Math.round((host.followers || 0) * 1.01);
    sh.done = true; sh.result = { champion: champ.name, rounds, order: order.map((e, i) => ({ name: e.name, prize: prizes[i], mine: !!e.mine })), myPlace, myPrize, gate };
    delete sh.live;
    const gifted = mine.filter((p) => mech(p) >= 6).map((p) => p.name);
    note(state, 'news', sh.name + ': ' + champ.name + ' win', 'Champion: ' + champ.name + '. Your entry finished ' + (myPlace ? '#' + myPlace + ' and took ' + fmt(myPrize) : 'out') + '. Broadcast income ' + fmt(gate) + '.' + (gifted.length ? '\nGifted solo player: ' + gifted.join(', ') + '.' : ''));
  }
  // called when one of the user's showdown fixtures has been decided (played or simulated)
  function showDone(state, fx) { const sh = ensure(state).shows.find((x) => x.id === fx.showId); if (!sh) return void sm.done(state, fx); if (!sh.done && sh.live) safe('showdown step', () => stepShow(state, sh)); }

  // ========================= showmatches (ux-showmatch.js) =========================
  const sm = require('./ux-showmatch').create(engine, {
    ensure, windowOk, fmtLineup, mech, soloScore, showFixture, tierOf, baseRegion, note, ledger, fmt, sponsors: SPONSORS,
    scrimOn: (state, d) => ((state.uxScrims && state.uxScrims.list) || []).find((x) => x.status === 'scheduled' && x.date === d) || null,
  }, log);

  // ========================= staff: scouts (ux-staff.js) =========================
  const staff = require('./ux-staff').create(engine, { note, fmt }, log);

  // ========================= chemistry =========================
  // days = how long this three-man lineup has been together. New lineups dip for ~3 weeks, long-standing ones build synergy.
  function chemOf(state, t) {
    const u = ensure(state), c = u.chem[t.id]; if (!c) return { days: 0, mod: 0, label: 'new' };
    const d = days(c.since, state.currentDate);
    const mod = d < CHEM_DIP_DAYS ? -3 * (1 - d / CHEM_DIP_DAYS) : d < 90 ? 0 : Math.min(2.5, ((d - 90) / (CHEM_FULL_DAYS - 90)) * 2.5);
    return { days: d, mod, noise: d < CHEM_DIP_DAYS ? 1.5 : d < 90 ? 0.8 : 0.3, label: d < CHEM_DIP_DAYS ? 'adjusting' : d < 90 ? 'settled' : d < 270 ? 'in sync' : 'cohesive' };
  }
  function trackChem(state) {
    const u = ensure(state);
    for (const t of state.teams) {
      if (t.nation || !t.region) continue;
      const key = core(state, t).slice().sort((a, b) => a - b).join(',');
      const c = u.chem[t.id];
      if (!c) { u.chem[t.id] = { key, since: addDays(state.currentDate, -(60 + (hash('chem:' + t.id) % 330))) }; continue; } // established at the start
      if (c.key !== key) {
        const same = key.split(',').filter((x) => c.key.split(',').includes(x)).length, kept = days(c.since, state.currentDate) * (same / 3) * 0.5;
        u.chem[t.id] = { key, since: addDays(state.currentDate, -Math.round(same >= 3 ? days(c.since, state.currentDate) : kept)) };
      }
    }
  }
  // temporary rating deltas for one engine call; revert() removes exactly what was added
  const lateEdge = (state, base) => { try { return engine.uxLate && engine.uxLate.effects ? engine.uxLate.effects.matchEdge(state, base) : 0; } catch (e) { return 0; } };
  function applyChem(state) {
    const u = ensure(state), applied = [];
    for (const t of state.teams) {
      if (t.nation || !t.region || !u.chem[t.id]) continue;
      const c = chemOf(state, t), r = mkRand(hash('chemn:' + t.id + ':' + state.currentDate));
      const base = c.mod + (r() * 2 - 1) * c.noise;
      const d = Math.round((base + (t.id === state.userTeamId ? lateEdge(state, base) : 0)) * 10) / 10; if (!d) continue; // late game: Analytics Lab, capped together with chemistry
      for (const id of core(state, t)) { const p = player(state, id); if (p) { p.rating += d; if (p.ratingExact != null) p.ratingExact += d; applied.push([p, d, p.rating]); } }
    }
    const fix = (v, d) => Math.round((v - d) * 1e6) / 1e6; // no float dust: ratings are whole numbers again
    // The game derives rating = floor(ratingExact) during its day processing, so a rating it recomputed is rebuilt from ratingExact, not "minus d".
    return () => {
      for (const [p, d, r1] of applied) {
        if (p.ratingExact != null) p.ratingExact = fix(p.ratingExact, d);
        if (p.rating === r1 || p.ratingExact == null) p.rating = fix(p.rating, d); else p.rating = Math.floor(p.ratingExact + 1e-9);
      }
    };
  }

  // ========================= daily tick =========================
  function tick(state) {
    if (!state || !state.teams || !state.fixtures) return;
    const u = ensure(state);
    safe('chemistry', () => trackChem(state));
    staff.tick(state);
    safe('invitationals', () => { for (const inv of u.inv) stepInvitational(state, inv); });
    safe('showdowns', () => { for (const sh of u.shows) { if (sh.done) continue; if (sh.live || (sh.start <= state.currentDate && openShowdown(state, sh))) stepShow(state, sh); } sm.tick(state); const keep = addDays(state.currentDate, -2); state.fixtures = state.fixtures.filter((f) => f.showId == null || !f.played || f.date >= keep); }); // played showdown / showmatch fixtures leave the game's list after 2 days (the result screen reads them)
  }

  // ========================= action channel =========================
  function rpc(state, json) {
    let a; try { a = JSON.parse(json); } catch (e) { return { ok: false, error: 'Bad request.' }; }
    ensure(state);
    switch (a.a) {
      case 'host': return hostInvitational(state, a);
      case 'preview': return previewInvitational(state, a); // read-only
      case 'cancelInv': { const inv = ensure(state).inv.find((x) => x.id === a.id); if (!inv || inv.stage !== 'scheduled' || days(state.currentDate, inv.start) < 14) return { ok: false, error: 'Too late to cancel.' }; inv.stage = 'cancelled'; user(state).budget += Math.round(inv.prize * 0.7 + inv.ops * 0.5) - inv.sponsorIncome; ledger(state, 'event', Math.round(inv.prize * 0.7 + inv.ops * 0.5) - inv.sponsorIncome, 'Invitational cancelled (partial refund, sponsors repaid)'); return { ok: true }; }
      case 'show': return scheduleShowdown(state, a);
      case 'smplan': case 'smatch': case 'smcancel': case 'smaccept': case 'smdecline': return sm.rpc(state, a);
      case 'inboxonly': engine.__uxReadOnly = { id: Number(a.id), until: Date.now() + 3000 }; return { ok: true }; // the game's next 'mark inbox read' (within 3 s) only touches this message
      case 'staffinfo': case 'staffhire': case 'stafffire': return staff.rpc(state, a);
      case 'lineup': return setLineup(state, a);
      case 'watch': { // shortlist of players the user is thinking about buying; saved with the career
        const u = ensure(state), p = player(state, Number(a.playerId)); if (!p) return { ok: false, error: 'No such player.' };
        u.watch = (u.watch || []).filter((x) => x !== p.id);
        if (a.on !== false) u.watch.push(p.id);
        return { ok: true };
      }
      case 'windows': return { ok: false, windows: windows(state, Number(a.len) || 3, Math.min(400, Number(a.count) || 8), a.margin == null ? undefined : Number(a.margin), !!a.all), busy: busy(state).iv, mine: a.all ? [...busy(state).mine] : undefined }; // read-only
      default: return { ok: false, error: 'Unknown action.' };
    }
  }

  return { smatch: sm, staff, MARGIN_HOST, MARGIN_SMALL, windowOk, scrimClash, planInvitational, hostInvitational, tick, rpc, showDone, chainInv, invOf: (state, id) => ensure(state).inv.find((x) => x.id === id), windows, busy, canHost, fmtLineup, chemOf, applyChem, mech, soloScore, ensure, trackChem };
}

// Installs the hooks. Must run BEFORE the Tier B wrapper captures engine.advance, so the chemistry modifiers sit directly around the
// game's own advance() and every day of a stepped advance gets its own modifier.
function install(engine, ev, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.__uxClub || !ev || typeof engine.advance !== 'function') return null;
  engine.__uxClub = true;
  const club = create(engine, ev, opts);
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-club: ' + what + ' failed: ' + e.stack); return undefined; } };
  const advance = engine.advance;
  engine.advance = function advanceWithClub(state) {
    const revert = state && state.teams ? safe('chemistry apply', () => club.applyChem(state)) : null;
    let r;
    try { r = advance.apply(this, arguments); } finally { if (revert) safe('chemistry revert', revert); }
    if (state) safe('tick', () => club.tick(state));
    return r;
  };
  const sim = engine.simulateFixture;
  if (typeof sim === 'function') {
    engine.simulateFixture = function simulateFixtureWithClub(state) {
      const revert = state && state.teams ? safe('chemistry apply', () => club.applyChem(state)) : null;
      try { return sim.apply(this, arguments); } finally { if (revert) safe('chemistry revert', revert); }
    };
  }
  const simNext = engine.simulateNextGame; // beta.33 game-by-game series sim: same chemistry boost as simulateFixture
  if (typeof simNext === 'function') {
    engine.simulateNextGame = function simulateNextGameWithClub(state) {
      const revert = state && state.teams ? safe('chemistry apply', () => club.applyChem(state)) : null;
      try { return simNext.apply(this, arguments); } finally { if (revert) safe('chemistry revert', revert); }
    };
  }
  const nextSeries = engine.nextUserSeries;
  if (typeof nextSeries === 'function') {
    engine.nextUserSeries = function nextUserSeriesWithClub(state, rand, fixtureId) {
      const fx = state && state.fixtures ? engine.fixtureById(state, fixtureId) : null;
      const inv = fx && fx.invId != null ? club.invOf(state, fx.invId) : null;
      if (!inv) return nextSeries.apply(this, arguments);
      const r = safe('invitational chain', () => club.chainInv(state, rand, fx, inv));
      return r === undefined ? null : r;
    };
  }
  const needs = engine.messageNeedsYou; // the game marks every message that does not "need you" as read: while a message is being opened, all others count as needing you
  if (typeof needs === 'function') engine.messageNeedsYou = function messageNeedsYouWithClub(s, m) {
    const o = engine.__uxReadOnly;
    if (o && Date.now() < o.until && m && m.id !== o.id) return true;
    return needs.apply(this, arguments);
  };
  const placeBet = engine.placeBet;
  engine.placeBet = function placeBetOrClub(state, kind) {
    if (typeof kind === 'string' && kind.indexOf('uxc:') === 0) return safe('rpc', () => club.rpc(state, kind.slice(4))) || { ok: false, error: 'That could not be done.' };
    return placeBet.apply(this, arguments);
  };
  const gen = engine.generateLeague;
  engine.generateLeague = function generateLeagueWithClub() { const st = gen.apply(this, arguments); safe('init', () => { club.ensure(st); club.trackChem(st); }); return st; };
  engine.uxClub = club;
  log('ux-club installed');
  return club;
}

module.exports = { create, install, mech, soloScore };
