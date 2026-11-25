'use strict';
// Y feed round: bigger/fresher post pool, personalities, rivalry replies, inbound creator DM, collab brands as media offers.
const assert = require('assert');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const brandsFile = path.join(APP, 'data', 'media-brands.json');
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, brandsFile });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
const { personaOf, PERSONAS } = require('../src/engine/ux-persona');
const mkRand = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand = mkRand(11);
const st = engine.generateLeague({ teamName: 'Team Vitality', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real' }, rand);
const before = st.social && st.social.posts ? st.social.posts.length : 0;
const offerBrands = new Set();
for (let i = 0; i < 90; i++) {
  const r = engine.advance(st, rand, 'day');
  for (const o of st.mediaOffers || []) offerBrands.add(o.brandId);
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
}
const all = (st.social.posts || []).concat(st.social.archive || []);
const mine = all.filter((p) => p.ux);
console.log('posts total', all.length, 'ux posts', mine.length, '(before', before + ')');
assert(mine.length > 300, 'the feed gets many extra posts');
const texts = mine.map((p) => p.text);
const uniq = new Set(texts).size / texts.length;
console.log('unique ratio', uniq.toFixed(3));
assert(uniq > 0.93, 'posts do not repeat');
// every persona is represented and a player always has the same one
const seen = new Set(mine.filter((p) => p.kind === 'player').map((p) => p.persona));
assert(seen.size >= PERSONAS.length - 1, 'personas show up in posts: ' + [...seen]);
for (const p of mine.filter((p) => p.kind === 'player').slice(0, 50)) assert.strictEqual(p.persona, personaOf(p.name).id);
// posts are in the game's shape (date, ids, handle, mention targets resolve)
for (const p of mine) { assert(p.id && p.date && p.handle && p.name && typeof p.text === 'string' && p.text.length > 0); assert(!/\[[a-z]+\]|\{|\}/.test(p.text), 'unfilled template: ' + p.text); }
assert(mine.some((p) => p.replyTo != null), 'rivalry replies exist');
assert(mine.some((p) => p.targetId != null && p.tone === 'callout'), 'callouts exist');
// voices: fans, outlets, leakers react to real news; rumours are graded and not always right
const voice = mine.filter((p) => p.kind === 'voice' || p.role === 'caster');
const roles = {}; voice.forEach((p) => { roles[p.role] = (roles[p.role] || 0) + 1; });
console.log('voices', JSON.stringify(roles));
assert(roles.media > 5 && roles.fan > 5, 'outlets and fans post about real events');
assert(voice.every((p) => p.authorId === -1 || p.kind === 'creator'), 'voices have no player profile link');
assert(mine.some((p) => p.kind === 'player' && p.tags && p.tags.length), 'posts carry hashtags for Trending');
const V = st.social.ux.voices;
console.log('rumours', V.rumours.length, 'graded', V.rumours.filter((r) => r.done).length, JSON.stringify(V.leakers));
assert(V.rumours.length > 0, 'leakers post rumours');
const states = new Set(all.filter((p) => p.rumour).map((p) => p.rumour));
console.log('rumour states', [...states]);
assert(states.has('unconfirmed') || states.size > 1, 'rumours have a status');
// a save from before voices existed still loads and keeps ticking
delete st.social.ux.voices; delete st.social.ux.topics;
engine.advance(st, rand, 'day'); assert(st.social.ux.voices && st.social.ux.topics, 'old saves are upgraded in place');
// feed order: newest first
const feed = st.social.posts;
for (let i = 1; i < Math.min(feed.length, 120); i++) assert(feed[i - 1].date >= feed[i].date, 'feed sorted by date');
assert(feed.length <= 220, 'timeline trimmed, rest archived');
// inbound creator DM uses the game's own thread
const dm = engine.dmList(st).filter((d) => d.inbound);
console.log('inbound DMs', dm.length);
assert(dm.length >= 1, 'a creator wrote first');
assert(dm[0].stage === 'asking' && !dm[0].closed && dm[0].msgs[0].mine === false && dm[0].demand > 0);
// collab / sponsorship partners are media brands now, and offers can come from them
const brands = require(brandsFile).brands;
const ux = brands.filter((b) => b.ux);
console.log('collab brands', ux.length);
assert(ux.length >= 20 && ux.every((b) => b.jobs.length === 2));
console.log('offer brands', [...offerBrands].join(','));
assert([...offerBrands].some((b) => String(b).startsWith('ux-')), 'creators / pros send collab offers');
// saves keep working: the whole thing is plain JSON
JSON.parse(JSON.stringify(st.social));
console.log('ok');
