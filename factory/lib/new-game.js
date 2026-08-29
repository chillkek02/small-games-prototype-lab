import fsp from 'node:fs/promises';
import path from 'node:path';
import { resolveRecommendation } from './opportunity.js';
import { writeProductionStarterKit, starterKitInstruction } from './starter-kit.js';
import { visualQualityBrief } from './visual-quality.js';
import { writeHouseStyleKit, houseStyleBrief } from './house-style.js';

const POKI_SDK='https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

function slugify(value=''){return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'new-game'}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch])}

async function nextGameNumber(gamesDir){const entries=await fsp.readdir(gamesDir,{withFileTypes:true});let max=0;for(const entry of entries){if(!entry.isDirectory())continue;const match=entry.name.match(/^(\d+)-/);if(match)max=Math.max(max,Number(match[1]))}return max+1}

function engineLabel(engine){return({vanilla:'Vanilla Canvas / SVG / JavaScript',phaser3:'Phaser 3.90',phaser4:'Phaser 4.2.1',three:'Three.js 0.185.1',dom:'HTML / CSS / SVG'})[engine]||engine}
function artLabel(art){return({toy3d:'Gutpopper Bright Toy 3D',pixel:'Pixel Arcade',vector:'Bright Layered Vector Casual',voxel:'Bright Blocky / Voxel 3D',paper:'Paper Cutout',outline:'Cartoon Outline',retro:'Retro 16-bit',pastel:'Soft Pastel Casual',neon:'Neon Arcade',isometric:'Polished Isometric 2.5D',minimal:'Minimal Clean',industrial:'Industrial / Mechanical'})[art]||art}

async function copyIfExists(from,to){try{await fsp.mkdir(path.dirname(to),{recursive:true});await fsp.copyFile(from,to);return true}catch{return false}}

async function provisionEngine({engine,factoryDir,gameDir}){
  const vendorDir=path.join(gameDir,'vendor');
  if(engine==='phaser3'){
    const source=path.join(factoryDir,'node_modules','phaser','dist','phaser.min.js');
    const target=path.join(vendorDir,'phaser-3.90.0.min.js');
    if(!await copyIfExists(source,target))throw new Error('Phaser 3.90 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return{script:'./vendor/phaser-3.90.0.min.js',kind:'script'};
  }
  if(engine==='phaser4'){
    const source=path.join(factoryDir,'node_modules','phaser4','dist','phaser.min.js');
    const target=path.join(vendorDir,'phaser-4.2.1.min.js');
    if(!await copyIfExists(source,target))throw new Error('Phaser 4.2.1 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return{script:'./vendor/phaser-4.2.1.min.js',kind:'script'};
  }
  if(engine==='three'){
    const source=path.join(factoryDir,'node_modules','three','build','three.module.min.js');
    const target=path.join(vendorDir,'three-0.185.1.module.min.js');
    if(!await copyIfExists(source,target))throw new Error('Three.js is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return{script:'./vendor/three-0.185.1.module.min.js',kind:'module'};
  }
  return null;
}

function scaffoldHtml({title,engine,engineAsset,target}){
  const safeTitle=escapeHtml(title);
  const engineTag=engineAsset?.kind==='script'?`<script src="${engineAsset.script}"></script>`:'';
  const moduleHint=engineAsset?.kind==='module'?`<script type="module">import * as THREE from '${engineAsset.script}'; window.THREE=THREE; window.dispatchEvent(new CustomEvent('gutpopper-three-ready'));</script>`:'';
  const poki=target==='Poki';
  const pokiTag=poki?`<script src="${POKI_SDK}"></script>`:'';
  const pokiBoot=poki?`window.__POKI_READY__=false;if(window.GutpopperCore){GutpopperCore.poki.init().then(ok=>{window.__POKI_READY__=ok}).catch(()=>{});}`:'';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#70cfff">
<title>${safeTitle}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="./starter/production-core.css">
<link rel="stylesheet" href="./starter/presentation.css">
${pokiTag}
<script src="./starter/production-core.js"></script>
<script src="./starter/presentation.js"></script>
${engineTag}
${moduleHint}
<style>.boot{display:grid;place-items:center;min-height:100%;padding:24px;background:linear-gradient(180deg,#7edcff,#d7f7ff 46%,#a7e979);color:#17324a;text-align:center}.boot>div{padding:26px 30px;border-radius:28px;background:rgba(255,255,255,.88);box-shadow:0 20px 55px rgba(27,68,98,.2)}.boot strong{display:block;font-size:26px;font-weight:1000;letter-spacing:-.035em}.boot span{display:block;margin-top:8px;opacity:.66;font-size:12px;font-weight:700}</style>
</head>
<body oncontextmenu="return false">
<div class="boot gv-ui"><div><strong>${safeTitle}</strong><span>Gutpopper production + presentation systems loaded. Building the playable game…</span></div></div>
<script>window.__GUTPOPPER_ENGINE__=${JSON.stringify(engine)};${pokiBoot}</script>
</body>
</html>`;
}

export function buildNewGameInstruction({title,concept,engine,artStyle,opportunityTitle='',target='Poki'}){
  const pokiRules=target==='Poki'?`
POKI PRODUCTION + PERFORMANCE + AD READINESS RULES
- Poki SDK and GutpopperCore.poki are already scaffolded. Keep them.
- Call GutpopperCore.poki.loadingFinished() exactly when the actually playable initial content is ready.
- gameplayStart() must not fire on page load. Fire it on the player's first gameplay input and when returning to active gameplay.
- gameplayStop() must fire for interruptions such as pause/menu, level end, death/game over, or cutscene where active play stops. Never fire gameplayStart twice in succession or gameplayStop twice in succession.
- NEVER request a commercial or rewarded ad on initial page load or before the player expresses gameplay/ad intent.
- Create natural commercialBreak() opportunities between runs/levels or before resume/continue moments, never in the middle of active gameplay. A normal death->retry or next-level flow should be gameplayStop() -> commercialBreak() -> gameplayStart().
- Create at least one genuinely optional rewardedBreak() opportunity that fits the game (revive, bonus reward, temporary boost, double reward, convenience, etc.). Normal progression must work without watching it.
- The rewarded-ad control must clearly tell the player an ad will be watched BEFORE they choose it.
- Grant the rewarded benefit ONLY when rewardedBreak() resolves successfully. If it returns false/cancelled/unavailable, do not grant the reward and continue safely.
- Use GutpopperCore.poki.setAdHooks({pause,resume}) so gameplay input/audio pause while an ad is active and restore cleanly afterward.
- The game MUST remain playable if the Poki SDK script is blocked/unavailable.
- Do not add another advertising SDK, ad-block prevention, outbound promotional links, or third-party splash screens.
- Keep the initial download lean; progressively load later/nonessential content.
- Avoid giant inline base64 assets, oversized textures, duplicate libraries and excessive requests.
- Pool/reuse frequently spawned objects and effects, cap particle counts and avoid expensive allocations in hot loops.
- For Canvas/Three.js cap wasteful device pixel ratio when needed for stable phone performance.
- Never add a fake loading delay.
`:'';

  return `CREATE A BRAND-NEW PRODUCTION PROTOTYPE

GAME TITLE
${title}

PLATFORM
${target}. Browser-first and mobile-first.

CORE CONCEPT
${concept}

${opportunityTitle?`MARKET-SCOUT ORIGIN\nThis concept was selected from the Factory opportunity scout: ${opportunityTitle}. Preserve the core market hook while making the game original.\n`:''}
ENGINE — REQUIRED
Use ${engineLabel(engine)} as the primary game/rendering engine. The Factory scaffold already provisioned its local engine file. Do not replace it with an unrelated framework or remote CDN.

${starterKitInstruction()}

${houseStyleBrief({engine,artStyle,concept})}

ART DIRECTION — REQUIRED
Chosen style: ${artLabel(artStyle)}.
Build to the Gutpopper house-style quality bar from the FIRST playable version. The installed presentation kit is a foundation, not permission to make every game look identical; theme the materials, props and UI to this concept while preserving brightness, depth and professional casual-game polish.

${visualQualityBrief()}

BEFORE IMPLEMENTING THE SCREEN
Privately establish a compact visual brief: palette, material language, lighting, camera, character/vehicle/prop silhouette language, environment dressing set, UI hierarchy, feedback/VFX language, desktop composition, and phone composition. Then implement consistently from that brief. Do not return the brief instead of building.

GAME DESIGN TARGET
- First playable loop understandable in under 10 seconds.
- Complete short-session loop: start -> play -> success/failure -> reward/progression -> replay.
- Aim for a 2–5 minute satisfying session with immediate replay reasons.
- Design at least TWO complementary one-more-run hooks that fit the concept.
- Make success/failure lead back into another run quickly.
- Upgrades/unlocks must noticeably change gameplay/strategy/capability; no decorative fake stats.
- If persistence fits, use Production Core save/load and make it survive reload. Pure arcade games may use best score, missions, variation, mastery or escalating challenge instead.
- Include visible score/best/missions/progression/reward cues.
- Include professional game feel on every core action: eased motion, pop/impact, particles/trails, floating feedback, camera response, success/failure beats. Use GutpopperVisual and GutpopperCore helpers.
- Support desktop controls AND excellent touch controls.
- Prevent text selection, long-press/callout, context menus, accidental browser gestures and drag-selection.
- PHONE 390x844: intentional touch-first composition.
- DESKTOP 1440x900: genuine landscape composition using the viewport; never a narrow phone game between side gutters.
- Handle resize/orientation continuously. Three.js must resize renderer/update camera; Phaser must recompose cameras/UI appropriately.
${pokiRules}
SCOPE
Build the actual playable v1 now, not a design document or placeholder. It must be mechanically judgeable AND visually competitive enough to show without apologizing for the graphics. You may create supporting JS/CSS/SVG/data files inside this game folder. Do not edit any other game or Factory file.

SELF-CHECK BEFORE FINISHING
- Would this screenshot look amateur beside strong modern Poki/mobile-casual games? If yes, improve it now.
- Does the world have lighting/depth/shadows/material treatment and enough environmental detail? If no, improve it now.
- Do characters/vehicles/props read as designed multi-part assets instead of primitives? If no, improve them now.
- Is there visible animation/juice on core actions, rewards, success and failure? If no, add it now.
- Does a player finishing/failing one run have a clear reason to immediately start another? If not, strengthen replayability.
- For Poki, verify natural commercial and clearly optional rewarded-ad moments with success-gated rewards.
- Keep the visual improvements lightweight enough to preserve performance.

QA
The Factory will run desktop/mobile browser QA plus automatic first-prototype gates for visuals, retention/replay and Poki ad readiness. A dedicated Studio Visual Director pass may polish presentation again before final acceptance. Do not launch your own browser/server unless necessary to diagnose a source error. Perform lightweight source/syntax checks and stop.`;
}

export async function createGameProject({gamesDir,factoryDir,title,concept,engine='auto',artStyle='auto',opportunity='',target='Poki'}){
  title=String(title||'').trim();concept=String(concept||'').trim();target=target==='General Web'?'General Web':'Poki';
  if(title.length<2)throw new Error('Give the new game a title.');
  if(concept.length<12)throw new Error('Describe the game concept in a little more detail.');
  const recommendation=resolveRecommendation({concept,engine,artStyle,category:opportunity});engine=recommendation.engine;artStyle=recommendation.artStyle;
  const number=await nextGameNumber(gamesDir);const id=`${String(number).padStart(2,'0')}-${slugify(title)}`;const gameDir=path.join(gamesDir,id);
  try{
    await fsp.mkdir(gameDir,{recursive:false});
    const engineAsset=await provisionEngine({engine,factoryDir,gameDir});
    const starterKit=await writeProductionStarterKit({gameDir,engine,target});
    const houseStyle=await writeHouseStyleKit({gameDir,engine,artStyle});
    const metadata={
      id,title,concept,target,engine,artStyle,opportunity:opportunity||null,
      starterKit:{name:starterKit.name,version:starterKit.version},
      houseStyle:{name:houseStyle.name,version:houseStyle.version},
      visualQualityFloor:{version:'1.1.0',minimumPrototypeScore:78,publishCandidateScore:85},
      retentionFloor:{version:'1.0.0',minimumPrototypeScore:65},
      adReadinessFloor:{version:'1.0.0',minimumPrototypeScore:70},
      createdBy:'Gutpopper Game Factory',createdAt:new Date().toISOString()
    };
    await Promise.all([
      fsp.writeFile(path.join(gameDir,'index.html'),scaffoldHtml({title,engine,engineAsset,target}),'utf8'),
      fsp.writeFile(path.join(gameDir,'factory-game.json'),JSON.stringify(metadata,null,2),'utf8')
    ]);
    return{id,title,gameDir,engine,artStyle,starterKit,houseStyle,instruction:buildNewGameInstruction({title,concept,engine,artStyle,opportunityTitle:opportunity,target}),metadata};
  }catch(error){await fsp.rm(gameDir,{recursive:true,force:true}).catch(()=>{});throw error}
}
