'use strict';
// Tier B in the World editor: edits to Tier B teams/players validate, apply, and reach a new career. Runs the game's real world.js + engine.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const worldRules = require(path.join(APP, 'engine', 'world.js'));
const { wrapEngine } = require('../src/engine/btier-state');
const W = require('../src/engine/btier-world');
const L = require('../src/engine/btier-loader');

const bTeam = L.flatten(L.loadRaw()).find((t) => t.homeRegion === 'eu');
const ctx = { base: real, bases: { 2027: real }, reserved: new Set(), nations: new Set(real.regions.flatMap((r) => r.teams.flatMap((t) => t.players.map((p) => p.nation)))), fixedAbbrevs: {} };
const rosterYear = 2027;

// without the wrap the game drops edits to teams it does not know
const w0 = worldRules.blankWorld('t', rosterYear);
w0.teams[bTeam.name] = { name: 'Edited Club', abbrev: 'EDC', colors: ['#112233', '#445566'] };
assert.strictEqual(Object.keys(worldRules.checkWorld(w0, ctx).world.teams).length, 0, 'sanity: unwrapped game ignores Tier B');

W.wrapWorld(worldRules, {});
const refs = bTeam.players.map((p) => 'r:' + bTeam.name + '|' + p.name);
const w = worldRules.blankWorld('t', rosterYear);
w.teams[bTeam.name] = { name: 'Edited Club', abbrev: 'EDC', colors: ['#112233', '#445566'] };
w.players = [{ id: 'c1', name: 'Zzyzx', nation: bTeam.players[0].nation, age: 19, rating: 66, potential: 70 }];
w.rosters[bTeam.name] = ['c:c1', refs[1], refs[2]];
const checked = worldRules.checkWorld(w, ctx);
assert.deepStrictEqual(checked.errors, []);
assert.strictEqual(checked.world.teams[bTeam.name].name, 'Edited Club');
assert.deepStrictEqual(checked.world.rosters[bTeam.name], ['c:c1', refs[1], refs[2]]);

// a Tier A edit still works next to it, and Tier A data is not polluted
const a = real.regions[0].teams[0];
w.teams[a.name] = { name: 'Edited A Club', abbrev: 'EAC', colors: ['#0a0a0a', '#f0f0f0'] };
assert.deepStrictEqual(worldRules.checkWorld(w, ctx).errors, []);
const applied = worldRules.applyWorld(real, worldRules.checkWorld(w, ctx).world);
assert.ok(!applied.regions.some((r) => /_b$/.test(r.id)), 'Tier B regions must not stay in the Tier A data');
assert.ok(applied.regions[0].teams.some((t) => t.name === 'Edited A Club'));
assert.ok(applied.tierBWorld && applied.tierBWorld.regions.length === 7);
const et = applied.tierBWorld.regions.find((r) => r.id === 'eu').teams.find((t) => t.name === 'Edited Club');
assert.ok(et && et.players[0].name === 'Zzyzx' && et.players[0].baseStrength === 66 && et.players.length === 3);

// loader + career use the edited teams
assert.ok(L.loadTeams(applied).teams.some((t) => t.name === 'Edited Club'));
const engine = wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: require(path.join(APP, 'engine', 'events.js')) });
let s = 7; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: 'Edited A Club', real: applied, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const t = st.teams.find((x) => x.name === 'Edited Club');
assert.ok(t && t.tier === 'B', 'edited Tier B club is in the career');
assert.ok(t.playerIds.map((id) => engine.playerById(st, id)).some((p) => p.name === 'Zzyzx'), 'custom player is on the edited Tier B club');
assert.ok(!st.teams.some((x) => x.name === bTeam.name), 'old Tier B name is gone');
const list = engine.clubPreview(applied);
assert.ok(list.some((r) => r.id === 'eu_b' && r.clubs.some((c) => c.name === 'Edited Club')));

// editor base shape
const eb = W.editorRegions(undefined, engine.clubStars);
assert.strictEqual(eb.length, 7);
assert.ok(eb[0].teams.length === 32 && eb[0].teams[0].players[0].ref.startsWith('r:' + eb[0].teams[0].name + '|'));
// the 16 extra Tier A clubs per region are editable too (a region has 32); edits reach the career once, never duplicated
{
  const { withExtraA } = require('../src/engine/btier-state');
  const ex = L.loadExtraA(real).find((t) => t.homeRegion === 'eu');
  const exRefs = ex.players.map((p) => 'r:' + ex.name + '|' + p.name);
  const w2 = worldRules.blankWorld('t2', rosterYear);
  w2.teams[ex.name] = { name: 'Edited Extra', abbrev: 'EXT', colors: ['#112233', '#445566'] };
  w2.players = [{ id: 'c2', name: 'Qwxyz', nation: ex.players[0].nation, age: 20, rating: 64, potential: 70 }];
  w2.rosters[ex.name] = ['c:c2', exRefs[1], exRefs[2]];
  const ck = worldRules.checkWorld(w2, ctx);
  assert.deepStrictEqual(ck.errors, []);
  assert.strictEqual(ck.world.teams[ex.name].name, 'Edited Extra', 'edit of an extra Tier A club is kept');
  const ap = worldRules.applyWorld(real, ck.world);
  const eu = ap.regions.find((r) => r.id === 'eu');
  assert.strictEqual(eu.teams.length, 32, 'region keeps 32 Tier A clubs');
  assert.ok(eu.teams.some((t) => t.name === 'Edited Extra' && t.players.some((p) => p.name === 'Qwxyz')) && !eu.teams.some((t) => t.name === ex.name));
  const st2 = engine.generateLeague({ teamName: 'Edited Extra', real: ap, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  assert.strictEqual(st2.teams.filter((t) => t.name === 'Edited Extra').length, 1, 'edited extra club exists once');
  assert.ok(!st2.teams.some((t) => t.name === ex.name), 'old extra name is gone');
  assert.strictEqual(st2.teams.filter((t) => t.tier !== 'B' && t.region === 'eu').length, 32, 'Tier A region has 32 clubs in the career');
  // the extra clubs keep their exact data ratings (the game adds -3..+3 noise), also when the world was applied through the editor
  const ex2 = L.loadExtraA(real).find((t) => t.homeRegion === 'eu' && t.name !== ex.name), t2 = st2.teams.find((t) => t.name === ex2.name);
  assert.deepStrictEqual(ex2.players.map((p) => p.baseStrength), ex2.players.map((p) => engine.playerById(st2, t2.playerIds.find((id) => engine.playerById(st2, id).name === p.name)).rating), 'extra Tier A ratings are pinned');
  const eb2 = W.editorExtraA(real, engine.clubStars);
  assert.ok(Object.keys(eb2).length === 7 && eb2.eu.length === 16 && eb2.eu[0].players[0].ref.startsWith('r:' + eb2.eu[0].name + '|'));
}
console.log('btier-world ok');
