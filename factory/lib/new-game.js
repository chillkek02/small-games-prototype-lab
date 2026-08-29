import fsp from 'node:fs/promises';
import path from 'node:path';
import { resolveRecommendation } from './opportunity.js';
import { writeProductionStarterKit, starterKitInstruction } from './starter-kit.js';
import { visualQualityBrief } from './visual-quality.js';

const POKI_SDK = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'new-game';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

async function nextGameNumber(gamesDir) {
  const entries = await fsp.readdir(gamesDir, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d+)-/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function engineLabel(engine) {
  return ({ vanilla:'Vanilla Canvas / SVG / JavaScript', phaser3:'Phaser 3.90', phaser4:'Phaser 4.2.1', three:'Three.js 0.185.1', dom:'HTML / CSS / SVG' })[engine] || engine;
}

function artLabel(art) {
  return ({
    toy3d:'Toy Town 3D', pixel:'Pixel Arcade', vector:'Bright Vector Casual', voxel:'Blocky / Voxel',
    paper:'Paper Cutout', outline:'Cartoon Outline', retro:'Retro 16-bit', pastel:'Soft Pastel Casual',
    neon:'Neon Arcade', isometric:'Isometric 2.5D', minimal:'Minimal Clean', industrial:'Industrial / Mechanical'
  })[art] || art;
}

async function copyIfExists(from, to) {
  try {
    await fsp.mkdir(path.dirname(to), { recursive:true });
    await fsp.copyFile(from, to);
    return true;
  } catch { return false; }
}

async function provisionEngine({ engine, factoryDir, gameDir }) {
  const vendorDir = path.join(gameDir, 'vendor');
  if (engine === 'phaser3') {
    const source = path.join(factoryDir, 'node_modules', 'phaser', 'dist', 'phaser.min.js');
    const target = path.join(vendorDir, 'phaser-3.90.0.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Phaser 3.90 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script:'./vendor/phaser-3.90.0.min.js', kind:'script' };
  }
  if (engine === 'phaser4') {
    const source = path.join(factoryDir, 'node_modules', 'phaser4', 'dist', 'phaser.min.js');
    const target = path.join(vendorDir, 'phaser-4.2.1.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Phaser 4.2.1 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script:'./vendor/phaser-4.2.1.min.js', kind:'script' };
  }
  if (engine === 'three') {
    const source = path.join(factoryDir, 'node_modules', 'three', 'build', 'three.module.min.js');
    const target = path.join(vendorDir, 'three-0.185.1.module.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Three.js is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script:'./vendor/three-0.185.1.module.min.js', kind:'module' };
  }
  return null;
}

function scaffoldHtml({ title, engine, engineAsset, target }) {
  const safeTitle = escapeHtml(title);
  const engineTag = engineAsset?.kind === 'script' ? `<script src="${engineAsset.script}"></script>` : '';
  const moduleHint = engineAsset?.kind === 'module' ? `<script type="module">import * as THREE from '${engineAsset.script}'; window.THREE = THREE;</script>` : '';
  const poki = target === 'Poki';
  const pokiTag = poki ? `<script src="${POKI_SDK}"></script>` : '';
  const pokiBoot = poki ? `window.__POKI_READY__=false;if(window.GutpopperCore){GutpopperCore.poki.init().then(ok=>{window.__POKI_READY__=ok}).catch(()=>{});}` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#10141c">
<title>${safeTitle}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="./starter/production-core.css">
${pokiTag}
<script src="./starter/production-core.js"></script>
${engineTag}
${moduleHint}
<style>.boot{display:grid;gap:10px;text-align:center;padding:24px}.boot strong{font-size:22px}.boot span{opacity:.65;font-size:12px}</style>
</head>
<body oncontextmenu="return false">
<div class="boot"><strong>${safeTitle}</strong><span>Gutpopper Production Core loaded. Building the playable prototype…</span></div>
<script>
window.__GUTPOPPER_ENGINE__=${JSON.stringify(engine)};
${pokiBoot}
</script>
</body>
</html>`;
}

export function buildNewGameInstruction({ title, concept, engine, artStyle, opportunityTitle = '', target = 'Poki' }) {
  const pokiRules = target === 'Poki' ? `
POKI PRODUCTION + PERFORMANCE + AD READINESS RULES
- Poki SDK and GutpopperCore.poki are already scaffolded. Keep them.
- Call GutpopperCore.poki.loadingFinished() exactly when the actually playable initial content is ready.
- gameplayStart() must not fire on page load. Fire it on the player's first gameplay input and when returning to active gameplay.
- gameplayStop() must fire for interruptions such as pause/menu, level end, death/game over, or cutscene where active play stops. Never fire gameplayStart twice in succession or gameplayStop twice in succession.
- NEVER request a commercial or rewarded ad on initial page load or before the player expresses gameplay/ad intent.
- Create natural commercialBreak() opportunities between runs/levels or before resume/continue moments, never in the middle of active gameplay. A normal death->retry or next-level flow should be gameplayStop() -> commercialBreak() -> gameplayStart().
- Create at least one genuinely optional rewardedBreak() opportunity that fits the game (revive, bonus reward, temporary boost, double reward, convenience, etc.). Normal progression must work without watching it.
- The rewarded-ad control must clearly tell the player an ad will be watched BEFORE they choose it (for example “Watch Ad · Revive” or “Watch Ad · x2 Reward”). Do not disguise it as a normal button.
- Grant the rewarded benefit ONLY when rewardedBreak() resolves successfully. If it returns false/cancelled/unavailable, do not grant the reward and continue safely.
- Pause/disable gameplay input and audio while an ad is active and restore both cleanly afterward. Keep gameplayStart() after the ad/resume point, not during the ad.
- Use GutpopperCore.poki.commercialBreak() / rewardedBreak() so local testing safely falls back without pretending an ad reward succeeded.
- The game MUST remain playable if the Poki SDK script is blocked/unavailable. Do not gate loading, input, audio, progression, or startup on successful SDK initialization.
- Do not add another advertising SDK, ad-block prevention, outbound promotional links, or third-party splash screens.
- Avoid unnecessary splash/title/level-select chains. A first-time player should reach meaningful interaction immediately or with at most one obvious start action when the concept truly needs it.
- Keep the initial download lean. Load only the menu/tutorial/first playable content needed to start, then progressively load later levels, cosmetic assets, extra audio, and nonessential content in the background.
- Do not preload every level or large asset at startup. Avoid giant inline base64 assets, oversized textures, unnecessary duplicate libraries, and excessive network requests.
- Stable frame pacing matters as much as visuals. Pool/reuse frequently spawned objects and effects, cap particle counts, avoid per-frame DOM churn, and avoid expensive allocations in hot loops.
- For Canvas/Three.js, avoid rendering at wastefully high device pixel ratios on phones; cap pixel ratio when necessary for stable performance. For Three.js, resize renderer/camera correctly and keep draw calls/material complexity reasonable.
- A loading/progress treatment is useful only when loading is actually long enough to need it; never add a fake delay.
` : '';

  return `CREATE A BRAND-NEW PRODUCTION PROTOTYPE

GAME TITLE
${title}

PLATFORM
${target}. Browser-first and mobile-first.

CORE CONCEPT
${concept}

${opportunityTitle ? `MARKET-SCOUT ORIGIN\nThis concept was selected from the Factory opportunity scout: ${opportunityTitle}. Preserve the core market hook while making the game original.\n` : ''}
ENGINE — REQUIRED
Use ${engineLabel(engine)} as the primary game/rendering engine. The Factory scaffold already provisioned the local engine file when needed. Do not replace it with an unrelated framework or remote CDN.

${starterKitInstruction()}

ART DIRECTION — REQUIRED
${artLabel(artStyle)}.
Make the game visually intentional and polished from the FIRST playable build. Do not defer basic art direction/UI polish to a later pass. Use code-generated shapes, SVG, canvas, engine primitives, gradients, layered geometry, particles, procedural/vector assets, or other lightweight techniques appropriate to this style. Avoid copyrighted characters/assets and avoid requiring external art downloads.

${visualQualityBrief()}

BEFORE IMPLEMENTING THE SCREEN
Privately establish a compact visual brief for yourself: palette, typography hierarchy, UI/card/button language, character/prop shape language, environment density, feedback style, desktop composition, and phone composition. Then implement consistently from that brief. Do not return the brief instead of building the game.

GAME DESIGN TARGET
- The first playable loop should be understandable in under 10 seconds.
- Build a complete short-session loop: start -> play -> success/failure -> reward/progression -> replay.
- Aim for a 2–5 minute satisfying session with reasons to immediately replay.
- Design at least TWO complementary one-more-run hooks that genuinely fit the concept. Examples: persistent upgrade/unlock + mission, high-score chase + randomized variation, level progression + faster retry, streak/combo mastery + escalating difficulty. Do not force every system into every game.
- Make success/failure lead back into another run quickly. Prefer one obvious retry/continue action over multi-screen friction.
- If the game uses upgrades/unlocks, make them noticeably change gameplay, strategy, capability, speed, reach, risk/reward, or another felt property. Do not create decorative stat labels with no meaningful effect.
- If persistence fits, use the Production Core save/load helpers and ensure progress survives reload. Pure arcade/score-chase games may instead rely on best score, missions, variation, mastery, or escalating challenge.
- Include a visible score/best/missions/progression/reward cue so players understand what they are improving toward.
- Include meaningful game feel: juice, hit/collect feedback, transitions, particles, camera/screen feedback, and use the built-in burst/shake/vibrate helpers where they fit.
- Support desktop controls AND excellent touch controls. Prefer one-thumb or simple two-thumb interaction and use the normalized input helper when appropriate.
- Prevent text selection, long-press/callout, context menus, accidental browser gestures, and drag-selection on gameplay UI.
- PHONE 390x844: use a touch-first composition appropriate to the game.
- DESKTOP 1440x900: create a genuinely landscape desktop composition that uses the available viewport for gameplay/camera/playfield and intentionally recomposes HUD/menu where useful. Do NOT center the same narrow portrait/mobile game column between large side gutters.
- Use responsive resize/orientation handling rather than a one-time viewport calculation. Phaser should use an appropriate responsive Scale Manager strategy; Three.js must resize renderer and update camera aspect; Canvas/SVG must respond to resize without stretching.
${pokiRules}
SCOPE
Build the actual playable v1 prototype now, not a design document or placeholder. Keep it compact enough to iterate quickly, but complete and polished enough to judge whether the core loop is fun, visually promising, worth replaying, and monetization-ready. You may create supporting JS/CSS/SVG/data files inside this game folder. Do not edit any other game or Factory file.

SELF-CHECK BEFORE FINISHING
- Ask whether the screen would look embarrassing in a screenshot next to modern casual web games. If yes, improve it now.
- Ask whether a player finishing/failing one run has an obvious reason to immediately start another. If not, strengthen replayability now.
- For Poki, verify there is a natural commercial-break moment and at least one clearly optional rewarded-ad choice with success-gated reward delivery.
- Remove obvious programmer-art/default-browser presentation.
- Make sure major characters/props/environment/HUD do not read as raw primitive placeholders.
- Make sure the first screenshot has a clear focal point, cohesive palette, deliberate spacing, depth/layering, and visible feedback potential.
- Verify any persistent progress actually writes and reloads correctly when practical from source-level checks.
- Keep improvements lightweight enough to preserve the Poki performance targets.

QA
The Factory will run desktop/mobile browser QA and automatic first-prototype gates for visuals, retention/replay, and Poki ad readiness. Game Doctor can also run cold-load, payload-size, request-count, frame-pacing, ad-block-resilience, SDK-event-order, AI playtesting, retention/persistence/replay checks, ad-opportunity checks, and strict visual-quality-floor checks. Do not launch your own browser or HTTP server unless absolutely necessary to diagnose a source error. Perform lightweight syntax/source checks and then stop.`;
}

export async function createGameProject({ gamesDir, factoryDir, title, concept, engine = 'auto', artStyle = 'auto', opportunity = '', target = 'Poki' }) {
  title = String(title || '').trim();
  concept = String(concept || '').trim();
  target = target === 'General Web' ? 'General Web' : 'Poki';
  if (title.length < 2) throw new Error('Give the new game a title.');
  if (concept.length < 12) throw new Error('Describe the game concept in a little more detail.');

  const recommendation = resolveRecommendation({ concept, engine, artStyle, category: opportunity });
  engine = recommendation.engine;
  artStyle = recommendation.artStyle;

  const number = await nextGameNumber(gamesDir);
  const id = `${String(number).padStart(2, '0')}-${slugify(title)}`;
  const gameDir = path.join(gamesDir, id);
  try {
    await fsp.mkdir(gameDir, { recursive:false });
    const engineAsset = await provisionEngine({ engine, factoryDir, gameDir });
    const starterKit = await writeProductionStarterKit({ gameDir, engine, target });
    const metadata = {
      id, title, concept, target, engine, artStyle, opportunity:opportunity || null,
      starterKit:{ name:starterKit.name, version:starterKit.version },
      visualQualityFloor:{ version:'1.0.0', minimumPrototypeScore:70 },
      retentionFloor:{ version:'1.0.0', minimumPrototypeScore:65 },
      adReadinessFloor: target === 'Poki' ? { version:'1.0.0', minimumPrototypeScore:70 } : null,
      createdBy:'Gutpopper Game Factory', createdAt:new Date().toISOString()
    };
    await Promise.all([
      fsp.writeFile(path.join(gameDir, 'index.html'), scaffoldHtml({ title, engine, engineAsset, target }), 'utf8'),
      fsp.writeFile(path.join(gameDir, 'factory-game.json'), JSON.stringify(metadata, null, 2), 'utf8')
    ]);
    return { id, title, gameDir, engine, artStyle, starterKit, instruction:buildNewGameInstruction({ title, concept, engine, artStyle, opportunityTitle:opportunity, target }), metadata };
  } catch (error) {
    await fsp.rm(gameDir, { recursive:true, force:true }).catch(() => {});
    throw error;
  }
}
