'use strict';
// Balance run for the late game (LateGamePlan.md 4/14.5): a headless career with a greedy builder. Prints per season: budget, late income/upkeep/build spend,
// buildings, titles. Usage: node tools/late-sim.js [seasons=6] [seed=1] [mode=standard|relaxed|ruthless] [team="Team Vitality"]
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const B = engine.uxLate.build, late = engine.uxLate;
engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const [seasons = 6, seed = 1, mode = 'standard', team = 'Team Vitality'] = process.argv.slice(2);
let s = Number(seed) >>> 0; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: team, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const t = engine.teamById(st, st.userTeamId);
const tally = { earn: 0, spendBuild: 0, upkeep: 0 }; // wraps count only what late.* moves
const oe = late.earn, os = late.spend;
late.earn = (state, a, x) => { const r = oe(state, a, x); if (r && r.ok) tally.earn += Math.round(a); return r; };
late.spend = (state, a, x) => { const r = os(state, a, x); if (r && r.ok) tally[/upkeep/i.test(x) ? 'upkeep' : 'spendBuild'] += Math.round(a); return r; };
engine.advance(st, rand, 'day');
if (mode !== 'standard') engine.placeBet(st, 'uxl:' + JSON.stringify({ a: 'mode', mode }), 0, 0, 0);
const rpc = (o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const ORDER = ['arena', 'fanzone', 'studio', 'academy', 'scouting', 'analytics', 'wellbeing']; // revenue first, then the rest
const fmt = (n) => (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + 'M' : Math.round(Math.abs(n) / 1e3) + 'K');
const titles = () => { const seen = new Set(); for (const id of t.playerIds) for (const x of (engine.playerById(st, id).titles || [])) if (/champion/.test(x.k)) seen.add(x.k + x.y + (x.h || '')); return seen.size; };
function greedy() { // keep a reserve of one month of wages-ish: 10% of budget; HQ upgrade first when affordable, then the cheapest next level in priority order
  const hq = engine.facilityBoard(st);
  if (hq && hq.tier < 6) engine.buyFacility(st, hq.tier + 1);
  for (let i = 0; i < 2; i++) for (const id of ORDER) { const r = rpc({ a: 'build', id }); if (r.ok) break; }
}
let lastSeason = st.season, row = Object.assign({}, tally), lastBudget = t.budget, yr = 0, days = 0;
console.log(`late-sim: ${team}, mode ${mode}, seed ${seed}, ${seasons} seasons. start budget ${fmt(t.budget)}`);
console.log('season | budget | late income | upkeep | builds | levels | titles | followers');
while (yr < Number(seasons) && days < 365 * (Number(seasons) + 1)) {
  const r = engine.advance(st, rand, 'day'); days++;
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  if (days % 7 === 0 && late.active(st)) greedy();
  if (r.stopped === 'season-end') {
    const lv = ORDER.reduce((a, id) => a + B.level(st, id), 0);
    console.log([st.season, fmt(t.budget), fmt(tally.earn - row.earn), fmt(-(tally.upkeep - row.upkeep)), fmt(-(tally.spendBuild - row.spendBuild)), lv + '/24', titles(), t.followers].join(' | '));
    row = Object.assign({}, tally); yr++; engine.startNextSeason(st, rand);
  }
}
