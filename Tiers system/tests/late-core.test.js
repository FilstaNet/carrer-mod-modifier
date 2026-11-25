'use strict';
// Late game phase 0: state, Tier A gate, difficulty mode, ledger helpers, uxl: channel, daily / monthly ticks. Runs the game's real engine (extracted copy).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const late = engine.uxLate;
assert(late, 'late core installed');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rpc = (st, o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0);
const fresh = (seed, extra = {}) => { const rand = mkRand(seed); return { rand, st: engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real', ...extra }, rand) }; };
const play = (st, rand, until, max = 400) => {
  for (let i = 0; i < max && !until(); i++) {
    const r = engine.advance(st, rand, 'day');
    if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  }
};

// ---- gate ----
{
  const { rand, st } = fresh(1);
  const t = engine.teamById(st, st.userTeamId);
  assert.strictEqual(t.tier, 'A'); assert(late.eligible(st) && !late.active(st), 'Tier A manager is eligible, active after the unlock day');
  assert.strictEqual(st.late, undefined, 'nothing is created until the gate is passed and a day runs (old saves unchanged)');
  assert(rpc(st, { a: 'status' }).readOnly);
  t.tier = 'B'; assert(!late.active(st), 'Tier B manager is locked');
  assert.strictEqual(rpc(st, { a: 'mode', mode: 'relaxed' }).ok, false, 'actions refused while locked');
  engine.advance(st, rand, 'day'); assert.strictEqual(st.late, undefined, 'a Tier B club never gets state.late');
  t.tier = 'A'; st.sacked = true; assert(!late.active(st), 'sacked manager is locked'); st.sacked = false;
  const pl = fresh(2, { playerName: 'Tester', mode: 'player' }).st; assert(!late.active(pl), 'player career is locked');
}

// ---- unlock needs 2 majors and 5 opens won (counted once each); tests skip it with REQ = 0 ----
{
  const { REQ } = late; REQ.major = 2; REQ.open = 5;
  const rand = mkRand(9), st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
  const ev = (k) => st.events.filter((e) => e.kind === k), win = (e, id) => { e.stage = 'done'; e.championId = id; };
  win(ev('major')[0], st.userTeamId); win(ev('open')[0], st.userTeamId); win(ev('open')[1], -1);
  engine.advance(st, rand, 'day'); engine.advance(st, rand, 'day');
  assert(!st.late.unlocked && st.late.wins.major === 1 && st.late.wins.open === 1, 'counted once, not twice, other champions ignored');
  assert.strictEqual(rpc(st, { a: 'mode', mode: 'relaxed' }).ok, false, 'locked actions refused');
  win(ev('major')[1], st.userTeamId); for (let i = 1; i <= 4; i++) win(ev('open')[i + 1], st.userTeamId);
  engine.advance(st, rand, 'day'); assert(st.late.unlocked, '2 majors and 5 opens unlock it');
  REQ.major = 0; REQ.open = 0; // the other tests skip the grind
}

// ---- unlock, mode, ledger ----
{
  const { rand, st } = fresh(3);
  engine.advance(st, rand, 'day');
  assert(st.late && st.late.v === 1 && st.late.unlocked && st.late.mode === 'standard' && !st.late.modeChosen, 'unlocked with the default mode');
  assert.strictEqual(st.inbox.filter((m) => m.title === 'Facilities unlocked').length, 1);
  engine.advance(st, rand, 'day'); assert.strictEqual(st.inbox.filter((m) => m.title === 'Facilities unlocked').length, 1, 'the unlock mail is sent once');

  assert.strictEqual(late.scale(st, 'price'), 1);
  assert(rpc(st, { a: 'mode', mode: 'ruthless' }).ok); assert.strictEqual(late.scale(st, 'price'), 1.3); assert(st.late.modeChosen);
  assert.strictEqual(rpc(st, { a: 'mode', mode: 'nope' }).ok, false, 'unknown mode refused'); assert.strictEqual(st.late.mode, 'ruthless');
  assert.strictEqual(rpc(st, { a: 'mode', mode: 'relaxed' }).ok, false, 'the mode is locked once chosen'); assert.strictEqual(st.late.mode, 'ruthless'); assert.strictEqual(late.scale(st, 'price'), 1.3);
  assert.strictEqual(rpc(st, { a: 'zzz' }).ok, false, 'unknown action refused');
  assert.strictEqual(engine.placeBet(st, 'uxl:{bad json', 0, 0, 0).ok, false, 'bad json refused');

  const t = engine.teamById(st, st.userTeamId), b0 = t.budget, n0 = (st.ledger || []).length;
  assert(late.spend(st, 1000, 'Test build').ok); assert.strictEqual(t.budget, b0 - 1000);
  const l = st.ledger[st.ledger.length - 1]; assert.strictEqual(st.ledger.length, n0 + 1); assert(l.kind === 'late' && l.amount === -1000, 'ledger line posted');
  assert(late.earn(st, 400, 'Test income').ok); assert.strictEqual(t.budget, b0 - 600);
  const before = t.budget; assert.strictEqual(late.spend(st, before + 1, 'too much').ok, false); assert.strictEqual(t.budget, before, 'overspend refused, budget unchanged');
  assert.strictEqual(late.spend(st, -5, 'x').ok, false); assert.strictEqual(late.spend(st, NaN, 'x').ok, false);

  const copy = JSON.parse(JSON.stringify(st)); assert.deepStrictEqual(copy.late, st.late, 'state.late survives save and load');
  late.club(st).build = { x: 1 }; assert(st.late.clubs[st.userTeamId].build.x === 1, 'club data is keyed by team id');
}

// ---- daily / monthly handlers, registered actions, mothball ----
{
  const { rand, st } = fresh(4);
  let d = 0, m = 0; late.onDaily(() => { d++; }); late.onMonthly(() => { m++; });
  late.action('ping', (s, a) => ({ ok: true, got: a.v }));
  engine.advance(st, rand, 'day'); assert.strictEqual(m, 0, 'no monthly run on the unlock day');
  const month0 = st.currentDate.slice(0, 7);
  play(st, rand, () => st.currentDate.slice(0, 7) !== month0);
  assert(st.currentDate.slice(0, 7) !== month0, 'month changed');
  assert.strictEqual(m, 1, 'monthly handler ran once at the month change'); assert(d >= 2, 'daily handler ran each advance');
  assert.strictEqual(rpc(st, { a: 'ping', v: 7 }).got, 7, 'registered action reached');

  // relegation: mothballed (handlers stop, data stays), promoted again: resumes
  const t = engine.teamById(st, st.userTeamId), snap = JSON.stringify(st.late), d1 = d;
  t.tier = 'B'; engine.advance(st, rand, 'day'); assert.strictEqual(d, d1, 'nothing runs while in Tier B'); assert.strictEqual(JSON.stringify(st.late), snap, 'data kept untouched');
  t.tier = 'A'; engine.advance(st, rand, 'day'); assert(d > d1, 'resumes when back in Tier A');
}

console.log('late-core ok');
