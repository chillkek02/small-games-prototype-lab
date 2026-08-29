const $ = selector => document.querySelector(selector);

const state = {
  games: [],
  selectedGame: null,
  activeJobId: null,
  lastJobStatus: null
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function setCodexStatus(codex) {
  $('#codexDot').className = `status-dot ${codex?.ready ? 'ready' : 'error'}`;
  $('#codexStatus').textContent = codex?.ready ? `Codex ready · ${codex.version || 'installed'}` : 'Codex not ready';
}

function renderGames() {
  $('#gameCount').textContent = state.games.length;
  $('#gameList').innerHTML = state.games.map(game => `
    <button class="game-item ${state.selectedGame?.id === game.id ? 'selected' : ''}" data-game="${escapeHtml(game.id)}" type="button">
      <span class="game-index">${escapeHtml(game.id.split('-')[0])}</span>
      <span class="game-copy">
        <strong>${escapeHtml(game.title)}</strong>
        <small>${escapeHtml(game.id)}</small>
      </span>
      <span class="chevron">›</span>
    </button>
  `).join('');

  document.querySelectorAll('.game-item').forEach(button => {
    button.addEventListener('click', () => selectGame(button.dataset.game));
  });
}

function selectGame(id) {
  state.selectedGame = state.games.find(game => game.id === id) || null;
  renderGames();
  if (!state.selectedGame) return;

  $('#selectedTitle').textContent = state.selectedGame.title;
  $('#emptyPreview').classList.add('hidden');
  $('#gameFrame').src = `${state.selectedGame.url}?factory=${Date.now()}`;
  $('#openGame').href = state.selectedGame.url;
  $('#openGame').classList.remove('disabled');
  $('#runBuild').disabled = false;
  $('#commandHint').textContent = `Target: ${state.selectedGame.id}`;
}

function badgeFor(status) {
  const labels = {
    queued: 'Queued',
    running: 'Building',
    passed: 'Passed',
    'needs-review': 'Review',
    failed: 'Failed'
  };
  return labels[status] || 'Idle';
}

function resultLabel(view) {
  if (!view) return '—';
  return view.passed ? 'PASS ✓' : 'FAIL';
}

function renderJob(job) {
  if (!job) return;
  $('#noJob').classList.add('hidden');
  $('#jobView').classList.remove('hidden');
  const badge = $('#jobStatusBadge');
  badge.className = `job-badge ${job.status}`;
  badge.textContent = badgeFor(job.status);
  $('#jobStage').textContent = job.stage || job.status;
  $('#jobAttempt').textContent = `Attempt ${job.attempt || 0}`;

  const desktop = job.qa?.views?.find(view => view.name === 'Desktop');
  const mobile = job.qa?.views?.find(view => view.name === 'Mobile');
  $('#desktopResult').textContent = resultLabel(desktop);
  $('#desktopResult').className = desktop ? (desktop.passed ? 'pass' : 'fail') : '';
  $('#mobileResult').textContent = resultLabel(mobile);
  $('#mobileResult').className = mobile ? (mobile.passed ? 'pass' : 'fail') : '';

  const screenshots = [];
  if (desktop?.screenshot) screenshots.push(`<a href="/artifacts/${encodeURIComponent(job.id)}/${encodeURIComponent(desktop.screenshot)}" target="_blank"><img src="/artifacts/${encodeURIComponent(job.id)}/${encodeURIComponent(desktop.screenshot)}?t=${Date.now()}" alt="Desktop QA screenshot"><span>Desktop</span></a>`);
  if (mobile?.screenshot) screenshots.push(`<a href="/artifacts/${encodeURIComponent(job.id)}/${encodeURIComponent(mobile.screenshot)}" target="_blank"><img src="/artifacts/${encodeURIComponent(job.id)}/${encodeURIComponent(mobile.screenshot)}?t=${Date.now()}" alt="Mobile QA screenshot"><span>Mobile</span></a>`);
  $('#screenshots').innerHTML = screenshots.join('');

  $('#jobLog').textContent = (job.logs || []).slice(-80).join('\n') || 'Waiting for output…';
  $('#jobLog').scrollTop = $('#jobLog').scrollHeight;

  if (job.diffStat) {
    $('#diffSection').classList.remove('hidden');
    $('#diffStat').textContent = job.diffStat;
  } else {
    $('#diffSection').classList.add('hidden');
  }

  if (job.error) {
    $('#jobLog').textContent += `\n\nERROR: ${job.error}`;
  }

  const terminal = ['passed', 'needs-review', 'failed'].includes(job.status);
  if (terminal && state.lastJobStatus !== job.status && state.selectedGame?.id === job.game) {
    $('#gameFrame').src = `${state.selectedGame.url}?factory=${Date.now()}`;
  }
  state.lastJobStatus = job.status;
  $('#runBuild').disabled = !state.selectedGame || !terminal;
}

function renderHistory(jobs) {
  $('#historyList').innerHTML = jobs.slice(0, 8).map(job => `
    <button class="history-item" data-job="${escapeHtml(job.id)}" type="button">
      <span class="history-dot ${escapeHtml(job.status)}"></span>
      <span>
        <strong>${escapeHtml(job.game)}</strong>
        <small>${escapeHtml(job.stage || job.status)}</small>
      </span>
      <time>${new Date(job.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
    </button>
  `).join('') || '<div class="history-empty">No factory runs yet.</div>';

  document.querySelectorAll('.history-item').forEach(button => {
    button.addEventListener('click', async () => {
      state.activeJobId = button.dataset.job;
      renderJob(await api(`/api/jobs/${encodeURIComponent(state.activeJobId)}`));
    });
  });
}

async function refresh() {
  try {
    const [status, jobsData] = await Promise.all([api('/api/status'), api('/api/jobs')]);
    setCodexStatus(status.codex);
    renderHistory(jobsData.jobs || []);

    if (!state.activeJobId && jobsData.jobs?.length) state.activeJobId = jobsData.jobs[0].id;
    if (state.activeJobId) {
      const job = await api(`/api/jobs/${encodeURIComponent(state.activeJobId)}`);
      renderJob(job);
    }
  } catch (error) {
    console.error(error);
  }
}

async function startBuild() {
  if (!state.selectedGame) return;
  const instruction = $('#instruction').value.trim();
  if (instruction.length < 4) {
    $('#instruction').focus();
    $('#commandHint').textContent = 'Describe the change first.';
    return;
  }

  $('#runBuild').disabled = true;
  $('#commandHint').textContent = 'Dispatching to the factory…';
  try {
    const job = await api('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: state.selectedGame.id, instruction })
    });
    state.activeJobId = job.id;
    state.lastJobStatus = null;
    renderJob(job);
    $('#commandHint').textContent = `Running ${job.id.slice(-8)} on ${job.game}`;
  } catch (error) {
    $('#commandHint').textContent = error.message;
    $('#runBuild').disabled = false;
  }
}

$('#runBuild').addEventListener('click', startBuild);
$('#instruction').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') startBuild();
});
$('#reloadPreview').addEventListener('click', () => {
  if (state.selectedGame) $('#gameFrame').src = `${state.selectedGame.url}?factory=${Date.now()}`;
});

try {
  const data = await api('/api/games');
  state.games = data.games || [];
  renderGames();
  if (state.games.length) selectGame(state.games[0].id);
  await refresh();
  setInterval(refresh, 2500);
} catch (error) {
  $('#commandHint').textContent = `Factory startup error: ${error.message}`;
}
