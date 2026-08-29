import fsp from 'node:fs/promises';
import path from 'node:path';

export const HOUSE_STYLE_VERSION = '1.0.0';

export const GUTPOPPER_HOUSE_STYLE = {
  name: 'Gutpopper Bright Toy Casual',
  version: HOUSE_STYLE_VERSION,
  principles: [
    'Bright saturated casual-game palette with controlled contrast',
    'Toy-like chunky proportions and clean readable silhouettes',
    'Visible depth through lighting, shadows, layering, overlap, scale and perspective',
    'Dense-enough environment dressing without noisy clutter',
    'Rounded professional UI with clear hierarchy and tactile states',
    'Immediate juice on movement, collection, impact, success, failure and rewards',
    'Desktop and phone compositions designed independently for the same game',
    'Fast-loading procedural/code art and reusable materials before heavy assets'
  ]
};

function presentationCss() {
  return `:root{
  --gv-ink:#172033;--gv-white:#fffdf8;--gv-sky:#80d9ff;--gv-blue:#4da8ff;--gv-mint:#66efba;
  --gv-lime:#b5ef57;--gv-yellow:#ffd85c;--gv-orange:#ff9a4d;--gv-coral:#ff6f6f;--gv-purple:#9b7cff;
  --gv-panel:rgba(255,255,255,.92);--gv-panel-dark:rgba(22,31,49,.90);--gv-shadow:0 14px 34px rgba(28,45,75,.22);
  --gv-radius:22px;--gv-stroke:rgba(23,32,51,.12)
}
.gv-ui{font-family:Inter,ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif;color:var(--gv-ink);letter-spacing:.01em}
.gv-card{border:1px solid rgba(255,255,255,.8);border-radius:var(--gv-radius);background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(244,249,255,.91));box-shadow:var(--gv-shadow),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(12px)}
.gv-card-dark{color:white;border-color:rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(39,52,78,.94),rgba(20,29,46,.94));box-shadow:0 16px 42px rgba(7,13,25,.32),inset 0 1px 0 rgba(255,255,255,.11)}
.gv-button{min-height:50px;padding:0 20px;border:0;border-radius:17px;background:linear-gradient(180deg,#fff,#eff6ff);color:var(--gv-ink);font-weight:950;letter-spacing:.02em;box-shadow:0 8px 0 rgba(43,81,120,.14),0 12px 24px rgba(23,54,85,.16);cursor:pointer;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease}
.gv-button:hover{filter:brightness(1.035);transform:translateY(-1px)}.gv-button:active{transform:translateY(4px) scale(.985);box-shadow:0 3px 0 rgba(43,81,120,.14),0 7px 14px rgba(23,54,85,.13)}
.gv-button-primary{color:#173040;background:linear-gradient(180deg,#d9ff76,#8be84c);box-shadow:0 8px 0 #56b83e,0 13px 25px rgba(64,151,66,.28)}
.gv-button-blue{color:#12324a;background:linear-gradient(180deg,#8ee6ff,#4fb5ff);box-shadow:0 8px 0 #358bd2,0 13px 25px rgba(40,130,205,.25)}
.gv-pill{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.93);box-shadow:0 8px 24px rgba(26,59,90,.17);font-weight:900}
.gv-title{margin:0;font-weight:1000;letter-spacing:-.035em;text-wrap:balance;text-shadow:0 2px 0 rgba(255,255,255,.5)}
.gv-meter{height:16px;padding:3px;border-radius:999px;background:rgba(22,35,55,.18);box-shadow:inset 0 2px 5px rgba(16,30,49,.14)}
.gv-meter>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--gv-mint),var(--gv-lime),var(--gv-yellow));box-shadow:0 1px 5px rgba(94,202,104,.38)}
.gv-float-text{position:fixed;z-index:1200;pointer-events:none;font-weight:1000;text-shadow:0 2px 0 white,0 4px 12px rgba(19,38,61,.25);will-change:transform,opacity}
.gv-screen-flash{position:fixed;z-index:1190;inset:0;pointer-events:none;mix-blend-mode:screen}
@media(max-width:600px){.gv-card{border-radius:19px}.gv-button{min-height:54px;border-radius:17px;padding:0 17px}.gv-title{letter-spacing:-.025em}}
`;
}

function presentationJs() {
  return `(()=>{
'use strict';
const VERSION=${JSON.stringify(HOUSE_STYLE_VERSION)};
const palettes={
  toy:['#4da8ff','#66efba','#ffd85c','#ff7a67','#9b7cff','#b5ef57'],
  warm:['#ffd85c','#ff9a4d','#ff6f6f','#66efba','#80d9ff'],
  cool:['#80d9ff','#4da8ff','#66efba','#9b7cff','#b5ef57']
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function layer(){let e=document.querySelector('.gv-fx-layer');if(!e){e=document.createElement('div');e.className='gv-fx-layer';Object.assign(e.style,{position:'fixed',inset:'0',zIndex:1180,pointerEvents:'none',overflow:'hidden'});document.body.append(e)}return e}
function pop(el,{scale=1.09,duration=260}={}){if(!el?.animate)return;el.animate([{transform:'scale(1)'},{transform:'scale('+scale+')'},{transform:'scale(.985)'},{transform:'scale(1)'}],{duration,easing:'cubic-bezier(.16,.8,.2,1)'})}
function floatText(text,x,y,{color='#17324a',size=24,duration=760}={}){const e=document.createElement('b');e.className='gv-float-text';e.textContent=text;Object.assign(e.style,{left:x+'px',top:y+'px',color,fontSize:size+'px',transform:'translate(-50%,-50%)'});layer().append(e);e.animate([{transform:'translate(-50%,-20%) scale(.72)',opacity:0},{transform:'translate(-50%,-55%) scale(1.14)',opacity:1,offset:.2},{transform:'translate(-50%,-120%) scale(.98)',opacity:0}],{duration,easing:'cubic-bezier(.12,.75,.2,1)',fill:'forwards'}).finished.finally(()=>e.remove())}
function screenFlash(color='rgba(255,255,255,.28)',duration=150){const e=document.createElement('div');e.className='gv-screen-flash';e.style.background=color;document.body.append(e);e.animate([{opacity:0},{opacity:1},{opacity:0}],{duration,easing:'ease-out'}).finished.finally(()=>e.remove())}
function confetti(x,y,{count=18,distance=96,duration=720,colors=palettes.toy}={}){const root=layer();for(let i=0;i<count;i++){const p=document.createElement('i');const w=5+Math.random()*7,h=8+Math.random()*8;Object.assign(p.style,{position:'absolute',left:x+'px',top:y+'px',width:w+'px',height:h+'px',borderRadius:'3px',background:colors[i%colors.length],boxShadow:'0 2px 4px rgba(20,40,60,.12)'});root.append(p);const a=-Math.PI*.9+Math.random()*Math.PI*.8;const d=distance*(.55+Math.random()*.75);const dx=Math.cos(a)*d,dy=Math.sin(a)*d+42;const spin=(Math.random()>.5?1:-1)*(240+Math.random()*420);p.animate([{transform:'translate(-50%,-50%) rotate(0deg) scale(.7)',opacity:0},{opacity:1,offset:.12},{transform:'translate('+dx+'px,'+dy+'px) rotate('+spin+'deg) scale(1)',opacity:0}],{duration:duration*(.8+Math.random()*.35),easing:'cubic-bezier(.12,.65,.28,1)',fill:'forwards'}).finished.finally(()=>p.remove())}}
function springNumber(el,from,to,{duration=500,format=Math.round}={}){if(!el)return;const start=performance.now();const tick=now=>{const t=clamp((now-start)/duration,0,1);const eased=1-Math.pow(1-t,3);el.textContent=format(from+(to-from)*eased);if(t<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)}
function threeStudio(scene,renderer,{shadowSize=1024,background=0x8fdcff,fog=true}={}){const T=window.THREE;if(!T||!scene||!renderer)return null;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;if('outputColorSpace'in renderer&&T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace;if('toneMapping'in renderer&&T.ACESFilmicToneMapping){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08}scene.background=new T.Color(background);if(fog)scene.fog=new T.Fog(background,28,70);const hemi=new T.HemisphereLight(0xd9f5ff,0x6d7c57,2.25);scene.add(hemi);const key=new T.DirectionalLight(0xfff4dc,4.1);key.position.set(-8,14,8);key.castShadow=true;key.shadow.mapSize.set(shadowSize,shadowSize);key.shadow.camera.left=-24;key.shadow.camera.right=24;key.shadow.camera.top=24;key.shadow.camera.bottom=-24;key.shadow.bias=-.00035;scene.add(key);const fill=new T.DirectionalLight(0x8fd5ff,1.25);fill.position.set(10,7,-8);scene.add(fill);return{hemi,key,fill}}
function toyMaterial(color,{roughness=.64,metalness=.02,emissive=0x000000,emissiveIntensity=0}={}){const T=window.THREE;if(!T)return null;return new T.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity})}
function prepareToyObject(root,{cast=true,receive=true}={}){root?.traverse?.(o=>{if(o.isMesh){o.castShadow=cast;o.receiveShadow=receive;if(o.geometry&&!o.geometry.attributes.normal)o.geometry.computeVertexNormals?.()}});return root}
function blobShadow({radius=1,opacity=.18}={}){const T=window.THREE;if(!T)return null;const g=new T.CircleGeometry(radius,32);const m=new T.MeshBasicMaterial({color:0x182230,transparent:true,opacity,depthWrite:false});const mesh=new T.Mesh(g,m);mesh.rotation.x=-Math.PI/2;mesh.position.y=.012;mesh.renderOrder=1;return mesh}
function addToyGround(scene,{size=80,color=0x9edb72}={}){const T=window.THREE;if(!T||!scene)return null;const g=new T.PlaneGeometry(size,size);const m=new T.MeshStandardMaterial({color,roughness:.95,metalness:0});const mesh=new T.Mesh(g,m);mesh.rotation.x=-Math.PI/2;mesh.receiveShadow=true;scene.add(mesh);return mesh}
function resizeThree(renderer,camera,{maxPixelRatio=1.75}={}){if(!renderer||!camera)return()=>{};const apply=()=>{const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxPixelRatio));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix?.()};addEventListener('resize',apply);apply();return()=>removeEventListener('resize',apply)}
function phaserJuice(scene){if(!scene)return{};return{pop:(target,scale=1.12)=>scene.tweens?.add({targets:target,scaleX:scale,scaleY:scale,duration:95,yoyo:true,ease:'Back.Out'}),bob:(target,amount=5)=>scene.tweens?.add({targets:target,y:'-='+amount,duration:180,yoyo:true,ease:'Sine.InOut'}),cameraKick:(amount=.006,duration=90)=>scene.cameras?.main?.shake(duration,amount),flash:(duration=100,r=255,g=255,b=255)=>scene.cameras?.main?.flash(duration,r,g,b)}}
window.GutpopperVisual={version:VERSION,palettes,pop,floatText,screenFlash,confetti,springNumber,threeStudio,toyMaterial,prepareToyObject,blobShadow,addToyGround,resizeThree,phaserJuice};
window.dispatchEvent(new CustomEvent('gutpopper-visual-ready',{detail:{version:VERSION}}));
})();
`;
}

export function houseStyleBrief({ engine = 'auto', artStyle = 'auto', concept = '' } = {}) {
  const isThree = engine === 'three';
  const isPhaser = engine === 'phaser3' || engine === 'phaser4';
  return `GUTPOPPER CASUAL HOUSE STYLE v${HOUSE_STYLE_VERSION}\nVisual identity: bright, polished, toy-like modern casual game. The goal is a screenshot that could sit beside strong Poki/mobile-casual games without looking homemade.\n\nNON-NEGOTIABLE LOOK\n- Bright saturated palette with intentional warm/cool contrast. Avoid muddy beige/gray expanses and weak low-contrast palettes.\n- Create obvious visual depth: foreground/midground/background separation, overlap, scale changes, shadows, lighting gradients, atmospheric depth, or perspective. Flat isometric-looking rectangles with no lighting are not enough.\n- Major gameplay objects need designed silhouettes and layered detail. A car should read as body + cabin + windows + wheels + trim; a character should read as head/body/limbs/accessories; environment props should have multiple readable components.\n- Every important object needs grounding: real-time/fake shadow, contact shadow, highlight, outline, or another depth cue appropriate to the engine.\n- Environment must feel dressed, not empty: use repeated modular props, edge details, ground variation, vegetation/signs/fences/curbs/decals/debris/architecture as appropriate.\n- UI should look like a casual game, not a website/dashboard: rounded tactile buttons, strong type hierarchy, compact HUD, icons/badges/progress meters, depth and press states.\n- Use motion design constantly but tastefully: eased entrances, hover/bob, squash/pop, pickup arcs, particles, trails, flashes, camera kick, celebration, fail reaction.\n- Success/failure should have a clear audiovisual-looking visual beat even when audio assets are not available.\n- Phone and desktop may recompose, but both must look intentionally authored.\n\nSHARED PRESENTATION KIT\n- ./starter/presentation.css and ./starter/presentation.js are installed. Use GutpopperVisual helpers instead of rebuilding generic polish systems.\n- Prefer .gv-card/.gv-button/.gv-pill/.gv-meter for DOM UI foundations, then customize them to the chosen theme.\n- Use GutpopperVisual.pop(), floatText(), confetti(), screenFlash(), springNumber() for juice where appropriate.\n${isThree ? `- THREE.JS QUALITY BASELINE: call GutpopperVisual.threeStudio(scene, renderer), GutpopperVisual.resizeThree(renderer,camera), enable cast/receive shadows, use MeshStandardMaterial/toyMaterial rather than unlit flat colors, use blob/contact shadows where helpful, and compose a real perspective/isometric 3D scene.\n- Use bevel-like layered geometry, separate windows/trim/wheels/props, directional key light + hemisphere fill, fog/atmosphere, and camera easing. Avoid building the world as colored boxes on a flat plane.` : ''}\n${isPhaser ? `- PHASER QUALITY BASELINE: use layered sprites/shapes, gradients/textures, drop/contact shadows, parallax/depth groups, tweened motion, particles and camera feedback. Use GutpopperVisual.phaserJuice(scene). A Phaser game may be 2D, but it must still have depth, layering and rich presentation rather than flat DOM rectangles.` : ''}\n\nCONCEPT\n${String(concept).slice(0,800)}\n\nA simple mechanic is fine. A simple-looking production is not.`;
}

export async function writeHouseStyleKit({ gameDir, engine, artStyle }) {
  const starterDir = path.join(gameDir, 'starter');
  await fsp.mkdir(starterDir, { recursive: true });
  const manifest = {
    name: GUTPOPPER_HOUSE_STYLE.name,
    version: HOUSE_STYLE_VERSION,
    engine,
    artStyle,
    files: ['presentation.css','presentation.js'],
    principles: GUTPOPPER_HOUSE_STYLE.principles
  };
  await Promise.all([
    fsp.writeFile(path.join(starterDir, 'presentation.css'), presentationCss(), 'utf8'),
    fsp.writeFile(path.join(starterDir, 'presentation.js'), presentationJs(), 'utf8'),
    fsp.writeFile(path.join(starterDir, 'house-style.json'), JSON.stringify(manifest, null, 2), 'utf8')
  ]);
  return manifest;
}
