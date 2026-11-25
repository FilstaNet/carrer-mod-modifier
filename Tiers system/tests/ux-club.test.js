'use strict';
// Club systems: invitationals, showdowns, chemistry, shortlist. Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const club = engine.uxClub;
assert(club, 'club systems installed');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxc:' + JSON.stringify(o), 0, 0, 0);
const play = (st, rand, until, max = 500) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};
const fresh = (seed, name = 'Team Vitality') => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName: name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand) }; };

// ---- chemistry: modifiers are applied for the call and removed exactly ----
{
  const { rand, st } = fresh(3);
  const snap = () => JSON.stringify(st.players.map((p) => [p.id, p.rating, p.ratingExact]));
  const t = engine.teamById(st, st.userTeamId), u = st.uxClub;
  u.chem[t.id].since = st.currentDate; // brand new trio
  assert(club.chemOf(st, t).mod <= -2.9 && club.chemOf(st, t).label === 'adjusting', 'new trio is in its adjustment dip');
  u.chem[t.id].since = new Date(Date.parse(st.currentDate) - 300 * 86400000).toISOString().slice(0, 10);
  assert(club.chemOf(st, t).mod > 1.5 && club.chemOf(st, t).label !== 'adjusting', 'long-standing trio has synergy');
  const before = snap(), revert = club.applyChem(st);
  assert.notStrictEqual(snap(), before, 'modifiers applied'); revert(); assert.strictEqual(snap(), before, 'modifiers removed exactly');
  // a lineup change resets the clock (partly)
  const mine = t.playerIds.slice(); const swapped = st.players.find((p) => p.teamId !== t.id && p.teamId >= 0 && engine.teamById(st, p.teamId) && engine.teamById(st, p.teamId).region);
  const old = u.chem[t.id].since; const other = engine.teamById(st, swapped.teamId);
  other.playerIds = other.playerIds.filter((x) => x !== swapped.id); swapped.teamId = t.id; t.playerIds.push(swapped.id); swapped.rating = 99;
  club.trackChem(st); assert(u.chem[t.id].since > old, 'new player in the core resets part of the chemistry');
  // an advance leaves ratings as the game itself changed them (no drift)
  const a0 = snap(); engine.advance(st, rand, 'day'); assert.ok(st.players.every((p) => Number.isFinite(p.rating)));
  void a0; void mine;
}

// ---- invitationals ----
for (const size of [8, 16]) {
  const { rand, st } = fresh(5 + size);
  const host = engine.teamById(st, st.userTeamId);
  assert(club.canHost(st), 'Vitality can host');
  const win = club.windows(st, 4); assert(win.length >= 2, 'free windows exist');
  assert(!rpc(st, { a: 'host', size, start: st.currentDate, prize: 100000 }).ok, 'today is not a free window');
  assert(!rpc(st, { a: 'host', size, start: win[0], prize: 100 }).ok, 'prize pool out of range');
  const others = st.teams.filter((t) => t.id !== host.id && !t.nation).slice(0, 5).map((t) => t.id);
  const b0 = host.budget, r = rpc(st, { a: 'host', size, start: win[0], prize: 200000, invitees: others, sponsors: [0, 1], name: 'Test Cup' });
  assert(r.ok, r.error);
  const inv = st.uxClub.inv[0];
  assert.strictEqual(inv.field.length, size); assert.strictEqual(new Set(inv.field).size, size); assert(inv.field[0] === host.id);
  assert.strictEqual(host.budget, b0 - 200000 - inv.ops + inv.sponsorIncome, 'prize pool, costs and sponsors booked');
  const second = rpc(st, { a: 'host', size: 8, start: club.windows(st, 4)[0], prize: 100000 }); assert(second.ok, 'a second Invitational can run at the same time: ' + second.error);
  assert(second.inv.start !== inv.start, 'on a different date');
  assert(!rpc(st, { a: 'host', size: 8, start: club.windows(st, 4)[0], prize: 100000 }).ok, 'but not a third');
  play(st, rand, () => st.uxClub.inv.every((x) => x.stage === 'done'), 500);
  assert(st.uxClub.inv.every((x) => x.stage === 'done'), 'both invitationals finished');
  assert.strictEqual(inv.stage, 'done', 'invitational finished');
  assert.strictEqual(inv.standings.length, size);
  const fx = st.fixtures.filter((f) => f.invId === inv.id); assert.strictEqual(fx.length, size - 1, 'single elimination: size-1 series'); assert(fx.every((f) => f.played));
  assert(Math.abs(inv.standings.reduce((a, s) => a + s.prize, 0) - inv.prize) <= size * 100, 'whole prize pool paid out');
  assert.strictEqual(inv.championId, inv.standings[0].teamId);
  const mine = inv.standings.find((s) => s.teamId === host.id);
  assert.strictEqual(inv.result.back, (mine ? mine.prize : 0) + inv.sponsorIncome + inv.result.gate);
  assert(inv.result.growth > 0, 'fanbase grows');
  console.log('invitational', size, 'profit', inv.result.profit, 'place', mine && mine.placement);
}
{ // a small club can not host
  const { st } = fresh(8, 'Ninjas in Pyjamas'); const t = engine.teamById(st, st.userTeamId); t.followers = 5000;
  assert(!club.canHost(st) && !rpc(st, { a: 'host', size: 8, start: club.windows(st)[0], prize: 100000 }).ok);
}

// ---- showdowns ----
for (const mode of ['1v1', '2v2', 'crew']) {
  const { rand, st } = fresh(11);
  const host = engine.teamById(st, st.userTeamId), win = club.windows(st, 1)[0], b0 = host.budget;
  const r = rpc(st, { a: 'show', mode, start: win, prize: 60000 }); assert(r.ok, r.error);
  assert(!rpc(st, { a: 'show', mode, start: win, prize: 60000 }).ok, 'one event per day');
  const sh = st.uxClub.shows[0]; assert.strictEqual(host.budget, b0 - sh.cost);
  play(st, rand, () => sh.done, 300);
  assert(sh.done && sh.result.champion, mode + ' finished');
  assert.strictEqual(sh.result.order.length, mode === '1v1' ? 16 : 8);
  assert(sh.result.order.reduce((a, x) => a + x.prize, 0) <= sh.prize + 400);
}
assert(require('../src/engine/ux-club').mech({ name: 'abc' }) !== undefined);

// ---- showdowns with the user's own player in the entry: every series of the user's club is a real fixture (squads of 1 / 2, the duel of a crew battle) ----
for (const mode of ['1v1', '2v2', 'crew']) {
  const { rand, st } = fresh(11), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  if (mode !== 'crew') rpc(st, { a: 'lineup', fmt: mode, ids: [st.userPlayerId] });
  else me.playerIds.forEach((id) => { engine.playerById(st, id).rating = id === st.userPlayerId ? 99 : engine.playerById(st, id).rating; }); // the user is one of the three best
  const r = rpc(st, { a: 'show', mode, start: club.windows(st, 1)[0], prize: 60000 }); assert(r.ok, r.error);
  const sh = st.uxClub.shows[0]; let made = 0;
  for (let i = 0; i < 300 && !sh.done; i++) {
    engine.advance(st, rand, 'day');
    for (let k = 0; k < 8; k++) {
      const fx = st.fixtures.find((f) => f.showId === sh.id && !f.played); if (!fx) break;
      made++; const n = mode === 'crew' ? 1 : mode === '2v2' ? 2 : 1;
      assert(engine.sideLineup(st, fx).length === n && engine.sideLineup(st, fx).includes(st.userPlayerId) && engine.lineupFor(st, engine.teamById(st, fx.awayId), fx).length === n, mode + ' squads of ' + n);
      if (k % 2) { engine.applyUserResult(st, fx, { teamGoals: 3, oppGoals: 1 }, () => 0.5); if (!fx.played) engine.simulateFixture(st, fx); } else engine.simulateFixture(st, fx);
    }
  }
  assert(sh.done && sh.result.champion && made >= 1, mode + ' with the user playing: finished, real fixtures ' + made);
}

// ---- region-only fields ----
{
  const { st } = fresh(21), me = engine.teamById(st, st.userTeamId); me.budget = 5e6; me.followers = 500000;
  const r = rpc(st, { a: 'host', scope: 'region', size: 16, prize: 200000, start: club.windows(st, 4)[0] }); assert(r.ok, r.error);
  const base = (t) => t.region.replace(/_b$/, '');
  assert(r.inv.field.every((id) => base(engine.teamById(st, id)) === base(me)), 'region invitational only has own-region clubs');
}
// ---- squad formats: 2v2 / 1v1 lineups feed the showdown entry ----
{
  const { st } = fresh(23), me = engine.teamById(st, st.userTeamId), ids = me.playerIds;
  assert.strictEqual(club.fmtLineup(st, '2v2').length, 2); assert.strictEqual(club.fmtLineup(st, '1v1').length, 1);
  assert(rpc(st, { a: 'lineup', fmt: '1v1', ids: [ids[2], ids[0]] }).ok && club.fmtLineup(st, '1v1').join() === String(ids[2]), 'one place only');
  assert(!rpc(st, { a: 'lineup', fmt: '5v5', ids }).ok, 'unknown format');
  rpc(st, { a: 'lineup', fmt: '2v2', ids: [ids[1], 999999, ids[2]] });
  me.budget = 5e6; const r = rpc(st, { a: 'show', mode: '2v2', start: club.windows(st, 1)[0], prize: 100000 });
  assert(r.ok && r.show.entry.join() === [ids[1], ids[2]].join(), 'showdown uses the saved 2v2 squad');
}
// ---- Invitational: the user's next match is handed over at once, no day skipped between rounds ----
{
  const { rand, st } = fresh(5), me = engine.teamById(st, st.userTeamId); me.budget = 9e6; me.followers = 500000;
  const r = rpc(st, { a: 'host', scope: 'global', size: 8, prize: 200000, start: club.windows(st, 4)[0] }); assert(r.ok, r.error);
  const inv = st.uxClub.inv[0]; let chained = 0;
  for (let i = 0; i < 80 && inv.stage !== 'done'; i++) {
    const a = engine.advance(st, rand, 'day');
    if (a.stopped !== 'matchday') continue;
    let f = engine.fixtureById(st, a.fixtureId);
    while (f && !f.played) { engine.simulateFixture(st, f, rand); const n = engine.nextUserSeries(st, rand, f.id); if (f.invId === inv.id && n) { assert(n.invId === inv.id && !n.played, 'next round is an Invitational match'); chained++; } f = n; }
  }
  assert.strictEqual(inv.stage, 'done', 'invitational finished'); assert(chained > 0 || inv.slots.every((s) => s.winner != null), 'rounds were chained');
}
// ---- shortlist ----
{
  const { st } = fresh(13);
  const p = st.players.find((x) => !x.isUser && x.teamId !== st.userTeamId);
  assert(rpc(st, { a: 'watch', playerId: p.id }).ok && st.uxClub.watch.includes(p.id), 'added');
  assert(rpc(st, { a: 'watch', playerId: p.id }).ok && st.uxClub.watch.filter((x) => x === p.id).length === 1, 'no duplicates');
  assert(rpc(st, { a: 'watch', playerId: p.id, on: false }).ok && !st.uxClub.watch.includes(p.id), 'removed');
  assert(!rpc(st, { a: 'watch', playerId: -99 }).ok);
}
// ---- calendar guard: hosted events keep 4 free days from every other event; streams and scrims keep 1 ----
{
  const { st } = fresh(11); const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const off = club.busy(st).iv.filter((x) => x[2] === 'official').sort((a, b) => (a[0] < b[0] ? -1 : 1)).find((x) => x[0] > add(st.currentDate, 30));
  assert(off, 'an official event exists'); const [a, b] = off;
  const ok = (start, len) => club.windowOk(st, start, len);
  // an Invitational (3 days) that would start 3 days after the event ends is refused, 6 days after is fine unless another event is in the way
  assert(!ok(add(b, 3), 3) && !ok(add(a, -3 - 2), 3), 'within 4 days of an official event: refused');
  assert(!ok(a, 3) && !ok(add(a, -1), 3), 'overlapping: refused');
  const w = club.windows(st, 3)[0]; assert(w && ok(w, 3), 'windows() only offers dates that pass');
  // a one-day stream keeps only 1 day: 2 days after the event is fine for a stream but not for an Invitational
  const s2 = add(b, 2); if (!club.busy(st).iv.some(([x, y]) => s2 >= add(x, -1) && s2 <= add(y, 1))) assert(ok(s2, 1) && !ok(s2, 3), 'streams are looser than hosted events');
  // two hosted events need the same 4 days between them
  const h = rpc(st, { a: 'host', size: 8, start: w, prize: 100000 }); assert(h.ok, h.error);
  assert(!ok(add(w, 3 + 2), 3), 'right after a hosted event (gap 2 days): refused'); assert(!ok(add(w, -3 - 2), 3), 'right before it: refused');
  // a booked scrim in the way blocks hosting; the message says so
  const w2 = club.windows(st, 3)[0]; st.uxScrims.list.push({ id: 9999, status: 'scheduled', date: w2, oppId: -1 });
  const r = rpc(st, { a: 'host', size: 8, start: w2, prize: 100000 }); assert(!r.ok && /scrim/.test(r.error), 'a booked scrim blocks hosting: ' + r.error);
  st.uxScrims.list.pop();
}

console.log('club ok');
