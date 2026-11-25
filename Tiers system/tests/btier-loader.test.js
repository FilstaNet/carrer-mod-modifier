'use strict';
// Run: node btier-loader.test.js   (fixtures are synthetic, NOT real orgs; real data lives in src/engine/btier-teams.json)
const assert = require('assert');
const path = require('path');
const L = require('../src/engine/btier-loader');
const dataDir = path.join(__dirname, '..', '..', 'app_extracted', 'data');
const A26 = require(path.join(dataDir, 'rlcs.json'));
const A27 = require(path.join(dataDir, 'rlcs-2027.json'));

const player = (n, s = 60) => ({ name: n, age: 20, nation: 'X', baseStrength: s });
const team = (n, ps) => ({ name: n, players: ps || [player(n + 'a'), player(n + 'b'), player(n + 'c')] });
const fixture = (extra = {}) => ({ regions: L.REGIONS.map((id) => ({ id, teams: extra[id] || [] })) });

// Tier A facts the design relies on
for (const d of [A26, A27]) {
  assert.strictEqual(d.regions.length, 7);
  d.regions.forEach((r) => assert.strictEqual(r.teams.length, 16, `Tier A ${r.id} should have 16`));
}

// name normalisation
assert.deepStrictEqual(L.nameKeys('Team Vitality'), ['teamvitality', 'vitality']);
assert.ok(L.nameKeys('Karmine  Corp!').includes('karminecorp'));
assert.ok(L.nameKeys('Vitality').includes('vitality'));

const tierA = L.tierANames(A26, A27);
assert.ok(tierA.has('vitality'));

// shipped file: all 7 regions complete (16 active + 12-16 reserve teams per region x 3 players, 55-68, no dupes, no Tier A clashes)
const real = L.validate(L.loadRaw(), { tierA, complete: true });
assert.ok(real.ok, real.errors.join('\n'));
assert.strictEqual(real.total, 220);
// Tier A expansion file: 16 per region, valid, and disjoint from Tier B and the game's Tier A (teams and players)
{
  const ex = L.validate(L.loadRaw(L.EXTRA_FILE), { tierA, complete: true });
  assert.ok(ex.ok, ex.errors.join('\n'));
  assert.strictEqual(ex.total, 112);
  const rawB = L.loadRaw(), rawA = L.loadRaw(L.EXTRA_FILE);
  const both = L.validate({ regions: L.REGIONS.map((id) => ({ id, teams: [...rawB.regions.find((r) => r.id === id).teams, ...rawA.regions.find((r) => r.id === id).teams] })) }, { tierA });
  const bothErrors = both.errors.filter((e) => !/max 32/.test(e)); // A-extra (16) + B file (up to 32) per region is expected
  assert.deepStrictEqual(bothErrors, [], bothErrors.join('\n'));
  const xa = L.loadExtraA([A26, A27]);
  assert.strictEqual(xa.length, 112);
  assert.ok(xa.every((t) => t.tier === 'A' && t.region === t.homeRegion));
}
L.REGIONS.forEach((r) => assert.strictEqual(real.counts[r], r === "ssa" ? 28 : 32));
// runtime split: 16 active + 16 reserve per region, disjoint
{
  const lt = L.loadTeams([A26, A27]);
  L.REGIONS.forEach((r) => { const a = lt.teams.filter((t) => t.homeRegion === r); const x = lt.reserve.filter((t) => t.homeRegion === r); assert.strictEqual(a.length, 16); assert.strictEqual(x.length, r === "ssa" ? 12 : 16); /* SSA: only 12 more clean candidates exist */ assert.ok(!x.some((t) => a.some((u) => u.name === t.name))); });
}

// derived fields
const f = L.flatten(fixture({ eu: [team('Fake One')] }))[0];
assert.deepStrictEqual([f.tier, f.homeRegion, f.region], ['B', 'eu', 'eu_b']);

// rule checks
const bad = (db, re) => { const r = L.validate(db, { tierA }); assert.ok(!r.ok && r.errors.some((e) => re.test(e)), `expected ${re}: ${r.errors}`); };
bad(fixture({ eu: [team('Fake', [player('a'), player('b')])] }), /exactly 3 players/);
bad(fixture({ eu: [team('Fake', [player('a', 54), player('b'), player('c')])] }), /outside 55-68/);
bad(fixture({ eu: [team('Fake', [player('a', 69), player('b'), player('c')])] }), /outside 55-68/);
bad(fixture({ eu: [team('Fake X')], na: [team('fake  x')] }), /duplicate of Tier B/);
bad(fixture({ eu: [team('Team Vitality')] }), /already exists in Tier A/);
bad(fixture({ eu: [team('Vitality Esports')] }), /already exists in Tier A/);
bad(fixture({ eu: [team('Fake A', [player('dup'), player('b1'), player('c1')])], na: [team('Fake B', [player('Dup'), player('b2'), player('c2')])] }), /is on both/);
bad({ regions: [{ id: 'eu', teams: [] }] }, /missing region/);
const ok = L.validate(fixture({ eu: [team('Fake One'), team('Fake Two')] }), { tierA });
assert.ok(ok.ok && ok.counts.eu === 2);

// runtime dedupe drops Tier A clashes
const tmp = path.join(require('os').tmpdir(), 'btier-test.json');
require('fs').writeFileSync(tmp, JSON.stringify(fixture({ eu: [team('Fake One'), team('Team Vitality'), team('Short', [player('a')])] })));
const lt = L.loadTeams([A26, A27], tmp);
assert.deepStrictEqual(lt.teams.map((t) => t.name), ['Fake One']);
assert.strictEqual(lt.dropped.length, 2);
require('fs').unlinkSync(tmp);

console.log('btier-loader: all tests passed');
