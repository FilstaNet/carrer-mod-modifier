// Y voices: fans, news outlets, journalists, leakers and casters reacting to what really happened in the game world
// (state.news: upsets, routs, titles, injuries, transfers, offers) plus a rumour mill that is NOT always right.
// Additive and pure-JSON: posts use the game's feed shape with kind 'voice' (no profile link) or 'creator' (casters, real avatars).
// Loaded by ux-social.js (create(engine, env)); env supplies its text helpers so there is one spin/fill implementation.
const { personaOf, hash } = require('./ux-persona');

const pick = (r, a) => a[Math.floor(r() * a.length)];
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const money = (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : '$' + Math.round(n));

// ---------- fans: five archetypes per club; flavour wraps a shared event core ----------
const ARCH = {
  ultra: { name: ['[t] Ultras', '[t] Faithful', '[a] Army', '[t] Nation'], p: ['LETS GO', 'WHAT A TEAM', 'PROUD', 'THIS IS OUR YEAR', 'ABSOLUTE SCENES'], n: ['Still believe', 'We stand with them', 'Head up', 'Not losing faith'], z: ['Interesting', 'Keeping the faith', 'Watching closely'], tail: ['💙', '🔥', '🙌', ''], upper: 0.4 },
  doomer: { name: ['sad [a] fan', '[a] copium', '[t] pain', '[a] suffering'], p: ['ok but it will not last', 'enjoy it, it ends badly', 'cool, now do it again', 'do not get used to it'], n: ['called it', 'every single time', 'of course', 'tell me why I watch'], z: ['something will go wrong', 'I have a bad feeling', 'here we go again'], tail: ['😔', '🫠', '', '😭'], upper: 0 },
  nerd: { name: ['[a] Stats', '[t] Numbers', '[a] Analytics', '[t] Tracker'], p: ['The numbers back it up', 'Efficiency was the story', 'Boost control decided it', 'Clean rotations'], n: ['Small sample, but', 'Variance, mostly', 'Shot quality was fine', 'Worth a closer look'], z: ['Noting this', 'Data point', 'For the record', 'Context:'], tail: ['📊', '', '🧮', ''], upper: 0 },
  joker: { name: ['[a] Memes', '[t] Shitposts', '[a] Clips', '[t] Banter'], p: ['me when we win:', 'nobody:', 'pov: W', 'clip it'], n: ['me when we lose:', 'send help', 'pov: L', 'cooked'], z: ['pov:', 'breaking:', 'me:'], tail: ['💀', '😭', '🗿', '🤡'], upper: 0 },
  troll: { name: ['[a] Haters', 'xX[a]Xx', '[a] Rent Free', '[a] Reality'], p: ['funny how fast the story changes', 'cope harder', 'meanwhile [other] fans:', 'imagine being [other]'], n: ['lol', 'sit down', 'ratio incoming', 'free content'], z: ['just saying', 'hot take', 'unpopular opinion'], tail: ['😏', '🤡', '🍿', ''], upper: 0 }
};
const FAN_KINDS = Object.keys(ARCH);
const FANCORE = {
  win: ['{[team] take it [score]|[score] over [other]|W over [other], [score]}', '{that [score] against [other] says it all|[other] could not stop us, [score]}'],
  loss: ['{[other] got us [score]|[score] loss to [other]|dropped it to [other], [score]}', '{we were not good enough against [other]|that [score] hurts}'],
  big_win: ['{[team] stun [other] [score]|[other] never saw [team] coming ([score])|[team] over [other] [score], the bracket just changed}', '{what a result: [score] vs [other]|[score]. Remember this series}'],
  big_loss: ['{[other] ran us over, [score]|[score] to [other], that was ugly|a [score] defeat to [other], we need answers}', '{no way that happened: [score] vs [other]|[team] got stunned, [score]}'],
  title: ['{[team] win it all|champions: [team]|[team] are CHAMPIONS}', '{what a run by [team]|trophy night for [team]}'],
  out: ['{[team] are out|that is it for [team] this event|[team] eliminated by [other]}', '{season of questions after that exit|[other] knocked us out}'],
  injury: ['{[player] is out for [days] days ([reason])|bad news: [player] unavailable, [reason]|[player] injured, back in [days] days}', '{get well [player], we need you|[team] without [player] for [days] days}'],
  in: ['{[player] to [team], welcome|new signing: [player]|[player] joins [team]}', '{[team] added [player], that is a statement|finally, [player] is ours}'],
  outx: ['{[player] leaving [team]|we lose [player] to [other]|[player] to [other], the end of an era}', '{thank you [player]|will miss [player]}'],
  interest: ['{[team] want [player]|offer in for [player] from [team]|[team] are circling [player]}', '{will [player] move?|[player] to [team]? interesting}'],
  streakW: ['{[streak] in a row for [team]|[team] are on a [streak]-series run|unbeaten in [streak]: [team]}'],
  streakL: ['{[streak] straight losses for [team]|[team] cannot buy a win, [streak] in a row|winless in [streak]}']
};
const POS = { win: 1, big_win: 1, title: 1, in: 1, streakW: 1 }, NEG = { loss: 1, big_loss: 1, out: 1, injury: 1, outx: 1, streakL: 1 };
const FAN_REPLY = ['[tag] {this|facts|exactly|true|real}', '[tag] {agree|cannot argue|well said|this is it}', '[tag] {ok but|hear me out:} {[team]|this club} {deserves better|will be fine|is built different}', '[tag] {lol|haha|nah}'];

// ---------- media: headline + lead, writers and casters ----------
const MEDIA = ['[headline]', '{BREAKING|NEWS|UPDATE}: [headline]', '[headline] {- more soon|- full report on the site|- details inside}', '{📰|🚨|⚡} [headline]'];
const JOURN = {
  signing: ['{Understand|Told} [player] {chose [team] for the project|decided fast once [team] came calling|saw a clear role at [team]}.', '{Spoke to people close to [player]|Hearing from the camp}: the move to [team] was {months in the making|a team-first call}.'],
  'free-agent': ['{Source|Hearing}: [player] had {two other offers|interest elsewhere} before picking [team].'],
  injury: ['Understand [player]\'s {recovery is on track|setback is minor|return date is tentative}.', '{Hearing|Told} [team] will {rotate|use a sub} while [player] is out.'],
  upset: ['{Nobody had this|The form book is torn up}: [team] over [other] ([score]). {Expect changes at [other]|Watching the reaction}.', '{Big result|Stunner}: [team] beat [other] [score]. {Pressure now on [other]|Momentum shift}.'],
  rout: ['{[team] were never in doubt|Dominant}: [score] against [other]. {Statement made|Warning to the rest}.'],
  title: ['{Champions|Winners}: [team]. {The best team on the day|Earned it}.'],
  'club-series': ['{Exit for [team]|[team] out}. {Questions will be asked|Expect a review in the camp}.'],
  'player-interest': ['{Understand|Hearing} [team] {are serious|have made a formal approach} for [player].']
};
const CASTER = {
  upset: ['{WHAT a series|Wow}. [team] over [other] [score]. {Nobody called that|The bracket just got interesting}.', 'Still shaking from [team] vs [other]. [score].'],
  rout: ['[team] looked {unstoppable|inevitable} against [other] ([score]). {Clean|Textbook} rotations.'],
  title: ['[team] {take it|are champions}! {Incredible run|What a finish}. {Congratulations|Well deserved}.'],
  signing: ['[player] to [team]: {fascinating|big move}. {Cannot wait to cast it|Curious how they fit}.'],
  'club-series': ['[other] vs [team] was {a banger|nervy|tight}. {Well played both|Heartbreak for [team]}.']
};
// leakers: invented accounts. Their word is only as good as their record, which is tracked in the save.
const LEAKERS = ['RL Transfer Desk', 'Boost Insider', 'Whisper Hub', 'Garage Leaks', 'The Third Man', 'Roster Radar', 'Demo Sources', 'Backboard Rumours'];
const RUMOUR = {
  scoop: ['{🚨|👀} {Hearing|Understand} [team] {have made|are preparing} an offer for [player]. {Early stages|Talks ongoing}.', 'Told [team] are {pushing|going all in} for [player]. {Not done yet|More soon}.'],
  gossip: ['{Hearing|Sources:|Do not quote me but} [player] {is unhappy at [from]|is on the shortlist at [team]|could be moving to [team]} {👀|🤫|}', '{Whispers|Rumour}: [team] {like|are monitoring} [player]. {Take with salt|Unconfirmed}.', '[player] to [team]? {Hearing it is closer than people think|Talks, I am told|Someone close to the player says yes}.'],
  exclusive: ['{🚨 EXCLUSIVE|EXCLUSIVE|🚨}: [player] to [team] is {done|agreed}. {Announcement imminent|Been on this for days}.', '[player] {has agreed|signs} with [team]. {Official soon|You heard it here first}.'],
  confirm: ['{Told you.|Here we go.|CONFIRMED.} [player] to [team]. {That is [hit] for [tot] this season.|Another one.|Sources were right.}'],
  half: ['{Close one|Half right}: [player] moved, but to [team2], not [team]. {Details were off|Plans changed late}.'],
  fizzle: ['{Nothing in it after all|Talks have gone cold|Plans changed}: [player] to [team] is {off|dead|not happening}.', 'Update: the [player] to [team] story {went nowhere|fell through}. {Apologies|My bad|Sometimes it happens}.']
};
const DENY = ['{That is {fake|false|not true}|Not going anywhere|Focused on [team]}. {Stop making things up|Check your sources|Next}.', '{Where do you even get this|Source: made up}. I am {happy at [team]|staying put}.', '{No truth to this|Nobody has spoken to me}. {Back to work|Eyes on the next series}.'];
const MORALE_DENY_PRE = { hype: (t) => t.toUpperCase(), cryptic: (t) => t.toLowerCase() };

function create(engine, env) {
  const { spin, fill, ux, fresh, compose, kfmt, fx } = env;
  const T = (state, id) => (id != null && id >= 0 ? engine.teamById(state, id) : null);
  const handle = (n) => engine.handleFor(n);
  const say = (r, bank, v) => { for (let i = 0; i < 6; i++) { const t = fill(spin(r, pick(r, bank)), v); if (t) return t.replace(/(\w)\.\.(\s|$)/g, '$1.$2').replace(/\s+/g, ' ').trim(); } return null; };

  function vs(state) { return ux(state).voices || (ux(state).voices = { reacted: [], rumours: [], leakers: {}, outlets: {} }); }

  // ----- accounts (deterministic; the same name always gives the same follower count) -----
  const outlet = (n) => ({ role: 'media', kind: 'voice', authorId: -1, name: n, handle: handle(n), followers: 120000 + (hash('outlet:' + n) % 700000), verified: true, club: 'News' });
  const writer = (w, src) => ({ role: 'journalist', kind: 'voice', authorId: -1, name: w, handle: handle(w), followers: 18000 + (hash('wr:' + w) % 160000), verified: true, club: src });
  const leaker = (n) => ({ role: 'leaker', kind: 'voice', authorId: -1, name: n, handle: handle(n), followers: 30000 + (hash('lk:' + n) % 240000), verified: false, club: 'Insider' });
  // salt (optional): a different account every time it changes. Without it the account is stable per club and kind (feed posts).
  // About half of the salted fans are not named after the club at all: handle-style names, so a comment section is not a wall of "[club] Nation".
  const HA = ['boost', 'aerial', 'ceiling', 'flip', 'demo', 'nitro', 'rotation', 'wall', 'kickoff', 'saves', 'pinch', 'wavedash', 'musty', 'redirect', 'fakeout', 'bump'];
  const HB = ['goblin', 'andy', 'main', 'enjoyer', 'guy', 'wizard', 'lord', 'kid', 'tv', 'rl', 'addict', 'gremlin', 'player', 'watcher', 'dad', 'fan'];
  const HF = ['Maya', 'Jonas', 'Aki', 'Luca', 'Sam', 'Noor', 'Theo', 'Ines', 'Kaito', 'Ola', 'Dario', 'Mina'];
  function fan(team, k, salt) {
    const a = ARCH[k], h = hash('fan:' + team.id + ':' + k + (salt == null ? '' : ':' + salt));
    const t = team.name.replace(/^Team\s+/i, ''), ab = team.abbrev || t.slice(0, 3).toUpperCase();
    let name = pick(() => (h % 997) / 997, a.name).replace('[t]', t).replace('[a]', ab);
    if (salt != null && h % 100 < 55) {
      const n = (h >>> 3) % 100, r = (h >>> 9) % 3;
      name = r === 0 ? HA[(h >>> 4) % HA.length] + HB[(h >>> 8) % HB.length] + (n % 2 ? n : '') : r === 1 ? HF[(h >>> 4) % HF.length] + '_' + (h % 2 ? 'RL' : ab) + (n % 3 ? '' : n) : HA[(h >>> 4) % HA.length] + '.' + HB[(h >>> 8) % HB.length];
    }
    return { role: 'fan', kind: 'voice', authorId: -1, name, handle: handle(name), followers: 250 + Math.round((team.followers || 5000) * (0.002 + (h % 100) / 25000)), verified: false, club: team.name, fanKind: k };
  }

  function post(state, rand, day, acc, text, extra) {
    const s = state.social, u = ux(state);
    const p = Object.assign({ id: state.nextId++, date: day, likes: 0, reposts: 0, replies: 0, views: 0, ux: true, text }, acc, extra || {});
    p.views = Math.round((p.followers || 1000) * (0.25 + rand() * 0.9));
    p.likes = Math.round(p.views * (0.02 + rand() * 0.05));
    p.reposts = Math.round(p.likes * (0.06 + rand() * 0.12));
    p.replies = Math.round(p.likes * (0.04 + rand() * 0.1));
    s.posts.unshift(p);
    u.said.push(text); if (u.said.length > 600) u.said.splice(0, u.said.length - 600);
    return p;
  }

  // ----- one news item -> a wave of reactions -----
  const MAJOR = { title: 1, upset: 1, signing: 1, 'club-series': 0.5 };
  function react(state, rand, day, n, left) {
    const d = n.data || {}, k = d.kind, userId = state.userTeamId;
    const tm = T(state, n.teamId), pl = n.playerId != null ? engine.playerById(state, n.playerId) : null;
    let ot = T(state, n.fromTeamId);
    if (k === 'player-interest' && pl) ot = T(state, pl.teamId);
    if (!tm && !pl) return 0;
    const v = { team: tm && tm.name, other: ot && ot.name, from: ot && ot.name, player: pl && pl.name, score: d.score, fee: d.fee ? money(d.fee) : null, reason: d.reason, days: d.days, until: d.until, headline: n.headline };
    const mine = (tm && tm.id === userId) || (ot && ot.id === userId);
    if (mine && fx) fx.fromEvent(state, k, tm, ot, userId);
    const tag = (t) => (t && t.abbrev ? '#' + t.abbrev : null);
    const tags = [tag(tm), tag(ot), { signing: '#Transfers', 'free-agent': '#Transfers', 'player-interest': '#Transfers', injury: '#Injury', upset: '#Upset', title: '#Title', rout: '#Rout' }[k]].filter(Boolean);
    let made = 0, mediaPost = null;
    const go = (acc, text, extra) => { if (text && fresh(state, text) && made < left) { made++; return post(state, rand, day, acc, text, Object.assign({ tags, newsId: n.id }, extra)); } return null; };
    // 1) the outlet that broke it (the game's own source name)
    if (n.source && (mine || rand() < 0.55)) {
      let text = say(rand, MEDIA, v);
      const lead = String(n.body || '').split(/(?<=[.!?])\s/)[0];
      if (text && lead && lead.length <= 120 && lead !== n.headline && rand() < 0.4 && text.indexOf(' - ') < 0 && text.indexOf(lead) < 0) text += (/[.!?]$/.test(text) ? ' ' : '. ') + lead;
      mediaPost = go(outlet(n.source), text);
    }
    // 2) the reporter's own take
    if (n.writer && JOURN[k] && rand() < (mine ? 0.5 : 0.22)) go(writer(n.writer, n.source), say(rand, JOURN[k], v), mediaPost ? { replyTo: mediaPost.id } : null);
    // 3) fans of both clubs (the user's club always gets a voice)
    const cls = { upset: ['big_win', 'big_loss'], rout: ['win', 'big_loss'], title: ['title', null], 'club-series': ['out', 'win'], injury: ['injury', null], signing: ['in', 'outx'], 'free-agent': ['in', null], 'player-interest': ['interest', 'interest'] }[k];
    if (cls) {
      [[tm, cls[0]], [ot, cls[1]]].forEach(([team, c]) => {
        if (!team || !c || !FANCORE[c]) return;
        if (!(team.id === userId || rand() < 0.6)) return;
        const kind = pick(rand, FAN_KINDS);
        if (kind === 'troll' && !NEG[c]) return; // haters only turn up when there is something to mock
        const f = fan(team, kind), A = ARCH[kind];
        const other = team === tm ? ot : tm;
        const vv = Object.assign({}, v, { team: team.name, other: other ? other.name : null });
        let text = say(rand, FANCORE[c], vv);
        if (!text) return;
        const sign = POS[c] ? 'p' : NEG[c] ? 'n' : 'z';
        if (rand() < 0.65) { const o = pick(rand, A[sign]).replace('[other]', vv.other || 'them'); text = o + (/[:.!?]$/.test(o) ? ' ' : '. ') + text; }
        if (A.upper && rand() < A.upper) text = text.toUpperCase();
        else if (kind === 'joker' || kind === 'nerd') text = text.charAt(0).toLowerCase() + text.slice(1);
        const tail = pick(rand, A.tail); if (tail && rand() < 0.5) text += ' ' + tail;
        const fp = go(f, text, mediaPost && rand() < 0.5 ? { replyTo: mediaPost.id } : null);
        if (fp && rand() < 0.3) { // a second voice replies to the fan
          const k2 = pick(rand, FAN_KINDS), f2 = fan(rand() < 0.5 ? team : other || team, k2);
          if (f2.handle !== f.handle) go(f2, say(rand, FAN_REPLY, Object.assign({ tag: '@' + f.handle }, vv)), { replyTo: fp.id });
        }
      });
    }
    // 4) players involved (their own persona decides the voice)
    const lineup = (t) => { const ids = (t && (t.lineup || t.playerIds)) || []; const a = ids.map((id) => engine.playerById(state, id)).filter((x) => x && !x.retired && !x.isUser); return a.length ? pick(rand, a) : null; };
    const playerPost = (p, ctx, vars) => { if (!p) return; const t = compose(rand, personaOf(p.name), ctx, Object.assign({}, vars)); if (t) go({ kind: 'player', authorId: p.id, name: p.name, handle: handle(p.name), followers: p.followers || 0, verified: (p.followers || 0) >= 50000, club: (T(state, p.teamId) || {}).name || 'Free agent', persona: personaOf(p.name).id }, t, { ctx }); };
    if (k === 'upset' || k === 'rout') { if (rand() < 0.6) playerPost(lineup(tm), k === 'upset' ? 'upsetW' : 'rout', { opp: v.other, score: v.score, team: v.team }); if (rand() < 0.4) playerPost(lineup(ot), k === 'upset' ? 'upsetL' : 'routL', { opp: v.team, score: v.score, team: v.other }); }
    else if (k === 'title') { if (rand() < 0.8) playerPost(lineup(tm), 'title', { team: v.team }); }
    else if (k === 'club-series') { if (rand() < 0.5) playerPost(lineup(tm), 'out', { team: v.team, opp: v.other }); }
    else if (k === 'injury') { if (pl && !pl.isUser && rand() < 0.7) playerPost(pl, 'injured', { reason: v.reason, days: v.days, team: v.team }); }
    else if (k === 'signing' || k === 'free-agent') {
      if (pl && !pl.isUser && rand() < 0.85) playerPost(pl, 'signedNew', { team: v.team, fromTeam: v.from });
      if (ot && rand() < 0.5) playerPost(lineup(ot), 'farewell', { player: v.player, team: v.team });
    }
    // 5) casters and creators on the big stories (real accounts with real avatars)
    if (CASTER[k] && (MAJOR[k] || 0) >= rand() * 1.4 && typeof engine.creatorList === 'function') {
      const cs = engine.creatorList().filter((c) => c.kind === 'caster' || rand() < 0.3);
      const c = cs.length ? pick(rand, cs) : null;
      if (c) go({ kind: 'creator', authorId: c.id, name: c.name, handle: c.handle, followers: c.followers, verified: c.followers >= 50000, club: 'Caster', role: 'caster' }, say(rand, CASTER[k], v));
    }
    // 6a) the odd leaker had it first, and is right
    if ((k === 'signing' || k === 'free-agent') && pl && tm && rand() < 0.45) {
      const name = pick(rand, LEAKERS), rec = vs(state).leakers[name] || (vs(state).leakers[name] = { hit: 0, miss: 0 });
      if (go(leaker(name), say(rand, RUMOUR.exclusive, v), { rumour: 'confirmed' })) rec.hit++;
    }
    // 6) the rumour mill reacts to real offers: sometimes it was right all along
    if (k === 'player-interest' && pl && tm && rand() < 0.6) rumour(state, rand, day, pl, tm, true, tags);
    return made;
  }

  // ----- rumours: scoops (true), gossip (invented) and the follow-ups that grade them -----
  function rumour(state, rand, day, pl, to, real, tags) {
    const V = vs(state);
    if (V.rumours.some((r) => !r.done && r.playerId === pl.id)) return;
    const name = pick(rand, LEAKERS), rec = V.leakers[name] || (V.leakers[name] = { hit: 0, miss: 0 });
    const from = T(state, pl.teamId);
    const text = say(rand, real ? RUMOUR.scoop : RUMOUR.gossip, { player: pl.name, team: to.name, from: from ? from.name : 'his club' });
    if (!text || !fresh(state, text)) return;
    const p = post(state, rand, day, leaker(name), text, { rumour: 'unconfirmed', tags: (tags || [to.abbrev && '#' + to.abbrev]).concat('#Rumour').filter(Boolean) });
    V.rumours.push({ id: p.id, playerId: pl.id, teamId: to.id, date: day, leaker: name, real: !!real, done: false });
    if (fx) fx.onRumour(state, pl);
    if (V.rumours.length > 24) V.rumours.shift();
  }

  function newRumour(state, rand, day, pool) {
    const cands = pool.filter((p) => p.teamId >= 0 && ((p.rating || 0) >= 78 || (p.followers || 0) >= 60000 || (p.contractSeasons != null && p.contractSeasons <= 1)));
    if (!cands.length) return;
    const pl = pick(rand, cands), from = T(state, pl.teamId);
    const dests = (state.teams || []).filter((t) => t.id !== pl.teamId && t.id >= 0 && (!from || t.region === from.region) && (t.tier || 'A') === ((from && from.tier) || 'A'));
    if (dests.length) rumour(state, rand, day, pl, pick(rand, dests), false);
  }

  function grade(state, rand, day) {
    const V = vs(state);
    for (const r of V.rumours) {
      if (r.done) continue;
      const pl = engine.playerById(state, r.playerId); if (!pl) { r.done = true; continue; }
      const age = daysBetween(r.date, day);
      const moved = (state.news || []).find((n) => n.playerId === r.playerId && n.date >= r.date && n.data && (n.data.kind === 'signing' || n.data.kind === 'free-agent'));
      const dest = T(state, r.teamId), rec = V.leakers[r.leaker] || (V.leakers[r.leaker] = { hit: 0, miss: 0 });
      const mark = (status) => { const orig = state.social.posts.find((x) => x.id === r.id); if (orig) orig.rumour = status; };
      if (moved) {
        r.done = true;
        if (moved.teamId === r.teamId) {
          rec.hit++; mark('confirmed');
          post(state, rand, day, leaker(r.leaker), say(rand, RUMOUR.confirm, { player: pl.name, team: dest ? dest.name : 'them', hit: rec.hit, tot: rec.hit + rec.miss }), { rumour: 'confirmed', replyTo: r.id, tags: ['#Transfers'] });
        } else {
          rec.miss++; mark('wrong');
          const t2 = T(state, moved.teamId);
          post(state, rand, day, leaker(r.leaker), say(rand, RUMOUR.half, { player: pl.name, team: dest ? dest.name : 'them', team2: t2 ? t2.name : 'another club' }), { rumour: 'wrong', replyTo: r.id, tags: ['#Transfers'] });
        }
      } else if (age >= 3 && !pl.isUser && age <= 9 && !r.denied && rand() < 0.12) { // the player pushes back
        r.denied = true;
        const persona = personaOf(pl.name), st = MORALE_DENY_PRE[persona.id];
        let t = say(rand, DENY, { team: (T(state, pl.teamId) || {}).name || 'my team' });
        if (t) { if (st) t = st(t); if (fresh(state, t)) { mark('denied'); post(state, rand, day, { kind: 'player', authorId: pl.id, name: pl.name, handle: handle(pl.name), followers: pl.followers || 0, verified: (pl.followers || 0) >= 50000, club: (T(state, pl.teamId) || {}).name || 'Free agent', persona: persona.id }, t, { replyTo: r.id, tags: ['#Rumour'] }); } }
      } else if (age >= 10) {
        r.done = true; rec.miss++; if (!r.denied) mark('wrong');
        if (fx) fx.onRumourEnd(state, pl);
        if (rand() < 0.7) post(state, rand, day, leaker(r.leaker), say(rand, RUMOUR.fizzle, { player: pl.name, team: dest ? dest.name : 'them' }), { rumour: 'wrong', replyTo: r.id, tags: ['#Rumour'] });
      }
    }
  }

  // ----- the daily entry point (called by ux-social after the player posts) -----
  function run(state, day, rand, pool) {
    const V = vs(state);
    let left = 12, made = 0;
    const items = (state.news || []).filter((n) => n.date === day && V.reacted.indexOf(n.id) < 0 && n.data && n.data.kind);
    const w = (n) => ((n.teamId === state.userTeamId || n.fromTeamId === state.userTeamId) ? 5 : 0) + ({ title: 4, upset: 3, signing: 3, 'player-interest': 2, rout: 2, injury: 2, 'free-agent': 1, 'club-series': 1 }[n.data.kind] || 0) + rand();
    items.sort((a, b) => w(b) - w(a));
    for (const n of items.slice(0, 6)) {
      V.reacted.push(n.id);
      const c = react(state, rand, day, n, left - made); made += c;
      if (made >= left) break;
    }
    if (V.reacted.length > 400) V.reacted.splice(0, V.reacted.length - 400);
    if (rand() < 0.35) { const b = state.social.posts.length; newRumour(state, rand, day, pool); made += state.social.posts.length - b; }
    const b2 = state.social.posts.length; grade(state, rand, day); made += state.social.posts.length - b2;
    return made;
  }

  return { run, fan, react, grade, rumour, post, say };
}

module.exports = { create, ARCH, FANCORE, LEAKERS };
