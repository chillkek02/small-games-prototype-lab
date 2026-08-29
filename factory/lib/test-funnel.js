import fsp from 'node:fs/promises';
import path from 'node:path';

export const TEST_FUNNEL_VERSION='1.0.0';
const SIM_PATTERN=/sim|tycoon|shop|store|restaurant|clean|job|life|management|factory|idle/i;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));

function fileFor(stateDir,game){return path.join(stateDir,'test-funnel',`${game}.json`)}
async function readJson(file,fallback){try{return JSON.parse(await fsp.readFile(file,'utf8'))}catch{return fallback}}

export async function getTestFunnel({stateDir,game,title='',concept=''}){
  const file=fileFor(stateDir,game);
  const data=await readJson(file,{version:TEST_FUNNEL_VERSION,game,title,concept,createdAt:new Date().toISOString(),tests:[]});
  data.decision=evaluateTestFunnel(data);
  return data;
}

export async function addTestResult({stateDir,game,title='',concept='',result={}}){
  const data=await getTestFunnel({stateDir,game,title,concept});
  const stage=['recordings','player-fit','web-fit'].includes(result.stage)?result.stage:'recordings';
  const entry={
    id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    stage,
    versionLabel:String(result.versionLabel||'current').slice(0,80),
    createdAt:new Date().toISOString(),
    recordingsWatched:stage==='recordings'?clamp(result.recordingsWatched||0,0,100):null,
    averageMinutes:result.averageMinutes==null?null:clamp(result.averageMinutes,0,120),
    over3MinutesPercent:result.over3MinutesPercent==null?null:clamp(result.over3MinutesPercent,0,100),
    conversionToPlayPercent:result.conversionToPlayPercent==null?null:clamp(result.conversionToPlayPercent,0,100),
    ctrScore:result.ctrScore==null?null:clamp(result.ctrScore,0,5),
    timeOnPageScore:result.timeOnPageScore==null?null:clamp(result.timeOnPageScore,0,5),
    c2pScore:result.c2pScore==null?null:clamp(result.c2pScore,0,5),
    notes:String(result.notes||'').slice(0,3000)
  };
  data.title=data.title||title;data.concept=data.concept||concept;data.tests.push(entry);data.updatedAt=new Date().toISOString();
  data.decision=evaluateTestFunnel(data);
  const file=fileFor(stateDir,game);await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,JSON.stringify(data,null,2),'utf8');
  return data;
}

export function evaluateTestFunnel(data={}){
  const tests=Array.isArray(data.tests)?data.tests:[];
  const simulation=SIM_PATTERN.test(`${data.title||''} ${data.concept||''}`);
  const strongMinutes=simulation?10:5;
  const playerFits=tests.filter(x=>x.stage==='player-fit');
  const webFits=tests.filter(x=>x.stage==='web-fit');
  const recordings=tests.filter(x=>x.stage==='recordings');
  const latestPF=playerFits.at(-1)||null,latestWF=webFits.at(-1)||null;
  const pfAdvance=Boolean(latestPF&&Number(latestPF.averageMinutes)>=3&&Number(latestPF.over3MinutesPercent)>=25);
  const strongPlaytime=Boolean((latestWF||latestPF)&&Number((latestWF||latestPF).averageMinutes)>=strongMinutes);
  const c2pStrong=Boolean(latestWF&&Number(latestWF.conversionToPlayPercent)>=65);
  const repeatedPFFails=playerFits.filter(x=>!(Number(x.averageMinutes)>=3&&Number(x.over3MinutesPercent)>=25)).length;
  let status='NEEDS_REAL_PLAYERS',reason='Run at least 10 Poki playtest recordings before making a market decision.',next='Upload the polished prototype, watch 10 recordings, and record the baseline here.';
  if(recordings.length){status='READY_FOR_PLAYER_FIT';reason='Qualitative recordings exist; the next reliable scale signal is the 500-player Player Fit test.';next='Run a Player Fit test and enter average playtime plus % of plays over 3 minutes.'}
  if(latestPF&&!pfAdvance){status=repeatedPFFails>=2?'PARK_OR_REMAKE':'ITERATE';reason=`Player Fit is below Poki advancement baseline (${latestPF.averageMinutes??'—'} min average; ${latestPF.over3MinutesPercent??'—'}% over 3 min).`;next=repeatedPFFails>=2?'Park/remake unless recordings show one clear, fixable onboarding/control/bug issue. Do not keep polishing indefinitely.':'Use recordings/Game Events to identify the largest drop-off cause, make one focused change, then retest.'}
  if(pfAdvance){status='READY_FOR_WEB_FIT';reason='Player Fit cleared the current Poki advancement baseline.';next=`Push toward ${strongMinutes}+ minute average playtime, then run Web Fit for CTR, time-on-page and C2P.`}
  if(latestWF&&!c2pStrong){status='ITERATE_WEB_FIT';reason=`Web Fit C2P is ${latestWF.conversionToPlayPercent??'—'}%, below the 65% target. This usually points to loading/onboarding/device friction.`;next='Prioritize startup size, time-to-first-input, mobile performance and onboarding; then repeat Web Fit.'}
  if(latestWF&&c2pStrong&&!strongPlaytime){status='ITERATE_ENGAGEMENT';reason=`C2P is healthy, but average playtime is below the ${strongMinutes}+ minute strong target for this game type.`;next='Improve the core loop, progression order, replay hooks and early content using Game Events/drop-off data.'}
  if(latestWF&&c2pStrong&&strongPlaytime){status='PROMOTE';reason=`Real-player signals are strong: ${latestWF.averageMinutes} min average playtime and ${latestWF.conversionToPlayPercent}% C2P.`;next='Prioritize this game for deeper content/polish, thumbnail optimization and Poki final-review preparation.'}
  return{status,reason,next,simulationLike:simulation,strongPlaytimeTargetMinutes:strongMinutes,pokiPublished:{playerFitAdvance:{averageMinutes:3,over3MinutesPercent:25},webFitC2PTargetPercent:65},note:'CTR is category-relative; Factory does not invent a universal CTR cutoff.'};
}
