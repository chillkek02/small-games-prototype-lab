import { getHumanFunGate } from './human-fun.js';
import { getAssetAutopilotStatus } from './asset-autopilot.js';
import { getLatestQualityRun } from './quality-jobs.js';
import { getTestFunnel } from './test-funnel.js';

export const PROJECT_DASHBOARD_VERSION='1.0.0';

function doctorPass(run){const a=run?.result;if(!a)return false;const adPass=a.adReadiness?.applicable===false||a.adPassed;return Boolean(a.qa?.passed&&a.visualFloorPassed&&a.retentionPassed&&adPass&&Number(a.visualScore||0)>=85&&Number(a.performanceScore||0)>=75&&Number(a.pokiScore||0)>=75)}
function terminal(status){return['passed','needs-review','failed'].includes(status)}
function jobSummary(job){if(!job)return null;return{id:job.id,status:job.status,stage:job.stage||job.status,kind:job.kind||'edit',createdAt:job.createdAt||null,startedAt:job.startedAt||null,finishedAt:job.finishedAt||null,qaPassed:Boolean(job.qa?.passed),bestScore:job.studioLoopResult?.bestScore??null,iterations:job.studioLoopResult?.iterations??0,error:job.error||null}}
function doctorSummary(run){if(!run)return null;return{id:run.id,status:run.status,percent:Number(run.percent||0),stage:run.stage||run.status,detail:run.detail||'',finishedAt:run.finishedAt||null,overallScore:run.result?.overallScore??null,visualScore:run.result?.visualScore??null,performanceScore:run.result?.performanceScore??null,pokiScore:run.result?.pokiScore??null,passed:doctorPass(run)}}
function stageInfo({game,job,fun,autopilot,doctor,funnel}){
  const isPrototype=Boolean(game.metadata?.productionStage==='gameplay-prototype'||game.metadata?.prototypeMode),runningJob=job&&['queued','running'].includes(job.status),tests=funnel?.tests||[],decision=funnel?.decision||null;
  if(runningJob)return{key:isPrototype&&job.kind==='prototype'?'prototype-building':'working',group:'active',title:isPrototype&&job.kind==='prototype'?'Building gameplay prototype':'Factory working',description:job.stage||'The Factory is working on this game.',primary:{key:'watch',label:'Watch Progress'}};
  if(autopilot?.phase==='running')return{key:'assets-running',group:'active',title:'Building production assets',description:'Asset Autopilot is reusing, generating and integrating the visual production pass.',primary:{key:'watch-assets',label:'Watch Assets'}};
  if(doctor?.status==='running')return{key:'doctor-running',group:'active',title:'Game Doctor running',description:doctor.detail||'Quality audit is in progress.',primary:{key:'doctor',label:'Watch Doctor'}};
  if(isPrototype){
    if(fun?.verdict==='park')return{key:'parked',group:'parked',title:'Parked',description:'You decided the core loop is not worth more production time.',primary:{key:'resume',label:'Resume Prototype'}};
    if(fun?.verdict==='pivot')return{key:'pivot',group:'needs-you',title:'Gameplay pivot requested',description:'Keep it ugly. Change the core loop, then play it again.',primary:{key:'pivot',label:'Describe Gameplay Pivot'}};
    if(fun?.verdict!=='fun')return{key:'human-fun',group:'needs-you',title:'Human Fun Gate',description:'The prototype is ready. Play it now and decide whether the loop deserves production.',primary:{key:'play',label:'Play Prototype'}};
    if(autopilot?.phase!=='completed')return{key:'assets',group:'production',title:'Promoted · Build the art',description:'You approved the loop. Now let Asset Autopilot turn the proven prototype into a production-looking game.',primary:{key:'assets',label:'Build Assets'}};
  }
  if(!doctor||doctor.status==='failed'||doctor.status==='interrupted')return{key:'doctor',group:'production',title:'Run quality audit',description:'The game has its production pass. Measure gameplay, visuals, retention, performance and Poki readiness.',primary:{key:'doctor',label:'Run Game Doctor'}};
  if(doctor.status==='completed'&&!doctor.passed)return{key:'polish',group:'production',title:'Targeted polish needed',description:`Doctor ${doctor.overallScore??'—'}/100. Fix the measured weak points instead of blindly polishing everything.`,primary:{key:'polish',label:'Review & Fix'}};
  if(!tests.length)return{key:'poki-test',group:'testing',title:'Ready for real-player test',description:'Internal quality is green enough. Real-player evidence is the next authority.',primary:{key:'test',label:'Open Poki Test'}};
  return{key:'decision',group:'decision',title:'Decision time',description:decision?.next||'Use the real-player result to promote, iterate or park this game.',primary:{key:'decision',label:'Review Decision'}};
}

export async function buildProjectDashboard({stateDir,store,games}){
  const jobs=await store.list(300),latestByGame=new Map();for(const job of jobs)if(!latestByGame.has(job.game))latestByGame.set(job.game,job);
  const projects=await Promise.all(games.map(async game=>{
    const[fun,autopilot,doctor,funnel]=await Promise.all([
      getHumanFunGate({stateDir,game:game.id,title:game.title}).catch(()=>({verdict:'pending',productionUnlocked:false})),
      getAssetAutopilotStatus({gameDir:game.gameDir}).catch(()=>({phase:'idle'})),
      getLatestQualityRun({stateDir,game:game.id}).catch(()=>null),
      getTestFunnel({stateDir,game:game.id,title:game.title,concept:game.metadata?.concept||''}).catch(()=>({tests:[],decision:null}))
    ]),latestJob=latestByGame.get(game.id)||null,stage=stageInfo({game,job:latestJob,fun,autopilot,doctor:doctorSummary(doctor),funnel});
    return{id:game.id,title:game.title,url:game.url,metadata:game.metadata||null,stage,job:jobSummary(latestJob),humanFun:fun,autopilot:{phase:autopilot?.phase||'idle',jobId:autopilot?.jobId||null,lastHarvest:autopilot?.lastHarvest||null},doctor:doctorSummary(doctor),testsCount:(funnel?.tests||[]).length,decision:funnel?.decision||null};
  }));
  const counts=projects.reduce((acc,p)=>{acc.total++;acc[p.stage.group]=(acc[p.stage.group]||0)+1;return acc},{total:0,'needs-you':0,active:0,production:0,testing:0,decision:0,parked:0});
  return{version:PROJECT_DASHBOARD_VERSION,generatedAt:new Date().toISOString(),counts,projects};
}
