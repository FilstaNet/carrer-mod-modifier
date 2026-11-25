'use strict';
// Tournament MVPs and Player of the Year. Stored in state.uxAwards (a new key: old saves simply get it on first use).
//  - Tournament MVP: scored from the event's own fixtures (per-game lines), only for players whose team reached the playoffs.
//    Events with no fixtures (the other regions' Opens are simulated slot by slot) get a modelled MVP from the placings.
//  - Player of the Year: scored from the season's stats, MVPs and the game's own titles just before the season rolls over.
const CHAMPION_KINDS = { worlds_champion: 25, major_champion: 15, regional_champion: 5 };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

function install(engine, ev, opts = {}) {
  const log = opts.log || (() => {});
  const titles = opts.titles || null;
  if (!engine || engine.uxAwards) return engine && engine.uxAwards;
  const safe = (what, fn) => { try { return fn(); } catch (e) { log('ux-awards: ' + what + ' failed: ' + e.stack); return undefined; } };
  const ens = (s) => s.uxAwards || (s.uxAwards = { v: 1, mvp: [], poty: [], done: {} });
  const team = (s, id) => engine.teamById(s, id);
  const player = (s, id) => engine.playerById(s, id);
  const year = (s) => (titles && titles.seasonYear ? titles.seasonYear(s) : null);

  // ---------- Tournament MVP ----------
  const placeBonus = (pl) => (pl === 1 ? 10 : pl === 2 ? 6 : pl <= 4 ? 3 : pl <= 8 ? 1 : 0);
  // fixtures: the event's played fixtures. returns {playerId, score, teamId} or null
  function mvpFromFixtures(s, e, fixtures) {
    const standings = e.standings || [], place = new Map(standings.map((x) => [x.teamId, x.placement]));
    const playoffTeams = new Set();
    for (const f of fixtures) if (f.stage && f.stage !== 'group') { playoffTeams.add(f.homeId); playoffTeams.add(f.awayId); }
    if (!playoffTeams.size) for (const x of standings) if (x.placement <= 4) playoffTeams.add(x.teamId);
    const acc = new Map(); // playerId -> {score, goals, teamId}
    const row = (id, teamId) => { let r = acc.get(id); if (!r) { r = { id, teamId, score: 0, goals: 0 }; acc.set(id, r); } return r; };
    for (const f of fixtures) {
      for (const g of f.games || []) for (const [lines, tid] of [[g.homeLines, f.homeId], [g.awayLines, f.awayId]]) for (const l of lines || []) {
        const r = row(l.id, tid); r.goals += l.goals || 0; r.score += (l.points || 0) / 100 + (l.goals || 0) + 0.6 * (l.assists || 0) + 0.5 * (l.saves || 0);
      }
      if (f.mvpId >= 0) { const p = player(s, f.mvpId); if (p) row(f.mvpId, p.teamId).score += 3; }
    }
    let best = null;
    for (const r of acc.values()) {
      if (!playoffTeams.has(r.teamId)) continue;
      const pl = place.get(r.teamId) || 99; r.pl = pl; r.total = r.score + placeBonus(pl);
      // ties: better placement, then more goals, then lower id (stable)
      if (!best || r.total > best.total || (r.total === best.total && (pl < best.pl || (pl === best.pl && (r.goals > best.goals || (r.goals === best.goals && r.id < best.id)))))) best = r;
    }
    return best ? { playerId: best.id, teamId: best.teamId, score: Math.round(best.total * 10) / 10, modelled: false } : null;
  }
  // events with no fixtures (simulated slot by slot): model it from the placings and player ratings
  function mvpModelled(s, e) {
    let best = null;
    for (const x of (e.standings || []).filter((q) => q.placement <= 4)) {
      const t = team(s, x.teamId); if (!t) continue;
      for (const pid of t.playerIds || []) {
        const p = player(s, pid); if (!p || p.isUser) continue;
        const v = p.rating / 10 + placeBonus(x.placement) + (hash(e.id + ':' + pid) % 300) / 100;
        if (!best || v > best.total || (v === best.total && x.placement < best.pl)) best = { playerId: pid, teamId: x.teamId, total: v, pl: x.placement };
      }
    }
    return best ? { playerId: best.playerId, teamId: best.teamId, score: Math.round(best.total * 10) / 10, modelled: true } : null;
  }
  // the game hands out event ids and shadow-event ids from one counter, so a simulated region's event can share an id with a real one: key on the region too
  const keyOf = (e) => 'e' + e.id + (e.regionId ? ':' + e.regionId : '');
  function record(s, e, res, regionName) {
    const u = ens(s), key = keyOf(e); if (u.done[key] || !res) { u.done[key] = true; return; }
    u.done[key] = true;
    const p = player(s, res.playerId), t = team(s, res.teamId);
    u.mvp.push({ key, season: s.season, kind: e.kind, event: e.name, region: regionName || e.regionName || null, endDate: e.endDate, playerId: res.playerId, name: p ? p.name : '?', teamId: res.teamId, teamName: t ? t.name : '?', score: res.score, modelled: res.modelled });
  }
  function eventMvp(s, e, regionName) {
    const fx = (s.fixtures || []).filter((f) => f.played && f.eventId === e.id);
    record(s, e, fx.length ? mvpFromFixtures(s, e, fx) : mvpModelled(s, e), regionName);
  }
  // every finished game event that has no MVP yet: Opens / Majors / Worlds (not the LCQ), in your region and the simulated ones
  function scan(s) {
    const u = ens(s);
    for (const e of s.events || []) if (e.stage === 'done' && !e.skipped && e.kind !== 'lcq' && !u.done[keyOf(e)]) eventMvp(s, e, null);
    for (const [rid, list] of Object.entries(s.regionEvents || {})) {
      const rn = ((s.regions || []).find((r) => r.id === rid) || {}).name || rid;
      for (const e of list || []) if (e.stage === 'done' && !e.skipped && e.kind !== 'lcq' && !u.done[keyOf(e)] && e.standings) eventMvp(s, e, rn);
    }
  }

  // ---------- Player of the Year ----------
  function seasonEnd(s) {
    const u = ens(s); if (u.poty.some((x) => x.season === s.season)) return;
    const y = year(s), mvpWins = new Map();
    for (const m of u.mvp) if (m.season === s.season) mvpWins.set(m.playerId, (mvpWins.get(m.playerId) || 0) + 1);
    let best = null;
    for (const p of s.players) {
      if (p.retired || p.isUser || !p.season || (p.season.games || 0) < 10) continue;
      const t = p.teamId >= 0 ? team(s, p.teamId) : null; if (!t || /_b$/.test(t.region || '')) continue; // Tier A only
      const q = p.season, per = (q.goals || 0) + 0.6 * (q.assists || 0) + 0.5 * (q.saves || 0);
      let v = per + 3 * (q.mvps || 0) + 12 * (mvpWins.get(p.id) || 0);
      for (const tt of p.titles || []) if (tt.y === y && CHAMPION_KINDS[tt.k]) v += CHAMPION_KINDS[tt.k];
      v += (q.wins || 0) * 0.5;
      if (!best || v > best.v || (v === best.v && p.rating > best.p.rating)) best = { p, t, v };
    }
    if (!best) return;
    u.poty.push({ season: s.season, playerId: best.p.id, name: best.p.name, teamId: best.t.id, teamName: best.t.name, score: Math.round(best.v * 10) / 10, rating: best.p.rating });
    if (best.p.teamId === s.userTeamId && s.inbox) s.inbox.push({ id: s.nextId++, date: s.currentDate, unread: true, resolved: false, type: 'news', title: best.p.name + ' is Player of the Year', link: 'inbox', body: 'Season ' + s.season + ': ' + best.p.name + ' of your club is crowned Player of the Year.' });
  }

  // ---------- profile helpers + actions ----------
  const countsFor = (s, id) => { const u = s.uxAwards || { mvp: [], poty: [] }; return { mvp: u.mvp.filter((m) => m.playerId === id).length, poty: u.poty.filter((m) => m.playerId === id).length }; };

  // ---------- hooks ----------
  const adv = engine.advance;
  if (typeof adv === 'function') engine.advance = function advanceWithAwards(s) { const r = adv.apply(this, arguments); if (s) safe('scan', () => scan(s)); return r; };
  const nxt = engine.startNextSeason;
  if (typeof nxt === 'function') engine.startNextSeason = function startNextSeasonWithAwards(s) { safe('scan', () => scan(s)); safe('poty', () => seasonEnd(s)); return nxt.apply(this, arguments); };

  const api = { ens, eventMvp, seasonEnd, scan, countsFor };
  engine.uxAwards = api;
  log('ux-awards installed');
  return api;
}

module.exports = { install };
