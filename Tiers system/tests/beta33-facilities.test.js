'use strict';
// Tier B clubs buy beta.33 headquarters at scaled prices; Tier A prices are the game's; the Academy follows the facility boost.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const gen = (name) => engine.generateLeague({ teamName: name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(5));
const probe = gen('Team Vitality');
const st = gen(probe.teams.find((t) => t.region === 'eu_b').name), me = engine.teamById(st, st.userTeamId);
let b = engine.facilityBoard(st);
assert.strictEqual(b.list[0].price, 1500, 'Tier B gaming house: 15% of 10k');
me.budget = 1400; assert(!engine.buyFacility(st, 1).ok, 'too poor');
me.budget = 9000; const l0 = (st.ledger || []).length;
let r = engine.buyFacility(st, 1);
assert(r.ok && r.cost === 1500 && me.budget === 7500, 'paid the scaled price: ' + JSON.stringify(r) + ' ' + me.budget);
assert.strictEqual(st.ledger[st.ledger.length - 1].amount, -1500, 'ledger shows the scaled price');
b = engine.facilityBoard(st);
assert.strictEqual(b.list[1].cost, 6000 - 1500, 'upgrade pays the difference');
me.budget = 100000; r = engine.buyFacility(st, 2); assert(r.ok && me.budget === 100000 - 4500, 'upgrade at scaled difference');
// Tier A: the game's own prices
const a = gen('Team Vitality');
assert.strictEqual(engine.facilityBoard(a).list[0].price, 10000, 'Tier A unchanged');
console.log('beta33 facilities: OK');
