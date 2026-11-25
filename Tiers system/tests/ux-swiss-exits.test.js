'use strict';
// Clubs out in the Swiss stage get a place by record (2-3, 1-3, 0-3), and the game's board sees it instead of "17th" for everyone.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(11); // a seed where the user goes out 0-3 (checked: 3 -> 2-3, 21 -> 1-3)
const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(1));
// a small club of a 32-club region, so it very likely goes out in the Swiss
const weak = probe.teams.filter((t) => t.region === 'eu' && !t.nation).sort((a, b) => (a.followers || 0) - (b.followers || 0))[0].name;
const st = engine.generateLeague({ teamName: weak, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } return r; };
let open = null;
for (let i = 0; i < 200 && !open; i++) { step(); open = st.events.find((e) => e.kind === 'open' && e.stage === 'done'); }
assert(open, 'first Open finished');
step();
const sw = st.uxMajors.events.find((e) => e.swiss && e.openId === open.id && e.region === st.userRegion);
assert(sw && sw.stage === 'done', 'its Swiss is done');
const out = sw.standings.filter((x) => !x.through);
assert(out.length > 0 && out.every((x) => x.band >= 17), 'out clubs have a band');
// better record = better (smaller) band; same record = same band; the worst band ends at the field size
const rank = (x) => x.wins * 10 - x.losses;
for (const a of out) for (const b of out) { if (rank(a) > rank(b)) assert(a.band < b.band, 'better record, better band'); if (a.wins === b.wins && a.losses === b.losses) assert.strictEqual(a.band, b.band); }
assert.strictEqual(Math.max(...out.map((x) => x.band)), sw.standings.length, 'last band ends at the field size');
assert(new Set(out.map((x) => x.band)).size >= 2, 'more than one band (2-3, 1-3, 0-3)');
// the Open's own standings now list them (no points, no prize)
const inOpen = open.standings.filter((x) => x.swiss);
assert.strictEqual(inOpen.length, out.length); assert(inOpen.every((x) => x.points === 0 && x.prize === 0));
assert.strictEqual(open.standings.filter((x) => !x.swiss).length, 16, 'the 16 qualifiers are untouched');
// the game's board: a user who went out sees the band, not 17
const me = open.standings.find((x) => x.teamId === st.userTeamId);
if (me && me.swiss) { const row = engine.boardDetail(st).domestic.splits.flatMap((s) => s.rows).find((r) => r.name === open.name); assert.strictEqual(row.place, me.placement, 'board shows the band'); assert(row.place >= 17 && row.met === false); console.log('user went out:', me.wins + '-' + me.losses, '-> place', row.place); }
console.log('ux-swiss-exits: ok | bands', JSON.stringify([...new Set(out.map((x) => x.band))]));
