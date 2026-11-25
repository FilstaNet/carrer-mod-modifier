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
const academy = require('./academy');

const NAMES = L.NAMES;
const isB = (id) => typeof id === 'string' && /_b$/.test(id);

// Build game-format regions from btier-teams.json, skipping Tier A name clashes (dynamic check).
function tierBRegions(real, file) {
  const { teams, reserve, dropped } = L.loadTeams(real, file);
  const regions = L.REGIONS.map((id) => ({
    id: id + '_b',
    name: NAMES[id] + ' B',
    short: id.toUpperCase() + ' B',
    teams: teams.filter((t) => t.homeRegion === id).map(({ players, tier, homeRegion, region, needsVerification, source, ...extra }) => ({
      ...extra, // World-editor edits (baseName, new tag / colours / logo ...) ride along; the shipped data has none
      name: extra.name,
      strength: Math.round(players.reduce((a, p) => a + p.baseStrength, 0) / players.length),
      players: players.map((p) => (p.custom ? { ...p } : { name: p.name, age: p.age, born: p.born, nation: p.nation, baseStrength: p.baseStrength }))
    }))
  })).filter((r) => r.teams.length);
  return { regions, reserve, dropped };
}

// The 16 extra Tier A clubs per region (atier-extra-teams.json) join the game's own 16, so a region has 32. Returns a copy of `real` with them added;
// regions that are not in the extra file (or a `real` that already carries them) are left alone.
function withExtraA(real) {
  if (!real || !Array.isArray(real.regions) || real.__extraA) return real;
  const extra = L.loadExtraA(real);
  const toGame = ({ players, tier, homeRegion, region, needsVerification, source, ...rest }) => ({
    ...rest, name: rest.name, strength: Math.round(players.reduce((a, p) => a + p.baseStrength, 0) / players.length),
    players: players.map((p) => ({ name: p.name, age: p.age, born: p.born, nation: p.nation, baseStrength: p.baseStrength }))
  });
  const out = { ...real, __extraA: true, regions: real.regions.map((r) => (L.REGIONS.includes(r.id) ? { ...r, teams: [...r.teams, ...extra.filter((t) => t.homeRegion === r.id).map(toGame)] } : r)) };
  return out;
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
let baseHomeOf = null; // the game's own homeOf: gives players without a stored home (free agents, nationals) their region
function syncHomes(state) {
  const teams = new Map((state.teams || []).map((t) => [t.id, t]));
  const me = teams.get(state.userTeamId);
  const live = new Set(['pending', 'fee_accepted', 'awaiting_player']);
  const pending = new Set((state.offersOut || []).filter((o) => live.has(o.status)).map((o) => o.playerId));
  for (const r of state.pendingReplies || []) if (r.kind === 'contract' && r.data && r.data.playerId != null) pending.add(r.data.playerId); // a free agent's contract talk: the game checks residency when the reply comes (days later)
  const meHome = me && me.region ? me.region.replace(/_b$/, '') : null;
  for (const p of state.players || []) {
    if (typeof p.home !== 'string') {
      // a signed / pending player without a stored home (a free agent of Scottish nationality, say) would count as an import for a Tier B club
      if (!baseHomeOf || (p.teamId !== state.userTeamId && p.teamId >= 0 && !pending.has(p.id))) continue; // free agents get theirs too (the player search lists them by region)
      const g = baseHomeOf(state, p); if (typeof g !== 'string') continue;
      p.home = g;
    }
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
  const extra = L.loadExtraA(real);
  const byName = new Map([...L.loadTeams(real, file).teams, ...extra].map((t) => [t.name, t])); // Tier B clubs and the extra Tier A clubs
  const extraPlayer = new Map(extra.flatMap((t) => t.players.map((p) => [p.name, t]))); // an extra club renamed in the World editor is found by its players
  for (const t of state.teams || []) {
    const d = byName.get(t.name) || (t.tier !== 'B' ? extraPlayer.get((engine.playerById(state, t.playerIds[0]) || {}).name) : null);
    if (!d) continue;
    for (const id of t.playerIds) {
      const p = engine.playerById(state, id);
      const dp = p && d.players.find((x) => x.name === p.name);
      if (!dp) continue;
      p.rating = dp.baseStrength;
      if (p.ratingExact != null) p.ratingExact = dp.baseStrength;
      p.potential = spreadPotential(p.name, p.rating, p.age);
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
// Stable per-player potential with a wide spread (about rating+0 .. +25, a few "wonderkids" up to 90) instead of the game's narrow rating+2..+12.
// Older players have little room left; the hash makes it the same every time for the same name.
const spreadPotential = (name, rating, age) => {
  const u = hash01(String(name) + '|pot'), w = hash01(String(name) + '|kid');
  const room = age >= 26 ? Math.round(u * 4) : age >= 23 ? 1 + Math.round(u * 9) : 3 + Math.round(u * 16) + (w < 0.15 ? 5 + Math.round(w * 40) : 0);
  return Math.max(rating, Math.min(90, Math.round(rating) + room));
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
    if (t.id === state.userTeamId && state.seasonStart) state.seasonStart.budget = t.budget; // the game took its "money kept" baseline before this rescale
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

  safe('facilities', () => require('./ux-facilities').install(engine, { log }));
  safe('swiss stage', () => require('./ux-swiss').install(engine, { log })); // innermost wrapper: holds Opens and hides non-qualifiers around the game's own calls
  if (opts.events) safe('club systems', () => require('./ux-club').install(engine, opts.events, { log })); // before advance is captured below
  if (opts.events) safe('scrims', () => require('./ux-scrims').install(engine, opts.events, { log })); // needs the club hooks (calendar, 2v2 / 1v1 lineups)
  safe('late core', () => require('./late-core').install(engine, { log })); // late game (Tier A only); after club + scrims, before advance is captured below
  safe('late build', () => require('./late-build').install(engine, { log })); // facility tree (needs late core above)
  safe('late effects', () => require('./late-effects').install(engine, { log })); // what the buildings do (needs late build above)
  safe('late host', () => require('./late-host').install(engine, { log })); // own cup series (needs late build and the club systems above)
  safe('late bids', () => require('./late-bids').install(engine, { log })); // bids to host official events (needs late host above)
  safe('late legacy', () => require('./late-legacy').install(engine, { log })); // Hall of Fame, records, rival history, Museum (needs late build above)
  safe('late manager', () => require('./late-manager').install(engine, { log })); // the manager's own career record (clubs led, trophies, milestones); works for Tier B too
  if (opts.events) safe('awards + titles', () => require('./ux-awards').install(engine, opts.events, { log, titles: opts.titles }));
  if (opts.events) safe('kick-off + EWC', () => require('./ux-majors').install(engine, opts.events, { log }));
  if (opts.events) safe('series length', () => require('./btier-series').install(engine, opts.events, { log })); // keeps cups and Swiss in step with the setting
  const original = engine.generateLeague;
  engine.generateLeague = function generateLeagueWithTierB(config, rand) {
    if (config && config.real) config = { ...config, real: withExtraA(config.real) };
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
    safe('staff', () => { if (cfg !== config && engine.uxClub) engine.uxClub.staff.fixStart(state); }); // Tier B start: 1 scout and a wage budget that fits
    if (season) safe('cup planning', () => season.initSeason(state));
    if (season && isB(state.userRegion)) safe('redraw first events', () => promo.redraw(state));
    return state;
  };

  if (season) engine.tierBStandings = (state, region, yr) => season.standings(state, region, yr); // read-only, for the UI phase
  if (season) engine.tierBPromoGroup = (state, pl) => promo.groupTable(state, pl); // read-only, promotion playoff group table

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
        safe('promotion group', () => promo.early(state));
        safe('mid-season prospects', () => reserve.midSeason(state));
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
      real = withExtraA(real);
      const list = preview.call(this, real);
      const extraNames = new Set(L.loadExtraA(real).map((t) => t.name)); // the extra Tier A clubs have no game logo, but crests are looked up by name (btier:)
      for (const r of list) for (const c of r.clubs || []) if (extraNames.has(c.name) && !c.logo) c.logo = 'btier:' + c.name;
      try {
        if (!real || !Array.isArray(real.regions)) return list;
        const b = tierBRegions(real, opts.file).regions;
        if (!b.length) return list;
        const refs = {};
        for (const r of list) refs[r.id] = { budget: Math.min(...r.clubs.map((c) => c.budget)), worth: Math.min(...r.clubs.map((c) => c.worth)) };
        return list.concat(preview.call(this, { ...real, regions: b }).map((r) => {
          const ref = refs[r.id.replace(/_b$/, '')] || { budget: 20000, worth: 500000 };
          return { ...r, tier: 'B', clubs: r.clubs.map((c) => ({ ...c, tier: 'B', logo: c.logo || 'btier:' + c.name, budget: tierBBudget(c.name, c.strength, Math.max(20000, ref.budget)), worth: tierBWorth(c.name, c.strength, ref.worth) })) };
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
      // the player being approached: a bid (makeOffer) or a free-agent signing (contractInfo / attemptContract 'free')
      const pid = name === 'makeOffer' ? arguments[1] : (name === 'contractInfo' || name === 'attemptContract') && arguments[1] === 'free' ? arguments[2] : null;
      if (pid != null) {
        const me = state.teams.find((t) => t.id === state.userTeamId);
        p = state.players.find((q) => q.id === pid);
        if (p && typeof p.home !== 'string' && baseHomeOf) { const g = baseHomeOf(state, p); if (typeof g === 'string') p.home = g; }
        if (p && me && typeof p.home === 'string' && p.home.replace(/_b$/, '') === me.region.replace(/_b$/, '')) { was = p.home; p.home = me.region; } else p = null;
      }
      // sync again afterwards: a deal that completed inside this call must show the signing as a resident at once (profile + next signing)
      try { return fn.apply(this, arguments); } finally { if (p) p.home = was; safe('homes', () => syncHomes(state)); }
    };
  };
  if (season) ['makeOffer', 'contractInfo', 'attemptContract', 'respondOfferIn', 'counterOfferIn', 'signComeback', 'bestFreeAgent'].forEach(userCall);

  // The player profile compares a player's home (engine.homeOf, read through the export) with the user's club region. A Tier B club's
  // region is "mena_b" while its residents live in "mena" (and the other way round for Tier A), so a home in the club's own region
  // group is shown as the club's region: no false "he would be your import".
  if (season && typeof engine.homeOf === 'function') {
    const homeOf = engine.homeOf; baseHomeOf = homeOf;
    engine.homeOf = function homeOfWithTiers(state) {
      const h = homeOf.apply(this, arguments);
      try {
        const me = state && state.tierB ? state.teams.find((t) => t.id === state.userTeamId) : null;
        if (me && typeof h === 'string' && h !== me.region && h.replace(/_b$/, '') === me.region.replace(/_b$/, '')) return me.region;
      } catch (e) { /* keep the game's answer */ }
      return h;
    };
  }

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

  if (season) safe('tier B board', () => require('./btier-board').install(engine, { log }));
  safe('academy', () => academy.wrap(engine, log));
  engine.__btier = true;
  if (opts.bets !== false) safe('betting markets', () => require('./ux-bets').wrap(engine, { log }));
  if (opts.social !== false) safe('social (Y feed)', () => require('./ux-social').wrap(engine, { log, brandsFile: opts.brandsFile })); // outermost advance wrapper
  return engine;
}

module.exports = { withExtraA, spreadPotential, tierBBudget, tierBWorth, syncHomes, wrapEngine, tierBRegions, tagState, isB };
