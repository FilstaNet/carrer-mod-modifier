// Y (socials) round, renderer side (injected after ux-office-ui.js; wraps the game's own globals):
//  - every player has a personality (window.__uxPersona, same module the engine uses): badge on posts, chip + blurb on the profile
//  - Explore: search also matches personalities ("meme", "trash talker", "streamer" ...), personality chips to browse by, personality shown on each account row
(function () {
  'use strict';
  if (window.__uxSocialUI) return;
  const P = window.__uxPersona;
  if (!P || typeof xSearchResults !== 'function' || typeof xExploreHtml !== 'function' || typeof xProfileHtml !== 'function' || typeof xSideHtml !== 'function' || typeof xAccountRowHtml !== 'function' || typeof postHtml !== 'function') return;
  window.__uxSocialUI = true;

  const st = document.createElement('style');
  st.textContent =
    '.ux-pbadge{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:var(--f-micro);font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text-dim);vertical-align:middle;white-space:nowrap}' +
    '.ux-pchips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-bottom:1px solid var(--rule)}.ux-pchip{border:1px solid var(--rule);background:transparent;color:var(--text);font:inherit;font-size:var(--f-small);font-weight:700;padding:5px 12px;border-radius:999px;cursor:pointer}' +
    '.ux-pchip:hover,.ux-pchip.on{background:var(--red);border-color:var(--red);color:#fff}.ux-pchips-k{width:100%;font-size:var(--f-micro);font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim)}' +
    '.ux-role-media,.ux-role-journalist{background:var(--red);color:#fff}.ux-role-leaker{background:#7a5c00;color:#fff}.ux-rum{display:inline-block;margin-left:6px;font-size:var(--f-micro);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim)}.ux-rum.confirmed{color:#2a9d55}.ux-rum.wrong,.ux-rum.denied{color:#c0392b}' +
    '.ux-trend{padding:12px 16px;border-bottom:1px solid var(--rule)}.ux-trend-k{font-size:var(--f-micro);font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px}.ux-trend-r{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:var(--f-small)}.ux-trend-r b{font-weight:800}.ux-trend-r span{color:var(--text-dim)}.ux-trend-r button{border:0;background:none;color:inherit;font:inherit;font-weight:800;padding:0;cursor:pointer;text-align:left}.ux-trend-r button:hover{color:var(--red)}' +
    '.ux-pprof{margin:6px 0 4px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}.ux-pprof .ux-pbadge{margin:0;background:var(--red);color:#fff}.ux-pprof span.b{font-size:var(--f-small);color:var(--text-dim)}';
  document.head.appendChild(st);

  // the richer post options use more tones than the game's five: give them names and colours
  try { Object.assign(POST_TONE, { hype: 'Hype', joke: 'Joke', thanks: 'Thanks', analyst: 'Analysis', emotional: 'Emotional', apology: 'Apology' }); } catch (e) { /* label falls back to the tone name */ }
  const tcss = document.createElement('style');
  tcss.textContent = '.x-option-tone.hype{background:color-mix(in srgb,var(--accent) 25%,transparent);color:var(--teal)}.x-option-tone.joke{background:rgba(240,180,50,.18);color:#b9831a}.x-option-tone.emotional,.x-option-tone.apology{background:rgba(150,120,220,.18);color:#7a62c9}.x-option-tone.thanks,.x-option-tone.analyst{background:rgba(90,208,122,.16);color:var(--green)}';
  document.head.appendChild(tcss);
  const mcss = document.createElement('style');
  mcss.textContent = '.ux-mood{margin:12px 0;padding:12px 14px;border:1px solid var(--rule);border-radius:12px}.ux-mood-k{display:flex;justify-content:space-between;font-size:var(--f-micro);font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim)}.ux-mood-k span{color:var(--text)}' +
    '.ux-mood-bar{position:relative;height:6px;margin:10px 0;border-radius:3px;background:color-mix(in srgb,var(--text) 10%,transparent)}.ux-mood-bar:after{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--text-dim)}.ux-mood-bar i{position:absolute;top:0;bottom:0;border-radius:3px}.ux-mood-bar i.up{background:#2a9d55}.ux-mood-bar i.down{background:#c0392b}' +
    '.ux-mood-r{display:flex;justify-content:space-between;font-size:var(--f-small);padding:2px 0}.ux-mood-r b.up{color:#2a9d55}.ux-mood-r b.down{color:#c0392b}.ux-mood-h{margin-top:6px;font-size:var(--f-micro);color:var(--text-dim)}';
  document.head.appendChild(mcss);

  const persona = (name) => P.personaOf(name);

  // ---- posts: personality badge after the handle ----
  const origPost = postHtml;
  postHtml = function (p) { // eslint-disable-line no-global-assign
    const html = origPost.apply(this, arguments);
    if (p && p.ux && p.role && p.role !== 'caster' || (p && p.role === 'caster')) { // fans, outlets, reporters, leakers, casters
      const label = { media: 'News', journalist: 'Reporter', leaker: 'Insider', fan: 'Fan', caster: 'Caster' }[p.role];
      const rum = p.rumour ? '<span class="ux-rum ' + esc(p.rumour) + '">' + esc(tl({ unconfirmed: 'Unconfirmed', confirmed: 'Confirmed', wrong: 'Wrong', denied: 'Denied' }[p.rumour] || p.rumour)) + '</span>' : '';
      return label ? html.replace(/(<span class="x-handle">@[^<]*<\/span>)/, (m) => m + '<span class="ux-pbadge ux-role-' + esc(p.role) + '">' + esc(tl(label)) + '</span>' + rum) : html;
    }
    if (!p || p.kind !== 'player' || !(p.authorId >= 0) || !p.name) return html;
    return html.replace(/(<span class="x-handle">@[^<]*<\/span>)/, (m) => m + '<span class="ux-pbadge" title="' + esc(persona(p.name).blurb) + '">' + esc(tl(persona(p.name).label)) + '</span>');
  };

  // ---- profile ----
  const origProfile = xProfileHtml;
  xProfileHtml = function (key) { // eslint-disable-line no-global-assign
    const html = origProfile.apply(this, arguments);
    if (typeof key !== 'string' || key.charAt(0) !== 'p') return html;
    const acc = typeof xAccountOf === 'function' ? xAccountOf(key) : null;
    if (!acc || acc.kind === 'club' || acc.kind === 'creator' || !acc.name) return html;
    const pr = persona(acc.name);
    return html.replace(/(<div class="xs-prof-handle">[^<]*<\/div>)/, (m) => m + '<div class="ux-pprof"><span class="ux-pbadge">' + esc(tl(pr.label)) + '</span><span class="b">' + esc(tl(pr.blurb)) + '</span></div>');
  };

  // ---- Explore: search by name / handle / club / personality ----
  xSearchResults = function () { // eslint-disable-line no-global-assign
    const q = xQuery.trim().toLowerCase();
    const people = xPeople().map((x) => { const pr = persona(x.name); return { kind: 'player', key: 'p' + x.id, name: x.name, handle: x.handle, followers: x.followers, verified: x.verified, sub: (x.club || '') + ' · ' + tl(pr.label), id: x.id, _p: pr }; });
    const clubs = xClubs().map((c) => ({ kind: 'club', key: 'c' + c.id, name: c.name, handle: c.handle, followers: c.followers, verified: true, sub: (typeof xRegionName === 'function' && xRegionName(c.region)) || tl('Club'), id: c.id }));
    const creators = xCreators().map((c) => ({ kind: 'creator', key: 'k' + c.id, name: c.name, handle: c.handle, followers: c.followers, verified: c.followers >= 50000, sub: c.kind === 'caster' ? tl('Caster') : tl('Creator'), id: c.id }));
    const all = people.concat(clubs, creators);
    const hit = (r) => r.name.toLowerCase().indexOf(q) !== -1 || r.handle.toLowerCase().indexOf(q) !== -1 || String(r.sub || '').toLowerCase().indexOf(q) !== -1 || (r._p && P.matchesPersona(r._p, q));
    return (q ? all.filter(hit) : all).sort((a, b) => b.followers - a.followers).slice(0, 40);
  };
  const origRow = xAccountRowHtml;
  xAccountRowHtml = function (r) { // eslint-disable-line no-global-assign
    const html = origRow.apply(this, arguments);
    return r && r._p ? html.replace(/(<div class="xs-row-handle">[^<]*)(<\/div>)/, (m, a, z) => a + ' &middot; ' + esc(tl(r._p.label)) + z) : html;
  };
  // Trending: the hashtags that carried the most posts in the last few days (a club tag opens that club)
  function trending() {
    const c = C(), posts = xWall(), clubs = xClubs(), count = {};
    for (const p of posts) { if (!p.tags || daysBetween(c.currentDate, p.date) > 4) continue; for (const t of p.tags) count[t] = (count[t] || 0) + 1 + Math.min(3, (p.likes || 0) / 4000); }
    const top = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 6);
    if (!top.length) return '';
    const rows = top.map((t, i) => {
      const club = clubs.find((x) => { const tm = teamById(x.id); return tm && tm.abbrev && '#' + tm.abbrev === t; });
      const n = Math.round(count[t]);
      return '<div class="ux-trend-r"><div>' + (i + 1) + ' &middot; ' + (club ? '<button type="button" data-action="ux-persona" data-q="' + esc(club.name) + '">' + esc(t) + '</button>' : '<b>' + esc(t) + '</b>') + '</div><span>' + esc(tln('{n} post', '{n} posts', n)) + '</span></div>';
    }).join('');
    return '<div class="ux-trend"><div class="ux-trend-k">' + esc(tl('Trending')) + '</div>' + rows + '</div>';
  }
  // Y mood: the club's reputation on Y (engine: ux-fx.js). Small effects on followers, media fees and morale, shown so they are not a mystery
  const WHY = { title: 'Won a title', upset: 'Upset result', rout: 'One-sided result', 'club-series': 'Knocked out', 'repost:club': 'Backed the club', signing: 'Transfer news', 'free-agent': 'Free agent signed', rumour: 'Transfer talk', callout: 'Public callout' };
  const REPLY_WHY = { warm: 'friendly', laugh: 'joke', hype: 'hype', bite: 'cocky', fight: 'callout', plain: 'plain', ask: 'question' };
  const whyText = (w) => (WHY[w] ? tl(WHY[w]) : /^post:/.test(w) ? tl('Your post') + ': ' + tl(w.slice(5)) : /^(reply|quote):/.test(w) ? tl(w.charAt(0) === 'q' ? 'Your quote' : 'Your reply') + ': ' + tl(REPLY_WHY[w.split(':')[1]] || w.split(':')[1]) : tl(w));
  function moodCard() {
    const fx = (C().social && C().social.ux && C().social.ux.fx) || null;
    if (!fx) return '';
    const rep = fx.rep || 0, pct = Math.min(50, Math.abs(rep) * 5);
    const label = rep >= 5 ? 'Buzzing' : rep >= 2 ? 'Warm' : rep > -2 ? 'Neutral' : rep > -5 ? 'Cold' : 'Hostile';
    const recent = (fx.log || []).slice(-3).reverse().map((l) => '<div class="ux-mood-r"><span>' + esc(whyText(l.why)) + '</span><b class="' + (l.v >= 0 ? 'up' : 'down') + '">' + (l.v >= 0 ? '+' : '') + l.v + '</b></div>').join('');
    return '<div class="ux-mood"><div class="ux-mood-k">' + esc(tl('Y mood')) + '<span>' + esc(tl(label)) + '</span></div>' +
      '<div class="ux-mood-bar"><i style="' + (rep >= 0 ? 'left:50%;width:' + pct + '%' : 'right:50%;width:' + pct + '%') + '" class="' + (rep >= 0 ? 'up' : 'down') + '"></i></div>' + recent +
      '<div class="ux-mood-h">' + esc(tl('Nudges followers, media fees and morale a little. It fades over time.')) + '</div></div>';
  }
  const origSide = xSideHtml;
  xSideHtml = function () { // eslint-disable-line no-global-assign
    const html = origSide.apply(this, arguments);
    return html.replace(/(<div class="xs-search">[\s\S]*?<\/div>)/, (m) => m + moodCard());
  };
  const origExplore = xExploreHtml;
  xExploreHtml = function () { // eslint-disable-line no-global-assign
    const html = origExplore.apply(this, arguments);
    const q = (xQuery || '').trim().toLowerCase();
    const chips = '<div class="ux-pchips"><div class="ux-pchips-k">' + esc(tl('Browse by personality')) + '</div>' + P.PERSONAS.map((p) =>
      '<button type="button" class="ux-pchip' + (q === p.label.toLowerCase() ? ' on' : '') + '" data-action="ux-persona" data-q="' + esc(p.label) + '" title="' + esc(tl(p.blurb)) + '">' + esc(tl(p.label)) + '</button>').join('') + '</div>';
    return html.replace('<div class="xs-rows">', trending() + chips + '<div class="xs-rows">');
  };
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-action="ux-persona"]');
    if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    xQuery = (xQuery || '').trim().toLowerCase() === b.dataset.q.toLowerCase() ? '' : b.dataset.q;
    const inp = document.querySelector('#x-search, [data-action="x-search"], .xs-search input'); if (inp) inp.value = xQuery;
    render();
  }, true);
  try { render(); } catch (e) { /* no career open yet */ }
})();
