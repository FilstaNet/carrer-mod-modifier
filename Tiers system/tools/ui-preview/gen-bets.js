// writes %TEMP%/h/statebets.json: a career with settled + running bets (single, combo, parlay, native), the history payload and a sample quote.
// then: node serve.js, open http://localhost:8765/?bets
const R = 'D:/Documents D/Career-Mode-Modifier/';
const ev = require(R + 'app_extracted/engine/events.js');
const engine = require(R + 'Tiers system/src/engine/btier-state').wrapEngine(require(R + 'app_extracted/engine/league.js'), { events: ev });
const real = require(R + 'app_extracted/data/rlcs-2027.json');
let s = 5; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const step = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } };
const cardsNow = () => engine.betBook(st).cards.filter((c) => c.kind === 'match' && c.markets);
const wsel = (c) => c.markets.find((m) => m.id === 'winner').options.filter((o) => o.odds >= 1.2).sort((a, b) => a.odds - b.odds)[0].code;
for (let round = 0; round < 3; round++) {
  for (let i = 0; i < 400 && cardsNow().length < 4; i++) step();
  const cs = cardsNow(), min = engine.betBook(st).min, code = (c, id) => c.markets.find((m) => m.id === id).options[0].code;
  engine.placeBet(st, 'mk:' + code(cs[0], 'tot'), cs[0].ref, 0, min);
  engine.placeBet(st, 'mk:' + ['ot', 'tot'].map((id) => code(cs[1], id)).join(','), cs[1].ref, 0, min * 2);
  engine.placeBet(st, 'match', cs[2].ref, cs[2].homeId, min);
  engine.placeBet(st, 'mp:' + [cs[3].ref + '.' + wsel(cs[3]), (cs[4] || cs[3]).ref + '.' + wsel(cs[4] || cs[3])].join(','), 0, 0, min);
  if (round < 2) for (let i = 0; i < 300 && st.uxBets.some((b) => !b.settled); i++) step();
}
const cs = cardsNow(); const taken = new Set(engine.betBook(st).open.flatMap((b) => [b.ref].concat((b.legs || []).map((l) => l.ref)))); const c = cs.find((x) => !taken.has(x.ref)) || cs[0];
const q = c ? engine.placeBet(st, 'mkq:' + [c.markets.find((m) => m.id === 'tot').options[0].code, c.markets.find((m) => m.id === 'ot').options[0].code].join(','), c.ref, 0, 0).quote : null;
const snap = { bets: engine.betBook(st), career: st, appearance: {}, version: 'x', frameless: false, difficulties: engine.DIFFICULTIES, seriesLengths: engine.SERIES_LENGTHS, table: engine.computeTable(st), board: engine.boardSummary(st), starters: engine.userLineup(st), logoLums: {}, eventSchedules: {}, groupTables: engine.groupTables(st), flags: {}, regionName: 'Europe', eventField: 16, majorSlots: {}, wages: {}, nations: {}, homes: {}, ratingExact: {}, __hist: engine.placeBet(st, 'mkh', 0, 0, 0).history, __quote: q };
require('fs').writeFileSync(process.env.TEMP + '/h/statebets.json', JSON.stringify(snap));
console.log('bets', (st.uxBets || []).length + st.bets.length, 'cards', snap.bets.cards.length, 'hist', snap.__hist.entries.length, 'quote', JSON.stringify(q));
