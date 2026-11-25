'use strict';
// Phase 5: job offers and the club switch (late-manager.js). Real engine.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const M = engine.uxManager;
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(5);
let st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const A = st.userTeamId;
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } return r; };
const rpc = (o) => engine.placeBet(st, 'uxm:' + JSON.stringify(o), 0, 0, 0);
const team = (id) => engine.teamById(st, id);

// 1) a young reputation gets no offers
step(); step();
assert(M.reputation(st) < M.OFFER_REP && !(st.uxManager.offers || []).length, 'no offers yet');
assert.strictEqual(rpc({ a: 'accept', id: 1 }).ok, false, 'nothing to accept');

// 2) enough reputation: next season start brings 2 offers (different clubs, not the own club), as inbox mails
st.uxManager.points = 60; // reputation 30
for (let i = 0; i < 700; i++) if (step().stopped === 'season-end') break;
engine.startNextSeason(st, rand); const mails = st.inbox.length; step();
const d = st.uxManager; assert.strictEqual(d.offers.length, 2, 'two offers'); assert(st.inbox.length > mails);
assert(d.offers.every((o) => o.status === 'open' && o.teamId !== A && team(o.teamId).tier !== 'B') && d.offers[0].teamId !== d.offers[1].teamId, 'valid, distinct clubs');
const view = rpc({ a: 'status' }); assert(view.readOnly && view.offers.length === 2, 'status action');

// 3) declining closes one; accepting moves the manager, declines the rest, starts a grace period
const [o1, o2] = d.offers; assert(rpc({ a: 'decline', id: o1.id }).ok && o1.status === 'declined');
const honoursBefore = d.honours.length, bud = team(A).budget;
st.facility = st.facility || { tier: 2 }; st.boardPressure = 5.9;
const r = rpc({ a: 'accept', id: o2.id }); assert(r.ok, JSON.stringify(r));
assert.strictEqual(st.userTeamId, o2.teamId); assert.strictEqual(o2.status, 'accepted');
assert(!st.facility && st.strikes === 0 && !st.sacked && st.userRegion === team(o2.teamId).region, 'fresh start at the new club');
assert.strictEqual(d.honours.length, honoursBefore, 'honours stay'); assert.strictEqual(team(A).budget, bud, 'old club untouched');
assert.strictEqual(st.players.filter((p) => p.isUser).length, 1);
assert(st.clubStash[A].facility && st.clubStash[A].boardPressure === 5.9, 'old club bundle stashed');
step(); assert(d.stints.length === 2 && d.stints[0].end === 'moved' && !d.stints[1].end, 'stints');
assert.strictEqual(rpc({ a: 'accept', id: o2.id }).ok, false, 'cannot accept twice');

// 4) one move per season: no new offers until the next season; the grace period caps pressure
const n = d.offers.length; st.boardPressure = 5.9; step(); assert(st.boardPressure <= 4, 'pressure capped in the grace season'); assert.strictEqual(d.offers.length, n);

// 5) a whole season at the new club (grace: not sacked), save/load, offers expire, Tier B and player careers get none
for (let i = 0; i < 700; i++) if (step().stopped === 'season-end') break;
assert(!st.sacked, 'not sacked in the grace season');
engine.startNextSeason(st, rand); st = JSON.parse(JSON.stringify(st)); step(); step();
assert(st.uxManager.offers.length >= n, 'state survives save/load');
const old = st.uxManager.offers.filter((o) => o.status === 'open').length; assert(old <= 2);
st.uxManager.offers.forEach((o) => { o.expires = '2000-01-01'; }); step(); assert(st.uxManager.offers.every((o) => o.status !== 'open'), 'old offers expire');
const tb = JSON.parse(JSON.stringify(st)); const bt = tb.teams.find((t) => t.tier === 'B'); tb.userTeamId = bt.id; tb.uxManager.offerSeason = null; tb.uxManager.lastMove = null; tb.uxManager.offers = [];
for (let i = 0; i < 3; i++) engine.advance(tb, rand, 'day'); assert.strictEqual(tb.uxManager.offers.length, 0, 'Tier B gets no offers');
console.log('late-offers: ok');
// 7) the save is renamed once after a switch: "<club> (ST)", written by the game's own save function (simulated with fs.writeFileSync of a .json.tmp)
{
  const fs = require('fs'), os = require('os'), tmp = path.join(os.tmpdir(), 'uxm-save-test.json.tmp');
  const s2 = JSON.parse(JSON.stringify(st)); s2.uxManager.lastMove = null; s2.uxManager.offerSeason = null; s2.userTeamId = A; // back to a known club
  const target = s2.teams.find((t) => t.id !== A && t.tier !== 'B' && !t.nation);
  assert(engine.uxManager.switchClub(s2, target.id).ok);
  assert.strictEqual(engine.uxManager.pendingName(), target.name + ' (ST)');
  fs.writeFileSync(tmp, JSON.stringify({ name: 'My old name', savedAt: 'x', state: {} }, null, 1));
  assert.strictEqual(JSON.parse(fs.readFileSync(tmp, 'utf8')).name, target.name + ' (ST)', 'save renamed');
  assert.strictEqual(engine.uxManager.pendingName(), null, 'renamed once');
  fs.writeFileSync(tmp, JSON.stringify({ name: 'Manual rename', state: {} }, null, 1));
  assert.strictEqual(JSON.parse(fs.readFileSync(tmp, 'utf8')).name, 'Manual rename', 'later saves untouched');
  fs.unlinkSync(tmp);
}
console.log('late-offers save name: ok');
