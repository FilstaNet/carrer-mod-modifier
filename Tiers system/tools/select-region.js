'use strict';
// Pick 32 teams from <region>-candidates.json: skip curated exclusions, skip teams that reuse an already-picked player.
// usage: node select-region.js eu   -> data-sources/<region>-selected.json
const fs = require('fs');
const path = require('path');
const region = process.argv[2] || 'eu';
const ds = path.join(__dirname, '..', 'data-sources');
const cand = JSON.parse(fs.readFileSync(path.join(ds, `${region}-candidates.json`), 'utf8'));
const cur = JSON.parse(fs.readFileSync(path.join(ds, 'curation.json'), 'utf8'))[region] || { exclude: {} };

const data = path.join(__dirname, '..', '..', 'app_extracted', 'data');
const tierAPlayers = new Set();
for (const f of ['rlcs.json', 'rlcs-2027.json']) for (const r of require(path.join(data, f)).regions) for (const t of r.teams) for (const p of t.players) tierAPlayers.add(p.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
const handle = (p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
const used = new Set();
const usedTeams = new Set();
// regions selected earlier in the order below must not share players or team names with this one
const ORDER = ['eu', 'na', 'sam', 'oce', 'mena', 'apac', 'ssa'];
const nk = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
for (const r of ORDER.slice(0, ORDER.indexOf(region))) {
  const f = path.join(ds, r + '-selected.json');
  if (!fs.existsSync(f)) continue;
  for (const t of JSON.parse(fs.readFileSync(f, 'utf8'))) { usedTeams.add(nk(t.name)); t.latest.players.forEach((p) => used.add(handle(p))); }
}
const picked = [];
const skipped = [];
for (const t of cand) {
  if (picked.length >= 32) break;
  if (cur.exclude[t.name]) { skipped.push([t.name, cur.exclude[t.name]]); continue; }
  const hs = t.latest.players.map(handle);
  if (usedTeams.has(nk(t.name))) { skipped.push([t.name, 'team name already used in an earlier region']); continue; }
  const onA = hs.find((h) => tierAPlayers.has(h));
  if (onA) { skipped.push([t.name, `player "${onA}" is on a Tier A roster`]); continue; }
  const clash = hs.find((h) => used.has(h));
  if (clash) { skipped.push([t.name, `player "${clash}" already on a picked team`]); continue; }
  hs.forEach((h) => used.add(h));
  picked.push(t);
}
fs.writeFileSync(path.join(ds, `${region}-selected.json`), JSON.stringify(picked, null, 1));
console.log(`picked ${picked.length}`);
picked.forEach((t, i) => console.log(`${i + 1}. ${t.name} (opens=${t.opens}, best=${t.bestRank}) [${t.latest.players.map((p) => p.name).join(', ')}]`));
console.log('\nskipped:\n' + skipped.map((s) => ` - ${s[0]}: ${s[1]}`).join('\n'));
