'use strict';
// beta.33 game-by-game series sim (engine.simulateNextGame): the Modifier's wrappers must keep chemistry, scrims and showdowns working.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
assert(typeof engine.simulateNextGame === 'function', 'game exports simulateNextGame (beta.33+)');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxs:' + JSON.stringify(o), 0, 0, 0);
const bookOk = (st, o) => { for (const t of st.teams.filter((x) => x.region === engine.teamById(st, st.userTeamId).region && x.id !== st.userTeamId)) { const r = rpc(st, { a: 'book', oppId: t.id, ...o }); if (r.ok) return r; if (!r.declined) return r; } return { ok: false, error: 'all declined' }; };
const fresh = (seed) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand) }; };

// a normal user series: one game per call, series finishes, chemistry is reverted afterwards
{
  const { st, rand } = fresh(11);
  let fx = null;
  for (let i = 0; i < 400 && !fx; i++) { const r = engine.advance(st, rand, 'next'); if (r.stopped === 'matchday') fx = engine.fixtureById(st, r.fixtureId); }
  assert(fx && !fx.played, 'found the first user match');
  const ratings = JSON.stringify(st.players.map((p) => [p.id, p.rating, p.ratingExact]));
  let n = 0, g;
  while (!fx.played && n++ < 16) { g = engine.simulateNextGame(st, fx, rand); assert(g && Number.isFinite(g.homeGoals), 'a game record per call'); }
  assert(fx.played && fx.games.length === n, 'series over after one call per game');
  assert.strictEqual(JSON.stringify(st.players.map((p) => [p.id, p.rating, p.ratingExact])), ratings, 'chemistry boost was reverted');
}

// a scrim is simulated as a whole series (our own model), the last game handed back, scrim effects applied
{
  const { st, rand } = fresh(12);
  const r3 = bookOk(st, { fmt: '3v3', bo: 3, weeks: 1 });
  assert(r3.ok, 'scrim booked');
  r3.scrim.date = st.currentDate; engine.uxScrims.tick(st);
  const fx = st.fixtures.find((f) => f.scrimId === r3.scrim.id);
  assert(fx && !fx.played, 'scrim fixture waits');
  const g = engine.simulateNextGame(st, fx, rand);
  assert(fx.played && g && g === fx.games[fx.games.length - 1], 'whole scrim series done, last game returned');
  assert(Math.max(fx.homeWins, fx.awayWins) === 2, 'BO3 result');
}
console.log('beta33 simulateNextGame hooks: OK');
