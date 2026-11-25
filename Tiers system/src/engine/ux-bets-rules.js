// Which picks on the same match can be combined. Shared (Node engine + renderer).
// A pair is refused only when the picks contradict each other (e.g. a side on zero goals + a player of that side to score)
// or are the same question asked twice (market-level pairs below). Different questions that merely correlate are allowed.
const PAIRS = [['winner', 'score'], ['winner', 'sweep'], ['score', 'sweep'], ['score', 'games'], ['score', 'both'], ['sweep', 'both'],
  ['tot', 'alt'], ['tot', 'exact'], ['tot', 'range'], ['alt', 'exact'], ['alt', 'range'], ['exact', 'range'], ['first', 'pfirst'], ['pfirst', 'pany']];
const CONFLICTS = {};
for (const [x, y] of PAIRS) { (CONFLICTS[x] = CONFLICTS[x] || []).push(y); (CONFLICTS[y] = CONFLICTS[y] || []).push(x); }

// leg = { market, pick, side }  side: 'h' | 'a' | null (the team a player / team pick belongs to)
function bounds(leg) {
  const b = { Tl: 0, Tu: Infinity, Hl: 0, Hu: Infinity, Al: 0, Au: Infinity };
  const [k, arg] = String(leg.pick).split(':'); const L = Number(arg);
  const over = k === 'o', under = k === 'u';
  switch (leg.market) {
    case 'tot': case 'alt': if (over) b.Tl = Math.floor(L) + 1; if (under) b.Tu = Math.ceil(L) - 1; break;
    case 'exact': b.Tl = b.Tu = L; break;
    case 'range': { const [lo, hi] = String(arg).split('-').map(Number); b.Tl = lo; b.Tu = hi; break; }
    case 'hteam': if (over) b.Hl = Math.floor(L) + 1; if (under) b.Hu = Math.ceil(L) - 1; break;
    case 'ateam': if (over) b.Al = Math.floor(L) + 1; if (under) b.Au = Math.ceil(L) - 1; break;
    case 'first': if (leg.pick === 'h') b.Hl = 1; if (leg.pick === 'a') b.Al = 1; break;
    case 'pfirst': case 'pany': if (leg.side === 'h') b.Hl = 1; if (leg.side === 'a') b.Al = 1; break;
    default: break;
  }
  return b;
}

function feasible(legs) {
  const m = { Tl: 0, Tu: Infinity, Hl: 0, Hu: Infinity, Al: 0, Au: Infinity };
  for (const l of legs) { const b = bounds(l); for (const k of ['Tl', 'Hl', 'Al']) m[k] = Math.max(m[k], b[k]); for (const k of ['Tu', 'Hu', 'Au']) m[k] = Math.min(m[k], b[k]); }
  return m.Tl <= m.Tu && m.Hl <= m.Hu && m.Al <= m.Au && m.Hl + m.Al <= m.Tu && m.Hu + m.Au >= m.Tl;
}

// can leg `b` be added next to leg `a`?
const clash = (a, b) => (CONFLICTS[a.market] || []).indexOf(b.market) >= 0 || !feasible([a, b]);

module.exports = { clash, feasible, bounds, CONFLICTS };
