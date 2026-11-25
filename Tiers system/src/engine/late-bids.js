'use strict';
// Late game phase 3, part B (LateGamePlan.md 6.0): bid to HOST official events. Unlocked by an Arena at level 3.
// Targets: Kick-Off Weekend and the Esports World Cup (mod-made, really renamed to your arena) and the game's two Majors (label + income only: the game's
// own event, format and results are not touched). A bid window opens 60 days before the event and closes 30 days before; at closing the bids are scored
// (followers, trophies won, Arena level, the size of your bid vs 4 rival organisations with a deterministic dash of luck). Winning charges the bid as
// production fee, pays gate and sponsor income when the event is over and adds followers. One hosted official event per season.
// Every number is a placeholder until the balance run. State: state.late.bids = { v, seq, list: [...], won: { season: key } }.
const MIN_ARENA = 3;
const OPEN_DAYS = 60, CLOSE_DAYS = 30; // the window is open while the event is between OPEN_DAYS and CLOSE_DAYS days away
const VALUE = { kickoff: 500e3, ewc: 1.5e6, major: 1e6 }; // gross income (gate + sponsors) of hosting at average luck, real economy
const BID_MIN = 0.3, BID_MAX = 0.85; // the bid (production fee) as a share of that value: a Major $300K to $850K
const GATE_SHARE = 0.6; // of the income, the rest is sponsors
const LUCK = [0.8, 1.2]; // attendance luck on the income, decided by a hash of the event
const FOLLOW_GAIN = 0.04; // followers gained when the hosted event is over
const RIVALS = 4;
const W = { followers: 35, trophies: 15, arena: 20, bid: 30 }; // weights of the score (max 100)

const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const unit = (str) => (hash(str) % 10000) / 10000; // 0..1, deterministic

function install(engine, opts = {}) {
  const late = engine && engine.uxLate, B = late && late.build;
  if (!B || !late.host) return null;
  if (late.bids) return late.bids;
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late bids: ' + what + ' failed: ' + e.stack); } };
  const user = (state) => engine.teamById(state, state.userTeamId);
  const data = (state) => { const u = late.ensure(state); return u.bids || (u.bids = { v: 1, seq: 0, list: [], won: {} }); };
  const econ = (state) => (state.economy === 'real' ? 1 : 35);
  const fmt = (n) => (engine.fmtMoney ? engine.fmtMoney(n) : '$' + Math.round(n));
  const arenaOk = (state) => B.level(state, 'arena') >= MIN_ARENA;

  // every event that can be hosted, done ones included (so a won bid finds its event again after it ended)
  const all = (state) => [
    ...(state.events || []).filter((e) => e.kind === 'major' && e.startDate).map((e) => ({ key: 'g' + e.id, kind: 'major', name: e.name, start: e.startDate, end: e.endDate, done: e.stage === 'done', ref: e, mod: false })),
    ...((state.uxMajors && state.uxMajors.events) || []).filter((e) => !e.skipped && (e.kind === 'kickoff' || e.kind === 'ewc') && e.startDate).map((e) => ({ key: 'x' + e.id, kind: e.kind, name: e.name, start: e.startDate, end: e.endDate, done: e.stage === 'done', ref: e, mod: true })),
  ];
  const find = (state, key) => all(state).find((t) => t.key === key) || null;
  const value = (state, kind) => Math.round(VALUE[kind] * econ(state));
  const range = (state, kind) => ({ min: Math.round(value(state, kind) * BID_MIN / 1000) * 1000, max: Math.round(value(state, kind) * BID_MAX / 1000) * 1000 });

  // ---- scoring ----
  const tierA = (state) => state.teams.filter((t) => t.id !== state.userTeamId && !t.nation && t.region && !/_b$/.test(t.region) && t.tier !== 'B');
  const refFollowers = (state) => Math.max(1, ...state.teams.filter((t) => !t.nation && t.region && !/_b$/.test(t.region)).map((t) => t.followers || 0));
  const rivals = (state) => tierA(state).sort((a, b) => (b.followers || 0) - (a.followers || 0) || a.id - b.id).slice(0, RIVALS);
  const trophies = (state) => { const w = (state.late && state.late.wins) || { major: 0, open: 0 }; return Math.min(1, (w.major * 3 + w.open) / 12); };
  const userScore = (state, bidNorm) => W.followers * Math.min(1, (user(state).followers || 0) / refFollowers(state)) + W.trophies * trophies(state) + W.arena * Math.min(1, B.level(state, 'arena') / MIN_ARENA) + W.bid * bidNorm;
  const rivalScore = (state, t, key, salt) => W.followers * Math.min(1, (t.followers || 0) / refFollowers(state)) + (W.trophies * unit(['t', state.season, key, t.id, salt].join(':')) + W.arena * unit(['a', state.season, key, t.id, salt].join(':')) + W.bid * unit(['b', state.season, key, t.id, salt].join(':')));
  const bidNorm = (state, kind, amount) => { const r = range(state, kind); return Math.max(0, Math.min(1, (amount - r.min) / Math.max(1, r.max - r.min))); };
  // chance label from 300 other draws (the real result uses one fixed draw)
  function odds(state, kind, key, amount) {
    const mine = userScore(state, bidNorm(state, kind, amount)), rs = rivals(state); let win = 0;
    for (let s = 1; s <= 300; s++) win += rs.every((t) => rivalScore(state, t, key, 'o' + s) < mine) ? 1 : 0;
    return win / 300;
  }
  const label = (p) => (p >= 0.6 ? 'Likely' : p >= 0.3 ? 'Possible' : 'Unlikely');

  const statusOf = (state, t) => {
    const b = data(state).list.find((x) => x.key === t.key);
    if (b) return b.status;
    const d = days(state.currentDate, t.start);
    return t.done || d <= CLOSE_DAYS ? 'closed' : d > OPEN_DAYS ? 'later' : 'open';
  };

  // ---- actions ----
  function bid(state, a) {
    const d = data(state), t = find(state, String(a.key));
    if (!arenaOk(state)) return { ok: false, error: 'Hosting official events needs an Arena at level ' + MIN_ARENA + '.' };
    if (!t) return { ok: false, error: 'That event cannot be hosted.' };
    if (statusOf(state, t) !== 'open') return { ok: false, error: 'The bid window for that event is not open.' };
    if (d.won[state.season]) return { ok: false, error: 'You already host an official event this season.' };
    const r = range(state, t.kind), amount = Math.round(Number(a.amount) || 0);
    if (amount < r.min || amount > r.max) return { ok: false, error: 'Your bid must be between ' + fmt(r.min) + ' and ' + fmt(r.max) + '.' };
    if ((user(state).budget || 0) < amount) return { ok: false, error: 'You could not pay that fee: ' + fmt(amount) + '.' };
    d.list.push({ id: ++d.seq, key: t.key, kind: t.kind, name: t.name, start: t.start, season: state.season, amount, status: 'placed', placed: state.currentDate });
    return { ok: true };
  }
  function withdraw(state, a) {
    const b = data(state).list.find((x) => x.key === String(a.key) && x.status === 'placed');
    if (!b) return { ok: false, error: 'There is no open bid on that event.' };
    data(state).list.splice(data(state).list.indexOf(b), 1); return { ok: true };
  }
  // read-only list for the UI
  function view(state) {
    const d = data(state);
    return { ok: false, readOnly: true, arenaOk: arenaOk(state), minArena: MIN_ARENA, hosting: d.won[state.season] || null, win: { open: OPEN_DAYS, close: CLOSE_DAYS },
      targets: all(state).filter((t) => !t.done).sort((a, b) => (a.start < b.start ? -1 : 1)).map((t) => {
        const r = range(state, t.kind), st = statusOf(state, t), mine = d.list.find((x) => x.key === t.key);
        return { key: t.key, kind: t.kind, name: t.name, start: t.start, end: t.end, status: st, mod: t.mod, min: r.min, max: r.max, daysTo: days(state.currentDate, t.start),
          oddsMin: st === 'open' ? label(odds(state, t.kind, t.key, r.min)) : null, oddsMax: st === 'open' ? label(odds(state, t.kind, t.key, r.max)) : null, bid: mine ? mine.amount : null };
      }) };
  }

  // ---- ticks: resolve at the closing day, pay when the hosted event is over ----
  function resolve(state, b, t) {
    const d = data(state), u = user(state);
    if (d.won[state.season]) { b.status = 'lost'; b.why = 'You already host an official event this season.'; return; }
    const mine = userScore(state, bidNorm(state, b.kind, b.amount)), rs = rivals(state).map((r) => ({ t: r, s: rivalScore(state, r, b.key, 'x') })).sort((x, y) => y.s - x.s);
    b.rivals = rs.map((r) => ({ name: r.t.name, score: Math.round(r.s) })); b.score = Math.round(mine);
    if (!rs.length || mine > rs[0].s) {
      const fee = late.spend(state, b.amount, 'Hosting ' + b.name + ': production fee');
      if (!fee.ok) { b.status = 'void'; if (u) u.followers = Math.round((u.followers || 0) * 0.97); late.note(state, 'Your bid for ' + b.name + ' fell through', 'You won, but could not pay the ' + fmt(b.amount) + ' production fee. The organisers withdrew and your followers drop by 3%.'); return; }
      b.status = 'won'; d.won[state.season] = b.key;
      t.ref.hostedBy = state.userTeamId; t.ref.hostName = u.name + ' Arena';
      if (t.mod) t.ref.name = t.ref.name + ' · ' + t.ref.hostName; // Kick-Off / EWC are the mod's own events: really renamed. A game Major keeps its name (titles and records use it).
      late.note(state, 'You will host ' + b.name, 'Your arena won the bid for ' + t.start + '. Production fee ' + fmt(b.amount) + ' paid. Gate and sponsors (about ' + fmt(value(state, b.kind)) + ') are paid when the event is over.');
    } else {
      b.status = 'lost'; late.note(state, 'Bid lost: ' + b.name, rs[0].t.name + ' won the right to host. Your score ' + b.score + ' against ' + Math.round(rs[0].s) + '.');
    }
  }
  function daily(state) {
    const d = data(state);
    for (const b of d.list) {
      const t = find(state, b.key);
      if (b.status === 'placed') {
        if (!t) { b.status = 'void'; continue; }
        if (days(state.currentDate, t.start) <= CLOSE_DAYS) resolve(state, b, t);
      } else if (b.status === 'won' && t && t.done) {
        const luck = LUCK[0] + (LUCK[1] - LUCK[0]) * unit(['l', b.season, b.key].join(':')), gross = Math.round(value(state, b.kind) * luck * (0.6 + 0.4 * B.level(state, 'arena') / MIN_ARENA));
        const gate = Math.round(gross * GATE_SHARE);
        late.earn(state, gate, 'Hosting ' + b.name + ': gate'); late.earn(state, gross - gate, 'Hosting ' + b.name + ': sponsors');
        const u = user(state); u.followers = Math.round((u.followers || 0) * (1 + FOLLOW_GAIN));
        b.status = 'paid'; b.gross = gross;
        late.note(state, b.name + ' is over', 'Hosting paid ' + fmt(gross) + ' (' + fmt(gate) + ' gate, ' + fmt(gross - gate) + ' sponsors) against a ' + fmt(b.amount) + ' fee. Your followers grow by ' + Math.round(FOLLOW_GAIN * 100) + '%.');
      }
    }
  }

  late.action('bid', bid);
  late.action('bid_withdraw', withdraw);
  late.action('official', (state) => view(state));
  late.onDaily((state) => safe('daily', () => daily(state)));
  late.bids = { bid, withdraw, view, daily, odds, range, find, all, MIN_ARENA, OPEN_DAYS, CLOSE_DAYS, VALUE, BID_MIN, BID_MAX };
  log('late bids installed');
  return late.bids;
}

module.exports = { install, MIN_ARENA, VALUE };
