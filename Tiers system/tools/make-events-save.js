'use strict';
// Writes TEST career saves for the real game, with many kinds of events close together, to try the Home "event view" quickly.
//   node tools/make-events-save.js A [fileName=test-events-a]   Tier A (Team Vitality, benched user): the Esports World Cup starts in 3 days, with a showmatch, a showdown,
//                                                              an Invitational and an own circuit booked around it, plus the LCQ and Worlds (Swiss) later in the same save
//   node tools/make-events-save.js B [fileName=test-events-b]   Tier B manager: the promotion group is drawn and starts tomorrow, a showmatch invitation is accepted for right after it
// The save goes to %APPDATA%/rl-career-hub/saves/<fileName>.json. It never overwrites an existing file.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
const ev = require(path.join(R, 'app_extracted', 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(R, 'app_extracted', 'engine', 'league.js')), { events: ev });
const real = require(path.join(R, 'app_extracted', 'data', 'rlcs-2027.json'));
const kind = String(process.argv[2] || 'A').toUpperCase() === 'B' ? 'B' : 'A';
const fileName = process.argv[3] || 'test-events-' + kind.toLowerCase();
const dir = path.join(process.env.APPDATA, 'rl-career-hub', 'saves'), file = path.join(dir, fileName + '.json');
if (!fs.existsSync(dir)) throw new Error('Save folder not found: ' + dir);
if (fs.existsSync(file)) throw new Error('Refusing to overwrite ' + file);

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const fresh = (teamName, rand) => engine.generateLeague({ teamName, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const finish = (st, label, lines) => {
  Object.assign(st, { lastResultSeq: 0, profile: { avatar: null, banner: null, bio: null, reachSeen: false, siteDark: false, siteDarkOverride: null }, creators: [], notes: {}, dms: [] });
  fs.writeFileSync(file, JSON.stringify({ name: label, state: st, savedAt: new Date().toISOString() }));
  console.log('wrote', file, '| date', st.currentDate);
  lines.forEach((l) => console.log(' -', l));
};
// one day; a match the user has to play is simulated here (the real game would ask)
const stepOf = (st, rand) => () => { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } };
const untilOf = (step) => (cond, max = 900) => { for (let i = 0; i < max && !cond(); i++) step(); if (!cond()) throw new Error('did not finish in ' + max + ' steps'); };

if (kind === 'A') {
  const rand = mkRand(7);
  engine.uxLate.REQ.major = 0; engine.uxLate.REQ.open = 0; // skip the unlock grind while building
  const st = fresh('Team Vitality', rand), me = engine.teamById(st, st.userTeamId);
  me.budget = 20e6; me.followers = Math.max(me.followers || 0, 300000);
  for (let i = 1; i <= 4; i++) engine.buyFacility(st, i);
  const step = stepOf(st, rand), until = untilOf(step);
  const uxl = (o) => engine.placeBet(st, 'uxl:' + JSON.stringify(o), 0, 0, 0), uxc = (o) => engine.placeBet(st, 'uxc:' + JSON.stringify(o), 0, 0, 0);
  step(); step(); uxl({ a: 'mode', mode: 'standard' });
  for (let l = 1; l <= 2; l++) { if (!uxl({ a: 'build', id: 'arena' }).ok) throw new Error('arena level ' + l + ' refused'); until(() => engine.uxLate.build.level(st, 'arena') >= l); }
  st.late.wins = { major: 2, open: 5, seen: [] };
  const ewc = () => st.uxMajors.events.find((e) => e.kind === 'ewc' && e.season === st.season && !e.skipped);
  until(() => ewc() && addDays(ewc().startDate, -6) <= st.currentDate);
  st.ranking[me.id] = Math.max(...Object.values(st.ranking)) + 50; // make sure the club is in the World Cup field (the best 16 by ranking points)
  until(() => ewc().stage !== 'pending'); // drawn 2 days before it starts
  me.budget = 20e6;
  const lines = [], club = engine.uxClub, today = st.currentDate;
  const rivals = st.teams.filter((t) => t.id !== me.id && !t.nation && t.region && !/_b$/.test(t.region) && String(t.region) === String(me.region)).map((t) => t.id);
  const day = (from, len, margin) => club.windows(st, len, 80, margin).find((d) => d >= from) || null; // margin 0 for small events, the default (4) for hosted ones
  const book = (label, o) => { const r = uxc(o); lines.push(label + ': ' + (r.ok ? o.start || 'booked' : 'NOT booked (' + r.error + ')')); return r; };
  // the Esports World Cup is already drawn; book the rest around it
  const smDay = day(addDays(today, 1), 1, 0);
  if (smDay) book('Showmatch 3v3 (you vs a rival)', { a: 'smatch', mode: '3v3', start: smDay, prize: 10000, pairs: [{ a: { me: true }, b: { t: rivals[0] }, bo: 3 }, { a: { t: rivals[1] }, b: { t: rivals[2] }, bo: 1 }] });
  const sdDay = day(addDays(ewc().endDate, 1), 1, 0);
  if (sdDay) book('Showdown 2v2', { a: 'show', mode: '2v2', start: sdDay, prize: 120000 });
  const invDay = day(addDays(sdDay || ewc().endDate, 2), 3);
  if (invDay) book('Invitational (8 clubs)', { a: 'host', size: 8, start: invDay, prize: club.planInvitational(st, { size: 8, start: invDay, prize: 1e6 }).lo || 450000, sponsors: [0, 1], name: 'Test Invitational' });
  const stops = []; for (const d of club.windows(st, 3, 120).filter((x) => x > addDays(today, 25))) if (!stops.length || Date.parse(d) - Date.parse(stops[stops.length - 1]) >= 8 * 864e5) stops.push(d);
  const fin = stops.length >= 3 ? club.windows(st, 4, 200).find((d) => d >= addDays(stops[2], 14)) : null;
  if (stops.length >= 3 && fin) { const r = uxl({ a: 'circuit', name: 'Test Circuit', stops: stops.slice(0, 3), finalsStart: fin, prize: 450000, finalsPrize: 900000 }); lines.push('Own circuit: ' + (r.ok ? stops.slice(0, 3).join(', ') + ', finals ' + fin : 'NOT booked (' + r.error + ')')); }
  lines.unshift('Esports World Cup: ' + ewc().startDate + ' to ' + ewc().endDate + ' (you are' + (ewc().field.includes(me.id) ? '' : ' NOT') + ' in the field)');
  lines.push('User player ' + st.userPlayerId + (engine.userLineup(st).slice(0, 3).includes(st.userPlayerId) ? ' is in' : ' is NOT in') + ' the starting three (the benched case that used to skip showmatches)');
  me.budget = 20e6;
  finish(st, 'Team Vitality (events test, Tier A)', lines);
} else {
  // a Tier B club that ends up in the promotion group (places 3 to 6): found by trying clubs; the run is deterministic per club and seed
  const probe = fresh('Team Vitality', mkRand(7));
  const bClubs = probe.teams.filter((t) => t.region === 'eu_b').map((t) => t.name);
  let done = false;
  for (let k = 0; k < bClubs.length && !done; k++) {
    const rand = mkRand(11 + k), st = fresh(bClubs[k], rand), me = engine.teamById(st, st.userTeamId);
    const step = stepOf(st, rand), until = untilOf(step);
    const grp = () => { const p = st.tierB && st.tierB.promo && st.tierB.promo.season === st.season ? st.tierB.promo.regions[st.userRegion] : null; return p && p.format === 'rr' ? p : null; };
    until(() => grp() || st.season > 1, 900);
    const p = grp(); if (!p || !p.seeds.includes(me.id) || st.currentDate >= p.startDate) continue;
    me.budget = Math.max(me.budget, 3e6);
    const lines = ['Promotion group: ' + p.startDate + ' to ' + p.endDate + ' (best of 7, 3 matchdays), your club ' + me.name + ' is in it'], club = engine.uxClub;
    // a showmatch invitation, accepted, for a free day after the group
    const sday = club.windows(st, 1, 60, 0).find((d) => d > p.endDate), opp = st.teams.find((t) => t.id !== me.id && !t.nation && t.region === st.userRegion && (t.playerIds || []).length >= 3);
    if (sday && opp) {
      const d = engine.uxClub.ensure(st); (d.smInv = d.smInv || []).push({ id: st.nextId++, sent: st.currentDate, start: sday, expires: addDays(sday, -2), mode: '3v3', opp: { t: opp.id }, oppName: opp.name, fee: 2000, part: 800, growth: 400, status: 'open' });
      const r = engine.placeBet(st, 'uxc:' + JSON.stringify({ a: 'smaccept', id: d.smInv[d.smInv.length - 1].id }), 0, 0, 0);
      lines.push('Showmatch 3v3 vs ' + opp.name + ': ' + (r.ok ? sday : 'NOT accepted (' + r.error + ')'));
    } else lines.push('Showmatch: no free day found after the group');
    finish(st, me.name + ' (events test, Tier B)', lines); done = true;
  }
  if (!done) throw new Error('no Tier B club reached the promotion group in the tries made');
}
