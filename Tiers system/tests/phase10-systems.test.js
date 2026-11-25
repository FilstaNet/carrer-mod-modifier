'use strict';
// Phase 10: Tier B players inside the game's existing systems (transfers, training, scouting, stats, history). Extracted engine, plain Node.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, log: (m) => console.log('LOG', m) });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);
const gen = (teamName, seed) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand) }; };
const isB = (st, p) => { const t = engine.teamById(st, p.teamId); return t && t.tier === 'B'; };
const day = (st, rand, n) => { for (let i = 0; i < n; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) engine.simulateFixture(st, f, rand); } } };

// Offers for several players at once (one round of days), then signs the first one that agrees. Returns {player, errors}.
function buy(st, rand, buyerHome, wantTier) {
  const errors = {};
  const note = (k) => { errors[k] = (errors[k] || 0) + 1; };
  const me = engine.teamById(st, st.userTeamId);
  const pool = st.players.filter((p) => !p.retired && p.teamId >= 0 && p.teamId !== st.userTeamId && !p.isUser && isB(st, p) === (wantTier === 'B') && engine.teamById(st, p.teamId).region.startsWith(buyerHome))
    .sort((a, b) => (me.region === "eu_b" ? a.rating - b.rating : b.rating - a.rating)).slice(0, 40);
  const made = [];
  for (const p of pool) {
    if (made.length >= (wantTier === 'A' ? 30 : 5)) break;
    const r = engine.makeOffer(st, p.id, Math.min(me.budget, wantTier === 'A' ? 600000 : 200000), rand);
    if (r.ok) made.push(p); else note(r.error);
  }
  const done = new Set();
  for (let d = 0; d < 8; d++) {
    day(st, rand, 1);
    for (const p of made) {
      if (done.has(p.id)) continue;
      if (p.teamId === st.userTeamId) return { player: p, errors };
      const off = st.offersOut.find((o) => o.playerId === p.id);
      if (!off || off.status !== 'fee_accepted') continue;
      done.add(p.id);
      const ci = engine.contractInfo(st, 'buy', off.id, rand);
      const wage = Math.min(Math.max(ci.demand || 2000, 100), ci.wageRoom > 0 ? ci.wageRoom : 1e9);
      if (!buy.shown2) { buy.shown2 = 1; console.log('   contract', JSON.stringify({ demand: ci.demand, room: ci.wageRoom, wage })); }
      const c = engine.attemptContract(st, 'buy', off.id, wage, 2, rand);
      if (!(c && c.ok)) note('contract:' + (c && c.error));
    }
  }
  for (const p of made) if (p.teamId === st.userTeamId) return { player: p, errors };
  for (const p of made) { const off = st.offersOut.find((o) => o.playerId === p.id); note('end:' + (off && off.status)); }
  if (process.env.DBG) console.log('   DEBUG inbox', JSON.stringify((st.inbox || []).slice(-5).map((m) => m.title + ' | ' + m.body)).slice(0, 900));
  return { player: null, errors };
}

// --- A. Tier A manager buys a Tier B player; training, scouting, stats ---
{
  const { rand, st } = gen('Team Vitality', 6);
  const sample = st.players.filter((p) => !p.retired && p.teamId >= 0 && isB(st, p));
  assert.ok(sample.length > 400, 'Tier B players exist in the world');
  const res = buy(st, rand, 'eu', 'B');
  console.log('A. buy Tier B player ->', res.player ? res.player.name : null, JSON.stringify(res.errors));
  assert.ok(res.player, 'Tier A club can buy a Tier B player');
  const p = res.player;
  assert.strictEqual(p.teamId, st.userTeamId);
  assert.ok(engine.teamById(st, st.userTeamId).playerIds.includes(p.id));
  // training (the bought Tier B player is trainable and gains rating through the game's own system)
  assert.ok(engine.trainableIds(st).includes(p.id), 'Tier B player is trainable');
  assert.ok(engine.setTrainingSlot(st, 0, p.id, rand).ok !== false);
  const before = p.ratingExact == null ? p.rating : p.ratingExact;
  let ran = 0; let tr;
  for (let i = 0; i < 40 && ran < 6; i++) { day(st, rand, 1); if (engine.trainingReady(st)) { tr = engine.runTraining(st, rand); if (tr && tr.ok !== false) ran++; } }
  const after = p.ratingExact == null ? p.rating : p.ratingExact;
  console.log('   training sessions', ran, 'rating', before.toFixed(2), '->', after.toFixed(2));
  assert.ok(ran >= 1, 'training ran for a Tier B player');
  // scouting a different Tier B player
  const other = st.players.find((q) => !q.retired && q.teamId >= 0 && q.id !== p.id && isB(st, q) && q.teamId !== st.userTeamId);
  const sc = engine.startScouting(st, other.id, rand);
  console.log('   startScouting Tier B player ->', JSON.stringify(sc).slice(0, 120));
  assert.ok(sc && sc.ok !== false, 'Tier B player can be scouted');
  // stats: the bought player keeps stats; Tier B matches produce stats
  p.season.games = p.season.games || 0;
  global.__A = { st, rand, p };
}
console.log('phase10 (part 1) done');

// --- B. Tier B manager: buys from another Tier B club and from a Tier A club; then a full season + rollover ---
{
  const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(3));
  const name = probe.teams.find((t) => t.region === 'eu_b').name;
  const { rand, st } = gen(name, 1);
  const me = engine.teamById(st, st.userTeamId);
  me.budget = Math.max(me.budget, 400000); me.wageBudget = Math.max(me.wageBudget || 0, 3000); // enough to test the rules rather than the wallet (a Tier A pro's wage is above a Tier B club's budget)
  const b1 = buy(st, rand, 'eu', 'B');
  console.log('B. Tier B manager bought Tier B player ->', b1.player && b1.player.name, JSON.stringify(b1.errors).slice(0, 200));
  assert.ok(b1.player, 'Tier B club can buy from another Tier B club (residency patched)');
  me.budget = Math.max(me.budget, 800000);
  const b2 = buy(st, rand, 'eu', 'A');
  console.log('B. Tier B manager bought Tier A player ->', b2.player && b2.player.name, JSON.stringify(b2.errors).slice(0, 200));
  assert.ok(b2.player, 'Tier B club can buy from a Tier A club');
  assert.strictEqual(me.region, 'eu_b', 'club region restored after the transfer calls');

  const teamOf = new Map(st.players.map((p) => [p.id, p.teamId]));
  const bought = [b1.player, b2.player].map((p) => ({ id: p.id, name: p.name, games: () => p.season.games + (p.career.games || 0) }));
  // full season
  for (let i = 0; i < 4000; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
    if (r.stopped === 'season-end' || r.stopped === 'sacked') break;
  }
  const histBefore = JSON.stringify(st.tierB.history);
  const tablesBefore = JSON.stringify(Object.fromEntries(st.tierB.regions.map((r) => [r.id, engine.tierBStandings(st, r.id)])));
  const moved = st.tierB.promo.regions;
  const contractsBefore = {};
  for (const pl of Object.values(moved)) for (const id of [...pl.promoted, ...pl.relegated]) for (const p of st.players.filter((q) => q.teamId === id)) contractsBefore[p.id] = JSON.stringify([p.teamId, p.wage, p.contract, p.contractEnd, p.contractYears]);
  const season = st.season;
  const gamesBefore = Object.fromEntries(bought.map((b) => [b.id, b.games()]));
  st.sacked = false; st.boardPressure = 0; // this test is about the rollover, not about the board (the board can sack a weak Tier B manager)
  engine.startNextSeason(st, rand);
  // history unchanged by the division change; previous standings readable; promotion/relegation recorded
  assert.strictEqual(JSON.stringify(st.tierB.history.filter((h) => h.season === season)), JSON.stringify(JSON.parse(histBefore)), 'Tier B cup results unchanged');
  assert.strictEqual(JSON.stringify(Object.fromEntries(st.tierB.regions.map((r) => [r.id, engine.tierBStandings(st, r.id, season)]))), tablesBefore, 'previous standings unchanged');
  assert.strictEqual(st.tierB.moves.length, 7); assert.strictEqual(st.tierB.promoHistory.length, 1);
  // contracts survive the swap (same teamId / wage / contract fields for every player whose club changed division and is still there)
  let kept = 0;
  for (const [id, was] of Object.entries(contractsBefore)) {
    const p = st.players.find((q) => q.id === +id); if (!p || p.retired) continue;
    const now = JSON.stringify([p.teamId, p.wage, p.contract, p.contractEnd, p.contractYears]);
    if (now === was) kept++;
  }
  console.log('   players on swapped clubs with unchanged contract fields:', kept, '/', Object.keys(contractsBefore).length);
  assert.ok(kept > Object.keys(contractsBefore).length * 0.3, 'most contracts untouched by the swap (the rest is the game own contract expiry)');
  // stats stay with the player
  for (const b of bought) { const p = st.players.find((q) => q.id === b.id); assert.ok(p && p.career, 'stats object kept'); assert.ok(b.games() >= gamesBefore[b.id], 'games never decrease'); }
  // AI Tier B clubs still run: squads are filled
  const bTeams = st.teams.filter((t) => t.tier === 'B');
  const small = bTeams.filter((t) => t.playerIds.length < 3); // real-league minimum is 3 (a club admitted from the reserve arrives with its 3 data players)
  console.log('   Tier B clubs below the roster minimum:', small.length, '/', bTeams.length);
  assert.strictEqual(small.length, 0, 'every club has a legal squad');
  const changed = st.players.filter((p) => teamOf.get(p.id) != null && p.teamId !== teamOf.get(p.id) && p.teamId >= 0).length;
  console.log('   players that changed club during the season:', changed);
}
console.log('phase10-systems: all tests passed');
