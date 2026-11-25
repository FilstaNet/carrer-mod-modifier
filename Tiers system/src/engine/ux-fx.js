// Y, Phase 4: light, capped consequences. One number, the club's "Y reputation" (-10..10, decays ~7%/day), is moved by what the feed
// does around the user's club (titles, upsets, routs, transfers, rumours, callouts) and by what the user posts in player career.
// It nudges only three things, each with a hard cap:
//   followers of the squad (the game's sponsor income is sqrt of squad followers): at most 0.3% of a player's followers per day per 10 rep
//   new media-offer fees: +-10% at the extremes, applied once per offer
//   morale: at most +-3 per player per 7 days from Y in total (rumours, callouts, teammates' reaction to a post)
// Everything lives in state.social.ux.fx (plain JSON; created on first use, so older saves load unchanged).
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const MORALE_CAP = 3, REP_MAX = 10;

function create(engine, env) {
  const F = (state) => { const u = env.ux(state); return u.fx || (u.fx = { rep: 0, log: [], mor: {}, notice: null, lastRumourMail: null }); };
  const squad = (state) => { const t = engine.teamById(state, state.userTeamId); return t ? t.playerIds.map((id) => engine.playerById(state, id)).filter((p) => p && !p.retired) : []; };

  function addRep(state, d, why) {
    const f = F(state);
    f.rep = clamp(r1(f.rep + d), -REP_MAX, REP_MAX);
    f.log.push({ d: state.currentDate, v: d, why }); if (f.log.length > 20) f.log.shift();
  }

  // morale, but never more than +-3 per player per 7 days from Y (the game's own morale rules are untouched)
  function morale(state, p, delta) {
    if (!p || p.retired || typeof engine.adjustMorale !== 'function') return;
    const f = F(state), day = state.currentDate, m = f.mor[p.id] || (f.mor[p.id] = { d: day, t: 0 });
    if (daysBetween(m.d, day) >= 7) { m.d = day; m.t = 0; }
    const allowed = clamp(m.t + delta, -MORALE_CAP, MORALE_CAP) - m.t;
    if (!allowed) return;
    m.t = r1(m.t + allowed); engine.adjustMorale(p, allowed);
  }

  function inbox(state, title, body) {
    try { state.inbox.push({ id: state.nextId++, date: state.currentDate, unread: true, resolved: false, type: 'news', title, body }); } catch (e) { /* inbox optional */ }
  }

  // what happened around the user's club in the news
  function fromEvent(state, k, tm, ot, userId) {
    const won = tm && tm.id === userId, lost = ot && ot.id === userId;
    const d = { title: won ? 1.5 : 0, upset: won ? 0.7 : lost ? -0.5 : 0, rout: won ? 0.5 : lost ? -0.6 : 0, 'club-series': won ? -0.3 : 0, signing: won ? 0.4 : lost ? -0.2 : 0, 'free-agent': won ? 0.2 : 0 }[k] || 0;
    if (d) addRep(state, d, k);
  }

  function onRumour(state, pl) { // a rumour is going round about one of the user's players
    if (!pl || pl.teamId !== state.userTeamId) return;
    addRep(state, -0.3, 'rumour'); morale(state, pl, -1);
    const f = F(state);
    if (!f.lastRumourMail || daysBetween(f.lastRumourMail, state.currentDate) >= 7) {
      f.lastRumourMail = state.currentDate;
      inbox(state, pl.name + ' is being linked with a move on Y', 'There is talk about ' + pl.name + ' on Y. It may be nothing, but the dressing room can read the same posts. Y reputation: ' + f.rep + '.');
    }
  }
  function onRumourEnd(state, pl) { if (pl && pl.teamId === state.userTeamId) morale(state, pl, 1); } // it came to nothing, he settles
  function onCallout(state, target) { if (target && target.teamId === state.userTeamId) { addRep(state, -0.3, 'callout'); morale(state, target, -1); } }

  // the player posted (player career). gain is what the game already granted; backlash and sympathy adjust it a little
  function onUserPost(state, opt, mod, res) {
    const me = engine.playerById(state, state.userPlayerId); if (!me || !opt) return;
    const lost = mod && ['loss', 'benchLoss', 'final'].indexOf(mod.kind) >= 0, t = opt.tone, gain = (res && res.gain) || 0;
    let rep = 0, adj = 0, mates = 0;
    if ((t === 'cocky' || t === 'callout') && lost) { rep = -0.8; adj = -Math.round(gain * 0.4); mates = -0.5; }
    else if (t === 'callout') rep = -0.5;
    else if (t === 'cocky' || t === 'hype') rep = 0.2;
    else if (t === 'humble' || t === 'thanks' || t === 'respect') { rep = 0.4; if (lost) mates = 0.5; }
    else if (t === 'apology' || t === 'emotional') { rep = lost ? 0.3 : 0.1; if (lost) { adj = Math.round(gain * 0.2); mates = 0.5; } }
    else if (t === 'analyst') rep = 0.1;
    if (rep) addRep(state, rep, 'post:' + t);
    if (adj) { me.followers = Math.max(50, (me.followers || 0) + adj); if (res) res.gain = gain + adj; }
    if (mates) squad(state).forEach((p) => { if (p.id !== me.id) morale(state, p, mates); });
  }

  // once per simulated day: decay, then the capped follower and morale nudges
  function tick(state, day) {
    const f = F(state);
    f.rep = Math.abs(f.rep) < 0.05 ? 0 : r1(f.rep * 0.93);
    if (Math.abs(f.rep) >= 1) {
      const k = f.rep * 0.0003;
      const team = engine.teamById(state, state.userTeamId);
      squad(state).forEach((p) => { if (p.followers) p.followers = Math.max(50, p.followers + Math.round(p.followers * k)); });
      if (team && team.followers) team.followers = Math.max(50, team.followers + Math.round(team.followers * k));
    }
    if (Math.abs(f.rep) >= 4) squad(state).forEach((p) => morale(state, p, f.rep > 0 ? 0.2 : -0.2));
    const band = f.rep >= 5 ? 'buzz' : f.rep <= -5 ? 'backlash' : null;
    if (band && (!f.notice || f.notice.band !== band || daysBetween(f.notice.date, day) >= 21)) {
      f.notice = { band, date: day };
      inbox(state, band === 'buzz' ? 'Y is buzzing about the club' : 'Y is turning on the club', band === 'buzz' ? 'Fans and media are in your corner right now. Followers and media fees are drifting up a little.' : 'The mood on Y has soured. Followers are slipping and new media fees are lower until it blows over.');
    } else if (!band && f.notice) f.notice = null;
  }

  // new media offers get their fee nudged once (+-10% at the extremes)
  function onOffers(state) {
    const f = F(state), k = 1 + clamp(f.rep, -REP_MAX, REP_MAX) * 0.01;
    for (const o of state.mediaOffers || []) if (!o.fx) { o.fx = 1; if (o.fee) o.fee = Math.round(o.fee * k); }
  }

  return { addRep, morale, fromEvent, onRumour, onRumourEnd, onCallout, onUserPost, tick, onOffers, state: F };
}

module.exports = { create };
