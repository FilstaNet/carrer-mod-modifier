// Prize tables for the renderer: { "<real 0|1>:<kind>:<region for opens>": [money for place 1..64] }, taken from the game's own prizeFor.
const REGIONS = ['eu', 'na', 'sam', 'oce', 'mena', 'apac', 'ssa'];
module.exports = function buildPrize(ev) {
  const out = {};
  if (!ev || typeof ev.prizeFor !== 'function') return out;
  for (const real of [0, 1]) for (const kind of ['open', 'major', 'lcq', 'worlds']) for (const region of (kind === 'open' ? REGIONS : [''])) {
    const arr = [];
    for (let p = 1; p <= 64; p++) arr.push(ev.prizeFor(kind, p, { real: !!real, region: region || null }) || 0);
    out[real + ':' + kind + ':' + region] = arr;
  }
  try { const M = require('./ux-majors'); for (const real of [0, 1]) for (const kind of Object.keys(M.KINDS)) out[real + ':' + kind + ':'] = M.prizeTable(ev, kind, !!real).concat(Array(64).fill(0)).slice(0, 64); } catch (e) { /* the renderer falls back to what the standings paid */ }
  return out;
};
