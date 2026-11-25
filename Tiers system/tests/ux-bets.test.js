'use strict';
// Betting: Basic/Advanced markets, joint-priced combos, parlays, Tier B cup markets, history ledger, integrity audits.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const B = require('../src/engine/ux-bets');
const ledger = require('../src/engine/ux-bets-ledger');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const sumF = (a) => a.reduce((x, y) => x + y, 0);
const play = (st, rand, until, max = 400) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};

const rand = mkRand(5);
const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const team = engine.teamById(st, st.userTeamId);
let cards = [];
play(st, rand, () => { cards = engine.betBook(st).cards.filter((c) => c.kind === 'match' && c.markets && !c.tierB); return cards.length >= 5; });
assert(cards.length >= 5, 'five match cards with markets exist');
const card = cards[0], mk = card.markets;
const basic = mk.filter((m) => m.group === 'basic'), adv = mk.filter((m) => m.group === 'advanced');
assert(basic.length >= 4 && adv.length >= 9, 'basic and advanced markets are offered');
for (const m of mk) { assert(m.options.length >= 2); for (const o of m.options) assert(o.odds >= 1.04 && o.odds <= 150 && Number.isFinite(o.odds), m.title + ' odds'); }
for (const id of ['tot', 'both', 'ot', 'first', 'shut']) { const m = mk.find((x) => x.id === id); const over = sumF(m.options.map((o) => 1 / o.odds)); assert(over > 0.95 && over < 1.3, id + ' book margin ' + over); }
const code = (c, id, i = 0) => c.markets.find((m) => m.id === id).options[i].code;
const min = engine.betBook(st).min;

// ---- balance: correlated picks are priced as one question ----
{
  const f = engine.fixtureById(st, card.ref), N = f.bestOf || 3;
  const games = mk.find((m) => m.id === 'games'), full = games.options.find((o) => o.key === 'g:' + N), none = mk.find((m) => m.id === 'sweep').options.find((o) => o.key === 'none');
  assert(full && none && full.odds >= 1.2 && none.odds >= 1.2, 'a full-length series and "no sweep" are offered');
  const r = engine.placeBet(st, 'mkq:' + [full.code, none.code].join(','), card.ref, 0, 0);
  assert(r.quote && r.quote.ok, 'quote works: ' + JSON.stringify(r.quote));
  // a series that goes the distance always has "no sweep": the second pick is implied, so the combo costs (almost) nothing extra
  assert(r.quote.odds >= full.odds / 1.06 && r.quote.odds <= full.odds * 1.12, 'implied pick adds almost nothing: ' + r.quote.odds + ' vs ' + full.odds);
  assert(r.quote.odds < full.odds * none.odds * 0.5, 'naive product would have paid far more: ' + full.odds * none.odds);
  assert(!r.ok && !st.uxBets, 'a quote places nothing');
}
// ---- combo rules ----
{
  const c = cards[1];
  assert(!engine.placeBet(st, 'mk:' + [code(c, 'winner'), code(c, 'score')].join(','), c.ref, 0, min).ok, 'contradicting markets can not be combined');
  assert(!engine.placeBet(st, 'mk:' + [code(c, 'tot'), code(c, 'tot', 1)].join(','), c.ref, 0, min).ok, 'one pick per market');
  const short = c.markets.flatMap((m) => m.options.map((o) => ({ m, o }))).find((x) => x.o.odds < 1.2);
  // short odds (under 1.20) can be combined now; only contradicting picks are refused (checked above)
  const tooMany = c.markets.slice(0, 5).map((m) => m.options[m.options.length - 1].code);
  assert(!engine.placeBet(st, 'mk:' + tooMany.join(','), c.ref, 0, min).ok, 'five picks refused');
  const cap = Math.floor(team.budget * 0.25);
  assert(!engine.placeBet(st, 'mk:' + code(c, 'tot'), c.ref, 0, cap + 10).ok, 'stake above the budget share refused');
  assert(!engine.placeBet(st, 'mk:' + code(c, 'tot'), c.ref, 0, 1).ok, 'below minimum refused');
}
// ---- place: a single market bet, a combo, a native winner, a parlay ----
const before = team.budget;
const single = engine.placeBet(st, 'mk:' + code(cards[0], 'tot'), cards[0].ref, 0, min); assert(single.ok, single.error);
assert(!engine.placeBet(st, 'mk:' + code(cards[0], 'ot'), cards[0].ref, 0, min).ok, 'one open bet per match');
assert(!engine.placeBet(st, 'match', cards[0].ref, cards[0].homeId, min).ok, 'not even the winner bet on the same match');
const mixIds = ['ot', 'shut', 'tot'].map((id) => code(cards[1], id));
const comboR = engine.placeBet(st, 'mk:' + mixIds.join(','), cards[1].ref, 0, min); assert(comboR.ok, comboR.error);
assert(comboR.bet.legs.length === 3 && comboR.bet.odds >= Math.max(...comboR.bet.legs.map((l) => l.odds)) / 1.1, 'combo pays about its best leg or more');
assert(comboR.bet.odds <= 100, 'combo odds are capped');
const nat = engine.placeBet(st, 'match', cards[2].ref, cards[2].homeId, min); assert(nat.ok, nat.error);
assert(nat.bet.season === st.season && nat.bet.comp && nat.bet.teamIds.length === 2, 'native bets are tagged for the history');
const w = (c, i) => code(c, 'winner', i);
const ws = (c) => c.markets.find((m) => m.id === 'winner').options.filter((o) => o.odds >= 1.2).sort((a, b) => a.odds - b.odds)[0].code; // a leg long enough to combine
assert(!engine.placeBet(st, 'mp:' + cards[3].ref + '.' + w(cards[3], 0), 0, 0, min).ok, 'a parlay needs two legs');
assert(!engine.placeBet(st, 'mp:' + [cards[3].ref + '.' + w(cards[3], 0), cards[3].ref + '.' + w(cards[3], 1)].join(','), 0, 0, min).ok, 'one pick per match in a parlay');
assert(!engine.placeBet(st, 'mp:' + [cards[0].ref + '.' + w(cards[0], 0), cards[3].ref + '.' + w(cards[3], 0)].join(','), 0, 0, min).ok, 'a match with an open bet can not be in a parlay');
const pq = engine.placeBet(st, 'mpq:' + [cards[3].ref + '.' + ws(cards[3]), cards[4].ref + '.' + ws(cards[4])].join(','), 0, 0, 0);
assert(pq.quote && pq.quote.ok, 'parlay quote');
const par = engine.placeBet(st, 'mp:' + [cards[3].ref + '.' + ws(cards[3]), cards[4].ref + '.' + ws(cards[4])].join(','), 0, 0, min); assert(par.ok, par.error);
assert(par.bet.parlay && par.bet.legs.length === 2 && Math.abs(par.bet.odds - pq.quote.odds) < 0.011, 'parlay priced as quoted');
assert(par.bet.odds < par.bet.legs[0].odds * par.bet.legs[1].odds, 'parlay edge per extra leg');
assert.strictEqual(team.budget, before - 4 * min, 'stakes taken');

// ---- play it out ----
play(st, rand, () => [0, 1, 2, 3, 4].every((i) => engine.fixtureById(st, cards[i].ref).played), 600);
const book = engine.betBook(st);
const mine = st.uxBets;
assert(mine.length === 3 && mine.every((b) => b.settled), 'market bets settled');
const bk = B.create(engine);
const f0 = engine.fixtureById(st, cards[0].ref);
assert.strictEqual(mine[0].won, bk.resolve(f0, 'tot', mine[0].pick, mine[0]), 'single resolved from the real result');
const live = mine[1];
const exp = live.legs.map((l) => bk.resolve(engine.fixtureById(st, cards[1].ref), l.market, l.pick, live));
if (exp.some((x) => x === false)) assert(live.won === false && live.returned === 0); else assert(live.won === true || live.won === null);
const pl = mine[2];
assert(pl.parlay && pl.legs.every((l) => l.settled === true || pl.won === false), 'parlay legs recorded');
for (const l of pl.legs.filter((x) => x.settled)) assert.strictEqual(l.won, bk.resolve(engine.fixtureById(st, l.ref), l.market, l.pick, pl), 'parlay leg resolved');
if (pl.legs.every((l) => l.won === true)) assert(pl.won === true && pl.returned === Math.round(pl.stake * pl.odds)); else if (pl.legs.some((l) => l.won === false)) assert(pl.won === false);
assert(book.profit === book.returned - book.staked);
JSON.parse(JSON.stringify(st));

// ---- history ledger ----
{
  const h = engine.placeBet(st, 'mkh', 0, 0, 0).history;
  assert(h && h.entries.length === 4, 'history lists every bet (native + market): ' + (h && h.entries.length));
  const s = h.stats, done = h.entries.filter((e) => e.status === 'won' || e.status === 'lost');
  assert.strictEqual(s.settled, done.length);
  assert(h.entries.filter((e) => e.status === 'lost' && e.kind !== 'parlay' && e.kind !== 'combo').every((e) => e.actual), 'every lost single carries what really happened');
  for (const e of h.entries.filter((x) => x.status === 'lost' && x.legs.length)) assert(e.legs.filter((l) => l.won === false).every((l) => l.actual), 'a failed leg carries what really happened');
  assert.strictEqual(s.profit, sumF(done.map((e) => e.returned - e.stake)));
  assert(s.roi === null || Math.abs(s.roi - s.profit / s.staked) < 1e-9);
  assert(s.seasons.length === 1 && s.seasons[0].season === st.season, 'season table');
  assert(h.entries.every((e) => e.comp), 'every bet knows its competition');
  assert(h.comps.length >= 1 && h.teams.length >= 2);
}

// ---- integrity audits ----
{
  const u = st.uxBets;
  const bets = []; // 24 wagers in the last month, upsets in the own division
  for (let i = 0; i < 24; i++) bets.push({ id: 900000 + i, kind: 'mk', ref: -i, market: 'tot', pick: 'o:1', odds: 3.4, stake: 4000, placed: st.currentDate, label: 'x', settled: true, won: true, returned: 13600, settledDate: st.currentDate, season: st.season, comp: 'X', teamIds: [team.id], inDiv: true });
  st.uxBets = u.concat(bets);
  const rk = ledger.risk(st, engine); assert(rk.score >= ledger.AUDIT_AT, 'heavy volume + upsets in the own division is a high risk: ' + rk.score);
  const b0 = team.budget, inbox0 = st.inbox.length, posts0 = st.social.posts.length;
  const t1 = ledger.tick(st, engine);
  assert(t1.audit && t1.audit.outcome.includes('fine') && team.budget < b0, 'first audit fines');
  assert(st.inbox.length > inbox0 && st.social.posts.length > posts0 && t1.leak, 'audit leaks to the feed and the inbox');
  assert(!ledger.tick(st, engine).audit, 'no second audit the same day');
  st.currentDate = new Date(Date.parse(st.currentDate + 'T12:00:00Z') + 30 * 86400000).toISOString().slice(0, 10);
  st.uxBets.forEach((b) => { b.placed = st.currentDate; b.settledDate = st.currentDate; });
  const t2 = ledger.tick(st, engine);
  assert(t2.audit && t2.audit.outcome.includes('freeze') && st.uxBetting.freezeUntil, 'second audit freezes betting');
  const c = cards[0];
  assert(!engine.placeBet(st, 'mk:' + code(c, 'tot'), c.ref, 0, min).ok && /frozen/.test(engine.placeBet(st, 'match', c.ref, c.homeId, min).error || ''), 'frozen: no bets of any kind');
  st.currentDate = new Date(Date.parse(st.currentDate + 'T12:00:00Z') + 30 * 86400000).toISOString().slice(0, 10);
  st.uxBets.forEach((b) => { b.placed = st.currentDate; b.settledDate = st.currentDate; });
  const pr = st.boardPressure || 0;
  const t3 = ledger.tick(st, engine);
  assert(t3.audit && t3.audit.outcome.includes('strike') && (st.boardPressure || 0) > pr, 'third audit: board strike');
  const view = engine.betBook(st).audit; assert(view && view.audits === 3 && view.level === 'high');
}

// ---- Tier B cup markets ----
{
  const probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, () => 0.5);
  const bName = probe.teams.find((t) => t.region === 'eu_b').name;
  const r2 = mkRand(9), sb = engine.generateLeague({ teamName: bName, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, r2);
  let bc = []; // the Kick-Off Weekend matches are on the board too (ux-majors), so only the B-Tier ones are picked below
  play(sb, r2, () => { bc = engine.betBook(sb).cards.filter((c) => c.tierB && c.markets && /B-Tier Cup|Promotion/.test(c.eventName)); return bc.length > 0; }, 900);
  assert(bc.length, 'Tier B cup matches are on the board');
  const c = bc[0]; assert(/B-Tier Cup|Promotion/.test(c.eventName) && !c.markets.find((m) => m.id === 'winner').native);
  const minB = engine.betBook(sb).min, win = engine.placeBet(sb, 'mk:' + code(c, 'winner'), c.ref, 0, minB); assert(win.ok, win.error);
  assert(win.bet.tierB && /B-Tier Cup|Promotion/.test(win.bet.comp), 'tagged as Tier B');
  play(sb, r2, () => engine.fixtureById(sb, c.ref).played, 900);
  engine.betBook(sb);
  const bet = sb.uxBets[0], f = engine.fixtureById(sb, c.ref);
  assert(bet.settled && bet.won === ((f.homeWins > f.awayWins) === (win.bet.pick === 'h')), 'Tier B winner bet settled from the result');
  const h = engine.placeBet(sb, 'mkh', 0, 0, 0).history; assert(h.entries[0].tierB && h.comps.some((x) => /B-Tier Cup|Promotion/.test(x)), 'archive tracks Tier B competitions');
}

// ---- rules ----
const R = require('../src/engine/ux-bets-rules');
const L = (market, pick, side) => ({ market, pick, side: side || null });
assert(!R.clash(L('exact', 'n:12'), L('hteam', 'o:0.5')), 'exact total + a team scoring is fine');
assert(R.clash(L('exact', 'n:3'), L('hteam', 'o:3.5')), 'exact 3 total but a team over 3.5 is impossible');
assert(R.clash(L('hteam', 'u:0.5'), L('pfirst', 'p:1', 'h')), 'side on zero goals + its player to score first');
assert(!R.clash(L('hteam', 'u:0.5'), L('pfirst', 'p:9', 'a')), 'the other side scoring first is consistent');
console.log('betting ok');
