'use strict';
// Late game phase 1b: building effects. b1 = revenue and fans (Arena, Fan Zone). Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const B = require('../src/engine/late-build').install(engine);
const E = require('../src/engine/late-effects').install(engine); // idempotent: also installed by btier-state once wired
assert(E && engine.uxLate.effects === E, 'late effects installed');
engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const fresh = (seed, hq = 4) => {
  const rand = mkRand(seed), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const t = engine.teamById(st, st.userTeamId); t.budget = 1e9;
  for (let i = 1; i <= hq; i++) assert(engine.buyFacility(st, i).ok);
  engine.advance(st, rand, 'day');
  return { rand, st, t };
};
const play = (st, rand, until, max = 400) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};
const built = (o, id) => { assert(rpc(o.st, { a: 'build', id }).ok); play(o.st, o.rand, () => B.level(o.st, id) >= 1); assert(B.level(o.st, id) >= 1); };

// ---- nothing built: nothing happens ----
{
  const { st, t } = fresh(1); const b0 = t.budget, f0 = t.followers; E.monthly(st);
  assert.strictEqual(t.budget, b0, 'no income without buildings'); assert.strictEqual(t.followers, f0);
}

// ---- income and followers, half strength on unpaid upkeep ----
{
  const o = fresh(2); built(o, 'arena'); built(o, 'fanzone');
  const { st, t } = o, b0 = t.budget, f0 = t.followers; E.monthly(st);
  assert.strictEqual(t.budget, b0 + 40000 + 25000, 'gate + merch at level 1');
  assert.strictEqual(t.followers, Math.round(f0 * (1 + 0.002 + 0.003)), 'followers grow');
  const lines = st.ledger.filter((l) => l.kind === 'late').map((l) => l.note); assert(lines.includes('Arena gate income') && lines.includes('Fan Zone merchandise'), 'both on the ledger');
  st.late.clubs[st.userTeamId].unpaid = true; const b1 = t.budget; E.monthly(st); assert.strictEqual(t.budget, b1 + 32500, 'Standard: half effect while upkeep is unpaid');
}

// ---- really runs at the month change (upkeep first, then income), and not in Tier B ----
{
  const o = fresh(3); built(o, 'arena'); const { st, rand, t } = o;
  const m0 = st.currentDate.slice(0, 7), n0 = st.ledger.length;
  play(st, rand, () => st.currentDate.slice(0, 7) !== m0, 60);
  const new_ = st.ledger.slice(n0).filter((l) => l.kind === 'late').map((l) => l.note);
  assert(new_.includes('Facility upkeep') && new_.includes('Arena gate income'), 'month change pays upkeep and earns gate: ' + new_);
  t.tier = 'B'; const b0 = t.budget; E.monthly(st); assert.strictEqual(t.budget, b0, 'mothballed: no income');
}
// ---- b2 Streaming Studio: offers pay more, once ----
{
  const o = fresh(4, 3); const { st } = o;
  const offers = st.mediaOffers; assert(offers.length > 0, 'the game made offers');
  const base = offers.map((x) => x.fee); E.daily(st);
  assert(offers.every((x, i) => x.fee === base[i] && x.studio === 0), 'no Studio: fees unchanged, offers marked as seen');
  built(o, 'studio'); st.mediaOffers.push({ id: 9999, fee: 10000, kind: 'shoot' }, { id: 9998, fee: 10000, kind: 'shoot', accepted: true });
  E.daily(st); const f1 = st.mediaOffers.find((x) => x.id === 9999);
  assert.strictEqual(f1.fee, 11000, 'Studio level 1: +10%'); E.daily(st); E.daily(st); assert.strictEqual(f1.fee, 11000, 'never compounds');
  assert.strictEqual(st.mediaOffers.find((x) => x.id === 9998).fee, 10000, 'accepted offers untouched');
  st.mediaOffers.push({ id: 9997, fee: 10000, kind: 'shoot' }); engine.teamById(st, st.userTeamId).tier = 'B'; E.daily(st);
  assert.strictEqual(st.mediaOffers.find((x) => x.id === 9997).fee, 10000, 'mothballed: no bonus');
}

// ---- b3 Academy boost ----
{
  const o = fresh(5, 3); assert.strictEqual(E.academyBoost(o.st), 1, 'no campus: no boost');
  built(o, 'academy'); assert.strictEqual(E.academyBoost(o.st), 1.1, 'level 1: +10%');
}

// ---- b3 Scouting speed: same random draw, shorter job ----
{
  const target = (st) => st.players.find((p) => p.teamId !== st.userTeamId && p.teamId >= 0 && !p.retired).id;
  const a = fresh(6, 2), b = fresh(6, 2);
  const base = engine.startScouting(a.st, target(a.st), mkRand(7)); assert(base.ok, base.error);
  built(b, 'scouting');
  const fast = engine.startScouting(b.st, target(b.st), mkRand(7)); assert(fast.ok, fast.error);
  assert.strictEqual(fast.days, Math.max(1, Math.round(base.days * 0.92)), 'level 1: 8% shorter');
  const job = b.st.scouts.jobs[b.st.scouts.jobs.length - 1];
  assert.strictEqual(Math.round((Date.parse(job.endDate) - Date.parse(job.startDate)) / 86400000), fast.days, 'the saved job has the shorter end date');
}

// ---- b3 Wellbeing: shorter injuries once, other absences untouched, slower decline ----
{
  const o = fresh(7, 4); const { st, t } = o; built(o, 'wellbeing');
  const add = (n) => (d, k) => new Date(Date.parse(d) + k * 86400000).toISOString().slice(0, 10); const addD = add();
  const [p1, p2, p3, p4] = t.playerIds.map((id) => engine.playerById(st, id));
  const today = st.currentDate;
  p1.absence = { reason: 'x', cat: 'injury', since: today, until: addD(today, 20), days: 20 };
  p2.absence = { reason: 'x', cat: 'private', since: today, until: addD(today, 20), days: 20 };
  p3.absence = { reason: 'x', since: today, until: addD(today, 20), days: 20, media: true };
  p4.absence = { reason: 'x', cat: 'injury', since: addD(today, -9), until: addD(today, 11), days: 20 };
  E.absences(st);
  assert.strictEqual(p1.absence.days, 18, 'injury 10% shorter'); assert.strictEqual(p1.absence.until, addD(today, 18));
  assert.strictEqual(p2.absence.days, 20, 'private leave untouched'); assert.strictEqual(p3.absence.days, 20, 'media absence untouched'); assert.strictEqual(p4.absence.days, 20, 'old absence not retro-shortened');
  E.absences(st); assert.strictEqual(p1.absence.days, 18, 'only once');

  const before = new Map([[p1.id, { rating: 80 }]]); p1.rating = 70; p1.ratingExact = 70;
  E.restoreDecline(st, before); assert(Math.abs(p1.ratingExact - 70.8) < 1e-9 && p1.rating === 70, 'level 1 gives back 8% of the 10 points lost');
  p1.ratingExact = 100; p1.rating = 79; E.restoreDecline(st, before); assert(p1.ratingExact <= 80, 'never above the old rating');
  const nobuild = fresh(7, 4); const q = engine.playerById(nobuild.st, nobuild.t.playerIds[0]); q.rating = 70; q.ratingExact = 70;
  E.restoreDecline(nobuild.st, new Map([[q.id, { rating: 80 }]])); assert.strictEqual(q.ratingExact, 70, 'no Wellbeing: nothing returned');
}
// ---- b4 Analytics Lab: match edge on top of chemistry, total capped at +3, removed exactly ----
{
  const o = fresh(8, 4); const { st, t } = o, club = engine.uxClub;
  assert.strictEqual(E.matchEdge(st, 0), 0, 'no lab: no edge');
  built(o, 'analytics'); assert(Math.abs(E.matchEdge(st, 0) - 0.3) < 1e-9, 'level 1: +0.3'); assert(Math.abs(E.matchEdge(st, 2.8) - 0.2) < 1e-9, 'cut by the cap next to strong chemistry');
  assert.strictEqual(E.matchEdge(st, 3.4), 0, 'never lowers or adds past the cap'); assert.strictEqual(E.matchEdge(st, -3), 0.3, 'dip: the full edge, the cap is not in play');
  const core = (() => { const ids = t.playerIds.map((id) => engine.playerById(st, id)).sort((a, b) => b.rating - a.rating || a.id - b.id).slice(0, 3); return ids; })();
  const snap = () => JSON.stringify(st.players.map((p) => [p.id, p.rating, p.ratingExact]));
  const clubU = st.late.clubs[st.userTeamId], level = clubU.build.analytics;
  const delta = () => { const before = core.map((p) => p.rating), revert = club.applyChem(st), d = core.map((p, i) => p.rating - before[i]); revert(); return d[0]; };
  const s0 = snap(); const withLab = delta(); clubU.build.analytics = 0; const without = delta(); clubU.build.analytics = level;
  assert(Math.abs(withLab - without - 0.3) < 0.11, 'applyChem gives the user team the edge: ' + withLab + ' vs ' + without);
  assert.strictEqual(snap(), s0, 'ratings are exactly restored');
  // cohesive team: chemistry at its best, the total stays within the cap
  st.uxClub.chem[t.id].since = new Date(Date.parse(st.currentDate) - 400 * 86400000).toISOString().slice(0, 10);
  clubU.build.analytics = 5; assert(delta() <= 3 + 1e-9, 'chemistry + level 5 lab never exceeds +3: ' + delta());
  // other teams never get the edge
  const other = st.teams.find((x) => !x.nation && x.region && x.id !== t.id), op = engine.playerById(st, other.playerIds[0]);
  const od = () => { const b = op.rating, revert = club.applyChem(st), d = op.rating - b; revert(); return d; };
  const o5 = od(); clubU.build.analytics = 0; assert.strictEqual(od(), o5, 'an AI team gets the same chemistry whatever the lab level');
}
console.log('late-effects ok');

// ---- rival hunger: AI top-up scales with the user's titles and the mode ----
{
  const o = fresh(7), { st } = o, ai = st.teams.filter((t) => t.id !== st.userTeamId && t.tier !== 'B').sort((a, b) => (b.followers || 0) - (a.followers || 0))[0];
  const p = engine.playerById(st, engine.teamById(st, st.userTeamId).playerIds[0]); p.titles = (p.titles || []).filter((x) => x.y !== 2090);
  const n0 = E.hunger(st); // real players may already carry titles
  const b0 = ai.budget; p.titles.push({ k: 'major_champion', y: 2090, h: 'X' });
  const base = E.hunger(st); assert(base > n0 && ai.budget === b0 + base, 'one more title, bigger top-up');
  st.late.mode = 'ruthless'; assert.strictEqual(E.hunger(st), base * 2, 'ruthless doubles');
  st.late.mode = 'relaxed'; assert.strictEqual(E.hunger(st), 0, 'relaxed off');
}
console.log('late-effects hunger ok');

// ---- crises: forced kinds work; Relaxed never rolls ----
{
  const { st, t } = fresh(8), top = () => engine.playerById(st, t.playerIds.slice().map((id) => engine.playerById(st, id)).sort((a, b) => b.rating - a.rating)[0].id);
  const p = top(); p.morale = 80; assert.strictEqual(E.crisis(st, 'raid'), 'raid'); assert.strictEqual(p.morale, 65);
  const f = t.followers, b = t.budget; assert.strictEqual(E.crisis(st, 'scandal'), 'scandal'); assert(t.followers < f && t.budget < b);
  const n = st.inbox.length; assert.strictEqual(E.crisis(st, 'burnout'), 'burnout'); assert(st.inbox.length === n + 1);
  st.late.mode = 'relaxed'; for (let d = 0; d < 60; d++) { st.currentDate = new Date(Date.parse('2030-01-01') + d * 864e5).toISOString().slice(0, 10); assert.strictEqual(E.crisis(st), null); }
}
console.log('late-effects crises ok');
