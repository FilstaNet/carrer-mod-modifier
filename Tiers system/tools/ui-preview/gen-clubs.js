// writes %TEMP%/h/clubs.json: the new-career club list as the game's main process would return it (with Tier B regions)
const R = require('path').resolve(__dirname, '../../..').split(require('path').sep).join('/') + '/';
const ev = require(R + 'app_extracted/engine/events.js');
const engine = require(R + 'Tiers system/src/engine/btier-state').wrapEngine(require(R + 'app_extracted/engine/league.js'), { events: ev });
const real = require(R + 'app_extracted/data/rlcs-2027.json');
require('fs').writeFileSync(process.env.TEMP + '/h/clubs.json', JSON.stringify({ regions: engine.clubPreview(real).map((r) => ({ ...r, shape: ((require(R + 'app_extracted/data/world-map.json').paths) || {})[r.id] || null })), rosterYears: [2027], rosterYear: 2027, flags: {} }));
