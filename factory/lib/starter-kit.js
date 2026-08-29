import fsp from 'node:fs/promises';
import path from 'node:path';

const CORE_VERSION = '1.2.0';

function coreCss() {
  return `:root{
  --gp-safe-top:env(safe-area-inset-top,0px);--gp-safe-right:env(safe-area-inset-right,0px);
  --gp-safe-bottom:env(safe-area-inset-bottom,0px);--gp-safe-left:env(safe-area-inset-left,0px);
  --gp-bg:#10141c;--gp-panel:rgba(15,20,29,.86);--gp-text:#fff;--gp-muted:rgba(255,255,255,.68);
  --gp-radius:18px;--gp-touch:52px
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--gp-bg);color:var(--gp-text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overscroll-behavior:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
body{position:fixed;inset:0}
button,input,select,textarea{font:inherit}
canvas,svg,#game,#game-root,.game-surface{display:block;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.gp-shell{position:fixed;inset:0;overflow:hidden;padding:var(--gp-safe-top) var(--gp-safe-right) var(--gp-safe-bottom) var(--gp-safe-left)}
.gp-stage{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
.gp-stage>canvas,.gp-stage>svg{display:block;width:100%;height:100%;max-width:none;max-height:none}
.gp-hud{position:absolute;z-index:20;top:calc(10px + var(--gp-safe-top));left:calc(10px + var(--gp-safe-left));right:calc(10px + var(--gp-safe-right));display:flex;align-items:flex-start;justify-content:space-between;gap:10px;pointer-events:none}
.gp-hud>*{pointer-events:auto}
.gp-pill{min-height:34px;display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:var(--gp-panel);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:12px;font-weight:800}
.gp-button{min-width:var(--gp-touch);min-height:var(--gp-touch);border:0;border-radius:16px;padding:0 16px;background:#fff;color:#111;font-weight:900;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.22)}
.gp-button:active{transform:translateY(1px) scale(.98)}
.gp-overlay{position:absolute;z-index:50;inset:0;display:grid;place-items:center;padding:calc(22px + var(--gp-safe-top)) calc(18px + var(--gp-safe-right)) calc(22px + var(--gp-safe-bottom)) calc(18px + var(--gp-safe-left));background:rgba(8,11,16,.64);backdrop-filter:blur(8px)}
.gp-card{width:min(440px,100%);padding:22px;border-radius:24px;background:var(--gp-panel);box-shadow:0 28px 80px rgba(0,0,0,.38);text-align:center}
.gp-card h1,.gp-card h2,.gp-card p{margin-top:0}.gp-card p{color:var(--gp-muted);line-height:1.45}
.gp-hidden{display:none!important}
.gp-feedback-layer{position:fixed;z-index:999;inset:0;overflow:hidden;pointer-events:none}
.gp-particle{position:absolute;width:10px;height:10px;border-radius:50%;background:currentColor;will-change:transform,opacity}
@media(max-width:600px){:root{--gp-touch:56px}.gp-pill{font-size:11px}.gp-card{padding:20px 17px;border-radius:22px}}
@media(min-width:900px) and (orientation:landscape){.gp-card{width:min(680px,calc(100vw - 80px));padding:28px}.gp-hud{top:18px;left:18px;right:18px}}
`;
}

function coreJs(target) {
  const pokiTarget = target === 'Poki';
  return `(()=>{
'use strict';
const VERSION=${JSON.stringify(CORE_VERSION)};
const POKI_TARGET=${JSON.stringify(pokiTarget)};
const STORAGE_PREFIX='gutpopper:';

function storageKey(name){return STORAGE_PREFIX+String(name||'save')}
function load(name='save',fallback={}){try{const raw=localStorage.getItem(storageKey(name));return raw?JSON.parse(raw):structuredClone(fallback)}catch{return structuredClone(fallback)}}
function save(name='save',value={}){try{localStorage.setItem(storageKey(name),JSON.stringify(value));return true}catch{return false}}
function clearSave(name='save'){try{localStorage.removeItem(storageKey(name));return true}catch{return false}}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function lerp(a,b,t){return a+(b-a)*t}
function vibrate(pattern=18){try{if(navigator.vibrate)navigator.vibrate(pattern)}catch{}}
function preventBrowserGestures(root=document){root.addEventListener('contextmenu',e=>e.preventDefault());root.addEventListener('dragstart',e=>e.preventDefault());root.addEventListener('selectstart',e=>e.preventDefault());}
function viewport(){const width=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1);const height=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1);return{width,height,aspect:width/height,desktopLandscape:width>=900&&width>height,phone:width<=600,portrait:height>width}}
function watchViewport(callback){if(typeof callback!=='function')return()=>{};let raf=0;const emit=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>callback(viewport()))};window.addEventListener('resize',emit);window.addEventListener('orientationchange',emit);emit();return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',emit);window.removeEventListener('orientationchange',emit)}}

function createInput(target=document){
  const state={keys:new Set(),pointer:{x:0,y:0,down:false,id:null},lastType:'none'};
  const pos=e=>{const r=(target===document?document.documentElement:target).getBoundingClientRect?.()||{left:0,top:0};state.pointer.x=e.clientX-r.left;state.pointer.y=e.clientY-r.top};
  const down=e=>{state.lastType=e.pointerType||'pointer';state.pointer.down=true;state.pointer.id=e.pointerId;pos(e);target.setPointerCapture?.(e.pointerId);e.preventDefault?.()};
  const move=e=>{if(state.pointer.id==null||e.pointerId===state.pointer.id)pos(e)};
  const up=e=>{if(state.pointer.id==null||e.pointerId===state.pointer.id){pos(e);state.pointer.down=false;state.pointer.id=null}e.preventDefault?.()};
  target.addEventListener('pointerdown',down,{passive:false});target.addEventListener('pointermove',move,{passive:true});target.addEventListener('pointerup',up,{passive:false});target.addEventListener('pointercancel',up,{passive:false});
  window.addEventListener('keydown',e=>{state.keys.add(e.code);state.lastType='keyboard';if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault()},{passive:false});
  window.addEventListener('keyup',e=>state.keys.delete(e.code));
  return {state,isDown:(...codes)=>codes.some(c=>state.keys.has(c)),pointer:state.pointer};
}

function feedbackLayer(){let layer=document.querySelector('.gp-feedback-layer');if(!layer){layer=document.createElement('div');layer.className='gp-feedback-layer';document.body.append(layer)}return layer}
function burst(x,y,{count=10,size=10,distance=62,duration=520,colors=['#fff','#ffd95a','#75f2ff']}={}){const layer=feedbackLayer();for(let i=0;i<count;i++){const p=document.createElement('i');p.className='gp-particle';p.style.width=p.style.height=size+'px';p.style.left=(x-size/2)+'px';p.style.top=(y-size/2)+'px';p.style.color=colors[i%colors.length];layer.append(p);const a=(Math.PI*2*i/count)+(Math.random()-.5)*.55;const d=distance*(.55+Math.random()*.55);p.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+Math.cos(a)*d+'px,'+Math.sin(a)*d+'px) scale(.15)',opacity:0}],{duration:duration*(.8+Math.random()*.35),easing:'cubic-bezier(.12,.7,.25,1)',fill:'forwards'}).finished.finally(()=>p.remove())}}
function shake(element=document.body,{strength=7,duration=180}={}){if(!element?.animate)return;const frames=[{transform:'translate(0,0)'},{transform:'translate('+strength+'px,'+(-strength*.45)+'px)'},{transform:'translate('+(-strength*.75)+'px,'+(strength*.4)+'px)'},{transform:'translate(0,0)'}];element.animate(frames,{duration,easing:'ease-out'})}

const poki={
  ready:false,
  adActive:false,
  adHooks:{pause:null,resume:null},
  setAdHooks({pause=null,resume=null}={}){this.adHooks={pause:typeof pause==='function'?pause:null,resume:typeof resume==='function'?resume:null};return this},
  async init(){if(!POKI_TARGET||!window.PokiSDK)return false;try{await window.PokiSDK.init();this.ready=true;return true}catch{return false}},
  loadingFinished(){try{window.PokiSDK?.gameLoadingFinished?.()}catch{}},
  gameplayStart(){try{window.PokiSDK?.gameplayStart?.()}catch{}},
  gameplayStop(){try{window.PokiSDK?.gameplayStop?.()}catch{}},
  async _withAd(fn){if(this.adActive)return false;this.adActive=true;try{await this.adHooks.pause?.();return await fn()}catch{return false}finally{try{await this.adHooks.resume?.()}catch{}this.adActive=false}},
  async commercialBreak(){if(!this.ready||!window.PokiSDK?.commercialBreak)return false;return this._withAd(async()=>{await window.PokiSDK.commercialBreak();return true})},
  async rewardedBreak(){if(!this.ready||!window.PokiSDK?.rewardedBreak)return false;return this._withAd(async()=>Boolean(await window.PokiSDK.rewardedBreak()))}
};

const session={startedAt:performance.now(),events:[],mark(name,data={}){this.events.push({name,t:Math.round(performance.now()-this.startedAt),...data});if(this.events.length>200)this.events.shift()},summary(){return {durationMs:Math.round(performance.now()-this.startedAt),events:[...this.events]}}};

preventBrowserGestures();
window.GutpopperCore={version:VERSION,load,save,clearSave,clamp,lerp,vibrate,preventBrowserGestures,viewport,watchViewport,createInput,burst,shake,poki,session};
window.dispatchEvent(new CustomEvent('gutpopper-core-ready',{detail:{version:VERSION,pokiTarget:POKI_TARGET}}));
})();
`;
}

function manifest({ engine, target }) {
  return {
    name:'Gutpopper Production Core',
    version:CORE_VERSION,
    engine,
    target,
    features:[
      'mobile browser gesture suppression',
      'safe-area responsive CSS primitives',
      'desktop/phone viewport detection and resize observer helper',
      'keyboard + normalized pointer/touch input helper',
      'local save/load helpers',
      'Poki lifecycle/ad wrappers with safe local fallback',
      'standard Poki ad pause/resume hooks and ad-active guard',
      'lightweight particles, vibration, and screen-shake helpers',
      'local session event markers with no external tracking'
    ]
  };
}

export async function writeProductionStarterKit({ gameDir, engine, target }) {
  const starterDir = path.join(gameDir, 'starter');
  await fsp.mkdir(starterDir, { recursive:true });
  const data = manifest({ engine, target });
  await Promise.all([
    fsp.writeFile(path.join(starterDir, 'production-core.css'), coreCss(), 'utf8'),
    fsp.writeFile(path.join(starterDir, 'production-core.js'), coreJs(target), 'utf8'),
    fsp.writeFile(path.join(starterDir, 'starter-kit.json'), JSON.stringify(data, null, 2), 'utf8')
  ]);
  return data;
}

export function starterKitInstruction() {
  return `PRODUCTION STARTER KIT — ALREADY INSTALLED
- Keep and use ./starter/production-core.css and ./starter/production-core.js instead of rebuilding generic browser plumbing.
- window.GutpopperCore provides: load/save/clearSave, clamp/lerp, viewport(), watchViewport(), createInput(), Poki lifecycle/ad wrappers, burst(), shake(), vibrate(), and local session markers.
- For Poki games, register GutpopperCore.poki.setAdHooks({pause,resume}) once so pause disables gameplay input/audio and resume restores them. commercialBreak()/rewardedBreak() then use those hooks automatically and expose poki.adActive while an ad is in progress.
- Use .gp-shell/.gp-stage and the starter CSS safe-area/touch primitives where useful, but adapt the visual styling to this game's chosen art direction.
- RESPONSIVE REQUIREMENT: phone and desktop are two layouts of the same game, not one portrait layout scaled into a larger window.
- At 390x844, use a touch-first portrait/mobile composition when appropriate.
- At 1440x900, actively recompose for landscape and use the available width for the playfield, camera/world view, HUD, menus, or supporting scenery. Never leave the playable game as a narrow 390px-style portrait column centered between large empty/decorative side gutters.
- Canvas/WebGL games must resize the renderer/canvas with the viewport. Phaser games should use a responsive scale strategy such as RESIZE when the design supports it and reposition cameras/UI on resize. Three.js must update renderer size and camera aspect on resize.
- Use GutpopperCore.viewport()/watchViewport() or equivalent resize logic so orientation/window changes update the game without reload.
- Do not remove the starter kit unless the game's architecture genuinely replaces every capability it provides.
- The starter kit is infrastructure, not the game. Build an original mechanic, level structure, progression, visuals, and game feel on top of it.`;
}
