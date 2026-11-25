'use strict';
// Phase 4: B-Tier Cup generator. Pure data + a small driver, no game state needed.
// Format per cup: 16 teams -> 4 GSL groups of 4 (the game's buildGsl) -> top 2 of each group (8) -> single-elimination Top 8.
// Cups of 32 teams (8 groups, Top 16) are still supported so careers saved before the 16-team change keep playing.
// Slots use the game's own slot format ({id, stage, bestOf, a, b, ...}) so events.js helpers (openSlots, recordResult,
// groupQualifiers, bracketComplete, resolveRef) work on them unchanged. `ev` is the game's engine/events.js module.
const LETTERS = 'ABCDEFGH';
const FIELD = 16; // default cup size (Tier B has 16 active teams per region)
const SIZES = [16, 32];
const SIZES_ALL = [8, 16, 32]; // 8 = Kick-Off Weekend (2 groups of 4 -> top 4), used only by ux-majors

// Tier B points by final placement 1..32 (a 16-team cup uses places 1..16). Separate from Tier A tables (events.js is not touched).
const BTIER_POINTS = [
  { upTo: 1, points: 15 }, { upTo: 2, points: 10 }, { upTo: 4, points: 7 }, { upTo: 8, points: 5 },
  { upTo: 16, points: 3 }, { upTo: 24, points: 2 }, { upTo: 32, points: 1 }
];
const pointsFor = (place) => (BTIER_POINTS.find((b) => place <= b.upTo) || { points: 0 }).points;

// field sorted best -> worst; 4 pots of 8, snake order so group strength stays balanced.
function drawGroups(field) {
  const size = field.length;
  if (!SIZES_ALL.includes(size) || new Set(field).size !== size) throw new Error(`B-Tier Cup needs ${SIZES.join(' or ')} unique teams (got ${size})`);
  const G = size / 4;
  const groups = Array.from({ length: G }, () => []);
  for (let pot = 0; pot < 4; pot++) for (let i = 0; i < G; i++) groups[pot % 2 === 0 ? i : G - 1 - i].push(field[pot * G + i]);
  return groups;
}

// Top 16 single elimination. Playoff seed index: 0-7 = group winners A..H, 8-15 = runners-up A..H.
// A group winner never meets a team from its own group before the final stages.
function buildSingleElim16(ev, prefix, bestOf, finalBestOf, size = 32) {
  const id = (s) => `${prefix}-${s}`;
  const slot = (s, stage, a, b, extra = {}) => ({ id: id(s), stage, bestOf, a, b, eliminates: true, ...extra });
  const r16 = [[0, 9], [2, 11], [4, 13], [6, 15], [1, 8], [3, 10], [5, 12], [7, 14]];
  const out = [];
  if (size === 8) {
    // Top 4: seeds 0-1 = group winners A,B, 2-3 = runners-up A,B; A1 v B2 and B1 v A2
    out.push(slot('sf-1', 'semi', ev.seed(0), ev.seed(3)), slot('sf-2', 'semi', ev.seed(1), ev.seed(2)));
    out.push(slot('final', 'final', ev.winnerOf(id('sf-1')), ev.winnerOf(id('sf-2')), { bestOf: finalBestOf || bestOf, decides: true }));
    return out;
  }
  if (size === 32) {
    out.push(...r16.map(([x, y], i) => slot(`r16-${i + 1}`, 'r16', ev.seed(x), ev.seed(y))));
    for (let i = 0; i < 4; i++) out.push(slot(`qf-${i + 1}`, 'quarter', ev.winnerOf(id(`r16-${2 * i + 1}`)), ev.winnerOf(id(`r16-${2 * i + 2}`))));
  } else {
    // Top 8: seeds 0-3 = group winners A-D, 4-7 = runners-up A-D; A1/B2 + C1/D2 meet in semi 1, B1/A2 + D1/C2 in semi 2.
    [[0, 5], [2, 7], [1, 4], [3, 6]].forEach(([x, y], i) => out.push(slot(`qf-${i + 1}`, 'quarter', ev.seed(x), ev.seed(y))));
  }
  out.push(slot('sf-1', 'semi', ev.winnerOf(id('qf-1')), ev.winnerOf(id('qf-2'))));
  out.push(slot('sf-2', 'semi', ev.winnerOf(id('qf-3')), ev.winnerOf(id('qf-4'))));
  out.push(slot('final', 'final', ev.winnerOf(id('sf-1')), ev.winnerOf(id('sf-2')), { bestOf: finalBestOf || bestOf, decides: true }));
  return out;
}

// One cup. `plan` = {id, region, name, split, index, startDate, endDate, groupBestOf, playoffBestOf, finalBestOf}; field = 16 (or 32) team ids best->worst.
function buildCup(ev, plan, field) {
  const groups = drawGroups(field).map((seeds, g) => ({ prefix: `C${plan.id}${LETTERS[g]}`, letter: LETTERS[g], seeds }));
  const slots = [];
  for (const g of groups) slots.push(...ev.buildGsl(g.prefix, plan.groupBestOf));
  slots.push(...buildSingleElim16(ev, `C${plan.id}P`, plan.playoffBestOf, plan.finalBestOf, field.length));
  return { kind: 'bcup', stage: 'groups', ...plan, field: field.slice(), groups, slots, playoffSeeds: [], standings: [], championId: null };
}

// The game's open events of a season (kind 'open') -> one cup per open, per region, same dates and series lengths.
function planSeasonCups(opens, regionIds, firstId = 5000) {
  const plans = [];
  let id = firstId;
  for (const region of regionIds) {
    for (const o of opens) {
      plans.push({
        id: id++, region, name: `B-Tier Cup ${o.index}`, split: o.split, index: o.index, startDate: o.startDate, endDate: o.endDate,
        groupBestOf: o.groupBestOf, playoffBestOf: o.playoffBestOf, finalBestOf: o.finalBestOf
      });
    }
  }
  return plans;
}

const slotsOf = (cup, prefix) => cup.slots.filter((s) => s.id.startsWith(prefix + '-'));
const loserOf = (s) => (s.winner === s.teamA ? s.teamB : s.teamA);

function finish(ev, cup) {
  const P = `C${cup.id}P`;
  const pl = slotsOf(cup, P);
  const by = (id) => ev.slotById(pl, `${P}-${id}`);
  const rank = (id) => cup.playoffSeeds.indexOf(id);
  const losers = (ids) => ids.map((i) => loserOf(by(i))).sort((a, b) => rank(a) - rank(b));
  const order = [by('final').winner, loserOf(by('final')), ...losers(['sf-1', 'sf-2']), ...(cup.field.length >= 16 ? losers(['qf-1', 'qf-2', 'qf-3', 'qf-4']) : []),
    ...(cup.field.length === 32 ? losers(['r16-1', 'r16-2', 'r16-3', 'r16-4', 'r16-5', 'r16-6', 'r16-7', 'r16-8']) : [])];
  const fieldRank = (id) => cup.field.indexOf(id);
  const third = [];
  const fourth = [];
  for (const g of cup.groups) {
    const gs = slotsOf(cup, g.prefix);
    third.push(loserOf(ev.slotById(gs, `${g.prefix}-decider`)));
    fourth.push(loserOf(ev.slotById(gs, `${g.prefix}-elim`)));
  }
  order.push(...third.sort((a, b) => fieldRank(a) - fieldRank(b)), ...fourth.sort((a, b) => fieldRank(a) - fieldRank(b)));
  cup.standings = order.map((teamId, i) => ({ teamId, placement: i + 1, points: pointsFor(i + 1) }));
  cup.championId = order[0];
  cup.stage = 'done';
}

// Drives a cup one step. io is one of
//   {play(slot, cup) -> winnerTeamId}                  immediate mode: results are decided on the spot (tests, quick sims)
//   {create(slot, cup), result(slot, cup) -> id|null}   fixture mode: create() makes a real match, result() reads it back later
// Returns true if anything happened. Call again (e.g. once per game day) until cup.stage === 'done'.
function stepCup(ev, cup, io) {
  if (cup.stage === 'done') return false;
  let changed = false;
  if (io.result) {
    for (const s of cup.slots) {
      if (s.fixtureId == null || s.winner != null) continue;
      const w = io.result(s, cup);
      if (w != null && ev.recordResult(cup.slots, s.id, w)) changed = true;
    }
  }
  const open = (slots, seeds) => {
    for (const s of ev.openSlots(slots, seeds)) {
      if (io.play) ev.recordResult(cup.slots, s.id, io.play(s, cup)); else io.create(s, cup);
      changed = true;
    }
  };
  if (cup.stage === 'groups') {
    for (const g of cup.groups) open(slotsOf(cup, g.prefix), g.seeds);
    if (cup.groups.every((g) => ev.bracketComplete(slotsOf(cup, g.prefix)))) {
      const q = cup.groups.map((g) => ev.groupQualifiers(slotsOf(cup, g.prefix), g.prefix));
      cup.playoffSeeds = [...q.map((x) => x[0]), ...q.map((x) => x[1])];
      cup.stage = 'playoffs';
      changed = true;
    }
    return changed;
  }
  const pl = slotsOf(cup, `C${cup.id}P`);
  open(pl, cup.playoffSeeds);
  if (ev.bracketComplete(pl)) { finish(ev, cup); changed = true; }
  return changed;
}

function runCup(ev, cup, play, guard = 100) {
  while (cup.stage !== 'done' && guard-- > 0) if (!stepCup(ev, cup, { play })) break;
  return cup;
}

// Cash prize per placement 1..size (opts.size, default FIELD). The cup's pool is ~30% of the Open prize pool of the same region
// (summed from the game's own prizeFor('open', place, ...) so it follows the game's economy settings).
const PRIZE_SHARE = 0.3;
function prizeTable(ev, opts = {}) {
  const open = (p) => ev.prizeFor('open', p, { real: !!opts.real, region: opts.region });
  let pool = 0;
  for (let p = 1; p <= 16; p++) pool += open(p);
  // Top 16 mirror the Open payout shape; places 17-24 and 25-32 get a smaller slice of the last paid Open place.
  const w = Array.from({ length: opts.size || FIELD }, (_, i) => (i < 16 ? open(i + 1) : open(16) * (i < 24 ? 0.6 : 0.3)));
  const scale = (pool * PRIZE_SHARE) / w.reduce((a, b) => a + b, 0);
  const step = (v) => (v >= 100000 ? 1000 : v >= 10000 ? 500 : v >= 1000 ? 50 : 10);
  return w.map((x) => { const v = x * scale; const st = step(v); return Math.max(st, Math.round(v / st) * st); });
}

module.exports = { FIELD, SIZES, BTIER_POINTS, PRIZE_SHARE, pointsFor, prizeTable, drawGroups, buildSingleElim16, buildCup, planSeasonCups, stepCup, runCup };
