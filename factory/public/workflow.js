const wf={game:null,data:null,timer:null,elapsedTimer:null};
const q=s=>document.querySelector(s);
function gameId(){const href=q('#openGame')?.getAttribute('href')||'';const m=href.match(/^\/game\/([^/]+)/);return m?decodeURIComponent(m[1]):null}
async function api(url,options){const r=await fetch(url,options),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function elapsed(iso){const ms=Math.max(0,Date.now()-Date.parse(iso||Date.now())),s=Math.floor(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'}

function ensureFlow(){if(q('#productionFlow'))return;const preview=q('.preview-panel');if(!preview)return;const panel=document.createElement('section');panel.id='productionFlow';panel.className='production-flow panel';panel.innerHTML=`<div class="flow-head"><div><span class="eyebrow">PRODUCTION FLOW</span><h2>One game. One clear next step.</h2><p>The Factory advances left → right. Completed steps stay visible; the highlighted step is what matters now.</p></div><div class="flow-now"><span>You are here</span><strong id="flowNowTitle">Select a game</strong><small id="flowNowState">Waiting</small></div></div><div id="flowSteps" class="flow-steps"></div><div class="flow-primary"><div class="flow-primary-copy"><span>Next action</span><strong id="flowActionTitle">Choose a prototype or create a new one</strong><small id="flowActionHelp">The Factory will guide you from build through real-player testing.</small></div><button id="flowPrimaryButton" class="primary-button" type="button" disabled>Start</button></div>`;preview.before(panel);q('#flowPrimaryButton').addEventListener('click',runPrimaryAction)}
function ensureJobProgress(){const jobView=q('#jobView');if(!jobView||q('#jobProgress'))return;const box=document.createElement('div');box.id='jobProgress';box.className='operation-progress hidden';box.innerHTML='<div class="operation-progress-head"><span>Current operation</span><strong id="jobProgressPercent">0%</strong></div><div class="progress-track"><div id="jobProgressFill" class="progress-fill"></div></div><div class="operation-progress-meta"><span id="jobProgressStage">Waiting</span><span id="jobProgressElapsed">0s</span></div><div id="jobProgressDetail" class="progress-detail">No operation running.</div>';jobView.insertBefore(box,jobView.firstChild)}
function markToolbar(){['#assetLabButton','#reloadPreview','#openGame'].forEach(s=>q(s)?.classList.add('utility-action'));['#assetAutopilotButton','#gameDoctor'].forEach(s=>q(s)?.classList.add('workflow-action'))}

const STEPS=[
  {id:'plan',n:1,title:'Plan',sub:'Hook + direction'},
  {id:'build',n:2,title:'Build',sub:'Playable loop'},
  {id:'assets',n:3,title:'Assets',sub:'Autopilot polish'},
  {id:'doctor',n:4,title:'Doctor',sub:'Quality audit'},
  {id:'polish',n:5,title:'Polish',sub:'Fix + Studio Loop'},
  {id:'test',n:6,title:'Poki Test',sub:'Real players'},
  {id:'decision',n:7,title:'Decide',sub:'Promote / iterate'}
];
function stepHtml(step,state){return`<button class="flow-step ${state}" data-flow-step="${step.id}" type="button"><span class="flow-number">${state==='done'?'✓':step.n}</span><strong>${step.title}</strong><small>${step.sub}</small></button>`}
function latestForGame(jobs,game){return(jobs||[]).find(j=>j.game===game)||null}
function doctorPass(run){const a=run?.result;if(!a)return false;const adPass=a.adReadiness?.applicable===false||a.adPassed;return Boolean(a.qa?.passed&&a.visualFloorPassed&&a.retentionPassed&&adPass&&Number(a.visualScore||0)>=85&&Number(a.performanceScore||0)>=75&&Number(a.pokiScore||0)>=75)}
function computeFlow(d){
  const job=d.job,auto=d.autopilot||{},doc=d.doctor?.run||null,funnel=d.funnel||{},tests=funnel.tests||[],runningJob=job&&['queued','running'].includes(job.status),autoRunning=auto.phase==='running',docRunning=doc?.status==='running';
  const states={plan:'done',build:runningJob?'active':'done',assets:auto.phase==='completed'?'done':autoRunning?'active':'pending',doctor:doc?.status==='completed'?'done':docRunning?'active':'pending',polish:'pending',test:tests.length?'done':'pending',decision:tests.length?'active':'pending'};
  let current='assets';
  if(runningJob)current=job.kind==='new-game'?'build':(autoRunning?'assets':'polish');
  else if(autoRunning)current='assets';
  else if(docRunning)current='doctor';
  else if(auto.phase!=='completed')current='assets';
  else if(doc?.status!=='completed')current='doctor';
  else if(!doctorPass(doc)){current='polish';states.polish='active'}
  else if(!tests.length){current='test';states.test='active';states.polish='done'}
  else{current='decision';states.polish='done';states.test='done';states.decision='active'}
  if(current==='doctor')states.doctor='active';if(current==='assets')states.assets='active';if(current==='build')states.build='active';
  if(['doctor','polish','test','decision'].includes(current)&&auto.phase==='completed')states.assets='done';
  if(['polish','test','decision'].includes(current)&&doc?.status==='completed')states.doctor='done';
  if(current==='test'&&doctorPass(doc))states.polish='done';
  return{current,states,job,auto,doc,funnel};
}
function actionFor(flow){
  switch(flow.current){
    case'build':return{label:'Watch Build',title:'The Factory is building the playable game',help:'Follow the live progress panel on the right. No extra action is needed.',disabled:true};
    case'assets':return flow.auto?.phase==='running'?{label:'Assets Running',title:'Asset Autopilot is improving the game',help:'Library search → reuse/adapt → generate missing assets → integrate → QA → harvest.',disabled:true}:{label:'Run Asset Autopilot',title:'Polish the game assets automatically',help:'Search the global library first, then create only what the game is missing.',action:'assets'};
    case'doctor':return flow.doc?.status==='running'?{label:'Doctor Running',title:'Game Doctor is auditing the game',help:'Open Game Doctor to watch its exact phase and percentage.',action:'doctor'}:{label:'Run Game Doctor',title:'Measure the game before more polishing',help:'Technical QA, AI playtest, retention, ads, performance, Poki readiness and visual review.',action:'doctor'};
    case'polish':return{label:'Review + Fix',title:'Quality findings need a polish pass',help:'Review the latest Doctor report, send its fixes to Director, then run Studio Loop.',action:'polish'};
    case'test':return{label:'Open Poki Test',title:'Internal quality is ready for real players',help:'Record the current Poki test result; real-player evidence outranks synthetic scores.',action:'test'};
    case'decision':return{label:'Open Winner Board',title:flow.funnel?.decision?.status?String(flow.funnel.decision.status).replaceAll('_',' '):'Review real-player decision',help:flow.funnel?.decision?.next||'Promote, iterate, or park the concept based on real-player evidence.',action:'decision'};
    default:return{label:'Open Plan',title:'Define the game hypothesis',help:'Set hook, Session 0, art direction and test hypothesis before spending build time.',action:'plan'};
  }
}
function renderFlow(d){ensureFlow();const f=computeFlow(d);wf.data=f;q('#flowSteps').innerHTML=STEPS.map(s=>stepHtml(s,f.states[s.id]||'pending')).join('');q('#flowSteps').querySelectorAll('.flow-step').forEach(b=>b.addEventListener('click',()=>runStep(b.dataset.flowStep)));const cur=STEPS.find(s=>s.id===f.current);q('#flowNowTitle').textContent=`Step ${cur?.n||'—'} · ${cur?.title||'Ready'}`;q('#flowNowState').textContent=f.current==='decision'?(f.funnel?.decision?.status||'Review results'):f.states[f.current]==='active'?'In progress / next':'Ready';const a=actionFor(f);q('#flowActionTitle').textContent=a.title;q('#flowActionHelp').textContent=a.help;const btn=q('#flowPrimaryButton');btn.textContent=a.label;btn.dataset.action=a.action||'';btn.disabled=Boolean(a.disabled)}
function runStep(id){if(!wf.data)return;const old=wf.data.current;wf.data.current=id;const a=actionFor(wf.data);wf.data.current=old;if(a.action)runAction(a.action);else if(id==='build')q('.command-panel')?.scrollIntoView({behavior:'smooth',block:'center'})}
function runPrimaryAction(){runAction(q('#flowPrimaryButton')?.dataset.action)}
function runAction(action){
  if(action==='assets')return q('#assetAutopilotButton')?.click();
  if(action==='doctor')return q('#gameDoctor')?.click();
  if(action==='polish'){if(window.GutpopperDoctor?.openLatest)return window.GutpopperDoctor.openLatest();q('.command-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return}
  if(action==='test')return q('#pokiTestButton')?.click();
  if(action==='decision'){q('#studioToolsButton')?.click();setTimeout(()=>q('.studio-tools-tab[data-tab="portfolio"]')?.click(),80);return}
  if(action==='plan'){q('#studioToolsButton')?.click();setTimeout(()=>q('.studio-tools-tab[data-tab="plan"]')?.click(),80)}
}
function jobProgress(job){
  if(!job)return{percent:0,stage:'Idle',detail:'No Factory build is running.'};if(['passed','needs-review','failed'].includes(job.status))return{percent:100,stage:job.stage||job.status,detail:job.status==='passed'?'Build and QA finished.':job.status==='needs-review'?'Build finished; review quality findings.':'Operation failed; review the agent log.'};const s=String(job.stage||'').toLowerCase();let p=12;if(s.includes('dispatch'))p=4;else if(s.includes('new game build'))p=7;else if(s.includes('codex implementation'))p=15;else if(s.includes('automated qa'))p=48;else if(s.includes('qa after repair'))p=56;else if(s.includes('first-prototype'))p=62;else if(s.includes('studio visual director'))p=70;else if(s.includes('studio loop · baseline'))p=76;else if(s.includes('studio loop · improve')){const m=s.match(/(\d+)\/(\d+)/);p=m?76+Math.round((Number(m[1])/Math.max(1,Number(m[2])))*14):82}else if(s.includes('studio loop · evaluate'))p=93;else if(s.includes('studio loop finished'))p=97;const last=(job.logs||[]).filter(Boolean).at(-1)||'The Factory is working on this stage.';return{percent:Math.min(99,p),stage:job.stage||'Working',detail:last}}
function renderJobProgress(job){ensureJobProgress();const box=q('#jobProgress');if(!box)return;if(!job){box.classList.add('hidden');return}const pr=jobProgress(job),running=['queued','running'].includes(job.status);box.classList.remove('hidden');box.classList.toggle('running',running);q('#jobProgressPercent').textContent=pr.percent+'%';q('#jobProgressFill').style.width=pr.percent+'%';q('#jobProgressStage').textContent=pr.stage;q('#jobProgressElapsed').textContent=elapsed(job.startedAt||job.createdAt);q('#jobProgressDetail').textContent=pr.detail}
async function refresh(){const game=gameId();wf.game=game;ensureFlow();ensureJobProgress();markToolbar();if(!game){q('#flowNowTitle').textContent='Select a game';q('#flowNowState').textContent='Waiting';q('#flowSteps').innerHTML=STEPS.map(s=>stepHtml(s,'blocked')).join('');q('#flowPrimaryButton').disabled=true;renderJobProgress(null);return}try{const[jobs,auto,doctor,funnel,plan]=await Promise.all([api('/api/jobs?t='+Date.now()),api('/api/games/'+encodeURIComponent(game)+'/asset-autopilot?t='+Date.now()).catch(()=>({phase:'idle'})),api('/api/games/'+encodeURIComponent(game)+'/doctor/latest?t='+Date.now()).catch(()=>({run:null})),api('/api/games/'+encodeURIComponent(game)+'/test-funnel?t='+Date.now()).catch(()=>({tests:[],decision:null})),api('/api/games/'+encodeURIComponent(game)+'/studio-plan?t='+Date.now()).catch(()=>({status:'draft'}))]);const job=latestForGame(jobs.jobs,game);renderFlow({job,autopilot:auto,doctor,funnel,plan});renderJobProgress(job)}catch(e){q('#flowNowState').textContent='Status unavailable';console.warn('Workflow refresh',e)}}
function init(){ensureFlow();ensureJobProgress();markToolbar();const open=q('#openGame');if(open)new MutationObserver(()=>{clearTimeout(wf.timer);refresh()}).observe(open,{attributes:true,attributeFilter:['href']});window.addEventListener('factory-doctor-update',refresh);window.addEventListener('factory-autopilot-update',refresh);refresh();setInterval(refresh,4000);wf.elapsedTimer=setInterval(()=>{const game=gameId();if(game)refresh()},15000)}
init();
