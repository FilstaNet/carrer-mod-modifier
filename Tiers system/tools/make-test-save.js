'use strict';
// Writes a TEST career save for the real game: a Tier A manager (default Team Vitality) with the late game already unlocked
// (the 2 majors + 5 opens grind skipped), headquarters tier 4, the Arena at level 2 and a comfortable budget, so Facilities and Hosting can be tried at once.
// Usage: node tools/make-test-save.js [teamName="Team Vitality"] [fileName=test-late-hosting] [full]
// `full`: also two open job offers (Club -> Manager), and also Arena level 3 and a Museum, two played seasons (so Legacy has records and rivals), one seeded Hall of Fame player, and the date moved to a day when a Major bid window is open (default file name test-late-full).
// The save goes to %APPDATA%/rl-career-hub/saves/<fileName>.json. It never overwrites an existing file.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
const ev = require(path.join(R, 'app_extracted', 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(R, 'app_extracted', 'engine', 'league.js')), { events: ev });
const real = require(path.join(R, 'app_extracted', 'data', 'rlcs-2027.json'));
const full = process.argv.includes('full');
const [teamName = 'Team Vitality', fileName = full ? 'test-late-full' : 'test-late-hosting'] = process.argv.slice(2).filter((x) => x !== 'full');
const dir = path.join(process.env.APPDATA, 'rl-career-hub', 'saves'), file = path.join(dir, fileName + '.json');
if (!fs.existsSync(dir)) throw new Error('Save folder not found: ' + dir);
if (fs.existsSync(file)) throw new Error('Refusing to overwrite ' + file);

let s = 7; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind while building
const st = engine.generateLeague({ teamName, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const t = engine.teamById(st, st.userTeamId); t.budget = 20e6; t.followers = Math.max(t.followers || 0, 300000);
for (let i = 1; i <= 4; i++) engine.buyFacility(st, i);
const rpc = (o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } };
const until = (cond, max = 400) => { for (let i = 0; i < max && !cond(); i++) step(); if (!cond()) throw new Error('did not finish in ' + max + ' steps'); };
const arena = () => engine.uxLate.build.level(st, 'arena');
step(); step();
rpc({ a: 'mode', mode: 'standard' });
if (!rpc({ a: 'build', id: 'arena' }).ok) throw new Error('arena level 1 refused'); until(() => arena() >= 1);
if (!rpc({ a: 'build', id: 'arena' }).ok) throw new Error('arena level 2 refused'); until(() => arena() >= 2);
if (full) {
  t.budget = 60e6;
  const level = (id) => engine.uxLate.build.level(st, id);
  if (!rpc({ a: 'build', id: 'arena' }).ok) throw new Error('arena level 3 refused'); until(() => level('arena') >= 3);
  if (!rpc({ a: 'build', id: 'museum' }).ok) throw new Error('museum refused'); until(() => level('museum') >= 1);
  const season = () => { for (let i = 0; i < 700; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } if (r.stopped === 'season-end') break; } engine.startNextSeason(st, rand); };
  season(); season(); t.budget = 60e6;
  // a seeded Hall of Fame player: an already retired player of the league with a made-up spell at the club (only the Legacy data is touched, no roster)
  const L = engine.uxLate.legacy, d = L.data(st), old = st.players.find((p) => p.retired && !d.players[p.id]);
  if (old) { d.players[old.id] = { id: old.id, name: old.name, first: 1, last: 2, seasons: 4, goals: 210, assists: 90, mvps: 14, saves: 120, wins: 70, peak: 93, base: [], titles: [{ k: 'major_champion', y: 2027, h: 'X' }, { k: 'regional_champion', y: 2027 }], titles0: 0 }; L.judge(st); }
  until(() => engine.placeBet(st, 'uxl:' + JSON.stringify({ a: 'official' }), 0, 0, 0).targets.some((x) => x.status === 'open' && x.kind === 'major'), 400);
  t.budget = 60e6;
}
if (full) { const d = engine.uxManager.data(st); d.points = Math.max(d.points, 40); d.offerSeason = null; d.lastMove = null; engine.advance(st, rand, 'day'); } // reputation high enough: two job offers are open (Club -> Manager)
st.late.wins = { major: 2, open: 5, seen: [] }; // what the real unlock needs, so the Hosting tab shows it as earned
t.budget = 20e6;
// the game adds a few more keys when it starts a career itself (taken from the shape of a real save)
Object.assign(st, { lastResultSeq: 0, profile: { avatar: null, banner: null, bio: null, reachSeen: false, siteDark: false, siteDarkOverride: null }, creators: [], notes: {}, dms: [] });
fs.writeFileSync(file, JSON.stringify({ name: teamName + (full ? ' (full test)' : ' (test)'), state: st, savedAt: new Date().toISOString() }));
if (full) console.log('legacy: seasons', st.late.clubs[st.userTeamId].legacy.seasons.length, '| hof', st.late.clubs[st.userTeamId].legacy.hof.map((h) => h.name).join(', ') || '-', '| museum', engine.uxLate.build.level(st, 'museum'));
console.log('wrote', file, '| date', st.currentDate, '| budget', t.budget, '| arena', st.late.clubs[st.userTeamId].build.arena);
