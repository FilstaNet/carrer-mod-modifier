'use strict';
// Scrims: friendly series against a club of the user's own region (so own tier). State lives in state.uxScrims (created on demand, old saves load unchanged).
//   - Every scrim (3v3, 2v2 and 1v1) gets a real fixture the day before: play it, or simulate it, like any match.
//   - Nothing a scrim does touches season stats, MVP counts, standings or recent results: the fixture is removed after the day and a copy lives in
//     history. Only form, morale, news/inbox and a small rating boost for the players who played are applied (see finalize).
//   - A scrim is cancelled if a tournament lands on its day, or at the end of the season. AI clubs may decline when asked.
// The UI talks to it through placeBet kind 'uxs:<json>' (same channel as the club systems).
const { hash } = require('./ux-persona');
const simcal = require('./ux-simcal');

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mkRand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const poisson = (l, r) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 20); return k - 1; };

const SIZE = { '3v3': 3, '2v2': 2, '1v1': 1 };
const BASE_GOALS = { '3v3': 2.1, '2v2': 2.3, '1v1': 2.5 }; // goals per game for an even match
const BEST_OF = [1, 3, 5, 7], WEEKS = [1, 2, 3];
const MAX_MONTH = 5, MAX_DAY = 2, HORIZON = 60, HISTORY_MAX = 300;
const BOOST = 0.06; // rating points per scrim before scaling (opponent strength, series length); ~0.3 a month at the cap

const ensure = (s) => s.uxScrims || (s.uxScrims = { v: 1, list: [], history: [] });
const monthOf = (d) => d.slice(0, 7);

function install(engine, ev, opts = {}) {
  const log = opts.log || (() => {});
  const club = engine && engine.uxClub;
  if (!engine || engine.__uxScrims || !club || typeof engine.advance !== 'function') return null;
  engine.__uxScrims = true;
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-scrims: ' + what + ' failed: ' + e.stack); return undefined; } };
  const team = (s, id) => engine.teamById(s, id);
  const player = (s, id) => engine.playerById(s, id);
  const user = (s) => team(s, s.userTeamId);
  const note = (s, title, body) => { s.inbox.push({ id: s.nextId++, date: s.currentDate, unread: true, resolved: false, type: 'news', title, link: 'inbox', body }); };
  const fit = (s, t) => (t.playerIds || []).map((id) => player(s, id)).filter((p) => p && !p.retired && !p.absence && p.teamId === t.id);

  // ---------- calendar ----------
  const eventIntervals = (s) => club.busy(s).iv;
  const otherUserDays = (s) => new Set((s.fixtures || []).filter((f) => !f.played && !f.scrimId && (f.homeId === s.userTeamId || f.awayId === s.userTeamId)).map((f) => f.date));
  const active = (u) => u.list.filter((x) => x.status === 'scheduled' || x.status === 'done');
  const dayCount = (u, d) => active(u).filter((x) => x.date === d).length;
  const monthCount = (u, d) => active(u).filter((x) => monthOf(x.date) === monthOf(d)).length;
  // a scrim keeps 1 free day from official and hosted events (so it never sits right next to a tournament)
  const blocked = (s, d, iv, mine) => mine.has(d) || iv.some(([a, b]) => d >= addDays(a, -1) && d <= addDays(b, 1));

  // ---------- lineups and strength ----------
  function sides(s, sc) {
    const me = user(s), opp = team(s, sc.oppId), n = SIZE[sc.fmt];
    let mine, theirs;
    if (n === 3) { mine = engine.userLineup(s).slice(0, 3); theirs = engine.autoLineup(s, opp).slice(0, 3); } else {
      mine = club.fmtLineup(s, sc.fmt);
      theirs = fit(s, opp).sort((a, b) => club.soloScore(b) - club.soloScore(a) || a.id - b.id).slice(0, n).map((p) => p.id);
    }
    return { me, opp, mine, theirs };
  }
  const strength = (s, ids, n) => { const ps = ids.map((id) => player(s, id)).filter(Boolean); return ps.length ? ps.reduce((x, p) => x + engine.matchRating(p) + (n < 3 ? club.mech(p) : 0), 0) / ps.length - (3 - ps.length) * 8 : 50; };
  const topAvg = (s, t) => { const r = fit(s, t).map((p) => p.rating).sort((a, b) => b - a).slice(0, 3); return r.length ? r.reduce((x, y) => x + y, 0) / r.length : 50; };

  // ---------- simulation (own model: no side effects on the world) ----------
  function sideGame(s, r, ids, goals) {
    const ps = ids.map((id) => player(s, id)), w = ps.map((p) => Math.max(1, (p.rating || 60) - 50));
    const pickW = (excl) => { let tot = 0; ps.forEach((p, i) => { if (p.id !== excl) tot += w[i]; }); let x = r() * tot; for (let i = 0; i < ps.length; i++) { if (ps[i].id === excl) continue; x -= w[i]; if (x <= 0) return ps[i].id; } return ps[ps.length - 1].id; };
    const scorers = [], assists = [];
    for (let i = 0; i < goals; i++) { const sc = pickW(-1); scorers.push(sc); assists.push(ps.length > 1 && r() < 0.55 ? pickW(sc) : -1); }
    const lines = ps.map((p) => {
      const g = scorers.filter((x) => x === p.id).length, a = assists.filter((x) => x === p.id).length, sv = poisson(0.9, r), sh = g + poisson(1.5, r);
      const act = (18 + Math.floor(r() * 25)) * 2 + Math.floor(r() * 4) * 20 + Math.floor(r() * 3) * 10;
      return { id: p.id, name: p.name, goals: g, assists: a, saves: sv, shots: sh, points: g * 100 + a * 50 + sv * 50 + Math.max(0, sh - g) * 10 + act, activityPoints: act };
    });
    return { scorers, assists, lines };
  }
  function playGames(s, sc, fx, hIds, aIds) {
    const n = SIZE[sc.fmt], r = mkRand(hash('scrim:' + sc.id + ':' + sc.date)), need = (sc.bo + 1) >> 1;
    const hs = strength(s, hIds, n), as = strength(s, aIds, n);
    const rt = simcal.ratesFor(engine, s, hIds, aIds, n < 3 ? club.mech : null);
    fx.games = fx.games || []; fx.scorerIds = fx.scorerIds || []; fx.assistIds = fx.assistIds || [];
    fx.homeWins = fx.homeWins || 0; fx.awayWins = fx.awayWins || 0; fx.homeGoals = fx.homeGoals || 0; fx.awayGoals = fx.awayGoals || 0;
    while (fx.homeWins < need && fx.awayWins < need && fx.games.length < 16) {
      const d = hs - as + (r() + r() - r() - r()) * 5;
      // beta.33 sim model when present (goals from the bots' ratings, the format's total scaled from the 3v3 one); else the old rating-gap rule
      let gh, ga, ot = false;
      if (rt) { const k = BASE_GOALS[sc.fmt] / BASE_GOALS['3v3']; gh = poisson(Math.min(9, rt.home * k), r); ga = poisson(Math.min(9, rt.away * k), r); }
      else { gh = poisson(clamp(BASE_GOALS[sc.fmt] + d * 0.075, 0.35, 6.5), r); ga = poisson(clamp(BASE_GOALS[sc.fmt] - d * 0.075, 0.35, 6.5), r); }
      if (gh === ga) { ot = true; if (r() < (rt ? rt.share : 0.5 + clamp(d * 0.03, -0.35, 0.35))) gh++; else ga++; }
      const H = sideGame(s, r, hIds, gh), A = sideGame(s, r, aIds, ga);
      const sum = (x, k) => x.lines.reduce((t, l) => t + l[k], 0);
      fx.games.push({ homeGoals: gh, awayGoals: ga, overtime: ot, homeShots: sum(H, 'shots'), awayShots: sum(A, 'shots'), homeSaves: sum(H, 'saves'), awaySaves: sum(A, 'saves'),
        homeScorers: H.scorers, awayScorers: A.scorers, homeLines: H.lines, awayLines: A.lines, you: null });
      fx.scorerIds.push(...H.scorers, ...A.scorers); fx.assistIds.push(...H.assists, ...A.assists);
      fx.homeGoals += gh; fx.awayGoals += ga; if (ot) fx.overtime = true;
      if (gh > ga) fx.homeWins++; else fx.awayWins++;
    }
    const homeWon = fx.homeWins > fx.awayWins, tot = new Map();
    for (const g of fx.games) for (const l of (homeWon ? g.homeLines : g.awayLines)) tot.set(l.id, (tot.get(l.id) || 0) + l.points);
    fx.mvpId = [...tot.entries()].sort((a, b) => b[1] - a[1])[0][0];
    fx.played = true;
  }
  const blank = (s, sc, me, opp) => ({ id: s.nextId++, eventId: sc.id, scrimId: sc.id, stage: 'scrim', fmt: sc.fmt, round: 0, homeId: me.id, awayId: opp.id, date: sc.date, played: false, overtime: false, userPlayed: false,
    bestOf: sc.bo, games: [], homeWins: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorerIds: [], assistIds: [], mvpId: -1 });

  // ---------- result ----------
  function gainFor(s, sc, mineIds, theirIds) {
    const diff = strength(s, theirIds, 3) - strength(s, mineIds, 3);
    return BOOST * clamp(1 + diff / 12, 0.5, 1.6) * (0.75 + 0.05 * sc.bo);
  }
  function finalize(s, sc, fx) {
    if (sc.status === 'done') return;
    const { me, opp } = { me: user(s), opp: team(s, sc.oppId) };
    const won = fx.homeWins > fx.awayWins, lines = (fx.games || []).flatMap((g) => g.homeLines || []);
    let mine = [...new Set(lines.map((l) => l.id))].filter((id) => { const p = player(s, id); return p && p.teamId === me.id; });
    const theirs = [...new Set((fx.games || []).flatMap((g) => (g.awayLines || []).map((l) => l.id)))];
    if (!mine.length) mine = sc.fmt === '3v3' ? engine.userLineup(s).slice(0, 3) : club.fmtLineup(s, sc.fmt);
    const gain = gainFor(s, sc, mine, theirs), moved = [];
    for (const id of mine) {
      const p = player(s, id); if (!p || p.retired) continue;
      p.form = clamp((p.form || 0) + (won ? 1 : -1), -5, 5);
      p.morale = clamp(Math.round(((p.morale == null ? 70 : p.morale) + (won ? 1 : -0.3)) * 10) / 10, 0, 100);
      const cap = typeof p.potential === 'number' ? p.potential : 99;
      if (p.isUser || p.rating >= cap) continue; // the user's own player keeps the game's rules; nobody trains past potential
      const base = p.ratingExact != null ? p.ratingExact : p.rating, next = Math.min(cap, base + gain);
      p.ratingExact = Math.round(next * 1000) / 1000; const was = p.rating; p.rating = Math.floor(p.ratingExact + 1e-9);
      moved.push(p.name + (p.rating > was ? ' (+1 rating)' : ''));
    }
    const a = fx.homeWins, b = fx.awayWins, score = a + '–' + b;
    sc.status = 'done'; sc.result = { a, b, won }; sc.fxId = fx.id;
    const u = ensure(s);
    u.history.push({ id: sc.id, date: sc.date, oppId: sc.oppId, oppName: opp ? opp.name : '?', fmt: sc.fmt, bo: sc.bo, a, b, won, mine, theirs,
      fx: JSON.parse(JSON.stringify({ id: fx.id, homeId: fx.homeId, awayId: fx.awayId, date: fx.date || sc.date, bestOf: sc.bo, games: fx.games, homeWins: fx.homeWins, awayWins: fx.awayWins, homeGoals: fx.homeGoals, awayGoals: fx.awayGoals, scorerIds: fx.scorerIds, assistIds: fx.assistIds, mvpId: fx.mvpId, overtime: !!fx.overtime, played: true })) });
    if (u.history.length > HISTORY_MAX) u.history.splice(0, u.history.length - HISTORY_MAX);
    const head = won ? me.name + ' beat ' + opp.name + ' ' + score + ' in a scrim' : opp.name + ' beat ' + me.name + ' ' + score + ' in a scrim';
    note(s, 'Scrim: ' + (won ? 'win' : 'loss') + ' ' + score + ' vs ' + opp.name, sc.fmt + ', best of ' + sc.bo + '. ' + (won ? 'A good session.' : 'Back to the drawing board.') + (moved.length ? '\nWorked on by: ' + moved.join(', ') + '.' : ''));
    if (typeof engine.pushNews === 'function') safe('news', () => engine.pushNews(s, mkRand(hash('scrimnews:' + sc.id)), { category: 'club', headline: head, body: sc.fmt + ' scrim, best of ' + sc.bo + ', ' + score + '.' }));
  }

  // ---------- fixtures ----------
  const fixtureOf = (s, sc) => (sc.fxId != null ? (s.fixtures || []).find((f) => f.id === sc.fxId) : null);
  function makeFixture(s, sc) {
    const { me, opp } = sides(s, sc), fx = blank(s, sc, me, opp);
    s.fixtures.push(fx); sc.fxId = fx.id; return fx;
  }
  function drop(s, sc) { const i = (s.fixtures || []).findIndex((f) => f.scrimId === sc.id); if (i >= 0) s.fixtures.splice(i, 1); }
  function simulate(s, sc, fx) {
    const { me, opp, mine, theirs } = sides(s, sc);
    fx = fx || blank(s, sc, me, opp);
    if (!mine.length || !theirs.length) { sc.status = 'cancelled'; note(s, 'Scrim called off', 'Not enough fit players for the ' + sc.fmt + ' scrim vs ' + (opp ? opp.name : '?') + '.'); return; }
    playGames(s, sc, fx, mine, theirs); finalize(s, sc, fx);
  }

  // ---------- booking ----------
  function book(s, a) {
    const u = ensure(s), me = user(s), opp = team(s, Number(a.oppId));
    if (!me || !opp || opp.id === me.id || opp.nation || opp.region !== me.region) return { ok: false, error: 'Pick a club from your own region.' };
    if (!SIZE[a.fmt]) return { ok: false, error: 'Pick 3v3, 2v2 or 1v1.' };
    if (!BEST_OF.includes(Number(a.bo))) return { ok: false, error: 'Pick BO1, BO3, BO5 or BO7.' };
    if (!WEEKS.includes(Number(a.weeks))) return { ok: false, error: 'Pick 1, 2 or 3 weeks.' };
    const n = SIZE[a.fmt];
    if ((n === 3 ? fit(s, me).length : club.fmtLineup(s, a.fmt).length) < n) return { ok: false, error: 'You do not have enough fit players for a ' + a.fmt + '.' };
    const iv = eventIntervals(s), mine = otherUserDays(s), asked = addDays(s.currentDate, 7 * Number(a.weeks));
    let d = asked, i = 0;
    while (i++ < HORIZON && (blocked(s, d, iv, mine) || dayCount(u, d) >= MAX_DAY)) d = addDays(d, 1);
    if (i > HORIZON) return { ok: false, error: 'No free day found.' };
    if (monthCount(u, d) >= MAX_MONTH) return { ok: false, error: 'You already have ' + MAX_MONTH + ' scrims in ' + monthOf(d) + '.' };
    const gap = topAvg(s, opp) - topAvg(s, me), p = clamp(0.08 + gap * 0.025, 0.04, 0.55);
    if ((hash('scrimreq:' + s.currentDate + ':' + opp.id + ':' + a.fmt + ':' + a.bo + ':' + d) % 1000) / 1000 < p) {
      note(s, opp.name + ' declined your scrim', 'They are not up for a ' + a.fmt + ' scrim on ' + d + '. Try another club, another day or a different format.');
      return { ok: false, declined: true, error: opp.name + ' declined the scrim.' };
    }
    const sc = { id: s.nextId++, date: d, oppId: opp.id, fmt: a.fmt, bo: Number(a.bo), status: 'scheduled', booked: s.currentDate, fxId: null };
    u.list.push(sc);
    return { ok: true, scrim: sc, shifted: d !== asked };
  }
  function cancel(s, id, why) {
    const u = ensure(s), sc = u.list.find((x) => x.id === id);
    if (!sc || sc.status !== 'scheduled') return { ok: false, error: 'That scrim cannot be cancelled.' };
    const fx = fixtureOf(s, sc);
    if (!why && ((fx && ((fx.games || []).length || fx.played)) || sc.date <= s.currentDate)) return { ok: false, error: 'Too late to cancel.' };
    drop(s, sc); sc.status = 'cancelled'; return { ok: true };
  }

  // ---------- daily tick ----------
  function tick(s) {
    if (!s || !s.teams || !s.fixtures || !s.inbox) return;
    const u = ensure(s), iv = eventIntervals(s), cur = s.currentDate;
    for (const sc of u.list.filter((x) => x.status === 'scheduled')) {
      const opp = team(s, sc.oppId), fx = fixtureOf(s, sc);
      if (fx && fx.played) { safe('finalize', () => finalize(s, sc, fx)); continue; }
      if (!opp || sc.date > cur && iv.some(([a, b]) => sc.date >= a && sc.date <= b)) { drop(s, sc); sc.status = 'cancelled'; note(s, 'Scrim cancelled', (opp ? opp.name : 'The opponent') + ' scrim on ' + sc.date + ' clashes with a tournament.'); continue; }
      // every format gets a real fixture the day before: play it or simulate it
      if (!fx && sc.date <= addDays(cur, 1) && sc.date >= cur) safe('fixture', () => makeFixture(s, sc));
      else if (sc.date < cur) safe('overdue', () => simulate(s, sc, fx || null)); // the day passed without the user playing it
    }
    // fixtures of finished / cancelled scrims leave the game's list; the history keeps the full copy
    const keep = addDays(cur, -2); s.fixtures = s.fixtures.filter((f) => !f.scrimId || (f.played && f.date >= keep) || (u.list.find((x) => x.id === f.scrimId) || {}).status === 'scheduled'); // a played one stays 2 days: the result screen reads it
  }

  // ---------- action channel ----------
  function rpc(s, json) {
    let a; try { a = JSON.parse(json); } catch (e) { return { ok: false, error: 'Bad request.' }; }
    switch (a.a) {
      case 'book': return book(s, a);
      case 'cancel': return cancel(s, Number(a.id));
      default: return { ok: false, error: 'Unknown action.' };
    }
  }

  // ---------- hooks ----------
  const advance = engine.advance;
  engine.advance = function advanceWithScrims(s, rand, mode) {
    // The game's own "advance to next match" skips many days in one call, past a scrim whose fixture only appears the day before.
    // With a scrim booked, step day by day (as the Tier B wrapper does) so the fixture exists in time and the advance stops on it.
    if (s && s.uxScrims && mode && mode !== 'day' && s.uxScrims.list.some((x) => x.status === 'scheduled')) {
      safe('tick', () => tick(s));
      let r = { stopped: 'day' };
      for (let i = 0; i < 200 && r.stopped === 'day'; i++) { r = advance.call(this, s, rand, 'day'); safe('tick', () => tick(s)); }
      return r;
    }
    const r = advance.apply(this, arguments); if (s) safe('tick', () => tick(s)); return r;
  };
  const sim = engine.simulateFixture;
  if (typeof sim === 'function') {
    engine.simulateFixture = function simulateFixtureWithScrims(s, fx) {
      if (fx && fx.showId != null && !fx.played && fx.sq) { // a showdown series simulated with the scrim model, then the bracket moves on
        safe('simulate showdown', () => { playGames(s, { fmt: fx.fmt, bo: fx.bestOf, id: fx.id, date: fx.date }, fx, fx.sq.mine, fx.sq.opp); club.showDone(s, fx); });
        return;
      }
      if (!fx || fx.scrimId == null || fx.played) return sim.apply(this, arguments);
      const sc = ensure(s).list.find((x) => x.id === fx.scrimId); if (!sc) return sim.apply(this, arguments);
      safe('simulate', () => simulate(s, sc, fx));
    };
  }
  // beta.33's game-by-game sim calls the game's own lineup/sim code, which does not know our small squads or scrim model:
  // scrims and showdowns are simulated as a whole series instead, and the last game is handed back like the game does.
  const simNext = engine.simulateNextGame;
  if (typeof simNext === 'function') {
    engine.simulateNextGame = function simulateNextGameWithScrims(s, fx) {
      if (fx && !fx.played && (fx.scrimId != null || (fx.showId != null && fx.sq))) {
        engine.simulateFixture.apply(this, arguments);
        return (fx.games || [])[(fx.games || []).length - 1] || null;
      }
      return simNext.apply(this, arguments);
    };
  }
  // A scrim played for real goes through the game's own result code, which would book season stats, MVPs, bench morale and so on.
  // Everything on both squads is put back afterwards; finalize then applies only the scrim effects.
  // The launcher builds the match cars from engine.sideLineup / lineupFor: a 2v2 / 1v1 scrim fixture hands it the smaller squads.
  // Club showdown fixtures (1v1 / 2v2, and the user's duel of a crew battle) carry their exact squads in fx.sq and use the same machinery.
  const smallFmt = (fx) => (fx && fx.scrimId != null && SIZE[fx.fmt] < 3 ? fx.fmt : null);
  const squadFor = (s, t, fx) => {
    if (!t || !fx) return null;
    if (fx.showId != null && fx.sq) return t.id === s.userTeamId ? fx.sq.mine : fx.sq.opp;
    const f = smallFmt(fx); if (!f) return null;
    return t.id === s.userTeamId ? club.fmtLineup(s, f) : fit(s, t).sort((a, b) => club.soloScore(b) - club.soloScore(a) || a.id - b.id).slice(0, SIZE[f]).map((p) => p.id);
  };
  const sideLineup = engine.sideLineup, lineupFor = engine.lineupFor;
  if (typeof sideLineup === 'function') engine.sideLineup = function sideLineupWithScrims(s, fx) { return squadFor(s, user(s), fx) || sideLineup.apply(this, arguments); };
  if (typeof lineupFor === 'function') engine.lineupFor = function lineupForWithScrims(s, t, fx) { return squadFor(s, t, fx) || lineupFor.apply(this, arguments); };
  const apply = engine.applyUserResult;
  if (typeof apply === 'function') {
    engine.applyUserResult = function applyUserResultWithScrims(s, fx) {
      if (!fx || (fx.scrimId == null && fx.showId == null) || fx.played) return apply.apply(this, arguments);
      const sc = fx.scrimId != null ? ensure(s).list.find((x) => x.id === fx.scrimId) : null; if (fx.scrimId != null && !sc) return apply.apply(this, arguments);
      const ids = new Set([...(team(s, fx.homeId).playerIds || []), ...(team(s, fx.awayId).playerIds || [])]);
      const keep = s.players.filter((p) => ids.has(p.id)).map((p) => [p, JSON.parse(JSON.stringify(p))]);
      // The game's result code picks its own 3-man lineups internally (not reachable from outside), which would list three players per side on the
      // full-time sheet and match the bots' scoreboard against the wrong people. For a 2v2 / 1v1 everyone outside the two squads is made
      // unavailable for the duration of the call, so it sees the same small squads the match was played with (restored below with the rest).
      if (squadFor(s, user(s), fx)) {
        const squad = new Set([...engine.sideLineup(s, fx), ...engine.lineupFor(s, team(s, fx.homeId === s.userTeamId ? fx.awayId : fx.homeId), fx)]);
        for (const [p] of keep) if (!squad.has(p.id)) p.absence = { until: '9999-12-31', reason: 'not in this match' };
      }
      let r;
      try { r = apply.apply(this, arguments); } finally { for (const [p, c] of keep) { for (const k of Object.keys(p)) delete p[k]; Object.assign(p, c); } }
      if (fx.played) safe('finalize', () => (sc ? finalize(s, sc, fx) : club.showDone(s, fx)));
      return r;
    };
  }
  // The game's standings table counts every played fixture, and a played scrim / showdown fixture stays in the list until the next daily tick
  // (the full-time screen needs it). Hide those fixtures from the table so a friendly never gives points, games played or a ranking place.
  const table = engine.computeTable;
  if (typeof table === 'function') {
    engine.computeTable = function computeTableWithoutFriendlies(s) {
      const all = s && s.fixtures;
      if (!Array.isArray(all) || !all.some((f) => f.scrimId != null || f.showId != null)) return table.apply(this, arguments);
      s.fixtures = all.filter((f) => f.scrimId == null && f.showId == null);
      try { return table.apply(this, arguments); } finally { s.fixtures = all; }
    };
  }
  const next = engine.startNextSeason;
  if (typeof next === 'function') {
    engine.startNextSeason = function startNextSeasonWithScrims(s) {
      safe('cancel at rollover', () => { for (const sc of ensure(s).list.filter((x) => x.status === 'scheduled')) { drop(s, sc); sc.status = 'cancelled'; } });
      return next.apply(this, arguments);
    };
  }
  const placeBet = engine.placeBet;
  engine.placeBet = function placeBetOrScrims(s, kind) {
    if (typeof kind === 'string' && kind.indexOf('uxs:') === 0) return safe('rpc', () => rpc(s, kind.slice(4))) || { ok: false, error: 'That could not be done.' };
    return placeBet.apply(this, arguments);
  };
  const gen = engine.generateLeague;
  engine.generateLeague = function generateLeagueWithScrims() { const st = gen.apply(this, arguments); safe('init', () => ensure(st)); return st; };
  engine.uxScrims = { ensure, book, cancel, tick, rpc, simulate, finalize };
  log('ux-scrims installed');
  return engine.uxScrims;
}

module.exports = { install, ensure };
