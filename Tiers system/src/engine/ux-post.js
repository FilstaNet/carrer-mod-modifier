// Y, Phase 3: the user's own posting (player career). The game offers 2-4 near-fixed lines after a series or a title.
// This replaces them with 6-9 situational options drawn from a large pool: result, stage, MVP / goals, upsets, streaks,
// bench, answering a callout, follower milestones, plus one line in the player's own persona. Lines the user has already
// posted are not offered again. After posting, fans and rivals answer. Additive: same prompt shape ({text, tone, reach, targetId}),
// so the game's own postAsUser keeps working unchanged. Everything stored is plain JSON under state.social.ux.
const { personaOf } = require('./ux-persona');

const pick = (r, a) => a[Math.floor(r() * a.length)];
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

// ---------- the lines: B[situation][tone] ----------
const B = {
  win: {
    humble: ['gg. proud of how we handled [opp] today', '{good|solid} win. {back to work|onto the next one}', '{thankful|grateful} for the support. [score] vs [opp]', 'we {earned|took} that one. {no days off|back to the lab}', '{team effort|everyone showed up} today. [score]'],
    cocky: ['[score] vs [opp]. {never in doubt|easy|not even close}', '{told you|said it before}. [opp] {had no answer|were never in it}', 'we are {levels above|a different class}. {write it down|remember it}', '{who is stopping us|name one team that can}? [opp] could not'],
    joke: ['[opp] tried. {bless them|cute}', 'me after the [score]: "{that was easy|i barely did anything}". also me: sweating', '{my mom|my dog} watched that series. {proud|unimpressed}', '[score]. {the boost pads|the ball} {were with us|owe us nothing}'],
    hype: ['{LETS GO|WE ARE SO BACK|SCENES}. [score] 🔥', '[opp] {down|done}. {next one next|who is next}?', '{this team is on another level|we are just getting started} 🚀', '{big energy|big win|big week}. [score] vs [opp]'],
    thanks: ['{thank you|thanks} to everyone who {watched|stayed up|tuned in}. [score] 💛', '{shoutout|big thanks} to {the fans|my team|the coaches}. {we got it done|that one is for you}', 'you {all|guys} are {the best|unreal}. [score]'],
    analyst: ['{rotations|boost control|kickoffs} {held up|decided it} vs [opp]. {details win series|the reps are paying off}', '{two things|three things} that worked against [opp]: {spacing|patience|kickoffs}', 'vod {tonight|tomorrow}. [score] but {there is plenty to clean up|the 50s still need work}'],
    respect: ['gg [opp]. {tough series|they pushed us}. {respect|well played}', '{good series|great matchup}, [opp]. {respect to every one of them|see you next time}'],
    cryptic: ['{one more|next}.', '{quiet|steady}. {the work continues|it is only the start}', '{as expected|noted}.']
  },
  loss: {
    humble: ['not good enough today. {we will fix it|back to work}', '[score] to [opp]. {that is on us|we learn from this}', '{tough one|rough one}. {thank you for the support|we go again}'],
    apology: ['{sorry|apologies} to everyone who {backed us|watched}. {we owe you better|that was not us}', '{that one is on me|i did not show up}. {sorry|my bad} to the team'],
    emotional: ['{this one hurts|gutted}. {i do not have the words|give me a day}', '{trying not to replay that [score]|i will be thinking about this for a while}'],
    cocky: ['lost [score], but {we are not done|do not count us out}', '[opp] got one. {enjoy it|it will not happen again}', '{still the better team|we were better than that score}. {watch|wait}', '{rematch|run it back}. i will not lose to [opp] twice'],
    joke: ['[score]. {the ball hated me|the boost was fake|lag}. {obviously|clearly}', '{me|my teammates} {blaming|looking for} {the server|the keyboard|the camera}. {nothing found|still nothing}', '{uninstalling|reinstalling} {rocket league|my mechanics}. {brb|again}'],
    analyst: ['{lost the kickoffs|rotations broke down|too many 50s lost} vs [opp]. {fixable|clear lessons}', '{vod|film} {tonight|first thing tomorrow}. {three clear errors|we know what went wrong}'],
    respect: ['gg [opp]. {earned it|better on the day}. {respect|well played}', '{credit|respect} to [opp]. {they wanted it more today|clean series}'],
    cryptic: ['{later|noted}.', '{this changes things|not like this}.', '{...|—}'],
    hype: ['{next week|next series} is {ours|different}. {watch|bet on it}', '{reset|rebuild}. {we go again|we come back stronger} 🔥']
  },
  bench: {
    humble: ['{proud of the boys|big win for the squad}. {ready when my name is called|waiting for my chance}', '{watching from the bench|from the sideline} and {loving it|taking notes}', '{proud of the boys|great series} against [opp]. {working for my spot|next goal: the starting lineup}', 'no minutes today but {i learned a lot|the reps in training are paying off}', 'every day in training is a step. [team] {looked sharp|got it done}'],
    thanks: ['thanks to the boys {for the win|for putting the work in}. {i learn from every series|it is fun to watch}', 'thank you to {the coaches|the staff} for {pushing me|believing in me}. [team] got the win', 'big thanks to {the boys|the squad} for {letting me learn|having my back}. [score]'],
    hype: ['{LETS GO BOYS|W FOR THE SQUAD} 🔥 {my time will come|i am next}', '[score] vs [opp]. {THE TEAM IS COOKING|WE ARE ROLLING} 🔥 {my turn soon|i am coming}', '{TRAINING IS GOING WELL|I FEEL READY} 🚀 {coach, call my name|put me in}'],
    joke: ['{the bench|my seat} {is very comfortable|has great wifi} {i guess|today}', '{coaching|vibe-checking} from the sideline. {10/10|would bench again}', 'my water bottle {was the real MVP|had a great series} {today|tonight}', 'the bench: {undefeated|3-0 this week|my best performance yet}', 'officially the {squad hype man|team mascot|water carrier}'],
    emotional: ['{not easy to watch|hard to sit this one out}. {but|and} {i am proud of them|i will earn it}', '{it is hard when you want to play|everything in me wants to be out there}. {but i keep working|i will keep going}', '{trying to stay patient|patience is hard}. {my chance will come|i can feel it}'],
    cryptic: ['{waiting|patience}.', '{my time|soon}.', '{lineups|rotations} never stay the same.', '{watch|wait for} what comes {next|after this}.'],
    analyst: ['from the bench: {great spacing|clean rotations} vs [opp]. {taking notes|learning}', '{three things|two things} i noticed from the sideline vs [opp]: {boost|spacing|kickoffs}']
  },
  benchLoss: {
    humble: ['{tough one to watch|rough day for the boys}. {we stick together|back to work}', 'rough one against [opp]. {i want to help more|working to earn my minutes}', '[score] to [opp]. {we go again|that stings}'],
    emotional: ['{hard to watch|painful to sit through}. {wish i could have helped|i want to be out there}', 'losing hurts even from the bench. {i am with the boys|we win and lose together}'],
    hype: ['{next series|next one} is {ours|different}. i am ready', '[opp] got one. {we answer next|payback is coming} 🔥'],
    joke: ['{the bench|my seat} did its best today', 'someone blame me. {i was not even playing|it was me} {again|lol}', 'coach, {the camera angle|the bench} was the problem'],
    thanks: ['thanks for sticking with us. {more to come|we go again}', 'thank you {to the fans|everyone} for the messages. {we will fix it|better days ahead}'],
    cryptic: ['{soon|my turn}.', '{this is not over|changes coming}.'],
    analyst: ['from the bench: {[opp] won the kickoffs|we lost the boost battle|rotations broke late}. {fixable|learning}']
  },
  title: {
    emotional: ['CHAMPIONS. {i have no words|i am speechless} 🏆', '{every early morning|every long night} was for this. [event] is ours'],
    thanks: ['thank you {to everyone|to the fans}. {this one is for you|we did it for you} 🏆', '{grateful|blessed} for {this team|every one of you}. [event] champions'],
    cocky: ['{we said we would|told you}. [event] is ours 🏆', '{nobody believed|everyone doubted} it. we are champions'],
    humble: ['{grateful|blessed} to win [event]. {the work continues|back to training}'],
    joke: ['champions. {i would like to thank my keyboard|my mom owes me a trophy shelf} 🏆'],
    hype: ['[event] CHAMPIONS 🏆🔥 {WHO IS NEXT|WE ARE NOT DONE}'],
    respect: ['{respect|gg} to every team at [event]. {you made us earn it|what a field}']
  },
  final: {
    emotional: ['{one game away|so close}. {i do not know what to say|this will sit with me}', '{gutted|heartbroken}. [event] was ours to win'],
    apology: ['{sorry|apologies} to everyone who backed us in the final. {we owe you|i owe you}', '{that final is on me|i let the team down}. {sorry|i will fix it}'],
    respect: ['congrats {to them|[opp]}. {deserved it|they were better today}', '{respect|gg} to the champions. it still hurts 💔'],
    cocky: ['we will be back for it. {that is a promise|write it down}', '{not the end|one final lost}. {watch us next time|we are coming}'],
    thanks: ['thank you for {backing us|the support} all week. {we will be back|it meant a lot}'],
    humble: ['{second place|a final}. {not enough|we learn from it}. {back to work|onwards}'],
    cryptic: ['{later|not over}.', '{remember this|this is not the end}.'],
    joke: ['{runner up|second}. {at least the trophy photo has good lighting|silver goes with my headset}']
  }
};
// extras that sit on top of a result: modifier -> tone -> lines
const X = {
  mvp: { cocky: ['{mvp|player of the series} vs [opp]. {just doing my job|no big deal}'], humble: ['mvp is {nice|a bonus}, but the {team|boys} won it'], hype: ['MVP VS [opp] 🔥 {LOCKED IN|I FEEL UNSTOPPABLE}'] },
  goals: { cocky: ['[goals] goals vs [opp]. {not bad|that is the job}'], hype: ['[goals] {GOALS|IN THE NET} 🔥 [opp] could not stop it'], joke: ['[goals] goals and my shot still {embarrasses|surprises} me'] },
  upsetW: { cocky: ['{they said we could not|nobody gave us a chance}. [score] over [opp]'], hype: ['[opp] were the favourites. [score] says otherwise 🔥'] },
  upsetL: { humble: ['{upset|stunned} by [opp]. {no excuses|we own it}'], emotional: ['{this one was ours|we let it slip}. [score] to [opp]'] },
  streakW: { cocky: ['[streak] in a row. {who is next|keep counting}'], hype: ['[streak] STRAIGHT 🔥 {NOBODY CAN STOP THIS|KEEP IT GOING}'] },
  streakL: { humble: ['[streak] straight losses. {this has to change|we are better than this}'], emotional: ['[streak] in a row. {it is getting heavy|i am not hiding from it}'] },
  bigL: { emotional: ['{we wanted this stage badly|[event] mattered to us}. {it hurts|gutted}'], humble: ['we wanted this one. [event] mattered. {back to work|we learn from it}'] },
  big: { emotional: ['{[event] means everything|these are the series you dream about}'], hype: ['{BIG STAGE|[event] STAGE} {ENERGY|VIBES} 🔥'] }
};
const CALLOUT = ['[target] {see you next series|you have been quiet|queue me|run it back}', '[target] {enjoy it while it lasts|lucky today|say it again}', '[target] {i was not even trying|that was your best?}'];
const RESPECT = ['gg [target]. {tough|clean|nasty} {series|mechanics|reads}', '[target] {was the best player on the server|is a problem}. respect', '{credit|props} to [target]. {see you soon|that was sharp}'];
const REPLY_CALL = ['[tag] {noted|say that to my face|see you on the server|keep the energy|receipts saved}', '[tag] {sure|ok}. {run it back whenever|scoreboard is public}', '[tag] {funny coming from you|careful what you wish for}'];
const MILESTONE = ['[followers] {of you now|followers}. {thank you|unreal}. {more to come|let us keep going}', 'just passed [followers]. {thank you all|this still feels weird}'];
// who answers what you posted
const REACT = {
  support: ['{proud of you|we got you|keep your head up|still our player}', '{this is why we love you|that is class|respect}'],
  hype: ['{LETS GOOO|THAT IS THE ENERGY|BIG ENERGY}', '{we are so back|say it louder}'],
  lol: ['{lmao|haha|dead}', '{this is why you are my favourite|not the ball hating you}'],
  mock: ['{ratio|the audacity|after that scoreline?}', '{sit down|be quiet and queue}'],
  curious: ['{what does this mean|hm|interesting}', '{big if true|we are watching}'],
  thanks: ['{thank YOU|you earned it|proud}', '{well deserved|keep going}']
};
const TONE_REACT = { humble: 'support', thanks: 'thanks', apology: 'support', emotional: 'support', analyst: 'curious', respect: 'support', joke: 'lol', cryptic: 'curious', hype: 'hype', cocky: 'hype', callout: 'hype' };
const TONE_OF_PERSONA = { hype: 'hype', humble: 'humble', trash: 'cocky', meme: 'joke', analyst: 'analyst', wholesome: 'thanks', salty: 'cocky', cryptic: 'cryptic', streamer: 'hype' };
const REACH = { humble: 1, thanks: 1, apology: 1, analyst: 1, cryptic: 1, emotional: 2, respect: 2, joke: 2, hype: 3, cocky: 3, callout: 4 };
const MILE = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

function create(engine, env) {
  const { spin, fill, compose, ux, kfmt, scoreText, homeWon, voices, fx } = env;
  const line = (r, bank, v, used) => { for (let i = 0; i < 8; i++) { const t = fill(spin(r, pick(r, bank)), v); if (t && used.indexOf(t) < 0) return t.replace(/\s+/g, ' ').trim(); } return null; };

  // what just happened, from the fixture or the event the prompt is about
  function situation(state, pr) {
    const me = engine.playerById(state, state.userPlayerId); if (!me) return null;
    const u = ux(state), team = engine.teamById(state, state.userTeamId);
    const v = { self: me.name, team: team && team.name };
    const s = { v, me, team, kind: 'win', mods: [], opp: null, f: null };
    if (pr.fixtureId != null) {
      const f = engine.fixtureById(state, pr.fixtureId); if (!f) return null;
      const home = f.homeId === state.userTeamId, opp = engine.teamById(state, home ? f.awayId : f.homeId);
      const won = home === homeWon(f);
      const lines = (f.games || []).reduce((a, g) => a.concat(g.homeLines || [], g.awayLines || []), []);
      const mine = lines.filter((l) => l && l.id === me.id);
      const played = mine.length > 0;
      v.opp = opp && opp.name; v.score = scoreText(f, home);
      const ev = (state.events || []).find((e) => e.id === f.eventId); v.event = ev ? ev.name : null;
      s.f = f; s.opp = opp; s.won = won; s.played = played;
      s.kind = !played ? (won ? 'bench' : 'benchLoss') : won ? 'win' : 'loss';
      if (played) { const g = mine.reduce((a, l) => a + (l.goals || 0), 0); if (f.mvpId === me.id) s.mods.push('mvp'); if (g >= 2) { v.goals = g; s.mods.push('goals'); } }
      const nw = (state.news || []).find((n) => n.fixtureId === f.id && n.data && (n.data.kind === 'upset'));
      if (nw && played) s.mods.push(won ? 'upsetW' : 'upsetL');
      if (['final', 'semi'].indexOf(f.stage) >= 0) s.mods.push(won ? 'big' : 'bigL');
      // the run the club is on
      const fx = (state.fixtures || []).filter((x) => x.played && (x.homeId === state.userTeamId || x.awayId === state.userTeamId) && x.date <= f.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      let n = 0; for (let i = fx.length - 1; i >= 0; i--) { const w = (fx[i].homeId === state.userTeamId) === homeWon(fx[i]); if (w !== won) break; n++; }
      if (n >= 3 && played) { v.streak = n; s.mods.push(won ? 'streakW' : 'streakL'); }
    } else if (pr.eventId != null) {
      const ev = (state.events || []).find((e) => e.id === pr.eventId); v.event = ev ? ev.name : 'the event';
      s.won = ev && ev.championId === state.userTeamId; s.kind = s.won ? 'title' : 'final';
    } else return null;
    return s;
  }

  function enrich(state) {
    const pr = state && state.social && state.social.prompt;
    if (!pr || pr.mod || !state.userPlayerId) return;
    const s = situation(state, pr); if (!s) return;
    const u = ux(state); if (!u.myLines) u.myLines = [];
    const day = state.currentDate;
    const rand = env.mk(env.hash(day + ':' + (pr.fixtureId != null ? pr.fixtureId : 'e' + pr.eventId) + ':' + state.userPlayerId + ':' + u.myLines.length));
    const bank = B[s.kind], v = s.v, posted = u.myLines.slice(-40), offered = (u.myOffered || (u.myOffered = [])).slice(-30), used = posted.concat(offered); // fresh lines first; small banks may reuse old ones rather than offer fewer options
    const tones = Object.keys(bank);
    // one safe tone, one bold tone, then the rest at random: never the same set twice in a row
    const safe = tones.filter((t) => ['humble', 'thanks', 'apology', 'respect', 'analyst'].indexOf(t) >= 0), bold = tones.filter((t) => ['cocky', 'hype', 'joke'].indexOf(t) >= 0);
    const order = [];
    if (safe.length) order.push(pick(rand, safe)); if (bold.length) order.push(pick(rand, bold));
    const rest = tones.filter((t) => order.indexOf(t) < 0).sort(() => rand() - 0.5);
    const lastTones = u.myTones || [];
    rest.sort((a, b) => (lastTones.indexOf(a) >= 0 ? 1 : 0) - (lastTones.indexOf(b) >= 0 ? 1 : 0)); // tones used last time go to the back
    const chosen = order.concat(rest).slice(0, 5);
    const options = [];
    const add = (tone, text, extra) => { if (text && !options.some((o) => o.text === text)) options.push(Object.assign({ text, tone, reach: REACH[tone] || 1 }, extra || {})); };
    for (const tone of chosen) {
      let b = bank[tone];
      for (const m of s.mods) if (X[m] && X[m][tone] && rand() < 0.7) { b = X[m][tone]; break; }
      const text = line(rand, b, v, used) || line(rand, b, v, posted) || line(rand, b, v, []) || (b !== bank[tone] && line(rand, bank[tone], v, [])); // a stage line needing a missing event name falls back to the plain one
      add(tone, text, s.mods.length && b !== bank[tone] ? { reach: (REACH[tone] || 1) + 1 } : null);
    }
    // a line in the player's own voice
    const persona = personaOf(s.me.name), pt = TONE_OF_PERSONA[persona.id];
    const pctx = { win: 'win', loss: 'loss', title: 'title', final: 'out' }[s.kind]; // bench has no fitting in-character line
    const pv = { team: v.team, opp: v.opp, score: v.score, followers: kfmt(s.me.followers || 0), goals: v.goals || 0, games: 0, assists: 0 };
    for (let i = 0; i < (pctx ? 4 : 0); i++) {
      const t = compose(rand, persona, pctx, pv);
      if (t && used.indexOf(t) < 0 && !options.some((o) => o.text === t)) {
        const dup = options.findIndex((o) => o.tone === pt && !o.targetId); if (dup >= 0) options.splice(dup, 1); // the persona line replaces the generic one of its tone
        options.push({ text: t, tone: pt, reach: REACH[pt] || 1, persona: persona.id }); break;
      }
    }
    // answer someone who called the player out, or take a shot / show respect at the opponent
    const call = (state.social.posts || []).find((p) => p.targetId === state.userPlayerId && p.tone === 'callout' && !p.mine && daysBetween(p.date, day) <= 5 && (u.myAnswered || []).indexOf(p.id) < 0);
    const callAuthor = call && engine.playerById(state, call.authorId);
    if (callAuthor) add('callout', line(rand, REPLY_CALL, { tag: '@' + engine.handleFor(callAuthor.name) }, used), { reach: 3, targetId: callAuthor.id, answers: call.id });
    const oppTeam = s.opp, lineup = oppTeam && s.f ? engine.lineupFor(state, oppTeam, s.f) : [];
    const tgt = lineup.length ? engine.playerById(state, pick(rand, lineup)) : null;
    if (tgt && s.played) {
      const tag = '@' + engine.handleFor(tgt.name);
      if (!callAuthor && rand() < 0.6) add('callout', line(rand, CALLOUT, { target: tag }, used), { reach: 4, targetId: tgt.id });
      if (rand() < 0.6) add('respect', line(rand, RESPECT, { target: tag }, used), { reach: 2, targetId: tgt.id });
    }
    // follower milestones
    const reached = MILE.filter((m) => (s.me.followers || 0) >= m && m > (u.myMile || 0)).pop();
    if (reached) { add('thanks', line(rand, MILESTONE, { followers: kfmt(reached) }, used), { reach: 2, milestone: reached }); u.myMile = reached; } // offered once, then it is old news
    if (options.length < 2) return; // keep the game's own options if nothing generated
    pr.options = options.slice(0, 9);
    options.forEach((o) => offered.push(o.text)); if (offered.length > 70) offered.splice(0, offered.length - 70);
    pr.mod = { kind: s.kind, mods: s.mods, opp: v.opp || null, won: !!s.won };
  }

  // after the user posts: fans, rivals and the odd outlet answer
  function afterPost(state, rand, pr, idx, res) {
    if (!res || !res.ok || !res.post || !pr || !pr.mod) return;
    const opt = pr.options[idx], u = ux(state), day = state.currentDate;
    if (!opt) return;
    u.myLines.push(opt.text); if (u.myLines.length > 160) u.myLines.splice(0, u.myLines.length - 160);
    u.myTones = (u.myTones || []).concat(opt.tone).slice(-8);
    if (fx) fx.onUserPost(state, opt, pr.mod, res);
    if (opt.answers) (u.myAnswered || (u.myAnswered = [])).push(opt.answers);
    const team = engine.teamById(state, state.userTeamId), opp = pr.mod.opp ? (state.teams || []).find((t) => t.name === pr.mod.opp) : null;
    const kinds = ['ultra', 'nerd', 'joker', 'doomer'];
    const say = (bank, v) => voices.say(rand, bank, v || {});
    let n = 0;
    const emit = (acc, text) => { if (text && n < 3) { n++; voices.post(state, rand, day, acc, text, { replyTo: res.post.id, tags: ['#' + (team && team.abbrev || 'Y')], newsId: null }); } };
    const cls = TONE_REACT[opt.tone] || 'support';
    if (team && rand() < 0.85) emit(voices.fan(team, pick(rand, kinds)), say(REACT[cls]));
    if (team && rand() < 0.45) emit(voices.fan(team, pick(rand, kinds)), say(REACT[cls === 'hype' ? 'lol' : 'support']));
    if ((opt.tone === 'cocky' || opt.tone === 'callout') && !pr.mod.won && opp) emit(voices.fan(opp, 'troll'), say(REACT.mock)); // cocky after a loss draws fire
    else if (opt.tone === 'hype' && opp && rand() < 0.3) emit(voices.fan(opp, 'troll'), say(REACT.mock));
  }

  return { enrich, afterPost };
}

module.exports = { create, B, REACH };
