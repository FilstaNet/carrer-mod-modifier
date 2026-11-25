'use strict';
// Y phase 4: capped consequences. Unit checks on a stub engine, then an integration run on a real career.
const assert = require('assert');
const path = require('path');
const fxm = require('../src/engine/ux-fx');
const mkState = () => ({ currentDate: '2027-01-10', nextId: 1, userTeamId: 1, userPlayerId: 7, inbox: [], mediaOffers: [], social: { ux: {} }, players: [{ id: 7, teamId: 1, followers: 100000, morale: 70 }, { id: 8, teamId: 1, followers: 50000, morale: 70 }], teams: [{ id: 1, playerIds: [7, 8], followers: 200000 }] });
const eng = { teamById: (st, id) => st.teams.find((t) => t.id === id), playerById: (st, id) => st.players.find((p) => p.id === id), adjustMorale: (p, d) => { p.morale = Math.round((p.morale + d) * 10) / 10; } };
const mk = (st) => fxm.create(eng, { ux: (s) => s.social.ux });
// rep is clamped to +-10 and decays
let st = mkState(), fx = mk(st);
for (let i = 0; i < 30; i++) fx.addRep(st, 2, 't'); assert.strictEqual(fx.state(st).rep, 10, 'rep tops out at 10');
for (let i = 0; i < 30; i++) fx.addRep(st, -2, 't'); assert.strictEqual(fx.state(st).rep, -10, 'and bottoms out at -10');
assert(fx.state(st).log.length <= 20, 'log stays small');
st = mkState(); fx = mk(st); fx.addRep(st, 10, 't');
fx.tick(st, st.currentDate); assert(fx.state(st).rep < 10 && fx.state(st).rep > 9, 'decays a little each day');
// followers: at most 0.3% a day at max reputation
const f0 = st.players[0].followers; fx.tick(st, st.currentDate);
assert(st.players[0].followers - f0 <= Math.round(f0 * 0.003) && st.players[0].followers > f0, 'follower nudge is small and positive');
// morale: never more than +-3 per player per 7 days from Y, and the allowance resets
st = mkState(); fx = mk(st); const p = st.players[0];
for (let i = 0; i < 20; i++) fx.onCallout(st, p);
assert(p.morale >= 67, 'morale from Y is capped at -3 a week, got ' + p.morale);
st.currentDate = '2027-01-18'; fx.onCallout(st, p); assert(p.morale < 67, 'the allowance resets after a week');
// media offers: fee nudged once, +-10% at most
st = mkState(); fx = mk(st); fx.addRep(st, 10, 't'); st.mediaOffers.push({ fee: 1000 });
fx.onOffers(st); fx.onOffers(st); assert.strictEqual(st.mediaOffers[0].fee, 1100, 'fee +10% once');
// a cocky post after a loss costs reputation and part of the follower gain; humble after a loss earns sympathy
st = mkState(); fx = mk(st); let res = { ok: true, gain: 100 }; const fol = st.players[0].followers;
fx.onUserPost(st, { tone: 'cocky' }, { kind: 'loss' }, res);
assert.strictEqual(res.gain, 60); assert.strictEqual(st.players[0].followers, fol - 40); assert(fx.state(st).rep < 0);
res = { ok: true, gain: 100 }; fx.onUserPost(st, { tone: 'apology' }, { kind: 'loss' }, res); assert.strictEqual(res.gain, 120);
// notices reach the inbox once
st = mkState(); fx = mk(st); fx.addRep(st, 8, 't'); fx.tick(st, st.currentDate); fx.tick(st, st.currentDate);
assert.strictEqual(st.inbox.filter((m) => /buzzing/.test(m.title)).length, 1, 'one inbox note when the mood turns');
// integration: a real manager career keeps every invariant
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, brandsFile: path.join(APP, 'data', 'media-brands.json') });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
let s = 3; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const g = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const start = g.players.filter((x) => x.teamId === g.userTeamId).map((x) => x.followers);
for (let i = 0; i < 160; i++) { const r = engine.advance(g, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(g, r.fixtureId); if (f && !f.played) { engine.simulateFixture(g, f, rand); engine.nextUserSeries(g, rand, f.id); } } }
const F = g.social.ux.fx;
console.log('rep', F.rep, 'log', F.log.length, 'offers flagged', g.mediaOffers.filter((o) => o.fx).length + '/' + g.mediaOffers.length);
assert(F && Math.abs(F.rep) <= 10 && F.log.length > 0, 'the feed moved the reputation');
assert(Object.values(F.mor).every((m) => Math.abs(m.t) <= 3), 'weekly morale cap held');
assert(g.mediaOffers.every((o) => o.fx), 'every media offer was adjusted exactly once');
g.players.filter((x) => x.teamId === g.userTeamId).forEach((x, i) => assert(x.morale >= 0 && x.morale <= 100));
delete g.social.ux.fx; engine.advance(g, rand, 'day'); assert(g.social.ux.fx, 'old saves get the state on first use');
JSON.parse(JSON.stringify(g.social));
console.log('ok');
