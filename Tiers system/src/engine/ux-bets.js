// Basic / Advanced betting markets on top of the game's own betting system.
//  - cards: the game's bettableAll() match cards get a `markets` list (priced here), via a betBook() wrapper
//  - placing: engine.placeBet(state, 'mk', fixtureId, code, stake) is handled here; every other kind goes to the game untouched
//    (Match winner keeps using the game's own kind 'match', odds and rules)
//  - settling: market bets live in state.uxBets (the game's settleBets would settle them as a winner bet, so they must stay out of state.bets);
//    they are resolved from the real fixture (games, scorers, MVP) after every advance and whenever the book is read
//  - odds: team-power gap exactly like the game's winner odds, goal rates measured from this save's played games, 1.08 book margin
const { hash } = require('./ux-persona');

// Balance: a combo is priced from the JOINT chance of its picks in the same simulation that prices the singles (so "3 games" + "no team
// wins a game" is one question, not two), plus a margin per extra pick; picks under MIN_LEG_ODDS can not be combined; one open bet per match;
// a stake is capped to a share of the budget. Parlays (different matches) multiply independent odds with a small edge per extra leg.
const MARGIN = 1.08, MAX_ODDS = 150, SIMS = 2200, MAX_LEGS = 4, MAX_PARLAY = 4, MAX_COMBO_ODDS = 100, MIN_LEG_ODDS = 1.0, /* 1.0 = no minimum: any pick can be combined */  COMBO_EXTRA = 1.04, PARLAY_EDGE = 0.96, MAX_STAKE_SHARE = 0.25;
const { clash: legClash, CONFLICTS } = require('./ux-bets-rules');
const ledger = require('./ux-bets-ledger');
const simcal = require('./ux-simcal');
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mkRand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const price = (p) => Math.round(Math.min(MAX_ODDS, Math.max(1.04, 1 / (Math.max(1e-6, Math.min(0.999, p)) * MARGIN))) * 100) / 100;
const poisson = (r, l) => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 60); return k - 1; };
const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
const seriesProb = (p, need) => { let s = 0; for (let k = 0; k < need; k++) s += C(need - 1 + k, k) * Math.pow(p, need) * Math.pow(1 - p, k); return s; };
function gameProb(pSeries, need) { let lo = 0.01, hi = 0.99; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (seriesProb(m, need) < pSeries) lo = m; else hi = m; } return (lo + hi) / 2; }

const gamesOf = (f) => (f.games || []).filter((g) => g && typeof g.homeGoals === 'number');
const sum = (a) => a.reduce((x, y) => x + y, 0);

function create(engine, opts = {}) {
  const log = opts.log || (() => {});
  const cache = new Map();

  // measured from this save: mean goals of the losing side, mean winning margin beyond one goal, overtime rate
  function calibrate(state) {
    let n = 0, lose = 0, marg = 0, ot = 0;
    const fx = state.fixtures || [];
    for (let i = fx.length - 1; i >= 0 && n < 900; i--) {
      const f = fx[i]; if (!f.played || f.compact) continue;
      for (const g of gamesOf(f)) { const w = Math.max(g.homeGoals, g.awayGoals), l = Math.min(g.homeGoals, g.awayGoals); lose += l; marg += Math.max(0, w - l - 1); if (g.overtime) ot++; n++; }
    }
    if (n < 40) return { ll: 1.3, lm: 1.6, ot: 0.07 };
    return { ll: Math.max(0.3, lose / n), lm: Math.max(0.3, marg / n), ot: Math.min(0.3, ot / n) };
  }

  function lineup(state, team) {
    let ids = [];
    try { ids = engine.autoLineup(state, team) || []; } catch (e) { ids = []; }
    if (!ids.length) ids = (team.playerIds || []).slice().sort((a, b) => (engine.playerById(state, b).rating - engine.playerById(state, a).rating)).slice(0, 3);
    return ids.slice(0, 3).map((id) => engine.playerById(state, id)).filter(Boolean);
  }
  function shares(players) {
    const w = players.map((p) => ((((p.season && p.season.goals) || 0) + 4) / (((p.season && p.season.games) || 0) + 6)) * Math.pow((p.rating || 60) / 70, 2));
    const t = sum(w) || 1; return w.map((x) => x / t);
  }

  function simulate(rand, N, pg, cal, H, A, sh, sa) {
    const need = (N + 1) >> 1;
    const o = { recs: [], tot: {}, ht: {}, at: {}, score: {}, games: {}, both: 0, ot: 0, shut: 0, firstH: 0, firstN: 0, sweepH: 0, sweepA: 0, winH: 0, anyH: sh.map(() => 0), anyA: sa.map(() => 0) };
    for (let s = 0; s < SIMS; s++) {
      let hw = 0, aw = 0, g = 0, th = 0, ta = 0, g1h = 0, g1a = 0, shut = false, ot = false;
      while (hw < need && aw < need) {
        g++;
        const homeWon = rand() < pg; const lo = poisson(rand, cal.ll); const wi = lo + 1 + poisson(rand, cal.lm);
        const hg = homeWon ? wi : lo, ag = homeWon ? lo : wi;
        if (homeWon) hw++; else aw++;
        th += hg; ta += ag; if (g === 1) { g1h = hg; g1a = ag; }
        if (hg === 0 || ag === 0) shut = true;
        if (rand() < cal.ot) ot = true;
      }
      const t = th + ta;
      o.recs.push([hw, aw, g, th, ta, ot ? 1 : 0, shut ? 1 : 0, g1h, g1a]);
      o.tot[t] = (o.tot[t] || 0) + 1; o.ht[th] = (o.ht[th] || 0) + 1; o.at[ta] = (o.at[ta] || 0) + 1;
      const key = hw + '-' + aw; o.score[key] = (o.score[key] || 0) + 1; o.games[g] = (o.games[g] || 0) + 1;
      if (hw > 0 && aw > 0) o.both++; if (ot) o.ot++; if (shut) o.shut++;
      if (g1h + g1a > 0) { o.firstH += g1h / (g1h + g1a); o.firstN++; }
      if (aw === 0) o.sweepH++; if (hw === 0) o.sweepA++; if (hw > aw) o.winH++;
      sh.forEach((x, i) => { o.anyH[i] += 1 - Math.pow(1 - x, th); });
      sa.forEach((x, i) => { o.anyA[i] += 1 - Math.pow(1 - x, ta); });
    }
    return o;
  }

  // distribution helper: counts -> P(total > line) etc.
  const dist = (counts) => { const ks = Object.keys(counts).map(Number); const n = sum(Object.values(counts)) || 1; return { n, p: (k) => (counts[k] || 0) / n, over: (line) => sum(ks.filter((k) => k > line).map((k) => counts[k])) / n, mean: sum(ks.map((k) => k * counts[k])) / n, ks }; };
  const mainLine = (d) => { let best = null; for (let l = Math.floor(d.mean) - 8 + 0.5; l <= d.mean + 8; l++) { const dd = Math.abs(d.over(l) - 0.5); if (!best || dd < best.dd) best = { l, dd }; } return best.l; };

  // ---- per-sim chance of one pick (used to price combos from the joint chance) ----
  function legProb(r, leg, pl) {
    const [hw, aw, g, th, ta, ot, shut, g1h, g1a] = r, t = th + ta;
    const [kind, arg] = String(leg.pick).split(':'), L = Number(arg), cmp = (v) => (kind === 'o' ? v > L : v < L);
    const fh = g1h + g1a > 0 ? g1h / (g1h + g1a) : 0.5, x = pl[leg.pick];
    switch (leg.market) {
      case 'winner': return (hw > aw) === (leg.pick === 'h') ? 1 : 0;
      case 'tot': case 'alt': return cmp(t) ? 1 : 0;
      case 'hteam': return cmp(th) ? 1 : 0;
      case 'ateam': return cmp(ta) ? 1 : 0;
      case 'games': return g === L ? 1 : 0;
      case 'both': return (hw > 0 && aw > 0) === (leg.pick === 'y') ? 1 : 0;
      case 'ot': return !!ot === (leg.pick === 'y') ? 1 : 0;
      case 'exact': return t === L ? 1 : 0;
      case 'range': { const [lo, hi] = String(arg).split('-').map(Number); return t >= lo && t <= hi ? 1 : 0; }
      case 'score': return hw + '-' + aw === arg ? 1 : 0;
      case 'sweep': return (leg.pick === 'h' ? aw === 0 && hw > 0 : leg.pick === 'a' ? hw === 0 && aw > 0 : !(aw === 0 || hw === 0)) ? 1 : 0;
      case 'shut': return !!shut === (leg.pick === 'y') ? 1 : 0;
      case 'first': return leg.pick === 'h' ? fh : 1 - fh;
      case 'pfirst': return x ? (x.side === 'h' ? fh : 1 - fh) * x.s : 0;
      case 'pany': return x ? 1 - Math.pow(1 - x.s, x.side === 'h' ? th : ta) : 0;
      case 'mvp': { const w = hw > aw ? 0.92 : 0.08; return x ? (x.side === 'h' ? w : 1 - w) * x.s : 0; }
      default: return 0;
    }
  }
  function jointOdds(mk, legs) {
    const sim = mk && mk._sim; if (!sim) return null;
    let acc = 0;
    for (const r of sim.recs) { let p = 1; for (const l of legs) { p *= legProb(r, l, sim.pl); if (!p) break; } acc += p; }
    const p = Math.max(acc / sim.recs.length, 1 / (SIMS * 3));
    return Math.round(Math.min(MAX_COMBO_ODDS, Math.max(1.04, 1 / (p * MARGIN * Math.pow(COMBO_EXTRA, legs.length - 1)))) * 100) / 100;
  }
  const strengths = (state, H, A, N) => {
    try { const g = simcal.gameWin(engine, state, engine.autoLineup(state, H), engine.autoLineup(state, A)), sr = simcal.seriesWin(g, N || 3); if (sr != null) return sr; } catch (e) { /* old formula */ }
    let ph = 60, pa = 60; try { ph = engine.teamStrength(state, engine.autoLineup(state, H)); pa = engine.teamStrength(state, engine.autoLineup(state, A)); } catch (e) { /* default */ }
    return 1 / (1 + Math.pow(10, (pa - ph) / 12));
  };
  const compOf = (state, f) => {
    const tb = state.tierB || {};
    if (f.cupId != null) { const c = (tb.cups || []).find((x) => x.id === f.cupId); return c ? c.name : 'B-Tier Cup'; }
    if (f.xevId != null) { const x = ((state.uxMajors || {}).events || []).find((q) => q.id === f.xevId); if (x && x.swiss) { const o = (state.events || []).find((e) => e.id === x.openId); if (o) return o.name; } return x ? x.name : 'Tournament'; }
    if (f.invId != null) { const iv = ((state.uxClub || {}).inv || []).find((x) => x.id === f.invId); return iv ? iv.name : 'Invitational'; }
    if (f.promoId != null) return 'Promotion group';
    return '';
  };
  const bcache = { key: null, list: [] };
  // Tier B cup and promotion-playoff matches of the next week (the game's board only lists the next Tier A event)
  function bCards(state) {
    const key = state.currentDate + ':' + (state.fixtures || []).length + ':' + state.userTeamId;
    if (bcache.key === key) return bcache.list;
    const lim = addDays(state.currentDate, 7), list = [];
    for (const f of state.fixtures || []) {
      if (f.played || (f.cupId == null && f.promoId == null && f.invId == null && f.xevId == null) || f.homeId == null || f.awayId == null || f.homeId === state.userTeamId || f.awayId === state.userTeamId || f.date > lim) continue;
      const H = engine.teamById(state, f.homeId), A = engine.teamById(state, f.awayId); if (!H || !A) continue;
      const p = strengths(state, H, A, f.bestOf);
      list.push({ kind: 'match', ref: f.id, date: f.date, homeId: f.homeId, awayId: f.awayId, eventName: compOf(state, f), tierB: true, odds: { [f.homeId]: price(p), [f.awayId]: price(1 - p) } });
    }
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref - b.ref));
    bcache.key = key; bcache.list = list.slice(0, 16); return bcache.list;
  }
  const cardFor = (state, ref) => engine.bettableAll(state).find((c) => c.kind === 'match' && c.ref === ref) || bCards(state).find((c) => c.ref === ref) || null;

  function marketsFor(state, card, f) {
    const key = card.ref + ':' + state.currentDate + ':' + (f.bestOf || 3);
    if (cache.has(key)) return cache.get(key);
    const H = engine.teamById(state, f.homeId), A = engine.teamById(state, f.awayId);
    if (!H || !A) return null;
    const N = f.bestOf || 3, need = (N + 1) >> 1;
    const pSeries = strengths(state, H, A, N);
    const pg = gameProb(pSeries, need);
    const cal = calibrate(state);
    const pH = lineup(state, H), pA = lineup(state, A), sH = shares(pH), sA = shares(pA);
    const o = simulate(mkRand(hash('bets:' + f.id)), N, pg, cal, H, A, sH, sA);
    const tot = dist(o.tot), ht = dist(o.ht), at = dist(o.at), gm = dist(o.games);
    const out = []; const add = (group, id, title, options, note) => { const opts2 = options.filter((x) => x.p >= 0.004 && price(x.p) < MAX_ODDS).map((x) => ({ key: x.key, label: x.label, odds: price(x.p), teamId: x.teamId })); if (opts2.length >= 2) out.push({ idx: out.length, group, id, conflicts: CONFLICTS[id] || [], title, note: note || '', options: opts2.map((x, i) => ({ ...x, code: out.length * 100 + i })) }); };
    const ou = (id, group, title, d, line) => add(group, id, title, [{ key: 'o:' + line, label: 'Over ' + line, p: d.over(line) }, { key: 'u:' + line, label: 'Under ' + line, p: 1 - d.over(line) }]);
    // ---- Basic ----
    // winner: the game's own kind 'match' (its odds, its rules)
    out.push({ idx: 0, group: 'basic', id: 'winner', conflicts: CONFLICTS.winner, title: 'Match winner', native: !card.tierB, note: '', options: [{ key: 'h', label: H.name, odds: card.odds[f.homeId], teamId: f.homeId, code: 0 }, { key: 'a', label: A.name, odds: card.odds[f.awayId], teamId: f.awayId, code: 1 }] });
    const L = mainLine(tot);
    ou('tot', 'basic', 'Total goals', tot, L);
    add('basic', 'games', 'Series length (games played)', Object.keys(o.games).map(Number).sort().map((g) => ({ key: 'g:' + g, label: g + ' games', p: gm.p(g) })));
    add('basic', 'both', 'Both teams win a game', [{ key: 'y', label: 'Yes', p: o.both / SIMS }, { key: 'n', label: 'No', p: 1 - o.both / SIMS }]);
    add('basic', 'ot', 'Overtime in the series', [{ key: 'y', label: 'Yes', p: o.ot / SIMS }, { key: 'n', label: 'No', p: 1 - o.ot / SIMS }]);
    // ---- Advanced ----
    add('advanced', 'alt', 'Total goals, other lines', [-2, -1, 1, 2].flatMap((d) => [{ key: 'o:' + (L + d), label: 'Over ' + (L + d), p: tot.over(L + d) }, { key: 'u:' + (L + d), label: 'Under ' + (L + d), p: 1 - tot.over(L + d) }]));
    const hl = mainLine(ht), al = mainLine(at);
    ou('hteam', 'advanced', H.name + ' total goals', ht, hl); ou('ateam', 'advanced', A.name + ' total goals', at, al);
    const m = Math.round(tot.mean);
    add('advanced', 'exact', 'Exact total goals', Array.from({ length: 13 }, (_, i) => m - 6 + i).filter((n) => n >= 0).map((n) => ({ key: 'n:' + n, label: String(n), p: tot.p(n) })));
    const bands = []; for (let lo = m - 7; lo <= m + 5; lo += 4) bands.push([Math.max(0, lo), lo + 3]);
    bands[0][0] = 0; bands[bands.length - 1][1] = 999;
    add('advanced', 'range', 'Total goals range', bands.map(([lo, hi]) => ({ key: 'r:' + lo + '-' + hi, label: lo === 0 ? 'Up to ' + hi : hi === 999 ? lo + ' or more' : lo + ' to ' + hi, p: sum(tot.ks.filter((k) => k >= lo && k <= hi).map((k) => o.tot[k])) / SIMS })));
    add('advanced', 'score', 'Correct series score', Object.keys(o.score).sort((a, b) => o.score[b] - o.score[a]).map((s) => ({ key: 's:' + s, label: s.replace('-', ' - '), p: o.score[s] / SIMS })));
    add('advanced', 'sweep', 'Series sweep (no game dropped)', [{ key: 'h', label: H.name + ' sweep', p: o.sweepH / SIMS }, { key: 'a', label: A.name + ' sweep', p: o.sweepA / SIMS }, { key: 'none', label: 'No sweep', p: 1 - (o.sweepH + o.sweepA) / SIMS }]);
    add('advanced', 'shut', 'A game ends with a side on zero goals', [{ key: 'y', label: 'Yes', p: o.shut / SIMS }, { key: 'n', label: 'No', p: 1 - o.shut / SIMS }]);
    const fh = o.firstN ? o.firstH / o.firstN : 0.5;
    add('advanced', 'first', 'First team to score (game 1)', [{ key: 'h', label: H.name, p: fh }, { key: 'a', label: A.name, p: 1 - fh }]);
    const pl = (arr, sh, side) => arr.map((p, i) => ({ p, i, s: sh[i], side }));
    const all = pl(pH, sH, 'h').concat(pl(pA, sA, 'a'));
    add('advanced', 'pfirst', 'Player to score first (game 1)', all.map((x) => ({ key: 'p:' + x.p.id, label: x.p.name, p: (x.side === 'h' ? fh : 1 - fh) * x.s, teamId: x.p.teamId })), 'No bet if nobody scores in game 1.');
    add('advanced', 'pany', 'Player to score (any game)', all.map((x) => ({ key: 'p:' + x.p.id, label: x.p.name, p: (x.side === 'h' ? o.anyH[x.i] : o.anyA[x.i]) / SIMS, teamId: x.p.teamId })));
    const pw = o.winH / SIMS, wH = 0.92 * pw + 0.08 * (1 - pw), wA = 1 - wH;
    add('advanced', 'mvp', 'MVP of the match', all.map((x) => ({ key: 'p:' + x.p.id, label: x.p.name, p: (x.side === 'h' ? wH : wA) * x.s, teamId: x.p.teamId })));
    const plMap = {}; all.forEach((x) => { plMap['p:' + x.p.id] = { s: x.s, side: x.side }; });
    Object.defineProperty(out, '_sim', { value: { recs: o.recs, pl: plMap }, enumerable: false });
    cache.set(key, out); if (cache.size > 400) cache.delete(cache.keys().next().value);
    return out;
  }

  // ---- resolve one option against the real result: true / false / null (void: stake back) ----
  function resolve(f, marketId, key, bet) {
    const gs = gamesOf(f); if (!f.played) return undefined;
    const hw = f.homeWins || 0, aw = f.awayWins || 0;
    if (!gs.length) { // result known but no per-game detail (compact fixture): only series-level markets can be settled
      const a2 = String(key).split(':')[1];
      switch (marketId) {
        case 'winner': return (hw > aw) === (key === 'h');
        case 'score': return hw + '-' + aw === a2;
        case 'games': return hw + aw === Number(a2);
        case 'both': return (hw > 0 && aw > 0) === (key === 'y');
        case 'sweep': return key === 'h' ? aw === 0 && hw > 0 : key === 'a' ? hw === 0 && aw > 0 : !(aw === 0 || hw === 0);
        default: return null;
      }
    }
    const th = sum(gs.map((g) => g.homeGoals)), ta = sum(gs.map((g) => g.awayGoals)), t = th + ta;
    const [kind, arg] = String(key).split(':');
    const cmp = (v) => (kind === 'o' ? v > Number(arg) : v < Number(arg));
    switch (marketId) {
      case 'winner': return (hw > aw) === (key === 'h');
      case 'tot': case 'alt': return cmp(t);
      case 'hteam': return cmp(th);
      case 'ateam': return cmp(ta);
      case 'games': return gs.length === Number(arg);
      case 'both': return (hw > 0 && aw > 0) === (key === 'y');
      case 'ot': return (gs.some((g) => g.overtime) || !!f.overtime) === (key === 'y');
      case 'exact': return t === Number(arg);
      case 'range': { const [lo, hi] = arg.split('-').map(Number); return t >= lo && t <= hi; }
      case 'score': return hw + '-' + aw === arg;
      case 'sweep': return key === 'h' ? aw === 0 && hw > 0 : key === 'a' ? hw === 0 && aw > 0 : !(aw === 0 || hw === 0);
      case 'shut': return gs.some((g) => g.homeGoals === 0 || g.awayGoals === 0) === (key === 'y');
      case 'first': case 'pfirst': {
        const g1 = gs[0], nh = (g1.homeScorers || []).length, na = (g1.awayScorers || []).length;
        if (nh + na === 0) return null;
        // the sim stores scorers per team, not a timeline: a seeded draw weighted by each side's goals decides who struck first
        const homeFirst = mkRand(hash('first:' + f.id))() < nh / (nh + na);
        if (marketId === 'first') return (key === 'h') === homeFirst;
        const first = (homeFirst ? g1.homeScorers : g1.awayScorers)[0];
        return first === Number(arg);
      }
      case 'pany': case 'mvp': case 'pfirst2': {
        const id = Number(arg);
        const played = gs.some((g) => (g.homeLines || []).concat(g.awayLines || []).some((l) => l.id === id));
        if (!played) return null; // did not play: stake back
        if (marketId === 'mvp') return f.mvpId === id;
        return gs.some((g) => (g.homeScorers || []).concat(g.awayScorers || []).includes(id));
      }
      default: return null;
    }
  }

  // What really happened for a market, in words, kept on the bet so the History can show it next to the pick that was wrong.
  function actual(state, f, marketId, key) {
    const nm = (id) => { const t = engine.teamById(state, id); return t ? t.name : '?'; };
    const gs = gamesOf(f), hw = f.homeWins || 0, aw = f.awayWins || 0, score = hw + '-' + aw;
    const winner = nm(hw > aw ? f.homeId : f.awayId) + ' won ' + score;
    if (marketId === 'winner' || !gs.length) return marketId === 'games' ? (hw + aw) + ' games' : winner;
    const th = sum(gs.map((g) => g.homeGoals)), ta = sum(gs.map((g) => g.awayGoals)), arg = Number(String(key).split(':')[1]);
    const pn = (id) => { const p = (state.players || []).find((x) => x.id === id); return p ? p.name : 'nobody'; };
    switch (marketId) {
      case 'tot': case 'alt': case 'exact': case 'range': return (th + ta) + ' total goals';
      case 'hteam': return nm(f.homeId) + ' scored ' + th;
      case 'ateam': return nm(f.awayId) + ' scored ' + ta;
      case 'games': return gs.length + ' games';
      case 'both': return (hw > 0 && aw > 0 ? 'Both teams won a game' : 'One team won every game') + ' (' + score + ')';
      case 'ot': return (gs.some((g) => g.overtime) || f.overtime ? 'Went to overtime' : 'No overtime');
      case 'score': return 'Final score ' + score;
      case 'sweep': return aw === 0 || hw === 0 ? (aw === 0 ? nm(f.homeId) : nm(f.awayId)) + ' swept ' + score : 'No sweep (' + score + ')';
      case 'shut': return gs.some((g) => g.homeGoals === 0 || g.awayGoals === 0) ? 'A game ended with a side on zero' : 'No side was held to zero';
      case 'first': { const g1 = gs[0], nh = (g1.homeScorers || []).length, na = (g1.awayScorers || []).length; return nh + na ? nm(mkRand(hash('first:' + f.id))() < nh / (nh + na) ? f.homeId : f.awayId) + ' scored first' : 'Nobody scored in game 1'; }
      case 'pfirst': { const g1 = gs[0], nh = (g1.homeScorers || []).length, na = (g1.awayScorers || []).length; return 'First to score: ' + pn(((mkRand(hash('first:' + f.id))() < nh / (nh + na)) ? g1.homeScorers : g1.awayScorers)[0]); }
      case 'mvp': return 'MVP: ' + pn(f.mvpId);
      case 'pany': return pn(arg) + (gs.some((g) => (g.homeScorers || []).concat(g.awayScorers || []).includes(arg)) ? ' scored' : ' did not score');
      default: return winner;
    }
  }

  function settle(state) {
    const bets = state.uxBets; if (!bets || !bets.length) return [];
    const team = engine.teamById(state, state.userTeamId); const done = [];
    for (const b of bets) {
      if (b.settled) continue;
      const f = engine.fixtureById(state, b.ref);
      let won;
      if (!f && !b.parlay) { if (daysBetween(b.placed, state.currentDate) > 30) won = null; else continue; }
      else if (b.parlay) {
        // every leg is its own match: each is settled as its match is played and the result stays on the leg (leg-by-leg record)
        for (const l of b.legs) {
          if (l.settled) continue;
          const lf = engine.fixtureById(state, l.ref);
          if (!lf) { if (daysBetween(b.placed, state.currentDate) > 30) { l.settled = true; l.won = null; } continue; }
          const r = resolve(lf, l.market, l.pick, b); if (r === undefined) continue;
          l.settled = true; l.won = r; if (r === false) l.actual = actual(state, lf, l.market, l.pick);
        }
        if (b.legs.some((l) => l.won === false)) won = false;
        else if (b.legs.every((l) => l.settled)) {
          const live = b.legs.filter((l) => l.won === true);
          if (!live.length) won = null;
          else { won = true; b.odds = parlayOdds(live); }
        } else continue;
      }
      else if (b.legs) {
        const rs = b.legs.map((l) => resolve(f, l.market, l.pick, b)); if (rs.some((x) => x === undefined)) continue;
        b.legs.forEach((l, i) => { if (rs[i] === false) l.actual = actual(state, f, l.market, l.pick); });
        if (rs.some((x) => x === false)) won = false; else if (rs.every((x) => x === null)) won = null; else { won = true; b.odds = Math.round(Math.min(MAX_COMBO_ODDS, b.legs.reduce((a, l, i) => a * (rs[i] === null ? 1 : l.odds), 1)) * 100) / 100; }
      }
      else { won = resolve(f, b.market, b.pick, b); if (won === undefined) continue; if (won === false) b.actual = actual(state, f, b.market, b.pick); }
      b.settled = true; b.won = won; b.settledDate = state.currentDate;
      b.returned = won === null ? b.stake : won ? Math.round(b.stake * b.odds) : 0;
      if (team && b.returned) { team.budget += b.returned; try { engine.pushLedger(state, 'bet-won', b.returned, won === null ? 'Bet refunded' : (b.label || 'Bet won')); } catch (e) { /* ledger optional */ } }
      done.push(b);
    }
    if (done.length) letter(state, done);
    return done;
  }
  function letter(state, bets) {
    const staked = sum(bets.map((b) => b.stake)), back = sum(bets.map((b) => b.returned)), won = bets.filter((b) => b.won).length;
    const fm = (n) => (engine.fmtMoney ? engine.fmtMoney(n) : String(n));
    const lines = bets.map((b) => b.label + ': ' + (b.won ? 'won, ' + fm(b.returned) + ' back' : b.returned ? 'void, stake returned' : 'lost ' + fm(b.stake)));
    state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'board', title: back > staked ? 'The book pays out' : 'The book settles up', link: 'inbox',
      body: won + ' of ' + bets.length + ' came in. ' + fm(staked) + ' staked, ' + fm(back) + ' returned.\n\n' + lines.join('\n') });
    if (state.inbox.length > 120) state.inbox.splice(0, state.inbox.length - 120);
  }
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

  // one open bet per match: a second bet on the same match would let correlated picks be stacked as separate (fully priced) wagers
  const hasOpen = (state, ref) => (state.uxBets || []).some((b) => !b.settled && (b.ref === ref || (b.parlay && b.legs.some((l) => l.ref === ref && !l.settled)))) ||
    (state.bets || []).some((b) => !b.settled && b.kind === 'match' && b.ref === ref);
  const inDiv = (state, H, A) => { const u = engine.teamById(state, state.userTeamId); return !!(u && u.region && H && A && H.region === u.region && A.region === u.region); };
  const tag = (bet, state, card, f) => {
    const H = engine.teamById(state, f.homeId), A = engine.teamById(state, f.awayId);
    bet.season = state.season; bet.comp = card.eventName || ''; bet.teamIds = [f.homeId, f.awayId]; bet.tierB = !!card.tierB; bet.inDiv = inDiv(state, H, A);
    return bet;
  };
  const parlayOdds = (legs) => Math.round(Math.min(MAX_COMBO_ODDS, Math.max(1.04, legs.reduce((a, l) => a * l.odds, 1) * Math.pow(PARLAY_EDGE, legs.length - 1))) * 100) / 100;

  // validate a pick list on one match and price it. Used by quote() and place().
  function build(state, ref, codes) {
    const card = cardFor(state, ref), f = engine.fixtureById(state, ref);
    if (!card || !f) return { ok: false, error: 'That is no longer on the board.' };
    const mk = marketsFor(state, card, f); if (!mk) return { ok: false, error: 'That is no longer on the board.' };
    if (!codes.length || codes.length > MAX_LEGS) return { ok: false, error: 'Pick between one and ' + MAX_LEGS + ' options.' };
    if (hasOpen(state, ref)) return { ok: false, error: 'You already have a bet on this match. Put everything in one combo instead.' };
    const legs = [];
    for (const code of codes) {
      const m = mk[Math.floor(code / 100)], opt = m ? m.options.find((x) => x.code === code) : null;
      if (!opt) return { ok: false, error: 'That option is no longer offered.' };
      if (legs.some((l) => l.market === m.id)) return { ok: false, error: 'Only one pick per market.' };
      const side = m.id === 'hteam' ? 'h' : m.id === 'ateam' ? 'a' : opt.teamId === f.homeId ? 'h' : opt.teamId === f.awayId ? 'a' : null;
      if (legs.some((l) => legClash(l, { market: m.id, pick: opt.key, side }))) return { ok: false, error: 'Those two picks cancel each other out, so they can not be combined.' };
      legs.push({ market: m.id, pick: opt.key, side, odds: opt.odds, label: m.title + ': ' + opt.label, teamId: opt.teamId });
    }
    if (legs.length > 1 && legs.some((l) => l.odds < MIN_LEG_ODDS)) return { ok: false, error: 'Picks below ' + MIN_LEG_ODDS.toFixed(2) + ' are too short to combine.' };
    const odds = legs.length === 1 ? legs[0].odds : jointOdds(mk, legs);
    return { ok: true, card, f, mk, legs, odds };
  }

  function buildParlay(state, pairs) {
    if (pairs.length < 2 || pairs.length > MAX_PARLAY) return { ok: false, error: 'A parlay needs 2 to ' + MAX_PARLAY + ' different matches.' };
    const legs = [], seen = new Set();
    for (const [ref, code] of pairs) {
      if (seen.has(ref)) return { ok: false, error: 'One pick per match in a parlay.' };
      seen.add(ref);
      const r = build(state, ref, [code]); if (!r.ok) return r;
      const H = engine.teamById(state, r.f.homeId), A = engine.teamById(state, r.f.awayId), l = r.legs[0];
      if (l.odds < MIN_LEG_ODDS) return { ok: false, error: 'Picks below ' + MIN_LEG_ODDS.toFixed(2) + ' are too short for a parlay.' };
      legs.push({ ...l, ref, comp: r.card.eventName || '', tierB: !!r.card.tierB, teamIds: [r.f.homeId, r.f.awayId], inDiv: inDiv(state, H, A), settled: false, won: null,
        label: (H ? H.name : '?') + ' v ' + (A ? A.name : '?') + ' · ' + l.label });
    }
    return { ok: true, legs, odds: parlayOdds(legs) };
  }

  function checkStake(state, team, stake) {
    const fz = ledger.frozenUntil(state);
    if (fz) return { ok: false, error: 'RLCS Integrity has frozen your betting until ' + fz + '.' };
    const min = engine.betBook(state).min, amt = Math.round(Number(stake) || 0);
    if (!(amt >= min)) return { ok: false, error: 'The smallest stake is ' + (engine.fmtMoney ? engine.fmtMoney(min) : min) + '.' };
    if (amt > team.budget) return { ok: false, error: 'That is more than the transfer budget.' };
    const cap = Math.max(min, Math.floor(team.budget * MAX_STAKE_SHARE));
    if (amt > cap) return { ok: false, error: 'The book caps one wager at ' + Math.round(MAX_STAKE_SHARE * 100) + '% of your transfer budget (' + (engine.fmtMoney ? engine.fmtMoney(cap) : cap) + ').' };
    return { ok: true, amt };
  }
  function commit(state, team, bet) {
    (state.uxBets = state.uxBets || []).push(bet);
    team.budget -= bet.stake;
    try { engine.pushLedger(state, 'bet', -bet.stake, bet.label); } catch (e) { /* ledger optional */ }
    return { ok: true, bet };
  }

  function quote(state, ref, codes) { const r = build(state, ref, codes); return r.ok ? { ok: true, odds: r.odds } : r; }
  function quoteParlay(state, pairs) { const r = buildParlay(state, pairs); return r.ok ? { ok: true, odds: r.odds } : r; }

  function place(state, ref, codes, stake) {
    const team = engine.teamById(state, state.userTeamId); if (!team) return { ok: false, error: 'You have no club.' };
    const r = build(state, ref, codes); if (!r.ok) return r;
    const st = checkStake(state, team, stake); if (!st.ok) return st;
    const { legs, odds } = r, single = legs.length === 1;
    state.uxBetSeq = (state.uxBetSeq || 0) + 1;
    const bet = { id: 100000 + state.uxBetSeq, kind: 'mk', ref, market: single ? legs[0].market : 'combo', pick: single ? legs[0].pick : '', legs: single ? undefined : legs, teamId: legs[0].teamId != null ? legs[0].teamId : r.f.homeId, odds,
      stake: st.amt, placed: state.currentDate, label: single ? legs[0].label : 'Combo x' + legs.length + ': ' + legs.map((l) => l.label).join(' + '), settled: false, won: null, returned: 0, settledDate: null };
    return commit(state, team, tag(bet, state, r.card, r.f));
  }

  function placeParlay(state, pairs, stake) {
    const team = engine.teamById(state, state.userTeamId); if (!team) return { ok: false, error: 'You have no club.' };
    const r = buildParlay(state, pairs); if (!r.ok) return r;
    const st = checkStake(state, team, stake); if (!st.ok) return st;
    state.uxBetSeq = (state.uxBetSeq || 0) + 1;
    const first = r.legs[0];
    const bet = { id: 100000 + state.uxBetSeq, kind: 'mk', parlay: true, ref: first.ref, market: 'parlay', pick: '', legs: r.legs, teamId: first.teamId != null ? first.teamId : first.teamIds[0], odds: r.odds, stake: st.amt, placed: state.currentDate,
      label: 'Parlay x' + r.legs.length, settled: false, won: null, returned: 0, settledDate: null, season: state.season, comp: Array.from(new Set(r.legs.map((l) => l.comp).filter(Boolean))).join(' / '),
      teamIds: r.legs.flatMap((l) => l.teamIds), tierB: r.legs.some((l) => l.tierB), inDiv: r.legs.some((l) => l.inDiv) };
    return commit(state, team, bet);
  }

  return { marketsFor, place, placeParlay, quote, quoteParlay, settle, resolve, calibrate, bCards, cardFor, tag, jointOdds };
}

function wrap(engine, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.__uxBets || typeof engine.betBook !== 'function' || typeof engine.placeBet !== 'function') return engine;
  engine.__uxBets = true;
  const bk = create(engine, opts);
  const safe = (what, fn, dflt) => { try { return fn(); } catch (e) { log('ux-bets: ' + what + ' failed: ' + e.stack); return dflt; } };

  const placeBet = engine.placeBet;
  const refuse = (error) => ({ ok: false, error });
  engine.placeBet = function (state, kind, ref, teamId, stake) {
    if (typeof kind === 'string' && kind === 'mkh') return safe('history', () => ({ ok: false, history: ledger.history(state, engine) }), { ok: false, error: 'History is not available.' }); // read-only query
    if (typeof kind === 'string' && kind.indexOf('mkq:') === 0) { // price a pick list without placing it: result.quote
      return safe('quote', () => ({ ok: false, quote: bk.quote(state, Number(ref), kind.slice(4).split(',').map(Number)) }), { ok: false, quote: { ok: false, error: 'No quote.' } });
    }
    if (typeof kind === 'string' && kind.indexOf('mpq:') === 0) {
      return safe('quote', () => ({ ok: false, quote: bk.quoteParlay(state, parsePairs(kind.slice(4))) }), { ok: false, quote: { ok: false, error: 'No quote.' } });
    }
    if (typeof kind === 'string' && kind.indexOf('mp:') === 0) { // parlay: 'mp:<ref>.<code>,<ref>.<code>'
      const pairs = parsePairs(kind.slice(3));
      if (!pairs.length) return refuse('That bet could not be placed.');
      return safe('parlay', () => bk.placeParlay(state, pairs, stake), refuse('That bet could not be placed.'));
    }
    if (typeof kind !== 'string' || kind.indexOf('mk') !== 0) {
      // the game's own bets (match winner, outrights): same freeze, one-bet-per-match and stake cap as the market bets, and tagged for the history
      if (kind === 'match' || kind === 'event') {
        const fz = ledger.frozenUntil(state); if (fz) return refuse('RLCS Integrity has frozen your betting until ' + fz + '.');
        const team = engine.teamById(state, state.userTeamId);
        if (kind === 'match' && (state.uxBets || []).some((x) => !x.settled && (x.ref === Number(ref) || (x.parlay && x.legs.some((l) => l.ref === Number(ref) && !l.settled))))) return refuse('You already have a bet on this match. Put everything in one combo instead.');
        if (team && Number(stake) > Math.max(1, Math.floor(team.budget * MAX_STAKE_SHARE)) && Number(stake) <= team.budget) return refuse('The book caps one wager at ' + Math.round(MAX_STAKE_SHARE * 100) + '% of your transfer budget.');
      }
      const r = placeBet.apply(this, arguments);
      if (r && r.ok && r.bet) safe('tag', () => {
        if (kind === 'match') { const f = engine.fixtureById(state, Number(ref)); const c = f ? bk.cardFor(state, f.id) : null; if (f) bk.tag(r.bet, state, c || { eventName: r.bet.label }, f); }
        else { r.bet.season = state.season; const ev = (state.events || []).find((e) => e.id === Number(ref)); r.bet.comp = ev ? ev.name : r.bet.label; r.bet.teamIds = [r.bet.teamId]; }
      });
      return r;
    }
    // 'mk' + ':' + legs: 'mk:1,205,306' (every leg is a market*100+option code); plain 'mk' with a number keeps the one-leg form
    const codes = kind.length > 3 ? kind.slice(3).split(',').map(Number) : [Number(teamId)];
    if (codes.some((c) => !Number.isFinite(c))) return refuse('That bet could not be placed.');
    return safe('place', () => bk.place(state, Number(ref), codes, stake), refuse('That bet could not be placed.'));
  };
  const parsePairs = (str) => String(str).split(',').map((x) => x.split('.').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));

  const betBook = engine.betBook;
  engine.betBook = function (state) {
    safe('settle', () => bk.settle(state));
    const book = betBook.apply(this, arguments);
    return safe('book', () => {
      const mine = state.uxBets || [];
      const withMarkets = (c) => {
        if (c.kind !== 'match') return c;
        const f = engine.fixtureById(state, c.ref); if (!f) return c;
        const markets = bk.marketsFor(state, c, f);
        return markets ? { ...c, markets } : c;
      };
      const cards = book.cards.map(withMarkets).concat(bk.bCards(state).map(withMarkets));
      const open = book.open.concat(mine.filter((b) => !b.settled));
      const past = mine.filter((b) => b.settled).slice().reverse().concat(book.past).sort((a, b) => (a.settledDate < b.settledDate ? 1 : a.settledDate > b.settledDate ? -1 : 0)).slice(0, 40);
      const staked = book.staked + sum(mine.map((b) => b.stake)), returned = book.returned + sum(mine.map((b) => b.returned));
      return { ...book, cards, open, past, staked, returned, profit: returned - staked, audit: ledger.view(state, engine) };
    }, book);
  };

  const adv = engine.advance;
  engine.advance = function advanceWithBets(state) {
    const r = adv.apply(this, arguments);
    if (state) { safe('settle', () => bk.settle(state)); safe('integrity', () => ledger.tick(state, engine)); }
    return r;
  };
  log('ux-bets installed');
  return engine;
}

module.exports = { wrap, create, MAX_STAKE_SHARE, MIN_LEG_ODDS };
