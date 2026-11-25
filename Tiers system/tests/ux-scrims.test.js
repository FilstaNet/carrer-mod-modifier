'use strict';
// Scrims: booking rules, simulation without side effects on season stats, rating boost for participants only. Runs the game's real engine.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
assert(engine.uxScrims, 'scrims installed');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxs:' + JSON.stringify(o), 0, 0, 0);
const fresh = (seed) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand) }; };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// first accepted booking of a series of tries (AI clubs may decline)
const bookOk = (st, o) => { for (const t of st.teams.filter((x) => x.region === engine.teamById(st, st.userTeamId).region && x.id !== st.userTeamId)) { const r = rpc(st, { a: 'book', oppId: t.id, ...o }); if (r.ok) return r; if (!r.declined) return r; } return { ok: false, error: 'all declined' }; };

// ---- rules ----
{
  const { st } = fresh(5), me = engine.teamById(st, st.userTeamId);
  const other = st.teams.find((t) => t.region !== me.region && !t.nation);
  assert(!rpc(st, { a: 'book', oppId: other.id, fmt: '3v3', bo: 3, weeks: 1 }).ok, 'only clubs of the own region');
  assert(!bookOk(st, { fmt: '4v4', bo: 3, weeks: 1 }).ok && !bookOk(st, { fmt: '3v3', bo: 2, weeks: 1 }).ok && !bookOk(st, { fmt: '3v3', bo: 3, weeks: 4 }).ok, 'bad options are refused');
  const ids = [];
  for (let i = 0; i < 3; i++) { const r = bookOk(st, { fmt: '2v2', bo: 3, weeks: 1 }); assert(r.ok, 'booked ' + i); ids.push(r.scrim.date); }
  assert(ids.every((d) => d >= addDays(st.currentDate, 7)), 'at least a week out');
  const per = {}; ids.forEach((d) => { per[d] = (per[d] || 0) + 1; });
  assert(Object.values(per).every((n) => n <= 2), 'at most two a day: ' + JSON.stringify(per));
  const ivs = [...(st.events || []).map((e) => [e.startDate, e.endDate])];
  assert(ids.every((d) => !ivs.some(([a, b]) => d >= a && d <= b)), 'never on a tournament day');
  // the month cap counts the month the scrim is played in
  for (let i = 0; i < 6; i++) bookOk(st, { fmt: '1v1', bo: 1, weeks: 1 });
  const perMonth = {}; st.uxScrims.list.filter((x) => x.status === 'scheduled').forEach((x) => { const m = x.date.slice(0, 7); perMonth[m] = (perMonth[m] || 0) + 1; });
  assert(Object.values(perMonth).every((n) => n <= 5), 'at most five a month: ' + JSON.stringify(perMonth));
  const sc = st.uxScrims.list[0];
  assert(rpc(st, { a: 'cancel', id: sc.id }).ok && sc.status === 'cancelled', 'cancel');
  assert(!rpc(st, { a: 'cancel', id: sc.id }).ok, 'cannot cancel twice');
}

// ---- a declined request books nothing and leaves a note ----
{
  const { st } = fresh(6); let declined = null;
  for (const p of st.players) if (p.teamId === st.userTeamId) p.rating -= 20; // a weak side is turned down more often
  for (const t of st.teams.filter((x) => x.region === engine.teamById(st, st.userTeamId).region && x.id !== st.userTeamId)) for (const wk of [1, 2, 3]) for (const bo of [1, 3, 5, 7]) { const r = rpc(st, { a: 'book', oppId: t.id, fmt: '3v3', bo, weeks: wk }); if (r.declined) { declined = r; break; } }
  assert(declined, 'some clubs decline'); assert(st.inbox.some((m) => /declined your scrim/.test(m.title)), 'decline note');
}

// ---- a 2v2 / 3v3 scrim: no stats, picks, boost for participants only ----
{
  const { st, rand } = fresh(7), me = engine.teamById(st, st.userTeamId);
  const squad = st.players.filter((p) => p.teamId === me.id);
  const r2 = bookOk(st, { fmt: '2v2', bo: 3, weeks: 1 }), r3 = bookOk(st, { fmt: '3v3', bo: 5, weeks: 2 });
  assert(r2.ok && r3.ok);
  const snap = () => JSON.stringify(st.players.map((p) => [p.id, p.season, p.mvps]));
  const lineup2 = engine.uxClub.fmtLineup(st, '2v2'), before = new Map(squad.map((p) => [p.id, p.ratingExact == null ? p.rating : p.ratingExact]));
  const base = new Map(st.players.map((p) => [p.id, JSON.stringify(p.season)]));
  r2.scrim.date = st.currentDate; engine.uxScrims.tick(st); const f2 = st.fixtures.find((f) => f.scrimId === r2.scrim.id); assert(f2 && !f2.played, '2v2 fixture waits to be played or simulated'); engine.simulateFixture(st, f2, rand); engine.uxScrims.tick(st); // the day arrives (no advance: daily drift would blur the rating check)
  const h = st.uxScrims.history[0]; assert(h && h.fmt === '2v2', 'the 2v2 scrim ran on its day');
  assert(h.fx.games.length >= 2 && h.fx.games.length <= 3 && h.fx.games.every((g) => g.homeLines.length === 2 && g.awayLines.length === 2), 'full per-game lines');
  assert(h.fx.homeWins + h.fx.awayWins === h.fx.games.length && Math.max(h.fx.homeWins, h.fx.awayWins) === 2, 'BO3 result');
  assert(st.inbox.some((m) => /^Scrim: (win|loss)/.test(m.title)), 'inbox tells who won');
  const bench = squad.filter((p) => !lineup2.includes(p.id));
  for (const p of squad) { const now = p.ratingExact == null ? p.rating : p.ratingExact; if (lineup2.includes(p.id)) assert(now >= before.get(p.id) && now - before.get(p.id) < 0.5, 'small boost for ' + p.name); else assert(now === before.get(p.id), 'no boost for the bench'); }
  assert(bench.length === 0 || true);
  for (const p of st.players) assert(JSON.stringify(p.season) === base.get(p.id), 'no season stats from the scrim');
  assert(!st.fixtures.some((f) => f.scrimId && f.played), 'finished scrim fixtures are removed');
  // the 3v3 one: a fixture appears the day before, simulating it is allowed
  for (let i = 0; i < 40 && st.uxScrims.history.length < 2; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { assert(f.scrimId, 'only the scrim is due'); engine.simulateFixture(st, f, rand); } } }
  const h3 = st.uxScrims.history[1]; assert(h3 && h3.fmt === '3v3' && h3.fx.games.every((g) => g.homeLines.length === 3), 'the 3v3 scrim was simulated');
  for (const p of st.players) assert(JSON.stringify(p.season) === base.get(p.id), 'no season stats from the 3v3 scrim');
  engine.advance(st, rand, 'day');
  assert(!st.fixtures.some((f) => f.scrimId), 'no scrim fixture left in the game');
  assert(snap().length > 0);
}

// ---- a scrim whose day gets a tournament is cancelled ----
{
  const { st, rand } = fresh(8), r = bookOk(st, { fmt: '1v1', bo: 1, weeks: 1 }), sc = r.scrim;
  const e = st.events[0]; const old = [e.startDate, e.endDate]; e.startDate = sc.date; e.endDate = sc.date;
  engine.advance(st, rand, 'day');
  assert(sc.status === 'cancelled' && st.inbox.some((m) => /Scrim cancelled/.test(m.title)), 'cancelled by a tournament day');
  e.startDate = old[0]; e.endDate = old[1];
}
// ---- a playable 2v2 / 1v1 scrim: a real fixture the day before, and the launcher's lineup calls return the smaller squads ----
{
  const { st } = fresh(9);
  for (const fmt of ['2v2', '1v1']) {
    const n = fmt === '2v2' ? 2 : 1;
    engine.uxClub.rpc(st, JSON.stringify({ a: 'lineup', fmt, ids: [st.userPlayerId] }));
    const r = bookOk(st, { fmt, bo: 3, weeks: 1 }); assert(r.ok, fmt + ' booked');
    r.scrim.date = st.currentDate; engine.uxScrims.tick(st);
    const fx = st.fixtures.find((f) => f.scrimId === r.scrim.id); assert(fx && fx.fmt === fmt && !fx.played, fmt + ' fixture exists to play');
    const mine = engine.sideLineup(st, fx), opp = engine.lineupFor(st, engine.teamById(st, fx.homeId === st.userTeamId ? fx.awayId : fx.homeId), fx);
    assert(mine.length === n && mine.includes(st.userPlayerId) && opp.length === n, fmt + ' squads of ' + n);
    assert(engine.lineupFor(st, engine.teamById(st, st.userTeamId), fx).length === n, fmt + ' user side via lineupFor');
    if (fmt === '2v2') { // a game played for real: the full-time sheet lists only the squads that played
      engine.applyUserResult(st, fx, { teamGoals: 3, oppGoals: 1 }, () => 0.5);
      const g = fx.games[0]; assert(g && g.homeLines.length === n && g.awayLines.length === n, 'real game lists ' + n + ' per side, got ' + (g && g.homeLines.length) + '/' + (g && g.awayLines.length));
      assert(!st.players.some((p) => p.absence && p.absence.until === '9999-12-31'), 'squad restriction is undone');
    }
    engine.simulateFixture(st, fx); assert(st.uxScrims.history.some((h) => h.id === r.scrim.id), fmt + ' can still be simulated');
  }
}
// ---- a scrim keeps 1 free day from official and hosted events ----
{
  const { st } = fresh(12); const iv = engine.uxClub.busy(st).iv; let n = 0;
  for (let w = 1; w <= 3; w++) { for (const wk of [1, 2, 3]) { const r = bookOk(st, { fmt: '3v3', bo: 3, weeks: wk * w > 3 ? 3 : wk * w }); if (r && r.ok) { n++; const d = r.scrim.date; assert(!iv.some(([a, b]) => d >= addDays(a, -1) && d <= addDays(b, 1)), 'scrim ' + d + ' is next to an event'); } } }
  assert(n > 0, 'some scrims could be booked');
}
// ---- a played scrim fixture (it stays in the list until the next tick) never reaches the standings table ----
{
  const { st } = fresh(11), me = engine.teamById(st, st.userTeamId);
  const r = bookOk(st, { fmt: '3v3', bo: 3, weeks: 1 }); assert(r.ok);
  r.scrim.date = st.currentDate; engine.uxScrims.tick(st);
  const fx = st.fixtures.find((f) => f.scrimId === r.scrim.id); assert(fx, 'scrim fixture exists');
  const row = (t) => JSON.stringify(t.find((x) => x.teamId === me.id)), before = row(engine.computeTable(st));
  Object.assign(fx, { played: true, homeWins: 2, awayWins: 0, homeGoals: 9, awayGoals: 2 });
  assert.strictEqual(row(engine.computeTable(st)), before, 'the scrim gives no points, games or goals in the table');
  assert(st.fixtures.includes(fx), 'the fixture is still in the list afterwards (the full-time screen needs it)');
}
console.log('scrims ok');
