'use strict';
// Scouts: a Tier B career starts with 1 scout and a wage budget that fits; scouts can be hired and fired; the scout count limits parallel scouting jobs.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxc:' + JSON.stringify(o), 0, 0, 0);
const start = engine.careerStartFor(2027);
const career = (name, seed) => engine.generateLeague({ teamName: name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(seed));
const scouts = (st) => engine.staffList(st).filter((x) => x.role === 'scout');

// Tier A: unchanged, 3 scouts
{
  const st = career('Team Vitality', 41);
  assert.strictEqual(scouts(st).length, 3, 'Tier A keeps the 3 seeded scouts');
}

// Tier B: 1 scout, and the wage budget leaves room for a content creator
{
  const probe = career('Team Vitality', 42), name = probe.teams.find((t) => t.region === 'eu_b').name, st = career(name, 42), me = engine.teamById(st, st.userTeamId);
  assert(/_b$/.test(me.region)); assert.strictEqual(scouts(st).length, 1, 'Tier B starts with 1 scout');
  assert(me.wageBudget >= 1500 && engine.wageRoom(st) >= 500, 'room for staff and a creator: ' + engine.wageRoom(st));
  const i = rpc(st, { a: 'staffinfo' }); assert(i.scouts.length === 1 && i.pool.length >= 4 && i.room === engine.wageRoom(st));

  // hire the cheapest, then a second job needs a second scout
  me.wageBudget = 5000;
  assert(!rpc(st, { a: 'staffhire', cid: -1 }).ok, 'unknown candidate');
  const cheap = i.pool.slice().sort((a, b) => a.wage - b.wage)[0], top = i.pool.find((c) => c.skill === 3);
  const hired = rpc(st, { a: 'staffhire', cid: cheap.cid }); assert(hired.ok, hired.error); assert.strictEqual(scouts(st).length, 2);
  assert(!rpc(st, { a: 'staffhire', cid: cheap.cid }).ok, 'the same scout can not be hired twice');
  me.wageBudget = engine.wageBill(st).total + 50; // no room left
  assert(/more than the wage budget/.test(rpc(st, { a: 'staffhire', cid: top.cid }).error), 'wage budget is respected');
  me.wageBudget = 5000; assert(rpc(st, { a: 'staffhire', cid: top.cid }).ok); assert.strictEqual(scouts(st).length, 3);
  assert(/at most 3/.test(rpc(st, { a: 'staffhire', cid: i.pool.find((c) => c.cid !== top.cid && c.cid !== cheap.cid).cid }).error));

  // jobs are limited by the scouts, a scout out on a job can not be fired, a free one can
  const rand = mkRand(5), targets = st.players.filter((p) => p.teamId !== st.userTeamId && p.teamId >= 0).slice(0, 4);
  const jobs = targets.map((p) => engine.startScouting(st, p.id, rand));
  assert.deepStrictEqual(jobs.map((j) => j.ok), [true, true, true, false], 'three scouts, three jobs');
  const busy = scouts(st).find((x) => st.scouts.jobs.some((j) => j.scoutId === x.id));
  assert(!rpc(st, { a: 'stafffire', id: busy.id }).ok, 'a scout on a job can not be fired');
  st.scouts.jobs.pop(); const free = scouts(st).find((x) => !st.scouts.jobs.some((j) => j.scoutId === x.id));
  assert(rpc(st, { a: 'stafffire', id: free.id }).ok); assert.strictEqual(scouts(st).length, 2);
  assert(!engine.startScouting(st, targets[3].id, rand).ok, 'two scouts, both busy');
  // the wage floor holds the next day
  me.wageBudget = 10; engine.advance(st, rand, 'day'); assert(me.wageBudget >= 1500, 'daily wage floor for Tier B');
}

// a skilled scout is faster than a rookie
{
  const st = career('Team Vitality', 43), rand = mkRand(9), ps = st.players.filter((p) => p.teamId !== st.userTeamId && p.teamId >= 0);
  const len = (skill, p) => { st.scouts = { jobs: [], reports: {}, partial: {} }; engine.staffList(st).forEach((x) => { x.skill = skill; }); const r = engine.startScouting(st, p.id, mkRand(77)); return r.days; };
  assert(len(3, ps[0]) < len(1, ps[0]), 'veteran scouts finish sooner than rookies');
  engine.staffList(st).forEach((x) => { delete x.skill; }); st.scouts = { jobs: [], reports: {}, partial: {} };
  assert(engine.startScouting(st, ps[1].id, rand).ok, 'the game\'s own scouts (no skill) work');
}
console.log('staff ok');
