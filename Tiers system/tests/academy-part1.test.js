'use strict';
// Academy part 1: eligibility, window, pricing, no double charge. Pure logic on a hand-made state (no game engine needed).
const assert = require('assert');
const A = require('../src/engine/academy');
const mk = (budget = 1e7) => ({ season: 1, userTeamId: 7, currentDate: '2027-01-01', teams: [{ id: 7, budget }], events: [] });
const major = (i, place, stage = 'done') => ({ kind: 'major', index: i, stage, standings: [{ teamId: 7, placement: place }] });
const nextSeason = (s) => { A.scan(s); s.season++; s.events = []; A.seasonRoll(s); };

// Top 8 once; eligibility starts next season, not now
let s = mk(); s.events = [major(1, 8)]; A.scan(s); A.scan(s);
assert.strictEqual(A.status(s), 'hidden'); assert.deepStrictEqual(A.buy(s), { ok: false, reason: 'not-eligible' });
nextSeason(s); assert.strictEqual(A.status(s), 'closed');
// pricing 400 -> 300 -> 200 -> 100, no charge twice, funds check
assert.strictEqual(A.buy(s).price, 400000); assert.strictEqual(A.buy(s).reason, 'already-bought'); assert.strictEqual(s.teams[0].budget, 9600000);
assert.strictEqual(A.status(s), 'open');
nextSeason(s); assert.strictEqual(A.status(s), 'closed'); assert.strictEqual(s.teams[0].budget, 9600000); // never automatic
assert.strictEqual(A.buy(s).price, 300000);
nextSeason(s); s.events = [major(2, 13)]; A.scan(s); // Top 13 does nothing
assert.strictEqual(A.buy(s).price, 200000);
s.events.push(major(3, 4)); A.scan(s); assert.strictEqual(A.ensure(s).until, 7); // refresh: 4 -> 7
nextSeason(s); assert.strictEqual(A.buy(s).price, 100000);
nextSeason(s); assert.strictEqual(A.buy(s).price, 100000);
nextSeason(s); assert.strictEqual(A.buy(s).price, 100000); // season 7, last of window
nextSeason(s); assert.strictEqual(A.status(s), 'hidden'); // season 7: expired
// requalify (Worlds field) -> next season 200K then 100K
s.events = [{ kind: 'worlds', field: [1, 7, 9], stage: 'groups' }]; A.scan(s); A.scan(s);
assert.strictEqual(A.status(s), 'hidden'); nextSeason(s);
assert.strictEqual(A.buy(s).price, 200000); nextSeason(s); assert.strictEqual(A.buy(s).price, 100000);
// insufficient funds
const p = mk(1000); p.events = [major(1, 3)]; nextSeason(p);
assert.deepStrictEqual(A.buy(p), { ok: false, reason: 'funds', price: 400000 }); assert.strictEqual(p.teams[0].budget, 1000); assert.strictEqual(A.status(p), 'closed');
// two Top 12 finishes (not Top 8) -> eligible; one is not enough; same event is not counted twice
const t = mk(); t.events = [major(1, 12)]; A.scan(t); A.scan(t); nextSeason(t); assert.strictEqual(A.status(t), 'hidden');
t.events = [major(1, 11)]; A.scan(t); A.scan(t); assert.strictEqual(A.ensure(t).from, 3);
// Top 13 does not count; unfinished Major does not count; old save (no state.academy) works
const u = mk(); u.events = [major(1, 13), major(2, 1, 'groups')]; A.scan(u); assert.strictEqual(A.ensure(u).from, null);
// lapsed without ever buying keeps the first-purchase price
const v = mk(); v.events = [major(1, 1)]; nextSeason(v); nextSeason(v); nextSeason(v); nextSeason(v); assert.strictEqual(A.status(v), 'hidden');
v.events = [major(1, 1)]; nextSeason(v); assert.strictEqual(A.price(v), 400000);
// survives a JSON save/load
const w = JSON.parse(JSON.stringify(s)); assert.strictEqual(A.status(w), A.status(s)); assert.strictEqual(A.price(w), A.price(s));
console.log('academy part 1: all assertions passed');
// Part 2 plumbing: the renderer buys through the game's set-training channel; normal training calls pass through untouched
{
  const eng = { setTrainingSlot: (st, i, pid) => ({ ok: true, passed: [i, pid] }), advance() {}, startNextSeason() {} };
  A.wrap(eng, () => {});
  const x = mk(); x.events = [major(1, 1)]; nextSeason(x);
  assert.deepStrictEqual(eng.setTrainingSlot(x, 2, 5), { ok: true, passed: [2, 5] });
  assert.strictEqual(eng.setTrainingSlot(x, 'academy-buy').ok, true); assert.strictEqual(eng.academyStatus(x).status, 'open');
  console.log('academy part 2 plumbing ok');
}
// Part 3: session start rules + missed competitions
{
  const x = mk(); x.userRegion = 'eu'; x.currentDate = '2027-03-01';
  x.teams[0].playerIds = [1, 2, 3]; x.events = [major(1, 1)]; nextSeason(x); x.currentDate = '2027-03-01';
  assert.strictEqual(A.startSession(x, { days: 20, slots: [1] }).reason, 'closed'); A.buy(x);
  assert.strictEqual(A.startSession(x, { days: 13, slots: [1] }).reason, 'days');
  assert.strictEqual(A.startSession(x, { days: 61, slots: [1] }).reason, 'days');
  assert.strictEqual(A.startSession(x, { days: 20, slots: [null, null] }).reason, 'empty');
  assert.strictEqual(A.startSession(x, { days: 20, slots: [9] }).reason, 'players');
  x.events = [{ kind: 'open', name: 'A', startDate: '2027-03-10', endDate: '2027-03-12', stage: 'pending' }, { kind: 'open', name: 'B', startDate: '2027-03-21', endDate: '2027-03-23', stage: 'pending' },
    { kind: 'major', name: 'C', startDate: '2027-03-15', endDate: '2027-03-16', stage: 'groups', field: [8, 9] }, { kind: 'major', name: 'D', startDate: '2027-03-18', endDate: '2027-03-19', stage: 'groups', field: [7] }];
  assert.deepStrictEqual(A.missed(x, 20).map((m) => m.name + (m.unconfirmed ? '?' : '')), ['A?', 'D']); // B starts on the day the session ends (21 Mar), C has no user
  assert.strictEqual(A.missed(x, 20).length, 2); assert.strictEqual(A.missed(x, 30).length, 3);
  const r = A.startSession(x, { days: 14, slots: [1, 1, null, 2, 3, null, null, null, null, null, null, 3] });
  assert.ok(r.ok); assert.strictEqual(A.status(x), 'training'); assert.strictEqual(x.academy.session.end, '2027-03-15');
  assert.strictEqual(A.startSession(x, { days: 14, slots: [1] }).reason, 'busy');
  assert.strictEqual(A.buy(x).reason, 'already-bought');
}
