'use strict';
// Phase 6: end-of-season promotion playoff per Tier B region + the Tier A relegation list.
// Tier B #1 is promoted directly; #2-#5 play SF1 (#2 v #5), SF2 (#3 v #4) and a Final, all BO7, as real fixtures
// (so the engine simulates them and the user plays theirs). Tier A #15/#16 (by the game's own season ranking) are listed for relegation.
// Phase 7 reads state.tierB.promo.regions[r].{promoted, relegated} to move the teams; nothing is moved here.
const BEST_OF = 7;
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

function createPromotion(engine, ev, season, opts = {}) {
  const log = opts.log || (() => {});
  const slotsFor = (id) => [
    { id: `${id}-sf-1`, stage: 'semi', bestOf: BEST_OF, a: ev.seed(0), b: ev.seed(3), eliminates: true },
    { id: `${id}-sf-2`, stage: 'semi', bestOf: BEST_OF, a: ev.seed(1), b: ev.seed(2), eliminates: true },
    { id: `${id}-final`, stage: 'final', bestOf: BEST_OF, a: ev.winnerOf(`${id}-sf-1`), b: ev.winnerOf(`${id}-sf-2`), eliminates: true, decides: true }
  ];

  const ready = (state) => state.tierB.cups.every((c) => c.stage === 'done') && (state.events || []).every((e) => e.stage === 'done');
  const current = (state) => { const p = state.tierB && state.tierB.promo; return p && p.season === state.season ? p : null; };
  // true while the game must keep waiting at season end
  const pending = (state) => { const tb = state.tierB; return !!(tb && tb.cups && tb.season === state.season && !(current(state) && current(state).stage === 'done')); };

  function planRegion(state, r, id) {
    const table = season.standings(state, r.id);
    const a = r.id.replace(/_b$/, '');
    const rank = state.ranking || {};
    const tierA = engine.regionTeams(state, a).map((t) => t.id).sort((x, y) => (rank[y] || 0) - (rank[x] || 0) || x - y);
    const relegated = tierA.length >= 4 ? tierA.slice(-2) : []; // [#15, #16]
    if (table.length < 5) { log(`btier: ${r.id} promotion playoff skipped (${table.length} teams)`); return { region: r.id, stage: 'done', skipped: true, promoted: [], relegated }; }
    const seeds = table.slice(1, 5).map((x) => x.teamId);
    return { region: r.id, id, stage: 'playoffs', direct: table[0].teamId, seeds, relegated, slots: slotsFor(id), winnerId: null, promoted: [] };
  }

  function fixture(state, pl, slot) {
    const fx = {
      id: state.nextId++, eventId: pl.id, promoId: pl.id, tierB: true, slotId: slot.id, stage: slot.stage, round: 0,
      homeId: slot.teamA, awayId: slot.teamB, date: addDays(state.currentDate, 1), played: false, overtime: false, userPlayed: false,
      bestOf: slot.bestOf, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1
    };
    slot.fixtureId = fx.id;
    state.fixtures.push(fx);
  }

  const resultOf = (state) => (slot) => {
    const fx = engine.fixtureById(state, slot.fixtureId);
    return fx && fx.played ? (fx.homeWins > fx.awayWins ? fx.homeId : fx.awayId) : null;
  };

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
      for (const s of pl.slots) {
        if (s.fixtureId == null || s.winner != null) continue;
        const w = resultOf(state)(s);
        if (w != null) ev.recordResult(pl.slots, s.id, w);
      }
      for (const s of ev.openSlots(pl.slots, pl.seeds)) fixture(state, pl, s);
      if (ev.bracketComplete(pl.slots)) {
        pl.winnerId = ev.slotById(pl.slots, `${pl.id}-final`).winner;
        pl.promoted = [pl.direct, pl.winnerId];
        pl.stage = 'done';
      }
    }
    if (Object.values(p.regions).every((x) => x.stage === 'done')) {
      p.stage = 'done';
      (tb.promoHistory = tb.promoHistory || []).push({ season: p.season, regions: JSON.parse(JSON.stringify(p.regions)) });
    }
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
      const ok = up.length === 2 && down.length === 2 && new Set([...pl.promoted, ...pl.relegated]).size === 4 &&
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

  return { step, pending, transition, redraw };
}

module.exports = { createPromotion, BEST_OF };
