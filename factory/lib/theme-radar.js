export const THEME_RADAR_VERSION = '1.0.0';

export const THEME_ARCHETYPES = [
  { id:'cute_animals', label:'Cute / expressive animals', pattern:/cat|kitty|dog|puppy|pet|monkey|bunny|rabbit|duck|penguin|dino|critter|animal|fox|pony|horse|cow|bee|fish|shark|snake|bird|pug|panda|bear|hamster|frog|goose/i, baseAppeal:92 },
  { id:'anthro_food', label:'Food / fruit as character or toy', pattern:/fruit|watermelon|veggie|jelly|sushi|pizza|cake|cookie|donut|taco|waffle|coffee|snack|candy|sweet|burger|bread|baker|food/i, baseAppeal:87 },
  { id:'blobs_objects', label:'Blobs / toys / expressive objects', pattern:/slime|blob|ball|block|box|yarn|paper|shape|emoji|buddy|dummy|ragdoll|robot|toy|sticker|pencil|phone|marble|bubble/i, baseAppeal:88 },
  { id:'weird_absurd', label:'Weird / absurd / surprising mascot', pattern:/brainrot|weird|monster|oozy|freaky|devil|chaos|crazy|wacky|annoying|buddy|superweird|zombit|ogus/i, baseAppeal:90 },
  { id:'mini_cozy', label:'Tiny / miniature / cozy world', pattern:/tiny|mini|cozy|little|pocket|mart|shop|room|nest|garden|ranch|home|village/i, baseAppeal:84 },
  { id:'identity_style', label:'Identity / customization / makeover', pattern:/dress|style|fashion|beauty|hair|nail|makeover|decor|diy|avatar|outfit|salon/i, baseAppeal:89 },
  { id:'fantasy_creature', label:'Fantasy creature / exaggerated character', pattern:/goblin|wizard|witch|dragon|knight|monster|demon|magic|critter|creature|zombie|undead/i, baseAppeal:83 },
  { id:'stylized_vehicle', label:'Stylized / stunt / fantasy vehicle', pattern:/drift|mad|stunt|carnado|wobble|crazy-car|hill-climb|toy-car|supercar|bike-stunt|snow-train|boat-racing/i, baseAppeal:78 },
  { id:'plain_realism', label:'Plain realistic wrapper', pattern:/real-city|city-cab|bus-driver|police-chase|car-racing|soccer-real|family-life|airplane-manager/i, baseAppeal:55 }
];

const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(v)));

export function analyzeThemeSlugs(popularGames=[],newGames=[]) {
  const popular=popularGames.map(String), fresh=newGames.map(String);
  const themes=THEME_ARCHETYPES.map(item=>{
    const popularHits=popular.filter(x=>item.pattern.test(x)).length;
    const newHits=fresh.filter(x=>item.pattern.test(x)).length;
    const heat=clamp(item.baseAppeal*.35 + popularHits*11 + newHits*6);
    return {id:item.id,label:item.label,popularHits,newHits,heat};
  }).sort((a,b)=>b.heat-a.heat);
  return themes;
}

export function inferThemeTags(text='') {
  const value=String(text).toLowerCase();
  return THEME_ARCHETYPES.filter(item=>item.pattern.test(value)).map(item=>item.id);
}

export function themeFit(tags=[],themes=[]) {
  if(!tags?.length)return 58;
  const byId=new Map(themes.map(x=>[x.id,x.heat]));
  const values=tags.map(tag=>byId.get(tag)).filter(Number.isFinite);
  if(!values.length)return 58;
  return clamp(values.reduce((a,b)=>a+b,0)/values.length);
}

const WRAPPERS = {
  driving:[
    {theme:'cute_animals',idea:'A tiny animal courier/rescue driver with an expressive toy vehicle.'},
    {theme:'blobs_objects',idea:'A squishy or toy-like vehicle/driver whose body reacts physically to bumps and cargo.'},
    {theme:'weird_absurd',idea:'An absurd delivery object or mascot driving a deliberately exaggerated vehicle.'}
  ],
  simulation:[
    {theme:'cute_animals',idea:'Run the job/business as a cute animal or a whole animal crew.'},
    {theme:'anthro_food',idea:'Let food/produce be workers, customers, resources, or expressive objects in the loop.'},
    {theme:'mini_cozy',idea:'Frame the system as a miniature toy world with collectible, customizable spaces.'}
  ],
  skill:[
    {theme:'blobs_objects',idea:'Use a squashy blob/toy/object whose physical reactions make mastery readable.'},
    {theme:'cute_animals',idea:'Use an animal with a mechanic-specific ability or silhouette rather than a generic runner.'},
    {theme:'weird_absurd',idea:'Make the obstacle or player character inherently surprising and screenshot-friendly.'}
  ],
  action:[
    {theme:'fantasy_creature',idea:'Use a compact fantasy creature cast with strong silhouettes and exaggerated abilities.'},
    {theme:'cute_animals',idea:'Contrast readable cute characters with energetic action and destruction.'},
    {theme:'weird_absurd',idea:'Turn enemies/targets into bizarre mascots or expressive objects rather than generic humans.'}
  ],
  puzzle:[
    {theme:'anthro_food',idea:'Use tactile fruit/food pieces with expressive faces, merge/eat/squish reactions.'},
    {theme:'blobs_objects',idea:'Use satisfying toy/object pieces with material identity and transformation.'},
    {theme:'mini_cozy',idea:'Make each puzzle repair, pack, decorate, or organize a tiny world.'}
  ],
  sports:[
    {theme:'fantasy_creature',idea:'Replace generic athletes with fantasy/animal competitors and mechanic-specific abilities.'},
    {theme:'cute_animals',idea:'Use animal teams/mascots with exaggerated reactions while keeping sports rules clear.'}
  ],
  adventure:[
    {theme:'cute_animals',idea:'Explore as a distinctive animal whose abilities shape movement and interaction.'},
    {theme:'fantasy_creature',idea:'Center the adventure on a creature with a memorable silhouette and ability fantasy.'},
    {theme:'mini_cozy',idea:'Use compact collectible/restorable worlds instead of generic realistic spaces.'}
  ]
};

export function recommendThemeWrappers({category='simulation',themes=[]}={}) {
  const candidates=WRAPPERS[category]||WRAPPERS.simulation;
  const heat=new Map(themes.map(x=>[x.id,x.heat]));
  return candidates.map(item=>({...item,heat:heat.get(item.theme)||58})).sort((a,b)=>b.heat-a.heat);
}

export function themeResearchBrief(themes=[]) {
  const top=themes.slice(0,5).map(x=>`- ${x.label}: heat ${x.heat}; popular hits ${x.popularHits}; new hits ${x.newHits}`).join('\n')||'- Live theme data unavailable; use the general distinctiveness rules.';
  return `GUTPOPPER THEME RADAR v${THEME_RADAR_VERSION}\nTheme is a conversion/identity layer separate from mechanics. Current Poki evidence frequently favors emotionally distinctive wrappers—cute animals, food/fruit, blobs/toys, weird mascots, mini worlds, expressive objects and identity/customization—over anonymous realism. This is a heuristic from current catalog patterns, not an official Poki rule.\n\nCURRENT THEME SIGNALS\n${top}\n\nTHEME DESIGN RULES\n- Prefer familiar mechanic + distinctive wrapper over familiar mechanic + generic realism.\n- Ask whether a generic human/vehicle/object can become a more memorable animal, creature, food, toy, blob, miniature or exaggerated mascot WITHOUT making the mechanic harder to understand.\n- Give mascots readable silhouettes, expressive faces/reactions, material identity and animation. Cute should feel authored, not childish placeholder art.\n- Animals/food/weirdness are not mandatory. Human identity/customization and stylized vehicles can be equally strong when the fantasy itself is distinctive.\n- Do not copy current meme characters, branded mascots or another game's creatures. Borrow the structural appeal—surprise, cuteness, collectibility, expression—not the IP.\n- Theme must reinforce gameplay. A monkey mart works because the monkey can carry, harvest and manage; an animal obby works because animal abilities change traversal.\n- Use real Poki CTR/player-fit data to learn whether a theme actually improves conversion/engagement for our portfolio.`;
}
