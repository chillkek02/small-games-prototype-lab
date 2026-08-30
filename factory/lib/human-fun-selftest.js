import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getHumanFunGate, setHumanFunGate } from './human-fun.js';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'gutpopper-human-fun-'));
try{
  let gate=await getHumanFunGate({stateDir:root,game:'test-game',title:'Test Game'});
  if(gate.verdict!=='pending'||gate.productionUnlocked)throw new Error('New gate must start pending and locked.');
  gate=await setHumanFunGate({stateDir:root,game:'test-game',title:'Test Game',verdict:'pivot',note:'Loop repeats without decisions.'});
  if(gate.productionUnlocked||gate.verdict!=='pivot')throw new Error('Pivot must remain locked.');
  gate=await setHumanFunGate({stateDir:root,game:'test-game',title:'Test Game',verdict:'fun',note:'I want another run.'});
  if(!gate.productionUnlocked||gate.verdict!=='fun')throw new Error('Fun verdict must unlock production.');
  console.log('Human Fun Gate self-test passed · pending → pivot → fun unlock');
} finally {await fsp.rm(root,{recursive:true,force:true}).catch(()=>{})}
