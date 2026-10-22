import { AGENTS, createState, getScenarioEvents, reduceEvent, getAgentStatus, getMetrics, getRecoveryEvents, getApprovalEvents } from './engine.js';
import { renderCity } from './city.js';
import { getConnectionSnapshot } from './connections.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const names = { response: 'Lead response', booking: 'Booking', followup: 'Follow-up' };
const colors = { response: '#b07a69', booking: '#76908a', followup: '#b49b5e' };
const palettes = { rose: '#814750', river: '#507b7a', brass: '#987139' };
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let state = createState();
let selectedAgentId = 'response';
let scenarioId = 'success';
let queue = getScenarioEvents(scenarioId);
let cursor = 0;
let playing = false;
let timer = null;
let waitingForReplay = false;
let userInteracted = false;
let currentView = 'city';
let brandName = 'Harbor Home Services';

if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embed');
$('#scene-state').setAttribute('aria-live', 'polite');

function sampleText(text) { return escape(String(text ?? '').replaceAll('Harbor Home Services', brandName)); }
function money(value) { return `$${Number(value).toFixed(4)}`; }
function latestEvent(id) { return state.events.filter(event => event.agentId === id).at(-1); }

function renderInspector() {
  const agent = AGENTS.find(item => item.id === selectedAgentId);
  const status = getAgentStatus(state, agent.id);
  const last = latestEvent(agent.id);
  $('#inspector-content').innerHTML = `
    <p class="inspector-eyebrow">AGENT DETAILS</p>
    <div class="agent-name-row"><span class="status-pill ${escape(status.status)}">● ${escape(status.label)}</span><span class="agent-number">0${AGENTS.indexOf(agent) + 1} / 03</span></div>
    <h3 id="inspector-title">${escape(names[agent.id])}</h3>
    <p class="agent-role">${escape(agent.role)}.</p>
    <dl class="inspector-stat"><dt>WHAT DONE LOOKS LIKE</dt><dd>${escape(agent.output)}.</dd></dl>
    <dl class="inspector-stat tools"><dt>SAMPLE CONNECTIONS</dt><dd class="tool-tags">${agent.tools.map(tool => `<span>${escape(tool)}</span>`).join('')}</dd></dl>
    <div class="inspector-stat"><dl><dt>LATEST EVIDENCE</dt><dd class="last-event">${last ? `${sampleText(last.title)}<span class="event-evidence">${sampleText(last.evidence)}</span>` : 'Run a scenario to see a traceable result.'}</dd></dl>${last ? '<button class="text-button" data-action="show-activity">Open activity log ↗</button>' : ''}</div>`;

  const openFinding = state.findings.find(finding => !finding.resolved);
  const resolved = state.findings.filter(finding => finding.resolved).length;
  let content;
  if (state.pendingApproval) {
    content = `<p class="finding">This request is outside the sample service area. A person must decide before the team continues.</p><div class="approval-actions"><button class="button button-primary small-action" data-action="approve">Approve demo</button><button class="button button-outline small-action" data-action="decline">Decline</button></div>`;
  } else if (openFinding) {
    content = `<p class="finding">${sampleText(openFinding.title)}</p><p>${sampleText(openFinding.detail)}</p><button class="button button-outline small-action" data-action="recover" ${playing ? 'disabled' : ''}>${playing ? 'Recovery in progress' : 'Try demo recovery ↗'}</button>`;
  } else if (state.objective === 'verified') {
    content = `<p>Sample outcome verified: the calendar confirmed the booking and a simulated delivery receipt arrived.${resolved ? ' The resolved incident stays in the log.' : ''}</p>`;
  } else if (state.objective === 'declined') {
    content = '<p>Review complete. The sample request was declined. No appointment or confirmation was created.</p>';
  } else if (state.events.length) {
    content = '<p>Watching for the expected outcome: a calendar confirmation and a delivery event. No unresolved findings.</p>';
  } else {
    content = '<p>The monitor checks outcomes, not just activity. Try the failure scenario to see a finding and recovery.</p>';
  }
  $('#monitor').innerHTML = `<div class="monitor-heading"><span aria-hidden="true">◈</span><strong>Activity monitor</strong></div>${content}`;
}

function renderActivity() {
  if (!state.events.length) {
    $('#activity-log').innerHTML = '<div class="empty-state"><span aria-hidden="true">≋</span><h4>A clear trail of work.</h4><p>Run a scenario to see each step, its evidence, and the handoff to the next agent.</p></div>';
    return;
  }
  $('#activity-log').innerHTML = state.events.slice().reverse().map(event => `<article class="log-event"><time aria-label="${escape(event.timestamp)} into the sample timeline">${escape(event.timestamp)}</time><i class="log-marker" style="background:${colors[event.agentId]}"></i><div><strong>${sampleText(event.title)}</strong><p>${sampleText(event.detail)}</p><small>${sampleText(event.evidence)} · ${escape(event.id)}</small></div></article>`).join('');
}

function renderUsage() {
  const metrics = getMetrics(state);
  const costs = new Map();
  for (const event of state.events) {
    if (Number.isFinite(event.costUsd) && !costs.has(event.usageId || event.id)) costs.set(event.usageId || event.id, event);
  }
  $('#usage-content').innerHTML = `<div class="usage-total"><span>THIS DEMO REPLAY · ESTIMATED USAGE</span><strong>${money(metrics.estimatedCostUsd)}</strong><p>Illustrative event costs show how metering can work. These values are sample estimates, not provider rates or a Parallax usage quote.</p></div><div class="metrics-grid"><div><strong>${metrics.runs}</strong><span>Sample run attempts</span></div><div><strong>${metrics.bookings}</strong><span>Confirmed sample bookings</span></div><div><strong>${metrics.messages}</strong><span>Simulated delivered messages</span></div></div><table class="usage-table"><thead><tr><th scope="col">Agent</th><th scope="col">Completed runs</th><th scope="col">Estimate</th></tr></thead><tbody>${AGENTS.map(agent => `<tr><td>${names[agent.id]}</td><td>${state.agents[agent.id].successfulRuns}</td><td>${money([...costs.values()].filter(event => event.agentId === agent.id).reduce((sum, event) => sum + event.costUsd, 0))}</td></tr>`).join('')}</tbody></table><p class="usage-caption">One usage record is counted once, even if its event is received again. Failed attempts may still have a cost. Production rates, spending limits, and provider reconciliation must be configured before activation.</p>`;
}

function render() {
  const focusedAgentId = document.activeElement?.closest?.('[data-agent-id]')?.dataset.agentId;
  const focusedMobileAgentId = document.activeElement?.closest?.('[data-select-agent]')?.dataset.selectAgent;
  const focusedConnectionId = document.activeElement?.closest?.('[data-connection]')?.dataset.connection;
  const openConnections = new Set([...document.querySelectorAll('.connection-value[open]')].map(item => item.dataset.connection));
  const connections = getConnectionSnapshot(state).map(connection => ({ ...connection, active: connection.active && playing }));
  renderCity($('#city'), {
    agents: AGENTS.map(agent => ({ ...agent, name: names[agent.id], ...state.agents[agent.id], color: colors[agent.id], hasFailure: state.findings.some(finding => finding.agentId === agent.id && !finding.resolved && !state.pendingApproval) })),
    selectedAgentId,
    activeAgentId: playing ? state.activeAgentId : null,
    events: state.events,
    connections,
    reducedMotion: motion.matches || !playing,
    onSelect(id) { selectedAgentId = id; render(); },
  });
  $('#connection-values').innerHTML = connections.map(connection => `<details data-connection="${connection.id}" class="connection-value ${connection.active ? 'active' : ''}" ${openConnections.has(connection.id) ? 'open' : ''}><summary><span>${escape(connection.label)}</span><strong>${sampleText(connection.value)}</strong><small>${connection.count} ${escape(connection.countLabel)} · ${connection.lastUpdate ? `updated ${escape(connection.lastUpdate)}` : 'awaiting input'}</small></summary><p>${sampleText(connection.detail)}</p><dl>${Object.entries(connection.fields).map(([key, value]) => `<dt>${escape(key)}</dt><dd>${sampleText(value)}</dd>`).join('')}</dl></details>`).join('');
  if (focusedAgentId) $('#city').querySelector(`[data-agent-id="${focusedAgentId}"]`)?.focus({ preventScroll: true });
  $('#mobile-agent-picker').innerHTML = AGENTS.map(agent => `<button data-select-agent="${agent.id}" aria-pressed="${agent.id === selectedAgentId}"><strong>${names[agent.id]}</strong><span>${escape(getAgentStatus(state, agent.id).label)}</span></button>`).join('');
  if (focusedMobileAgentId) $(`[data-select-agent="${focusedMobileAgentId}"]`)?.focus({ preventScroll: true });
  if (focusedConnectionId) $(`[data-connection="${focusedConnectionId}"] summary`)?.focus({ preventScroll: true });
  const metrics = getMetrics(state);
  const last = state.events.at(-1);
  $('#run-summary').textContent = state.events.length ? `${metrics.runs} run${metrics.runs === 1 ? '' : 's'} · ${metrics.bookings} booking${metrics.bookings === 1 ? '' : 's'}` : 'Ready to explore';
  $('#scene-state').textContent = state.pendingApproval ? 'A human decision is needed.' : last ? last.title : 'Your team is ready.';
  $('#playback-progress').textContent = state.pendingApproval ? 'Waiting for your demo decision' : waitingForReplay ? 'Complete · replaying this sample shortly' : cursor >= queue.length && state.events.length ? (metrics.openFindings ? 'Finding opened · inspect the agent' : state.objective === 'declined' ? 'Request closed by reviewer' : 'Replay complete') : playing ? `Event ${cursor} of ${queue.length}` : cursor ? `Paused · event ${cursor} of ${queue.length}` : 'Ready when you are';
  $('#progress-fill').style.width = `${queue.length ? (cursor / queue.length) * 100 : 0}%`;
  $('#run-button').textContent = playing ? 'Ⅱ Pause' : state.pendingApproval ? 'Review needed' : cursor >= queue.length ? '↻ Replay demo' : cursor ? '▶ Continue' : '▶ Run demo';
  $('#run-button').disabled = state.pendingApproval;
  $('#workspace').classList.toggle('is-paused', !playing);
  renderInspector();
  renderActivity();
  renderUsage();
}

function stop() { playing = false; waitingForReplay = false; clearTimeout(timer); timer = null; }
function step() {
  if (!playing) return;
  if (cursor < queue.length) {
    const event = queue[cursor++];
    state = reduceEvent(state, event);
    selectedAgentId = event.agentId;
  }
  if (state.pendingApproval) stop();
  else if (cursor >= queue.length) {
    if (scenarioId === 'success' && state.objective === 'verified' && $('#loop-demo').checked && !motion.matches) {
      waitingForReplay = true;
      timer = setTimeout(() => { reset(); play(); }, 4000);
    } else stop();
  }
  render();
  if (playing && !waitingForReplay) timer = setTimeout(step, 2200);
}
function play() { if (playing || state.pendingApproval) return; playing = true; step(); }
function reset() { stop(); state = createState(); queue = getScenarioEvents(scenarioId); cursor = 0; selectedAgentId = 'response'; render(); }
function appendEvents(events) { stop(); queue = [...queue.slice(0, cursor), ...events]; playing = true; step(); }

$('#run-button').addEventListener('click', () => {
  userInteracted = true;
  if (playing) { stop(); render(); return; }
  if (cursor >= queue.length) reset();
  play();
});
$('#reset-button').addEventListener('click', () => { userInteracted = true; reset(); });
$('#loop-demo').addEventListener('change', () => { userInteracted = true; if (waitingForReplay && !$('#loop-demo').checked) { stop(); render(); } });
$('#mobile-agent-picker').addEventListener('click', event => {
  const id = event.target.closest('[data-select-agent]')?.dataset.selectAgent;
  if (id) { selectedAgentId = id; render(); $(`[data-select-agent="${id}"]`).focus({ preventScroll: true }); }
});
$('#scenario').addEventListener('change', event => { userInteracted = true; scenarioId = event.target.value; reset(); });
$('#inspector-content').addEventListener('click', event => { if (event.target.closest('[data-action="show-activity"]')) switchView('activity'); });
$('#monitor').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'recover' && !playing && state.findings.some(finding => !finding.resolved) && !state.pendingApproval) appendEvents(getRecoveryEvents());
  if (action === 'approve' && state.pendingApproval) appendEvents(getApprovalEvents(true));
  if (action === 'decline' && state.pendingApproval) appendEvents(getApprovalEvents(false));
});

function switchView(view) {
  currentView = view;
  for (const button of document.querySelectorAll('[data-view]')) {
    const selected = button.dataset.view === view;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`#${button.dataset.view}-view`).hidden = !selected;
  }
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => switchView(button.dataset.view));
$('.view-tabs').addEventListener('keydown', event => {
  const views = ['city', 'activity', 'usage'];
  const index = views.indexOf(currentView);
  const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
  if (next === null) return;
  event.preventDefault(); switchView(views[next]); $(`#tab-${views[next]}`).focus();
});
$('#tour-button').addEventListener('click', () => { $('#tour-panel').hidden = !$('#tour-panel').hidden; $('#tour-button').setAttribute('aria-expanded', String(!$('#tour-panel').hidden)); });
$('#tour-close').addEventListener('click', () => { $('#tour-panel').hidden = true; $('#tour-button').setAttribute('aria-expanded', 'false'); $('#tour-button').focus(); });
$('#brand-toggle').addEventListener('click', () => {
  const open = $('#brand-panel').hidden;
  $('#brand-panel').hidden = !open;
  $('#brand-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('#brand-name').focus();
});
function updateBrand() {
  brandName = $('#brand-name').value.trim() || 'Your business';
  $('#workspace-name').textContent = brandName;
  $('#workspace-mark').textContent = Array.from(brandName)[0].toUpperCase();
  renderInspector(); renderActivity();
}
$('#brand-name').addEventListener('input', updateBrand);
function setPalette(key) {
  $('#workspace').style.setProperty('--accent', palettes[key]);
  for (const swatch of document.querySelectorAll('[data-color]')) {
    const selected = swatch.dataset.color === key;
    swatch.classList.toggle('selected', selected); swatch.setAttribute('aria-pressed', String(selected));
  }
}
for (const swatch of document.querySelectorAll('[data-color]')) swatch.addEventListener('click', () => setPalette(swatch.dataset.color));
$('#brand-reset').addEventListener('click', () => { $('#brand-name').value = 'Harbor Home Services'; updateBrand(); setPalette('rose'); });
motion.addEventListener('change', () => { if (motion.matches) stop(); render(); });
window.addEventListener('pagehide', stop);
render();
// Start only once the demonstration is visible. Every loop replays the same
// synthetic records; it never fabricates additional bookings or usage totals.
const demoObserver = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  demoObserver.disconnect();
  if (!userInteracted && !motion.matches) play();
}, { threshold: 0.25 });
demoObserver.observe($('#city'));
