const POKI_BASE = 'https://poki.com';

const CATEGORY_SOURCES = {
  driving: '/en/driving',
  puzzle: '/en/puzzle',
  action: '/en/action',
  simulation: '/en/simulation',
  sports: '/en/sports',
  dressup: '/en/dress-up',
  skill: '/en/skill',
  adventure: '/en/adventure'
};

const ENGINE_OPTIONS = [
  { id: 'auto', label: 'Factory Recommended', description: 'Let the Factory choose from the concept.' },
  { id: 'vanilla', label: 'Vanilla Canvas / SVG / JS', description: 'Smallest footprint; great for simple casual mechanics.' },
  { id: 'phaser3', label: 'Phaser 3.90 — Poki Safe', description: 'Best default for polished 2D action, arcade, physics, platformers, and puzzle games.' },
  { id: 'phaser4', label: 'Phaser 4.2.1 — Modern 2D', description: 'Newest Phaser renderer and effects for advanced 2D presentation.' },
  { id: 'three', label: 'Three.js', description: 'Best for lightweight toy-like 3D, vehicles, low-poly worlds, and spatial gameplay.' },
  { id: 'dom', label: 'HTML / CSS / SVG', description: 'Best for board, card, word, UI-heavy, and highly accessible games.' }
];

const ART_OPTIONS = [
  { id: 'auto', label: 'Factory Recommended' },
  { id: 'toy3d', label: 'Toy Town 3D' },
  { id: 'pixel', label: 'Pixel Arcade' },
  { id: 'vector', label: 'Bright Vector Casual' },
  { id: 'voxel', label: 'Blocky / Voxel' },
  { id: 'paper', label: 'Paper Cutout' },
  { id: 'outline', label: 'Cartoon Outline' },
  { id: 'retro', label: 'Retro 16-bit' },
  { id: 'pastel', label: 'Soft Pastel Casual' },
  { id: 'neon', label: 'Neon Arcade' },
  { id: 'isometric', label: 'Isometric 2.5D' },
  { id: 'minimal', label: 'Minimal Clean' },
  { id: 'industrial', label: 'Industrial / Mechanical' }
];

const CONCEPT_LIBRARY = [
  {
    title: 'Tow Truck Trouble', slug: 'tow-truck-trouble', category: 'driving', genre: 'Vehicle Job Sim',
    hook: 'Race to stranded cars, hook them correctly, dodge traffic, and deliver them before the job timer expires.',
    engine: 'three', art: 'toy3d', mobileFit: 96, adFit: 92, buildFit: 89,
    why: ['Vehicle controls are immediately understandable', 'Job structure supports short repeatable sessions', 'Tow-hook interaction differentiates it from racing', 'Natural upgrade and rewarded-retry moments']
  },
  {
    title: 'Cleanup Crew', slug: 'cleanup-crew', category: 'simulation', genre: 'Cleanup / Job Sim',
    hook: 'Drive or run through messy locations, vacuum, wash, sort, and restore each area under a satisfying completion meter.',
    engine: 'phaser3', art: 'vector', mobileFit: 98, adFit: 90, buildFit: 95,
    why: ['Satisfying transformation loop reads instantly on mobile', 'Simple touch controls', 'Strong level and tool-upgrade structure', 'Low bespoke-content requirement']
  },
  {
    title: 'Parcel Panic', slug: 'parcel-panic', category: 'driving', genre: 'Delivery Arcade',
    hook: 'Deliver a stack of packages through tiny neighborhoods while balancing speed, route choice, and fragile cargo.',
    engine: 'three', art: 'toy3d', mobileFit: 95, adFit: 88, buildFit: 91,
    why: ['Combines proven driving with a clear job fantasy', 'Routes create replayability without complex content', 'Easy one-thumb steering', 'Upgradeable vehicle and package capacity']
  },
  {
    title: 'Dungeon Conveyor', slug: 'dungeon-conveyor', category: 'puzzle', genre: 'Sorting / Automation Puzzle',
    hook: 'Route fantasy loot along belts into the correct chests while traps, cursed items, and greedy mimics disrupt the line.',
    engine: 'phaser3', art: 'pixel', mobileFit: 91, adFit: 82, buildFit: 90,
    why: ['Puzzle clarity works well in portrait or landscape', 'Fantasy theme makes sorting less generic', 'Short levels support rapid iteration', 'Easy to expand with modifiers']
  },
  {
    title: 'Fire Escape!', slug: 'fire-escape', category: 'action', genre: 'Rescue Action',
    hook: 'Guide civilians through compact burning buildings by opening safe routes, extinguishing hazards, and making split-second rescues.',
    engine: 'phaser3', art: 'vector', mobileFit: 93, adFit: 89, buildFit: 88,
    why: ['Strong readable stakes', 'Short missions fit browser sessions', 'Touch-friendly tap/drag interactions', 'Natural second-chance rewarded ad']
  },
  {
    title: 'Pocket Demolition', slug: 'pocket-demolition', category: 'skill', genre: 'Destruction Skill',
    hook: 'Place a limited number of charges on tiny structures and trigger the cleanest collapse while protecting marked objects.',
    engine: 'phaser3', art: 'voxel', mobileFit: 92, adFit: 84, buildFit: 85,
    why: ['One-tap setup and payoff loop', 'Highly GIF-able destruction moments', 'Levels can reuse modular geometry', 'Scores and bonus objectives drive replay']
  },
  {
    title: 'Tiny Shop Rush', slug: 'tiny-shop-rush', category: 'simulation', genre: 'Micro Tycoon',
    hook: 'Run a tiny counter-service shop: restock, serve a queue, reinvest profits, and survive increasingly chaotic rushes.',
    engine: 'phaser3', art: 'pastel', mobileFit: 97, adFit: 93, buildFit: 92,
    why: ['Very clear progression fantasy', 'Queue pressure adds action to idle/tycoon structure', 'Strong upgrade cadence', 'Rewarded boosts fit naturally']
  },
  {
    title: 'Goalie Goblin', slug: 'goalie-goblin', category: 'sports', genre: 'Sports Skill',
    hook: 'Defend a fantasy goal against ridiculous trick shots, magic balls, and boss shooters using quick swipes and catches.',
    engine: 'phaser3', art: 'outline', mobileFit: 96, adFit: 81, buildFit: 94,
    why: ['Sports interaction is instantly legible', 'Fantasy twist creates identity', 'Very low control complexity', 'Endless challenge mode is cheap to produce']
  }
];

const FALLBACK_SIGNAL = {
  driving: { demand: 84, saturation: 72, popularOverlap: 5, newOverlap: 8 },
  puzzle: { demand: 82, saturation: 83, popularOverlap: 4, newOverlap: 12 },
  action: { demand: 80, saturation: 86, popularOverlap: 4, newOverlap: 14 },
  simulation: { demand: 78, saturation: 68, popularOverlap: 3, newOverlap: 14 },
  sports: { demand: 74, saturation: 70, popularOverlap: 2, newOverlap: 7 },
  dressup: { demand: 73, saturation: 75, popularOverlap: 1, newOverlap: 10 },
  skill: { demand: 79, saturation: 80, popularOverlap: 3, newOverlap: 11 },
  adventure: { demand: 70, saturation: 72, popularOverlap: 1, newOverlap: 6 }
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function fetchText(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 GutpopperGameFactory/0.3 market-research',
        'accept-language': 'en-US,en;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractGameSlugs(html = '') {
  const set = new Set();
  const patterns = [
    /href=["']\/en\/g\/([^"'?#/]+)[^"']*["']/gi,
    /href=["']https:\/\/poki\.com\/en\/g\/([^"'?#/]+)[^"']*["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) set.add(match[1].toLowerCase());
  }
  return set;
}

async function collectSignals() {
  const sources = {
    popular: `${POKI_BASE}/en/popular`,
    new: `${POKI_BASE}/en/new`,
    categories: Object.fromEntries(Object.entries(CATEGORY_SOURCES).map(([key, rel]) => [key, `${POKI_BASE}${rel}`]))
  };

  try {
    const [popularHtml, newHtml, ...categoryHtml] = await Promise.all([
      fetchText(sources.popular),
      fetchText(sources.new),
      ...Object.values(sources.categories).map(url => fetchText(url))
    ]);
    const popular = extractGameSlugs(popularHtml);
    const fresh = extractGameSlugs(newHtml);
    const stats = {};
    Object.keys(CATEGORY_SOURCES).forEach((category, index) => {
      const games = extractGameSlugs(categoryHtml[index] || '');
      const popularOverlap = [...games].filter(game => popular.has(game)).length;
      const newOverlap = [...games].filter(game => fresh.has(game)).length;
      const total = games.size;
      const demand = clamp(52 + popularOverlap * 7 + Math.min(newOverlap, 8) * 1.5);
      const saturation = clamp(35 + Math.min(total, 120) * 0.48 + Math.min(newOverlap, 14) * 1.5);
      stats[category] = { demand, saturation, popularOverlap, newOverlap, observedGames: total };
    });
    return { live: true, checkedAt: new Date().toISOString(), sources, stats };
  } catch (error) {
    return {
      live: false,
      checkedAt: new Date().toISOString(),
      sources,
      error: error.message,
      stats: FALLBACK_SIGNAL
    };
  }
}

function scoreConcept(concept, signal) {
  const demand = signal?.demand ?? 70;
  const saturation = signal?.saturation ?? 75;
  const whitespace = 100 - saturation;
  const score = clamp(
    demand * 0.34 +
    whitespace * 0.19 +
    concept.mobileFit * 0.20 +
    concept.adFit * 0.14 +
    concept.buildFit * 0.13
  );
  return {
    ...concept,
    score,
    demand,
    saturation,
    whitespace: clamp(whitespace),
    confidence: score >= 82 ? 'High' : score >= 72 ? 'Medium-High' : 'Medium'
  };
}

export async function getOpportunityReport() {
  const market = await collectSignals();
  const opportunities = CONCEPT_LIBRARY
    .map(concept => scoreConcept(concept, market.stats[concept.category]))
    .sort((a, b) => b.score - a.score);

  return {
    platform: 'Poki',
    generatedAt: new Date().toISOString(),
    market,
    opportunities,
    methodology: 'Scores combine observed Poki category/popular/new-page overlap with mobile fit, monetization fit, production fit, and category saturation. This ranks opportunities; it does not guarantee commercial performance.',
    engines: ENGINE_OPTIONS,
    artStyles: ART_OPTIONS
  };
}

export function getCreatorOptions() {
  return { engines: ENGINE_OPTIONS, artStyles: ART_OPTIONS, concepts: CONCEPT_LIBRARY };
}

export function resolveRecommendation({ concept = '', engine = 'auto', artStyle = 'auto', category = '' } = {}) {
  const normalized = String(concept).toLowerCase();
  let candidate = CONCEPT_LIBRARY.find(item => item.slug === category || item.title.toLowerCase() === normalized);
  if (!candidate) {
    if (/drive|truck|car|tow|delivery|vehicle|road/.test(normalized)) candidate = CONCEPT_LIBRARY[0];
    else if (/shop|tycoon|serve|restaurant|store|clean|job/.test(normalized)) candidate = CONCEPT_LIBRARY[6];
    else if (/puzzle|sort|belt|conveyor/.test(normalized)) candidate = CONCEPT_LIBRARY[3];
    else if (/3d|world|city/.test(normalized)) candidate = { engine: 'three', art: 'toy3d' };
    else candidate = { engine: 'phaser3', art: 'vector' };
  }
  return {
    engine: engine === 'auto' ? candidate.engine : engine,
    artStyle: artStyle === 'auto' ? candidate.art : artStyle
  };
}
