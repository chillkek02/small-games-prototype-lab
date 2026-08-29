export const TREND_RADAR_VERSION = '1.0.0';

export const TREND_ARCHETYPES = [
  { id:'style_identity', label:'Style / identity / customization', pattern:/dress|style|fashion|makeover|avatar|outfit|beauty/i },
  { id:'obby_skill', label:'Obby / skill / mastery', pattern:/obby|parkour|escape|pounce|level-devil|hook|jump|climb/i },
  { id:'viral_absurd', label:'Viral / absurd / meme energy', pattern:/brainrot|slime|buddy|weird|meme|crazy|chaos/i },
  { id:'social_competition', label:'Social / multiplayer / competition', pattern:/battle|tag|\.io|2-player|multiplayer|party|versus|race/i },
  { id:'life_pet_sim', label:'Life / pets / accessible simulation', pattern:/pet|life|family|mart|shop|simulator|store|restaurant|farm/i },
  { id:'satisfying_transform', label:'Satisfying transformation / destruction', pattern:/paint|clean|smash|kick|shape|sort|wash|destroy|demol|repair/i },
  { id:'runner_driving', label:'Runner / driving / movement mastery', pattern:/subway|drift|train|road|car|drive|runner|run|bike/i },
  { id:'puzzle_brain', label:'Puzzle / brain / classic rules', pattern:/chess|ludo|block|puzzle|shape|merge|match|brain|word/i },
  { id:'adventure_explore', label:'Adventure / exploration / recovery', pattern:/adventure|backrooms|world|dungeon|recovery|quest|island|cave/i }
];

const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(v)));

export function analyzeTrendSlugs(popularGames=[],newGames=[]) {
  const popular=popularGames.map(String), fresh=newGames.map(String);
  const trends=TREND_ARCHETYPES.map(item=>{
    const pop=popular.filter(x=>item.pattern.test(x)).length;
    const newer=fresh.filter(x=>item.pattern.test(x)).length;
    const heat=clamp(35+pop*13+newer*7);
    return {id:item.id,label:item.label,popularHits:pop,newHits:newer,heat};
  }).sort((a,b)=>b.heat-a.heat);
  return trends;
}

export function trendFit(tags=[],trends=[]) {
  if(!tags?.length)return 50;
  const byId=new Map(trends.map(x=>[x.id,x.heat]));
  const values=tags.map(tag=>byId.get(tag)).filter(Number.isFinite);
  if(!values.length)return 50;
  return clamp(values.reduce((a,b)=>a+b,0)/values.length);
}

const MASHUPS = [
  {
    id:'style-sprint', requires:['style_identity','obby_skill'], title:'Style Sprint', category:'skill', genre:'Customization Obby', engine:'three', art:'toy3d',
    hook:'Race through a tiny obstacle course while collecting outfit pieces that visibly transform your character and unlock route advantages.',
    why:['Combines identity expression with active mastery','Transformation is visible immediately','Short runs support repeated testing','Original mechanics can separate it from pure dress-up and pure obby games']
  },
  {
    id:'pet-spa-rush', requires:['life_pet_sim','satisfying_transform'], title:'Pet Spa Rush', category:'simulation', genre:'Pet Cleanup Job Sim', engine:'three', art:'toy3d',
    hook:'Take messy cartoon pets through washing, grooming, decorating and a fast reveal, then upgrade the tiny spa for the next customer.',
    why:['Before/after transformation is instantly legible','Pet appeal broadens the theme','Short customer jobs fit session-zero design','Strong visual and upgrade hooks']
  },
  {
    id:'delivery-derby', requires:['social_competition','runner_driving'], title:'Delivery Derby', category:'driving', genre:'Competitive Delivery Arcade', engine:'three', art:'toy3d',
    hook:'Race tiny delivery vehicles through compact routes, grab the best parcels and beat ghost rivals while keeping fragile cargo intact.',
    why:['Movement mastery starts instantly','Competition works even with ghost rivals','Cargo creates readable risk/reward','Easy to expand into real multiplayer later']
  },
  {
    id:'wobble-tower', requires:['viral_absurd','obby_skill'], title:'Wobble Tower', category:'skill', genre:'Physics Climb', engine:'three', art:'toy3d',
    hook:'Climb an absurd moving tower where every floor introduces one surprising physics rule, with fast falls and instant retries.',
    why:['Surprise supports shareable moments without copying memes','Obby familiarity lowers onboarding friction','Physics creates spectacle','One-rule-at-a-time levels support rapid content creation']
  },
  {
    id:'perfect-pack', requires:['puzzle_brain','satisfying_transform'], title:'Perfect Pack', category:'puzzle', genre:'Satisfying Packing Puzzle', engine:'phaser3', art:'isometric',
    hook:'Fit colorful everyday objects into tiny containers, then watch the packed result snap, fold and compress into a perfect reveal.',
    why:['Puzzle is understandable at a glance','Transformation payoff gives tactile satisfaction','Low-text global design','Cheap level production supports fast iteration']
  },
  {
    id:'recovery-crew', requires:['adventure_explore','satisfying_transform'], title:'Recovery Crew', category:'adventure', genre:'Explore + Restore', engine:'three', art:'toy3d',
    hook:'Explore compact abandoned spaces, recover useful objects, clean hazards and visibly restore each location before moving deeper.',
    why:['Exploration adds curiosity to cleanup','Restoration creates strong before/after screenshots','Compact spaces control scope','Progression can reveal new tools and areas']
  }
];

export function generateTrendMashups(trends=[]) {
  const heat=new Map(trends.map(x=>[x.id,x.heat]));
  return MASHUPS.map(item=>{
    const values=item.requires.map(id=>heat.get(id)||35);
    const trendHeat=clamp(values.reduce((a,b)=>a+b,0)/values.length);
    return {...item,slug:`trend-${item.id}`,trendTags:item.requires,trendHeat,score:clamp(trendHeat*.45+92*.20+88*.18+86*.17),confidence:trendHeat>=70?'High':'Medium-High'};
  }).sort((a,b)=>b.score-a.score);
}
