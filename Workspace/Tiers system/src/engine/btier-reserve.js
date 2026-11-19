'use strict';
// Reserve pool for Tier B. Per region the database holds 32 teams; 16 are active, the other 16 live ONLY in state.tierB.reserve
// (plain data: never in state.teams / state.players, so they are invisible to transfers, scouting, standings and ageing).
//  - orgs:  the first ORG_POOL reserve teams of a region = replacement organisations.
//  - youth: the players of the remaining reserve teams = prospects, youngest first. Their age is stored as a fixed number and is
//           only used when they enter the game, so waiting in the pool never ages them.
// At every season rollover (after promotion/relegation): per region a random active Tier B team may fold and is replaced IN PLACE
// by a never-used reserve organisation (same team id, so standings/fixtures/ranking structures stay valid), and 4-5 prospects
// join the free-agent market. Everything is seeded from the career, so a save plays out the same way.
const L = require('./btier-loader');

const ORG_POOL = 8;
const FOLD_CHANCE = 0.35;
const SOURCES = ['Rocket Wire', 'The Boost Report', 'Arena Daily', 'Kickoff Central', 'Aerial View']; // same wires the game uses for its news
const LIVE_OFFER = new Set(['pending', 'fee_accepted', 'awaiting_player']);

const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const keyOf = (name) => L.nameKeys(name)[0];
const nameOk = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// teams: flat list of reserve teams from loadTeams().reserve; active: names of the teams that start in the game.
function buildReserve(teams, active) {
  const orgs = {}; const youth = {};
  for (const r of L.REGIONS) {
    const list = teams.filter((t) => t.homeRegion === r);
    orgs[r] = list.slice(0, ORG_POOL).map((t) => ({ name: t.name, players: t.players.map((p) => ({ name: p.name, nation: p.nation, age: p.age, baseStrength: p.baseStrength })) }));
    youth[r] = list.slice(ORG_POOL).flatMap((t) => t.players.map((p) => ({ name: p.name, nation: p.nation, age: p.age, baseStrength: p.baseStrength })))
      .map((p, i) => ({ p, i })).sort((a, b) => a.p.age - b.p.age || a.i - b.i).map((x) => x.p);
  }
  return { version: 1, orgs, youth, introduced: active.map(keyOf), lastSeason: null, events: [] };
}

function createReserve(engine, opts = {}) {
  const log = opts.log || (() => {});

  function init(state, reserveTeams) {
    const tb = state.tierB;
    if (!tb || tb.reserve) return;
    const active = (state.teams || []).filter((t) => t.tier === 'B').map((t) => t.name);
    tb.reserve = buildReserve(reserveTeams || [], active);
  }

  const news = (state, headline, body, extra) => {
    (state.news = state.news || []).unshift({
      id: state.nextId++, date: state.currentDate, source: SOURCES[hash(headline) % SOURCES.length], writer: 'Newsdesk',
      category: 'transfer', data: { kind: 'btier-fold' }, headline, body, ...extra
    });
  };

  // Rating-matched wage/economy flag copied from an existing Tier B player (the game's wage formula is not exported).
  function calibrate(state, p) {
    let best = null;
    for (const q of state.players) if (q.econ && !q.retired && q.teamId >= 0 && (!best || Math.abs(q.rating - p.rating) < Math.abs(best.rating - p.rating))) best = q;
    if (best) { p.econ = best.econ; p.wage = best.wage; }
  }

  let nextPid = null;
  const newPlayer = (state, d, teamId, region, free) => {
    if (nextPid == null || nextPid <= state.players.reduce((m, q) => Math.max(m, q.id), -1)) nextPid = state.players.reduce((m, q) => Math.max(m, q.id), -1) + 1;
    const potential = Math.min(80, d.baseStrength + Math.max(3, (23 - d.age) * 2));
    const p = engine.makeCustomPlayer({ name: d.name, age: d.age, rating: d.baseStrength, potential, nation: d.nation }, { id: nextPid++, teamId, used: new Set() });
    delete p.custom; // plain real-style player like the Tier B data players
    p.real = true; p.home = region;
    if (free) { p.freeAgent = true; p.contractSeasons = 0; } else p.contractSeasons = 1 + (hash(d.name) % 3);
    calibrate(state, p);
    state.players.push(p);
    return p;
  };

  // Replace `team` by `org` in place. The old squad goes to the free-agent market, the new club gets budget/colours/abbrev.
  function replace(state, team, org, regionId) {
    const old = team.name;
    for (const id of team.playerIds) {
      const p = engine.playerById(state, id);
      if (p) { p.teamId = -1; p.freeAgent = true; p.contractSeasons = 0; p.wantsOut = false; p.refusing = false; }
    }
    (team.formerNames = team.formerNames || []).push({ name: old, season: state.season - 1 });
    team.name = org.name; team.custom = undefined; team.logo = null;
    team.colors = engine.clubColors(org.name);
    const taken = new Set(state.teams.filter((t) => t !== team).map((t) => t.abbrev));
    const letters = org.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    let ab = letters.slice(0, 3) || 'TBB'; for (let i = 3; taken.has(ab) && i < letters.length; i++) ab = letters.slice(0, 2) + letters[i];
    team.abbrev = ab;
    team.playerIds = org.players.map((d) => newPlayer(state, d, team.id, regionId, false).id);
    team.lineup = team.playerIds.slice(0, 3);
    team.followers = Math.round((team.followers || 1000) * 0.6);
    const avg = Math.round(org.players.reduce((a, d) => a + d.baseStrength, 0) / org.players.length);
    const refs = state.teams.filter((t) => t.tier !== 'B' && t.region === regionId).map((t) => t.budget);
    team.budget = require('./btier-state').tierBBudget(org.name, avg, Math.max(20000, Math.min(...refs, Infinity) || 20000));
    const tb = state.tierB; const rid = regionId + '_b';
    if (tb.lastRanking && tb.lastRanking[rid]) delete tb.lastRanking[rid][team.id];
    if (tb.ranking && tb.ranking[rid]) delete tb.ranking[rid][team.id];
    return old;
  }

  function seasonEnd(state) {
    const tb = state.tierB; const R = tb && tb.reserve;
    if (!R || R.lastSeason === state.season) return;
    R.lastSeason = state.season; // first: never run twice for a season, even if something below throws
    const moved = new Set(); // clubs that just changed division keep their place this season
    for (const m of (tb.moves || []).filter((x) => x.season === state.season - 1)) [...m.promoted, ...m.relegated].forEach((id) => moved.add(id));
    const busy = new Set([...(state.offersOut || []).filter((o) => LIVE_OFFER.has(o.status)).map((o) => o.playerId), ...(state.pendingDeals || []).map((d) => d.playerId)]);
    const names = new Set(state.players.map((p) => nameOk(p.name)));
    const clubs = new Set(state.teams.map((t) => keyOf(t.name)));

    for (const r of tb.regions) {
      const id = r.id.replace(/_b$/, '');
      const rand = rng(hash(`${state.startDate || ''}|${state.season}|${id}`));
      // 1. a team may cease operations
      const orgs = (R.orgs[id] || []).filter((o) => o.players.length === L.PLAYERS_PER_TEAM && !R.introduced.includes(keyOf(o.name)) && !clubs.has(keyOf(o.name)));
      const folding = state.teams.filter((t) => t.region === r.id && t.id !== state.userTeamId && !moved.has(t.id) && !t.playerIds.some((p) => busy.has(p)));
      if (orgs.length && folding.length && rand() < FOLD_CHANCE) {
        const team = folding[Math.floor(rand() * folding.length)];
        const org = orgs[Math.floor(rand() * orgs.length)];
        R.orgs[id] = R.orgs[id].filter((o) => o !== org);
        R.introduced.push(keyOf(org.name)); clubs.add(keyOf(org.name));
        const old = replace(state, team, org, id);
        R.events.push({ season: state.season, region: r.id, teamId: team.id, left: old, joined: org.name });
        news(state, `${old} cease operations`, `${old} have withdrawn from ${r.name} competition and left the Tier B scene. ${org.name} have been admitted to take their place for the new season; the former ${old} players are free agents.`, { teamId: team.id });
        log(`btier: ${r.id}: ${old} folded, replaced by ${org.name}`);
      }
      // 2. 4-5 prospects arrive on the free-agent market (aged from now on, not before)
      const n = 4 + (rand() < 0.5 ? 1 : 0);
      const youth = R.youth[id] || [];
      const taken = [];
      while (taken.length < n && youth.length) {
        const d = youth.shift();
        if (names.has(nameOk(d.name))) continue; // a namesake is already in the game: this prospect is dropped for good
        taken.push(d); names.add(nameOk(d.name));
      }
      for (const d of taken) newPlayer(state, d, -1, id, true);
      if (taken.length) R.events.push({ season: state.season, region: r.id, prospects: taken.map((d) => d.name) });
      else log(`btier: ${r.id}: youth pool is empty`);
    }
  }

  return { init, seasonEnd };
}

module.exports = { createReserve, buildReserve, ORG_POOL, FOLD_CHANCE };
