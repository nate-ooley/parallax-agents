import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, getScenarioEvents, getRecoveryEvents, getApprovalEvents, reduceEvent } from './engine.js';
import { getConnectionSnapshot } from './connections.js';

const replay = (events, state = createState()) => events.reduce(reduceEvent, state);
const byId = state => Object.fromEntries(getConnectionSnapshot(state).map(connection => [connection.id, connection]));

test('empty connections do not invent inquiries, checks, outcomes, or timestamps', () => {
  const connections = getConnectionSnapshot(createState());
  assert.deepEqual(connections.map(connection => connection.id), ['inbox', 'knowledge', 'calendar', 'messages']);
  for (const connection of connections) {
    assert.equal(connection.status, 'ready');
    assert.equal(connection.active, false);
    assert.equal(connection.count, 0);
    assert.equal(connection.lastUpdate, null);
    assert.deepEqual(connection.fields, {});
  }
});

test('accepted sample input populates the inbox while the knowledge check is still running', () => {
  const events = getScenarioEvents('success');
  const initialEvent = events[0];
  const state = replay([initialEvent]);
  const connections = byId(state);
  assert.equal(connections.inbox.count, 1);
  assert.equal(connections.inbox.value, 'Jamie · AC tune-up');
  assert.equal(connections.inbox.fields['Contact preference'], 'Text message');
  assert.equal(connections.inbox.lastUpdate, '00:00');
  assert.equal(connections.inbox.active, true);
  assert.equal(connections.knowledge.status, 'running');
  assert.equal(connections.knowledge.count, 0);
  assert.equal(connections.calendar.status, 'ready');
  initialEvent.sampleInput.name = 'Changed after acceptance';
  assert.equal(byId(state).inbox.fields.Name, 'Jamie');
  const qualified = byId(replay([events[1]], state));
  assert.equal(qualified.knowledge.count, 1);
  assert.equal(qualified.knowledge.value, 'Rules matched');
  assert.equal(qualified.knowledge.lastUpdate, '00:02');
  assert.equal(qualified.inbox.active, false);
});

test('success exposes calendar confirmation and each distinct message evidence state', () => {
  let state = createState();
  for (const event of getScenarioEvents('success')) {
    state = reduceEvent(state, event);
    const connections = byId(state);
    if (event.type === 'run.started' && event.agentId === 'booking') {
      assert.equal(connections.calendar.status, 'running');
      assert.equal(connections.calendar.count, 0);
      assert.equal(connections.calendar.active, true);
    }
    if (event.type === 'booking.confirmed') {
      assert.equal(connections.calendar.value, 'Booking confirmed');
      assert.equal(connections.calendar.fields.Reference, 'DEMO-APT-001');
      assert.equal(connections.calendar.count, 1);
    }
    if (event.type === 'message.prepared') {
      assert.equal(connections.messages.value, 'Draft prepared');
      assert.equal(connections.messages.count, 1);
      assert.equal(connections.messages.deliveredCount, 0);
      assert.equal(connections.messages.lastUpdate, '00:07');
    }
    if (event.type === 'message.accepted') {
      assert.equal(connections.messages.value, 'Provider accepted');
      assert.equal(connections.messages.deliveredCount, 0);
    }
  }
  const finished = getConnectionSnapshot(state);
  assert.ok(finished.every(connection => connection.status === 'updated' && !connection.active));
  assert.deepEqual(finished.map(connection => connection.count), [1, 1, 1, 1]);
  assert.equal(byId(state).messages.value, 'Delivery confirmed');
  assert.equal(byId(state).messages.deliveredCount, 1);
  assert.equal(byId(state).messages.lastUpdate, '00:11');
});

test('failure and recovery change the calendar only when corresponding events arrive', () => {
  let state = replay(getScenarioEvents('failure'));
  let connections = byId(state);
  assert.equal(connections.calendar.status, 'failed');
  assert.equal(connections.calendar.count, 0);
  assert.equal(connections.calendar.fields.Error, 'AUTH_EXPIRED');
  assert.equal(connections.messages.status, 'ready');
  const recovery = getRecoveryEvents();
  state = reduceEvent(state, recovery[0]);
  connections = byId(state);
  assert.equal(connections.calendar.status, 'running');
  assert.equal(connections.calendar.count, 0);
  assert.equal(connections.calendar.lastUpdate, '00:07');
  state = replay(recovery.slice(1), state);
  connections = byId(state);
  assert.equal(connections.calendar.status, 'updated');
  assert.equal(connections.calendar.count, 1);
  assert.equal(connections.messages.deliveredCount, 1);
  assert.ok(state.events.some(event => event.type === 'run.failed'));
});

test('service exceptions stay visible through approval or rejection', () => {
  const waiting = replay(getScenarioEvents('review'));
  const before = byId(waiting);
  assert.equal(before.inbox.fields['Service area'], 'Outside service area');
  assert.equal(before.knowledge.status, 'review');
  assert.equal(before.knowledge.value, 'Review needed');
  assert.equal(before.knowledge.count, 1);
  assert.equal(before.calendar.status, 'ready');
  const approved = byId(replay(getApprovalEvents(true), waiting));
  assert.equal(approved.knowledge.value, 'Exception approved');
  assert.equal(approved.knowledge.fields['Service area'], 'Outside service area');
  assert.equal(approved.knowledge.count, 1);
  assert.equal(approved.calendar.count, 1);
  const declined = byId(replay(getApprovalEvents(false), waiting));
  assert.equal(declined.knowledge.value, 'Exception declined');
  assert.equal(declined.knowledge.status, 'updated');
  assert.equal(declined.calendar.count, 0);
  assert.equal(declined.messages.count, 0);
});

test('replaying accepted duplicates cannot inflate connection counts or change evidence', () => {
  const events = getScenarioEvents('success');
  const state = replay(events);
  const snapshot = getConnectionSnapshot(state);
  assert.deepEqual(getConnectionSnapshot(replay(events, state)), snapshot);
  const redelivered = events.filter(event => ['booking.confirmed', 'message.accepted', 'message.delivered'].includes(event.type))
    .map(event => ({ ...event, id: `${event.id}:provider-redelivery` }));
  assert.deepEqual(getConnectionSnapshot(replay(redelivered, state)), snapshot);
});

test('readout text stays compact and projections do not mutate accepted event data', () => {
  const scenarios = ['success', 'failure', 'review'];
  const allowedStatuses = new Set(['ready', 'running', 'updated', 'review', 'failed']);
  for (const scenario of scenarios) {
    let state = createState();
    for (const event of getScenarioEvents(scenario)) {
      state = reduceEvent(state, event);
      const before = structuredClone(state);
      for (const connection of getConnectionSnapshot(state)) {
        assert.ok(connection.value.length <= 20);
        assert.ok(connection.detail.length <= 55);
        assert.ok(allowedStatuses.has(connection.status));
        assert.ok(Number.isInteger(connection.count) && connection.count >= 0);
      }
      assert.deepEqual(state, before);
    }
  }
});
