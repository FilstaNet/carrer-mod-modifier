'use strict';
// Loads a real save (read only, never written back) into the engine with the whole mod installed, plays N days and reports every error the late-game modules log.
// Checks that old saves (made before the late game existed) keep working. Usage: node tools/old-save-check.js <saveFile> [days=120]
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
const errors = [];
const log = (m) => { if (/fail|error/i.test(m)) errors.push(m); };
const ev = require(path.join(R, 'app_extracted', 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(R, 'app_extracted', 'engine', 'league.js')), { events: ev, log });
const file = process.argv[2], days = Number(process.argv[3]) || 120;
if (!file) throw new Error('Usage: node tools/old-save-check.js <saveFile> [days]');
const st = JSON.parse(fs.readFileSync(file, 'utf8')).state;
let s = 3; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const t = engine.teamById(st, st.userTeamId);
console.log('save:', path.basename(file), '| club', t.name, '| region', t.region, '| tier', t.tier, '| mode', st.mode || 'manager', '| date', st.currentDate, '| late', !!st.late);
for (let i = 0; i < days; i++) {
  const r = engine.advance(st, rand, 'day');
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  if (r.stopped === 'season-end') { engine.startNextSeason(st, rand); console.log('  season rolled over'); }
}
const r = engine.placeBet(st, 'uxl:' + JSON.stringify({ a: 'status' }), 0, 0, 0);
console.log('after', days, 'days:', st.currentDate, '| late status', JSON.stringify({ active: r.active, unlocked: !!(st.late && st.late.unlocked), wins: st.late && st.late.wins }), '| errors:', errors.length);
for (const e of errors.slice(0, 6)) console.log(' ', e.split('\n').slice(0, 3).join(' | ').slice(0, 300));
process.exit(errors.length ? 1 : 0);
