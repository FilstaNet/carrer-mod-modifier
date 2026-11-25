'use strict';
// Reserve pool: hidden at start, one-time replacement of folded teams (with news), 3-5 prospects per region per season + 4-5 in the mid-season window, frozen ages.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const L = require('../src/engine/btier-loader');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const key = (n) => L.nameKeys(n)[0];

const rand = mkRand(7);
const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const R = st.tierB.reserve;

// 1. reserve is separate data: nothing of it is in the career's teams/players
const reserveTeams = Object.values(R.orgs).flat();
const youth0 = JSON.parse(JSON.stringify(R.youth));
assert.ok(L.REGIONS.every((r) => R.orgs[r].length === 4 && R.youth[r].length === (r === 'ssa' ? 24 : 36)));
const names = new Set(st.teams.map((t) => key(t.name)));
const pnames = new Set(st.players.map((p) => p.name.toLowerCase()));
assert.ok(reserveTeams.every((o) => !names.has(key(o.name))), 'reserve orgs are not teams');
const dupes = Object.values(R.youth).flat().filter((p) => pnames.has(p.name.toLowerCase())).map((p) => p.name); // namesakes already in the game are skipped at intake
console.log('   pool players with a namesake in the game (skipped on intake):', dupes.length);
assert.ok(!engine.clubPreview(real).some((r) => r.clubs.some((c) => reserveTeams.some((o) => o.name === c.name))), 'reserve hidden from the club list');

const play = () => { for (let i = 0; i < 4000; i++) { const r = engine.advance(st, rand, 'next'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } if (r.stopped === 'season-end') return; } throw new Error('no season end'); };

let folds = 0; let prospects = 0;
for (let s = 1; s <= 3; s++) {
  play();
  const before = new Map(st.teams.map((t) => [t.id, t.name]));
  const nPlayers = st.players.length;
  const pool = Object.values(R.youth).flat().length;
  engine.startNextSeason(st, rand);
  const ev2 = R.events.filter((e) => e.season === st.season);
  assert.strictEqual(R.lastSeason, st.season);
  for (const r of L.REGIONS) {
    assert.strictEqual(st.teams.filter((t) => t.region === r + '_b').length, 16, 'Tier B stays at 16 teams');
    const pr = ev2.find((e) => e.region === r + '_b' && e.prospects && !e.window);
    if (r === 'ssa' && s === 3 && !pr) continue; // SSA has a shallower pool (12 reserve teams); it runs dry in season 3
    assert.ok(pr && pr.prospects.length >= 3 && pr.prospects.length <= 5, r + ': 3-5 prospects (season ' + s + ', got ' + (pr ? pr.prospects.length : 'none') + ', pool ' + (R.youth[r] || []).length + ')');
    for (const n of pr.prospects) {
      const p = st.players.find((q) => q.name === n); const d = youth0[r].find((x) => x.name === n);
      assert.ok(!dupes.includes(n), 'namesake not introduced');
      assert.ok(p && p.teamId === -1 && p.freeAgent && !p.retired, 'prospect is a free agent');
      assert.strictEqual(st.players.filter((q) => q.name === n).length, 1, 'no duplicate player name');
      assert.strictEqual(p.age, d.age, 'age = the fixed pool age, not aged while waiting');
      assert.ok(!R.youth[r].some((x) => x.name === n), 'removed from the pool');
    }
    prospects += pr.prospects.length;
  }
  for (const f of ev2.filter((e) => e.left)) {
    folds++;
    const t = engine.teamById(st, f.teamId);
    assert.strictEqual(t.name, f.joined); assert.strictEqual(before.get(t.id), f.left);
    assert.strictEqual(t.region, f.region); assert.ok(t.playerIds.length === 3 && t.playerIds.every((id) => engine.playerById(st, id).teamId === t.id));
    assert.ok(t.id !== st.userTeamId);
    assert.ok(st.news.some((n) => /cease operations/.test(n.headline) && n.headline.includes(f.left) && n.body.includes(f.joined)), 'news item');
    assert.ok(!Object.values(R.orgs).flat().some((o) => o.name === f.joined), 'removed from the reserve');
  }
  assert.strictEqual(new Set(st.players.map((p) => p.id)).size, st.players.length, 'unique player ids');
  assert.ok(Object.values(R.youth).flat().length < pool);
}
assert.ok(folds > 0 && prospects >= 7 * 3, `folds ${folds}, prospects ${prospects}`);
// never reintroduced: every introduced org key is unique, and no two live teams share a name
assert.strictEqual(new Set(R.introduced).size, R.introduced.length);
assert.strictEqual(new Set(st.teams.map((t) => key(t.name))).size, st.teams.length);
// idempotent + save round trip
const copy = JSON.parse(JSON.stringify(st));
assert.deepStrictEqual(copy.tierB.reserve, R);
const mids = R.events.filter((e) => e.window === 'mid');
assert.ok(mids.length >= 7 && mids.every((e) => e.prospects.length >= 1 && e.prospects.length <= 5), 'mid-season window brings up to 5 prospects per region');
assert.ok(R.lastMid != null, 'mid-season intake ran');
console.log(`btier-reserve: all tests passed (${folds} replacements, ${prospects} prospects in 3 seasons)`);
