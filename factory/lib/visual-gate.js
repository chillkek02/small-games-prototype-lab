import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseVisualRubric, visualRubricAuditInstructions, visualQualityBrief } from './visual-quality.js';
import { runRetentionAudit } from './retention.js';
import { runAdReadiness } from './ad-readiness.js';
import { houseStyleBrief } from './house-style.js';

const CODEX_COMMAND=process.env.GAME_FACTORY_CODEX_COMMAND||'codex';

function runProcess(command,args,{cwd,input='',timeoutMs=6*60*1000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env:process.env,windowsHide:true,shell:process.platform==='win32'});
    let stdout='',stderr='',settled=false;
    child.stdout?.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>120000)stdout=stdout.slice(-120000)});
    child.stderr?.on('data',chunk=>{stderr+=chunk.toString();if(stderr.length>80000)stderr=stderr.slice(-80000)});
    const timer=setTimeout(()=>{if(settled)return;settled=true;child.kill();reject(new Error(`Prototype quality gate timed out after ${Math.round(timeoutMs/60000)} minutes`))},timeoutMs);
    child.on('error',error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)});
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code,stdout,stderr})});
    if(child.stdin){child.stdin.write(input);child.stdin.end()}
  });
}

async function runVisualAudit({gameDir,artifactDir}){
  const images=[];
  for(const name of ['desktop.png','mobile.png']){const file=path.join(artifactDir,name);try{await fsp.access(file);images.push(file)}catch{}}
  if(!images.length)return{audited:false,passed:false,status:'AUDIT_ERROR',score:null,hardFails:[],categories:{},report:'No QA screenshots were available for the visual floor.',error:'No screenshots'};

  const prompt=`model: terra\nYou are the STRICT VISUAL BENCHMARK DIRECTOR inside Gutpopper Game Factory.\n\nREAD-ONLY AUDIT. Do not modify files.\nThe attached screenshots are the new game's desktop 1440x900 and phone 390x844 QA captures when available. Judge the actual presentation against strong modern Poki/mobile-casual games, not against coding prototypes.\n\nBe specifically severe about:\n- flat scenes with weak lighting/material/shadow treatment\n- South-Park/simple-cutout-looking motion where richer toy-like animation is expected\n- one-color primitive vehicles/characters/props rather than designed multi-part assets\n- empty worlds with little dressing or depth\n- dull/muddy palettes instead of bright deliberate casual-game color\n- lifeless movement with no easing, secondary motion, particles, trails, camera reaction or celebration\n- generic website/dashboard UI\n- narrow phone compositions pasted onto desktop\n\nA technically clean game can still deserve a low visual score.\n\n${visualRubricAuditInstructions()}\n\nBefore the required JSON block, give at most 10 short lines identifying the biggest gaps versus professional casual-game presentation and the highest-value changes. Do not edit the game.`;

  const args=['exec','--ephemeral','--sandbox','read-only','-c','approval_policy=never','-m','gpt-5.6-terra','-c','model_reasoning_effort=medium','-c','model_verbosity=low','--color','never'];
  for(const image of images)args.push('--image',image);
  args.push('-C',gameDir,'-');
  try{
    const result=await runProcess(CODEX_COMMAND,args,{cwd:gameDir,input:prompt});
    if(result.code!==0){const detail=(result.stderr||result.stdout||'').trim().slice(-2500);throw new Error(`Visual gate exited with code ${result.code}${detail?`: ${detail}`:''}`)}
    const report=result.stdout.trim();const rubric=parseVisualRubric(report);
    if(!rubric)return{audited:false,passed:false,status:'AUDIT_ERROR',score:null,hardFails:[],categories:{},report,error:'Visual rubric block was missing or invalid.'};
    return{audited:true,...rubric,report,error:null};
  }catch(error){return{audited:false,passed:false,status:'AUDIT_ERROR',score:null,hardFails:[],categories:{},report:`Visual gate unavailable: ${error.message}`,error:error.message}}
}

function combinedGateScore(visual,retention,ads){
  const adApplicable=ads?.applicable!==false;
  const adPassed=!adApplicable||Boolean(ads?.passed);
  const score=(visual.passed?28:0)+(retention.passed?20:0)+(adPassed?17:0)+(visual.score||0)*.15+(retention.score||0)*.10+(adApplicable?(ads.score||0):100)*.10;
  return Math.max(0,Math.min(100,Math.round(score)));
}

export async function runVisualFloorGate({gameDir,artifactDir}){
  const visual=await runVisualAudit({gameDir,artifactDir});
  if(!visual.audited)return visual;
  const gameUrl=`http://127.0.0.1:${process.env.GAME_FACTORY_PORT||4177}/game/${encodeURIComponent(path.basename(gameDir))}/`;
  const [retention,ads]=await Promise.all([runRetentionAudit({gameDir,url:gameUrl}),runAdReadiness({gameDir,url:gameUrl})]);
  const adPassed=ads.applicable===false||ads.passed;
  const combinedScore=combinedGateScore(visual,retention,ads);
  const passed=Boolean(visual.passed&&retention.passed&&adPassed);
  const status=passed?'PASS':!visual.passed?visual.status:!retention.passed?'RETENTION_NEEDS_WORK':'ADS_NEED_WORK';

  const retentionLines=[
    `Retention score: ${retention.score}/100 (minimum ${retention.minimumPrototypeScore}/100)`,
    `Quick replay: ${retention.restartAvailable||retention.secondRunStarted?'verified':'not verified'}`,
    `Meaningful upgrade effect: ${retention.meaningfulUpgradeVerified?'verified':retention.source?.upgrades?'not verified':'n/a'}`,
    `Second-run differentiation: ${retention.secondRunMeaningfullyDifferent?'verified':'not verified'}`,
    `Persistence: ${retention.persistedAfterReload?'verified':retention.source?.persistence?'present but not demonstrated':'not detected'}`,
    `Replay systems: upgrades=${Boolean(retention.source?.upgrades)}, score=${Boolean(retention.source?.scoreChase)}, missions=${Boolean(retention.source?.missions)}, progression=${Boolean(retention.source?.progression)}, variation=${Boolean(retention.source?.variation)}`,
    ...(retention.notes||[]).map(note=>`- ${note}`)
  ];
  const adLines=ads.applicable===false?['Ad readiness: not applicable for General Web target.']:[
    `Ad readiness score: ${ads.score}/100 (minimum ${ads.minimumPrototypeScore}/100)`,
    `Commercial break: ${ads.source?.commercial?'implemented':'missing'}; natural moment=${ads.source?.naturalCommercialContext||ads.runtime?.commercialRuntime?'verified':'not verified'}`,
    `Rewarded break: ${ads.source?.rewarded?'implemented':'missing'}; explicit opt-in=${ads.source?.explicitRewardChoice||ads.runtime?.rewardedButton?'verified':'not verified'}`,
    `Reward success guard: ${ads.source?.rewardSuccessGuard?'verified':'not verified'}`,
    `No ad before player intent: ${ads.runtime?.noAdBeforeInput?'PASS':'FAIL'}`,
    `Input/audio pause hooks: ${ads.source?.adPauseHooks?'detected':'not detected'}`,
    ...(ads.notes||[]).map(note=>`- ${note}`)
  ];

  return{
    ...visual,passed,status,score:combinedScore,
    visualScore:visual.score,visualPassed:visual.passed,
    retentionScore:retention.score,retentionPassed:retention.passed,retention,
    adReadinessScore:ads.applicable===false?null:ads.score,adReadinessPassed:adPassed,adReadiness:ads,
    report:`${visual.report}\n\nRETENTION / REPLAY GATE\n${retentionLines.join('\n')}\n\nAD READINESS GATE\n${adLines.join('\n')}`
  };
}

export function buildAutomaticVisualPolishPrompt({game,gate,creator={}}){
  const categoryLines=Object.entries(gate.categories||{}).map(([key,value])=>`- ${key}: ${value}/100`).join('\n')||'- unavailable';
  const hardFails=gate.hardFails?.length?gate.hardFails.map(id=>`- ${id}`).join('\n'):'- none';
  const retention=gate.retention||{};const retentionNotes=(retention.notes||[]).map(note=>`- ${note}`).join('\n')||'- none';
  const ads=gate.adReadiness||{};const adNotes=(ads.notes||[]).map(note=>`- ${note}`).join('\n')||'- none';
  return `model: terra\nYou are the STUDIO VISUAL DIRECTOR + FIRST-PROTOTYPE POLISH agent inside Gutpopper Game Factory.\n\nTARGET\nWork only in the current game folder: ${game}. Preserve the proven core mechanic, controls, Poki integration and fast-loading performance. Do not commit, push, install unrelated dependencies, or edit outside this game.\n\nWHY THIS PASS IS RUNNING\nThis is a professional studio presentation pass. It runs when any first-prototype gate fails OR when visual quality is below the commercial target of ${gate.publishCandidateScore??85}/100. Do not settle for merely clearing the minimum. Aim to make the screenshots look intentionally authored beside strong Poki/mobile-casual games.\n\n${houseStyleBrief({engine:creator?.engine||'auto',artStyle:creator?.artStyle||'auto',concept:creator?.concept||''})}\n\nVISUAL QUALITY\nVisual floor: ${gate.visualPassed?'PASS':'NEEDS WORK'}\nVisual score: ${gate.visualScore??'unknown'}/100\nCommercial target: ${gate.publishCandidateScore??85}/100\nCategory scores:\n${categoryLines}\nHard fails:\n${hardFails}\n\nRETENTION / REPLAY\nStatus: ${gate.retentionPassed?'PASS':'NEEDS WORK'}\nRetention score: ${gate.retentionScore??'unknown'}/100\nMeaningful upgrade verified: ${Boolean(retention.meaningfulUpgradeVerified)}\nSecond-run differentiation: ${Boolean(retention.secondRunMeaningfullyDifferent)}\nQuick replay verified: ${Boolean(retention.restartAvailable||retention.secondRunStarted)}\nSave survived reload: ${Boolean(retention.persistedAfterReload)}\nFindings:\n${retentionNotes}\n\nAD READINESS\nStatus: ${gate.adReadinessPassed?'PASS':'NEEDS WORK'}\nAd score: ${gate.adReadinessScore??'not applicable'}/100\nFindings:\n${adNotes}\n\nAUDITOR REPORT\n${gate.report||'No report text.'}\n\n${visualQualityBrief()}\n\nSTUDIO VISUAL-DIRECTOR PRIORITIES\n- Do not redesign a mechanic that already works. Spend the pass on presentation quality and any specifically failing retention/ad requirement.\n- Push depth first: lighting, grounding/contact shadows, material highlights, layered geometry/sprites, overlap, perspective, atmospheric separation and camera composition.\n- Push asset quality: turn single primitives into readable multi-part vehicles/characters/props with trim, windows, wheels, accessories, faces, handles, signs, decals or equivalent thematic details.\n- Push environment richness using reusable modular dressing rather than huge asset downloads. Empty test-room space is unacceptable.\n- Push motion quality: eased anticipation, acceleration/deceleration, bob/lean, wheel/body response, squash/pop, trails/particles, camera follow/kick, reward bursts and clear success/failure animation.\n- Push color/material quality: bright controlled casual palette, warm/cool separation and visual focal hierarchy. Do not merely increase saturation globally.\n- Push UI quality: tactile rounded cards/buttons, icons/meters, compact hierarchy and polished press/transition states; no website/dashboard look.\n- Use ./starter/presentation.css, GutpopperVisual and the existing Production Core rather than re-inventing generic systems.\n- For Three.js, use real 3D lighting/shadows/materials/perspective and designed multi-part geometry. For Phaser, use layered depth, shadows, gradients, tweening, particles and camera effects.\n- If retention fails, add the smallest fitting one-more-run improvement without grind. Upgrades must affect real gameplay.\n- If ad readiness fails, fix natural commercial/rewarded moments without making ads mandatory.\n- Protect startup size and frame pacing; reuse geometry/materials/effects and avoid heavy remote assets.\n\nFinish after one coherent studio-quality pass. The Factory will rerun technical QA and all quality gates automatically.`;
}
