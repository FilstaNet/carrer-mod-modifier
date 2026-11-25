'use strict';
// Kick-Off Weekend (5 days, a week before Open 1: the 8 best Tier A clubs of last season) and the Esports World Cup (6 days between Major 2
// and the LCQ: the top 16 Tier A clubs of this season's ranking). Both: GSL groups (Bo5), single-elimination playoffs (Bo7), prize money and
// a title, NO ranking points. They live in state.uxMajors (not in state.events), so the game's split points, Major / Worlds qualification,
// promotion playoffs and the national World Cup are untouched. Matches are ordinary fixtures (xevId), played or simulated like any other.
const cups = require('./btier-cups');
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const KINDS = {
  kickoff: { name: 'Kick-Off Weekend', size: 8, short: 'KO', prizeKind: 'major', prizeScale: 0.5, pool: 142000 }, // pool: the real-economy prize pool (other economies scale the same way)
  ewc: { name: 'Esports World Cup', size: 16, short: 'EWC', prizeKind: 'worlds', prizeScale: 0.8 }
};

// Prize per place (1..size) of Kick-Off Weekend / the EWC: the game's own table for their kind, scaled; a fixed `pool` is scaled from the real-economy table.
function prizeTable(ev, kind, real) {
  const k = KINDS[kind], at = (p, r) => ev.prizeFor(k.prizeKind, p, { real: r });
  let scale = k.prizeScale;
  if (k.pool) scale = k.pool / Array.from({ length: k.size }, (_, i) => at(i + 1, true)).reduce((a, b) => a + b, 0);
  const t = Array.from({ length: k.size }, (_, i) => Math.max(500, Math.round(at(i + 1, !!real) * scale / 500) * 500));
  if (k.pool && real) t[0] += k.pool - t.reduce((a, b) => a + b, 0); // rounding goes to the winner: the pool is exact
  return t;
}

function install(engine, ev, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.uxMajors || !ev) return null;
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-majors: ' + what + ' failed: ' + e.stack); return undefined; } };
  const ens = (s) => s.uxMajors || (s.uxMajors = { v: 1, events: [], planned: {}, lastRanking: null });
  const team = (s, id) => engine.teamById(s, id);
  const tierA = (s) => s.teams.filter((t) => t.tier !== 'B' && !t.nation && t.region && !/_b$/.test(t.region));
  const strength = (s, t) => { try { return engine.teamStrength(s, engine.autoLineup(s, t)); } catch (e) { return t.strength || 0; } };
  const strengthOrder = (s) => tierA(s).map((t) => ({ id: t.id, v: strength(s, t) })).sort((a, b) => b.v - a.v || a.id - b.id).map((x) => x.id);
  const rankingOrder = (s) => tierA(s).map((t) => ({ id: t.id, p: (s.ranking || {})[t.id] || 0, v: strength(s, t) })).sort((a, b) => b.p - a.p || b.v - a.v || a.id - b.id).map((x) => x.id);

  // ---------- planning: dates from the game's own events of this season ----------
  function plan(s) {
    const u = ens(s); if (u.planned[s.season]) return; u.planned[s.season] = true;
    const evs = (s.events || []).slice().sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    const open1 = evs.find((e) => e.kind === 'open'), majors = evs.filter((e) => e.kind === 'major'), after = evs.find((e) => e.kind === 'lcq') || evs.find((e) => e.kind === 'worlds');
    const add = (kind, start, len) => {
      if (start < addDays(s.currentDate, 2)) return; // too late to draw (a career that starts mid-way)
      const k = KINDS[kind];
      u.events.push({ id: s.nextId++, kind, uxKind: kind, uxEv: true, name: k.name, season: s.season, startDate: start, endDate: addDays(start, len - 1), stage: 'pending', field: [], groups: [], slots: [], standings: [], championId: null });
    };
    // two weeks before Open 1 (the Swiss stage takes the 2 days before it); a career that starts later gets it as early as it can, if it still fits
    if (open1) { const want = addDays(open1.startDate, -15), soonest = addDays(s.currentDate, 2); const st = want < soonest ? soonest : want; if (addDays(st, 4) < addDays(open1.startDate, -3)) add('kickoff', st, 5); }
    if (majors.length && after) {
      const m2 = majors[majors.length - 1], gap = daysBetween(m2.endDate, after.startDate);
      if (gap >= 14) add('ewc', addDays(m2.endDate, Math.floor(gap / 2) - 3), 6);
    }
  }

  // ---------- running ----------
  const slotsOf = (e, prefix) => e.slots.filter((x) => x.id.startsWith(prefix + '-'));
  function slotDate(s, e, slot) {
    const span = Math.max(1, daysBetween(e.startDate, e.endDate) + 1), playoff = slot.id.indexOf('P-') !== -1;
    const same = e.slots.filter((x) => (x.id.indexOf('P-') !== -1) === playoff), depth = ev.slotDepth(same, slot.id), maxD = Math.max(1, ev.maxDepth(same));
    const half = Math.max(1, Math.floor(span / 2));
    const off = playoff ? half + Math.round((depth / maxD) * (span - half - 1)) : Math.round((depth / maxD) * (half - 1));
    const d = addDays(e.startDate, Math.min(span - 1, Math.max(0, off)));
    return d < s.currentDate ? s.currentDate : d;
  }
  function createFixture(s, e, slot) {
    const fx = { id: s.nextId++, eventId: e.id, xevId: e.id, slotId: slot.id, stage: slot.stage, round: 0, homeId: slot.teamA, awayId: slot.teamB, date: slotDate(s, e, slot), played: false, overtime: false, userPlayed: false,
      bestOf: slot.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1 };
    slot.fixtureId = fx.id; s.fixtures.push(fx);
  }
  const resultOf = (s) => (slot) => { const f = engine.fixtureById(s, slot.fixtureId); return f && f.played ? (f.homeWins > f.awayWins ? f.homeId : f.awayId) : null; };

  function prizes(s, e) {
    const k = KINDS[e.kind], real = typeof engine.realMoney === 'function' ? !!engine.realMoney(s) : s.economy === 'real';
    return prizeTable(ev, e.kind, real);
  }
  function finish(s, e) {
    const k = KINDS[e.kind], pr = prizes(s, e);
    for (const st of e.standings) {
      st.points = 0; st.prize = pr[st.placement - 1] || 0;
      const t = team(s, st.teamId); if (!t) continue;
      t.budget += st.prize;
      if (st.teamId === s.userTeamId) { try { engine.pushLedger(s, 'prize', st.prize, e.name + ' prize money'); } catch (x) { /* optional */ } }
    }
    if (engine.uxAwards) { engine.uxAwards.eventMvp(s, e, e.name); }
    // the game drops per-game detail of matches you were not part of once they are archived; do the same here (after the MVP was scored)
    for (const f of s.fixtures) if (f.xevId === e.id && f.homeId !== s.userTeamId && f.awayId !== s.userTeamId) { f.games = []; f.scorerIds = []; f.assistIds = []; f.compact = true; }
    const champ = team(s, e.championId);
    if (champ) { // same two feeds the game fills for an Open: the News list and the Home headline (no eventId: these events are not in state.events)
      const head = champ.name + ' win the ' + e.name, runner = team(s, (e.standings.find((x) => x.placement === 2) || {}).teamId);
      const body = champ.name + ' take the ' + e.name + (runner ? ', ahead of ' + runner.name : '') + '.';
      safe('news', () => { if (typeof engine.pushNews === 'function') engine.pushNews(s, () => 0.5, { category: 'result', teamId: champ.id, data: { kind: 'title', points: 0 }, headline: head, body }); });
      safe('headline', () => { if (typeof engine.pushHeadline === 'function') engine.pushHeadline(s, { kind: 'title', teamId: champ.id, days: 4, headline: head, body: champ.id === s.userTeamId ? 'Yours. The whole thing.' : champ.name + ' take the title.' }); });
    }
    if (champ && s.inbox) {
      const mineWon = e.championId === s.userTeamId, mineIn = e.field.includes(s.userTeamId), me = e.standings.find((x) => x.teamId === s.userTeamId);
      s.inbox.push({ id: s.nextId++, date: s.currentDate, unread: true, resolved: false, type: 'news', link: 'inbox', title: champ.name + ' win the ' + e.name,
        body: mineWon ? 'Yours. ' + e.name + ' champions, ' + (me ? engine.fmtMoney ? engine.fmtMoney(me.prize) : me.prize : '') + ' in prize money.' : champ.name + ' take the ' + e.name + (mineIn && me ? '. Your club finished #' + me.placement + '.' : '.') });
      // no extra "champions!!" post here: the News entry above already makes the social posts (ux-voices hooks pushNews 'title')
    }
  }
  // series length: Kick-Off Weekend counts as a Major, the EWC as Worlds (the game's setting: Quickest / Shortened / Authentic)
  const bo = (s, kind, stage) => ev.bestOfFor(kind === 'ewc' ? 'worlds' : 'major', stage, s.seriesLength);
  function draw(s, e) {
    const k = KINDS[e.kind], u = ens(s);
    let order = e.kind === 'ewc' ? rankingOrder(s) : (u.lastRanking || []).filter((id) => { const t = team(s, id); return t && t.tier !== 'B'; });
    const base = strengthOrder(s);
    for (const id of base) if (order.length < k.size && !order.includes(id)) order.push(id);
    const field = order.slice(0, k.size);
    if (field.length < k.size) { e.stage = 'done'; e.skipped = true; return; }
    Object.assign(e, cups.buildCup(ev, { id: e.id, name: e.name, kind: e.kind, startDate: e.startDate, endDate: e.endDate, groupBestOf: bo(s, e.kind, 'group'), playoffBestOf: bo(s, e.kind, 'playoff'), finalBestOf: bo(s, e.kind, 'final') }, field), { uxEv: true, uxKind: e.kind, season: e.season, id: e.id });
    e.kind = e.uxKind; // buildCup tags it 'bcup' unless the plan carried a kind (it does); keep our own kind explicit
  }
  function step(s) {
    const u = ens(s); plan(s);
    for (const e of u.events) {
      if (e.stage === 'done' || e.swiss) continue; // Swiss events belong to ux-swiss.js
      if (e.stage === 'pending') { if (addDays(e.startDate, -2) > s.currentDate) continue; draw(s, e); if (e.stage === 'done') continue; }
      const was = e.stage;
      for (let i = 0; i < 4 && cups.stepCup(ev, e, { create: (slot, c) => createFixture(s, c, slot), result: resultOf(s) }); i++);
      if (was !== 'done' && e.stage === 'done') finish(s, e);
    }
  }

  // ---------- hooks ----------
  const adv = engine.advance;
  if (typeof adv === 'function') engine.advance = function advanceWithMajors(s) { const r = adv.apply(this, arguments); if (s && s.teams && s.fixtures) safe('step', () => step(s)); return r; };
  // After the user's match the game hands over the next series at once for its own events; ours are not in state.events, so chain them the same way
  // (open the next round, run days until the user's next match of this event or until they are out / it is over): no skipping a day between matches.
  const nus = engine.nextUserSeries;
  if (typeof nus === 'function') engine.nextUserSeries = function nextUserSeriesWithMajors(s, rand, fixtureId) {
    const fx = s && s.fixtures && s.uxMajors ? engine.fixtureById(s, fixtureId) : null;
    const e = fx && fx.xevId != null ? ens(s).events.find((x) => x.id === fx.xevId && !x.swiss) : null;
    if (!e) return nus.apply(this, arguments);
    const mine = (f) => f && (f.homeId === s.userTeamId || f.awayId === s.userTeamId);
    for (let i = 0; i < 14; i++) {
      safe('step', () => step(s));
      const due = s.fixtures.find((f) => !f.played && f.xevId === e.id && mine(f) && f.date <= s.currentDate);
      if (due) return due;
      if (e.stage === 'done' || ev.teamEliminated(e.slots || [], s.userTeamId)) return null;
      const r = engine.advance(s, rand, 'day');
      if (r.stopped === 'matchday') { const f = engine.fixtureById(s, r.fixtureId); return f && f.xevId === e.id ? f : null; }
      if (r.stopped !== 'day') return null;
    }
    return null;
  };
  const nxt = engine.startNextSeason;
  if (typeof nxt === 'function') engine.startNextSeason = function startNextSeasonWithMajors(s) {
    safe('ranking', () => { const o = rankingOrder(s); ens(s).lastRanking = o.slice(0, 16); });
    const r = nxt.apply(this, arguments); safe('plan', () => plan(s)); return r;
  };
  const gen = engine.generateLeague;
  if (typeof gen === 'function') engine.generateLeague = function generateLeagueWithMajors() { const s = gen.apply(this, arguments); safe('plan', () => plan(s)); return s; };

  // group tables of the live events for the UI (the game builds them for state.events only)
  const gt = engine.groupTables;
  if (typeof gt === 'function' && typeof engine.groupTable === 'function') {
    engine.groupTables = function groupTablesWithMajors(s) {
      const out = gt.apply(this, arguments);
      safe('group tables', () => {
        const u = s && s.uxMajors; if (!u) return;
        const fx = new Map((s.fixtures || []).map((f) => [f.id, f]));
        for (const e of u.events) if ((e.groups || []).length) { out[e.id] = {}; for (const g of e.groups) out[e.id][g.prefix] = engine.groupTable(s, e, g, fx); }
      });
      return out;
    };
  }

  const api = { plan, step, KINDS, ens };
  engine.uxMajors = api;
  log('ux-majors installed');
  return api;
}

module.exports = { install, KINDS, prizeTable };
