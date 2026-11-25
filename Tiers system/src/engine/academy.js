'use strict';
// Academy Mode, part 1: eligibility, purchase and renewal pricing. All data lives in state.academy (saved with the career).
// Nothing here edits the game's files; wrapEngine (btier-state.js) calls scan() after every day and before the season roll.
//
// state.academy = {
//   counted: [event keys already counted], top12: Major top-12 finishes not yet used for an eligibility,
//   from, until: eligibility window (season numbers, inclusive) or null,
//   paidSeason: season whose access was bought (or null), runBuys: purchases in the current run, priorRuns: finished runs with purchases,
//   session: null  // part 3
// }
const FIRST_RUN = [400000, 300000, 200000, 100000]; // first ever acquisition, then renewals; never below 100K
const AGAIN_RUN = [200000, 100000];                 // after eligibility was lost and regained
const WINDOW = 3;

function ensure(state) {
  if (!state.academy || typeof state.academy !== 'object') {
    state.academy = { counted: [], top12: 0, from: null, until: null, paidSeason: null, runBuys: 0, priorRuns: 0, session: null };
  }
  return state.academy;
}

// A qualifying result in season s opens (or refreshes) a window s+1 .. s+3. Starts next season, never the current one.
function grant(a, s) {
  const until = s + WINDOW;
  if (a.from == null || a.until == null || a.until < s) a.from = s + 1; // no window running now: start a new one
  a.until = Math.max(a.until || 0, until);
}

// Idempotent: every counted event is remembered by key, so calling it any number of times never counts twice.
function scan(state) {
  const a = ensure(state);
  const me = state.userTeamId;
  for (const e of state.events || []) {
    if (e.kind !== 'major' && e.kind !== 'worlds') continue;
    const key = state.season + ':' + e.kind + ':' + (e.index != null ? e.index : e.split != null ? e.split : e.name);
    if (a.counted.includes(key)) continue;
    if (e.kind === 'worlds') {
      // Worlds field is drawn once qualification ends; being in it is the achievement (no need to wait for the event to end).
      if (Array.isArray(e.field) && e.field.length && e.field.includes(me)) { a.counted.push(key); grant(a, state.season); }
      continue;
    }
    if (e.stage !== 'done') continue;
    a.counted.push(key);
    const st = (e.standings || []).find((x) => x.teamId === me);
    if (!st) continue;
    if (st.placement <= 8) grant(a, state.season);
    if (st.placement <= 12 && ++a.top12 >= 2) { a.top12 = 0; grant(a, state.season); } // shortcut: the two Top 12s may come from any seasons; upgrade if they must fall in one window
  }
  if (a.counted.length > 60) a.counted = a.counted.filter((k) => +k.split(':')[0] >= state.season - 1);
  return a;
}

const eligible = (state) => { const a = ensure(state); return a.from != null && state.season >= a.from && state.season <= a.until; };

// 'hidden' (never eligible / expired), 'closed' (eligible, not bought), 'open', 'training' (part 3 sets session.active)
function status(state) {
  const a = ensure(state);
  if (a.session && a.session.active) return 'training'; // a running session outlives season changes and lapsed eligibility
  if (!eligible(state)) return 'hidden';
  if (a.paidSeason !== state.season) return 'closed';
  return 'open';
}

function price(state) {
  const a = ensure(state);
  const t = a.priorRuns ? AGAIN_RUN : FIRST_RUN;
  return t[Math.min(a.runBuys, t.length - 1)];
}

// Manual only; the money is taken here and nowhere else. A season is never charged twice.
function buy(state) {
  const a = ensure(state);
  if (!eligible(state)) return { ok: false, reason: 'not-eligible' };
  if (a.paidSeason === state.season) return { ok: false, reason: 'already-bought' };
  const team = (state.teams || []).find((t) => t.id === state.userTeamId);
  if (!team) return { ok: false, reason: 'no-team' };
  const cost = price(state);
  if (team.budget < cost) return { ok: false, reason: 'funds', price: cost };
  team.budget -= cost;
  if (!Array.isArray(state.ledger)) state.ledger = [];
  state.ledger.push({ date: state.currentDate, kind: 'academy', amount: -cost, note: 'Academy' });
  a.paidSeason = state.season;
  a.runBuys++;
  return { ok: true, price: cost, status: status(state) };
}

// Call once after the season number has changed. Closes the current run when the window has run out, so the next
// acquisition costs 200K then 100K (the progression is kept in priorRuns). No charge, ever.
function seasonRoll(state) {
  const a = ensure(state);
  if (a.until != null && state.season > a.until) {
    if (a.runBuys > 0) a.priorRuns++;
    a.runBuys = 0; a.from = a.until = null; a.paidSeason = null;
  }
  return a;
}

const SECTIONS = ['Airdribble', 'Double Taps', 'Flicks', 'Fundamentals', 'Saves', 'Shooting']; // 2 slots each -> slots[0..11]
const MIN_DAYS = 14, MAX_DAYS = 60;
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// Competitions the club would miss if the session started today and ran `days` days (players are away start <= day < end).
// Only real scheduled events. Events whose field is not drawn yet (Tier A Opens/Majors/LCQ/Worlds) are listed with
// unconfirmed:true because the club may not take part; Tier B cups are always the club's.
function missed(state, days) {
  const start = state.currentDate, end = addDays(start, days), me = state.userTeamId;
  const b = /_b$/.test(state.userRegion || '');
  const list = b ? ((state.tierB && state.tierB.cups) || []).filter((c) => c.region === state.userRegion) : (state.events || []);
  return list.filter((e) => e.stage !== 'done' && !e.skipped && e.startDate < end && e.endDate >= start && !(Array.isArray(e.field) && e.field.length && !e.field.includes(me)))
    .map((e) => ({ name: e.name, startDate: e.startDate, endDate: e.endDate, unconfirmed: !b && !(Array.isArray(e.field) && e.field.length) }));
}

// Away at the Academy right now (a running session lists him): he cannot be in the game's Training.
function inAcademy(state, id) {
  const s = state && state.academy && state.academy.session;
  return !!(s && s.active && s.slots.includes(id));
}
const inTraining = (state, id) => !!(state.training && (state.training.slots || []).some((x) => x && x.pid === id));

// slots: 12 player ids or null (section i uses slots[2i], slots[2i+1]); the same player may fill several slots.
function startSession(state, { days, slots } = {}) {
  const a = ensure(state);
  if (status(state) !== 'open') return { ok: false, reason: status(state) === 'training' ? 'busy' : 'closed' };
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return { ok: false, reason: 'days' };
  const team = (state.teams || []).find((t) => t.id === state.userTeamId);
  const sl = Array.from({ length: SECTIONS.length * 2 }, (_, i) => (slots && slots[i] != null ? slots[i] : null));
  if (sl.some((id) => id != null && !(team && team.playerIds.includes(id)))) return { ok: false, reason: 'players' };
  if (!sl.some((id) => id != null)) return { ok: false, reason: 'empty' };
  const busy = sl.find((id) => id != null && inTraining(state, id));
  if (busy != null) { const p = (state.players || []).find((x) => x.id === busy); return { ok: false, reason: 'training', error: (p ? p.name : 'A player') + ' is in a Training slot. Take him out of Training first.' }; }
  a.session = { active: true, start: state.currentDate, days, end: addDays(state.currentDate, days), slots: sl, rewarded: false };
  setAway(state);
  return { ok: true, session: a.session, status: status(state) };
}

// ---- session runtime ----
// Availability reuses the game's own absence mechanism (player.absence), so lineups, match simulation and every
// "is available" check already skip the player; it is date based (until = last away day) and saved with the player.
const lastDay = (s) => addDays(s.end, -1);
function setAway(state) {
  const s = ensure(state).session;
  if (!s || !s.active) return;
  const byId = new Map((state.players || []).map((p) => [p.id, p]));
  for (const id of new Set(s.slots.filter((x) => x != null))) {
    const p = byId.get(id);
    if (!p || p.retired) continue;
    if (p.absence && !p.absence.academy && p.absence.until >= lastDay(s) && p.absence.since <= state.currentDate) continue; // already away at least as long (injury)
    p.absence = { reason: 'the Academy', cat: 'academy', since: s.start, until: lastDay(s), days: s.days, academy: true };
  }
}

// Gain for one player over the session. Per slot: 1.2 * (days/14)^0.8 rating points, so longer uninterrupted sessions give less
// per day (5 x 14 days > 1 x 70 days; the game's slider stops at 60). Extra slots of the same player add 1/2, 1/4, ... (max 2x).
// Then the game's own high-rating damping exp(-(r-60)/16) (league.js gainScale), as its Training does.
const slotGain = (days) => 1.2 * Math.pow(days / 14, 0.8);
function gainFor(days, slots, rating) {
  const stack = 2 * (1 - Math.pow(0.5, slots));
  return slotGain(days) * stack * Math.exp(-(rating - 60) / 16);
}

// Ends the session once: gives the rating, frees the players, status -> open. Safe to call again (rewarded guard).
function finish(state, held, boost) {
  const a = ensure(state), s = a.session;
  if (!s || !s.active) return;
  const byId = new Map((state.players || []).map((p) => [p.id, p]));
  const ids = [...new Set(s.slots.filter((x) => x != null))];
  s.gains = {};
  if (!s.rewarded) {
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || p.retired) continue;
      const cur = p.ratingExact == null ? p.rating : p.ratingExact;
      if (held && held[id]) continue; // at his potential: the game's training rule
      const n = s.slots.filter((x) => x === id).length;
      // boost: the club headquarters' training multiplier, at 35% strength for the Academy; the game's new cap: no further than potential + 1
      const cap = Math.min(99, p.potential ? p.potential + 1 : 99);
      const next = Math.max(40, Math.min(99, Math.max(cur, Math.min(cap, cur + gainFor(s.days, n, cur) * (boost || 1)))));
      s.gains[id] = Math.round((next - cur) * 100) / 100;
      p.ratingExact = next; p.rating = Math.max(40, Math.min(99, Math.floor(next)));
    }
    s.rewarded = true;
  }
  for (const id of ids) { const p = byId.get(id); if (p && p.absence && p.absence.academy) p.absence = null; }
  s.active = false;
  if (Array.isArray(state.inbox)) {
    state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'news', link: 'squad', title: 'Academy session finished',
      body: 'Your players are back from the Academy after ' + s.days + ' days.' });
  }
}

// Called after every advance/season roll and safe to call any number of times (also after loading a save).
function tick(state, held, boost) {
  const s = ensure(state).session;
  if (!s || !s.active) return;
  if (state.currentDate >= s.end) finish(state, held, boost); else setAway(state);
}

function wrap(engine, log) {
  const safe = (what, fn) => { try { fn(); } catch (e) { log('academy: ' + what + ' failed: ' + e.stack); } };
  const lateBoost = (state) => { try { return engine.uxLate && engine.uxLate.effects ? engine.uxLate.effects.academyBoost(state) : 1; } catch (e) { return 1; } }; // late game: Academy Campus
  const facBoost = (state) => { try { return (typeof engine.facilityTrainMult === 'function' ? 1 + (engine.facilityTrainMult(state) - 1) * 0.35 : 1) * lateBoost(state); } catch (e) { return 1; } };
  const held = (state) => { try { return typeof engine.trainingHeld === 'function' ? engine.trainingHeld(state) : null; } catch (e) { return null; } };
  const adv = engine.advance;
  if (typeof adv === 'function') {
    engine.advance = function advanceWithAcademy(state) {
      const r = adv.apply(this, arguments);
      safe('scan', () => scan(state));
      safe('session', () => tick(state, held(state), facBoost(state)));
      return r;
    };
  }
  const nxt = engine.startNextSeason;
  if (typeof nxt === 'function') {
    engine.startNextSeason = function startNextSeasonWithAcademy(state) {
      safe('scan before roll', () => scan(state)); // the roll clears this season's events
      const prev = state.season;
      const r = nxt.apply(this, arguments);
      if (state.season !== prev) safe('season roll', () => { scan(state); seasonRoll(state); });
      safe('session', () => tick(state, held(state), facBoost(state)));
      return r;
    };
  }
  const sts = engine.setTrainingSlot; // the renderer reaches us through the game's own set-training IPC (it also saves the career)
  if (typeof sts === 'function') {
    engine.setTrainingSlot = function setTrainingSlotWithAcademy(state, index, arg) {
      if (index === 'academy-buy') return buy(state);
      if (index === 'academy-start') return startSession(state, arg);
      if (arg != null && inAcademy(state, arg)) return { ok: false, error: 'He is away at the Academy.' };
      return sts.apply(this, arguments);
    };
  }
  const rt = engine.runTraining; // old saves / races: nobody away at the Academy trains
  if (typeof rt === 'function') {
    engine.runTraining = function runTrainingWithAcademy(state) {
      if (state && state.training && Array.isArray(state.training.slots)) for (const sl of state.training.slots) if (sl && sl.pid != null && inAcademy(state, sl.pid)) sl.pid = null;
      return rt.apply(this, arguments);
    };
  }
  engine.academyStatus = (state) => ({ status: status(state), price: price(state), season: state.season, from: ensure(state).from, until: ensure(state).until });
  engine.academyBuy = (state) => buy(state);
}

module.exports = { inAcademy, tick, finish, gainFor, SECTIONS, MIN_DAYS, MAX_DAYS, addDays, missed, startSession, ensure, scan, status, price, buy, seasonRoll, eligible, wrap, FIRST_RUN, AGAIN_RUN };
