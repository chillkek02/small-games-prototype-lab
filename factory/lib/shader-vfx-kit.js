import fsp from 'node:fs/promises';
import path from 'node:path';

export const SHADER_VFX_VERSION = '1.0.1';

export const SHADER_VFX_POLICY = {
  version: SHADER_VFX_VERSION,
  philosophy: 'Spend GPU math before download bytes, but never trade away mobile frame pacing for cosmetic effects.',
  defaultBudget: {
    fullscreenPostPasses: 0,
    animatedHeroMaterials: 6,
    transparentHeroLayers: 4,
    burstParticles: 28,
    shadowMapSize: 1024,
    maxPixelRatio: 1.75
  },
  preferred: ['lit toon/plastic','rim light','procedural gradient','small vertex wobble','water ripple','dissolve/reveal','emissive pulse','procedural glow','small particle burst','shockwave'],
  avoidByDefault: ['SSAO','depth-of-field','motion blur','multi-pass bloom stacks','large transparent fog volumes','many realtime point lights']
};

function runtimeJs() {
  return `(()=>{
'use strict';
const VERSION=${JSON.stringify(SHADER_VFX_VERSION)};
const POLICY=${JSON.stringify(SHADER_VFX_POLICY)};
const T=()=>window.THREE;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function budget(){const core=window.GutpopperCore;const view=core?.viewport?.()||{phone:innerWidth<=600};const mem=Number(navigator.deviceMemory||0);const low=view.phone&&(mem&&mem<=4);return{tier:low?'low':view.phone?'mobile':'desktop',fullscreenPostPasses:0,animatedHeroMaterials:low?3:view.phone?5:8,transparentHeroLayers:low?2:4,burstParticles:low?12:view.phone?20:32,maxPixelRatio:low?1.25:1.75}}
function colorValue(value){const THREE=T();return THREE?new THREE.Color(value):null}
function stylizeStandard(material,{rimColor=0xffffff,rimStrength=.12,gradientTop=0xffffff,gradientBottom=0x5f6f7c,gradientStrength=.08,gradientScale=.45,wobbleAmount=0,wobbleFrequency=3.2,wobbleSpeed=2.2}={}){
  const THREE=T();if(!THREE||!material)return material;
  material.userData.gutpopperShaderFX={version:VERSION,uniforms:null};
  material.onBeforeCompile=shader=>{
    shader.uniforms.gpTime={value:0};shader.uniforms.gpRimColor={value:new THREE.Color(rimColor)};shader.uniforms.gpRimStrength={value:rimStrength};shader.uniforms.gpGradientTop={value:new THREE.Color(gradientTop)};shader.uniforms.gpGradientBottom={value:new THREE.Color(gradientBottom)};shader.uniforms.gpGradientStrength={value:gradientStrength};shader.uniforms.gpGradientScale={value:gradientScale};shader.uniforms.gpWobbleAmount={value:wobbleAmount};shader.uniforms.gpWobbleFrequency={value:wobbleFrequency};shader.uniforms.gpWobbleSpeed={value:wobbleSpeed};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\\nuniform float gpTime; uniform float gpWobbleAmount; uniform float gpWobbleFrequency; uniform float gpWobbleSpeed; varying vec3 gpViewNormal; varying float gpLocalY;').replace('#include <begin_vertex>','vec3 transformed = vec3(position);\\nfloat gpWave = sin((position.x + position.y*.7 + position.z*.45) * gpWobbleFrequency + gpTime * gpWobbleSpeed);\\ntransformed += normal * gpWave * gpWobbleAmount;\\ngpViewNormal = normalize(normalMatrix * normal); gpLocalY = position.y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\\nuniform vec3 gpRimColor; uniform float gpRimStrength; uniform vec3 gpGradientTop; uniform vec3 gpGradientBottom; uniform float gpGradientStrength; uniform float gpGradientScale; varying vec3 gpViewNormal; varying float gpLocalY;').replace('#include <dithering_fragment>','#include <dithering_fragment>\\nfloat gpFacing = abs(dot(normalize(gpViewNormal), vec3(0.0,0.0,1.0)));\\nfloat gpRim = pow(clamp(1.0-gpFacing,0.0,1.0),2.4);\\nfloat gpMix = clamp(0.5 + gpLocalY*gpGradientScale,0.0,1.0);\\nvec3 gpGradient = mix(gpGradientBottom,gpGradientTop,gpMix);\\ngl_FragColor.rgb = mix(gl_FragColor.rgb,gpGradient,gpGradientStrength);\\ngl_FragColor.rgb += gpRimColor * gpRim * gpRimStrength;');
    material.userData.gutpopperShaderFX.uniforms=shader.uniforms;
  };
  material.customProgramCacheKey=()=>['gpfx',rimStrength,gradientStrength,wobbleAmount,wobbleFrequency,wobbleSpeed].join(':');material.needsUpdate=true;return material;
}
function toyPlastic(color,{roughness=.58,metalness=.02,emissive=0x000000,emissiveIntensity=0,rimColor=0xffffff,rimStrength=.12,gradientStrength=.07,wobbleAmount=0}={}){const THREE=T();if(!THREE)return null;const m=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity});return stylizeStandard(m,{rimColor,rimStrength,gradientTop:colorValue(color).clone().lerp(new THREE.Color(0xffffff),.28),gradientBottom:colorValue(color).clone().multiplyScalar(.58),gradientStrength,wobbleAmount})}
function toonRamp(levels=4){const THREE=T();if(!THREE)return null;levels=Math.max(2,Math.min(6,Math.round(levels)));const data=new Uint8Array(levels*4);for(let i=0;i<levels;i++){const v=Math.round(70+(185*i/(levels-1)));data[i*4]=v;data[i*4+1]=v;data[i*4+2]=v;data[i*4+3]=255}const tex=new THREE.DataTexture(data,levels,1,THREE.RGBAFormat);tex.needsUpdate=true;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;return tex}
function toonMaterial(color,{levels=4,emissive=0x000000,emissiveIntensity=0}={}){const THREE=T();if(!THREE)return null;return new THREE.MeshToonMaterial({color,gradientMap:toonRamp(levels),emissive,emissiveIntensity})}
function rimShell(mesh,{color=0xffffff,scale=1.035,opacity=.22}={}){const THREE=T();if(!THREE||!mesh?.geometry)return null;const shell=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color,side:THREE.BackSide,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));shell.position.set(0,0,0);shell.rotation.set(0,0,0);shell.scale.setScalar(scale);mesh.add(shell);return shell}
function glowSprite({color='#ffffff',size=1.6,opacity=.5}={}){const THREE=T();if(!THREE)return null;const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');const g=ctx.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.22,color);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.SpriteMaterial({map:tex,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});const sprite=new THREE.Sprite(mat);sprite.scale.set(size,size,1);return sprite}
function waterMaterial({deep=0x249ac7,shallow=0x8ce9ff,opacity=.82,wave=.12,frequency=2.4,speed=1.2}={}){const THREE=T();if(!THREE)return null;const uniforms={time:{value:0},deep:{value:new THREE.Color(deep)},shallow:{value:new THREE.Color(shallow)},opacity:{value:opacity},wave:{value:wave},frequency:{value:frequency},speed:{value:speed}};const material=new THREE.ShaderMaterial({uniforms,transparent:opacity<1,depthWrite:opacity>=.95,vertexShader:'uniform float time; uniform float wave; uniform float frequency; uniform float speed; varying float vWave; varying vec3 vNormalView; void main(){ vec3 p=position; float w=(sin((p.x+p.z*.45)*frequency+time*speed)+cos((p.y+p.x*.35)*frequency*.83+time*speed*1.17))*.5; p += normal*w*wave; vWave=w; vNormalView=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }',fragmentShader:'uniform vec3 deep; uniform vec3 shallow; uniform float opacity; varying float vWave; varying vec3 vNormalView; void main(){ float edge=pow(1.0-abs(dot(normalize(vNormalView),vec3(0.0,0.0,1.0))),2.0); vec3 c=mix(deep,shallow,clamp(.5+vWave*.25+edge*.35,0.0,1.0)); gl_FragColor=vec4(c,opacity); }'});material.userData.gutpopperShaderFX={uniforms};return material}
function dissolveMaterial({color=0xff7a67,edge=0xffe66d,progress=0,softness=.08}={}){const THREE=T();if(!THREE)return null;const uniforms={progress:{value:progress},baseColor:{value:new THREE.Color(color)},edgeColor:{value:new THREE.Color(edge)},softness:{value:softness}};const material=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec3 vPos; varying vec3 vN; void main(){vPos=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float progress; uniform vec3 baseColor; uniform vec3 edgeColor; uniform float softness; varying vec3 vPos; varying vec3 vN; float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);} void main(){float n=hash(floor(vPos*8.0))+sin((vPos.x+vPos.y+vPos.z)*5.0)*.12;float threshold=progress*1.25-.12;if(n<threshold)discard;float e=1.0-smoothstep(threshold,threshold+softness,n);float light=.62+.38*max(dot(normalize(vN),normalize(vec3(.35,.8,.5))),0.0);gl_FragColor=vec4(mix(baseColor*light,edgeColor,e),1.0);}'});material.userData.gutpopperShaderFX={uniforms};return material}
function pulseEmissive(material,{base=.05,amount=.45,speed=3,phase=0}={}){return t=>{if(material&&'emissiveIntensity'in material)material.emissiveIntensity=base+(Math.sin(t*speed+phase)*.5+.5)*amount}}
function updateMaterial(material,timeSeconds){const u=material?.userData?.gutpopperShaderFX?.uniforms;if(u?.gpTime)u.gpTime.value=timeSeconds;if(u?.time)u.time.value=timeSeconds}
function updateObject(root,timeSeconds){root?.traverse?.(o=>{if(Array.isArray(o.material))o.material.forEach(m=>updateMaterial(m,timeSeconds));else updateMaterial(o.material,timeSeconds)})}
function setDissolve(material,progress){const u=material?.userData?.gutpopperShaderFX?.uniforms;if(u?.progress)u.progress.value=clamp(progress,0,1)}
function shockwave(scene,position,{color=0xffffff,duration=420,maxScale=3,opacity=.7}={}){const THREE=T();if(!THREE||!scene)return null;const mesh=new THREE.Mesh(new THREE.RingGeometry(.32,.42,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;mesh.position.copy?.(position);scene.add(mesh);const start=performance.now();const tick=now=>{const t=clamp((now-start)/duration,0,1);const e=1-Math.pow(1-t,3);mesh.scale.setScalar(1+e*maxScale);mesh.material.opacity=opacity*(1-t);if(t<1)requestAnimationFrame(tick);else{scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()}};requestAnimationFrame(tick);return mesh}
function particleBurst(scene,position,{count,basicColor=0xffe66d,duration=520,spread=1.5,size=.08}={}){const THREE=T();if(!THREE||!scene)return null;count=Math.min(Number(count)||budget().burstParticles,budget().burstParticles);const group=new THREE.Group();const pieces=[];for(let i=0;i<count;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(size,0),new THREE.MeshBasicMaterial({color:basicColor,transparent:true}));m.position.copy(position);const a=Math.random()*Math.PI*2,s=.7+Math.random()*spread;pieces.push({m,v:new THREE.Vector3(Math.cos(a)*s,.7+Math.random()*1.4,Math.sin(a)*s)});group.add(m)}scene.add(group);const start=performance.now(),last={v:start};const tick=now=>{const dt=Math.min(.04,(now-last.v)/1000);last.v=now;const t=clamp((now-start)/duration,0,1);for(const p of pieces){p.v.y-=3.2*dt;p.m.position.addScaledVector(p.v,dt);p.m.rotation.x+=dt*6;p.m.rotation.y+=dt*5;p.m.material.opacity=1-t}if(t<1)requestAnimationFrame(tick);else{scene.remove(group);for(const p of pieces){p.m.geometry.dispose();p.m.material.dispose()}}};requestAnimationFrame(tick);return group}
function screenPulse({color='rgba(255,255,255,.18)',duration=160}={}){if(window.GutpopperVisual?.screenFlash)return window.GutpopperVisual.screenFlash(color,duration);const e=document.createElement('div');Object.assign(e.style,{position:'fixed',inset:'0',zIndex:1500,pointerEvents:'none',background:color});document.body.append(e);e.animate([{opacity:0},{opacity:1},{opacity:0}],{duration}).finished.finally(()=>e.remove())}
function phaserImpact(scene,target,{scale=1.13,shake=.004,flash=false}={}){scene?.tweens?.add?.({targets:target,scaleX:scale,scaleY:scale,duration:80,yoyo:true,ease:'Back.Out'});scene?.cameras?.main?.shake?.(90,shake);if(flash)scene?.cameras?.main?.flash?.(70,255,255,255)}
window.GutpopperShaderFX={version:VERSION,policy:POLICY,budget,three:{stylizeStandard,toyPlastic,toonMaterial,rimShell,glowSprite,waterMaterial,dissolveMaterial,pulseEmissive,updateMaterial,updateObject,setDissolve,shockwave,particleBurst},screenPulse,phaser:{impact:phaserImpact}};
window.dispatchEvent(new CustomEvent('gutpopper-shader-fx-ready',{detail:{version:VERSION,budget:budget()}}));
})();\n`;
}

export async function writeShaderVfxKit({ gameDir }) {
  const starterDir = path.join(gameDir, 'starter');
  await fsp.mkdir(starterDir, { recursive:true });
  const manifest = {
    name:'Gutpopper Shader + VFX Forge',
    version:SHADER_VFX_VERSION,
    policy:SHADER_VFX_POLICY,
    threePresets:['stylizeStandard','toyPlastic','toonMaterial','rimShell','glowSprite','waterMaterial','dissolveMaterial','pulseEmissive','shockwave','particleBurst'],
    phaserPresets:['impact'],
    sharedPresets:['screenPulse']
  };
  await Promise.all([
    fsp.writeFile(path.join(starterDir,'shader-vfx.js'), runtimeJs(), 'utf8'),
    fsp.writeFile(path.join(starterDir,'shader-vfx.json'), JSON.stringify(manifest,null,2), 'utf8')
  ]);
  return manifest;
}

export function shaderVfxBrief() {
  return `GUTPOPPER SHADER + VFX FORGE v${SHADER_VFX_VERSION}\n- ./starter/shader-vfx.js exposes window.GutpopperShaderFX. It is code-only and adds no remote texture/postprocessing dependency.\n- Use shader/material effects as a QUALITY-PER-KILOBYTE tool: lit toy plastic, toon ramps, rim separation, subtle gradients, procedural water, wobble/squish, dissolve/reveal, emissive pulse, procedural glow, small particle bursts and shockwaves.\n- For Three.js, prefer GutpopperShaderFX.three.toyPlastic()/toonMaterial() for important materials and stylizeStandard() when an existing MeshStandardMaterial should keep normal lighting/shadows. Call updateObject(root,timeSeconds) for animated shader uniforms only on objects that need them. rimShell(mesh) attaches a lightweight outline/glow shell directly to that mesh.\n- Use waterMaterial() only on bounded water surfaces; dissolveMaterial() for cleanup/destruction/reveal moments; glow/rim selectively for focal objects and interactables.\n- The runtime budget() automatically lowers cosmetic counts on weaker phones. Respect it. Reuse materials rather than compiling a unique shader per prop.\n- Do NOT add SSAO, depth-of-field, motion blur, multi-pass bloom chains, giant transparent fog volumes or many realtime point lights by default. Fullscreen postprocessing budget is zero unless measured Game Doctor performance proves headroom.\n- A shader is not polish by itself. Effects must reinforce silhouettes, material identity, action feedback or theme. Keep the screen clean and readable.\n- Preserve capped DPR, fast startup, stable frame pacing and Poki compatibility. If an effect materially hurts phone FPS, simplify/remove the effect instead of lowering gameplay quality.`;
}
