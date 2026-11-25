'use strict';
// Merge <region>-selected.json + <region>-players.json into src/engine/btier-teams.json (replaces that region's teams only).
// usage: node build-region.js eu           (the 32 selected teams)
//        node build-region.js eu extra     (appends the 16 extra reserve teams of <region>-extra.json after the first 16; strength 58 -> 55)
// - baseStrength is a PLACEHOLDER from the team's rank in the selection (68 best -> 55 worst, +-1 by name hash).
// - Missing nation/born are GENERATED (deterministic from the handle, so reruns give the same values) and listed in
//   player.generated + needsVerification:true. Rules: nation = Liquipedia flag > most common teammate nation > region pool;
//   age 17-24 (weighted to 18-22), random birthday.
const fs = require('fs');
const path = require('path');
const L = require('../src/engine/btier-loader');

const region = process.argv[2] || 'eu';
const ds = path.join(__dirname, '..', 'data-sources');
const dbFile = path.join(__dirname, '..', 'src', 'engine', 'btier-teams.json');
const EXTRA = process.argv[3] === 'extra';
const sel = JSON.parse(fs.readFileSync(path.join(ds, `${region}-${EXTRA ? 'extra' : 'selected'}.json`), 'utf8'));
const info = JSON.parse(fs.readFileSync(path.join(ds, `${region}-players.json`), 'utf8'));
const TODAY = new Date('2026-11-18T00:00:00Z');
const SOURCE = `https://liquipedia.net/rocketleague/Rocket_League_Championship_Series/2026 (${region.toUpperCase()} Opens 1-6 participants)`;

// Nation names follow the game's flag list (data/flags.json).
const FLAG = {
  us: 'United States', ca: 'Canada', mx: 'Mexico', br: 'Brazil', ar: 'Argentina', cl: 'Chile', uy: 'Uruguay', bo: 'Bolivia', pt: 'Portugal', es: 'Spain', fr: 'France', de: 'Germany',
  uken: 'England', uksc: 'Scotland', ukni: 'Northern Ireland', nl: 'Netherlands', be: 'Belgium', it: 'Italy', pl: 'Poland', cz: 'Czech Republic', ch: 'Switzerland', tr: 'Turkey', vn: 'Vietnam',
  au: 'Australia', nz: 'New Zealand', nc: 'New Caledonia', sa: 'Saudi Arabia', kw: 'Kuwait', jo: 'Jordan', om: 'Oman', ps: 'Palestine', eg: 'Egypt', dz: 'Algeria', ma: 'Morocco', uae: 'United Arab Emirates',
  jp: 'Japan', kr: 'South Korea', in: 'India', pk: 'Pakistan', id: 'Indonesia', my: 'Malaysia', sg: 'Singapore', hk: 'Hong Kong', mn: 'Mongolia', mv: 'Maldives', bd: 'Bangladesh', iq: 'Iraq',
  za: 'South Africa', re: 'Réunion', ke: 'Kenya', gh: 'Ghana', ng: 'Nigeria', ro: 'Romania', lu: 'Luxembourg', kz: 'Kazakhstan', ru: 'Russia'
};
// Pools of plausible nationalities (weighted by repetition) for players with no other hint.
const POOL = {
  eu: ['France', 'France', 'England', 'England', 'Germany', 'Germany', 'Spain', 'Netherlands', 'Belgium', 'Sweden', 'Italy', 'Poland', 'Denmark', 'Portugal'],
  na: ['United States', 'United States', 'United States', 'United States', 'Canada', 'Canada', 'Mexico'],
  sam: ['Brazil', 'Brazil', 'Brazil', 'Argentina', 'Argentina', 'Chile', 'Uruguay'],
  oce: ['Australia', 'Australia', 'Australia', 'New Zealand'],
  mena: ['Saudi Arabia', 'Saudi Arabia', 'Saudi Arabia', 'Kuwait', 'Jordan', 'Egypt', 'United Arab Emirates', 'Algeria'],
  apac: ['Japan', 'Japan', 'India', 'Pakistan', 'Indonesia', 'Malaysia', 'Singapore', 'South Korea'],
  ssa: ['South Africa', 'South Africa', 'South Africa', 'Réunion', 'Kenya', 'Nigeria']
};
const AGES = [17, 18, 18, 19, 19, 19, 20, 20, 20, 21, 21, 21, 22, 22, 23, 24];

const hash = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const pick = (arr, seed) => arr[hash(seed) % arr.length];
const clamp = (v) => Math.max(L.OVR_MIN, Math.min(L.OVR_MAX, v));
const ageOn = (born) => { const b = new Date(born + 'T00:00:00Z'); let a = TODAY.getUTCFullYear() - b.getUTCFullYear(); if (TODAY < new Date(Date.UTC(TODAY.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))) a--; return a; };
const pad = (n) => String(n).padStart(2, '0');
function fakeBorn(seed) {
  const age = pick(AGES, 'age:' + seed);
  const month = 1 + (hash('m:' + seed) % 12);
  const day = 1 + (hash('d:' + seed) % 28);
  return `${TODAY.getUTCFullYear() - age - 1}-${pad(month)}-${pad(day)}`;
}

const teams = sel.map((t, i) => {
  const base = EXTRA ? 58 - Math.round((i * 3) / Math.max(1, sel.length - 1)) : 68 - Math.round((i * 13) / (sel.length - 1));
  const raw = t.latest.players.map((p) => ({ p, d: info[p.name] || {} }));
  const known = raw.map((r) => r.d.nation).filter(Boolean);
  const mates = known.length ? known.sort((a, b) => known.filter((x) => x === b).length - known.filter((x) => x === a).length)[0] : null;
  const players = raw.map(({ p, d }) => {
    const pl = { name: p.name, baseStrength: clamp(base + (hash(p.name) % 3) - 1) };
    const generated = [];
    pl.nation = d.nation || FLAG[p.flag] || null;
    if (!pl.nation) { pl.nation = mates || pick(POOL[region], `nat:${t.name}:${p.name}`); generated.push('nation'); }
    pl.born = /^\d{4}-\d{2}-\d{2}$/.test(d.born || '') ? d.born : null;
    if (!pl.born) { pl.born = fakeBorn(`${t.name}:${p.name}`); generated.push('born'); }
    pl.age = ageOn(pl.born);
    if (generated.length) { pl.generated = generated; pl.needsVerification = true; }
    return pl;
  });
  return { name: t.name, needsVerification: players.some((p) => p.needsVerification), source: SOURCE, players };
});

const db = L.loadRaw(dbFile);
const dbr = db.regions.find((r) => r.id === region);
dbr.teams = EXTRA ? dbr.teams.slice(0, L.ACTIVE_PER_REGION).concat(teams) : teams;
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2) + '\n');

const data = path.join(__dirname, '..', '..', 'app_extracted', 'data');
const tierA = L.tierANames(require(path.join(data, 'rlcs.json')), require(path.join(data, 'rlcs-2027.json')));
const v = L.validate(db, { tierA });
const gen = teams.flatMap((t) => t.players).filter((p) => p.generated).length;
console.log(`${region}: wrote ${teams.length} teams; ok=${v.ok} errors=${v.errors.length}; generated fields on ${gen}/${teams.length * 3} players`);
if (v.errors.length) console.log(v.errors.join('\n'));
