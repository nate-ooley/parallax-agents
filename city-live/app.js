import { renderCity } from '../city-demo/city.js';

const $ = selector => document.querySelector(selector);
const ids = ['response', 'booking', 'followup'];
const labels = { response: 'Lead intake', booking: 'Booking stop', followup: 'Lead nurture' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = value => Number.isFinite(value) && value >= 0 ? Math.floor(value).toLocaleString() : '—';
const rawNumber = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const date = value => {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not provided';
};
const status = value => {
  if (typeof value !== 'string' || !value.trim()) return 'Unknown';
  return value.trim().replace(/[_-]+/g, ' ').replace(/^./, first => first.toUpperCase());
};
const published = value => String(value).toLowerCase() === 'published';
let snapshot = null;
let selected = 'response';
let busy = false;
let pollTimer = null;
let lastError = '';
let refreshController = null;
let sessionEpoch = 0;
let signingOut = false;
let cityInstance = null;

function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }
function schedulePoll() {
  stopPoll();
  if (snapshot && !document.hidden && !signingOut) pollTimer = setTimeout(() => refresh(), 30_000);
}
function showLogin(message = '') {
  stopPoll();
  snapshot = null;
  lastError = '';
  cityInstance?.destroy();
  cityInstance = null;
  $('#live-city').replaceChildren();
  $('#workflow-list').replaceChildren();
  $('#workflow-detail').replaceChildren();
  $('#summary').replaceChildren();
  $('#source-notice').replaceChildren();
  $('#session-check').hidden = true;
  $('#workspace').hidden = true;
  $('#sign-out').hidden = true;
  $('#login-panel').hidden = false;
  $('#login-message').textContent = message;
}

async function request(url, options = {}) {
  const { controller: providedController, parseJson = false, timeoutMs = 12_000, ...fetchOptions } = options;
  const controller = providedController ?? new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...fetchOptions, signal: controller.signal });
    return parseJson ? { response, data: response.ok ? await response.json() : null } : response;
  } finally { clearTimeout(timeout); }
}

function validate(data) {
  if (!data || data.connected !== true || !Array.isArray(data.workflows) || !['available', 'unavailable'].includes(data.activityStatus) || !Number.isFinite(new Date(data.checkedAt).getTime())) {
    throw new Error('The source returned an incomplete connection snapshot.');
  }
  return { ...data, workflows: data.workflows.filter(workflow => workflow && ids.includes(workflow.agentId)) };
}

async function refresh({ afterLogin = false } = {}) {
  if (busy || signingOut || document.hidden && !afterLogin) return;
  busy = true;
  stopPoll();
  $('#refresh').disabled = true;
  const epoch = sessionEpoch;
  refreshController = new AbortController();
  try {
    const { response, data: incoming } = await request('/api/highlevel', { controller: refreshController, parseJson: true, timeoutMs: 25_000 });
    if (epoch !== sessionEpoch) return;
    if (response.status === 401) { showLogin(snapshot ? 'Your session ended. Enter your access key to continue.' : ''); return; }
    if (!response.ok) throw new Error(response.status === 429 ? 'HighLevel is limiting requests. The next refresh will retry.' : 'The connection could not be refreshed.');
    const data = validate(incoming);
    if (epoch !== sessionEpoch) return;
    snapshot = data;
    lastError = '';
    if (!data.workflows.some(workflow => workflow.agentId === selected)) selected = data.workflows[0]?.agentId || 'response';
    render();
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    lastError = error.name === 'AbortError' ? 'The source took too long to respond.' : error.message || 'The connection could not be refreshed.';
    if (snapshot) render();
    else showLogin('Your private session could not load the HighLevel connection. Try opening the workspace again.');
  } finally {
    if (epoch === sessionEpoch) {
      busy = false;
      refreshController = null;
      $('#refresh').disabled = false;
      schedulePoll();
    }
  }
}

function activityFor(workflow) { return snapshot?.activityStatus === 'available' && workflow?.activity && typeof workflow.activity === 'object' ? workflow.activity : null; }
function render() {
  if (!snapshot) return;
  $('#session-check').hidden = true;
  $('#login-panel').hidden = true;
  $('#workspace').hidden = false;
  $('#sign-out').hidden = false;
  const available = snapshot.activityStatus === 'available';
  const stale = Boolean(lastError) || Date.now() - new Date(snapshot.checkedAt).getTime() > 90_000;
  const locationName = snapshot.location?.name || 'Connected HighLevel workspace';
  $('#location-name').textContent = locationName;
  $('#refresh-message').textContent = lastError ? `${lastError} Showing the last confirmed snapshot from ${date(snapshot.checkedAt)}. Its activity display is paused.` : stale ? `This snapshot is older than expected. Last confirmed ${date(snapshot.checkedAt)}.` : '';
  $('#summary').innerHTML = `<article class="summary-card"><span class="label">HighLevel connection</span><strong><span class="status-dot ${stale ? 'amber' : ''}"></span>${stale ? 'Last confirmed connection' : 'Connected'}</strong><small>${escape(locationName)}</small></article><article class="summary-card"><span class="label">Execution history</span><strong>${available ? 'Observed data available' : 'Unavailable'}</strong><small>${available ? 'Execution records in the past 24 hours' : 'Activity totals are unknown, not zero'}</small></article><article class="summary-card"><span class="label">Last successful check</span><strong>${escape(date(snapshot.checkedAt))}</strong><small>${stale ? 'Snapshot retained until the source responds' : 'Automatic refresh every 30 seconds'}</small></article>`;
  $('#source-notice').className = `source-notice ${available ? 'available' : ''}`;
  $('#source-notice').innerHTML = available
    ? `<span class="notice-icon" aria-hidden="true">✓</span><div><h3 id="source-notice-title">Source records, with their limits visible</h3><p>These are observed execution records from the past 24 hours. Published is a workflow setting. Completed executions do not prove that an appointment was booked or a message was delivered.</p></div>`
    : `<span class="notice-icon" aria-hidden="true">i</span><div><h3 id="source-notice-title">Execution history unavailable</h3><p>HighLevel is connected and its workflow definitions are available. Execution history is not available for this location, so this view cannot confirm runs, failures, or current activity. The city stays still.</p>${snapshot.issue ? `<details><summary>Source response</summary><code>${escape(snapshot.issue.code || 'ACTIVITY_UNAVAILABLE')}</code><p>${escape(snapshot.issue.message || '')}</p></details>` : ''}</div>`;
  $('#quarter-mode').textContent = stale ? 'Retained snapshot' : available ? 'Observed execution data' : 'Workflow definitions only';
  $('#city-caption').textContent = available ? 'Select a building to inspect its workflow. Warm windows indicate observed completions; motion only reflects a recent working record. The fountain is decorative.' : 'Published means the workflow is enabled. Execution activity is unavailable; unlit windows do not mean failure.';
  renderQuarter(stale);
  $('#workflow-list').innerHTML = snapshot.workflows.map(workflow => {
    const activity = activityFor(workflow);
    return `<button class="workflow-button" type="button" data-select="${escape(workflow.agentId)}" aria-pressed="${workflow.agentId === selected}"><span class="workflow-top"><span class="workflow-role">${escape(labels[workflow.agentId])}</span><span class="published-pill ${published(workflow.status) ? '' : 'neutral'}">${escape(status(workflow.status))}</span></span><span class="workflow-full-name">${escape(workflow.name || 'Unnamed workflow')}</span><span class="workflow-updated">Workflow last edited · ${escape(date(workflow.updatedAt))}</span><span class="workflow-counts"><span>Executions <strong>${activity ? number(activity.runs) : '—'}</strong></span><span>Completed <strong>${activity ? number(activity.completed) : '—'}</strong></span><span>Failed <strong>${activity ? number(activity.failed) : '—'}</strong></span></span></button>`;
  }).join('');
  renderDetail();
}

function renderQuarter(stale) {
  const mapped = new Map(snapshot.workflows.map(workflow => [workflow.agentId, workflow]));
  let activeAgentId = null;
  const agents = ids.map(id => {
    const workflow = mapped.get(id);
    const activity = activityFor(workflow);
    const lastWorkingEvent = new Date(activity?.lastWorkingEventAt).getTime();
    const recentWorking = !stale && rawNumber(activity?.working) > 0 && Number.isFinite(lastWorkingEvent) && Date.now() - lastWorkingEvent >= 0 && Date.now() - lastWorkingEvent < 90_000;
    if (recentWorking && !activeAgentId) activeAgentId = id;
    return { id, name: labels[id], status: recentWorking ? 'running' : 'idle', successfulRuns: rawNumber(activity?.completed), hasFailure: false };
  });
  cityInstance = renderCity($('#live-city'), { agents, selectedAgentId: selected, activeAgentId, events: [], connections: [], reducedMotion: stale || snapshot.activityStatus !== 'available' || matchMedia('(prefers-reduced-motion: reduce)').matches, ambientMode: false, onSelect: selectWorkflow });
  const svg = cityInstance.svg;
  // Remove public-demo fixtures completely from this private, source-backed view.
  svg.querySelectorAll('.city-connection-panel,.city-connection-routes').forEach(node => node.remove());
  const description = svg.querySelector('desc');
  description.textContent = 'Three real HighLevel workflow definitions. Published status is separate from observed execution activity. Unknown execution counts are unavailable, never zero. Select a building for its full workflow name and source details.';
  ids.forEach(id => {
    const building = svg.querySelector(`[data-agent-id="${id}"]`);
    const workflow = mapped.get(id);
    const activity = activityFor(workflow);
    const workflowState = workflow ? status(workflow.status) : 'Not mapped';
    const countLabel = activity ? `${number(activity.completed)} completed executions` : '— execution data unavailable';
    building.querySelector('.city-state-label').textContent = workflowState;
    building.querySelector('.city-run-count').textContent = countLabel;
    const title = `${workflow?.name || labels[id]} · ${workflowState} · ${countLabel}`;
    building.querySelector('title').textContent = title;
    building.setAttribute('aria-label', `${title}. View workflow details.`);
  });
  const monitor = svg.querySelector('.city-monitor');
  const activities = snapshot.workflows.map(activityFor);
  const complete = snapshot.activityStatus === 'available' && activities.every(Boolean);
  const observed = complete ? activities.reduce((sum, activity) => sum + rawNumber(activity.runs), 0) : null;
  const monitorLabel = observed === null ? 'Execution data unavailable' : `${observed} observed executions`;
  monitor.querySelector('text:last-of-type').textContent = monitorLabel;
  monitor.querySelector('title').textContent = `${monitorLabel}. The fountain is decorative.`;
  monitor.setAttribute('aria-label', `${monitorLabel}. The fountain is decorative.`);
}

function renderDetail() {
  const workflow = snapshot.workflows.find(item => item.agentId === selected);
  if (!workflow) { $('#workflow-detail').innerHTML = '<h2 id="detail-title">No workflow selected</h2><p class="data-note">The source did not return a mapped workflow.</p>'; return; }
  const activity = activityFor(workflow);
  const metrics = [['runs', 'Executions'], ['completed', 'Completed'], ['failed', 'Latest state failed'], ['working', 'Latest state working'], ['waiting', 'Latest state waiting']];
  const events = Array.isArray(activity?.events) ? activity.events.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 12) : [];
  $('#workflow-detail').innerHTML = `<div class="detail-heading"><div><span class="eyebrow">${escape(labels[workflow.agentId])}</span><h2 id="detail-title">${escape(workflow.name || 'Unnamed workflow')}</h2><p>Read directly from HighLevel. This view does not change or execute the workflow.</p></div><span class="published-pill ${published(workflow.status) ? '' : 'neutral'}">${escape(status(workflow.status))}</span></div><dl class="metadata"><div><dt>Workflow last edited</dt><dd>${escape(date(workflow.updatedAt))}</dd></div><div><dt>Last observed execution event</dt><dd>${activity ? escape(date(activity.lastEventAt)) : '— unavailable'}</dd></div><div><dt>Source workspace</dt><dd>${escape(snapshot.location?.name || 'HighLevel')}</dd></div><div><dt>Workflow record</dt><dd>${escape(workflow.id || 'Not provided')}</dd></div></dl><div class="metrics" aria-label="Observed execution metrics for the past 24 hours">${metrics.map(([key, label]) => `<div class="metric"><strong>${activity ? number(activity[key]) : '—'}</strong><span>${label}</span></div>`).join('')}</div><p class="data-note">${activity ? 'Counts cover the past 24 hours. Executions are distinct observed execution IDs. Completed requires explicit end-of-workflow evidence; working, waiting, and failed describe the latest recorded execution state.' : 'Execution history is unavailable for this workflow. These dashes mean unknown. Publication status and the workflow edit date do not establish that it ran.'}</p><div class="events"><h3>Recent source events</h3>${events.length ? `<ul class="event-list">${events.map(event => `<li><time>${escape(date(event.timestamp))}</time><strong>${escape(event.type || 'Execution event')}</strong><span>${escape(status(event.status))}</span></li>`).join('')}</ul>` : `<p class="data-note">${activity ? 'No execution events were returned in this window.' : 'Execution events are not available from this connection.'}</p>`}</div>`;
}

function selectWorkflow(id) {
  if (!snapshot?.workflows.some(workflow => workflow.agentId === id)) return;
  selected = id;
  render();
}

$('#workflow-list').addEventListener('click', event => {
  const button = event.target.closest('[data-select]');
  if (button) { selectWorkflow(button.dataset.select); $('#workflow-list').querySelector(`[data-select="${button.dataset.select}"]`)?.focus({ preventScroll: true }); }
});
$('#refresh').addEventListener('click', () => refresh());
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('#login-button').disabled) return;
  const key = $('#access-key').value;
  $('#access-key').value = '';
  if (!key) return;
  $('#login-button').disabled = true;
  $('#login-message').textContent = 'Opening your private session…';
  try {
    const response = await request('/api/live-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    if (!response.ok) {
      $('#login-message').textContent = response.status === 401 || response.status === 403 ? 'That access key was not accepted. Please try again.' : response.status === 429 ? 'Too many attempts. Please wait a moment before trying again.' : 'Private access is temporarily unavailable. Please try again shortly.';
      $('#access-key').focus();
      return;
    }
    sessionEpoch++;
    await refresh({ afterLogin: true });
  } catch {
    $('#login-message').textContent = 'The workspace could not be reached. Please try again.';
  } finally { $('#login-button').disabled = false; }
});
$('#sign-out').addEventListener('click', async () => {
  if (signingOut) return;
  signingOut = true;
  stopPoll();
  sessionEpoch++;
  refreshController?.abort();
  busy = false;
  $('#sign-out').disabled = true;
  try {
    const response = await request('/api/live-session', { method: 'DELETE' });
    if (!response.ok) throw new Error('Sign out failed');
    showLogin('You have signed out of the private workspace.');
    $('#access-key').focus();
  } catch { $('#refresh-message').textContent = 'Sign out could not be confirmed. Please try again.'; }
  finally { signingOut = false; $('#sign-out').disabled = false; $('#refresh').disabled = false; schedulePoll(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPoll(); else if (snapshot) refresh(); });
window.addEventListener('pagehide', () => { stopPoll(); sessionEpoch++; refreshController?.abort(); busy = false; });
window.addEventListener('pageshow', event => { if (event.persisted) { busy = false; refresh(); } });
refresh({ afterLogin: true });
