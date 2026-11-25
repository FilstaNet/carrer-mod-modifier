'use strict';
// Kick-Off Weekend and the Esports World Cup follow the series length setting (Quickest / Shortened / Authentic): when drawn, and when the setting changes later.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const titles = require(path.join(APP, 'engine', 'titles.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, titles });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);
const want = (e, st, id) => { const k = e.kind === 'ewc' ? 'worlds' : 'major'; return { group: ev.bestOfFor(k, 'group', id), playoff: ev.bestOfFor(k, 'playoff', id), final: ev.bestOfFor(k, 'final', id) }; };
const check = (e, id, st) => {
  const w = want(e, null, id);
  assert.deepStrictEqual([e.groupBestOf, e.playoffBestOf, e.finalBestOf], [w.group, w.playoff, w.final], e.name + ' best-of values, ' + id);
  for (const s of e.slots) if (!st || (s.winner == null && !(engine.fixtureById(st, s.fixtureId) || {}).played)) assert.strictEqual(s.bestOf, s.stage === 'group' ? w.group : s.stage === 'final' ? w.final : w.playoff, e.name + ' ' + s.stage + ' slot, ' + id);
};

for (const id of ['quick', 'shortened', 'authentic']) {
  const rand = mkRand(21), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  st.seriesLength = id;
  const [ko, ewc] = ['kickoff', 'ewc'].map((k) => st.uxMajors.events.find((e) => e.kind === k));
  for (let i = 0; i < 400 && ewc.stage === 'pending'; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
  assert.notStrictEqual(ewc.stage, 'pending', 'EWC drawn');
  check(ko, id); check(ewc, id);
  if (id === 'authentic') { assert.strictEqual(ewc.groupBestOf, 5); assert.strictEqual(ewc.playoffBestOf, 7); }
  if (id === 'quick') assert.strictEqual(ewc.groupBestOf, 1);
  // changing the setting after the draw reaches the matches that are not played yet
  if (id === 'shortened' && ewc.stage !== 'done') { const u = ewc.slots.find((s) => s.winner == null); u.bestOf = 99; assert(engine.editCareerSettings(st, { seriesLength: 'shortened' }).ok); assert.notStrictEqual(u.bestOf, 99, 'saving the same setting repairs a stale event'); }
  if (id !== 'quick' && ewc.stage !== 'done') { assert(engine.editCareerSettings(st, { seriesLength: 'quick' }).ok); check(ewc, 'quick', st); assert(ewc.slots.some((s) => s.winner == null), 'something left to change'); }
}
console.log('ux-series-length: ok');
