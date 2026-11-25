// Betting history ledger, bankroll analytics and RLCS Integrity audits. Pure functions on the career state (no game imports);
// ux-bets.js wires them in. Everything lives in state.bets (the game's own native bets) and state.uxBets (market bets, combos, parlays);
// the audit record lives in state.uxBetting (created on demand, so old saves load unchanged).
const { hash } = require('./ux-persona');

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mkRand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const money = (n) => { const a = Math.abs(Math.round(n)); const t = a >= 1e6 ? '$' + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : a >= 1000 ? '$' + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : '$' + a; return (n < 0 ? '-' : '') + t; };

const AUDIT_AT = 60, LEAK_AT = 40, AUDIT_GAP = 28, LEAK_GAP = 14, UPSET_ODDS = 3;

// ---------- history ----------
function entries(state, engine) {
  const nm = (id) => { const t = id != null ? engine.teamById(state, id) : null; return t ? t.name : null; };
  const out = [];
  const add = (b, o) => {
    const settled = !!b.settled;
    out.push({
      id: b.id, kind: o.kind, label: o.label, comp: o.comp || '', season: b.season != null ? b.season : null, teams: o.teams.filter(Boolean),
      odds: b.odds, stake: b.stake, returned: b.returned || 0, status: !settled ? 'open' : b.won === null ? 'void' : b.won ? 'won' : 'lost',
      actual: b.actual || (o.actual ? o.actual(b) : null), placed: b.placed, settled: b.settledDate || null, tierB: !!b.tierB, inDiv: !!b.inDiv,
      legs: (b.legs || []).map((l) => ({ label: l.label, won: l.won === undefined ? null : l.won, settled: !!l.settled, odds: l.odds, ref: l.ref, actual: l.actual || null }))
    });
  };
  for (const b of state.bets || []) {
    if (b.kind === 'match') add(b, { kind: 'single', label: b.title || 'Match winner: ' + (nm(b.teamId) || '?'), comp: b.comp || b.label, teams: b.teamIds ? b.teamIds.map(nm) : [nm(b.teamId)],
      actual: (x) => { const f = x.won === false ? engine.fixtureById(state, x.ref) : null; return f && f.played ? nm(f.homeWins > f.awayWins ? f.homeId : f.awayId) + ' won ' + f.homeWins + '-' + f.awayWins : null; } });
    else add(b, { kind: 'outright', label: (b.label || 'Outright') + ': ' + (nm(b.teamId) || '?'), comp: b.comp || b.label, teams: [nm(b.teamId)] });
  }
  for (const b of state.uxBets || []) {
    const kind = b.parlay ? 'parlay' : b.legs ? 'combo' : 'single';
    add(b, { kind, label: b.label, comp: b.comp || '', teams: b.teamIds ? b.teamIds.map(nm) : [nm(b.teamId)] });
  }
  return out.sort((a, b) => (a.placed < b.placed ? 1 : a.placed > b.placed ? -1 : b.id - a.id));
}

function stats(list) {
  const done = list.filter((e) => e.status === 'won' || e.status === 'lost');
  const won = done.filter((e) => e.status === 'won');
  const staked = sum(done.map((e) => e.stake)), returned = sum(done.map((e) => e.returned));
  const order = done.slice().sort((a, b) => (a.settled < b.settled ? -1 : a.settled > b.settled ? 1 : a.id - b.id));
  let best = 0, worst = 0, run = 0;
  for (const e of order) { if (e.status === 'won') run = run > 0 ? run + 1 : 1; else run = run < 0 ? run - 1 : -1; best = Math.max(best, run); worst = Math.min(worst, run); }
  const hit = won.slice().sort((a, b) => b.odds - a.odds)[0] || null;
  const big = won.slice().sort((a, b) => (b.returned - b.stake) - (a.returned - a.stake))[0] || null;
  const bySeason = {};
  for (const e of done) {
    const k = e.season != null ? e.season : 0;
    const s = bySeason[k] || (bySeason[k] = { season: e.season, bets: 0, wins: 0, staked: 0, returned: 0 });
    s.bets++; if (e.status === 'won') s.wins++; s.staked += e.stake; s.returned += e.returned;
  }
  return {
    settled: done.length, wins: won.length, losses: done.length - won.length, voids: list.filter((e) => e.status === 'void').length, open: list.filter((e) => e.status === 'open').length,
    winRate: done.length ? won.length / done.length : null, staked, returned, profit: returned - staked, roi: staked ? (returned - staked) / staked : null,
    bestStreak: best, worstStreak: -worst, currentStreak: run,
    underdog: hit ? { label: hit.label, odds: hit.odds, profit: hit.returned - hit.stake, date: hit.settled } : null,
    biggestWin: big ? { label: big.label, profit: big.returned - big.stake, date: big.settled } : null,
    seasons: Object.values(bySeason).sort((a, b) => (b.season || 0) - (a.season || 0)).map((s) => ({ ...s, profit: s.returned - s.staked }))
  };
}

function history(state, engine) {
  const list = entries(state, engine);
  const uniq = (a) => Array.from(new Set(a.filter((x) => x != null && x !== ''))).sort();
  return { entries: list, stats: stats(list), seasons: uniq(list.map((e) => e.season)).sort((a, b) => b - a), comps: uniq(list.map((e) => e.comp)), teams: uniq(list.flatMap((e) => e.teams)) };
}

// ---------- RLCS Integrity ----------
const ensure = (state) => state.uxBetting || (state.uxBetting = { freezeUntil: null, strikes: 0, audits: 0, fines: 0, lastAudit: null, lastLeak: null, log: [] });
const frozenUntil = (state) => { const u = state.uxBetting; return u && u.freezeUntil && u.freezeUntil >= state.currentDate ? u.freezeUntil : null; };

// How suspicious the user's betting looks right now (0-100), from the last 30-90 days. Deterministic, nothing is stored.
function risk(state, engine) {
  const today = state.currentDate, team = engine.teamById(state, state.userTeamId);
  const list = entries(state, engine);
  const within = (e, n) => days(e.placed, today) <= n;
  const r30 = list.filter((e) => within(e, 30));
  const reasons = []; let score = 0;
  const staked30 = sum(r30.map((e) => e.stake)), budget = team ? Math.max(1, team.budget) : 1;
  const share = staked30 / (budget + staked30);
  if (share >= 0.5) { score += 50; reasons.push('Half of your transfer budget went through the book this month.'); } else if (share >= 0.25) { score += 30; reasons.push('A large share of your budget went through the book this month.'); }
  if (r30.length >= 20) { score += 35; reasons.push(r30.length + ' wagers in 30 days.'); } else if (r30.length >= 10) { score += 20; reasons.push(r30.length + ' wagers in 30 days.'); }
  const ups = list.filter((e) => e.status === 'won' && e.inDiv && e.odds >= UPSET_ODDS && days(e.settled || e.placed, today) <= 60);
  if (ups.length >= 2) { score += Math.min(60, 20 * ups.length); reasons.push(ups.length + ' upsets called in your own division.'); }
  const r90 = list.filter((e) => (e.status === 'won' || e.status === 'lost') && days(e.settled || e.placed, today) <= 90);
  const net90 = sum(r90.map((e) => e.returned - e.stake));
  const missing = (state.boardPressure || 0) > 0;
  if (net90 < 0 && -net90 >= 0.2 * (budget - net90) && missing) { score += 40; reasons.push('Deep betting losses while the board is already unhappy.'); }
  return { score: Math.min(100, score), reasons, staked30, count30: r30.length, net90 };
}
const level = (score) => (score >= AUDIT_AT ? 'high' : score >= LEAK_AT ? 'elevated' : 'low');

function leakPost(state, engine, rk, rand) {
  if (!state.social || !Array.isArray(state.social.posts)) return null;
  const pool = (state.players || []).filter((p) => !p.retired && p.teamId >= 0 && !p.isUser && p.teamId !== state.userTeamId).sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 25);
  if (!pool.length) return null;
  const p = pool[Math.floor(rand() * pool.length)], team = engine.teamById(state, state.userTeamId);
  const club = team ? team.name : 'that club';
  const texts = [
    'someone leaked {club}\'s betting record. ' + money(rk.staked30) + ' through the book in ' + rk.count30 + ' wagers this month. and they preach "focus on the server"',
    '{club} staff and the sportsbook, a love story: ' + rk.count30 + ' bets in 30 days, ' + money(rk.staked30) + ' staked. sponsors, you saw this right?',
    rk.net90 < 0 ? 'the {club} betting slip leak is brutal. ' + money(rk.net90) + ' over three months. integrity office, are you reading?' : 'how does {club} keep hitting upsets in its own division? asking for the integrity office'
  ];
  const text = texts[Math.floor(rand() * texts.length)].replace(/\{club\}/g, club);
  const post = {
    id: state.nextId++, date: state.currentDate, likes: 0, reposts: 0, replies: 0, views: 0, kind: 'player', authorId: p.id, name: p.name, handle: engine.handleFor ? engine.handleFor(p.name) : '@' + p.name.toLowerCase(),
    club: engine.teamById(state, p.teamId) ? engine.teamById(state, p.teamId).name : 'Free agent', followers: p.followers || 0, verified: (p.followers || 0) >= 50000, text, ctx: 'leak', ux: true
  };
  post.views = Math.round(Math.max(2000, post.followers) * (0.6 + rand()));
  post.likes = Math.round(post.views * 0.06); post.reposts = Math.round(post.likes * 0.2); post.replies = Math.round(post.likes * 0.12);
  state.social.posts.unshift(post);
  return post;
}

function inbox(state, type, title, body) {
  state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type, title, link: 'inbox', body });
  if (state.inbox.length > 120) state.inbox.splice(0, state.inbox.length - 120);
}

// once a day (after the day's bets are settled). Returns what happened, for tests: { audit, leak }
function tick(state, engine) {
  if (!state || !state.userTeamId || !state.inbox) return null;
  if (!(state.uxBets || []).length && !(state.bets || []).length) return null;
  const u = ensure(state), today = state.currentDate;
  if (u.freezeUntil && u.freezeUntil < today && !u.freezeNoted) { u.freezeNoted = true; inbox(state, 'board', 'Betting freeze lifted', 'RLCS Integrity has lifted the betting freeze. A further audit will be harsher.'); }
  const rk = risk(state, engine), rand = mkRand(hash('integrity:' + today + ':' + state.userTeamId));
  const team = engine.teamById(state, state.userTeamId), res = {};
  if (rk.score >= AUDIT_AT && (!u.lastAudit || days(u.lastAudit, today) >= AUDIT_GAP) && !frozenUntil(state)) {
    const lvl = u.audits; u.audits++; u.lastAudit = today;
    const fine = Math.round(Math.min(Math.max(2500, 0.1 * rk.staked30), 0.15 * (team ? team.budget : 0)) / 100) * 100;
    const out = ['fine'];
    if (lvl >= 1) { u.freezeUntil = addDays(today, lvl >= 2 ? 30 : 14); u.freezeNoted = false; out.push('freeze'); }
    if (lvl >= 2 || (lvl === 1 && rand() < 0.3)) out.push('strike');
    if (team && fine > 0) { team.budget -= fine; u.fines += fine; try { engine.pushLedger(state, 'bet', -fine, 'RLCS Integrity fine'); } catch (e) { /* ledger optional */ } }
    if (out.includes('strike')) { u.strikes++; let sack = 10; try { sack = (engine.boardSummary(state) || {}).sackAt || 10; } catch (e) { /* default */ } state.boardPressure = Math.min((state.boardPressure || 0) + 1, sack - 1.5); }
    const body = 'RLCS Integrity opened an audit into your club\'s betting. ' + rk.reasons.join(' ') + '\n\n' +
      (out.includes('fine') ? 'Fine: ' + money(fine) + '.\n' : '') + (out.includes('freeze') ? 'Betting is frozen until ' + u.freezeUntil + '.\n' : '') + (out.includes('strike') ? 'The board has recorded a strike against you.\n' : '') + (lvl === 0 ? '\nThis is a first warning.' : '');
    inbox(state, 'board', 'RLCS Integrity audit', body);
    u.log.push({ date: today, outcome: out, fine, reasons: rk.reasons }); if (u.log.length > 40) u.log.shift();
    res.audit = { outcome: out, fine, freezeUntil: u.freezeUntil };
    leakPost(state, engine, rk, rand); u.lastLeak = today; res.leak = true;
    inbox(state, 'news', 'Sponsors ask about your betting record', 'The audit made the news. Partners want to know why your club\'s betting record is public: ' + rk.count30 + ' wagers and ' + money(rk.staked30) + ' staked in 30 days.');
  } else if (rk.score >= LEAK_AT && (!u.lastLeak || days(u.lastLeak, today) >= LEAK_GAP) && rand() < 0.4) {
    if (leakPost(state, engine, rk, rand)) { u.lastLeak = today; res.leak = true; inbox(state, 'news', 'Your betting record is on Y', 'A post about your club\'s wagering is spreading. Staying quiet about it is a choice, but the sponsors can read.'); }
  }
  return res;
}

function view(state, engine) {
  const rk = risk(state, engine), u = state.uxBetting || {};
  return { risk: rk.score, level: level(rk.score), reasons: rk.reasons, frozenUntil: frozenUntil(state), strikes: u.strikes || 0, audits: u.audits || 0, fines: u.fines || 0 };
}

module.exports = { entries, stats, history, risk, tick, view, frozenUntil, level, AUDIT_AT, LEAK_AT };
