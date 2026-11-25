'use strict';
// The game's "series length" setting only rewrites the game's own events. The mod keeps copies of the best-of values
// (Tier B cups, Swiss stages), so after the game saves the setting we re-apply it to everything not yet played.
const played = (f) => f && (f.played || (f.games || []).length || f.homeWins || f.awayWins);

// one cup-shaped event (Tier B cup, Kick-Off Weekend, EWC): its best-of values and every slot that is not decided or under way
function syncCup(state, ev, c, kind, fx) {
  const of = (stage) => ev.bestOfFor(kind, stage, state.seriesLength);
  const bo = (stage) => (stage === 'group' ? of('group') : stage === 'final' ? of('final') : of('playoff'));
  c.groupBestOf = of('group'); c.playoffBestOf = of('playoff'); c.finalBestOf = of('final');
  for (const s of c.slots || []) {
    const f = fx.get(s.fixtureId);
    if (s.winner != null || s.score != null || s.winsW != null || played(f)) continue; // decided or under way: keep
    s.bestOf = bo(s.stage);
    if (f) f.bestOf = s.bestOf;
  }
}

function sync(state, ev) {
  const open = (stage) => ev.bestOfFor('open', stage, state.seriesLength);
  const fx = new Map((state.fixtures || []).map((f) => [f.id, f]));
  const tb = state.tierB;
  for (const c of (tb && tb.cups) || []) if (c.stage !== 'done') syncCup(state, ev, c, 'open', fx);
  // Kick-Off Weekend plays like a Major, the Esports World Cup like Worlds (the kinds their prizes use)
  for (const e of (state.uxMajors && state.uxMajors.events) || []) if (e.uxEv && !e.swiss && e.stage !== 'done' && e.stage !== 'pending') syncCup(state, ev, e, e.kind === 'ewc' ? 'worlds' : 'major', fx);
  for (const e of (state.uxMajors && state.uxMajors.events) || []) {
    if (e.kind !== 'swiss' || e.stage === 'done') continue;
    e.bestOf = open('group');
    for (const f of state.fixtures || []) if (f.xevId === e.id && !played(f)) f.bestOf = e.bestOf;
  }
}

function install(engine, ev, { log = () => {} } = {}) {
  const edit = engine.editCareerSettings;
  if (typeof edit !== 'function' || typeof ev.bestOfFor !== 'function') return;
  engine.editCareerSettings = function editCareerSettingsWithTierB(state, patch) {
    const r = edit.apply(this, arguments);
    try { if (r && r.ok && state) sync(state, ev); } catch (e) { log('btier: series length sync failed: ' + e.stack); }
    return r;
  };
}

module.exports = { sync, install };
