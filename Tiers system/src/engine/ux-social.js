// Y (social feed) round: a much bigger post pool, light "dynamic" generation, player personalities, rivalry replies,
// inbound creator DMs and creator / external-pro collaboration offers (as normal media offers).
// Additive: posts use the game's own post shape (kind 'player'), DMs use the game's own thread shape (stage 'asking'),
// collab offers are extra "brands" in the game's media-brand list. Nothing in the original files is edited.
const { PERSONAS, personaOf, hash } = require('./ux-persona');

// ---------- tiny deterministic rand ----------
const mk = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const rand01 = (k) => (hash('r' + k) % 1000) / 1000;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const money = (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1000 ? '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : '$' + Math.round(n));

// ---------- text: spin syntax {a|b|c}, placeholders [opp] [team] ... ----------
function spin(r, t) { let g = 0; while (/\{[^{}]*\}/.test(t) && g++ < 8) t = t.replace(/\{([^{}]*)\}/g, (m, x) => pick(r, x.split('|'))); return t; }
function fill(t, v) { let ok = true; const out = t.replace(/\[([a-z]+)\]/g, (m, k) => { if (v[k] == null || v[k] === '') { ok = false; return m; } return v[k]; }); return ok ? out : null; }

// cores per context (what happened), neutral in tone
const CORE = {
  win: ['{[team] beat [opp] [score]|took the series vs [opp], [score]|[score] over [opp]|[opp] down, [score]|series won: [score] vs [opp]|[score]. [opp] sent home}',
    'that [score] against [opp] felt {earned|different|inevitable|nervy}', '{three points|a win|the W} vs [opp] ([score])'],
  loss: ['{lost [score] to [opp]|[opp] got us [score]|[score] against [opp], not our day|dropped the series to [opp] ([score])|[opp] take it [score]}',
    '[score] vs [opp]. {onwards|we go again|back to the lab|that one stings}', '{no excuses|not enough|short|close but no}: [score] to [opp]'],
  matchday: ['{[opp] today|series vs [opp] up next|we play [opp] today|matchday: [team] vs [opp]|[team] vs [opp] in a bit}', 'game day. [opp]. {lets see it|bring it|focus}'],
  buildup: ['{[opp] in [days] days|[days] days until [opp]|prep for [opp] is on|scrim block before [opp]|[opp] soon, [days] days}', 'film study on [opp] today ([days] days out)'],
  mvp: ['{MVP vs [opp]|player of the series against [opp]|MVP award tonight, [opp] series}', '[goals] goals and MVP against [opp]'],
  goals: ['{[goals] goals vs [opp]|[goals] goals today against [opp]|[goals] in the net vs [opp]}'],
  grind: ['{[goals] goals and [assists] assists this season|[games] series played this season|season so far: [goals]G [assists]A in [games]|[games] series, [goals] goals, still going}',
    '{day [games] of this season grind|[assists] assists so far, rotations are working}'],
  offseason: ['{off-season grind|time off, finally|new season soon|resting before the next split|off-season. mechanics only}'],
  milestone: ['{[followers] followers|just passed [followers] followers|[followers] of you now}', 'thanks for [followers]'],
  callout: ['{[tag] see you {soon|on the server|next series}|[tag] you have been quiet|[tag] queue me|[tag] bring the receipts|[tag] run it back}'],
  respect: ['{[tag] respect, {clean|crisp|nasty} {mechanics|game|reads}|[tag] played well|gg [tag]|[tag] was the best player on the server}'],
  reply: ['{[tag] noted|[tag] ok|[tag] say that again|[tag] lol|[tag] we will see|[tag] sure}'],
  rebut: ['{[tag] that is all you have?|[tag] cute|[tag] receipts saved|[tag] we both know how this ends|[tag] keep talking}'],
  upsetW: ['{nobody gave us a chance vs [opp]|[score] over [opp], they will remember this|[opp] were the favourites, [score] says otherwise}', 'we {shocked|stunned} [opp] [score]'],
  upsetL: ['{[opp] beat us [score] and we have no excuses|[score] to [opp], a bad day at the worst time|upset by [opp], [score]. we own it}'],
  rout: ['{[score] vs [opp], that is how you play a series|[opp] swept aside, [score]|a statement against [opp], [score]}'],
  routL: ['{[score] to [opp]: that was rough|[opp] ran us over, [score]. back to the lab|no way to dress up that [score] against [opp]}'],
  title: ['{champions|we won it|trophy day for [team]}', 'thank you to everyone, [team] are champions'],
  out: ['{that is it for us this event|knocked out by [opp], we go again|eliminated. we will learn from it}'],
  injured: ['{out for [days] days: [reason]|bad news: [reason], I am out for [days] days|[reason]. out for [days] days, back soon}'],
  signedNew: ['{new chapter: [team]|joined [team] today|big thanks to [fromTeam] and hello to [team]}', '{excited for [team]|signed with [team], let us go}'],
  farewell: ['{good luck [player]|[player] is gone and we will miss him|all the best at [team], [player]}'],
  expiring: ['{contract year|last year of my deal|final season on this contract}', 'we will see what comes next'],
  streakW: ['{[streak] in a row|[streak] straight series wins|unbeaten in [streak], [team] rolling}'],
  streakL: ['{[streak] straight losses and counting|winless in [streak], this has to change|[streak] defeats in a row}']
};

// persona flavour: openers by mood (p positive, n negative, z neutral), closers, tail pool, and persona-only life posts
const FLAVOUR = {
  hype: {
    p: ['LETS GOOO', 'WHAT A SERIES', 'SCENES', 'UNREAL', 'FOR THE CROWD', 'WE ARE SO BACK'], n: ['NEXT ONE.', 'WE RESET.', 'STILL HUNGRY.', 'DONT COUNT US OUT'], z: ['BIG ONE', 'LOCKED IN', 'IT IS TIME', 'WAKE UP'],
    c: ['ABSOLUTE CINEMA', 'FEEL THAT ENERGY', 'ONE MORE', 'STAY LOUD'], tail: ['🔥', '🚀', '💥', '#RLCS', '🏆', '⚡'],
    life: ['{TRAINING CAMP ENERGY IS INSANE|SCRIM BLOCK WAS ELECTRIC|NEW PEAK RANK, NO CAP} {🔥|⚡|🚀}', 'LOCKED IN. HEADPHONES ON. {WORLD OFF|NO DAYS OFF}', '{WAKE UP|RISE AND GRIND} {EVERYBODY|CHAMPIONS} 🔥', 'I AM {FASTER|HUNGRIER|LOUDER} THAN LAST SEASON', 'WHO IS READY?! 🚀']
  },
  humble: {
    p: ['Grateful', 'Thankful for the team', 'Happy with that', 'Good group effort', 'Big thanks to everyone'], n: ['Not good enough, will work on it', 'We learn from this', 'My fault, will fix it', 'Back to work', 'Tough one'], z: ['Staying focused', 'One step at a time', 'Putting in the work', 'Showing up'],
    c: ['Thank you for the support', 'Back to practice', 'Appreciate it all', 'Just trying to improve'], tail: ['🙏', '', '', '💙'],
    life: ['{Long scrim day|Quiet practice session|Extra mechanics block} but {worth it|learning a lot}', 'Still a lot to improve. {Back to it|Keep going}.', 'Thank you to everyone who {messaged|supports us|watches}', '{Early start|Late night}, {VOD review|ranked}, repeat', 'Trying to be {1% better|more consistent} every day.']
  },
  trash: {
    p: ['Easy', 'Never in doubt', 'Told you', 'Who else', 'Not even close', 'Sit down'], n: ['Lucky bounces, nothing else', 'Do not get excited', 'Enjoy it while it lasts', 'Rematch whenever you want', 'Fluke'], z: ['Warning for everyone', 'Reminder: I am the problem', 'Somebody has to say it', 'Scared yet?'],
    c: ['rematch, any time', 'pay attention', 'this is not a threat, it is a schedule', 'your move'], tail: ['😏', '🐐', '', '#EZ'],
    life: ['{Top 3 player|One of the best|Best} in my region. {Prove me wrong|Argue below}', 'Ranked lobby just {fell apart|got scared} when they saw my name', 'Reminder that {I called it|I was right|nobody asked me but I was right}', 'Every team I play {gets nervous|plays scared|folds late}', 'Open the DMs, {I dare you|I have time}.']
  },
  meme: {
    p: ['pov: we won', 'me after that W:', 'ok but imagine losing to us', 'this is fine (we won)', 'no thoughts just W'], n: ['pov: we lost', 'me after that L:', 'ctrl+alt+delete', 'the boost was fake', 'skill issue (mine)'], z: ['pov:', 'nobody:', 'me:', 'breaking:', 'tell me you play rocket league without telling me'],
    c: ['(this is a joke)', '(not financial advice)', 'send help', 'iykyk'], tail: ['💀', '😭', '🗿', '🤡', '#rocketleague'],
    life: ['{my brain|my mechanics|my wallet} at {3am|the start of the season|rank reset}: {error 404|loading|please wait}', 'pov: you flip reset in a {1v1|2v2|3v3} and {hit the post|whiff|forget your own name}', 'boost starved {again|and happy|but still online}', 'my team: "rotate" / me: "i am rotating" / the camera: "you are not"', 'ranked {is a social experiment|made me stronger|owes me 40 mmr}']
  },
  analyst: {
    p: ['Clean execution', 'Rotations held up', 'Solid fundamentals', 'Boost economy decided it', 'Good spacing'], n: ['Rotation errors, not talent', 'Boost starved too often', 'Spacing broke down late', 'Overcommitted on 50s', 'Need cleaner kickoffs'], z: ['Quick note', 'Thread-worthy detail', 'VOD notes', 'Small detail that matters'],
    c: ['details win series', 'will review the VOD', 'rotation > mechanics', 'kickoff stats do not lie'], tail: ['📊', '', '', '🧠'],
    life: ['{Reviewed 3 VODs|Cleaned up kickoff routes|Tracked boost pad usage} today. {Findings|Notes}: {pad 7 matters|third man timing is the key|backboard reads are underrated}', 'Underrated skill: {patience|demo timing|corner rotation|reading the second touch}', 'Hot take: {shadow defense|boost control} > flashy mechanics', 'Notes from {scrims|ranked}: {opponents rush kickoffs|everyone ball-chases late}']
  },
  wholesome: {
    p: ['So happy', 'What a group', 'Love this team', 'Great energy', 'Proud of everyone'], n: ['Love this team, onwards', 'GG to them anyway', 'Grateful for the fans regardless', 'Chin up everyone', 'We will be back'], z: ['Good morning', 'Quick shoutout', 'Just a reminder', 'Be kind today'],
    c: ['love you all', 'be kind in lobbies', 'you are the best fans', 'respect to every opponent'], tail: ['💛', '🤝', '🌟', ''],
    life: ['{Thank you|Shoutout} to {everyone who showed up|the fans|my family} {today|this week}', 'Be {kind|patient} in {ranked|lobbies|chat}, everyone is {learning|having a hard day}', 'Great {sportsmanship|vibes} from {the other team|every opponent} this {week|split}', 'Reminder to {drink water|stretch|take a break}, {gamers|champions}']
  },
  salty: {
    p: ['We won, but', 'Fine, a W, but', 'Won despite the lag', 'W, no thanks to the server'], n: ['Server was a joke', 'Bounces decided that', 'Calendar is unfair', 'Whatever', 'Lag. Again.', 'Ball cam was off'], z: ['Unpopular opinion', 'Reminder that', 'Again?', 'Just saying'],
    c: ['not my fault', 'fix the servers', 'someone explain this', 'we are not moving on'], tail: ['🙄', '😤', '', '#fixrl'],
    life: ['{Ping|Lag|Packet loss} spiked again, {unplayable|coincidence?}', '{Ranked|Scrims} {matchmaking|teammates} {are testing me|ruined my day}', 'Nobody talks about {how loud keyboards are|how bad the schedule is|how unfair bounces are}', 'The {goal posts|ball|physics} {hate|owe} me {today|this season}']
  },
  cryptic: {
    p: ['.', 'as expected', 'good', 'noted'], n: ['..', 'not like this', 'later', 'hm'], z: ['soon', '...', 'wait', 'watch'],
    c: ['.', '...', '', 'you will see'], tail: ['', '', '👀'],
    life: ['{soon|wait|almost|not yet}', '{big|quiet} changes {incoming|ahead}. {or not}', '{watch this space|stay tuned|eyes open}', 'some things {are better unsaid|are coming|take time}', '{...|—|.}']
  },
  streamer: {
    p: ['Chat, we won', 'W in chat', 'Chat was right', 'Clip it chat'], n: ['Chat, we lost', 'L in chat', 'Chat I am so sorry', 'Do not clip that'], z: ['Going live in 10', 'LIVE NOW', 'Stream starts soon', 'Quick stream today'],
    c: ['link in bio', 'drop a follow', 'come hang out', 'subs get early scrim VODs'], tail: ['📺', '🎮', '', '#live'],
    life: ['{Live|Streaming} {now|in 30|tonight}: {ranked|scrims|viewer games} {come hang out|link in bio}', '{New VOD|New clip|New video} {up|dropping soon}. {Go watch|You will like it}', 'Chat voted {1v1s|ranked|subathon}. {I regret it|here we go}', 'Thank you for the {subs|follows|raid}, {actually insane|you are all legends}']
  }
};
const LIFE_GENERIC = ['{new patch|the ball|this playlist} feels {weird|great|off|fast}', '{coffee|tea|energy drink} first, {scrims|ranked|VODs} second', '{what is your {favorite|least favorite} map?|best {goal|save} you have seen this week?}', '{headset|controller|mouse} {dying|new|perfect}, {send help|finally}', '{big|long|quiet} day {ahead|behind us}', 'weekend plan: {ranked|scrims|sleep}', '{rank reset|season start} is {coming|here|a mess}'];

const GOOD = { win: 1, mvp: 1, goals: 1, upsetW: 1, rout: 1, title: 1, signedNew: 1, streakW: 1 }, BAD = { loss: 1, upsetL: 1, routL: 1, out: 1, injured: 1, streakL: 1 };
const mood = (ctx) => (GOOD[ctx] ? 'p' : BAD[ctx] ? 'n' : 'z');

function compose(r, persona, ctx, vars) {
  const F = FLAVOUR[persona.id];
  const core = CORE[ctx];
  for (let tries = 0; tries < 6; tries++) {
    let text = '';
    if (ctx === 'life') {
      const bank = r() < 0.7 ? F.life : LIFE_GENERIC;
      text = fill(spin(r, pick(r, bank)), vars); if (!text) continue;
    } else if (core) {
      const t = fill(spin(r, pick(r, core)), vars); if (!t) continue;
      text = t;
      if (r() < 0.65) { const o = pick(r, F[mood(ctx)]); text = o + (/[:.!?]$/.test(o) ? ' ' : r() < 0.5 ? '. ' : ' — ') + t; }
      if (r() < 0.4) { const c = pick(r, F.c); if (c) text += (r() < 0.5 ? '. ' : ' — ') + c; }
    } else continue;
    const noTag = text.indexOf('@') < 0;
    if (persona.id === 'cryptic') text = text.toLowerCase().replace(/[.]{4,}/g, '...');
    else if (persona.id === 'hype' && noTag && r() < 0.6) text = text.toUpperCase();
    else if ((persona.id === 'analyst' || persona.id === 'meme') && !/^[A-Z]{2}/.test(text)) text = text.charAt(0).toLowerCase() + text.slice(1);
    const tail = pick(r, F.tail);
    if (tail && r() < 0.5) text += ' ' + tail;
    if (text.trim()) return text.trim().replace(/\s+/g, ' ').replace(/\.\s*\./g, '.');
  }
  return null;
}

// ---------- generation ----------
const SAID_MAX = 600;
const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000];
const kfmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + 'K' : String(n));
const scoreText = (f, homeSide) => {
  const hw = f.homeWins || 0, aw = f.awayWins || 0;
  if (hw || aw) return homeSide ? hw + '-' + aw : aw + '-' + hw;
  return homeSide ? f.homeGoals + '-' + f.awayGoals : f.awayGoals + '-' + f.homeGoals;
};
const homeWon = (f) => ((f.homeWins || 0) || (f.awayWins || 0) ? f.homeWins > f.awayWins : f.homeGoals > f.awayGoals);

function create(engine, opts = {}) {
  const log = opts.log || (() => {});

  const yfx = require('./ux-fx').create(engine, { ux: (st) => ux(st) });
  const voices = require('./ux-voices').create(engine, { spin, fill, compose, kfmt, fx: yfx, ux: (st) => ux(st), fresh: (st, t) => fresh(st, t) });

  const threads = require('./ux-thread').create(engine, { spin, fill, ux: (st) => ux(st), fx: yfx, voices, mk, hash });
  const posting = require('./ux-post').create(engine, { spin, fill, compose, kfmt, scoreText, homeWon, voices, fx: yfx, mk, hash, ux: (st) => ux(st) });

  function ux(state) {
    const s = state.social || (state.social = { posts: [], prompt: null });
    if (s.ux && !s.ux.topics) s.ux.topics = {};
    return s.ux || (s.ux = { said: [], rivals: [], milestones: {}, topics: {}, lastDay: null, lastDm: null });
  }

  function index(state) { // teamId -> fixtures sorted by date
    const m = new Map();
    for (const f of state.fixtures || []) {
      for (const id of [f.homeId, f.awayId]) { let a = m.get(id); if (!a) m.set(id, a = []); a.push(f); }
    }
    for (const a of m.values()) a.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    return m;
  }

  function context(state, idx, p, day, ev) {
    const team = p.teamId >= 0 ? engine.teamById(state, p.teamId) : null;
    const v = { team: team ? team.name : null, self: p.name, followers: kfmt(p.followers || 0) };
    if (p.season) { v.goals = p.season.goals || 0; v.assists = p.season.assists || 0; v.games = p.season.games || 0; }
    let ctxPool = [];
    const fx = team ? idx.get(team.id) || [] : [];
    let last = null, next = null;
    for (const f of fx) {
      if (f.date <= day && f.played && daysBetween(f.date, day) <= 3) last = f;
      else if (f.date >= day && !next) next = f;
    }
    if (last) {
      const home = last.homeId === team.id;
      const opp = engine.teamById(state, home ? last.awayId : last.homeId);
      const won = home === homeWon(last);
      v.opp = opp ? opp.name : null; v.score = scoreText(last, home);
      const myGoals = (last.scorerIds || []).filter((id) => id === p.id).length;
      if (last.mvpId === p.id) { v.goals = myGoals || v.goals; ctxPool.push('mvp', 'mvp'); }
      else if (myGoals >= 2) { v.goals = myGoals; ctxPool.push('goals', won ? 'win' : 'loss'); }
      else ctxPool.push(won ? 'win' : 'loss', won ? 'win' : 'loss', 'grind');
    }
    if (next) {
      const home = next.homeId === team.id;
      const opp = engine.teamById(state, home ? next.awayId : next.homeId);
      const d = daysBetween(day, next.date);
      if (opp && !last) { v.opp = opp.name; v.days = d; }
      if (opp && last) { /* keep last-game vars for result posts */ }
      if (opp && d <= 1) ctxPool.push('matchday');
      else if (opp && d <= 5) ctxPool.push('buildup');
      if (opp && v.days == null) v.days = d;
      v.nextOpp = opp ? opp.name : null;
    }
    if (last && ev) { // what the game's own news says about that series, and the run the club is on
      const big = ev.fx.get(last.id), home = last.homeId === team.id, won = home === homeWon(last);
      if (big === 'upset') ctxPool.push(won ? 'upsetW' : 'upsetL', won ? 'upsetW' : 'upsetL');
      else if (big === 'rout') ctxPool.push(won ? 'rout' : 'routL', won ? 'rout' : 'routL');
      let n = 0, w = null;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; if (!f.played || f.date > day) continue; const hw = (f.homeId === team.id) === homeWon(f); if (w === null) w = hw; if (hw !== w) break; n++; }
      if (n >= 3) { v.streak = n; ctxPool.push(w ? 'streakW' : 'streakL', w ? 'streakW' : 'streakL'); }
    }
    if (ev) {
      const inj = ev.inj.get(p.id), mv = ev.moved.get(p.id);
      if (inj && inj.data.until >= day) { v.reason = inj.data.reason; v.days = Math.max(1, daysBetween(day, inj.data.until)); ctxPool.push('injured', 'injured'); }
      if (mv && daysBetween(mv.date, day) <= 5) { const from = mv.fromTeamId != null ? engine.teamById(state, mv.fromTeamId) : null; v.fromTeam = from ? from.name : 'my old club'; ctxPool.push('signedNew', 'signedNew'); }
    }
    if (p.contractSeasons != null && p.contractSeasons <= 1 && rand01(p.id + day) < 0.15) ctxPool.push('expiring');
    if (!ctxPool.length) ctxPool.push('grind', 'life', 'life', 'offseason');
    ctxPool.push('life'); // always a chance to just be a person
    return { v, ctxPool, team };
  }

  function emit(state, rand, day, p, ctx, text, extra) {
    const s = state.social;
    const post = {
      id: state.nextId++, date: day, likes: 0, reposts: 0, replies: 0, views: 0,
      kind: 'player', authorId: p.id, name: p.name, handle: engine.handleFor(p.name),
      club: p.teamId >= 0 && engine.teamById(state, p.teamId) ? engine.teamById(state, p.teamId).name : 'Free agent',
      followers: p.followers || 0, verified: (p.followers || 0) >= 50000, text, ctx, persona: personaOf(p.name).id, ux: true, ...(extra || {})
    };
    const tm = p.teamId >= 0 ? engine.teamById(state, p.teamId) : null;
    if (tm && tm.abbrev && !post.tags && ctx !== 'life') post.tags = ['#' + tm.abbrev];
    const fol = post.followers || 1000;
    post.views = Math.round(fol * (0.25 + rand() * 0.9));
    post.likes = Math.round(post.views * (0.02 + rand() * 0.05));
    post.reposts = Math.round(post.likes * (0.06 + rand() * 0.12));
    post.replies = Math.round(post.likes * (0.04 + rand() * 0.1));
    s.posts.unshift(post);
    const u = ux(state); u.said.push(text); if (u.said.length > SAID_MAX) u.said.splice(0, u.said.length - SAID_MAX);
    return post;
  }

  function fresh(state, text) { return ux(state).said.indexOf(text) === -1; }

  // the game's own news around today, indexed for the context builder
  function eventsOf(state, day) {
    const ev = { fx: new Map(), inj: new Map(), moved: new Map() };
    for (const n of state.news || []) {
      if (!n.data || n.date > day || daysBetween(n.date, day) > 8) continue;
      if ((n.data.kind === 'upset' || n.data.kind === 'rout') && n.fixtureId != null) ev.fx.set(n.fixtureId, n.data.kind);
      else if (n.data.kind === 'injury' && n.playerId != null) ev.inj.set(n.playerId, n);
      else if ((n.data.kind === 'signing' || n.data.kind === 'free-agent') && n.playerId != null) ev.moved.set(n.playerId, n);
    }
    return ev;
  }

  function tickDay(state, day, rand) {
    const u = ux(state);
    const idx = index(state);
    const ev = eventsOf(state, day);
    const pool = (state.players || []).filter((p) => !p.retired && p.teamId >= 0 && !p.isUser);
    if (!pool.length) return 0;
    // posting weight: persona frequency, fame and whether their team plays around today
    const weights = pool.map((p) => {
      const t = engine.teamById(state, p.teamId);
      const fx = t ? idx.get(t.id) || [] : [];
      const busy = fx.some((f) => Math.abs(daysBetween(day, f.date)) <= 1) ? 2 : 1;
      return personaOf(p.name).freq * busy * Math.pow(Math.max(100, p.followers || 100), 0.15);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const choose = () => { let x = rand() * total; for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i]; } return pool[pool.length - 1]; };
    let made = 0;
    const n = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) {
      const p = choose(); const persona = personaOf(p.name);
      const { v, ctxPool } = context(state, idx, p, day, ev);
      // milestones
      const done = u.milestones[p.id] || 0;
      const reached = MILESTONES.filter((m) => (p.followers || 0) >= m && m > done).pop();
      let ctx = pick(rand, ctxPool);
      const seen = u.topics[p.id]; // a player does not post the same story twice in two days
      for (let t = 0; t < 3 && seen && seen.ctx === ctx && ctx !== 'life' && daysBetween(seen.day, day) < 2; t++) ctx = pick(rand, ctxPool);
      if (reached && rand() < 0.6) { ctx = 'milestone'; v.followers = kfmt(reached); u.milestones[p.id] = reached; }
      let text = null;
      for (let t = 0; t < 8 && !text; t++) { const c = compose(rand, persona, t > 4 ? 'life' : ctx, v); if (c && fresh(state, c)) text = c; }
      if (text) { emit(state, rand, day, p, ctx, text); u.topics[p.id] = { ctx, day }; made++; }
    }
    // rivalries: a callout, and replies to recent callouts
    if (rand() < 0.35 && pool.length > 4) {
      const a = choose(); const b = pool[Math.floor(rand() * pool.length)];
      if (b.id !== a.id && b.teamId !== a.teamId) {
        const respect = rand() < 0.35;
        const text = compose(rand, personaOf(a.name), respect ? 'respect' : 'callout', { tag: '@' + engine.handleFor(b.name) });
        if (text && fresh(state, text)) {
          const post = emit(state, rand, day, a, respect ? 'respect' : 'callout', text, { targetId: b.id, tone: respect ? 'respect' : 'callout', mention: false });
          if (!respect) { u.rivals.push({ from: a.id, to: b.id, date: day, postId: post.id, answered: false }); yfx.onCallout(state, b); }
          made++;
        }
      }
    }
    for (const rv of u.rivals) {
      if (rv.answered || daysBetween(rv.date, day) < 1 || daysBetween(rv.date, day) > 4 || rand() > 0.5) continue;
      const from = engine.playerById(state, rv.from), to = engine.playerById(state, rv.to);
      if (!from || !to || to.retired || to.isUser || to.teamId < 0) { rv.answered = true; continue; }
      const text = compose(rand, personaOf(to.name), 'reply', { tag: '@' + engine.handleFor(from.name) });
      if (text && fresh(state, text)) { const rp = emit(state, rand, day, to, 'reply', text, { targetId: from.id, tone: 'callout', replyTo: rv.postId, mention: false }); rv.answered = true; rv.replyId = rp.id; made++; }
    }
    for (const rv of u.rivals) { // the first caller gets a last word, sometimes
      if (!rv.answered || !rv.replyId || rv.rebutted || daysBetween(rv.date, day) < 2 || rand() > 0.3) continue;
      rv.rebutted = true;
      const from = engine.playerById(state, rv.from), to = engine.playerById(state, rv.to);
      if (!from || !to || from.retired || from.isUser || from.teamId < 0) continue;
      const text = compose(rand, personaOf(from.name), 'rebut', { tag: '@' + engine.handleFor(to.name) });
      if (text && fresh(state, text)) { emit(state, rand, day, from, 'rebut', text, { targetId: to.id, tone: 'callout', replyTo: rv.replyId, mention: false }); made++; }
    }
    u.rivals = u.rivals.filter((r) => daysBetween(r.date, day) <= 6).slice(-16);
    try { made += voices.run(state, day, rand, pool); } catch (e) { log('ux-voices failed: ' + e.stack); }
    try { made += threads.run(state, day, rand); } catch (e) { log('ux-thread failed: ' + e.stack); }
    try { yfx.tick(state, day); } catch (e) { log('ux-fx failed: ' + e.stack); }
    return made;
  }

  // ----- inbound creator DM (uses the game's own thread, so Accept / counter / decline already work) -----
  function inbound(state, rand, day) {
    if (typeof engine.creatorList !== 'function' || typeof engine.dmList !== 'function') return;
    if (typeof engine.isPlayerCareer === 'function' && engine.isPlayerCareer(state)) return;
    const u = ux(state);
    if (u.lastDm && daysBetween(u.lastDm, day) < 9) return;
    const team = engine.teamById(state, state.userTeamId);
    if (!team) return;
    const reach = Math.max(500, (team.followers || 0));
    const signed = typeof engine.signedCreators === 'function' ? engine.signedCreators(state).map((c) => c.id) : [];
    const cands = engine.creatorList().filter((c) => signed.indexOf(c.id) < 0 && !engine.dmFor(state, c.id) && c.followers <= Math.max(120000, reach * 25));
    if (!cands.length || rand() > 0.55) return;
    const c = cands[Math.floor(rand() * cands.length)];
    const demand = engine.creatorDemand(state, c);
    const asks = [
      'hey! i have been following {club} for a while. {line} would love to join you guys if the numbers work. looking at {wage} a week.',
      'hi, {name} here. been making content about the scene for years, and {club} would be a perfect fit for a long-term collab. {wage} a week and we are good.',
      'yo, saw {club}\'s run. i would like to be your {role}. {wage} a week, deal?'
    ];
    const text = pick(rand, asks).replace('{club}', team.name).replace('{name}', c.name).replace('{line}', '').replace('{role}', c.kind === 'caster' ? 'official caster' : 'content creator').replace('{wage}', money(demand)).replace(/\s+/g, ' ').trim();
    engine.dmList(state).unshift({ cid: c.id, msgs: [{ mine: false, text, date: day }], stage: 'asking', demand, offer: 0, tries: 0, closed: false, replyOn: null, seen: false, inbound: true });
    u.lastDm = day;
    try {
      state.inbox.push({ id: state.nextId++, date: day, unread: true, resolved: false, type: 'news', data: { cid: c.id }, title: c.name + ' sent you a message on Y', body: c.name + ' (' + kfmt(c.followers) + ' followers) wants to work with ' + team.name + '. Open Y -> Messages to answer.' });
    } catch (e) { /* inbox optional */ }
  }

  // ----- creators + external pros as collaboration / sponsorship partners (extra brands in the game's media-brand list) -----
  function addCollabBrands(state) {
    if (!opts.brandsFile) return;
    let file; try { file = require(opts.brandsFile); } catch (e) { return; }
    const brands = file && file.brands; if (!Array.isArray(brands)) return;
    const have = new Set(brands.map((b) => b.id));
    const col = (id) => { const h = hash(id) % 360; return 'hsl(' + h + ',55%,38%)'; };
    const add = (id, name, tier, from, jobs) => { if (!have.has(id)) { brands.push({ id, name, colour: col(id), ink: '#ffffff', tier, motif: 'slab', from, jobs, ux: true }); have.add(id); } };
    const campaign = (n) => ({ kind: 'campaign', short: 'Weekend collab series with ' + n, mail: 'Hi boss,\n\n' + n + ' is planning a weekend series and {p} is exactly who we want on it. Filmed on Saturdays and Sundays, {weeks} weekends in all, so his weeks stay clear.\n\nThe fee reflects the weekends.\n\nBest,\n{from}' });
    const shoot = (n, what) => ({ kind: 'shoot', short: what + ' with ' + n, mail: 'Hi boss,\n\n' + n + ' would like {p} for ' + what.toLowerCase() + '. {days} days of filming; he will not be at your facility for them.\n\nWe pay on completion.\n\nBest,\n{from}' });
    try {
      for (const c of engine.creatorList()) {
        const tier = c.followers < 400000 ? 1 : c.followers < 1600000 ? 2 : 3;
        add('ux-k' + c.id, c.name, tier, c.name + ' (content team)', c.kind === 'caster' ? [shoot(c.name, 'A showmatch cast'), campaign(c.name)] : [shoot(c.name, 'A collab video'), campaign(c.name)]);
      }
      const mine = new Set((engine.teamById(state, state.userTeamId) || {}).playerIds || []);
      const pros = (state.players || []).filter((p) => !p.retired && p.teamId >= 0 && !mine.has(p.id) && !p.isUser).sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 14);
      for (const p of pros) add('ux-p' + p.id, p.name, (p.followers || 0) > 100000 ? 2 : 1, p.name, [shoot(p.name, 'A duo-queue stream'), campaign(p.name)]);
    } catch (e) { log('ux-social: brands failed ' + e.message); }
  }

  function tick(state, fromDate) {
    if (!state || !state.players || !state.currentDate) return;
    const u = ux(state);
    const to = state.currentDate;
    let from = fromDate || u.lastDay || addDays(to, -1);
    if (u.lastDay && u.lastDay > from) from = u.lastDay;
    if (from >= to) return;
    const span = Math.min(10, daysBetween(from, to));
    const rand = mk(hash(to + ':' + state.nextId + ':' + (state.userTeamId || 0)));
    for (let i = span - 1; i >= 0; i--) {
      const day = addDays(to, -i);
      tickDay(state, day, rand);
    }
    u.lastDay = to;
    const s = state.social;
    s.posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    if (s.posts.length > 220) { if (!Array.isArray(s.archive)) s.archive = []; s.archive.unshift(...s.posts.splice(220)); }
    if (s.archive && s.archive.length > 1500) { // keep saves small: our own old posts go first (the game's archive is untouched)
      let drop = s.archive.length - 1500;
      s.archive = s.archive.filter((p, i) => { if (drop > 0 && p.ux && i > 400) { drop--; return false; } return true; });
    }
    inbound(state, rand, to);
  }

  return { tick, addCollabBrands, compose, tickDay, ux, rpc: threads.rpc, PREFIX: threads.PREFIX, enrichPrompt: posting.enrich, afterPost: posting.afterPost, onOffers: yfx.onOffers };
}

function wrap(engine, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine || engine.__uxSocial || typeof engine.advance !== 'function') return engine;
  engine.__uxSocial = true;
  const soc = create(engine, opts);
  const safe = (what, fn) => { try { fn(); } catch (e) { log('ux-social: ' + what + ' failed: ' + e.stack); } };
  const adv = engine.advance;
  engine.advance = function advanceWithSocial(state, rand, mode) {
    const before = state && state.currentDate;
    if (state) safe('brands', () => soc.addCollabBrands(state));
    const r = adv.apply(this, arguments);
    if (state && state.currentDate !== before) safe('tick', () => soc.tick(state, before));
    if (state) safe('post options', () => soc.enrichPrompt(state));
    if (state && state.social) safe('media fees', () => soc.onOffers(state));
    return r;
  };
  // the game opens its post prompt inside these (after a series is played); swap in the richer options right away
  for (const name of ['simulateFixture', 'nextUserSeries', 'processDueFixtures', 'simulateGame', 'forfeitUserSeries', 'simulateNextGame']) {
    const orig = engine[name]; if (typeof orig !== 'function') continue;
    engine[name] = function () { const res = orig.apply(this, arguments); const st = arguments[0]; if (st && st.social) safe('post options', () => soc.enrichPrompt(st)); return res; };
  }
  const postAs = engine.postAsUser;
  if (typeof postAs === 'function') {
    engine.postAsUser = function (state, idx, rand) {
      const pr = state && state.social && state.social.prompt;
      const res = postAs.apply(this, arguments);
      if (pr && pr.mod) safe('post reactions', () => soc.afterPost(state, typeof rand === 'function' ? rand : Math.random, pr, idx, res));
      return res;
    };
  }
  const tweet = engine.postTweet; // the one social IPC the main process forwards in both careers carries the Y actions ('\u0001uxy:<json>')
  if (typeof tweet === 'function') {
    engine.postTweet = function postTweetOrThread(state, text) {
      if (typeof text === 'string' && text.indexOf(soc.PREFIX) === 0) { let r = null; safe('thread', () => { r = soc.rpc(state, text.slice(soc.PREFIX.length)); }); return r || { ok: false, error: 'That could not be done.' }; }
      return tweet.apply(this, arguments);
    };
  }
  const gen = engine.generateLeague;
  if (typeof gen === 'function') {
    engine.generateLeague = function generateLeagueWithSocial() {
      const state = gen.apply(this, arguments);
      safe('brands', () => soc.addCollabBrands(state));
      return state;
    };
  }
  log('ux-social installed');
  return engine;
}

module.exports = { wrap, create, spin, fill, compose, PERSONAS, personaOf };
