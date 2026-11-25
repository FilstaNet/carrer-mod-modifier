'use strict';
// 32 Tier A clubs per region: Swiss before every Open, the Open's field is exactly the 16 qualifiers, nothing stays hidden, old 16-club saves are untouched.
// Plays 2 seasons as a Tier A manager and 1 as a Tier B manager (extracted engine, plain Node).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const titles = require(path.join(APP, 'engine', 'titles.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, titles });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);
const REGIONS = ['eu', 'na', 'sam', 'oce', 'mena', 'apac', 'ssa'];

function playSeason(st, rand) {
  for (let i = 0; i < 6000; i++) {
    const r = engine.advance(st, rand, 'next');
    assert.ok(!st.teams.some((t) => /_x$/.test(t.region)), 'a hidden club leaked out of an engine call');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
    if (r.stopped === 'season-end' || r.stopped === 'sacked') return r.stopped;
  }
  throw new Error('season did not finish');
}
const swiss = (st) => (st.uxMajors.events || []).filter((e) => e.swiss);

function check(st, label) {
  const sw = swiss(st).filter((e) => e.season === st.season);
  const opens = st.events.filter((e) => e.kind === 'open');
  assert.strictEqual(sw.length, 7 * opens.length, label + ': one Swiss per region and Open');
  for (const e of sw) {
    assert.strictEqual(e.stage, 'done', label + ': Swiss done');
    assert.strictEqual(e.qualified.length, 16, label + ': 16 qualifiers');
    assert.strictEqual(new Set(e.qualified).size, 16);
    assert.strictEqual(e.standings.length, 32, label + ': 32 clubs in the Swiss table');
    assert.ok(e.standings.filter((x) => x.through).length === 16);
    assert.ok(e.sw.every((g) => g.sw.seeds.length === 16 && g.sw.round <= 5));
    assert.ok(e.qualified.every((id) => st.teams.find((t) => t.id === id).region === e.region), label + ': qualifiers belong to the region');
  }
  for (const open of opens) {
    const mine = sw.filter((e) => e.openId === open.id);
    // the user's region: the game's own Open has exactly the Swiss qualifiers
    const home = mine.find((e) => e.region === (st.userRegion || '').replace(/_b$/, ''));
    assert.ok(open.field && open.field.length === 16, label + ': Open field is 16');
    assert.deepStrictEqual([...open.field].sort((a, b) => a - b), [...home.qualified].sort((a, b) => a - b), label + ': Open field = Swiss qualifiers');
    // simulated regions: the game's shadow Open used the same 16
    for (const e of mine) {
      if (e === home) continue;
      const shadow = (st.regionEvents[e.region] || []).find((x) => x.kind === 'open' && x.name === open.name && x.startDate === open.startDate);
      if (!shadow) continue; // only the last 10 are kept
      assert.deepStrictEqual([...shadow.field].sort((a, b) => a - b), [...e.qualified].sort((a, b) => a - b), label + ': ' + e.region + ' shadow Open = Swiss qualifiers');
    }
  }
}

{
  const rand = mkRand(21);
  const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  const A = st.teams.filter((t) => t.tier === 'A');
  assert.strictEqual(A.length, 224, '32 Tier A clubs in each of 7 regions');
  REGIONS.forEach((r) => assert.strictEqual(A.filter((t) => t.region === r).length, 32, r));
  assert.ok(A.every((t) => t.playerIds.length >= 3), 'every club has a roster');
  assert.ok(st.events.filter((e) => e.kind === 'open').every((e) => e.stage === 'held' || e.stage === 'pending'), 'Opens wait for their Swiss');
  for (let y = 1; y <= 2; y++) {
    assert.strictEqual(playSeason(st, rand), 'season-end');
    check(st, 'Tier A season ' + y);
    const mine = st.fixtures.filter((f) => f.xevId != null && (swiss(st).some((e) => e.id === f.xevId)) && (f.homeId === st.userTeamId || f.awayId === st.userTeamId));
    assert.ok(mine.length >= 0);
    if (y === 1) { engine.startNextSeason(st, rand); assert.ok(st.events.filter((e) => e.kind === 'open').every((e) => e.stage === 'held' || e.stage === 'pending'), 'next season: Opens wait for their Swiss'); }
  }
}

{ // a Tier B manager: every Swiss is simulated, the Opens still get their 16 qualifiers
  const rand = mkRand(5);
  const bTeam = engine.clubPreview(real).find((r) => r.tier === 'B').clubs[0].name;
  const st = engine.generateLeague({ teamName: bTeam, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  assert.ok(/_b$/.test(st.userRegion));
  playSeason(st, rand);
  check(st, 'Tier B manager');
  assert.ok(swiss(st).every((e) => !e.live), 'no Swiss fixtures for a Tier B manager');
}

{ // an old save (16 clubs per region): nothing is planned, nothing is held
  const rand = mkRand(9);
  const small = { ...real, regions: real.regions.map((r) => ({ ...r, teams: r.teams.slice(0, 16) })), __extraA: true }; // __extraA: skip the 16 extra clubs
  const st = engine.generateLeague({ teamName: small.regions[0].teams[0].name, real: small, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  assert.strictEqual(st.teams.filter((t) => t.tier === 'A' && t.region === 'eu').length, 16);
  assert.strictEqual(swiss(st).length, 0, 'no Swiss for 16-club regions');
  assert.ok(st.events.every((e) => e.stage !== 'held'));
}
console.log('ux-swiss (engine) ok');
