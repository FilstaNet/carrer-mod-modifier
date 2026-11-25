'use strict';
// Pick 16 EXTRA Tier B teams per region (when Tier A grew to 32 the best 16 of the old Tier B list moved up).
// Same rules as select-region.js, but the 32 already selected (in every region) and all earlier extras stay excluded.
// usage: node select-extra.js  -> data-sources/<region>-extra.json for all regions (in ORDER)
const fs = require('fs');
const path = require('path');
const ds = path.join(__dirname, '..', 'data-sources');
const data = path.join(__dirname, '..', '..', 'app_extracted', 'data');
const handle = (p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
const nk = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ds, f), 'utf8'));
const ORDER = ['eu', 'na', 'sam', 'oce', 'mena', 'apac', 'ssa'];
const NEED = 16;
const usedP = new Set();
const usedT = new Set();
for (const f of ['rlcs.json', 'rlcs-2027.json']) for (const r of require(path.join(data, f)).regions) for (const t of r.teams) { usedT.add(nk(t.name)); t.players.forEach((p) => usedP.add(handle(p))); }
for (const r of ORDER) for (const t of read(r + '-selected.json')) { usedT.add(nk(t.name)); t.latest.players.forEach((p) => usedP.add(handle(p))); }
for (const region of ORDER) {
  const cur = (read('curation.json')[region] || { exclude: {} }).exclude;
  const picked = [];
  for (const t of read(region + '-candidates.json')) {
    if (picked.length >= NEED) break;
    const hs = t.latest.players.map(handle);
    if (cur[t.name] || usedT.has(nk(t.name)) || hs.some((h) => usedP.has(h)) || new Set(hs).size !== hs.length) continue;
    usedT.add(nk(t.name)); hs.forEach((h) => usedP.add(h));
    picked.push(t);
  }
  fs.writeFileSync(path.join(ds, `${region}-extra.json`), JSON.stringify(picked, null, 1));
  console.log(region, picked.length, picked.slice(0, 3).map((t) => t.name).join(', '), '...', picked.slice(-1).map((t) => t.name + ' (best ' + t.bestRank + ')').join());
}
