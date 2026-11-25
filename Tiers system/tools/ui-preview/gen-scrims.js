// Preview state with scrims: a few played (3v3 / 2v2 / 1v1) and two booked. Writes %TEMP%/h/state-s.json (open the preview with ?scr).
const R = 'D:/Documents D/Career-Mode-Modifier/';
const ev = require(R + 'app_extracted/engine/events.js');
const engine = require(R + 'Tiers system/src/engine/btier-state').wrapEngine(require(R + 'app_extracted/engine/league.js'), { events: ev });
const real = require(R + 'app_extracted/data/rlcs-2027.json');
let s = 5; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
// quiet period: no event running (so Home shows the normal layout)
const live = () => st.events.some((e) => e.stage && e.stage !== 'done' && e.stage !== 'scheduled' && e.startDate <= st.currentDate);
for (let i = 0; i < 4000 && live(); i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } }
const me = engine.teamById(st, st.userTeamId), opps = st.teams.filter((t) => t.region === me.region && t.id !== me.id);
const book = (o, i) => { const r = engine.uxScrims.book(st, { oppId: opps[i].id, ...o }); return r.ok ? r.scrim : null; };
for (const [o, i] of [[{ fmt: '3v3', bo: 5, weeks: 1 }, 0], [{ fmt: '2v2', bo: 3, weeks: 1 }, 1], [{ fmt: '1v1', bo: 7, weeks: 1 }, 2]]) { const sc = book(o, i); if (sc) { sc.date = st.currentDate; engine.uxScrims.tick(st); } }
book({ fmt: '3v3', bo: 3, weeks: 2 }, 3); book({ fmt: '2v2', bo: 1, weeks: 3 }, 4);
const snap = { career: st, appearance: {}, version: 'x', frameless: false, difficulties: engine.DIFFICULTIES, seriesLengths: engine.SERIES_LENGTHS, table: engine.computeTable(st), board: engine.boardSummary(st), starters: engine.userLineup(st) };
require('fs').writeFileSync(process.env.TEMP + '/h/state-s.json', JSON.stringify(snap));
console.log(st.uxScrims.history.length, st.uxScrims.list.length);
