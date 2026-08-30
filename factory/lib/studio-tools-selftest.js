import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getStudioPlan, saveStudioPlan, runHookAudit, thumbnailDirections, runOptimizationAudit, advancedAssetStatus } from './studio-tools.js';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'gutpopper-studio-tools-'));
try{
  await fsp.writeFile(path.join(root,'index.html'),'<!doctype html><button id="start">Start</button><script>addEventListener("pointerdown",()=>{}); function retry(){}; let score=0; let coins=0; /* tutorial swipe upgrade reward */</script>','utf8');
  const metadata={id:'99-test',title:'Test Game',concept:'cute raccoon cleanup game'};
  const initial=await getStudioPlan({gameDir:root,metadata});if(initial.status!=='draft')throw new Error('Expected draft plan.');
  const saved=await saveStudioPlan({gameDir:root,metadata,input:{status:'approved',hook:'Clean the mess immediately.',promptQueue:[{text:'Add a stronger first reward.',status:'queued'}]}});if(saved.status!=='approved'||saved.promptQueue.length!==1)throw new Error('Plan save failed.');
  const hook=await runHookAudit({gameDir:root,metadata});if(!Number.isFinite(hook.score))throw new Error('Hook audit did not produce a score.');
  const thumbs=thumbnailDirections({metadata,plan:saved});if(thumbs.length<4)throw new Error('Thumbnail Lab directions missing.');
  const opt=await runOptimizationAudit({gameDir:root});if(!Number.isFinite(opt.score))throw new Error('Optimization audit did not produce a score.');
  if(advancedAssetStatus().imageTo3dProvider!==false)throw new Error('Unconfigured image-to-3D provider must fail closed.');
  console.log('Studio Tools self-test passed · plan + hook + thumbnail + optimization + provider truthfulness');
} finally {await fsp.rm(root,{recursive:true,force:true}).catch(()=>{})}
