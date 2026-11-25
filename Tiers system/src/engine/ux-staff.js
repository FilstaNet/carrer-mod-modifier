'use strict';
// Staff (scouts) for the user's club. The game seeds 3 scouts at a fixed weekly wage (state.staff) that can not be changed; a weak Tier B club has a
// wage budget about as big as that bill, so nothing else (a content creator, say) fit. This adds:
//  - hire and fire scouts (Scouting > Staff tab); a scout has a skill 1-3 that sets how fast scouting jobs run, and a wage to match
//  - the number of scouts is the number of scouting jobs that can run at once (the game only counts a fixed 3)
//  - Tier B careers start with 1 scout and a minimum weekly wage budget
// State: the game's own state.staff entries ({id, role:'scout', name, wage}) plus an optional skill. Nothing else is stored, old saves load unchanged.
const { hash } = require('./ux-persona');

const MAX_SCOUTS = 3; // the game's SCOUT_SLOTS
const NAMES = ['Dan Weller', 'Priya Raman', 'Marco Silva', 'Ana Torres', 'Tom Lindqvist', 'Yusuf Demir', 'Elin Berg', 'Kofi Mensah', 'Lucia Ferrer', 'Jonas Kruger', 'Mei Tanaka', 'Rafa Costa'];
const SKILLS = { 1: { wage: 100, speed: 1.15, label: 'Rookie' }, 2: { wage: 250, speed: 1, label: 'Regular' }, 3: { wage: 400, speed: 0.8, label: 'Veteran' } }; // wage in real-money careers; speed: scouting job length
const POOL = [1, 1, 2, 2, 3]; // skills offered each season
const B_FLOOR = 1500; // weekly wage budget a Tier B user club always has at least (real-money careers)
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// h = helpers from ux-club.js: note, ledger-free; only note and fmt are needed
function create(engine, h, log = () => {}) {
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-staff: ' + what + ' failed: ' + e.stack); return undefined; } };
  const user = (s) => engine.teamById(s, s.userTeamId);
  const real = (s) => s.economy === 'real';
  const scale = (s, v) => (real(s) ? v : Math.round(v * 9500 / 300 / 500) * 500); // the game's non-real scout wage is 9500 against 300
  const isB = (s) => { const t = user(s); return !!t && /_b$/.test(t.region || ''); };
  const scouts = (s) => engine.staffList(s).filter((x) => x.role === 'scout');
  const jobs = (s) => (s.scouts && s.scouts.jobs) || [];
  const skillOf = (x) => (SKILLS[x.skill] ? x.skill : 2); // the game's own scouts have no skill: they are regular

  // this season's scouts looking for work (the same ones for everybody that season); not the ones already on the staff
  function pool(s) {
    const have = new Set(scouts(s).map((x) => x.name)), out = [];
    POOL.forEach((skill, i) => {
      let k = hash('scout:' + s.season + ':' + i) % NAMES.length;
      for (let n = 0; n < NAMES.length && out.some((c) => c.name === NAMES[k]); n++) k = (k + 1) % NAMES.length; // a candidate is the same person whoever is on the staff (a hired one just drops out below)
      out.push({ cid: s.season * 10 + i, name: NAMES[k], skill, wage: scale(s, SKILLS[skill].wage) });
    });
    return out.filter((c) => !have.has(c.name));
  }

  function info(s) {
    const busy = new Set(jobs(s).map((j) => j.scoutId).filter((x) => x != null)), bill = engine.wageBill(s), t = user(s);
    return { scouts: scouts(s).map((x) => ({ id: x.id, name: x.name, wage: x.wage, skill: skillOf(x), busy: busy.has(x.id) })), pool: pool(s), jobs: jobs(s).length, max: MAX_SCOUTS,
      bill, budget: t.wageBudget || 0, room: engine.wageRoom(s), skills: SKILLS };
  }

  function fire(s, id) {
    const sc = scouts(s), x = sc.find((v) => v.id === Number(id));
    if (!x) return { ok: false, error: 'No such scout.' };
    if (jobs(s).some((j) => j.scoutId === x.id) || jobs(s).length > sc.length - 1) return { ok: false, error: 'Recall a scouting job first: every scout is out watching a player.' };
    s.staff = engine.staffList(s).filter((v) => v !== x);
    h.note(s, 'news', x.name + ' has left', 'The scout is off your staff. ' + h.fmt(x.wage) + ' a week is free again.');
    return { ok: true };
  }
  function hire(s, cid) {
    const sc = scouts(s), c = pool(s).find((v) => v.cid === Number(cid));
    if (!c) return { ok: false, error: 'That scout is no longer available.' };
    if (sc.length >= MAX_SCOUTS) return { ok: false, error: 'You can have at most ' + MAX_SCOUTS + ' scouts.' };
    const room = engine.wageRoom(s);
    if (c.wage > room) return { ok: false, error: 'That is ' + h.fmt(c.wage - room) + ' a week more than the wage budget has left.' };
    const list = engine.staffList(s);
    list.push({ id: Math.max(0, ...list.map((v) => v.id || 0)) + 1, role: 'scout', name: c.name, wage: c.wage, skill: c.skill });
    h.note(s, 'news', c.name + ' joins as a scout', SKILLS[c.skill].label + ' scout on ' + h.fmt(c.wage) + ' a week.');
    return { ok: true };
  }

  // Tier B clubs: a wage budget that fits the staff, checked daily because the game recomputes the budget each season
  function floor(s) { const t = user(s); const f = scale(s, B_FLOOR); if (t && isB(s) && (t.wageBudget || 0) < f) t.wageBudget = f; }
  // a new Tier B career: 1 scout instead of 3 (only the untouched seeded ones, only while nothing is scouted yet)
  function fixStart(s) {
    if (!isB(s)) return;
    const sc = scouts(s);
    if (sc.length === MAX_SCOUTS && sc.every((x) => x.skill == null) && !jobs(s).length) s.staff = engine.staffList(s).filter((x) => x.role !== 'scout' || x.id === sc[0].id);
    floor(s);
  }
  const tick = (s) => safe('wage floor', () => floor(s));

  // a scouting job runs as many at once as there are scouts, and its length follows the scout's skill
  const orig = engine.startScouting;
  if (typeof orig === 'function' && !orig.__uxStaff) {
    engine.startScouting = function startScoutingWithStaff(s) {
      const n = scouts(s).length;
      if (!n) return { ok: false, error: 'You have no scouts. You need to hire one.' };
      if (jobs(s).length >= n) return { ok: false, error: 'All ' + n + ' scouts are busy. Recall one first.' };
      const r = orig.apply(this, arguments);
      if (r && r.ok && !r.resumed) safe('scout skill', () => {
        const j = jobs(s)[jobs(s).length - 1], x = j && scouts(s).find((v) => v.id === j.scoutId);
        if (!x) return;
        const total = Math.round((Date.parse(j.endDate) - Date.parse(j.startDate)) / 86400000), d = Math.max(1, Math.round(total * SKILLS[skillOf(x)].speed));
        j.endDate = addDays(j.startDate, d); r.days = d;
      });
      return r;
    };
    engine.startScouting.__uxStaff = true;
  }

  function rpc(s, a) {
    switch (a.a) {
      case 'staffinfo': return info(s); // read-only
      case 'staffhire': return hire(s, a.cid);
      case 'stafffire': return fire(s, a.id);
      default: return null;
    }
  }
  return { rpc, tick, fixStart, info, pool, MAX_SCOUTS, SKILLS };
}

module.exports = { create, MAX_SCOUTS, SKILLS };
