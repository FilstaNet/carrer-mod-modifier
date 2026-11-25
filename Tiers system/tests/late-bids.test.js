'use strict';
// Late game phase 3 part B: bids to host official events (Arena level 3). Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const late = engine.uxLate, X = late && late.bids;
assert(X, 'late bids installed');
late.REQ.major = 0; late.REQ.open = 0;
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const play = (st, rand, until, max = 600) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};
const fresh = (seed, arena = 3) => {
  const rand = mkRand(seed), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const t = engine.teamById(st, st.userTeamId); t.budget = 1e9; t.followers = 600000;
  for (let i = 1; i <= 4; i++) assert(engine.buyFacility(st, i).ok);
  engine.advance(st, rand, 'day');
  for (let l = 1; l <= arena; l++) { assert(rpc(st, { a: 'build', id: 'arena' }).ok); play(st, rand, () => late.build.level(st, 'arena') >= l, 300); }
  t.budget = 1e7; return { st, rand, t };
};
const view = (st) => rpc(st, { a: 'official' });
const openTarget = (st, rand) => { play(st, rand, () => view(st).targets.some((x) => x.status === 'open' && x.kind === 'major')); return view(st).targets.find((x) => x.status === 'open' && x.kind === 'major'); };

// ---- needs Arena level 3 ----
{
  const { st, rand } = fresh(1, 2); const t = openTarget(st, rand);
  assert(t, 'a Major window opens'); const r = rpc(st, { a: 'bid', key: t.key, amount: t.min });
  assert(!r.ok && /Arena/.test(r.error), 'level 2 is not enough: ' + r.error);
}

// ---- window and bid limits ----
{
  const { st, rand, t: club } = fresh(2); const v0 = view(st); assert(v0.readOnly && v0.arenaOk && v0.targets.length >= 2, 'targets listed');
  const later = v0.targets.find((x) => x.status === 'later'); if (later) assert(!rpc(st, { a: 'bid', key: later.key, amount: later.min }).ok, 'window not open yet');
  const t = openTarget(st, rand); assert(t && t.oddsMin && t.oddsMax, 'open window has odds');
  assert(!rpc(st, { a: 'bid', key: t.key, amount: t.min - 1000 }).ok && !rpc(st, { a: 'bid', key: t.key, amount: t.max + 1000 }).ok, 'bid must be inside the range');
  club.budget = 100; assert(!rpc(st, { a: 'bid', key: t.key, amount: t.min }).ok, 'you must be able to pay'); club.budget = 1e7;
  assert(rpc(st, { a: 'bid', key: t.key, amount: t.max }).ok, 'bid placed');
  assert(rpc(st, { a: 'bid_withdraw', key: t.key }).ok && !rpc(st, { a: 'bid_withdraw', key: t.key }).ok, 'withdraw once');
}

// ---- win: fee at closing, label on the Major, income + followers when it is over; one per season ----
{
  const { st, rand, t: club } = fresh(3); const t = openTarget(st, rand);
  assert(rpc(st, { a: 'bid', key: t.key, amount: t.max }).ok);
  const b = st.late.bids.list[0], b0 = club.budget;
  play(st, rand, () => b.status !== 'placed', 60);
  assert.strictEqual(b.status, 'won', 'a strong club with the top bid wins: ' + JSON.stringify(b.rivals));
  assert(JSON.stringify(st).includes('Hosting ' + b.name + ': production fee'), 'fee posted to the ledger'); assert(club.budget < b0 + 400000 - t.max / 2, 'and charged (other monthly income aside)'); assert(b.rivals.length === 4 && b.score > 0, 'rivals recorded');
  const e = st.events.find((x) => 'g' + x.id === t.key); assert(e.hostedBy === st.userTeamId && /Arena/.test(e.hostName), 'the Major is labelled'); assert(/Major$/.test(e.name) && !/Arena/.test(e.name), 'but a game Major keeps its name');
  assert.strictEqual(st.late.bids.won[st.season], t.key, 'one hosted event this season');
  const f0 = club.followers; play(st, rand, () => b.status === 'paid', 200);
  assert.strictEqual(b.status, 'paid', 'income arrives when the event is over'); assert(b.gross > 0 && club.followers > f0, 'income and followers');
  // a second bid in the same season is refused
  const other = view(st).targets.find((x) => x.key !== t.key && x.status === 'open'); if (other) assert(!rpc(st, { a: 'bid', key: other.key, amount: other.min }).ok, 'only one per season');
}

// ---- lose: a weak club does not win ----
{
  const { st, rand, t: club } = fresh(4); const t = openTarget(st, rand); club.followers = 1; late.REQ.major = 0;
  assert(rpc(st, { a: 'bid', key: t.key, amount: t.min }).ok); const b = st.late.bids.list[0], b0 = club.budget;
  play(st, rand, () => b.status !== 'placed', 60);
  assert.strictEqual(b.status, 'lost', 'a club with 1 follower loses'); assert(!JSON.stringify(st).includes('production fee'), 'nothing charged when you lose');
  assert(!(st.events.find((x) => 'g' + x.id === t.key) || {}).hostedBy, 'no label');
}

// ---- cannot pay at closing: the bid is void and followers drop ----
{
  const { st, rand, t: club } = fresh(5); const t = openTarget(st, rand);
  assert(rpc(st, { a: 'bid', key: t.key, amount: t.max }).ok); const b = st.late.bids.list[0]; club.budget = 10; const f0 = club.followers;
  play(st, rand, () => b.status !== 'placed', 60);
  assert.strictEqual(b.status, 'void', 'won but could not pay: void'); assert(club.followers < f0, 'followers dropped');
}

// ---- Kick-Off / EWC are really renamed (mod events) ----
{
  const { st } = fresh(6); const x = X.all(st).find((e) => e.mod && !e.done);
  if (x) {
    const base = x.ref.name;
    const b = { id: 99, key: x.key, kind: x.kind, name: x.name, start: x.start, season: st.season, amount: X.range(st, x.kind).max, status: 'placed' };
    st.late.bids = st.late.bids || { v: 1, seq: 1, list: [], won: {} }; st.late.bids.list.push(b);
    const t = engine.teamById(st, st.userTeamId); t.budget = 1e7; t.followers = 900000; st.currentDate = x.start; x.ref.stage = 'pending';
    X.daily(st);
    if (b.status === 'won') assert(/Arena/.test(x.ref.name) && x.ref.name.startsWith(base), 'the mod event carries your arena name'); else assert.strictEqual(b.status, 'lost');
  }
}
console.log('late-bids ok');
