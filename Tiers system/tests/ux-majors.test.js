'use strict';
// Kick-Off Weekend, Esports World Cup, Tournament MVP and Player of the Year (extracted engine, plain Node).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const titles = require(path.join(APP, 'engine', 'titles.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, titles });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);
const rpc = (st, o) => engine.placeBet(st, 'uxc:' + JSON.stringify(o), 0, 0, 0);

function playSeason(st, rand) {
  for (let i = 0; i < 4000; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
    if (r.stopped === 'season-end' || r.stopped === 'sacked') return r.stopped;
  }
  throw new Error('season did not finish');
}


{
  const rand = mkRand(21);
  const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  const evs = st.uxMajors.events;
  const ko = evs.find((e) => e.kind === 'kickoff'), ewc = evs.find((e) => e.kind === 'ewc');
  assert.ok(ko && ewc, 'both events planned');
  const open1 = st.events.find((e) => e.kind === 'open'), m2 = st.events.filter((e) => e.kind === 'major')[1], lcq = st.events.find((e) => e.kind === 'lcq');
  assert.ok(ko.endDate < open1.startDate && ko.startDate > st.currentDate, 'Kick-Off is before Open 1');
  assert.ok(ewc.startDate > m2.endDate && ewc.endDate < lcq.startDate, 'EWC sits between Major 2 and the LCQ');
  assert.ok(!st.events.some((e) => e.kind === 'kickoff' || e.kind === 'ewc'), 'the game\'s own events are untouched');
  const nEvents = st.events.length;

  const seenNews = [], seenHead = []; // the game trims old news, so record what is pushed
  const pn = engine.pushNews, ph = engine.pushHeadline;
  engine.pushNews = function (s, r, o) { seenNews.push(o); return pn.apply(this, arguments); };
  engine.pushHeadline = function (s, o) { seenHead.push(o); return ph.apply(this, arguments); };
  assert.strictEqual(playSeason(st, rand), 'season-end');
  engine.pushNews = pn; engine.pushHeadline = ph;
  assert.strictEqual(st.events.length, nEvents);
  for (const e of [ko, ewc]) {
    assert.strictEqual(e.stage, 'done', e.name + ' finished');
    assert.strictEqual(e.field.length, e.kind === 'ewc' ? 16 : 8);
    assert.strictEqual(e.standings.length, e.field.length);
    assert.ok(e.standings.every((x) => x.points === 0 && x.prize > 0), 'prize money, no points');
    const fx = st.fixtures.filter((f) => f.xevId === e.id);
    assert.ok(fx.length && fx.every((f) => f.played), 'every match played');
    const bk = e.kind === 'ewc' ? 'worlds' : 'major'; // the series length setting decides (see ux-series-length.test.js)
    assert.ok(fx.filter((f) => f.stage === 'group').every((f) => f.bestOf === ev.bestOfFor(bk, 'group', st.seriesLength)) && fx.filter((f) => f.stage === 'playoff').every((f) => f.bestOf === ev.bestOfFor(bk, 'playoff', st.seriesLength)), 'groups and playoffs follow the series length');
  }
  for (const e of [ko, ewc]) {
    const nm = engine.teamById(st, e.championId).name + ' win the ' + e.name;
    assert.ok(seenNews.some((n) => n.headline === nm && n.category === 'result'), e.name + ' winner is in the News list');
    assert.ok(seenHead.some((h) => h.headline === nm), e.name + ' winner is a Home headline');
  }
  // Kick-Off field = the best Tier A teams (season 1: by strength), EWC = ranking
  const rankOrder = Object.entries(st.ranking || {}).sort((a, b) => b[1] - a[1]).map((x) => Number(x[0]));
  assert.ok(ewc.field.slice(0, 3).every((id) => rankOrder.indexOf(id) < 8), 'EWC field comes from the season ranking');
  // MVPs: both new events + the game's events, one per event, only playoff players
  const u = st.uxAwards;
  assert.ok(u.mvp.some((m) => m.event === 'Esports World Cup') && u.mvp.some((m) => m.event === 'Kick-Off Weekend'), 'MVP for the new events');
  assert.ok(u.mvp.some((m) => m.kind === 'major') && u.mvp.some((m) => m.kind === 'worlds') && u.mvp.some((m) => m.kind === 'open'), 'MVP for Opens, Majors and Worlds');
  assert.strictEqual(new Set(u.mvp.map((m) => m.key)).size, u.mvp.length, 'one MVP per event');
  const ewcMvp = u.mvp.find((m) => m.event === 'Esports World Cup'), top8 = new Set(ewc.standings.filter((x) => x.placement <= 16).map((x) => x.teamId));
  assert.ok(top8.has(ewcMvp.teamId) && !ewcMvp.modelled, 'EWC MVP is a real match-stat winner from a playoff team');
  assert.ok(u.mvp.some((m) => m.modelled), 'simulated regional events get a modelled MVP');

  // season roll: Player of the Year, next season planned, last ranking kept for the Kick-Off field
  engine.startNextSeason(st, rand);
  assert.strictEqual(u.poty.length, 1); assert.strictEqual(u.poty[0].season, 1);
  assert.ok(st.uxMajors.events.some((e) => e.season === 2 && e.kind === 'kickoff') && st.uxMajors.events.some((e) => e.season === 2 && e.kind === 'ewc'), 'season 2 planned');
  assert.strictEqual(st.uxMajors.lastRanking.length, 16);
  console.log('Tier A career OK: KO champion', engine.teamById(st, ko.championId).name, '| EWC champion', engine.teamById(st, ewc.championId).name, '| POTY', u.poty[0].name, '| MVPs', u.mvp.length);
}

// Tier B manager: the events still run (Tier A only), the user is never in them
{
  const rand = mkRand(11);
  const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(11));
  const name = probe.teams.find((t) => t.region === 'eu_b').name;
  const st = engine.generateLeague({ teamName: name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  assert.strictEqual(playSeason(st, rand), 'season-end');
  const done = st.uxMajors.events.filter((e) => e.stage === 'done' && !e.swiss);
  assert.strictEqual(done.length, 2);
  assert.ok(done.every((e) => !e.field.includes(st.userTeamId)), 'a Tier B club is never in a Tier A event');
  console.log('Tier B career OK');
}
{ // Kick-Off Weekend pays a fixed 142,000 pool in the real economy; the renderer's prize tables carry it too (calendar)
  const M = require('../src/engine/ux-majors'), t = M.prizeTable(ev, 'kickoff', true);
  assert.strictEqual(t.length, 8); assert.strictEqual(t.reduce((x, y) => x + y, 0), 142000);
  const pr = require('../src/engine/ux-prize')(ev);
  assert.strictEqual(pr['1:kickoff:'].reduce((x, y) => x + y, 0), 142000); assert.ok(pr['1:ewc:'].some((v) => v > 0));
}
console.log('ux-majors OK');
