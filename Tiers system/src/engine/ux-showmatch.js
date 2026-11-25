'use strict';
// Showmatches (Tier A clubs): exhibition matches the user's club hosts for a small prize pool, sponsors and followers. No bracket, no playoffs:
// one event = 1 to 4 independent matches, each best of 1, 3 (default), 5 or 7 (3v3 clubs, 2v2 duos or 1v1 players), all played on one calendar day.
// A match the user's club is in is a real fixture when the user's own player is in the entry (same rule as showdowns), every other match is simulated.
// State: state.uxClub.smatch (created on demand, old saves load unchanged). Wired in by ux-club.js (tick, rpc, showDone, calendar busy days).
const { hash } = require('./ux-persona');
const simcal = require('./ux-simcal');

const MODES = { '3v3': 3, '2v2': 2, '1v1': 1 };
const PRIZE_MIN = 5000, PRIZE_MAX = 20000, RUN_COST = 3000, MAX_MATCHES = 4, MAX_OPEN = 3, BOS = [1, 3, 5, 7], BO = 3; // BOS: series lengths a match can be, BO: the default
const SPONSOR_SHARES = [['Title sponsor', 0.35], ['Presenting partner', 0.2], ['Official partner', 0.1]];
const INVITE_DAYS = 26, INVITE_MIN = 1000, INVITE_MAX = 5000, PART = 0.4, BONUS = 1000, UPSET_P = 0.42; // an invitation about every 26 days; an upset = winning with under 42% per game
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mkRand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// h = helpers from ux-club.js: ensure, windowOk, scrimOn, fmtLineup, mech, soloScore, showFixture, tierOf, baseRegion, note, ledger, fmt, sponsors
function create(engine, h, log = () => {}) {
  const team = (s, id) => engine.teamById(s, id);
  const player = (s, id) => engine.playerById(s, id);
  const user = (s) => team(s, s.userTeamId);
  const list = (s) => { const u = h.ensure(s); return u.smatch || (u.smatch = []); };
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-showmatch: ' + what + ' failed: ' + e.stack); return undefined; } };
  const fitIn = (s, t) => (t.playerIds || []).map((id) => player(s, id)).filter((p) => p && !p.retired && !p.absence && p.teamId === t.id);
  // a club or player the user may invite: Tier A, the user's own region, not the user's club
  const clubOk = (s, t) => !!t && t.id !== s.userTeamId && !t.nation && !!t.region && h.tierOf(t) === 'A' && h.baseRegion(t) === h.baseRegion(user(s));
  const side = (x) => (x && x.me ? { me: true } : x && x.p != null ? { p: Number(x.p) } : x && x.t != null ? { t: Number(x.t) } : null);

  // entrant of one side on the day: { name, team, ids, score, mine }
  function entrant(s, mode, sd) {
    const n = MODES[mode], sc = (ids) => (ids.length ? ids.reduce((a, id) => a + h.soloScore(player(s, id)), 0) / ids.length : 0);
    let ids, name, tid;
    if (sd.me) { ids = n === 3 ? engine.userLineup(s).slice(0, 3) : h.fmtLineup(s, mode); tid = s.userTeamId; }
    else if (sd.p != null) { const p = player(s, sd.p); ids = p && !p.retired && p.teamId >= 0 ? [p.id] : []; tid = p ? p.teamId : -1; }
    else { const t = team(s, sd.t); tid = sd.t; ids = !t ? [] : n === 3 ? engine.autoLineup(s, t).slice(0, 3) : fitIn(s, t).sort((a, b) => h.soloScore(b) - h.soloScore(a) || a.id - b.id).slice(0, n).map((p) => p.id); }
    ids = ids.filter((id) => player(s, id));
    if (n === 1) name = ids.length ? player(s, ids[0]).name : '?';
    else if (n === 2) name = ids.map((id) => player(s, id).name).join(' & ') || '?';
    else name = (team(s, tid) || {}).name || '?';
    return { name, team: tid, ids, need: n, score: sc(ids), mine: !!sd.me };
  }

  // everything decided before money moves: validated pairs, costs, sponsor offers. Used by the preview and by schedule.
  function plan(s, a) {
    const host = user(s), mode = MODES[a.mode] ? a.mode : null;
    if (!host || h.tierOf(host) !== 'A') return { ok: false, error: 'Only Tier A clubs can host showmatches.' };
    if (!mode) return { ok: false, error: 'Pick 3v3, 2v2 or 1v1.' };
    const prize = Math.round(Number(a.prize) || 0);
    if (prize < PRIZE_MIN || prize > PRIZE_MAX) return { ok: false, error: 'The prize pool of a match must be between ' + h.fmt(PRIZE_MIN) + ' and ' + h.fmt(PRIZE_MAX) + '.' };
    const raw = Array.isArray(a.pairs) ? a.pairs : [];
    if (!raw.length || raw.length > MAX_MATCHES) return { ok: false, error: 'A showmatch event has 1 to ' + MAX_MATCHES + ' matches.' };
    const used = new Set(), pairs = [];
    let meSeen = false;
    for (const pr of raw) {
      const two = [side(pr && pr.a), side(pr && pr.b)];
      if (!two[0] || !two[1]) return { ok: false, error: 'Every match needs two sides.' };
      for (const sd of two) {
        let key;
        if (sd.me) { if (meSeen) return { ok: false, error: 'Your club can only play one match.' }; meSeen = true; key = 'me'; if (h.fmtLineup(s, mode).length < MODES[mode] && mode !== '3v3') return { ok: false, error: 'You do not have enough fit players for a ' + mode + '.' }; }
        else if (mode === '1v1') {
          const p = sd.p != null ? player(s, sd.p) : null;
          if (!p || p.retired || p.absence || !clubOk(s, team(s, p.teamId))) return { ok: false, error: 'Pick 1v1 players from Tier A clubs of your region.' };
          key = 'p' + p.id;
        } else {
          const t = sd.t != null ? team(s, sd.t) : null;
          if (!clubOk(s, t) || fitIn(s, t).length < MODES[mode]) return { ok: false, error: 'Pick clubs from your tier and region with enough fit players.' };
          key = 't' + t.id;
        }
        if (used.has(key)) return { ok: false, error: 'Nobody can play twice in one event.' };
        used.add(key);
      }
      const bo = pr.bo == null ? BO : Number(pr.bo);
      if (!BOS.includes(bo)) return { ok: false, error: 'A match is a best of ' + BOS.join(', ') + '.' };
      pairs.push({ a: two[0], b: two[1], bo });
    }
    const n = pairs.length, total = prize * n, cost = n * (prize + RUN_COST);
    const fol = (sd) => (sd.me ? host.followers : sd.p != null ? ((player(s, sd.p) || {}).followers || (team(s, (player(s, sd.p) || {}).teamId) || {}).followers) : (team(s, sd.t) || {}).followers) || 0;
    const sides = pairs.flatMap((p) => [p.a, p.b]), mult = clamp(0.6 + sides.reduce((x, sd) => x + fol(sd), 0) / sides.length / 300000, 0.6, 1.8);
    const offers = SPONSOR_SHARES.map(([role, share], i) => ({ role, name: h.sponsors[(hash('sm:' + s.season + ':' + s.currentDate + ':' + i) + i * 3) % h.sponsors.length], fee: Math.round(total * share * mult / 500) * 500 }));
    const gate = Math.round(total * 0.2 * mult / 100) * 100, growth = Math.max(100, Math.round((host.followers || 0) * 0.003 * n * mult / 10) * 10);
    return { ok: true, mode, n, prize, total, cost, mult, offers, gate, growth, pairs };
  }
  const preview = (s, a) => { const p = plan(s, a); return p.ok ? { ok: false, preview: { n: p.n, prize: p.prize, total: p.total, cost: p.cost, offers: p.offers, gate: p.gate, growth: p.growth } } : p; };

  function schedule(s, a) {
    const host = user(s), pl = plan(s, a);
    if (!pl.ok) return pl;
    if (list(s).filter((x) => !x.done).length >= MAX_OPEN) return { ok: false, error: 'You can have at most ' + MAX_OPEN + ' showmatch events scheduled.' };
    if (!h.windowOk(s, a.start, 1, 0) || h.scrimOn(s, a.start)) return { ok: false, error: 'That date is not free: another event or one of your matches or scrims is on that day (the day before or after is fine).' };
    if (host.budget < pl.cost) return { ok: false, error: 'You can not fund that: ' + h.fmt(pl.cost) + '.' };
    const signed = (Array.isArray(a.sponsors) ? a.sponsors : []).map(Number).filter((i, k, arr) => i >= 0 && i < pl.offers.length && arr.indexOf(i) === k);
    const sponsorIncome = signed.reduce((x, i) => x + pl.offers[i].fee, 0);
    host.budget -= pl.cost; h.ledger(s, 'event', -pl.cost, 'Showmatches: prize pools and costs');
    if (sponsorIncome) { host.budget += sponsorIncome; h.ledger(s, 'event', sponsorIncome, 'Showmatches: sponsors'); }
    const u = h.ensure(s), name = pl.n === 1 ? pl.mode + ' Showmatch' : pl.n + ' ' + pl.mode + ' Showmatches';
    const sm = { id: s.nextId++, seq: ++u.seq, kind: 'smatch', mode: pl.mode, name, start: a.start, prize: pl.prize, n: pl.n, pairs: pl.pairs, cost: pl.cost, gate: pl.gate, growth: pl.growth, mult: pl.mult, offers: pl.offers, sponsors: signed.map((i) => pl.offers[i]), sponsorIncome, done: false };
    list(s).push(sm);
    h.note(s, 'news', name + ' scheduled', 'On ' + a.start + ', prize pool ' + h.fmt(pl.prize) + ' per match. ' + (signed.length ? 'Sponsors signed: ' + sm.sponsors.map((x) => x.name).join(', ') + ' (' + h.fmt(sponsorIncome) + ').' : 'No sponsors signed.'));
    return { ok: true, smatch: sm };
  }
  function cancel(s, id) {
    const sm = list(s).find((x) => x.id === Number(id));
    if (sm && sm.invite) return { ok: false, error: 'An accepted invitation can not be cancelled.' };
    if (!sm || sm.done || sm.live || (Date.parse(sm.start + 'T12:00:00Z') - Date.parse(s.currentDate + 'T12:00:00Z')) / 864e5 < 3) return { ok: false, error: 'Too late to cancel.' };
    const back = Math.round(sm.cost * 0.7) - sm.sponsorIncome;
    user(s).budget += back; h.ledger(s, 'event', back, sm.name + ' cancelled (partial refund, sponsors repaid)'); sm.done = true; sm.cancelled = true;
    return { ok: true };
  }

  // ---------- invitations: any club (Tier A and B) is asked to play a showmatch now and then, through the inbox ----------
  // One match against another club of the region, a prize for a win of $1K-$5K by followers, +$1K for a clean sweep and +$1K for an upset, followers either way.
  const invList = (s) => { const u = h.ensure(s); return u.smInv || (u.smInv = []); };
  const feeFor = (followers) => clamp(Math.round((1000 + 4000 * clamp(Math.log10(Math.max(followers || 0, 5000) / 5000) / Math.log10(200), 0, 1)) / 500) * 500, INVITE_MIN, INVITE_MAX);
  const partOf = (fee) => Math.round(fee * PART / 100) * 100;
  const growthFor = (followers) => clamp(Math.round((followers || 0) * 0.01 / 10) * 10, 200, 5000);
  const closeMail = (s, v) => { const m = (s.inbox || []).find((x) => x.data && x.data.inviteId === v.id); if (m) { m.resolved = true; m.unread = false; } };
  const gameP = (s, mode, A, B) => { const pm = simcal.gameWin(engine, s, A.ids, B.ids, mode === '3v3' ? null : h.mech); return pm != null ? pm : 1 / (1 + Math.pow(10, (B.score - A.score) / 9)); };

  function inviteTick(s) {
    const me = user(s); if (!me || (typeof engine.isPlayerCareer === 'function' && engine.isPlayerCareer(s))) return;
    const L = invList(s), today = s.currentDate;
    for (const v of L) if (v.status === 'open' && v.expires <= today) { v.status = 'expired'; closeMail(s, v); h.note(s, 'news', 'The showmatch invitation lapsed', v.oppName + ' found someone else for ' + v.start + '.'); }
    if (L.some((v) => v.status === 'open') || list(s).some((x) => !x.done && x.invite) || hash('smi:' + s.season + ':' + today) % INVITE_DAYS !== 0) return;
    const modes = ['1v1', '2v2', '3v3'].filter((m) => entrant(s, m, { me: true }).ids.length >= MODES[m]);
    if (!modes.length) return;
    const mode = modes[hash('smim:' + today) % modes.length], n = MODES[mode], base = h.baseRegion(me);
    const cands = s.teams.filter((t) => t.id !== me.id && !t.nation && t.region && h.baseRegion(t) === base && fitIn(s, t).length >= n).sort((a, b) => a.id - b.id);
    let start = null; for (let k = 8; k < 18 && !start; k++) { const d = addDays(today, k); if (h.windowOk(s, d, 1, 0) && !h.scrimOn(s, d)) start = d; }
    if (!cands.length || !start) return;
    const t = cands[hash('smio:' + today) % cands.length];
    const opp = n === 1 ? { p: fitIn(s, t).sort((a, b) => h.soloScore(b) - h.soloScore(a) || a.id - b.id)[0].id } : { t: t.id }, oppName = entrant(s, mode, opp).name;
    const v = { id: s.nextId++, sent: today, start, expires: addDays(start, -2), mode, opp, oppName, fee: feeFor(me.followers), part: partOf(feeFor(me.followers)), growth: growthFor(me.followers), status: 'open' };
    L.push(v);
    h.note(s, 'smatch_invite', oppName + ' invite you to a ' + mode + ' showmatch',
      oppName + ' would like to play a ' + mode + ' exhibition against you on ' + start + ' (best of 3).\nTaking part pays ' + h.fmt(v.part) + '; winning, a clean sweep and an upset pay extra. Your club gains followers either way.\nAnswer by ' + v.expires + '.', { inviteId: v.id });
  }
  function accept(s, id) {
    const v = invList(s).find((x) => x.id === Number(id));
    if (!v || v.status !== 'open') return { ok: false, error: 'That invitation is no longer open.' };
    if (v.expires <= s.currentDate || !h.windowOk(s, v.start, 1, 0) || h.scrimOn(s, v.start)) { v.status = 'expired'; closeMail(s, v); return { ok: false, error: 'That day is no longer free, the invitation lapsed.' }; }
    if (entrant(s, v.mode, { me: true }).ids.length < MODES[v.mode]) return { ok: false, error: 'You do not have enough fit players for a ' + v.mode + '.' };
    const u = h.ensure(s), sm = { id: s.nextId++, seq: ++u.seq, kind: 'smatch', invite: true, mode: v.mode, name: v.mode + ' Showmatch vs ' + v.oppName, start: v.start, prize: v.fee, part: v.part, n: 1, pairs: [{ a: { me: true }, b: v.opp, bo: BO }],
      cost: 0, gate: 0, growth: v.growth, mult: 1, offers: [], sponsors: [], sponsorIncome: 0, done: false };
    list(s).push(sm); v.status = 'accepted'; v.smId = sm.id; closeMail(s, v);
    h.note(s, 'news', 'Showmatch accepted', 'You play ' + v.oppName + ' on ' + v.start + ' (' + v.mode + ', best of 3). Taking part pays ' + h.fmt(v.part) + '; a win pays more.');
    return { ok: true, smatch: sm };
  }
  function decline(s, id) {
    const v = invList(s).find((x) => x.id === Number(id));
    if (!v || v.status !== 'open') return { ok: false, error: 'That invitation is no longer open.' };
    v.status = 'declined'; closeMail(s, v); return { ok: true };
  }

  // ---------- the day ----------
  // false while the match waits for the user's series
  function seriesOf(s, rec, make) {
    let fx = rec.fxId != null ? engine.fixtureById(s, rec.fxId) : null;
    if (!fx) { fx = make(); rec.fxId = fx.id; return null; }
    if (!fx.played && fx.date < s.currentDate) engine.simulateFixture(s, fx);
    return fx.played ? { home: fx.homeWins, away: fx.awayWins } : null;
  }
  function resolve(s, sm, pr, i) {
    const A = pr.A, B = pr.B;
    if (A.ids.length < A.need || B.ids.length < B.need) { const aOut = A.ids.length < A.need; pr.sa = aOut ? 0 : 2; pr.sb = aOut ? 2 : 0; pr.forfeit = true; return true; }
    const me = A.mine ? A : B.mine ? B : null, opp = me === A ? B : A;
    if (me) { // the user's club is in it: a real fixture to play or watch (a benched user watches the squad, like any league match), never a silent sim
      const r = seriesOf(s, pr, () => Object.assign(h.showFixture(s, sm, me.ids, opp.ids, opp.team, pr.bo, sm.mode), { smatch: true })); // smatch: the UI names it a showmatch
      if (!r) return false;
      pr.sa = me === A ? r.home : r.away; pr.sb = me === A ? r.away : r.home; return true;
    }
    const rnd = mkRand(hash('smatch:' + sm.id + ':' + i)), p = gameP(s, sm.mode, A, B), need = (pr.bo + 1) >> 1;
    let x = 0, y = 0; while (x < need && y < need) { if (rnd() < p) x++; else y++; }
    pr.sa = x; pr.sb = y; return true;
  }
  function open(s, sm) {
    const me = sm.pairs.find((p) => p.a.me || p.b.me);
    if (me && entrant(s, sm.mode, me.a.me ? me.a : me.b).ids.length < MODES[sm.mode]) { // nobody fit to play: everything is paid back
      sm.done = true; sm.result = null; user(s).budget += sm.cost - sm.sponsorIncome; h.note(s, 'news', sm.name + ' cancelled', 'Not enough fit players for your side. Costs refunded and sponsors repaid.'); return false;
    }
    sm.live = { pairs: sm.pairs.map((p) => ({ A: entrant(s, sm.mode, p.a), B: entrant(s, sm.mode, p.b), sa: null, sb: null, bo: p.bo || BO })) };
    if (sm.invite) sm.live.pairs.forEach((pr) => { pr.pm = gameP(s, sm.mode, pr.A, pr.B); }); // chance of side A per game before the match: an upset is judged on it
    const card = sm.live.pairs.map((p) => p.A.name + ' vs ' + p.B.name).join('\n');
    h.note(s, 'news', sm.name + ' today', card);
    if (typeof engine.pushNews === 'function') safe('news', () => engine.pushNews(s, () => 0.5, { category: 'club', headline: sm.name + ' tonight: ' + sm.live.pairs[0].A.name + ' vs ' + sm.live.pairs[0].B.name + (sm.n > 1 ? ' and ' + (sm.n - 1) + ' more' : ''), body: card.replace(/\n/g, ' · ') }));
    return true;
  }
  function step(s, sm) {
    const L = sm.live; if (!L) return;
    let waiting = false;
    L.pairs.forEach((pr, i) => { if (pr.sa == null && !resolve(s, sm, pr, i)) waiting = true; });
    if (!waiting) finish(s, sm);
  }
  function finish(s, sm) {
    const host = user(s), moral = (p, d) => { p.morale = clamp(Math.round(((p.morale == null ? 70 : p.morale) + d) * 10) / 10, 0, 100); };
    let myPrize = 0, myWins = 0, played = 0;
    const matches = sm.live.pairs.map((pr) => {
      const wA = pr.sa > pr.sb, W = wA ? pr.A : pr.B, t = team(s, W.team);
      const mine = pr.A.mine || pr.B.mine; let bonuses = [];
      if (t && !(sm.invite && !W.mine)) t.budget += sm.prize; // a player's prize goes to his club (the user's club included); an invitation only ever pays the user's win
      if (mine) { played++; if (W.mine) { myPrize += sm.prize; myWins++; } }
      if (sm.invite && mine && !W.mine) { host.budget += sm.part; myPrize += sm.part; h.ledger(s, 'event', sm.part, sm.name + ': appearance fee'); } // taking part pays, winning pays more
      if (sm.invite && W.mine && !pr.forfeit) {
        const my = pr.A.mine ? pr.pm : 1 - pr.pm, lost = pr.A.mine ? pr.sb : pr.sa;
        if (lost === 0) bonuses.push({ label: 'Clean sweep', amount: BONUS });
        if (my < UPSET_P) bonuses.push({ label: 'Upset', amount: BONUS });
        const extra = bonuses.reduce((x, b) => x + b.amount, 0); if (t) t.budget += extra; myPrize += extra;
        h.ledger(s, 'event', sm.prize + extra, sm.name + ': prize' + (bonuses.length ? ' and bonus (' + bonuses.map((b) => b.label.toLowerCase()).join(', ') + ')' : ''));
      }
      for (const id of W.ids) { const p = player(s, id); if (p) { p.followers = Math.round((p.followers || 0) * 1.02); moral(p, 3); } }
      return { a: pr.A.name, b: pr.B.name, winner: W.name, sa: pr.sa, sb: pr.sb, bo: pr.bo, teamA: pr.A.team, teamB: pr.B.team, mine: !!mine, prize: sm.prize, forfeit: !!pr.forfeit, bonuses };
    });
    if (sm.gate) { host.budget += sm.gate; h.ledger(s, 'event', sm.gate, sm.name + ': broadcast'); }
    const gained = sm.invite && !myWins ? Math.round(sm.growth / 3) : sm.growth; // an invitation: a loss still brings a third
    host.followers = (host.followers || 0) + gained;
    sm.done = true; sm.result = { matches, myPrize, myWins, played, gate: sm.gate, growth: gained, sponsorIncome: sm.sponsorIncome, profit: sm.gate + sm.sponsorIncome - sm.cost + myPrize }; delete sm.live;
    h.note(s, 'news', sm.name + ': results', matches.map((m) => m.winner + ' beat ' + (m.winner === m.a ? m.b : m.a) + ' ' + Math.max(m.sa, m.sb) + '–' + Math.min(m.sa, m.sb)).join('\n') + (sm.invite ? '\n' + (myWins ? 'Prize and bonuses ' + h.fmt(myPrize) + '. ' : 'Appearance fee ' + h.fmt(sm.part) + '. ') : '\nBroadcast ' + h.fmt(sm.gate) + ', net ' + h.fmt(sm.result.profit) + '. ') + 'Followers +' + gained.toLocaleString('en') + '.');
    if (typeof engine.pushNews === 'function') for (const m of matches) safe('news', () => engine.pushNews(s, () => 0.5, { category: 'club', headline: m.winner + ' beat ' + (m.winner === m.a ? m.b : m.a) + ' ' + Math.max(m.sa, m.sb) + '–' + Math.min(m.sa, m.sb) + ' in a showmatch', body: sm.name + ' hosted by ' + host.name + '.' }));
  }
  function tick(s) {
    safe('invitations', () => inviteTick(s));
    for (const sm of list(s)) {
      if (sm.done) continue;
      if (sm.live || (sm.start <= s.currentDate && open(s, sm))) safe('step', () => step(s, sm));
    }
  }
  // one of the user's showmatch fixtures was decided (played or simulated): true when it belonged to a showmatch
  function done(s, fx) {
    const sm = list(s).find((x) => x.id === fx.showId); if (!sm) return false;
    if (!sm.done && sm.live) safe('step', () => step(s, sm));
    return true;
  }
  function rpc(s, a) {
    switch (a.a) {
      case 'smplan': return preview(s, a); // read-only
      case 'smatch': return schedule(s, a);
      case 'smcancel': return cancel(s, a.id);
      case 'smaccept': return accept(s, a.id);
      case 'smdecline': return decline(s, a.id);
      default: return null;
    }
  }
  return { tick, done, rpc, list, plan, inviteTick, MODES, PRIZE_MIN, PRIZE_MAX, MAX_MATCHES };
}

module.exports = { create, MODES, PRIZE_MIN, PRIZE_MAX, MAX_MATCHES };
