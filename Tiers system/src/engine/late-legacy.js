'use strict';
// Late game phase 4 (LateGamePlan.md section 7): Legacy. Written down by the mod because the game keeps no club history:
//  - Hall of Fame: a player who played at least 2 seasons for the club and has retired is inducted when his score is high enough.
//  - Club records: best single season per statistic, win streak, biggest series win.
//  - Rival history: all-time head-to-head per opponent from every official series the user's club plays (scrims are not counted).
//  - Trophy Hall and Museum: monthly ticket income and a few followers.
// State: late.club(state).legacy = { v, since, players, best, streak, h2h, hof, seasons }. Tracking starts when this version is installed: old saves begin at zero.
// Every number is a placeholder until it has been played (top of the file).
const HOF_MIN_SEASONS = 2;
const HOF_THRESHOLD = { relaxed: 20, standard: 25, ruthless: 32 }; // score needed, by mode
const TITLE_SCORE = { worlds_champion: 8, major_champion: 6, regional_champion: 2 };
const W = { season: 3, mvp: 1, goals: 1 / 40, assists: 1 / 60, peak: 0.8, peakFrom: 85 };
const MUSEUM_TICKETS = 10e3; // monthly income per Museum level (real economy)
const MUSEUM_FANS = 0.001; // monthly follower growth per Museum level
const STATS = ['goals', 'assists', 'mvps', 'saves', 'wins']; // single-season records kept

const keyOf = (t) => t.k + ':' + t.y + ':' + (t.h || '');

function install(engine, opts = {}) {
  const late = engine && engine.uxLate, B = late && late.build;
  if (!B) return null;
  if (late.legacy) return late.legacy;
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late legacy: ' + what + ' failed: ' + e.stack); } };
  const user = (state) => engine.teamById(state, state.userTeamId);
  const econ = (state) => (state.economy === 'real' ? 1 : 35);
  const data = (state) => { const c = late.club(state); return c.legacy || (c.legacy = { v: 1, since: state.currentDate, players: {}, best: {}, streak: { cur: 0, best: 0, to: null }, h2h: {}, hof: [], seasons: [] }); };

  // ---- rival history + streak: every official series of the user's club, counted once (fixture.lg = 1) ----
  function scan(state) {
    const d = data(state), me = state.userTeamId;
    // a player is first seen the day he is on the club's roster: his titles at that moment are the ones he brought with him (not counted)
    for (const id of (user(state) || {}).playerIds || []) { const p = engine.playerById(state, id); if (p && !d.players[p.id]) trackPlayer(state, d, p); }
    for (const f of state.fixtures || []) {
      if (!f.played || f.lg || f.scrimId || f.compact || (f.homeId !== me && f.awayId !== me)) continue;
      f.lg = 1;
      const opp = f.homeId === me ? f.awayId : f.homeId, w = f.homeId === me ? f.homeWins : f.awayWins, l = f.homeId === me ? f.awayWins : f.homeWins;
      if (!(w + l)) continue;
      const h = d.h2h[opp] || (d.h2h[opp] = { sw: 0, sl: 0, gw: 0, gl: 0, last: null, best: null, first: f.date });
      const win = w > l; if (win) h.sw++; else h.sl++; h.gw += w; h.gl += l;
      h.last = { date: f.date, w, l, win };
      if (win && (!h.best || (w - l) > (h.best.w - h.best.l))) h.best = { date: f.date, w, l };
      if (win) { d.streak.cur++; if (d.streak.cur > d.streak.best) { d.streak.best = d.streak.cur; d.streak.to = f.date; } } else d.streak.cur = 0;
    }
  }

  // ---- season close (just before the game rolls the season over) ----
  function trackPlayer(state, d, p) {
    const e = d.players[p.id] || (d.players[p.id] = { id: p.id, name: p.name, first: state.season, last: state.season, seasons: 0, goals: 0, assists: 0, mvps: 0, saves: 0, wins: 0, peak: 0, base: (p.titles || []).map(keyOf), titles: [] });
    return e;
  }
  function closeSeason(state) {
    const d = data(state), t = user(state); if (!t) return;
    scan(state);
    for (const id of t.playerIds || []) {
      const p = engine.playerById(state, id); if (!p) continue;
      const e = trackPlayer(state, d, p), s = p.season || {};
      e.name = p.name; e.last = state.season; e.seasons++; e.peak = Math.max(e.peak, p.rating || 0);
      for (const k of STATS) e[k] += s[k] || 0;
      for (const ti of p.titles || []) { if (!e.base.includes(keyOf(ti)) && !e.titles.some((x) => keyOf(x) === keyOf(ti)) && TITLE_SCORE[ti.k]) e.titles.push({ k: ti.k, y: ti.y, h: ti.h || null }); }
      for (const k of STATS) { const v = s[k] || 0; if (v > 0 && (!d.best[k] || v > d.best[k].v)) d.best[k] = { v, id: p.id, name: p.name, season: state.season }; }
    }
    d.seasons.push({ season: state.season, wins: late.ensure(state).wins ? { major: late.ensure(state).wins.major, open: late.ensure(state).wins.open } : null });
  }
  const score = (e) => W.season * e.seasons + e.titles.reduce((a, t) => a + (TITLE_SCORE[t.k] || 0), 0) + W.mvp * e.mvps + W.goals * e.goals + W.assists * e.assists + W.peak * Math.max(0, e.peak - W.peakFrom);
  const threshold = (state) => HOF_THRESHOLD[late.mode(state)] || HOF_THRESHOLD.standard;
  // after the rollover: retired players who played for the club are judged once
  function judge(state) {
    const d = data(state);
    for (const e of Object.values(d.players)) {
      if (e.judged) continue;
      const p = engine.playerById(state, e.id); if (!p || !p.retired) continue;
      e.judged = true;
      const sc = Math.round(score(e) * 10) / 10;
      if (e.seasons >= HOF_MIN_SEASONS && sc >= threshold(state)) {
        d.hof.push({ id: e.id, name: e.name, season: state.season, score: sc, seasons: e.seasons, titles: e.titles.length, mvps: e.mvps, goals: e.goals, peak: e.peak });
        late.note(state, e.name + ' enters the Hall of Fame', e.name + ' retired after ' + e.seasons + ' seasons with the club (' + e.titles.length + ' titles, ' + e.mvps + ' MVPs, peak rating ' + e.peak + '). A plaque goes up in the Trophy Hall.');
      }
    }
  }

  // ---- Trophy Hall and Museum: ticket income, a few followers ----
  function monthly(state) {
    const lv = B.effect(state, 'museum'); if (!(lv > 0)) return;
    late.earn(state, lv * MUSEUM_TICKETS * econ(state), 'Museum tickets');
    const t = user(state); if (t) t.followers = Math.round((t.followers || 0) * (1 + MUSEUM_FANS * lv));
  }

  const sn = engine.startNextSeason;
  engine.startNextSeason = function startNextSeasonWithLegacy(state) {
    if (late.active(state)) safe('close season', () => closeSeason(state));
    const r = sn.apply(this, arguments);
    if (late.active(state)) safe('judge', () => judge(state));
    return r;
  };
  late.onDaily((state) => safe('scan', () => scan(state)));
  late.onMonthly((state) => safe('monthly', () => monthly(state)));
  late.legacy = { data, scan, closeSeason, judge, score, threshold, monthly, HOF_MIN_SEASONS, HOF_THRESHOLD, MUSEUM_TICKETS, MUSEUM_FANS };
  log('late legacy installed');
  return late.legacy;
}

module.exports = { install, HOF_THRESHOLD, MUSEUM_TICKETS, MUSEUM_FANS };
