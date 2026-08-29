import { analyzeTrendSlugs, trendFit, generateTrendMashups } from './trend-radar.js';
import { analyzeThemeSlugs, inferThemeTags, themeFit, recommendThemeWrappers } from './theme-radar.js';

const POKI_BASE='https://poki.com';
const CATEGORY_SOURCES={driving:'/en/driving',puzzle:'/en/puzzle',action:'/en/action',simulation:'/en/simulation',sports:'/en/sports',dressup:'/en/dress-up',skill:'/en/skill',adventure:'/en/adventure'};

const ENGINE_OPTIONS=[
  {id:'auto',label:'Factory Recommended',description:'Let the Factory choose for gameplay, premium presentation and current Poki fit.'},
  {id:'three',label:'Three.js — Premium Casual 3D',description:'Preferred for toy-like 3D, vehicles, job sims, rescue, cleaning, crowds and small worlds.'},
  {id:'phaser3',label:'Phaser 3.90 — Poki Safe',description:'Best for polished 2D/2.5D action, arcade, physics, platformers and puzzle games.'},
  {id:'phaser4',label:'Phaser 4.2.1 — Modern 2D',description:'Newest Phaser renderer/effects for advanced 2D presentation.'},
  {id:'vanilla',label:'Vanilla Canvas / SVG / JS',description:'Smallest footprint for concepts that are genuinely simple rather than visually rich.'},
  {id:'dom',label:'HTML / CSS / SVG',description:'Best only for board, card, word and intentionally UI-heavy games.'}
];
const ART_OPTIONS=[
  {id:'auto',label:'Factory Recommended'},{id:'toy3d',label:'Gutpopper Bright Toy 3D'},{id:'isometric',label:'Polished Isometric 2.5D'},
  {id:'vector',label:'Bright Layered Vector Casual'},{id:'voxel',label:'Bright Blocky / Voxel 3D'},{id:'outline',label:'Cartoon Outline'},
  {id:'pastel',label:'Soft Pastel Casual'},{id:'neon',label:'Neon Arcade'},{id:'pixel',label:'Pixel Arcade'},{id:'paper',label:'Paper Cutout'},
  {id:'retro',label:'Retro 16-bit'},{id:'industrial',label:'Industrial / Mechanical'},{id:'minimal',label:'Minimal Clean — intentional only'}
];

const CONCEPT_LIBRARY=[
  {title:'Tow Truck Trouble',slug:'tow-truck-trouble',category:'driving',genre:'Vehicle Job Sim',hook:'Race to stranded cars, hook them correctly, dodge traffic, and deliver them before the job timer expires.',engine:'three',art:'toy3d',mobileFit:96,adFit:92,buildFit:89,trendTags:['runner_driving','satisfying_transform'],themeTags:['stylized_vehicle'],why:['Vehicle controls are immediately understandable','Job structure supports short repeatable sessions','Tow-hook interaction differentiates it from racing','Theme Radar should consider an expressive animal/toy driver rather than a generic realistic tow service']},
  {title:'Cleanup Crew',slug:'cleanup-crew',category:'simulation',genre:'Cleanup / Job Sim',hook:'Drive or run through messy locations, vacuum, wash, sort, and restore each area under a satisfying completion meter.',engine:'three',art:'toy3d',mobileFit:98,adFit:90,buildFit:92,trendTags:['satisfying_transform','life_pet_sim'],themeTags:['mini_cozy'],why:['3D before/after cleanup is immediately satisfying','Simple touch controls','Strong level and tool-upgrade structure','Theme Radar should test a memorable crew/creature wrapper instead of anonymous workers']},
  {title:'Parcel Panic',slug:'parcel-panic',category:'driving',genre:'Delivery Arcade',hook:'Deliver a stack of packages through tiny neighborhoods while balancing speed, route choice, and fragile cargo.',engine:'three',art:'toy3d',mobileFit:95,adFit:88,buildFit:91,trendTags:['runner_driving','social_competition'],themeTags:['stylized_vehicle','mini_cozy'],why:['Combines proven driving with a clear job fantasy','Routes create replayability without complex content','Easy one-thumb steering','Tiny-world styling gives delivery a stronger identity than realistic traffic']},
  {title:'Dungeon Conveyor',slug:'dungeon-conveyor',category:'puzzle',genre:'Sorting / Automation Puzzle',hook:'Route fantasy loot along belts into the correct chests while traps, cursed items, and greedy mimics disrupt the line.',engine:'phaser3',art:'isometric',mobileFit:91,adFit:82,buildFit:90,trendTags:['puzzle_brain','satisfying_transform'],themeTags:['fantasy_creature','blobs_objects'],why:['Puzzle clarity works well in portrait or landscape','Layered isometric art prevents a flat board-game feel','Greedy mimics turn ordinary containers into expressive characters','Easy to expand with modifiers']},
  {title:'Fire Escape!',slug:'fire-escape',category:'action',genre:'Rescue Action',hook:'Guide civilians through compact burning buildings by opening safe routes, extinguishing hazards, and making split-second rescues.',engine:'three',art:'toy3d',mobileFit:93,adFit:89,buildFit:84,trendTags:['adventure_explore','satisfying_transform'],themeTags:['mini_cozy'],why:['Strong readable stakes','3D fire/smoke/rescue staging creates visual spectacle','Short missions fit browser sessions','Theme Radar can test a creature/toy-town rescue cast without weakening clarity']},
  {title:'Pocket Demolition',slug:'pocket-demolition',category:'skill',genre:'Destruction Skill',hook:'Place a limited number of charges on tiny structures and trigger the cleanest collapse while protecting marked objects.',engine:'three',art:'voxel',mobileFit:92,adFit:84,buildFit:82,trendTags:['satisfying_transform','obby_skill'],themeTags:['mini_cozy','blobs_objects'],why:['One-tap setup and payoff loop','3D collapse moments are highly GIF-able','Miniature/toy structures make destruction playful instead of generic','Scores and bonus objectives drive replay']},
  {title:'Tiny Shop Rush',slug:'tiny-shop-rush',category:'simulation',genre:'Micro Tycoon',hook:'Run a tiny counter-service shop: restock, serve a queue, reinvest profits, and survive increasingly chaotic rushes.',engine:'three',art:'toy3d',mobileFit:97,adFit:93,buildFit:87,trendTags:['life_pet_sim','social_competition'],themeTags:['mini_cozy'],why:['Very clear progression fantasy','Toy-shop characters/props create strong visual personality','Queue pressure adds action','Theme Radar should test animals/food/mascots as staff and customers']},
  {title:'Goalie Goblin',slug:'goalie-goblin',category:'sports',genre:'Sports Skill',hook:'Defend a fantasy goal against ridiculous trick shots, magic balls, and boss shooters using quick swipes and catches.',engine:'phaser3',art:'outline',mobileFit:96,adFit:81,buildFit:94,trendTags:['obby_skill','social_competition'],themeTags:['fantasy_creature','weird_absurd'],why:['Sports interaction is instantly legible','Goblin wrapper makes a familiar goalie mechanic memorable','Very low control complexity','Endless challenge mode is cheap to produce']}
];

const FALLBACK_SIGNAL={driving:{demand:84,saturation:72,popularOverlap:5,newOverlap:8},puzzle:{demand:82,saturation:83,popularOverlap:4,newOverlap:12},action:{demand:80,saturation:86,popularOverlap:4,newOverlap:14},simulation:{demand:78,saturation:68,popularOverlap:3,newOverlap:14},sports:{demand:74,saturation:70,popularOverlap:2,newOverlap:7},dressup:{demand:73,saturation:75,popularOverlap:1,newOverlap:10},skill:{demand:79,saturation:80,popularOverlap:3,newOverlap:11},adventure:{demand:70,saturation:72,popularOverlap:1,newOverlap:6}};
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(value)));

async function fetchText(url,timeoutMs=7000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 GutpopperGameFactory/0.14 theme-trend-radar','accept-language':'en-US,en;q=0.8'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.text()}finally{clearTimeout(timer)}}
function extractGameSlugs(html=''){const set=new Set(),patterns=[/href=["']\/en\/g\/([^"'?#/]+)[^"']*["']/gi,/href=["']https:\/\/poki\.com\/en\/g\/([^"'?#/]+)[^"']*["']/gi];for(const pattern of patterns){let match;while((match=pattern.exec(html)))set.add(match[1].toLowerCase())}return set}

async function collectSignals(){
  const sources={popular:`${POKI_BASE}/en/popular`,new:`${POKI_BASE}/en/new`,categories:Object.fromEntries(Object.entries(CATEGORY_SOURCES).map(([key,rel])=>[key,`${POKI_BASE}${rel}`]))};
  try{
    const[popularHtml,newHtml,...categoryHtml]=await Promise.all([fetchText(sources.popular),fetchText(sources.new),...Object.values(sources.categories).map(url=>fetchText(url))]);
    const popular=[...extractGameSlugs(popularHtml)],fresh=[...extractGameSlugs(newHtml)],popularSet=new Set(popular),freshSet=new Set(fresh),stats={};
    Object.keys(CATEGORY_SOURCES).forEach((category,index)=>{const games=extractGameSlugs(categoryHtml[index]||''),popularOverlap=[...games].filter(game=>popularSet.has(game)).length,newOverlap=[...games].filter(game=>freshSet.has(game)).length,total=games.size;stats[category]={demand:clamp(52+popularOverlap*7+Math.min(newOverlap,8)*1.5),saturation:clamp(35+Math.min(total,120)*.48+Math.min(newOverlap,14)*1.5),popularOverlap,newOverlap,observedGames:total}});
    const trends=analyzeTrendSlugs(popular,fresh),themes=analyzeThemeSlugs(popular,fresh);
    return{live:true,checkedAt:new Date().toISOString(),sources,stats,popularGames:popular.slice(0,50),newGames:fresh.slice(0,50),trends,themes};
  }catch(error){return{live:false,checkedAt:new Date().toISOString(),sources,error:error.message,stats:FALLBACK_SIGNAL,popularGames:[],newGames:[],trends:analyzeTrendSlugs([],[]),themes:analyzeThemeSlugs([],[])}}
}

function scoreConcept(concept,signal,trends,themes){
  const demand=signal?.demand??70,saturation=signal?.saturation??75,whitespace=100-saturation,currentTrendFit=trendFit(concept.trendTags,trends);
  const tags=concept.themeTags?.length?concept.themeTags:inferThemeTags(`${concept.title} ${concept.hook}`),currentThemeFit=themeFit(tags,themes);
  const score=clamp(demand*.23+whitespace*.11+concept.mobileFit*.16+concept.adFit*.11+concept.buildFit*.13+currentTrendFit*.16+currentThemeFit*.10);
  return{...concept,themeTags:tags,score,demand,saturation,whitespace:clamp(whitespace),trendFit:currentTrendFit,themeFit:currentThemeFit,themeSuggestions:recommendThemeWrappers({category:concept.category,themes}).slice(0,3),confidence:score>=82?'High':score>=72?'Medium-High':'Medium'};
}

export async function getOpportunityReport(){
  const market=await collectSignals();
  const base=CONCEPT_LIBRARY.map(concept=>scoreConcept(concept,market.stats[concept.category],market.trends,market.themes));
  const mashups=generateTrendMashups(market.trends).map(item=>{
    const themeSuggestions=recommendThemeWrappers({category:item.category,themes:market.themes}).slice(0,3);
    const tags=inferThemeTags(`${item.title} ${item.hook}`);
    const currentThemeFit=themeFit(tags.length?tags:[themeSuggestions[0]?.theme].filter(Boolean),market.themes);
    const score=clamp(item.score*.9+currentThemeFit*.1);
    return{...item,score,themeTags:tags,themeFit:currentThemeFit,themeSuggestions,mobileFit:92,adFit:86,buildFit:86,demand:Math.round(item.trendHeat),saturation:55,whitespace:45,trendFit:item.trendHeat};
  });
  const opportunities=[...mashups,...base].sort((a,b)=>b.score-a.score);
  return{platform:'Poki',generatedAt:new Date().toISOString(),market,themeRadar:{version:'1.0.0',themes:market.themes,principle:'Familiar mechanic + distinctive emotional wrapper; theme is a moderate opportunity multiplier, not a replacement for fun mechanics.'},opportunities,methodology:'Live Trend Radar reads current Poki Popular/New/category pages. Theme Radar separately measures wrapper patterns such as animals, food/fruit, blobs/objects, weird mascots, mini/cozy worlds, customization and stylized vehicles. Ranking combines current demand/trend/theme signals with mobile fit, monetization fit, production speed, visual potential and saturation. Real Poki tests remain the authority.',engines:ENGINE_OPTIONS,artStyles:ART_OPTIONS};
}
export function getCreatorOptions(){return{engines:ENGINE_OPTIONS,artStyles:ART_OPTIONS,concepts:CONCEPT_LIBRARY}}
export function resolveRecommendation({concept='',engine='auto',artStyle='auto',category=''}={}){const normalized=String(concept).toLowerCase();let candidate=CONCEPT_LIBRARY.find(item=>item.slug===category||item.title.toLowerCase()===normalized);if(!candidate){if(/drive|truck|car|tow|delivery|vehicle|road|parking|taxi|bus|pet|clean|vacuum|wash|repair|restore|job|rescue|fire|crowd|shop|tycoon|store|restaurant|worker|construction|demol|destroy|city|town|world|3d|obby/.test(normalized))candidate={engine:'three',art:'toy3d'};else if(/puzzle|sort|belt|conveyor|grid|match|card|word|pack/.test(normalized))candidate={engine:'phaser3',art:'isometric'};else if(/platform|shooter|sports|runner|arcade|survival|arena/.test(normalized))candidate={engine:'phaser3',art:'vector'};else candidate={engine:'three',art:'toy3d'}}return{engine:engine==='auto'?candidate.engine:engine,artStyle:artStyle==='auto'?candidate.art:artStyle}}
