'use strict';
// Late game phase 3 part 1: the user's own cup series (circuit), unlocked by an Arena at level 2. Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const late = engine.uxLate, H = late && late.host, club = engine.uxClub;
assert(H, 'late host installed');
late.REQ.major = 0; late.REQ.open = 0;
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const play = (st, rand, until, max = 500) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};
const fresh = (seed, arena = 2) => {
  const rand = mkRand(seed), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const t = engine.teamById(st, st.userTeamId); t.budget = 1e9; t.followers = 500000;
  for (let i = 1; i <= 4; i++) assert(engine.buyFacility(st, i).ok);
  engine.advance(st, rand, 'day');
  for (let l = 1; l <= arena; l++) { assert(rpc(st, { a: 'build', id: 'arena' }).ok); play(st, rand, () => late.build.level(st, 'arena') >= l, 200); }
  t.budget = 1e7; return { st, rand, t };
};
// stop dates: windows() already respects the 4-day rule; take ones at least 8 days apart
const plan = (st, n) => { const w = club.windows(st, 3, 40).filter((d) => d > addDays(st.currentDate, 25)); const out = []; for (const d of w) if (!out.length || Date.parse(d) - Date.parse(out[out.length - 1]) >= 8 * 864e5) out.push(d); return out.slice(0, n); };

// ---- needs Arena level 2 ----
{
  const { st } = fresh(1, 1); const [a, b, c] = plan(st, 3), f = addDays(c, 30);
  const r = rpc(st, { a: 'circuit', stops: [a, b, c], finalsStart: f, prize: 250000, finalsPrize: 600000 });
  assert(!r.ok && /Arena/.test(r.error), 'arena 1 is not enough: ' + r.error);
}

// ---- validation ----
{
  const { st } = fresh(2); const [a, b, c] = plan(st, 3), f = addDays(c, 30), base = { a: 'circuit', stops: [a, b, c], finalsStart: f, prize: 250000, finalsPrize: 600000 };
  assert(!rpc(st, { ...base, stops: [a, b] }).ok, '2 stops are too few');
  assert(!rpc(st, { ...base, stops: [b, a, c] }).ok, 'stops must be in order');
  assert(!rpc(st, { ...base, stops: [a, addDays(a, 4), c] }).ok, 'stops need 4 free days between them');
  assert(!rpc(st, { ...base, finalsStart: addDays(c, 10) }).ok, 'Finals need a gap after the last stop');
  assert(!rpc(st, { ...base, prize: 5 }).ok, 'prize pool out of range');
  assert(!rpc(st, { ...base, stops: [addDays(st.currentDate, 5), b, c] }).ok, 'first stop must be far enough away');
  const ok = rpc(st, base); assert(ok.ok, ok.error);
  assert(!rpc(st, base).ok, 'one circuit at a time');
  // planned stops reserve the calendar: the same dates are no longer free for other hosted events
  assert(!club.windowOk(st, a, 3) && !club.windowOk(st, addDays(a, 3), 3), 'a planned stop keeps its days and the 4-day margin');
  assert(rpc(st, { a: 'circuit_cancel', id: ok.circuit.id }).ok && club.windowOk(st, a, 3), 'cancelling frees the calendar');
}

// ---- a whole circuit: stops are created 14 days ahead and paid, points, TV rights, Finals, champion ----
{
  const { st, rand } = fresh(3); const dates = plan(st, 3), f = addDays(dates[2], 30);
  const r = rpc(st, { a: 'circuit', name: 'Test Circuit', stops: dates, finalsStart: f, prize: 250000, finalsPrize: 600000 }); assert(r.ok, r.error);
  const c = st.late.host.circuits[0];
  play(st, rand, () => c.stops[0].status === 'live', 120);
  assert.strictEqual(c.stops[0].status, 'live', 'stop 1 is created'); assert(c.stops[0].start >= addDays(st.currentDate, 13), 'about 14 days before it starts');
  assert(c.stops[1].status === 'planned', 'later stops wait');
  assert(st.uxClub.inv.some((x) => x.circuitId === c.id && x.name.includes('Stop 1')), 'it is a real Invitational');
  play(st, rand, () => c.stage === 'done', 500);
  assert.strictEqual(c.stage, 'done', 'the circuit finishes'); assert(c.stops.every((x) => x.status === 'done'), 'all stops held');
  assert(c.champion != null && c.finals.status === 'done', 'the Finals crown a champion');
  assert(Object.keys(c.points).length >= 8 && c.points[st.userTeamId] > 0, 'points were awarded, the host included');
  const top = Object.entries(c.points).sort((x, y) => y[1] - x[1]).map((e) => Number(e[0])).filter((id) => id !== st.userTeamId).slice(0, 7);
  const fin = st.uxClub.inv.find((x) => x.id === c.finals.invId);
  assert(top.every((id) => fin.field.includes(id)) && fin.field.includes(st.userTeamId) && fin.field.length === 8, 'Finals = the host + the 7 best other clubs by points');
  assert(c.tv > 0 && st.late.host.circuits.length === 1 && rpc(st, { a: 'circuits' }).readOnly, 'TV rights paid; the read-only view works');
}

// ---- a stop that cannot be paid is cancelled, followers drop ----
{
  const { st, rand, t } = fresh(4); const dates = plan(st, 3), f = addDays(dates[2], 30);
  assert(rpc(st, { a: 'circuit', stops: dates, finalsStart: f, prize: 250000, finalsPrize: 600000 }).ok);
  const c = st.late.host.circuits[0]; t.budget = 1000; const fol = t.followers;
  play(st, rand, () => c.stops[0].status !== 'planned', 120);
  assert.strictEqual(c.stops[0].status, 'cancelled', 'no money: the stop is cancelled'); assert(t.followers < fol, 'followers dropped');
  t.budget = 1e7; play(st, rand, () => c.stops[1].status !== 'planned', 120); assert.strictEqual(c.stops[1].status, 'live', 'the circuit goes on with the next stop');
}

// ---- a planned date that stops being free is moved, not lost ----
{
  const { st, rand, t } = fresh(6); const dates = plan(st, 3), f = addDays(dates[2], 30);
  assert(rpc(st, { a: 'circuit', stops: dates, finalsStart: f, prize: 250000, finalsPrize: 600000 }).ok);
  const c = st.late.host.circuits[0];
  st.uxMajors.events.push({ id: st.nextId++, kind: 'kickoff', uxKind: 'kickoff', uxEv: true, name: 'Test Weekend', season: st.season, startDate: dates[0], endDate: addDays(dates[0], 1), stage: 'pending', field: [], groups: [], slots: [], standings: [], championId: null }); // an official event appears on stop 1 after the plan was made
  play(st, rand, () => c.stops[0].status !== 'planned', 120);
  assert.strictEqual(c.stops[0].status, 'live', 'the stop is held: ' + c.stops[0].status); assert(c.stops[0].start > dates[0] && c.stops[0].moved === dates[0], 'but on a later free day');
  assert(st.inbox.some((m) => /moved/.test(m.title)), 'the user is told');
}

// ---- mothballed (Tier B) clubs get nothing ----
{
  const { st } = fresh(5); const t = engine.teamById(st, st.userTeamId); t.tier = 'B';
  assert(!rpc(st, { a: 'circuit', stops: [], finalsStart: '' }).ok, 'actions are refused while mothballed');
}
console.log('late-host ok');
