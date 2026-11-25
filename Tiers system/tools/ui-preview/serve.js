const http=require('http'),fs=require('fs'),path=require('path');
const R=path.join(__dirname,'..','..','..').split(path.sep).join('/')+'/';
const dir=R+'app_extracted/renderer';
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'};
http.createServer((q,r)=>{
 let u=decodeURIComponent(q.url.split('?')[0]);
 if(u==='/'||u==='/index.html'){
  let h=fs.readFileSync(dir+'/index.html','utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
  h=h.replace('<script src="i18n.js">','<script src="/stub.js"></script><script src="i18n.js">').replace('<script src="version-label.js"></script>','<script src="/prize.js"></script><script src="/persona.js"></script><script src="/betrules.js"></script><script src="/tier-ui.js"></script><script src="/academy.js"></script><script src="/academy-ui.js"></script><script src="/logos-map.js"></script><script src="/matches-ui.js"></script><script src="/logos-ui.js"></script><script src="/ux-ui.js"></script><script src="/ux-season-ui.js"></script><script src="/ux-office-ui.js"></script><script src="/ux-social-ui.js"></script><script src="/ux-thread-ui.js"></script><script src="/ux-bets-ui.js"></script><script src="/ux-club-ui.js"></script><script src="/ux-staff-ui.js"></script><script src="/late-texts.js"></script><script src="/late-ui.js"></script><script src="/late-host-ui.js"></script><script src="/late-legacy-ui.js"></script><script src="/late-manager-ui.js"></script><script src="/ux-fastsim-ui.js"></script><script src="/ux-awards-ui.js"></script><script src="/ux-scrims-ui.js"></script><script src="version-label.js"></script>');
  r.setHeader('content-type','text/html');return r.end(h);}
 if(u==='/stub.js'){r.setHeader('content-type','text/javascript');return r.end(`
 window.__which=location.search.indexOf('late')>=0?'state-late'+(location.search.indexOf('fresh')>=0?'-fresh':'')+(location.search.indexOf('tb')>=0?'-b':'')+(location.search.indexOf('circuit')>=0?'-circuit':'')+(location.search.indexOf('plan')>=0?'-plan':'')+(location.search.indexOf('bids')>=0?'-bids':'')+(location.search.indexOf('legacy')>=0?'-legacy':''):location.search.indexOf('pl')>=0?'state-pl':location.search.indexOf('ko')>=0?'state-ko':location.search.indexOf('scr')>=0?'state-s':location.search.indexOf('bets')>=0?'statebets':'state'+(location.search.indexOf('b')>=0?'-b':'')+(location.search.indexOf('end')>=0?'-end':'')+(location.search.indexOf('gap')>=0?'-gap':'');
 function load(){const x=new XMLHttpRequest();x.open('GET','/'+window.__which+'.json',false);x.send();return JSON.parse(x.responseText);}
 function jget(u){const x=new XMLHttpRequest();x.open('GET',u,false);x.send();return JSON.parse(x.responseText);}
 window.hub=new Proxy({getState:async()=>location.search.indexOf('pre')>=0?{career:null,appearance:{},version:'x',playerCareerAvailable:false,difficulties:[],seriesLengths:[]}:load(),listClubs:async()=>jget('/clubs.json'),listSaves:async()=>({saves:[]}),getSeasonHistory:async(n)=>{const s=await load();const r=((s.career||{}).seasonHistory||[]).find(x=>x.season===n);return r?{ok:true,record:r}:{ok:false};},placeBet:async(o)=>{const x=new XMLHttpRequest();x.open('POST','/rpc?w='+window.__which,false);x.send(JSON.stringify(o));return JSON.parse(x.responseText);},viewProfile:async()=>load(),postTweet:async(o)=>{const x=new XMLHttpRequest();x.open('POST','/tweet',false);x.send(JSON.stringify(o));return JSON.parse(x.responseText);},betaInfo:async()=>({})},{get:(t,k)=>k in t?t[k]:(async()=>({ok:true}))});`);}
 if(u==='/tier-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/tier-ui.js'));}
 if(u==='/academy.js'){r.setHeader('content-type','text/javascript');return r.end('(function(){const module={exports:{}};'+fs.readFileSync(R+'Tiers system/src/engine/academy.js')+';window.__academy=module.exports;})();');}
 if(u==='/logos-map.js'){const ld=R+'Tiers system/src/teams_logos/',ab=JSON.parse(fs.readFileSync(ld+'tier_b_team_abbreviations.json','utf8')),m={};for(const k of Object.keys(ab)){const f=[k,k.replace(/[^A-Za-z0-9]/g,'')].map(n=>ld+'output_logos/'+n+'.svg').find(x=>fs.existsSync(x));if(f)m[ab[k]]=fs.readFileSync(f,'utf8');}r.setHeader('content-type','text/javascript');return r.end('window.__btierLogos='+JSON.stringify(m)+';');}
 if(u==='/logos-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/logos-ui.js'));}
 if(u==='/prize.js'){r.setHeader('content-type','text/javascript');return r.end('window.__uxPrize='+JSON.stringify(require(R+'Tiers system/src/engine/ux-prize.js')(require(R+'app_extracted/engine/events.js')))+';');}
 if(u==='/ux-season-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-season-ui.js'));}
 if(u==='/ux-office-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-office-ui.js'));}
 if(u==='/ux-social-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-social-ui.js'));}
 if(u==='/persona.js'){r.setHeader('content-type','text/javascript');return r.end('(function(){const module={exports:{}};'+fs.readFileSync(R+'Tiers system/src/engine/ux-persona.js','utf8')+';window.__uxPersona=module.exports;})();');}
 if(u==='/ux-bets-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-bets-ui.js'));}
 if(u==='/betrules.js'){r.setHeader('content-type','text/javascript');return r.end('(function(){const module={exports:{}};'+fs.readFileSync(R+'Tiers system/src/engine/ux-bets-rules.js','utf8')+';window.__uxBetRules=module.exports;})();');}
 if(u==='/world-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/world-ui.js'));}
 if(u==='/world-base.json'){const real=require(R+'app_extracted/data/rlcs-2027.json');const W=require(R+'Tiers system/src/engine/btier-world.js');r.setHeader('content-type','application/json');return r.end(JSON.stringify({b:W.editorRegions(undefined,(s)=>Math.round((s-50)/6)),a:real.regions.map(g=>({id:g.id,name:g.name,short:g.short||g.id,teams:g.teams.map(t=>({name:t.name,logo:null,colors:null,abbrev:null,strength:t.strength||0,stars:3,players:t.players.map(p=>({ref:'r:'+t.name+'|'+p.name,name:p.name,age:p.age||20,nation:p.nation||null,rating:60,face:null,x:50,y:34}))}))}))}));}
 if(u==='/ux-awards-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-awards-ui.js'));}
 if(u==='/ux-scrims-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-scrims-ui.js'));}
 if(u==='/late-texts.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/late-texts.js'));}
 if(u==='/late-legacy-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/late-legacy-ui.js'));}
 if(u==='/late-manager-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/late-manager-ui.js'));}
 if(u==='/ux-fastsim-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-fastsim-ui.js'));}
 if(u==='/late-host-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/late-host-ui.js'));}
 if(u==='/late-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/late-ui.js'));}
 if(u==='/ux-staff-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-staff-ui.js'));}
 if(u==='/ux-club-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-club-ui.js'));}
 if(u==='/rpc'){let b='';q.on('data',c=>b+=c);q.on('end',()=>{
   const w=(String(q.url).split('w=')[1]||'state').replace(/[^a-z-]/g,''),W=(global.__rpcs=global.__rpcs||{});global.__rpc=W[w]=W[w]||(()=>{const ev=require(R+'app_extracted/engine/events.js');const engine=require(R+'Tiers system/src/engine/btier-state').wrapEngine(require(R+'app_extracted/engine/league.js'),{events:ev,titles:require(R+'app_extracted/engine/titles.js')});const snap=JSON.parse(fs.readFileSync(process.env.TEMP+'/h/'+w+'.json','utf8'));return {engine,snap};})();
   const {engine,snap}=global.__rpc,j=JSON.parse(b);if(j.kind==='__advance'){const rr=()=>0.5;for(let i=0;i<Number(j.ref);i++){const x=engine.advance(snap.career,rr,'day');if(x.stopped==='matchday'){const f=engine.fixtureById(snap.career,x.fixtureId);if(f&&!f.played){engine.simulateFixture(snap.career,f,rr);engine.nextUserSeries(snap.career,rr,f.id)}}}r.setHeader('content-type','application/json');return r.end(JSON.stringify({...snap,ok:true}));}const res=engine.placeBet(snap.career,j.kind,Number(j.ref),Number(j.teamId),Number(j.stake));
   r.setHeader('content-type','application/json');r.end(JSON.stringify(res.ok?{...snap,...res}:res));});return;}
 if(u==='/ux-thread-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-thread-ui.js'));}
 if(u==='/tweet'){let b='';q.on('data',c=>b+=c);q.on('end',()=>{
   global.__pl=global.__pl||(()=>{const M=require('module'),ld=M._load;M._load=function(x){if(x==='./drill-maps')return new Proxy({},{get:()=>()=>[]});return ld.apply(this,arguments)};const ev=require(R+'app_extracted/engine/events.js');const engine=require(R+'Tiers system/src/engine/btier-state').wrapEngine(require(R+'app_extracted/engine/league.js'),{events:ev,brandsFile:R+'app_extracted/data/media-brands.json'});return {engine,snap:JSON.parse(fs.readFileSync(process.env.TEMP+'/h/state-pl.json','utf8'))};})();
   const {engine,snap}=global.__pl,j=JSON.parse(b),st=snap.career,res=engine.postTweet(st,j.text,j.gif);
   snap.social.wall=st.social.posts.slice();snap.social.posts=st.social.posts.slice(0,60);snap.social.minePosts=(st.social.mine||[]).slice(0,80);snap.social.me.followers=st.players.find(p=>p.isUser).followers;
   r.setHeader('content-type','application/json');r.end(JSON.stringify(res.ok?{...snap,...res}:res));});return;}
 if(u==='/ux-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/ux-ui.js'));}
 if(u==='/matches-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/matches-ui.js'));}
 if(u==='/academy-ui.js'){r.setHeader('content-type','text/javascript');return r.end(fs.readFileSync(R+'Tiers system/src/ui/academy-ui.js'));}
 if(u==='/clubs.json'){r.setHeader('content-type','application/json');return r.end(fs.readFileSync(process.env.TEMP+'/h/clubs.json'));}
 if(/^\/state[-a-z]*\.json$/.test(u)){r.setHeader('content-type','application/json');return r.end(fs.readFileSync(process.env.TEMP+'/h'+u));}
 const f=path.join(dir,u);
 if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');return fs.createReadStream(f).pipe(r);}
 r.statusCode=404;r.end('no');
}).listen(process.env.PORT||8765,()=>console.log('up'));
