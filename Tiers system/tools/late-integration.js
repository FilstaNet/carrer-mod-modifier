'use strict';
// Integration run for the whole late game: a strong Tier A manager plays N seasons with a bot that builds everything, runs a circuit, bids for official events,
// and the state is saved/loaded (JSON round trip) at every season end. Prints what happened and every error the late-game modules logged.
// Usage: node tools/late-integration.js [seasons=3] [seed=1]
const path = require('path');
const R = path.join(__dirname, '..', '..');
const errors = [];
const log = (m) => { if (/fail|error/i.test(m)) errors.push(m); };
const ev = require(path.join(R, 'app_extracted', 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(R, 'app_extracted', 'engine', 'league.js')), { events: ev, log });
const real = require(path.join(R, 'app_extracted', 'data', 'rlcs-2027.json'));
const [seasons = 3, seed = 1] = process.argv.slice(2).map(Number);
let s = seed >>> 0; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const late = engine.uxLate; late.REQ.major = 0; late.REQ.open = 0;
let st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const me = () => engine.teamById(st, st.userTeamId);
const rpc = (o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
me().budget = 30e6; me().followers = 400000;
const ORDER = ['arena', 'fanzone', 'studio', 'academy', 'scouting', 'analytics', 'wellbeing', 'museum'];
const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const stat = { builds: 0, circuits: 0, bids: 0, won: 0, hofs: 0, days: 0 };
function bot() {
  const hq = engine.facilityBoard(st); if (hq && hq.tier < 6) engine.buyFacility(st, hq.tier + 1);
  for (let i = 0; i < 2; i++) for (const id of ORDER) if (rpc({ a: 'build', id }).ok) { stat.builds++; break; }
  const h = st.late && st.late.host;
  if (late.build.level(st, 'arena') >= 2 && !(h && h.circuits.some((c) => c.stage === 'planned' || c.stage === 'running'))) {
    const w = []; for (const d of engine.uxClub.windows(st, 3, 60)) if (d > add(st.currentDate, 25) && (!w.length || Date.parse(d) - Date.parse(w[w.length - 1]) >= 8 * 864e5)) w.push(d);
    if (w.length >= 3 && me().budget > 3e6) { const r = rpc({ a: 'circuit', stops: w.slice(0, 3), finalsStart: add(w[2], 30), prize: 400000, finalsPrize: 800000 }); if (r.ok) stat.circuits++; }
  }
  if (late.build.level(st, 'arena') >= 3) {
    const v = rpc({ a: 'official' }); for (const t of v.targets || []) if (t.status === 'open' && !v.hosting && !(st.late.bids.list || []).some((b) => b.key === t.key)) { if (rpc({ a: 'bid', key: t.key, amount: t.max }).ok) stat.bids++; }
  }
}
let yr = 0, guard = 0;
while (yr < seasons && guard++ < 365 * (seasons + 1)) {
  const r = engine.advance(st, rand, 'day'); stat.days++;
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  if (stat.days % 5 === 0 && late.active(st)) { if (me().budget < 5e6) me().budget = 15e6; bot(); } // keep the club solvent: this run tests the systems, not the economy
  if (r.stopped === 'season-end') {
    engine.startNextSeason(st, rand); yr++;
    st = JSON.parse(JSON.stringify(st)); // save / load round trip
    const d = late.legacy.data(st);
    console.log('season', st.season - 1, 'done | levels', ORDER.reduce((a, id) => a + late.build.level(st, id), 0), '| legacy seasons', d.seasons.length, 'players', Object.keys(d.players).length, 'rivals', Object.keys(d.h2h).length, 'hof', d.hof.length, '| bids', (st.late.bids ? st.late.bids.list.map((b) => b.name + ':' + b.status).join(', ') : '-'));
  }
}
stat.won = ((st.late.bids && st.late.bids.list) || []).filter((b) => b.status === 'won' || b.status === 'paid').length;
const circ = ((st.late.host && st.late.host.circuits) || []).map((c) => c.name + ':' + c.stage + (c.champion != null ? ' champion ' + engine.teamById(st, c.champion).name : ''));
for (const m of st.inbox.filter((x) => /cancelled|fell through/.test(x.title))) console.log('  note:', m.date, m.title, '|', m.body.slice(0, 200));
console.log(JSON.stringify(stat), '\ncircuits', circ.join(' | ') || '-', '\nerrors logged:', errors.length); for (const e of errors.slice(0, 8)) console.log(' ', e.split('\n').slice(0, 3).join(' | ').slice(0, 300));
process.exit(errors.length ? 1 : 0);
