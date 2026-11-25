'use strict';
// Minimal Liquipedia API client. Follows Liquipedia API terms: descriptive User-Agent, gzip, >=2s between requests, local cache.
// usage: node lp.js prefix "<Page prefix>"      -> list page titles
//        node lp.js wikitext "<Page title>"     -> save wikitext to ../data-sources/cache/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const BASE = 'https://liquipedia.net/rocketleague/api.php';
const UA = 'RLCareerModTierBResearch/0.1 (hobby mod data research; low volume)';
const CACHE = path.join(__dirname, '..', 'data-sources', 'cache');
const GAP_MS = 2500;
let last = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = BASE + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function prefix(p) {
  const out = [];
  let cont = {};
  do {
    const r = await api({ action: 'query', list: 'allpages', apprefix: p, aplimit: '500', ...cont });
    out.push(...r.query.allpages.map((x) => x.title));
    cont = r.continue || null;
  } while (cont);
  return out;
}

async function wikitext(title) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, title.replace(/[^A-Za-z0-9._-]/g, '_') + '.wiki');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const r = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: title });
  const page = r.query.pages[0];
  if (page.missing) throw new Error('missing page ' + title);
  const text = page.revisions[0].slots.main.content;
  fs.writeFileSync(file, text);
  return text;
}

module.exports = { api, prefix, wikitext };

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  (async () => {
    if (cmd === 'prefix') console.log((await prefix(arg)).join('\n'));
    else if (cmd === 'wikitext') { const t = await wikitext(arg); console.log(`saved ${t.length} chars`); }
    else console.log('usage: lp.js prefix|wikitext <arg>');
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
