'use strict';
// Tier A regions with 32 clubs: before every Open each region runs a Swiss stage. The 32 clubs are drawn into 2 groups of 16; every group plays
// a 5-round Swiss (3 wins = through, 3 losses = out; the 8 clubs with 3 wins go on). The 16 qualifiers are then the Open's field, played exactly
// as the game plays it (2 groups of 8, then the playoff).
// How it fits the game without editing it:
//  - the game seeds an Open as soon as the event before it is done, from the top 16 of regionTeams(). So an Open is HELD (stage 'held', which the
//    game's event loop ignores) until its Swiss is done, then released ('pending'); while it is drawn and played, the clubs that did not qualify
//    are hidden from their region (region + '_x') for the duration of the game's own call, so the game picks exactly the 16 qualifiers (also for
//    the simulated regions, which the game plays at the end of the user's Open).
//  - Swiss events live in state.uxMajors.events (kind 'swiss') like Kick-Off Weekend, their matches are ordinary fixtures (xevId).
//  - the user's region plays its Swiss as fixtures; every other region (and every region of a Tier B manager) is simulated in one go.
//  - a region with 16 clubs or less (old saves) never gets a Swiss and nothing is held.
const DAYS = 2; // the Swiss stage lasts the 2 days before the Open (3 rounds on the first, 2 on the second)
const ROUNDS = 5, WINS = 3, GROUP = 16, QUALIFY = 16; // GROUP = clubs per Swiss group, QUALIFY = clubs that reach the Open
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const pairKey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);

// ---------- pure Swiss logic (no game state) ----------
// seeds: team ids best -> worst. Returns a fresh Swiss: records, pairs played so far, round counter.
function newSwiss(seeds) {
  const rec = {};
  for (const id of seeds) rec[id] = { w: 0, l: 0 };
  return { seeds: seeds.slice(), rec, played: [], round: 0 };
}
const live = (sw) => sw.seeds.filter((id) => sw.rec[id].w < WINS && sw.rec[id].l < WINS);
const isDone = (sw) => live(sw).length === 0;

// Pair one record bracket: best seed vs worst seed, no rematches (backtracking; rematches only if there is no other way).
function pairBracket(ids, played) {
  const go = (rest, noRematch) => {
    if (!rest.length) return [];
    const a = rest[0];
    for (let i = rest.length - 1; i >= 1; i--) {
      const b = rest[i];
      if (noRematch && played.has(pairKey(a, b))) continue;
      const tail = go(rest.filter((_, k) => k !== 0 && k !== i), noRematch);
      if (tail) return [[a, b], ...tail];
    }
    return null;
  };
  return go(ids, true) || go(ids, false) || [];
}
// Next round's pairings [[a, b], ...]. Round 1: seed i v seed i + 8. Later: inside each W-L bracket.
function nextPairs(sw) {
  const ids = live(sw);
  if (sw.round === 0) { const h = ids.length / 2; return ids.slice(0, h).map((id, i) => [id, ids[i + h]]); }
  const played = new Set(sw.played);
  const brackets = new Map();
  for (const id of ids) { const k = sw.rec[id].w + '-' + sw.rec[id].l; if (!brackets.has(k)) brackets.set(k, []); brackets.get(k).push(id); }
  const rank = new Map(sw.seeds.map((id, i) => [id, i]));
  const out = [];
  for (const list of brackets.values()) out.push(...pairBracket(list.sort((x, y) => rank.get(x) - rank.get(y)), played));
  return out;
}
function record(sw, winner, loser) {
  sw.rec[winner].w++; sw.rec[loser].l++; sw.played.push(pairKey(winner, loser));
}
const endRound = (sw) => { sw.round++; };
// teams with 3 wins, best first (by W-L then seed)
const qualifiedOf = (sw) => sw.seeds.filter((id) => sw.rec[id].w >= WINS);
const standingOf = (sw) => sw.seeds.slice().sort((a, b) => (sw.rec[b].w - sw.rec[a].w) || (sw.rec[a].l - sw.rec[b].l) || (sw.seeds.indexOf(a) - sw.seeds.indexOf(b)));
// 32 ranked ids -> two groups of 16, snake-drawn so both groups are balanced
function drawGroups(ranked) {
  const a = [], b = [];
  ranked.forEach((id, i) => (i % 4 === 0 || i % 4 === 3 ? a : b).push(id));
  return [a, b];
}

// ---------- engine integration ----------
function install(engine, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.uxSwiss) return null;
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-swiss: ' + what + ' failed: ' + e.stack); return undefined; } };
  const ens = (s) => s.uxSwiss || (s.uxSwiss = { v: 1, planned: {}, hide: {} });
  const maj = (s) => s.uxMajors || (s.uxMajors = { v: 1, events: [], planned: {}, lastRanking: null });
  const team = (s, id) => engine.teamById(s, id);
  const tierA = (s, region) => s.teams.filter((t) => t.tier !== 'B' && !t.nation && t.region === region);
  const strength = (s, id) => { try { const t = team(s, id); return engine.teamStrength(s, engine.autoLineup(s, t)); } catch (e) { return 50; } };
  const regionsOf = (s) => (s.regions || []).map((r) => r.id).filter((id) => tierA(s, id).length > GROUP);
  const swissOf = (s, open, region) => (maj(s).events || []).find((e) => e.swiss && e.openId === open.id && e.region === region);

  function rankedField(s, region) {
    const rk = s.ranking || {}, last = s.lastRanking || {};
    return tierA(s, region).map((t) => ({ id: t.id, p: rk[t.id] || 0, l: last[t.id] || 0, v: strength(s, t.id) }))
      .sort((a, b) => b.p - a.p || b.l - a.l || b.v - a.v || a.id - b.id).map((x) => x.id);
  }
  // the user's club plays this region's Swiss (as fixtures); everything else is simulated at once
  const userPlays = (s, region) => { const me = team(s, s.userTeamId); return !!me && me.tier !== 'B' && me.region === region; };

  // ---------- planning: one Swiss event per Open and per big region, in the days before the Open ----------
  function plan(s) {
    const u = ens(s);
    const regs = regionsOf(s);
    if (!regs.length) return;
    const evs = (s.events || []).filter((e) => e.kind === 'open' && e.stage !== 'done');
    const others = [...(s.events || []), ...((s.uxMajors || {}).events || []).filter((e) => !e.swiss)];
    for (const open of evs) {
      if (u.planned[open.id]) continue;
      const prevEnd = others.filter((e) => e !== open && e.endDate && e.endDate < open.startDate).map((e) => e.endDate).sort().pop();
      let start = addDays(open.startDate, -DAYS);
      if (prevEnd && prevEnd >= start) start = addDays(prevEnd, 1);
      if (start < s.currentDate) start = s.currentDate;
      if (start >= open.startDate || open.stage === 'groups' && playedOf(s, open)) continue; // no room, or the Open is already under way: no Swiss for it
      u.planned[open.id] = true;
      const end = addDays(open.startDate, -1), n = daysBetween(start, end) + 1;
      for (const region of regs) {
        const name = ((s.regions || []).find((r) => r.id === region) || {}).short || region.toUpperCase();
        maj(s).events.push({ id: s.nextId++, kind: 'swiss', uxKind: 'swiss', uxEv: true, swiss: true, name: name + ' ' + open.name + ' Swiss', season: s.season, region, openId: open.id,
          startDate: start, endDate: end, days: Array.from({ length: ROUNDS }, (_, r) => addDays(start, Math.min(n - 1, Math.floor(r / 3)))), bestOf: open.groupBestOf || 5,
          stage: 'pending', field: [], groups: [], slots: [], standings: [], championId: null, sw: [], qualified: [] });
      }
    }
  }
  const playedOf = (s, open) => (s.fixtures || []).some((f) => f.eventId === open.id && f.played);

  // ---------- hold / release ----------
  function unseed(s, open) {
    s.fixtures = (s.fixtures || []).filter((f) => !(f.eventId === open.id && f.xevId == null && !f.played));
    for (const k of ['groupCount', 'groupSize', 'qualifierCount', 'playoffSeeds']) delete open[k];
    open.field = []; open.groups = []; open.slots = [];
    for (const key of ['headlines', 'news']) if (Array.isArray(s[key])) s[key] = s[key].filter((h) => !(h && h.eventId === open.id && h.kind === 'groups'));
    open.opened = false;
  }
  // a match of the user's Swiss that should have been played already (a skipped matchday): the Swiss is settled by simulation
  const overdue = (s, open) => (maj(s).events || []).some((e) => e.swiss && e.openId === open.id && (e.sw || []).some((x) => { const f = x.pend && engine.fixtureById(s, x.pend.id); return f && !f.played && f.date < s.currentDate; }));
  function hold(s, rand) {
    const u = ens(s);
    for (const open of s.events || []) {
      if (open.kind !== 'open' || !u.planned[open.id]) continue;
      if (open.stage === 'held') {
        if (s.currentDate >= open.startDate || (addDays(s.currentDate, 1) >= open.startDate && overdue(s, open))) release(s, open, true, rand); // safety: settle by simulation, never leave the Open unseeded
        continue;
      }
      if ((open.stage !== 'pending' && open.stage !== 'groups') || (open.stage === 'groups' && playedOf(s, open))) continue;
      const sws = (maj(s).events || []).filter((e) => e.swiss && e.openId === open.id);
      if (!sws.length || sws.every((e) => e.stage === 'done')) continue;
      if (open.stage === 'groups') unseed(s, open);
      open.stage = 'held'; // empty field / groups / slots: if the game ever walks past a held Open it finds nothing to do instead of crashing
      open.field = open.field || []; open.groups = open.groups || []; open.slots = open.slots || [];
    }
  }
  function settle(s, e, rand) {
    if (e.stage === 'pending') begin(s, e);
    e.live = false;
    for (const x of e.sw) {
      if (x.pend) {
        const fx = engine.fixtureById(s, x.pend.id); let w = fx && fx.played ? winnerOfFx(s, x.pend.id) : null;
        if (w == null) { if (fx) s.fixtures = s.fixtures.filter((q) => q.id !== fx.id); w = simulate(s, x.pend.a, x.pend.b, e.bestOf, rand); }
        record(x.sw, w, w === x.pend.a ? x.pend.b : x.pend.a); x.pend = null; endRound(x.sw);
      }
      runGroup(s, e, x, rand);
    }
    if (e.stage !== 'done') finish(s, e);
  }
  // a region's qualifiers are known: hide the others while the game draws and plays the Open
  function release(s, open, force, rand) {
    const u = ens(s);
    for (const e of maj(s).events) {
      if (!e.swiss || e.openId !== open.id || e.stage === 'done') continue;
      if (force) { settle(s, e, rand || Math.random); e.forced = true; }
    }
    u.hide[open.id] = Object.fromEntries(maj(s).events.filter((e) => e.swiss && e.openId === open.id).map((e) => [e.region, e.qualified]));
    if (open.stage === 'held') open.stage = 'pending';
  }
  const hidden = [];
  function hideOn(s) {
    const u = s && s.uxSwiss; if (!u) return;
    for (const [oid, byRegion] of Object.entries(u.hide || {})) {
      const open = (s.events || []).find((e) => e.id === Number(oid));
      if (!open || open.stage === 'done') { delete u.hide[oid]; continue; }
      for (const [region, ok] of Object.entries(byRegion)) {
        const keep = new Set(ok);
        for (const t of tierA(s, region)) if (!keep.has(t.id)) { hidden.push([t, t.region]); t.region = region + '_x'; }
      }
    }
  }
  function hideOff() { while (hidden.length) { const [t, r] = hidden.pop(); t.region = r; } }

  // ---------- running ----------
  function createFixture(s, e, a, b, date) {
    const fx = { id: s.nextId++, eventId: e.openId, xevId: e.id, // listed with the Open itself (it is part of that event), not as an event of its own
      slotId: 'sw', stage: 'group', round: 0, homeId: a, awayId: b, date, played: false, overtime: false, userPlayed: false,
      bestOf: e.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1 };
    s.fixtures.push(fx); return fx.id;
  }
  const winnerOfFx = (s, id) => { const f = engine.fixtureById(s, id); return f && f.played ? (f.homeWins > f.awayWins ? f.homeId : f.awayId) : null; };
  function simulate(s, a, b, bestOf, rand) {
    const need = Math.ceil((bestOf || 5) / 2), pa = 1 / (1 + Math.exp(-(strength(s, a) - strength(s, b)) / 9));
    let x = 0, y = 0;
    while (x < need && y < need) { if (rand() < pa) x++; else y++; }
    return x > y ? a : b;
  }
  function begin(s, e) {
    const ranked = rankedField(s, e.region);
    e.field = ranked.slice();
    const g = drawGroups(ranked.slice(0, GROUP * 2));
    e.sw = g.map((seeds, i) => ({ key: 'AB'[i], sw: newSwiss(seeds), pend: null }));
    e.groups = e.sw.map((x) => ({ prefix: e.id + x.key, seeds: x.sw.seeds, letter: x.key }));
    e.stage = 'running'; e.live = userPlays(s, e.region);
  }
  function finish(s, e) {
    e.qualified = e.sw.flatMap((x) => qualifiedOf(x.sw));
    e.standings = e.sw.flatMap((x) => standingOf(x.sw).map((id) => ({ teamId: id, group: x.key, placement: 0, points: 0, prize: 0, wins: x.sw.rec[id].w, losses: x.sw.rec[id].l, through: x.sw.rec[id].w >= WINS })));
    e.standings.sort((a, b) => (b.through - a.through) || (b.wins - a.wins) || (a.losses - b.losses)).forEach((x, i) => { x.placement = i + 1; });
    // clubs out in the Swiss: 2-3, 1-3 and 0-3 are different places (a tie shares the worst place of its band, like the game's own tables)
    { const out = e.standings.filter((x) => !x.through), byRec = {}; let pos = e.standings.length - out.length;
      out.forEach((x) => { (byRec[x.wins + '-' + x.losses] = byRec[x.wins + '-' + x.losses] || []).push(x); });
      Object.keys(byRec).sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]) || Number(a.split('-')[1]) - Number(b.split('-')[1])).forEach((k) => { pos += byRec[k].length; byRec[k].forEach((x) => { x.band = pos; }); }); }
    e.stage = 'done';
    for (const f of s.fixtures) if (f.xevId === e.id && f.homeId !== s.userTeamId && f.awayId !== s.userTeamId) { f.games = []; f.scorerIds = []; f.assistIds = []; f.compact = true; }
    const open = (s.events || []).find((x) => x.id === e.openId);
    if (open && (maj(s).events || []).filter((x) => x.swiss && x.openId === open.id).every((x) => x.stage === 'done')) release(s, open, false);
  }
  // Everything is resolved at once except the user's own matches: those are real fixtures, dated on the round's day (or today if later). The user's group
  // waits for that result, then plays on; the other group and every other club are simulated on the spot (no fixtures, no calendar to keep).
  function runGroup(s, e, x, rand) {
    for (let guard = 0; guard < 20 && !isDone(x.sw); guard++) {
      if (x.pend) {
        const w = winnerOfFx(s, x.pend.id);
        if (w == null) return; // the user's match is not played yet
        record(x.sw, w, w === x.pend.a ? x.pend.b : x.pend.a); x.pend = null; endRound(x.sw); continue;
      }
      let mine = null;
      for (const [a, b] of nextPairs(x.sw)) {
        if (e.live && (a === s.userTeamId || b === s.userTeamId)) { mine = [a, b]; continue; }
        const w = simulate(s, a, b, e.bestOf, rand); record(x.sw, w, w === a ? b : a);
      }
      if (mine) { const day = e.days[Math.min(ROUNDS - 1, x.sw.round)]; x.pend = { id: createFixture(s, e, mine[0], mine[1], day < s.currentDate ? s.currentDate : day), a: mine[0], b: mine[1] }; return; }
      endRound(x.sw);
    }
  }
  // once an Open is finished, the clubs that went out in its Swiss join its standings (no points, no prize) at their band: the game's board then sees
  // 22nd / 28th / 32nd instead of treating every non-qualifier as 17th
  function markOut(s) {
    for (const o of s.events || []) {
      if (o.kind !== 'open' || o.stage !== 'done' || o.swOut) continue;
      const sws = (maj(s).events || []).filter((x) => x.swiss && x.openId === o.id && x.stage === 'done');
      const sw = sws.find((x) => x.region === s.userRegion) || (sws.length === 1 ? sws[0] : null);
      if (!sw) continue;
      o.swOut = true;
      const have = new Set((o.standings || []).map((x) => x.teamId));
      for (const x of sw.standings || []) if (!x.through && !have.has(x.teamId) && x.band) o.standings.push({ teamId: x.teamId, placement: x.band, points: 0, prize: 0, swiss: true, wins: x.wins, losses: x.losses });
    }
  }
  function step(s, rand) {
    plan(s); markOut(s);
    for (const e of maj(s).events) {
      if (!e.swiss || e.stage === 'done') continue;
      if (e.stage === 'pending') { if (addDays(e.startDate, -(userPlays(s, e.region) ? 2 : 0)) > s.currentDate) continue; begin(s, e); }
      for (const x of e.sw) runGroup(s, e, x, rand);
      if (e.sw.every((x) => isDone(x.sw))) finish(s, e);
    }
  }

  // After the user's Swiss match the game would chain to "the next series of the same event" by looking the fixture's eventId up in state.events
  // and skipping days itself (it knows nothing of Swiss rounds). So Swiss matches are chained here: open the next round, give the user a match that is
  // due today (several rounds are played per day), otherwise run the days until the next one.
  function chain(s, rand, sw) {
    for (let i = 0; i < 14; i++) {
      step(s, rand); hold(s, rand);
      const due = (s.fixtures || []).find((f) => f.xevId === sw.id && !f.played && f.date <= s.currentDate && (f.homeId === s.userTeamId || f.awayId === s.userTeamId));
      if (due) return due;
      if (sw.stage === 'done') return null;
      const r = engine.advance(s, rand, 'day');
      if (r.stopped === 'matchday') { const f = engine.fixtureById(s, r.fixtureId); return f && f.xevId === sw.id ? f : null; }
      if (r.stopped !== 'day') return null;
    }
    return null;
  }

  // ---------- hooks ----------
  // hide non-qualifiers only while the game's own code runs (it seeds Opens and plays the simulated regions inside these calls)
  for (const name of ['advance', 'nextUserSeries', 'simulateFixture', 'progressEvents']) {
    const fn = engine[name]; if (typeof fn !== 'function') continue;
    engine[name] = function swissGuarded(s) {
      if (!s || !s.teams || !s.events) return fn.apply(this, arguments);
      safe('hold', () => { plan(s); if (name === 'advance') step(s, arguments[1] || Math.random); hold(s, arguments[1]); });
      if (name === 'nextUserSeries') { const fx = engine.fixtureById(s, arguments[2]), sw = fx && fx.xevId != null ? (maj(s).events || []).find((e) => e.swiss && e.id === fx.xevId) : null; if (sw) return chain(s, arguments[1] || Math.random, sw); }
      safe('hide', () => hideOn(s));
      let out;
      try { out = fn.apply(this, arguments); } finally { hideOff(); } // restored even if the game throws
      if (name === 'advance') safe('step', () => { step(s, arguments[1] || Math.random); hold(s); });
      return out;
    };
  }
  const nxt = engine.startNextSeason;
  if (typeof nxt === 'function') engine.startNextSeason = function startNextSeasonWithSwiss(s) {
    const r = nxt.apply(this, arguments); safe('plan', () => { plan(s); hold(s); }); return r;
  };
  const gen = engine.generateLeague;
  if (typeof gen === 'function') engine.generateLeague = function generateLeagueWithSwiss() {
    const s = gen.apply(this, arguments); safe('plan', () => { plan(s); hold(s); }); return s;
  };

  const api = { markOut, ROUNDS, plan, step, hold, newSwiss, nextPairs, record, endRound, isDone, qualifiedOf, standingOf, drawGroups };
  engine.uxSwiss = api;
  log('ux-swiss installed');
  return api;
}

module.exports = { install, newSwiss, nextPairs, record, endRound, isDone, qualifiedOf, standingOf, drawGroups, pairBracket, ROUNDS, WINS, GROUP };
