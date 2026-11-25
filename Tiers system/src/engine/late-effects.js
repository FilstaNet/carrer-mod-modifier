'use strict';
// Late game phase 1b (LateGamePlan.md section 4.3): what each building DOES. Reads late.build.effect(state, id), which is 0 while a building is
// unbuilt, mothballed (Tier B) or half-strength on unpaid upkeep, so nothing here needs its own gate.
// b1 revenue and fans (Arena, Fan Zone). b2 Streaming Studio (bigger media offers). b3 development (Academy training boost, Scouting speed, Wellbeing:
// shorter injuries/illness, slower decline). b4 Analytics Lab match edge (read by ux-club.js applyChem).
// All rates are placeholders until the balance run (tools/late-sim.js).
const ARENA_GATE = 40e3; // monthly gate income per effective level (real economy)
const MERCH_RATE = 25e3; // monthly merch income per effective level (real economy)
const STUDIO_FEE = 0.1; // media offer fee bonus per effective Studio level
const ACADEMY_BOOST = 0.1; // academy training sessions: +10% per effective Academy Campus level (read by academy.js facBoost)
const SCOUT_SPEED = 0.08; // scouting jobs are 8% shorter per effective Scouting Network level (level 5 = -40%)
const ABSENCE_CUT = 0.1; // injuries and illness are 10% shorter per effective Wellbeing level (level 5 = -50%)
const DECLINE_CUT = 0.08; // rating lost at a season rollover is 8% smaller per effective Wellbeing level (level 5 = x0.6)
const EDGE_PER_LEVEL = 0.3; // Analytics Lab: rating points added to the user's core players in matches, per effective level
const EDGE_CAP = 3; // plan 4.7: chemistry plus Analytics Lab together never add more than +3 rating points
const HUNGER_TOP = 4; // rival hunger (plan 4.8): the biggest AI clubs (by followers, not Tier B) get a monthly top-up
const HUNGER_PER_TITLE = 15e3; // per distinct major/worlds/regional title held by the user's players, per mode hunger step (real economy)
const CRISIS_CHANCE = 0.08; // monthly chance of one crisis, times mode crises (Relaxed 0, Standard 1, Ruthless 2); Wellbeing cuts it 10% per level
const FOLLOWER_GROWTH = { arena: 0.002, fanzone: 0.003 }; // monthly follower growth per effective level, as a share of current followers

function install(engine, opts = {}) {
  const late = engine && engine.uxLate, B = late && late.build;
  if (!B) return null;
  if (late.effects) return late.effects;
  const log = opts.log || (() => {});
  const econ = (state) => (state.economy === 'real' ? 1 : 35);

  // monthly: gate and merch income as ledger lines, followers grow. Runs only while the gate is open (late.tick), so Tier B pays and earns nothing.
  function monthly(state) {
    const t = engine.teamById(state, state.userTeamId); if (!t) return;
    const arena = B.effect(state, 'arena'), fan = B.effect(state, 'fanzone');
    if (arena > 0) late.earn(state, arena * ARENA_GATE * econ(state), 'Arena gate income');
    if (fan > 0) late.earn(state, fan * MERCH_RATE * econ(state), 'Fan Zone merchandise');
    const grow = arena * FOLLOWER_GROWTH.arena + fan * FOLLOWER_GROWTH.fanzone;
    if (grow > 0) t.followers = Math.round((t.followers || 0) * (1 + grow));
  }

  // Rival hunger: scales with the user's titles (distinct k:y:h across current players), off on Relaxed. Standard x1, Ruthless x2. AI budgets only, no ledger.
  const TITLE_KINDS = { worlds_champion: 1, major_champion: 1, regional_champion: 1 };
  function hunger(state) {
    const h = late.scale(state, 'hunger'); if (!(h > 0)) return 0;
    const seen = new Set();
    for (const id of (engine.teamById(state, state.userTeamId) || {}).playerIds || []) {
      const p = engine.playerById(state, id);
      for (const t of (p && p.titles) || []) if (TITLE_KINDS[t.k]) seen.add(t.k + ':' + t.y + ':' + (t.h || ''));
    }
    if (!seen.size) return 0;
    const top = state.teams.filter((t) => t.id !== state.userTeamId && t.tier !== 'B').sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, HUNGER_TOP);
    const amt = Math.round(seen.size * HUNGER_PER_TITLE * h * econ(state));
    for (const t of top) t.budget = (t.budget || 0) + amt;
    return amt;
  }

  // Crises (plan 4.8): at most one a month, picked by a hash of the date (deterministic, no rand in the monthly tick). Burnout and raid hit morale; scandal costs fans and sponsor money.
  const note = (state, title, body) => { state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'news', title, link: 'inbox', body }); if (state.inbox.length > 120) state.inbox.splice(0, state.inbox.length - 120); };
  const hash = (str) => { let h = 7; for (const c of str) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
  const mood = (p, d) => { p.morale = Math.max(0, Math.min(100, (p.morale == null ? 70 : p.morale) + d)); };
  function crisis(state, force) {
    const k = late.scale(state, 'crises'), ps = mine(state).sort((a, b) => b.rating - a.rating); if (!ps.length) return null;
    const h = hash(state.currentDate + ':' + state.userTeamId), chance = CRISIS_CHANCE * k * (1 - 0.1 * B.effect(state, 'wellbeing'));
    if (!force && !(k > 0 && (h % 10000) / 10000 < chance)) return null;
    const kind = force || ['burnout', 'scandal', 'raid'][(h >> 8) % 3];
    if (kind === 'burnout') { const p = ps[(h >> 4) % Math.min(3, ps.length)]; mood(p, -25); note(state, p.name + ' is burnt out', 'The grind has caught up with ' + p.name + '. Morale takes a big hit; give them rest or a win.'); }
    else if (kind === 'scandal') {
      const t = engine.teamById(state, state.userTeamId), cost = 100e3 * econ(state); t.followers = Math.round((t.followers || 0) * 0.97);
      const paid = late.spend(state, cost, 'Sponsor scandal: penalty'); note(state, 'Sponsor scandal', 'A partner drama costs you 3% of your followers' + (paid && paid.ok !== false ? ' and a sponsor penalty.' : '.'));
    } else {
      const p = ps[0], rival = state.teams.filter((x) => x.id !== state.userTeamId && x.tier !== 'B').sort((a, b) => (b.budget || 0) - (a.budget || 0))[0];
      mood(p, -15); note(state, 'Rival raid', (rival ? rival.name : 'A rival') + ' are circling ' + p.name + '. Their head is turned: morale drops. Offer a new deal if it matters.');
    }
    return kind;
  }

  const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late effects: ' + what + ' failed: ' + e.stack); } };
  const mine = (state) => { const t = engine.teamById(state, state.userTeamId); return t ? (t.playerIds || []).map((id) => engine.playerById(state, id)).filter(Boolean) : []; };

  // b3 Academy: academy.js multiplies its session boost by this.
  const academyBoost = (state) => 1 + ACADEMY_BOOST * B.effect(state, 'academy');

  // b3 Wellbeing, absences: the game starts absences inside league.js (processAbsences), where a wrapper cannot reach, so new injury / illness absences in the
  // saved state are shortened once (marked a.wb; an absence older than a day is only marked, never retro-shortened). Media and private absences are left alone.
  function absences(state) {
    const eff = B.effect(state, 'wellbeing');
    for (const p of mine(state)) {
      const a = p.absence; if (!a || a.wb != null) continue;
      a.wb = eff;
      if (!(eff > 0) || a.media || !(a.days > 1) || (a.cat && a.cat !== 'injury' && a.cat !== 'illness') || a.since < addDays(state.currentDate, -1)) continue;
      const days = Math.max(1, Math.round(a.days * (1 - ABSENCE_CUT * eff)));
      a.until = addDays(a.until, days - a.days); a.days = days;
      if (a.until < state.currentDate) a.until = state.currentDate;
    }
  }

  // b3 Wellbeing, decline: after a season rollover, give back a share of the rating the user's players just lost. ratingExact carries the fraction (the game rebuilds rating from it).
  function restoreDecline(state, before) {
    const eff = B.effect(state, 'wellbeing'); if (!(eff > 0)) return;
    for (const p of mine(state)) {
      const o = before.get(p.id); if (!o || !(p.rating < o.rating)) continue;
      const back = (o.rating - p.rating) * Math.min(0.5, DECLINE_CUT * eff);
      if (p.ratingExact != null) { p.ratingExact = Math.min(o.rating, p.ratingExact + back); p.rating = Math.floor(p.ratingExact + 1e-9); } else p.rating = Math.min(o.rating, p.rating + Math.round(back));
    }
  }
  const nextSeason = engine.startNextSeason;
  if (typeof nextSeason === 'function') {
    engine.startNextSeason = function startNextSeasonWithLate(state) {
      const before = new Map(); safe('decline snapshot', () => { for (const p of mine(state)) before.set(p.id, { rating: p.rating }); });
      const r = nextSeason.apply(this, arguments);
      safe('decline', () => restoreDecline(state, before));
      return r;
    };
  }

  // b3 Scouting: a new job is shortened right after the game creates it (the job's endDate is plain state, read by processScouting). Extra scout slots are NOT done:
  // the slot check is inside startScouting (SCOUT_SLOTS) and getting past it means hiding jobs from the game; see LateGamePlan.md section 14.
  const startScouting = engine.startScouting;
  if (typeof startScouting === 'function') {
    engine.startScouting = function startScoutingWithLate(state, playerId) {
      const r = startScouting.apply(this, arguments);
      safe('scouting speed', () => {
        const eff = B.effect(state, 'scouting'), jobs = state.scouts && state.scouts.jobs, j = jobs && jobs[jobs.length - 1];
        if (!r || !r.ok || r.resumed || !(eff > 0) || !j || j.playerId !== playerId) return;
        const total = Math.round((Date.parse(j.endDate) - Date.parse(j.startDate)) / 86400000), days = Math.max(1, Math.round(total * (1 - SCOUT_SPEED * eff)));
        j.endDate = addDays(j.startDate, days); r.days = days;
      });
      return r;
    };
  }

  // What a building does at a level, as text for the Facilities tab (numbers come from the constants above, so the UI never repeats them).
  const pct = (x) => Math.round(x * 1000) / 10 + '%';
  const m = (n) => '$' + (n >= 1e6 ? Math.round(n / 1e5) / 10 + 'M' : Math.round(n / 1e3) + 'K');
  const describe = (id, l) => {
    if (!l) return '';
    switch (id) {
      case 'academy': return 'Academy training +' + pct(ACADEMY_BOOST * l);
      case 'scouting': return 'Scouting jobs ' + pct(SCOUT_SPEED * l) + ' shorter';
      case 'wellbeing': return 'Injuries and illness ' + pct(ABSENCE_CUT * l) + ' shorter; rating decline ' + pct(DECLINE_CUT * l) + ' smaller';
      case 'analytics': return '+' + Math.round(EDGE_PER_LEVEL * l * 10) / 10 + ' rating in matches (with chemistry, max +' + EDGE_CAP + ')';
      case 'arena': return 'Gate ' + m(ARENA_GATE * l) + '/month, followers +' + pct(FOLLOWER_GROWTH.arena * l) + '/month';
      case 'fanzone': return 'Merch ' + m(MERCH_RATE * l) + '/month, followers +' + pct(FOLLOWER_GROWTH.fanzone * l) + '/month';
      case 'studio': return 'Media offers pay +' + pct(STUDIO_FEE * l);
      case 'museum': { const L = require('./late-legacy'); return 'Tickets ' + m(L.MUSEUM_TICKETS * l) + '/month, followers +' + pct(L.MUSEUM_FANS * l) + '/month'; }
      default: return '';
    }
  };

  // b4 Analytics Lab: ux-club.js applyChem adds this on top of the team's chemistry delta (base) for the user's team only. It never lowers chemistry and never pushes the total past EDGE_CAP.
  const matchEdge = (state, base) => Math.max(0, Math.min(EDGE_PER_LEVEL * B.effect(state, 'analytics'), EDGE_CAP - base));

  // b2 Streaming Studio: every new media offer gets its fee raised once (marked o.studio, so a refresh never compounds and an offer seen before the build is not changed).
  // The game's own mediaMoodCost / creatorReach are read inside league.js, not through the exports, so they cannot be wrapped: not part of b2 (see LateGamePlan.md).
  function daily(state) {
    const eff = B.effect(state, 'studio');
    for (const o of state.mediaOffers || []) {
      if (o.studio != null || o.accepted) continue;
      o.studio = eff; if (eff > 0) o.fee = Math.round(o.fee * (1 + STUDIO_FEE * eff));
    }
  }

  late.onMonthly(monthly);
  // v0.8.0 ships facilities only: hunger and crises are written and tested but NOT switched on. To enable: late.onMonthly(hunger); late.onMonthly((st) => safe('crisis', () => crisis(st))); (LateGamePlan.md 14.3d)
  late.onDaily(daily);
  late.onDaily(absences);
  late.effects = { hunger, crisis, monthly, daily, absences, restoreDecline, academyBoost, matchEdge, describe, EDGE_PER_LEVEL, EDGE_CAP, STUDIO_FEE, ACADEMY_BOOST, SCOUT_SPEED, ABSENCE_CUT, DECLINE_CUT, ARENA_GATE, MERCH_RATE, FOLLOWER_GROWTH };
  log('late effects installed');
  return late.effects;
}

module.exports = { install, EDGE_PER_LEVEL, EDGE_CAP, STUDIO_FEE, ACADEMY_BOOST, SCOUT_SPEED, ABSENCE_CUT, DECLINE_CUT, ARENA_GATE, MERCH_RATE, FOLLOWER_GROWTH };
