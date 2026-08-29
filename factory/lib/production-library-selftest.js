import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeUiMenuKit } from './ui-menu-kit.js';
import { writeAssetAnimationKit } from './asset-kit.js';
import { writeShaderVfxKit } from './shader-vfx-kit.js';
import { writeModelForgeKit } from './model-forge-kit.js';
import { writeCharacterRigKit } from './character-rig-kit.js';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'gutpopper-production-library-'));
try{
  await Promise.all([
    writeUiMenuKit({gameDir:root}),
    writeAssetAnimationKit({gameDir:root}),
    writeShaderVfxKit({gameDir:root}),
    writeModelForgeKit({gameDir:root}),
    writeCharacterRigKit({gameDir:root})
  ]);
  const files=['ui-menu.js','asset-kit.js','shader-vfx.js','model-forge.js','character-forge.js'];
  for(const file of files){
    const full=path.join(root,'starter',file);
    const result=spawnSync(process.execPath,['--check',full],{encoding:'utf8',windowsHide:true});
    if(result.status!==0)throw new Error(`${file} generated invalid JavaScript:\n${result.stderr||result.stdout}`);
  }
  console.log(`Production Library self-test passed · ${files.join(', ')}`);
} finally {
  await fsp.rm(root,{recursive:true,force:true}).catch(()=>{});
}
