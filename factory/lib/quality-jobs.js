import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runQualityAudit } from './quality.js';

export const QUALITY_JOB_VERSION='1.0.1';
const activeRuns=new Map();

function safe(value){return typeof value==='string'&&/^[a-zA-Z0-9._-]+$/.test(value)&&!value.includes('..')}
function rootFor(stateDir){return path.join(stateDir,'quality-jobs')}
function fileFor(stateDir,id){return path.join(rootFor(stateDir),`${id}.json`)}
async function ensure(stateDir){await fsp.mkdir(rootFor(stateDir),{recursive:true})}
async function readJson(file,fallback=null){try{return JSON.parse(await fsp.readFile(file,'utf8'))}catch{return fallback}}
async function writeRun(stateDir,run){await ensure(stateDir);const temp=fileFor(stateDir,run.id)+'.tmp';await fsp.writeFile(temp,JSON.stringify(run,null,2),'utf8');await fsp.rename(temp,fileFor(stateDir,run.id));return run}
async function patchRun(stateDir,id,patch){const current=await readJson(fileFor(stateDir,id),null);if(!current)return null;const next={...current,...patch,updatedAt:new Date().toISOString()};await writeRun(stateDir,next);return next}
async function listRuns(stateDir){await ensure(stateDir);const entries=await fsp.readdir(rootFor(stateDir),{withFileTypes:true}).catch(()=>[]),runs=[];for(const e of entries){if(!e.isFile()||!e.name.endsWith('.json'))continue;const run=await readJson(path.join(rootFor(stateDir),e.name),null);if(run)runs.push(run)}return runs.sort((a,b)=>Date.parse(b.startedAt||b.createdAt||0)-Date.parse(a.startedAt||a.createdAt||0))}
async function getRun(stateDir,id){const run=await readJson(fileFor(stateDir,id),null);if(!run)return null;if(run.status==='running'&&!activeRuns.has(id)){const interrupted={...run,status:'interrupted',stage:'Interrupted by Factory restart',detail:'Run Game Doctor again to restart this audit.',finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await writeRun(stateDir,interrupted);return interrupted}return run}
async function gameBusy(store,game){const jobs=await store.list(80);return jobs.some(job=>job.game===game&&(job.status==='queued'||job.status==='running'))||[...activeRuns.values()].some(x=>x.game===game)}

export async function handleQualityJobsApi({req,res,url,stateDir,gameInfo,sendJson,store}){
  const latest=url.pathname.match(/^\/api\/games\/([^/]+)\/doctor\/latest$/);
  if(req.method==='GET'&&latest){const game=decodeURIComponent(latest[1]);if(!safe(game))return sendJson(res,400,{error:'Invalid game id'});const runs=(await listRuns(stateDir)).filter(x=>x.game===game);const run=runs[0]?await getRun(stateDir,runs[0].id):null;return sendJson(res,200,{run})}

  const status=url.pathname.match(/^\/api\/games\/([^/]+)\/doctor\/([^/]+)$/);
  if(req.method==='GET'&&status){const game=decodeURIComponent(status[1]),id=decodeURIComponent(status[2]);if(!safe(game)||!safe(id))return sendJson(res,400,{error:'Invalid Game Doctor run'});const run=await getRun(stateDir,id);if(!run||run.game!==game)return sendJson(res,404,{error:'Game Doctor run not found'});return sendJson(res,200,{run})}

  const start=url.pathname.match(/^\/api\/games\/([^/]+)\/doctor$/);
  if(req.method==='POST'&&start){
    const game=decodeURIComponent(start[1]);if(!safe(game))return sendJson(res,400,{error:'Invalid game id'});if(await gameBusy(store,game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before running Game Doctor.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});
    const id=`doctor-${Date.now()}-${randomUUID().slice(0,8)}`,run={version:QUALITY_JOB_VERSION,id,game,status:'running',percent:1,stage:'Starting Game Doctor',detail:'Preparing the quality pipeline…',createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:null,error:null};await writeRun(stateDir,run);
    const origin=`http://${req.headers.host||'127.0.0.1:4177'}`;
    const worker={game,promise:null};worker.promise=new Promise(resolve=>setImmediate(resolve)).then(async()=>{
      try{const result=await runQualityAudit({game,gameDir:info.gameDir,url:`${origin}/game/${encodeURIComponent(game)}/`,stateDir,onProgress:async update=>{await patchRun(stateDir,id,{percent:update.percent,stage:update.stage,detail:update.detail})}});await patchRun(stateDir,id,{status:'completed',percent:100,stage:'Game Doctor complete',detail:`Overall ${result.overallScore}/100 · visual ${result.visualScore}/100`,finishedAt:new Date().toISOString(),result})}catch(error){await patchRun(stateDir,id,{status:'failed',stage:'Game Doctor failed',detail:error.message,error:error.message,finishedAt:new Date().toISOString()})}finally{activeRuns.delete(id)}});
    activeRuns.set(id,worker);return sendJson(res,202,{run});
  }
  return false;
}
