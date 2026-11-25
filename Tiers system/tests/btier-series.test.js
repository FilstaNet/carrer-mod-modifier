'use strict';
// Changing the game's series length must reach Tier B cups and Swiss stages that are not played yet.
const assert = require('assert');
const path = require('path');
const ev = require(path.join(__dirname, '..', '..', 'app_extracted', 'engine', 'events.js'));
const S = require('../src/engine/btier-series');

const state = {
  seriesLength: 'shortened',
  fixtures: [{ id: 1, bestOf: 5 }, { id: 2, bestOf: 5, played: true }],
  tierB: { cups: [
    { stage: 'groups', groupBestOf: 5, playoffBestOf: 5, finalBestOf: 7, slots: [
      { stage: 'group', bestOf: 5, fixtureId: 1 }, { stage: 'group', bestOf: 5, fixtureId: 2, winner: 3 }, { stage: 'final', bestOf: 7 }] },
    { stage: 'done', groupBestOf: 5, slots: [{ stage: 'group', bestOf: 5 }] }] },
  uxMajors: { events: [{ kind: 'swiss', id: 9, stage: 'running', bestOf: 5 }] }
};
state.fixtures.push({ id: 3, xevId: 9, bestOf: 5 });
let called = 0;
const engine = { editCareerSettings(s, p) { called++; if (p.seriesLength) s.seriesLength = p.seriesLength; return { ok: true }; } };
S.install(engine, ev);
engine.editCareerSettings(state, { seriesLength: 'quick' });

const q = (st) => ev.bestOfFor('open', st, 'quick');
const [c, done] = state.tierB.cups;
assert.strictEqual(called, 1);
assert.strictEqual(c.groupBestOf, q('group'));
assert.strictEqual(c.slots[0].bestOf, q('group'));
assert.strictEqual(state.fixtures[0].bestOf, q('group'), 'unplayed fixture follows');
assert.strictEqual(c.slots[1].bestOf, 5, 'decided slot kept');
assert.strictEqual(state.fixtures[1].bestOf, 5, 'played fixture kept');
assert.strictEqual(c.slots[2].bestOf, q('final'));
assert.strictEqual(done.slots[0].bestOf, 5, 'finished cup kept');
assert.strictEqual(state.uxMajors.events[0].bestOf, q('group'));
assert.strictEqual(state.fixtures[2].bestOf, q('group'));
console.log('btier-series: ok');
