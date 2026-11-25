// Preview state for the late-game UI (Club -> Facilities): a Tier A career, late game unlocked, headquarters tier 4, some buildings finished, two under construction.
// writes %TEMP%/h/state-late.json (open the preview with ?late). `node gen-late.js fresh` = unlocked but nothing built and no mode chosen (for the popup); `node gen-late.js b` = Tier B club (locked tab).
const R = require('path').resolve(__dirname, '../../..').split(require('path').sep).join('/') + '/';
const ev = require(R + 'app_extracted/engine/events.js');
const engine = require(R + 'Tiers system/src/engine/btier-state').wrapEngine(require(R + 'app_extracted/engine/league.js'), { events: ev });
engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind
const real = require(R + 'app_extracted/data/rlcs-2027.json');
const fresh = process.argv.includes('fresh'), tierB = process.argv.includes('b'), circ = process.argv.includes('circuit'), plan = process.argv.includes('plan'), bids = process.argv.includes('bids'), leg = process.argv.includes('legacy'); // circuit = Arena 2 and a circuit with stops played; plan = Arena 2, no circuit yet
let s = 5; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, () => 0.5);
const st = engine.generateLeague({ teamName: tierB ? probe.teams.find((t) => t.region === 'eu_b').name : 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const t = engine.teamById(st, st.userTeamId); t.budget = 60e6;
if (!tierB) for (let i = 1; i <= 4; i++) engine.buyFacility(st, i);
const rpc = (o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const day = (n) => { for (let i = 0; i < n; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } } };
day(2);
if (!fresh && !tierB) {
  rpc({ a: 'mode', mode: 'standard' });
  rpc({ a: 'build', id: 'arena' }); rpc({ a: 'build', id: 'scouting' }); day(16);
  rpc({ a: 'build', id: 'arena' }); rpc({ a: 'build', id: 'fanzone' }); day(3);
}
if (leg) { // one full season, rollover, and a retired star so the Hall of Fame has an entry
  const L = engine.uxLate.legacy; day(2);
  for (let g = 0; g < 700; g++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } if (r.stopped === 'season-end') break; }
  const d = L.data(st), tt = engine.teamById(st, st.userTeamId), star = engine.playerById(st, tt.playerIds[0]);
  star.season = { games: 40, goals: 60, assists: 20, saves: 40, shots: 100, mvps: 12, wins: 30, losses: 5 }; star.rating = 94; L.closeSeason(st); L.closeSeason(st); star.retired = true; L.judge(st);
  engine.startNextSeason(st, rand); st.late.wins = { major: 2, open: 5, seen: [] };
}
if (bids) { // Arena level 3, then days until a Major bid window is open
  t.budget = 30e6; t.followers = 600000;
  const arena = () => engine.uxLate.build.level(st, 'arena');
  for (let g = 0; g < 400 && arena() < 3; g++) { if (!st.late.clubs[st.userTeamId].queue.length) rpc({ a: 'build', id: 'arena' }); day(1); }
  for (let g = 0; g < 300 && !rpc({ a: 'official' }).targets.some((x) => x.status === 'open' && x.kind === 'major'); g++) day(1);
  t.budget = 30e6;
}
if (circ || plan) {
  day(40); // Arena level 2 is done after 30 days
  if (circ) {
    const w = []; const club = engine.uxClub; for (const d of club.windows(st, 3, 40)) if (d > new Date(Date.parse(st.currentDate) + 22 * 864e5).toISOString().slice(0, 10) && (!w.length || Date.parse(d) - Date.parse(w[w.length - 1]) >= 8 * 864e5)) w.push(d);
    t.followers = 500000; t.budget = 20e6;
    const r = rpc({ a: 'circuit', name: 'Vitality Series', stops: w.slice(0, 3), finalsStart: new Date(Date.parse(w[2]) + 30 * 864e5).toISOString().slice(0, 10), prize: 500000, finalsPrize: 1000000 });
    console.log('circuit', r.ok, r.error || '');
    day(Math.round((Date.parse(w[1]) - Date.parse(st.currentDate)) / 864e5) + 4);
  }
}
if (process.argv.includes('offers')) { st.uxManager.points = 60; day(3); } // manager offers (use together with 'legacy': a season has passed)
const snap = { career: st, appearance: {}, version: 'x', frameless: false, difficulties: engine.DIFFICULTIES, seriesLengths: engine.SERIES_LENGTHS, table: engine.computeTable(st), board: engine.boardSummary(st), starters: engine.userLineup(st), logoLums: {}, eventSchedules: {}, groupTables: engine.groupTables(st), flags: {}, regionName: 'Europe', eventField: 16, majorSlots: {}, wages: {}, nations: {}, homes: {}, ratingExact: {} };
require('fs').mkdirSync(process.env.TEMP + '/h', { recursive: true });
require('fs').writeFileSync(process.env.TEMP + '/h/state-late' + (fresh ? '-fresh' : '') + (tierB ? '-b' : '') + (circ ? '-circuit' : '') + (plan ? '-plan' : '') + (bids ? '-bids' : '') + (leg ? '-legacy' : '') + '.json', JSON.stringify(snap));
console.log(st.currentDate, JSON.stringify(st.late && st.late.clubs && st.late.clubs[st.userTeamId]));
