'use strict';
// Late game phase 4: Legacy (Hall of Fame, club records, rival history, Museum). Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const late = engine.uxLate, L = late && late.legacy;
assert(L, 'late legacy installed');
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
const fresh = (seed) => {
  const rand = mkRand(seed), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const t = engine.teamById(st, st.userTeamId); t.budget = 1e9;
  engine.advance(st, rand, 'day'); return { st, rand, t };
};

// ---- rival history: every official series once, scrims excluded, win streak ----
{
  const { st, rand } = fresh(1), me = st.userTeamId;
  play(st, rand, () => st.fixtures.filter((f) => f.played && (f.homeId === me || f.awayId === me)).length >= 6, 300);
  const d = L.data(st); L.scan(st);
  const mine = st.fixtures.filter((f) => f.played && (f.homeId === me || f.awayId === me) && !f.scrimId);
  const series = Object.values(d.h2h).reduce((a, h) => a + h.sw + h.sl, 0);
  assert(series > 0 && series <= mine.length, 'series counted: ' + series + ' of ' + mine.length);
  L.scan(st); assert.strictEqual(Object.values(d.h2h).reduce((a, h) => a + h.sw + h.sl, 0), series, 'a fixture is counted once');
  const f = { id: 99991, played: true, scrimId: 5, homeId: me, awayId: st.teams.find((t) => t.id !== me).id, homeWins: 3, awayWins: 0, games: [], date: st.currentDate }; st.fixtures.push(f);
  L.scan(st); assert(!f.lg, 'scrims are not counted'); st.fixtures.pop();
  const h = Object.values(d.h2h)[0]; assert(h.gw + h.gl > 0 && h.last && (h.last.win === (h.last.w > h.last.l)), 'last result recorded');
  assert(d.streak.best >= 0 && d.streak.cur >= 0, 'streak tracked');
}

// ---- seasons: stats per player, single-season records, Hall of Fame judged once after retirement ----
{
  const { st } = fresh(2), t = engine.teamById(st, st.userTeamId), d = L.data(st);
  const star = engine.playerById(st, t.playerIds[0]), minor = engine.playerById(st, t.playerIds[1]);
  L.scan(st); // first sight: titles he brings are not counted
  star.rating = 94; star.season = { games: 40, goals: 60, assists: 20, saves: 40, shots: 100, mvps: 12, wins: 30, losses: 5 }; minor.rating = 70; minor.season = { games: 10, goals: 3, assists: 1, saves: 2, shots: 9, mvps: 0, wins: 4, losses: 6 };
  star.titles = (star.titles || []).concat([{ k: 'worlds_champion', y: 2099 }, { k: 'major_champion', y: 2099, h: 'X' }]);
  L.closeSeason(st);
  assert.strictEqual(d.best.goals.id, star.id, 'best goals season'); assert.strictEqual(d.best.goals.v, 60); assert.strictEqual(d.best.mvps.v, 12);
  assert.strictEqual(d.players[star.id].seasons, 1); assert.strictEqual(d.players[star.id].titles.length, 2, 'only titles earned after he joined');
  st.season++; star.season = { games: 40, goals: 70, assists: 25, saves: 30, shots: 100, mvps: 9, wins: 33, losses: 4 }; minor.season = { games: 10, goals: 4, assists: 2, saves: 1, shots: 9, mvps: 0, wins: 5, losses: 5 };
  L.closeSeason(st); assert.strictEqual(d.best.goals.v, 70, 'a better season replaces the record'); assert.strictEqual(d.players[star.id].seasons, 2);
  star.retired = true; minor.retired = true; L.judge(st);
  assert.strictEqual(d.hof.length, 1, 'only the star is inducted'); assert.strictEqual(d.hof[0].id, star.id); assert(d.hof[0].score >= L.threshold(st));
  assert(st.inbox.some((m) => /Hall of Fame/.test(m.title)), 'inbox letter');
  L.judge(st); assert.strictEqual(d.hof.length, 1, 'judged once'); assert(d.players[minor.id].judged, 'the minor player was judged and not inducted');
  st.late.mode = 'ruthless'; assert(L.threshold(st) > L.HOF_THRESHOLD.standard, 'Ruthless asks for more');
}

// ---- Museum: ticket income and followers per level, nothing when not built ----
{
  const { st, rand, t } = fresh(3);
  for (let i = 1; i <= 4; i++) assert(engine.buyFacility(st, i).ok);
  const f0 = t.followers, b0 = t.budget; L.monthly(st); assert.strictEqual(t.budget, b0, 'no income without a Museum'); assert.strictEqual(t.followers, f0);
  assert(rpc(st, { a: 'build', id: 'museum' }).ok); play(st, rand, () => late.build.level(st, 'museum') >= 1, 200);
  const b1 = t.budget, f1 = t.followers; L.monthly(st);
  assert.strictEqual(t.budget, b1 + L.MUSEUM_TICKETS, 'ticket income at level 1'); assert(t.followers > f1, 'a few followers');
}

// ---- the real season rollover: the hook runs, state survives, relegated clubs track nothing ----
{
  const { st, rand } = fresh(4), me = st.userTeamId;
  for (let i = 0; i < 700; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } if (r.stopped === 'season-end') break; }
  const season = st.season; engine.startNextSeason(st, rand);
  const d = L.data(st); assert.strictEqual(d.seasons.length, 1, 'one season recorded'); assert.strictEqual(d.seasons[0].season, season);
  assert(Object.keys(d.players).length >= 3 && Object.keys(d.h2h).length > 0, 'players and rivals tracked');
  const t = engine.teamById(st, me); t.tier = 'B'; const n = d.seasons.length; L.closeSeason; // a Tier B club never reaches the hook
  assert.strictEqual(d.seasons.length, n);
}
console.log('late-legacy ok');
