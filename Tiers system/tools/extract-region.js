'use strict';
// Extract Tier B candidates for one region from cached Liquipedia Open pages.
// Handles both page layouts: {{TeamCard ...}} (older) and {{TeamParticipants|{{Opponent|...}}}} (newer).
// usage: node extract-region.js eu   (reads data-sources/cache/*, writes data-sources/<region>-candidates.json)
const fs = require('fs');
const path = require('path');
const L = require('../src/engine/btier-loader');

const region = process.argv[2] || 'eu';
const REGION_PAGE = {
  eu: 'Europe', na: 'North_America', sam: 'South_America', oce: 'Oceania',
  mena: 'Middle_East_and_North_Africa', apac: 'Asia-Pacific', ssa: 'Sub-Saharan_Africa'
};
const cache = path.join(__dirname, '..', 'data-sources', 'cache');
const data = path.join(__dirname, '..', '..', 'app_extracted', 'data');
const tierA = L.tierANames(require(path.join(data, 'rlcs.json')), require(path.join(data, 'rlcs-2027.json')));

const files = fs.readdirSync(cache).filter((f) => f.includes(`_${REGION_PAGE[region]}_Open_`) && f.endsWith('.wiki')).sort();

function parseCards(text) {
  const out = [];
  const re = /\{\{TeamCard\s*\n([\s\S]*?)\n\}\}/g;
  let m;
  while ((m = re.exec(text))) {
    const kv = {};
    for (const line of m[1].split('\n')) {
      if (!line.startsWith('|')) continue;
      for (const seg of line.slice(1).split('|')) { const e = seg.match(/^(\w+)=(.*)$/); if (e) kv[e[1]] = e[2].trim(); }
    }
    const players = ['p1', 'p2', 'p3'].map((k, i) => (kv[k] ? { name: kv[k], link: kv[`p${i + 1}link`] || null, flag: kv[`p${i + 1}flag`] || null } : null)).filter(Boolean);
    out.push({ name: kv.team, players });
  }
  return out;
}

function parseOpponents(text) {
  const out = [];
  const parts = text.split('{{Opponent|').slice(1);
  for (const part of parts) {
    const name = part.split('\n')[0].replace(/\|.*$/, '').trim();
    const players = [];
    const re = /\{\{Person\|([^|}\n]+)((?:\|[^}\n]*)?)\}\}/g;
    let m;
    // stop at the next team: parts are already split on {{Opponent|
    while ((m = re.exec(part))) {
      const params = Object.fromEntries(m[2].split('|').filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
      if (params.type === 'staff' || params.status === 'sub') continue;
      players.push({ name: m[1].trim(), link: params.link || null, flag: params.flag || null });
    }
    out.push({ name, players });
  }
  return out;
}

const teams = new Map();
for (const f of files) {
  const text = fs.readFileSync(path.join(cache, f), 'utf8');
  const list = /\{\{TeamCard\s*\n/.test(text) ? parseCards(text) : parseOpponents(text);
  list.forEach((c, i) => {
    const idx = i + 1;
    if (!c.name || /^(tbd|bye)$/i.test(c.name)) return;
    const key = L.nameKeys(c.name)[0];
    const t = teams.get(key) || { name: c.name, opens: 0, score: 0, bestRank: 999, latest: null };
    t.opens += 1; t.score += Math.max(0, 129 - idx); t.bestRank = Math.min(t.bestRank, idx);
    t.latest = { file: f, players: c.players.slice(0, 3) };
    teams.set(key, t);
  });
}

const all = [...teams.values()];
const out = all
  .filter((t) => !L.nameKeys(t.name).some((k) => tierA.has(k)))
  .filter((t) => t.latest.players.length === 3)
  .sort((a, b) => b.opens - a.opens || b.score - a.score);

fs.writeFileSync(path.join(__dirname, '..', 'data-sources', `${region}-candidates.json`), JSON.stringify(out, null, 1));
console.log(`${region}: files=${files.length} teams=${all.length} nonTierA(3 players)=${out.length}`);
if (process.argv[3] === 'list') console.log(out.map((t, i) => `${i + 1}. ${t.name} opens=${t.opens} best=${t.bestRank} [${t.latest.players.map((p) => p.name + (p.flag ? ':' + p.flag : '')).join(', ')}]`).join('\n'));
