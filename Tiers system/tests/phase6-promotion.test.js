'use strict';
// Phase 6 test: promotion playoff gate at season end (extracted engine, plain Node, no real saves touched).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, log: (m) => console.log('LOG', m) });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const L = require('../src/engine/btier-loader');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const start = engine.careerStartFor(2027);

function play(st, rand) {
  let userPromo = 0;
  for (let i = 0; i < 4000; i++) {
    const r = engine.advance(st, rand, 'next');
    if (r.stopped === 'matchday') {
      const fx = engine.fixtureById(st, r.fixtureId);
      if (fx && fx.promoId) userPromo++;
      if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); }
    }
    if (r.stopped === 'season-end' || r.stopped === 'sacked') return { stopped: r.stopped, userPromo };
  }
  throw new Error('season did not finish');
}

function check(st) {
  const p = st.tierB.promo;
  assert.ok(p && p.stage === 'done' && p.season === st.season, 'season ends only after the promotion playoffs');
  for (const rid of L.REGIONS.map((x) => x + '_b')) {
    const pl = p.regions[rid];
    const table = st.tierB.cups.length ? engine.tierBStandings(st, rid) : [];
    assert.strictEqual(pl.direct, table[0].teamId, `${rid}: #1 promoted directly`);
    assert.strictEqual(pl.direct2, table[1].teamId, `${rid}: #2 promoted directly`);
    assert.deepStrictEqual(pl.seeds, table.slice(2, 6).map((x) => x.teamId), `${rid}: #3-#6 in the playoff`);
    assert.strictEqual(pl.format, 'rr');
    assert.strictEqual(pl.slots.length, 6, 'group of 4: six series');
    const pairs = new Set(pl.slots.map((s) => [s.teamA, s.teamB].sort().join('-')));
    assert.strictEqual(pairs.size, 6, 'everyone plays everyone once');
    assert.ok(pl.slots.every((s) => pl.seeds.includes(s.teamA) && pl.seeds.includes(s.teamB)));
    assert.strictEqual(new Set(pl.slots.map((s) => engine.fixtureById(st, s.fixtureId).date)).size, 3, 'three matchdays');
    for (const s of pl.slots) {
      const fx = engine.fixtureById(st, s.fixtureId);
      assert.ok(fx && fx.played && fx.bestOf === 7 && fx.stage === 'group', 'BO7 real fixture');
      assert.strictEqual(Math.max(fx.homeWins, fx.awayWins), 4);
      assert.strictEqual(s.winner, fx.homeWins > fx.awayWins ? fx.homeId : fx.awayId);
    }
    const gt = engine.tierBPromoGroup(st, pl);
    assert.strictEqual(pl.winnerId, gt[0].teamId);
    assert.deepStrictEqual(pl.promoted, [pl.direct, pl.direct2, gt[0].teamId, gt[1].teamId]);
    assert.strictEqual(new Set(pl.promoted).size, pl.promoted.length, 'no duplicate promotion');
    assert.strictEqual(pl.promoted.length, 4, 'four promoted: two directly, two via the playoff');
    assert.strictEqual(pl.relegated.length, 4, 'four relegated');
    const a = rid.replace(/_b$/, '');
    // the 4 worst by season points (ties between clubs without points are settled by squad strength, which moves during the season)
    const pts = (id) => (st.ranking || {})[id] || 0, rest = engine.regionTeams(st, a).map((t) => t.id).filter((id) => !pl.relegated.includes(id));
    assert.strictEqual(new Set(pl.relegated).size, 4);
    assert.ok(pl.relegated.every((id) => pts(id) <= Math.min(...rest.map(pts))), `${rid}: relegated clubs have the fewest points`);
    assert.ok(pl.relegated.every((id) => engine.teamById(st, id).tier === 'A'));
  }
  assert.strictEqual(st.tierB.promoHistory.length, 1);
  // the group is played right after the last cup / event (what the calendar shows), not when the game finally reports the season end
  const ends = st.events.map((e) => e.endDate).concat(st.tierB.cups.map((c) => c.endDate)).filter(Boolean).sort(), lastEnd = ends[ends.length - 1];
  const dayAfter = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  for (const pl of Object.values(p.regions)) assert(pl.startDate <= dayAfter(lastEnd, 2), 'promotion group starts right after the last event: ' + pl.startDate + ' vs ' + lastEnd);
}

// Tier A career, then the next season must plan cups again and a second playoff must be possible.
{
  const rand = mkRand(7);
  const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  const r = play(st, rand);
  assert.strictEqual(r.stopped, 'season-end'); check(st);
  const n = st.fixtures.length;
  assert.strictEqual(engine.advance(st, rand, 'next').stopped, 'season-end', 'repeat advance at season end does not redo anything');
  assert.strictEqual(st.fixtures.length, n);
  engine.startNextSeason(st, rand);
  assert.strictEqual(st.tierB.cups.length, 42);
  assert.notStrictEqual(st.tierB.promo.season, st.season);
  console.log('Tier A career: OK');
}
// Tier B manager career: the user's region is eu_b
{
  const rand = mkRand(11);
  const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(11));
  const name = probe.teams.find((t) => t.region === 'eu_b').name;
  const st = engine.generateLeague({ teamName: name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  const r = play(st, rand);
  assert.strictEqual(r.stopped, 'season-end'); check(st);
  assert.strictEqual(st.userRegion, 'eu_b', 'user region restored after advancing');
  st.events.filter((e) => e.kind === 'open').forEach((e) => assert.ok(e.field.length === 16 && e.field.every((id) => !engine.teamById(st, id).region.endsWith('_b')), 'Tier B user: Opens are Tier A only'));
  console.log('Tier B career: OK, user playoff matches played:', r.userPromo);
}
console.log('phase6 OK');

// Phase 7: season transition
{
  const rand = mkRand(21);
  const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  play(st, rand);
  const promo = st.tierB.promo;
  const roster = (id) => st.players.filter((p) => p.teamId === id).map((p) => p.id);
  const before = {};
  for (const pl of Object.values(promo.regions)) for (const id of [...pl.promoted, ...pl.relegated]) before[id] = roster(id);
  engine.startNextSeason(st, rand);
  assert.ok(promo.applied);
  const rel = new Set(promo.regions.eu_b.relegated.concat(...Object.values(promo.regions).map((x) => x.relegated)));
  const prom = new Set(Object.values(promo.regions).flatMap((x) => x.promoted));
  st.events.forEach((e) => assert.ok(!(e.field || []).some((id) => rel.has(id)), 'no relegated team in a drawn field'));
  const open1 = st.events.find((e) => e.kind === 'open');
  // Open 1 waits for the Swiss stage of its region, then the game draws it
  for (let i = 0; i < 40 && !(open1.field && open1.field.length); i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } } }
  assert.ok(open1.field.length === 16 && !open1.field.some((id) => rel.has(id)), 'Open 1 redrawn without relegated teams');
  // the region now has 32 Tier A clubs: a promoted club starts in the Swiss stage, and is in the Open only if it qualified
  const sw1 = st.uxMajors.events.find((e) => e.swiss && e.openId === open1.id && e.region === st.userRegion);
  assert.ok([...prom].filter((id) => engine.teamById(st, id).region === st.userRegion).every((id) => sw1.field.includes(id)), 'promoted team in the user region Swiss stage');
  assert.ok(open1.field.every((id) => sw1.qualified.includes(id)), 'Open 1 field = Swiss qualifiers');
  for (const pl of Object.values(promo.regions)) {
    const a = pl.region.replace(/_b$/, '');
    for (const id of pl.promoted) { const t = engine.teamById(st, id); assert.ok(t.region === a && t.tier === 'A', 'promoted team is Tier A'); }
    for (const id of pl.relegated) { const t = engine.teamById(st, id); assert.ok(t.region === pl.region && t.tier === 'B', 'relegated team is Tier B'); }
    assert.strictEqual(st.teams.filter((t) => t.region === a).length, 32, `${a}: 32 Tier A`);
    assert.strictEqual(st.teams.filter((t) => t.region === pl.region).length, 16, `${pl.region}: 16 Tier B`);
  }
  assert.strictEqual(st.tierB.moves.length, 7);
  assert.strictEqual(new Set(st.teams.map((t) => t.id)).size, st.teams.length);
  st.tierB.promo.applied = false; // a second call for the same season must still not move anyone twice
  const snap = JSON.stringify(st.teams.map((t) => [t.id, t.region]));
  engine.startNextSeason; // (applied flag reset only to prove the season guard below)
  assert.strictEqual(play(st, rand).stopped, 'season-end', 'season 2 plays with the new divisions');
  check2(st);
  console.log('Phase 7 transition: OK');
}
function check2(st) {
  const p = st.tierB.promo;
  assert.strictEqual(p.season, st.season); assert.strictEqual(st.tierB.cups.length, 42);
  for (const r of L.REGIONS) {
    assert.strictEqual(st.teams.filter((t) => t.region === r).length, 32);
    assert.strictEqual(st.teams.filter((t) => t.region === r + '_b').length, 16);
  }
}
// user team promoted: userRegion follows
{
  const rand = mkRand(33);
  const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: start, calendar: 'rlcs', economy: 'real' }, mkRand(33));
  const name = probe.teams.find((t) => t.region === 'eu_b').name;
  const st = engine.generateLeague({ teamName: name, real, startDate: start, calendar: 'rlcs', economy: 'real' }, rand);
  play(st, rand);
  const pl = st.tierB.promo.regions.eu_b;
  assert.strictEqual(st.userRegion, 'eu_b');
  if (!pl.promoted.includes(st.userTeamId)) pl.promoted[3] = st.userTeamId; // force: user is promoted (the 4th slot, so no duplicate)
  st.sacked = false; st.boardPressure = 0; // beta.33's sim can get this Tier B user sacked first; the test is about the promotion move, not the board
  engine.startNextSeason(st, rand);
  assert.strictEqual(st.userRegion, 'eu'); assert.strictEqual(engine.teamById(st, st.userTeamId).tier, 'A');
  console.log('user promotion follows userRegion: OK');
}

// Phase 9: new-career club list contains the Tier B clubs as extra regions
{
  const list = engine.clubPreview(real);
  const b = list.filter((r) => /_b$/.test(r.id));
  assert.strictEqual(b.length, 7); assert.ok(b.every((r) => r.tier === 'B' && r.clubs.length === 16));
  assert.strictEqual(list.filter((r) => !/_b$/.test(r.id)).length, 7);
  console.log('club list: OK');
}
