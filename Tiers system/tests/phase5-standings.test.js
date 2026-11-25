'use strict';
// Phase 5 test: regional Tier B season standings (points from all six cups, tie-breaks, independence, archive).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, log: (m) => console.log('LOG', m) });
const { createSeason } = require('../src/engine/btier-season');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const L = require('../src/engine/btier-loader');

const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const regionIds = L.REGIONS.map((r) => r + '_b');

// 1. tie-break order on a tiny synthetic state
{
  const S = createSeason({}, ev);
  const mk = (id) => ({ id, region: 'eu_b' });
  const st = { teams: [1, 2, 3, 4, 5, 6].map(mk), tierB: { season: 1, regions: [{ id: 'eu_b' }], lastRanking: { eu_b: { 6: 50, 5: 10 } }, history: [] } };
  const cup = (rows) => st.tierB.history.push({ season: 1, region: 'eu_b', standings: rows.map(([teamId, placement, points]) => ({ teamId, placement, points })) });
  // team1: 1st+3rd = 15+7=22 | team2: 2nd+2nd = 10+10 = 20 | team3: 4th*? | teams 4,5,6 all 20-tie variants
  cup([[1, 1, 15], [2, 2, 10], [3, 3, 7], [4, 4, 7], [5, 5, 5], [6, 6, 5]]);
  cup([[3, 1, 15], [2, 2, 10], [1, 3, 7], [4, 4, 7], [6, 5, 5], [5, 6, 5]]);
  const t = S.standings(st, 'eu_b');
  // 1: 15+7=22, 3: 7+15=22 (tie, one win each, no seconds; best equal; avg place 2.0 both) -> last season (0,0) -> id: 1 before 3
  // 2: 20 ; 4: 14 ; 5 and 6: 10 each (tie) -> avg place 5.5 both, best 5 both -> last season points: 6 has 50 > 5 has 10
  assert.deepStrictEqual(t.map((r) => r.teamId), [1, 3, 2, 4, 6, 5]);
  assert.deepStrictEqual(t.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(t[0].wins, 1);
  assert.strictEqual(t[2].seconds, 2);
}

// 2. a full season in a real career: standings agree with the cups, every region independent
const rand = mkRand(21);
const st = engine.generateLeague({ teamName: real.regions[0].teams[0].name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
assert.strictEqual(typeof engine.tierBStandings, 'function');
const empty = engine.tierBStandings(st, 'eu_b');
assert.strictEqual(empty.length, 16);
assert.ok(empty.every((r) => r.points === 0 && r.cups === 0), 'before the first cup every team has 0 points');
let r0;
for (let i = 0; i < 4000; i++) {
  r0 = engine.advance(st, rand, 'next');
  if (r0.stopped === 'matchday') { const fx = engine.fixtureById(st, r0.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } }
  if (r0.stopped === 'season-end') break;
}
assert.strictEqual(r0.stopped, 'season-end');

const tables = {};
for (const reg of regionIds) {
  const t = engine.tierBStandings(st, reg);
  tables[reg] = t;
  const ids = new Set(st.teams.filter((x) => x.region === reg).map((x) => x.id));
  assert.strictEqual(t.length, 16, `${reg}: 16 rows`);
  assert.deepStrictEqual(new Set(t.map((r) => r.teamId)), ids, `${reg}: only its own teams`);
  assert.deepStrictEqual(t.map((r) => r.rank), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.ok(t.every((r) => r.cups === 6), `${reg}: every team is in all six cups`);
  assert.ok(t.every((r, i) => !i || t[i - 1].points >= r.points), `${reg}: sorted by points`);
  assert.strictEqual(t.reduce((a, r) => a + r.points, 0), 6 * 83);
  assert.strictEqual(t.reduce((a, r) => a + r.wins, 0), 6, `${reg}: six cup winners in total`);
  // agrees with the running points table and with the cup placements
  t.forEach((r) => assert.strictEqual(r.points, st.tierB.ranking[reg][r.teamId], `${reg}: standings = running table`));
  const mine = st.tierB.cups.filter((c) => c.region === reg);
  const manual = {};
  mine.forEach((c) => c.standings.forEach((x) => { manual[x.teamId] = (manual[x.teamId] || 0) + x.points; }));
  t.forEach((r) => assert.strictEqual(r.points, manual[r.teamId]));
  assert.ok(t.every((r) => r.prize > 0));
}
// regions differ (independent tables, not copies of each other)
assert.notDeepStrictEqual(tables.eu_b.map((r) => r.points), tables.na_b.map((r) => r.points));
// asking for a region that does not exist or a Tier A region gives an empty table, never Tier A data
assert.deepStrictEqual(engine.tierBStandings(st, 'eu'), []);
assert.deepStrictEqual(engine.tierBStandings(st, 'nope_b'), []);

// 3. season rollover archives the final tables and starts clean
const before = JSON.stringify(tables);
engine.startNextSeason(st, rand);
assert.strictEqual(st.tierB.seasons.length, 1);
assert.strictEqual(st.tierB.seasons[0].season, 1);
for (const reg of regionIds) {
  const arch = st.tierB.seasons[0].tables[reg];
  assert.deepStrictEqual(arch.map((x) => x.teamId), tables[reg].map((x) => x.teamId), `${reg}: archived order = final order`);
  assert.deepStrictEqual(arch.map((x) => x.points), tables[reg].map((x) => x.points));
  // the old season stays readable and unchanged after the new season begins
  assert.deepStrictEqual(engine.tierBStandings(st, reg, 1).map((x) => x.teamId), tables[reg].map((x) => x.teamId));
  assert.ok(engine.tierBStandings(st, reg).every((x) => x.points === 0), `${reg}: new season starts at 0`);
}
assert.ok(st.tierB.history.length === 42, 'history of last season kept');

// 4. moving a team to another division later must not rewrite a finished season (Phase 7 will do exactly that)
{
  const reg = 'eu_b';
  const moved = tables[reg][0].teamId;
  const team = st.teams.find((x) => x.id === moved);
  team.region = 'eu'; team.tier = 'A'; // promoted
  assert.deepStrictEqual(engine.tierBStandings(st, reg, 1).map((x) => x.teamId), tables[reg].map((x) => x.teamId), 'past table unchanged after a promotion');
  assert.strictEqual(engine.tierBStandings(st, reg, 1)[0].teamId, moved);
  assert.ok(!engine.tierBStandings(st, reg).some((x) => x.teamId === moved), 'current table no longer has the promoted team');
  team.region = reg; team.tier = 'B';
}

// 5. a region that cannot field 16 teams skips the cup (logged once) instead of throwing every day
{
  const logs = [];
  const eng2 = engine; // same wrapped engine; capture via a fresh season object with its own log
  const S = createSeason(eng2, ev, { log: (m) => logs.push(m) });
  const r2 = mkRand(4);
  const st2 = eng2.generateLeague({ teamName: real.regions[0].teams[0].name, real, startDate: eng2.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, r2);
  const victim = st2.teams.find((x) => x.region === 'sam_b');
  victim.region = 'zz'; // 15 left
  st2.currentDate = st2.tierB.cups[0].startDate;
  assert.doesNotThrow(() => { S.step(st2); S.step(st2); });
  const samCups = st2.tierB.cups.filter((c) => c.region === 'sam_b');
  assert.strictEqual(samCups[0].stage, 'done');
  assert.strictEqual(samCups[0].skipped, true);
  assert.strictEqual(logs.filter((m) => /sam_b/.test(m)).length, 1, 'logged once');
  assert.ok(st2.tierB.cups.filter((c) => c.region === 'eu_b')[0].stage !== 'pending', 'other regions still run');
}
assert.strictEqual(before, JSON.stringify(tables));

console.log('phase5-standings: all tests passed');
