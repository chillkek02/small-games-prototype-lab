import fsp from 'node:fs/promises';
import path from 'node:path';

export const POKI_EVENTS_KIT_VERSION = '1.0.0';

function eventsJs() {
  return `(()=>{
'use strict';
const VERSION=${JSON.stringify(POKI_EVENTS_KIT_VERSION)};
const clean=v=>String(v??'').trim().replace(/[\\/^]/g,'-').replace(/\\s+/g,'-').slice(0,64)||'unknown';
function local(category,what,action){try{window.GutpopperCore?.session?.mark?.('poki-measure',{category,what,action})}catch{}}
function measure(category,what,action){category=clean(category);what=clean(what);action=clean(action);local(category,what,action);try{window.PokiSDK?.measure?.(category,what,action);return true}catch{return false}}
function progress(category,what){return{start:()=>measure(category,what,'start'),complete:()=>measure(category,what,'complete'),fail:()=>measure(category,what,'fail')}}
function interaction(category,what){let shown=false;return{visible:()=>{shown=true;return measure(category,what,'visible')},interact:()=>{if(!shown)measure(category,what,'visible');return measure(category,what,'interact')}}}
function milestone(what,action='reached'){return measure('milestone',what,action)}
function run(index=1){return progress('run',String(index))}
function level(id){return progress('level',String(id))}
function tutorial(id='core'){return progress('tutorial',String(id))}
function rewarded(id='primary'){return interaction('rewarded',String(id))}
function button(id){return interaction('button',String(id))}
window.GutpopperEvents={version:VERSION,measure,progress,interaction,milestone,run,level,tutorial,rewarded,button};
window.dispatchEvent(new CustomEvent('gutpopper-events-ready',{detail:{version:VERSION}}));
})();\n`;
}

export async function writePokiEventsKit({ gameDir, target = 'Poki' }) {
  const starterDir = path.join(gameDir, 'starter');
  await fsp.mkdir(starterDir, { recursive:true });
  const manifest = {
    name:'Gutpopper Poki Game Events Kit',
    version:POKI_EVENTS_KIT_VERSION,
    target,
    enabled:target === 'Poki',
    helpers:['measure','progress','interaction','milestone','run','level','tutorial','rewarded','button']
  };
  await Promise.all([
    fsp.writeFile(path.join(starterDir,'poki-events.js'), eventsJs(), 'utf8'),
    fsp.writeFile(path.join(starterDir,'poki-events.json'), JSON.stringify(manifest,null,2), 'utf8')
  ]);
  return manifest;
}

export function pokiEventsBrief(target = 'Poki') {
  if (target !== 'Poki') return 'POKI GAME EVENTS\nNot required for this General Web target.';
  return `POKI GAME EVENTS — ALREADY INSTALLED\n- ./starter/poki-events.js exposes window.GutpopperEvents and safely mirrors events to the local Factory session log when PokiSDK.measure() is unavailable.\n- Instrument questions, not every click. Use stable event names across versions so Poki funnels remain comparable.\n- Use GutpopperEvents.tutorial('core').start()/complete()/fail() for onboarding when appropriate.\n- Use GutpopperEvents.run(1) or level(id) for progress funnels; each attempt gets start then either complete OR fail.\n- Use rewarded('placement').visible()/interact() around the in-game rewarded offer; rewardedBreak() playback/outcome is already tracked automatically by Poki.\n- Use interaction('upgrade','speed').visible()/interact() or similar for important upgrades/features.\n- Use milestone('first-reward'), milestone('first-upgrade'), and milestone('second-run') only when those meaningful moments happen.\n- Never send fake success events merely to improve analytics. Events describe actual player behavior.`;
}
