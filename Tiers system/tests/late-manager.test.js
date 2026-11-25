'use strict';
// Manager career (late-manager.js): clubs led, honours, milestones, backfill from the archive, a (simulated) club switch. Real engine.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const M = engine.uxManager;
assert(M, 'late manager installed');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(3), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const me = st.userTeamId;
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } return r; };

// 1) a first day creates the data and one running stint; no state.late is needed (works for any manager career)
step();
let d = st.uxManager;
assert(d && d.stints.length === 1 && !d.stints[0].end && d.stints[0].teamId === me, 'one running stint');

// 2) a title is counted once; the first milestone pays once
st.events.push({ id: 99001, kind: 'major', name: 'Test Major', stage: 'done', championId: me, startDate: '2020-01-01', endDate: '2020-01-02', split: 0 });
const f0 = engine.teamById(st, me).followers, inbox0 = st.inbox.length;
step(); step();
assert.strictEqual(d.honours.length, 1, 'title counted once');
assert(d.rewards.first && d.points === 5, 'first-trophy milestone');
assert(engine.teamById(st, me).followers > f0 && st.inbox.length > inbox0, 'reward paid and announced');
assert.strictEqual(d.stints[0].titles, 1);

// 3) a season rolls over: the stint counts it; JSON save/load keeps everything
for (let i = 0; i < 700; i++) if (step().stopped === 'season-end') break;
engine.startNextSeason(st, rand);
assert.strictEqual(st.uxManager.stints[0].seasons, 1, 'season counted');
const copy = JSON.parse(JSON.stringify(st)); step(); engine.advance(copy, rand, 'day');
assert.strictEqual(copy.uxManager.honours.length, st.uxManager.honours.length, 'save/load keeps honours');

// 4) a club switch (what Phase 5 will do) closes the stint and opens a new one; old titles stay with the manager
const other = st.teams.find((t) => t.id !== me && t.tier !== 'B' && !t.nation && t.region === engine.teamById(st, me).region);
const before = st.uxManager.honours.length;
st.userTeamId = other.id; step();
d = st.uxManager;
assert.strictEqual(d.stints.length, 2, 'two stints');
assert(d.stints[0].end === 'moved' && !d.stints[1].end && d.stints[1].teamId === other.id, 'old closed, new open');
assert.strictEqual(d.honours.length, before, 'honours kept after moving');
st.events.push({ id: 99002, kind: 'open', name: 'Test Open', stage: 'done', championId: other.id, startDate: '2020-01-01', endDate: '2020-01-02', split: 0 });
step(); assert.strictEqual(d.honours.length, before + 1); assert.strictEqual(d.stints[1].titles, 1, 'new title belongs to the new stint');
const v = M.view(st); assert(v.stints.length === 2 && v.lifetime.series >= 0, 'view');

// 5) an old save with an archive but no manager data: rebuilt from seasonHistory, the current club's stint is reopened
const old = JSON.parse(JSON.stringify(st)); delete old.uxManager; old.userTeamId = me;
M.tick(old);
assert(old.uxManager.stints.length >= 1 && old.uxManager.stints[0].teamId === me, 'backfill');
assert(!old.uxManager.stints[old.uxManager.stints.length - 1].end, 'running stint after backfill');

// 6) a player career is ignored
const pl = JSON.parse(JSON.stringify(st)); delete pl.uxManager; pl.mode = 'player'; M.tick(pl); assert(!pl.uxManager, 'no data in a player career');
console.log('late-manager: ok');
