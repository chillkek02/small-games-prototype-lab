import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harvestGameAssets, searchAssetLibrary, installLibraryMatches, assetLibraryStats } from './asset-library.js';
import { prepareAssetAutopilot, getAssetAutopilotStatus, linkAssetAutopilotJob, finishAssetAutopilot } from './asset-autopilot.js';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'gutpopper-asset-autopilot-'));
try{
  const state=path.join(root,'state'),gameA=path.join(root,'game-a'),gameB=path.join(root,'game-b');
  await fsp.mkdir(path.join(gameA,'assets','autogen'),{recursive:true});await fsp.mkdir(path.join(gameB,'assets'),{recursive:true});
  await fsp.writeFile(path.join(gameA,'factory-game.json'),JSON.stringify({id:'game-a',title:'Frog Tower',concept:'cute frog climbs with a long tongue',artStyle:'toy3d'}),'utf8');
  await fsp.writeFile(path.join(gameA,'assets','autogen','frog-tongue.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 300"><path d="M50 290 C30 220 40 120 50 20" stroke="#ff6f9f" stroke-width="18" fill="none" stroke-linecap="round"/></svg>','utf8');
  const harvested=await harvestGameAssets({stateDir:state,gameDir:gameA,game:'game-a',metadata:{title:'Frog Tower',concept:'cute frog climbs with a long tongue'}});if(harvested.added<1)throw new Error('Expected at least one harvested asset.');
  const found=await searchAssetLibrary({stateDir:state,query:'frog tongue climbing',limit:5});if(!found.results.length)throw new Error('Library search did not find harvested frog asset.');
  const installed=await installLibraryMatches({stateDir:state,gameDir:gameB,query:'frog tongue',limit:5});if(!installed.installed.length)throw new Error('Library match was not installed into second game.');
  for(const asset of installed.installed){const rel=String(asset.installedSource||'').replace(/^\.\//,'');if(!(await fsp.stat(path.join(gameB,rel)).catch(()=>null))?.isFile())throw new Error('Installed library file missing: '+rel)}
  await fsp.writeFile(path.join(gameB,'factory-game.json'),JSON.stringify({id:'game-b',title:'Tongue Tower',concept:'cute frog tongue climbing game',artStyle:'toy3d'}),'utf8');
  const prepared=await prepareAssetAutopilot({stateDir:state,gameDir:gameB,game:'game-b',metadata:{title:'Tongue Tower',concept:'cute frog tongue climbing game',artStyle:'toy3d'}});if(prepared.status.phase!=='prepared'||!prepared.instruction.includes('ASSET AUTOPILOT'))throw new Error('Autopilot prepare failed.');
  await linkAssetAutopilotJob({gameDir:gameB,jobId:'job-1'});let status=await getAssetAutopilotStatus({gameDir:gameB});if(status.phase!=='running'||status.jobId!=='job-1')throw new Error('Autopilot job linking failed.');
  status=await finishAssetAutopilot({stateDir:state,gameDir:gameB,game:'game-b',metadata:{title:'Tongue Tower',concept:'cute frog tongue climbing game'},job:{id:'job-1',status:'passed'}});if(status.phase!=='completed'||!status.lastHarvest)throw new Error('Autopilot finish/harvest failed.');
  const stats=await assetLibraryStats({stateDir:state});if(stats.total<1)throw new Error('Global library stats were empty.');
  console.log('Asset Autopilot self-test passed · harvest → search → reuse → prepare → link → finish');
} finally {await fsp.rm(root,{recursive:true,force:true}).catch(()=>{})}
