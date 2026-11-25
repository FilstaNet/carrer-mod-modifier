'use strict';
// Residency display: players of the club's own region group are residents for both tiers (no false "import" in the profile).
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: require(path.join(APP, 'engine', 'events.js')) });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const gen = (name) => engine.generateLeague({ teamName: name, real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, () => 0.5);
const probe = gen('Team Vitality'), bName = probe.teams.find((t) => t.region === 'eu_b').name;
const b = gen(bName), me = engine.teamById(b, b.userTeamId);
assert.strictEqual(me.region, 'eu_b');
const fa = b.players.find((p) => p.teamId < 0 && p.nation === 'England'), onA = b.players.find((p) => { const t = engine.teamById(b, p.teamId); return t && t.region === 'eu' && p.home === 'eu'; });
assert(fa && onA, 'players living in Europe exist');
assert.strictEqual(engine.homeOf(b, fa), 'eu_b', 'a Tier B manager sees a European resident as his own resident');
assert.strictEqual(engine.homeOf(b, onA), 'eu_b');
const other = b.players.find((p) => p.teamId < 0 && p.nation === 'Saudi Arabia'); assert.strictEqual(engine.homeOf(b, other), 'mena', 'other regions are still imports');
const a = gen('Team Vitality'), bp = a.players.find((p) => { const t = engine.teamById(a, p.teamId); return t && t.region === 'eu_b'; });
assert.strictEqual(engine.homeOf(a, bp), 'eu', 'a Tier A manager sees a Tier B club player of his region group as a resident');
console.log('homes ok');
