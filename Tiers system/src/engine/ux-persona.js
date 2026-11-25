// Player personalities for the Y feed. Pure and deterministic (same name -> same persona), shared by the engine hook
// (what a player posts) and the renderer (profile chip, Explore search). Loaded as a CommonJS module in Node and as text in the page.
const PERSONAS = [
  { id: 'hype', label: 'Hype Machine', blurb: 'Loud, emoji-heavy, treats every series like a final.', freq: 1.3, words: 'hype loud energy caps' },
  { id: 'humble', label: 'Humble Grinder', blurb: 'Quiet, thankful, always "working on it".', freq: 0.8, words: 'humble grinder quiet thankful' },
  { id: 'trash', label: 'Trash Talker', blurb: 'Calls people out and enjoys the replies.', freq: 1.2, words: 'trash talker cocky callout rival' },
  { id: 'meme', label: 'Meme Lord', blurb: 'Posts jokes first and game results second.', freq: 1.4, words: 'meme lord jokes funny shitpost' },
  { id: 'analyst', label: 'Analyst', blurb: 'Breaks down rotations, boost pads and VODs.', freq: 0.9, words: 'analyst vod stats rotations nerd' },
  { id: 'wholesome', label: 'Wholesome', blurb: 'Compliments rivals and thanks the fans.', freq: 1.0, words: 'wholesome kind respect fans friendly' },
  { id: 'salty', label: 'Salty', blurb: 'Blames lag, servers, bounces and the calendar.', freq: 1.1, words: 'salty tilt complainer lag' },
  { id: 'cryptic', label: 'Cryptic', blurb: 'Vague hints and one-word posts. Probably nothing.', freq: 0.6, words: 'cryptic mystery vague teaser' },
  { id: 'streamer', label: 'Streamer', blurb: 'Always live, always asking you to follow.', freq: 1.2, words: 'streamer live twitch content creator' }
];

function hash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function personaOf(name) {
  return PERSONAS[hash('persona:' + name) % PERSONAS.length];
}

// "meme", "trash talker", "streamer" ... -> true when the text matches a persona
function matchesPersona(p, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  return (p.label + ' ' + p.words).toLowerCase().indexOf(q) !== -1;
}

module.exports = { PERSONAS, personaOf, matchesPersona, hash };
