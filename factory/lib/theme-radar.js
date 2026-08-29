export const THEME_RADAR_VERSION = '1.1.0';

export const THEME_ARCHETYPES = [
  { id:'cute_animals', label:'Cute / expressive animals', pattern:/cat|kitty|dog|puppy|pet|monkey|bunny|rabbit|duck|penguin|dino|critter|animal|fox|pony|horse|cow|bee|fish|shark|snake|bird|pug|panda|bear|hamster|frog|goose|raccoon|otter|capybara/i, baseAppeal:92 },
  { id:'anthro_food', label:'Food / fruit as character or toy', pattern:/fruit|watermelon|veggie|jelly|sushi|pizza|cake|cookie|donut|taco|waffle|coffee|snack|candy|sweet|burger|bread|baker|food|berry|banana/i, baseAppeal:87 },
  { id:'blobs_objects', label:'Blobs / toys / expressive objects', pattern:/slime|blob|ball|block|box|yarn|paper|shape|emoji|buddy|dummy|ragdoll|robot|toy|sticker|pencil|phone|marble|bubble|plush/i, baseAppeal:88 },
  { id:'weird_absurd', label:'Weird / absurd / surprising mascot', pattern:/brainrot|weird|monster|oozy|freaky|devil|chaos|crazy|wacky|annoying|buddy|superweird|zombit|ogus|mutant|gremlin/i, baseAppeal:90 },
  { id:'mini_cozy', label:'Tiny / miniature / cozy world', pattern:/tiny|mini|cozy|little|pocket|mart|shop|room|nest|garden|ranch|home|village|dollhouse|toy-town/i, baseAppeal:84 },
  { id:'identity_style', label:'Identity / customization / makeover', pattern:/dress|style|fashion|beauty|hair|nail|makeover|decor|diy|avatar|outfit|salon|custom/i, baseAppeal:89 },
  { id:'fantasy_creature', label:'Fantasy creature / exaggerated character', pattern:/goblin|wizard|witch|dragon|knight|monster|demon|magic|critter|creature|zombie|undead|sprite|fairy/i, baseAppeal:83 },
  { id:'stylized_vehicle', label:'Stylized / stunt / fantasy vehicle', pattern:/drift|mad|stunt|carnado|wobble|crazy-car|hill-climb|toy-car|supercar|bike-stunt|snow-train|boat-racing/i, baseAppeal:78 },
  { id:'plain_realism', label:'Plain realistic wrapper', pattern:/real-city|city-cab|bus-driver|police-chase|car-racing|soccer-real|family-life|airplane-manager/i, baseAppeal:55 }
];

const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Math.round(v)));

export function analyzeThemeSlugs(popularGames=[],newGames=[]) {
  const popular=popularGames.map(String), fresh=newGames.map(String);
  return THEME_ARCHETYPES.map(item=>{
    const popularHits=popular.filter(x=>item.pattern.test(x)).length;
    const newHits=fresh.filter(x=>item.pattern.test(x)).length;
    const heat=clamp(item.baseAppeal*.35 + popularHits*11 + newHits*6);
    return {id:item.id,label:item.label,popularHits,newHits,heat};
  }).sort((a,b)=>b.heat-a.heat);
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
    {theme:'cute_animals',idea:'Raccoon tow crew driving chunky toy recovery trucks.'},
    {theme:'cute_animals',idea:'Penguin delivery drivers sliding unstable cargo through tiny icy streets.'},
    {theme:'anthro_food',idea:'Expressive sushi couriers racing wobbling takeout stacks through a miniature city.'},
    {theme:'blobs_objects',idea:'Squishy blob drivers whose vehicles and cargo visibly deform on bumps.'},
    {theme:'blobs_objects',idea:'Wind-up toy vehicles piloted by tiny plush mascots in a tabletop world.'},
    {theme:'weird_absurd',idea:'A bizarre gremlin courier hauling ridiculous oversized objects through impossible roads.'},
    {theme:'fantasy_creature',idea:'Goblin mechanics operating improvised magical tow carts and rescue rigs.'},
    {theme:'mini_cozy',idea:'Pocket-sized neighborhood driving inside a toy bedroom or dollhouse city.'},
    {theme:'stylized_vehicle',idea:'Make the vehicle itself expressive—with eyes, squashy suspension, dramatic reactions and collectible body parts.'}
  ],
  simulation:[
    {theme:'cute_animals',idea:'Raccoon workers running the job/business with expressive teamwork and tool animations.'},
    {theme:'cute_animals',idea:'Capybara crew operating a calm-looking business that becomes hilariously hectic.'},
    {theme:'cute_animals',idea:'Otter staff handling tools, customers and upgrades in a tiny waterside workplace.'},
    {theme:'anthro_food',idea:'Food or produce are the workers/customers/resources, with expressive faces and transformation reactions.'},
    {theme:'blobs_objects',idea:'Slime janitors/workers absorb mess, stretch around tools and split into helper blobs.'},
    {theme:'blobs_objects',idea:'Tiny service robots perform the work with upgradeable attachments and animated tool arms.'},
    {theme:'weird_absurd',idea:'A strange monster crew runs an otherwise familiar business using ridiculous improvised tools.'},
    {theme:'fantasy_creature',idea:'Magical dust sprites or goblins perform the job using visually exaggerated fantasy tools.'},
    {theme:'mini_cozy',idea:'Frame the whole system as a collectible miniature workplace with rooms that visibly improve.'}
  ],
  skill:[
    {theme:'blobs_objects',idea:'A squashy blob or toy character whose physical reactions make mastery readable.'},
    {theme:'cute_animals',idea:'A frog, duck, cat or other animal whose natural ability directly powers the skill mechanic.'},
    {theme:'cute_animals',idea:'A tiny penguin or hamster tackles oversized obstacles with exaggerated recoveries and fails.'},
    {theme:'anthro_food',idea:'A fruit/snack mascot bounces, rolls or stacks through the challenge while visibly bruising/squishing.'},
    {theme:'weird_absurd',idea:'Use an original bizarre mascot with a surprising movement rule or body shape.'},
    {theme:'fantasy_creature',idea:'A goblin, slime monster or tiny dragon uses one readable fantasy ability to master the course.'},
    {theme:'mini_cozy',idea:'Set the skill challenge on oversized household objects inside a miniature world.'},
    {theme:'blobs_objects',idea:'Turn the player into an expressive everyday object—eraser, yarn ball, sticker roll, spring toy—with mechanic-specific physics.'},
    {theme:'weird_absurd',idea:'Make each obstacle itself expressive and reactive instead of using generic platforms.'}
  ],
  action:[
    {theme:'fantasy_creature',idea:'Compact fantasy-creature cast with exaggerated abilities and instantly readable silhouettes.'},
    {theme:'cute_animals',idea:'Cute rescue/action animals contrasted with energetic hazards, impacts and destruction.'},
    {theme:'cute_animals',idea:'A tiny animal squad uses oversized tools or weapons in a toy-scale environment.'},
    {theme:'blobs_objects',idea:'Elastic slime heroes absorb hits, stretch through hazards and visibly change shape.'},
    {theme:'weird_absurd',idea:'Bizarre original mascots turn enemies and targets into screenshot-friendly chaos.'},
    {theme:'anthro_food',idea:'Food fighters use ingredient-themed abilities and exaggerated splat/squish effects.'},
    {theme:'fantasy_creature',idea:'Goblin emergency crew, monster firefighters or tiny dragons create an immediately memorable action fantasy.'},
    {theme:'mini_cozy',idea:'Stage large action inside a tiny toy town so hazards feel oversized and visually dramatic.'},
    {theme:'identity_style',idea:'Let the player visibly customize the hero between short action runs so identity becomes part of progression.'}
  ],
  puzzle:[
    {theme:'anthro_food',idea:'Tactile fruit/food pieces with expressive faces, merge/eat/squish reactions.'},
    {theme:'anthro_food',idea:'Tiny bakery or sushi pieces physically fold, stack, cut or combine into satisfying final forms.'},
    {theme:'blobs_objects',idea:'Soft toy/blob pieces snap, stretch and transform instead of behaving like flat puzzle tiles.'},
    {theme:'cute_animals',idea:'Animal-shaped pieces or tiny pets react to correct placement and form collectible groups.'},
    {theme:'mini_cozy',idea:'Each puzzle repairs, packs, decorates or organizes a miniature room/world.'},
    {theme:'weird_absurd',idea:'Use strange expressive objects with surprising transformation rules while keeping the puzzle readable.'},
    {theme:'identity_style',idea:'Puzzle rewards visibly customize a character, room or collection after every short level.'},
    {theme:'fantasy_creature',idea:'Mimics, potions, runes or tiny monsters turn ordinary sorting/merging into a fantasy toybox.'},
    {theme:'blobs_objects',idea:'Make the entire puzzle feel like manipulating physical desk toys, stickers, yarn or squishy materials.'}
  ],
  sports:[
    {theme:'fantasy_creature',idea:'Goblin, monster or wizard competitors with exaggerated reactions while keeping the sport readable.'},
    {theme:'cute_animals',idea:'Animal teams with oversized equipment and expressive celebrations/fails.'},
    {theme:'cute_animals',idea:'Penguins, frogs or monkeys use species-specific movement as a light twist on the sport.'},
    {theme:'blobs_objects',idea:'Squishy toy athletes visibly deform on catches, hits, goals and impacts.'},
    {theme:'weird_absurd',idea:'Original bizarre mascots compete with ridiculous but readable trick shots.'},
    {theme:'anthro_food',idea:'Food mascots compete in a playful arena with ingredient-themed balls and effects.'},
    {theme:'mini_cozy',idea:'Play the sport on a miniature tabletop, bedroom or backyard arena with oversized props.'},
    {theme:'identity_style',idea:'Short matches unlock visible outfits/gear so customization becomes a replay hook.'},
    {theme:'stylized_vehicle',idea:'For racing-style sports, make vehicles characterful toys with expressive suspension and cosmetic parts.'}
  ],
  adventure:[
    {theme:'cute_animals',idea:'Explore as a distinctive animal whose natural ability shapes traversal and interaction.'},
    {theme:'cute_animals',idea:'A tiny pet rescue/exploration crew restores strange compact locations.'},
    {theme:'fantasy_creature',idea:'Center the adventure on a goblin, tiny dragon or magical creature with one memorable ability.'},
    {theme:'blobs_objects',idea:'An elastic blob explores by squeezing, absorbing or copying environmental properties.'},
    {theme:'weird_absurd',idea:'A lovable strange mascot explores a world built around one surprising physical rule.'},
    {theme:'mini_cozy',idea:'Use compact collectible/restorable pocket worlds instead of generic realistic spaces.'},
    {theme:'anthro_food',idea:'Explore a surreal food world as an expressive ingredient or snack character.'},
    {theme:'identity_style',idea:'Adventure rewards visibly customize the explorer and home base after every short expedition.'},
    {theme:'fantasy_creature',idea:'A monster recovery crew turns exploration, cleanup and restoration into one coherent fantasy.'}
  ],
  dressup:[
    {theme:'cute_animals',idea:'Style expressive pets/animals with themed outfits, rooms and reaction animations.'},
    {theme:'fantasy_creature',idea:'Customize goblins, fairies, monsters or tiny dragons rather than generic fashion models.'},
    {theme:'anthro_food',idea:'Dress and decorate expressive food mascots in absurd themed collections.'},
    {theme:'blobs_objects',idea:'Customize a toy/blob/avatar whose body, face and materials visibly transform.'},
    {theme:'mini_cozy',idea:'Combine avatar styling with decorating a miniature room, shop or habitat.'},
    {theme:'weird_absurd',idea:'Use intentionally strange original mascots so every makeover has a memorable before/after reveal.'},
    {theme:'identity_style',idea:'Lean into strong identity expression with mix-and-match silhouettes, colors and themed collections.'},
    {theme:'cute_animals',idea:'Run a pet fashion studio where customers have different species-specific outfit constraints.'},
    {theme:'fantasy_creature',idea:'Create a magical makeover shop with creature-specific accessories and transformation effects.'}
  ]
};

function diversify(candidates,themes) {
  const heat=new Map(themes.map(x=>[x.id,x.heat]));
  const scored=candidates.map((item,index)=>({...item,id:`${item.theme}-${index}`,heat:heat.get(item.theme)||58,index}));
  const buckets=new Map();
  for(const item of scored){if(!buckets.has(item.theme))buckets.set(item.theme,[]);buckets.get(item.theme).push(item)}
  for(const items of buckets.values())items.sort((a,b)=>b.heat-a.heat||a.index-b.index);
  const order=[...buckets.keys()].sort((a,b)=>(heat.get(b)||58)-(heat.get(a)||58));
  const out=[];
  let cursor=0;
  while(out.length<scored.length){let added=false;for(const theme of order){const list=buckets.get(theme);if(list?.[cursor]){out.push(list[cursor]);added=true}}if(!added)break;cursor+=1}
  return out;
}

export function recommendThemeWrappers({category='simulation',themes=[],limit=9}={}) {
  const candidates=WRAPPERS[category]||WRAPPERS.simulation;
  return diversify(candidates,themes).slice(0,Math.max(3,Math.min(18,Number(limit)||9)));
}

export function themeResearchBrief(themes=[]) {
  const top=themes.slice(0,5).map(x=>`- ${x.label}: heat ${x.heat}; popular hits ${x.popularHits}; new hits ${x.newHits}`).join('\n')||'- Live theme data unavailable; use the general distinctiveness rules.';
  return `GUTPOPPER THEME RADAR v${THEME_RADAR_VERSION}\nTheme is a conversion/identity layer separate from mechanics. Current Poki evidence frequently favors emotionally distinctive wrappers—cute animals, food/fruit, blobs/toys, weird mascots, mini worlds, expressive objects and identity/customization—over anonymous realism. This is a heuristic from current catalog patterns, not an official Poki rule.\n\nCURRENT THEME SIGNALS\n${top}\n\nTHEME DESIGN RULES\n- Prefer familiar mechanic + distinctive wrapper over familiar mechanic + generic realism.\n- Ask whether a generic human/vehicle/object can become a more memorable animal, creature, food, toy, blob, miniature or exaggerated mascot WITHOUT making the mechanic harder to understand.\n- Give mascots readable silhouettes, expressive faces/reactions, material identity and animation. Cute should feel authored, not childish placeholder art.\n- Animals/food/weirdness are not mandatory. Human identity/customization and stylized vehicles can be equally strong when the fantasy itself is distinctive.\n- Do not copy current meme characters, branded mascots or another game's creatures. Borrow the structural appeal—surprise, cuteness, collectibility, expression—not the IP.\n- Theme must reinforce gameplay.\n- Theme suggestions are hypotheses: cycle through alternatives and choose the one with the strongest immediate identity before building.\n- Use real Poki CTR/player-fit data to learn whether a theme actually improves conversion/engagement for our portfolio.`;
}
