import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore } from './lib/store.js';
import { probeCodex, runJob } from './lib/runner.js';
import { getOpportunityReport, getCreatorOptions } from './lib/opportunity.js';
import { createGameProject } from './lib/new-game.js';
import { runQualityAudit } from './lib/quality.js';
import { createSnapshot, listSnapshots, restoreSnapshot } from './lib/snapshots.js';
import { trashGame, listTrash } from './lib/game-trash.js';
import { normalizeStudioLoop, DEFAULT_STUDIO_LOOP, STUDIO_LOOP_VERSION } from './lib/studio-loop.js';
import { getTestFunnel, addTestResult, TEST_FUNNEL_VERSION } from './lib/test-funnel.js';
import { listImportedAssets, importAsset, ASSET_IMPORT_VERSION, MAX_IMPORT_BYTES } from './lib/asset-import.js';
import { handleStudioApi } from './lib/studio-api.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT=path.resolve(process.env.GAME_FACTORY_REPO_ROOT||path.resolve(__dirname,'..'));
const PUBLIC_DIR=path.join(__dirname,'public');
const GAMES_DIR=path.join(REPO_ROOT,'games');
const STATE_DIR=path.resolve(process.env.GAME_FACTORY_STATE_DIR||path.join(__dirname,'.state'));
const PORT=Number(process.env.GAME_FACTORY_PORT||4177);
const HOST=process.env.GAME_FACTORY_HOST||'127.0.0.1';
const store=new JobStore(STATE_DIR);
const activeByGame=new Map();
const qualityBusy=new Set();
const restoreBusy=new Set();
let creatingGame=false;

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.wasm':'application/wasm'};
function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});res.end(body)}
function safeSegment(value){return typeof value==='string'&&/^[a-zA-Z0-9._-]+$/.test(value)&&!value.includes('..')}
function safeJoin(base,relative){const target=path.resolve(base,relative),rel=path.relative(base,target);return rel.startsWith('..')||path.isAbsolute(rel)?null:target}
function gameDirFor(game){return path.join(GAMES_DIR,game)}
async function validateGameDir(gameDir){return Boolean((await fsp.stat(path.join(gameDir,'index.html')).catch(()=>null))?.isFile())}
async function readBody(req,maxChars=300000){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>maxChars)throw new Error('Request body too large')}return raw?JSON.parse(raw):{}}
async function gameInfo(game){const gameDir=gameDirFor(game);if(!await validateGameDir(gameDir))return null;let title=game,metadata=null;try{const html=await fsp.readFile(path.join(gameDir,'index.html'),'utf8');title=html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()||game}catch{}try{metadata=JSON.parse(await fsp.readFile(path.join(gameDir,'factory-game.json'),'utf8'))}catch{}return{gameDir,title,metadata}}
async function listGames(){const entries=await fsp.readdir(GAMES_DIR,{withFileTypes:true}),games=[];for(const entry of entries){if(!entry.isDirectory())continue;const info=await gameInfo(entry.name);if(info)games.push({id:entry.name,title:info.title,url:`/game/${encodeURIComponent(entry.name)}/`,metadata:info.metadata})}return games.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))}
async function serveFile(res,filePath,{noCache=false}={}){try{const stat=await fsp.stat(filePath);if(!stat.isFile())return false;res.writeHead(200,{'content-type':MIME[path.extname(filePath).toLowerCase()]||'application/octet-stream','content-length':stat.size,'cache-control':noCache?'no-store':'public, max-age=60','x-content-type-options':'nosniff'});fs.createReadStream(filePath).pipe(res);return true}catch{return false}}
async function markDispatchFailure(jobId,error){try{await store.appendLog(jobId,`DISPATCH ERROR: ${error.message}`);await store.patch(jobId,{status:'failed',stage:'Dispatch failed',finishedAt:new Date().toISOString(),error:error.message})}catch(storeError){console.error('Failed to record dispatch error',storeError)}}
async function recoverInterruptedJobs(){const jobs=await store.list(100),interrupted=jobs.filter(j=>j.status==='queued'||j.status==='running');for(const job of interrupted){await store.appendLog(job.id,'Factory restarted before this job reached a terminal state.');await store.patch(job.id,{status:'failed',stage:'Interrupted by restart',finishedAt:new Date().toISOString(),error:'Factory restarted while this job was active. Start a new run to retry it.'})}}
function dispatchWorker({job,game,gameDir}){const gameRelativePath=path.relative(REPO_ROOT,gameDir),gameUrl=`http://${HOST}:${PORT}/game/${encodeURIComponent(game)}/`;const worker=new Promise(resolve=>setImmediate(resolve)).then(()=>runJob({job,store,repoRoot:REPO_ROOT,gameDir,gameRelativePath,gameUrl})).catch(async error=>{console.error(`Factory worker failed for ${game}`,error);await markDispatchFailure(job.id,error)}).finally(()=>activeByGame.delete(game));activeByGame.set(game,{jobId:job.id,worker})}
function gameIsBusy(game){return activeByGame.has(game)||qualityBusy.has(game)||restoreBusy.has(game)}
async function snapshotBeforeBuild(args){return createSnapshot({stateDir:STATE_DIR,...args})}

async function handleApi(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/status'){
    const[codex,jobs]=await Promise.all([probeCodex(REPO_ROOT),store.list(5)]);
    return sendJson(res,200,{name:'Gutpopper Game Factory',version:'0.26.0',repoRoot:REPO_ROOT,codex,engines:{phaser3:'3.90.0',phaser4:'4.2.1',three:'0.185.1'},qualityLab:{visualDirector:true,studioVisualDirector:true,houseStyle:'Gutpopper Bright Toy Casual v1',uiMenuForge:true,assetForge:true,shaderVfxForge:true,modelForge:true,vectorTo3d:true,characterRigForge:true,characterAnimation:true,gameFeelForge:true,imageVectorImportLab:true,assetSheetCutter:true,assetCatalog:true,planMode:true,referenceRouting:true,promptQueue:true,hookLab:true,thumbnailLab:true,portfolioBoard:true,optimizationAudit:true,godotFoundation:true,discoveryEngine:true,trendRadar:true,themeRadar:true,pokiGameEvents:true,visualMinimum:78,visualCommercialTarget:85,aiPlaytester:true,retentionReplay:true,adReadiness:true,performanceGate:true,pokiReadiness:true,desktopViewport:'1440x900',phoneViewport:'390x844'},assetImport:{version:ASSET_IMPORT_VERSION,maxBytes:MAX_IMPORT_BYTES,types:['PNG','WebP','JPEG','SVG']},studioLoop:{version:STUDIO_LOOP_VERSION,defaultNewGames:true,defaultExistingEdits:false,...DEFAULT_STUDIO_LOOP},testFunnel:{version:TEST_FUNNEL_VERSION,realPlayerAuthority:true},snapshots:{automatic:true,maxPerGame:12,undo:true},gameTrash:{safeDelete:true,recoverable:true},activeGames:[...activeByGame.keys()],recentJobs:jobs.length});
  }
  const studioHandled=await handleStudioApi({req,res,url,stateDir:STATE_DIR,store,gameInfo,listGames,readBody,sendJson});if(studioHandled!==false)return studioHandled;
  if(req.method==='GET'&&url.pathname==='/api/games')return sendJson(res,200,{games:await listGames()});
  if(req.method==='GET'&&url.pathname==='/api/trash')return sendJson(res,200,{trash:await listTrash({stateDir:STATE_DIR})});
  if(req.method==='GET'&&url.pathname==='/api/creator-options')return sendJson(res,200,getCreatorOptions());
  if(req.method==='GET'&&url.pathname==='/api/opportunities'){try{return sendJson(res,200,await getOpportunityReport())}catch(error){return sendJson(res,500,{error:`Opportunity Scout failed: ${error.message}`})}}

  const assetImportMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/assets\/import$/);
  if(req.method==='POST'&&assetImportMatch){const game=decodeURIComponent(assetImportMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before importing an asset.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});try{const payload=await readBody(req,7_500_000);return sendJson(res,201,await importAsset({gameDir:info.gameDir,payload}))}catch(error){return sendJson(res,400,{error:`Asset import failed: ${error.message}`})}}
  const assetsMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/assets$/);
  if(req.method==='GET'&&assetsMatch){const game=decodeURIComponent(assetsMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});return sendJson(res,200,await listImportedAssets({gameDir:info.gameDir}))}

  const funnelMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/test-funnel$/);
  if(funnelMatch){const game=decodeURIComponent(funnelMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});const args={stateDir:STATE_DIR,game,title:info.title,concept:info.metadata?.concept||''};if(req.method==='GET')return sendJson(res,200,await getTestFunnel(args));if(req.method==='POST'){try{return sendJson(res,201,await addTestResult({...args,result:await readBody(req)}))}catch(error){return sendJson(res,400,{error:`Could not save Poki test result: ${error.message}`})}}}

  const deleteGameMatch=url.pathname.match(/^\/api\/games\/([^/]+)$/);
  if(req.method==='DELETE'&&deleteGameMatch){const game=decodeURIComponent(deleteGameMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before deleting this game.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});try{const trashed=await trashGame({stateDir:STATE_DIR,game,gameDir:info.gameDir,title:info.title});return sendJson(res,200,{deleted:true,game,title:info.title,trash:{trashId:trashed.trashId,deletedAt:trashed.deletedAt,recoverable:true}})}catch(error){return sendJson(res,500,{error:`Could not move game to Factory Trash: ${error.message}`})}}

  const snapshotMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/snapshots$/);
  if(snapshotMatch){const game=decodeURIComponent(snapshotMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});if(req.method==='GET')return sendJson(res,200,{snapshots:await listSnapshots({stateDir:STATE_DIR,game})});if(req.method==='POST'){if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before saving a restore point.'});try{const body=await readBody(req);return sendJson(res,201,{snapshot:await createSnapshot({stateDir:STATE_DIR,game,gameDir:info.gameDir,label:String(body.label||'Manual restore point').slice(0,120),kind:'manual'})})}catch(error){return sendJson(res,500,{error:`Could not create restore point: ${error.message}`})}}}

  const undoMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/undo$/);
  if(req.method==='POST'&&undoMatch){const game=decodeURIComponent(undoMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before restoring.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});restoreBusy.add(game);try{const target=(await listSnapshots({stateDir:STATE_DIR,game}))[0];if(!target)return sendJson(res,404,{error:'No restore point exists for this game yet.'});const safety=await createSnapshot({stateDir:STATE_DIR,game,gameDir:info.gameDir,label:`Before restoring ${target.label||target.id}`,kind:'pre-restore'}),restored=await restoreSnapshot({stateDir:STATE_DIR,game,gameDir:info.gameDir,snapshotId:target.id});return sendJson(res,200,{restored,safetySnapshot:safety,snapshots:await listSnapshots({stateDir:STATE_DIR,game})})}catch(error){return sendJson(res,500,{error:`Restore failed: ${error.message}`})}finally{restoreBusy.delete(game)}}

  const restoreMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/restore\/([^/]+)$/);
  if(req.method==='POST'&&restoreMatch){const game=decodeURIComponent(restoreMatch[1]),snapshotId=decodeURIComponent(restoreMatch[2]);if(!safeSegment(game)||!safeSegment(snapshotId))return sendJson(res,400,{error:'Invalid restore request'});if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before restoring.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});restoreBusy.add(game);try{const safety=await createSnapshot({stateDir:STATE_DIR,game,gameDir:info.gameDir,label:'Before manual restore',kind:'pre-restore'}),restored=await restoreSnapshot({stateDir:STATE_DIR,game,gameDir:info.gameDir,snapshotId});return sendJson(res,200,{restored,safetySnapshot:safety})}catch(error){return sendJson(res,500,{error:`Restore failed: ${error.message}`})}finally{restoreBusy.delete(game)}}

  const doctorMatch=url.pathname.match(/^\/api\/games\/([^/]+)\/doctor$/);
  if(req.method==='POST'&&doctorMatch){const game=decodeURIComponent(doctorMatch[1]);if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});if(gameIsBusy(game))return sendJson(res,409,{error:'Wait for the active Factory operation to finish before running Game Doctor.'});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});qualityBusy.add(game);try{return sendJson(res,200,await runQualityAudit({game,gameDir:info.gameDir,url:`http://${HOST}:${PORT}/game/${encodeURIComponent(game)}/`,stateDir:STATE_DIR}))}catch(error){return sendJson(res,500,{error:`Game Doctor failed: ${error.message}`})}finally{qualityBusy.delete(game)}}

  if(req.method==='GET'&&url.pathname==='/api/jobs')return sendJson(res,200,{jobs:await store.list(40)});
  const jobMatch=url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if(req.method==='GET'&&jobMatch&&safeSegment(jobMatch[1])){const job=await store.get(jobMatch[1]);return job?sendJson(res,200,job):sendJson(res,404,{error:'Job not found'})}

  if(req.method==='POST'&&url.pathname==='/api/new-games'){
    if(creatingGame)return sendJson(res,409,{error:'The Factory is already creating a new game. Wait for the scaffold to finish.'});let body;try{body=await readBody(req)}catch(error){return sendJson(res,400,{error:error.message})}creatingGame=true;
    try{const project=await createGameProject({gamesDir:GAMES_DIR,factoryDir:__dirname,title:body.title,concept:body.concept,engine:body.engine||'auto',artStyle:body.artStyle||'auto',opportunity:body.opportunity||'',target:body.target||'Poki'});const created=await store.create({game:project.id,instruction:project.instruction});const baseline=await snapshotBeforeBuild({game:project.id,gameDir:project.gameDir,label:'Discovery + Production Library baseline before first AI build',kind:'new-game-baseline',jobId:created.id});const studioLoop=normalizeStudioLoop(body.studioLoop||{},{defaultEnabled:true});const job=await store.patch(created.id,{status:'running',stage:'New game build',attempt:1,kind:'new-game',creator:project.metadata,studioLoop,snapshotId:baseline.id,error:null});await store.appendLog(job.id,`Discovery Engine scaffolded ${project.id} · ${project.engine} · ${project.artStyle} · full reusable Production Library`);await store.appendLog(job.id,`Studio Loop ${studioLoop.enabled?'ON':'OFF'} · up to ${studioLoop.maxIterations} deep rounds · visual target ${studioLoop.visualTarget}`);await store.appendLog(job.id,`Safety snapshot saved · ${baseline.id}`);dispatchWorker({job,game:project.id,gameDir:project.gameDir});return sendJson(res,202,{game:{id:project.id,title:project.title,url:`/game/${encodeURIComponent(project.id)}/`,metadata:project.metadata},job:await store.get(job.id),prototypePlan:project.prototypePlan})}catch(error){return sendJson(res,400,{error:error.message})}finally{creatingGame=false}
  }

  if(req.method==='POST'&&url.pathname==='/api/jobs'){
    let body;try{body=await readBody(req)}catch(error){return sendJson(res,400,{error:error.message})}const game=String(body.game||''),instruction=String(body.instruction||'').trim();if(!safeSegment(game))return sendJson(res,400,{error:'Invalid game id'});if(instruction.length<4)return sendJson(res,400,{error:'Describe the change you want the Factory to make.'});if(gameIsBusy(game))return sendJson(res,409,{error:`${game} already has an active Factory operation.`});const info=await gameInfo(game);if(!info)return sendJson(res,404,{error:'Game target not found'});const created=await store.create({game,instruction});let safety;try{safety=await snapshotBeforeBuild({game,gameDir:info.gameDir,label:`Before: ${instruction.replace(/\s+/g,' ').slice(0,90)}`,kind:'pre-build',jobId:created.id})}catch(error){await store.patch(created.id,{status:'failed',stage:'Snapshot failed',finishedAt:new Date().toISOString(),error:error.message});return sendJson(res,500,{error:`Factory refused to edit without a safety snapshot: ${error.message}`})}const studioLoop=normalizeStudioLoop(body.studioLoop||{},{defaultEnabled:false});const job=await store.patch(created.id,{status:'running',stage:'Dispatching Factory',attempt:1,studioLoop,snapshotId:safety.id,error:null});await store.appendLog(job.id,`Safety snapshot saved · ${safety.id}`);await store.appendLog(job.id,`Studio Loop ${studioLoop.enabled?'ON':'OFF'}${studioLoop.enabled?` · ${studioLoop.maxIterations} rounds`:''}`);dispatchWorker({job,game,gameDir:info.gameDir});return sendJson(res,202,await store.get(job.id));
  }
  return false;
}

async function handler(req,res){
  const url=new URL(req.url,`http://${req.headers.host||`${HOST}:${PORT}`}`);
  if(url.pathname.startsWith('/api/')){const handled=await handleApi(req,res,url);if(handled!==false)return}
  const quality=url.pathname.match(/^\/quality-artifacts\/([^/]+)\/([^/]+)$/);if(quality&&safeSegment(quality[1])&&safeSegment(quality[2])){const file=safeJoin(path.join(STATE_DIR,'quality',quality[1]),quality[2]);if(file&&await serveFile(res,file,{noCache:true}))return;res.writeHead(404);res.end('Not found');return}
  const artifact=url.pathname.match(/^\/artifacts\/([^/]+)\/([^/]+)$/);if(artifact&&safeSegment(artifact[1])&&safeSegment(artifact[2])){const file=safeJoin(store.jobDir(artifact[1]),artifact[2]);if(file&&await serveFile(res,file,{noCache:true}))return;res.writeHead(404);res.end('Not found');return}
  const gameMatch=url.pathname.match(/^\/game\/([^/]+)(\/.*)?$/);if(gameMatch){const game=decodeURIComponent(gameMatch[1]);if(!safeSegment(game)){res.writeHead(400);res.end('Bad game path');return}const relative=decodeURIComponent(gameMatch[2]||'/').replace(/^\/+/, '')||'index.html',file=safeJoin(path.join(GAMES_DIR,game),relative);if(file&&await serveFile(res,file,{noCache:true}))return;res.writeHead(404);res.end('Game file not found');return}
  const publicRelative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,''),publicPath=safeJoin(PUBLIC_DIR,publicRelative);if(publicPath&&await serveFile(res,publicPath,{noCache:true}))return;res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');
}

export async function startFactoryServer(){await store.init();await recoverInterruptedJobs();const server=http.createServer((req,res)=>handler(req,res).catch(error=>{console.error(error);if(!res.headersSent)sendJson(res,500,{error:error.message});else res.end()}));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,HOST,()=>{server.off('error',reject);resolve()})});const localUrl=`http://${HOST}:${PORT}`;console.log(`\nGutpopper Game Factory v0.26.0`);console.log(localUrl);console.log(`Repo: ${REPO_ROOT}\n`);return{server,url:localUrl,repoRoot:REPO_ROOT,stateDir:STATE_DIR,port:PORT,host:HOST}}
if(process.env.GAME_FACTORY_EMBEDDED!=='1')await startFactoryServer();
