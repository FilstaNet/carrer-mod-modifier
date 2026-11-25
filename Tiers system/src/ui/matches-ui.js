// Renderer fixes/redesign (injected after tier-ui.js):
//  1. News hero pager arrows: the story card (.hero-card, z-index 1) lay on top of the pager, so the arrows (and the dots) only
//     worked where the card did not cover them. The body layer now sits above the art layer.
//  2. Matches window (Season -> Matches, also used by the Season window tabs): Next match, Recent results, Stats and Honours
//     are rebuilt with clean cards using the game's own colour variables and components; Season history gets spacing polish.
(function () {
  'use strict';
  if (window.__matchesUI) return;
  if (typeof recentResultsRowsHtml !== 'function' || typeof statsViewHtml !== 'function' || typeof honoursViewHtml !== 'function' || typeof nextMatchBodyHtml !== 'function') return;
  window.__matchesUI = true;

  const st = document.createElement('style');
  st.textContent =
    // 1. arrows
    '.hero-body{z-index:3}.hero-foot{z-index:3}.hero-dots .pager{position:relative;z-index:4}.hero-dots .pg-arrow{width:30px;height:30px;cursor:pointer}' +
    // shared
    '.mx-page{max-width:1120px;margin:0 auto;padding:6px 4px 28px;display:flex;flex-direction:column;gap:16px}' +
    '.mx-card{background:var(--card,var(--panel-2));border-radius:var(--r-sm);padding:18px 20px}' +
    '.mx-h{font-size:var(--f-label);font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--red);margin-bottom:12px}' +
    '.mx-dim{color:var(--text-dim)}.mx-empty{padding:36px 12px;text-align:center;color:var(--text-dim)}' +
    // next match
    '.mx-next .nm-big{padding:6px 0 0}.mx-next .nm-teams{max-width:100%;overflow:hidden}.mx-next .nm-big .crest{width:clamp(140px,19vw,300px);height:clamp(140px,19vw,300px);max-width:300px;aspect-ratio:1;flex:none}.mx-next .nm-big .crest img{width:100%;height:100%;object-fit:contain}' +
    '.mx-hon.mine{background:color-mix(in srgb,var(--green) 16%,transparent);border-radius:8px}' +
    '.mx-strip{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:6px}' +
    '.mx-pill{background:var(--panel-2);border-radius:999px;padding:6px 16px;font-size:var(--f-small);font-weight:700;letter-spacing:.06em;text-transform:uppercase}' +
    '.mx-pill.hot{background:var(--accent);color:var(--accent-ink,#fff)}' +
    // results
    '.mx-sum{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.mx-rec{font-size:var(--f-screen);font-weight:800;line-height:1}' +
    '.mx-form{display:flex;gap:6px}.mx-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:var(--f-small);font-weight:800;color:#fff}.mx-dot.w{background:var(--green)}.mx-dot.l{background:var(--red)}' +
    '.mx-res{display:grid;grid-template-columns:34px 92px minmax(0,1fr) auto 120px;align-items:center;gap:14px;padding:11px 8px;border-bottom:1px solid var(--rule)}.mx-res:last-child{border-bottom:0}' +
    '.mx-badge{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-weight:800;color:#fff}.mx-res.w .mx-badge{background:var(--green)}.mx-res.l .mx-badge{background:var(--red)}' +
    '.mx-date{color:var(--text-dim);font-size:var(--f-small);white-space:nowrap}.mx-opp{display:flex;align-items:center;gap:12px;min-width:0;font-weight:700}.mx-opp .crest{flex:none;width:34px;height:34px}.mx-opp .crest img{width:100%;height:100%;object-fit:contain}' +
    '.mx-opp span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-score{font-size:var(--f-lg);font-weight:800;text-align:right;white-space:nowrap}.mx-score small{display:block;font-size:var(--f-small);font-weight:600;color:var(--text-dim)}' +
    '.mx-tag{justify-self:end;font-size:var(--f-micro);font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim)}.mx-tag b{color:var(--text);margin-left:6px}' +
    // stats
    '.mx-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}@media(max-width:1000px){.mx-cols{grid-template-columns:1fr}}' +
    '.mx-lead{display:grid;grid-template-columns:26px 34px minmax(0,1fr) auto;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid var(--rule);cursor:pointer;border-radius:6px}.mx-lead:last-child{border-bottom:0}.mx-lead:hover{background:var(--panel-2)}' +
    '.mx-lead.me .mx-nm{color:var(--teal)}.mx-rank{color:var(--text-dim);font-weight:800;text-align:center}.mx-lead:nth-child(2) .mx-rank{color:#e6a817}' +
    '.mx-nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-nm small{display:block;font-size:var(--f-micro);color:var(--text-dim);font-weight:600;letter-spacing:.08em;text-transform:uppercase}.mx-val{font-size:var(--f-lg);font-weight:800}' +
    // honours
    '.mx-who{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}.mx-who b{font-size:var(--f-screen)}' +
    '.mx-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mx-chip{background:var(--panel-2);border-radius:var(--r-sm);padding:14px 8px;text-align:center}.mx-chip .v{font-size:var(--f-screen);font-weight:800;line-height:1}.mx-chip .k{margin-top:6px;font-size:var(--f-micro);color:var(--text-dim);text-transform:uppercase;letter-spacing:.16em}' +
    '.mx-hon{display:flex;gap:12px;align-items:center;padding:11px 6px;border-bottom:1px solid var(--rule)}.mx-hon:last-child{border-bottom:0}' +
    // season history polish
    '.history-page{max-width:1280px;margin:0 auto;width:100%;padding:0 4px}.history-header{padding-bottom:10px;border-bottom:1px solid var(--rule)}.history-body{padding:4px 0 24px}';
  document.head.appendChild(st);

  const num = (x) => (x == null ? 0 : x);
  const pageOf = (inner) => '<div class="mx-page">' + inner + '</div>';
  const daysTo = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

  // ---- Next match ----
  const origNext = nextMatchBodyHtml;
  nextMatchBodyHtml = function (big) {
    const html = origNext.apply(this, arguments);
    if (!big) return html;
    const f = nextFixture();
    let strip = '';
    if (f) {
      const d = daysTo(C().currentDate, f.date);
      const when = d <= 0 ? tl('Today') : d === 1 ? tl('Tomorrow') : tl('In {n} days', { n: d });
      strip = '<div class="mx-strip"><span class="mx-pill' + (d <= 0 ? ' hot' : '') + '">' + esc(when) + '</span></div>';
    }
    return '<div class="mx-page mx-next"><div class="mx-card">' + html + strip + '</div></div>';
  };

  // ---- Recent results ----
  recentResultsRowsHtml = function () {
    const c = C();
    const mine = (c.fixtures || []).filter((f) => f.played && (f.homeId === sideOf(f) || f.awayId === sideOf(f))).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!mine.length) return pageOf('<div class="mx-card mx-empty">' + tl('No results yet') + '</div>');
    const wins = mine.filter(iWonFixture).length;
    const form = mine.slice(0, 5).map((f) => iWonFixture(f) ? '<span class="mx-dot w">W</span>' : '<span class="mx-dot l">L</span>').join('');
    const sum = '<div class="mx-card"><div class="mx-sum"><div><div class="mx-h" style="margin:0 0 6px">' + tl('Season record') + '</div><div class="mx-rec">' + wins + ' &ndash; ' + (mine.length - wins) + '</div></div>' +
      '<div><div class="mx-h" style="margin:0 0 6px">' + tl('Last 5') + '</div><div class="mx-form">' + form + '</div></div></div></div>';
    const rows = mine.slice(0, 12).map((f) => {
      const home = f.homeId === sideOf(f);
      const opp = teamById(home ? f.awayId : f.homeId);
      const w = iWonFixture(f);
      const g = (home ? f.homeGoals : f.awayGoals) + '&ndash;' + (home ? f.awayGoals : f.homeGoals);
      const sw = f.homeWins || f.awayWins;
      const big = sw ? (home ? f.homeWins : f.awayWins) + '&ndash;' + (home ? f.awayWins : f.homeWins) : g;
      const how = f.spectating ? tl('watched') : f.userPlayed ? tl('played') : tl('sim');
      return '<div class="mx-res ' + (w ? 'w' : 'l') + '"><span class="mx-badge">' + (w ? 'W' : 'L') + '</span><span class="mx-date">' + fmtDateShort(f.date) + '</span>' +
        '<div class="mx-opp">' + (opp ? crest(opp, 'small') : '') + '<span>' + esc(opp ? opp.name : '?') + '</span></div>' +
        '<div class="mx-score">' + big + (sw ? '<small>' + tl('({score} goals)', { score: g }) + '</small>' : '') + '</div>' +
        '<div class="mx-tag">' + (f.overtime ? tl('OT') + ' &middot; ' : '') + esc(how) + '</div></div>';
    }).join('');
    return pageOf(sum + '<div class="mx-card"><div class="mx-h">' + tl('Recent results') + '</div>' + rows + '</div>');
  };

  // ---- Stats ----
  statsViewHtml = function () {
    const sets = [[tl('Top scorers'), (p) => num(p.season.goals)], [tl('Most assists'), (p) => num(p.season.assists)], [tl('Most MVPs'), (p) => num(p.season.mvps)]];
    const cols = sets.map(([title, val]) => {
      const top = alivePlayers().slice().sort((a, b) => val(b) - val(a)).slice(0, 8).filter((p) => val(p) > 0);
      const rows = top.map((p, i) => {
        const t = teamById(p.teamId);
        return '<div class="mx-lead' + (p.isUser ? ' me' : '') + '" data-action="player-detail" data-pid="' + p.id + '"><span class="mx-rank">' + (i + 1) + '</span>' + faceHtml(p.name, p.id, 'tiny') +
          '<div class="mx-nm">' + esc(p.name) + '<small>' + esc(t ? t.name : '') + '</small></div><span class="mx-val">' + val(p) + '</span></div>';
      }).join('') || '<div class="mx-empty">' + tl('No stats yet') + '</div>';
      return '<div class="mx-card"><div class="mx-h">' + title + '</div>' + rows + '</div>';
    }).join('');
    return pageOf('<div class="mx-cols">' + cols + '</div>');
  };

  // ---- Honours ----
  honoursViewHtml = function () {
    const c = C();
    const p = playerById(c.userPlayerId);
    const myName = ((typeof teamById === 'function' && teamById(c.userTeamId)) || {}).name;
    const honours = (c.honours || []).slice().reverse().map((h) => '<div class="mx-hon' + (myName && h.indexOf(myName) >= 0 ? ' mine' : '') + '"><span>&#127942;</span><span>' + esc(h) + '</span></div>').join('') || '<div class="mx-empty">' + tl('No completed seasons yet.') + '</div>';
    let career = '';
    if (p) {
      const tot = (k) => num(p.career && p.career[k]) + num(p.season && p.season[k]);
      career = '<div class="mx-card"><div class="mx-who"><b>' + esc(p.name) + '</b><span class="mx-dim">' + tl('age {n}', { n: p.age }) + '</span></div>' +
        '<div class="mx-chips">' + [['games', 'Games'], ['goals', 'Goals'], ['assists', 'Assists'], ['mvps', 'MVPs']].map(([k, l]) => '<div class="mx-chip"><div class="v">' + tot(k) + '</div><div class="k">' + tl(l) + '</div></div>').join('') + '</div>' +
        '<div style="margin-top:14px"><button class="btn ghost sm" data-action="player-detail" data-pid="' + p.id + '">' + tl('Full profile') + '</button></div></div>';
    }
    return pageOf('<div class="mx-h" style="margin:0">' + tl('Your career') + '</div>' + career + '<div class="mx-card"><div class="mx-h">' + tl('Honours') + '</div>' + honours + '</div>');
  };

  try { render(); } catch (e) { /* no career open yet */ }
})();
