'use strict';
// Y phase 3: the user's own post options (player career): many situational options, no repeats, reactions after posting.
const assert = require('assert');
const path = require('path');
const M = require('module'); // the shipped game has no ./drill-maps file; stub it so a player career can run daily training
const load = M._load; M._load = function (r) { if (r === './drill-maps') return new Proxy({}, { get: () => () => [] }); return load.apply(this, arguments); };
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, brandsFile: path.join(APP, 'data', 'media-brands.json') });
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
let s = 21; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: 'Team Vitality', playerName: 'Tester', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real', mode: 'player' }, rand);
const me = st.players.find((p) => p.isUser);
const kinds = {}, posted = [], sets = []; let prompts = 0, replies = 0;
for (let i = 0; i < 500; i++) {
  me.rating = i % 3 ? 95 : 45; // starts some series, benched for others
  const r = engine.advance(st, rand, 'day');
  if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } }
  const pr = st.social.prompt; if (!pr) continue;
  prompts++;
  assert(pr.mod, 'every prompt gets the richer options');
  kinds[pr.mod.kind] = (kinds[pr.mod.kind] || 0) + 1;
  const o = pr.options;
  assert(o.length >= 5 && o.length <= 9, 'five to nine options, got ' + o.length);
  assert.strictEqual(new Set(o.map((x) => x.text)).size, o.length, 'no duplicate options');
  assert(new Set(o.map((x) => x.tone)).size >= 4, 'at least four different tones: ' + o.map((x) => x.tone));
  for (const x of o) { assert(x.text && x.reach >= 1 && x.tone, 'option shape'); assert(!/\[[a-z]+\]|\{|\}/.test(x.text), 'unfilled template: ' + x.text); if (x.targetId != null) assert(engine.playerById(st, x.targetId), 'callout target exists'); }
  sets.push(o.map((x) => x.text).join('|'));
  const idx = Math.floor(rand() * o.length), text = o[idx].text, before = st.social.posts.length;
  const res = engine.postAsUser(st, idx, rand);
  assert(res.ok && (res.post.text.toLowerCase().startsWith(text.toLowerCase().replace(/[.!?]+$/, '')) || (res.post.text === '' && res.post.gif)) && res.post.mine, 'the game still posts the chosen option (or a wordless gif)');
  assert(!posted.slice(-12).includes(text), 'a line posted in the last dozen posts is not offered again: ' + text);
  posted.push(text);
  replies += st.social.posts.filter((p) => p.replyTo === res.post.id).length;
}
console.log('prompts', prompts, JSON.stringify(kinds), 'replies to the user', replies);
assert(prompts >= 30, 'enough prompts to judge');
assert(['win', 'loss', 'bench'].every((k) => kinds[k]) && (kinds.title || kinds.final), 'wins, losses, bench and a final or title all show up'); // one season is simulated: a title is a matter of luck, reaching a final is not
assert(new Set(sets).size === sets.length, 'two prompts never offer the identical set');
assert(replies >= prompts * 0.5, 'fans and rivals answer posts');
const u = st.social.ux; assert(u.myLines.length && u.myOffered.length <= 70 && u.myLines.length <= 160);
JSON.parse(JSON.stringify(st.social));
console.log('ok');
