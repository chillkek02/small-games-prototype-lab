import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importAsset, listImportedAssets } from './asset-import.js';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'gutpopper-asset-import-'));
try{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90 L10 90 Z" fill="#ff7b69"/></svg>';
  const vectorDefinition={kind:'vector',name:'test-badge',viewBox:[0,0,100,100],width:100,height:100,sourceType:'svg-extract',layers:[{id:'layer-1',path:'M 10 10 L 90 10 L 90 90 L 10 90 Z',color:'#ff7b69',z:0}],extrude:{depth:.18,bevel:.02,color:'#ff7b69'}};
  const first=await importAsset({gameDir:root,payload:{name:'test-badge',fileName:'test.svg',mime:'image/svg+xml',mode:'svg-vector',svgText:svg,vectorDefinition}});
  const second=await importAsset({gameDir:root,payload:{name:'test-badge',fileName:'test.svg',mime:'image/svg+xml',mode:'svg-vector',svgText:svg,vectorDefinition}});
  if(first.asset.id===second.asset.id)throw new Error('Duplicate import overwrote the original asset id.');
  for(const rel of[first.asset.source,first.asset.vector,first.asset.preview,second.asset.source,second.asset.vector,second.asset.preview]){const file=path.join(root,String(rel).replace(/^\.\//,''));if(!(await fsp.stat(file).catch(()=>null))?.isFile())throw new Error('Missing imported asset file: '+rel)}
  const catalog=await listImportedAssets({gameDir:root});if(catalog.assets.length!==2)throw new Error('Expected 2 catalog entries, got '+catalog.assets.length);
  console.log('Asset Import self-test passed · original + vector JSON + SVG preview + duplicate-safe catalog');
} finally {
  await fsp.rm(root,{recursive:true,force:true}).catch(()=>{});
}
