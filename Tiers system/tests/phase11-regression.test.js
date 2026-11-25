'use strict';
// Phase 11: spec section 11 checks that no earlier test covers: database, old saves, save round-trip, unchanged Tier A rules.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const leaguePath = require.resolve(path.join(APP, 'engine', 'league.js'));
const ev = require(path.join(APP, 'engine', 'events.js'));
const raw = require(leaguePath); // module instance #1, wrapped below
const wrapped = require('../src/engine/btier-state').wrapEngine(raw, { events: ev, log: (m) => console.log('LOG', m) });
delete require.cache[leaguePath];
const original = require(leaguePath); // module instance #2: the untouched game engine (what a save from the original game was made with)
assert.ok(!original.__btier && wrapped.__btier);
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const L = require('../src/engine/btier-loader');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const cfg = (team) => ({ teamName: team, real, startDate: wrapped.careerStartFor(2027), calendar: 'rlcs', economy: 'real' });

function play(engine, st, rand, until = 'season-end') {
  for (let i = 0; i < 4000; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
    if (r.stopped === until || r.stopped === 'sacked') return r.stopped;
  }
  throw new Error('did not finish');
}
const openPointsOk = (st) => st.events.filter((e) => e.kind === 'open' && e.stage === 'done').every((e) => e.standings.every((s) => s.points === ev.pointsFor('open', s.placement)));

// 1. Database
{
  const data = L.loadTeams(real);
  assert.strictEqual(data.teams.length, 112);
  for (const r of L.REGIONS) assert.strictEqual(data.teams.filter((t) => t.homeRegion === r).length, 16, r + ' has 16 active teams');
  const tierA = L.tierANames(real);
  assert.ok(data.teams.every((t) => !tierA.has(L.nameKeys(t.name)[0])), 'no Tier A duplicate');
  assert.ok(data.teams.every((t) => t.players.length === 3), 'three data players per team');
  assert.ok(data.teams.every((t) => t.players.every((p) => p.baseStrength >= 55 && p.baseStrength <= 68)), 'data ratings 55-68');
  const st = wrapped.generateLeague(cfg('Team Vitality'), mkRand(1));
  const byName = new Map(data.teams.map((t) => [t.name, t]));
  let checked = 0;
  for (const t of st.teams.filter((x) => x.tier === 'B')) {
    const d = byName.get(t.name);
    for (const id of t.playerIds) { const p = wrapped.playerById(st, id); const dp = d.players.find((x) => x.name === p.name); if (dp) { assert.strictEqual(p.rating, dp.baseStrength, 'starting rating = data rating'); assert.ok(p.rating >= 55 && p.rating <= 68); checked++; } }
  }
  assert.strictEqual(checked, 336);
  console.log('1. database OK (336 players pinned to 55-68)');
}

// 2. Existing save made by the ORIGINAL game (no tierB at all): plays on with the wrapped engine
{
  const rand = mkRand(2);
  const st = original.generateLeague(cfg('Team Vitality'), rand);
  assert.ok(!st.tierB && st.teams.every((t) => !t.tier));
  const regions = st.regions.length;
  assert.strictEqual(play(wrapped, st, rand), 'season-end');
  assert.ok(st.events.every((e) => e.stage === 'done'));
  assert.ok(openPointsOk(st));
  wrapped.startNextSeason(st, rand);
  assert.strictEqual(play(wrapped, st, rand), 'season-end', 'second season of an old save');
  assert.ok(!st.tierB && st.regions.length === regions && st.teams.length === original.generateLeague(cfg('Team Vitality'), mkRand(2)).teams.length);
  wrapped.migrateState(st, rand, real);
  console.log('2. old save without Tier B: 2 seasons OK');
}

// 3. Save round-trip (JSON, as the game stores careers) in the middle of a season and across the rollover
{
  const rand = mkRand(3);
  let st = wrapped.generateLeague(cfg('Team Vitality'), rand);
  for (let i = 0; i < 60; i++) { const r = wrapped.advance(st, rand, 'next'); if (r.stopped === 'matchday') { const f = wrapped.fixtureById(st, r.fixtureId); if (f && !f.played) { wrapped.simulateFixture(st, f, rand); wrapped.nextUserSeries(st, rand, f.id); } } }
  const before = st.tierB.history.length;
  st = JSON.parse(JSON.stringify(st));
  assert.strictEqual(st.tierB.history.length, before);
  assert.strictEqual(play(wrapped, st, rand), 'season-end');
  assert.strictEqual(st.tierB.history.filter((h) => h.season === st.season).length, 42);
  st = JSON.parse(JSON.stringify(st));
  wrapped.startNextSeason(st, rand);
  st = JSON.parse(JSON.stringify(st));
  assert.strictEqual(st.tierB.moves.length, 7);
  assert.strictEqual(play(wrapped, st, rand), 'season-end', 'season 2 after loading a saved career');
  for (const r of L.REGIONS) { assert.strictEqual(st.teams.filter((t) => t.region === r).length, 32); assert.strictEqual(st.teams.filter((t) => t.region === r + '_b').length, 16); }
  console.log('3. save round-trip (mid-season, season end, new season) OK');
}

// 4. Tier A rules unchanged: points of every Open follow the game's own table, Majors/Worlds only Tier A, 16-team Opens
{
  const rand = mkRand(4);
  const st = wrapped.generateLeague(cfg('Team Vitality'), rand);
  play(wrapped, st, rand);
  assert.ok(openPointsOk(st), 'Open points follow ev.pointsFor');
  for (const e of st.events) {
    assert.strictEqual(e.stage, 'done');
    for (const id of e.field || []) assert.strictEqual(wrapped.teamById(st, id).tier, 'A', e.name + ' has only Tier A teams');
  }
  assert.ok(st.events.filter((e) => e.kind === 'open').every((e) => e.field.length === 16));
  console.log('4. Tier A tournament rules unchanged OK');
}
// 5. Tier B finances: below every Tier A club of the region, varied, and the same numbers in the club list and in the career
{
  const st = wrapped.generateLeague(cfg('Team Vitality'), mkRand(5));
  const prev = wrapped.clubPreview(real);
  for (const r of L.REGIONS) {
    const A = st.teams.filter((t) => t.region === r).map((t) => t.budget);
    const B = st.teams.filter((t) => t.region === r + '_b');
    const floorA = Math.max(20000, Math.min(...A));
    assert.ok(B.every((t) => t.budget <= 0.9 * floorA + 500), r + ': every Tier B budget is below the weakest Tier A club');
    assert.ok(new Set(B.map((t) => t.budget)).size >= 8, r + ': Tier B budgets vary');
    const pa = prev.find((x) => x.id === r).clubs; const pb = prev.find((x) => x.id === r + '_b').clubs;
    assert.ok(Math.max(...pb.map((c) => c.worth)) < Math.min(...pa.map((c) => c.worth)), r + ': Tier B worth below Tier A');
    assert.ok(new Set(pb.map((c) => c.worth)).size >= 8, r + ': Tier B worth varies');
    for (const t of B) assert.strictEqual(pb.find((c) => c.name === t.name).budget, t.budget, 'club list budget = career budget');
  }
  console.log('5. Tier B finances OK');
}
console.log('phase11-regression: all tests passed');
