'use strict';
// beta.33's reworked sim (engine/sim-model.js): a game is a Poisson match between two sides of bot "cars" built from the players' ratings.
// Our own models (betting odds, scrims, club duels) use this to give the same win chances as the game's matches. Returns null on an older game,
// so the callers keep their old formulas.
function modelOf() {
  const k = Object.keys(require.cache).find((x) => /engine[\\/]sim-model\.js$/.test(x));
  return k ? require.cache[k].exports : null;
}

// expected goals {home, away, share} of side A (home) vs side B for one game, or null; `extra(player)` adds rating points (e.g. 2v2 mechanics)
function ratesFor(engine, state, idsA, idsB, extra) {
  const sm = modelOf();
  if (!sm || typeof engine.botRating !== 'function') return null;
  try {
    const diff = engine.difficultyOf(state), sys = engine.botSystemOf(state).id;
    const cars = (ids) => ids.map((id) => { const p = engine.playerById(state, id); return sm.carFor(p, engine.botRating(engine.matchRating(p) + (extra ? extra(p) : 0), diff), sys, !!p && p.bot === 'ripple'); });
    return sm.rates(cars(idsA), cars(idsB));
  } catch (e) { return null; }
}
// chance that side A (player ids) wins one game against side B, or null
function gameWin(engine, state, idsA, idsB, extra) {
  const r = ratesFor(engine, state, idsA, idsB, extra);
  return r ? modelOf().winChance(r) : null;
}
// best-of-N series chance from a game chance (needs the game's own sim-model)
function seriesWin(pGame, bestOf) {
  const sm = modelOf();
  return sm && pGame != null ? sm.seriesChance(pGame, bestOf) : null;
}
module.exports = { ratesFor, gameWin, seriesWin };
