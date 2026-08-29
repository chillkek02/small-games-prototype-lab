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

function setCommandMessage(text) { if (commandHint) commandHint.textContent = text; }

async function refreshSnapshotCount() {
  const game = selectedGameId();
  if (!snapshotButtons) return;
  const { undo, save } = snapshotButtons;
  undo.disabled = !game;
  save.disabled = !game;
  if (!game) { undo.textContent = 'Undo'; return; }
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(game)}/snapshots?t=${Date.now()}`);
    const data = await response.json().catch(() => ({}));
    const count = Array.isArray(data.snapshots) ? data.snapshots.length : 0;
    undo.disabled = count === 0;
    undo.textContent = count ? `Undo · ${count}` : 'Undo';
    undo.title = count ? `${count} restore point${count === 1 ? '' : 's'} available` : 'No restore points yet';
  } catch { undo.textContent = 'Undo'; }
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
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Manual restore point' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setCommandMessage(`Restore point saved · ${data.snapshot?.id?.slice(-8) || 'ready'}`);
  } catch (error) { setCommandMessage(error.message); }
  finally { save.textContent = original; await refreshSnapshotCount(); }
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
  } catch (error) { setCommandMessage(error.message); }
  finally { undo.textContent = original; await refreshSnapshotCount(); }
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

function ensureVisualFloorUi() {
  const scores = document.querySelector('.quality-scores');
  if (scores && !document.querySelector('#qualityVisualFloor')) {
    const card = document.createElement('div');
    card.className = 'quality-score visual-floor-score';
    card.innerHTML = '<span>Visual Floor</span><strong id="qualityVisualFloor">—</strong>';
    scores.append(card);
  }
  const grid = document.querySelector('.quality-grid');
  if (grid && !document.querySelector('#qualityVisualFloorNotes')) {
    const section = document.createElement('section');
    section.className = 'quality-section quality-floor-section';
    section.innerHTML = '<h3>Visual quality floor</h3><pre id="qualityVisualFloorNotes">Strict prototype-quality rubric will appear here.</pre>';
    grid.append(section);
  }
}

function ensureRetentionUi() {
  const scores = document.querySelector('.quality-scores');
  if (scores && !document.querySelector('#qualityRetention')) {
    const card = document.createElement('div');
    card.className = 'quality-score retention-score';
    card.innerHTML = '<span>Retention</span><strong id="qualityRetention">—</strong>';
    scores.append(card);
  }
  const grid = document.querySelector('.quality-grid');
  if (grid && !document.querySelector('#qualityRetentionNotes')) {
    const section = document.createElement('section');
    section.className = 'quality-section quality-retention-section';
    section.innerHTML = '<h3>Retention / replay gate</h3><pre id="qualityRetentionNotes">Replay route, persistence, progression and one-more-run systems will appear here.</pre>';
    grid.append(section);
  }
}

function ensureAdUi() {
  const scores = document.querySelector('.quality-scores');
  if (scores && !document.querySelector('#qualityAdReady')) {
    const card = document.createElement('div');
    card.className = 'quality-score ad-ready-score';
    card.innerHTML = '<span>Ad Ready</span><strong id="qualityAdReady">—</strong>';
    scores.append(card);
  }
  const grid = document.querySelector('.quality-grid');
  if (grid && !document.querySelector('#qualityAdNotes')) {
    const section = document.createElement('section');
    section.className = 'quality-section quality-ad-section';
    section.innerHTML = '<h3>Ad readiness gate</h3><pre id="qualityAdNotes">Commercial and rewarded-ad opportunities will appear here.</pre>';
    grid.append(section);
  }
}

function setVisualFloor(floor) {
  ensureVisualFloorUi();
  const el = document.querySelector('#qualityVisualFloor');
  if (!el) return;
  if (!floor) { el.textContent = '—'; el.className = ''; return; }
  const label = floor.status === 'PASS' ? 'PASS' : floor.status === 'NEEDS_POLISH' ? 'POLISH' : 'FAIL';
  el.textContent = `${label} · ${floor.score}/100`;
  el.className = floor.status === 'PASS' ? 'good' : floor.status === 'NEEDS_POLISH' ? 'warn' : 'bad';
}

const FLOOR_LABELS = {
  artDirection: 'Art direction / cohesion',
  uiTypography: 'UI / typography',
  composition: 'Composition / responsive layout',
  worldRichness: 'World / asset richness',
  gameFeel: 'Game feel / feedback',
  readability: 'Readability / silhouettes',
  finish: 'Professional finish / personality'
};

const HARD_FAIL_LABELS = {
  placeholder_primitive_dominance: 'Raw placeholder primitives dominate major visuals',
  raw_default_ui: 'Raw/default/programmer-style UI',
  dead_space_desktop: 'Large low-value dead space on desktop',
  phone_layout_on_desktop: 'Phone/portrait layout pasted into desktop',
  broken_readability: 'Important gameplay/UI readability is broken',
  missing_or_broken_presentation: 'Visible missing/broken/unfinished presentation',
  no_feedback: 'Core actions lack meaningful visual feedback',
  incoherent_style: 'Visual style is incoherent'
};

function visualFloorText(audit) {
  const floor = audit.visualFloor;
  if (!floor) return 'Visual quality floor was not available.';
  const lines = [
    `STATUS: ${floor.status}`,
    `Weighted score: ${floor.score}/100`,
    `First-prototype minimum: ${floor.minimumPrototypeScore}/100`,
    `Publish-candidate target: ${floor.publishCandidateScore}/100`,
    floor.summary ? `Summary: ${floor.summary}` : '',
    '', 'CATEGORY SCORES'
  ].filter(Boolean);
  for (const [id, label] of Object.entries(FLOOR_LABELS)) lines.push(`${label}: ${floor.categories?.[id] ?? '—'}/100`);
  lines.push('', 'HARD FAILS');
  if (floor.hardFails?.length) for (const id of floor.hardFails) lines.push(`• ${HARD_FAIL_LABELS[id] || id}`);
  else lines.push('• None detected.');
  if (!floor.passed) lines.push('', 'This game does not meet the Gutpopper minimum visual bar for a first playable prototype.');
  return lines.join('\n');
}

function retentionText(audit) {
  const r = audit.retention;
  if (!r) return 'Retention/replay audit was not available.';
  const source = r.source || {};
  return [
    `STATUS: ${r.passed ? 'PASS' : 'NEEDS RETENTION WORK'}`,
    `Score: ${r.score}/100`,
    `First-prototype minimum: ${r.minimumPrototypeScore}/100`,
    '',
    `Replay/restart route: ${r.restartAvailable ? `verified · ${r.restartControl || 'restart'}` : r.secondRunStarted ? 'second run can start' : 'not verified'}`,
    `Visible terminal state: ${r.terminal ? `${r.terminal.type} · ${r.terminal.term}` : 'not reached in bounded probe'}`,
    `Upgrade/shop visible: ${r.upgradeVisible ? 'yes' : 'no'}`,
    `Upgrade interaction tested: ${r.upgradeClicked ? 'yes' : 'no'}`,
    `Save/progression code detected: ${source.persistence ? 'yes' : 'no'}`,
    `Storage changed during run: ${r.storageMutated ? 'yes' : 'no'}`,
    `Storage survived reload: ${r.persistedAfterReload ? 'yes' : 'no'}`,
    '', 'REPLAY SYSTEMS',
    `Upgrades/unlocks: ${source.upgrades ? 'yes' : 'no'}`,
    `Score/best-run chase: ${source.scoreChase ? 'yes' : 'no'}`,
    `Missions/challenges: ${source.missions ? 'yes' : 'no'}`,
    `Progression/levels/currency: ${source.progression ? 'yes' : 'no'}`,
    `Run variation/difficulty scaling: ${source.variation ? 'yes' : 'no'}`,
    '', ...(r.notes || []).map(note => `• ${note}`)
  ].join('\n');
}

function adText(audit) {
  const ad = audit.adReadiness;
  if (!ad) return 'Ad readiness audit was not available.';
  if (ad.applicable === false) return 'STATUS: N/A\nGeneral Web target: Poki ad readiness is not required.';
  const source = ad.source || {};
  const runtime = ad.runtime || {};
  return [
    `STATUS: ${ad.passed ? 'PASS' : 'NEEDS AD WORK'}`,
    `Score: ${ad.score}/100`,
    `First-prototype minimum: ${ad.minimumPrototypeScore}/100`,
    '',
    `commercialBreak implemented: ${source.commercial ? 'yes' : 'no'}`,
    `Natural commercial moment: ${source.naturalCommercialContext || runtime.commercialRuntime ? 'verified' : 'not verified'}`,
    `rewardedBreak implemented: ${source.rewarded ? 'yes' : 'no'}`,
    `Explicit rewarded opt-in: ${source.explicitRewardChoice || runtime.rewardedButton ? 'verified' : 'not verified'}`,
    `Reward only on success: ${source.rewardSuccessGuard ? 'verified' : 'not verified'}`,
    `No ad before player intent: ${runtime.noAdBeforeInput ? 'PASS' : 'FAIL'}`,
    `Input/audio pause hooks: ${source.adPauseHooks ? 'detected' : 'not detected'}`,
    `Gameplay start/stop hooks: ${source.gameplayEvents ? 'detected' : 'not detected'}`,
    `Other ad SDK detected: ${source.otherAds ? 'YES' : 'no'}`,
    '', ...(ad.notes || []).map(note => `• ${note}`)
  ].join('\n');
}

function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function artifactUrl(audit, file) { return `/quality-artifacts/${encodeURIComponent(audit.id)}/${encodeURIComponent(file)}`; }

function playtestText(audit) {
  const playtest = audit.playtest;
  if (!playtest) return 'AI Playtester was not available.';
  const plan = playtest.plan || {};
  const lines = ['AI PLAYTESTER', `Planner confidence: ${plan.confidence || '—'}`, `Objective: ${plan.objective || '—'}`, `Control plan: ${plan.summary || '—'}`, ''];
  for (const device of ['desktop', 'phone']) {
    const runs = (playtest.sessions || []).filter(run => run.device === device);
    const changes = runs.reduce((sum, run) => sum + (run.visualChanges || 0), 0);
    const actions = runs.reduce((sum, run) => sum + (run.activeActionCount || 0), 0);
    const terminals = runs.filter(run => run.terminal).map(run => `${run.terminal.type}: ${run.terminal.term}`).join(', ') || 'not reached';
    const restarts = runs.filter(run => run.terminal).map(run => run.restartAvailable ? 'available' : 'missing').join(', ') || 'not tested';
    const errors = runs.reduce((sum, run) => sum + (run.errors?.length || 0), 0);
    lines.push(`${device.toUpperCase()}: ${runs.length} runs · visible responses ${changes}/${actions} · terminal ${terminals} · retry ${restarts} · errors ${errors}`);
  }
  lines.push('', ...(playtest.notes || []).map(note => `• ${note}`));
  if (playtest.plannerError) lines.push('', `Planner fallback reason: ${playtest.plannerError}`);
  return lines.join('\n');
}

function readinessText(audit) {
  const readiness = audit.readiness;
  if (!readiness) return 'Poki/performance audit was not available.';
  const m = readiness.metrics || {};
  const frame = m.frame || {};
  const source = readiness.source || {};
  const sdkEvents = readiness.sdkEvents || {};
  return [
    'PERFORMANCE',
    `Meaningful UI: ${m.meaningfulReadyMs ?? '—'} ms local`,
    `First contentful paint: ${m.fcpMs ?? '—'} ms`,
    `Initial local payload: ${formatBytes(m.initialBytes || 0)}`,
    `Initial local requests: ${m.initialRequests ?? '—'}`,
    `Factory 4 Mbps estimate: ${m.estimated4MbpsReadyMs ? `${(m.estimated4MbpsReadyMs / 1000).toFixed(1)} s` : '—'}`,
    `Sampled FPS: ${frame.fps || '—'} · long frames: ${Math.round((frame.longFrameRatio || 0) * 100)}%`,
    '', ...(readiness.performanceNotes || []).map(note => `• ${note}`), '', 'POKI READINESS',
    `SDK detected: ${source.hasPokiSdk ? 'yes' : 'no'}`,
    `gameLoadingFinished: ${source.loadingFinished ? 'yes' : 'no'}`,
    `gameplayStart: ${source.gameplayStart ? 'yes' : 'no'}`,
    `gameplayStop: ${source.gameplayStop ? 'yes' : 'no'}`,
    `commercialBreak: ${source.commercialBreak ? 'yes' : 'no'}`,
    `rewardedBreak: ${source.rewardedBreak ? 'yes' : 'no'}`,
    `SDK event-order probe: ${sdkEvents.passed ? 'PASS' : 'FAIL'}`,
    `Ad-block resilience: ${readiness.adBlock?.passed ? 'PASS' : 'FAIL'}`,
    '', ...(sdkEvents.violations || []).map(note => `• SDK: ${note}`), ...(readiness.pokiNotes || []).map(note => `• ${note}`), '',
    'Note: numeric load/size/FPS targets are Gutpopper Factory internal targets, not official Poki pass/fail thresholds.'
  ].join('\n');
}

function renderAudit(audit) {
  lastAudit = audit;
  ensureVisualFloorUi();
  ensureRetentionUi();
  ensureAdUi();
  setScore('#qualityOverall', audit.overallScore);
  setScore('#qualityTechnical', audit.technicalScore);
  setScore('#qualityInteraction', audit.playtestScore ?? audit.interactionScore);
  setScore('#qualityVisual', audit.visualScore);
  setScore('#qualityPerformance', audit.performanceScore);
  setScore('#qualityPoki', audit.pokiScore);
  setScore('#qualityRetention', audit.retentionScore);
  setScore('#qualityAdReady', audit.adScore);
  setVisualFloor(audit.visualFloor);

  const report = document.querySelector('#qualityReport');
  if (report) report.textContent = audit.visualReport || 'No visual report returned.';
  const floorNotes = document.querySelector('#qualityVisualFloorNotes');
  if (floorNotes) floorNotes.textContent = visualFloorText(audit);
  const retentionNotes = document.querySelector('#qualityRetentionNotes');
  if (retentionNotes) retentionNotes.textContent = retentionText(audit);
  const adNotes = document.querySelector('#qualityAdNotes');
  if (adNotes) adNotes.textContent = adText(audit);
  const readiness = document.querySelector('#qualityReadinessNotes');
  if (readiness) readiness.textContent = readinessText(audit);

  const gallery = document.querySelector('#qualityGallery');
  if (gallery) {
    const items = [
      ['Desktop QA', audit.artifacts?.desktop], ['Phone QA', audit.artifacts?.phone],
      ['AI Playtest · Desktop', audit.artifacts?.desktopPlay], ['AI Playtest · Phone', audit.artifacts?.phonePlay]
    ].filter(([, file]) => file);
    gallery.innerHTML = items.map(([label, file]) => `<a href="${artifactUrl(audit, file)}" target="_blank" rel="noreferrer"><img src="${artifactUrl(audit, file)}?t=${Date.now()}" alt="${label}"><span>${label}</span></a>`).join('');
  }

  const issues = [...(audit.qa?.issues || [])];
  const technical = document.querySelector('#qualityTechnicalNotes');
  if (technical) {
    const qaText = issues.length ? issues.map(issue => `• ${issue}`).join('\n') : '• Desktop and phone technical checks passed with no machine-detected issues.';
    technical.textContent = `${playtestText(audit)}\n\nTECHNICAL QA\n${qaText}`;
  }

  const floorLabel = audit.visualFloor?.status === 'PASS' ? 'visual floor passed' : audit.visualFloor?.status === 'NEEDS_POLISH' ? 'visual polish required' : 'VISUAL FAIL';
  const retentionLabel = audit.retentionPassed ? 'retention passed' : 'retention needs work';
  const adLabel = audit.adReadiness?.applicable === false ? 'ads n/a' : audit.adPassed ? 'ads ready' : 'ads need work';
  setStatus(`Audit complete · ${floorLabel} · ${retentionLabel} · ${adLabel} · ${new Date(audit.finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  if (applyButton) applyButton.disabled = false;
  if (rerunButton) rerunButton.disabled = false;
}

function resetAuditView(game) {
  ensureVisualFloorUi();
  ensureRetentionUi();
  ensureAdUi();
  setScore('#qualityOverall', null);
  setScore('#qualityTechnical', null);
  setScore('#qualityInteraction', null);
  setScore('#qualityVisual', null);
  setScore('#qualityPerformance', null);
  setScore('#qualityPoki', null);
  setScore('#qualityRetention', null);
  setScore('#qualityAdReady', null);
  setVisualFloor(null);
  const report = document.querySelector('#qualityReport');
  const gallery = document.querySelector('#qualityGallery');
  const technical = document.querySelector('#qualityTechnicalNotes');
  const readiness = document.querySelector('#qualityReadinessNotes');
  const floorNotes = document.querySelector('#qualityVisualFloorNotes');
  const retentionNotes = document.querySelector('#qualityRetentionNotes');
  const adNotes = document.querySelector('#qualityAdNotes');
  if (report) report.textContent = 'Visual Director is waiting for QA and AI playtest screenshots…';
  if (gallery) gallery.innerHTML = '';
  if (technical) technical.textContent = 'AI Playtester will inspect the game, infer controls/objective, then run desktop and phone sessions…';
  if (readiness) readiness.textContent = 'Measuring cold load, payload size, requests, frame pacing, Poki events, and ad-block resilience…';
  if (floorNotes) floorNotes.textContent = 'Scoring art direction, UI/typography, composition, world richness, game feel, readability, and professional finish…';
  if (retentionNotes) retentionNotes.textContent = 'Testing quick replay, save persistence, upgrades/progression, score chase, missions, and run variation…';
  if (adNotes) adNotes.textContent = 'Checking commercial-break timing, optional rewarded ads, reward success guards, player intent, and input/audio pause handling…';
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
  setStatus('Running Performance/Poki → Desktop/Phone QA → AI Playtester → Retention/Replay → Ad Readiness → strict Visual Floor…');
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
  } finally { syncButton(); }
}

function closeQuality() {
  overlay?.classList.add('hidden');
  document.body.style.overflow = '';
}

function sendFixesToDirector() {
  if (!lastAudit || !instruction) return;
  const floor = lastAudit.visualFloor || {};
  const hardFails = (floor.hardFails || []).map(id => HARD_FAIL_LABELS[id] || id).join('\n') || 'None.';
  const categoryScores = Object.entries(FLOOR_LABELS).map(([id, label]) => `${label}: ${floor.categories?.[id] ?? '—'}/100`).join('\n');
  const request = `Improve this game using the latest Game Doctor audit. Prioritize the highest-value player-facing, visual-floor, retention/replay, ad-readiness, AI-playtest, and Poki/web-performance fixes. Preserve working gameplay, controls, Poki hooks, and existing features. Fix desktop and phone issues together. Do not trade away core fun merely to improve a synthetic score.\n\nGAME DOCTOR SCORE: ${lastAudit.overallScore}/100\nTECHNICAL: ${lastAudit.technicalScore}/100\nAI PLAYTEST: ${lastAudit.playtestScore ?? lastAudit.interactionScore ?? 'unavailable'}/100\nRETENTION / REPLAY: ${lastAudit.retentionScore ?? 'unavailable'}/100\nAD READINESS: ${lastAudit.adScore ?? (lastAudit.adReadiness?.applicable === false ? 'N/A' : 'unavailable')}/100\nVISUAL: ${lastAudit.visualScore ?? 'unavailable'}/100\nVISUAL FLOOR: ${floor.status || 'unknown'} · ${floor.score ?? '—'}/100 (minimum ${floor.minimumPrototypeScore ?? 70})\nPERFORMANCE: ${lastAudit.performanceScore ?? 'unavailable'}/100\nPOKI READINESS: ${lastAudit.pokiScore ?? 'unavailable'}/100\n\nRETENTION / REPLAY FINDINGS\n${(lastAudit.retention?.notes || []).join('\n') || 'None.'}\n\nAD READINESS FINDINGS\n${(lastAudit.adReadiness?.notes || []).join('\n') || 'None.'}\n\nVISUAL FLOOR CATEGORY SCORES\n${categoryScores}\n\nVISUAL HARD FAILS\n${hardFails}\n\nAI PLAYTEST PLAN\nObjective: ${lastAudit.playtest?.plan?.objective || 'unknown'}\nControls: ${lastAudit.playtest?.plan?.summary || 'unknown'}\nConfidence: ${lastAudit.playtest?.plan?.confidence || 'unknown'}\n\nAI PLAYTEST FINDINGS\n${(lastAudit.playtest?.notes || []).join('\n') || 'None.'}\n\nVISUAL DIRECTOR REPORT\n${lastAudit.visualReport}\n\nPERFORMANCE FINDINGS\n${(lastAudit.readiness?.performanceNotes || []).join('\n') || 'None.'}\n\nPOKI FINDINGS\n${(lastAudit.readiness?.pokiNotes || []).join('\n') || 'None.'}\n\nAUTOMATED ISSUES\n${(lastAudit.qa?.issues || []).join('\n') || 'None.'}`;
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
ensureVisualFloorUi();
ensureRetentionUi();
ensureAdUi();
ensureSnapshotControls();
syncButton();
