'use strict';
// beta.33 club headquarters (Office -> Facilities): prices are fixed for Tier A budgets (10k..5M). A Tier B club has a tenth of that money,
// so its prices are scaled down. The game prices everything inside league.js, so the purchase is done by the game at its own price with the
// budget topped up by the difference, and the saved "paid" value and the ledger line are then put right.
const TIER_B_PRICE = 0.15;

function install(engine, opts = {}) {
  const log = opts.log || (() => {});
  if (!engine.FACILITIES) return; // older game
  const k = (s) => { const t = s && s.userTeamId != null ? engine.teamById(s, s.userTeamId) : null; return t && t.tier === 'B' ? TIER_B_PRICE : 1; };
  const scaled = (s, tier) => { const f = engine.FACILITIES[tier - 1]; return f ? Math.round(f.price * k(s) * (s.economy === 'real' ? 1 : 35)) : 0; };
  const ownCost = (s, tier) => Math.max(0, scaled(s, tier) - ((s.facility && s.facility.paid) || 0));

  const board = engine.facilityBoard;
  if (typeof board === 'function') {
    engine.facilityBoard = function facilityBoardWithTierB(s) {
      const d = board.apply(this, arguments);
      if (!d || k(s) === 1) return d;
      for (const it of d.list) { it.price = scaled(s, it.tier); it.cost = it.owned || it.below ? it.cost : ownCost(s, it.tier); it.affordable = !!it.cost && !it.owned && !it.below && d.budget >= it.cost; }
      return d;
    };
  }
  const buy = engine.buyFacility;
  if (typeof buy === 'function') {
    engine.buyFacility = function buyFacilityWithTierB(s, tier) {
      if (!s || k(s) === 1) return buy.apply(this, arguments);
      const team = engine.teamById(s, s.userTeamId), mine = ownCost(s, tier | 0), game = engine.facilityUpgradeCost(s, tier | 0);
      if (!team || game == null || (team.budget || 0) < mine) return buy.apply(this, arguments); // refused by the game with its own message
      const diff = game - mine;
      team.budget += diff;
      let r;
      try { r = buy.apply(this, arguments); } finally { if (!r || !r.ok) team.budget -= diff; }
      if (r && r.ok) {
        r.cost = mine; s.facility.paid = scaled(s, tier | 0);
        const l = (s.ledger || [])[(s.ledger || []).length - 1]; if (l && l.kind === 'facility') l.amount = -mine;
      }
      return r;
    };
  }
  log('facilities: Tier B prices scaled');
}
module.exports = { install, TIER_B_PRICE };
