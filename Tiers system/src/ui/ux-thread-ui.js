// Y threads, renderer side (injected after ux-social-ui.js; wraps the game's own globals):
//  - every post gets a real reply button (count = the game's number or the replies actually in the feed, whichever is bigger); clicking a post inside Y opens its thread
//  - the thread page: the chain above the post, the post, a composer (free text + optional tone chip), then the replies as a tree
//  - replying goes out through hub.postTweet with a '\u0001uxy:' prefix (the one social IPC the main process forwards in both careers); answers arrive as notifications
(function () {
  'use strict';
  if (window.__uxThreadUI) return;
  if (typeof postHtml !== 'function' || typeof xMidHtml !== 'function' || typeof xHeadHtml !== 'function' || typeof xEmptyHtml !== 'function' || !window.hub || !window.hub.postTweet) return;
  window.__uxThreadUI = true;

  const PREFIX = '\u0001uxy:';
  const TONES = [['', 'Plain'], ['respect', 'Respect'], ['thanks', 'Thanks'], ['joke', 'Joke'], ['hype', 'Hype'], ['cocky', 'Cocky'], ['callout', 'Callout']];
  const st = document.createElement('style');
  st.textContent = [
    // motion
    '@keyframes uxIn{from{opacity:0;transform:translateY(20px) scale(.985)}to{opacity:1;transform:none}}',
    '@keyframes uxPop{0%{opacity:0;transform:translateY(-10px) scale(.93)}55%{opacity:1;transform:scale(1.02)}100%{opacity:1;transform:none}}',
    '@keyframes uxFlash{0%{background:color-mix(in srgb,var(--text) 16%,transparent)}100%{background:transparent}}',
    '@keyframes uxMenu{from{opacity:0;transform:translateY(-8px) scale(.94)}to{opacity:1;transform:none}}',
    '@keyframes uxSpin{to{transform:rotate(360deg)}}',
    '@keyframes uxLine{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    // buttons on posts
    '.ux-rbtn{position:relative;overflow:hidden;border:none;background:none;font:inherit;padding:7px 11px;margin:-7px -11px;border-radius:999px;color:var(--text-dim);cursor:pointer;transition:color .15s,background .15s,transform .12s}',
    '.ux-rbtn:hover{color:var(--text);background:color-mix(in srgb,var(--text) 9%,transparent)}.ux-rbtn:active{transform:scale(.86)}.xs-feed .ux-rbtn{display:inline-flex;align-items:center;gap:7px}',
    '.ux-rbtn.ux-rp.on{color:var(--text);font-weight:800}.x-like{transition:color .15s,background .15s,transform .12s}.x-like:active{transform:scale(.86)}',
    '.x-post[data-ux-open]{cursor:pointer;transition:background .18s}.x-post[data-ux-open]:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}',
    '.ux-av>*{transition:transform .2s cubic-bezier(.2,.9,.3,1.3),box-shadow .2s;cursor:pointer}.ux-av:hover>*{transform:scale(1.08);box-shadow:0 0 0 2px var(--text)}',
    '.ux-rip{position:absolute;border-radius:50%;background:currentColor;pointer-events:none}',
    '.ux-rp-by{display:flex;align-items:center;gap:6px;font-size:var(--f-small);font-weight:700;color:var(--text-dim);padding:8px 16px 0 60px;margin-bottom:-6px}',
    '.ux-rto{font-size:var(--f-small);color:var(--text-dim);margin:2px 0}',
    '.ux-quote{border:1px solid var(--rule);border-radius:14px;padding:9px 13px;margin:8px 0;cursor:pointer;transition:background .18s,border-color .18s}.ux-quote:hover{background:color-mix(in srgb,var(--text) 5%,transparent);border-color:var(--text-dim)}.ux-q-h span{color:var(--text-dim);font-size:var(--f-small)}.ux-q-t{margin-top:2px}',
    '.ux-menu{position:fixed;z-index:9999;min-width:160px;background:var(--panel,#fff);color:var(--text);border:1px solid var(--rule);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.35);padding:5px;animation:uxMenu .16s cubic-bezier(.2,.8,.2,1) both}',
    '.ux-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;font-weight:700;padding:10px 13px;border-radius:9px;cursor:pointer;transition:background .12s}.ux-menu button:hover{background:color-mix(in srgb,var(--text) 10%,transparent)}',
    // thread page
    '.ux-thr-top{position:relative}.ux-thr-top:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--text),transparent 70%);opacity:.55;transform-origin:left;animation:uxLine .7s cubic-bezier(.2,.8,.2,1) both}',
    '.ux-thr-anc{margin:0;padding:6px 0 0;position:relative}.ux-thr-anc .x-post{opacity:.72;padding-bottom:0}',
    '.ux-thr-focus{border-bottom:1px solid var(--rule)}.ux-thr-focus .x-post{padding-top:18px;padding-bottom:4px}.ux-thr-focus .x-text{font-size:1.3em;line-height:1.42;letter-spacing:-.005em}',
    '.ux-thr-focus .x-actions{display:flex;justify-content:space-between;gap:0;margin-top:14px;border-top:1px solid var(--rule);padding:0}.ux-thr-focus .x-actions>*{display:inline-flex;justify-content:center;align-items:center;white-space:nowrap;padding:12px 6px;margin:0;font-size:1em}',
    // composer: flat, expands when you start
    '.ux-thr-c{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--rule)}.ux-thr-av{flex:0 0 auto;padding-top:2px}.ux-thr-col{flex:1;min-width:0}',
    '.ux-thr-to{font-size:var(--f-small);color:var(--text-dim);margin-bottom:2px}.ux-thr-to b{color:var(--text);font-weight:800}',
    '.ux-thr-in{display:block;width:100%;box-sizing:border-box;min-height:40px;resize:none;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:1.12em;line-height:1.4;padding:6px 0;transition:min-height .35s cubic-bezier(.2,.8,.2,1)}',
    '.ux-thr-c.open .ux-thr-in{min-height:104px}.ux-thr-in::placeholder{color:var(--text-dim)}',
    '.ux-thr-more{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .36s cubic-bezier(.2,.8,.2,1),opacity .3s}.ux-thr-more>div{overflow:hidden;min-height:0}.ux-thr-c.open .ux-thr-more{grid-template-rows:1fr;opacity:1}',
    '.ux-thr-row{display:flex;flex-wrap:wrap;gap:6px;padding-top:10px;border-top:1px solid var(--rule)}',
    '.ux-thr-chip{position:relative;overflow:hidden;border:1px solid var(--rule);background:transparent;color:var(--text);font:inherit;font-size:var(--f-small);font-weight:700;padding:4px 13px;border-radius:999px;cursor:pointer;transition:background .18s,color .18s,border-color .18s,transform .18s cubic-bezier(.2,.9,.3,1.3)}',
    '.ux-thr-chip:hover{border-color:var(--text);transform:translateY(-1px)}.ux-thr-chip.on{background:var(--text);color:var(--panel,#000);border-color:var(--text);transform:scale(1.05)}',
    '.ux-thr-act{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px}.ux-thr-n{font-size:var(--f-micro);color:var(--text-dim);margin-right:auto}.ux-thr-n.warn{color:#d6293f;font-weight:800}',
    '.ux-thr-gen{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--rule);border-radius:999px;background:transparent;color:var(--text);font:inherit;font-weight:800;padding:7px 16px;cursor:pointer;transition:border-color .15s,transform .15s,background .15s}',
    '.ux-thr-gen:hover{border-color:var(--text);transform:translateY(-1px)}.ux-thr-gen:active{transform:scale(.96)}.ux-thr-gen.busy{pointer-events:none;opacity:.7}.ux-thr-gen.busy .ux-sp{animation:uxSpin .7s linear infinite}.ux-sp{display:block}',
    '.ux-thr-send{position:relative;overflow:hidden;border:0;border-radius:999px;background:var(--red);color:#fff;font:inherit;font-weight:800;padding:8px 24px;cursor:pointer;transition:transform .15s,box-shadow .2s,opacity .2s}',
    '.ux-thr-send:not([disabled]):hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.3)}.ux-thr-send:not([disabled]):active{transform:scale(.95)}.ux-thr-send[disabled]{opacity:.35;cursor:default}',
    '.ux-thr-hint{margin-top:8px;font-size:var(--f-micro);color:var(--text-dim)}.ux-thr-note{padding:12px 16px;color:var(--text-dim);font-size:var(--f-small)}',
    // replies section
    '.ux-thr-sec{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--rule)}.ux-thr-sec b{font-size:1.02em}',
    '.ux-seg{display:inline-flex;border:1px solid var(--rule);border-radius:999px;padding:2px}.ux-seg button{position:relative;overflow:hidden;border:0;background:transparent;color:var(--text-dim);font:inherit;font-size:var(--f-small);font-weight:800;padding:3px 12px;border-radius:999px;cursor:pointer;transition:background .2s,color .2s}.ux-seg button.on{background:var(--text);color:var(--panel,#000)}',
    '.ux-ind{position:relative;margin-left:26px}.ux-ind.d0{margin-left:0}.ux-ind:before{content:"";position:absolute;left:-14px;top:8px;bottom:8px;width:2px;border-radius:2px;background:linear-gradient(180deg,var(--text-dim),transparent);opacity:.4}.ux-ind.d0:before{display:none}.ux-ind.d3,.ux-ind.d4{margin-left:0}.ux-ind.d3:before,.ux-ind.d4:before{display:none}',
    '.ux-thr-tree .x-post{transition:background .18s}.ux-thr-tree .x-post:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}.ux-ind.ux-pop{animation:uxPop .55s cubic-bezier(.2,.8,.2,1) both,uxFlash 1.6s .2s ease-out}',
    '.ux-thr-none{padding:34px 16px;text-align:center;color:var(--text-dim)}',
    // entry choreography: hero, composer, then replies cascading in
    '.ux-enter .ux-thr-anc,.ux-enter .ux-thr-focus{animation:uxIn .45s cubic-bezier(.2,.8,.2,1) both}.ux-enter .ux-thr-c{animation:uxIn .5s .1s cubic-bezier(.2,.8,.2,1) both}.ux-enter .ux-thr-sec{animation:uxIn .5s .16s cubic-bezier(.2,.8,.2,1) both}',
    '.ux-enter .ux-ind.d0,.ux-enter-tree .ux-ind.d0{animation:uxIn .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(.22s + var(--i,0) * .06s)}',
    // profile extras
    '.ux-pex{margin:10px 14px;border:1px solid var(--rule);border-radius:16px;padding:4px 14px}.ux-pex-r{display:flex;gap:12px;align-items:baseline;padding:9px 0;font-size:var(--f-small)}.ux-pex-r+.ux-pex-r{border-top:1px solid var(--rule)}',
    '.ux-pex-r>span{flex:0 0 92px;color:var(--text-dim);font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:var(--f-micro)}.ux-pex-r>div{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}',
    '.ux-mate{border:1px solid var(--rule);background:transparent;color:var(--text);font:inherit;font-size:var(--f-small);font-weight:700;padding:2px 10px;border-radius:999px;cursor:pointer;transition:transform .15s,border-color .15s}.ux-mate:hover{border-color:var(--text);transform:translateY(-1px)}',
    '.ux-rap{font-weight:800;padding:1px 9px;border-radius:999px;background:color-mix(in srgb,var(--text) 10%,transparent)}.ux-rap.friendly{background:#2a9d55;color:#fff}.ux-rap.beef{background:#c0392b;color:#fff}.ux-pin{padding:8px 16px 0;font-size:var(--f-small);font-weight:800;color:var(--text-dim)}'
  ].join('');
  document.head.appendChild(st);

  const T = (s, v) => (typeof tl === 'function' ? tl(s, v) : s);
  let thr = { mode: 'reply', n: 0, id: null, target: null, draft: '', tone: '', busy: false, enter: false, fresh: null, open: false, sort: 'old' };
  const CAP = 20; // matches the engine: until a thread is opened the shown count is min(CAP, replies); once opened it is exactly the comments
  let inThread = false, cache = { wall: null, n: -1, kids: new Map(), byId: new Map(), rps: new Map(), mineRp: new Set() };

  // posts the page can see (the feed, plus the profile and own-post lists, which reach further back)
  function index() {
    const soc = (S && S.social) || {}, wall = typeof xWall === 'function' ? xWall() : soc.posts || [];
    const n = wall.length + ((soc.profileWall && soc.profileWall.posts && soc.profileWall.posts.length) || 0) + ((soc.minePosts && soc.minePosts.length) || 0);
    if (cache.wall === wall && cache.n === n) return cache;
    const byId = new Map();
    for (const list of [soc.minePosts, soc.profileWall && soc.profileWall.posts, wall]) for (const p of list || []) byId.set(p.id, p);
    const kids = new Map(), rps = new Map(), mineRp = new Set(), mid = me() && me().id;
    for (const p of byId.values()) { const o = p.repostOf != null ? p.repostOf : p.quoteOf; if (o != null) { rps.set(o, (rps.get(o) || 0) + 1); if (p.repostOf != null && p.authorId === mid && p.own) mineRp.add(o); } }
    for (const p of byId.values()) if (p.replyTo != null) { let a = kids.get(p.replyTo); if (!a) kids.set(p.replyTo, a = []); a.push(p); }
    for (const a of kids.values()) a.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id));
    return (cache = { wall, n, byId, kids, rps, mineRp });
  }

  // every reply in the thread under a post, nested ones included: this is the number shown on the reply button
  const desc = (id, d) => { const k = index().kids.get(id) || []; let n = k.length; if ((d || 0) < 12) for (const c of k) n += desc(c.id, (d || 0) + 1); return n; };

  // ---- posts: real reply button, thread opens from the body ----
  const origPost = postHtml;
  postHtml = function (p) { // eslint-disable-line no-global-assign
    if (p && p.repostOf != null && !p.text && p.quote) { // a bare repost: the original post under a "reposted" banner
      const o = index().byId.get(p.repostOf) || Object.assign({ likes: 0, reposts: 0, replies: 0, views: 0, followers: 0 }, p.quote);
      const mineP = me() && p.authorId === me().id && p.own;
      return '<div class="ux-rp-by">&#8635; ' + esc(mineP ? T('You reposted') : T('{name} reposted', { name: p.name })) + '</div>' + postHtml(o);
    }
    let html = origPost.apply(this, arguments);
    if (!p || p.id == null || typeof p.id !== 'number') return html;
    try {
      const ix = index(), rn = Math.max(p.reposts || 0, ix.rps.get(p.id) || 0), reposted = ix.mineRp.has(p.id);
      html = html.replace(/<span title="[^"]*">&#8635; [^<]*<\/span>/, '<button type="button" class="ux-rbtn ux-rp' + (reposted ? ' on' : '') + '" data-action="ux-rp" data-id="' + p.id + '" title="' + esc(T('Repost')) + '">&#8635; ' + (typeof fmtCount === 'function' ? fmtCount(rn) : rn) + '</button>');
      if (p.quote && p.text) { // a quote post: the quoted post as a card
        const qc = '<div class="ux-quote" data-ux-open="' + esc(p.quote.id) + '"><div class="ux-q-h"><b>' + esc(p.quote.name) + '</b> <span>@' + esc(p.quote.handle) + '</span></div><div class="ux-q-t">' + esc(p.quote.text) + '</div></div>';
        html = html.replace('<div class="x-actions">', qc + '<div class="x-actions">');
      }
      const real = desc(p.id), n = p.amb ? real : Math.min(CAP, Math.max(p.replies || 0, real));
      const pk = p.kind === 'player' && p.authorId >= 0 ? 'p' + p.authorId : p.kind === 'club' && p.clubId != null ? 'c' + p.clubId : p.kind === 'creator' && p.authorId >= 0 ? 'k' + p.authorId : null;
      if (pk) html = html.replace(/(<article[^>]*>\s*)([\s\S]*?)(\s*<div class="x-body">)/, (m, a, face, c) => a + '<span class="ux-av" data-action="x-profile" data-key="' + pk + '" style="display:contents">' + face + '</span>' + c); // the picture opens the profile, like the name
      html = html.replace(/<span title="[^"]*">&#128172; [^<]*<\/span>/, '<button type="button" class="ux-rbtn" data-action="ux-reply" data-id="' + p.id + '" title="' + esc(T('Reply')) + '">&#128172; ' + (typeof fmtCount === 'function' ? fmtCount(n) : n) + '</button>');
      if (!inThread) {
        html = html.replace('<article class="x-post', '<article data-ux-open="' + p.id + '" class="x-post');
        const par = p.replyTo != null ? index().byId.get(p.replyTo) : null; // a reply seen outside its thread (feed, notifications) says who it answers
        if (par) html = html.replace('<div class="x-text">', '<div class="ux-rto">' + esc(T('Replying to')) + ' <span class="x-mention">@' + esc(par.handle || par.name) + '</span></div><div class="x-text">');
      }
    } catch (e) { /* the game's own markup is still fine */ }
    return html;
  };

  // ---- the thread page ----
  const me = () => (S && S.social && S.social.me) || null;
  const ph = (p) => { inThread = true; try { return postHtml(Object.assign({}, p, { isReply: false })); } finally { inThread = false; } }; // posts inside the thread are not clickable themselves
  function tree(p, d) {
    const kids = (index().kids.get(p.id) || []).slice();
    if (d === 0 && thr.sort === 'top') kids.sort((x, y) => (y.likes || 0) + 2 * (y.reposts || 0) - (x.likes || 0) - 2 * (x.reposts || 0));
    return kids.map((c, i) => '<div class="ux-ind d' + Math.min(d, 4) + (c.id === thr.fresh ? ' ux-pop' : '') + '" style="--i:' + Math.min(i, 12) + '">' + ph(c) + tree(c, d + 1) + '</div>').join('');
  }
  function composerHtml(target) {
    const m = me();
    if (!m) return '<div class="ux-thr-note">' + esc(T('Only your player account can reply on Y.')) + '</div>';
    const len = thr.draft.trim().length, max = (S.social && S.social.tweetMax) || 280, q = thr.mode === 'quote', open = thr.open || len > 0 || !!thr.tone;
    const face = typeof accountFaceHtml === 'function' ? accountFaceHtml({ kind: 'player', id: m.id, name: m.name, handle: m.handle }, 'xm-face') : '';
    return '<div class="ux-thr-c' + (open ? ' open' : '') + '"><div class="ux-thr-av">' + face + '</div><div class="ux-thr-col">' +
      '<div class="ux-thr-to">' + esc(T(q ? 'Quoting' : 'Replying to')) + ' <b>@' + esc(target.handle || target.name) + '</b></div>' +
      '<textarea id="ux-thr-text" class="ux-thr-in" maxlength="' + max + '" rows="2" placeholder="' + esc(T(q ? 'Add a comment' : 'Post your reply')) + '">' + esc(thr.draft) + '</textarea>' +
      '<div class="ux-thr-more"><div><div class="ux-thr-row">' + TONES.map((t) => '<button type="button" class="ux-thr-chip' + (thr.tone === t[0] ? ' on' : '') + '" data-action="ux-thr-tone" data-tone="' + t[0] + '">' + esc(T(t[1])) + '</button>').join('') + '</div>' +
      '<div class="ux-thr-act"><span class="ux-thr-n" id="ux-thr-count">' + len + ' / ' + max + '</span>' +
      '<button type="button" class="ux-thr-gen" data-action="ux-thr-gen" title="' + esc(T('Write a reply in the chosen tone')) + '"><svg class="ux-sp" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2l2.3 6.4L21 10l-6.7 1.6L12 18l-2.3-6.4L3 10l6.7-1.6zM19 15l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/></svg>' + esc(T('Generate')) + '</button>' +
      '<button type="button" class="ux-thr-send" id="ux-thr-send" data-action="ux-thr-send"' + (len ? '' : ' disabled') + '>' + esc(T(q ? 'Quote' : 'Reply')) + '</button></div>' +
      '<div class="ux-thr-hint">' + esc(T('Pick a tone, or just write: the replies read your words. Bold takes get answered, and not always kindly.')) + '</div></div></div></div></div>';
  }
  function threadHtml() {
    const ix = index(), f = ix.byId.get(thr.id);
    const nRep = f ? desc(f.id) : 0;
    const head = '<div class="ux-thr-top">' + xHeadHtml(esc(T('Post')), f ? esc(tln('{n} reply', '{n} replies', nRep)) : '', true).replace('data-action="x-back"', 'data-action="ux-thr-back"') + '</div>';
    if (!f) return head + xEmptyHtml(T('That post is gone.'));
    const anc = []; for (let c = f; c.replyTo != null && ix.byId.has(c.replyTo) && anc.length < 8;) { c = ix.byId.get(c.replyTo); anc.unshift(c); }
    const target = ix.byId.get(thr.target) || f;
    const sub = thr.mode === 'quote' ? '' : tree(f, 0);
    const cls = thr.enter === true ? ' ux-enter' : thr.enter === 'tree' ? ' ux-enter-tree' : '';
    if (thr.enter || thr.fresh) setTimeout(() => { thr.enter = false; thr.fresh = null; }, 0); // animations play once per entry, not on every redraw
    return head + '<div class="xs-feed' + cls + '">' + (anc.length ? '<div class="ux-thr-anc">' + anc.map((p) => ph(p)).join('') + '</div>' : '') +
      '<div class="ux-thr-focus">' + ph(f) + '</div>' + composerHtml(target) +
      (thr.mode === 'quote' || !nRep ? '' : '<div class="ux-thr-sec"><b>' + esc(tln('{n} reply', '{n} replies', nRep)) + '</b><div class="ux-seg">' + [['old', 'Oldest'], ['top', 'Top']].map((s) => '<button type="button" data-action="ux-thr-sort" data-v="' + s[0] + '"' + (thr.sort === s[0] ? ' class="on"' : '') + '>' + esc(T(s[1])) + '</button>').join('') + '</div></div>') +
      (sub ? '<div class="ux-thr-tree">' + sub + '</div>' : thr.mode === 'quote' ? '' : '<div class="ux-thr-none">' + esc(T('No replies to show yet. Be the first.')) + '</div>') + '</div>';
  }
  const origMid = xMidHtml;
  xMidHtml = function () { return xView === 'uxthread' ? threadHtml() : origMid.apply(this, arguments); }; // eslint-disable-line no-global-assign

  // ---- motion ----
  const calm = () => false; // always animate: this is a desktop game, and Windows 'animation effects off' (reduced motion) would otherwise hide all of it
  function slide(dir) { const m = document.querySelector('.xs-mid'); if (m && m.animate && !calm()) m.animate([{ opacity: 0, transform: 'translateX(' + dir * 40 + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
  function likeAnim(id, before) { // the heart pops when the like lands (the page redraws after the round trip, so wait for it)
    if (calm()) return;
    let n = 0; const iv = setInterval(() => {
      const el = document.querySelector('.x-like[data-id="' + id + '"]');
      if ((el && el.getAttribute('aria-pressed') !== before) || ++n > 30) { clearInterval(iv); if (el && el.animate) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.7) rotate(-14deg)' }, { transform: 'scale(.9) rotate(4deg)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)' }); }
    }, 40);
  }
  function ripple(e) {
    const b = e.target.closest && e.target.closest('.ux-thr-chip,.ux-thr-send,.ux-thr-gen,.ux-seg button,.ux-rbtn'); if (!b || b.disabled || calm()) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, sp = document.createElement('span'); sp.className = 'ux-rip';
    sp.style.cssText = 'left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px;width:' + s + 'px;height:' + s + 'px'; b.appendChild(sp);
    const a = sp.animate([{ transform: 'scale(0)', opacity: 0.3 }, { transform: 'scale(1)', opacity: 0 }], { duration: 560, easing: 'ease-out' }); a.onfinish = () => sp.remove();
  }
  document.addEventListener('pointerdown', ripple, true);
  document.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'ux-thr-text') { thr.open = true; const c = e.target.closest('.ux-thr-c'); if (c) c.classList.add('open'); } });

  // back goes back one step: every move into a thread or a profile is remembered, and the arrow returns to exactly where you were
  const nav = [];
  const snapNav = () => { const q = (s) => { const el = document.querySelector(s); return el ? el.scrollTop : 0; }; return { view: xView, who: typeof xWho !== 'undefined' ? xWho : null, tab: typeof xProfTab !== 'undefined' ? xProfTab : 'posts', thread: thr.id, mid: q('.xs-mid'), feed: q('.xs-feed') }; };
  function pushNav() {
    if (bigList !== 'x') return;
    const s = snapNav(), l = nav[nav.length - 1];
    if (l && l.view === s.view && l.who === s.who && l.thread === s.thread) return;
    nav.push(s); if (nav.length > 40) nav.shift();
  }
  function popNav() {
    const k = nav.pop(); if (!k) return false;
    xView = k.view; if (typeof xWho !== 'undefined') xWho = k.who; if (typeof xProfTab !== 'undefined') xProfTab = k.tab;
    if (k.thread != null) { thr.id = k.thread; thr.target = k.thread; }
    thr.mode = 'reply';
    render(); slide(-1);
    requestAnimationFrame(() => { const m = document.querySelector('.xs-mid'), f = document.querySelector('.xs-feed'); if (m) m.scrollTop = k.mid; if (f) f.scrollTop = k.feed; });
    return true;
  }
  function open(id, focusComposer, mode) {
    if (xView !== 'uxthread' || thr.id !== id) pushNav();
    const moved = xView !== 'uxthread' || thr.id !== id;
    thr.enter = true; thr.open = false; thr.openedAt = Date.now();
    if (thr.id !== id || thr.mode !== (mode || 'reply')) { thr.draft = ''; thr.tone = ''; }
    thr.mode = mode || 'reply'; thr.id = id; thr.target = id;
    if (bigList !== 'x') { bigList = 'x'; windowJustOpened = true; }
    xView = 'uxthread';
    render();
    if (moved) slide(1);
    ambient(id);
    if (focusComposer && typeof focusLater === 'function') focusLater('ux-thr-text');
  }
  async function ambient(id) { // the comments a post's reply count promised appear once, when its thread is first opened
    const p = index().byId.get(id);
    if (!p || p.amb || !(Math.min(CAP, p.replies || 0) > desc(id))) return;
    try {
      const r = await window.hub.postTweet({ text: PREFIX + JSON.stringify({ a: 'open', id }), gif: null });
      if (r && r.ok) { S = r; if (xView === 'uxthread' && thr.id === id) { thr.enter = Date.now() - (thr.openedAt || 0) < 900 ? true : 'tree'; /* comments landing right after opening continue the entry animation */ render(); } }
    } catch (e) { /* the thread is fine without them */ }
  }
  async function repostAct(id) {
    if (thr.busy) return; thr.busy = true;
    try {
      const r = await window.hub.postTweet({ text: PREFIX + JSON.stringify({ a: 'repost', id }), gif: null });
      if (!r || r.ok === false) { showToast((r && r.error) || T('Could not repost.')); return; }
      S = r; render(); showToast(T(r.undone ? 'Repost removed.' : 'Reposted.'));
      const rb = document.querySelector('.ux-rp[data-id="' + id + '"]'); if (rb && rb.animate && !calm()) rb.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(200deg) scale(1.35)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } catch (e) { showToast(T('Could not repost.')); } finally { thr.busy = false; }
  }
  function menu(btn) {
    const old = document.getElementById('ux-rp-menu'); if (old) old.remove();
    const id = Number(btn.dataset.id), on = btn.classList.contains('on'), r = btn.getBoundingClientRect(), host = btn.closest('.xs') || document.body;
    const m = document.createElement('div'); m.id = 'ux-rp-menu'; m.className = 'ux-menu';
    m.style.cssText = 'left:' + Math.max(8, Math.round(r.left - 8)) + 'px;top:' + Math.round(r.bottom + 4) + 'px';
    m.innerHTML = '<button type="button" data-action="ux-rp-do" data-kind="repost" data-id="' + id + '">&#8635; ' + esc(T(on ? 'Undo repost' : 'Repost')) + '</button><button type="button" data-action="ux-rp-do" data-kind="quote" data-id="' + id + '">&#9998; ' + esc(T('Quote')) + '</button>';
    host.appendChild(m);
  }
  async function generate() {
    if (thr.busy || thr.target == null) return;
    thr.busy = true;
    const gb = document.querySelector('.ux-thr-gen'); if (gb) gb.classList.add('busy');
    try {
      const r = await window.hub.postTweet({ text: PREFIX + JSON.stringify({ a: 'gen', id: thr.target, tone: thr.tone || null, n: ++thr.n, avoid: thr.draft }), gif: null });
      if (!r || r.ok === false || !r.text) { showToast((r && r.error) || T('Nothing came to mind.')); return; }
      thr.draft = r.text; render(); if (typeof focusLater === 'function') focusLater('ux-thr-text');
      const ta = document.getElementById('ux-thr-text'); // the draft types itself out
      if (ta && !calm()) {
        const full = r.text, cnt = document.getElementById('ux-thr-count'), sb = document.getElementById('ux-thr-send'); ta.value = '';
        for (let i = 1; i <= full.length; i++) {
          if (!ta.isConnected || thr.draft !== full) break;
          ta.value = full.slice(0, i); if (cnt) cnt.textContent = i + ' / ' + ta.maxLength; if (sb) sb.disabled = false;
          await new Promise((res) => setTimeout(res, 16));
        }
        if (ta.isConnected && thr.draft === full) ta.value = full;
      }
    } catch (e) { showToast(T('Nothing came to mind.')); } finally { thr.busy = false; }
  }
  async function send() {
    if (thr.busy || !thr.draft.trim() || thr.target == null) return;
    thr.busy = true;
    try {
      const r = await window.hub.postTweet({ text: PREFIX + JSON.stringify({ a: thr.mode === 'quote' ? 'quote' : 'reply', id: thr.target, text: thr.draft, tone: thr.tone || null }), gif: null });
      if (!r || r.ok === false) { showToast((r && r.error) || T('Could not post.')); return; }
      const wasQuote = thr.mode === 'quote';
      S = r; thr.draft = ''; thr.tone = ''; thr.target = thr.id; thr.mode = 'reply';
      thr.fresh = r.post.id; thr.enter = false; thr.open = false;
      if (wasQuote) { if (!popNav()) { xView = 'home'; render(); } } else render();
      showToast(T(wasQuote ? 'Quoted.' : 'Replied.') + (r.gain > 0 ? ' +' + r.gain + ' ' + T('followers') : '') + (r.lost ? ' ' + T('Posting this much cost you {n} followers.', { n: r.lost }) : ''));
    } catch (e) { showToast(T('Could not post.')); } finally { thr.busy = false; }
  }

  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const b = t.closest('[data-action^="ux-"]');
    const xp = t.closest('[data-action="x-profile"]'); if (xp && !(xView === 'profile' && xWho === xp.dataset.key)) { pushNav(); setTimeout(() => slide(1), 0); } // remember where you were, then let the game open the profile
    if (t.closest('[data-action="x-back"]') && nav.length) { e.stopImmediatePropagation(); e.preventDefault(); popNav(); return; }
    if (t.closest('[data-action="x-go"],[data-action="big-close"]')) nav.length = 0;
    const lk = t.closest('.x-like'); if (lk) likeAnim(lk.dataset.id, lk.getAttribute('aria-pressed'));
    const om = document.getElementById('ux-rp-menu'); if (om && !(b && b.dataset.action === 'ux-rp')) om.remove(); // any other click closes the repost menu
    if (b && /^ux-(reply|thr-|rp)/.test(b.dataset.action)) {
      e.stopImmediatePropagation(); e.preventDefault();
      const a = b.dataset.action;
      if (a === 'ux-rp') { if (om) om.remove(); else menu(b); }
      else if (a === 'ux-rp-do') { const id = Number(b.dataset.id); if (b.dataset.kind === 'quote') open(id, true, 'quote'); else repostAct(id); }
      else if (a === 'ux-reply') { thr.mode = 'reply'; const id = Number(b.dataset.id); if (xView === 'uxthread' && thr.id != null && (index().byId.get(id))) { thr.target = id; render(); if (typeof focusLater === 'function') focusLater('ux-thr-text'); } else open(id, true); }
      else if (a === 'ux-thr-tone') { thr.tone = thr.tone === b.dataset.tone ? '' : b.dataset.tone; render(); if (typeof focusLater === 'function') focusLater('ux-thr-text'); }
      else if (a === 'ux-thr-sort') { thr.sort = b.dataset.v; thr.enter = 'tree'; render(); }
      else if (a === 'ux-thr-send') send();
      else if (a === 'ux-thr-gen') generate();
      else if (a === 'ux-thr-back') { thr.mode = 'reply'; if (!popNav()) { xView = 'home'; if (typeof xWho !== 'undefined') xWho = null; render(); } }
      return;
    }
    // a click on the body of a post (not a link, button or name) inside Y opens its thread
    const art = t.closest('[data-ux-open]');
    if (!art || t.closest('a,button,[data-action],textarea,input,img.x-gif') || !t.closest('.xs')) return;
    if (window.getSelection && String(window.getSelection())) return; // selecting text is not a click
    e.stopImmediatePropagation(); e.preventDefault();
    open(Number(art.dataset.uxOpen), false);
  }, true);
  // ---- profiles: pinned post, Media / Highlights tabs, head to head, rapport, teammates ----
  const C_ = () => (typeof C === 'function' ? C() : S.career);
  const won = (f) => ((f.homeWins || 0) || (f.awayWins || 0) ? f.homeWins > f.awayWins : f.homeGoals > f.awayGoals);
  function h2h(tid) {
    const my = C_().userTeamId; if (tid == null || tid === my) return null;
    let w = 0, l = 0, last = null;
    for (const f of C_().fixtures || []) {
      if (!f.played || f.scrimView) continue;
      const home = f.homeId === my && f.awayId === tid, away = f.awayId === my && f.homeId === tid; if (!home && !away) continue;
      const mine = home ? won(f) : !won(f); if (mine) w++; else l++;
      if (!last || f.date > last.date) last = { date: f.date, mine, score: ((f.homeWins || 0) || (f.awayWins || 0)) ? (home ? f.homeWins + '-' + f.awayWins : f.awayWins + '-' + f.homeWins) : (home ? f.homeGoals + '-' + f.awayGoals : f.awayGoals + '-' + f.homeGoals) };
    }
    return { w, l, last };
  }
  const rapport = (key) => { const u = (C_().social && C_().social.ux && C_().social.ux.thr && C_().social.ux.thr.rel) || {}, r = u[key]; if (!r || !r.n) return null; return { label: r.s >= 2 ? 'Friendly' : r.s <= -2 ? 'Beef' : 'Neutral', n: r.n, s: r.s }; };
  const pinOf = (list) => { const a = list.filter((p) => p.replyTo == null && p.repostOf == null && (p.text || p.gif)); if (a.length < 3) return null; return a.reduce((b, p) => ((p.likes || 0) + 2 * (p.reposts || 0) > (b.likes || 0) + 2 * (b.reposts || 0) ? p : b), a[0]); };
  function extrasHtml(key, acc, list) {
    const me_ = me(), rows = [], mineKey = me_ ? 'p' + me_.id : null, tid = acc.kind === 'club' ? acc.clubId : acc.kind === 'player' ? acc.clubId : null;
    if (key === mineKey) {
      const mine = ((S.social && S.social.minePosts) || []), rp = list.filter((p) => p.quoteOf != null).length, rs = mine.filter((p) => p.replyTo != null).length, rt = list.filter((p) => p.repostOf != null).length;
      rows.push([T('Activity'), esc(T('{n} replies', { n: rs })) + ' &middot; ' + esc(T('{n} quotes', { n: rp })) + ' &middot; ' + esc(T('{n} reposts', { n: rt }))]);
    } else {
      const h = h2h(tid);
      if (h) rows.push([T('Head to head'), h.w + h.l ? '<b>' + h.w + '&ndash;' + h.l + '</b> ' + esc(T('for your club')) + (h.last ? ' &middot; ' + esc(T('last')) + ': ' + (h.last.mine ? esc(T('won')) : esc(T('lost'))) + ' ' + esc(h.last.score) : '') : esc(T('No series played yet'))]);
      const rp = acc.kind === 'player' ? rapport(key) : null;
      if (acc.kind === 'player') rows.push([T('Rapport'), rp ? '<span class="ux-rap ' + rp.label.toLowerCase() + '">' + esc(T(rp.label)) + '</span> &middot; ' + esc(tln('{n} exchange', '{n} exchanges', rp.n)) : esc(T('No history'))]);
    }
    if (tid != null && acc.kind !== 'creator') {
      const mates = (C_().players || []).filter((p) => p.teamId === tid && !p.retired && ('p' + p.id) !== key).sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 5);
      if (mates.length) rows.push([T(acc.kind === 'club' ? 'Roster' : 'Teammates'), mates.map((p) => '<button type="button" class="ux-mate" data-action="x-profile" data-key="p' + p.id + '">' + esc(p.name) + (typeof xIsFollowing === 'function' && xIsFollowing('p' + p.id) ? ' &#10003;' : '') + '</button>').join('')]);
    }
    return rows.length ? '<div class="ux-pex">' + rows.map((r) => '<div class="ux-pex-r"><span>' + esc(r[0]) + '</span><div>' + r[1] + '</div></div>').join('') + '</div>' : '';
  }
  const origProf = xProfileHtml;
  xProfileHtml = function (key) { // eslint-disable-line no-global-assign
    const html = origProf.apply(this, arguments);
    try {
      const acc = typeof key === 'string' && typeof xAccountOf === 'function' ? xAccountOf(key) : null; if (!acc || !/<div class="xs-tabs">/.test(html)) return html;
      const pw = S.social && S.social.profileWall, list = pw && pw.key === key ? pw.posts : xWall().filter((p) => xKeyOfPost(p) === key), isMe = key === xMeKey();
      const tabs = [['posts', 'Posts'], ['replies', 'Replies'], ['media', 'Media'], ['highlights', 'Highlights']].concat(isMe ? [['likes', 'Likes']] : []);
      let out = html.replace(/<div class="xs-tabs">[\s\S]*?<\/div>/, extrasHtml(key, acc, list) + xTabsHtml(tabs, xProfTab, 'data-action="x-prof-tab"'));
      const feed = (arr, empty) => '<div class="xs-feed">' + (arr.length ? arr.map(postHtml).join('') : xEmptyHtml(empty)) + '</div>';
      const own = list.filter((p) => p.replyTo == null);
      if (xProfTab === 'media') out = out.replace(/<div class="xs-feed">[\s\S]*$/, () => feed(own.filter((p) => p.gif), T('No media yet.')));
      else if (xProfTab === 'highlights') out = out.replace(/<div class="xs-feed">[\s\S]*$/, () => feed(own.filter((p) => p.repostOf == null).slice().sort((a, b) => ((b.likes || 0) + 2 * (b.reposts || 0)) - ((a.likes || 0) + 2 * (a.reposts || 0))).slice(0, 5), T('Nothing to highlight yet.')));
      else if (xProfTab === 'posts' || !xProfTab) {
        const pin = pinOf(own);
        if (pin) out = out.replace(/<div class="xs-feed">[\s\S]*$/, () => '<div class="xs-feed"><div class="ux-pin">&#128204; ' + esc(T('Pinned')) + '</div>' + postHtml(pin) + own.filter((p) => p !== pin).map(postHtml).join('') + '</div>');
      }
      return out;
    } catch (e) { return html; }
  };

  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'ux-thr-text') return;
    thr.draft = e.target.value;
    const n = document.getElementById('ux-thr-count'), s = document.getElementById('ux-thr-send');
    if (n) { n.textContent = thr.draft.trim().length + ' / ' + e.target.maxLength; n.classList.toggle('warn', thr.draft.length > e.target.maxLength - 30); }
    if (s) s.disabled = !thr.draft.trim();
  });
  document.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'ux-thr-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  try { render(); } catch (e) { /* no career open yet */ }
})();
