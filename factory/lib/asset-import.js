import fsp from 'node:fs/promises';
import path from 'node:path';

export const ASSET_IMPORT_VERSION='1.0.0';
export const MAX_IMPORT_BYTES=4*1024*1024;
const SAFE_MIME=new Map([
  ['image/png','.png'],['image/webp','.webp'],['image/jpeg','.jpg'],['image/svg+xml','.svg']
]);

function slugify(value='asset'){return String(value||'asset').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'asset'}
async function exists(file){return Boolean(await fsp.stat(file).catch(()=>null))}
async function uniqueStem(dir,base){let stem=slugify(base),i=1;while(await exists(path.join(dir,stem+'.json'))||await exists(path.join(dir,stem+'.svg'))||await exists(path.join(dir,stem+'.png'))||await exists(path.join(dir,stem+'.webp'))||await exists(path.join(dir,stem+'.jpg'))){i+=1;stem=slugify(base)+'-'+i}return stem}
function decodeBase64(value=''){const raw=String(value).replace(/^data:[^;]+;base64,/,'');if(!/^[A-Za-z0-9+/=\r\n]*$/.test(raw))throw new Error('Invalid base64 payload.');const buffer=Buffer.from(raw,'base64');if(buffer.length>MAX_IMPORT_BYTES)throw new Error('Asset is larger than the 4 MB Import Lab limit.');return buffer}
function cleanVector(def){if(!def||typeof def!=='object')return null;const out={kind:'vector',name:String(def.name||'').slice(0,100),viewBox:Array.isArray(def.viewBox)?def.viewBox.slice(0,4).map(Number):null,width:Number(def.width)||null,height:Number(def.height)||null,sourceType:String(def.sourceType||'vector').slice(0,40),trace:def.trace&&typeof def.trace==='object'?{alphaThreshold:Number(def.trace.alphaThreshold)||0,simplify:Number(def.trace.simplify)||0,points:Number(def.trace.points)||0}:null,extrude:def.extrude&&typeof def.extrude==='object'?{depth:Number(def.extrude.depth)||.18,bevel:Number(def.extrude.bevel)||.02,color:String(def.extrude.color||'#ff7b69').slice(0,24)}:{depth:.18,bevel:.02,color:'#ff7b69'}};if(Array.isArray(def.layers))out.layers=def.layers.slice(0,24).map((x,index)=>({id:String(x?.id||`layer-${index+1}`).slice(0,60),path:String(x?.path||'').slice(0,200000),color:String(x?.color||out.extrude.color).slice(0,24),z:Number(x?.z)||0})).filter(x=>x.path.length>=4);else if(def.path)out.path=String(def.path).slice(0,300000);if(!out.path&&!out.layers?.length)return null;return out}
function vectorSvg(def){const vb=def.viewBox?.length===4?def.viewBox:[0,0,def.width||256,def.height||256];const paths=def.layers?.length?def.layers.map(x=>`<path d="${String(x.path).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" fill="${x.color||def.extrude?.color||'#ff7b69'}"/>`).join(''):`<path d="${String(def.path||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" fill="${def.extrude?.color||'#ff7b69'}"/>`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">${paths}</svg>`}
async function readCatalog(gameDir){const file=path.join(gameDir,'assets','asset-catalog.json');try{const data=JSON.parse(await fsp.readFile(file,'utf8'));return Array.isArray(data?.assets)?data:{version:ASSET_IMPORT_VERSION,assets:[]}}catch{return{version:ASSET_IMPORT_VERSION,assets:[]}}}
async function writeCatalog(gameDir,catalog){const dir=path.join(gameDir,'assets');await fsp.mkdir(dir,{recursive:true});catalog.version=ASSET_IMPORT_VERSION;catalog.updatedAt=new Date().toISOString();await fsp.writeFile(path.join(dir,'asset-catalog.json'),JSON.stringify(catalog,null,2),'utf8')}

export async function listImportedAssets({gameDir}){const catalog=await readCatalog(gameDir);return{version:ASSET_IMPORT_VERSION,assets:catalog.assets||[]}}

export async function importAsset({gameDir,payload={}}){
  const name=String(payload.name||payload.fileName||'asset').trim().slice(0,100)||'asset';
  const mime=String(payload.mime||'').toLowerCase();
  const mode=['billboard','vector','svg-vector'].includes(payload.mode)?payload.mode:'billboard';
  if(!SAFE_MIME.has(mime))throw new Error('Import Lab supports PNG, WebP, JPEG, and SVG files.');
  const assetsDir=path.join(gameDir,'assets'),importedDir=path.join(assetsDir,'imported'),vectorDir=path.join(assetsDir,'vectors');
  await Promise.all([fsp.mkdir(importedDir,{recursive:true}),fsp.mkdir(vectorDir,{recursive:true})]);
  const stem=await uniqueStem(importedDir,name),ext=SAFE_MIME.get(mime),sourceRel=`assets/imported/${stem}${ext}`,sourceFile=path.join(gameDir,sourceRel);
  let sourceBytes=0;
  if(payload.base64){const buffer=decodeBase64(payload.base64);sourceBytes=buffer.length;await fsp.writeFile(sourceFile,buffer)}
  else if(mime==='image/svg+xml'&&payload.svgText){const text=String(payload.svgText).slice(0,2_000_000);sourceBytes=Buffer.byteLength(text);if(sourceBytes>MAX_IMPORT_BYTES)throw new Error('SVG is larger than the 4 MB Import Lab limit.');await fsp.writeFile(sourceFile,text,'utf8')}
  else throw new Error('No asset data was provided.');

  let vector=null,vectorRel=null,previewRel=null;
  if(mode!=='billboard'){
    vector=cleanVector(payload.vectorDefinition);
    if(!vector)throw new Error('Vector mode requires traced or extracted path data.');
    vector.name=name;vector.sourceUrl='./'+sourceRel;vector.generatedAt=new Date().toISOString();vector.importVersion=ASSET_IMPORT_VERSION;
    vectorRel=`assets/vectors/${stem}.json`;previewRel=`assets/vectors/${stem}.svg`;
    await Promise.all([fsp.writeFile(path.join(gameDir,vectorRel),JSON.stringify(vector,null,2),'utf8'),fsp.writeFile(path.join(gameDir,previewRel),vectorSvg(vector),'utf8')]);
  }

  const catalog=await readCatalog(gameDir),entry={id:stem,name,mode,mime,bytes:sourceBytes,source:'./'+sourceRel,vector:vectorRel?'./'+vectorRel:null,preview:previewRel?'./'+previewRel:null,createdAt:new Date().toISOString(),usage:vectorRel?`const asset = await GutpopperModels.vector.loadAsset('./${vectorRel}');`:`const billboard = await GutpopperModels.vector.imageBillboard('./${sourceRel}', { width: 1, height: 1 });`};
  catalog.assets=(catalog.assets||[]).filter(x=>x.id!==stem);catalog.assets.push(entry);await writeCatalog(gameDir,catalog);
  return{version:ASSET_IMPORT_VERSION,asset:entry,catalog};
}
