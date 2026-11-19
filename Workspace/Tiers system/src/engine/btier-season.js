'use strict';
// Phase 4b: runs the B-Tier Cups inside a career. The game's own engine does the heavy lifting:
// cup matches are ordinary fixtures in state.fixtures, so the engine simulates them (with player stats),
// the user plays/sims their own cup matches like any other match, and results are read back from the fixtures.
// Everything lives in state.tierB; careers without state.tierB (old saves) are never touched.
const cups = require('./btier-cups');

const DRAW_DAYS_BEFORE = 7; // a cup is drawn (fixtures created) a week before it starts, like the game's events
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

function createSeason(engine, ev, opts = {}) {
  const regionTeams = (state, region) => state.teams.filter((t) => t.region === region);

  // One pending cup per game Open per Tier B region.
  function initSeason(state) {
    const tb = state.tierB;
    if (!tb || !tb.regions || !tb.regions.length) return;
    const opens = (state.events || []).filter((e) => e.kind === 'open');
    tb.season = state.season;
    tb.cups = [];
    tb.ranking = tb.ranking || {};
    for (const r of tb.regions) {
      tb.ranking[r.id] = {};
      for (const o of opens) {
        tb.cups.push({
          kind: 'bcup', stage: 'pending', id: null, region: r.id, name: `B-Tier Cup ${o.index}`, split: o.split, index: o.index,
          startDate: o.startDate, endDate: o.endDate, groupBestOf: o.groupBestOf, playoffBestOf: o.playoffBestOf, finalBestOf: o.finalBestOf
        });
      }
    }
  }

  // Field for a cup: the region's teams, best first = Tier B season points, then last season's, then roster strength.
  function fieldFor(state, region) {
    const tb = state.tierB;
    const pts = (tb.ranking && tb.ranking[region]) || {};
    const last = (tb.lastRanking && tb.lastRanking[region]) || {};
    const str = (t) => engine.teamStrength(state, engine.autoLineup(state, t));
    const cache = new Map(regionTeams(state, region).map((t) => [t.id, str(t)]));
    return regionTeams(state, region).map((t) => t.id)
      .sort((a, b) => (pts[b] || 0) - (pts[a] || 0) || (last[b] || 0) - (last[a] || 0) || cache.get(b) - cache.get(a) || a - b);
  }

  // Same spreading rule the game uses for its own event slots (groups first, playoffs on the later days).
  function slotDate(state, cup, slot) {
    const span = Math.max(1, daysBetween(cup.startDate, cup.endDate) + 1);
    const playoff = slot.id.indexOf('P-') !== -1;
    const same = cup.slots.filter((s) => (s.id.indexOf('P-') !== -1) === playoff);
    const depth = ev.slotDepth(same, slot.id);
    const maxD = Math.max(1, ev.maxDepth(same));
    const half = Math.max(1, Math.floor(span / 2));
    const off = playoff ? half + Math.round((depth / maxD) * (span - half - 1)) : Math.round((depth / maxD) * (half - 1));
    const d = addDays(cup.startDate, Math.min(span - 1, Math.max(0, off)));
    return d < state.currentDate ? state.currentDate : d;
  }

  function createFixture(state, cup, slot) {
    const fx = {
      id: state.nextId++, eventId: cup.id, cupId: cup.id, tierB: true, slotId: slot.id, stage: slot.stage, round: 0,
      homeId: slot.teamA, awayId: slot.teamB, date: slotDate(state, cup, slot), played: false, overtime: false, userPlayed: false,
      bestOf: slot.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1
    };
    slot.fixtureId = fx.id;
    state.fixtures.push(fx);
    return fx;
  }

  const resultOf = (state) => (slot) => {
    const fx = engine.fixtureById(state, slot.fixtureId);
    return fx && fx.played ? (fx.homeWins > fx.awayWins ? fx.homeId : fx.awayId) : null;
  };

  function award(state, cup) {
    const tb = state.tierB;
    const table = (tb.ranking[cup.region] = tb.ranking[cup.region] || {});
    const real = typeof engine.realMoney === 'function' ? !!engine.realMoney(state) : state.economy === 'real';
    const regionId = cup.region.replace(/_b$/, '');
    const prizes = cups.prizeTable(ev, { real, region: regionId, size: cup.field.length });
    for (const s of cup.standings) {
      table[s.teamId] = (table[s.teamId] || 0) + s.points;
      const team = engine.teamById(state, s.teamId);
      s.prize = prizes[s.placement - 1];
      if (team) team.budget += s.prize;
    }
    // The game archives every fixture into seasonHistory (~1.7 KB each); 2,300 cup matches would add ~7 MB per season.
    // Once the cup is over, drop the per-game detail of matches the user was not part of; results and player stats stay.
    for (const f of state.fixtures) {
      if (f.cupId !== cup.id || f.homeId === state.userTeamId || f.awayId === state.userTeamId) continue;
      f.games = []; f.scorerIds = []; f.assistIds = []; f.compact = true;
    }
    (tb.history = tb.history || []).push({
      season: state.season, region: cup.region, cupId: cup.id, name: cup.name, split: cup.split, index: cup.index,
      endDate: cup.endDate, championId: cup.championId, standings: cup.standings.map((s) => ({ teamId: s.teamId, placement: s.placement, points: s.points, prize: s.prize }))
    });
  }

  // Called every game day (before and after the engine processes the day). Cheap when nothing is due.
  function step(state) {
    const tb = state.tierB;
    if (!tb || !tb.cups || tb.season !== state.season) return;
    const today = state.currentDate;
    for (const cup of tb.cups) {
      if (cup.stage === 'done') continue;
      if (cup.stage === 'pending') {
        if (addDays(cup.startDate, -DRAW_DAYS_BEFORE) > today) continue;
        const prev = tb.cups.filter((c) => c.region === cup.region && c.stage !== 'pending' && c !== cup);
        if (prev.some((c) => c.stage !== 'done')) continue; // one cup at a time per region
        const field = fieldFor(state, cup.region);
        if (!cups.SIZES.includes(field.length)) { cup.stage = 'done'; cup.skipped = true; cup.skipReason = `region has ${field.length} teams, needs ${cups.SIZES.join(' or ')}`; if (opts.log) opts.log(`btier: ${cup.region} ${cup.name} skipped: ${cup.skipReason}`); continue; }
        Object.assign(cup, cups.buildCup(ev, { id: state.nextId++, region: cup.region, name: cup.name, split: cup.split, index: cup.index, startDate: cup.startDate, endDate: cup.endDate, groupBestOf: cup.groupBestOf, playoffBestOf: cup.playoffBestOf, finalBestOf: cup.finalBestOf }, field));
      }
      const wasDone = cup.stage === 'done';
      for (let i = 0; i < 4 && cups.stepCup(ev, cup, { create: (slot, c) => createFixture(state, c, slot), result: resultOf(state) }); i++);
      if (!wasDone && cup.stage === 'done') award(state, cup);
    }
  }

  // Regional Tier B table for one season, built from the cup history (the source of truth).
  // Order: points, cup wins, runner-up finishes, best single placement, average placement, last season's points, team id.
  function standings(state, region, season) {
    const tb = state.tierB;
    if (!tb || !(tb.regions || []).some((r) => r.id === region)) return []; // Tier B regions only, never Tier A data
    const yr = season == null ? tb.season : season;
    if (yr !== tb.season) { // a finished season is read from its archive, so later promotion/relegation cannot change it
      const arch = (tb.seasons || []).find((x) => x.season === yr);
      if (arch && arch.tables[region]) return arch.tables[region].map((x) => ({ rank: x.rank, teamId: x.teamId, points: x.points, cups: x.cups, wins: x.wins, seconds: x.seconds, best: x.best, prize: x.prize }));
    }
    const rows = new Map(regionTeams(state, region).map((t) => [t.id, { teamId: t.id, points: 0, cups: 0, wins: 0, seconds: 0, best: 99, sumPlace: 0, prize: 0 }]));
    for (const h of (tb.history || [])) {
      if (h.region !== region || h.season !== yr) continue;
      for (const x of h.standings) {
        const r = rows.get(x.teamId);
        if (!r) continue;
        r.points += x.points; r.cups++; r.prize += x.prize || 0; r.sumPlace += x.placement;
        if (x.placement === 1) r.wins++;
        if (x.placement === 2) r.seconds++;
        r.best = Math.min(r.best, x.placement);
      }
    }
    const prev = (tb.lastRanking && tb.lastRanking[region]) || {};
    const list = [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.seconds - a.seconds || a.best - b.best ||
      (a.cups ? a.sumPlace / a.cups : 99) - (b.cups ? b.sumPlace / b.cups : 99) || (prev[b.teamId] || 0) - (prev[a.teamId] || 0) || a.teamId - b.teamId);
    return list.map((r, i) => ({ rank: i + 1, teamId: r.teamId, points: r.points, cups: r.cups, wins: r.wins, seconds: r.seconds, best: r.best === 99 ? null : r.best, prize: r.prize }));
  }

  // After the game starts a new season: archive this season's table and plan the next season's cups.
  function rollSeason(state) {
    const tb = state.tierB;
    if (!tb || tb.season === state.season) return;
    // keep this season's final regional tables for good (history of previous seasonal standings)
    const tables = {};
    for (const r of tb.regions) tables[r.id] = standings(state, r.id, tb.season);
    (tb.seasons = tb.seasons || []).push({ season: tb.season, tables });
    tb.lastRanking = tb.ranking || {};
    tb.ranking = {};
    initSeason(state);
  }

  return { initSeason, step, rollSeason, fieldFor, createFixture, standings };
}

module.exports = { createSeason };
