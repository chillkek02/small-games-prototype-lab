const $ = selector => document.querySelector(selector);

const state = {
  games: [],
  selectedGame: null,
  activeJobId: null,
  lastJobStatus: null,
  lastJobUpdate: null
};

const desktopBridge = window.factoryDesktop || null;

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

function showRemoteUrl(url) {
  if (!url) return;
  const link = $('#remoteUrl');
  link.href = url;
  link.textContent = url;
  $('#remoteUrlWrap').classList.remove('hidden');
}

async function setupClientMode() {
  if (!desktopBridge?.isDesktop) {
    const isRemote = location.protocol === 'https:' || location.hostname.endsWith('.ts.net');
    $('#clientMode').textContent = isRemote ? 'Phone Remote' : 'Browser';
    $('#clientMode').classList.toggle('remote', isRemote);
    document.body.classList.toggle('remote-client', isRemote);
    return;
  }

  $('#clientMode').textContent = 'PC Factory';
  $('#phoneRemoteButton').classList.remove('hidden');

  try {
    const info = await desktopBridge.getInfo();
    if (info?.remote?.installed && info.remote.ready) {
      $('#remoteMessage').textContent = 'Tailscale is ready. Enable Phone Remote to make this factory available privately to your signed-in devices.';
    }
  } catch (error) {
    console.error('Desktop bridge startup failed', error);
  }
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
  state.lastJobUpdate = Date.now();
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

  $('#jobLog').textContent = (job.logs || []).slice(-80).join('\n') || 'Waiting for worker output…';
  $('#jobLog').scrollTop = $('#jobLog').scrollHeight;

  if (job.diffStat) {
    $('#diffSection').classList.remove('hidden');
    $('#diffStat').textContent = job.diffStat;
  } else {
    $('#diffSection').classList.add('hidden');
  }

  if (job.error) $('#jobLog').textContent += `\n\nERROR: ${job.error}`;

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

async function refreshJobOnly() {
  if (!state.activeJobId) return;
  try {
    const job = await api(`/api/jobs/${encodeURIComponent(state.activeJobId)}?t=${Date.now()}`);
    renderJob(job);
  } catch (error) {
    console.error('Active job refresh failed', error);
    $('#commandHint').textContent = `Job connection error: ${error.message}`;
  }
}

async function refreshOverview() {
  try {
    const [status, jobsData] = await Promise.all([api('/api/status'), api('/api/jobs')]);
    setCodexStatus(status.codex);
    renderHistory(jobsData.jobs || []);
    if (!state.activeJobId && jobsData.jobs?.length) state.activeJobId = jobsData.jobs[0].id;
  } catch (error) {
    console.error('Factory overview refresh failed', error);
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
    $('#commandHint').textContent = `${job.stage || 'Running'} · ${job.id.slice(-8)} · ${job.game}`;
    setTimeout(refreshJobOnly, 250);
    setTimeout(refreshOverview, 500);
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

$('#phoneRemoteButton').addEventListener('click', () => $('#remotePanel').classList.toggle('hidden'));
$('#closeRemote').addEventListener('click', () => $('#remotePanel').classList.add('hidden'));
$('#installTailscale').addEventListener('click', async () => {
  if (desktopBridge) await desktopBridge.openTailscaleDownload();
});
$('#enableRemote').addEventListener('click', async () => {
  if (!desktopBridge) return;
  const button = $('#enableRemote');
  button.disabled = true;
  button.textContent = 'Enabling…';
  $('#installTailscale').classList.add('hidden');
  $('#remoteMessage').textContent = 'Configuring the private phone connection…';
  try {
    const result = await desktopBridge.enablePhoneRemote();
    if (result.ok) {
      $('#remoteMessage').textContent = result.message;
      showRemoteUrl(result.url);
      button.textContent = 'Phone Remote Enabled ✓';
    } else {
      $('#remoteMessage').textContent = result.message || 'Phone Remote setup failed.';
      if (result.code === 'TAILSCALE_MISSING') $('#installTailscale').classList.remove('hidden');
      if (result.command) $('#remoteMessage').textContent += ` Command: ${result.command}`;
      button.disabled = false;
      button.textContent = 'Try Again';
    }
  } catch (error) {
    $('#remoteMessage').textContent = error.message;
    button.disabled = false;
    button.textContent = 'Try Again';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => console.debug('Service worker unavailable', error));
}

try {
  await setupClientMode();
  const data = await api('/api/games');
  state.games = data.games || [];
  renderGames();
  if (state.games.length) selectGame(state.games[0].id);
  await refreshOverview();
  await refreshJobOnly();
  setInterval(refreshJobOnly, 1000);
  setInterval(refreshOverview, 5000);
} catch (error) {
  $('#commandHint').textContent = `Factory startup error: ${error.message}`;
}
