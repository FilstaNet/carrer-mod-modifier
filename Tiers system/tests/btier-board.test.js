'use strict';
// Tier B board: the game's Tier A "17th at every Open" scoring must not reach a Tier B manager; B-Tier Cup objectives judge instead.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const B = require('../src/engine/btier-board');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);

assert.strictEqual(B.cupTarget(5, 32), 4); assert.strictEqual(B.cupTarget(3, 16), 6); assert.ok(B.cupTarget(1, 32) < 16, 'never reads as "qualify"');

const rand = mkRand(14);
const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(14));
const name = probe.teams.find((t) => t.region === 'eu_b').name;
const st = engine.generateLeague({ teamName: name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
{ const u = st.teams.find((t) => t.id === st.userTeamId); assert.strictEqual(st.seasonStart.budget, u.budget, 'Financial objective starts at 100% for a Tier B club'); }
st.boardPressure = 3; // leftover from the old scoring

let sum = engine.boardSummary(st);
assert.ok(sum && sum.events.length >= 3 && sum.events.every((e) => e.kind === 'bcup' || e.kind === 'btable'), 'board lists B-Tier Cup objectives');
assert.ok(sum.events.every((e) => e.target >= 1 && e.target < 16));
assert.strictEqual(st.boardPressure, 0, 'old pressure cleared once');
const det = engine.boardDetail(st); // beta.33 board window
assert.ok(det && det.tierB && det.tierB.cups.length === sum.events.filter((e) => e.kind === 'bcup').length, 'board window carries the B-Tier Cup targets');
assert.ok(!det.domestic.judged && !det.continental.judged && det.continental.worldsRace.position === 1, 'the game\'s Open/Major tabs are safe and not judged');
assert.deepStrictEqual([st.boardExpect.continental, st.boardExpect.domestic], [1, 0], 'no Tier A targets for a Tier B club');

let judged = 0;
for (let i = 0; i < 4000; i++) {
  const r = engine.advance(st, rand, 'next');
  if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } }
  if (r.stopped === 'season-end' || r.stopped === 'sacked') break;
}
const mine = st.tierB.cups.filter((c) => c.region === 'eu_b' && c.stage === 'done');
judged = mine.filter((c) => c.boardJudged).length;
assert.ok(mine.length > 0 && judged === mine.length, 'every finished B-Tier Cup was judged');
const msgs = st.inbox.filter((m) => m.type === 'board' && /B-Tier Cup/.test(m.title + m.body));
assert.strictEqual(msgs.length, mine.length, 'one board message per cup');
assert.ok(!st.inbox.some((m) => /Open/.test(m.title) && m.type === 'board'), 'the board never scores a Tier A Open');
assert.ok(!st.sacked);
engine.startNextSeason(st, rand);
const now = engine.teamById(st, st.userTeamId);
if (now.tier === 'B') assert.strictEqual(st.tierB.board.levelSeason, st.season, 'objectives re-set for the new season');
else { assert.strictEqual(st.tierB.board.active, false); assert.ok(st.boardExpect.domestic > 0, 'promoted: the game expectations are back'); }
console.log('btier-board OK, pressure', st.boardPressure, 'cups judged', judged);
