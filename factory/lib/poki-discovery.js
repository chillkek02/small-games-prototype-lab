export const DISCOVERY_POLICY_VERSION = '1.0.0';

export const POKI_DISCOVERY_POLICY = {
  version: DISCOVERY_POLICY_VERSION,
  purpose: 'Build many small, polished web-game hypotheses quickly; use real Poki player data to kill, iterate, or promote them.',
  internalTargets: {
    firstMeaningfulInputSeconds: 8,
    firstRewardSeconds: 25,
    firstLoopSecondsMin: 60,
    firstLoopSecondsMax: 180,
    visualTarget: 88,
    performanceTarget: 75
  },
  pokiPublishedTargets: {
    playerFitAdvanceAverageMinutes: 3,
    playerFitAdvanceOver3MinutesPercent: 25,
    strongAverageMinutes: 5,
    strongSimulationAverageMinutes: 10,
    webFitConversionToPlayPercent: 65,
    typicalPokiConversionToPlayPercent: 70,
    typicalPokiAverageMinutes: 6
  }
};

const SIMULATION_PATTERN = /sim|tycoon|shop|store|restaurant|clean|job|life|management|factory|idle/i;

function clip(value, max = 700) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createPrototypePlan({ title, concept, target = 'Poki', engine = 'auto', artStyle = 'auto', opportunity = '' } = {}) {
  const simulationLike = SIMULATION_PATTERN.test(`${title} ${concept}`);
  const strongMinutes = simulationLike
    ? POKI_DISCOVERY_POLICY.pokiPublishedTargets.strongSimulationAverageMinutes
    : POKI_DISCOVERY_POLICY.pokiPublishedTargets.strongAverageMinutes;
  return {
    version: DISCOVERY_POLICY_VERSION,
    title: clip(title, 100),
    concept: clip(concept, 1200),
    opportunity: opportunity || null,
    target,
    engine,
    artStyle,
    strategy: 'minimum-delight-loop',
    playerPromise: 'The player should understand what is fun here almost immediately, get a satisfying response quickly, complete a short loop, and have an obvious reason to replay.',
    designContract: {
      noMandatorySplash: true,
      visualOnboardingPreferred: true,
      beginnerSafety: true,
      portraitFriendlyWhenConceptAllows: true,
      lowTextGlobalReadability: true,
      broadInclusiveAppeal: true,
      sessionZeroFirst: true,
      loopSeconds: [POKI_DISCOVERY_POLICY.internalTargets.firstLoopSecondsMin, POKI_DISCOVERY_POLICY.internalTargets.firstLoopSecondsMax],
      firstMeaningfulInputSecondsTarget: POKI_DISCOVERY_POLICY.internalTargets.firstMeaningfulInputSeconds,
      firstRewardSecondsTarget: POKI_DISCOVERY_POLICY.internalTargets.firstRewardSeconds
    },
    hypotheses: [
      { id: 'hook', question: 'Does the opening action create an immediate satisfying visual/gameplay response?', event: ['onboarding','first-action','interact'] },
      { id: 'clarity', question: 'Can players understand the goal without reading a wall of text?', event: ['tutorial','core','complete'] },
      { id: 'loop', question: 'Will players complete a first meaningful run/round and voluntarily replay?', event: ['run','1','complete'] },
      { id: 'retention', question: 'Is there a meaningful second-run reason: mastery, score, variation, unlock, challenge, or progression?', event: ['milestone','second-run','reached'] },
      { id: 'monetization', question: 'Are optional rewarded opportunities visible and attractive without being necessary?', event: ['rewarded','primary','visible'] }
    ],
    externalDecisionTargets: {
      playerFitMinimum: `>${POKI_DISCOVERY_POLICY.pokiPublishedTargets.playerFitAdvanceAverageMinutes} min average AND >=${POKI_DISCOVERY_POLICY.pokiPublishedTargets.playerFitAdvanceOver3MinutesPercent}% of plays over 3 min`,
      strongPlaytimeTarget: `${strongMinutes}+ min average`,
      webFitConversionTarget: `${POKI_DISCOVERY_POLICY.pokiPublishedTargets.webFitConversionToPlayPercent}%+ C2P`,
      ctr: 'Compare against the category benchmark returned by Poki; no universal CTR target is assumed.'
    },
    decisionRules: {
      prototype: 'Do not overbuild content before the core loop survives internal QA and a real-player baseline test.',
      iterate: 'If recordings reveal one clear repairable onboarding, control, difficulty, or presentation problem, fix that hypothesis and retest.',
      killOrPark: 'If repeated player-fit tests remain below Poki advancement thresholds after obvious friction is removed, park the concept instead of polishing indefinitely.',
      promote: `Prioritize games that clear testing thresholds and move toward ${strongMinutes}+ minute average playtime while preserving high C2P, visual quality, performance, and replayability.`
    },
    evidenceLabels: {
      internalTargets: 'Gutpopper Factory targets, chosen to enforce fast attention capture; not official Poki pass/fail numbers.',
      pokiPublishedTargets: 'Targets/benchmarks published in current Poki developer documentation.'
    }
  };
}

export function discoveryBrief(plan) {
  return `GUTPOPPER DISCOVERY ENGINE v${DISCOVERY_POLICY_VERSION}\nThis project is a market hypothesis, not a precious long-term production. Build the smallest HIGH-QUALITY version that can prove whether real players want more.\n\nSESSION-0 CONTRACT\n- Get to meaningful interaction immediately; avoid mandatory splash/menu chains.\n- Internal target: meaningful player input within ~${plan.designContract.firstMeaningfulInputSecondsTarget}s and a satisfying reward/response within ~${plan.designContract.firstRewardSecondsTarget}s. These are Gutpopper targets, not official Poki thresholds.\n- First meaningful loop should normally land around ${plan.designContract.loopSeconds[0]}-${plan.designContract.loopSeconds[1]} seconds.\n- Prefer visual/gesture onboarding and safe early play over explanatory text.\n- Mobile-first and portrait-friendly when the mechanic allows it, while desktop remains intentionally composed.\n- Build for a global, broad audience. Do not gender-stereotype mechanics or themes.\n\nWHAT WE ARE TRYING TO PROVE\n${plan.hypotheses.map(x => `- ${x.id}: ${x.question}`).join('\n')}\n\nREAL-PLAYER FUNNEL\n- Poki Player Fit advancement baseline: >3 min average and >=25% of plays over 3 min.\n- Strong target: ${plan.externalDecisionTargets.strongPlaytimeTarget}.\n- Web Fit C2P target: ${plan.externalDecisionTargets.webFitConversionTarget}; CTR is category-relative.\n- Build, measure, learn, repeat. Do not keep polishing a concept that repeatedly fails after obvious friction is removed.\n\nThe Factory will instrument meaningful Game Events so Poki testing can tell us WHY players stay or leave.`;
}
