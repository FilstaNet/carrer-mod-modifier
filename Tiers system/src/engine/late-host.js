'use strict';
// Late game phase 3, part 1 (LateGamePlan.md 6.0): the user's own cup series ("circuit"). Unlocked by an Arena at level 2.
// A circuit = 3 or 4 stops (each an 8-club Invitational built by ux-club.js) + a Finals (the host and the 7 best other clubs by points).
// Money is paid 14 days before each stop; if the budget cannot cover it or too few clubs accept, that stop is cancelled and the club loses followers.
// Every number is a placeholder until the balance run. State: state.late.host = { v, seq, circuits: [...] }.
const MIN_ARENA = 2;
const STOPS = [3, 4]; // allowed numbers of stops
const FUND_DAYS = 14; // the stop's money is paid this many days before it starts
const POINTS = [25, 18, 14, 12, 8, 8, 5, 5]; // by placement at a stop (the Finals give none)
const TV_RATE = 0.12; // TV rights per finished stop = prize pool x this x (1 + TV_STUDIO x Streaming Studio level)
const TV_STUDIO = 0.2;
const FINALS_GAP = 21; // days between the last stop's start and the Finals' start, at least
const MISS_COST = 0.03; // share of followers lost when a stop or the Finals cannot be held
const STOP_DAYS = 3; // an 8-club Invitational lasts 3 days (start, start+1, start+2)
const SHIFT_DAYS = 28; // a planned date that is no longer free (new official events, booked scrims) moves to the next free day within this many days

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

function install(engine, opts = {}) {
  const late = engine && engine.uxLate, B = late && late.build, club = engine && engine.uxClub;
  if (!B || !club) return null;
  if (late.host) return late.host;
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late host: ' + what + ' failed: ' + e.stack); } };
  const user = (state) => engine.teamById(state, state.userTeamId);
  const data = (state) => { const u = late.ensure(state); return u.host || (u.host = { v: 1, seq: 0, circuits: [] }); };
  const econ = (state) => (state.economy === 'real' ? 1 : 35);
  const fmt = (n) => (engine.fmtMoney ? engine.fmtMoney(n) : '$' + Math.round(n));
  const open = (c) => c.stage === 'planned' || c.stage === 'running';
  const arenaOk = (state) => B.level(state, 'arena') >= MIN_ARENA;

  const miss = (state, c, what, why) => {
    const t = user(state); if (t) t.followers = Math.round((t.followers || 0) * (1 - MISS_COST));
    late.note(state, c.name + ': ' + what + ' cancelled', why + ' Your followers drop by ' + Math.round(MISS_COST * 100) + '%.');
  };

  // ---- creating a circuit ----
  function create(state, a) {
    const d = data(state), t = user(state);
    if (!arenaOk(state)) return { ok: false, error: 'Own cup series need an Arena at level ' + MIN_ARENA + '.' };
    if (d.circuits.some(open)) return { ok: false, error: 'You already run a circuit. Finish or cancel it first.' };
    const starts = (Array.isArray(a.stops) ? a.stops : []).map((x) => String(x && x.start || x));
    if (!STOPS.includes(starts.length)) return { ok: false, error: 'A circuit has ' + STOPS.join(' or ') + ' stops.' };
    const finalsStart = String(a.finalsStart || '');
    const prize = Math.round(Number(a.prize) || 0), finalsPrize = Math.round(Number(a.finalsPrize) || 0);
    const all = starts.concat(finalsStart);
    for (let i = 0; i < all.length; i++) if (!/^\d{4}-\d{2}-\d{2}$/.test(all[i]) || isNaN(Date.parse(all[i]))) return { ok: false, error: 'Pick a date for every stop and the Finals.' };
    for (let i = 1; i < starts.length; i++) if (days(starts[i - 1], starts[i]) < STOP_DAYS + club.MARGIN_HOST + 1) return { ok: false, error: 'Stops must be in order, with at least ' + club.MARGIN_HOST + ' free days between them.' };
    if (days(starts[starts.length - 1], finalsStart) < FINALS_GAP) return { ok: false, error: 'The Finals must start at least ' + FINALS_GAP + ' days after the last stop.' };
    if (days(state.currentDate, starts[0]) < FUND_DAYS + 7) return { ok: false, error: 'The first stop must be at least ' + (FUND_DAYS + 7) + ' days away.' };
    // every date must be free of official events and your own other events (the plan is checked against the calendar as it is now)
    for (const s of all) { if (!club.windowOk(state, s, STOP_DAYS) || club.scrimClash(state, s, STOP_DAYS)) return { ok: false, error: s + ' is not free: events, your matches or booked scrims are in the way, and hosted events need ' + club.MARGIN_HOST + ' free days around other events.' }; }
    for (const [label, p] of [['a stop', prize], ['the Finals', finalsPrize]]) {
      const pl = club.planInvitational(state, { size: 8, scope: 'global', prize: p, invitees: [] });
      if (!pl.ok) return pl;
      if (p < pl.lo || p > pl.hi) return { ok: false, error: 'The prize pool of ' + label + ' must be between ' + fmt(pl.lo) + ' and ' + fmt(pl.hi) + '.' };
    }
    const name = String(a.name || '').slice(0, 40) || t.name + ' Circuit';
    const c = { id: ++d.seq, name, stage: 'planned', created: state.currentDate, prize, finalsPrize, points: {}, tv: 0, champion: null,
      stops: starts.map((start, i) => ({ no: i + 1, start, status: 'planned', invId: null })), finals: { start: finalsStart, status: 'planned', invId: null } };
    d.circuits.push(c);
    late.note(state, name + ' announced', starts.length + ' stops and a Finals. Each stop is paid 14 days before it starts; sign-ups, sponsors and TV rights follow.');
    return { ok: true, circuit: c };
  }

  function cancel(state, a) {
    const c = data(state).circuits.find((x) => x.id === Number(a.id) && open(x));
    if (!c) return { ok: false, error: 'There is no circuit to cancel.' };
    if (c.stops.some((s) => s.status === 'live' || s.status === 'done') || c.finals.status !== 'planned') return { ok: false, error: 'A circuit that has started cannot be cancelled.' };
    c.stage = 'cancelled'; for (const s of c.stops) s.status = 'cancelled'; c.finals.status = 'cancelled';
    return { ok: true };
  }

  // ---- running it (daily) ----
  const hostStop = (state, c, x, size, name, prize, forced) => {
    x.status = 'funding'; // out of the calendar for the moment, so it does not block itself
    // the plan was free when it was made, but the calendar changes (next season's events appear, a scrim gets booked): move the date instead of losing the stop
    let d = null;
    for (let k = 0; k <= SHIFT_DAYS && !d; k++) { const t = addDays(x.start, k); if (t >= addDays(state.currentDate, 7) && club.windowOk(state, t, STOP_DAYS) && !club.scrimClash(state, t, STOP_DAYS)) d = t; }
    if (!d) { x.status = 'cancelled'; return { ok: false, error: 'No free date within ' + SHIFT_DAYS + ' days of ' + x.start + '.' }; }
    if (d !== x.start) { late.note(state, name + ' moved', 'The calendar changed: ' + x.start + ' is no longer free, so it now starts on ' + d + '.'); x.moved = x.start; x.start = d; }
    const r = club.hostInvitational(state, { size, scope: 'global', start: x.start, prize, name, sponsors: [0, 1, 2], forced });
    if (!r.ok) { x.status = 'cancelled'; return r; }
    x.status = 'live'; x.invId = r.inv.id; r.inv.circuitId = c.id; return r;
  };
  const invOf = (state, id) => club.invOf(state, id);

  function daily(state) {
    for (const c of data(state).circuits.filter(open)) {
      c.stage = 'running';
      for (const x of c.stops) {
        if (x.status === 'planned' && days(state.currentDate, x.start) <= FUND_DAYS) {
          const r = hostStop(state, c, x, 8, c.name + ' · Stop ' + x.no, c.prize);
          if (!r.ok) miss(state, c, 'Stop ' + x.no, r.error);
        } else if (x.status === 'live') {
          const inv = invOf(state, x.invId);
          if (inv && inv.stage === 'done') {
            x.status = 'done'; x.result = inv.standings.map((s) => ({ teamId: s.teamId, placement: s.placement, points: POINTS[s.placement - 1] || 0 }));
            for (const s of inv.standings) c.points[s.teamId] = (c.points[s.teamId] || 0) + (POINTS[s.placement - 1] || 0);
            const tv = Math.round(c.prize * TV_RATE * (1 + TV_STUDIO * B.effect(state, 'studio')));
            late.earn(state, tv, c.name + ': TV rights, stop ' + x.no); c.tv += tv;
          } else if (inv && inv.stage === 'cancelled') x.status = 'cancelled';
        }
      }
      const f = c.finals, pending = c.stops.some((x) => x.status === 'planned' || x.status === 'live');
      if (f.status === 'planned' && !pending && days(state.currentDate, f.start) <= FUND_DAYS) {
        const done = c.stops.filter((x) => x.status === 'done').length;
        const ranked = Object.keys(c.points).map(Number).filter((id) => id !== state.userTeamId).sort((p, q) => c.points[q] - c.points[p] || p - q);
        if (done < 2 || ranked.length < 7) { f.status = 'cancelled'; miss(state, c, 'the Finals', 'Too few stops were held to crown a champion.'); }
        else {
          const r = hostStop(state, c, f, 8, c.name + ' · Finals', c.finalsPrize, ranked.slice(0, 7));
          if (!r.ok) miss(state, c, 'the Finals', r.error);
        }
      } else if (f.status === 'live') {
        const inv = invOf(state, f.invId);
        if (inv && inv.stage === 'done') { f.status = 'done'; c.champion = inv.championId; }
      }
      if (c.stops.every((x) => x.status === 'done' || x.status === 'cancelled') && (f.status === 'done' || f.status === 'cancelled')) {
        c.stage = 'done';
        const w = c.champion != null ? engine.teamById(state, c.champion) : null;
        late.note(state, c.name + ' is over', (w ? w.name + ' win the Finals. ' : 'The Finals were not held. ') + 'TV rights paid ' + fmt(c.tv) + ' in total.');
      }
    }
  }

  // read-only view for the UI (and the Standings tab): the table is every club with points, the user's club always listed
  const view = (state) => {
    const d = data(state);
    return { ok: false, readOnly: true, arenaOk: arenaOk(state), minArena: MIN_ARENA, circuits: d.circuits.map((c) => ({ ...c, table: Object.keys(c.points).map(Number).concat(c.points[state.userTeamId] == null ? [state.userTeamId] : []).map((id) => ({ teamId: id, points: c.points[id] || 0 })).sort((p, q) => q.points - p.points || p.teamId - q.teamId) })) };
  };

  late.action('circuit', create);
  late.action('circuit_cancel', cancel);
  late.action('circuits', (state) => view(state));
  late.onDaily((state) => safe('daily', () => daily(state)));
  late.host = { create, cancel, daily, view, arenaOk, MIN_ARENA, POINTS, FUND_DAYS, FINALS_GAP, TV_RATE, TV_STUDIO, MISS_COST };
  log('late host installed');
  return late.host;
}

module.exports = { install, MIN_ARENA, POINTS, FUND_DAYS };
