'use strict';
// Fetch nation + birth date for the players of <region>-selected.json via the Liquipedia API (batched, cached).
// usage: node fetch-players.js eu  -> data-sources/<region>-players.json  (handle -> {title, nation, born, found})
const fs = require('fs');
const path = require('path');
const { api } = require('./lp');

const region = process.argv[2] || 'eu';
const ds = path.join(__dirname, '..', 'data-sources');
const sel = JSON.parse(fs.readFileSync(path.join(ds, `${region}-${process.argv[3] || 'selected'}.json`), 'utf8'));
const outFile = path.join(ds, `${region}-players.json`);
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

const field = (txt, k) => { const m = txt.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|}]*)`, 'i')); return m ? m[1].trim() : ''; };

(async () => {
  const want = [];
  for (const t of sel) for (const p of t.latest.players) { const title = (p.link || p.name).replace(/_/g, ' '); if (!out[p.name]) want.push({ handle: p.name, title }); }
  for (let i = 0; i < want.length; i += 40) {
    const batch = want.slice(i, i + 40);
    const r = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: batch.map((b) => b.title).join('|') });
    const redirect = Object.fromEntries((r.query.redirects || []).map((x) => [x.from, x.to]));
    const norm = Object.fromEntries((r.query.normalized || []).map((x) => [x.from, x.to]));
    const pages = Object.fromEntries(r.query.pages.map((p) => [p.title, p]));
    for (const b of batch) {
      const title = redirect[norm[b.title] || b.title] || norm[b.title] || b.title;
      const page = pages[title];
      const txt = page && !page.missing && page.revisions ? page.revisions[0].slots.main.content : '';
      const isPlayer = /\{\{Infobox player/i.test(txt);
      out[b.handle] = { title, found: isPlayer, nation: isPlayer ? field(txt, 'country') : '', born: isPlayer ? (field(txt, 'birth_date') || field(txt, 'born')) : '', id: isPlayer ? field(txt, 'id') : '' };
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  const vals = Object.entries(out);
  console.log(`players=${vals.length} found=${vals.filter(([, v]) => v.found).length} withBorn=${vals.filter(([, v]) => v.born).length}`);
  console.log(vals.filter(([, v]) => !v.found || !v.born || !v.nation).map(([k, v]) => `${k} -> ${JSON.stringify(v)}`).join('\n'));
})().catch((e) => { console.error(e.message); process.exit(1); });
