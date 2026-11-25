// Y, threads: the user can reply to ANY post (free text + optional tone chip) and the world answers back, up to three rounds.
// Free text is read from the chip, or failing that from a few keywords. The author, a fan or two, and the odd rival answer, some the same day,
// some one or two days later (state.social.ux.thr.open). Replies to the user are flagged `mention` so the game's own Notifications tab shows them.
// Consequences stay light and capped: a few followers (visibility of whoever you answered), Y mood, and a teammate's morale.
// Additive: posts keep the game's shape (replyTo, kind 'player'); the UI reaches this through hub.postTweet with a '\u0001uxy:' text prefix,
// the one social IPC the game's main process forwards in both careers.
const { personaOf } = require('./ux-persona');

const pick = (r, a) => a[Math.floor(r() * a.length)];
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const PREFIX = '\u0001uxy:';
const MAX_ROUNDS = 12; // a conversation dies out by chance long before this; the cap only stops a runaway
const TONES = ['respect', 'thanks', 'joke', 'hype', 'cocky', 'callout'];
const CLS_OF_TONE = { respect: 'warm', thanks: 'warm', joke: 'laugh', hype: 'hype', cocky: 'bite', callout: 'fight' };
const REP = { warm: 0.25, laugh: 0.05, hype: 0.1, bite: -0.15, fight: -0.35, plain: 0, ask: 0 };
const Q = { warm: 1, laugh: 1.2, hype: 0.8, bite: 0.7, fight: 1.5, plain: 0.6, ask: 0.9 }; // how much attention a reply draws

// what the user said -> how it lands
function classify(tone, text) {
  if (CLS_OF_TONE[tone]) return CLS_OF_TONE[tone];
  const t = String(text || '');
  if (/\?\s*$/.test(t)) return 'ask';
  if (/\b(trash|overrated|cope|ratio|sit down|clown|washed|embarrassing|bottled|choke)\b/i.test(t)) return 'fight';
  if (/\b(lol|lmao|haha|dead)\b|[😂💀🤣]/i.test(t)) return 'laugh';
  if (/\b(gg|respect|congrats|congratulations|well played|thank|thanks|love|proud)\b/i.test(t)) return 'warm';
  return 'plain';
}

// the author's answer. [tag] is the user's handle
const PLAYER = {
  warm: ['{[tag] thanks, appreciate it|[tag] means a lot|[tag] respect right back|[tag] good to hear that|[tag] ha, thank you}', '[tag] {all love|cheers|that is kind of you}'],
  laugh: ['[tag] {lmao|haha|dead|ok that was good|stop it}', '[tag] {fair|you got me|ha}'],
  hype: ['[tag] {LETS GO|that is the energy|we are so back|say it louder}', '[tag] {let us run it|big energy}'],
  bite: ['[tag] {big words|noted, see you on the server|bold|we will see about that|talk is cheap}', '[tag] {say it again after the series|keep that energy}'],
  fight: ['[tag] {say it to my face|receipts saved|keep talking|that is all you have?|cute}', '[tag] {we both know how this ends|run it back then}'],
  plain: ['[tag] {noted|fair enough|ok|sure|interesting}', '[tag] {hm|alright}'],
  ask: ['[tag] {good question|we will see|soon|hm, not sure yet|ask me after the series}', '[tag] {working on it|time will tell}'],
  calm: ['[tag] {no hard feelings|all good, see you out there|respect, let us leave it there|fair, take care}', '[tag] {gg either way|no beef from me}']
};
const CALM = { humble: 1, wholesome: 1, analyst: 1 };
const CLUB = {
  warm: ['{thank you for the support|appreciate you|we see you}', '{love to see it|that means a lot to everyone here}'], laugh: ['{ha|we saw that|fair}'], hype: ['{LETS GO|that is the spirit}'],
  plain: ['{thanks for the message|noted|we hear you}'], ask: ['{stay tuned|more soon|watch this space}'], bite: ['{respect the competition|see you out there}'], fight: ['{keep it respectful|we will let the series speak}']
};
const MEDIA = { warm: ['{thanks|appreciate it}'], plain: ['{noted|thanks for the reply}'], ask: ['{more to come|watch this space}'], laugh: ['{ha|fair}'], hype: ['{noted|big energy}'], bite: ['{noted|we will see}'], fight: ['{noted|the series will tell}'] };
const FAN = {
  warm: ['{proud of you|this is why we love you|class act|respect}', '{legend|we love to see it}'], laugh: ['{dead|lmao|this is why you are my favourite}', '{send this to the team chat|clip it}'],
  hype: ['{LETS GOOO|WE RIDE|THAT IS THE ENERGY}', '{say it louder|we are so back}'], bite: ['{sit down|ratio|the audacity}', '{talk to us after the series|big words}'],
  fight: ['{drag them|ratio incoming|this is going to be good|popcorn out}', '{no mercy|receipts, please}'], plain: ['{this|facts|noted|true}', '{interesting take|hm}'], ask: ['{big if true|we are watching|good question}', '{waiting on the answer}']
};
const FAN_KIND = { fight: ['troll', 'ultra', 'joker'], bite: ['troll', 'joker', 'ultra'], laugh: ['joker', 'joker', 'nerd'], warm: ['ultra', 'nerd', 'ultra'], hype: ['ultra', 'joker'], plain: ['nerd', 'doomer'], ask: ['nerd', 'doomer'] };
// a thread is more fun when somebody takes the other side
const FOLLOW = ['[tag] {this|facts|exactly|true|real}', '[tag] {lol|haha|nah}', '[tag] {agree|cannot argue|well said}'];

// "Generate": a ready-made reply in the chosen tone, in the user's own persona voice. [tag] is the author, [club] their club
const GEN = {
  '': ['[tag] {noted|fair point|interesting|ok, I see it|good to know}', '[tag] {that is one way to see it|we will see how it plays out|thanks for sharing}', '{hm|ok}. [tag] {keep us posted|let us see}'],
  respect: ['[tag] {respect|well played|credit where it is due|clean|class}', 'gg [tag]. {tough to play against|always a good one}', '[tag] {one of the best out there|honest respect}. [club] {is a proper team|always shows up}'],
  thanks: ['[tag] {thank you|thanks a lot|appreciate you}', '{big thanks|thank you} [tag], {means a lot|really appreciate it}', '[tag] {cheers|thanks for the support|you are the best}'],
  joke: ['[tag] {lmao|dead|I cannot|stop it}, {send help|my keyboard wept}', '[tag] {the boost was fake|skill issue (mine)|blaming the ping}', '{pov|me:} [tag] said it first, I {just nodded|panicked}'],
  hype: ['[tag] {LETS GO|WE ARE SO BACK|SCENES|BIG ENERGY}', '{this is the energy|say it louder} [tag]', '[tag] {WHO IS READY|NO DAYS OFF|ONE MORE}'],
  cocky: ['[tag] {big words|enjoy it while it lasts|easy|not even close}', '[tag] {write it down|remember this when we meet}', '{never in doubt|told you} [tag]. {sit back|watch}'],
  callout: ['[tag] {say it again on the server|receipts saved|run it back|you have been quiet}', '[tag] {is that all you have?|talk is cheap|queue me}', '[tag] {see you next series|bring it}. {I will be there|no excuses}']
};

function create(engine, env) {
  const { spin, fill, ux, fx, voices } = env;
  const u = (state) => { const x = ux(state); return x.thr || (x.thr = { open: [], gain: {} }); };
  const say = (r, bank, v) => { for (let i = 0; i < 6; i++) { const t = fill(spin(r, pick(r, bank)), v); if (t) return t.replace(/\s+/g, ' ').trim(); } return null; };
  const posts = (state) => state.social.posts;
  const find = (state, id) => posts(state).find((p) => p.id === id);
  const TWEET_MAX = engine.TWEET_MAX || 280;

  // the persona's voice on top of a line
  function deco(persona, text, r, plain) { // plain: case only, no emoji tail (used for generated drafts)
    if (persona === 'cryptic') return text.toLowerCase();
    if (persona === 'hype' && r() < 0.6 && text.indexOf('@') < 0) return text.toUpperCase();
    if (persona === 'meme' || persona === 'analyst') return text === text.toUpperCase() ? text : text.charAt(0).toLowerCase() + text.slice(1); // an all-caps line stays as it is (no 'sCENES')
    if (plain) return text;
    const tails = { hype: ['🔥', '🚀'], meme: ['💀', '😭'], trash: ['😏'], salty: ['🙄'], wholesome: ['💛'], humble: ['🙏'] }[persona];
    return tails && r() < 0.35 ? text + ' ' + pick(r, tails) : text;
  }

  function spam(state, me) { // the game's own rule (follower loss for posting a lot in one day), counted here for replies too
    const s = state.social, n = (s.mine || []).filter((p) => p.date === state.currentDate).length;
    if (n <= 1) return 0;
    const lost = Math.round((me.followers || 0) * Math.min(0.06, 0.004 * (n - 1)));
    if (lost <= 0) return 0;
    me.followers = Math.max(0, (me.followers || 0) - lost);
    if (!s.spam || s.spam.date !== state.currentDate) s.spam = { date: state.currentDate, lost: 0, posts: 0 };
    s.spam.lost += lost; s.spam.posts = n;
    return lost;
  }

  const identity = (p) => ({ kind: p.kind, authorId: p.authorId, clubId: p.clubId, name: p.name, handle: p.handle, followers: p.followers || 0, verified: !!p.verified, club: p.club, role: p.role, persona: p.persona, fanKind: p.fanKind });
  const teamOf = (state, p) => {
    if (p.kind === 'club' && p.clubId != null) return engine.teamById(state, p.clubId);
    if (p.kind === 'player' && p.authorId >= 0) { const pl = engine.playerById(state, p.authorId); return pl && pl.teamId >= 0 ? engine.teamById(state, pl.teamId) : null; }
    return p.club ? (state.teams || []).find((t) => t.name === p.club) || null : null;
  };

  // can this account answer, and how likely is it
  function chance(state, p, me, cls) {
    const ratio = Math.min(1, ((me.followers || 0) / Math.max(1, p.followers || 1)) * 4), fame = 0.35 + 0.65 * ratio;
    let base;
    if (p.kind === 'player') {
      if (p.authorId === me.id) return 0;
      const pl = engine.playerById(state, p.authorId); if (!pl || pl.retired) return 0;
      base = 0.55 * ({ hype: 1.2, trash: 1.1, wholesome: 1.3, cryptic: 0.4, streamer: 1.1 }[personaOf(p.name).id] || 1);
    } else if (p.kind === 'club') base = 0.35;
    else if (p.kind === 'creator') base = 0.5;
    else if (p.role === 'fan') base = 0.6;
    else if (p.role === 'journalist') base = 0.2;
    else if (p.role === 'media') base = 0.06;
    else if (p.role === 'leaker') base = 0.05;
    else return 0;
    const bold = cls === 'fight' || cls === 'bite' || cls === 'laugh' ? 1.4 : cls === 'warm' ? 1.15 : 1;
    const calmClub = (p.kind === 'club' && (cls === 'fight' || cls === 'bite')) ? 0.25 : 1; // clubs do not take the bait
    return Math.min(0.95, base * fame * bold * calmClub);
  }

  function authorLine(state, rand, who, me, cls, depth) {
    const v ={ tag: '@' + engine.handleFor(me.name) };
    if (who.kind === 'player') {
      const persona = personaOf(who.name);
      const bank = (cls === 'fight' || cls === 'bite') && CALM[persona.id] ? PLAYER.calm : PLAYER[cls];
      const t = say(rand, bank, v); return t ? deco(persona.id, t, rand) : null;
    }
    if (who.kind === 'club') { const t = say(rand, CLUB[cls] || CLUB.plain, {}); return t ? t.charAt(0).toUpperCase() + t.slice(1) : null; }
    if (who.role === 'fan') { const t = say(rand, FAN[cls], {}); return t; }
    if (who.kind === 'creator') { const t = say(rand, PLAYER[cls === 'fight' || cls === 'bite' ? 'plain' : cls], v); return t; }
    const t = say(rand, MEDIA[cls] || MEDIA.plain, {}); return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
  }

  function emit(state, rand, day, who, text, my, depth, extra) {
    const me = engine.playerById(state, state.userPlayerId);
    return voices.post(state, rand, day, who, text, Object.assign({ replyTo: my.id, mention: true, seen: false, targetKey: 'p' + (me ? me.id : -1), thrDepth: depth }, extra || {}));
  }

  function fanReply(state, rand, day, parent, my, cls, depth) {
    const team = teamOf(state, parent) || engine.teamById(state, state.userTeamId); if (!team) return null;
    const who = voices.fan(team, pick(rand, FAN_KIND[cls] || FAN_KIND.plain));
    if (who.handle === parent.handle) return null;
    const text = say(rand, FAN[cls] || FAN.plain, {}); if (!text) return null;
    const dup = posts(state).some((p) => p.replyTo === my.id && p.text === text); if (dup) return null;
    return emit(state, rand, day, who, text, my, depth);
  }

  const snap = (p) => ({ id: p.id, name: p.name, handle: p.handle, text: p.text || '', club: p.club, date: p.date, verified: !!p.verified, kind: p.kind, authorId: p.authorId, clubId: p.clubId, gif: p.gif, gifAlt: p.gifAlt });

  // ---------- plain repost (free, toggles) ----------
  function repost(state, o) {
    const me = engine.playerById(state, state.userPlayerId);
    if (!me) return { ok: false, error: 'No player.' };
    const orig = find(state, Number(o.id));
    if (!orig) return { ok: false, error: 'That post is too old to repost.' };
    if (orig.repostOf != null) return { ok: false, error: 'Open the original post first.' };
    const s = state.social, had = s.posts.find((p) => p.repostOf === orig.id && p.authorId === me.id && p.kind === 'player');
    if (had) { // undo
      s.posts.splice(s.posts.indexOf(had), 1);
      orig.reposts = Math.max(0, (orig.reposts || 0) - 1); if (orig.target) orig.target.reposts = Math.max(0, (orig.target.reposts || 0) - 1);
      return { ok: true, undone: true };
    }
    const team = me.teamId >= 0 ? engine.teamById(state, me.teamId) : null, id = state.nextId++;
    s.posts.unshift({ id, date: state.currentDate, kind: 'player', authorId: me.id, name: me.name, handle: engine.handleFor(me.name), club: team ? team.name : 'Free agent',
      followers: me.followers || 0, verified: (me.followers || 0) >= 50000, text: '', own: true, ux: true, repostOf: orig.id, quote: snap(orig), likes: 0, reposts: 0, replies: 0, views: 0 });
    orig.reposts = (orig.reposts || 0) + 1; if (orig.target) orig.target.reposts = (orig.target.reposts || 0) + 1;
    if (fx && team && orig.kind === 'club' && orig.clubId === team.id) fx.addRep(state, 0.05, 'repost:club'); // backing your own club's account
    // the author may notice (a kind word, now or later) - at a lower rate than for a reply
    const who = identity(orig), rand = env.mk(env.hash('rp:' + id)), p = chance(state, who, me, 'warm') * 0.4;
    if (orig.authorId !== me.id && p > 0 && rand() < p) u(state).open.push({ id, who, cls: 'warm', depth: 1, due: addDays(state.currentDate, 1 + Math.floor(rand() * 2)), kind: 'author' });
    return { ok: true, id };
  }

  // ---------- the world reposts / quotes the user's posts (notifications) ----------
  function npcReposts(state, day, rand) {
    const me = engine.playerById(state, state.userPlayerId), s = state.social; if (!me || !s.mine) return 0;
    const team = me.teamId >= 0 ? engine.teamById(state, me.teamId) : null; if (!team) return 0;
    const fame = Math.max(0.3, Math.min(1.5, (me.followers || 0) / 50000));
    let made = 0;
    for (const my of s.mine) {
      if (made >= 3) break;
      if (my.rq || my.replyTo != null || my.repostOf != null || daysBetween(my.date, day) > 1) continue;
      my.rq = true;
      const cls = my.cls || CLS_OF_TONE[my.tone] || 'plain';
      if (rand() > Math.min(0.8, 0.35 * fame)) continue;
      const who = voices.fan(team, pick(rand, FAN_KIND[cls] || FAN_KIND.plain));
      const quoted = rand() < 0.5 ? say(rand, FAN[cls] || FAN.plain, {}) : '';
      const q = voices.post(state, rand, day, who, quoted || '', { repostOf: my.id, quote: snap(my), mention: true, seen: false, targetKey: 'p' + me.id });
      if (quoted) { delete q.repostOf; q.quoteOf = my.id; } // a quote has its own words; a bare repost is only a banner
      my.reposts = (my.reposts || 0) + 1; if (my.target) my.target.reposts = (my.target.reposts || 0) + 1;
      made++;
    }
    return made;
  }

  // ---------- the user replies ----------
  function reply(state, rand, o, isQuote) {
    const me = engine.playerById(state, state.userPlayerId);
    if (!me) return { ok: false, error: 'No player.' };
    const text = String(o.text == null ? '' : o.text).replace(/[ \t]+/g, ' ').trim().slice(0, TWEET_MAX);
    if (!text) return { ok: false, error: 'Say something first.' };
    const parent = find(state, Number(o.id));
    if (!parent) return { ok: false, error: isQuote ? 'That post is too old to quote.' : 'That post is too old to reply to.' };
    if (parent.repostOf != null) return { ok: false, error: 'Open the original post first.' };
    const tone = TONES.indexOf(o.tone) >= 0 ? o.tone : null, cls = classify(tone, text), day = state.currentDate;
    const depth = Math.min(MAX_ROUNDS + 1, (parent.thrDepth || 0) + 1);
    const team = me.teamId >= 0 ? engine.teamById(state, me.teamId) : null;
    const id = state.nextId++;
    const my = {
      id, date: day, kind: 'player', authorId: me.id, name: me.name, handle: engine.handleFor(me.name), club: team ? team.name : 'Free agent',
      followers: me.followers || 0, verified: (me.followers || 0) >= 50000, text, mine: true, own: true, ux: true, ...(isQuote ? { quoteOf: parent.id, quote: snap(parent) } : { replyTo: parent.id, replyHandle: parent.handle }),
      tone, cls, thrDepth: depth, likes: 0, reposts: 0, replies: 0, views: 0, target: engine.tweetTargets(me.followers, text + ':' + id)
    };
    const s = state.social; if (!s.mine) s.mine = [];
    s.posts.unshift(my); s.mine.unshift(my); if (s.mine.length > 200) s.mine.length = 200;
    const field = isQuote ? 'reposts' : 'replies';
    parent[field] = (parent[field] || 0) + 1; if (parent.target) parent.target[field] = (parent.target[field] || 0) + 1;
    const lost = spam(state, me);
    // consequences: a few followers from whoever's audience you borrowed, Y mood, a teammate's feelings
    const T = u(state), todays = T.gain[day] || 0;
    let gain = 0;
    if (parent.authorId !== me.id || parent.kind !== 'player') {
      const seen = Math.min(parent.followers || 0, 500000), cap = Math.max(3, Math.round((me.followers || 0) * 0.02));
      gain = Math.min(cap, Math.round(seen * 0.0008 * Q[cls] / (1 + todays)));
      if (gain > 0) { me.followers = (me.followers || 0) + gain; T.gain[day] = todays + 1; }
      if (fx && REP[cls]) fx.addRep(state, REP[cls], (isQuote ? 'quote:' : 'reply:') + cls);
      const mate = parent.kind === 'player' && parent.authorId !== me.id ? engine.playerById(state, parent.authorId) : null;
      if (mate && mate.teamId === state.userTeamId && fx && fx.morale) fx.morale(state, mate, cls === 'fight' ? -1 : cls === 'warm' || cls === 'hype' ? 0.5 : 0);
    }
    for (const k of Object.keys(T.gain)) if (daysBetween(k, day) > 14) delete T.gain[k];
    if (parent.kind === 'player' && parent.authorId !== me.id) { // rapport with that player, shown on their profile
      const rel = T.rel || (T.rel = {}), r = rel['p' + parent.authorId] || (rel['p' + parent.authorId] = { s: 0, n: 0 });
      r.s = Math.max(-10, Math.min(10, Math.round((r.s + ({ warm: 1, hype: 0.5, laugh: 0.5, ask: 0.2, plain: 0, bite: -0.5, fight: -1 }[cls] || 0)) * 10) / 10)); r.n++;
    }
    // the world answers: the author (maybe today, maybe later), one fan now, another fan later
    if (depth <= MAX_ROUNDS) {
      const who = identity(parent), p = chance(state, who, me, cls);
      if (p > 0 && rand() < p) {
        const off = rand() < 0.25 ? 0 : 1 + Math.floor(rand() * 2);
        if (off === 0) { const t = authorLine(state, rand, who, me, cls, depth); if (t) emit(state, rand, day, who, t, my, depth); }
        else T.open.push({ id, who, cls, depth, due: addDays(day, off), kind: 'author' });
      }
      if (rand() < 0.65) fanReply(state, rand, day, parent, my, cls, depth);
      if (rand() < 0.4) T.open.push({ id, who: identity(parent), cls, depth, due: addDays(day, 1 + Math.floor(rand() * 2)), kind: 'fan' });
    }
    if (T.open.length > 30) T.open.splice(0, T.open.length - 30);
    return { ok: true, post: my, lost, gain, cls, depth };
  }

  // ---------- once a day: answers that were due ----------
  function run(state, day, rand) {
    const T = u(state), me = engine.playerById(state, state.userPlayerId); if (!me) { T.open = []; return 0; }
    let made = 0; const keep = [];
    try { made += npcReposts(state, day, env.mk(env.hash('rq:' + day + ':' + state.nextId))); } // its own dice: the day's shared random stream is untouched
    catch (e) { /* cosmetic */ }
    for (const e of T.open) {
      if (daysBetween(e.due, day) > 6) continue;
      if (e.due > day || made >= 8) { keep.push(e); continue; }
      const my = find(state, e.id); if (!my) continue;
      if (e.kind === 'author') { const t = authorLine(state, rand, e.who, me, e.cls, e.depth); if (t && emit(state, rand, day, e.who, t, my, e.depth)) made++; }
      else { const parent = find(state, my.replyTo != null ? my.replyTo : my.quoteOf); if (parent && fanReply(state, rand, day, parent, my, e.cls, e.depth)) made++; }
    }
    T.open = keep;
    return made;
  }

  // ---------- "Generate" button: a draft in the chosen tone (nothing is posted) ----------
  function gen(state, rand, o) {
    const me = engine.playerById(state, state.userPlayerId);
    if (!me) return { ok: false, error: 'No player.' };
    const parent = find(state, Number(o.id)), tone = TONES.indexOf(o.tone) >= 0 ? o.tone : '';
    const club = parent && parent.club && ['Free agent', 'News', 'Insider', 'Caster'].indexOf(parent.club) < 0 ? parent.club : null;
    const v = { tag: parent ? '@' + parent.handle : '#', club }; // '#' = no one to tag: dropped below
    const persona = personaOf(me.name).id, avoid = String(o.avoid || '').trim();
    let text = null;
    for (let i = 0; i < 8 && (!text || text === avoid || !/\s/.test(text)); i++) { const c = say(rand, GEN[tone], v) || say(rand, GEN[''], { tag: v.tag }); if (c) text = deco(persona, parent ? c : c.replace(/#\s*/g, ''), rand, true).trim(); }
    return text ? { ok: true, text } : { ok: false, error: 'Nothing came to mind.' };
  }

  // ---------- comments under a post, made when its thread is first opened (so the reply count is not just a number) ----------
  const CTX_CLS = { win: 'hype', mvp: 'hype', goals: 'hype', title: 'hype', upsetW: 'hype', rout: 'hype', streakW: 'hype', signedNew: 'warm', milestone: 'warm', respect: 'warm', loss: 'warm', routL: 'warm', upsetL: 'warm', out: 'warm', injured: 'warm', callout: 'fight', rebut: 'fight', reply: 'bite', life: 'laugh', grind: 'plain' };
  const TONE_CLS = { humble: 'warm', apology: 'warm', emotional: 'warm', thanks: 'warm', respect: 'warm', analyst: 'plain', cryptic: 'plain', hype: 'hype', cocky: 'bite', joke: 'laugh', callout: 'fight' };
  const AMB_CAP = 20; // the UI shows min(this, reply count) until the thread is opened, so the two always agree
  function ambient(state, o) {
    const p = find(state, Number(o.id));
    if (!p || p.amb || p.repostOf != null) return { ok: true, made: 0 };
    p.amb = true;
    const have = posts(state).filter((x) => x.replyTo === p.id).length, want = Math.min(AMB_CAP, p.replies || 0) - have;
    let made = 0;
    const rand = env.mk(env.hash('amb:' + p.id)), team = teamOf(state, p) || engine.teamById(state, state.userTeamId);
    if (want > 0 && team) {
      const cls = p.tone ? TONE_CLS[p.tone] || CLS_OF_TONE[p.tone] || 'plain' : CTX_CLS[p.ctx] || (p.mine ? 'warm' : 'plain'), used = new Set();
      const others = (state.teams || []).filter((x) => x.id !== team.id && x.tier === team.tier && x.region === team.region);
      for (let i = 0; i < want * 4 && made < want; i++) {
        const tm = others.length && rand() < 0.25 ? pick(rand, others) : team, c = rand() < 0.75 ? cls : 'plain';
        const who = voices.fan(tm, pick(rand, FAN_KIND[c] || FAN_KIND.plain)), text = say(rand, FAN[c], {});
        if (!text || used.has(who.handle + text) || who.handle === p.handle) continue;
        used.add(who.handle + text); voices.post(state, rand, p.date, who, text, { replyTo: p.id, amb: true }); made++;
      }
    }
    p.replies = have + made; // the number shown is now exactly the comments there are
    if (p.target) p.target.replies = p.replies;
    return { ok: true, made };
  }

  function rpc(state, json) {
    let o; try { o = JSON.parse(json); } catch (e) { return { ok: false, error: 'That could not be done.' }; }
    if (!state.social) state.social = { posts: [], prompt: null };
    const rand = env.mk(env.hash('thr:' + state.currentDate + ':' + state.nextId + ':' + (o.id || 0)));
    if (o.a === 'reply') return reply(state, rand, o);
    if (o.a === 'open') return ambient(state, o);
    if (o.a === 'quote') return reply(state, rand, o, true);
    if (o.a === 'repost') return repost(state, o);
    if (o.a === 'gen') return gen(state, env.mk(env.hash('gen:' + (o.n || 0) + ':' + state.nextId + ':' + (o.id || 0))), o);
    return { ok: false, error: 'That could not be done.' };
  }

  return { reply, run, rpc, classify, PREFIX };
}

module.exports = { create, classify, PREFIX, TONES, MAX_ROUNDS };
