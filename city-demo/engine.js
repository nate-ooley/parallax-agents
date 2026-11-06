/**
 * AutoCraft sample-event engine. No network calls, real leads, real bookings,
 * or billable actions are performed here. All costs are illustrative estimates.
 */
export const AGENTS = Object.freeze([
  Object.freeze({
    id: 'response', name: 'Response', role: 'Welcome and qualify each inquiry',
    tools: ['Website inbox', 'Business knowledge', 'CRM'],
    output: 'A structured lead and a helpful first response',
    check: 'Required details are captured; exceptions reach a person.',
  }),
  Object.freeze({
    id: 'booking', name: 'Booking', role: 'Turn a qualified inquiry into an appointment',
    tools: ['Calendar', 'Availability rules', 'CRM'],
    output: 'An appointment with a calendar confirmation',
    check: 'A booking is counted only after confirmation evidence arrives.',
  }),
  Object.freeze({
    id: 'followup', name: 'Follow-up', role: 'Keep the customer informed after booking',
    tools: ['Messaging', 'Appointment details', 'Delivery events'],
    output: 'A confirmation with a traceable delivery state',
    check: 'Prepared, accepted, and delivered remain distinct states.',
  }),
]);

export const SCENARIOS = Object.freeze([
  Object.freeze({ id: 'success', label: 'A new lead arrives', description: 'Watch a sample inquiry become a confirmed appointment and a delivered confirmation.' }),
  Object.freeze({ id: 'failure', label: 'An integration needs help', description: 'A calendar connection fails. Inspect the finding, then replay a safe demo recovery.' }),
  Object.freeze({ id: 'review', label: 'A person makes the call', description: 'An unusual service request waits for an explicit human decision.' }),
]);

const AGENT_IDS = new Set(AGENTS.map(agent => agent.id));
const CALENDAR_FINDING = 'finding:calendar-unavailable';
const APPROVAL_ID = 'approval:service-exception';
const RECOVERY_ID = 'recovery:calendar';

function sampleContext(result) {
  return {
    id: 'demo-policy-check-001', service: 'AC tune-up', serviceRule: 'Approved service',
    serviceArea: result === 'matched' ? 'Within service area' : 'Outside service area',
    contactPreference: 'Text message', result,
  };
}

function event(scenario, suffix, agentId, type, title, detail, timestamp, extra = {}) {
  return {
    id: `${scenario}:${suffix}`, scenario, sourceMode: 'demo', agentId, type,
    title, detail, timestamp, costUsd: null, evidence: 'Sample event · no external action',
    ...extra,
  };
}

function intake(scenario, review = false) {
  const runId = `${scenario}:response:1`;
  const result = [event(scenario, 'intake-start', 'response', 'run.started', 'A new inquiry arrives',
    'Sample customer Jamie asks Harbor Home Services about an AC tune-up.', '00:00',
    { runId, evidence: 'Synthetic website inquiry · demo-lead-001', sampleInput: {
      id: 'demo-lead-001', name: 'Jamie', service: 'AC tune-up', channel: 'Website chat',
      contactPreference: 'Text message', serviceArea: review ? 'Outside service area' : 'Within service area',
      request: 'Can I book an AC tune-up?',
    } })];
  if (review) {
    result.push(event(scenario, 'approval-requested', 'response', 'approval.requested', 'A service exception needs a person',
      'The sample address is outside the usual service area. The agent pauses before promising a visit.', '00:02',
      { runId, approvalId: APPROVAL_ID, findingId: `finding:${APPROVAL_ID}`, costUsd: 0.0036,
        usageId: `${scenario}:qualification`, evidence: 'Sample policy check · service area exception',
        sampleContext: sampleContext('exception') }));
  } else {
    result.push(event(scenario, 'intake-complete', 'response', 'run.completed', 'The inquiry is qualified',
      'Service type, contact preference, and service area are recorded in the sample lead.', '00:02',
      { runId, costUsd: 0.0036, usageId: `${scenario}:qualification`, evidence: 'Simulated CRM record confirmed · demo-lead-001',
        sampleContext: sampleContext('matched') }));
  }
  return result;
}

function finishFlow(scenario, prefix = '', extra = {}) {
  const bookingRunId = `${scenario}:booking:${prefix || '1'}`;
  const followupRunId = `${scenario}:followup:1`;
  const bookingId = `${scenario}:appointment:001`;
  const messageId = `${scenario}:message:001`;
  return [
    event(scenario, `${prefix}booking-start`, 'booking', 'run.started', 'Checking sample availability',
      'The booking agent checks the configured appointment rules and sample calendar.', '00:03',
      { runId: bookingRunId, evidence: 'Simulated calendar lookup started',
        sampleCalendar: { id: 'demo-calendar-001', name: 'Service visits', service: 'AC tune-up', durationMinutes: 60 }, ...extra }),
    event(scenario, `${prefix}booking-confirmed`, 'booking', 'booking.confirmed', 'The appointment is confirmed',
      'The sample calendar returns an appointment reference. The booking count now increases.', '00:05',
      { runId: bookingRunId, bookingId, costUsd: 0.0024, usageId: `${scenario}:booking-confirmation`,
        evidence: 'Simulated calendar confirmation · demo-appointment-001',
        sampleAppointment: { reference: 'DEMO-APT-001', time: 'Sample slot · 10:00 AM', service: 'AC tune-up' }, ...extra }),
    event(scenario, `${prefix}followup-start`, 'followup', 'run.started', 'Preparing the confirmation',
      'The follow-up agent uses the confirmed appointment details.', '00:06',
      { runId: followupRunId, ...extra }),
    event(scenario, `${prefix}message-prepared`, 'followup', 'message.prepared', 'The message is prepared',
      'A sample appointment confirmation is ready. Preparation is not delivery.', '00:07',
      { runId: followupRunId, messageId, costUsd: 0.0018, usageId: `${scenario}:message-preparation`,
        evidence: 'Sample message draft created · demo-message-001', sampleMessage: {
          reference: 'DEMO-MSG-001', channel: 'Text message', recipient: 'Jamie (sample)',
          text: 'Your sample AC tune-up is confirmed for 10:00 AM.',
        }, ...extra }),
    event(scenario, `${prefix}message-accepted`, 'followup', 'message.accepted', 'The provider accepts the sample message',
      'This simulated provider acknowledgment is distinct from a delivery receipt.', '00:09',
      { runId: followupRunId, messageId, costUsd: 0.005, usageId: `${scenario}:message-submission`,
        evidence: 'Simulated provider acceptance · demo-message-001', ...extra }),
    event(scenario, `${prefix}message-delivered`, 'followup', 'message.delivered', 'Delivery evidence arrives',
      'A simulated delivery event updates the message count. It does not claim that a person read the message.', '00:11',
      { runId: followupRunId, messageId, evidence: 'Simulated delivery receipt · demo-message-001', ...extra }),
    event(scenario, `${prefix}objective-verified`, 'followup', 'objective.verified', 'The sample outcome is verified',
      'Watchdog finds both the calendar confirmation and the simulated delivery receipt.', '00:12',
      { evidence: 'Demo objective check · booking confirmed + message delivered', ...extra }),
  ];
}

export function getScenarioEvents(scenarioId) {
  if (!SCENARIOS.some(scenario => scenario.id === scenarioId)) throw new RangeError(`Unknown demo scenario: ${scenarioId}`);
  if (scenarioId === 'review') return intake(scenarioId, true);
  if (scenarioId === 'success') return [...intake(scenarioId), ...finishFlow(scenarioId)];
  return [
    ...intake('failure'),
    event('failure', 'booking-start', 'booking', 'run.started', 'Checking sample availability',
      'The booking agent requests sample calendar availability.', '00:03',
      { runId: 'failure:booking:1', evidence: 'Simulated calendar lookup started',
        sampleCalendar: { id: 'demo-calendar-001', name: 'Service visits', service: 'AC tune-up', durationMinutes: 60 } }),
    event('failure', 'booking-failed', 'booking', 'run.failed', 'The calendar connection needs attention',
      'The sample connection reports an expired credential. No appointment was created. Watchdog opens a finding.', '00:05',
      { runId: 'failure:booking:1', findingId: CALENDAR_FINDING, costUsd: 0.0008,
        usageId: 'failure:calendar-attempt', evidence: 'Simulated connector error · AUTH_EXPIRED · no booking submitted', errorCode: 'AUTH_EXPIRED' }),
  ];
}

export function getRecoveryEvents() {
  const events = finishFlow('failure', 'recovery-', { requiresRecovery: RECOVERY_ID });
  events[0] = {
    ...events[0], title: 'Replaying the permitted recovery',
    detail: 'The demo restores the sample connection and starts a new attempt. It does not retry a submitted booking.',
    requiresRecovery: undefined, recoveryId: RECOVERY_ID, requiresFinding: CALENDAR_FINDING,
  };
  events.splice(2, 0, event('failure', 'finding-resolved', 'booking', 'finding.resolved', 'The calendar finding is resolved',
    'The new attempt has confirmation evidence. The original failure remains in the activity history.', '00:06',
    { findingId: CALENDAR_FINDING, requiresRecovery: RECOVERY_ID,
      bookingId: 'failure:appointment:001', evidence: 'Simulated recovery verified against the confirmed appointment' }));
  // Relative timestamps continue after the original failure instead of restarting.
  return events.map((item, index) => ({ ...item, timestamp: `00:${String(7 + index * 2).padStart(2, '0')}` }));
}

export function getApprovalEvents(approved) {
  if (typeof approved !== 'boolean') throw new TypeError('The demo approval decision must be a boolean.');
  const decision = event('review', approved ? 'approval-granted' : 'approval-rejected', 'response',
    approved ? 'approval.granted' : 'approval.rejected', approved ? 'The reviewer approves the exception' : 'The reviewer declines the exception',
    approved ? 'The sample reviewer permits this service-area exception. The agent can continue.' : 'The sample request is closed without booking or sending a confirmation.',
    '00:04', { runId: 'review:response:1', approvalId: APPROVAL_ID, evidence: 'Explicit decision in this demo · no external action',
      sampleContext: sampleContext(approved ? 'approved' : 'declined') });
  if (!approved) return [decision];
  return [
    decision,
    event('review', 'intake-complete', 'response', 'run.completed', 'The approved inquiry is qualified',
      'The sample lead retains its exception and the reviewer decision.', '00:05',
      { runId: 'review:response:1', requiresApproval: APPROVAL_ID, evidence: 'Simulated CRM record + explicit demo approval',
        sampleContext: sampleContext('approved') }),
    ...finishFlow('review', 'approved-', { requiresApproval: APPROVAL_ID }).map((item, index) => ({
      ...item, timestamp: `00:${String(6 + index * 2).padStart(2, '0')}`,
    })),
  ];
}

export function createState() {
  return {
    sourceMode: 'demo', scenario: null, events: [],
    agents: Object.fromEntries(AGENTS.map(agent => [agent.id, {
      id: agent.id, status: 'idle', statusLabel: 'Ready for a demo', successfulRuns: 0,
      lastEventId: null, lastSuccessfulAt: null,
    }])),
    runs: {}, findings: [], approvals: {}, recoveries: {}, usageCosts: {},
    outcomes: { bookings: {}, messages: {} },
    pendingApproval: false, activeAgentId: null, objective: 'pending',
  };
}

const cloneRecords = records => Object.fromEntries(Object.entries(records).map(([id, value]) => [id, { ...value }]));

export function reduceEvent(state, inputEvent) {
  if (!inputEvent || !inputEvent.id || !AGENT_IDS.has(inputEvent.agentId) || inputEvent.sourceMode !== 'demo') {
    throw new TypeError('Expected a sample event with an id and a known agent.');
  }
  if (state.events.some(item => item.id === inputEvent.id)) return state;
  if (state.scenario && state.scenario !== inputEvent.scenario) return state;
  if (inputEvent.requiresApproval && state.approvals[inputEvent.requiresApproval]?.status !== 'granted') return state;
  if (inputEvent.requiresRecovery && !state.recoveries[inputEvent.requiresRecovery]) return state;
  if (inputEvent.requiresFinding && !state.findings.some(item => item.id === inputEvent.requiresFinding && !item.resolved)) return state;
  if (['approval.granted', 'approval.rejected'].includes(inputEvent.type) && state.approvals[inputEvent.approvalId]?.status !== 'pending') return state;
  if (inputEvent.type === 'finding.resolved' && !state.outcomes.bookings[inputEvent.bookingId]) return state;
  if (inputEvent.type === 'objective.verified' && (
    !Object.keys(state.outcomes.bookings).length ||
    !Object.values(state.outcomes.messages).some(message => message.status === 'delivered') ||
    state.pendingApproval || state.findings.some(finding => !finding.resolved)
  )) return state;

  const e = { ...inputEvent };
  // These fixture payloads are flat records. Keep the accepted event independent
  // of later changes to the caller's synthetic input objects.
  for (const key of ['sampleInput', 'sampleContext', 'sampleCalendar', 'sampleAppointment', 'sampleMessage']) {
    if (inputEvent[key]) e[key] = { ...inputEvent[key] };
  }
  const next = {
    ...state, scenario: state.scenario || e.scenario, events: [...state.events, e],
    agents: cloneRecords(state.agents), runs: cloneRecords(state.runs),
    findings: state.findings.map(finding => ({ ...finding })), approvals: cloneRecords(state.approvals),
    recoveries: { ...state.recoveries }, usageCosts: { ...state.usageCosts },
    outcomes: { bookings: cloneRecords(state.outcomes.bookings), messages: cloneRecords(state.outcomes.messages) },
  };
  const agent = next.agents[e.agentId];
  agent.lastEventId = e.id;
  if (e.recoveryId) next.recoveries[e.recoveryId] = true;
  if (Number.isFinite(e.costUsd) && e.costUsd >= 0) {
    const usageId = e.usageId || e.id;
    if (!(usageId in next.usageCosts)) next.usageCosts[usageId] = e.costUsd;
  }
  const setAgent = (status, label) => { agent.status = status; agent.statusLabel = label; };
  const finishRun = () => {
    if (e.runId && next.runs[e.runId]) next.runs[e.runId].status = 'complete';
    setAgent('complete', 'Demo run complete');
    agent.lastSuccessfulAt = e.timestamp;
  };
  switch (e.type) {
    case 'run.started':
      if (!next.runs[e.runId]) {
        next.runs[e.runId] = { id: e.runId, agentId: e.agentId, status: 'running', startedAt: e.timestamp };
        setAgent('running', 'Running in demo');
      }
      break;
    case 'run.completed':
      finishRun();
      break;
    case 'booking.confirmed':
      if (!next.outcomes.bookings[e.bookingId]) next.outcomes.bookings[e.bookingId] = {
        id: e.bookingId, status: 'confirmed', sourceMode: 'demo', evidence: e.evidence, confirmedAt: e.timestamp,
      };
      finishRun();
      break;
    case 'message.prepared':
    case 'message.accepted':
    case 'message.delivered': {
      const status = { 'message.prepared': 'prepared', 'message.accepted': 'provider_accepted', 'message.delivered': 'delivered' }[e.type];
      const rank = { prepared: 1, provider_accepted: 2, delivered: 3 };
      const current = next.outcomes.messages[e.messageId];
      if (!current || rank[status] > rank[current.status]) next.outcomes.messages[e.messageId] = {
        id: e.messageId, status, sourceMode: 'demo', evidence: e.evidence, updatedAt: e.timestamp,
      };
      if (status === 'delivered') finishRun();
      else if (agent.status !== 'complete') setAgent('running', status === 'prepared' ? 'Message prepared' : 'Awaiting delivery evidence');
      break;
    }
    case 'run.failed':
      if (next.runs[e.runId]) next.runs[e.runId].status = 'failed';
      setAgent('failed', 'Needs attention');
      if (!next.findings.some(finding => finding.id === e.findingId)) next.findings.push({
        id: e.findingId, agentId: e.agentId, title: e.title, detail: e.detail, resolved: false, kind: 'failure',
      });
      next.objective = 'incomplete';
      break;
    case 'approval.requested':
      next.approvals[e.approvalId] = { id: e.approvalId, status: 'pending', agentId: e.agentId };
      if (next.runs[e.runId]) next.runs[e.runId].status = 'review';
      setAgent('review', 'Waiting for your decision');
      if (!next.findings.some(finding => finding.id === e.findingId)) next.findings.push({
        id: e.findingId, agentId: e.agentId, title: e.title, detail: e.detail, resolved: false, kind: 'approval', approvalId: e.approvalId,
      });
      next.objective = 'awaiting_approval';
      break;
    case 'approval.granted':
    case 'approval.rejected': {
      const approved = e.type === 'approval.granted';
      next.approvals[e.approvalId].status = approved ? 'granted' : 'rejected';
      next.approvals[e.approvalId].evidence = e.evidence;
      for (const finding of next.findings) if (finding.approvalId === e.approvalId) {
        finding.resolved = true;
        finding.resolution = approved ? 'Exception approved in demo' : 'Exception declined in demo';
      }
      if (next.runs[e.runId]) next.runs[e.runId].status = approved ? 'running' : 'cancelled';
      setAgent(approved ? 'running' : 'idle', approved ? 'Approved · continuing demo' : 'Closed by reviewer');
      next.objective = approved ? 'pending' : 'declined';
      break;
    }
    case 'finding.resolved':
      for (const finding of next.findings) if (finding.id === e.findingId) {
        finding.resolved = true;
        finding.resolution = e.evidence;
      }
      next.objective = 'pending';
      break;
    case 'objective.verified':
      next.objective = 'verified';
      break;
    default:
      throw new RangeError(`Unknown sample event type: ${e.type}`);
  }
  for (const item of Object.values(next.agents)) {
    item.successfulRuns = Object.values(next.runs).filter(run => run.agentId === item.id && run.status === 'complete').length;
  }
  next.pendingApproval = Object.values(next.approvals).some(approval => approval.status === 'pending');
  next.activeAgentId = agent.status === 'running' ? agent.id : Object.values(next.agents).find(item => item.status === 'running')?.id || null;
  return next;
}

export function getAgentStatus(state, id) {
  const agent = state.agents[id];
  if (!agent) throw new RangeError(`Unknown agent: ${id}`);
  return { status: agent.status, label: agent.statusLabel };
}

export function getMetrics(state) {
  return {
    runs: Object.keys(state.runs).length,
    bookings: Object.values(state.outcomes.bookings).filter(booking => booking.status === 'confirmed').length,
    messages: Object.values(state.outcomes.messages).filter(message => message.status === 'delivered').length,
    estimatedCostUsd: Math.round(Object.values(state.usageCosts).reduce((sum, amount) => sum + amount, 0) * 1e6) / 1e6,
    openFindings: state.findings.filter(finding => !finding.resolved).length,
  };
}
