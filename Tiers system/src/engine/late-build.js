'use strict';
// Late game phase 1a (LateGamePlan.md section 4): the facility tree engine. 8 buildings, up to 3 levels, a construction queue and monthly upkeep.
// This part only builds, charges and reports. What each building DOES (academy, scouting, revenue...) is wired in phase 1b through effect(state, id).
// Every price / duration / rate is a placeholder until the balance run (tools/late-sim.js) and lives in the constants below.
const BUILDINGS = [
  { id: 'academy', name: 'Youth Academy Campus', focus: 'Development', req: 3 },
  { id: 'scouting', name: 'Scouting Network', focus: 'Development', req: 2 },
  { id: 'wellbeing', name: 'Performance and Wellbeing Centre', focus: 'Development', req: 4 },
  { id: 'analytics', name: 'Analytics Lab', focus: 'Match edge', req: 4 },
  { id: 'arena', name: 'Arena', focus: 'Revenue and fans', req: 4 },
  { id: 'fanzone', name: 'Fan Zone and Merch', focus: 'Revenue and fans', req: 3 },
  { id: 'studio', name: 'Streaming Studio', focus: 'Revenue and fans', req: 3 },
  { id: 'museum', name: 'Trophy Hall and Museum', focus: 'Prestige', req: 2 }, // Legacy (late-legacy.js): ticket income and followers; the Legacy tab itself does not need it
]; // req = headquarters tier needed before the building can be started
const MAX_LEVEL = 3, MAX_QUEUE = 2;
const COST = [250e3, 1e6, 3.5e6]; // price of level 1..3 (levels 4 and 5 were cut for v0.8.0, see LateGamePlan.md 14.3d) in the real economy
const DAYS = [14, 30, 60]; // construction days of level 1..3
const UPKEEP_RATE = 0.007; // per month, of the value of completed levels
const DEGRADE_AFTER = 12; // Ruthless: unpaid months before every building loses a level

const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const byId = (id) => BUILDINGS.find((b) => b.id === id);

function install(engine, opts = {}) {
  const late = engine && engine.uxLate;
  if (!late) return null;
  if (late.build) return late.build;
  const log = opts.log || (() => {});
  // the game's own prices are x35 outside the real economy (same factor as ux-facilities.js)
  const econ = (state) => (state.economy === 'real' ? 1 : 35);
  const data = (state) => { const c = late.club(state); if (!c.build) { c.build = {}; c.paid = {}; c.queue = []; c.unpaid = false; c.missed = 0; } return c; };
  const hq = (state) => { try { const b = engine.facilityBoard(state); return (b && b.tier) | 0; } catch (e) { return 0; } };

  const level = (state, id) => data(state).build[id] | 0;
  const price = (state, id, lvl) => Math.round(COST[lvl - 1] * late.scale(state, 'price') * econ(state));
  const days = (state, lvl) => Math.max(1, Math.round(DAYS[lvl - 1] * late.scale(state, 'price')));
  const invested = (state) => { const p = data(state).paid; return Object.keys(p).reduce((n, id) => n + p[id].reduce((a, b) => a + b, 0), 0); };
  const upkeepDue = (state) => Math.round(invested(state) * UPKEEP_RATE * late.scale(state, 'upkeep'));
  // 0 while mothballed (Tier B) or not built; half while upkeep is unpaid on Standard (plan section 3 table)
  const effect = (state, id) => {
    if (!late.active(state)) return 0;
    const lvl = level(state, id); if (!lvl) return 0;
    return data(state).unpaid && late.scale(state, 'neglect') === 'half' ? lvl * 0.5 : lvl;
  };

  function start(state, id) {
    const b = byId(id), c = data(state);
    if (!b) return { ok: false, error: 'Unknown building.' };
    if (b.locked) return { ok: false, error: b.locked + '.' };
    if (c.queue.some((q) => q.id === id)) return { ok: false, error: 'Already under construction.' };
    if (c.queue.length >= MAX_QUEUE) return { ok: false, error: 'Two builds at a time: wait for one to finish.' };
    const next = level(state, id) + 1;
    if (next > MAX_LEVEL) return { ok: false, error: 'Fully built.' };
    if (hq(state) < b.req) return { ok: false, error: 'Needs headquarters tier ' + b.req + '.' };
    const cost = price(state, id, next), s = late.spend(state, cost, b.name + ' level ' + next + ' (construction)');
    if (!s.ok) return s;
    late.lockMode(state); // the first build locks the difficulty mode (plan section 3, decided with the user)
    const entry = { id, level: next, cost, start: state.currentDate, end: addDays(state.currentDate, days(state, next)) };
    c.queue.push(entry);
    return { ok: true, entry };
  }

  function complete(state) {
    const c = data(state);
    for (const q of c.queue.filter((x) => x.end <= state.currentDate)) {
      c.queue.splice(c.queue.indexOf(q), 1);
      c.build[q.id] = q.level; (c.paid[q.id] = c.paid[q.id] || []).push(q.cost);
      late.note(state, byId(q.id).name + ' level ' + q.level + ' is ready', 'Construction finished. Monthly upkeep now applies to the new level.');
    }
  }

  function upkeep(state) {
    const c = data(state), due = upkeepDue(state);
    if (!due) return;
    if (late.spend(state, due, 'Facility upkeep').ok) { c.unpaid = false; return; }
    c.unpaid = true; c.missed++; // plan 4.2: never bankrupt; the mode decides what is lost
    if (late.scale(state, 'neglect') === 'degrade' && c.missed >= DEGRADE_AFTER) {
      c.missed = 0;
      for (const id of Object.keys(c.build)) { if (c.build[id] > 0) { c.build[id]--; c.paid[id].pop(); } }
      late.note(state, 'Facilities are falling into disrepair', 'A year of unpaid upkeep: every building lost a level.');
    }
  }

  const view = (state) => {
    const c = data(state), h = hq(state);
    return {
      hq: h, upkeep: upkeepDue(state), unpaid: c.unpaid, queue: c.queue.slice(),
      list: BUILDINGS.map((b) => {
        const lvl = level(state, b.id), next = lvl + 1, busy = c.queue.some((q) => q.id === b.id);
        const d = late.effects && late.effects.describe;
        return { id: b.id, name: b.name, focus: b.focus, req: b.req, locked: b.locked || null, level: lvl, max: MAX_LEVEL, building: busy, price: next <= MAX_LEVEL ? price(state, b.id, next) : null, days: next <= MAX_LEVEL ? days(state, next) : null, now: d ? d(b.id, lvl) : '', next: d && next <= MAX_LEVEL ? d(b.id, next) : '', canStart: !b.locked && !busy && next <= MAX_LEVEL && h >= b.req && c.queue.length < MAX_QUEUE };
      }),
    };
  };

  late.onDaily(complete);
  late.onMonthly(upkeep);
  late.action('build', (state, a) => start(state, a.id));
  late.action('facilities', (state) => ({ ok: false, readOnly: true, ...view(state) })); // read-only: ok:false carries the data (see late-core rpc)
  late.build = { BUILDINGS, MAX_LEVEL, MAX_QUEUE, level, effect, price, days, hq, start, upkeep, upkeepDue, view };
  log('late build installed');
  return late.build;
}

module.exports = { install, BUILDINGS, MAX_LEVEL, MAX_QUEUE, COST, DAYS, UPKEEP_RATE };
