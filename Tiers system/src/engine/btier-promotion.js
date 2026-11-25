'use strict';
// Phase 6: end-of-season promotion playoff per Tier B region + the Tier A relegation list.
// Tier B #1 and #2 are promoted directly; #3-#6 play one group of 4 (everyone against everyone, 6 BO7 series over 3 days) as real fixtures
// (so the engine simulates them and the user plays theirs). The top 2 of the group are promoted too.
// Saves that were mid-playoff in the old format (semi-finals + final, pl.format undefined) finish in that format.
// The 4 worst Tier A clubs (the game's own season ranking, then squad strength) are listed for relegation: 4 up, 4 down.
// Phase 7 reads state.tierB.promo.regions[r].{promoted, relegated} to move the teams; nothing is moved here.
const BEST_OF = 7;
const MOVES = 4; // clubs promoted and relegated per region each season
const ROUNDS = [[[0, 3], [1, 2]], [[0, 2], [3, 1]], [[0, 1], [2, 3]]]; // seed indexes per matchday: every pairing of 4 clubs once
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

function createPromotion(engine, ev, season, opts = {}) {
  const log = opts.log || (() => {});
  const ready = (state) => state.tierB.cups.every((c) => c.stage === 'done') && (state.events || []).every((e) => e.stage === 'done');
  const current = (state) => { const p = state.tierB && state.tierB.promo; return p && p.season === state.season ? p : null; };
  // true while the game must keep waiting at season end
  const pending = (state) => { const tb = state.tierB; return !!(tb && tb.cups && tb.season === state.season && !(current(state) && current(state).stage === 'done')); };

  function planRegion(state, r, id) {
    const table = season.standings(state, r.id);
    const a = r.id.replace(/_b$/, '');
    const rank = state.ranking || {};
    const power = (id) => { try { return engine.teamStrength(state, engine.autoLineup(state, engine.teamById(state, id))); } catch (e) { return 0; } }; // clubs that never reached an Open have no points: the weaker squad goes down
    const tierA = engine.regionTeams(state, a).map((t) => t.id).sort((x, y) => (rank[y] || 0) - (rank[x] || 0) || power(y) - power(x) || x - y);
    const relegated = tierA.length >= 2 * MOVES ? tierA.slice(-MOVES) : []; // the 4 worst
    if (table.length < MOVES + 3) { log(`btier: ${r.id} promotion playoff skipped (${table.length} teams)`); return { region: r.id, stage: 'done', skipped: true, promoted: [], relegated }; }
    const seeds = table.slice(2, 6).map((x) => x.teamId);
    const start = addDays(state.currentDate, 1);
    const slots = ROUNDS.flatMap((rd, k) => rd.map(([i, j], m) => ({ id: `${id}-g-${k}${m}`, stage: 'group', round: k, bestOf: BEST_OF, teamA: seeds[i], teamB: seeds[j], fixtureId: null, winner: null })));
    return { region: r.id, id, format: 'rr', stage: 'playoffs', startDate: start, endDate: addDays(start, ROUNDS.length - 1), direct: table[0].teamId, direct2: table[1].teamId, seeds, relegated, slots, winnerId: null, promoted: [] };
  }

  function fixture(state, pl, slot, date) {
    const fx = {
      id: state.nextId++, eventId: pl.id, promoId: pl.id, tierB: true, slotId: slot.id, stage: slot.stage, round: 0,
      homeId: slot.teamA, awayId: slot.teamB, date: date || addDays(state.currentDate, 1), played: false, overtime: false, userPlayed: false,
      bestOf: slot.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1
    };
    slot.fixtureId = fx.id;
    state.fixtures.push(fx);
  }

  const resultOf = (state) => (slot) => {
    const fx = engine.fixtureById(state, slot.fixtureId);
    return fx && fx.played ? (fx.homeWins > fx.awayWins ? fx.homeId : fx.awayId) : null;
  };

  // Group table: series won, then games won minus lost, then the seed (regional table position).
  function groupTable(state, pl) {
    const rows = new Map(pl.seeds.map((id, i) => [id, { teamId: id, seed: i, played: 0, w: 0, l: 0, gw: 0, gl: 0 }]));
    for (const s of pl.slots) {
      const fx = s.fixtureId != null ? engine.fixtureById(state, s.fixtureId) : null;
      if (!fx || !fx.played) continue;
      const h = rows.get(fx.homeId), a = rows.get(fx.awayId);
      if (!h || !a) continue;
      h.played++; a.played++; h.gw += fx.homeWins; h.gl += fx.awayWins; a.gw += fx.awayWins; a.gl += fx.homeWins;
      if (fx.homeWins > fx.awayWins) { h.w++; a.l++; } else { a.w++; h.l++; }
    }
    return [...rows.values()].sort((x, y) => y.w - x.w || (y.gw - y.gl) - (x.gw - x.gl) || x.seed - y.seed).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  function stepGroup(state, pl) {
    for (const s of pl.slots) {
      if (s.fixtureId == null) fixture(state, pl, s, addDays(pl.startDate, s.round));
      else if (s.winner == null) { const w = resultOf(state)(s); if (w != null) s.winner = w; }
    }
    if (pl.slots.every((s) => s.winner != null)) {
      const t = groupTable(state, pl);
      pl.winnerId = t[0].teamId;
      pl.promoted = [pl.direct, pl.direct2, t[0].teamId, t[1].teamId];
      pl.stage = 'done';
    }
  }

  // Called at season end (all Tier A + Tier B competitions finished). Creates the playoffs once, then follows their fixtures.
  function step(state) {
    const tb = state.tierB;
    if (!pending(state)) return;
    let p = current(state);
    if (!p) {
      if (!ready(state)) { // never block the game forever on an unfinished cup
        tb.promo = { season: state.season, stage: 'done', skipped: true, regions: {} };
        log('btier: promotion playoffs skipped, B-Tier Cups were not finished');
        return;
      }
      p = tb.promo = { season: state.season, stage: 'active', regions: {} };
      tb.regions.forEach((r, i) => { p.regions[r.id] = planRegion(state, r, `PP${state.season}${i}`); });
    }
    for (const pl of Object.values(p.regions)) {
      if (pl.stage === 'done') continue;
      if (pl.format === 'rr') { stepGroup(state, pl); continue; }
      for (const s of pl.slots) {
        if (s.fixtureId == null || s.winner != null) continue;
        const w = resultOf(state)(s);
        if (w != null) ev.recordResult(pl.slots, s.id, w);
      }
      for (const s of ev.openSlots(pl.slots, pl.seeds)) fixture(state, pl, s);
      if (ev.bracketComplete(pl.slots)) {
        const fin = ev.slotById(pl.slots, `${pl.id}-final`);
        pl.winnerId = fin.winner;
        const sf = (k) => ev.slotById(pl.slots, `${pl.id}-${k}`).winner;
        pl.promoted = [pl.direct, pl.direct2, sf('sf-1'), sf('sf-2')];
        pl.stage = 'done';
      }
    }
    if (Object.values(p.regions).every((x) => x.stage === 'done')) {
      p.stage = 'done';
      (tb.promoHistory = tb.promoHistory || []).push({ season: p.season, regions: JSON.parse(JSON.stringify(p.regions)) });
    }
  }

  // Runs every day: the promotion group is drawn and played right after the last cup / event of the season (the dates the calendar shows),
  // not only when the game reports the season end, which can be weeks later (the World Cup comes after Worlds). Never skips: step() does that at season end.
  function early(state) {
    const tb = state.tierB;
    if (!tb || !tb.cups || !tb.cups.length || tb.season !== state.season || !(state.events || []).length) return;
    const p = current(state);
    if (p ? p.stage !== 'done' : ready(state)) step(state);
  }

  // Phase 7: swaps promoted/relegated teams once, right after the game has rolled into the new season.
  // Only team.region/tier change (players, contracts, budget, stats stay); promoted[i] <-> relegated[i] keeps 16 A / 32 B per region.
  function transition(state, oldSeason) {
    const tb = state.tierB;
    const p = tb && tb.promo;
    if (!p || p.season !== oldSeason || p.applied || p.stage !== 'done') return;
    p.applied = true; // set first: never apply twice, even if something below throws
    const moves = (tb.moves = tb.moves || []);
    let redo = false;
    for (const pl of Object.values(p.regions)) {
      const a = pl.region.replace(/_b$/, '');
      const up = (pl.promoted || []).map((id) => engine.teamById(state, id));
      const down = (pl.relegated || []).map((id) => engine.teamById(state, id));
      const ok = up.length >= 2 && up.length === down.length && new Set([...pl.promoted, ...pl.relegated]).size === up.length * 2 &&
        up.every((t) => t && t.region === pl.region) && down.every((t) => t && t.region === a);
      if (!ok) { log(`btier: ${pl.region} transition skipped (teams not where expected)`); continue; }
      const swap = (t, region, tier) => {
        const was = t.region;
        t.region = region; t.tier = tier; t.homeRegion = a;
        if (t.id === state.userTeamId) state.userRegion = region;
        return was;
      };
      up.forEach((t) => swap(t, a, 'A'));
      down.forEach((t) => swap(t, pl.region, 'B'));
      redo = true;
      moves.push({ season: oldSeason, region: a, promoted: pl.promoted.slice(), relegated: pl.relegated.slice() });
    }
    if (/_b$/.test(state.userRegion || '')) redo = true; // a Tier B user's first Open was drawn for the wrong region inside startNextSeason
    if (redo) redraw(state);
  }

  // The game draws the first event of a season on its own (inside generateLeague / startNextSeason) before our division
  // changes apply. Put every drawn-but-unplayed event back to pending and drop its fixtures; the game redraws it on the next day.
  function redraw(state) {
    for (const e of state.events || []) {
      if (e.stage === 'pending' || e.stage === 'done' || (e.slots || []).some((s) => s.winner != null)) continue;
      for (let i = state.fixtures.length - 1; i >= 0; i--) if (state.fixtures[i].eventId === e.id && !state.fixtures[i].played) state.fixtures.splice(i, 1);
      e.stage = 'pending'; e.field = []; e.groups = []; e.slots = []; e.opened = false;
    }
  }

  return { step, early, pending, transition, redraw, groupTable };
}

module.exports = { createPromotion, BEST_OF };
