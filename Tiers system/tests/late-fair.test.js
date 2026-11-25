'use strict';
// New careers: no dismissal in the first two seasons, and clubs outside the best 16 of a 32-club region get the lowest Open expectation level.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(1));
const eu = probe.teams.filter((t) => t.region === 'eu' && !t.nation && t.tier !== 'B').sort((a, b) => (b.followers || 0) - (a.followers || 0));
const start = (name, seed) => { const rand = mkRand(seed), st = engine.generateLeague({ teamName: name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand); return { st, rand }; };
const step = (st, rand) => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } return r; };

// 1) expectation level: a weak club (outside the best 16) is capped at level 1, a strong one keeps the game's level
{
  const weak = start(eu[19].name, 120), strong = start(eu[0].name, 121);
  step(weak.st, weak.rand); step(strong.st, strong.rand);
  assert.strictEqual(weak.st.boardExpect.domestic, 1, 'weak club: lowest Open level');
  assert(strong.st.boardExpect.domestic >= 4, 'strong club keeps its level');
}
// 2) protection: a club that went out of every Swiss stage in season 1 (it was sacked before) is kept, with a warning mail; a save that starts late gets none (seed-dependent: pick one where this club is headed for dismissal; moves when the random sequence of a season changes)
{
  const { st, rand } = start(eu[19].name, 123);
  for (let i = 0; i < 800; i++) { if (step(st, rand).stopped === 'season-end' || st.sacked) break; }
  assert(!st.sacked, 'not sacked in season 1'); assert.strictEqual(st.uxManager.honey, 2, 'protected for two seasons');
  assert(st.inbox.some((m) => /one more chance/.test(m.title)), 'warning instead of dismissal');
  engine.startNextSeason(st, rand); assert(!st.sacked, 'not sacked at the rollover either');
  const late = JSON.parse(JSON.stringify(st)); delete late.uxManager; late.season = 4; engine.uxManager.tick(late);
  assert.strictEqual(late.uxManager.honey, undefined, 'no protection for a career that is already running');
}
// 3) "top 22 once a split" for the worst clubs: a 2-3 exit from the Swiss (22nd) meets the target, a 0-3 exit (32nd) does not; the board shows the real place
{
  const lowest = probe.teams.filter((q) => q.region === 'eu' && !q.nation).sort((a, b) => (a.followers || 0) - (b.followers || 0))[0].name;
  for (const [seed, place, met] of [[4, 22, true], [2, 32, false]]) {
    const { st, rand } = start(lowest, seed);
    step(st, rand); assert(st.uxManager.worst, 'the lowest club is among the worst');
    let open = null; for (let i = 0; i < 200 && !open; i++) { step(st, rand); open = st.events.find((e) => e.kind === 'open' && e.stage === 'done'); }
    step(st, rand);
    const x = open.standings.find((q) => q.teamId === st.userTeamId); assert(x && x.swiss && x.placement === place, 'out of the Swiss at ' + place + ', got ' + (x && x.placement));
    const bd = engine.boardDetail(st), row = bd.domestic.splits.flatMap((s) => s.rows).find((r) => r.name === open.name);
    assert.strictEqual(bd.domestic.target, 22); assert.strictEqual(row.place, place, 'real place shown'); assert.strictEqual(row.met, met, 'met = place <= 22');
    assert.strictEqual(x.placement, place, 'the real place is back after the call');
  }
}
console.log('late-fair: ok');
