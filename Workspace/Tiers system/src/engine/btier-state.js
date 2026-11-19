'use strict';
// Phase 3: adds Tier B teams to a new career without editing the game's files.
// wrapEngine(engine) replaces engine.generateLeague with a wrapper that
//  1. appends the 7 Tier B regions (eu_b, na_b, ...) to config.real so the game builds their teams/players itself,
//  2. after generation tags every team (tier, homeRegion) and moves the *_b regions out of state.regions into
//     state.tierB, so the game's Tier A competition code (Opens, Majors, shadow events, Worlds) never sees them.
// Tier B teams stay in state.teams, so transfers, training, scouting and stats can use them.
const path = require('path');
const L = require('./btier-loader');
const { createSeason } = require('./btier-season');
const { createPromotion } = require('./btier-promotion');
const { createReserve } = require('./btier-reserve');

const NAMES = { eu: 'Europe', na: 'North America', sam: 'South America', oce: 'Oceania', mena: 'Middle East & North Africa', apac: 'Asia-Pacific', ssa: 'Sub-Saharan Africa' };
const isB = (id) => typeof id === 'string' && /_b$/.test(id);

// Build game-format regions from btier-teams.json, skipping Tier A name clashes (dynamic check).
function tierBRegions(real, file) {
  const { teams, reserve, dropped } = L.loadTeams(real, file);
  const regions = L.REGIONS.map((id) => ({
    id: id + '_b',
    name: NAMES[id] + ' B',
    short: id.toUpperCase() + ' B',
    teams: teams.filter((t) => t.homeRegion === id).map((t) => ({
      name: t.name,
      strength: Math.round(t.players.reduce((a, p) => a + p.baseStrength, 0) / t.players.length),
      players: t.players.map((p) => ({ name: p.name, age: p.age, born: p.born, nation: p.nation, baseStrength: p.baseStrength }))
    }))
  })).filter((r) => r.teams.length);
  return { regions, reserve, dropped };
}

// Idempotent: safe to call on a state that is already tagged.
function tagState(state, tierBIds) {
  const removed = (state.regions || []).filter((r) => isB(r.id));
  state.regions = (state.regions || []).filter((r) => !isB(r.id));
  state.tierB = { regions: removed.length ? removed : (state.tierB && state.tierB.regions) || [], version: 1 };
  for (const t of state.teams || []) {
    if (isB(t.region)) { t.tier = 'B'; t.homeRegion = t.region.slice(0, -2); } else if (!t.tier) t.tier = 'A';
  }
  return state;
}

// Residency ("one import per roster") compares a player's home region (eu) with the club's region id (eu_b), so a Tier B club
// would see its whole squad as imports and could never sign anyone. syncHomes keeps the comparison meaningful for both tiers:
//  - base home = the real region (eu), never the *_b id (so a Tier A club does not see Tier B players as foreign);
//  - a player on a Tier B club of his own home region is a resident of that club (home = eu_b);
//  - a player the user is negotiating for counts as a resident for the user's club (the game re-checks residency when the deal completes).
// Cheap (one pass), idempotent, run at generation, before the user's transfer calls and every game day.
function syncHomes(state) {
  const teams = new Map((state.teams || []).map((t) => [t.id, t]));
  const me = teams.get(state.userTeamId);
  const live = new Set(['pending', 'fee_accepted', 'awaiting_player']);
  const pending = new Set((state.offersOut || []).filter((o) => live.has(o.status)).map((o) => o.playerId));
  const meHome = me && me.region ? me.region.replace(/_b$/, '') : null;
  for (const p of state.players || []) {
    if (typeof p.home !== 'string') continue;
    const base = isB(p.home) ? p.home.slice(0, -2) : p.home;
    const t = p.teamId >= 0 ? teams.get(p.teamId) : null;
    let h = base;
    if (t && isB(t.region) && base === t.region.slice(0, -2)) h = t.region;
    if (pending.has(p.id) && me && base === meHome) h = me.region;
    p.home = h;
  }
}

// Spec: Tier B players start at 55-68 OVR. The game's makeRealPlayer adds a random -3..+3 to the data value, so the three data
// players of every Tier B club are set back to their exact baseStrength. (The game's own extra academy player is left alone.)
function pinRatings(state, engine, real, file) {
  const byName = new Map(L.loadTeams(real, file).teams.map((t) => [t.name, t]));
  for (const t of state.teams || []) {
    if (t.tier !== 'B') continue;
    const d = byName.get(t.name);
    if (!d) continue;
    for (const id of t.playerIds) {
      const p = engine.playerById(state, id);
      const dp = p && d.players.find((x) => x.name === p.name);
      if (!dp) continue;
      p.rating = dp.baseStrength;
      if (p.ratingExact != null) p.ratingExact = dp.baseStrength;
      if (p.potential != null && p.potential < p.rating) p.potential = p.rating;
    }
  }
}

// Tier B finances. The game derives a club's start budget / worth from its strength alone, so every Tier B club (strength 55-68)
// landed on the same few values, some above weak Tier A clubs. Each Tier B club now gets a share (20%-90%) of the region's
// WEAKEST Tier A club, from its quality (avg player rating) plus a stable per-club spread (hash of the name). Used for both the
// new-career club list (budget + worth) and the career itself (budget), so both screens agree.
const hash01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return (h % 10007) / 10007; };
const shareFor = (name, strength) => {
  const q = Math.min(1, Math.max(0, ((Number(strength) || 55) - 55) / 13));
  return 0.2 + 0.7 * (0.6 * q + 0.4 * hash01(name));
};
const roundTo = (v, step) => Math.round(v / step) * step;
const tierBBudget = (name, strength, refBudget) => { const v = Math.max(5000, shareFor(name, strength) * refBudget); return roundTo(v, v < 50000 ? 500 : 1000); };
const tierBWorth = (name, strength, refWorth) => Math.max(20000, roundTo(shareFor(name, strength) * refWorth, refWorth < 400000 ? 5000 : 10000));

function applyBudgets(state, real, file) {
  const data = new Map(L.loadTeams(real, file).teams.map((t) => [t.name, t]));
  const minA = {};
  for (const t of state.teams || []) if (t.tier !== 'B' && t.region) minA[t.region] = Math.min(minA[t.region] == null ? Infinity : minA[t.region], t.budget);
  for (const t of state.teams || []) {
    if (t.tier !== 'B') continue;
    const d = data.get(t.name);
    if (!d) continue;
    const avg = d.players.reduce((a, p) => a + p.baseStrength, 0) / d.players.length;
    t.budget = tierBBudget(t.name, Math.round(avg), Math.max(20000, minA[t.homeRegion] || 20000));
  }
}

function wrapEngine(engine, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.__btier || typeof engine.generateLeague !== 'function') return engine;
  const season = opts.events ? createSeason(engine, opts.events, { log }) : null; // needs the game's events.js
  if (!season) log('btier: events module not available, B-Tier Cups disabled');
  const promo = season ? createPromotion(engine, opts.events, season, { log }) : null;
  const reserve = createReserve(engine, { log });
  const safe = (what, fn) => { try { fn(); } catch (e) { log('btier: ' + what + ' failed: ' + e.stack); } };

  const original = engine.generateLeague;
  engine.generateLeague = function generateLeagueWithTierB(config, rand) {
    let cfg = config;
    let reserveTeams = [];
    try {
      if (config && config.real && Array.isArray(config.real.regions)) {
        const b = tierBRegions(config.real, opts.file);
        if (b.dropped.length) log('btier: dropped ' + b.dropped.length + ' teams: ' + b.dropped.map((d) => d.team + ' (' + d.why + ')').join(', '));
        reserveTeams = b.reserve || [];
        if (b.regions.length) cfg = { ...config, real: { ...config.real, regions: [...config.real.regions, ...b.regions] } };
      }
    } catch (e) { log('btier: could not add Tier B teams, continuing without: ' + e.stack); cfg = config; }
    const state = original.call(this, cfg, rand);
    safe('tagging', () => { if (cfg !== config) tagState(state); });
    safe('homes', () => syncHomes(state));
    safe('reserve', () => { if (cfg !== config) reserve.init(state, reserveTeams); });
    safe('ratings', () => { if (cfg !== config) pinRatings(state, engine, config.real, opts.file); });
    safe('budgets', () => { if (cfg !== config) applyBudgets(state, config.real, opts.file); });
    if (season) safe('cup planning', () => season.initSeason(state));
    if (season && isB(state.userRegion)) safe('redraw first events', () => promo.redraw(state));
    return state;
  };

  if (season) engine.tierBStandings = (state, region, yr) => season.standings(state, region, yr); // read-only, for the UI phase

  if (season && typeof engine.advance === 'function') {
    const advance = engine.advance;
    // The game's advance() can skip up to 200 days in one call; Tier B cups need to be looked at every day,
    // so for careers with Tier B we step one day at a time (processDailyEvents is idempotent per date).
    engine.advance = function advanceWithTierB(state, rand, mode) {
      if (!state || !state.tierB || !state.tierB.cups) return advance.apply(this, arguments);
      safe('cup step', () => season.step(state));
      const days = mode === 'next' ? 200 : 1;
      let r = { stopped: 'day' };
      let gate = 0;
      for (let i = 0; i < days; i++) {
        safe('homes', () => syncHomes(state));
        r = advance.call(this, state, rand, 'day');
        safe('cup step', () => season.step(state));
        // Season-end gate: the game says the season is over, but the promotion playoffs must be played first.
        // The game does not move the date at season end, so we do (its next advance then plays the due playoff fixtures).
        if (r.stopped === 'season-end' && promo.pending(state)) {
          safe('promotion playoff', () => promo.step(state));
          if (promo.pending(state)) {
            const t = new Date(state.currentDate + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
            state.currentDate = t.toISOString().slice(0, 10);
            r = { stopped: 'day' };
            if (++gate < 30 && i === days - 1) i--; // keep going until the playoffs are over or the user has a match (30-day safety stop)
            continue;
          }
        }
        if (r.stopped !== 'day') break;
      }
      return r;
    };
  }

  if (season && typeof engine.startNextSeason === 'function') {
    const next = engine.startNextSeason;
    engine.startNextSeason = function startNextSeasonWithTierB(state, rand) {
      const prev = state.season;
      const r = next.apply(this, arguments);
      safe('season roll', () => season.rollSeason(state));
      // after the roll: the game's archive/ranking used the old divisions, the new season's events draw their fields later
      if (state.season !== prev) safe('promotion transition', () => promo.transition(state, prev));
      if (state.season !== prev) safe('reserve pool', () => reserve.seasonEnd(state));
      return r;
    };
  }

  // New-career screen: list the Tier B clubs as extra regions (eu_b, ...). The UI switch (src/ui/tier-ui.js) shows them under TIER B.
  if (typeof engine.clubPreview === 'function') {
    const preview = engine.clubPreview;
    engine.clubPreview = function clubPreviewWithTierB(real) {
      const list = preview.apply(this, arguments);
      try {
        if (!real || !Array.isArray(real.regions)) return list;
        const b = tierBRegions(real, opts.file).regions;
        if (!b.length) return list;
        const refs = {};
        for (const r of list) refs[r.id] = { budget: Math.min(...r.clubs.map((c) => c.budget)), worth: Math.min(...r.clubs.map((c) => c.worth)) };
        return list.concat(preview.call(this, { ...real, regions: b }).map((r) => {
          const ref = refs[r.id.replace(/_b$/, '')] || { budget: 20000, worth: 500000 };
          return { ...r, tier: 'B', clubs: r.clubs.map((c) => ({ ...c, budget: tierBBudget(c.name, c.strength, Math.max(20000, ref.budget)), worth: tierBWorth(c.name, c.strength, ref.worth) })) };
        }));
      } catch (e) { log('btier: club list without Tier B: ' + e.stack); return list; }
    };
  }

  // After the user finishes a cup match the game hands over the next series at once (nextUserSeries does this for its own
  // events by looking the fixture's event up in state.events). Cup and promotion matches are not in state.events, so the
  // same chaining is done here: read the result, open the next round, and run days until the user's next match in the same
  // cup/playoff (or until they are out / it is over). Without this the user had to skip a day after every match.
  if (season && typeof engine.nextUserSeries === 'function') {
    const next = engine.nextUserSeries;
    const ownerOf = (state, fx) => {
      const tb = state.tierB;
      if (fx.cupId != null) { const c = (tb.cups || []).find((x) => x.id === fx.cupId); return c ? { done: () => c.stage === 'done', slots: c.slots } : null; }
      if (fx.promoId != null && tb.promo) { const pl = Object.values(tb.promo.regions || {}).find((x) => x.id === fx.promoId); return pl ? { done: () => pl.stage === 'done', slots: pl.slots } : null; }
      return null;
    };
    const mine = (state, f) => f && (f.homeId === state.userTeamId || f.awayId === state.userTeamId);
    engine.nextUserSeries = function nextUserSeriesWithTierB(state, rand, fixtureId) {
      const fx = state && state.tierB ? engine.fixtureById(state, fixtureId) : null;
      const own = fx && (fx.cupId != null || fx.promoId != null) ? ownerOf(state, fx) : null;
      if (!own) return next.apply(this, arguments);
      const same = (f) => f && f.cupId === fx.cupId && f.promoId === fx.promoId;
      const dueToday = () => state.fixtures.find((f) => !f.played && same(f) && mine(state, f) && f.date <= state.currentDate) || null;
      for (let i = 0; i < 14; i++) {
        safe('cup step', () => season.step(state));
        if (fx.promoId != null) safe('promotion playoff', () => promo.step(state));
        const due = dueToday();
        if (due) return due;
        if (own.done() || opts.events.teamEliminated(own.slots || [], state.userTeamId)) return null;
        const r = engine.advance(state, rand, 'day');
        if (r.stopped === 'matchday') { const f = engine.fixtureById(state, r.fixtureId); return same(f) ? f : null; }
        if (r.stopped !== 'day') return null;
      }
      return null;
    };
  }

  // A Tier B manager plays the B-Tier Cups (our own fixtures). The game's own "user region" Open would otherwise be a second,
  // duplicate tournament for the Tier B teams, so while the engine runs, the user region is the Tier A home region: the Opens
  // are the Tier A Opens (simulated, the user is not in them). Restored right after, so every other screen sees the real region.
  const asHome = (name) => {
    const fn = engine[name];
    if (typeof fn !== 'function') return;
    engine[name] = function homeRegionWrapped(state) {
      const ur = state && state.userRegion;
      if (!isB(ur) || !state.tierB) return fn.apply(this, arguments);
      state.userRegion = ur.slice(0, -2);
      try { return fn.apply(this, arguments); } finally { state.userRegion = ur; }
    };
  };
  if (season) ['advance', 'nextUserSeries', 'progressEvents'].forEach(asHome);

  // The user's own transfer calls: sync homes first; makeOffer also treats the target as a resident of the user's club for the call
  // (the deal is "pending" from then on, so syncHomes keeps it that way until it completes).
  const userCall = (name) => {
    const fn = engine[name];
    if (typeof fn !== 'function') return;
    engine[name] = function userTransferCall(state) {
      if (!state || !state.tierB) return fn.apply(this, arguments);
      safe('homes', () => syncHomes(state));
      let p = null; let was;
      if (name === 'makeOffer') {
        const me = state.teams.find((t) => t.id === state.userTeamId);
        p = state.players.find((q) => q.id === arguments[1]);
        if (p && me && typeof p.home === 'string' && p.home.replace(/_b$/, '') === me.region.replace(/_b$/, '')) { was = p.home; p.home = me.region; } else p = null;
      }
      try { return fn.apply(this, arguments); } finally { if (p) p.home = was; }
    };
  };
  if (season) ['makeOffer', 'contractInfo', 'attemptContract', 'respondOfferIn', 'counterOfferIn', 'signComeback', 'bestFreeAgent'].forEach(userCall);

  // Group tables of the user's Tier B cups for the UI (the game builds them for state.events only).
  if (season && typeof engine.groupTables === 'function' && typeof engine.groupTable === 'function') {
    const gt = engine.groupTables;
    engine.groupTables = function groupTablesWithCups(state) {
      const out = gt.apply(this, arguments);
      try {
        const tb = state && state.tierB;
        if (!tb || !tb.cups) return out;
        const mine = /_b$/.test(state.userRegion || '') ? state.userRegion : (state.userRegion || '') + '_b';
        const fx = new Map((state.fixtures || []).map((f) => [f.id, f]));
        for (const c of tb.cups) {
          if (c.region !== mine || !(c.groups || []).length) continue;
          out[c.id] = {};
          for (const g of c.groups) out[c.id][g.prefix] = engine.groupTable(state, c, g, fx);
        }
      } catch (e) { log('btier: group tables for cups failed: ' + e.stack); }
      return out;
    };
  }

  engine.__btier = true;
  return engine;
}

module.exports = { tierBBudget, tierBWorth, syncHomes, wrapEngine, tierBRegions, tagState, isB };
