'use strict';
// Tier B board. The game's board only knows the Tier A Opens/Majors. A Tier B manager is not in those events, so the game scored
// every one of them as "did not qualify" (17th) and the pressure only ever went up. For a Tier B club this module
//  1. neutralises the game's own Tier A targets (boardExpect continental 1 / domestic 0 = "no target"; the Tier A values are kept
//     in state.tierB.board.stash and put back when the club is promoted),
//  2. sets B objectives from the club's strength rank in its Tier B region: a top-N target at every B-Tier Cup and, for the
//     stronger clubs, a regional-table target (promotion push) judged when the season ends,
//  3. judges them with the game's own pressure / sack numbers, and reports them through engine.boardSummary in the game's shape
//     so the existing board tile, top bar and Board window show them unchanged.
const WARN = 4, SACK = 6; // the game's BOARD_WARN_AT / BOARD_SACK_AT (not exported by league.js)
const CUP_TARGET = { 5: 4, 4: 8, 3: 12, 2: 15, 1: 15 }; // top-N of a 32-club cup (scaled for a 16-club one); the UI reads 16+ as "qualify", so stay under it
const TABLE_TARGET = { 5: 5, 4: 8, 3: 12 }; // regional Tier B table; weaker clubs get no table target
const levelOf = (frac) => (frac <= 0.12 ? 5 : frac <= 0.3 ? 4 : frac <= 0.55 ? 3 : frac <= 0.8 ? 2 : 1); // same bands as the game's expectation level
const cupTarget = (level, size) => Math.max(1, Math.min(15, Math.round((CUP_TARGET[level] || 15) * (size || 32) / 32)));

function install(engine, opts = {}) {
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('btier-board: ' + what + ' failed: ' + e.stack); return undefined; } };
  const me = (s) => engine.teamById(s, s.userTeamId);
  const isBUser = (s) => !!(s && s.tierB && s.userTeamId != null && me(s) && me(s).tier === 'B');
  const inbox = (s, title, body) => {
    s.inbox.push({ id: s.nextId++, date: s.currentDate, unread: true, resolved: false, type: 'board', title, link: 'inbox', body });
    if (s.inbox.length > 120) s.inbox.splice(0, s.inbox.length - 120);
  };

  function levelFor(s) {
    const region = me(s).region;
    const rows = s.teams.filter((t) => t.region === region).map((t) => ({ id: t.id, v: engine.teamStrength(s, engine.autoLineup(s, t)) })).sort((a, b) => b.v - a.v);
    const i = rows.findIndex((r) => r.id === s.userTeamId);
    return levelOf((Math.max(0, i) + 1) / Math.max(1, rows.length));
  }

  // Idempotent; returns true while the user manages a Tier B club.
  function ensure(s) {
    const tb = s && s.tierB;
    if (!tb) return false;
    if (!isBUser(s)) {
      if (tb.board && tb.board.active) { // promoted: the game's own expectations apply again
        tb.board.active = false;
        s.boardExpect = Object.assign({}, s.boardExpect, tb.board.stash || { continental: 1, domestic: 2 });
      }
      return false;
    }
    const b = tb.board = tb.board || { fresh: true };
    if (!b.active) {
      b.active = true;
      const be = s.boardExpect || {};
      if (be.domestic > 0) b.stash = { continental: be.continental, domestic: be.domestic };
      if (b.fresh) s.boardPressure = 0; // pressure from the old "17th at every Open" scoring was never earned
      b.fresh = false;
      for (const c of tb.cups || []) if (c.stage === 'done' && c.region === me(s).region) c.boardJudged = true; // never judge a cup played before this board existed
    }
    s.boardExpect = Object.assign({}, s.boardExpect, { continental: 1, domestic: 0 });
    if (b.levelSeason !== s.season || !b.level) { b.level = levelFor(s); b.levelSeason = s.season; }
    return true;
  }

  function punish(s, add, title, body, sackedWhy) {
    s.boardPressure = (s.boardPressure || 0) + add;
    if (s.boardPressure >= SACK) {
      s.sacked = true; s.sackedReason = sackedWhy;
      inbox(s, 'You have been sacked', sackedWhy);
      return;
    }
    inbox(s, s.boardPressure >= WARN ? 'FINAL WARNING from the board' : title, body + (s.boardPressure >= WARN ? ' Your position is now genuinely at risk.' : ' They want to see a response.'));
  }
  const ease = (s, by) => { s.boardPressure = Math.max(0, (s.boardPressure || 0) - by); };
  const ordinal = (n) => { const v = n % 100, w = ['th', 'st', 'nd', 'rd']; return n + (w[(v - 20) % 10] || w[v] || w[0]); };

  function judgeCups(s) {
    if (!ensure(s) || s.sacked) return;
    const b = s.tierB.board, region = me(s).region;
    for (const c of s.tierB.cups || []) {
      if (c.region !== region || c.stage !== 'done' || c.skipped || c.boardJudged) continue;
      c.boardJudged = true;
      const size = (c.field && c.field.length) || 32, st = (c.standings || []).find((x) => x.teamId === s.userTeamId);
      const place = st ? st.placement : size, target = cupTarget(b.level, size);
      if (place <= target) {
        const had = (s.boardPressure || 0) > 0; ease(s, 0.5);
        inbox(s, 'The board noticed ' + c.name, 'You finished ' + ordinal(place) + ' at ' + c.name + ', meeting the target of top ' + target + '.' + (had ? ' The pressure on you has eased.' : ''));
      } else {
        punish(s, place <= Math.ceil(target * 1.5) ? 0.5 : 1, 'The board expected more from ' + c.name,
          'You finished ' + ordinal(place) + ' at ' + c.name + '; the target was top ' + target + '.',
          'Finished ' + ordinal(place) + ' at ' + c.name + ' after repeated warnings. The board have terminated your contract.');
        if (s.sacked) return;
      }
    }
  }

  // After the season rolled: the promotion outcome and the final regional table are known (the table is read from the archive).
  function judgeTable(s, was) {
    const target = TABLE_TARGET[was.level], tb = s.tierB;
    const promo = (tb.promoHistory || []).find((h) => h.season === was.season);
    const pl = promo && promo.regions && promo.regions[was.region];
    const promoted = !!(pl && (pl.promoted || []).includes(was.uid));
    const rank = (engine.tierBStandings(s, was.region, was.season).findIndex((x) => x.teamId === was.uid) + 1) || null;
    if (promoted) { s.boardPressure = 0; inbox(s, 'The board are delighted with promotion', 'You earned promotion to Tier A. The slate is clean and the board expect you to hold your own at the top level.'); return; }
    if (!target || !rank) return;
    if (rank <= target) { ease(s, 1); inbox(s, 'The board on the season', 'You finished ' + ordinal(rank) + ' in the regional table, meeting the target of top ' + target + '.'); return; }
    punish(s, 1, 'The board expected more this season', 'You finished ' + ordinal(rank) + ' in the regional table; the target was top ' + target + '.',
      'Finished ' + ordinal(rank) + ' in the regional table after repeated warnings. The board have terminated your contract.');
  }

  function summary(s) {
    const tb = s.tierB, b = tb.board, region = me(s).region, be = s.boardExpect || {};
    const teams = s.teams.filter((t) => t.region === region).length;
    const events = (tb.cups || []).filter((c) => c.region === region && !c.skipped).map((c) => {
      const st = (c.standings || []).find((x) => x.teamId === s.userTeamId);
      return { name: c.name, kind: 'bcup', split: c.split, target: cupTarget(b.level, (c.field && c.field.length) || teams), done: c.stage === 'done', placement: st ? st.placement : null };
    });
    const tt = TABLE_TARGET[b.level];
    if (tt) {
      const over = !!(tb.promo && tb.promo.season === s.season && tb.promo.stage === 'done');
      const rank = (engine.tierBStandings(s, region).findIndex((x) => x.teamId === s.userTeamId) + 1) || null;
      events.push({ name: 'Regional table', kind: 'btable', split: 0, target: tt, done: over, placement: rank });
    }
    const next = events.find((e) => !e.done), p = s.boardPressure || 0;
    return {
      eventName: next ? next.name : null, target: next ? next.target : null,
      mood: p >= WARN ? 'warning' : p > 0 ? 'pressure' : 'ok', pressure: p, warnAt: WARN, sackAt: SACK,
      bySplit: false, splitNeed: null, events,
      soft: be.financial != null ? { financial: be.financial, brand: be.brand, youth: be.youth } : null
    };
  }

  const bs = engine.boardSummary;
  if (typeof bs === 'function') engine.boardSummary = function boardSummaryWithTierB(s) { return safe('summary', () => (ensure(s) ? summary(s) : bs.apply(this, arguments))) || bs.apply(this, arguments); };

  // beta.33 board window (engine.boardDetail): a Tier B club has no Open/Major targets (neutralised above), so the game's two result tabs are
  // marked "not judged" and our B-Tier Cup / regional-table targets ride along in .tierB for src/ui/ux-office-ui.js to draw in those tabs.
  const bd = engine.boardDetail;
  if (typeof bd === 'function') {
    engine.boardDetail = function boardDetailWithTierB(s) {
      safe('sync', () => ensure(s));
      const d = bd.apply(this, arguments);
      if (!d) return d;
      return safe('detail', () => {
        if (!ensure(s)) return d;
        const sm = summary(s), b = s.tierB.board;
        const cups = sm.events.filter((e) => e.kind === 'bcup').map((e) => ({ name: e.name, target: e.target, done: e.done, placement: e.placement, status: !e.done ? 'later' : e.placement && e.placement <= e.target ? 'met' : 'missed' }));
        const t = sm.events.find((e) => e.kind === 'btable');
        const worst = cups.some((c) => c.status === 'missed') ? 'risk' : cups.some((c) => c.status === 'met') ? 'on' : 'none';
        const tstat = !t ? 'none' : t.done ? (t.placement && t.placement <= t.target ? 'met' : 'missed') : (t.placement && t.placement <= t.target ? 'on' : 'risk');
        d.levels = Object.assign({}, d.levels, { domestic: cups.length ? b.level : 0, continental: t ? b.level : 0 });
        d.domestic = { judged: false, target: null, need: 0, splits: [], status: worst };
        d.continental = { judged: false, target: null, events: [], majorRace: null, worldsRace: { position: 1, direct: 1, lcqTo: 1 }, status: tstat };
        d.tierB = { cups, table: t ? { target: t.target, rank: t.placement, done: t.done } : null };
        return d;
      }) || d;
    };
  }

  // keep the game's Tier A targets off a Tier B club before it judges anything, and score the cups afterwards
  for (const name of ['advance', 'nextUserSeries', 'progressEvents']) {
    const fn = engine[name];
    if (typeof fn !== 'function') continue;
    engine[name] = function boardWrapped(s) {
      safe('sync', () => ensure(s));
      const r = fn.apply(this, arguments);
      safe('cups', () => judgeCups(s));
      return r;
    };
  }

  const next = engine.startNextSeason;
  if (typeof next === 'function') {
    engine.startNextSeason = function startNextSeasonWithTierBBoard(s) {
      const was = safe('capture', () => (ensure(s) ? { uid: s.userTeamId, region: me(s).region, level: s.tierB.board.level, season: s.season } : null));
      const r = next.apply(this, arguments);
      safe('table', () => { if (was && !s.sacked) judgeTable(s, was); });
      safe('sync', () => ensure(s)); // the game just revised its own expectations
      return r;
    };
  }
  return { ensure, cupTarget, TABLE_TARGET };
}

module.exports = { install, cupTarget, CUP_TARGET, TABLE_TARGET };
