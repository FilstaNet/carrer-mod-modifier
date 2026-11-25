'use strict';
// Manager career (LateGamePlan.md 14.6): the manager's own record, NOT tied to one club. The game's managerReputation and managerTrophies only
// look at the CURRENT user club, so a manager who moves would lose his past: this file keeps it.
//  - stints: one row per club led (seasons, series W-L, titles, how it ended)
//  - honours: every title the club won while he was in charge (worlds / major / open)
//  - milestones: one-off rewards (followers for the current club + manager points)
// State: state.uxManager = { v, since, stints, honours, seen, rewards, points }. Own key (not state.late): it must also work for Tier B and before
// the facilities unlock (late.tick returns early for those). Tracking starts when installed; seasons already archived in state.seasonHistory are read once.
// Series W-L per stint = change of the game's lifetime counter state.managerPast {series, won} while the stint lasts (zero before the install).
// Every number is a placeholder until played.
const TITLE_KINDS = { worlds: 'Worlds', major: 'Major', open: 'Open' };
const MILESTONES = [ // id, name, test(stats), reward { fans: fraction of club followers, pts: manager points }
  { id: 'first', name: 'First trophy', test: (s) => s.titles >= 1, fans: 0.01, pts: 5 },
  { id: 'titles5', name: '5 trophies', test: (s) => s.titles >= 5, fans: 0.01, pts: 10 },
  { id: 'titles10', name: '10 trophies', test: (s) => s.titles >= 10, fans: 0.02, pts: 15 },
  { id: 'titles25', name: '25 trophies', test: (s) => s.titles >= 25, fans: 0.03, pts: 25 },
  { id: 'worlds', name: 'World champion', test: (s) => s.worlds >= 1, fans: 0.02, pts: 15 },
  { id: 'wins50', name: '50 series wins', test: (s) => s.won >= 50, fans: 0.005, pts: 5 },
  { id: 'wins100', name: '100 series wins', test: (s) => s.won >= 100, fans: 0.01, pts: 10 },
  { id: 'wins250', name: '250 series wins', test: (s) => s.won >= 250, fans: 0.02, pts: 20 },
  { id: 'seasons5', name: '5 seasons as manager', test: (s) => s.seasons >= 5, fans: 0.005, pts: 5 },
  { id: 'seasons10', name: '10 seasons as manager', test: (s) => s.seasons >= 10, fans: 0.01, pts: 10 },
  { id: 'clubs3', name: 'Trophies with 3 clubs', test: (s) => s.clubsWithTitle >= 3, fans: 0.02, pts: 20 },
];

function install(engine, opts = {}) {
  if (!engine || engine.uxManager) return engine && engine.uxManager || null;
  const log = opts.log || (() => {});
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('late manager: ' + what + ' failed: ' + e.stack); } };
  const careerOk = (state) => !!state && Array.isArray(state.teams) && state.userTeamId != null && state.mode !== 'player' && !!engine.teamById(state, state.userTeamId);
  const club = (state, id) => { const t = engine.teamById(state, id); return t ? t.name : '?'; };
  const past = (state) => ({ series: (state.managerPast && state.managerPast.series) || 0, won: (state.managerPast && state.managerPast.won) || 0 });
  const open = (d) => d.stints.length && !d.stints[d.stints.length - 1].end ? d.stints[d.stints.length - 1] : null;
  const addTitle = (d, st, k, ev, season) => {
    const key = season + ':' + ev.id; if (d.seen[key] || !TITLE_KINDS[k]) return false;
    d.seen[key] = 1; d.honours.push(detail({ k, name: ev.name, season, teamId: st.teamId, club: st.name }, ev)); st.titles++; return true;
  };
  // what the Honours tab shows and links to: the event id (to open it), its date, and the club's points and prize there
  const detail = (h, ev) => { const r = (ev.standings || []).find((x) => x.teamId === h.teamId) || {}; h.id = ev.id; h.date = ev.endDate || ev.startDate || h.date || null; if (r.points != null) h.points = r.points; if (r.prize != null) h.prize = r.prize; return h; };
  // older entries (before these fields existed) are completed from the current season or the archive
  function fillHonours(state, d) {
    for (const h of d.honours) {
      if (h.id != null && h.date) continue;
      const pool = h.season === state.season ? state.events : ((state.seasonHistory || []).find((x) => x.season === h.season) || {}).events;
      const ev = (pool || []).find((e) => e.name === h.name && e.championId === h.teamId); if (ev) detail(h, ev);
    }
  }

  function data(state) {
    if (state.uxManager) return state.uxManager;
    const d = state.uxManager = { v: 1, since: state.currentDate, stints: [], honours: [], seen: {}, rewards: {}, points: 0 };
    if (state.season <= 1) d.honey = 2; // a new career: no dismissal during its first two seasons (see honey())
    // the seasons the game already archived: which club he led and which events it won (series W-L unknown: zero)
    for (const h of state.seasonHistory || []) {
      if (h.userTeamId == null) continue;
      let st = d.stints[d.stints.length - 1];
      if (!st || st.teamId !== h.userTeamId) { st = { teamId: h.userTeamId, name: (h.teams || []).find((t) => t.id === h.userTeamId)?.name || club(state, h.userTeamId), from: h.season, to: h.season, seasons: 0, w: 0, l: 0, titles: 0, end: 'moved', base: null }; d.stints.push(st); }
      st.to = h.season; st.seasons++;
      for (const ev of h.events || []) if (ev.championId === h.userTeamId && !ev.cancelled) addTitle(d, st, ev.kind, ev, h.season);
    }
    return d;
  }

  // keep the current stint in step with the user's club; a different club closes the old stint and opens a new one
  function tick(state) {
    if (!careerOk(state)) return;
    const d = data(state), pm = past(state);
    let cur = open(d);
    if (cur && cur.teamId !== state.userTeamId) { closeStint(d, cur, state, pm); cur = null; }
    if (!cur) { const last = d.stints[d.stints.length - 1]; if (last && last.end === 'moved' && last.teamId === state.userTeamId && last.to === state.season - 1 && !last.reopened) { last.end = null; last.reopened = 1; cur = last; } }
    if (!cur) { cur = { teamId: state.userTeamId, name: club(state, state.userTeamId), from: state.season, to: state.season, seasons: 0, w: 0, l: 0, titles: 0, end: null, base: pm }; d.stints.push(cur); }
    if (!cur.base) cur.base = pm; // a stint rebuilt from the archive starts counting now
    cur.to = state.season; cur.sacked = !!state.sacked; cur.live = { w: pm.won - cur.base.won, l: (pm.series - pm.won) - (cur.base.series - cur.base.won) };
    for (const ev of state.events || []) if (ev.stage === 'done' && ev.championId === state.userTeamId && !ev.cancelled) addTitle(d, cur, ev.kind, ev, state.season);
    if (d.honours.some((h) => h.id == null || !h.date)) fillHonours(state, d);
    milestones(state, d); d.rep = reputation(state); d.need = OFFER_REP; // cached for the UI
  }
  function closeStint(d, st, state, pm) {
    const b = st.base || pm; st.w += pm.won - b.won; st.l += (pm.series - pm.won) - (b.series - b.won);
    st.end = st.sacked ? 'sacked' : 'moved'; st.base = null; st.live = null;
  }
  const stats = (state, d) => {
    const pm = past(state), titles = d.honours.length, ids = new Set(d.honours.map((h) => h.teamId));
    return { titles, worlds: d.honours.filter((h) => h.k === 'worlds').length, won: pm.won, seasons: d.stints.reduce((a, s) => a + s.seasons, 0), clubsWithTitle: ids.size };
  };
  function milestones(state, d) {
    const s = stats(state, d);
    for (const m of MILESTONES) {
      if (d.rewards[m.id] || !m.test(s)) continue;
      d.rewards[m.id] = { date: state.currentDate, season: state.season, club: club(state, state.userTeamId) };
      d.points += m.pts;
      const t = engine.teamById(state, state.userTeamId); if (t && m.fans) t.followers = Math.round((t.followers || 0) * (1 + m.fans));
      if (state.inbox) state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'info', title: 'Manager milestone: ' + m.name, link: 'inbox', body: 'Your career record earns you a milestone: ' + m.name + '. +' + m.pts + ' manager points' + (m.fans ? ' and +' + Math.round(m.fans * 1000) / 10 + '% followers for the club' : '') + '.' });
    }
  }
  // season rollover: count the finished season for the current stint (events are already collected by the daily tick)
  // ======== Phase 5: job offers from other clubs and the club switch (all numbers are placeholders, UNCONFIRMED) ========
  const OFFER_REP = 20, OFFER_DAYS = 45, OFFERS_PER_SEASON = 2;
  const BOUND = ['boardTarget', 'strikes', 'boardPressure', 'boardExpect', 'seasonStart', 'sacked', 'sackedReason', 'facility', 'academy']; // academy: the eligibility was earned by the old club
  const CLEAR = { offersOut: [], offersIn: [], negotiations: {}, pendingDeals: [], pendingReplies: [] }; // transfer dealings belong to the old club: dropped on a move
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const tierA = (state) => state.teams.filter((t) => t.id !== state.userTeamId && t.tier !== 'B' && !t.nation && t.region && !/_b$/.test(t.region));
  const strength = (state, t) => { const r = (t.playerIds || []).map((id) => engine.playerById(state, id)).filter((p) => p && !p.retired && !p.isUser).map((p) => p.rating || 0).sort((a, b) => b - a).slice(0, 3); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
  // the manager's OWN reputation (the game's managerReputation only sees the current club): seasons, trophies, milestone points
  const reputation = (state) => { const d = data(state), n = (k) => d.honours.filter((h) => h.k === k).length; return Math.round(d.stints.reduce((a, s) => a + s.seasons, 0) * 2 + n('worlds') * 8 + n('major') * 5 + n('open') * 2 + d.points * 0.5); };
  const WHY = { giant: 'A big club that is underperforming. Rich, but the fans want results.', rebuild: 'A promising squad on a small budget. Time to build something.', ambitious: 'An ambitious club one step above yours.' };

  function makeOffers(state) {
    const me = engine.teamById(state, state.userTeamId), pool = tierA(state), fol = (t) => t.followers || 0, f0 = fol(me), taken = new Set(), out = [];
    const top = pool.slice().sort((a, b) => fol(b) - fol(a));
    const giants = top.slice(0, 10).filter((t) => fol(t) > f0 * 1.2).sort((a, b) => strength(state, a) - strength(state, b)); // big but weak
    const budgets = pool.map((t) => t.budget || 0).sort((a, b) => a - b), medB = budgets[Math.floor(budgets.length / 2)] || 0;
    const rebuild = pool.filter((t) => fol(t) < f0 && (t.budget || 0) <= medB).sort((a, b) => strength(state, b) - strength(state, a)); // good squad, small purse
    const rise = pool.filter((t) => fol(t) > f0).sort((a, b) => fol(a) - fol(b)); // the next step up
    const kinds = [['giant', giants], ['rebuild', rebuild], ['ambitious', rise]], rot = hash('offers:' + state.season + ':' + state.userTeamId) % 3;
    for (let i = 0; i < 3 && out.length < OFFERS_PER_SEASON; i++) { const [type, list] = kinds[(rot + i) % 3], t = list.find((x) => !taken.has(x.id)); if (t) { taken.add(t.id); out.push({ type, teamId: t.id, name: t.name }); } }
    return out;
  }
  function offerTick(state) {
    const d = data(state);
    for (const o of d.offers || []) if (o.status === 'open' && state.currentDate > o.expires) o.status = 'expired';
    const me = engine.teamById(state, state.userTeamId);
    if (!me || me.tier === 'B' || state.sacked || d.offerSeason === state.season || d.lastMove === state.season) return; // Tier B gets no offers; one move per season
    d.offerSeason = state.season;
    if (reputation(state) < OFFER_REP) return;
    const exp = new Date(Date.parse(state.currentDate + 'T12:00:00Z') + OFFER_DAYS * 864e5).toISOString().slice(0, 10);
    d.offers = d.offers || [];
    for (const o of makeOffers(state)) {
      d.nextOffer = (d.nextOffer || 0) + 1;
      d.offers.push({ id: d.nextOffer, type: o.type, teamId: o.teamId, name: o.name, season: state.season, expires: exp, status: 'open', why: WHY[o.type] });
      if (state.inbox) state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'info', title: 'Job offer from ' + o.name, link: 'inbox', body: o.name + ' want you as their manager. ' + WHY[o.type] + ' Answer by ' + exp + ' in Club → Manager. A new club gives you a grace period: the board is patient in your first season.' });
    }
  }
  function switchClub(state, newId) {
    const old = engine.teamById(state, state.userTeamId), nu = engine.teamById(state, newId), me = (state.players || []).find((p) => p.id === state.userPlayerId);
    if (!old || !nu || nu.id === old.id || nu.nation) return { ok: false, error: 'That club is not available.' };
    const d = data(state);
    tick(state);
    const stash = state.clubStash || (state.clubStash = {}), bundle = {};
    for (const k of BOUND) if (state[k] !== undefined) bundle[k] = JSON.parse(JSON.stringify(state[k]));
    stash[old.id] = bundle;
    if (me) { old.playerIds = (old.playerIds || []).filter((id) => id !== me.id); old.lineup = (old.lineup || []).filter((id) => id !== me.id); if (!nu.playerIds.includes(me.id)) nu.playerIds.push(me.id); me.teamId = nu.id; } // the manager's own player card goes along
    for (const k of BOUND) delete state[k];
    for (const k of Object.keys(CLEAR)) state[k] = JSON.parse(JSON.stringify(CLEAR[k]));
    Object.assign(state, stash[nu.id] || {});
    state.userTeamId = nu.id; state.userRegion = nu.region;
    if (!stash[nu.id]) {
      state.strikes = 0; state.boardPressure = 0; state.sacked = false; state.seasonStart = { budget: nu.budget, followers: nu.followers };
      state.boardTarget = engine.boardTargetFor(state);
      state.boardExpect = Object.assign({}, state.boardExpect || {}, engine.computeBoardExpect(state));
    }
    for (const k of ['continental', 'domestic']) if (state.boardExpect && state.boardExpect[k] > 1) state.boardExpect[k]--; // grace period: one step lower expectations ...
    d.fairSeason = null; d.honey = Math.max(d.honey || 0, state.season); d.lastMove = state.season; d.nameFor = nu.id; renameSave(state); // ... and no dismissal in this season (honey())
    engine.repairInvariants(state);
    tick(state);
    if (state.inbox) state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'info', title: 'Welcome to ' + nu.name, link: 'inbox', body: 'You take over ' + nu.name + '. The board gives you this season to settle in. Your trophies and record come with you (Club → Manager).' });
    return { ok: true };
  }
  // 32-club regions: before an Open the clubs play a Swiss stage and only 16 get in, but the game sets Open targets as if every club played the Open (top 12 for the
  // two lowest levels, and 2 good Opens of 3 per split). A club outside the best 16 of its region by squad strength gets the lowest level: 1 good Open of 3 per split.
  function fairExpect(state) {
    const me = engine.teamById(state, state.userTeamId); if (!me || me.tier === 'B' || me.nation || !state.boardExpect) return;
    const reg = state.teams.filter((t) => t.region === me.region && !t.nation && t.tier !== 'B');
    if (reg.length < 32) return;
    const rank = reg.slice().sort((a, b) => strength(state, b) - strength(state, a) || a.id - b.id).findIndex((t) => t.id === me.id) + 1;
    if (rank > 16 && state.boardExpect.domestic > 1) state.boardExpect.domestic = 1;
    if (state.uxManager) { state.uxManager.worst = rank > WORST_FROM; state.uxManager.openTarget = rank > WORST_FROM ? WORST_TARGET : rank > 16 ? MID_TARGET : GAME_TARGET; } // ranks 25-32: "top 22", 17-24: "top 16" (see withWorstView)
  }
  // The game judges an Open as place <= 12 for the two lowest levels (an internal constant that cannot be patched). For the worst clubs of a 32-club region
  // the target is "top 22" (qualify, or go out 2-3 in the Swiss): while the game judges or reports the board, the user's own Open places 13..22 read as 12.
  // The real places are put back right after the call (also in the archived season, which the rollover copies in the middle of the call).
  const WORST_FROM = 24, GAME_TARGET = 12, MID_TARGET = 16, WORST_TARGET = 22;
  // the flags are set once per season; do it before the first board call too (a new career has not had its first day yet)
  const ensureFair = (state) => { const f = data(state); if (f.fairSeason !== state.season) { f.fairSeason = state.season; fairExpect(state); } };
  function withWorstView(state, fn, fix) {
    if (careerOk(state)) ensureFair(state);
    const d = state && state.uxManager, goal = d && d.openTarget || GAME_TARGET;
    if (!d || goal <= GAME_TARGET || !careerOk(state)) return fn();
    try { if (engine.uxSwiss && engine.uxSwiss.markOut) engine.uxSwiss.markOut(state); } catch (e) { /* the places below are then the game's own */ }
    const saved = [];
    for (const o of state.events || []) {
      if (o.kind !== 'open') continue;
      const x = (o.standings || []).find((q) => q.teamId === state.userTeamId);
      if (x && x.placement > GAME_TARGET && x.placement <= goal) { saved.push({ ev: o.id, name: o.name, x, p: x.placement }); x.placement = GAME_TARGET; }
    }
    if (!saved.length) { const r = fn(); return fix ? fix(r, saved, goal) : r; }
    try { const r = fn(); return fix ? fix(r, saved, goal) : r; } finally {
      for (const q of saved) q.x.placement = q.p;
      for (const h of (state.seasonHistory || []).slice(-2)) for (const o of h.events || []) for (const q of saved) if (o.id === q.ev) { const y = (o.standings || []).find((z) => z.teamId === state.userTeamId); if (y && y.placement === GAME_TARGET) y.placement = q.p; }
    }
  }
  // the board window: target 22 and the real places (the game's own "met" already used the 22 rule)
  const showReal = (r, saved, goal) => {
    const dm = r && r.domestic; if (!dm) return r;
    dm.target = goal;
    for (const sp of dm.splits || []) for (const row of sp.rows || []) { const q = saved.find((z) => z.name === row.name); if (q) row.place = q.p; }
    return r;
  };
  for (const name of ['advance', 'startNextSeason', 'boardSummary']) {
    const fn = engine[name]; if (typeof fn !== 'function') continue;
    engine[name] = function worstView(state) { const args = arguments, self = this; return withWorstView(state, () => fn.apply(self, args)); };
  }
  { const fn = engine.boardDetail; if (typeof fn === 'function') engine.boardDetail = function boardDetailWorst(state) { const args = arguments, self = this; return withWorstView(state, () => fn.apply(self, args), showReal); }; }
  // grace period: during the move season the board pressure stays 2 points under the dismissal line
  // `ended`: called right after the season rollover, whose board verdict still belongs to the grace season
  const honey = (state, ended) => {
    const d = state.uxManager; if (!d || d.honey == null || state.season > d.honey + (ended ? 1 : 0) || state.boardPressure == null) return;
    let sack = 6; try { sack = (engine.boardSummary(state) || {}).sackAt || 6; } catch (e) { /* default */ }
    if (state.sacked) { // the board's verdict fired him inside the grace season: it is taken back, with a warning
      state.sacked = false; state.sackedReason = ''; state.boardPressure = sack - 2.5;
      if (state.inbox) state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'board', title: 'The board gives you one more chance', body: 'The results were not good enough, but you only just arrived. The board keeps you on, on a final warning.' });
      return;
    }
    if (state.boardPressure > sack - 2) state.boardPressure = sack - 2;
  };
  function rpc(state, json) {
    let a; try { a = JSON.parse(json); } catch (e) { return { ok: false, error: 'Bad request.' }; }
    if (!careerOk(state)) return { ok: false, error: 'Only manager careers get job offers.' };
    const d = data(state);
    if (a.a === 'status') return { ok: false, readOnly: true, reputation: reputation(state), need: OFFER_REP, offers: d.offers || [] };
    const o = (d.offers || []).find((x) => x.id === a.id);
    if (!o || o.status !== 'open') return { ok: false, error: 'That offer is no longer open.' };
    if (a.a === 'decline') { o.status = 'declined'; return { ok: true }; }
    if (a.a !== 'accept') return { ok: false, error: 'Unknown action.' };
    if (state.currentDate > o.expires) { o.status = 'expired'; return { ok: false, error: 'That offer has expired.' }; }
    if (state.sacked) return { ok: false, error: 'You have been dismissed.' };
    if (state.pendingMatch) return { ok: false, error: 'Finish today\'s match first.' };
    const r = switchClub(state, o.teamId); if (!r.ok) return r;
    o.status = 'accepted'; for (const x of d.offers) if (x.status === 'open') x.status = 'declined';
    return { ok: true };
  }
  const pb = engine.placeBet;
  engine.placeBet = function placeBetOrManager(state, kind) {
    if (typeof kind === 'string' && kind.indexOf('uxm:') === 0) { try { return rpc(state, kind.slice(4)); } catch (e) { log('late manager: rpc failed: ' + e.stack); return { ok: false, error: 'That could not be done.' }; } }
    return pb.apply(this, arguments);
  };

  // Save name: the game keeps the save's display name in its main process and rewrites the file on every save. After a club switch the save is renamed ONCE to
  // "<club> (ST)" (Switched Teams) by patching the text of that one write (the game's files are not touched; a later manual rename is respected).
  let pendingName = null;
  const wanted = (state) => { const t = engine.teamById(state, state.userTeamId); return t ? t.name + ' (ST)' : null; };
  const nodeFs = typeof require === 'function' ? require('fs') : null;
  if (nodeFs && !nodeFs.__uxSaveName) {
    nodeFs.__uxSaveName = true; const w = nodeFs.writeFileSync;
    nodeFs.writeFileSync = function (p, data) {
      if (pendingName && typeof p === 'string' && /\.json\.tmp$/.test(p) && typeof data === 'string' && /^\s*\{\s*"name":/.test(data.slice(0, 40))) {
        const nm = pendingName; pendingName = null;
        try { data = data.replace(/^(\s*\{\s*"name":\s*)"(?:[^"\\]|\\.)*"/, (m, a) => a + JSON.stringify(nm)); } catch (e) { /* keep the original text */ }
      }
      return w.apply(this, [p, data].concat(Array.prototype.slice.call(arguments, 2)));
    };
  }
  const renameSave = (state) => { const n = wanted(state); if (n) pendingName = n; };

  const sn = engine.startNextSeason;
  engine.startNextSeason = function startNextSeasonWithManager(state) {
    if (careerOk(state)) safe('close season', () => { tick(state); const c = open(data(state)); if (c) c.seasons++; });
    const r = sn.apply(this, arguments);
    if (careerOk(state)) safe('grace', () => honey(state, true));
    return r;
  };
  const adv = engine.advance;
  engine.advance = function advanceWithManager(state) {
    const r = adv.apply(this, arguments);
    safe('daily', () => { tick(state); if (careerOk(state)) { offerTick(state); honey(state); ensureFair(state); const d = state.uxManager; if (d && d.stints.length > 1 && d.nameFor !== state.userTeamId) { d.nameFor = state.userTeamId; renameSave(state); } } });
    return r;
  };
  // what the UI shows: finished stints plus the running one (live series count)
  const view = (state) => {
    if (!state.uxManager) return null;
    const d = state.uxManager, pm = past(state);
    return { reputation: reputation(state), need: OFFER_REP, offers: d.offers || [], since: d.since, points: d.points, rewards: d.rewards, honours: d.honours, stints: d.stints.map((s) => ({ ...s, w: s.w + (s.live ? s.live.w : 0), l: s.l + (s.live ? s.live.l : 0) })), lifetime: { series: pm.series, won: pm.won }, milestones: MILESTONES.map((m) => ({ id: m.id, name: m.name, pts: m.pts, fans: m.fans })) };
  };
  engine.uxManager = { withWorstView, fairExpect, pendingName: () => pendingName, data, tick, view, stats, switchClub, reputation, makeOffers, rpc, OFFER_REP, MILESTONES, TITLE_KINDS };
  log('late manager installed');
  return engine.uxManager;
}

module.exports = { install, MILESTONES };
