import fsp from 'node:fs/promises';
import path from 'node:path';

export const ASSET_KIT_VERSION = '1.0.0';

function assetKitJs() {
  return `(()=>{
'use strict';
const VERSION=${JSON.stringify(ASSET_KIT_VERSION)};
const T=()=>window.THREE;
function mat(color,rough=.68,metal=.02){const THREE=T();return THREE?new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal}):null}
function mesh(geometry,material){const THREE=T();if(!THREE)return null;const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;return m}
function group(){const THREE=T();return THREE?new THREE.Group():null}
function add(parent,...children){children.flat().filter(Boolean).forEach(c=>parent?.add?.(c));return parent}
function box(w,h,d,color,opts={}){const THREE=T();if(!THREE)return null;const o=mesh(new THREE.BoxGeometry(w,h,d,opts.ws||1,opts.hs||1,opts.ds||1),mat(color,opts.roughness??.66,opts.metalness??.02));return o}
function cylinder(r1,r2,h,color,segments=12){const THREE=T();return THREE?mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat(color)):null}
function sphere(r,color,ws=16,hs=10){const THREE=T();return THREE?mesh(new THREE.SphereGeometry(r,ws,hs),mat(color)):null}
function cone(r,h,color,segments=10){const THREE=T();return THREE?mesh(new THREE.ConeGeometry(r,h,segments),mat(color)):null}
function setPos(o,x=0,y=0,z=0){if(o)o.position.set(x,y,z);return o}
function setScale(o,x=1,y=x,z=x){if(o)o.scale.set(x,y,z);return o}
function tree({trunk=0x8b5a38,leaf=0x62c766,height=3,scale=1}={}){const g=group();const t=setPos(cylinder(.28,.36,height*.48,trunk,9),0,height*.24,0);const crown=group();add(crown,setPos(sphere(.82,leaf,12,8),0,height*.66,0),setPos(sphere(.68,leaf,12,8),-.45,height*.58,.12),setPos(sphere(.64,leaf,12,8),.45,height*.58,-.08),setPos(sphere(.56,leaf,12,8),.05,height*.83,.08));add(g,t,crown);return setScale(g,scale)}
function rock({color=0x8d9aa5,scale=1}={}){const THREE=T();if(!THREE)return null;const o=mesh(new THREE.DodecahedronGeometry(.65,0),mat(color,.92,0));o.scale.set(1,.65,.85);o.rotation.set(.12,.35,.08);return setScale(o,scale,.65*scale,.85*scale)}
function crate({color=0xc98b4c,trim=0x9b6337,scale=1}={}){const g=group();add(g,box(1,1,1,color),setPos(box(1.04,.12,.08,trim),0,.28,.505),setPos(box(1.04,.12,.08,trim),0,-.28,.505),setPos(box(.12,1.04,.08,trim),.28,0,.505),setPos(box(.12,1.04,.08,trim),-.28,0,.505));return setScale(g,scale)}
function trafficCone({color=0xff7d39,white=0xfff4dc,scale=1}={}){const g=group();add(g,setPos(box(.78,.10,.78,0x27323d),0,.05,0),setPos(cone(.32,.9,color,14),0,.55,0),setPos(cylinder(.33,.33,.16,white,14),0,.48,0));return setScale(g,scale)}
function hydrant({color=0xff5f5f,metal=0xe8f3fa,scale=1}={}){const g=group();add(g,setPos(cylinder(.30,.34,.82,color,14),0,.43,0),setPos(cylinder(.41,.34,.16,color,14),0,.82,0),setPos(sphere(.28,color,14,8),0,.96,0),setPos(cylinder(.13,.13,.34,metal,12),.36,.58,0),setPos(cylinder(.13,.13,.34,metal,12),-.36,.58,0));g.children.slice(-2).forEach((x,i)=>x.rotation.z=Math.PI/2);return setScale(g,scale)}
function bench({wood=0xc7894f,metal=0x405063,scale=1}={}){const g=group();add(g,setPos(box(1.8,.14,.48,wood),0,.62,0),setPos(box(1.8,.56,.14,wood),0,.92,.20),setPos(box(.12,.65,.12,metal),-.68,.32,0),setPos(box(.12,.65,.12,metal),.68,.32,0));return setScale(g,scale)}
function coin({color=0xffd34d,scale=1}={}){const THREE=T();if(!THREE)return null;const o=mesh(new THREE.CylinderGeometry(.38,.38,.12,24),mat(color,.32,.18));o.rotation.x=Math.PI/2;return setScale(o,scale)}
function toyVehicle({body=0xff6f61,accent=0xfff4dc,glass=0x83d9ff,wheel=0x26303c,scale=1}={}){const g=group();const chassis=setPos(box(2.35,.58,1.25,body),0,.58,0);const cabin=setPos(box(1.25,.62,1.05,accent),-.12,1.08,0);const windshield=setPos(box(.62,.36,1.07,glass,{roughness:.25}),-.48,1.13,0);const bumper=setPos(box(.20,.24,1.18,0xe8eef3),1.22,.48,0);const wheels=[];for(const x of [-.72,.72])for(const z of [-.66,.66]){const w=setPos(cylinder(.28,.28,.20,wheel,16),x,.34,z);w.rotation.x=Math.PI/2;wheels.push(w)}add(g,chassis,cabin,windshield,bumper,wheels);g.userData.wheels=wheels;return setScale(g,scale)}
function toyHumanoid({shirt=0x4da8ff,pants=0x31465e,skin=0xf3be91,hair=0x5d4634,scale=1}={}){const g=group();const torso=setPos(box(.72,.82,.42,shirt),0,1.18,0);const head=setPos(sphere(.34,skin,16,10),0,1.83,0);const hairCap=setPos(sphere(.35,hair,14,8),0,1.92,-.02);hairCap.scale.y=.46;const limbs=[];for(const side of [-1,1]){limbs.push(setPos(cylinder(.10,.12,.66,skin,10),side*.47,1.17,0));limbs.at(-1).rotation.z=side*.08;limbs.push(setPos(cylinder(.13,.15,.72,pants,10),side*.22,.48,0))}add(g,torso,head,hairCap,limbs);g.userData.head=head;g.userData.torso=torso;return setScale(g,scale)}
function puff({color=0xffffff,opacity=.55,scale=1}={}){const THREE=T();if(!THREE)return null;const g=group();for(let i=0;i<5;i++){const m=new THREE.MeshStandardMaterial({color,roughness:1,transparent:true,opacity});const s=mesh(new THREE.SphereGeometry(.26+Math.random()*.18,10,7),m);s.position.set((Math.random()-.5)*.48,(Math.random()-.5)*.32,(Math.random()-.5)*.38);g.add(s)}return setScale(g,scale)}
function bob(object,{height=.08,speed=2,phase=Math.random()*6.28}={}){if(!object)return()=>{};const y=object.position.y;return t=>{object.position.y=y+Math.sin(t*speed+phase)*height}}
function sway(object,{amount=.05,speed=2.2,phase=Math.random()*6.28}={}){if(!object)return()=>{};const rz=object.rotation.z;return t=>{object.rotation.z=rz+Math.sin(t*speed+phase)*amount}}
function spin(object,{axis='y',speed=2}={}){return dt=>{if(object?.rotation)object.rotation[axis]+=dt*speed}}
function wheelSpin(wheels,{speed=7}={}){return dt=>{for(const wheel of wheels||[])wheel.rotation.z-=dt*speed}}
function squash(object,{amount=.14,duration=220}={}){if(!object)return;const base=object.scale.clone?.();if(!base)return;const start=performance.now();const tick=now=>{const t=Math.min(1,(now-start)/duration);const wave=Math.sin(t*Math.PI)*amount;object.scale.set(base.x*(1+wave),base.y*(1-wave),base.z*(1+wave));if(t<1)requestAnimationFrame(tick);else object.scale.copy(base)};requestAnimationFrame(tick)}
function phaserPreset(name){const presets={idle:{duration:900,yoyo:true,ease:'Sine.InOut'},pop:{duration:120,yoyo:true,ease:'Back.Out'},hit:{duration:70,yoyo:true,ease:'Quad.Out'},celebrate:{duration:420,yoyo:true,ease:'Back.Out'},hover:{duration:700,yoyo:true,ease:'Sine.InOut'}};return presets[name]||presets.pop}
window.GutpopperAssets={version:VERSION,three:{mat,box,cylinder,sphere,cone,tree,rock,crate,trafficCone,hydrant,bench,coin,toyVehicle,toyHumanoid,puff},motion:{bob,sway,spin,wheelSpin,squash,phaserPreset}};
window.dispatchEvent(new CustomEvent('gutpopper-assets-ready',{detail:{version:VERSION}}));
})();\n`;
}

export async function writeAssetAnimationKit({ gameDir }) {
  const starterDir = path.join(gameDir, 'starter');
  await fsp.mkdir(starterDir, { recursive: true });
  const manifest = {
    name: 'Gutpopper Asset + Animation Forge',
    version: ASSET_KIT_VERSION,
    threePrefabs: ['tree','rock','crate','trafficCone','hydrant','bench','coin','toyVehicle','toyHumanoid','puff'],
    motionPresets: ['bob','sway','spin','wheelSpin','squash','phaserPreset']
  };
  await Promise.all([
    fsp.writeFile(path.join(starterDir, 'asset-kit.js'), assetKitJs(), 'utf8'),
    fsp.writeFile(path.join(starterDir, 'asset-kit.json'), JSON.stringify(manifest, null, 2), 'utf8')
  ]);
  return manifest;
}

export function assetKitBrief() {
  return `GUTPOPPER ASSET + ANIMATION FORGE v${ASSET_KIT_VERSION}\n- ./starter/asset-kit.js is installed and exposes window.GutpopperAssets.\n- For Three.js, reusable authored-looking procedural prefabs include tree, rock, crate, trafficCone, hydrant, bench, coin, toyVehicle, toyHumanoid and puff. Treat these as starting components: vary scale/materials/composition and combine them into richer assets rather than cloning identical props everywhere.\n- Motion helpers include bob, sway, spin, wheelSpin and squash. Phaser has reusable tween preset timings.\n- Prefer a library/prefab mindset: define a prop once and instance/reuse it instead of hand-writing dozens of unrelated primitive meshes.\n- Build major assets as multi-part assemblies with silhouette, material separation, secondary details and motion.\n- The Forge is intentionally lightweight and procedural so browser load stays fast. If a project later has imported/custom GLB assets, combine them with this system rather than discarding them.`;
}
