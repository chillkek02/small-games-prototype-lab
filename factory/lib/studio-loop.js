export const STUDIO_LOOP_VERSION = '1.2.0';

export const DEFAULT_STUDIO_LOOP = {
  enabled: true,
  maxIterations: 3,
  maxMinutes: 75,
  visualTarget: 88,
  overallTarget: 82,
  playtestTarget: 70,
  performanceTarget: 75,
  pokiTarget: 75
};

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeStudioLoop(input = {}, { defaultEnabled = false } = {}) {
  const enabled = input?.enabled == null ? defaultEnabled : Boolean(input.enabled);
  return {
    version: STUDIO_LOOP_VERSION,
    enabled,
    maxIterations: clampInt(input?.maxIterations, 1, 6, DEFAULT_STUDIO_LOOP.maxIterations),
    maxMinutes: clampInt(input?.maxMinutes, 15, 180, DEFAULT_STUDIO_LOOP.maxMinutes),
    visualTarget: clampInt(input?.visualTarget, 78, 95, DEFAULT_STUDIO_LOOP.visualTarget),
    overallTarget: clampInt(input?.overallTarget, 70, 95, DEFAULT_STUDIO_LOOP.overallTarget),
    playtestTarget: clampInt(input?.playtestTarget, 55, 95, DEFAULT_STUDIO_LOOP.playtestTarget),
    performanceTarget: clampInt(input?.performanceTarget, 55, 95, DEFAULT_STUDIO_LOOP.performanceTarget),
    pokiTarget: clampInt(input?.pokiTarget, 55, 95, DEFAULT_STUDIO_LOOP.pokiTarget)
  };
}

export function studioLoopScore(audit = {}) {
  const visual = Number(audit.visualScore || 0);
  const overall = Number(audit.overallScore || 0);
  const play = Number(audit.playtestScore || audit.interactionScore || 0);
  const perf = Number(audit.performanceScore || 0);
  const retention = Number(audit.retentionScore || 0);
  const ads = audit.adReadiness?.applicable === false ? 100 : Number(audit.adScore || 0);
  const poki = Number(audit.pokiScore || 0);
  const technicalBonus = audit.qa?.passed ? 6 : 0;
  const gateBonus = (audit.visualFloorPassed ? 5 : 0) + (audit.retentionPassed ? 3 : 0) + (audit.adPassed ? 3 : 0);
  return Math.max(0, Math.min(100, Math.round(
    visual * .38 + overall * .20 + play * .10 + perf * .10 + retention * .08 + ads * .07 + poki * .07 + technicalBonus + gateBonus
  )));
}

export function studioLoopSatisfied(audit = {}, config = DEFAULT_STUDIO_LOOP) {
  const adPass = audit.adReadiness?.applicable === false || Boolean(audit.adPassed);
  const target = audit.readiness?.source?.hasPokiSdk || audit.adReadiness?.applicable !== false;
  const pokiPass = !target || Number(audit.pokiScore || 0) >= config.pokiTarget;
  return Boolean(
    audit.qa?.passed &&
    audit.visualFloorPassed &&
    audit.retentionPassed &&
    adPass &&
    Number(audit.visualScore || 0) >= config.visualTarget &&
    Number(audit.overallScore || 0) >= config.overallTarget &&
    Number(audit.playtestScore || audit.interactionScore || 0) >= config.playtestTarget &&
    Number(audit.performanceScore || 0) >= config.performanceTarget &&
    pokiPass
  );
}

export function loopAuditSummary(audit = {}, config = DEFAULT_STUDIO_LOOP) {
  const ad = audit.adReadiness?.applicable === false ? 'N/A' : `${audit.adScore ?? '—'}/100 ${audit.adPassed ? 'PASS' : 'FAIL'}`;
  return [
    `Studio score: ${studioLoopScore(audit)}/100`,
    `Overall: ${audit.overallScore ?? '—'}/100 (target ${config.overallTarget})`,
    `Visual: ${audit.visualScore ?? '—'}/100 (target ${config.visualTarget}; floor ${audit.visualFloor?.minimumPrototypeScore ?? 78})`,
    `Depth/lighting: ${audit.visualFloor?.categories?.depthLighting ?? '—'}/100`,
    `Animation/motion: ${audit.visualFloor?.categories?.animationPolish ?? '—'}/100`,
    `World richness: ${audit.visualFloor?.categories?.worldRichness ?? '—'}/100`,
    `Game feel: ${audit.visualFloor?.categories?.gameFeel ?? '—'}/100`,
    `AI playtest: ${audit.playtestScore ?? audit.interactionScore ?? '—'}/100 (target ${config.playtestTarget})`,
    `Retention: ${audit.retentionScore ?? '—'}/100 ${audit.retentionPassed ? 'PASS' : 'FAIL'}`,
    `Ad readiness: ${ad}`,
    `Performance: ${audit.performanceScore ?? '—'}/100 (target ${config.performanceTarget})`,
    `Poki readiness: ${audit.pokiScore ?? '—'}/100 (target ${config.pokiTarget})`,
    `Technical QA: ${audit.qa?.passed ? 'PASS' : 'FAIL'}`
  ].join('\n');
}

function notes(value) {
  return Array.isArray(value) && value.length ? value.map(x => `- ${x}`).join('\n') : '- none';
}

export function buildStudioLoopPrompt({ game, audit, iteration, config }) {
  const floor = audit.visualFloor || {};
  const categories = Object.entries(floor.categories || {}).map(([k, v]) => `- ${k}: ${v}/100`).join('\n') || '- unavailable';
  const hardFails = floor.hardFails?.length ? floor.hardFails.map(x => `- ${x}`).join('\n') : '- none';
  return `model: sol\nYou are the GUTPOPPER STUDIO LOOP IMPLEMENTER. This is autonomous long-horizon quality iteration ${iteration}/${config.maxIterations}.\n\nGOAL\nTurn the current game into a professional, commercially credible game rather than an AI prototype. Work only in the current game folder: ${game}. Preserve the core mechanic unless the audit proves it is broken. Do not commit, push, install unrelated dependencies, or edit outside this game.\n\nQUALITY TARGETS\n${loopAuditSummary(audit, config)}\n\nVISUAL CATEGORY SCORES\n${categories}\n\nVISUAL HARD FAILS\n${hardFails}\n\nVISUAL DIRECTOR REPORT\n${audit.visualReport || 'unavailable'}\n\nAI PLAYTEST FINDINGS\n${notes(audit.playtest?.notes)}\n\nRETENTION FINDINGS\n${notes(audit.retention?.notes)}\n\nAD FINDINGS\n${notes(audit.adReadiness?.notes)}\n\nPERFORMANCE FINDINGS\n${notes(audit.readiness?.performanceNotes)}\n\nPOKI FINDINGS\n${notes(audit.readiness?.pokiNotes)}\n\nTECHNICAL ISSUES\n${notes(audit.qa?.issues)}\n\nLOOP RULES\n- Do one substantial, coherent improvement round, then stop so the external evaluator can run again.\n- Work from the weakest measured areas first. Do not make random feature additions.\n- PRODUCTION LIBRARY FIRST: inspect and reuse ./starter/ui-menu.js, ./starter/model-forge.js, ./starter/presentation.js, ./starter/asset-kit.js and ./starter/shader-vfx.js when present. Do not hand-rebuild generic menus/HUD/result screens or generic scenery if a themed Forge foundation already exists. Spend the iteration on the unique hook, theme, hero assets and measured weaknesses.\n- VISUAL QUALITY IS THE PRIMARY DIFFERENTIATOR: replace primitive-looking major assets with layered/multi-part authored-looking assets; increase environment dressing, depth, lighting, shadows, material identity and readable detail.\n- MODEL/PREFAB PASS: use Model Forge common buildings/storefronts/lamps/fences/furniture/signage for secondary scenery, then kitbash/recolor them. For unique small silhouettes/details, consider compact SVG-style paths with extrudePath()/layeredVector() before adding heavy bitmap/model payload. Important hero objects that need multiple viewing angles or skeletal animation should still be true multi-part/proper 3D assets.\n- UI PASS: use GutpopperUI for pause/result/rewarded/shop/HUD structure, then theme it. Keep one-tap replay/continue obvious and avoid menu chains that hurt session-zero conversion.\n- MATERIAL/SHADER PASS: where the screen looks flat, prefer lightweight procedural material treatment over larger texture downloads. Use toyPlastic/toon/rim/gradient/wobble/water/dissolve/emissive/glow/shockwave effects selectively to reinforce focal objects, theme and interactions. Reuse shared materials and shader programs.\n- PERFORMANCE VETO: the Shader/VFX Forge fullscreen postprocess budget is zero by default. Do not add SSAO, motion blur, depth-of-field, multi-pass bloom chains, huge transparent fog, or many realtime point lights unless measured performance proves headroom. If an effect harms phone FPS, simplify/remove the cosmetic effect.\n- Animation must feel authored: anticipation, easing, overshoot, secondary motion, squash/stretch where stylistically appropriate, particles/trails, contact reactions, camera response, polished win/fail beats.\n- If Three.js is used, prefer genuine 3D composition with lit materials, soft shadows, atmospheric depth and optimized reusable geometry/InstancedMesh where appropriate. Keep shader animation focused on hero/focal surfaces rather than every prop.\n- If Phaser is used, build 2.5D depth with layered art, shadows, parallax, particles, tweened motion and lightweight built-in effects instead of flat web-UI composition.\n- Preserve or improve fast startup and frame pacing. Reuse materials/geometries; do not solve quality by dumping huge assets into initial load.\n- Preserve desktop + phone controls and Poki lifecycle/ad behavior. Rewarded ads remain optional.\n- If retention or playtest scores are weak, improve the smallest real cause rather than adding meaningless systems.\n- Do not optimize for the numeric score by hiding problems; make the player-facing game genuinely better.\n- Run lightweight syntax/source checks when practical. The Factory will do browser QA, playtesting and screenshot evaluation after you stop.\n\nMake the improvements directly now.`;
}
