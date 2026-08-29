export const VISUAL_QUALITY_FLOOR = {
  version: '1.0.0',
  minimumPrototypeScore: 70,
  publishCandidateScore: 80,
  hardFailCap: 59,
  categories: [
    { id: 'artDirection', label: 'Art direction / cohesion', weight: 20 },
    { id: 'uiTypography', label: 'UI / typography', weight: 15 },
    { id: 'composition', label: 'Composition / responsive layout', weight: 15 },
    { id: 'worldRichness', label: 'World / asset richness', weight: 15 },
    { id: 'gameFeel', label: 'Game feel / feedback', weight: 15 },
    { id: 'readability', label: 'Readability / silhouettes', weight: 10 },
    { id: 'finish', label: 'Professional finish / personality', weight: 10 }
  ],
  hardFails: [
    { id: 'placeholder_primitive_dominance', label: 'Major characters, props, environment, or UI still read primarily as raw placeholder rectangles/circles/primitives.' },
    { id: 'raw_default_ui', label: 'UI looks like raw/default browser, debug, spreadsheet, Windows-95/98, or programmer-tool controls rather than intentional game UI.' },
    { id: 'dead_space_desktop', label: 'Desktop composition wastes large portions of the viewport with empty/decorative gutters, giant low-value panels, or weakly used space.' },
    { id: 'phone_layout_on_desktop', label: 'Desktop is effectively a narrow portrait/mobile composition pasted into a landscape window.' },
    { id: 'broken_readability', label: 'Important text, controls, objectives, player/enemy silhouettes, or interaction targets are unreadable, clipped, obscured, or visually ambiguous.' },
    { id: 'missing_or_broken_presentation', label: 'Missing assets, obvious broken rendering, severe visual overlap, debug artifacts, or unfinished presentation are visible.' },
    { id: 'no_feedback', label: 'Core actions have essentially no visible feedback, reward response, movement response, impact, pickup, cleanup, hit, success, or failure presentation.' },
    { id: 'incoherent_style', label: 'The screen mixes incompatible colors, fonts, panel styles, shape languages, or asset treatments without a deliberate visual system.' }
  ]
};

export function visualQualityBrief() {
  const categoryText = VISUAL_QUALITY_FLOOR.categories.map(item => `- ${item.label}: ${item.weight}%`).join('\n');
  const failText = VISUAL_QUALITY_FLOOR.hardFails.map(item => `- ${item.id}: ${item.label}`).join('\n');
  return `GUTPOPPER VISUAL QUALITY FLOOR v${VISUAL_QUALITY_FLOOR.version}\nA first playable prototype is not acceptable merely because it works. It must already look like a promising modern casual game prototype.\n\nMINIMUM FIRST-PROTOTYPE BAR\n- Weighted visual score must be at least ${VISUAL_QUALITY_FLOOR.minimumPrototypeScore}/100.\n- No visual hard-fail condition may be present.\n- Aim for ${VISUAL_QUALITY_FLOOR.publishCandidateScore}/100+ when practical without bloating scope or load time.\n\nSCORING\n${categoryText}\n\nHARD FAILS\n${failText}\n\nGENERATION RULES\n- Do not use raw primitive boxes/circles as the final visual language for major characters, environments, vehicles, props, or HUD unless the chosen art direction intentionally stylizes them into cohesive assets with layering, detail, hierarchy, shadows/lighting, and personality.\n- Avoid giant flat sidebars, beige debug panels, raw bordered boxes, default-looking controls, and spreadsheet/dashboard composition.\n- Establish a deliberate palette, typography hierarchy, button/card language, shape language, scene density, and feedback language before filling the screen.\n- Desktop and phone may use different composition rules. Desktop should feel intentionally landscape; phone should feel intentionally touch-first.\n- Include enough environment/prop variety and depth that the scene does not read as an empty test room.\n- Core actions need visible juice: motion, particles, squash/pop, trail, flash, score/combo response, camera response, or another appropriate feedback system.\n- Simple is allowed. Crude, default, empty, or programmer-art presentation is not.\n- Protect fast loading and mobile performance while meeting the visual bar.`;
}

function clampScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function parseVisualRubric(text = '') {
  const match = String(text).match(/VISUAL_RUBRIC_JSON\s*```json\s*([\s\S]*?)```/i)
    || String(text).match(/VISUAL_RUBRIC_JSON\s*({[\s\S]*?})\s*(?:$|\n##)/i);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[1]); } catch { return null; }

  const categories = {};
  let weighted = 0;
  let totalWeight = 0;
  for (const item of VISUAL_QUALITY_FLOOR.categories) {
    const score = clampScore(parsed?.categories?.[item.id]);
    categories[item.id] = score;
    weighted += score * item.weight;
    totalWeight += item.weight;
  }
  let score = totalWeight ? Math.round(weighted / totalWeight) : 0;
  const allowedFails = new Set(VISUAL_QUALITY_FLOOR.hardFails.map(item => item.id));
  const hardFails = Array.isArray(parsed?.hardFails)
    ? [...new Set(parsed.hardFails.map(String).filter(id => allowedFails.has(id)))]
    : [];
  if (hardFails.length) score = Math.min(score, VISUAL_QUALITY_FLOOR.hardFailCap);

  const status = hardFails.length || score < 60
    ? 'VISUAL_FAIL'
    : score < VISUAL_QUALITY_FLOOR.minimumPrototypeScore
      ? 'NEEDS_POLISH'
      : 'PASS';

  return {
    version: VISUAL_QUALITY_FLOOR.version,
    score,
    status,
    passed: status === 'PASS',
    minimumPrototypeScore: VISUAL_QUALITY_FLOOR.minimumPrototypeScore,
    publishCandidateScore: VISUAL_QUALITY_FLOOR.publishCandidateScore,
    categories,
    hardFails,
    summary: typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 800) : ''
  };
}

export function visualRubricAuditInstructions() {
  const ids = VISUAL_QUALITY_FLOOR.categories.map(item => `\"${item.id}\"`).join(', ');
  const failIds = VISUAL_QUALITY_FLOOR.hardFails.map(item => `\"${item.id}\"`).join(', ');
  return `${visualQualityBrief()}\n\nAUDIT OUTPUT REQUIREMENT\nAfter your normal markdown report, append exactly this machine-readable block:\nVISUAL_RUBRIC_JSON\n\`\`\`json\n{\n  \"categories\": { ${ids.split(', ').map(id => `${id}: 0`).join(', ')} },\n  \"hardFails\": [],\n  \"summary\": \"one concise sentence\"\n}\n\`\`\`\nEach category score is 0-100. Use hard-fail IDs only from: ${failIds}. Do not soften the score because the game is an early prototype.`;
}
