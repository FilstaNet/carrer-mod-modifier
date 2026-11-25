'use strict';
// Phase 5 club switch round trip (LateGamePlan.md 14.6 / 14.7): can the manager move to another club? Uses the real engine.uxManager.switchClub (late-manager.js).
// Round trip: season at club A -> switch to B -> a season -> JSON save/load -> switch back to A -> a season. Real engine.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(11);
let st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const A = st.userTeamId;
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } return r; };
const season = () => { for (let i = 0; i < 700; i++) if (step().stopped === 'season-end') break; engine.startNextSeason(st, rand); };
const team = (id) => engine.teamById(st, id);

const switchClub = (s, id) => { const had = !!(s.clubStash && s.clubStash[id]), r = engine.uxManager.switchClub(s, id); assert(r.ok, JSON.stringify(r)); return { fromBundle: had }; };
const sanity = (label) => {
  const me = st.players.filter((p) => p.isUser), t = team(st.userTeamId);
  assert.strictEqual(me.length, 1, label + ': one user player');
  assert(t.playerIds.includes(me[0].id) && me[0].teamId === t.id, label + ': user player on the user club');
  assert.strictEqual(st.teams.filter((x) => x.playerIds.includes(me[0].id)).length, 1, label + ': on exactly one roster');
  assert(!(t.budget < 0), label + ': budget ok'); assert(engine.boardSummary(st), label + ': board summary');
};

// ---- season at A, with a custom value to prove it survives the trip ----
for (let i = 0; i < 20; i++) step();
team(A).budget = 7777777; st.academy = { counted: [], top12: 0, from: 1, until: 9, paidSeason: null, runBuys: 0, priorRuns: 0, session: null }; st.facility = st.facility || { tier: 3 }; st.strikes = 2; st.boardPressure = 1.5;
season(); sanity('A season 1');
const budgetA = team(A).budget;

// ---- switch to B ----
const region = team(A).region, B = st.teams.filter((t) => t.id !== A && t.tier !== 'B' && !t.nation && t.region === region).sort((x, y) => (y.followers || 0) - (x.followers || 0))[0].id; // a strong club: a weak one gets the new manager sacked within a season (see plan 14.6)
const r1 = switchClub(st, B);
assert(!st.academy || st.academy.from == null, 'academy eligibility stays with the old club');
assert(!r1.fromBundle && st.userTeamId === B && st.strikes === 0 && !st.facility, 'fresh start at B');
sanity('at B');
season(); sanity('B season'); assert(!st.sacked, 'not sacked at B');
assert(st.uxManager.stints.length === 2 && st.uxManager.stints[0].end === 'moved', 'manager record follows the switch');

// ---- save/load in the middle, then back to A ----
st = JSON.parse(JSON.stringify(st)); sanity('after save/load');
for (let i = 0; i < 30; i++) step();
const r2 = switchClub(st, A);
assert(r2.fromBundle && st.facility && st.facility.tier === 3 && st.strikes === st.clubStash[A].strikes, 'club A bundle restored (facility, strikes)');
assert(Math.abs(team(A).budget - budgetA) < budgetA, 'A budget evolved as an AI club, not reset to zero');
sanity('back at A'); season(); sanity('A season 2');
assert.strictEqual(st.uxManager.stints.length, 3, 'three stints: A, B, A');
console.log('late-switch spike: ok | stints', st.uxManager.stints.map((x) => x.name + ' S' + x.from + '-' + x.to + ' ' + x.end).join(' | '));
