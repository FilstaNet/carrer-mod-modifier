'use strict';
// Phase 4b test: B-Tier Cups running inside real careers (extracted engine, plain Node, no real saves touched).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, log: (m) => console.log('LOG', m) });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const L = require('../src/engine/btier-loader');

const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);
const gen = (teamName, seed) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand) }; };

function play(st, rand) {
  for (let i = 0; i < 4000; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } }
    if (r.stopped === 'season-end' || r.stopped === 'sacked') return r.stopped;
  }
  throw new Error('season did not finish');
}

function checkSeason(st, label) {
  const tb = st.tierB;
  assert.strictEqual(tb.cups.length, 42, `${label}: 42 cups`);
  for (const r of L.REGIONS.map((x) => x + '_b')) {
    const mine = tb.cups.filter((c) => c.region === r);
    assert.strictEqual(mine.length, 6, `${label}: 6 cups in ${r}`);
    assert.deepStrictEqual(mine.map((c) => c.split), [1, 1, 1, 2, 2, 2]);
    const ids = new Set(st.teams.filter((t) => t.region === r).map((t) => t.id));
    assert.strictEqual(ids.size, 16);
    let pts = 0;
    for (const c of mine) {
      assert.strictEqual(c.stage, 'done', `${label}: ${r} ${c.name} finished`);
      assert.strictEqual(c.field.length, 16);
      assert.strictEqual(c.groups.length, 4);
      assert.strictEqual(c.playoffSeeds.length, 8);
      assert.strictEqual(c.standings.length, 16);
      c.standings.forEach((s) => assert.ok(ids.has(s.teamId), `${r}: foreign team in cup`));
      assert.ok(c.slots.every((s) => s.winner != null && s.fixtureId != null), 'every cup match was played as a fixture');
      pts += c.standings.reduce((a, s) => a + s.points, 0);
    }
    assert.strictEqual(pts, 6 * 83);
    assert.strictEqual(Object.values(tb.ranking[r]).reduce((a, b) => a + b, 0) || Object.values(tb.lastRanking[r] || {}).reduce((a, b) => a + b, 0), 6 * 83);
  }
  assert.strictEqual(tb.history.filter((h) => h.season === st.season).length, 42);
}

// 1. Tier A career: cups run alongside the Opens, Tier A is unaffected, then the next season gets new cups
{
  const { rand, st } = gen(real.regions[0].teams[0].name, 21);
  assert.strictEqual(st.tierB.cups.length, 42);
  assert.ok(st.tierB.cups.every((c) => c.stage === 'pending' || c.stage !== 'done'));
  const budget0 = Object.fromEntries(st.teams.filter((t) => t.tier === 'B').map((t) => [t.id, t.budget]));
  const t0 = Date.now();
  assert.strictEqual(play(st, rand), 'season-end');
  const ms = Date.now() - t0;
  checkSeason(st, 'season 1');
  const cupFx = st.fixtures.filter((f) => f.tierB && f.cupId != null);
  assert.strictEqual(cupFx.length, 42 * 27, '27 matches per cup');
  assert.ok(cupFx.every((f) => f.played));
  const aIds = new Set(st.teams.filter((t) => t.tier === 'A').map((t) => t.id));
  assert.ok(cupFx.every((f) => !aIds.has(f.homeId) && !aIds.has(f.awayId)), 'cups never include Tier A teams');
  assert.ok(st.fixtures.filter((f) => !f.tierB).every((f) => !(f.eventId >= 0 && !aIds.has(f.homeId) && !aIds.has(f.awayId) && st.teams.find((t) => t.id === f.homeId).tier === 'B')), 'Tier A events have no Tier B teams');
  // prize money: recorded for every placement of every cup, ~30% of the region's Open pool (budget itself also moves with wages, so it is not compared)
  const hist = st.tierB.history.filter((h) => h.season === st.season);
  assert.ok(hist.every((h) => h.standings.every((x) => x.prize > 0)));
  const euCup = hist.find((h) => h.region === 'eu_b');
  const euOpenPool = Array.from({ length: 16 }, (_, i) => ev.prizeFor('open', i + 1, { real: true, region: 'eu' })).reduce((a, b) => a + b, 0);
  const ratio = euCup.standings.reduce((a, x) => a + x.prize, 0) / euOpenPool;
  assert.ok(ratio > 0.29 && ratio < 0.31, 'cup pool ~30% of Open pool: ' + ratio);
  const paid = new Set(hist.flatMap((h) => h.standings.map((x) => x.teamId))).size;
  // player stats exist for Tier B players
  const withStats = st.players.filter((p) => { const t = st.teams.find((x) => x.id === p.teamId); return t && t.tier === 'B' && (p.season.goals + p.season.saves + p.season.shots) > 0; }).length;
  assert.ok(withStats > 250, `Tier B player stats recorded (${withStats})`);
  const sizeMB = (JSON.stringify(st).length / 1e6).toFixed(1);
  console.log(`season 1 (Tier A career): ${ms} ms, ${st.fixtures.length} fixtures, save ~${sizeMB} MB, prizes paid to ${paid} teams, ${withStats} Tier B players with stats`);

  engine.startNextSeason(st, rand);
  assert.ok(JSON.stringify(st).length < 6e6, 'save stays small after rollover: ' + JSON.stringify(st).length);
  assert.strictEqual(st.tierB.season, st.season);
  assert.strictEqual(st.tierB.cups.length, 42);
  assert.ok(st.tierB.cups.every((c) => c.stage === 'pending'));
  assert.ok(Object.keys(st.tierB.lastRanking).length === 7);
  console.log('after rollover: fixtures', st.fixtures.length, 'save ~' + (JSON.stringify(st).length / 1e6).toFixed(1) + ' MB');
  assert.strictEqual(play(st, rand), 'season-end');
  checkSeason(st, 'season 2');
}

// 2. Tier B manager career: the user's team plays its cup matches (simulated through the user path)
{
  const bTeam = L.loadTeams(real).teams.find((t) => t.homeRegion === 'na');
  const { rand, st } = gen(bTeam.name, 33);
  assert.strictEqual(st.userRegion, 'na_b');
  assert.strictEqual(play(st, rand), 'season-end');
  checkSeason(st, 'tier B career');
  const mine = st.fixtures.filter((f) => f.tierB && (f.homeId === st.userTeamId || f.awayId === st.userTeamId));
  assert.ok(mine.length >= 3, `user team played cup matches (${mine.length})`);
  assert.ok(mine.every((f) => f.played));
  console.log('Tier B career: user team played', mine.length, 'cup matches');
}

// 3. old saves (no state.tierB) are untouched
{
  const rand = mkRand(3);
  const st = engine.generateLeague({ teamName: real.regions[0].teams[0].name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  delete st.tierB; st.teams = st.teams.filter((t) => t.tier !== 'B'); st.players = st.players.filter((p) => st.teams.some((t) => t.id === p.teamId) || p.teamId < 0);
  assert.strictEqual(engine.advance(st, rand, 'day').stopped !== undefined, true);
}

console.log('phase4b-season: all tests passed');
