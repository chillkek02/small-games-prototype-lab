const { spawn } = require('node:child_process');

const REAL_CODEX = process.env.GAME_FACTORY_REAL_CODEX_COMMAND || 'codex';
const DEFAULT_POLICY = String(process.env.GAME_FACTORY_MODEL_POLICY || 'auto').toLowerCase();

const MODELS = {
  luna: 'gpt-5.6-luna',
  terra: 'gpt-5.6-terra',
  sol: 'gpt-5.6-sol'
};

const HARD_SIGNALS = /\b(architecture|architectural|overhaul|large refactor|deep refactor|migration|multiplayer|networking|netcode|procedural generation|physics system|vehicle physics|pathfinding|state machine|race condition|memory leak|performance regression|rendering pipeline|save system|economy system|combat system|ai behavior|hard bug|intermittent bug|cross-file refactor|rewrite)\b/gi;
const MEDIUM_SIGNALS = /\b(gameplay|mechanic|feature|mission|level|enemy|boss|upgrade|progression|inventory|shop|save|particles|animation|camera|controls|touch controls|hud|ui|phaser|three\.js|threejs)\b/gi;

function forcedRoute(prompt) {
  const explicit = prompt.match(/\b(?:model\s*:\s*|\[model\s*=\s*)(luna|terra|sol)\]?/i);
  if (!explicit) return null;
  const key = explicit[1].toLowerCase();
  return {
    key,
    model: MODELS[key],
    effort: key === 'luna' ? 'low' : key === 'sol' ? 'high' : 'medium',
    verbosity: key === 'luna' ? 'low' : 'medium',
    reason: 'user override'
  };
}

function routePrompt(prompt) {
  const forced = forcedRoute(prompt);
  if (forced) return forced;

  if (DEFAULT_POLICY !== 'auto' && MODELS[DEFAULT_POLICY]) {
    const key = DEFAULT_POLICY;
    return {
      key,
      model: MODELS[key],
      effort: key === 'luna' ? 'low' : key === 'sol' ? 'high' : 'medium',
      verbosity: key === 'luna' ? 'low' : 'medium',
      reason: 'factory policy override'
    };
  }

  const lower = prompt.toLowerCase();
  const hardCount = (prompt.match(HARD_SIGNALS) || []).length;
  const mediumCount = (prompt.match(MEDIUM_SIGNALS) || []).length;
  const quick = lower.includes('you are the quick edit agent');
  const quickRepair = quick && lower.includes('factory qa found a problem');
  const newGame = lower.includes('create a brand-new production prototype');
  const qaRepair = lower.includes('automated qa failed');

  if (quickRepair) {
    return { key: 'terra', model: MODELS.terra, effort: 'low', verbosity: 'low', reason: 'quick repair needs more reliability' };
  }
  if (quick) {
    return { key: 'luna', model: MODELS.luna, effort: 'low', verbosity: 'low', reason: 'localized quick edit' };
  }
  if (hardCount >= 2 || (hardCount >= 1 && (qaRepair || prompt.length > 1800))) {
    return { key: 'sol', model: MODELS.sol, effort: 'high', verbosity: 'medium', reason: 'complex systems/debug workload' };
  }
  if (newGame) {
    return { key: 'terra', model: MODELS.terra, effort: 'high', verbosity: 'medium', reason: 'new playable game build' };
  }
  if (qaRepair) {
    return { key: 'terra', model: MODELS.terra, effort: 'high', verbosity: 'medium', reason: 'standard QA repair' };
  }
  if (mediumCount >= 2 || prompt.length > 900) {
    return { key: 'terra', model: MODELS.terra, effort: 'medium', verbosity: 'medium', reason: 'normal feature workload' };
  }
  return { key: 'luna', model: MODELS.luna, effort: 'low', verbosity: 'low', reason: 'small focused workload' };
}

function hasModelArg(args) {
  return args.some((arg, index) => arg === '-m' || arg === '--model' || String(arg).startsWith('--model=') || (index > 0 && (args[index - 1] === '-m' || args[index - 1] === '--model')));
}

function injectBeforePrompt(args, injected) {
  const copy = [...args];
  const promptIndex = copy.lastIndexOf('-');
  if (promptIndex >= 0) copy.splice(promptIndex, 0, ...injected);
  else copy.push(...injected);
  return copy;
}

function runPassthrough(args, input = null) {
  const child = spawn(REAL_CODEX, args, {
    stdio: input == null ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
    shell: process.platform === 'win32'
  });
  if (input != null && child.stdin) {
    child.stdin.write(input);
    child.stdin.end();
  }
  child.on('exit', code => process.exit(code ?? 1));
  child.on('error', error => {
    console.error(`Factory model router could not start Codex: ${error.message}`);
    process.exit(1);
  });
}

const args = process.argv.slice(2);
if (!args.includes('exec') || args.includes('--version') || args.includes('-V')) {
  runPassthrough(args);
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    const route = routePrompt(input);
    let routedArgs = args;
    if (!hasModelArg(args)) {
      routedArgs = injectBeforePrompt(args, [
        '-m', route.model,
        '-c', `model_reasoning_effort=${route.effort}`,
        '-c', `model_verbosity=${route.verbosity}`
      ]);
    }
    console.error(`FACTORY MODEL ROUTE · ${route.key.toUpperCase()} · ${route.model} · reasoning=${route.effort} · ${route.reason}`);
    runPassthrough(routedArgs, input);
  });
  process.stdin.resume();
}
