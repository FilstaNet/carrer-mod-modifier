'use strict';
// Loads and validates btier-teams.json. Pure Node, no dependencies, no game imports.
const fs = require('fs');
const path = require('path');

const REGIONS = ['eu', 'na', 'sam', 'oce', 'mena', 'apac', 'ssa'];
const TEAMS_PER_REGION = 32; // teams in the database per region
const ACTIVE_PER_REGION = 16; // first 16 per region play; the rest are the hidden reserve (see btier-reserve.js)
const PLAYERS_PER_TEAM = 3;
const OVR_MIN = 55;
const OVR_MAX = 68;
const DEFAULT_FILE = path.join(__dirname, 'btier-teams.json');

const NOISE = /\b(team|esports?|gaming|club|fc)\b/g;

// Two keys per name: full and with generic words removed ("Team Vitality" ~ "Vitality").
function nameKeys(name) {
  const base = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const full = base.replace(/[^a-z0-9]/g, '');
  const short = base.replace(NOISE, ' ').replace(/[^a-z0-9]/g, '');
  return short && short !== full ? [full, short] : [full];
}

// realData: game roster file(s) in the rlcs.json shape ({regions:[{id,teams:[{name}]}]}).
function tierANames(...realData) {
  const keys = new Set();
  for (const d of realData) {
    for (const r of (d && d.regions) || []) for (const t of r.teams || []) nameKeys(t.name).forEach((k) => keys.add(k));
  }
  return keys;
}

function loadRaw(file = DEFAULT_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Flatten to team objects with the derived tier fields. Never throws on bad rows; validate() reports them.
function flatten(db) {
  const out = [];
  for (const r of (db && db.regions) || []) {
    for (const t of r.teams || []) {
      out.push({ ...t, tier: 'B', homeRegion: r.id, region: r.id + '_b' });
    }
  }
  return out;
}

// opts.tierA: Set from tierANames(). opts.complete: require 32 teams/region (final data check).
function validate(db, opts = {}) {
  const errors = [];
  const warnings = [];
  const teams = flatten(db);
  const regionIds = ((db && db.regions) || []).map((r) => r.id);
  for (const id of REGIONS) if (!regionIds.includes(id)) errors.push(`missing region "${id}"`);
  for (const id of regionIds) if (!REGIONS.includes(id)) errors.push(`unknown region "${id}"`);

  const seen = new Map();
  for (const t of teams) {
    const label = `${t.homeRegion}/${t.name || '?'}`;
    if (!t.name || typeof t.name !== 'string') { errors.push(`${label}: team has no name`); continue; }
    const keys = nameKeys(t.name);
    for (const k of keys) {
      if (seen.has(k) && seen.get(k) !== label) errors.push(`${label}: duplicate of Tier B team ${seen.get(k)}`);
      seen.set(k, label);
      if (opts.tierA && opts.tierA.has(k)) errors.push(`${label}: already exists in Tier A`);
    }
    if (t.needsVerification) warnings.push(`${label}: team flagged needsVerification`);
    const ps = t.players;
    if (!Array.isArray(ps) || ps.length !== PLAYERS_PER_TEAM) {
      errors.push(`${label}: needs exactly ${PLAYERS_PER_TEAM} players (has ${Array.isArray(ps) ? ps.length : 0})`);
      continue;
    }
    const handles = new Set();
    for (const p of ps) {
      const pl = `${label}/${p && p.name}`;
      if (!p || !p.name) { errors.push(`${label}: player without name`); continue; }
      if (handles.has(p.name.toLowerCase())) errors.push(`${pl}: duplicate player in team`);
      handles.add(p.name.toLowerCase());
      if (!Number.isFinite(p.baseStrength) || p.baseStrength < OVR_MIN || p.baseStrength > OVR_MAX) {
        errors.push(`${pl}: baseStrength ${p.baseStrength} outside ${OVR_MIN}-${OVR_MAX}`);
      }
      if (p.needsVerification) warnings.push(`${pl}: player flagged needsVerification`);
    }
  }
  const seenPlayers = new Map();
  for (const t of teams) {
    for (const p of Array.isArray(t.players) ? t.players : []) {
      const k = String((p && p.name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!k) continue;
      const where = `${t.homeRegion}/${t.name}`;
      if (seenPlayers.has(k) && seenPlayers.get(k) !== where) errors.push(`player "${p.name}" is on both ${seenPlayers.get(k)} and ${where}`);
      seenPlayers.set(k, where);
    }
  }
  const counts = Object.fromEntries(REGIONS.map((id) => [id, teams.filter((t) => t.homeRegion === id).length]));
  for (const id of REGIONS) {
    if (counts[id] > TEAMS_PER_REGION) errors.push(`region "${id}" has ${counts[id]} teams (max ${TEAMS_PER_REGION})`);
    if (opts.complete && counts[id] !== TEAMS_PER_REGION) errors.push(`region "${id}" has ${counts[id]} teams, needs ${TEAMS_PER_REGION}`);
  }
  return { ok: errors.length === 0, errors, warnings, counts, total: teams.length };
}

// Load + drop teams that clash with Tier A at runtime (spec: dynamic duplicate check on new career).
function loadTeams(realData, file = DEFAULT_FILE) {
  const tierA = tierANames(...[].concat(realData || []));
  const valid = [];
  const dropped = [];
  for (const t of flatten(loadRaw(file))) {
    if (!t.name || !Array.isArray(t.players) || t.players.length !== PLAYERS_PER_TEAM) { dropped.push({ team: t.name, why: 'invalid roster' }); continue; }
    if (nameKeys(t.name).some((k) => tierA.has(k))) { dropped.push({ team: t.name, why: 'in Tier A' }); continue; }
    valid.push(t);
  }
  // active = first ACTIVE_PER_REGION valid teams of each region (file order); reserve = the rest, kept out of the game
  const n = {};
  const teams = [];
  const reserve = [];
  for (const t of valid) { n[t.homeRegion] = (n[t.homeRegion] || 0) + 1; (n[t.homeRegion] <= ACTIVE_PER_REGION ? teams : reserve).push(t); }
  return { teams, reserve, dropped };
}

module.exports = { REGIONS, TEAMS_PER_REGION, ACTIVE_PER_REGION, PLAYERS_PER_TEAM, OVR_MIN, OVR_MAX, nameKeys, tierANames, loadRaw, flatten, validate, loadTeams };
