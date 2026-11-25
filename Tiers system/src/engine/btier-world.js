'use strict';
// Tier B in the game's World editor. No game file is edited; the game's own world module (engine/world.js) is wrapped in memory.
//
// The game stores a world as a diff against its roster data: teams{name->new name/tag/colours/logo}, players[] (custom players),
// rosters{team->[refs]}. checkWorld() validates a world against the roster data, applyWorld() returns the roster data with the
// edits applied. Tier B teams are not in the game's roster data, so:
//  - checkWorld: Tier B teams are added to the roster data it validates against (edits to them are kept instead of dropped),
//  - applyWorld: Tier B teams are added before the game applies the world, then taken out again and returned as
//    result.tierBWorld (same shape as btier-teams.json). btier-loader.loadTeams() uses it instead of the shipped file,
//  - the editor page lists them as extra regions (editorRegions(), appended by src/ui/world-ui.js).
const L = require('./btier-loader');
const { withExtraA } = require('./btier-state');

const isB = (id) => /_b$/.test(String(id));

// Tier B database in the game's roster shape ({regions:[{id,name,short,teams:[{name,strength,players}]}]}), all teams (active and reserve)
function bRegions(file, tierA) {
  const keys = tierA || new Set();
  const out = [];
  for (const r of (L.loadRaw(file).regions || [])) {
    const teams = (r.teams || []).filter((t) => t && t.name && Array.isArray(t.players) && t.players.length === L.PLAYERS_PER_TEAM && !L.nameKeys(t.name).some((k) => keys.has(k)));
    if (!teams.length) continue;
    out.push({
      id: r.id + '_b', name: L.NAMES[r.id] + ' B', short: r.id.toUpperCase() + ' B',
      teams: teams.map((t) => ({ name: t.name, strength: Math.round(t.players.reduce((a, p) => a + p.baseStrength, 0) / t.players.length), players: t.players.map((p) => ({ ...p })) }))
    });
  }
  return out;
}

// Tier A in the editor = the game's 16 clubs per region + the 16 extra ones (withExtraA), then the Tier B regions
const withB = (data, file) => {
  if (!data || !Array.isArray(data.regions)) return data;
  const a = withExtraA(data);
  return { ...a, regions: [...a.regions.filter((r) => !isB(r.id)), ...bRegions(file, L.tierANames(a))] };
};

// The editor page's own base shape (what the game's worldEditorBase returns for Tier A regions)
function editorRegions(file, clubStars, abbrevs = {}) {
  return bRegions(file).map((r) => ({
    id: r.id, name: r.name, short: r.short,
    teams: editorTeams(r.teams, clubStars, abbrevs)
  }));
}
const editorTeams = (teams, clubStars, abbrevs) => teams.map((t) => ({
  name: t.name, logo: null, colors: null, abbrev: abbrevs[t.name] || null, strength: t.strength,
  stars: typeof clubStars === 'function' ? clubStars(t.strength) : 0,
  players: t.players.map((p) => ({ ref: 'r:' + t.name + '|' + p.name, name: p.name, age: p.age || null, nation: p.nation || null, rating: p.baseStrength, face: null, x: 50, y: 34 }))
}));

// The extra Tier A clubs in the editor's base shape, per region id (the renderer appends them to the game's 16)
function editorExtraA(real, clubStars, abbrevs = {}) {
  const out = {};
  for (const r of withExtraA(real).regions) {
    const extra = L.loadExtraA(real).filter((t) => t.homeRegion === r.id).map((t) => t.name);
    if (extra.length) out[r.id] = editorTeams(r.teams.filter((t) => extra.includes(t.name)), clubStars, abbrevs);
  }
  return out;
}

// Applied Tier B regions -> btier-teams.json shape. Custom players have no baseStrength: their rating is used.
function toDb(regions) {
  return {
    version: 1,
    regions: regions.filter((r) => isB(r.id)).map((r) => ({
      id: r.id.slice(0, -2),
      teams: (r.teams || []).map((t) => ({ ...t, players: (t.players || []).map((p) => ({ ...p, baseStrength: p.baseStrength != null ? p.baseStrength : (p.rating != null ? p.rating : 60) })) }))
    }))
  };
}

function wrapWorld(worldRules, opts = {}) {
  const log = opts.log || (() => {});
  if (!worldRules || worldRules.__btierWorld || typeof worldRules.checkWorld !== 'function' || typeof worldRules.applyWorld !== 'function') return worldRules;
  const check = worldRules.checkWorld;
  worldRules.checkWorld = function checkWorldWithTierB(world, ctx) {
    let c = ctx;
    try {
      if (ctx && ctx.base) {
        c = { ...ctx, base: withB(ctx.base, opts.file) };
        if (ctx.bases && typeof ctx.bases === 'object') c.bases = Object.fromEntries(Object.entries(ctx.bases).map(([y, d]) => [y, withB(d, opts.file)]));
      }
    } catch (e) { log('btier-world: checkWorld without Tier B: ' + e.stack); c = ctx; }
    return check.call(this, world, c);
  };
  const apply = worldRules.applyWorld;
  worldRules.applyWorld = function applyWorldWithTierB(real, world) {
    if (!world || !real || !Array.isArray(real.regions)) return apply.apply(this, arguments);
    let withTierB;
    try { withTierB = withB(real, opts.file); } catch (e) { log('btier-world: applyWorld without Tier B: ' + e.stack); return apply.apply(this, arguments); }
    const out = apply.call(this, withTierB, world);
    const b = out.regions.filter((r) => isB(r.id));
    out.regions = out.regions.filter((r) => !isB(r.id));
    out.__extraA = true; // the extra Tier A clubs are already in (edited); the engine must not add the shipped ones again
    if (b.length) out.tierBWorld = toDb(b);
    return out;
  };
  worldRules.__btierWorld = true;
  return worldRules;
}

module.exports = { wrapWorld, editorRegions, editorExtraA, bRegions };
