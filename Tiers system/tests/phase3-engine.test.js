'use strict';
// Phase 3 test: runs the game's real engine (extracted copy) in plain Node with the Tier B wrapper.
// Never touches real saves. usage: node phase3-engine.test.js
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const APP = path.join(__dirname, '..', '..', 'app_extracted');
const league = path.join(APP, 'engine', 'league.js');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const { wrapEngine, isB } = require('../src/engine/btier-state');
const L = require('../src/engine/btier-loader');

const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const cfg = (teamName, extra = {}) => ({ teamName, real, startDate: null, calendar: 'rlcs', economy: 'real', ...extra });

// 1. the hook itself: a child process preloads main-hook.js, then the game requires its engine
{
  const code = `const e=require(${JSON.stringify(league)});console.log(JSON.stringify({hooked:!!e.__btier}))`;
  const r = spawnSync(process.execPath, ['--require', path.join(__dirname, '..', 'src', 'injector', 'main-hook.js'), '-e', code], { env: { ...process.env, BTIER_LOG: path.join(require('os').tmpdir(), 'btier-test.log') }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout.trim().split('\n').pop()).hooked, true, 'Module._load hook did not wrap the engine');
}

const engine = wrapEngine(require(league), { events: require(path.join(APP, 'engine', 'events.js')) });
assert.ok(engine.__btier);
const tierA = L.tierANames(real);
const start = engine.careerStartFor(2027);

function checkStructure(st) {
  const A = st.teams.filter((t) => t.tier === 'A');
  const B = st.teams.filter((t) => t.tier === 'B');
  assert.strictEqual(A.length, 224, 'Tier A teams');
  assert.strictEqual(B.length, 112, 'Tier B teams');
  for (const id of L.REGIONS) {
    assert.strictEqual(A.filter((t) => t.region === id).length, 32, `Tier A ${id}`);
    assert.strictEqual(B.filter((t) => t.region === id + '_b' && t.homeRegion === id).length, 16, `Tier B ${id}`);
  }
  assert.deepStrictEqual(st.regions.map((r) => r.id), L.REGIONS, 'state.regions must hold Tier A regions only');
  assert.strictEqual(st.tierB.regions.length, 7);
  B.forEach((t) => assert.ok(t.playerIds.length >= 3 && t.playerIds.length <= engine.ROSTER_MAX, `${t.name} has ${t.playerIds.length} players`));
  const relegated = new Set(((st.tierB.moves) || []).flatMap((m) => m.relegated)); // relegated Tier A teams legitimately keep their names
  assert.ok(!B.some((t) => !relegated.has(t.id) && tierA.has(L.nameKeys(t.name)[0])), 'Tier B name clashes with Tier A');
}

function checkNoLeak(st) {
  const moved = new Set(((st.tierB && st.tierB.moves) || []).flatMap((m) => m.relegated)); // relegated teams may sit in old Tier A data
  const bIds = new Set(st.teams.filter((t) => t.tier === 'B' && !moved.has(t.id)).map((t) => t.id));
  const events = (st.events || []).concat(...Object.values(st.regionEvents || {}));
  for (const e of events) {
    (e.field || []).forEach((id) => assert.ok(!bIds.has(id), `Tier B team ${id} in ${e.name} field`));
    (e.standings || []).forEach((s) => assert.ok(!bIds.has(s.teamId), `Tier B team in ${e.name} standings`));
  }
  Object.keys(st.ranking || {}).forEach((id) => assert.ok(!bIds.has(Number(id)), `Tier B team ${id} has ranking points`));
}

function playUntil(st, rand, stopWhen, guard = 4000) {
  for (let i = 0; i < guard; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } }
    if (r.stopped === 'season-end' || r.stopped === 'sacked' || stopWhen(st)) return r.stopped;
  }
  throw new Error('did not finish');
}

// 2. Tier A career: structure, then a full season + rollover, Tier B never leaks into Tier A competitions
{
  const rand = mkRand(7);
  const st = engine.generateLeague({ ...cfg(real.regions[0].teams[0].name), startDate: start }, rand);
  checkStructure(st);
  const b = st.players.filter((p) => st.teams.find((t) => t.id === p.teamId && t.tier === 'B') && !p.isUser);
  console.log('Tier B players:', b.length, 'rating min/max:', Math.min(...b.map((p) => p.rating)), Math.max(...b.map((p) => p.rating)));
  const t0 = Date.now();
  const stop = playUntil(st, rand, () => false);
  console.log('season simulated:', stop, 'in', Date.now() - t0, 'ms; events:', st.events.map((e) => e.stage).join(','));
  checkNoLeak(st);
  assert.strictEqual(st.regions.length, 7);
  if (stop === 'season-end') {
    engine.startNextSeason(st, rand);
    checkStructure(st);
    checkNoLeak(st);
  }
  engine.migrateState(st, rand, real);
  checkStructure(st);
}

// 3. Tier B career (manager): starts, user team is Tier B, simulation runs without errors
{
  const rand = mkRand(11);
  const bTeam = L.loadTeams(real).teams.find((t) => t.homeRegion === 'eu');
  const st = engine.generateLeague({ ...cfg(bTeam.name), startDate: start }, rand);
  const me = st.teams.find((t) => t.id === st.userTeamId);
  assert.strictEqual(me.name, bTeam.name);
  assert.strictEqual(me.tier, 'B');
  assert.strictEqual(st.userRegion, 'eu_b');
  checkStructure(st);
  const stop = playUntil(st, rand, () => false);
  console.log('Tier B career season:', stop);
  checkStructure(st);
}

console.log('phase3-engine: all tests passed');
