// State snapshots for the Swiss stage: node gen-swiss.js  -> $TEMP/h/state-gap.json (open ?gap: during the Swiss) and state-end.json (?end: Open drawn after it)
const R='D:/Documents D/Career-Mode-Modifier/';
const ev=require(R+'app_extracted/engine/events.js');
const engine=require(R+'Tiers system/src/engine/btier-state').wrapEngine(require(R+'app_extracted/engine/league.js'),{events:ev});
const real=require(R+'app_extracted/data/rlcs-2027.json');
const fs=require('fs');
function run(stopWhen,file){
  let s=5;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
  const st=engine.generateLeague({teamName:'Team Vitality',real,startDate:engine.careerStartFor(2027),calendar:'rlcs',economy:'real'},rand);
  for(let i=0;i<4000;i++){const r=engine.advance(st,rand,'next');
    if(stopWhen(st,r))break;
    if(r.stopped==='matchday'){const f=engine.fixtureById(st,r.fixtureId);if(!f.played){engine.simulateFixture(st,f,rand);engine.nextUserSeries(st,rand,f.id)}}}
  const snap={career:st,appearance:{},version:'x',frameless:false,difficulties:engine.DIFFICULTIES,seriesLengths:engine.SERIES_LENGTHS,table:engine.computeTable(st),board:engine.boardSummary(st),starters:engine.userLineup?engine.userLineup(st):[]};
  fs.writeFileSync(process.env.TEMP+'/h/'+file,JSON.stringify(snap));
  console.log(file,st.currentDate,st.events[0].stage);
}
run((st,r)=>st.currentDate>='2026-11-12'&&r.stopped==='matchday','state-gap.json');
run((st)=>st.events[0].stage==='groups','state-end.json');
