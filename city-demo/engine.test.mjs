import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTS, SCENARIOS, createState, getScenarioEvents, getRecoveryEvents,
  getApprovalEvents, reduceEvent, getAgentStatus, getMetrics,
} from './engine.js';

const replay = (events, state = createState()) => events.reduce(reduceEvent, state);

test('a successful demo counts only confirmed bookings and delivered messages', () => {
  let state = createState();
  const events = getScenarioEvents('success');
  for (const event of events) {
    state = reduceEvent(state, event);
    if (event.type === 'run.started' && event.agentId === 'booking') assert.equal(getMetrics(state).bookings, 0);
    if (event.type === 'booking.confirmed') assert.equal(getMetrics(state).bookings, 1);
    if (['message.prepared', 'message.accepted'].includes(event.type)) {
      assert.equal(getMetrics(state).messages, 0);
      assert.equal(getAgentStatus(state, 'followup').status, 'running');
    }
  }
  assert.deepEqual(getMetrics(state), { runs: 3, bookings: 1, messages: 1, estimatedCostUsd: 0.0128, openFindings: 0 });
  assert.equal(state.objective, 'verified');
  assert.equal(state.activeAgentId, null);
  assert.ok(Object.values(state.agents).every(agent => agent.status === 'complete' && agent.successfulRuns === 1));
  assert.ok(state.events.every(event => event.sourceMode === 'demo' && event.evidence));
});

test('duplicate event ids cannot inflate attempts, outcomes, successful runs, or usage', () => {
  const events = getScenarioEvents('success');
  const state = replay(events);
  assert.strictEqual(replay(events, state), state);
  assert.deepEqual(getMetrics(replay(events.flatMap(event => [event, event]))), getMetrics(state));
});

test('repeated provider evidence with a new event id is counted once by outcome and usage ids', () => {
  const events = getScenarioEvents('success');
  const state = replay(events);
  const repeats = events.filter(event => ['booking.confirmed', 'message.accepted', 'message.delivered'].includes(event.type))
    .map(event => ({ ...event, id: `${event.id}:provider-redelivery` }));
  const repeated = replay(repeats, state);
  assert.deepEqual(getMetrics(repeated), getMetrics(state));
  assert.equal(repeated.agents.booking.successfulRuns, 1);
  assert.equal(repeated.agents.followup.successfulRuns, 1);
  assert.equal(Object.values(repeated.outcomes.messages)[0].status, 'delivered');
});

test('failure creates an open finding; recovery verifies it while retaining the failure history', () => {
  const failed = replay(getScenarioEvents('failure'));
  assert.deepEqual(getMetrics(failed), { runs: 2, bookings: 0, messages: 0, estimatedCostUsd: 0.0044, openFindings: 1 });
  assert.equal(getAgentStatus(failed, 'booking').status, 'failed');
  assert.equal(failed.objective, 'incomplete');
  const recovered = replay(getRecoveryEvents(), failed);
  assert.deepEqual(getMetrics(recovered), { runs: 4, bookings: 1, messages: 1, estimatedCostUsd: 0.0136, openFindings: 0 });
  assert.equal(recovered.findings.length, 1);
  assert.equal(recovered.findings[0].resolved, true);
  assert.equal(recovered.runs['failure:booking:1'].status, 'failed');
  assert.ok(recovered.events.some(event => event.type === 'run.failed'));
  assert.equal(recovered.agents.booking.successfulRuns, 1);
  assert.equal(recovered.objective, 'verified');
  assert.strictEqual(replay(getRecoveryEvents(), recovered), recovered);
  const untouched = createState();
  assert.strictEqual(replay(getRecoveryEvents(), untouched), untouched);
});

test('approval pauses work and explicit approval resumes the same response attempt', () => {
  const waiting = replay(getScenarioEvents('review'));
  assert.equal(waiting.pendingApproval, true);
  assert.equal(getAgentStatus(waiting, 'response').status, 'review');
  assert.deepEqual(getMetrics(waiting), { runs: 1, bookings: 0, messages: 0, estimatedCostUsd: 0.0036, openFindings: 1 });
  const approved = replay(getApprovalEvents(true), waiting);
  assert.equal(approved.pendingApproval, false);
  assert.equal(approved.objective, 'verified');
  assert.deepEqual(getMetrics(approved), { runs: 3, bookings: 1, messages: 1, estimatedCostUsd: 0.0128, openFindings: 0 });
  assert.equal(approved.findings[0].resolved, true);
  assert.strictEqual(replay(getApprovalEvents(false), approved), approved);
});

test('declining closes the request without performing or charging downstream steps', () => {
  const waiting = replay(getScenarioEvents('review'));
  const declined = replay(getApprovalEvents(false), waiting);
  assert.equal(declined.pendingApproval, false);
  assert.equal(declined.objective, 'declined');
  assert.equal(declined.agents.response.successfulRuns, 0);
  assert.deepEqual(getMetrics(declined), { runs: 1, bookings: 0, messages: 0, estimatedCostUsd: 0.0036, openFindings: 0 });
  assert.strictEqual(replay(getApprovalEvents(true), declined), declined);
  assert.deepEqual(getMetrics(replay(getApprovalEvents(true))), getMetrics(createState()));
});

test('the reducer preserves input state and takes its own event snapshot', () => {
  const initial = createState();
  const before = structuredClone(initial);
  const event = getScenarioEvents('success')[0];
  const next = reduceEvent(initial, event);
  event.title = 'mutated outside the engine';
  assert.deepEqual(initial, before);
  assert.notEqual(next.events[0].title, event.title);
  const nextBefore = structuredClone(next);
  reduceEvent(next, getScenarioEvents('success')[1]);
  assert.deepEqual(next, nextBefore);
});

test('unknown scenarios and agents fail clearly; connected events are refused', () => {
  assert.equal(AGENTS.length, 3);
  assert.equal(SCENARIOS.length, 3);
  assert.throws(() => getScenarioEvents('unknown'), RangeError);
  assert.throws(() => getAgentStatus(createState(), 'unknown'), RangeError);
  assert.throws(() => getApprovalEvents('yes'), TypeError);
  assert.throws(() => reduceEvent(createState(), { ...getScenarioEvents('success')[0], sourceMode: 'connected' }), TypeError);
});
