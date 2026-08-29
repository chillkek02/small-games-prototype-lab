import { runRetentionAudit } from './retention.js';

export const RETENTION_FIRST_PROTOTYPE_MINIMUM = 65;

export async function runRetentionGate({ gameDir, gameUrl }) {
  try {
    return await runRetentionAudit({ gameDir, url: gameUrl });
  } catch (error) {
    return {
      score: 0,
      passed: false,
      minimumPrototypeScore: RETENTION_FIRST_PROTOTYPE_MINIMUM,
      notes: [`Retention gate could not complete: ${error.message}`],
      error: error.message,
      source: {}
    };
  }
}

export function buildAutomaticRetentionPrompt({ game, retention }) {
  const source = retention.source || {};
  const notes = (retention.notes || []).map((note, index) => `${index + 1}. ${note}`).join('\n') || 'No specific notes were returned.';
  return `model: terra\nYou are the AUTOMATIC RETENTION / REPLAY POLISH agent inside Gutpopper Game Factory.\n\nTARGET GAME\n${game}\n\nThe playable prototype passed its required technical and visual checks, but its replay/retention score is below the Factory first-prototype minimum of ${retention.minimumPrototypeScore || RETENTION_FIRST_PROTOTYPE_MINIMUM}/100. Current score: ${retention.score}/100.\n\nCURRENT SIGNALS\n- persistent save system: ${Boolean(source.persistence)}\n- upgrades/unlocks: ${Boolean(source.upgrades)}\n- score/best-run chase: ${Boolean(source.scoreChase)}\n- missions/challenges: ${Boolean(source.missions)}\n- progression/levels/currency: ${Boolean(source.progression)}\n- randomized or escalating variation: ${Boolean(source.variation)}\n- verified quick replay route: ${Boolean(retention.restartAvailable || retention.secondRunStarted)}\n- storage changed during probe: ${Boolean(retention.storageMutated)}\n- storage survived reload: ${Boolean(retention.persistedAfterReload)}\n\nRETENTION FINDINGS\n${notes}\n\nGOAL\nMake the smallest high-value production changes that create a convincing one-more-run loop without bloating the game or changing its core fantasy. Preserve all working gameplay, controls, responsive desktop/phone layouts, visual quality, performance, Poki SDK behavior, and optional rewarded-ad hooks.\n\nACCEPTABLE RETENTION PATTERNS\nChoose what genuinely fits this game. Do NOT force all of these:\n- frictionless one-tap replay after success/failure\n- high score / personal best / combo or streak chase\n- small persistent currency + meaningful upgrade choices\n- missions/challenges/goals\n- escalating levels/difficulty/waves\n- randomized layouts/spawns/objectives that make runs differ\n- unlocks/cosmetics/tools that visibly change the next run\n\nRULES\n- If adding persistence, use the existing GutpopperCore save/load helpers when available.\n- Upgrades must produce a noticeable gameplay or strategic difference; do not add fake stat labels with no effect.\n- Do not make rewarded ads mandatory for progression.\n- Do not add grind merely to manufacture retention.\n- Keep retry/replay fast; avoid unnecessary result screens or menu chains.\n- Do not add unrelated dependencies or external services.\n- Do not reduce visual quality to make room for retention UI; integrate it cleanly into the existing art direction.\n- Work only in this game folder. Do not commit or push.\n\nImplement the improvements now, perform only lightweight source/syntax checks, then stop. Factory QA and retention recheck will run automatically.`;
}
