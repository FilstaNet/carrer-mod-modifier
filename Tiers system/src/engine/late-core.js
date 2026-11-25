'use strict';
// Late game, phase 0 (LateGamePlan.md section 3): the shared foundation every later phase plugs into.
//   state.late   one versioned key, created on demand, keyed by team id from day one: { v, mode, modeChosen, unlocked, month, clubs: { [teamId]: {} } }
//   gate         active(state): a Tier A manager only. A relegated club keeps its data (mothballed): nothing runs until it is Tier A again.
//   mode         relaxed / standard / ruthless, read by every system through scale(state, key)
//   money        spend / earn go through the game's pushLedger and team.budget (pushLedger only logs, it does not move money)
//   action       placeBet kind 'uxl:<json>' (the only IPC the game's main process forwards), dispatched here to handlers the phases register
//   tick         after each advance: daily handlers, and monthly handlers when the month changes
const VERSION = 1;
const DEFAULT_MODE = 'standard';
// placeholder numbers until the balance run (tools/late-sim.js, plan section 3.7)
const MODES = {
  relaxed: { price: 0.8, upkeep: 0.8, neglect: 'pause', hunger: 0, offers: 1.5, crises: 0 },
  standard: { price: 1.0, upkeep: 1.0, neglect: 'half', hunger: 1, offers: 1, crises: 1 },
  ruthless: { price: 1.3, upkeep: 1.3, neglect: 'degrade', hunger: 2, offers: 0.5, crises: 2 },
};

function create(engine, opts = {}) {
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late: ' + what + ' failed: ' + e.stack); return undefined; } };
  const daily = [], monthly = [], actions = {};
  const user = (state) => engine.teamById(state, state.userTeamId);

  // Facilities unlock after the user's club wins REQ.major majors and REQ.open opens in total (counted from the game's finished events, once each).
  // Tests set late.REQ.major = late.REQ.open = 0 to skip the grind.
  const REQ = { major: 2, open: 5 };
  // manager career (a player career has state.mode === 'player'), Tier A club, not sacked
  const eligible = (state) => { const t = state && state.teams && state.userTeamId != null ? user(state) : null; return !!t && state.mode !== 'player' && t.tier !== 'B' && !state.sacked; };
  const active = (state) => eligible(state) && !!(state.late && state.late.unlocked);
  const SEEN_KINDS = { major: 1, open: 1 };
  function countWins(state) {
    const u = ensure(state), w = u.wins || (u.wins = { major: 0, open: 0, seen: [] });
    for (const e of state.events || []) {
      if (!SEEN_KINDS[e.kind] || e.stage !== 'done' || e.championId !== state.userTeamId) continue;
      const k = state.season + ':' + e.kind + ':' + e.name; if (w.seen.includes(k)) continue;
      w.seen.push(k); w[e.kind]++;
    }
    u.req = { major: REQ.major, open: REQ.open };
    return w;
  }
  const ensure = (state) => {
    if (!state.late || state.late.v !== VERSION) state.late = { v: VERSION, mode: DEFAULT_MODE, modeChosen: false, unlocked: false, month: null, clubs: {}, ...(state.late || {}) };
    return state.late;
  };
  const mode = (state) => (state && state.late && MODES[state.late.mode] ? state.late.mode : DEFAULT_MODE);
  const scale = (state, key) => MODES[mode(state)][key];
  // choosing a mode locks it; so does the first thing that depends on it (the first build), which keeps the default
  const lockMode = (state) => { ensure(state).modeChosen = true; };
  const club = (state, id = state.userTeamId) => { const c = ensure(state).clubs; return c[id] || (c[id] = {}); };

  const note = (state, title, body) => { state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'info', title, link: 'inbox', body }); if (state.inbox.length > 120) state.inbox.splice(0, state.inbox.length - 120); };
  const ledger = (state, amount, text) => safe('ledger', () => engine.pushLedger(state, 'late', amount, text));
  // never takes the budget below zero (plan 4.2: no bankruptcy)
  const spend = (state, amount, text) => {
    const t = user(state); amount = Math.round(amount);
    if (!t || !(amount > 0)) return { ok: false, error: 'Bad amount.' };
    if ((t.budget || 0) < amount) return { ok: false, error: 'Not enough budget.' };
    t.budget -= amount; ledger(state, -amount, text); return { ok: true };
  };
  const earn = (state, amount, text) => {
    const t = user(state); amount = Math.round(amount);
    if (!t || !(amount > 0)) return { ok: false, error: 'Bad amount.' };
    t.budget = (t.budget || 0) + amount; ledger(state, amount, text); return { ok: true };
  };

  function tick(state) {
    if (!eligible(state)) return;
    const u = ensure(state), w = countWins(state);
    if (!u.unlocked) {
      if (w.major < REQ.major || w.open < REQ.open) return;
      u.unlocked = true; note(state, 'Facilities unlocked', 'Your trophy cabinet has convinced the board: the facility tree is open in Club → Facilities. Choose a difficulty mode (Relaxed / Standard / Ruthless) there.');
    }
    for (const fn of daily) safe('daily', () => fn(state));
    // shortcut: an advance that jumps several months runs the monthly handlers once, not once per month; upgrade if a multi-month advance ever exists
    const m = String(state.currentDate).slice(0, 7);
    if (u.month !== m) { const first = u.month == null; u.month = m; if (!first) for (const fn of monthly) safe('monthly', () => fn(state)); }
  }

  function rpc(state, json) {
    let a; try { a = JSON.parse(json); } catch (e) { return { ok: false, error: 'Bad request.' }; }
    if (!a || typeof a !== 'object') return { ok: false, error: 'Bad request.' };
    // read-only actions return ok:false WITH their data: the game's main process answers ok:true with the whole new state, so the UI would never see the data (same as ux-club windows / preview)
    if (a.a === 'status') return { ok: false, readOnly: true, active: active(state), wins: state.late && state.late.wins || null, req: REQ, mode: mode(state), modeChosen: !!(state.late && state.late.modeChosen), unlocked: !!(state.late && state.late.unlocked) };
    if (!active(state)) return { ok: false, error: 'Facilities unlock after ' + REQ.major + ' majors and ' + REQ.open + ' opens won.' };
    if (a.a === 'mode') {
      if (!MODES[a.mode]) return { ok: false, error: 'Unknown mode.' };
      const u = ensure(state);
      if (u.modeChosen) return { ok: false, error: 'The difficulty mode is locked for this career.' }; // rules must not change in mid-game (decided with the user)
      u.mode = a.mode; u.modeChosen = true; return { ok: true, mode: a.mode };
    }
    const fn = actions[a.a];
    return fn ? fn(state, a) : { ok: false, error: 'Unknown action.' };
  }

  return {
    active, eligible, REQ, ensure, mode, lockMode, scale, club, spend, earn, note, tick, rpc,
    onDaily: (fn) => { daily.push(fn); }, onMonthly: (fn) => { monthly.push(fn); }, action: (name, fn) => { actions[name] = fn; },
  };
}

// Install after ux-club and ux-scrims (they own the calendar and lineup hooks), before btier-state captures engine.advance.
function install(engine, opts = {}) {
  if (!engine || engine.__uxLate || typeof engine.advance !== 'function') return null;
  engine.__uxLate = true;
  const late = create(engine, opts);
  const log = opts.log || (() => {});
  const advance = engine.advance;
  engine.advance = function advanceWithLate(state) {
    const r = advance.apply(this, arguments);
    try { late.tick(state); } catch (e) { log('late: tick failed: ' + e.stack); }
    return r;
  };
  const placeBet = engine.placeBet;
  engine.placeBet = function placeBetOrLate(state, kind) {
    if (typeof kind === 'string' && kind.indexOf('uxl:') === 0) {
      try { return late.rpc(state, kind.slice(4)); } catch (e) { log('late: rpc failed: ' + e.stack); return { ok: false, error: 'That could not be done.' }; }
    }
    return placeBet.apply(this, arguments);
  };
  engine.uxLate = late;
  log('late core installed');
  return late;
}

module.exports = { create, install, MODES, DEFAULT_MODE, VERSION };
