'use strict';
// Academy part 4 on the real (wrapped) game engine: availability in real matches, one-time rating gain, save/load, season roll.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: require(path.join(APP, 'engine', 'events.js')) });
const A = require('../src/engine/academy');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(7);

// gain curve: diminishing returns, modest
{
  const g = (d, n = 1) => A.gainFor(d, n, 60);
  assert.ok(5 * g(14) > g(70), '5 short sessions beat one long one'); assert.ok(2 * g(14) > g(28));
  assert.ok(g(60) > g(14) && g(60) < 5, 'longer is more in total'); assert.ok(g(14, 12) <= 2 * g(14) + 1e-9, 'stacking one player is capped');
  assert.ok(A.gainFor(14, 1, 90) < A.gainFor(14, 1, 60), 'high ratings gain less');
}

const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const team = engine.teamById(st, st.userTeamId);
const ids = team.playerIds.filter((id) => !engine.playerById(st, id).isUser);
// make the club eligible and open (as part 1/2 would have done)
const a = A.ensure(st); a.from = st.season; a.until = st.season + 2; team.budget = 5e6;
assert.strictEqual(A.status(st), 'closed'); assert.ok(A.buy(st).ok); assert.strictEqual(A.status(st), 'open');
const before = new Map(ids.map((id) => [id, engine.playerById(st, id).ratingExact == null ? engine.playerById(st, id).rating : engine.playerById(st, id).ratingExact]));
// a player in a Training slot cannot be sent to the Academy; one at the Academy cannot be put in Training
engine.setTrainingSlot(st, 0, ids[1]);
const rb = A.startSession(st, { days: 30, slots: [ids[0], ids[1]] });
assert.ok(!rb.ok && rb.reason === 'training' && rb.error, 'Academy start refused while in Training'); assert.strictEqual(A.status(st), 'open');
engine.setTrainingSlot(st, 0, null);
const r0 = A.startSession(st, { days: 30, slots: [ids[0], ids[0], null, ids[1]] });
assert.ok(r0.ok); assert.strictEqual(A.status(st), 'training');
for (const id of [ids[0], ids[1]]) assert.ok(!engine.isAvailable(st, engine.playerById(st, id)), 'assigned player unavailable');
assert.ok(engine.isAvailable(st, engine.playerById(st, ids[2])), 'others stay available');
{ const t = engine.setTrainingSlot(st, 0, ids[0]); assert.ok(t.ok === false && t.error, 'no Training for a player at the Academy'); assert.ok(engine.setTrainingSlot(st, 0, ids[2]).ok, 'others can train'); engine.setTrainingSlot(st, 0, null); }

// run the real calendar: no match of the user's during the session may use an assigned player; clone mid-session = save/load
const end = st.academy.session.end; let cloned = null, ratingAtEnd = null, plays = 0;
for (let i = 0; i < 4000 && st.currentDate <= end; i++) {
  const r = engine.advance(st, rand, 'day');
  if (st.academy.session.active) {
    assert.strictEqual(A.status(st), 'training');
    const lineup = engine.userLineup(st).map((p) => p.id);
    assert.ok(!lineup.includes(ids[0]) && !lineup.includes(ids[1]), 'assigned players not in the lineup on ' + st.currentDate);
    if (!cloned && st.currentDate > st.academy.session.start) cloned = JSON.parse(JSON.stringify(st));
    assert.strictEqual(engine.playerById(st, ids[0]).rating, Math.floor(before.get(ids[0])), 'no gain while running');
  }
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); plays++; } }
}
assert.ok(!st.academy.session.active && st.academy.session.rewarded, 'session finished');
assert.strictEqual(A.status(st), 'open');
const gain = (id) => (engine.playerById(st, id).ratingExact || engine.playerById(st, id).rating) - before.get(id);
const G = st.academy.session.gains; assert.ok(G[ids[0]] > G[ids[1]] && G[ids[1]] > 0, 'stacked player gains more: ' + JSON.stringify(G));
assert.ok(Math.abs(G[ids[0]] - A.gainFor(30, 2, before.get(ids[0]))) < 0.01, 'reported gain follows the formula');
assert.ok(Math.abs(gain(ids[2])) < 0.3, 'unassigned player only has the game own drift: ' + gain(ids[2])); assert.ok(gain(ids[0]) > 0 && gain(ids[1]) > 0 && gain(ids[0]) < 2);
for (const id of [ids[0], ids[1]]) assert.ok(engine.isAvailable(st, engine.playerById(st, id)), 'back after the session');
// reward never twice: more days, more ticks
const once = engine.playerById(st, ids[0]).ratingExact;
for (let i = 0; i < 5; i++) { engine.advance(st, rand, 'day'); A.tick(st); A.finish(st); }
assert.strictEqual(engine.playerById(st, ids[0]).ratingExact, once);
// a second session can be started (status open again, the season is paid)
assert.ok(A.startSession(st, { days: 14, slots: [ids[2]] }).ok);

// save/load in the middle of a session: rebuilt from JSON the status is training, players are unavailable, the end still pays once
{
  const L = cloned; assert.strictEqual(A.status(L), 'training');
  assert.ok(!engine.isAvailable(L, engine.playerById(L, ids[0])));
  L.players.forEach((p) => { if (p.absence && p.absence.academy) p.absence = null; }); // lost absences (e.g. old save) are restored by the next tick
  A.tick(L); assert.ok(!engine.isAvailable(L, engine.playerById(L, ids[0])));
  for (let i = 0; i < 40; i++) engine.advance(L, rand, 'day');
  assert.strictEqual(A.status(L), 'open'); assert.ok(engine.playerById(L, ids[0]).ratingExact > before.get(ids[0]));
  const once2 = engine.playerById(L, ids[0]).ratingExact; A.finish(L); A.tick(L); assert.strictEqual(engine.playerById(L, ids[0]).ratingExact, once2);
}

// a session running over the season change is neither reset nor paid twice, and the roll does not charge
{
  const S2 = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(11));
  const t2 = engine.teamById(S2, S2.userTeamId); const i2 = t2.playerIds.filter((id) => !engine.playerById(S2, id).isUser);
  const a2 = A.ensure(S2); a2.from = 1; a2.until = 1; t2.budget = 5e6; A.buy(S2);
  let end2 = null;
  for (let i = 0; i < 4000; i++) { const r = engine.advance(S2, rand, 'next'); if (r.stopped === 'matchday') { const f = engine.fixtureById(S2, r.fixtureId); if (f && !f.played) { engine.simulateFixture(S2, f, rand); engine.nextUserSeries(S2, rand, f.id); } } if (r.stopped === 'season-end') break; }
  assert.ok(A.startSession(S2, { days: 20, slots: [i2[0]] }).ok); const buys = (S2.ledger || []).filter((x) => x.kind === 'academy').length, s0 = S2.academy.session.start;
  engine.startNextSeason(S2, rand);
  assert.strictEqual(S2.season, 2); assert.strictEqual((S2.ledger || []).filter((x) => x.kind === 'academy').length, buys, 'no academy charge on roll'); assert.strictEqual(S2.academy.paidSeason, 1);
  for (let i = 0; i < 40; i++) { const r = engine.advance(S2, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(S2, r.fixtureId); if (f && !f.played) { engine.simulateFixture(S2, f, rand); engine.nextUserSeries(S2, rand, f.id); } } } // play the matchdays (a Swiss match blocks the calendar until it is played)
  assert.ok(!S2.academy.session.active && S2.academy.session.rewarded && S2.academy.session.start === s0, 'session survived the roll and finished');
  assert.strictEqual(A.status(S2), 'closed', 'new season: unpaid again (a Major result of season 1 opened a new window), never charged automatically');
}
// a real match day inside a 60-day session: the user's lineup for the match has none of the assigned players
{
  const S3 = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(5));
  const t3 = engine.teamById(S3, S3.userTeamId); const i3 = t3.playerIds.filter((id) => !engine.playerById(S3, id).isUser);
  const a3 = A.ensure(S3); a3.from = 1; a3.until = 3; t3.budget = 5e6; A.buy(S3); assert.ok(A.startSession(S3, { days: 60, slots: [i3[0], i3[1]] }).ok);
  let m = 0;
  for (let i = 0; i < 400 && S3.currentDate < S3.academy.session.end; i++) {
    const r = engine.advance(S3, mkRand(i), 'next');
    if (r.stopped === 'matchday') {
      const f = engine.fixtureById(S3, r.fixtureId);
      if (f && !f.played && S3.currentDate < S3.academy.session.end) { m++; const l = engine.userLineup(S3).map((p) => p.id); assert.ok(!l.includes(i3[0]) && !l.includes(i3[1])); }
      if (f && !f.played) { engine.simulateFixture(S3, f, mkRand(i)); engine.nextUserSeries(S3, mkRand(i), f.id); }
    }
  }
  assert.ok(m > 0, 'at least one real user match day fell inside the session'); plays += m;
}
console.log('academy part 4: all assertions passed (' + plays + ' user matches played during the run)');
