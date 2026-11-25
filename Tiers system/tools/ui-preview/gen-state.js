const R='D:/Documents D/Career-Mode-Modifier/';
const ev=require(R+'app_extracted/engine/events.js');
const engine=require(R+'Tiers system/src/engine/btier-state').wrapEngine(require(R+'app_extracted/engine/league.js'),{events:ev});
const real=require(R+'app_extracted/data/rlcs-2027.json');
let s=5;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
const probe=engine.generateLeague({teamName:'Team Vitality',real,startDate:engine.careerStartFor(2027),calendar:'rlcs',economy:'real'},()=>0.5);
const bName=probe.teams.find(t=>t.region==='eu_b').name;
const st=engine.generateLeague({teamName:process.argv.includes('b')?bName:'Team Vitality',real,startDate:engine.careerStartFor(2027),calendar:'rlcs',economy:'real'},rand);
for(let i=0;i<4000;i++){const r=engine.advance(st,rand,'next');
 if(r.stopped==='matchday'){const f=engine.fixtureById(st,r.fixtureId);if(!f.played){engine.simulateFixture(st,f,rand);engine.nextUserSeries(st,rand,f.id)}}
 if(r.stopped==='season-end')break;
 if(process.argv.includes('gap')){const op=st.events.find(e=>e.kind==='open'&&e.stage==='done'&&!e._seen);const cup=st.tierB.cups.find(c=>c.region==='eu_b'&&(c.stage==='groups'||c.stage==='playoffs'));if(op&&cup&&st.events.filter(e=>e.kind==='open'&&e.stage==='done').some(o=>o.index===cup.index))break;}
 else if((st.tierB.history||[]).length>=21 && !process.argv.includes('end'))break;}
const snap={career:st,appearance:{},version:'x',frameless:false,difficulties:engine.DIFFICULTIES,seriesLengths:engine.SERIES_LENGTHS,table:engine.computeTable(st),board:engine.boardSummary(st),starters:engine.userLineup(st),logoLums:{},eventSchedules:{},groupTables:engine.groupTables(st),flags:{},regionName:'Europe',eventField:16,majorSlots:{},wages:{},nations:{},homes:{},ratingExact:{}};
// social tab (what the app's main process builds): wall, clubs, people, creators, follows
if(st.social&&!snap.social){const H=(n)=>engine.handleFor(n);snap.social={wall:st.social.posts.slice(),posts:st.social.posts.slice(0,60),prompt:null,follows:[],likes:[],mentions:[],unseenFollows:[],minePosts:[],me:null,profile:{},
 creators:engine.creatorList().map(c=>({...c,signed:null,following:0})),
 people:st.players.filter(p=>p.teamId>=0&&!p.retired).map(p=>({id:p.id,name:p.name,handle:H(p.name),followers:p.followers||0,verified:(p.followers||0)>=50000,isUser:!!p.isUser,clubId:p.teamId,club:engine.teamById(st,p.teamId).name,bio:'',joined:null,following:0,posts:0})),
 clubs:st.teams.map(t=>({id:t.id,name:t.name,handle:H(t.name),followers:t.followers||50000,logo:t.logo||null,colors:t.colors||null,region:t.region||null,mine:t.id===st.userTeamId})),topTeams:[],allFollowed:[]};}
require('fs').writeFileSync(process.env.TEMP+'/h/state'+(process.argv.includes('b')?'-b':'')+(process.argv.includes('end')?'-end':'')+(process.argv.includes('gap')?'-gap':'')+'.json',JSON.stringify(snap));
console.log(st.currentDate, (st.tierB.history||[]).length, st.tierB.promo&&st.tierB.promo.stage);
