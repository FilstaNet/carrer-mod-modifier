'use strict';
// Phase 4 test: 7 regions x 6 cups, each 16 teams -> 4 GSL groups -> top 8 -> single elimination (32-team cups, 8 groups/top 16, still supported for old saves). Uses the game's own events.js.
const assert = require('assert');
const path = require('path');
const ev = require(path.join(__dirname, '..', '..', 'app_extracted', 'engine', 'events.js'));
const C = require('../src/engine/btier-cups');
const L = require('../src/engine/btier-loader');

const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// real Tier B data -> team ids (region index * 100 + n) with strength = mean baseStrength
const teams = L.flatten(L.loadRaw());
const regionIds = L.REGIONS.map((r) => r + '_b');
const strength = new Map();
const fields = {};
L.REGIONS.forEach((r, ri) => {
  const list = teams.filter((t) => t.homeRegion === r).map((t, n) => ({ id: ri * 100 + n, s: t.players.reduce((a, p) => a + p.baseStrength, 0) / 3 }));
  while (list.length < 32) list.push({ id: ri * 100 + list.length, s: 55 }); // SSA has 28 database teams; the legacy 32-team cups need 32
  list.forEach((t) => strength.set(t.id, t.s));
  fields[r + '_b'] = list.sort((a, b) => b.s - a.s).map((t) => t.id); // all 32 database teams; sliced per SIZE below
});
assert.strictEqual(Object.keys(fields).length, 7);

// the game's real season plan -> the 6 opens the cups run alongside
const plan = ev.buildSeasonPlan('2026-11-20', 1000, 'shortened', 1, 'rlcs');
const opens = plan.filter((e) => e.kind === 'open');
assert.strictEqual(opens.length, 6);
assert.deepStrictEqual(opens.map((o) => o.split), [1, 1, 1, 2, 2, 2]);

const plans = C.planSeasonCups(opens, regionIds);
assert.strictEqual(plans.length, 42, '7 regions x 6 cups');
assert.strictEqual(new Set(plans.map((p) => p.id)).size, 42);

const rand = mkRand(5);
// stronger team wins more often, never deterministic
const playSlot = (slot) => { const a = strength.get(slot.teamA); const b = strength.get(slot.teamB); const pA = 1 / (1 + Math.exp((b - a) / 6)); return rand() < pA ? slot.teamA : slot.teamB; };

for (const SIZE of [16, 32]) {
const G = SIZE / 4; const PO = SIZE / 2; const firstRound = SIZE === 32 ? 'P-r16' : 'P-qf';
let champsByRegion = {};
const seasonPoints = {};
for (const p of plans) {
  const field = fields[p.region].slice(0, SIZE);
  const cup = C.buildCup(ev, p, field);

  // structure
  assert.strictEqual(cup.field.length, SIZE);
  assert.strictEqual(cup.groups.length, G);
  cup.groups.forEach((g) => assert.strictEqual(g.seeds.length, 4));
  assert.strictEqual(new Set(cup.groups.flatMap((g) => g.seeds)).size, SIZE, 'every team in exactly one group');
  assert.strictEqual(cup.slots.length, G * 5 + PO - 1, 'GSL groups x 5 matches + playoff matches');
  // pots: each group holds one team from each quarter of the field
  cup.groups.forEach((g) => g.seeds.forEach((id, pot) => assert.strictEqual(Math.floor(field.indexOf(id) / G), pot)));

  C.runCup(ev, cup, playSlot);

  assert.strictEqual(cup.stage, 'done');
  assert.strictEqual(cup.playoffSeeds.length, PO);
  assert.strictEqual(new Set(cup.playoffSeeds).size, PO, 'distinct qualifiers');
  assert.strictEqual(cup.standings.length, SIZE);
  assert.deepStrictEqual(cup.standings.map((s) => s.placement), Array.from({ length: SIZE }, (_, i) => i + 1));
  assert.strictEqual(new Set(cup.standings.map((s) => s.teamId)).size, SIZE, 'placements cover every team once');
  assert.deepStrictEqual(new Set(cup.standings.map((s) => s.teamId)), new Set(field));
  assert.strictEqual(cup.championId, cup.standings[0].teamId);
  assert.ok(cup.slots.every((s) => s.winner != null), 'every match resolved');
  // top 2 of every group are exactly the qualifiers; no group-mates meet in the round of 16
  cup.groups.forEach((g, i) => assert.ok(g.seeds.includes(cup.playoffSeeds[i]) && g.seeds.includes(cup.playoffSeeds[G + i])));
  cup.slots.filter((s) => s.id.includes(firstRound)).forEach((s) => {
    const ga = cup.groups.findIndex((g) => g.seeds.includes(s.teamA));
    const gb = cup.groups.findIndex((g) => g.seeds.includes(s.teamB));
    assert.notStrictEqual(ga, gb, 'group-mates in round of 16');
  });
  // standings stay inside the region
  cup.standings.forEach((s) => assert.ok(fields[p.region].includes(s.teamId)));

  champsByRegion[p.region] = (champsByRegion[p.region] || 0) + 1;
  seasonPoints[p.region] = seasonPoints[p.region] || {};
  cup.standings.forEach((s) => { seasonPoints[p.region][s.teamId] = (seasonPoints[p.region][s.teamId] || 0) + s.points; });
}

// points: one cup awards 15+10+2*7+4*5+8*3 = 83 (16 teams) or + 8*2+8*1 = 107 (32 teams)
for (const r of regionIds) assert.strictEqual(Object.values(seasonPoints[r]).reduce((a, b) => a + b, 0), 6 * (SIZE === 32 ? 107 : 83), `season points ${r}`);
assert.strictEqual(C.pointsFor(1), 15);
assert.strictEqual(C.pointsFor(32), 1);
assert.strictEqual(C.pointsFor(33), 0);
// independence: a region's table only contains its own teams
regionIds.forEach((r) => Object.keys(seasonPoints[r]).forEach((id) => assert.ok(fields[r].includes(Number(id)))));
}

// bad input is rejected
assert.throws(() => C.drawGroups([1, 2, 3]), /16 or 32 unique/);
assert.throws(() => C.drawGroups(Array(16).fill(1)), /16 or 32 unique/);
assert.strictEqual(C.FIELD, 16);

console.log('btier-cups: all tests passed (42 cups, 7 regions x 6)');
