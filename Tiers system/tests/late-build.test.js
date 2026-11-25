'use strict';
// Late game phase 1a: facility tree engine (build, queue, charge, upkeep, mode rules, mothball). Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const B = require('../src/engine/late-build').install(engine); // idempotent: also installed by btier-state once wired
assert(B && engine.uxLate.build === B, 'late build installed');
engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const fresh = (seed, hq = 4, mode) => {
  const rand = mkRand(seed), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const t = engine.teamById(st, st.userTeamId); t.budget = 1e9;
  for (let i = 1; i <= hq; i++) assert(engine.buyFacility(st, i).ok, 'test HQ tier ' + i);
  engine.advance(st, rand, 'day'); // unlocks the late game
  if (mode) assert(rpc(st, { a: 'mode', mode }).ok);
  return { rand, st, t };
};
const play = (st, rand, until, max = 400) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};

// ---- build rules: HQ requirement, charge, queue of two, one level at a time ----
{
  const { rand, st, t } = fresh(1, 3);
  assert.strictEqual(B.hq(st), 3);
  assert.strictEqual(rpc(st, { a: 'build', id: 'arena' }).ok, false, 'Arena needs HQ 4');
  assert.strictEqual(rpc(st, { a: 'build', id: 'nope' }).ok, false, 'unknown building');
  const b0 = t.budget, n0 = (st.ledger || []).length, r = rpc(st, { a: 'build', id: 'scouting' });
  assert(r.ok, r.error); assert.strictEqual(t.budget, b0 - 250000, 'level 1 charged at start (Standard x1.0)');
  assert.strictEqual(st.ledger.length, n0 + 1); assert.strictEqual(st.ledger[st.ledger.length - 1].kind, 'late');
  assert.strictEqual(r.entry.end, new Date(Date.parse(st.currentDate) + 14 * 86400000).toISOString().slice(0, 10), 'L1 takes 14 days');
  assert.strictEqual(rpc(st, { a: 'build', id: 'scouting' }).ok, false, 'not twice at once');
  assert(rpc(st, { a: 'build', id: 'fanzone' }).ok, 'second build fits');
  assert.strictEqual(rpc(st, { a: 'build', id: 'studio' }).ok, false, 'third refused: two builds at a time');
  const q = rpc(st, { a: 'facilities' }); assert.strictEqual(q.queue.length, 2); assert.strictEqual(q.list.length, 8);
  assert.strictEqual(B.level(st, 'scouting'), 0, 'not usable while building'); assert.strictEqual(B.effect(st, 'scouting'), 0);
  play(st, rand, () => B.level(st, 'scouting') === 1);
  assert.strictEqual(B.level(st, 'scouting'), 1, 'finished after the days'); assert.strictEqual(B.effect(st, 'scouting'), 1);
  assert(st.inbox.some((m) => /Scouting Network level 1 is ready/.test(m.title)), 'mail when ready');
  const r2 = rpc(st, { a: 'build', id: 'scouting' }); assert(r2.ok && r2.entry.level === 2 && r2.entry.cost === 1000000, 'level 2 next');
  const broke = fresh(2, 3); broke.t.budget = 1000; const b1 = broke.t.budget;
  assert.strictEqual(rpc(broke.st, { a: 'build', id: 'fanzone' }).ok, false, 'not enough budget'); assert.strictEqual(broke.t.budget, b1, 'no charge');
}

// ---- mode price scaling and max level ----
{
  const r = fresh(3, 3, 'ruthless'), x = fresh(3, 3, 'relaxed');
  assert.strictEqual(rpc(r.st, { a: 'build', id: 'fanzone' }).entry.cost, 325000, 'Ruthless x1.3');
  assert.strictEqual(rpc(x.st, { a: 'build', id: 'fanzone' }).entry.cost, 200000, 'Relaxed x0.8');
  const { rand, st } = fresh(4, 4);
  for (let l = 1; l <= 3; l++) { assert(rpc(st, { a: 'build', id: 'arena' }).ok, 'arena level ' + l); play(st, rand, () => B.level(st, 'arena') === l, 600); assert.strictEqual(B.level(st, 'arena'), l); }
  assert.strictEqual(rpc(st, { a: 'build', id: 'arena' }).ok, false, 'level 3 is the top');
}

// ---- upkeep and the three neglect rules ----
{
  const mk = (mode) => { const o = fresh(5, 3, mode); assert(rpc(o.st, { a: 'build', id: 'fanzone' }).ok); play(o.st, o.rand, () => B.level(o.st, 'fanzone') === 1); return o; };
  const s = mk('standard'), t = s.t, due = B.upkeepDue(s.st);
  assert.strictEqual(due, Math.round(200000 * 0 + 250000 * 0.007), 'upkeep = 0.7% of invested value');
  const b0 = t.budget; B.upkeep(s.st); assert.strictEqual(t.budget, b0 - due, 'paid monthly'); assert(!s.st.late.clubs[s.st.userTeamId].unpaid);
  t.budget = 0; B.upkeep(s.st); assert.strictEqual(t.budget, 0, 'no negative budget'); assert.strictEqual(B.effect(s.st, 'fanzone'), 0.5, 'Standard: half effect while unpaid');
  t.budget = 1e6; B.upkeep(s.st); assert.strictEqual(B.effect(s.st, 'fanzone'), 1, 'effect returns once paid');

  const x = mk('relaxed'); x.t.budget = 0; B.upkeep(x.st); assert.strictEqual(B.effect(x.st, 'fanzone'), 1, 'Relaxed: upkeep just pauses, no loss');
  const r = mk('ruthless'); r.t.budget = 0;
  for (let i = 0; i < 11; i++) B.upkeep(r.st); assert.strictEqual(B.level(r.st, 'fanzone'), 1, 'still standing after 11 unpaid months');
  B.upkeep(r.st); assert.strictEqual(B.level(r.st, 'fanzone'), 0, 'Ruthless: loses a level after a year unpaid'); assert.strictEqual(B.upkeepDue(r.st), 0, 'no upkeep on a lost level');
}

// ---- mothball on relegation, save/load ----
{
  const { rand, st, t } = fresh(6, 3);
  assert(rpc(st, { a: 'build', id: 'fanzone' }).ok); play(st, rand, () => B.level(st, 'fanzone') === 1);
  assert(rpc(st, { a: 'build', id: 'studio' }).ok); const end = st.late.clubs[st.userTeamId].queue[0].end;
  const snap = JSON.stringify(st.late); t.tier = 'B';
  assert.strictEqual(B.effect(st, 'fanzone'), 0, 'no effect while mothballed'); assert.strictEqual(rpc(st, { a: 'build', id: 'scouting' }).ok, false, 'no building while mothballed');
  play(st, rand, () => st.currentDate >= end, 60); assert.strictEqual(JSON.stringify(st.late), snap, 'queue frozen, nothing charged or lost');
  t.tier = 'A'; engine.advance(st, rand, 'day'); assert.strictEqual(B.level(st, 'studio'), 1, 'construction completes once promoted again');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(st.late)), st.late, 'state survives save and load');
}
// ---- UI contract: read-only actions carry data with ok:false, the Museum is locked, effect text comes from the engine ----
{
  const { st, t } = fresh(9, 4);
  const v = rpc(st, { a: 'facilities' }); assert.strictEqual(v.ok, false, 'read-only: ok:false so the game does not replace the state with its own answer'); assert.strictEqual(v.readOnly, true);
  assert.strictEqual(v.hq, 4); assert.strictEqual(v.list.length, 8);
  const museum = v.list.find((x) => x.id === 'museum'); assert(!museum.locked && museum.canStart && /Tickets/.test(museum.next), 'the Museum can be built since the Legacy update: ' + museum.next);
  const b0 = t.budget; const r = rpc(st, { a: 'build', id: 'museum' }); assert.strictEqual(r.ok, true); assert.strictEqual(t.budget, b0 - 250000, 'level 1 charged');
  const arena = v.list.find((x) => x.id === 'arena'); assert(arena.canStart && arena.next === 'Gate $40K/month, followers +0.2%/month' && arena.now === '', 'effect text: now / next level: ' + arena.next);
  assert.strictEqual(rpc(st, { a: 'status' }).ok, false); assert.strictEqual(rpc(st, { a: 'status' }).active, true);
}
// ---- the difficulty mode locks: by choosing it, or by the first build (which keeps the default) ----
{
  const a = fresh(10, 3); assert.strictEqual(a.st.late.modeChosen, false, 'unchosen at the start');
  assert(rpc(a.st, { a: 'build', id: 'fanzone' }).ok); assert.strictEqual(a.st.late.modeChosen, true, 'the first build locks the mode'); assert.strictEqual(a.st.late.mode, 'standard');
  const r = rpc(a.st, { a: 'mode', mode: 'relaxed' }); assert.strictEqual(r.ok, false); assert(/locked/.test(r.error)); assert.strictEqual(engine.uxLate.scale(a.st, 'price'), 1, 'the rules did not change');
  const b = fresh(10, 3); b.t.budget = 10; assert.strictEqual(rpc(b.st, { a: 'build', id: 'fanzone' }).ok, false); assert.strictEqual(b.st.late.modeChosen, false, 'a refused build locks nothing');
  assert(rpc(b.st, { a: 'mode', mode: 'ruthless' }).ok, 'still free to choose');
}
console.log('late-build ok');
