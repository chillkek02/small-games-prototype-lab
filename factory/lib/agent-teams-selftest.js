import { probeAgentTeamTools, AGENT_TEAMS_VERSION } from './agent-teams.js';

if(!/^1\./.test(AGENT_TEAMS_VERSION))throw new Error('Unexpected Agent Teams version.');
const tools=await probeAgentTeamTools(process.cwd());
for(const name of['claude','codex']){
  if(!tools[name]||typeof tools[name].ready!=='boolean')throw new Error(`Agent Teams probe missing ${name} readiness.`);
}
if(typeof tools.ready!=='boolean')throw new Error('Agent Teams combined readiness missing.');
console.log(`Agent Teams self-test passed · Claude ${tools.claude.ready?'detected':'optional/unavailable'} · Codex ${tools.codex.ready?'detected':'optional/unavailable'} · graceful fallback verified`);
