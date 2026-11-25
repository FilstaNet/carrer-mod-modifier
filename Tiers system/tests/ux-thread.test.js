'use strict';
// Y threads: the user replies to any post, the world answers back (same day or later), three rounds at most, light capped consequences.
const assert = require('assert');
const path = require('path');
const M = require('module'); // the shipped game has no ./drill-maps file; stub it so a player career can run daily training
const load = M._load; M._load = function (r) { if (r === './drill-maps') return new Proxy({}, { get: () => () => [] }); return load.apply(this, arguments); };
const APP = path.join(__dirname, '..', '..', 'app_extracted');
const ev = require(path.join(APP, 'engine', 'events.js'));
const engine = require('../src/engine/btier-state').wrapEngine(require(path.join(APP, 'engine', 'league.js')), { events: ev, brandsFile: path.join(APP, 'data', 'media-brands.json') });
const { classify, PREFIX, MAX_ROUNDS } = require('../src/engine/ux-thread');
const real = require(path.join(APP, 'data', 'rlcs-2027.json'));
let s = 33; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const st = engine.generateLeague({ teamName: 'Team Vitality', playerName: 'Tester', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real', mode: 'player' }, rand);
const me = st.players.find((p) => p.isUser); me.followers = 40000;
const adv = (n) => { for (let i = 0; i < n; i++) { const r = engine.advance(st, rand, 'day'); if (r.stopped === 'matchday') { const f = engine.fixtureById(st, r.fixtureId); if (f && !f.played) { engine.simulateFixture(st, f, rand); engine.nextUserSeries(st, rand, f.id); } } } };
const send = (o) => engine.postTweet(st, PREFIX + JSON.stringify(o));
adv(12);

// tone: chip first, keywords otherwise
assert.strictEqual(classify('cocky', 'gg'), 'bite'); assert.strictEqual(classify(null, 'gg, respect'), 'warm'); assert.strictEqual(classify(null, 'you are trash, ratio'), 'fight');
assert.strictEqual(classify(null, 'when is the next one?'), 'ask'); assert.strictEqual(classify(null, 'lol that was dead'), 'laugh'); assert.strictEqual(classify(null, 'the sky'), 'plain');

// bad input never throws and never posts
const n0 = st.social.posts.length;
assert.strictEqual(send({ a: 'reply', id: 999999999, text: 'hello' }).ok, false, 'unknown post');
assert.strictEqual(send({ a: 'reply', id: st.social.posts[0].id, text: '   ' }).ok, false, 'empty text');
assert.strictEqual(engine.postTweet(st, PREFIX + '{nope').ok, false, 'bad json');
assert.strictEqual(st.social.posts.length, n0);
assert.strictEqual(engine.postTweet(st, 'a normal tweet').ok, true, 'the game\'s own free-text tweet still works');

// reply to a bunch of different accounts over a month: every reply is well formed, answers show up, nothing runs past three rounds
let answered = 0, sent = 0, sameDay = 0, later = 0, fanSide = 0;
const FOLL0 = me.followers;
for (let d = 0; d < 30; d++) {
  adv(1);
  const cands = st.social.posts.filter((p) => !p.mine && p.replyTo == null && p.id);
  if (!cands.length) continue;
  const target = cands[Math.floor(rand() * Math.min(cands.length, 25))];
  const tone = [null, 'respect', 'thanks', 'joke', 'hype', 'cocky', 'callout'][d % 7];
  const r = send({ a: 'reply', id: target.id, text: 'test reply ' + d + (d % 4 === 0 ? ' ?' : ''), tone });
  assert(r.ok, 'reply ok: ' + JSON.stringify(r));
  sent++;
  const p = r.post;
  assert(p.mine && p.replyTo === target.id && p.kind === 'player' && p.authorId === me.id && p.text.startsWith('test reply'), 'post shape');
  assert(st.social.posts.some((x) => x.id === p.id) && st.social.mine.some((x) => x.id === p.id), 'stored in the timeline and in my posts');
  assert(r.gain >= 0 && r.gain <= Math.max(3, Math.round(me.followers * 0.02)), 'follower gain is capped: ' + r.gain);
  const here = st.social.posts.filter((x) => x.replyTo === p.id);
  if (here.length) sameDay++;
  for (const x of here) { assert(x.mention && x.seen === false && x.targetKey === 'p' + me.id && x.thrDepth === p.thrDepth, 'answers are notifications aimed at me'); assert(!/\[[a-z]+\]|\{|\}/.test(x.text), 'unfilled template: ' + x.text); }
}
adv(6); // let the scheduled answers land
const everything = () => st.social.posts.concat(st.social.archive || []);
for (const p of st.social.mine.filter((x) => x.replyTo != null && x.ux)) {
  const a = everything().filter((x) => x.replyTo === p.id);
  if (a.length) answered++;
  if (a.some((x) => x.date > p.date)) later++;
  if (a.some((x) => x.role === 'fan')) fanSide++;
}
console.log('sent', sent, 'answered', answered, 'same day', sameDay, 'later', later, 'with a fan', fanSide, 'followers', FOLL0, '->', me.followers);
assert(sent >= 20, 'enough replies to judge');
assert(answered >= sent * 0.6, 'most replies get an answer from somebody: ' + answered + '/' + sent);
assert(later >= 3, 'some answers come on a later day');
assert(fanSide >= 3, 'fans join the thread');
assert(st.social.ux.thr.open.length <= 30);

// a conversation: reply to an answer, and again; after the third round nobody answers any more
const first = st.social.mine.find((x) => x.replyTo != null && x.ux && st.social.posts.some((y) => y.replyTo === x.id && y.kind === 'player'));
if (first) {
  let cur = st.social.posts.find((y) => y.replyTo === first.id && y.kind === 'player'), rounds = 1;
  while (cur && rounds < 8) {
    const r = send({ a: 'reply', id: cur.id, text: 'round ' + rounds, tone: 'respect' }); assert(r.ok);
    assert(r.depth <= MAX_ROUNDS + 1, 'depth is capped');
    if (r.depth > MAX_ROUNDS) { adv(4); assert(!st.social.posts.some((y) => y.replyTo === r.post.id && y.thrDepth === r.depth && y.kind === 'player'), 'no answer past round ' + MAX_ROUNDS); break; }
    adv(3);
    cur = st.social.posts.find((y) => y.replyTo === r.post.id && y.kind === 'player'); rounds++;
  }
}

// the game's spam rule counts replies: ten in one day costs followers, never more than 6% each
const before = me.followers, today = st.social.posts.find((p) => !p.mine && p.replyTo == null);
let lost = 0; for (let i = 0; i < 10; i++) { const r = send({ a: 'reply', id: today.id, text: 'spam ' + i }); lost += r.lost; assert(r.lost <= Math.round(me.followers * 0.07) + 1); }
assert(lost > 0 && me.followers < before + 50, 'spamming replies costs followers');

// Generate: a draft in every tone, filled in, different when asked to avoid the last one, and it posts nothing
const tgt = st.social.posts.find((p) => !p.mine && p.replyTo == null), nPosts = st.social.posts.length;
for (const tone of [null, 'respect', 'thanks', 'joke', 'hype', 'cocky', 'callout']) {
  let last = ''; const seen = new Set();
  for (let n = 1; n <= 6; n++) {
    const r = send({ a: 'gen', id: tgt.id, tone, n, avoid: last }); assert(r.ok && r.text, 'generated: ' + tone);
    assert(!/\[[a-z]+\]|\{|\}/.test(r.text) && r.text.length <= 280 && r.text !== last, 'clean, different draft: ' + r.text); assert(!/\p{Extended_Pictographic}/u.test(r.text), 'no emoji in drafts: ' + r.text); seen.add(r.text); last = r.text;
  }
  assert(seen.size >= 3, 'variety in tone ' + tone);
}
const nt = send({ a: 'gen', id: 999999999, tone: 'hype', n: 1 }); assert(nt.ok && nt.text.indexOf('#') < 0 && /\s/.test(nt.text) && !/^\s/.test(nt.text), 'works without a post too: ' + nt.text);
console.log('sample drafts:', ['respect', 'cocky', 'callout'].map((x) => send({ a: 'gen', id: tgt.id, tone: x, n: 9 }).text).join(' | '));
assert.strictEqual(st.social.posts.length, nPosts, 'generating posts nothing');

// repost (free, toggles) and quote (a post of its own, answered like a reply)
const orig = st.social.posts.find((p) => !p.mine && p.replyTo == null && p.repostOf == null && p.kind === 'player' && p.id);
const rp0 = orig.reposts || 0, mine0 = st.social.mine.length;
const rp = send({ a: 'repost', id: orig.id }); assert(rp.ok && !rp.undone, 'repost');
const rpPost = st.social.posts.find((p) => p.repostOf === orig.id && p.authorId === me.id);
assert(rpPost && rpPost.text === '' && rpPost.quote.id === orig.id && rpPost.quote.text === orig.text, 'repost carries a snapshot of the original');
assert.strictEqual(orig.reposts, rp0 + 1); assert.strictEqual(st.social.mine.length, mine0, 'plain reposts are free: they do not count towards the spam rule');
assert(send({ a: 'repost', id: rpPost.id }).ok === false, 'cannot repost a repost');
const un = send({ a: 'repost', id: orig.id }); assert(un.ok && un.undone && !st.social.posts.some((p) => p.id === rpPost.id) && orig.reposts === rp0, 'second click undoes it');
assert.strictEqual(send({ a: 'repost', id: 999999999 }).ok, false);
const q = send({ a: 'quote', id: orig.id, text: 'this is exactly it', tone: 'hype' });
assert(q.ok && q.post.quoteOf === orig.id && q.post.replyTo == null && q.post.quote.id === orig.id && q.post.mine && st.social.mine.some((p) => p.id === q.post.id), 'quote shape');
assert.strictEqual(send({ a: 'quote', id: orig.id, text: ' ' }).ok, false, 'a quote needs words');
let quoteAnswered = 0; for (let i = 0; i < 12; i++) { const o2 = st.social.posts.filter((p) => !p.mine && p.replyTo == null && p.repostOf == null && p.id)[i]; const r = send({ a: 'quote', id: o2.id, text: 'q' + i, tone: 'joke' }); assert(r.ok); adv(1); if (st.social.posts.concat(st.social.archive || []).some((p) => p.replyTo === r.post.id)) quoteAnswered++; }
assert(quoteAnswered >= 4, 'quotes get answered too: ' + quoteAnswered);
// the world reposts / quotes the user's own posts
let npc = 0, npcBare = 0, npcQuote = 0;
for (let i = 0; i < 40; i++) { engine.postTweet(st, 'my own post ' + i); adv(1); }
for (const p of st.social.posts.concat(st.social.archive || [])) if (p.mention && p.kind === 'voice' && (p.repostOf != null || p.quoteOf != null)) { npc++; if (p.repostOf != null) { npcBare++; assert(p.text === '' && p.quote && p.quote.handle === engine.handleFor(me.name)); } else { npcQuote++; assert(p.text && p.quoteOf); } }
console.log('npc reposts', npcBare, 'npc quotes', npcQuote);
assert(npc >= 3 && npcBare >= 1 && npcQuote >= 1, 'fans repost and quote the user: ' + npc);
JSON.parse(JSON.stringify(st.social));

// real comments: opening a thread makes the comments its reply count promised (up to four), once, and replying keeps a rapport score
const busy = st.social.posts.find((p) => !p.mine && p.replyTo == null && p.repostOf == null && p.replies >= 3 && !p.amb);
assert(busy, 'a post with a few replies exists');
const nBefore = st.social.posts.filter((p) => p.replyTo === busy.id).length;
const o1 = send({ a: 'open', id: busy.id }); assert(o1.ok && o1.made >= 1 && o1.made <= 20, 'comments made: ' + o1.made);
const kids = st.social.posts.filter((p) => p.replyTo === busy.id);
assert.strictEqual(kids.length, nBefore + o1.made); assert.strictEqual(busy.replies, kids.length, 'the reply count is exactly the comments there are'); assert(kids.length <= 20); assert(kids.every((k) => k.text && !/\[[a-z]+\]|\{|\}/.test(k.text) && k.date >= busy.date && !k.mention), 'comments are clean and not notifications');
assert.strictEqual(send({ a: 'open', id: busy.id }).made, 0, 'only once');
assert.strictEqual(send({ a: 'open', id: 999999999 }).made, 0, 'unknown post is harmless');
const rel = st.social.ux.thr.rel; const keysRel = Object.keys(rel);
assert(keysRel.length >= 3 && keysRel.every((k) => /^p\d+$/.test(k) && rel[k].n >= 1 && Math.abs(rel[k].s) <= 10), 'rapport tracked per player');
const friend = st.players.find((p) => !p.isUser && p.teamId >= 0 && !rel['p' + p.id]);
const t1 = st.social.posts.find((p) => p.kind === 'player' && p.authorId === friend.id) || (() => { engine.advance(st, rand, 'day'); return null; })();
if (t1) { for (let i = 0; i < 3; i++) send({ a: 'reply', id: t1.id, text: 'you are trash', tone: 'callout' }); assert(rel['p' + friend.id].s <= -2, 'callouts sour the rapport'); }
JSON.parse(JSON.stringify(st.social));

// pre-existing saves load: no thr state until the first reply, and everything stays plain JSON
const fresh = engine.generateLeague({ teamName: 'Team Vitality', playerName: 'T2', real, startDate: engine.careerStartFor(2027), calendar: 'rlcs', economy: 'real', mode: 'player' }, rand);
engine.advance(fresh, rand, 'day');
assert(!fresh.social || !fresh.social.ux || !fresh.social.ux.thr || Array.isArray(fresh.social.ux.thr.open));
JSON.parse(JSON.stringify(st.social));
console.log('ok');
