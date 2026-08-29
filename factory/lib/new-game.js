import fsp from 'node:fs/promises';
import path from 'node:path';
import { resolveRecommendation } from './opportunity.js';
import { writeProductionStarterKit, starterKitInstruction } from './starter-kit.js';

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
  return ({
    vanilla: 'Vanilla Canvas / SVG / JavaScript',
    phaser3: 'Phaser 3.90',
    phaser4: 'Phaser 4.2.1',
    three: 'Three.js 0.185.1',
    dom: 'HTML / CSS / SVG'
  })[engine] || engine;
}

function artLabel(art) {
  return ({
    toy3d: 'Toy Town 3D', pixel: 'Pixel Arcade', vector: 'Bright Vector Casual', voxel: 'Blocky / Voxel',
    paper: 'Paper Cutout', outline: 'Cartoon Outline', retro: 'Retro 16-bit', pastel: 'Soft Pastel Casual',
    neon: 'Neon Arcade', isometric: 'Isometric 2.5D', minimal: 'Minimal Clean', industrial: 'Industrial / Mechanical'
  })[art] || art;
}

async function copyIfExists(from, to) {
  try {
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

async function provisionEngine({ engine, factoryDir, gameDir }) {
  const vendorDir = path.join(gameDir, 'vendor');
  if (engine === 'phaser3') {
    const source = path.join(factoryDir, 'node_modules', 'phaser', 'dist', 'phaser.min.js');
    const target = path.join(vendorDir, 'phaser-3.90.0.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Phaser 3.90 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script: './vendor/phaser-3.90.0.min.js', kind: 'script' };
  }
  if (engine === 'phaser4') {
    const source = path.join(factoryDir, 'node_modules', 'phaser4', 'dist', 'phaser.min.js');
    const target = path.join(vendorDir, 'phaser-4.2.1.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Phaser 4.2.1 is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script: './vendor/phaser-4.2.1.min.js', kind: 'script' };
  }
  if (engine === 'three') {
    const source = path.join(factoryDir, 'node_modules', 'three', 'build', 'three.module.min.js');
    const target = path.join(vendorDir, 'three-0.185.1.module.min.js');
    if (!await copyIfExists(source, target)) throw new Error('Three.js is not installed in the Factory yet. Restart the Factory once so npm can install the new engine dependencies.');
    return { script: './vendor/three-0.185.1.module.min.js', kind: 'module' };
  }
  return null;
}

function scaffoldHtml({ title, engine, engineAsset, target }) {
  const safeTitle = escapeHtml(title);
  const engineTag = engineAsset?.kind === 'script' ? `<script src="${engineAsset.script}"></script>` : '';
  const moduleHint = engineAsset?.kind === 'module' ? `<script type="module">import * as THREE from '${engineAsset.script}'; window.THREE = THREE;</script>` : '';
  const poki = target === 'Poki';
  const pokiTag = poki ? `<script src="${POKI_SDK}"></script>` : '';
  const pokiBoot = poki
    ? `window.__POKI_READY__=false;if(window.GutpopperCore){GutpopperCore.poki.init().then(ok=>{window.__POKI_READY__=ok}).catch(()=>{});}`
    : '';
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
POKI PRODUCTION RULES
- Poki SDK and GutpopperCore.poki are already scaffolded. Keep them.
- Call GutpopperCore.poki.loadingFinished() when the actual game is ready.
- Call GutpopperCore.poki.gameplayStart() only when active gameplay begins and gameplayStop() on pause/end/menu transitions.
- Create natural commercial-break opportunities between runs/levels, never during active play.
- Create at least one optional rewarded-ad opportunity that is genuinely useful but not required for progression (retry, bonus reward, temporary boost, etc.).
- Use GutpopperCore.poki.commercialBreak() / rewardedBreak() so local testing safely falls back without pretending an ad reward succeeded.
- Never fake ad success.
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
Make the game visually intentional and polished, not prototype-gray. Use code-generated shapes, SVG, canvas, engine primitives, gradients, particles, procedural/simple vector assets, or lightweight generated geometry appropriate to this style. Avoid copyrighted characters/assets and avoid requiring external art downloads.

GAME DESIGN TARGET
- The first playable loop should be understandable in under 10 seconds.
- Build a complete short-session loop: start -> play -> success/failure -> reward/progression -> replay.
- Aim for a 2–5 minute satisfying session with reasons to immediately replay.
- Include score, progression, upgrades, unlocks, streaks, missions, or another retention layer appropriate to the concept.
- Use the Production Core save helpers for persistent progression when appropriate.
- Include meaningful game feel: juice, hit/collect feedback, transitions, particles, camera/screen feedback, and use the built-in burst/shake/vibrate helpers where they fit.
- Support desktop controls AND excellent touch controls. Prefer one-thumb or simple two-thumb interaction and use the normalized input helper when appropriate.
- Prevent text selection, long-press/callout, context menus, accidental browser gestures, and drag-selection on gameplay UI.
- Fit 390x844 mobile and 1440x900 desktop without horizontal overflow.
${pokiRules}
SCOPE
Build the actual playable v1 prototype now, not a design document or placeholder. Keep it compact enough to iterate quickly, but complete enough to judge whether the core loop is fun. You may create supporting JS/CSS/SVG/data files inside this game folder. Do not edit any other game or Factory file.

QA
The Factory will run desktop/mobile browser QA after you finish. Do not launch your own browser or HTTP server unless absolutely necessary to diagnose a source error. Perform lightweight syntax/source checks and then stop.`;
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
    await fsp.mkdir(gameDir, { recursive: false });
    const engineAsset = await provisionEngine({ engine, factoryDir, gameDir });
    const starterKit = await writeProductionStarterKit({ gameDir, engine, target });
    const metadata = {
      id, title, concept, target, engine, artStyle, opportunity: opportunity || null,
      starterKit: { name: starterKit.name, version: starterKit.version },
      createdBy: 'Gutpopper Game Factory', createdAt: new Date().toISOString()
    };
    await Promise.all([
      fsp.writeFile(path.join(gameDir, 'index.html'), scaffoldHtml({ title, engine, engineAsset, target }), 'utf8'),
      fsp.writeFile(path.join(gameDir, 'factory-game.json'), JSON.stringify(metadata, null, 2), 'utf8')
    ]);
    return {
      id,
      title,
      gameDir,
      engine,
      artStyle,
      starterKit,
      instruction: buildNewGameInstruction({ title, concept, engine, artStyle, opportunityTitle: opportunity, target }),
      metadata
    };
  } catch (error) {
    await fsp.rm(gameDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
