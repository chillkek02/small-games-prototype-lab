const doctorButton = document.querySelector('#gameDoctor');
const overlay = document.querySelector('#qualityOverlay');
const closeButton = document.querySelector('#closeQuality');
const rerunButton = document.querySelector('#rerunDoctor');
const applyButton = document.querySelector('#applyDoctorFixes');
const openGame = document.querySelector('#openGame');
const instruction = document.querySelector('#instruction');
const gameFrame = document.querySelector('#gameFrame');
const commandHint = document.querySelector('#commandHint');

let lastAudit = null;
let snapshotButtons = null;

function selectedGameId() {
  const href = openGame?.getAttribute('href') || '';
  const match = href.match(/^\/game\/([^/]+)\/?/);
  return match ? decodeURIComponent(match[1]) : null;
}

function selectedGameUrl() {
  const game = selectedGameId();
  return game ? `/game/${encodeURIComponent(game)}/` : null;
}

function setCommandMessage(text) {
  if (commandHint) commandHint.textContent = text;
}

async function refreshSnapshotCount() {
  const game = selectedGameId();
  if (!snapshotButtons) return;
  const { undo, save } = snapshotButtons;
  undo.disabled = !game;
  save.disabled = !game;
  if (!game) {
    undo.textContent = 'Undo';
    return;
  }
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(game)}/snapshots?t=${Date.now()}`);
    const data = await response.json().catch(() => ({}));
    const count = Array.isArray(data.snapshots) ? data.snapshots.length : 0;
    undo.disabled = count === 0;
    undo.textContent = count ? `Undo · ${count}` : 'Undo';
    undo.title = count ? `${count} restore point${count === 1 ? '' : 's'} available` : 'No restore points yet';
  } catch {
    undo.textContent = 'Undo';
  }
}

function reloadSelectedGame() {
  const url = selectedGameUrl();
  if (url && gameFrame) gameFrame.src = `${url}?factory=${Date.now()}`;
}

async function saveRestorePoint() {
  const game = selectedGameId();
  if (!game || !snapshotButtons) return;
  const { save } = snapshotButtons;
  save.disabled = true;
  const original = save.textContent;
  save.textContent = 'Saving…';
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(game)}/snapshots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Manual restore point' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setCommandMessage(`Restore point saved · ${data.snapshot?.id?.slice(-8) || 'ready'}`);
  } catch (error) {
    setCommandMessage(error.message);
  } finally {
    save.textContent = original;
    await refreshSnapshotCount();
  }
}

async function undoLastChange() {
  const game = selectedGameId();
  if (!game || !snapshotButtons) return;
  if (!window.confirm('Restore the most recent Factory restore point for this game? The current version will be saved first, so you can undo the restore too.')) return;
  const { undo, save } = snapshotButtons;
  undo.disabled = true;
  save.disabled = true;
  const original = undo.textContent;
  undo.textContent = 'Restoring…';
  setCommandMessage('Restoring the last safe version…');
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(game)}/undo`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    reloadSelectedGame();
    const label = data.restored?.label || data.restored?.id || 'restore point';
    setCommandMessage(`Restored: ${label}. Your pre-restore version was also saved.`);
  } catch (error) {
    setCommandMessage(error.message);
  } finally {
    undo.textContent = original;
    await refreshSnapshotCount();
  }
}

function ensureSnapshotControls() {
  if (snapshotButtons) return snapshotButtons;
  const actions = document.querySelector('.preview-actions');
  if (!actions) return null;
  const save = document.createElement('button');
  save.id = 'saveRestorePoint';
  save.className = 'ghost-button';
  save.type = 'button';
  save.textContent = 'Save Point';
  save.title = 'Save the current game as a manual restore point';
  save.disabled = true;

  const undo = document.createElement('button');
  undo.id = 'undoLastChange';
  undo.className = 'ghost-button';
  undo.type = 'button';
  undo.textContent = 'Undo';
  undo.title = 'Restore the latest safe version';
  undo.disabled = true;

  actions.insertBefore(undo, actions.firstChild);
  actions.insertBefore(save, undo);
  save.addEventListener('click', saveRestorePoint);
  undo.addEventListener('click', undoLastChange);
  snapshotButtons = { save, undo };
  void refreshSnapshotCount();
  return snapshotButtons;
}

function syncButton() {
  if (!doctorButton) return;
  doctorButton.disabled = !selectedGameId();
  ensureSnapshotControls();
  void refreshSnapshotCount();
}

function setStatus(text) {
  const el = document.querySelector('#qualityStatus');
  if (el) el.textContent = text;
}

function setScore(id, value) {
  const el = document.querySelector(id);
  if (!el) return;
  el.textContent = value == null ? '—' : `${value}/100`;
  el.classList.toggle('good', value != null && value >= 80);
  el.classList.toggle('warn', value != null && value >= 60 && value < 80);
  el.classList.toggle('bad', value != null && value < 60);
}

function artifactUrl(audit, file) {
  return `/quality-artifacts/${encodeURIComponent(audit.id)}/${encodeURIComponent(file)}`;
}

function renderAudit(audit) {
  lastAudit = audit;
  setScore('#qualityOverall', audit.overallScore);
  setScore('#qualityTechnical', audit.technicalScore);
  setScore('#qualityInteraction', audit.interactionScore);
  setScore('#qualityVisual', audit.visualScore);

  const report = document.querySelector('#qualityReport');
  if (report) report.textContent = audit.visualReport || 'No visual report returned.';

  const gallery = document.querySelector('#qualityGallery');
  if (gallery) {
    const items = [
      ['Desktop QA', audit.artifacts?.desktop],
      ['Phone QA', audit.artifacts?.phone],
      ['Desktop Play', audit.artifacts?.desktopPlay],
      ['Phone Play', audit.artifacts?.phonePlay]
    ].filter(([, file]) => file);
    gallery.innerHTML = items.map(([label, file]) => `
      <a href="${artifactUrl(audit, file)}" target="_blank" rel="noreferrer">
        <img src="${artifactUrl(audit, file)}?t=${Date.now()}" alt="${label}">
        <span>${label}</span>
      </a>`).join('');
  }

  const issues = [...(audit.qa?.issues || [])];
  for (const view of audit.interaction?.views || []) {
    if (!view.responsiveAfterInputs) issues.push(`${view.name}: page stopped responding after interaction probe.`);
    if (view.errors?.length) issues.push(`${view.name}: ${view.errors.length} interaction error(s).`);
  }
  const technical = document.querySelector('#qualityTechnicalNotes');
  if (technical) technical.textContent = issues.length ? issues.join('\n') : 'Desktop and phone technical checks passed with no machine-detected issues.';

  setStatus(`Audit complete · ${new Date(audit.finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  if (applyButton) applyButton.disabled = false;
  if (rerunButton) rerunButton.disabled = false;
}

function resetAuditView(game) {
  setScore('#qualityOverall', null);
  setScore('#qualityTechnical', null);
  setScore('#qualityInteraction', null);
  setScore('#qualityVisual', null);
  const report = document.querySelector('#qualityReport');
  const gallery = document.querySelector('#qualityGallery');
  const technical = document.querySelector('#qualityTechnicalNotes');
  if (report) report.textContent = 'Visual Director is waiting for screenshots…';
  if (gallery) gallery.innerHTML = '';
  if (technical) technical.textContent = 'Running desktop and phone checks…';
  const title = document.querySelector('#qualityTitle');
  if (title) title.textContent = `Game Doctor · ${game}`;
  if (applyButton) applyButton.disabled = true;
  if (rerunButton) rerunButton.disabled = true;
}

async function runDoctor() {
  const game = selectedGameId();
  if (!game) return;
  overlay?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  resetAuditView(game);
  setStatus('Running Desktop QA → Phone QA → interaction probe → Visual Director…');
  doctorButton.disabled = true;
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(game)}/doctor`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderAudit(data);
  } catch (error) {
    setStatus(error.message);
    const report = document.querySelector('#qualityReport');
    if (report) report.textContent = `Game Doctor could not finish: ${error.message}`;
    if (rerunButton) rerunButton.disabled = false;
  } finally {
    syncButton();
  }
}

function closeQuality() {
  overlay?.classList.add('hidden');
  document.body.style.overflow = '';
}

function sendFixesToDirector() {
  if (!lastAudit || !instruction) return;
  const request = `Improve this game using the latest Game Doctor audit. Prioritize the highest-value player-facing fixes and preserve working gameplay, controls, Poki hooks, and existing features. Fix desktop and phone issues together.\n\nGAME DOCTOR SCORE: ${lastAudit.overallScore}/100\nTECHNICAL: ${lastAudit.technicalScore}/100\nINTERACTION: ${lastAudit.interactionScore}/100\nVISUAL: ${lastAudit.visualScore ?? 'unavailable'}/100\n\nVISUAL DIRECTOR REPORT\n${lastAudit.visualReport}\n\nAUTOMATED ISSUES\n${(lastAudit.qa?.issues || []).join('\n') || 'None.'}`;
  instruction.value = request;
  instruction.dispatchEvent(new Event('input', { bubbles: true }));
  closeQuality();
  document.querySelector('.command-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  instruction.focus();
}

doctorButton?.addEventListener('click', runDoctor);
closeButton?.addEventListener('click', closeQuality);
rerunButton?.addEventListener('click', runDoctor);
applyButton?.addEventListener('click', sendFixesToDirector);
overlay?.addEventListener('click', event => { if (event.target === overlay) closeQuality(); });

if (openGame) new MutationObserver(syncButton).observe(openGame, { attributes: true, attributeFilter: ['href', 'class'] });
ensureSnapshotControls();
syncButton();
