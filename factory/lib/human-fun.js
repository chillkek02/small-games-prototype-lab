import fsp from 'node:fs/promises';
import path from 'node:path';

export const HUMAN_FUN_VERSION='1.0.0';
const VERDICTS=new Set(['pending','fun','pivot','park']);
function rootFor(stateDir){return path.join(stateDir,'human-fun')}
function fileFor(stateDir,game){return path.join(rootFor(stateDir),`${game}.json`)}
async function readJson(file,fallback=null){try{return JSON.parse(await fsp.readFile(file,'utf8'))}catch{return fallback}}
async function ensure(stateDir){await fsp.mkdir(rootFor(stateDir),{recursive:true})}
export async function getHumanFunGate({stateDir,game,title=''}){await ensure(stateDir);const current=await readJson(fileFor(stateDir,game),null);return current||{version:HUMAN_FUN_VERSION,game,title,verdict:'pending',note:'',createdAt:null,updatedAt:null,productionUnlocked:false}}
export async function setHumanFunGate({stateDir,game,title='',verdict='pending',note=''}){if(!VERDICTS.has(verdict))throw new Error('Invalid human fun verdict.');await ensure(stateDir);const previous=await getHumanFunGate({stateDir,game,title});const now=new Date().toISOString();const next={...previous,version:HUMAN_FUN_VERSION,game,title:title||previous.title||game,verdict,note:String(note||'').slice(0,1200),productionUnlocked:verdict==='fun',createdAt:previous.createdAt||now,updatedAt:now};await fsp.writeFile(fileFor(stateDir,game),JSON.stringify(next,null,2),'utf8');return next}
