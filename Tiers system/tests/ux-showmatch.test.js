'use strict';
// Showmatches: Tier A exhibition matches (3v3 / 2v2 / 1v1), a series of independent matches on one day, prize + sponsors + followers, no bracket.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const club = engine.uxClub;
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxc:' + JSON.stringify(o), 0, 0, 0);
const fresh = (seed) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand) }; };
const base = (t) => String(t.region || '').replace(/_b$/, '');
const rivals = (st) => { const me = engine.teamById(st, st.userTeamId); return st.teams.filter((t) => t.id !== me.id && !t.nation && t.region && !/_b$/.test(t.region) && base(t) === base(me)); };

// the calendar: a showmatch takes its own day only; the day before and after stay free (for it and for other events)
{
  const { st } = fresh(31), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  const [d] = club.windows(st, 1, 400, 0, true).filter((x, i, a) => a.includes(addD(x, 1)) && a.includes(addD(x, 2)));
  const pairs = (rs) => [{ a: { t: rs[0].id }, b: { t: rs[1].id } }];
  const rs = rivals(st); assert(rs.length >= 6, 'Tier A region has clubs');
  const r = rpc(st, { a: 'smatch', mode: '3v3', start: d, prize: 10000, pairs: pairs(rs) }); assert(r.ok, r.error);
  assert(!club.windowOk(st, d, 1, 0), 'same day is taken');
  assert(club.windowOk(st, addD(d, 1), 1, 0) && club.windowOk(st, addD(d, -1), 1, 0) || addD(d, -1) < st.currentDate, 'day after / before is free');
  assert(!rpc(st, { a: 'smatch', mode: '2v2', start: d, prize: 10000, pairs: pairs(rs.slice(2)) }).ok, 'one showmatch event per day');
  const sd = rpc(st, { a: 'show', mode: '1v1', start: addD(d, 1), prize: 60000 });
  assert(sd.ok || /not free/.test(sd.error), 'a showdown next to it: ' + sd.error);
  assert(!sd.ok || sd.show.start === addD(d, 1), 'the day after a showmatch is not blocked by it');
}
function addD(d, n) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// a series of 3 matches between 6 clubs, played on one day; prizes go to the winners, host gets sponsors, broadcast and followers
for (const mode of ['3v3', '2v2']) {
  const { rand, st } = fresh(32), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  const rs = rivals(st), pairs = [0, 2, 4].map((i) => ({ a: { t: rs[i].id }, b: { t: rs[i + 1].id } }));
  const pv = rpc(st, { a: 'smplan', mode, prize: 10000, pairs }); assert(pv.preview && pv.preview.cost === 3 * 13000 && pv.preview.offers.length === 3, 'preview');
  const b0 = me.budget, f0 = me.followers, start = club.windows(st, 1, 8, 0)[0];
  const r = rpc(st, { a: 'smatch', mode, start, prize: 10000, pairs, sponsors: [0, 1] }); assert(r.ok, r.error);
  const sm = st.uxClub.smatch[0], team0 = rs.map((t) => t.budget);
  assert.strictEqual(me.budget, b0 - sm.cost + sm.sponsorIncome); assert(sm.sponsorIncome > 0);
  for (let i = 0; i < 200 && !sm.done; i++) engine.advance(st, rand, 'day');
  assert(sm.done && sm.result.matches.length === 3, mode + ' finished');
  assert(sm.result.matches.every((m) => m.winner && m.sa !== m.sb && Math.max(m.sa, m.sb) === 2 && !m.mine));
  assert.strictEqual(rs.reduce((a, t, i) => a + t.budget - team0[i], 0), 3 * 10000, 'each match pays its winner');
  assert(me.followers > f0 && me.budget > b0 - sm.cost + sm.sponsorIncome, 'broadcast + followers');
}

// every match picks its own series length (best of 1, 3, 5 or 7; 3 when not given); anything else is refused
{
  const { rand, st } = fresh(37), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  const rs = rivals(st), start = club.windows(st, 1, 8, 0)[0], bos = [1, 5, 7, undefined];
  const pairs = (b) => bos.map((bo, i) => ({ a: { t: rs[2 * i].id }, b: { t: rs[2 * i + 1].id }, ...(bo ? { bo } : {}) })).slice(0, b);
  assert(!rpc(st, { a: 'smatch', mode: '3v3', start, prize: 10000, pairs: [{ ...pairs(1)[0], bo: 4 }] }).ok, 'best of 4 is refused');
  assert(rs.length >= 8, 'enough clubs'); const r = rpc(st, { a: 'smatch', mode: '3v3', start, prize: 10000, pairs: pairs(4) }); assert(r.ok, r.error);
  const sm = st.uxClub.smatch[0]; assert.deepStrictEqual(sm.pairs.map((p) => p.bo), [1, 5, 7, 3]);
  for (let i = 0; i < 200 && !sm.done; i++) engine.advance(st, rand, 'day');
  assert(sm.done && sm.result.matches.every((m, i) => m.bo === sm.pairs[i].bo && Math.max(m.sa, m.sb) === (m.bo + 1) / 2 && Math.min(m.sa, m.sb) < (m.bo + 1) / 2), 'each match is played to its own length');
}

// 1v1: players of Tier A clubs from the user's region; a bad pick is refused
{
  const { rand, st } = fresh(33), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  const ps = rivals(st).flatMap((t) => t.playerIds.slice(0, 1)), start = club.windows(st, 1, 8, 0)[0];
  const foreign = st.players.find((p) => { const t = engine.teamById(st, p.teamId); return t && t.region && base(t) !== base(me); });
  assert(!rpc(st, { a: 'smatch', mode: '1v1', start, prize: 5000, pairs: [{ a: { p: ps[0] }, b: { p: foreign.id } }] }).ok, 'another region is refused');
  assert(!rpc(st, { a: 'smatch', mode: '1v1', start, prize: 5000, pairs: [{ a: { p: ps[0] }, b: { p: ps[0] } }] }).ok, 'nobody twice');
  assert(!rpc(st, { a: 'smatch', mode: '1v1', start, prize: 25000, pairs: [{ a: { p: ps[0] }, b: { p: ps[1] } }] }).ok, 'prize above the cap');
  assert(!rpc(st, { a: 'smatch', mode: '1v1', start, prize: 4000, pairs: [{ a: { p: ps[0] }, b: { p: ps[1] } }] }).ok, 'prize below the floor');
  const r = rpc(st, { a: 'smatch', mode: '1v1', start, prize: 5000, pairs: [{ a: { p: ps[0] }, b: { p: ps[1] } }, { a: { p: ps[2] }, b: { p: ps[3] } }] }); assert(r.ok, r.error);
  const sm = st.uxClub.smatch[0]; for (let i = 0; i < 200 && !sm.done; i++) engine.advance(st, rand, 'day');
  assert(sm.done && sm.result.matches.length === 2);
  // cancel is only possible while it is more than 2 days away
  const r2 = rpc(st, { a: 'smatch', mode: '1v1', start: club.windows(st, 1, 8, 0)[2], prize: 5000, pairs: [{ a: { p: ps[0] }, b: { p: ps[1] } }] }); assert(r2.ok, r2.error);
  assert(rpc(st, { a: 'smcancel', id: r2.smatch.id }).ok, 'cancelled with a partial refund');
}

// the user's club in a match: a real fixture when the user's player is in the entry, otherwise simulated; only for Tier A
{
  const { rand, st } = fresh(34), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  rpc(st, { a: 'lineup', fmt: '1v1', ids: [st.userPlayerId] });
  const rs = rivals(st), start = club.windows(st, 1, 8, 0)[0];
  const r = rpc(st, { a: 'smatch', mode: '1v1', start, prize: 10000, pairs: [{ a: { me: true }, b: { p: rs[0].playerIds[0] } }, { a: { p: rs[1].playerIds[0] }, b: { p: rs[2].playerIds[0] } }] }); assert(r.ok, r.error);
  const sm = st.uxClub.smatch[0]; let made = 0;
  for (let i = 0; i < 200 && !sm.done; i++) {
    engine.advance(st, rand, 'day');
    for (let k = 0; k < 4; k++) { const fx = st.fixtures.find((f) => f.showId === sm.id && !f.played); if (!fx) break; made++; assert(engine.sideLineup(st, fx).includes(st.userPlayerId)); engine.simulateFixture(st, fx); }
  }
  assert(sm.done && made >= 1 && sm.result.played === 1, 'the user match was a real fixture: ' + made);
}
{
  const { st } = fresh(35); const t = engine.teamById(st, st.userTeamId); t.region = t.region + '_b';
  assert(!rpc(st, { a: 'smatch', mode: '3v3', start: club.windows(st, 1, 8, 0)[0], prize: 5000, pairs: [] }).ok, 'Tier B can not host');
}
// invitations: a Tier B club gets random showmatch invitations in the inbox (accept / decline), a win pays $1K-$5K by followers plus bonuses, followers either way
{
  const rand = mkRand(51), probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(51));
  const name = probe.teams.find((t) => t.region === 'eu_b').name;
  const st = engine.generateLeague({ teamName: name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand), me = engine.teamById(st, st.userTeamId);
  assert(/_b$/.test(me.region), 'Tier B user');
  const day = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } } return r; };
  const open = () => (st.uxClub.smInv || []).find((v) => v.status === 'open');
  for (let i = 0; i < 150 && !open(); i++) day();
  const v1 = open(); assert(v1, 'an invitation arrives within 150 days');
  const mail = st.inbox.find((m) => m.type === 'smatch_invite' && m.data.inviteId === v1.id); assert(mail && !mail.resolved, 'it is in the inbox');
  assert(v1.fee >= 1000 && v1.fee <= 5000 && v1.start > st.currentDate && v1.expires < v1.start, 'fee and dates: ' + v1.fee);
  assert(rpc(st, { a: 'smdecline', id: v1.id }).ok && v1.status === 'declined' && mail.resolved, 'declined');
  assert(!rpc(st, { a: 'smaccept', id: v1.id }).ok, 'a closed invitation can not be accepted');
  for (let i = 0; i < 150 && !open(); i++) day();
  const v2 = open(); assert(v2, 'a second invitation follows');
  const b0 = me.budget, f0 = me.followers, r = rpc(st, { a: 'smaccept', id: v2.id }); assert(r.ok, r.error);
  const sm = st.uxClub.smatch.find((x) => x.invite); assert(sm && sm.cost === 0 && sm.n === 1 && sm.prize === v2.fee && !club.windowOk(st, sm.start, 1, 0), 'accepted: it takes its day');
  assert(!rpc(st, { a: 'smcancel', id: sm.id }).ok, 'an accepted invitation can not be cancelled');
  for (let i = 0; i < 40 && !sm.done; i++) { day(); for (let k = 0; k < 4; k++) { const fx = st.fixtures.find((f) => f.showId === sm.id && !f.played); if (!fx) break; engine.simulateFixture(st, fx, rand); } }
  assert(sm.done && sm.result.matches.length === 1, 'played');
  const m = sm.result.matches[0], won = sm.result.myWins === 1;
  const bonus = m.bonuses.reduce((a, b) => a + b.amount, 0);
  assert.strictEqual(sm.result.myPrize, won ? v2.fee + bonus : v2.part, 'a win pays the fee and bonuses, taking part pays 40% of it');
  assert.strictEqual(v2.part, Math.round(v2.fee * 0.4 / 100) * 100);
  assert(!won ? m.bonuses.length === 0 : bonus <= 2000);
  assert(me.followers > f0, 'followers either way');
  assert.strictEqual(sm.result.sponsorIncome, 0);
}
// bonuses: a near-certain win is a clean sweep (+$1K) and not an upset; a near-hopeless one that still wins is both (+$2K)
for (const [p, sweep, upset] of [[0.97, true, false], [0.03, null, true]]) {
  const simcal = require('../src/engine/ux-simcal'), gw = simcal.gameWin, rand = mkRand(53), probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(53));
  const st = engine.generateLeague({ teamName: probe.teams.find((t) => t.region === 'eu_b').name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const day = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } } };
  try {
    for (let i = 0; i < 150 && !(st.uxClub.smInv || []).some((v) => v.status === 'open'); i++) day();
    const v = st.uxClub.smInv.find((x) => x.status === 'open'); assert(v && rpc(st, { a: 'smaccept', id: v.id }).ok);
    const sm = st.uxClub.smatch.find((x) => x.invite);
    for (let i = 0; i < 40 && !sm.done; i++) { simcal.gameWin = () => p; day(); }
    assert(sm.done, 'played'); const m = sm.result.matches[0], got = m.bonuses.map((b) => b.label);
    if (sweep) assert(sm.result.myWins === 1 && got.includes('Clean sweep') && !got.includes('Upset') && sm.result.myPrize === v.fee + 1000, 'sweep: ' + JSON.stringify(sm.result));
    else if (sm.result.myWins) assert(got.includes('Upset') && sm.result.myPrize === v.fee + 1000 * got.length, 'upset: ' + JSON.stringify(sm.result));
    else assert(!got.length && sm.result.myPrize === v.part && st.ledger.some((l) => /appearance fee/.test(l.text || l.note || l.desc || '')), 'a loss pays the appearance fee: ' + JSON.stringify(sm.result));
  } finally { simcal.gameWin = gw; }
}
// an invitation lapses when it is not answered
{
  const rand = mkRand(52), probe = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, mkRand(52));
  const st = engine.generateLeague({ teamName: probe.teams.find((t) => t.region === 'eu_b').name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const day = () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const fx = engine.fixtureById(st, r.fixtureId); if (fx && !fx.played) { engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id); } } };
  for (let i = 0; i < 150 && !(st.uxClub.smInv || []).length; i++) day();
  const v = st.uxClub.smInv[0]; assert(v);
  for (let i = 0; i < 40 && v.status === 'open'; i++) day();
  assert.strictEqual(v.status, 'expired'); assert(st.inbox.find((m) => m.data && m.data.inviteId === v.id).resolved);
  assert(!rpc(st, { a: 'smaccept', id: v.id }).ok);
}
// a benched user still gets the match to play or watch (a fixture on the day), never a silent sim: the same flow as any league match
{
  const { rand, st } = fresh(38), me = engine.teamById(st, st.userTeamId); me.budget = 5e6;
  assert(!engine.userLineup(st).slice(0, 3).includes(st.userPlayerId), 'the user is benched in this save');
  const rs = rivals(st), start = club.windows(st, 1, 8, 0)[0];
  assert(rpc(st, { a: 'smatch', mode: '3v3', start, prize: 10000, pairs: [{ a: { me: true }, b: { t: rs[0].id } }] }).ok);
  const sm = st.uxClub.smatch[0]; let fx = null;
  for (let i = 0; i < 30 && !fx; i++) { engine.advance(st, rand, 'day'); fx = st.fixtures.find((f) => f.showId === sm.id && !f.played); }
  assert(fx && fx.date === start && !sm.done, 'a fixture waits for the user on the day of the showmatch');
  engine.simulateFixture(st, fx, rand); engine.nextUserSeries(st, rand, fx.id);
  for (let i = 0; i < 3 && !sm.done; i++) engine.advance(st, rand, 'day');
  assert(sm.done && sm.result.played === 1 && sm.result.matches[0].mine, 'the series result is the showmatch result');
}
// an old save without the list loads and ticks
{ const { st } = fresh(36); delete st.uxClub.smatch; engine.advance(st, mkRand(1), 'day'); assert(Array.isArray(st.uxClub.smatch || []), 'old save ok'); }

console.log('showmatch ok');
